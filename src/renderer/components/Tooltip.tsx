import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

export function Tooltip({ text, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPosition({ left: rect.right + 8, top: rect.top + rect.height / 2 });
    timeoutRef.current = setTimeout(() => setVisible(true), 600);
  };

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return (
    <div ref={triggerRef} className="inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && createPortal(
        <span
          style={{ left: position.left, top: position.top }}
          className="fixed z-[2147483647] -translate-y-1/2 rounded-md border border-ctp-surface2 bg-ctp-surface0 px-2 py-1 text-xs text-ctp-text whitespace-nowrap pointer-events-none"
        >
          <span className="absolute -left-[5px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-r-[5px] border-r-ctp-surface2" />
          <span className="absolute -left-[4px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-r-[4px] border-r-ctp-surface0" />
          {text}
        </span>,
        document.body,
      )}
    </div>
  );
}
