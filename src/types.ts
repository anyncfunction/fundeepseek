// ============================================================
// Fundeepseek — Core Type Definitions
// ============================================================

// ---- Model Configuration ----
export type ModelName = 'deepseek-chat' | 'deepseek-reasoner' | 'deepseek-v4-pro' | 'deepseek-v4-flash';

export interface ModelConfig {
  name: ModelName;
  displayName: string;
  maxTokens: number;
  supportsThinking: boolean;
  supportsTools: boolean;
  costPer1kInput: number;   // in USD
  costPer1kOutput: number;
}

export const MODELS: Record<ModelName, ModelConfig> = {
  'deepseek-chat': {
    name: 'deepseek-chat',
    displayName: 'DeepSeek V3 (Chat)',
    maxTokens: 65536,
    supportsThinking: false,
    supportsTools: true,
    costPer1kInput: 0.00027,
    costPer1kOutput: 0.00110,
  },
  'deepseek-reasoner': {
    name: 'deepseek-reasoner',
    displayName: 'DeepSeek R1 (Reasoner)',
    maxTokens: 65536,
    supportsThinking: true,
    supportsTools: true,
    costPer1kInput: 0.00055,
    costPer1kOutput: 0.00219,
  },
  'deepseek-v4-pro': {
    name: 'deepseek-v4-pro',
    displayName: 'DeepSeek V4 Pro',
    maxTokens: 131072,
    supportsThinking: true,
    supportsTools: true,
    costPer1kInput: 0.00110,
    costPer1kOutput: 0.00440,
  },
  'deepseek-v4-flash': {
    name: 'deepseek-v4-flash',
    displayName: 'DeepSeek V4 Flash',
    maxTokens: 131072,
    supportsThinking: true,
    supportsTools: true,
    costPer1kInput: 0.00014,
    costPer1kOutput: 0.00055,
  },
};

// ---- Mode Configuration ----
export type AgentMode = 'auto' | 'plan' | 'ask' | 'chat';

export interface ModeConfig {
  name: AgentMode;
  description: string;
  canRead: boolean;
  canWrite: boolean;
  canExecute: boolean;
  canSearch: boolean;
  requireConfirm: boolean;
}

export const MODES: Record<AgentMode, ModeConfig> = {
  auto: {
    name: 'auto',
    description: 'Full autonomous agent — reads, writes, and executes freely',
    canRead: true,
    canWrite: true,
    canExecute: true,
    canSearch: true,
    requireConfirm: false,
  },
  plan: {
    name: 'plan',
    description: 'Plan first, execute after user approval',
    canRead: true,
    canWrite: false,
    canExecute: false,
    canSearch: true,
    requireConfirm: true,
  },
  ask: {
    name: 'ask',
    description: 'Read-only mode — can read/search, cannot write or execute',
    canRead: true,
    canWrite: false,
    canExecute: false,
    canSearch: true,
    requireConfirm: false,
  },
  chat: {
    name: 'chat',
    description: 'Pure conversation — no tools available',
    canRead: false,
    canWrite: false,
    canExecute: false,
    canSearch: false,
    requireConfirm: false,
  },
};

// ---- Thinking Configuration ----
export type ThinkingMode = 'on' | 'off' | 'auto';

// ---- Message Types (OpenAI-compatible) ----
export interface SystemMessage {
  role: 'system';
  content: string;
}

export interface UserMessage {
  role: 'user';
  content: string | MessageContent[];
}

export interface AssistantMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: ToolCall[];
  reasoning_content?: string;  // DeepSeek-specific: thinking chain
}

export interface ToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
  name: string;
}

export type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

export interface MessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

// ---- Tool Calling ----
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON string
  };
}

// ---- API Types ----
export interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  // DeepSeek-specific: enable thinking/reasoning
  thinking?: { type: 'enabled' | 'disabled' };
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: ToolCall[];
      reasoning_content?: string;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    reasoning_tokens?: number;
  };
}

// ---- Stream Types ----
export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
      reasoning_content?: string;
      tool_calls?: {
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }[];
    };
    finish_reason?: string;
  }[];
}

// ---- Tool Result ----
export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ---- Session ----
export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  projectRoot: string;
  model: ModelName;
  mode: AgentMode;
  messages: Message[];
  summary?: string;
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
    reasoning: number;
  };
}

// ---- Global Memory ----
export interface MemoryEntry {
  name: string;
  description: string;
  metadata: {
    type: 'user' | 'feedback' | 'project' | 'reference';
    created: string;
    updated: string;
  };
  content: string;
}

// ---- User Profile ----
export interface UserProfile {
  codingStyle: {
    indentation: 'spaces' | 'tabs';
    indentSize: number;
    namingPreference: 'camelCase' | 'snake_case' | 'PascalCase';
    commentDensity: 'minimal' | 'moderate' | 'verbose';
    quotePreference: 'single' | 'double';
    semicolons: boolean;
  };
  techStack: {
    languages: string[];
    frameworks: string[];
    tools: string[];
  };
  interactionStyle: {
    verbosity: 'concise' | 'balanced' | 'detailed';
    confirmThreshold: 'low' | 'medium' | 'high';
    preferExplanations: boolean;
    preferCodeFirst: boolean;
  };
  personality: {
    traits: string[];
    learningStyle: string;
    patience: 'low' | 'medium' | 'high';
  };
}

// ---- App Config ----
export interface AppConfig {
  version: string;
  apiKey?: string;
  apiBaseUrl: string;
  defaultModel: ModelName;
  defaultMode: AgentMode;
  defaultThinking: ThinkingMode;
  maxRetries: number;
  timeout: number;
  colors: boolean;
}
