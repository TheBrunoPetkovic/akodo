export interface AgentTask {
  id: string;
  prompt: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
}

export interface AgentConfig {
  model: string;
  temperature: number;
  maxTokens: number;
}

export class Orchestrator {
  private tasks: Map<string, AgentTask> = new Map();
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async execute(prompt: string): Promise<AgentTask> {
    const task: AgentTask = {
      id: crypto.randomUUID(),
      prompt,
      status: "running",
    };

    this.tasks.set(task.id, task);

    try {
      task.result = `Orchestrator received: ${prompt}`;
      task.status = "completed";
    } catch (error) {
      task.status = "failed";
      task.error = error instanceof Error ? error.message : "Unknown error";
    }

    return task;
  }

  getTask(id: string): AgentTask | undefined {
    return this.tasks.get(id);
  }

  getAllTasks(): AgentTask[] {
    return Array.from(this.tasks.values());
  }
}
