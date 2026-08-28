import { execFile } from "child_process";
import { existsSync } from "fs";
import { readFile, symlink } from "fs/promises";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface PreparedOutcome { sourcePath: string; worktreePath: string; branch: string; }
export interface ValidationResult { command: string; passed: boolean; output: string; }
export interface ReviewResult { summary: string; diff: string; changedFiles: string[]; }
interface PackageManifest { scripts?: Record<string, string>; }

export class OutcomeWorkflow {
  constructor(private readonly worktreesRoot: string) {}

  async prepare(outcomeId: string, projectPath: string): Promise<PreparedOutcome> {
    const sourcePath = await this.git(projectPath, ["rev-parse", "--show-toplevel"]).catch(() => "");
    if (!sourcePath) {
      return { sourcePath: projectPath, worktreePath: projectPath, branch: "" };
    }
    const sourceStatus = await this.git(sourcePath, ["status", "--porcelain"]);
    if (sourceStatus) {
      throw new Error("The selected project has uncommitted changes. Commit or stash them first so this outcome can start from a reproducible Git worktree.");
    }
    const worktreePath = path.join(this.worktreesRoot, outcomeId);
    const branch = `akodo/${outcomeId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}`;
    if (existsSync(worktreePath)) {
      const activeBranch = await this.git(worktreePath, ["branch", "--show-current"]);
      return { sourcePath, worktreePath, branch: activeBranch || branch };
    }
    try {
      await this.git(sourcePath, ["worktree", "add", "-b", branch, worktreePath, "HEAD"], 30_000);
    } catch (error) {
      await this.git(sourcePath, ["branch", "-D", branch]).catch(() => undefined);
      throw error;
    }
    await this.linkInstalledDependencies(sourcePath, worktreePath);
    return { sourcePath, worktreePath, branch };
  }

  async validate(worktreePath: string): Promise<ValidationResult[]> {
    const manifestPath = path.join(worktreePath, "package.json");
    if (!existsSync(manifestPath)) return [{ command: "No automatic checks configured", passed: true, output: "This project has no package.json, so Akodo could not infer a validation command." }];
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as PackageManifest;
    const scripts = manifest.scripts ?? {};
    const runner = this.packageRunner(worktreePath);
    const checks = ["typecheck", "lint", "test"].filter((name) => Boolean(scripts[name]));
    if (checks.length === 0) return [{ command: "No automatic checks configured", passed: true, output: "No typecheck, lint, or test scripts were found in package.json." }];

    const results: ValidationResult[] = [];
    for (const check of checks) {
      try {
        results.push({ command: `${runner} run ${check}`, passed: true, output: await this.command(runner, ["run", check], worktreePath, 300_000) });
      } catch (error) {
        const output = this.errorOutput(error);
        if (this.isUnavailableOptionalTool(check, output)) {
          results.push({ command: `${runner} run ${check}`, passed: true, output: `Skipped: ${output}` });
          continue;
        }
        results.push({ command: `${runner} run ${check}`, passed: false, output });
        break;
      }
    }
    return results;
  }

  async review(worktreePath: string): Promise<ReviewResult> {
    if (!(await this.isGitRepository(worktreePath))) {
      return {
        summary: "Direct workspace mode",
        diff: "This folder is not a Git repository. Changes are being made directly in the selected project folder.",
        changedFiles: ["Direct workspace changes"],
      };
    }
    const summary = await this.git(worktreePath, ["diff", "--stat"]);
    const diff = await this.git(worktreePath, ["diff", "--", "."], 30_000);
    const names = await this.git(worktreePath, ["status", "--short"]);
    const changedFiles = names.split("\n").filter((name) => name && !this.isManagedDependencyPath(name));
    return { summary: summary || "No tracked file changes.", diff: diff || "No tracked file diff.", changedFiles };
  }

  async approve(prepared: PreparedOutcome, outcomeName: string): Promise<void> {
    if (prepared.sourcePath === prepared.worktreePath) return;
    const sourceStatus = await this.git(prepared.sourcePath, ["status", "--porcelain"]);
    if (sourceStatus) throw new Error("Your selected project's current branch has uncommitted changes. Commit or stash them before applying this outcome.");
    const review = await this.review(prepared.worktreePath);
    if (review.changedFiles.length === 0) throw new Error("There are no changes to apply.");
    // Worktrees share the source project's dependencies through a local symlink.
    // That runtime-only link must never become part of an outcome commit.
    await this.git(prepared.worktreePath, ["add", "-A", "--", ".", ":(exclude)node_modules"]);
    await this.git(prepared.worktreePath, ["commit", "-m", `akodo: ${outcomeName}`], 60_000);
    await this.git(prepared.sourcePath, ["cherry-pick", await this.git(prepared.worktreePath, ["rev-parse", "HEAD"])], 60_000);
  }

  async discard(prepared: PreparedOutcome): Promise<void> {
    if (prepared.sourcePath === prepared.worktreePath) {
      throw new Error("This outcome is using the selected folder directly, so its changes cannot be discarded automatically.");
    }
    await this.git(prepared.sourcePath, ["worktree", "remove", "--force", prepared.worktreePath], 30_000);
    await this.git(prepared.sourcePath, ["branch", "-D", prepared.branch]);
  }

  private async git(cwd: string, args: string[], timeout = 15_000): Promise<string> {
    return this.command("git", ["-c", `safe.directory=${cwd}`, "-C", cwd, ...args], cwd, timeout);
  }

  private async isGitRepository(projectPath: string): Promise<boolean> {
    return Boolean(await this.git(projectPath, ["rev-parse", "--is-inside-work-tree"]).catch(() => ""));
  }

  private async command(command: string, args: string[], cwd: string, timeout: number): Promise<string> {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      timeout,
      windowsHide: true,
      shell: process.platform === "win32" && command.endsWith(".cmd"),
      maxBuffer: 2 * 1024 * 1024,
    });
    return `${stdout}${stderr}`.trim();
  }

  private packageRunner(projectPath: string): string {
    if (existsSync(path.join(projectPath, "pnpm-lock.yaml"))) return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    if (existsSync(path.join(projectPath, "yarn.lock"))) return process.platform === "win32" ? "yarn.cmd" : "yarn";
    return process.platform === "win32" ? "npm.cmd" : "npm";
  }

  private async linkInstalledDependencies(sourcePath: string, worktreePath: string): Promise<void> {
    const sourceDependencies = path.join(sourcePath, "node_modules");
    const worktreeDependencies = path.join(worktreePath, "node_modules");
    if (!existsSync(sourceDependencies) || existsSync(worktreeDependencies)) return;
    await symlink(sourceDependencies, worktreeDependencies, "junction");
  }

  private isManagedDependencyPath(statusLine: string): boolean {
    const filePath = statusLine.slice(3);
    return filePath === "node_modules" || filePath.startsWith("node_modules/");
  }

  private errorOutput(error: unknown): string {
    if (typeof error === "object" && error !== null) {
      const candidate = error as { stdout?: string; stderr?: string; message?: string };
      return `${candidate.stdout ?? ""}${candidate.stderr ?? ""}`.trim() || candidate.message || "Validation command failed.";
    }
    return String(error);
  }

  private isUnavailableOptionalTool(check: string, output: string): boolean {
    return check === "lint" && /eslint.*(?:not recognized|not found)|(?:not recognized|not found).*eslint/i.test(output);
  }
}
