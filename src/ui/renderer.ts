// ============================================================
// Terminal UI Renderer — Claude Code style layout
// ╭─ header ───╮  ╭─ left pane ──╮ ╭─ right pane ──╮  ╰─ footer ─╯
// ═══════════════  > prompt       ═══════════════════  ◈ status bar
// ============================================================
import chalk from 'chalk';

const CSI = '\x1b[';

// ═══════════════════════════════════════════════════════════
// SECTION: Terminal Helpers
// ═══════════════════════════════════════════════════════════

function termWidth(): number { return process.stdout.columns || 80; }
function termHeight(): number { return process.stdout.rows || 24; }

function strip(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function padRight(s: string, w: number): string {
  return s + ' '.repeat(Math.max(0, w - strip(s)));
}

function padLeft(s: string, w: number): string {
  return ' '.repeat(Math.max(0, w - strip(s))) + s;
}

function center(s: string, w: number): string {
  const sw = strip(s);
  const left = Math.floor((w - sw) / 2);
  return ' '.repeat(Math.max(0, left)) + s + ' '.repeat(Math.max(0, w - sw - left));
}

// ═══════════════════════════════════════════════════════════
// SECTION: ASCII Art Logo
// ═══════════════════════════════════════════════════════════

const LOGO_FISH = [
  '       ▄████████▄        ',
  '      ██▀└────└▀██       ',
  '     █▀          ▀█      ',
  '    █▌   ▐▌  ▐▌   ▐█     ',
  '    ██▄▄████████▄▄██     ',
  '     ▀█▀▀▀▀▀▀▀▀▀█▀      ',
];

const LOGO_DS = [
  '      🐋  DeepSeek       ',
  '   ═══════════════════   ',
  '   深海 · 探索 · 编程     ',
];

// ═══════════════════════════════════════════════════════════
// SECTION: Banner — ╭─── title ───╮ style header
// ═══════════════════════════════════════════════════════════

export function renderBanner(options: {
  title: string;
  subtitle?: string;
  width?: number;
}): string {
  const w = options.width || termWidth();
  const title = ` FundeePseek v1.0.0 `;
  const dash = '─'.repeat(Math.max(0, w - strip(title) - 2));
  return chalk.cyan('╭' + title + dash + '╮');
}

export function renderFooter(): string {
  const w = termWidth();
  return chalk.cyan('╰' + '─'.repeat(w - 2) + '╯');
}

// ═══════════════════════════════════════════════════════════
// SECTION: Welcome Screen — Two-column layout
// ═══════════════════════════════════════════════════════════

export function renderWelcome(options: {
  model: string;
  mode: string;
  projectRoot: string;
  hasKey: boolean;
}): string {
  const w = termWidth() - 2; // inside borders
  const leftW = Math.floor(w * 0.42);
  const rightW = w - leftW;
  const h = 12; // content height

  const lines: string[] = [];

  // Top border
  const titlePart = ' FundeePseek v1.0.0 ';
  const dash = '─'.repeat(Math.max(0, w - strip(titlePart)));
  lines.push(chalk.cyan('╭' + titlePart + dash + '╮'));

  for (let row = 0; row < h; row++) {
    const left = leftPane(row, leftW, options);
    const right = rightPane(row, rightW, options);
    lines.push(chalk.cyan('│') + left + right + chalk.cyan('│'));
  }

  // Bottom border
  lines.push(chalk.cyan('╰' + '─'.repeat(w) + '╯'));

  return lines.join('\n');
}

function leftPane(row: number, w: number, opts: { model: string; mode: string; projectRoot: string }): string {
  switch (row) {
    case 0: return center(chalk.white.bold('FundeePseek'), w);
    case 1: return center(chalk.cyan('🐋  DeepSeek CLI Coding Agent'), w);
    case 2: return center('', w);
    case 3: return center(LOGO_DS[0], w);
    case 4: return center(LOGO_DS[1], w);
    case 5: return center(LOGO_DS[2], w);
    case 6: return center('', w);
    case 7: return padRight('  ' + chalk.blue('●') + ' ' + chalk.white(opts.model), w);
    case 8: return padRight('  ' + chalk.green('◆') + ' ' + chalk.white(opts.mode + ' mode'), w);
    case 9: return padRight('  ' + chalk.gray('📁 ') + chalk.gray(opts.projectRoot.length > w - 6
      ? '...' + opts.projectRoot.slice(-(w - 12))
      : opts.projectRoot), w);
    case 10: return padRight('  ' + chalk.gray('API Usage Billing'), w);
    case 11: return center(chalk.dim('v1.0.0 · Apache-2.0'), w);
    default: return padRight('', w);
  }
}

function rightPane(row: number, w: number, opts: { hasKey: boolean }): string {
  if (opts.hasKey) {
    // Logged-in tips
    switch (row) {
      case 0: return padRight(chalk.bold.white('Tips for getting started'), w);
      case 1: return padRight(chalk.gray('Type anything to start coding'), w);
      case 2: return padRight(chalk.gray('/help for all commands'), w);
      case 3: return padRight(chalk.gray('/model to switch models'), w);
      case 4: return padRight(chalk.gray('─'.repeat(Math.min(w - 2, 30))), w);
      case 5: return padRight(chalk.bold.white("What's new"), w);
      case 6: return padRight(chalk.gray('4 models: V3 · R1 · V4-Pro · V4-Flash'), w);
      case 7: return padRight(chalk.gray('Thinking mode for deep reasoning'), w);
      case 8: return padRight(chalk.gray('Global memory & user profiling'), w);
      case 9: return padRight(chalk.gray('8 tools for full autonomy'), w);
      case 10: return padRight(chalk.gray('/release-notes for more'), w);
      default: return padRight('', w);
    }
  } else {
    // First-time setup
    switch (row) {
      case 0: return padRight(chalk.bold.yellow('🔑 First Time Setup'), w);
      case 1: return padRight('', w);
      case 2: return padRight(chalk.white.bold('  Type this to start:'), w);
      case 3: return padRight('', w);
      case 4: return padRight(chalk.cyan.bold('  /auth sk-your-api-key'), w);
      case 5: return padRight('', w);
      case 6: return padRight(chalk.gray('─'.repeat(Math.min(w - 2, 30))), w);
      case 7: return padRight(chalk.gray('Get your key:'), w);
      case 8: return padRight(chalk.dim('platform.deepseek.com/api_keys'), w);
      case 9: return padRight('', w);
      case 10: return padRight(chalk.gray('Key saved to ~/.fundeepseek/'), w);
      default: return padRight('', w);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// SECTION: Divider
// ═══════════════════════════════════════════════════════════

export function renderDivider(): string {
  return chalk.gray('─'.repeat(termWidth()));
}

// ═══════════════════════════════════════════════════════════
// SECTION: Status Bar — bottom line with shortcuts
// ═══════════════════════════════════════════════════════════

export function renderStatusBar(opts: {
  mode: string;
  model: string;
  thinking: string;
  tokens?: number;
  cost?: number;
}): string {
  const w = termWidth();
  const left = chalk.gray('  /help for commands · /auto /plan /ask /chat');
  let right = '';

  if (opts.tokens && opts.tokens > 0) {
    right += chalk.gray(formatTokens(opts.tokens) + ' tok · ');
  }
  if (opts.cost && opts.cost > 0) {
    right += chalk.gray('$' + opts.cost.toFixed(4) + ' · ');
  }
  right += chalk.white('◈ ') + chalk.white(opts.mode);
  right += chalk.gray(' · ') + chalk.gray('/' + opts.model);

  const spacer = Math.max(1, w - strip(left) - strip(right));
  return left + ' '.repeat(spacer) + right;
}

// ═══════════════════════════════════════════════════════════
// SECTION: Prompt
// ═══════════════════════════════════════════════════════════

export function getPrompt(): string {
  return chalk.bold.white('> ');
}

// ═══════════════════════════════════════════════════════════
// SECTION: Thinking Display
// ═══════════════════════════════════════════════════════════

let thinkingActive = false;
let thinkingLines: string[] = [];

export function startThinking(): void {
  thinkingActive = true;
  thinkingLines = [];
  process.stdout.write(chalk.yellow.bold('\n  🤔 Thinking') + chalk.gray(' ·'.repeat(10)) + '\n');
}

export function appendThinking(text: string): void {
  if (!thinkingActive) startThinking();
  // Show just recent line
  thinkingLines.push(text);
  const recent = thinkingLines[thinkingLines.length - 1];
  if (recent) {
    process.stdout.write(chalk.yellow.dim('  ' + recent.slice(0, termWidth() - 4)) + '\n');
  }
}

export function endThinking(): void {
  if (!thinkingActive) return;
  thinkingActive = false;
  process.stdout.write(chalk.gray('  ' + '─'.repeat(Math.min(termWidth() - 4, 50))) + '\n\n');
}

export function isThinking(): boolean { return thinkingActive; }

// ═══════════════════════════════════════════════════════════
// SECTION: Streaming Output
// ═══════════════════════════════════════════════════════════

export function writeStream(text: string): void {
  if (thinkingActive) endThinking();
  process.stdout.write(text);
}

// ═══════════════════════════════════════════════════════════
// SECTION: Markdown Rendering
// ═══════════════════════════════════════════════════════════

export function printMarkdown(md: string): void {
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
        paragraph: chalk.white,
        strong: chalk.bold,
        em: chalk.italic,
      }),
    });
    process.stdout.write(marked.parse(md));
  } catch {
    process.stdout.write(renderMarkdownSimple(md));
  }
}

