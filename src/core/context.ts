// ============================================================
// Context Manager — manages message history, token budgets,
// compaction, and context window
// ============================================================
import {
  Message,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  ToolCall,
  ModelName,
  MODELS,
} from '../types';

export interface ContextStats {
  messageCount: number;
  toolCallCount: number;
  estimatedTokens: number;
  maxTokens: number;
  usagePercent: number;
}

export class ContextManager {
  private messages: Message[] = [];
  private model: ModelName;
  private tokenEstimateCallback: (msgs: Message[]) => number;

  constructor(
    model: ModelName,
    tokenEstimator: (msgs: Message[]) => number
  ) {
    this.model = model;
    this.tokenEstimateCallback = tokenEstimator;
  }

  get all(): Message[] {
    return [...this.messages];
  }

  get stats(): ContextStats {
    const maxTokens = MODELS[this.model].maxTokens;
    const estimatedTokens = this.tokenEstimateCallback(this.messages);
    return {
      messageCount: this.messages.length,
      toolCallCount: this.messages.filter((m) => m.role === 'tool').length,
      estimatedTokens,
      maxTokens,
      usagePercent: Math.round((estimatedTokens / maxTokens) * 100),
    };
  }

  /** Add a message to the context */
  add(message: Message): void {
    this.messages.push(message);
  }

  /** Add system message (replaces existing system message) */
  setSystem(content: string): void {
    this.messages = this.messages.filter((m) => m.role !== 'system');
    this.messages.unshift({ role: 'system', content });
  }

  /** Add a user message */
  addUser(content: string): void {
    this.add({ role: 'user', content });
  }

  /** Add an assistant response (may include tool calls) */
  addAssistant(
    content: string | null,
    toolCalls?: ToolCall[],
    reasoningContent?: string
  ): void {
    const msg: AssistantMessage = {
      role: 'assistant',
      content,
      ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
      ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
    };
    this.add(msg);
  }

  /** Add a tool result */
  addToolResult(toolCallId: string, toolName: string, result: string): void {
    this.add({
      role: 'tool',
      content: result,
      tool_call_id: toolCallId,
      name: toolName,
    });
  }

  /** Get messages suitable for sending to API (filtered, truncated if needed) */
  getMessagesForAPI(maxTokens?: number): Message[] {
    const limit = maxTokens || MODELS[this.model].maxTokens;
    let messages = this.prepareMessages([...this.messages]);
    let tokens = this.tokenEstimateCallback(messages);

    // If under budget, return all
    if (tokens <= limit * 0.9) {
      return messages;
    }

    // Need to compact: keep system message + trim oldest non-system messages
    const systemMsgs = messages.filter((m) => m.role === 'system');
    const nonSystemMsgs = messages.filter((m) => m.role !== 'system');

    // Keep last N messages that fit
    const result = [...systemMsgs];
    let currentTokens = this.tokenEstimateCallback(result);

    // Take from the end (most recent first for tool result chains)
    const kept: Message[] = [];
    for (let i = nonSystemMsgs.length - 1; i >= 0; i--) {
      const msg = nonSystemMsgs[i];
      const msgTokens = this.tokenEstimateCallback([msg]);
      if (currentTokens + msgTokens > limit * 0.85) break;
      kept.unshift(msg);
      currentTokens += msgTokens;
    }

    return [...systemMsgs, ...kept];
  }

  /**
   * Prepare messages for API: strip reasoning_content from
   * assistant messages NOT in a tool-call chain.
   *
   * Rule: reasoning_content MUST be preserved between tool-call turns,
   * but must be STRIPPED between non-tool-call turns (user→assistant→user).
   */
  private prepareMessages(messages: Message[]): Message[] {
    const result: Message[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'assistant' && 'reasoning_content' in msg) {
        const hasToolCalls = 'tool_calls' in msg && msg.tool_calls && msg.tool_calls.length > 0;
        // Check if next message is a tool result (part of tool chain)
        const nextMsg = messages[i + 1];
        const isInToolChain = nextMsg?.role === 'tool';

        if (hasToolCalls || isInToolChain) {
          // Preserve reasoning_content — part of tool chain
          result.push(msg);
        } else {
          // Strip reasoning_content — final answer between user turns
          const { reasoning_content, ...rest } = msg as any;
          result.push(rest);
        }
      } else {
        result.push(msg);
      }
    }
    return result;
  }

  /** Compact the context: keep system + summarize older messages */
  compact(summary: string, keepLastN: number = 4): void {
    const systemMsgs = this.messages.filter((m) => m.role === 'system');
    const nonSystemMsgs = this.messages.filter((m) => m.role !== 'system');

    // Keep the last N messages for continuity
    const recent = nonSystemMsgs.slice(-keepLastN);

    // Replace with summary
    this.messages = [
      ...systemMsgs,
      {
        role: 'user',
        content: `<conversation-summary>\n${summary}\n</conversation-summary>`,
      } as UserMessage,
      ...recent,
    ];
  }

  /** Clear all messages (keep system) */
  reset(): void {
    const systemMsgs = this.messages.filter((m) => m.role === 'system');
    this.messages = systemMsgs;
  }

  /** Export context for session save */
  export(): Message[] {
    return [...this.messages];
  }

  /** Import context from saved session */
  import(messages: Message[]): void {
    this.messages = messages;
  }
}
