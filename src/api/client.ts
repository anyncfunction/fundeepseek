// ============================================================
// DeepSeek API Client — Unified interface for all models
// ============================================================
import * as https from 'https';
import * as http from 'http';
import { EventEmitter } from 'events';
import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamChunk,
  Message,
  ToolDefinition,
  ModelName,
  ThinkingMode,
} from '../types';

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

export class DeepSeekClient extends EventEmitter {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;

  constructor(options: ClientOptions) {
    super();
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://api.deepseek.com';
    this.timeout = options.timeout || 120000;
    this.maxRetries = options.maxRetries || 3;
  }

  // ---- Public API ----

  /** Non-streaming chat completion */
  async chat(
    messages: Message[],
    options?: {
      model?: ModelName;
      tools?: ToolDefinition[];
      maxTokens?: number;
      temperature?: number;
      thinking?: ThinkingMode;
    }
  ): Promise<ChatCompletionResponse> {
    const request: ChatCompletionRequest = {
      model: options?.model || 'deepseek-chat',
      messages,
      stream: false,
      max_tokens: options?.maxTokens,
      temperature: options?.temperature ?? 0.1,
      ...(options?.tools?.length ? { tools: options.tools, tool_choice: 'auto' } : {}),
      ...(this.shouldEnableThinking(options?.model, options?.thinking)
        ? { thinking: { type: 'enabled' as const } }
        : {}),
    };

    return this.makeRequest('/v1/chat/completions', request);
  }

  /** Streaming chat completion — yields StreamChunk via callback */
  async chatStream(
    messages: Message[],
    onChunk: (chunk: StreamChunk) => void,
    options?: {
      model?: ModelName;
      tools?: ToolDefinition[];
      maxTokens?: number;
      temperature?: number;
      thinking?: ThinkingMode;
    }
  ): Promise<ChatCompletionResponse> {
    const request: ChatCompletionRequest = {
      model: options?.model || 'deepseek-chat',
      messages,
      stream: true,
      max_tokens: options?.maxTokens,
      temperature: options?.temperature ?? 0.1,
      ...(options?.tools?.length ? { tools: options.tools, tool_choice: 'auto' } : {}),
      ...(this.shouldEnableThinking(options?.model, options?.thinking)
        ? { thinking: { type: 'enabled' as const } }
        : {}),
    };

    return this.makeStreamRequest('/v1/chat/completions', request, onChunk);
  }

  /** FIM (Fill-in-the-Middle) completion — for code completion */
  async fim(
    prefix: string,
    suffix: string,
    options?: { model?: string; maxTokens?: number; temperature?: number }
  ): Promise<{ text: string }> {
    const payload = {
      model: options?.model || 'deepseek-chat',
      prompt: prefix,
      suffix,
      max_tokens: options?.maxTokens || 256,
      temperature: options?.temperature ?? 0.1,
    };

    const response = await this.makeRequest('/beta/completions', payload);
    return { text: response.choices?.[0]?.text || '' };
  }

  /** Count tokens for a message list (approximate, using character-based estimation) */
  estimateTokens(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += Math.ceil(msg.content.length / 3.5);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          total += Math.ceil((part.text?.length || 0) / 3.5);
        }
      }
      // Overhead per message
      total += 4;
    }
    return total;
  }

  // ---- Private: HTTP layer ----

  private shouldEnableThinking(model?: ModelName, thinking?: ThinkingMode): boolean {
    if (thinking === 'on') return true;
    if (thinking === 'off') return false;
    // 'auto' enables thinking for both V4 models
    if (thinking === 'auto') return true;
    return false;
  }

  private async makeRequest(path: string, body: unknown): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.doRequest(path, body);
      } catch (err: any) {
        lastError = err;
        // Only retry on server errors or network issues
        if (err.status >= 500 || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
          if (attempt < this.maxRetries) {
            const delay = Math.pow(2, attempt) * 1000;
            await this.sleep(delay);
            continue;
          }
        }
        throw err;
      }
    }
    throw lastError;
  }

  private doRequest(path: string, body: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl + path);
      const payload = JSON.stringify(body);

      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Length': Buffer.byteLength(payload).toString(),
          'Accept': 'application/json',
        },
        timeout: this.timeout,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 400) {
              const err: any = new Error(
                `DeepSeek API Error ${res.statusCode}: ${parsed.error?.message || data}`
              );
              err.status = res.statusCode;
              err.body = parsed;
              reject(err);
            } else {
              resolve(parsed);
            }
          } catch (e: any) {
            reject(new Error(`Failed to parse API response: ${e.message}`));
          }
        });
        res.on('error', reject);
      });

      req.on('error', (err: NodeJS.ErrnoException) => {
        (err as any).code = err.code;
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${this.timeout}ms`));
      });

      req.write(payload);
      req.end();
    });
  }

  private makeStreamRequest(
    path: string,
    body: unknown,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<ChatCompletionResponse> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl + path);
      const payload = JSON.stringify(body);

      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Length': Buffer.byteLength(payload).toString(),
          'Accept': 'text/event-stream',
        },
        timeout: this.timeout,
      };

      const req = https.request(options, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          let data = '';
          res.on('data', (chunk: Buffer) => (data += chunk.toString()));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              const err: any = new Error(
                `DeepSeek API Error ${res.statusCode}: ${parsed.error?.message || data}`
              );
              err.status = res.statusCode;
              reject(err);
            } catch {
              reject(new Error(`DeepSeek API Error ${res.statusCode}: ${data}`));
            }
          });
          return;
        }

        let buffer = '';
        let finalResponse: ChatCompletionResponse | null = null;

        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed: StreamChunk = JSON.parse(data);
                onChunk(parsed);
                // Accumulate into a final response-like object
                if (!finalResponse) {
                  finalResponse = {
                    id: parsed.id,
                    object: 'chat.completion',
                    created: parsed.created,
                    model: parsed.model,
                    choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
                  };
                }
                if (parsed.choices?.[0]) {
                  const choice = parsed.choices[0];
                  const msg = finalResponse!.choices[0].message;
                  if (choice.delta.content) msg.content = (msg.content || '') + choice.delta.content;
                  if (choice.delta.reasoning_content) {
                    msg.reasoning_content = (msg.reasoning_content || '') + choice.delta.reasoning_content;
                  }
                  if (choice.delta.tool_calls) {
                    if (!msg.tool_calls) msg.tool_calls = [];
                    for (const tc of choice.delta.tool_calls) {
                      if (tc.id) {
                        msg.tool_calls[tc.index] = {
                          id: tc.id,
                          type: 'function',
                          function: { name: tc.function?.name || '', arguments: '' },
                        };
                      }
                      if (tc.function?.arguments && msg.tool_calls[tc.index]) {
                        msg.tool_calls[tc.index].function.arguments += tc.function.arguments;
                      }
                    }
                  }
                  if (choice.finish_reason) {
                    finalResponse!.choices[0].finish_reason = choice.finish_reason as any;
                  }
                }
              } catch {
                // Skip malformed lines
              }
            }
          }
        });

        res.on('end', () => {
          resolve(finalResponse || {
            id: 'stream',
            object: 'chat.completion',
            created: Date.now(),
            model: 'unknown',
            choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
          });
        });

        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Stream request timeout after ${this.timeout}ms`));
      });

      req.write(payload);
      req.end();
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
