// ============================================================
// Git Tool — git operations wrapper
// ============================================================
import { exec } from 'child_process';
import { ToolResult } from '../types';

const READ_ONLY_OPS = ['status', 'diff', 'log', 'branch'];
const WRITE_OPS = ['add', 'commit', 'checkout', 'pull', 'push', 'stash', 'reset'];

export async function gitOps(args: {
  operation: string;
  args?: string[];
  message?: string;
}): Promise<ToolResult> {
  try {
    const { operation } = args;
    const extraArgs = args.args || [];

    if (![...READ_ONLY_OPS, ...WRITE_OPS].includes(operation)) {
      return {
        success: false,
        output: '',
        error: `Unknown git operation: ${operation}. Supported: ${[...READ_ONLY_OPS, ...WRITE_OPS].join(', ')}`,
      };
    }

    // Build command
    let command = `git ${operation}`;

    switch (operation) {
      case 'commit':
        if (!args.message) {
          return { success: false, output: '', error: 'Commit requires a message parameter' };
        }
        command += ` -m "${args.message.replace(/"/g, '\\"')}"`;
        break;
      case 'checkout':
        if (extraArgs.length > 0) {
          command += ` ${extraArgs.join(' ')}`;
        }
        break;
      default:
        if (extraArgs.length > 0) {
          command += ` ${extraArgs.join(' ')}`;
        }
    }

    const { stdout, stderr } = await execPromise(command, 30000);
    const output = stdout || stderr || '(no output)';

    // Truncate large outputs
    const lines = output.split('\n');
    if (lines.length > 200) {
      return {
        success: true,
        output: lines.slice(0, 200).join('\n') + `\n\n... (${lines.length - 200} more lines)`,
      };
    }

    return { success: true, output };
  } catch (err: any) {
    return {
      success: false,
      output: err.stdout || '',
      error: err.stderr || err.message || 'Git command failed',
    };
  }
}

function execPromise(
  command: string,
  timeout: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(
      command,
      { timeout, maxBuffer: 5 * 1024 * 1024, cwd: process.cwd() },
      (error, stdout, stderr) => {
        if (error && !stdout && !stderr) {
          reject(error);
        } else {
          resolve({ stdout: stdout?.trim() || '', stderr: stderr?.trim() || '' });
        }
      }
    );
  });
}
