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

contextBridge.exposeInMainWorld("api", {
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  getOpenCodeStatus: () => ipcRenderer.invoke("opencode-status"),
  selectProject: () => ipcRenderer.invoke("select-project"),
  runOpenCode: (input: { outcomeId: string; projectPath: string; prompt: string }) => ipcRenderer.invoke("opencode-run", input),
  cancelOpenCode: (runId: string) => ipcRenderer.invoke("opencode-cancel", runId),
  prepareOutcome: (input: { outcomeId: string; projectPath: string }): Promise<PreparedOutcome> => ipcRenderer.invoke("outcome-prepare", input),
  validateOutcome: (worktreePath: string): Promise<ValidationResult[]> => ipcRenderer.invoke("outcome-validate", worktreePath),
  getOutcomeReview: (worktreePath: string): Promise<ReviewResult> => ipcRenderer.invoke("outcome-review", worktreePath),
  approveOutcome: (prepared: PreparedOutcome, outcomeName: string): Promise<void> => ipcRenderer.invoke("outcome-approve", { prepared, outcomeName }),
  discardOutcome: (prepared: PreparedOutcome): Promise<void> => ipcRenderer.invoke("outcome-discard", prepared),
  onOpenCodeEvent: (callback: (event: OpenCodeEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, event: OpenCodeEvent) => callback(event);
    ipcRenderer.on("opencode:event", listener);
    return () => ipcRenderer.removeListener("opencode:event", listener);
  },
});
