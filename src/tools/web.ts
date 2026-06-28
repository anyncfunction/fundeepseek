// ============================================================
// Web Tool — search and fetch web content
// ============================================================
import * as https from 'https';
import * as http from 'http';
import { ToolResult } from '../types';

export async function webOps(args: {
  action: 'search' | 'fetch';
  query?: string;
  url?: string;
  max_results?: number;
}): Promise<ToolResult> {
  if (args.action === 'search') {
    return webSearch(args.query || '', args.max_results || 5);
  }
  if (args.action === 'fetch') {
    return webFetch(args.url || '');
  }
  return { success: false, output: '', error: `Unknown action: ${args.action}` };
}

async function webSearch(query: string, maxResults: number): Promise<ToolResult> {
  if (!query.trim()) {
    return { success: false, output: '', error: 'Search query is required' };
  }

  try {
    // Use DuckDuckGo Instant Answer API (no API key needed)
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;

    const data = await httpGet(url);
    const parsed = JSON.parse(data);

    const results: string[] = [];

    // Abstract
    if (parsed.AbstractText) {
      results.push(`📖 ${parsed.AbstractText}`);
      if (parsed.AbstractURL) {
        results.push(`   Source: ${parsed.AbstractURL}`);
      }
      results.push('');
    }

    // Related Topics
    const topics = parsed.RelatedTopics || [];
    for (const topic of topics.slice(0, maxResults)) {
      if (topic.Text) {
        results.push(`• ${topic.Text}`);
        if (topic.FirstURL) {
          results.push(`  ${topic.FirstURL}`);
        }
      }
    }

    return {
      success: true,
      output: results.join('\n') || `No results found for "${query}"`,
    };
  } catch (err: any) {
    return { success: false, output: '', error: `Web search error: ${err.message}` };
  }
}

async function webFetch(url: string): Promise<ToolResult> {
  if (!url.trim()) {
    return { success: false, output: '', error: 'URL is required' };
  }

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { success: false, output: '', error: `Invalid URL: ${url}` };
  }

  // Only allow http and https
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { success: false, output: '', error: `Unsupported protocol: ${parsedUrl.protocol}` };
  }

  try {
    const data = await httpGet(url);

    // Extract text from HTML (simple)
    const text = extractText(data);

    // Truncate
    if (text.length > 10000) {
      return {
        success: true,
        output: text.substring(0, 10000) + `\n\n... (truncated from ${text.length} chars)`,
      };
    }

    return { success: true, output: text };
  } catch (err: any) {
    return { success: false, output: '', error: `Web fetch error: ${err.message}` };
  }
}

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;

    const req = mod.get(
      url,
      {
        headers: {
          'User-Agent': 'fundeepseek/1.0 (CLI programming tool)',
          'Accept': 'application/json, text/html, text/plain, */*',
        },
        timeout: 15000,
      },
      (res) => {
        // Follow redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          httpGet(res.headers.location).then(resolve).catch(reject);
          return;
        }

        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function extractText(html: string): string {
  // Simple HTML text extraction
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}
