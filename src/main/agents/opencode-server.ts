import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { existsSync } from "fs";
import http from "http";
import path from "path";

export type OpenCodeEvent =
  | { type: "started"; runId: string; outcomeId: string }
  | { type: "output"; runId: string; outcomeId: string; text: string }
  | { type: "completed"; runId: string; outcomeId: string; exitCode: number }
  | { type: "failed"; runId: string; outcomeId: string; message: string };

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
  private readonly baseUrl = "http://127.0.0.1:4098";
  private serverProcess: ChildProcessWithoutNullStreams | null = null;
  private readonly runs = new Map<string, { sessionId: string; projectPath: string }>();

  constructor(
    private readonly emit: (event: OpenCodeEvent) => void,
    private readonly userHome: string
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
      let resolveQuestion: ((question: string) => void) | undefined;
      const question = new Promise<string>((resolve) => { resolveQuestion = resolve; });
      const unsubscribe = this.subscribeToSession(session.id, input.projectPath, runId, input.outcomeId, (questionText) => resolveQuestion?.(questionText));
      this.emit({ type: "started", runId, outcomeId: input.outcomeId });

      try {
        const response = this.request<OpenCodeMessageResponse>(`/session/${session.id}/message`, input.projectPath, {
          method: "POST",
          body: JSON.stringify({ parts: [{ type: "text", text: input.prompt }] }),
        });
        const result = await Promise.race([
          response.then((value) => ({ kind: "response" as const, value })),
          question.then((value) => ({ kind: "question" as const, value })),
        ]);
        if (result.kind === "question") {
          await this.request(`/session/${session.id}/abort`, input.projectPath, { method: "POST" }).catch(() => undefined);
          this.emit({ type: "completed", runId, outcomeId: input.outcomeId, exitCode: 0 });
          return `[[AKODO_NEEDS_INPUT]]\n${result.value}`;
        }
        const text = (result.value.parts ?? [])
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

  shutdown() {
    this.serverProcess?.kill();
    this.serverProcess = null;
  }

  private async ensureServer(): Promise<void> {
    if (await this.isHealthy()) return;
    if (!this.serverProcess) {
      const { command, shell } = this.command();
      this.serverProcess = spawn(command, ["serve", "--port", "4098", "--hostname", "127.0.0.1"], {
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
    onQuestion: (question: string) => void
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

  private questionFromEvent(data: string): string | null {
    try {
      const event = JSON.parse(data) as {
        properties?: { part?: { type?: string; tool?: string; state?: { status?: string; input?: { questions?: Array<{ question?: string; options?: Array<{ label?: string; description?: string }> }> } } } };
      };
      const part = event.properties?.part;
      if (part?.type !== "tool" || part.tool !== "question" || part.state?.status !== "running") return null;
      const questions = part.state.input?.questions ?? [];
      return questions.map((item) => {
        const options = item.options?.map((option) => `- ${option.label}${option.description ? ` — ${option.description}` : ""}`).join("\n");
        return `${item.question ?? "OpenCode needs an answer."}${options ? `\n${options}` : ""}`;
      }).join("\n\n") || "OpenCode needs your input before it can continue.";
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
    };
  }
}
