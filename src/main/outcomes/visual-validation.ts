import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { existsSync } from "fs";
import { mkdir, readFile } from "fs/promises";
import path from "path";
import { chromium } from "playwright";

export interface VisualValidationResult {
  supported: boolean;
  passed: boolean;
  message: string;
  screenshots: Array<{ label: string; dataUrl: string }>;
  consoleErrors: string[];
}

export class VisualValidator {
  constructor(private readonly artifactsRoot: string) {}

  async run(worktreePath: string, outcomeId: string): Promise<VisualValidationResult> {
    if (!existsSync(path.join(worktreePath, "vite.config.ts")) || !existsSync(path.join(worktreePath, "package.json"))) {
      return { supported: false, passed: true, message: "Visual validation is available for Vite web projects. No supported web preview was detected.", screenshots: [], consoleErrors: [] };
    }

    const port = 5200 + Number.parseInt(outcomeId.replace(/\D/g, "").slice(-2) || "0", 10);
    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    const server = spawn(command, ["run", "dev:vite", "--", "--host", "127.0.0.1", "--port", String(port)], {
      cwd: worktreePath,
      windowsHide: true,
      shell: process.platform === "win32",
    });
    const url = `http://127.0.0.1:${port}`;
    try {
      await this.waitForServer(url, server);
      const browser = await chromium.launch({ headless: true });
      const consoleErrors: string[] = [];
      try {
        const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        await this.installPreviewBridge(desktop);
        desktop.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
        await desktop.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
        const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
        await this.installPreviewBridge(mobile);
        mobile.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
        await mobile.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
        const artifactDir = path.join(this.artifactsRoot, outcomeId);
        await mkdir(artifactDir, { recursive: true });
        const desktopPath = path.join(artifactDir, "desktop.png");
        const mobilePath = path.join(artifactDir, "mobile.png");
        await this.captureScreenshot(desktop, desktopPath);
        await this.captureScreenshot(mobile, mobilePath);
        const screenshots = await Promise.all([
          this.toDataUrl("Desktop", desktopPath),
          this.toDataUrl("Mobile", mobilePath),
        ]);
        return {
          supported: true,
          passed: consoleErrors.length === 0,
          message: consoleErrors.length === 0 ? "Desktop and mobile previews loaded successfully." : "The page loaded, but browser console errors were detected.",
          screenshots,
          consoleErrors,
        };
      } finally {
        await browser.close();
      }
    } catch (error) {
      return { supported: true, passed: false, message: error instanceof Error ? error.message : String(error), screenshots: [], consoleErrors: [] };
    } finally {
      server.kill();
    }
  }

  private async toDataUrl(label: string, imagePath: string) {
    return { label, dataUrl: `data:image/png;base64,${(await readFile(imagePath)).toString("base64")}` };
  }

  private async captureScreenshot(page: import("playwright").Page, imagePath: string): Promise<void> {
    const attempts = 2;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await page.screenshot({ path: imagePath, fullPage: true, timeout: 30_000 });
        return;
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 750));
      }
    }
    throw lastError;
  }

  private async installPreviewBridge(page: import("playwright").Page): Promise<void> {
    await page.addInitScript(`
      const noOp = () => Promise.resolve(null);
      globalThis.api = new Proxy({ onOpenCodeEvent: () => () => undefined }, { get: (target, key) => key in target ? target[key] : noOp });
    `);
  }

  private async waitForServer(url: string, server: ChildProcessWithoutNullStreams): Promise<void> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error("The web preview server stopped before it became ready.");
      try {
        const response = await fetch(url);
        if (response.ok) return;
      } catch { /* waiting for Vite */ }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error("The web preview did not become ready within 30 seconds.");
  }
}
