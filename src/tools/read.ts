// ============================================================
// Read File Tool
// ============================================================
import * as fs from 'fs';
import * as path from 'path';
import { ToolResult } from '../types';

export async function readFile(args: {
  file_path: string;
  offset?: number;
  limit?: number;
}): Promise<ToolResult> {
  try {
    const filePath = path.resolve(args.file_path);

    // Security: prevent reading sensitive system files
    if (isSensitivePath(filePath)) {
      return {
        success: false,
        output: '',
        error: 'Access denied: cannot read sensitive system files',
      };
    }

    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        output: '',
        error: `File not found: ${filePath}`,
      };
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      // List directory contents
      const entries = fs.readdirSync(filePath, { withFileTypes: true });
      const listing = entries
        .map((e) => {
          const prefix = e.isDirectory() ? 'drwxr-xr-x' : '-rw-r--r--';
          const size = e.isDirectory() ? '—' : formatSize(fs.statSync(path.join(filePath, e.name)).size);
          return `${prefix}  ${size.padStart(8)}  ${e.name}${e.isDirectory() ? '/' : ''}`;
        })
        .join('\n');
      return { success: true, output: listing };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const totalLines = lines.length;

    let start = (args.offset || 1) - 1;
    let end = args.limit ? start + args.limit : totalLines;

    // Clamp
    start = Math.max(0, Math.min(start, totalLines - 1));
    end = Math.max(start, Math.min(end, totalLines));

    const selectedLines = lines.slice(start, end);
    const numbered = selectedLines.map((line, i) => {
      const num = String(start + i + 1).padStart(String(totalLines).length, ' ');
      return `${num}\t${line}`;
    });

    let output = numbered.join('\n');
    if (start > 0 || end < totalLines) {
      output += `\n\n--- Showing lines ${start + 1}-${end} of ${totalLines} ---`;
    }

    return { success: true, output };
  } catch (err: any) {
    return { success: false, output: '', error: `Read error: ${err.message}` };
  }
}

function isSensitivePath(filePath: string): boolean {
  const sensitive = [
    '/etc/shadow',
    '/etc/passwd',
    '/proc',
    '/sys',
    '~/.ssh',
    '.env',
  ];
  return sensitive.some((s) => filePath.includes(s));
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
