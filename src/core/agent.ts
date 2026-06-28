// ============================================================
// Agent Loop — the heart of FundeePseek
// Handles the conversation loop, tool execution,
// streaming output, and error recovery
// ============================================================
import { EventEmitter } from 'events';
import chalk from 'chalk';
import {
  Message,
  ToolCall,
  ToolResult,
  ToolDefinition,
  ModelName,
  AgentMode,
  ThinkingMode,
  StreamChunk,
  MODELS,
} from '../types';
import { DeepSeekClient } from '../api/client';
import { ContextManager } from './context';
import { ModeManager } from './mode';
import { ToolRegistry } from '../tools/registry';
import { buildSystemPrompt, PromptContext } from './system-prompt';

export interface AgentConfig {
  apiKey: string;
  model: ModelName;
  mode: AgentMode;
  thinking: ThinkingMode;
  projectRoot: string;
  promptContext: PromptContext;
}

export class Agent extends EventEmitter {
  private client: DeepSeekClient;
  private context: ContextManager;
  private modeManager: ModeManager;
  private toolRegistry: ToolRegistry;
  private config: AgentConfig;
  private isRunning: boolean = false;
  private abortController: AbortController | null = null;
  private maxToolRounds: number = 25; // Safety limit
  private currentRound: number = 0;

  // Tracking
  private totalPromptTokens: number = 0;
  private totalCompletionTokens: number = 0;
  private totalReasoningTokens: number = 0;
  private totalCost: number = 0;

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.client = new DeepSeekClient({
      apiKey: config.apiKey,
      timeout: 180000,
      maxRetries: 3,
    });
    this.context = new ContextManager(config.model, (msgs) =>
      this.client.estimateTokens(msgs)
    );
    this.modeManager = new ModeManager(config.mode);
    this.toolRegistry = new ToolRegistry();

