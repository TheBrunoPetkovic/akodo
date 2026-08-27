declare global {
interface Window {
  api: {
      getAppVersion: () => Promise<string>;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      getOpenCodeStatus: () => Promise<{ available: boolean }>;
      selectProject: () => Promise<string | null>;
      runOpenCode: (input: { outcomeId: string; projectPath: string; prompt: string }) => Promise<string>;
    cancelOpenCode: (runId: string) => Promise<boolean>;
    answerOpenCodeQuestion: (input: { runId: string; requestId: string; answers: string[][] }) => Promise<boolean>;
    prepareOutcome: (input: { outcomeId: string; projectPath: string }) => Promise<{ sourcePath: string; worktreePath: string; branch: string }>;
    validateOutcome: (worktreePath: string) => Promise<Array<{ command: string; passed: boolean; output: string }>>;
    getOutcomeReview: (worktreePath: string) => Promise<{ summary: string; diff: string; changedFiles: string[] }>;
    visualValidateOutcome: (input: { worktreePath: string; outcomeId: string }) => Promise<{ supported: boolean; passed: boolean; message: string; screenshots: Array<{ label: string; dataUrl: string }>; consoleErrors: string[] }>;
    approveOutcome: (prepared: { sourcePath: string; worktreePath: string; branch: string }, outcomeName: string) => Promise<void>;
    discardOutcome: (prepared: { sourcePath: string; worktreePath: string; branch: string }) => Promise<void>;
      onOpenCodeEvent: (callback: (event: {
        type: "started" | "output" | "question" | "completed" | "failed";
        runId: string;
        outcomeId: string;
        text?: string;
        exitCode?: number;
        message?: string;
        question?: { requestId: string; questions: Array<{ header: string; question: string; options: Array<{ label: string; description?: string }>; multiple?: boolean; custom?: boolean }> };
      }) => void) => () => void;
    };
  }
}

export {};
