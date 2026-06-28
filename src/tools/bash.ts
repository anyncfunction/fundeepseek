// ============================================================
// Bash Tool — execute shell commands in sandbox
// ============================================================
import { exec, ExecOptions } from 'child_process';
import { ToolResult } from '../types';

// Commands that require explicit user confirmation
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//,
  /:\s*\{\s*:\|:&\s*\};/,
  />\s*\/dev\/sda/,
  /mkfs\./,
  /dd\s+if=/,
  /chmod\s+777\s+\//,
  /chown\s+-R/,
  />\s*\/etc\//,
];

export async function runBash(args: {
  command: string;
  description?: string;
  timeout?: number;
  workdir?: string;
}): Promise<ToolResult> {
  try {
    // Danger check
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(args.command)) {
        return {
          success: false,
          output: '',
          error: `Blocked dangerous command: '${args.command}' matches forbidden pattern. If this is intentional, run it directly in your terminal.`,
        };
      }
    }

    const timeout = Math.min(args.timeout || 120000, 600000);
    const options: ExecOptions = {
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      cwd: args.workdir || process.cwd(),
      windowsHide: true as any,
      shell: 'bash' as any,
    };

    const result = await execPromise(args.command, options);

    return {
      success: true,
      output: result.stdout || result.stderr || '(no output)',
      metadata: {
        exitCode: result.exitCode,
        duration: result.duration,
      },
    };
  } catch (err: any) {
    if (err.killed) {
      return { success: false, output: '', error: `Command timed out after ${args.timeout}ms` };
    }
    return {
      success: false,
      output: err.stdout || '',
      error: err.stderr || err.message || 'Command failed',
    };
  }
}

function execPromise(
  command: string,
  options: ExecOptions
): Promise<{ stdout: string; stderr: string; exitCode: number; duration: number }> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    exec(command, options, (error: any, stdout: any, stderr: any) => {
      const duration = Date.now() - start;
      if (error && !stdout && !stderr) {
        reject({ ...error, stdout, stderr, duration });
      } else {
        resolve({
          stdout: String(stdout || '').trim(),
          stderr: String(stderr || '').trim(),
          exitCode: error?.code || 0,
          duration,
        });
      }
    });
  });
}
