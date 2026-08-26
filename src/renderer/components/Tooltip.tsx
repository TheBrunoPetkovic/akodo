import { useState, useRef } from "react";

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

export function Tooltip({ text, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    timeoutRef.current = setTimeout(() => setVisible(true), 600);
  };

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  return (
    <div className="relative inline-flex group" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      <span className={`absolute left-full ml-2 px-2 py-1 rounded-md bg-ctp-surface0 border border-ctp-surface2 text-ctp-text text-xs whitespace-nowrap pointer-events-none transition-opacity duration-150 ${visible ? "opacity-100" : "opacity-0"}`}>
        <span className="absolute -left-[5px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-r-[5px] border-r-ctp-surface2" />
        <span className="absolute -left-[4px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-r-[4px] border-r-ctp-surface0" />
        {text}
      </span>
    </div>
  );
}
