import { useEffect, useRef } from "react";

interface DropdownOption {
  id: string;
  label: string;
  badge?: string;
  badgeColor?: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (id: string) => void;
  open: boolean;
  onToggle: () => void;
}

export function Dropdown({ options, value, onChange, open, onToggle }: DropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (open) onToggle();
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [open, onToggle]);

  const current = options.find((o) => o.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-ctp-surface0 bg-ctp-base text-sm text-ctp-text hover:border-ctp-surface1 transition-colors"
      >
        <span>{current?.label ?? "Select..."}</span>
        <svg
          className={`w-4 h-4 text-ctp-overlay0 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-ctp-surface1 bg-ctp-base p-1 shadow-lg z-50 max-h-[250px] overflow-y-auto">
          {options.map((option) => (
            <button
              key={option.id}
              onClick={() => {
                onChange(option.id);
                onToggle();
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                value === option.id
                  ? "bg-ctp-surface0 text-ctp-text"
                  : "text-ctp-text hover:bg-ctp-surface0"
              }`}
            >
              <span>{option.label}</span>
              {option.badge && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${option.badgeColor ?? "bg-ctp-green/15 text-ctp-green"}`}>
                  {option.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
