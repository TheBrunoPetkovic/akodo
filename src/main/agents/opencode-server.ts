import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { existsSync } from "fs";
import http from "http";
import path from "path";

export type OpenCodeEvent =
  | { type: "started"; runId: string; outcomeId: string }
  | { type: "output"; runId: string; outcomeId: string; text: string }
  | { type: "question"; runId: string; outcomeId: string; question: OpenCodeQuestion }
  | { type: "completed"; runId: string; outcomeId: string; exitCode: number }
  | { type: "failed"; runId: string; outcomeId: string; message: string };

export interface OpenCodeQuestion {
  requestId: string;
  questions: Array<{
    header: string;
    question: string;
    options: Array<{ label: string; description?: string }>;
    multiple?: boolean;
    custom?: boolean;
  }>;
}

export interface OpenCodeRunInput {
  outcomeId: string;
  projectPath: string;
  prompt: string;
}

interface OpenCodeSession {
  id: string;
}

interface OpenCodeSessionMessage {
  info?: { role?: string };
  parts?: Array<{ type?: string; text?: string }>;
}

type OpenCodeSessionStatus = Record<string, { type?: "busy" | "idle" | "retry" }>;

export class OpenCodeServerAdapter {
  // Akodo owns this server instance so its folder restrictions do not affect a user's own OpenCode session.
  private readonly baseUrl = "http://127.0.0.1:4099";
  private serverProcess: ChildProcessWithoutNullStreams | null = null;
  private readonly runs = new Map<string, { sessionId: string; projectPath: string }>();

  constructor(
    private readonly emit: (event: OpenCodeEvent) => void,
    private readonly userHome: string,
    private readonly browserRuntimePath: string,
    private readonly localRuntimePath: string
  ) {}

  /** Installs OpenCode in Akodo's app data, leaving the user's global npm setup untouched. */
  async install(): Promise<void> {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const { exitCode, output } = await this.runCommand(npmCommand, ["install", "--prefix", this.localRuntimePath, "opencode-ai"]);
    if (exitCode !== 0) throw new Error(`OpenCode installation failed.${output ? `\n${output}` : ""}`);
  }

  async isAvailable(): Promise<boolean> {
    if (!this.hasCommand()) return false;
    try {
      await this.ensureServer();
      return true;
    } catch {
      return false;
    }
  }

  async hasActiveSession(projectPath: string): Promise<boolean> {
    if (!(await this.isAvailable())) return false;
    const statuses = await this.sessionStatus(projectPath).catch((): OpenCodeSessionStatus => ({}));
    return Object.values(statuses).some((status) => status.type === "busy" || status.type === "retry");
  }

  async runForReply(input: OpenCodeRunInput): Promise<string> {
    const runId = crypto.randomUUID();
    try {
      await this.ensureServer();
      const session = await this.request<OpenCodeSession>("/session", input.projectPath, {
        method: "POST",
        body: JSON.stringify({ title: input.outcomeId }),
      });
      this.runs.set(runId, { sessionId: session.id, projectPath: input.projectPath });
      const unsubscribe = this.subscribeToSession(session.id, input.projectPath, runId, input.outcomeId, (question) => {
        this.emit({ type: "question", runId, outcomeId: input.outcomeId, question });
      });
      this.emit({ type: "started", runId, outcomeId: input.outcomeId });

      try {
        await this.startPrompt(session.id, input.projectPath, input.prompt);
        const text = await this.waitForReply(session.id, input.projectPath, runId, input.outcomeId);
        this.emit({ type: "completed", runId, outcomeId: input.outcomeId, exitCode: 0 });
        return text;
      } finally {
        unsubscribe();
        this.runs.delete(runId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "OpenCode server request failed";
      this.emit({ type: "failed", runId, outcomeId: input.outcomeId, message });
      throw new Error(message);
    }
  }

  async cancel(runId: string): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run) return false;
    try {
      await this.request(`/session/${run.sessionId}/abort`, run.projectPath, { method: "POST" });
      return true;
    } finally {
      this.runs.delete(runId);
    }
  }

