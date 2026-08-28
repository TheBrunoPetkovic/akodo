import { useEffect, useState } from "react";

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const refreshStatus = async () => {
    const status = await window.api.getOpenCodeStatus();
    setAvailable(status.available);
  };

  useEffect(() => { void refreshStatus(); }, []);

  const installOpenCode = async () => {
    setInstalling(true);
    setInstallError(null);
    try {
      const status = await window.api.installOpenCode();
      setAvailable(status.available);
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : "OpenCode could not be installed.");
    } finally {
      setInstalling(false);
    }
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
            OpenCode runtime
          </h3>
          <p className="text-[11px] text-ctp-overlay0 mt-1.5">
            {available === null ? "Checking OpenCode CLI..." : available ? "OpenCode CLI is ready." : "OpenCode CLI is not installed or not on PATH."}
          </p>
          {!available && (
            <button
              type="button"
              onClick={() => void installOpenCode()}
              disabled={installing || available === null}
              className="mt-3 rounded-md bg-ctp-blue px-3 py-1.5 text-xs font-medium text-ctp-base transition-colors hover:bg-ctp-sapphire disabled:cursor-not-allowed disabled:opacity-60"
            >
              {installing ? "Installing OpenCode…" : "Install OpenCode locally"}
            </button>
          )}
          {installError && <p className="mt-2 whitespace-pre-wrap text-[11px] text-ctp-red">{installError}</p>}
          {!available && !installError && (
            <p className="mt-2 text-[11px] text-ctp-overlay0">Installs a private Akodo runtime; your global npm and PATH stay unchanged.</p>
          )}
        </div>

      </div>
    </div>
  );
}
