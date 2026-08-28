import { useRef, useCallback, useEffect, useState } from "react";
import { TopBar } from "./components/TopBar";
import { Tooltip } from "./components/Tooltip";
import { SettingsModal } from "./components/SettingsModal";
import { ContextMenu } from "./components/ContextMenu";
import { RenameModal } from "./components/RenameModal";
import Markdown from "./components/Markdown";

type OutcomeStatus =
  | "Draft"
  | "Planning"
  | "Working"
  | "Validating"
  | "Fixing"
  | "Specifying"
  | "Ready to implement"
  | "Needs input"
  | "Ready to validate"
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
  validationSpec?: { feature: string; scenarios: Array<{ name: string; path: string; actions: Array<{ type: string; selector?: string; value?: string }>; assertions: string[] }> };
  visualValidation?: { supported: boolean; passed: boolean; message: string; spec?: { feature: string; scenarios: Array<{ name: string; path: string; assertions: string[] }> }; scenarios: Array<{ name: string; passed: boolean; assertions: string[]; artifacts: Array<{ id: string; label: string; type: "screenshot" | "video" | "trace" }> }>; artifacts: Array<{ id: string; label: string; type: "screenshot" | "video" | "trace" }>; consoleErrors: string[] };
  question?: { runId: string; requestId: string; questions: Array<{ header: string; question: string; options: Array<{ label: string; description?: string }>; multiple?: boolean; custom?: boolean }> };
  specification?: { plan: string; confidence: number; links: string[]; status: "analyzing" | "ready" };
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
    visualValidation: o.visualValidation ? {
      ...o.visualValidation,
      scenarios: o.visualValidation.scenarios ?? [],
      artifacts: o.visualValidation.artifacts ?? [],
      consoleErrors: o.visualValidation.consoleErrors ?? [],
    } : undefined,
  }));
}

function saveOutcomes(outcomes: Outcome[]) {
  localStorage.setItem("akodo-outcomes", JSON.stringify(outcomes));
}

const STATUS_DOT: Record<OutcomeStatus, string> = {
  "Draft": "bg-ctp-overlay0",
  "Planning": "bg-ctp-yellow",
  "Working": "bg-ctp-blue",
  "Validating": "bg-ctp-mauve",
  "Fixing": "bg-ctp-peach",
  "Specifying": "bg-ctp-blue",
  "Ready to implement": "bg-ctp-mauve",
  "Needs input": "bg-ctp-red",
  "Ready to validate": "bg-ctp-yellow",
  "Ready to review": "bg-ctp-green",
  "Applied": "bg-ctp-teal",
  "Failed": "bg-ctp-red",
};

