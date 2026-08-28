import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { existsSync } from "fs";
import { mkdir, readFile } from "fs/promises";
import path from "path";
import { chromium } from "playwright";

export interface BrowserValidationSpec {
  feature: string;
  scenarios: Array<{ name: string; path: string; actions: ValidationAction[]; assertions: string[] }>;
}

export type ValidationAction =
  | { type: "goto"; value: string }
  | { type: "click"; selector: string }
  | { type: "fill"; selector: string; value: string }
  | { type: "expectVisible"; selector: string }
  | { type: "expectText"; selector: string; value: string };

export interface ValidationArtifact { id: string; label: string; type: "screenshot" | "video" | "trace"; }
export interface ValidationScenario { name: string; passed: boolean; assertions: string[]; artifacts: ValidationArtifact[]; }

export interface VisualValidationResult {
  supported: boolean;
  passed: boolean;
  message: string;
  spec?: BrowserValidationSpec;
  scenarios: ValidationScenario[];
  artifacts: ValidationArtifact[];
  consoleErrors: string[];
}

export class VisualValidator {
  constructor(private readonly artifactsRoot: string) {}

  async run(worktreePath: string, outcomeId: string, input: { goal: string; acceptanceCriteria: string[]; spec?: BrowserValidationSpec }): Promise<VisualValidationResult> {
    if (!existsSync(path.join(worktreePath, "vite.config.ts")) || !existsSync(path.join(worktreePath, "package.json"))) {
      return { supported: false, passed: true, message: "Browser validation is available for Vite web projects. No supported web preview was detected.", scenarios: [], artifacts: [], consoleErrors: [] };
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
      const spec = input.spec ?? this.buildSpec(input);
      const artifactDir = path.join(this.artifactsRoot, outcomeId);
      await mkdir(artifactDir, { recursive: true });
      try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: artifactDir, size: { width: 1440, height: 900 } } });
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
        const page = await context.newPage();
        await this.installPreviewBridge(page);
        page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
        const scenarios: ValidationScenario[] = [];
        for (const [index, scenario] of spec.scenarios.entries()) {
          const screenshotId = `scenario-${index + 1}.png`;
          const screenshotPath = path.join(artifactDir, screenshotId);
          try {
            await this.executeScenario(page, scenario, url);
            await this.captureScreenshot(page, screenshotPath);
            scenarios.push({ name: scenario.name, passed: true, assertions: scenario.assertions, artifacts: [{ id: screenshotId, label: "Screenshot", type: "screenshot" }] });
          } catch (error) {
            scenarios.push({ name: scenario.name, passed: false, assertions: [...scenario.assertions, error instanceof Error ? error.message : String(error)], artifacts: [] });
          }
        }
        await context.tracing.stop({ path: path.join(artifactDir, "validation-trace.zip") });
        const video = page.video();
        await context.close();
        const videoPath = await video?.path();
        const artifacts: ValidationArtifact[] = [
          ...scenarios.flatMap((scenario) => scenario.artifacts),
          { id: "validation-trace.zip", label: "Playwright trace", type: "trace" },
        ];
        if (videoPath) artifacts.push({ id: path.basename(videoPath), label: "Validation video", type: "video" });
        return {
          supported: true,
          passed: consoleErrors.length === 0 && scenarios.every((scenario) => scenario.passed),
          message: consoleErrors.length === 0 ? `${scenarios.length} browser scenario(s) completed with recorded evidence.` : "Browser scenarios completed, but console errors were detected.",
          spec,
          scenarios,
          artifacts,
          consoleErrors,
        };
      } finally {
        await browser.close();
      }
    } catch (error) {
      return { supported: true, passed: false, message: error instanceof Error ? error.message : String(error), scenarios: [], artifacts: [], consoleErrors: [] };
    } finally {
      server.kill();
    }
  }

  async readArtifact(outcomeId: string, artifactId: string): Promise<{ dataUrl: string; type: "screenshot" | "video" | "trace" }> {
    if (!/^[a-zA-Z0-9._-]+$/.test(outcomeId) || !/^[a-zA-Z0-9._-]+$/.test(artifactId)) throw new Error("Invalid validation artifact.");
    const filePath = path.join(this.artifactsRoot, outcomeId, artifactId);
    const extension = path.extname(filePath).toLowerCase();
    const type = extension === ".webm" ? "video" : extension === ".zip" ? "trace" : "screenshot";
    const mime = type === "video" ? "video/webm" : type === "trace" ? "application/zip" : "image/png";
    return { type, dataUrl: `data:${mime};base64,${(await readFile(filePath)).toString("base64")}` };
  }

  private buildSpec(input: { goal: string; acceptanceCriteria: string[] }): BrowserValidationSpec {
    const criteria = input.acceptanceCriteria.length > 0 ? input.acceptanceCriteria.slice(0, 5) : [input.goal || "Application loads successfully"];
    return {
      feature: input.goal || "Outcome",
      scenarios: criteria.map((criterion, index) => ({
        name: `Scenario ${index + 1}: ${criterion}`,
        path: criterion.match(/\/(?:[\w-]+\/?)+/)?.[0] ?? "/",
        actions: [{ type: "goto", value: criterion.match(/\/(?:[\w-]+\/?)+/)?.[0] ?? "/" }],
        assertions: [criterion, "Page loads without browser console errors"],
      })),
    };
  }

  private async executeScenario(page: import("playwright").Page, scenario: BrowserValidationSpec["scenarios"][number], baseUrl: string): Promise<void> {
    const actions = scenario.actions.length > 0 ? scenario.actions : [{ type: "goto" as const, value: scenario.path }];
    for (const action of actions) {
      if (action.type === "goto") {
        const target = new URL(action.value, baseUrl);
        if (target.origin !== new URL(baseUrl).origin) throw new Error("Validation plans may only navigate within the local preview.");
        await page.goto(target.toString(), { waitUntil: "networkidle", timeout: 30_000 });
      } else if (action.type === "click") {
        await page.locator(action.selector).first().click({ timeout: 10_000 });
      } else if (action.type === "fill") {
        await page.locator(action.selector).first().fill(action.value, { timeout: 10_000 });
      } else if (action.type === "expectVisible") {
        await page.locator(action.selector).first().waitFor({ state: "visible", timeout: 10_000 });
      } else if (action.type === "expectText") {
        const text = await page.locator(action.selector).first().textContent({ timeout: 10_000 });
        if (!text?.includes(action.value)) throw new Error(`Expected ${action.selector} to contain: ${action.value}`);
      }
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
