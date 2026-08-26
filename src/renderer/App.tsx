import { useRef, useCallback, useEffect, useState } from "react";
import { TopBar } from "./components/TopBar";
import { Tooltip } from "./components/Tooltip";
import { SettingsModal } from "./components/SettingsModal";
import { ContextMenu } from "./components/ContextMenu";
import { RenameModal } from "./components/RenameModal";

interface Agent {
  id: string;
  name: string;
}

function loadAgents(): Agent[] {
  const saved = localStorage.getItem("akodo-agents");
  return saved ? JSON.parse(saved) : [];
}

function saveAgents(agents: Agent[]) {
  localStorage.setItem("akodo-agents", JSON.stringify(agents));
}

function loadMessages(): Record<string, { role: string; content: string }[]> {
  const saved = localStorage.getItem("akodo-messages");
  return saved ? JSON.parse(saved) : {};
}

function saveMessages(messages: Record<string, { role: string; content: string }[]>) {
  localStorage.setItem("akodo-messages", JSON.stringify(messages));
}

function App() {
  const [panelWidth, setPanelWidth] = useState(50);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>(loadAgents);
  const [messages, setMessages] = useState<Record<string, { role: string; content: string }[]>>(loadMessages);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [renameIndex, setRenameIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<{ id: string; content: string }[]>([]);
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const agentCountRef = parseInt(localStorage.getItem("akodo-agent-count") ?? "0", 10);
  const agentCount = useRef(agentCountRef);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const loadingRef = useRef(false);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

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

  const createAgent = () => {
    agentCount.current += 1;
    localStorage.setItem("akodo-agent-count", agentCount.current.toString());
    const id = crypto.randomUUID();
    const updated = [...agents, { id, name: "New Orchestrator Agent" }];
    setAgents(updated);
    saveAgents(updated);
  };

  const deleteAgent = (index: number) => {
    const agentId = agents[index].id;
    const updated = agents.filter((_, i) => i !== index);
    setAgents(updated);
    saveAgents(updated);
    setMessages((prev) => {
      const next = { ...prev };
      delete next[agentId];
      return next;
    });
    if (selectedIndex === index) setSelectedIndex(null);
    else if (selectedIndex !== null && selectedIndex > index) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const renameAgent = (index: number, newName: string) => {
    const updated = agents.map((a, i) => (i === index ? { ...a, name: newName } : a));
    setAgents(updated);
    saveAgents(updated);
  };

  const processQueue = useCallback(async (agentId: string, history: { role: string; content: string }[]) => {
    setQueue((prev) => {
      if (prev.length === 0) return prev;
      const [next, ...rest] = prev;

      const userMsg = { role: "user", content: next.content };
      const updatedHistory = [...history, userMsg];

      setMessages((p) => ({ ...p, [agentId]: updatedHistory }));

      (async () => {
        setLoading(true);
        try {
          const model = localStorage.getItem("akodo-default-model") ?? "big-pickle";
          const apiKey = localStorage.getItem("akodo-api-key") ?? "";
          const reply = await window.api.chatSend([
            { role: "system", content: "You are a helpful AI orchestrator agent." },
            ...updatedHistory,
          ], model, apiKey);
          setMessages((p) => ({
            ...p,
            [agentId]: [...(p[agentId] || []), { role: "assistant", content: reply }],
          }));
          const finalMessages = [...updatedHistory, { role: "assistant", content: reply }];
          setLoading(false);
          setTimeout(() => processQueue(agentId, finalMessages), 0);
        } catch (err) {
          setMessages((p) => ({
            ...p,
            [agentId]: [...(p[agentId] || []), { role: "assistant", content: `Error: ${err}` }],
          }));
          const finalMessages = [...updatedHistory, { role: "assistant", content: `Error: ${err}` }];
          setLoading(false);
          setTimeout(() => processQueue(agentId, finalMessages), 0);
        }
      })();

      return rest;
    });
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || selectedIndex === null) return;

    const agentId = agents[selectedIndex].id;
    const content = input.trim();
    setInput("");

    if (loadingRef.current) {
      setQueue((prev) => [...prev, { id: crypto.randomUUID(), content }]);
      return;
    }

    const userMsg = { role: "user", content };
    const currentMessages = messages[agentId] || [];
    const updatedMessages = [...currentMessages, userMsg];

    setMessages((prev) => ({ ...prev, [agentId]: updatedMessages }));
    setLoading(true);

    try {
      const model = localStorage.getItem("akodo-default-model") ?? "big-pickle";
      const apiKey = localStorage.getItem("akodo-api-key") ?? "";
      const reply = await window.api.chatSend([
        { role: "system", content: "You are a helpful AI orchestrator agent." },
        ...updatedMessages,
      ], model, apiKey);
      const finalMessages = [...updatedMessages, { role: "assistant", content: reply }];
      setMessages((prev) => ({
        ...prev,
        [agentId]: finalMessages,
      }));
      setLoading(false);
      setTimeout(() => processQueue(agentId, finalMessages), 0);
    } catch (err) {
      const finalMessages = [...updatedMessages, { role: "assistant", content: `Error: ${err}` }];
      setMessages((prev) => ({
        ...prev,
        [agentId]: finalMessages,
      }));
      setLoading(false);
      setTimeout(() => processQueue(agentId, finalMessages), 0);
    }
  };

  const editQueueItem = (id: string) => {
    const item = queue.find((q) => q.id === id);
    if (item) {
      setInput(item.content);
      setQueue((prev) => prev.filter((q) => q.id !== id));
      setEditingQueueId(null);
    }
  };

  const currentMessages = selectedIndex !== null ? messages[agents[selectedIndex].id] || [] : [];
  const currentQueue = queue;

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
          <div className="flex-1 rounded-xl border border-ctp-surface0 bg-ctp-mantle relative">
            <span className="absolute top-1.5 left-2 text-sm font-medium text-ctp-overlay0">Orchestrator Agents</span>
            <div className="absolute top-1.5 right-2">
              <Tooltip text="Create new Orchestrator Agent">
                <button onClick={createAgent} className="w-6 h-6 flex items-center justify-center rounded-md text-ctp-overlay0 hover:text-ctp-text hover:bg-ctp-surface0 transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              </Tooltip>
            </div>
            <div className="mt-10 px-2 space-y-1">
              {agents.map((agent, i) => (
                <div
                  key={agent.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, index: i });
                  }}
                  className={`flex items-center px-2 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${selectedIndex === i ? "bg-ctp-surface0 text-ctp-text" : "text-ctp-text hover:bg-ctp-surface0"}`}
                  onClick={() => setSelectedIndex(i)}
                >
                  <span className="truncate">{agent.name}</span>
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
          {selectedIndex !== null ? (
            <>
              <div className="flex-1 p-4 overflow-y-auto select-text">
                {currentMessages.length === 0 && currentQueue.length === 0 ? (
                  <h2 className="text-lg font-medium text-ctp-text">{agents[selectedIndex].name}</h2>
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
              <div className="p-3">
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
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-ctp-overlay0 text-sm">Select an agent</span>
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
            { label: "Delete", onClick: () => deleteAgent(contextMenu.index), danger: true },
          ]}
        />
      )}
      {renameIndex !== null && (
        <RenameModal
          currentName={agents[renameIndex].name}
          onRename={(newName) => renameAgent(renameIndex, newName)}
          onClose={() => setRenameIndex(null)}
        />
      )}
    </div>
  );
}

export default App;
