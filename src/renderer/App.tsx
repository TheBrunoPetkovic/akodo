import { useRef, useCallback, useEffect, useState } from "react";
import { TopBar } from "./components/TopBar";
import { Tooltip } from "./components/Tooltip";
import { SettingsModal } from "./components/SettingsModal";
import { ContextMenu } from "./components/ContextMenu";
import { RenameModal } from "./components/RenameModal";

type OutcomeStatus =
  | "Draft"
  | "Planning"
  | "Working"
  | "Validating"
  | "Fixing"
  | "Needs input"
  | "Ready to review"
  | "Applied"
  | "Failed";

interface OutcomeEvent {
  id: string;
  type: string;
  message: string;
  timestamp: number;
}

interface Outcome {
  id: string;
  name: string;
  projectPath: string;
  status: OutcomeStatus;
  goal: string;
  constraints: string;
  acceptanceCriteria: string[];
  messages: { role: string; content: string }[];
  events: OutcomeEvent[];
  prepared?: { sourcePath: string; worktreePath: string; branch: string };
  validation?: { command: string; passed: boolean; output: string }[];
  review?: { summary: string; diff: string; changedFiles: string[] };
  visualValidation?: { supported: boolean; passed: boolean; message: string; screenshots: Array<{ label: string; dataUrl: string }>; consoleErrors: string[] };
  question?: { runId: string; requestId: string; questions: Array<{ header: string; question: string; options: Array<{ label: string; description?: string }>; multiple?: boolean; custom?: boolean }> };
  createdAt: number;
}

interface AgentExecution {
  id: string;
  name: string;
  status: "idle" | "working" | "done" | "attention";
}

function loadOutcomes(): Outcome[] {
  const saved = localStorage.getItem("akodo-outcomes");
  if (!saved) return [];
  const parsed = JSON.parse(saved) as Outcome[];
  return parsed.map((o) => ({
    ...o,
    events: o.events ?? [],
    constraints: o.constraints ?? "",
    projectPath: o.projectPath ?? "",
  }));
}

function saveOutcomes(outcomes: Outcome[]) {
  localStorage.setItem("akodo-outcomes", JSON.stringify(outcomes));
}

const STATUS_COLORS: Record<OutcomeStatus, string> = {
  "Draft": "text-ctp-overlay0",
  "Planning": "text-ctp-yellow",
  "Working": "text-ctp-blue",
  "Validating": "text-ctp-mauve",
  "Fixing": "text-ctp-peach",
  "Needs input": "text-ctp-red",
  "Ready to review": "text-ctp-green",
  "Applied": "text-ctp-teal",
  "Failed": "text-ctp-red",
};

const STATUS_DOT: Record<OutcomeStatus, string> = {
  "Draft": "bg-ctp-overlay0",
  "Planning": "bg-ctp-yellow",
  "Working": "bg-ctp-blue",
  "Validating": "bg-ctp-mauve",
  "Fixing": "bg-ctp-peach",
  "Needs input": "bg-ctp-red",
  "Ready to review": "bg-ctp-green",
  "Applied": "bg-ctp-teal",
  "Failed": "bg-ctp-red",
};