function App() {
  type RightSidebarView = "conversation" | "timeline" | "review" | "spec";
  const [panelWidth, setPanelWidth] = useState(250);
  const [rightWidth, setRightWidth] = useState(330);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rightSidebar, setRightSidebar] = useState<RightSidebarView | null>(null);
  const [evidence, setEvidence] = useState<{ type: "screenshot" | "video" | "trace"; dataUrl: string; label: string } | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>(loadOutcomes);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [renameIndex, setRenameIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<{ id: string; content: string }[]>([]);
  const [creatingOutcome, setCreatingOutcome] = useState(false);
  const [specificationStep, setSpecificationStep] = useState<"name" | "project" | "goal" | "constraints" | "criteria" | "links">("name");
  const [specificationInput, setSpecificationInput] = useState("");
  const [specificationMessages, setSpecificationMessages] = useState<{ role: "assistant" | "user"; content: string }[]>([]);
  const [newOutcomeName, setNewOutcomeName] = useState("");
  const [newOutcomeProjectPath, setNewOutcomeProjectPath] = useState("");
  const [newOutcomeGoal, setNewOutcomeGoal] = useState("");
  const [newOutcomeCriteria, setNewOutcomeCriteria] = useState("");
  const [newOutcomeConstraints, setNewOutcomeConstraints] = useState("");
  const [executions, setExecutions] = useState<Record<string, AgentExecution[]>>({});
  const [liveOutput, setLiveOutput] = useState<Record<string, string>>({});
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string[][]>>({});
  const [customQuestionAnswers, setCustomQuestionAnswers] = useState<Record<string, string[]>>({});
  const [decisionErrors, setDecisionErrors] = useState<Record<string, string>>({});
  const [submittingDecisionFor, setSubmittingDecisionFor] = useState<string | null>(null);
  const outcomeCountRef = parseInt(localStorage.getItem("akodo-outcome-count") ?? "0", 10);
  const outcomeCount = useRef(outcomeCountRef);
  const isDragging = useRef(false);
  const dragTarget = useRef<"left" | "right" | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const loadingRef = useRef(false);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const sidebarAtLatestRef = useRef(true);

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
      setCustomQuestionAnswers((previous) => ({ ...previous, [event.outcomeId]: event.question!.questions.map(() => "") }));
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
    dragTarget.current = "left";
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [panelWidth]);

  const onRightMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragTarget.current = "right";
    startX.current = e.clientX;
    startWidth.current = rightWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [rightWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - startX.current;
      if (dragTarget.current === "right") {
        const newWidth = startWidth.current - dx;
        setRightWidth(Math.min(Math.max(newWidth, 250), window.innerWidth * 0.85));
      } else {
        const newWidth = startWidth.current + dx;
        setPanelWidth(Math.min(Math.max(newWidth, 250), window.innerWidth * 0.85));
      }
    };

    const onMouseUp = () => {
      isDragging.current = false;
      dragTarget.current = null;
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

  const resetSpecificationFlow = () => {
    setCreatingOutcome(false);
    setSpecificationStep("name");
    setSpecificationInput("");
    setSpecificationMessages([]);
    setNewOutcomeName("");
    setNewOutcomeProjectPath("");
    setNewOutcomeGoal("");
    setNewOutcomeCriteria("");
    setNewOutcomeConstraints("");
  };

  const beginSpecificationFlow = () => {
    resetSpecificationFlow();
    setCreatingOutcome(true);
    setSpecificationMessages([{ role: "assistant", content: "Let’s turn this into a clear outcome. What should we call it?" }]);
  };

  const finalizeSpecificationFlow = (linksInput: string) => {
    if (!newOutcomeName.trim() || !newOutcomeProjectPath) return;
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
      status: "Specifying",
      goal: newOutcomeGoal.trim(),
      constraints: constraints.join("\n"),
      acceptanceCriteria: criteria,
      messages: [...specificationMessages, { role: "user", content: linksInput.trim() || "No reference links provided." }, { role: "assistant", content: "I’m inspecting the project and preparing the specification." }],
      events: [
        { id: crypto.randomUUID(), type: "created", message: "Specification flow started", timestamp: Date.now() },
      ],
      specification: { status: "analyzing", plan: "", confidence: 0, links: linksInput.split("\n").map((link) => link.trim()).filter(Boolean) },
      createdAt: Date.now(),
    };
    const updated = [...outcomes, outcome];
    setOutcomes(updated);
    saveOutcomes(updated);
    setSelectedIndex(updated.length - 1);
    setRightSidebar("spec");
    resetSpecificationFlow();
    setExecutions((prev) => ({
      ...prev,
      [outcome.id]: [
        { id: crypto.randomUUID(), name: "OpenCode", status: "idle" },
      ],
    }));
    void runSpecification(outcome);
  };

  const advanceSpecificationFlow = () => {
    const answer = specificationInput.trim();
    const askNext = (question: string) => setSpecificationMessages((previous) => [...previous, { role: "assistant", content: question }]);
    if (specificationStep === "name") {
      if (!answer) return;
      setNewOutcomeName(answer);
      setSpecificationMessages((previous) => [...previous, { role: "user", content: answer }]);
      setSpecificationInput("");
      setSpecificationStep("project");
      askNext("Which local project should this outcome work in? Choose its folder below.");
      return;
    }
    if (specificationStep === "goal") {
      if (!answer) return;
      setNewOutcomeGoal(answer);
      setSpecificationMessages((previous) => [...previous, { role: "user", content: answer }]);
      setSpecificationInput("");
      setSpecificationStep("constraints");
      askNext("Are there any constraints, technical decisions, or things that must not change? You can skip this.");
      return;
    }
    if (specificationStep === "constraints") {
      setNewOutcomeConstraints(answer);
      setSpecificationMessages((previous) => [...previous, { role: "user", content: answer || "No specific constraints." }]);
      setSpecificationInput("");
      setSpecificationStep("criteria");
      askNext("What must be true for you to consider this complete? Put each acceptance criterion on its own line.");
      return;
    }
    if (specificationStep === "criteria") {
      if (!answer) return;
      setNewOutcomeCriteria(answer);
      setSpecificationMessages((previous) => [...previous, { role: "user", content: answer }]);
      setSpecificationInput("");
      setSpecificationStep("links");
      askNext("Share any useful links or references (Slack, Figma, Supabase, docs), one per line. You can skip this.");
      return;
    }
    if (specificationStep === "links") finalizeSpecificationFlow(answer);
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

  const chooseProjectForNewOutcome = async () => {
    const projectPath = await window.api.selectProject();
    if (!projectPath) return;
    setNewOutcomeProjectPath(projectPath);
    setSpecificationMessages((previous) => [...previous, { role: "user", content: projectPath }, { role: "assistant", content: "What outcome do you want to achieve in this project?" }]);
    setSpecificationStep("goal");
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

  const runSpecification = async (outcome: Outcome) => {
    const firstExec = executions[outcome.id]?.[0];
    setLoading(true);
    setLiveOutput((previous) => ({ ...previous, [outcome.id]: "" }));
    if (firstExec) updateExecution(outcome.id, firstExec.id, "working");
    try {
      const reply = await window.api.runOpenCode({
        outcomeId: outcome.id,
        projectPath: outcome.projectPath,
        prompt: buildSpecificationPrompt(outcome),
      });
      const confidence = Number.parseInt(reply.match(/CONFIDENCE\s*:\s*(\d{1,3})/i)?.[1] ?? "95", 10);
      const readyToImplement = confidence >= 95;
      setOutcomes((previous) => previous.map((item) => item.id === outcome.id ? {
        ...item,
        status: readyToImplement ? "Ready to implement" : "Needs input",
        specification: { ...(item.specification ?? { links: [] }), status: "ready", plan: reply, confidence },
        messages: [...item.messages, { role: "assistant", content: reply }],
        events: [...item.events, makeEvent("specification.ready", readyToImplement ? `Specification ready with ${confidence}% confidence; starting implementation` : `Specification is only ${confidence}% confident and needs clarification`)],
      } : item));
      if (firstExec) updateExecution(outcome.id, firstExec.id, "done");
      if (readyToImplement) window.setTimeout(() => void runImplementation(outcome.id, "Implement the approved specification completely. Work through every acceptance criterion."), 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOutcomes((previous) => previous.map((item) => item.id === outcome.id ? {
        ...item,
        status: "Needs input",
        events: [...item.events, makeEvent("specification.failed", message)],
      } : item));
      if (firstExec) updateExecution(outcome.id, firstExec.id, "attention");
    } finally {
      setLoading(false);
    }
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
      setOutcomes((previous) => previous.map((item) => item.id === outcomeId ? ({ ...item, messages: [...updatedMessages, { role: "assistant", content: reply }], status: "Validating", events: [...item.events, makeEvent("implementation.completed", "Implementation completed; preparing browser validation plan")] }) : item));
      const review = await window.api.getOutcomeReview(prepared.worktreePath);
      let validationSpec: Outcome["validationSpec"];
      try {
        validationSpec = await window.api.planValidation({ outcomeId, worktreePath: prepared.worktreePath, goal: outcome.goal, acceptanceCriteria: outcome.acceptanceCriteria, diff: review.diff });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLiveOutput((previous) => ({ ...previous, [outcomeId]: `${previous[outcomeId] ?? ""}\nValidation planner fallback: ${message}\n` }));
      }
      setOutcomes((previous) => previous.map((item) => item.id === outcomeId ? {
        ...item,
        prepared,
        validationSpec,
        review,
        status: "Ready to validate",
        events: [...item.events, makeEvent("validation.plan_ready", "Browser validation plan is ready for your review")],
      } : item));
      if (firstExec) updateExecution(outcomeId, firstExec.id, "done");
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

  const runBrowserValidation = async (outcome: Outcome) => {
    if (!outcome.prepared) return;
    setLoading(true);
    setOutcomes((previous) => previous.map((item) => item.id === outcome.id ? ({ ...item, status: "Validating", events: [...item.events, makeEvent("validation.started", "Running approved browser validation plan")] }) : item));
    try {
      const validation = await window.api.validateOutcome(outcome.prepared.worktreePath);
      const visualValidation = await window.api.visualValidateOutcome({ worktreePath: outcome.prepared.worktreePath, outcomeId: outcome.id, goal: outcome.goal, acceptanceCriteria: outcome.acceptanceCriteria, spec: outcome.validationSpec });
      const passed = validation.every((result) => result.passed) && (!visualValidation.supported || visualValidation.passed);
      setOutcomes((previous) => previous.map((item) => item.id === outcome.id ? ({ ...item, validation, visualValidation, status: passed ? "Ready to review" : "Needs input", events: [...item.events, makeEvent("validation.completed", passed ? "Validation passed; evidence is ready for review" : "Validation failed; inspect evidence and retry") ] }) : item));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOutcomes((previous) => previous.map((item) => item.id === outcome.id ? ({ ...item, status: "Needs input", events: [...item.events, makeEvent("validation.failed", message)] }) : item));
    } finally { setLoading(false); }
  };

  const approveOutcome = async (outcome: Outcome) => {
    if (!outcome.prepared) return;
    try {
      await window.api.approveOutcome(outcome.prepared, outcome.name);
      setOutcomes((previous) => previous.map((item) => item.id === outcome.id ? {
        ...item,
        status: "Applied",
        events: [...item.events, makeEvent("review.approved", outcome.prepared!.sourcePath === outcome.prepared!.worktreePath ? "Changes were made directly in the selected project folder" : "Changes committed and applied to the selected project's current branch")],
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
    setDecisionErrors((previous) => ({ ...previous, [outcome.id]: "" }));
    setQuestionAnswers((previous) => {
      const answers = [...(previous[outcome.id] ?? [])];
      const current = answers[questionIndex] ?? [];
      answers[questionIndex] = multiple
        ? (current.includes(label) ? current.filter((item) => item !== label) : [...current, label])
        : [label];
      return { ...previous, [outcome.id]: answers };
    });
  };

  const updateCustomQuestionAnswer = (outcome: Outcome, questionIndex: number, value: string, multiple: boolean) => {
    const previousCustomAnswer = customQuestionAnswers[outcome.id]?.[questionIndex] ?? "";
    setCustomQuestionAnswers((previous) => {
      const answers = [...(previous[outcome.id] ?? [])];
      answers[questionIndex] = value;
      return { ...previous, [outcome.id]: answers };
    });
    setQuestionAnswers((previous) => {
      const answers = [...(previous[outcome.id] ?? [])];
      const current = (answers[questionIndex] ?? []).filter((answer) => answer !== previousCustomAnswer);
      answers[questionIndex] = value ? (multiple ? [...current, value] : [value]) : current;
      return { ...previous, [outcome.id]: answers };
    });
  };

  const submitQuestionAnswers = async (outcome: Outcome, providedAnswers?: string[][]) => {
    if (!outcome.question) return;
    const answers = providedAnswers ?? questionAnswers[outcome.id] ?? [];
    if (answers.length !== outcome.question.questions.length || answers.some((answer) => answer.length === 0)) return;
    try {
      setSubmittingDecisionFor(outcome.id);
      setDecisionErrors((previous) => ({ ...previous, [outcome.id]: "" }));
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
      if (message.includes("no longer active")) {
        const decision = answers.map((answer) => answer.join(", ")).join(" | ");
        setOutcomes((previous) => previous.map((item) => item.id === outcome.id ? {
          ...item,
          status: "Working",
          question: undefined,
          messages: [...item.messages, { role: "user", content: `Decision: ${decision}` }],
          events: [...item.events, makeEvent("agent.decision_restarted", "The previous agent session ended; starting a new session with your decision")],
        } : item));
        void runImplementation(outcome.id, `Continue the existing outcome from its current worktree. The previous agent session stopped while awaiting a decision. The user's decision is: ${decision}`);
        return;
      }
      setDecisionErrors((previous) => ({ ...previous, [outcome.id]: message }));
      setOutcomes((previous) => previous.map((item) => item.id === outcome.id ? {
        ...item,
        events: [...item.events, makeEvent("agent.answer_failed", message)],
      } : item));
    } finally {
      setSubmittingDecisionFor(null);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || selectedIndex === null) return;

    const outcome = outcomes[selectedIndex];
    const outcomeId = outcome.id;
    const content = input.trim();

    if (outcome.question) {
      return;
    }

    if (!outcome.projectPath) {
      setRightSidebar("spec");
      return;
    }

    setInput("");

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
  const toggleRightSidebar = (view: RightSidebarView) => setRightSidebar((current) => current === view ? null : view);

  const updateSidebarScrollIntent = () => {
    const sidebar = sidebarScrollRef.current;
    if (!sidebar) return;
    sidebarAtLatestRef.current = sidebar.scrollHeight - sidebar.scrollTop - sidebar.clientHeight < 40;
  };

  useEffect(() => {
    sidebarAtLatestRef.current = true;
  }, [rightSidebar, currentOutcome?.id]);

  useEffect(() => {
    if (!sidebarAtLatestRef.current || (rightSidebar !== "conversation" && rightSidebar !== "timeline")) return;
    const frame = requestAnimationFrame(() => {
      const sidebar = sidebarScrollRef.current;
      if (sidebar) sidebar.scrollTop = sidebar.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [rightSidebar, currentOutcome?.id, currentOutcome?.events.length, currentLiveOutput]);

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
        <div className="flex flex-col relative ml-[50px]" style={{ width: `${panelWidth}px` }}>
          <div className="flex-1 rounded-xl border border-ctp-surface0 bg-ctp-mantle relative overflow-hidden">
            <div className="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-ctp-surface0">
              <span className="text-sm font-medium text-ctp-overlay0">Outcomes</span>
              <Tooltip text="Create new outcome">
                <button onClick={() => { setSelectedIndex(null); beginSpecificationFlow(); }} className="w-6 h-6 flex items-center justify-center rounded-md text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0 transition-colors">
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
            className="absolute top-0 right-[-4.5px] w-1 h-full cursor-col-resize hover:bg-ctp-surface0 active:bg-ctp-mauve transition-colors"
          />
        </div>

        <div className="flex-1 flex flex-col rounded-xl border border-ctp-surface0 bg-ctp-mantle ml-[5px] mr-[5px] overflow-hidden">
          {currentOutcome ? (
            <>
                <div className="border-b border-ctp-surface0 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-medium text-ctp-text truncate">{currentOutcome.name}</h2>
                    <div className="flex shrink-0 items-center gap-1">
                      <Tooltip text="Live output"><button aria-label="Live output" onClick={() => toggleRightSidebar("conversation")} className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${rightSidebar === "conversation" ? "bg-ctp-mauve text-ctp-crust" : "text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0"}`}><svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="m5 7 4 5-4 5m6 0h8M4 4h16v16H4z" /></svg></button></Tooltip>
                      <Tooltip text="Outcome spec"><button aria-label="Outcome spec" onClick={() => toggleRightSidebar("spec")} className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${rightSidebar === "spec" ? "bg-ctp-mauve text-ctp-crust" : "text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0"}`}><svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M9 8h.01M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 01-2-2z" /></svg></button></Tooltip>
                      <Tooltip text="Review"><button aria-label="Review" onClick={() => toggleRightSidebar("review")} className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${rightSidebar === "review" ? "bg-ctp-mauve text-ctp-crust" : "text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0"}`}><svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="m8.5 12 2.25 2.25L15.5 9.5" /></svg></button></Tooltip>
                      <Tooltip text="Timeline"><button aria-label="Timeline" onClick={() => toggleRightSidebar("timeline")} className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${rightSidebar === "timeline" ? "bg-ctp-mauve text-ctp-crust" : "text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0"}`}><svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button></Tooltip>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto select-text">
                <div className="hidden px-4 py-3 border-b border-ctp-surface0">
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
                  <div className="hidden px-4 py-3 border-b border-ctp-surface0 space-y-2">
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
                  <div className="hidden px-4 py-3 border-b border-ctp-surface0">
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
                  <div className="hidden px-4 py-3 border-b border-ctp-surface0 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] font-medium text-ctp-overlay0 uppercase tracking-wider">Review</div>
                      {currentOutcome.status === "Ready to review" && currentOutcome.prepared && (
                        <div className="flex gap-2">
                          <button onClick={() => void approveOutcome(currentOutcome)} className="text-xs px-2 py-1 rounded bg-ctp-green text-ctp-crust font-medium hover:opacity-80">{currentOutcome.prepared.sourcePath === currentOutcome.prepared.worktreePath ? "Mark as applied" : "Apply changes"}</button>
                          {currentOutcome.prepared.sourcePath !== currentOutcome.prepared.worktreePath && <button onClick={() => void discardOutcomeChanges(currentOutcome)} className="text-xs px-2 py-1 rounded bg-ctp-surface0 text-ctp-text hover:bg-ctp-surface1">Discard</button>}
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
                        {currentOutcome.visualValidation.scenarios.map((scenario) => (
                          <div key={scenario.name} className="mt-2 rounded border border-ctp-surface0 p-2">
                            <div className={scenario.passed ? "text-ctp-green" : "text-ctp-red"}>{scenario.passed ? "✓" : "×"} {scenario.name}</div>
                            <div className="mt-1 text-ctp-overlay0">{scenario.assertions.join(" · ")}</div>
                          </div>
                        ))}
                        {currentOutcome.visualValidation.artifacts.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{currentOutcome.visualValidation.artifacts.map((artifact) => <button key={artifact.id} onClick={() => void window.api.getValidationArtifact({ outcomeId: currentOutcome.id, artifactId: artifact.id }).then((result) => setEvidence({ ...result, label: artifact.label }))} className="rounded bg-ctp-surface0 px-2 py-1 text-xs text-ctp-text hover:bg-ctp-surface1">View {artifact.label}</button>)}</div>}
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

                {currentOutcome.events.length > 0 && (
                  <div className="hidden px-4 py-3 border-b border-ctp-surface0">
                    <div className="text-[11px] font-medium text-ctp-overlay0 uppercase tracking-wider mb-1.5">Timeline</div>
                    <div className="space-y-1.5">
                      {currentOutcome.events.map((ev) => (
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
                  {currentMessages.length === 0 && currentQueue.length === 0 ? (
                    <div className="text-sm text-ctp-overlay0">Start working on this task.</div>
                  ) : (
                    <div className="space-y-4">
                      {currentMessages.map((msg, i) => (
                        <div key={i} className={`py-1 px-2 -mx-2 rounded ${msg.role === "user" ? "bg-white/[0.03]" : ""}`}>
                          {msg.role === "user" ? (
                            <div className="text-sm text-ctp-text leading-relaxed whitespace-pre-wrap font-mono">
                              <span className="text-ctp-mauve mr-2 select-none">&gt;</span>
                              {msg.content}
                            </div>
                          ) : (
                            <Markdown content={msg.content} />
                          )}
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

              <div className="p-3">
                <div className="relative">
                  {currentOutcome.question && (
                    <div className="absolute bottom-full left-1/2 z-30 mb-[22px] w-[90%] max-h-[42vh] -translate-x-1/2 overflow-y-auto rounded-2xl border border-ctp-yellow/40 bg-ctp-mantle p-4 shadow-2xl shadow-ctp-crust/50 pointer-events-auto select-text">
                      <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-ctp-yellow">
                        <span className="h-2 w-2 rounded-full bg-ctp-yellow animate-pulse" />
                        OpenCode needs your decision
                      </div>
                      <div className="space-y-3">
                        {currentOutcome.question.questions.map((question, questionIndex) => {
                          const selected = questionAnswers[currentOutcome.id]?.[questionIndex] ?? [];
                          const customAnswer = customQuestionAnswers[currentOutcome.id]?.[questionIndex] ?? "";
                          return (
                            <div key={`${currentOutcome.question!.requestId}-${questionIndex}`} className="space-y-2">
                              <div className="text-sm text-ctp-text">{question.question}</div>
                              <div className="space-y-1.5">
                                {question.options.map((option) => {
                                  const active = selected.includes(option.label);
                                  return (
                                    <button
                                      type="button"
                                      key={option.label}
                                      onClick={() => toggleQuestionAnswer(currentOutcome, questionIndex, option.label, Boolean(question.multiple))}
                                      className={`block w-full rounded-xl border px-3 py-2 text-left text-xs transition-colors ${active ? "border-ctp-mauve bg-ctp-mauve/15 text-ctp-text" : "border-ctp-surface0 bg-ctp-base text-ctp-subtext1 hover:bg-ctp-surface0"}`}
                                    >
                                      <div className="font-medium">{option.label}</div>
                                      {option.description && <div className="mt-0.5 text-ctp-overlay0">{option.description}</div>}
                                    </button>
                                  );
                                })}
                                <label className={`block w-full rounded-xl border px-3 py-2 text-left text-xs transition-colors ${customAnswer && selected.includes(customAnswer) ? "border-ctp-mauve bg-ctp-mauve/15 text-ctp-text" : "border-ctp-surface0 bg-ctp-base text-ctp-subtext1 hover:bg-ctp-surface0"}`}>
                                  <div className="mb-1 font-medium">Type your answer</div>
                                  <input
                                    type="text"
                                    value={customAnswer}
                                    onChange={(event) => updateCustomQuestionAnswer(currentOutcome, questionIndex, event.target.value, Boolean(question.multiple))}
                                    placeholder="Write a custom answer…"
                                    className="w-full rounded-lg border border-ctp-surface0 bg-ctp-mantle px-2 py-1.5 text-xs text-ctp-text placeholder-ctp-overlay0 focus:border-ctp-mauve focus:outline-none"
                                  />
                                </label>
                              </div>
                            </div>
                          );
                        })}
                    {decisionErrors[currentOutcome.id] && (
                      <div className="rounded-xl border border-ctp-red/40 bg-ctp-red/10 px-3 py-2 text-xs text-ctp-red">
                        {decisionErrors[currentOutcome.id]}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => void submitQuestionAnswers(currentOutcome)}
                      disabled={submittingDecisionFor === currentOutcome.id || (questionAnswers[currentOutcome.id] ?? []).length !== currentOutcome.question.questions.length || (questionAnswers[currentOutcome.id] ?? []).some((answer) => answer.length === 0)}
                      className="inline-flex h-8 items-center justify-center rounded-xl bg-ctp-mauve px-3 text-xs font-medium text-ctp-crust transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {submittingDecisionFor === currentOutcome.id ? "Sending decision..." : "Continue with decision"}
                        </button>
                      </div>
                    </div>
                  )}
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                    disabled={Boolean(currentOutcome.question)}
                    placeholder={currentOutcome.question ? "Choose an option above to continue..." : loading ? "Message will be queued..." : "Type a message..."}
                    className="w-full px-3 py-2 pr-10 rounded-lg bg-ctp-base border border-ctp-surface0 text-ctp-text text-sm placeholder-ctp-overlay0 focus:outline-none focus:border-ctp-mauve transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || Boolean(currentOutcome.question)}
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
            <div className="flex-1 flex min-h-0 flex-col select-text">
              <div className="border-b border-ctp-surface0 px-4 py-3"><h2 className="text-lg font-medium text-ctp-text">New outcome</h2><div className="mt-1 text-xs text-ctp-overlay0">Specification flow</div></div>
              <div className="flex-1 overflow-y-auto px-4 py-5">
                <div className="mx-auto max-w-2xl space-y-4">
                  {specificationMessages.map((message, index) => <div key={index} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${message.role === "assistant" ? "bg-ctp-surface0 text-ctp-text" : "ml-auto bg-ctp-mauve/15 text-ctp-text"}`}>{message.content}</div>)}
                  {specificationStep === "project" && <div className="max-w-[85%] rounded-2xl border border-ctp-surface0 bg-ctp-base p-4"><div className="mb-2 text-xs text-ctp-subtext1">{newOutcomeProjectPath || "No folder selected"}</div><button onClick={() => void chooseProjectForNewOutcome()} className="rounded-xl bg-ctp-surface0 px-3 py-2 text-sm hover:bg-ctp-surface1">Choose project</button></div>}
                </div>
              </div>
              <div className="p-3">
                <div className="mx-auto flex max-w-2xl gap-2">
                  {specificationStep !== "project" && <textarea autoFocus value={specificationInput} onChange={(e) => setSpecificationInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); advanceSpecificationFlow(); } }} rows={specificationStep === "criteria" || specificationStep === "links" ? 3 : 2} placeholder={specificationStep === "constraints" || specificationStep === "links" ? "Optional — you can leave this empty" : "Write your answer..."} className="min-h-11 flex-1 resize-none rounded-xl border border-ctp-surface0 bg-ctp-base px-3 py-2 text-sm text-ctp-text placeholder-ctp-overlay0 focus:border-ctp-mauve focus:outline-none" />}
                  {specificationStep === "project" ? null : <button onClick={advanceSpecificationFlow} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ctp-mauve text-ctp-crust disabled:opacity-40" disabled={specificationStep !== "constraints" && specificationStep !== "links" && !specificationInput.trim()}><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" /></svg></button>}
                </div>
                <button onClick={resetSpecificationFlow} className="mx-auto mt-2 block text-xs text-ctp-overlay0 hover:text-ctp-text">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-ctp-overlay0 text-sm">Select an outcome</span>
            </div>
          )}
        </div>

        {currentOutcome && rightSidebar && (
          <aside className="shrink-0 rounded-xl border border-ctp-surface0 bg-ctp-mantle mr-[5px] flex flex-col relative" style={{ width: rightWidth }}>
            <div
              onMouseDown={onRightMouseDown}
              className="absolute top-0 left-[-4.5px] w-1 h-full cursor-col-resize hover:bg-ctp-surface0 active:bg-ctp-mauve transition-colors"
            />
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-3 border-b border-ctp-surface0">
              <span className="text-sm font-medium text-ctp-text">{rightSidebar === "conversation" ? "Live output" : rightSidebar === "spec" ? "Outcome spec" : rightSidebar === "review" ? "Review" : "Timeline"}</span>
              <button aria-label="Close sidebar" onClick={() => setRightSidebar(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ctp-overlay0 transition-colors hover:bg-ctp-surface0 hover:text-ctp-text">×</button>
            </div>
            <div ref={sidebarScrollRef} onScroll={updateSidebarScrollIntent} className="flex-1 overflow-y-auto select-text p-4">
              {rightSidebar === "conversation" && (
                currentLiveOutput ? (
                  <pre className="w-full max-w-full whitespace-pre-wrap break-words rounded-lg border border-ctp-surface0 bg-ctp-base p-3 text-xs leading-relaxed text-ctp-subtext1 font-mono">{currentLiveOutput}</pre>
                ) : (
                  <div className="text-sm text-ctp-overlay0">Live output will appear when OpenCode starts working.</div>
                )
              )}
              {rightSidebar === "spec" && <div className="space-y-5">
                <div><div className="text-[11px] uppercase tracking-wider text-ctp-overlay0 mb-1">Project</div><div className="text-xs text-ctp-subtext1 break-words">{currentOutcome.projectPath || "No project selected"}</div><button onClick={() => void chooseProjectForOutcome(currentOutcome.id)} className="mt-2 text-xs px-2 py-1 rounded bg-ctp-surface0 hover:bg-ctp-surface1">{currentOutcome.projectPath ? "Change project" : "Choose project"}</button></div>
                <div><div className="text-[11px] uppercase tracking-wider text-ctp-overlay0 mb-1">Goal</div><div className="text-sm whitespace-pre-wrap">{currentOutcome.goal || currentOutcome.name}</div></div>
                {currentOutcome.specification && <div><div className="text-[11px] uppercase tracking-wider text-ctp-overlay0 mb-1">Specification</div>{currentOutcome.specification.status === "analyzing" ? <div><div className="text-sm text-ctp-blue animate-pulse">Inspecting project and preparing a plan…</div><button onClick={() => void runSpecification(currentOutcome)} className="mt-2 rounded-xl bg-ctp-surface0 px-3 py-2 text-xs hover:bg-ctp-surface1">Resume analysis</button></div> : <><div className="mb-2 text-xs text-ctp-mauve">Confidence: {currentOutcome.specification.confidence}%</div><div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-ctp-surface0 bg-ctp-base p-3 text-xs text-ctp-subtext1">{currentOutcome.specification.plan}</div><button onClick={() => void runImplementation(currentOutcome.id, "Implement the approved specification completely. Work through every acceptance criterion.")} className="mt-3 rounded-xl bg-ctp-mauve px-3 py-2 text-xs font-medium text-ctp-crust hover:opacity-90">Start implementation</button></>}</div>}
                {currentOutcome.constraints && <div><div className="text-[11px] uppercase tracking-wider text-ctp-overlay0 mb-1">Constraints</div><div className="text-sm whitespace-pre-wrap">{currentOutcome.constraints}</div></div>}
                <div><div className="text-[11px] uppercase tracking-wider text-ctp-overlay0 mb-1">Acceptance criteria</div>{currentOutcome.acceptanceCriteria.length ? <ul className="space-y-2">{currentOutcome.acceptanceCriteria.map((criterion, index) => <li key={index} className="text-sm">— {criterion}</li>)}</ul> : <div className="text-sm text-ctp-overlay0">No criteria yet</div>}</div>
                {executionsList.length > 0 && <div><div className="text-[11px] uppercase tracking-wider text-ctp-overlay0 mb-1">Agents</div>{executionsList.map((execution) => <div key={execution.id} className="flex gap-2 text-sm"><span>{execution.name}</span><span className={EXEC_STATUS_COLOR[execution.status]}>{EXEC_STATUS_TEXT[execution.status]}</span></div>)}</div>}
              </div>}
              {rightSidebar === "timeline" && <div className="space-y-3">{currentOutcome.events.map((event) => <div key={event.id} className="flex gap-2 text-xs"><span className="shrink-0 text-ctp-overlay0 font-mono">{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><span className="text-ctp-subtext1">{event.message}</span></div>)}</div>}
              {rightSidebar === "review" && <div className="space-y-3">
                {currentOutcome.status === "Ready to validate" && currentOutcome.prepared && <div className="rounded border border-ctp-yellow/40 bg-ctp-base p-3"><div className="text-xs font-medium text-ctp-yellow">Validation plan ready</div>{currentOutcome.validationSpec ? <div className="mt-2 space-y-2">{currentOutcome.validationSpec.scenarios.map((scenario, index) => <details key={scenario.name} className="rounded border border-ctp-surface0 p-2"><summary className="cursor-pointer text-xs text-ctp-text">{index + 1}. {scenario.name}</summary><div className="mt-2 text-[11px] text-ctp-overlay0">Route: {scenario.path}</div><div className="mt-1 text-[11px] text-ctp-subtext1">{scenario.actions.map((action) => action.type + (action.selector ? ` ${action.selector}` : action.value ? ` ${action.value}` : "")).join(" → ")}</div><div className="mt-1 text-[11px] text-ctp-overlay0">{scenario.assertions.join(" · ")}</div></details>)}</div> : <div className="mt-2 text-xs text-ctp-overlay0">Planner was unavailable; Akodo will use its safe fallback plan.</div>}<button disabled={loading} onClick={() => void runBrowserValidation(currentOutcome)} className="mt-3 rounded bg-ctp-yellow px-3 py-1.5 text-xs font-medium text-ctp-crust disabled:opacity-60">{loading ? "Running validation…" : "Run validation"}</button></div>}
                {currentOutcome.status === "Ready to review" && currentOutcome.prepared && <div className="flex gap-2"><button onClick={() => void approveOutcome(currentOutcome)} className="text-xs px-2 py-1 rounded bg-ctp-green text-ctp-crust">{currentOutcome.prepared.sourcePath === currentOutcome.prepared.worktreePath ? "Mark as applied" : "Apply changes"}</button>{currentOutcome.prepared.sourcePath !== currentOutcome.prepared.worktreePath && <button onClick={() => void discardOutcomeChanges(currentOutcome)} className="text-xs px-2 py-1 rounded bg-ctp-surface0">Discard</button>}</div>}
                {currentOutcome.validation?.map((check) => <details key={check.command} className="rounded border border-ctp-surface0 p-2"><summary className={`text-xs cursor-pointer ${check.passed ? "text-ctp-green" : "text-ctp-red"}`}>{check.passed ? "✓" : "×"} {check.command}</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-ctp-subtext1">{check.output}</pre></details>)}
                {currentOutcome.visualValidation && <div className={`rounded border p-2 text-xs ${currentOutcome.visualValidation.passed ? "border-ctp-green/40" : "border-ctp-red/40"}`}><div className={currentOutcome.visualValidation.passed ? "text-ctp-green" : "text-ctp-red"}>{currentOutcome.visualValidation.passed ? "✓" : "×"} Browser validation</div><div className="mt-1 text-ctp-subtext1">{currentOutcome.visualValidation.message}</div></div>}
                {currentOutcome.review && <details className="rounded border border-ctp-surface0 p-2"><summary className="text-xs cursor-pointer">Changed files ({currentOutcome.review.changedFiles.length})</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-ctp-subtext1">{currentOutcome.review.summary}{"\n"}{currentOutcome.review.changedFiles.join("\n")}{"\n\n"}{currentOutcome.review.diff}</pre></details>}
                {!currentOutcome.validation && !currentOutcome.visualValidation && !currentOutcome.review && <div className="text-sm text-ctp-overlay0">Review appears after an agent run.</div>}
              </div>}
            </div>
            </div>
          </aside>
        )}
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {evidence && <div className="fixed inset-0 z-[350] flex items-center justify-center bg-black/70 p-8" onClick={() => setEvidence(null)}><div className="max-h-full max-w-5xl overflow-auto rounded-xl border border-ctp-surface0 bg-ctp-mantle p-4" onClick={(event) => event.stopPropagation()}><div className="mb-3 flex items-center justify-between gap-6"><span className="text-sm text-ctp-text">{evidence.label}</span><button onClick={() => setEvidence(null)} className="text-ctp-overlay0 hover:text-ctp-text">Close</button></div>{evidence.type === "video" ? <video controls autoPlay src={evidence.dataUrl} className="max-h-[75vh] max-w-full" /> : evidence.type === "screenshot" ? <img src={evidence.dataUrl} alt={evidence.label} className="max-h-[75vh] max-w-full" /> : <a download="validation-trace.zip" href={evidence.dataUrl} className="text-ctp-blue underline">Download Playwright trace</a>}</div></div>}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { label: "Rename", onClick: () => setRenameIndex(contextMenu.index) },
            { label: "Delete", onClick: () => setDeleteIndex(contextMenu.index), danger: true },
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
      {deleteIndex !== null && outcomes[deleteIndex] && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDeleteIndex(null)}>
          <div className="w-[380px] rounded-xl border border-ctp-surface0 bg-ctp-mantle p-5" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-sm font-medium text-ctp-text">Delete outcome?</h2>
            <p className="mt-2 text-sm text-ctp-subtext1">This permanently removes <span className="font-medium text-ctp-text">{outcomes[deleteIndex].name}</span> and its local conversation history from Akodo.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDeleteIndex(null)} className="rounded-lg px-3 py-1.5 text-sm text-ctp-overlay1 transition-colors hover:bg-ctp-surface0 hover:text-ctp-text">Cancel</button>
              <button onClick={() => { deleteOutcome(deleteIndex); setDeleteIndex(null); }} className="rounded-lg bg-ctp-red px-3 py-1.5 text-sm font-medium text-ctp-crust transition-opacity hover:opacity-90">Delete</button>
            </div>
          </div>
        </div>
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
    case "Ready to validate": return "validate";
    default: return status.toLowerCase();
  }
}

function buildOpenCodePrompt(outcome: Outcome, instruction: string): string {
  const criteria = outcome.acceptanceCriteria.length > 0
    ? outcome.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n")
    : "- No explicit acceptance criteria supplied";
  const constraints = outcome.constraints || "None supplied";

  return `You are implementing an Akodo outcome in the current local project.\n\nOutcome: ${outcome.name}\nGoal: ${outcome.goal || outcome.name}\nConstraints:\n${constraints}\nAcceptance criteria:\n${criteria}\n\nImplementation instruction:\n${instruction}\n\nScope boundary: work only inside the current outcome workspace. Do not read, modify, create, or delete files outside this selected project folder. Do not navigate to parent folders, the user home, or other projects.\n\nBrowser validation: when the outcome changes a web UI or has UI-related acceptance criteria, you have Playwright available through Node. Start the local web preview, use Playwright to exercise the concrete user flows implied by the acceptance criteria, verify the expected state at desktop and mobile viewport sizes, and inspect browser console errors. Do not merely write a browser test; actually run it. Keep temporary validation scripts out of the final diff.\n\nInspect the project first, implement only what is needed, run relevant local checks, and summarize the changes, browser scenarios, and commands you ran. Do not commit, push, or deploy.`;
}

function buildSpecificationPrompt(outcome: Outcome): string {
  const links = outcome.specification?.links.length ? outcome.specification.links.map((link) => `- ${link}`).join("\n") : "- No external links were provided";
  return `You are the specification agent for an Akodo outcome. Work in read-only planning mode: inspect the selected project folder and relevant files, but do not modify files, run destructive commands, commit, push, or deploy.\n\nOutcome: ${outcome.name}\nGoal: ${outcome.goal}\nConstraints:\n${outcome.constraints || "None supplied"}\nAcceptance criteria:\n${outcome.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n") || "- None supplied"}\nReference links:\n${links}\n\nUse a link only when it is accessible in your environment; clearly state if a reference could not be read. Inspect the codebase to identify the affected areas, dependencies, risks, test approach, and a concrete implementation plan. If any answer is necessary to deliver the outcome reliably, ask concise structured questions with the question tool and wait for the user’s decision. Do not guess material product or technical decisions. When you have enough information, return a final specification with these headings: Scope, Plan, Validation, Risks. End with a separate line in the exact format CONFIDENCE: NN, where NN is your honest confidence percentage that the task can be implemented successfully.`;
}

export default App;
