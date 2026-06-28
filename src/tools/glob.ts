// ============================================================
// Glob Tool — file pattern matching
// ============================================================
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { ToolResult } from '../types';

export async function globFiles(args: {
  pattern: string;
  path?: string;
}): Promise<ToolResult> {
  try {
    const searchPath = args.path || process.cwd();
    const results: Array<{ path: string; mtime: Date; size: number }> = [];

    walkAndMatch(searchPath, args.pattern, results, 1000);

    // Sort by modification time, newest first
    results.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    const output = results
      .slice(0, 500)
      .map((r) => `${r.path}  (${formatSize(r.size)}, ${r.mtime.toISOString().split('T')[0]})`)
      .join('\n');

    return {
      success: true,
      output: output || 'No files matched.',
    };
  } catch (err: any) {
    return { success: false, output: '', error: `Glob error: ${err.message}` };
  }
}

function walkAndMatch(
  dir: string,
  pattern: string,
  results: Array<{ path: string; mtime: Date; size: number }>,
  maxResults: number
): void {
  if (results.length >= maxResults) return;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxResults) return;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(process.cwd(), fullPath);

      // Skip common directories
      if (
        entry.isDirectory() &&
        ['node_modules', '.git', '.svn', '__pycache__', '.cache', 'dist', 'build'].includes(entry.name)
      ) {
        continue;
      }

      const normalizedRelative = relativePath.replace(/\\/g, '/');

      if (minimatch(normalizedRelative, pattern) || minimatch(entry.name, pattern)) {
        try {
          const stat = fs.statSync(fullPath);
          results.push({ path: normalizedRelative, mtime: stat.mtime, size: stat.size });
        } catch {
          // skip inaccessible
        }
      }

      if (entry.isDirectory()) {
        walkAndMatch(fullPath, pattern, results, maxResults);
      }
    }
  } catch {
    // skip unreadable directories
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
