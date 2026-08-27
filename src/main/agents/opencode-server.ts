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

interface OpenCodeMessageResponse {
  parts?: Array<{ type?: string; text?: string }>;
}

export class OpenCodeServerAdapter {
  // Akodo owns this server instance so its folder restrictions do not affect a user's own OpenCode session.
  private readonly baseUrl = "http://127.0.0.1:4099";
  private serverProcess: ChildProcessWithoutNullStreams | null = null;
  private readonly runs = new Map<string, { sessionId: string; projectPath: string }>();

  constructor(
    private readonly emit: (event: OpenCodeEvent) => void,
    private readonly userHome: string,
    private readonly browserRuntimePath: string
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      await this.ensureServer();
      return true;
    } catch {
      return false;
    }
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
        const response = await this.request<OpenCodeMessageResponse>(`/session/${session.id}/message`, input.projectPath, {
          method: "POST",
          body: JSON.stringify({ parts: [{ type: "text", text: input.prompt }] }),
        });
        const text = (response.parts ?? [])
          .filter((part) => part.type === "text" && part.text)
          .map((part) => part.text)
          .join("\n") || "OpenCode completed without text output.";
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

  shutdown() {
    this.serverProcess?.kill();
    this.serverProcess = null;
  }

  private async ensureServer(): Promise<void> {
    if (await this.isHealthy()) return;
    if (!this.serverProcess) {
      const { command, shell } = this.command();
      this.serverProcess = spawn(command, ["serve", "--port", "4099", "--hostname", "127.0.0.1"], {
        cwd: this.userHome,
        shell,
        windowsHide: true,
        env: this.environment(),
      });
      this.serverProcess.once("close", () => { this.serverProcess = null; });
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

  private async request<T = unknown>(route: string, projectPath: string, init: RequestInit): Promise<T> {
    const query = `directory=${encodeURIComponent(projectPath)}`;
    const response = await fetch(`${this.baseUrl}${route}?${query}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
    if (!response.ok) throw new Error(`OpenCode server error ${response.status}: ${await response.text()}`);
    return response.json() as Promise<T>;
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
          this.emit({ type: "output", runId, outcomeId, text: this.describeEvent(data) });
        }
      });
    });
    request.on("error", () => undefined);
    return () => {
      shouldClose = true;
      response?.destroy();
    };
  }

  private describeEvent(data: string): string {
    try {
      const event = JSON.parse(data) as { type?: string; properties?: { part?: { text?: string } } };
      return event.properties?.part?.text || event.type || data;
    } catch {
      return data;
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
    const globalBinary = path.join(this.userHome, "AppData", "Roaming", "npm", "node_modules", "opencode-ai", "bin", "opencode.exe");
    if (process.platform === "win32" && existsSync(globalBinary)) return { command: globalBinary, shell: false };
    return { command: "opencode", shell: process.platform === "win32" };
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
