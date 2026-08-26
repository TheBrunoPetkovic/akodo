import { useState, useRef, useEffect } from "react";

interface RenameModalProps {
  currentName: string;
  onRename: (newName: string) => void;
  onClose: () => void;
}

export function RenameModal({ currentName, onRename, onClose }: RenameModalProps) {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = () => {
    if (name.trim()) {
      onRename(name.trim());
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[350px] rounded-xl bg-ctp-mantle border border-ctp-surface0 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-medium text-ctp-text mb-3">Rename agent</h2>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          className="w-full px-3 py-2 rounded-lg bg-ctp-base border border-ctp-surface0 text-ctp-text text-sm focus:outline-none focus:border-ctp-mauve transition-colors"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-3 py-1.5 rounded-lg text-sm bg-ctp-mauve text-ctp-crust font-medium hover:opacity-90 transition-opacity"
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}
