declare global {
interface Window {
  api: {
      getAppVersion: () => Promise<string>;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      getOpenCodeStatus: () => Promise<{ available: boolean }>;
      hasActiveOpenCodeRun: (projectPath: string) => Promise<boolean>;
      installOpenCode: () => Promise<{ available: boolean }>;
      selectProject: () => Promise<string | null>;
      runOpenCode: (input: { outcomeId: string; projectPath: string; prompt: string }) => Promise<string>;
    cancelOpenCode: (runId: string) => Promise<boolean>;
    answerOpenCodeQuestion: (input: { runId: string; requestId: string; answers: string[][] }) => Promise<boolean>;
    planValidation: (input: { outcomeId: string; worktreePath: string; goal: string; acceptanceCriteria: string[]; diff: string }) => Promise<{ feature: string; scenarios: Array<{ name: string; path: string; actions: Array<{ type: string; selector?: string; value?: string }>; assertions: string[] }> }>;
    prepareOutcome: (input: { outcomeId: string; projectPath: string }) => Promise<{ sourcePath: string; worktreePath: string; branch: string }>;
    validateOutcome: (worktreePath: string) => Promise<Array<{ command: string; passed: boolean; output: string }>>;
    getOutcomeReview: (worktreePath: string) => Promise<{ summary: string; diff: string; changedFiles: string[] }>;
    visualValidateOutcome: (input: { worktreePath: string; outcomeId: string; goal: string; acceptanceCriteria: string[]; spec?: { feature: string; scenarios: Array<{ name: string; path: string; actions: Array<{ type: string; selector?: string; value?: string }>; assertions: string[] }> } }) => Promise<{ supported: boolean; passed: boolean; message: string; spec?: { feature: string; scenarios: Array<{ name: string; path: string; assertions: string[] }> }; scenarios: Array<{ name: string; passed: boolean; assertions: string[]; artifacts: Array<{ id: string; label: string; type: "screenshot" | "video" | "trace" }> }>; artifacts: Array<{ id: string; label: string; type: "screenshot" | "video" | "trace" }>; consoleErrors: string[] }>;
    getValidationArtifact: (input: { outcomeId: string; artifactId: string }) => Promise<{ dataUrl: string; type: "screenshot" | "video" | "trace" }>;
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
