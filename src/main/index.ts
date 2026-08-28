import { app, BrowserWindow, dialog, ipcMain, screen } from "electron";
import path from "path";
import { OpenCodeServerAdapter, type OpenCodeEvent } from "./agents/opencode-server";
import { OutcomeWorkflow, type PreparedOutcome } from "./outcomes/workflow";
import { VisualValidator, type BrowserValidationSpec, type ValidationAction } from "./outcomes/visual-validation";

let mainWindow: BrowserWindow | null = null;
const openCode = new OpenCodeServerAdapter(
  (event: OpenCodeEvent) => mainWindow?.webContents.send("opencode:event", event),
  app.getPath("home"),
  path.join(app.getAppPath(), "node_modules"),
  path.join(app.getPath("userData"), "opencode-runtime")
);
const workflow = new OutcomeWorkflow(path.join(app.getPath("userData"), "worktrees"));
const visualValidator = new VisualValidator(path.join(app.getPath("userData"), "artifacts"));

const VITE_DEV_SERVER_URL = "http://localhost:5173";

function createWindow(): void {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const windowWidth = Math.floor(screenWidth / 2);
  const windowHeight = screenHeight;

  mainWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width: windowWidth,
    height: windowHeight,
    minWidth: 600,
    minHeight: 400,
    title: "Akodo",
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: "#1e1e2e",
  });

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

ipcMain.on("window-minimize", () => {
  mainWindow?.minimize();
});

ipcMain.on("window-maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on("window-close", () => {
  mainWindow?.close();
});

ipcMain.handle("opencode-status", async () => ({
  available: await openCode.isAvailable(),
}));

ipcMain.handle("opencode-install", async () => {
  await openCode.install();
  const available = await openCode.isAvailable();
  if (!available) throw new Error("OpenCode installed, but its local server could not be started.");
  return { available };
});

ipcMain.handle("select-project", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: "Choose a project for Akodo",
    properties: ["openDirectory"],
  });
  return !result.canceled && result.filePaths[0] ? result.filePaths[0] : null;
});

ipcMain.handle("opencode-run", async (_event, input: { outcomeId: string; projectPath: string; prompt: string }) => {
  if (!input.projectPath) throw new Error("Choose a local project for this outcome before starting it.");
  if (!(await openCode.isAvailable())) throw new Error("OpenCode CLI is not installed or is not available on PATH.");
  return openCode.runForReply(input);
});

ipcMain.handle("opencode-cancel", (_event, runId: string) => {
  return openCode.cancel(runId);
});

ipcMain.handle("opencode-answer-question", (_event, input: { runId: string; requestId: string; answers: string[][] }) => {
  return openCode.answerQuestion(input.runId, input.requestId, input.answers);
});

ipcMain.handle("outcome-plan-validation", async (_event, input: { outcomeId: string; worktreePath: string; goal: string; acceptanceCriteria: string[]; diff: string }) => {
  const reply = await openCode.runForReply({ outcomeId: `${input.outcomeId}-validator`, projectPath: input.worktreePath, prompt: `You are an independent browser-validation planner. Do not modify files or run commands. Return ONLY valid JSON with this schema: {"feature":"string","scenarios":[{"name":"string","path":"/relative-path","actions":[{"type":"goto","value":"/path"},{"type":"click","selector":"css selector"},{"type":"fill","selector":"css selector","value":"test input"},{"type":"expectVisible","selector":"css selector"},{"type":"expectText","selector":"css selector","value":"expected text"}],"assertions":["string"]}]}. Use 1-5 scenarios, only local routes, and selectors supported by the diff. If credentials or unavailable data are required, use a visible assertion instead of inventing inputs.\n\nGoal:\n${input.goal}\n\nAcceptance criteria:\n${input.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n")}\n\nDiff:\n${input.diff.slice(0, 24000)}` });
  return normalizeValidationSpec(reply, input.goal);
});

ipcMain.handle("outcome-prepare", async (_event, input: { outcomeId: string; projectPath: string }) => {
  return workflow.prepare(input.outcomeId, input.projectPath);
});

ipcMain.handle("outcome-validate", async (_event, worktreePath: string) => {
  return workflow.validate(worktreePath);
});

ipcMain.handle("outcome-review", async (_event, worktreePath: string) => {
  return workflow.review(worktreePath);
});

ipcMain.handle("outcome-visual-validate", async (_event, input: { worktreePath: string; outcomeId: string; goal: string; acceptanceCriteria: string[]; spec?: BrowserValidationSpec }) => {
  return visualValidator.run(input.worktreePath, input.outcomeId, { goal: input.goal, acceptanceCriteria: input.acceptanceCriteria, spec: input.spec });
});

ipcMain.handle("outcome-validation-artifact", async (_event, input: { outcomeId: string; artifactId: string }) => {
  return visualValidator.readArtifact(input.outcomeId, input.artifactId);
});

ipcMain.handle("outcome-approve", async (_event, input: { prepared: PreparedOutcome; outcomeName: string }) => {
  await workflow.approve(input.prepared, input.outcomeName);
});

ipcMain.handle("outcome-discard", async (_event, prepared: PreparedOutcome) => {
  await workflow.discard(prepared);
});

function normalizeValidationSpec(reply: string, goal: string): BrowserValidationSpec {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Validator did not return a JSON validation plan.");
  const parsed = JSON.parse(reply.slice(start, end + 1)) as { feature?: unknown; scenarios?: unknown };
  if (!Array.isArray(parsed.scenarios)) throw new Error("Validator plan has no scenarios.");
  const scenarios = parsed.scenarios.slice(0, 5).flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as { name?: unknown; path?: unknown; actions?: unknown; assertions?: unknown };
    const path = typeof item.path === "string" && item.path.startsWith("/") ? item.path : "/";
    const actions = Array.isArray(item.actions) ? item.actions.map(normalizeValidationAction).filter((action): action is ValidationAction => Boolean(action)).slice(0, 12) : [];
    return [{ name: typeof item.name === "string" ? item.name.slice(0, 160) : `Scenario ${index + 1}`, path, actions: actions.length ? actions : [{ type: "goto" as const, value: path }], assertions: Array.isArray(item.assertions) ? item.assertions.filter((assertion): assertion is string => typeof assertion === "string").slice(0, 6) : [] }];
  });
  if (!scenarios.length) throw new Error("Validator plan contained no executable scenarios.");
  return { feature: typeof parsed.feature === "string" ? parsed.feature.slice(0, 160) : goal || "Outcome", scenarios };
}

function normalizeValidationAction(value: unknown): ValidationAction | null {
  if (!value || typeof value !== "object") return null;
  const action = value as { type?: unknown; selector?: unknown; value?: unknown };
  if (action.type === "goto" && typeof action.value === "string" && action.value.startsWith("/")) return { type: "goto", value: action.value };
  if ((action.type === "click" || action.type === "expectVisible") && typeof action.selector === "string") return { type: action.type, selector: action.selector.slice(0, 300) };
  if ((action.type === "fill" || action.type === "expectText") && typeof action.selector === "string" && typeof action.value === "string") return { type: action.type, selector: action.selector.slice(0, 300), value: action.value.slice(0, 500) };
  return null;
}