  async answerQuestion(runId: string, requestId: string, answers: string[][]): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run) throw new Error("This agent run is no longer active. Start the outcome again to continue.");
    await this.request(`/question/${requestId}/reply`, run.projectPath, {
      method: "POST",
      body: JSON.stringify({ answers }),
    });
    return true;
  }

  private async startPrompt(sessionId: string, projectPath: string, prompt: string): Promise<void> {
    try {
      await this.requestNoContent(`/session/${sessionId}/prompt_async`, projectPath, {
        method: "POST",
        body: JSON.stringify({ parts: [{ type: "text", text: prompt }] }),
      });
    } catch (error) {
      // A dropped response can still mean OpenCode accepted the prompt. Check the session before retrying a non-idempotent request.
      const statuses = await this.sessionStatus(projectPath).catch((): OpenCodeSessionStatus => ({}));
      if (statuses[sessionId]?.type === "busy") return;
      throw error;
    }
  }

  private async waitForReply(sessionId: string, projectPath: string, runId: string, outcomeId: string): Promise<string> {
    const deadline = Date.now() + 30 * 60_000;
    let warnedAboutReconnect = false;
    let observedActiveSession = false;
    while (Date.now() < deadline) {
      try {
        const statuses = await this.sessionStatus(projectPath);
        const status = statuses[sessionId]?.type;
        if (status === "busy" || status === "retry") observedActiveSession = true;
        if (status === "idle" || (observedActiveSession && !status)) {
          return this.readFinalReply(sessionId, projectPath);
        }
        if (!status) {
          const reply = await this.readFinalReply(sessionId, projectPath);
          if (reply) return reply;
        }
      } catch (error) {
        if (!warnedAboutReconnect) {
          warnedAboutReconnect = true;
          this.emit({ type: "output", runId, outcomeId, text: "Connection interrupted; reconnecting to the active OpenCode session…" });
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error("OpenCode session did not finish within 30 minutes. It may still be running; check Live output and try again.");
  }

  private async readFinalReply(sessionId: string, projectPath: string): Promise<string> {
    const messages = await this.request<OpenCodeSessionMessage[]>(`/session/${sessionId}/message`, projectPath, { method: "GET" }, true);
    const reply = [...messages].reverse().find((message) => message.info?.role === "assistant");
    const text = (reply?.parts ?? [])
      .filter((part) => part.type === "text" && part.text)
      .map((part) => part.text)
      .join("\n");
    return text || "";
  }

  private async sessionStatus(projectPath: string): Promise<OpenCodeSessionStatus> {
    return this.request<OpenCodeSessionStatus>("/session/status", projectPath, { method: "GET" }, true);
  }

  shutdown() {
    this.serverProcess?.kill();
    this.serverProcess = null;
  }

  private async ensureServer(): Promise<void> {
    if (await this.isHealthy()) return;
    if (!this.serverProcess) {
      const { command, shell } = this.command();
      const server = spawn(command, ["serve", "--port", "4099", "--hostname", "127.0.0.1"], {
        cwd: this.userHome,
        shell,
        windowsHide: true,
        env: this.environment(),
      });
      this.serverProcess = server;
      // A stale PATH entry or a removed executable must not crash the Electron main process.
      server.once("error", () => {
        if (this.serverProcess === server) this.serverProcess = null;
      });
      server.once("close", () => {
        if (this.serverProcess === server) this.serverProcess = null;
      });
    }

    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (await this.isHealthy()) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("OpenCode server did not become ready within 10 seconds.");
  }

  private async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/global/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async request<T = unknown>(route: string, projectPath: string, init: RequestInit, retryConnection = false): Promise<T> {
    const query = `directory=${encodeURIComponent(projectPath)}`;
    const attempts = retryConnection ? 3 : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetch(`${this.baseUrl}${route}?${query}`, {
          ...init,
          headers: { "Content-Type": "application/json", ...init.headers },
        });
        if (!response.ok) throw new Error(`OpenCode server error ${response.status}: ${await response.text()}`);
        return response.json() as Promise<T>;
      } catch (error) {
        lastError = error;
        if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  private async requestNoContent(route: string, projectPath: string, init: RequestInit): Promise<void> {
    const query = `directory=${encodeURIComponent(projectPath)}`;
    const response = await fetch(`${this.baseUrl}${route}?${query}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
    if (!response.ok) throw new Error(`OpenCode server error ${response.status}: ${await response.text()}`);
  }

  private subscribeToSession(
    sessionId: string,
    projectPath: string,
    runId: string,
    outcomeId: string,
    onQuestion: (question: OpenCodeQuestion) => void
  ): () => void {
    let response: http.IncomingMessage | null = null;
    let shouldClose = false;
    const request = http.get(`${this.baseUrl}/event?directory=${encodeURIComponent(projectPath)}`, {
      headers: { Accept: "text/event-stream" },
    }, (incoming) => {
      response = incoming;
      if (shouldClose) {
        incoming.destroy();
        return;
      }
      incoming.setEncoding("utf8");
      let buffer = "";
      incoming.on("data", (chunk: string) => {
        buffer += chunk;
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const data = frame.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
          if (!data || !data.includes(sessionId)) continue;
          const question = this.questionFromEvent(data);
          if (question) onQuestion(question);
          const text = this.describeEvent(data);
          if (text) this.emit({ type: "output", runId, outcomeId, text });
        }
      });
    });
    request.on("error", () => undefined);
    return () => {
      shouldClose = true;
      response?.destroy();
    };
  }

  private describeEvent(data: string): string | null {
    try {
      const event = JSON.parse(data) as { type?: string; properties?: { delta?: string; part?: { text?: string; delta?: string } } };
      if (event.type === "message.part.delta") return event.properties?.part?.delta || event.properties?.delta || null;
      if (event.type === "message.part.updated") return null;
      return event.properties?.part?.text || null;
    } catch {
      return null;
    }
  }

  private questionFromEvent(data: string): OpenCodeQuestion | null {
    try {
      const event = JSON.parse(data) as {
        type?: string;
        properties?: { id?: string; part?: { type?: string; tool?: string; state?: { status?: string; input?: { questions?: OpenCodeQuestion["questions"] } } }; questions?: OpenCodeQuestion["questions"] };
      };
      if (event.type !== "question.asked" || !event.properties?.id || !event.properties.questions?.length) return null;
      return { requestId: event.properties.id, questions: event.properties.questions };
    } catch {
      return null;
    }
  }

  private command(): { command: string; shell: boolean } {
    const localBinary = path.join(
      this.localRuntimePath,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "opencode.cmd" : "opencode"
    );
    if (existsSync(localBinary)) return { command: localBinary, shell: process.platform === "win32" };
    const globalBinary = path.join(this.userHome, "AppData", "Roaming", "npm", "node_modules", "opencode-ai", "bin", "opencode.exe");
    if (process.platform === "win32" && existsSync(globalBinary)) return { command: globalBinary, shell: false };
    return { command: "opencode", shell: process.platform === "win32" };
  }

  private hasCommand(): boolean {
    const localBinary = path.join(
      this.localRuntimePath,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "opencode.cmd" : "opencode"
    );
    if (existsSync(localBinary)) return true;

    const globalBinary = path.join(this.userHome, "AppData", "Roaming", "npm", "node_modules", "opencode-ai", "bin", "opencode.exe");
    if (process.platform === "win32" && existsSync(globalBinary)) return true;

    const pathEntries = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
    const names = process.platform === "win32" ? ["opencode.exe", "opencode.cmd", "opencode.bat"] : ["opencode"];
    return pathEntries.some((entry) => names.some((name) => existsSync(path.join(entry, name))));
  }

  private runCommand(command: string, args: string[]): Promise<{ exitCode: number | null; output: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: this.userHome,
        shell: process.platform === "win32",
        windowsHide: true,
        env: this.environment(),
      });
      let output = "";
      child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
      child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
      child.on("error", (error) => reject(new Error(`Could not start npm to install OpenCode: ${error.message}`)));
      child.on("close", (exitCode) => resolve({ exitCode, output: output.trim() }));
    });
  }

  private environment(): NodeJS.ProcessEnv {
    if (process.platform !== "win32") return process.env;
    return {
      ...process.env,
      HOME: this.userHome,
      USERPROFILE: this.userHome,
      APPDATA: path.join(this.userHome, "AppData", "Roaming"),
      LOCALAPPDATA: path.join(this.userHome, "AppData", "Local"),
      // OpenCode treats anything outside the session worktree as an external directory.
      // Denying it keeps built-in file tools scoped to the outcome worktree.
      OPENCODE_PERMISSION: JSON.stringify({ external_directory: "deny" }),
      // Lets agents use Akodo's managed Playwright runtime without installing packages in each outcome worktree.
      NODE_PATH: [this.browserRuntimePath, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
    };
  }
}