function App() {
  const [panelWidth, setPanelWidth] = useState(38);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>(loadOutcomes);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [renameIndex, setRenameIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<{ id: string; content: string }[]>([]);
  const [creatingOutcome, setCreatingOutcome] = useState(false);
  const [newOutcomeName, setNewOutcomeName] = useState("");
  const [newOutcomeProjectPath, setNewOutcomeProjectPath] = useState("");
  const [newOutcomeGoal, setNewOutcomeGoal] = useState("");
  const [newOutcomeCriteria, setNewOutcomeCriteria] = useState("");
  const [newOutcomeConstraints, setNewOutcomeConstraints] = useState("");
  const [executions, setExecutions] = useState<Record<string, AgentExecution[]>>({});
  const [liveOutput, setLiveOutput] = useState<Record<string, string>>({});
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string[][]>>({});
  const outcomeCountRef = parseInt(localStorage.getItem("akodo-outcome-count") ?? "0", 10);
  const outcomeCount = useRef(outcomeCountRef);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const loadingRef = useRef(false);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    saveOutcomes(outcomes);
  }, [outcomes]);

  useEffect(() => {
    localStorage.removeItem("akodo-api-key");
    localStorage.removeItem("akodo-default-model");
  }, []);

  useEffect(() => window.api.onOpenCodeEvent((event) => {
    if (event.type === "started") {
      setLiveOutput((previous) => ({ ...previous, [event.outcomeId]: "Starting OpenCode…\n" }));
      return;
    }
    if (event.type === "question" && event.question) {
      setQuestionAnswers((previous) => ({ ...previous, [event.outcomeId]: event.question!.questions.map(() => []) }));
      setOutcomes((previous) => previous.map((outcome) => outcome.id === event.outcomeId ? {
        ...outcome,
        status: "Needs input",
        question: { runId: event.runId, ...event.question! },
        events: [...outcome.events, makeEvent("agent.question", "OpenCode needs your input to continue")],
      } : outcome));
      return;
    }
    if (event.type !== "output" || !event.text) return;
    setLiveOutput((previous) => ({
      ...previous,
      [event.outcomeId]: `${previous[event.outcomeId] ?? ""}${event.text}\n`,
    }));
  }), []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [panelWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - startX.current;
      const newWidth = startWidth.current + (dx / window.innerWidth) * 100;
      const minPercent = (250 / window.innerWidth) * 100;
      setPanelWidth(Math.min(Math.max(newWidth, minPercent), 85));
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const createOutcome = () => {
    if (!newOutcomeName.trim()) return;
    outcomeCount.current += 1;
    localStorage.setItem("akodo-outcome-count", outcomeCount.current.toString());
    const criteria = newOutcomeCriteria
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean);
    const constraints = newOutcomeConstraints
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean);
    const outcome: Outcome = {
      id: crypto.randomUUID(),
      name: newOutcomeName.trim(),
      projectPath: newOutcomeProjectPath,
      status: "Draft",
      goal: newOutcomeGoal.trim(),
      constraints: constraints.join("\n"),
      acceptanceCriteria: criteria,
      messages: [],
      events: [
        { id: crypto.randomUUID(), type: "created", message: "Outcome created as draft", timestamp: Date.now() },
      ],
      createdAt: Date.now(),
    };
    const updated = [...outcomes, outcome];
    setOutcomes(updated);
    saveOutcomes(updated);
    setSelectedIndex(updated.length - 1);
    setCreatingOutcome(false);
    setNewOutcomeName("");
    setNewOutcomeProjectPath("");
    setNewOutcomeGoal("");
    setNewOutcomeCriteria("");
    setNewOutcomeConstraints("");
    setExecutions((prev) => ({
      ...prev,
      [outcome.id]: [
        { id: crypto.randomUUID(), name: "OpenCode", status: "idle" },
      ],
    }));
  };

  const deleteOutcome = (index: number) => {
    const updated = outcomes.filter((_, i) => i !== index);
    setOutcomes(updated);
    saveOutcomes(updated);
    if (selectedIndex === index) setSelectedIndex(null);
    else if (selectedIndex !== null && selectedIndex > index) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const renameOutcome = (index: number, newName: string) => {
    const name = newName.trim();
    if (!name) return;
    const updated = outcomes.map((o, i) => (i === index ? { ...o, name } : o));
    setOutcomes(updated);
    saveOutcomes(updated);
  };

  const startOutcome = (index: number) => {
    const outcome = outcomes[index];
    if (!outcome.projectPath) {
      setOutcomes((prev) => prev.map((item, i) => (
        i === index
          ? { ...item, status: "Needs input", events: [...item.events, makeEvent("project.required", "Choose a project for this outcome before starting it")] }
          : item
      )));
      return;
    }
    void runImplementation(outcome.id, "Implement the outcome completely. Work through every acceptance criterion.");
  };

  const chooseProjectForNewOutcome = async () => {
    const projectPath = await window.api.selectProject();
    if (projectPath) setNewOutcomeProjectPath(projectPath);
  };

  const chooseProjectForOutcome = async (outcomeId: string) => {
    const projectPath = await window.api.selectProject();
    if (!projectPath) return;
    setOutcomes((prev) => prev.map((outcome) => (
      outcome.id === outcomeId
        ? { ...outcome, projectPath, events: [...outcome.events, makeEvent("project.selected", `Project selected: ${projectPath}`)] }
        : outcome
    )));
  };

  const updateExecution = (outcomeId: string, execId: string, status: AgentExecution["status"]) => {
    setExecutions((prev) => ({
      ...prev,
      [outcomeId]: (prev[outcomeId] || []).map((ex) =>
        ex.id === execId ? { ...ex, status } : ex
      ),
    }));
  };

  const runImplementation = async (outcomeId: string, instruction: string) => {
    const outcome = outcomes.find((item) => item.id === outcomeId);
    if (!outcome || !outcome.projectPath) return;
    const userMessage = { role: "user", content: instruction };
    const updatedMessages = [...outcome.messages, userMessage];
    const firstExec = executions[outcomeId]?.[0];
    setOutcomes((previous) => previous.map((item) => item.id === outcomeId ? {
      ...item,
      messages: updatedMessages,
      status: "Planning",
      validation: undefined,
      review: undefined,
      events: [...item.events, makeEvent("outcome.started", "Preparing an isolated worktree for this outcome")],
    } : item));
    setLiveOutput((previous) => ({ ...previous, [outcomeId]: "" }));
    setLoading(true);
    if (firstExec) updateExecution(outcomeId, firstExec.id, "working");

    try {
      const prepared = outcome.prepared ?? await window.api.prepareOutcome({ outcomeId, projectPath: outcome.projectPath });
      setOutcomes((previous) => previous.map((item) => item.id === outcomeId ? {
        ...item,
        prepared,
        status: "Working",
        events: [...item.events, makeEvent("worktree.ready", `Working in isolated branch ${prepared.branch}`)],
      } : item));

      const reply = await window.api.runOpenCode({
        outcomeId,
        projectPath: prepared.worktreePath,
        prompt: buildOpenCodePrompt(outcome, instruction),
      });
      if (reply.startsWith("[[AKODO_NEEDS_INPUT]]")) {
        const message = reply.replace("[[AKODO_NEEDS_INPUT]]", "").trim();
        setOutcomes((previous) => previous.map((item) => item.id === outcomeId ? {
          ...item,
          messages: [...updatedMessages, { role: "assistant", content: message }],
          status: "Needs input",
          events: [...item.events, makeEvent("agent.question", "OpenCode needs your input before it can continue")],
        } : item));
        if (firstExec) updateExecution(outcomeId, firstExec.id, "attention");
        return;
      }
      setOutcomes((previous) => previous.map((item) => item.id === outcomeId ? {
        ...item,
        messages: [...updatedMessages, { role: "assistant", content: reply }],
        status: "Validating",
        events: [...item.events, makeEvent("implementation.completed", "Implementation completed; running project checks")],
      } : item));

      const validation = await window.api.validateOutcome(prepared.worktreePath);
      const visualValidation = await window.api.visualValidateOutcome({ worktreePath: prepared.worktreePath, outcomeId });
      const review = await window.api.getOutcomeReview(prepared.worktreePath);
      const passed = validation.every((result) => result.passed) && (!visualValidation.supported || visualValidation.passed);
      setOutcomes((previous) => previous.map((item) => item.id === outcomeId ? {
        ...item,
        prepared,
        validation,
        visualValidation,
        review,
        status: passed ? "Ready to review" : "Needs input",
        events: [...item.events, makeEvent("validation.completed", passed ? "Checks and visual preview passed; review the changes before applying" : "A code check or visual preview failed; review and ask OpenCode to fix it")],
      } : item));
      if (firstExec) updateExecution(outcomeId, firstExec.id, passed ? "done" : "attention");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOutcomes((previous) => previous.map((item) => item.id === outcomeId ? {
        ...item,
        status: "Failed",
        messages: [...updatedMessages, { role: "assistant", content: `Error: ${message}` }],
        events: [...item.events, makeEvent("outcome.failed", "The outcome could not be run")],
      } : item));
      if (firstExec) updateExecution(outcomeId, firstExec.id, "attention");
    } finally {
      setLoading(false);
    }
  };

  const approveOutcome = async (outcome: Outcome) => {
    if (!outcome.prepared) return;
    try {
      await window.api.approveOutcome(outcome.prepared, outcome.name);
      setOutcomes((previous) => previous.map((item) => item.id === outcome.id ? {
        ...item,
        status: "Applied",
        events: [...item.events, makeEvent("review.approved", "Changes committed and applied to the selected project's current branch")],
      } : item));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOutcomes((previous) => previous.map((item) => item.id === outcome.id ? {
        ...item,
        status: "Needs input",
        events: [...item.events, makeEvent("review.apply_failed", message)],
      } : item));
    }
  };

  const discardOutcomeChanges = async (outcome: Outcome) => {
    if (!outcome.prepared) return;
    try {
      await window.api.discardOutcome(outcome.prepared);
      setOutcomes((previous) => previous.map((item) => item.id === outcome.id ? {
        ...item,
        prepared: undefined,
        validation: undefined,
        review: undefined,
        status: "Draft",
        events: [...item.events, makeEvent("review.discarded", "Isolated outcome changes discarded")],
      } : item));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOutcomes((previous) => previous.map((item) => item.id === outcome.id ? {
        ...item,
        events: [...item.events, makeEvent("review.discard_failed", message)],
      } : item));
    }
  };

  const toggleQuestionAnswer = (outcome: Outcome, questionIndex: number, label: string, multiple: boolean) => {
    setQuestionAnswers((previous) => {
      const answers = [...(previous[outcome.id] ?? [])];
      const current = answers[questionIndex] ?? [];
      answers[questionIndex] = multiple
        ? (current.includes(label) ? current.filter((item) => item !== label) : [...current, label])
        : [label];
      return { ...previous, [outcome.id]: answers };
    });
  };

  const submitQuestionAnswers = async (outcome: Outcome, providedAnswers?: string[][]) => {
    if (!outcome.question) return;
    const answers = providedAnswers ?? questionAnswers[outcome.id] ?? [];
    if (answers.length !== outcome.question.questions.length || answers.some((answer) => answer.length === 0)) return;
    try {
      await window.api.answerOpenCodeQuestion({
        runId: outcome.question.runId,
        requestId: outcome.question.requestId,
        answers,
      });
      setOutcomes((previous) => previous.map((item) => item.id === outcome.id ? {
        ...item,
        status: "Working",
        question: undefined,
        messages: [...item.messages, { role: "user", content: `Answer: ${answers.map((answer) => answer.join(", ")).join(" | ")}` }],
        events: [...item.events, makeEvent("agent.answer", "Answer sent; OpenCode is continuing")],
      } : item));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOutcomes((previous) => previous.map((item) => item.id === outcome.id ? {
        ...item,
        events: [...item.events, makeEvent("agent.answer_failed", message)],
      } : item));
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || selectedIndex === null) return;

    const outcome = outcomes[selectedIndex];
    const outcomeId = outcome.id;
    const content = input.trim();
    setInput("");

    if (outcome.question) {
      const answers = outcome.question.questions.map((_, index) => questionAnswers[outcome.id]?.[index]?.length ? questionAnswers[outcome.id][index] : [content]);
      setQuestionAnswers((previous) => ({ ...previous, [outcome.id]: answers }));
      await submitQuestionAnswers(outcome, answers);
      return;
    }

    if (loadingRef.current) {
      setQueue((prev) => [...prev, { id: crypto.randomUUID(), content }]);
      return;
    }

    await runImplementation(outcomeId, content);
  };

  const editQueueItem = (id: string) => {
    const item = queue.find((q) => q.id === id);
    if (item) {
      setInput(item.content);
      setQueue((prev) => prev.filter((q) => q.id !== id));
    }
  };

  const currentOutcome = selectedIndex !== null ? outcomes[selectedIndex] : null;
  const currentMessages = currentOutcome?.messages || [];
  const currentLiveOutput = currentOutcome ? liveOutput[currentOutcome.id] ?? "" : "";
  const currentQueue = queue;
  const executionsList = currentOutcome ? executions[currentOutcome.id] || [] : [];

  const EXEC_STATUS_TEXT: Record<AgentExecution["status"], string> = {
    idle: "idle",
    working: "working",
    done: "done",
    attention: "attention",
  };

  const EXEC_STATUS_COLOR: Record<AgentExecution["status"], string> = {
    idle: "text-ctp-overlay0",
    working: "text-ctp-blue animate-pulse",
    done: "text-ctp-green",
    attention: "text-ctp-red",
  };

  return (
    <div className="flex flex-col h-screen bg-ctp-base text-ctp-text select-none">
      <TopBar />

      <div className="flex flex-1 overflow-hidden">
        <div className="fixed bottom-4 left-0 w-[50px] flex items-center justify-center z-50">
          <Tooltip text="Settings">
            <button onClick={() => setSettingsOpen(true)} className="inline-flex w-8 h-8 items-center justify-center text-ctp-overlay0 hover:text-ctp-text transition-colors">
              <svg className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </Tooltip>
        </div>
        <div className="flex flex-col relative ml-[50px]" style={{ width: `calc(${panelWidth}% - 50px)` }}>
          <div className="flex-1 rounded-xl border border-ctp-surface0 bg-ctp-mantle relative overflow-hidden">
            <div className="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-ctp-surface0">
              <span className="text-sm font-medium text-ctp-overlay0">Outcomes</span>
              <Tooltip text="Create new outcome">
                <button onClick={() => { setSelectedIndex(null); setCreatingOutcome(true); }} className="w-6 h-6 flex items-center justify-center rounded-md text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0 transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              </Tooltip>
            </div>
            <div className="p-2 space-y-1 overflow-y-auto max-h-full">
              {outcomes.length === 0 && (
                <div className="text-sm text-ctp-overlay0 px-2 py-6 text-center">
                  No outcomes yet
                </div>
              )}
              {outcomes.map((outcome, i) => (
                <div
                  key={outcome.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, index: i });
                  }}
                  className={`px-2 py-2 rounded-lg transition-colors cursor-pointer ${selectedIndex === i ? "bg-ctp-surface0" : "hover:bg-ctp-surface0"}`}
                  onClick={() => { setSelectedIndex(i); setCreatingOutcome(false); }}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[outcome.status]}`} />
                    <span className="text-sm truncate flex-1">{outcome.name}</span>
                  </div>
                  <div className="text-xs text-ctp-overlay0 ml-4 mt-0.5">
                    {outcome.acceptanceCriteria.length} criterion{outcome.acceptanceCriteria.length !== 1 ? "s" : ""} · {STATUS_TEXT_SHORT(outcome.status)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div
            onMouseDown={onMouseDown}
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-ctp-surface0 active:bg-ctp-mauve transition-colors"
          />
        </div>

        <div className="flex-1 flex flex-col rounded-xl border border-ctp-surface0 bg-ctp-mantle ml-[5px] mr-[5px] overflow-hidden">
          {currentOutcome ? (
            <>
              <div className="flex-1 overflow-y-auto select-text">
                <div className="border-b border-ctp-surface0 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-medium text-ctp-text">{currentOutcome.name}</h2>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-xs font-medium uppercase tracking-wider ${STATUS_COLORS[currentOutcome.status]}`}>
                      {currentOutcome.status}
                    </span>
                    {(currentOutcome.status === "Draft" || currentOutcome.status === "Needs input" || currentOutcome.status === "Failed") && (
                      <button onClick={() => startOutcome(selectedIndex!)} className="text-xs px-2 py-0.5 rounded bg-ctp-mauve text-ctp-crust font-medium hover:opacity-80">
                        {currentOutcome.prepared ? "Retry" : "Start"}
                      </button>
                    )}
                  </div>
                </div>

                <div className="px-4 py-3 border-b border-ctp-surface0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-ctp-overlay0 uppercase tracking-wider mb-0.5">Project</div>
                      <div className="text-xs text-ctp-subtext1 truncate">{currentOutcome.projectPath || "No project selected"}</div>
                    </div>
                    <button
                      onClick={() => void chooseProjectForOutcome(currentOutcome.id)}
                      className="shrink-0 text-xs px-2 py-1 rounded bg-ctp-surface0 text-ctp-text hover:bg-ctp-surface1"
                    >
                      {currentOutcome.projectPath ? "Change" : "Choose project"}
                    </button>
                  </div>
                </div>

                {(currentOutcome.goal || currentOutcome.constraints || currentOutcome.acceptanceCriteria.length > 0) && (
                  <div className="px-4 py-3 border-b border-ctp-surface0 space-y-2">
                    {currentOutcome.goal && (
                      <div>
                        <div className="text-[11px] font-medium text-ctp-overlay0 uppercase tracking-wider mb-0.5">Goal</div>
                        <div className="text-sm text-ctp-text whitespace-pre-wrap font-mono">{currentOutcome.goal}</div>
                      </div>
                    )}
                    {currentOutcome.constraints && (
                      <div>
                        <div className="text-[11px] font-medium text-ctp-overlay0 uppercase tracking-wider mb-0.5">Constraints</div>
                        <div className="text-sm text-ctp-text whitespace-pre-wrap font-mono">{currentOutcome.constraints}</div>
                      </div>
                    )}
                    {currentOutcome.acceptanceCriteria.length > 0 && (
                      <div>
                        <div className="text-[11px] font-medium text-ctp-overlay0 uppercase tracking-wider mb-0.5">Acceptance criteria</div>
                        <ul className="space-y-1">
                          {currentOutcome.acceptanceCriteria.map((c, i) => (
                            <li key={i} className="text-sm text-ctp-text font-mono">— {c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {executionsList.length > 0 && (
                  <div className="px-4 py-3 border-b border-ctp-surface0">
                    <div className="text-[11px] font-medium text-ctp-overlay0 uppercase tracking-wider mb-1.5">Agents</div>
                    <div className="space-y-1">
                      {executionsList.map((ex) => (
                        <div key={ex.id} className="flex items-center gap-2 text-sm">
                          <span className="text-ctp-text">{ex.name}</span>
                          <span className={`text-xs ${EXEC_STATUS_COLOR[ex.status]}`}>{EXEC_STATUS_TEXT[ex.status]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(currentOutcome.validation || currentOutcome.visualValidation || currentOutcome.review) && (
                  <div className="px-4 py-3 border-b border-ctp-surface0 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] font-medium text-ctp-overlay0 uppercase tracking-wider">Review</div>
                      {currentOutcome.status === "Ready to review" && currentOutcome.prepared && (
                        <div className="flex gap-2">
                          <button onClick={() => void approveOutcome(currentOutcome)} className="text-xs px-2 py-1 rounded bg-ctp-green text-ctp-crust font-medium hover:opacity-80">Apply changes</button>
                          <button onClick={() => void discardOutcomeChanges(currentOutcome)} className="text-xs px-2 py-1 rounded bg-ctp-surface0 text-ctp-text hover:bg-ctp-surface1">Discard</button>
                        </div>
                      )}
                    </div>
                    {currentOutcome.validation && (
                      <div className="space-y-1.5">
                        {currentOutcome.validation.map((check) => (
                          <details key={check.command} className="rounded bg-ctp-base border border-ctp-surface0 px-2 py-1.5">
                            <summary className={`cursor-pointer text-xs font-mono ${check.passed ? "text-ctp-green" : "text-ctp-red"}`}>
                              {check.passed ? "✓" : "×"} {check.command}
                            </summary>
                            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-ctp-subtext1 font-mono">{check.output || "No output"}</pre>
                          </details>
                        ))}
                      </div>
                    )}
                    {currentOutcome.visualValidation && (
                      <details className="rounded bg-ctp-base border border-ctp-surface0 px-2 py-1.5" open={currentOutcome.visualValidation.supported}>
                        <summary className={`cursor-pointer text-xs font-mono ${currentOutcome.visualValidation.passed ? "text-ctp-green" : "text-ctp-red"}`}>
                          {currentOutcome.visualValidation.passed ? "✓" : "×"} Visual browser validation
                        </summary>
                        <div className="mt-2 text-xs text-ctp-subtext1">{currentOutcome.visualValidation.message}</div>
                        {currentOutcome.visualValidation.consoleErrors.length > 0 && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs text-ctp-red font-mono">{currentOutcome.visualValidation.consoleErrors.join("\n")}</pre>}
                        {currentOutcome.visualValidation.screenshots.length > 0 && (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {currentOutcome.visualValidation.screenshots.map((screenshot) => (
                              <div key={screenshot.label} className="min-w-0">
                                <div className="mb-1 text-[10px] uppercase tracking-wider text-ctp-overlay0">{screenshot.label}</div>
                                <img src={screenshot.dataUrl} alt={`${screenshot.label} visual validation`} className="w-full rounded border border-ctp-surface0" />
                              </div>
                            ))}
                          </div>
                        )}
                      </details>
                    )}
                    {currentOutcome.review && (
                      <details className="rounded bg-ctp-base border border-ctp-surface0 px-2 py-1.5">
                        <summary className="cursor-pointer text-xs text-ctp-subtext1 font-mono">Changed files ({currentOutcome.review.changedFiles.length})</summary>
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-ctp-subtext1 font-mono">{currentOutcome.review.summary}\n{currentOutcome.review.changedFiles.join("\n")}\n\n{currentOutcome.review.diff}</pre>
                      </details>
                    )}
                  </div>
                )}

                {currentOutcome.question && (
                  <div className="px-4 py-3 border-b border-ctp-surface0 space-y-3 bg-ctp-yellow/5">
                    <div className="text-[11px] font-medium text-ctp-yellow uppercase tracking-wider">OpenCode needs your decision</div>
                    {currentOutcome.question.questions.map((question, questionIndex) => {
                      const selected = questionAnswers[currentOutcome.id]?.[questionIndex] ?? [];
                      return (
                        <div key={`${currentOutcome.question!.requestId}-${questionIndex}`} className="space-y-2">
                          <div className="text-sm text-ctp-text">{question.question}</div>
                          <div className="space-y-1.5">
                            {question.options.map((option) => {
                              const active = selected.includes(option.label);
                              return (
                                <button
                                  key={option.label}
                                  onClick={() => toggleQuestionAnswer(currentOutcome, questionIndex, option.label, Boolean(question.multiple))}
                                  className={`block w-full text-left rounded border px-2.5 py-2 text-xs transition-colors ${active ? "border-ctp-mauve bg-ctp-mauve/15 text-ctp-text" : "border-ctp-surface0 bg-ctp-base text-ctp-subtext1 hover:bg-ctp-surface0"}`}
                                >
                                  <div className="font-medium">{option.label}</div>
                                  {option.description && <div className="mt-0.5 text-ctp-overlay0">{option.description}</div>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    <button
                      onClick={() => void submitQuestionAnswers(currentOutcome)}
                      disabled={(questionAnswers[currentOutcome.id] ?? []).length !== currentOutcome.question.questions.length || (questionAnswers[currentOutcome.id] ?? []).some((answer) => answer.length === 0)}
                      className="px-3 py-1.5 rounded bg-ctp-mauve text-ctp-crust text-xs font-medium disabled:opacity-40 hover:opacity-90"
                    >
                      Continue agent
                    </button>
                  </div>
                )}

                {currentOutcome.events.length > 0 && (
                  <div className="px-4 py-3 border-b border-ctp-surface0">
                    <div className="text-[11px] font-medium text-ctp-overlay0 uppercase tracking-wider mb-1.5">Timeline</div>
                    <div className="space-y-1.5">
                      {[...currentOutcome.events].reverse().map((ev) => (
                        <div key={ev.id} className="flex items-start gap-2 text-xs">
                          <span className="text-ctp-overlay0 shrink-0 font-mono mt-px">
                            {new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="text-ctp-subtext1 font-mono">{ev.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="px-4 py-3">
                  <div className="text-[11px] font-medium text-ctp-overlay0 uppercase tracking-wider mb-1.5">Conversation</div>
                  {currentLiveOutput && (
                    <div className="mb-4">
                      <div className="text-[11px] font-medium text-ctp-blue uppercase tracking-wider mb-1.5 animate-pulse">Live OpenCode output</div>
                      <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-ctp-base border border-ctp-surface0 p-3 text-xs leading-relaxed text-ctp-subtext1 font-mono">
                        {currentLiveOutput}
                      </pre>
                    </div>
                  )}
                  {currentMessages.length === 0 && currentQueue.length === 0 ? (
                    <div className="text-sm text-ctp-overlay0">Start working on this task.</div>
                  ) : (
                    <div className="space-y-4">
                      {currentMessages.map((msg, i) => (
                        <div key={i} className={`py-1 px-2 -mx-2 rounded ${msg.role === "user" ? "bg-white/[0.03]" : ""}`}>
                          <div className="text-sm text-ctp-text leading-relaxed whitespace-pre-wrap font-mono">
                            {msg.role === "user" && <span className="text-ctp-mauve mr-2 select-none">&gt;</span>}
                            {msg.content}
                          </div>
                        </div>
                      ))}
                      {currentQueue.map((item) => (
                        <div
                          key={item.id}
                          className="py-1 px-2 -mx-2 rounded bg-white/[0.03] cursor-pointer hover:bg-white/[0.06] transition-colors group"
                          onClick={() => editQueueItem(item.id)}
                        >
                          <div className="text-xs text-ctp-overlay0 font-mono mb-0.5 select-none">queued — click to edit</div>
                          <div className="text-sm text-ctp-text leading-relaxed whitespace-pre-wrap font-mono">
                            <span className="text-ctp-mauve mr-2 select-none">&gt;</span>
                            {item.content}
                          </div>
                        </div>
                      ))}
                      {loading && currentQueue.length === 0 && (
                        <div className="text-sm text-ctp-overlay0 animate-pulse font-mono">
                          Generating...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 border-t border-ctp-surface0">
                <div className="relative">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                    placeholder={loading ? "Message will be queued..." : "Type a message..."}
                    className="w-full px-3 py-2 pr-10 rounded-lg bg-ctp-base border border-ctp-surface0 text-ctp-text text-sm placeholder-ctp-overlay0 focus:outline-none focus:border-ctp-mauve transition-colors"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0 transition-colors disabled:opacity-30"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
                {loading && currentQueue.length > 0 && (
                  <div className="text-xs text-ctp-overlay0 mt-1 font-mono">
                    {currentQueue.length} message{currentQueue.length > 1 ? "s" : ""} queued
                  </div>
                )}
              </div>
            </>
          ) : creatingOutcome ? (
            <div className="flex-1 flex flex-col overflow-y-auto select-text p-6 max-w-2xl">
              <h2 className="text-lg font-medium text-ctp-text mb-4">New Outcome</h2>
              <label className="text-[11px] font-medium text-ctp-overlay0 uppercase tracking-wider mb-1">Name</label>
              <input
                autoFocus
                type="text"
                value={newOutcomeName}
                onChange={(e) => setNewOutcomeName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createOutcome()}
                placeholder="e.g. Add Google OAuth"
                className="w-full px-3 py-2 rounded-lg bg-ctp-base border border-ctp-surface0 text-sm focus:outline-none focus:border-ctp-mauve mb-4"
              />
              <label className="text-[11px] font-medium text-ctp-overlay0 uppercase tracking-wider mb-1">Project</label>
              <div className="flex items-center gap-2 mb-4">
                <div className="min-w-0 flex-1 text-xs text-ctp-subtext1 truncate px-3 py-2 rounded-lg bg-ctp-base border border-ctp-surface0">
                  {newOutcomeProjectPath || "No project selected"}
                </div>
                <button
                  onClick={() => void chooseProjectForNewOutcome()}
                  className="shrink-0 px-3 py-2 rounded-lg bg-ctp-surface0 text-ctp-text text-sm hover:bg-ctp-surface1"
                >
                  Choose
                </button>
              </div>
              <label className="text-[11px] font-medium text-ctp-overlay0 uppercase tracking-wider mb-1">Goal</label>
              <textarea
                value={newOutcomeGoal}
                onChange={(e) => setNewOutcomeGoal(e.target.value)}
                placeholder="What should this outcome achieve?"
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-ctp-base border border-ctp-surface0 text-sm focus:outline-none focus:border-ctp-mauve resize-none mb-4"
              />
              <label className="text-[11px] font-medium text-ctp-overlay0 uppercase tracking-wider mb-1">Constraints</label>
              <textarea
                value={newOutcomeConstraints}
                onChange={(e) => setNewOutcomeConstraints(e.target.value)}
                placeholder="Technical or product constraints (one per line)"
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-ctp-base border border-ctp-surface0 text-sm focus:outline-none focus:border-ctp-mauve resize-none mb-4"
              />
              <label className="text-[11px] font-medium text-ctp-overlay0 uppercase tracking-wider mb-1">Acceptance criteria</label>
              <textarea
                value={newOutcomeCriteria}
                onChange={(e) => setNewOutcomeCriteria(e.target.value)}
                placeholder="Each line becomes one criterion"
                rows={4}
                className="w-full px-3 py-2 rounded-lg bg-ctp-base border border-ctp-surface0 text-sm focus:outline-none focus:border-ctp-mauve resize-none mb-6"
              />
              <div className="flex gap-2">
                <button
                  onClick={createOutcome}
                  disabled={!newOutcomeName.trim()}
                  className="px-4 py-2 rounded-lg bg-ctp-mauve text-ctp-crust text-sm font-medium disabled:opacity-40 hover:opacity-90"
                >
                  Create outcome
                </button>
                <button
                  onClick={() => { setCreatingOutcome(false); setNewOutcomeName(""); setNewOutcomeProjectPath(""); setNewOutcomeGoal(""); setNewOutcomeConstraints(""); setNewOutcomeCriteria(""); }}
                  className="px-4 py-2 rounded-lg bg-ctp-surface0 text-ctp-text text-sm hover:bg-ctp-surface1"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-ctp-overlay0 text-sm">Select an outcome</span>
            </div>
          )}
        </div>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { label: "Rename", onClick: () => setRenameIndex(contextMenu.index) },
            { label: "Delete", onClick: () => deleteOutcome(contextMenu.index), danger: true },
          ]}
        />
      )}
      {renameIndex !== null && (
        <RenameModal
          currentName={outcomes[renameIndex].name}
          onRename={(newName) => renameOutcome(renameIndex, newName)}
          onClose={() => setRenameIndex(null)}
        />
      )}
    </div>
  );
}

function makeEvent(type: string, message: string): OutcomeEvent {
  return { id: crypto.randomUUID(), type, message, timestamp: Date.now() };
}

function STATUS_TEXT_SHORT(status: OutcomeStatus): string {
  switch (status) {
    case "Needs input": return "needs input";
    case "Ready to review": return "ready";
    default: return status.toLowerCase();
  }
}

function buildOpenCodePrompt(outcome: Outcome, instruction: string): string {
  const criteria = outcome.acceptanceCriteria.length > 0
    ? outcome.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n")
    : "- No explicit acceptance criteria supplied";
  const constraints = outcome.constraints || "None supplied";

  return `You are implementing an Akodo outcome in the current local project.\n\nOutcome: ${outcome.name}\nGoal: ${outcome.goal || outcome.name}\nConstraints:\n${constraints}\nAcceptance criteria:\n${criteria}\n\nImplementation instruction:\n${instruction}\n\nScope boundary: work only inside the current outcome worktree. Do not read, modify, create, or delete files outside this repository folder. Do not navigate to parent folders, the user home, or other projects.\n\nBrowser validation: when the outcome changes a web UI or has UI-related acceptance criteria, you have Playwright available through Node. Start the local web preview, use Playwright to exercise the concrete user flows implied by the acceptance criteria, verify the expected state at desktop and mobile viewport sizes, and inspect browser console errors. Do not merely write a browser test; actually run it. Keep temporary validation scripts out of the final diff.\n\nInspect the repository first, implement only what is needed, run relevant local checks, and summarize the changes, browser scenarios, and commands you ran. Do not commit, push, or deploy.`;
}

export default App;
