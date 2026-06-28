// ============================================================
// Token Counter — approximate token counting for DeepSeek
// Uses character-based estimation (roughly 3.5 chars per token
// for English, 1.5 chars per token for code)
// ============================================================
import { Message, ModelName, MODELS } from '../types';

/**
 * Estimate token count for text content.
 * DeepSeek uses a BPE tokenizer similar to GPT's.
 * This is an approximation — for exact counts, use the API response.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  let tokens = 0;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    // CJK characters (Chinese, Japanese, Korean) ≈ 1.5 tokens each
    if (isCJK(char)) {
      tokens += 1.5;
    }
    // Whitespace sequences
    else if (/\s/.test(char)) {
      let wsLen = 0;
      while (i < text.length && /\s/.test(text[i])) {
        wsLen++;
        i++;
      }
      tokens += Math.ceil(wsLen / 4); // whitespace is cheap
      continue;
    }
    // Common programming symbols
    else if (/[{}[\]();:.,<>=+\-*/&|!~^%@#$?`"'\\/]/.test(char)) {
      tokens += 0.3; // symbols are cheap
    }
    // Alphanumeric (English words)
    else if (/[a-zA-Z0-9]/.test(char)) {
      let wordLen = 0;
      while (i < text.length && /[a-zA-Z0-9_]/.test(text[i])) {
        wordLen++;
        i++;
      }
      tokens += Math.ceil(wordLen / 3.5); // ~3.5 chars per token
      continue;
    }
    // Other characters
    else {
      tokens += 1;
    }

    i++;
  }

  return Math.ceil(tokens);
}

/**
 * Estimate tokens for a list of messages.
 * Includes overhead for message structure.
 */
export function estimateMessageTokens(messages: Message[]): number {
  let total = 0;

  for (const msg of messages) {
    // Role overhead
    total += 4;

    if (typeof msg.content === 'string') {
      total += estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.text) total += estimateTokens(part.text);
        if (part.image_url) total += 85; // Image tokens (rough estimate)
      }
    }

    // Tool calls overhead
    if (msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        total += estimateTokens(tc.function.name);
        total += estimateTokens(tc.function.arguments);
        total += 8; // structural overhead
      }
    }

    // Tool result overhead
    if (msg.role === 'tool' && 'tool_call_id' in msg) {
      total += estimateTokens((msg as any).tool_call_id);
      total += estimateTokens((msg as any).name);
      total += 4;
    }

    // Reasoning content
    if (msg.role === 'assistant' && 'reasoning_content' in msg) {
      total += estimateTokens((msg as any).reasoning_content || '');
    }
  }

  return Math.ceil(total);
}

/**
 * Check if context is approaching the model limit
 */
export function isNearLimit(
  messages: Message[],
  model: ModelName,
  threshold: number = 0.85
): boolean {
  const tokens = estimateMessageTokens(messages);
  const maxTokens = MODELS[model].maxTokens;
  return tokens > maxTokens * threshold;
}

/**
 * Calculate usage percentage
 */
export function usagePercent(messages: Message[], model: ModelName): number {
  const tokens = estimateMessageTokens(messages);
  const maxTokens = MODELS[model].maxTokens;
  return Math.round((tokens / maxTokens) * 100);
}

/**
 * Estimate cost for a conversation
 */
export function estimateCost(
  model: ModelName,
  promptTokens: number,
  completionTokens: number
): number {
  const m = MODELS[model];
  return (promptTokens / 1000) * m.costPer1kInput + (completionTokens / 1000) * m.costPer1kOutput;
}

/**
 * Format token count for display
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(1)}M`;
}

function isCJK(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
    (code >= 0x3040 && code <= 0x309f) || // Hiragana
    (code >= 0x30a0 && code <= 0x30ff) || // Katakana
    (code >= 0xac00 && code <= 0xd7af)    // Hangul
  );
}
