import { useState } from "react";
import { Dropdown } from "./Dropdown";

interface SettingsModalProps {
  onClose: () => void;
}

const models = [
  { id: "big-pickle", label: "Big Pickle", badge: "Free" },
  { id: "muse-spark-1.2-free", label: "Muse Spark 1.2 Free", badge: "Free" },
  { id: "nemotron-3-ultra-free", label: "Nemotron 3 Ultra Free", badge: "Free" },
  { id: "nemotron-3.5-lightning-free", label: "Nemotron 3.5 Lightning Free", badge: "Free" },
  { id: "mimo-v2.5-free", label: "MiMo V2.5 Free", badge: "Free" },
  { id: "hy3-free", label: "Hy3 Free", badge: "Free" },
  { id: "laguna-s-2.1-free", label: "Laguna S 2.1 Free", badge: "Free" },
  { id: "deepseek-v4-flash-free", label: "DeepSeek V4 Flash Free", badge: "Free" },
];

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem("akodo-default-model") ?? "big-pickle";
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem("akodo-api-key") ?? "";
  });

  const selectModel = (id: string) => {
    setSelectedModel(id);
    localStorage.setItem("akodo-default-model", id);
  };

  const saveApiKey = () => {
    localStorage.setItem("akodo-api-key", apiKey);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[500px] rounded-xl bg-ctp-mantle border border-ctp-surface0 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-medium text-ctp-text mb-4">Settings</h2>

        <div className="mb-5">
          <h3 className="text-xs font-medium text-ctp-overlay0 uppercase tracking-wider mb-3">
            OpenCode Zen API Key
          </h3>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={saveApiKey}
              placeholder="sk-..."
              className="flex-1 px-3 py-2 rounded-lg bg-ctp-base border border-ctp-surface0 text-ctp-text text-sm placeholder-ctp-overlay0 focus:outline-none focus:border-ctp-mauve transition-colors"
            />
          </div>
          <p className="text-[11px] text-ctp-overlay0 mt-1.5">
            Get your free key at{" "}
            <span className="text-ctp-blue cursor-pointer hover:underline">opencode.ai/auth</span>
          </p>
        </div>

        <div className="mb-4">
          <h3 className="text-xs font-medium text-ctp-overlay0 uppercase tracking-wider mb-3">
            Choose default Orchestrator Agent model
          </h3>
          <Dropdown
            options={models}
            value={selectedModel}
            onChange={selectModel}
            open={dropdownOpen}
            onToggle={() => setDropdownOpen(!dropdownOpen)}
          />
        </div>
      </div>
    </div>
  );
}
