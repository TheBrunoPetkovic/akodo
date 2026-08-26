import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
    chatSend: (messages: { role: string; content: string }[], model: string, apiKey: string) =>
    ipcRenderer.invoke("chat-send", messages, model, apiKey),
});
