// ============================================================
// Terminal UI Renderer — rich visual output
// Handles: banners, thinking boxes, code blocks,
// tool progress, markdown, status bars
// ============================================================
import chalk from 'chalk';

// ANSI control sequences
const CSI = '\x1b[';
const HIDE_CURSOR = CSI + '?25l';
const SHOW_CURSOR = CSI + '?25h';
const CLEAR_LINE = CSI + '2K';
const CURSOR_UP = (n: number) => CSI + n + 'A';
const SAVE_CURSOR = CSI + 's';
const RESTORE_CURSOR = CSI + 'u';

// Terminal dimensions
function termWidth(): number {
  return process.stdout.columns || 80;
}

function termHeight(): number {
  return process.stdout.rows || 24;
}

// ═══════════════════════════════════════════════════════════
// SECTION: Banner
// ═══════════════════════════════════════════════════════════

export function renderBanner(options: {
  model: string;
  mode: string;
  thinking: string;
  projectRoot: string;
  version?: string;
}): string {
  const w = Math.min(termWidth(), 90);
  const boxTop = '╔' + '═'.repeat(w - 2) + '╗';
  const boxBot = '╚' + '═'.repeat(w - 2) + '╝';
  const pad = (s: string, width: number) => {
    const visible = s.replace(/\x1b\[[0-9;]*m/g, '');
    return s + ' '.repeat(Math.max(0, width - visible.length));
  };

  const version = options.version || '1.0.0';
  const titleLine = centerText(`FundeePseek v${version}`, w - 2, 'bold', 'cyan');

  // Model/Mode/Thinking status line
  const statusParts = [
    chalk.blue('●') + ' ' + chalk.white(options.model),
    chalk.green('◆') + ' ' + chalk.white(options.mode + ' mode'),
    chalk.yellow('◈') + ' ' + chalk.white('thinking: ' + options.thinking),
  ];
  const statusLine = centerText(statusParts.join('  │  '), w - 2);

  // Project line
  const projectLine = chalk.gray('  📁 ' + truncatePath(options.projectRoot, w - 10));

  return [
    chalk.cyan(boxTop),
    chalk.cyan('║') + chalk.bold.cyan(titleLine) + chalk.cyan('║'),
    chalk.cyan('║') + statusLine + chalk.cyan('║'),
    chalk.cyan(boxBot),
    projectLine,
    '',
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════
// SECTION: Thinking / Reasoning Display
// ═══════════════════════════════════════════════════════════

let thinkingActive = false;
let thinkingBuffer = '';

export function startThinking(): void {
  thinkingActive = true;
  thinkingBuffer = '';
  process.stdout.write('\n' + chalk.yellow.bold('🤔 Deep Thinking') + chalk.gray(' ─'.repeat(40)) + '\n');
}

export function appendThinking(text: string): void {
  if (!thinkingActive) {
    startThinking();
  }
  thinkingBuffer += text;
  // Display last few lines of thinking
  const lines = thinkingBuffer.split('\n');
  const recent = lines.slice(-3).join('\n');
  process.stdout.write(CURSOR_UP(1) + CLEAR_LINE + '\r');
  process.stdout.write(chalk.yellow.dim(recent) + '\n');
}

export function endThinking(): string {
  if (!thinkingActive) return thinkingBuffer;
  thinkingActive = false;
  process.stdout.write(chalk.gray('─'.repeat(55)) + '\n\n');
  const result = thinkingBuffer;
  thinkingBuffer = '';
  return result;
}

// ═══════════════════════════════════════════════════════════
// SECTION: Streaming Response
// ═══════════════════════════════════════════════════════════

let streamLineBuffer = '';
let streamLineLength = 0;

export function writeStream(text: string): void {
  // Close thinking if active
  if (thinkingActive) {
    endThinking();
  }

  for (const char of text) {
    if (char === '\n') {
      process.stdout.write('\n');
      streamLineBuffer = '';
      streamLineLength = 0;
    } else {
      process.stdout.write(char);
      streamLineBuffer += char;
      streamLineLength++;
    }
  }
}

// ═══════════════════════════════════════════════════════════
// SECTION: Markdown Rendering
// ═══════════════════════════════════════════════════════════

export function renderMarkdown(md: string): string {
  // Simple but effective terminal markdown renderer
  const w = termWidth();
  let result = md;

  // Code blocks with border
  result = result.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, lang, code) => {
      const lines = code.trimEnd().split('\n');
      const border = chalk.gray('┌' + '─'.repeat(Math.min(w - 4, 60)) + '┐');
      const langTag = lang ? chalk.cyan(` ${lang} `) : '';
      const rendered = lines
        .map((l: string, i: number) => {
          const num = chalk.gray(String(i + 1).padStart(3, ' ') + ' │ ');
          return num + l;
        })
        .join('\n');
      return '\n' + border + '\n' + langTag + '\n' + rendered + '\n' + chalk.gray('└' + '─'.repeat(Math.min(w - 4, 60)) + '┘') + '\n';
    }
  );

  // Inline code
  result = result.replace(/`([^`\n]+?)`/g, (_, code) => chalk.cyan.bgBlack(' ' + code + ' '));

  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, (_, text) => chalk.bold.white(text));

  // Italic
  result = result.replace(/\*(.+?)\*/g, (_, text) => chalk.italic.gray(text));

  // Headers
  result = result.replace(/^### (.+)$/gm, (_, text) => chalk.bold.underline('\n' + text));
  result = result.replace(/^## (.+)$/gm, (_, text) => chalk.bold.yellow('\n' + text));
  result = result.replace(/^# (.+)$/gm, (_, text) => chalk.bold.cyan('\n' + text));

  // Blockquotes
  result = result.replace(/^> (.+)$/gm, (_, text) => chalk.gray('  │ ') + chalk.italic.dim(text));

  // Horizontal rules
  result = result.replace(/^---$/gm, chalk.gray('─'.repeat(Math.min(w - 4, 60))));

  // Lists
  result = result.replace(/^[*-] (.+)$/gm, (_, text) => chalk.white('  • ') + text);

  return result;
}

export function printMarkdown(md: string): void {
  // Try to use the marked-terminal renderer if available
  try {
    const { marked } = require('marked');
    const { TerminalRenderer } = require('marked-terminal');

    marked.setOptions({
      renderer: new TerminalRenderer({
        code: chalk.gray,
        blockquote: chalk.gray.italic,
        heading: chalk.bold.cyan,
        firstHeading: chalk.bold.cyan,
        hr: chalk.gray,
        listitem: chalk.white,
        table: chalk.gray,
        paragraph: chalk.white,
        strong: chalk.bold,
        em: chalk.italic,
      }),
    });

    process.stdout.write(marked.parse(md));
  } catch {
    // Fallback to our simple renderer
    process.stdout.write(renderMarkdown(md));
  }
}

// ═══════════════════════════════════════════════════════════
// SECTION: Tool Progress Display
// ═══════════════════════════════════════════════════════════

const TOOL_ICONS: Record<string, string> = {
  read_file: '📖',
  write_file: '✏️',
  edit_file: '🔧',
  bash: '⚡',
  grep: '🔍',
  glob: '📂',
  git: '🔀',
  web: '🌐',
};

let currentToolSpinner: ReturnType<typeof setInterval> | null = null;
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIdx = 0;

export function startToolProgress(toolName: string, args: string): void {
  stopToolProgress();
  spinnerIdx = 0;

  const icon = TOOL_ICONS[toolName] || '🔨';
  const shortArgs = truncateText(tryParseArgsPreview(toolName, args), termWidth() - 20);

  const line = () => {
    const frame = chalk.cyan(spinnerFrames[spinnerIdx % spinnerFrames.length]);
    return `  ${frame} ${icon} ${chalk.white(toolName)} ${chalk.gray.dim(shortArgs)}`;
  };

  process.stdout.write(line());

  currentToolSpinner = setInterval(() => {
    spinnerIdx++;
    process.stdout.write('\r' + CLEAR_LINE + '\r' + line());
  }, 80);
}

export function finishToolProgress(toolName: string, success: boolean, detail?: string): void {
  stopToolProgress();
  const icon = TOOL_ICONS[toolName] || '🔨';
  const status = success ? chalk.green('✓') : chalk.red('✗');
  const info = detail ? chalk.gray(' (' + detail + ')') : '';
  process.stdout.write('\r' + CLEAR_LINE + '\r');
  process.stdout.write(`  ${icon} ${chalk.white(toolName)} ${status}${info}\n`);
}

export function stopToolProgress(): void {
  if (currentToolSpinner) {
    clearInterval(currentToolSpinner);
    currentToolSpinner = null;
  }
}

// ═══════════════════════════════════════════════════════════
// SECTION: Status Bar
// ═══════════════════════════════════════════════════════════

export function renderStatusBar(stats: {
  messages: number;
  tokens: number;
  maxTokens: number;
  cost: number;
  mode: string;
  model: string;
}): string {
  const w = termWidth();
  const percent = Math.round((stats.tokens / stats.maxTokens) * 100);
  const barLen = 20;
  const filled = Math.round((percent / 100) * barLen);
  const bar = chalk.green('█'.repeat(Math.min(filled, barLen))) + chalk.gray('░'.repeat(Math.max(0, barLen - filled)));

  const left = [
    chalk.cyan('●') + ' ' + chalk.white(stats.model),
    chalk.magenta('◆') + ' ' + chalk.white(stats.mode),
  ].join('  ');

  const center = `${chalk.white(stats.messages + ' msgs')}  ${bar}  ${chalk.white(percent + '%')}  ${chalk.yellow('$' + stats.cost.toFixed(4))}`;

  const right = chalk.gray(`ctx: ${formatTokenCount(stats.tokens)}/${formatTokenCount(stats.maxTokens)}`);

  const spacer = Math.max(2, w - stripAnsi(left).length - stripAnsi(center).length - stripAnsi(right).length);
  return '\n' + chalk.bgBlack.white(left + ' '.repeat(spacer / 2) + center + ' '.repeat(spacer / 2) + right) + '\n';
}

// ═══════════════════════════════════════════════════════════
// SECTION: Prompt
// ═══════════════════════════════════════════════════════════

export function getPrompt(mode: string): string {
  const icons: Record<string, string> = {
    auto: '🚀',
    plan: '📋',
    ask: '💬',
    chat: '🗨️',
  };
  const icon = icons[mode] || '>';

  // Multi-color gradient prompt
  return chalk.bold.cyan(icon + ' dsc') + chalk.cyan(' › ');
}

// ═══════════════════════════════════════════════════════════
// SECTION: Utility
// ═══════════════════════════════════════════════════════════

function centerText(text: string, width: number, style?: string, color?: string): string {
  const visible = text.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = Math.max(0, width - visible.length);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

function truncatePath(p: string, maxLen: number): string {
  if (p.length <= maxLen) return p;
  const parts = p.replace(/\\/g, '/').split('/');
  if (parts.length <= 2) return '...' + p.substring(p.length - maxLen + 3);
  return parts[0] + '/.../' + parts[parts.length - 1];
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 3) + '...';
}

function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1000000) return (n / 1000).toFixed(1) + 'K';
  return (n / 1000000).toFixed(1) + 'M';
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function tryParseArgsPreview(toolName: string, args: string): string {
  try {
    const parsed = JSON.parse(args);
    switch (toolName) {
      case 'read_file':
        return truncatePath(parsed.file_path || '', 40);
      case 'write_file':
        return truncatePath(parsed.file_path || '', 40);
      case 'edit_file':
        return truncatePath(parsed.file_path || '', 40);
      case 'bash':
        return parsed.description || truncateText(parsed.command || '', 40);
      case 'grep':
        return `"${truncateText(parsed.pattern || '', 30)}"`;
      case 'glob':
        return parsed.pattern || '';
      case 'git':
        return parsed.operation || '';
      case 'web':
        return parsed.action + (parsed.query ? ': ' + truncateText(parsed.query, 30) : '');
      default:
        return '';
    }
  } catch {
    return truncateText(args, 40);
  }
}

// ═══════════════════════════════════════════════════════════
// SECTION: Messages & Notifications
// ═══════════════════════════════════════════════════════════

export function printInfo(msg: string): void {
  process.stdout.write(chalk.blue('  ℹ ') + chalk.white(msg) + '\n');
}

export function printSuccess(msg: string): void {
  process.stdout.write(chalk.green('  ✓ ') + chalk.white(msg) + '\n');
}

export function printWarning(msg: string): void {
  process.stdout.write(chalk.yellow('  ⚠ ') + chalk.white(msg) + '\n');
}

export function printError(msg: string): void {
  process.stdout.write(chalk.red('  ✗ ') + chalk.white(msg) + '\n');
}

export function printDivider(char: string = '─'): void {
  const w = termWidth();
  process.stdout.write(chalk.gray(char.repeat(Math.min(w, 80))) + '\n');
}

export function printBlank(): void {
  process.stdout.write('\n');
}

export function hideCursor(): void {
  process.stdout.write(HIDE_CURSOR);
}

export function showCursor(): void {
  process.stdout.write(SHOW_CURSOR);
}

export function clearScreen(): void {
  process.stdout.write(CSI + '2J' + CSI + 'H');
}

// ═══════════════════════════════════════════════════════════
// SECTION: Session Summary
// ═══════════════════════════════════════════════════════════

export function renderSessionSummary(stats: {
  model: string;
  mode: string;
  messages: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cost: number;
  rounds: number;
  duration: number;
}): string {
  const lines = [
    '',
    chalk.gray('┌' + '─'.repeat(40) + '┐'),
    chalk.gray('│') + chalk.bold('  📊 Session Summary') + ' '.repeat(19) + chalk.gray('│'),
    chalk.gray('│') + ' '.repeat(40) + chalk.gray('│'),
    chalk.gray('│') + `  Model:      ${chalk.white(stats.model)}` + ' '.repeat(Math.max(0, 22 - stats.model.length)) + chalk.gray('│'),
    chalk.gray('│') + `  Mode:       ${chalk.white(stats.mode)}` + ' '.repeat(Math.max(0, 22 - stats.mode.length)) + chalk.gray('│'),
    chalk.gray('│') + `  Messages:   ${chalk.white(String(stats.messages))}` + ' '.repeat(Math.max(0, 22 - String(stats.messages).length)) + chalk.gray('│'),
    chalk.gray('│') + `  Prompt:     ${chalk.white(formatTokenCount(stats.promptTokens))}` + ' '.repeat(Math.max(0, 22 - formatTokenCount(stats.promptTokens).length)) + chalk.gray('│'),
    chalk.gray('│') + `  Completion: ${chalk.white(formatTokenCount(stats.completionTokens))}` + ' '.repeat(Math.max(0, 22 - formatTokenCount(stats.completionTokens).length)) + chalk.gray('│'),
    chalk.gray('│') + `  Reasoning:  ${chalk.white(formatTokenCount(stats.reasoningTokens))}` + ' '.repeat(Math.max(0, 22 - formatTokenCount(stats.reasoningTokens).length)) + chalk.gray('│'),
    chalk.gray('│') + `  Rounds:     ${chalk.white(String(stats.rounds))}` + ' '.repeat(Math.max(0, 22 - String(stats.rounds).length)) + chalk.gray('│'),
    chalk.gray('│') + `  Cost:       ${chalk.yellow('$' + stats.cost.toFixed(4))}` + ' '.repeat(Math.max(0, 22 - ('$' + stats.cost.toFixed(4)).length)) + chalk.gray('│'),
    chalk.gray('│') + `  Duration:   ${chalk.white(formatDuration(stats.duration))}` + ' '.repeat(Math.max(0, 22 - formatDuration(stats.duration).length)) + chalk.gray('│'),
    chalk.gray('└' + '─'.repeat(40) + '┘'),
    '',
  ];
  return lines.join('\n');
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return minutes + 'm ' + secs + 's';
}
