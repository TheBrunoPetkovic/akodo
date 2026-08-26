import { useState } from "react";

function App() {
  const [prompt, setPrompt] = useState("");

  return (
    <div className="flex h-screen bg-[#0a0a0b] text-white">
      <aside className="w-64 border-r border-white/10 p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center font-bold text-sm">
            A
          </div>
          <span className="font-semibold text-lg">Akodo</span>
        </div>

        <nav className="flex-1 space-y-1">
          <button className="w-full text-left px-3 py-2 rounded-lg bg-white/10 text-sm font-medium">
            Chat
          </button>
          <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-white/60 font-medium">
            Agents
          </button>
          <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-white/60 font-medium">
            Pipeline
          </button>
          <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-white/60 font-medium">
            Settings
          </button>
        </nav>

        <div className="text-xs text-white/30 mt-auto">
          v0.1.0 · MIT License
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="h-12 border-b border-white/10 flex items-center px-4">
          <span className="text-sm text-white/60">New conversation</span>
        </header>

        <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center font-bold text-2xl">
              A
            </div>
            <h1 className="text-2xl font-semibold mb-2">What can I help you build?</h1>
            <p className="text-white/50 text-sm">
              Akodo orchestrates AI agents to take your ideas from prompt to production.
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-white/10">
          <div className="max-w-3xl mx-auto">
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what you want to build..."
                rows={1}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50"
              />
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-violet-500 hover:bg-violet-400 flex items-center justify-center transition-colors"
                onClick={() => {
                  if (prompt.trim()) {
                    console.log("Send:", prompt);
                    setPrompt("");
                  }
                }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
