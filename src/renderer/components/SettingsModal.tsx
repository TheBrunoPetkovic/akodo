import { useEffect, useState } from "react";

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [available, setAvailable] = useState<boolean | null>(null);

  const refreshStatus = async () => {
    const status = await window.api.getOpenCodeStatus();
    setAvailable(status.available);
  };

  useEffect(() => { void refreshStatus(); }, []);

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
            OpenCode runtime
          </h3>
          <p className="text-[11px] text-ctp-overlay0 mt-1.5">
            {available === null ? "Checking OpenCode CLI..." : available ? "OpenCode CLI is ready." : "OpenCode CLI is not installed or not on PATH."}
          </p>
        </div>

      </div>
    </div>
  );
}
