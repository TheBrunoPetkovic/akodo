export function TopBar() {
  return (
    <div
      className="h-9 bg-ctp-base flex items-center justify-between select-none shrink-0"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex items-center gap-2 px-3">
        <div className="w-4 h-4 rounded-sm bg-gradient-to-br from-ctp-mauve to-ctp-pink" />
      </div>

      <div
        className="flex h-full"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={() => window.api.minimize()}
          className="w-11 h-full flex items-center justify-center hover:bg-ctp-surface0 transition-colors"
        >
          <svg className="w-3 h-3 text-ctp-overlay1" viewBox="0 0 12 12" fill="none">
            <rect y="5.5" width="12" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={() => window.api.maximize()}
          className="w-11 h-full flex items-center justify-center hover:bg-ctp-surface0 transition-colors"
        >
          <svg className="w-3 h-3 text-ctp-overlay1" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="1" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          onClick={() => window.api.close()}
          className="w-11 h-full flex items-center justify-center hover:bg-ctp-red group transition-colors"
        >
          <svg className="w-3 h-3 text-ctp-overlay1 group-hover:text-ctp-crust" viewBox="0 0 12 12" fill="none">
            <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
