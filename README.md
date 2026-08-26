# Akodo

Open source AI agent orchestrator — from prompt to production.

## What is Akodo?

Akodo is a desktop application that orchestrates AI agents to take your ideas from prompt to production. It features:

- **Agent Orchestrator** — A main agent that delegates tasks to specialized sub-agents
- **Multi-Provider Support** — Works with OpenAI, Anthropic, free models (Big Pickle, Llama), and custom endpoints
- **Pipeline Builder** — Visual workflow builder for complex development tasks
- **Real-time Monitoring** — Watch your agents work in real-time

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
git clone https://github.com/akodo-dev/akodo.git
cd akodo
npm install
npm run dev
```

### Build

```bash
npm run build
```

## Tech Stack

- **Desktop:** Electron
- **Frontend:** React + TypeScript
- **Build:** Vite
- **Styling:** Tailwind CSS
- **State:** Zustand

## Roadmap

- [ ] LLM Provider integration (OpenAI, Anthropic, Big Pickle)
- [ ] Agent orchestrator with sub-agent delegation
- [ ] Real-time agent monitoring UI
- [ ] Pipeline builder
- [ ] Code editing and validation loops
- [ ] Local model support (Ollama)

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](docs/CONTRIBUTING.md) first.

## License

MIT License — see [LICENSE](LICENSE) for details.
