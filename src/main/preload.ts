import { contextBridge, ipcRenderer } from "electron";

type OpenCodeEvent = {
  type: "started" | "output" | "completed" | "failed";
  runId: string;
  outcomeId: string;
  text?: string;
  exitCode?: number;
  message?: string;
};

type PreparedOutcome = { sourcePath: string; worktreePath: string; branch: string };
type ValidationResult = { command: string; passed: boolean; output: string };
type ReviewResult = { summary: string; diff: string; changedFiles: string[] };
type ValidationAction = { type: "goto"; value: string } | { type: "click" | "expectVisible"; selector: string } | { type: "fill" | "expectText"; selector: string; value: string };
type BrowserValidationSpec = { feature: string; scenarios: Array<{ name: string; path: string; actions: ValidationAction[]; assertions: string[] }> };
type ValidationArtifact = { id: string; label: string; type: "screenshot" | "video" | "trace" };
type VisualValidationResult = { supported: boolean; passed: boolean; message: string; spec?: { feature: string; scenarios: Array<{ name: string; path: string; assertions: string[] }> }; scenarios: Array<{ name: string; passed: boolean; assertions: string[]; artifacts: ValidationArtifact[] }>; artifacts: ValidationArtifact[]; consoleErrors: string[] };

contextBridge.exposeInMainWorld("api", {
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  getOpenCodeStatus: () => ipcRenderer.invoke("opencode-status"),
  hasActiveOpenCodeRun: (projectPath: string): Promise<boolean> => ipcRenderer.invoke("opencode-run-active", projectPath),
  installOpenCode: () => ipcRenderer.invoke("opencode-install"),
  selectProject: () => ipcRenderer.invoke("select-project"),
  runOpenCode: (input: { outcomeId: string; projectPath: string; prompt: string }) => ipcRenderer.invoke("opencode-run", input),
  cancelOpenCode: (runId: string) => ipcRenderer.invoke("opencode-cancel", runId),
  answerOpenCodeQuestion: (input: { runId: string; requestId: string; answers: string[][] }) => ipcRenderer.invoke("opencode-answer-question", input),
  planValidation: (input: { outcomeId: string; worktreePath: string; goal: string; acceptanceCriteria: string[]; diff: string }): Promise<BrowserValidationSpec> => ipcRenderer.invoke("outcome-plan-validation", input),
  prepareOutcome: (input: { outcomeId: string; projectPath: string }): Promise<PreparedOutcome> => ipcRenderer.invoke("outcome-prepare", input),
  validateOutcome: (worktreePath: string): Promise<ValidationResult[]> => ipcRenderer.invoke("outcome-validate", worktreePath),
  getOutcomeReview: (worktreePath: string): Promise<ReviewResult> => ipcRenderer.invoke("outcome-review", worktreePath),
  visualValidateOutcome: (input: { worktreePath: string; outcomeId: string; goal: string; acceptanceCriteria: string[]; spec?: BrowserValidationSpec }): Promise<VisualValidationResult> => ipcRenderer.invoke("outcome-visual-validate", input),
  getValidationArtifact: (input: { outcomeId: string; artifactId: string }): Promise<{ dataUrl: string; type: "screenshot" | "video" | "trace" }> => ipcRenderer.invoke("outcome-validation-artifact", input),
  approveOutcome: (prepared: PreparedOutcome, outcomeName: string): Promise<void> => ipcRenderer.invoke("outcome-approve", { prepared, outcomeName }),
  discardOutcome: (prepared: PreparedOutcome): Promise<void> => ipcRenderer.invoke("outcome-discard", prepared),
  onOpenCodeEvent: (callback: (event: OpenCodeEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, event: OpenCodeEvent) => callback(event);
    ipcRenderer.on("opencode:event", listener);
    return () => ipcRenderer.removeListener("opencode:event", listener);
  },
});
