export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface LLMProvider {
  id: string;
  name: string;
  type: "openai" | "anthropic" | "bigpickle" | "custom";
  apiKey?: string;
  baseUrl?: string;
  models: string[];
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  systemPrompt: string;
}

export interface Pipeline {
  id: string;
  name: string;
  steps: PipelineStep[];
  createdAt: number;
}

export interface PipelineStep {
  id: string;
  agentId: string;
  prompt: string;
  dependencies: string[];
}
