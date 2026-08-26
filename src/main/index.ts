import { app, BrowserWindow, ipcMain, screen } from "electron";
import path from "path";
import { config } from "./config";

let mainWindow: BrowserWindow | null = null;

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

ipcMain.handle("chat-send", async (_event, messages: { role: string; content: string }[], model: string, apiKey: string) => {
  const response = await fetch(config.apiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error ${response.status}: ${error}`);
  }

  const data = await response.json() as Record<string, unknown>;

  if (data.choices && Array.isArray(data.choices) && data.choices[0]) {
    const choice = data.choices[0] as { message: { content: string } };
    return choice.message.content;
  }

  if (data.error) {
    const err = data.error as { message?: string };
    throw new Error(err.message || JSON.stringify(data.error));
  }

  throw new Error(`Unexpected response: ${JSON.stringify(data).slice(0, 200)}`);
});
