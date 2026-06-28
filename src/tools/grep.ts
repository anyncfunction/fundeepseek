// ============================================================
// Grep Tool — regex code search (ripgrep-compatible)
// ============================================================
import { exec } from 'child_process';
import { ToolResult } from '../types';

export async function grepCode(args: {
  pattern: string;
  path?: string;
  glob?: string;
  case_insensitive?: boolean;
  output_mode?: 'content' | 'files_with_matches' | 'count';
  context?: number;
}): Promise<ToolResult> {
  try {
    const searchPath = args.path || process.cwd();
    const flags: string[] = ['--no-heading', '--with-filename'];

    if (args.case_insensitive) flags.push('-i');
    if (args.glob) flags.push('--glob', args.glob);
    if (args.context) flags.push('-C', String(args.context));

    switch (args.output_mode) {
      case 'files_with_matches':
        flags.push('-l');
        break;
      case 'count':
        flags.push('-c');
        break;
      case 'content':
      default:
        flags.push('-n'); // line numbers
        break;
    }

    // Escape special chars for shell
    const escapedPattern = args.pattern.replace(/'/g, "'\\''");
    const command = `rg ${flags.join(' ')} '${escapedPattern}' "${searchPath}"`;

    const result = await execPromise(command, { timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
    const output = result.stdout || 'No matches found.';

    // Truncate if too long
    const lines = output.split('\n');
    if (lines.length > 500) {
      return {
        success: true,
        output: lines.slice(0, 500).join('\n') + `\n\n... (${lines.length - 500} more lines, results truncated)`,
      };
    }

    return { success: true, output };
  } catch (err: any) {
    if (err.code === 1) {
      // rg returns 1 for no matches
      return { success: true, output: 'No matches found.' };
    }
    // If rg not found, try grep fallback
    if (err.code === 127 || err.message?.includes('not found')) {
      return grepFallback(args);
    }
    return { success: false, output: '', error: `Grep error: ${err.stderr || err.message}` };
  }
}

async function grepFallback(args: {
  pattern: string;
  path?: string;
  case_insensitive?: boolean;
  output_mode?: string;
}): Promise<ToolResult> {
  // fallback to node's fs-based search when rg is unavailable
  const fs = await import('fs');
  const pathLib = await import('path');
  const searchPath = args.path || process.cwd();
  const flags = args.case_insensitive ? 'i' : '';
  const regex = new RegExp(args.pattern, flags + 'g');

  const results: string[] = [];
  const MAX_FILES = 100;
  let filesScanned = 0;

  function walk(dir: string) {
    if (filesScanned >= MAX_FILES) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (filesScanned >= MAX_FILES) return;
        const fullPath = pathLib.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            walk(fullPath);
          }
        } else if (entry.isFile() && isTextFile(entry.name)) {
          filesScanned++;
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                regex.lastIndex = 0;
                if (args.output_mode === 'files_with_matches') {
                  results.push(fullPath);
                  break;
                } else if (args.output_mode === 'count') {
                  // handled below
                } else {
                  results.push(`${fullPath}:${i + 1}: ${lines[i].trim()}`);
                }
              }
            }
            if (args.output_mode === 'count' && results.length > 0) {
              // Replace with count
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    } catch {
      // skip unreadable dirs
    }
  }

  walk(searchPath);
  return {
    success: true,
    output: results.slice(0, 500).join('\n') || 'No matches found.',
  };
}

function isTextFile(name: string): boolean {
  const extensions = [
    '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.html', '.css',
    '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.hpp', '.rb', '.php',
    '.yaml', '.yml', '.toml', '.xml', '.svg', '.sh', '.bash', '.zsh',
    '.gitignore', '.env', '.editorconfig', '.eslintrc', '.prettierrc',
  ];
  const ext = name.substring(name.lastIndexOf('.'));
  return extensions.includes(ext.toLowerCase()) || !name.includes('.');
}

function execPromise(
  command: string,
  options: { timeout: number; maxBuffer: number }
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error && error.code !== 1) {
        reject({ ...error, stdout, stderr });
      } else {
        resolve({ stdout: stdout?.trim() || '', stderr: stderr?.trim() || '', code: error?.code || 0 });
      }
    });
  });
}
