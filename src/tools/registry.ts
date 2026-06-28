// ============================================================
// Tool Registry — manages all available tools,
// permission checks, and execution
// ============================================================
import { ToolDefinition, ToolResult, ToolCall, AgentMode, MODES } from '../types';
import { readFile } from './read';
import { writeFile } from './write';
import { editFile } from './edit';
import { runBash } from './bash';
import { grepCode } from './grep';
import { globFiles } from './glob';
import { gitOps } from './git';
import { webOps } from './web';

export type ToolHandler = (args: any) => Promise<ToolResult>;

export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
  /** 'safe' = no harm, 'warn' = could modify, 'danger' = executes arbitrary code */
  dangerLevel: 'safe' | 'warn' | 'danger';
}

// ---- All Tool Definitions ----

const TOOL_DEFS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read the contents of a file at the given path. You can optionally specify an offset and limit for long files. Returns the file content with line numbers.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the file to read' },
          offset: { type: 'integer', description: 'Line number to start reading from (optional)' },
          limit: { type: 'integer', description: 'Maximum number of lines to read (optional)' },
        },
        required: ['file_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Create a new file or overwrite an existing one. Use this for creating new files. For modifying existing files, prefer edit_file.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the file to write' },
          content: { type: 'string', description: 'The complete content to write to the file' },
        },
        required: ['file_path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Perform exact string replacements in an existing file. Provide the old string to replace and the new string. The old_string must match exactly (including whitespace).',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the file to edit' },
          old_string: { type: 'string', description: 'The exact text to find and replace' },
          new_string: { type: 'string', description: 'The replacement text' },
          replace_all: {
            type: 'boolean',
            description: 'Replace all occurrences (default: false)',
            default: false,
          },
        },
        required: ['file_path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bash',
      description:
        'Execute a shell command. Returns stdout and stderr. Commands run in a sandbox. Dangerous commands (rm -rf, etc.) are blocked.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
          description: {
            type: 'string',
            description: 'A short description of what this command does (for permission prompts)',
          },
          timeout: {
            type: 'integer',
            description: 'Timeout in milliseconds (default: 120000, max: 600000)',
          },
          workdir: {
            type: 'string',
            description: 'Working directory for the command (optional, defaults to project root)',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description:
        'Search file contents using regular expressions. Uses ripgrep-compatible syntax. Can filter by file glob pattern.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'The regex pattern to search for' },
          path: { type: 'string', description: 'File or directory to search in (defaults to project root)' },
          glob: { type: 'string', description: 'Glob pattern to filter files (e.g., "*.ts")' },
          case_insensitive: { type: 'boolean', description: 'Case insensitive search (default: false)' },
          output_mode: {
            type: 'string',
            enum: ['content', 'files_with_matches', 'count'],
            description: 'Output mode (default: files_with_matches)',
          },
          context: {
            type: 'integer',
            description: 'Number of lines to show before and after each match',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description:
        'Fast file pattern matching. Supports standard glob patterns like "**/*.ts" or "src/**/*.js". Returns matching file paths sorted by modification time.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'The glob pattern to match files against' },
          path: {
            type: 'string',
            description: 'Directory to search in (optional, defaults to current working directory)',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git',
      description:
        'Execute git operations: status, diff, log, add, commit, branch, checkout, etc. Write operations (commit, push, etc.) require confirmation.',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['status', 'diff', 'log', 'add', 'commit', 'branch', 'checkout', 'pull', 'push', 'stash', 'reset'],
            description: 'The git operation to perform',
          },
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional arguments for the git command',
          },
          message: {
            type: 'string',
            description: 'Commit message (required for commit operation)',
          },
        },
        required: ['operation'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web',
      description:
        'Search the web or fetch content from a URL. Use for looking up documentation, finding solutions, or getting current information.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['search', 'fetch'],
            description: 'Action: search queries the web, fetch retrieves a specific URL',
          },
          query: {
            type: 'string',
            description: 'Search query (required for search action)',
          },
          url: {
            type: 'string',
            description: 'URL to fetch (required for fetch action)',
          },
          max_results: {
            type: 'integer',
            description: 'Maximum number of search results (default: 5)',
          },
        },
        required: ['action'],
      },
    },
  },
];

// ---- Tool Registry ----

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  constructor() {
    this.registerAll();
  }

  /** Get all tool definitions for API calls */
  getDefinitions(mode: AgentMode): ToolDefinition[] {
    const modeConfig = MODES[mode];
    const available: ToolDefinition[] = [];

    for (const [name, tool] of this.tools) {
      // Filter by mode permissions
      if (!modeConfig.canRead && this.isReadTool(name)) continue;
      if (!modeConfig.canWrite && this.isWriteTool(name)) continue;
      if (!modeConfig.canExecute && this.isExecuteTool(name)) continue;
      if (!modeConfig.canSearch && this.isSearchTool(name)) continue;
      available.push(tool.definition);
    }

    return available;
  }

  /** Execute a tool call and return the result */
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const name = toolCall.function.name;
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, output: '', error: `Unknown tool: ${name}` };
    }

    try {
      const args = JSON.parse(toolCall.function.arguments);
      return await tool.handler(args);
    } catch (err: any) {
      return {
        success: false,
        output: '',
        error: `Tool execution error: ${err.message}`,
      };
    }
  }

  /** Get danger level for a tool */
  getDangerLevel(name: string): 'safe' | 'warn' | 'danger' {
    return this.tools.get(name)?.dangerLevel || 'danger';
  }

  /** Check if a tool needs user confirmation */
  needsConfirm(name: string, mode: AgentMode): boolean {
    const modeConfig = MODES[mode];
    if (!modeConfig.requireConfirm) return false;
    const level = this.getDangerLevel(name);
    return level === 'warn' || level === 'danger';
  }

  // ---- Private ----

  private registerAll(): void {
    this.tools.set('read_file', { definition: TOOL_DEFS[0], handler: readFile, dangerLevel: 'safe' });
    this.tools.set('write_file', { definition: TOOL_DEFS[1], handler: writeFile, dangerLevel: 'warn' });
    this.tools.set('edit_file', { definition: TOOL_DEFS[2], handler: editFile, dangerLevel: 'warn' });
    this.tools.set('bash', { definition: TOOL_DEFS[3], handler: runBash, dangerLevel: 'danger' });
    this.tools.set('grep', { definition: TOOL_DEFS[4], handler: grepCode, dangerLevel: 'safe' });
    this.tools.set('glob', { definition: TOOL_DEFS[5], handler: globFiles, dangerLevel: 'safe' });
    this.tools.set('git', { definition: TOOL_DEFS[6], handler: gitOps, dangerLevel: 'warn' });
    this.tools.set('web', { definition: TOOL_DEFS[7], handler: webOps, dangerLevel: 'safe' });
  }

  private isReadTool(name: string): boolean {
    return ['read_file', 'grep', 'glob'].includes(name);
  }

  private isWriteTool(name: string): boolean {
    return ['write_file', 'edit_file'].includes(name);
  }

  private isExecuteTool(name: string): boolean {
    return ['bash'].includes(name);
  }

  private isSearchTool(name: string): boolean {
    return ['web'].includes(name);
  }
}
