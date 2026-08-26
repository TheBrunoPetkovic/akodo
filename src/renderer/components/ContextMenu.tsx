import { useEffect, useRef } from "react";

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  items: { label: string; onClick: () => void; danger?: boolean }[];
}

export function ContextMenu({ x, y, onClose, items }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[200] min-w-[140px] rounded-lg border border-ctp-surface1 bg-ctp-base p-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
            item.danger
              ? "text-ctp-red hover:bg-ctp-red hover:text-ctp-crust"
              : "text-ctp-text hover:bg-ctp-surface0"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