function renderMarkdownSimple(md: string): string {
  let r = md;
  r = r.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const lines = code.trimEnd().split('\n');
    const numbered = lines.map((l: string, i: number) =>
      chalk.gray(String(i + 1).padStart(3) + ' │ ') + l
    ).join('\n');
    return '\n' + chalk.gray('┌── ' + (lang || 'code') + ' ──┐\n') + numbered + '\n' + chalk.gray('└' + '-'.repeat(40) + '┘\n');
  });
  r = r.replace(/`([^`\n]+?)`/g, (_, c) => chalk.cyan(c));
  r = r.replace(/\*\*(.+?)\*\*/g, (_, t) => chalk.bold(t));
  r = r.replace(/^### (.+)$/gm, (_, t) => chalk.bold.underline('\n' + t));
  r = r.replace(/^## (.+)$/gm, (_, t) => chalk.bold.yellow('\n' + t));
  r = r.replace(/^# (.+)$/gm, (_, t) => chalk.bold.cyan('\n' + t));
  r = r.replace(/^[*-] (.+)$/gm, (_, t) => '  • ' + t);
  return r;
}

// ═══════════════════════════════════════════════════════════
// SECTION: Tool Progress
// ═══════════════════════════════════════════════════════════

const TOOL_ICONS: Record<string, string> = {
  read_file: '📖', write_file: '✏️', edit_file: '🔧', bash: '⚡',
  grep: '🔍', glob: '📂', git: '🔀', web: '🌐',
};

let toolSpinner: ReturnType<typeof setInterval> | null = null;
const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinIdx = 0;

export function startTool(name: string, args: string): void {
  stopTool();
  if (thinkingActive) endThinking();
  spinIdx = 0;
  const icon = TOOL_ICONS[name] || '🔨';
  const preview = toolPreview(name, args);

  const draw = () => {
    process.stdout.write('\r' + CSI + '2K' + '\r');
    process.stdout.write(chalk.cyan(`  ${frames[spinIdx % frames.length]} `) + icon + ' ' + chalk.white(name) + ' ' + chalk.gray(preview));
  };
  draw();
  toolSpinner = setInterval(() => { spinIdx++; draw(); }, 80);
}

export function finishTool(name: string, ok: boolean, detail?: string): void {
  stopTool();
  const icon = TOOL_ICONS[name] || '🔨';
  const status = ok ? chalk.green('✓') : chalk.red('✗');
  const extra = detail ? chalk.gray(' · ' + detail) : '';
  process.stdout.write('\r' + CSI + '2K' + '\r');
  process.stdout.write(`  ${icon} ${chalk.white(name)} ${status}${extra}\n`);
}

export function stopTool(): void {
  if (toolSpinner) { clearInterval(toolSpinner); toolSpinner = null; }
}

function toolPreview(name: string, args: string): string {
  try {
    const p = JSON.parse(args);
    switch (name) {
      case 'read_file': case 'write_file': case 'edit_file':
        return (p.file_path || '').replace(/\\/g, '/').split('/').pop() || '';
      case 'bash': return p.description || (p.command || '').slice(0, 30);
      case 'grep': return '"' + (p.pattern || '').slice(0, 25) + '"';
      case 'glob': return p.pattern || '';
      case 'git': return p.operation || '';
      case 'web': return p.action + (p.query ? ': ' + p.query.slice(0, 20) : '');
      default: return '';
    }
  } catch { return args.slice(0, 30); }
}

// ═══════════════════════════════════════════════════════════
// SECTION: Messages
// ═══════════════════════════════════════════════════════════

export function info(msg: string): void {
  process.stdout.write(chalk.blue('  ℹ ') + msg + '\n');
}

export function success(msg: string): void {
  process.stdout.write(chalk.green('  ✓ ') + msg + '\n');
}

export function warn(msg: string): void {
  process.stdout.write(chalk.yellow('  ⚠ ') + msg + '\n');
}

export function error(msg: string): void {
  process.stdout.write(chalk.red('  ✗ ') + msg + '\n');
}

// ═══════════════════════════════════════════════════════════
// SECTION: Session Summary Box
// ═══════════════════════════════════════════════════════════

export function renderSessionSummary(stats: {
  model: string; mode: string; messages: number;
  promptTokens: number; completionTokens: number;
  reasoningTokens: number; cost: number; rounds: number;
  duration: number;
}): string {
  const w = 42;
  const l = (label: string, value: string) =>
    chalk.cyan('│ ') + chalk.gray(label.padEnd(14)) + chalk.white(value) + ' '.repeat(Math.max(0, w - 17 - strip(value))) + chalk.cyan('│');

  return [
    '',
    chalk.cyan('┌' + '─'.repeat(w) + '┐'),
    chalk.cyan('│') + center(chalk.bold(' Session Summary '), w) + chalk.cyan('│'),
    chalk.cyan('│') + ' '.repeat(w) + chalk.cyan('│'),
    l('Model', stats.model),
    l('Mode', stats.mode),
    l('Messages', String(stats.messages)),
    l('Prompt', formatTokens(stats.promptTokens)),
    l('Completion', formatTokens(stats.completionTokens)),
    l('Reasoning', formatTokens(stats.reasoningTokens)),
    l('Rounds', String(stats.rounds)),
    l('Cost', chalk.yellow('$' + stats.cost.toFixed(4))),
    l('Duration', formatDuration(stats.duration)),
    chalk.cyan('└' + '─'.repeat(w) + '┘'),
    '',
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════
// SECTION: Misc
// ═══════════════════════════════════════════════════════════

export function hideCursor(): void { process.stdout.write(CSI + '?25l'); }
export function showCursor(): void { process.stdout.write(CSI + '?25h'); }
export function clearScreen(): void { process.stdout.write(CSI + '2J' + CSI + 'H'); }
export function blank(): void { process.stdout.write('\n'); }

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1000000) return (n / 1000).toFixed(1) + 'K';
  return (n / 1000000).toFixed(1) + 'M';
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
}