    // Initialize system prompt
    const systemPrompt = buildSystemPrompt(config.promptContext);
    this.context.setSystem(systemPrompt);
  }

  // ---- Public API ----

  /** Start an interactive conversation turn */
  async chat(userInput: string): Promise<string> {
    if (this.isRunning) {
      return 'An agent turn is already in progress. Please wait.';
    }

    this.isRunning = true;
    this.currentRound = 0;
    this.abortController = new AbortController();

    try {
      // Check for slash commands
      const commandResult = this.handleSlashCommand(userInput);
      if (commandResult !== null) {
        return commandResult;
      }

      // Add user message
      this.context.addUser(userInput);

      // Start the agent loop
      return await this.agentLoop();
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }

  /** Resume from a saved session */
  async resume(messages: Message[]): Promise<string> {
    this.context.import(messages);
    return 'Session resumed. Continue the conversation.';
  }

  /** Get current token usage stats */
  getUsage(): {
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    cost: number;
    rounds: number;
  } {
    return {
      promptTokens: this.totalPromptTokens,
      completionTokens: this.totalCompletionTokens,
      reasoningTokens: this.totalReasoningTokens,
      totalTokens: this.totalPromptTokens + this.totalCompletionTokens,
      cost: this.totalCost,
      rounds: this.currentRound,
    };
  }

  /** Get context stats */
  getContextStats() {
    return this.context.stats;
  }

  /** Export current context for saving */
  exportContext(): Message[] {
    return this.context.export();
  }

  // ---- Agent Loop ----

  private async agentLoop(): Promise<string> {
    while (this.currentRound < this.maxToolRounds) {
      this.currentRound++;

      // Get messages optimized for API
      const messages = this.context.getMessagesForAPI();

      // Get tool definitions for current mode
      const tools = this.toolRegistry.getDefinitions(this.modeManager.mode);

      try {
        // Call DeepSeek API with streaming
        const response = await this.callModel(messages, tools);

        const choice = response.choices?.[0];
        if (!choice) {
          return 'No response from model.';
        }

        const assistantMsg = choice.message;

        // Track usage
        if (response.usage) {
          this.totalPromptTokens += response.usage.prompt_tokens;
          this.totalCompletionTokens += response.usage.completion_tokens;
          this.totalReasoningTokens += response.usage.reasoning_tokens || 0;
          this.trackCost(response.usage.prompt_tokens, response.usage.completion_tokens);
        }

        // Handle tool calls
        if (choice.finish_reason === 'tool_calls' && assistantMsg.tool_calls?.length) {
          // Add assistant message with tool calls to context
          this.context.addAssistant(
            assistantMsg.content,
            assistantMsg.tool_calls,
            assistantMsg.reasoning_content
          );

          // Execute each tool call
          for (const toolCall of assistantMsg.tool_calls) {
            const result = await this.executeTool(toolCall);
            this.context.addToolResult(toolCall.id, toolCall.function.name, result);
          }

          // Continue the loop
          continue;
        }

        // Final response — no tool calls
        const finalContent = assistantMsg.content || '(no response)';
        this.context.addAssistant(finalContent, undefined, assistantMsg.reasoning_content);

        // Emit final response for display
        this.emit('response', finalContent);

        return finalContent;

      } catch (err: any) {
        // Handle errors
        if (err.status === 429) {
          // Rate limited — wait and retry
          this.emit('warning', 'Rate limited by DeepSeek API. Waiting 5 seconds...');
          await this.sleep(5000);
          this.currentRound--; // Don't count this round
          continue;
        }

        if (err.status === 401 || err.status === 403) {
          return `Authentication error: Invalid or expired API key. Please check your DEEPSEEK_API_KEY.`;
        }

        if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
          if (this.currentRound < 3) {
            this.emit('warning', `Connection error, retrying... (${this.currentRound}/3)`);
            await this.sleep(2000);
            this.currentRound--;
            continue;
          }
          return `Connection to DeepSeek API failed after multiple retries. Check your network.`;
        }

        this.emit('error', err);
        return `Error: ${err.message}`;
      }
    }

    // Hit the round limit
    return `Reached maximum tool call rounds (${this.maxToolRounds}). The task may be too complex. Try breaking it into smaller steps.`;
  }

  // ---- Tool Execution ----

  private async executeTool(toolCall: ToolCall): Promise<string> {
    const toolName = toolCall.function.name;

    // Check mode permissions
    if (!this.modeManager.canUseTool(toolName)) {
      return `[BLOCKED] ${this.modeManager.getRejectionMessage(toolName)}`;
    }

    // Emit pre-execution event (for UI to show spinner)
    this.emit('tool:start', toolName, toolCall.function.arguments);

    // Execute
    const result = await this.toolRegistry.execute(toolCall);

    // Emit result
    if (result.success) {
      this.emit('tool:done', toolName, result);
    } else {
      this.emit('tool:error', toolName, result.error);
    }

    // Format result for the model
    if (result.success) {
      return result.output;
    }
    return `Error: ${result.error}`;
  }

  // ---- Model API Call ----

  private async callModel(messages: Message[], tools: ToolDefinition[]) {
    // Stream the response, collect into final
    return this.client.chatStream(
      messages,
      (chunk: StreamChunk) => this.handleStreamChunk(chunk),
      {
        model: this.config.model,
        tools: tools.length > 0 ? tools : undefined,
        thinking: this.config.thinking,
        temperature: 0.1,
      }
    );
  }

  private handleStreamChunk(chunk: StreamChunk): void {
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) return;

    // Reasoning content (thinking)
    if (delta.reasoning_content) {
      this.emit('thinking', delta.reasoning_content);
    }

    // Regular content
    if (delta.content) {
      this.emit('stream', delta.content);
    }

    // Tool calls being built
    if (delta.tool_calls?.length) {
      for (const tc of delta.tool_calls) {
        if (tc.function?.name) {
          this.emit('tool:name', tc.function.name);
        }
      }
    }
  }

  // ---- Slash Commands ----

  private handleSlashCommand(input: string): string | null {
    const trimmed = input.trim();

    if (trimmed === '/auto') return this.modeManager.switch('auto');
    if (trimmed === '/plan') return this.modeManager.switch('plan');
    if (trimmed === '/ask') return this.modeManager.switch('ask');
    if (trimmed === '/chat') return this.modeManager.switch('chat');

    if (trimmed === '/clear') {
      this.context.reset();
      return 'Context cleared. Starting fresh.';
    }

    if (trimmed === '/compact') {
      const stats = this.context.stats;
      return `Context stats: ${stats.messageCount} messages, ~${stats.estimatedTokens} tokens (${stats.usagePercent}% of ${stats.maxTokens})`;
    }

    if (trimmed === '/usage') {
      const usage = this.getUsage();
      return [
        `📊 **Token Usage**`,
        `  Prompt: ${usage.promptTokens.toLocaleString()}`,
        `  Completion: ${usage.completionTokens.toLocaleString()}`,
        `  Reasoning: ${usage.reasoningTokens.toLocaleString()}`,
        `  Total: ${usage.totalTokens.toLocaleString()}`,
        `  Rounds: ${usage.rounds}`,
        `  Est. Cost: $${usage.cost.toFixed(4)}`,
      ].join('\n');
    }

    if (trimmed.startsWith('/model ')) {
      const newModel = trimmed.slice(7).trim() as ModelName;
      if (MODELS[newModel]) {
        this.config.model = newModel;
        return `Switched to ${MODELS[newModel].displayName}`;
      }
      return `Unknown model: ${newModel}. Available: ${Object.keys(MODELS).join(', ')}`;
    }

    if (trimmed === '/help') {
      return [
        '**FundeePseek Commands:**',
        '',
        '`/auto` — Switch to auto (full autonomy) mode',
        '`/plan` — Switch to plan (plan-first) mode',
        '`/ask` — Switch to ask (read-only) mode',
        '`/chat` — Switch to chat (no tools) mode',
        '`/model <name>` — Switch model (deepseek-chat, deepseek-reasoner, deepseek-v4-pro, deepseek-v4-flash)',
        '`/compact` — Show context usage stats',
        '`/clear` — Clear conversation context',
        '`/usage` — Show token usage and cost',
        '`/help` — Show this help',
      ].join('\n');
    }

    return null; // Not a slash command
  }

  // ---- Helpers ----

  private trackCost(promptTokens: number, completionTokens: number): void {
    const model = MODELS[this.config.model];
    const promptCost = (promptTokens / 1000) * model.costPer1kInput;
    const completionCost = (completionTokens / 1000) * model.costPer1kOutput;
    this.totalCost += promptCost + completionCost;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Abort current agent run */
  abort(): void {
    this.abortController?.abort();
    this.isRunning = false;
  }
}
