#!/usr/bin/env node
// ============================================================
// FundeePseek CLI — Claude Code style interactive terminal
// ╭─ header ─╮  two-column welcome  ╰─ footer ─╯
// ═══════════  > prompt  ═══════════  ◈ status bar
// Type / to auto-show command menu
// ============================================================
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

let Agent, GlobalMemory, loadConfig, initProject, SessionStorage;
let renderer;

// ═══════════════════════════════════════════════════════════
// Slash commands
// ═══════════════════════════════════════════════════════════

const SLASH_COMMANDS = [
  { cmd: '/auto', desc: 'Switch to full autonomy mode — reads, writes, executes freely' },
  { cmd: '/plan', desc: 'Switch to plan mode — plan first, execute after approval' },
  { cmd: '/ask', desc: 'Switch to ask mode — read-only, no modifications' },
  { cmd: '/chat', desc: 'Switch to chat mode — pure conversation, no tools' },
  { cmd: '/model', desc: 'Switch model: deepseek-chat, deepseek-reasoner, deepseek-v4-pro, deepseek-v4-flash' },
  { cmd: '/thinking', desc: 'Toggle thinking mode: on, off, or auto' },
  { cmd: '/auth', desc: 'Set your DeepSeek API key' },
  { cmd: '/clear', desc: 'Start a new session with empty context; previous session stays on disk' },
  { cmd: '/compact', desc: 'Show context window usage statistics' },
  { cmd: '/usage', desc: 'Show token usage and estimated cost' },
  { cmd: '/profile', desc: 'Show your learned coding profile' },
  { cmd: '/remember', desc: 'Save a fact to global memory for future sessions' },
  { cmd: '/memories', desc: 'List saved global memories' },
  { cmd: '/forget', desc: 'Delete a memory by its slug' },
  { cmd: '/resume', desc: 'Resume a previous session' },
  { cmd: '/sessions', desc: 'List all saved sessions in this project' },
  { cmd: '/release-notes', desc: 'Show what\'s new in FundeePseek' },
  { cmd: '/help', desc: 'Show all available commands' },
  { cmd: '/exit', desc: 'Exit FundeePseek and save session' },
];

// ═══════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════

const program = require('commander').createCommand();

program
  .name('funds')
  .description('FundeePseek — DeepSeek CLI Coding Agent')
  .version('1.0.0')
  .option('-p, --prompt <text>', 'Single prompt (non-interactive)')
  .option('-m, --model <name>', 'Model to use')
  .option('-M, --mode <mode>', 'Mode: auto, plan, ask, chat', 'auto')
  .option('-t, --thinking <mode>', 'Thinking: on, off, auto', 'off')
  .option('-r, --resume [id]', 'Resume a session')
  .option('-n, --new-session', 'Start fresh')
  .option('--init', 'Initialize in current directory')
  .option('--list-sessions', 'List saved sessions')
  .option('--export <id>', 'Export session to markdown')
  .option('--profile', 'Show user profile')
  .option('--memories', 'List global memories')
  .option('--remember <text>', 'Save a memory')
  .option('--forget <slug>', 'Delete a memory')
  .option('--no-color', 'Disable colors')
  .option('--api-key <key>', 'DeepSeek API key')
  .action(main);

async function main(options) {
  try {
    const mod = require('../dist/index');
    Agent = mod.Agent; GlobalMemory = mod.GlobalMemory;
    loadConfig = mod.loadConfig; initProject = mod.initProject;
    SessionStorage = mod.SessionStorage;
    renderer = require('../dist/ui/renderer');
  } catch (e) {
    console.error('✗ Not built. Run: npm run build');
    process.exit(1);
  }

  if (options.init) { initProject(process.cwd()); console.log('✓ Initialized'); return; }

  const cwd = process.cwd();
  const config = loadConfig(cwd);
  let currentModel = options.model || config.defaultModel || 'deepseek-chat';
  let currentMode = options.mode || config.defaultMode || 'auto';
  let currentThinking = options.thinking || config.defaultThinking || 'off';
  let apiKey = options.apiKey || config.apiKey || process.env.DEEPSEEK_API_KEY;

  const memory = new GlobalMemory();

  if (options.profile) { console.log(memory.getProfileSummary()); return; }
  if (options.memories) { listMemoriesCli(memory); return; }
  if (options.remember) { await memory.rememberFact(options.remember); console.log('✓ Saved'); return; }
  if (options.forget) { console.log(memory.forget(options.forget) ? '✓ Deleted' : '✗ Not found'); return; }
  if (options.listSessions) { listSessionsCli(cwd); return; }
  if (options.export) { exportSessionCli(cwd, options.export); return; }

  if (options.prompt && !apiKey) {
    console.error('✗ No API key. Use --api-key or set DEEPSEEK_API_KEY'); process.exit(1);
  }

  // Lazy agent
  let agent = null;

  function createAgent(key) {
    apiKey = key;
    agent = new Agent({
      apiKey, model: currentModel, mode: currentMode, thinking: currentThinking,
      projectRoot: cwd,
      promptContext: {
        projectRoot: cwd,
        projectFiles: getProjectFiles(cwd),
        gitStatus: getGitStatus(cwd),
        mode: currentMode, model: currentModel,
        userProfile: memory.profile,
        memories: memory.getRelevantMemories(),
      },
    });
    wireEvents(agent);
    return agent;
  }

  if (apiKey) createAgent(apiKey);

  // ── Single prompt ──
  if (options.prompt && agent) {
    console.log(renderer.renderBanner({ title: 'FundeePseek' }));
    const t0 = Date.now();
    await agent.chat(options.prompt);
    const dur = Date.now() - t0;
    const u = agent.getUsage();
    const cs = agent.getContextStats();
    console.log(renderer.renderSessionSummary({
      model: currentModel, mode: currentMode,
      messages: cs.messageCount,
      promptTokens: u.promptTokens, completionTokens: u.completionTokens,
      reasoningTokens: u.reasoningTokens, cost: u.cost, rounds: u.rounds, duration: dur,
    }));
    saveSession(cwd, agent, memory);
    return;
  }

  // ══════ Interactive Mode ══════
  renderer.clearScreen();
  console.log(renderer.renderWelcome({
    model: currentModel, mode: currentMode, projectRoot: cwd, hasKey: !!agent,
  }));
  console.log(renderer.renderStatusBar({ mode: currentMode, model: currentModel, thinking: currentThinking }));
  console.log(renderer.renderDivider());

  if (agent && !options.newSession) {
    const resumed = tryResume(cwd, agent, options.resume);
    if (resumed) { renderer.info('Session resumed. /clear to start fresh.'); }
  }

  // ══════ Raw-mode input with / autocomplete ══════
  await interactiveLoop(agent, memory, cwd, currentModel, currentMode, currentThinking);
}

// ═══════════════════════════════════════════════════════════
// Interactive Loop — raw stdin for instant / menu
// ═══════════════════════════════════════════════════════════

async function interactiveLoop(agent, memory, cwd, currentModel, currentMode, currentThinking) {
  let line = '';
  let cursor = 0;
  let slashMenuShown = false;
  let slashFilter = '';
  let historyIdx = -1;
  const history = [];
  let promptStr = renderer.getPrompt();
  let thinkingOn = false;

  const stdin = process.stdin;
  const stdout = process.stdout;

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf-8');

  // Render prompt
  function drawPrompt() {
    stdout.write('\r\x1b[2K\r'); // Clear line
    if (slashMenuShown) {
      stdout.write(renderer.renderDivider() + '\n');
      renderSlashMenu(slashFilter);
      stdout.write(renderer.renderDivider() + '\n');
      stdout.write(renderer.renderStatusBar({ mode: currentMode, model: currentModel, thinking: currentThinking }) + '\n');
    }
    stdout.write(promptStr + line);
    // Move cursor
    if (cursor < line.length) {
      const back = line.length - cursor;
      stdout.write(`\x1b[${back}D`);
    }
  }

  function renderSlashMenu(filter) {
    const w = process.stdout.columns || 80;
    const q = (filter || '').toLowerCase();
    const matches = SLASH_COMMANDS.filter(c =>
      !q || c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)
    );
    if (matches.length === 0) {
      stdout.write(chalk.gray('  No matching commands\n'));
      return;
    }
    const maxCmd = Math.max(...matches.map(m => m.cmd.length));
    for (const m of matches) {
      const cmd = chalk.cyan(m.cmd.padEnd(maxCmd + 4));
      const desc = chalk.gray(m.desc.slice(0, w - maxCmd - 8));
      stdout.write(cmd + desc + '\n');
    }
  }

  function hideSlashMenu() {
    if (slashMenuShown) {
      slashMenuShown = false;
      slashFilter = '';
      // Clear any menu lines that might remain (approximate)
      stdout.write('\x1b[2K\r');
      drawPrompt();
    }
  }

  function showSlashMenu() {
    slashMenuShown = true;
    slashFilter = line.slice(1);
    drawPrompt();
  }

  function redraw() {
    // Clear prompt area and redraw
    stdout.write('\r\x1b[2K\r');
    if (slashMenuShown) {
      stdout.write(renderer.renderDivider() + '\n');
      renderSlashMenu(slashFilter);
      stdout.write(renderer.renderDivider() + '\n');
      stdout.write(renderer.renderStatusBar({ mode: currentMode, model: currentModel, thinking: currentThinking }) + '\n');
    }
    stdout.write(promptStr + line);
    if (cursor < line.length) {
      stdout.write(`\x1b[${line.length - cursor}D`);
    }
  }

  function insertAtCursor(text) {
    line = line.slice(0, cursor) + text + line.slice(cursor);
    cursor += text.length;
  }

  function deleteBeforeCursor() {
    if (cursor > 0) {
      line = line.slice(0, cursor - 1) + line.slice(cursor);
      cursor--;
    }
  }

  function deleteAtCursor() {
    if (cursor < line.length) {
      line = line.slice(0, cursor) + line.slice(cursor + 1);
    }
  }

  // Handle agent response (shared between agent chat and local commands)
  async function handleAgentInput(input) {
    const t0 = Date.now();
    try {
      await agent.chat(input);
    } catch (err) {
      renderer.error('Error: ' + err.message);
    }
    const elapsed = Date.now() - t0;
    memory.learnFromMessages(agent.exportContext());
    const u = agent.getUsage();
    if (u.totalTokens > 0) {
      stdout.write(chalk.gray(`  ⏱ ${fmtDur(elapsed)} · ${u.totalTokens.toLocaleString()} tok · $${u.cost.toFixed(4)}`));
    }
    stdout.write('\n\n');
  }

  drawPrompt();

  stdin.on('data', async (key) => {
    const code = key.charCodeAt(0);

    // Ctrl+C
    if (code === 3) {
      if (line.length > 0) {
        line = ''; cursor = 0; hideSlashMenu();
        stdout.write('^C\n');
        stdout.write(renderer.renderDivider() + '\n');
        stdout.write(renderer.renderStatusBar({ mode: currentMode, model: currentModel, thinking: currentThinking }) + '\n');
        drawPrompt();
        return;
      }
      stdout.write('\n  Goodbye! 👋\n\n');
      if (agent) saveSession(cwd, agent, memory);
      stdin.setRawMode(false);
      process.exit(0);
    }

    // Ctrl+D (EOF)
    if (code === 4) {
      if (line.length === 0) {
        stdout.write('\n  Goodbye! 👋\n\n');
        if (agent) saveSession(cwd, agent, memory);
        stdin.setRawMode(false);
        process.exit(0);
      }
      return;
    }

    // Enter
    if (code === 13) {
      hideSlashMenu();
      stdout.write('\n');

      const input = line.trim();
      line = ''; cursor = 0;
      history.push(input);
      historyIdx = history.length;

      if (!input) {
        stdout.write(renderer.renderDivider() + '\n');
        stdout.write(renderer.renderStatusBar({ mode: currentMode, model: currentModel, thinking: currentThinking }) + '\n');
        drawPrompt();
        return;
      }

      if (input === '/exit' || input === '/quit') {
        stdout.write(chalk.gray('  Goodbye! 👋\n\n'));
        if (agent) saveSession(cwd, agent, memory);
        stdin.setRawMode(false);
        process.exit(0);
        return;
      }

      // /auth
      if (input.startsWith('/auth ') || input.startsWith('/key ')) {
        const key = input.replace(/^\/(auth|key)\s+/, '').trim();
        if (!key || key.length < 10) {
          renderer.error('Invalid key. Format: /auth sk-xxxxxxxx');
        } else {
          saveGlobalKey(key);
          createAgent(key);
          memory.learnFromMessages([]);
          renderer.clearScreen();
          stdout.write(renderer.renderWelcome({
            model: currentModel, mode: currentMode, projectRoot: cwd, hasKey: true,
          }));
        }
        stdout.write(renderer.renderDivider() + '\n');
        stdout.write(renderer.renderStatusBar({ mode: currentModel, model: currentModel, thinking: currentThinking }) + '\n');
        drawPrompt();
        return;
      }

      // No agent yet
      if (!agent) {
        stdout.write(chalk.yellow('\n  👋 First, set your API key:\n'));
        stdout.write(chalk.cyan('  /auth sk-your-deepseek-api-key\n\n'));
        stdout.write(renderer.renderDivider() + '\n');
        stdout.write(renderer.renderStatusBar({ mode: currentMode, model: currentModel, thinking: currentThinking }) + '\n');
        drawPrompt();
        return;
      }

      // Local commands
      if (input.startsWith('/')) {
        const localResult = handleLocal(input, agent, memory, cwd);
        if (localResult === 'HANDLED') {
          if (input.startsWith('/model ')) currentModel = input.slice(7).trim();
          if (['/auto', '/plan', '/ask', '/chat'].includes(input)) currentMode = input.slice(1);
          if (input.startsWith('/thinking ')) currentThinking = input.slice(10).trim();
          stdout.write(renderer.renderDivider() + '\n');
          stdout.write(renderer.renderStatusBar({
            mode: currentMode, model: currentModel, thinking: currentThinking,
            tokens: agent?.getUsage().totalTokens, cost: agent?.getUsage().cost,
          }) + '\n');
          drawPrompt();
          return;
        }
      }

      // Agent turn
      stdout.write('\n');
      await handleAgentInput(input);
      stdout.write(renderer.renderDivider() + '\n');
      const u = agent.getUsage();
      stdout.write(renderer.renderStatusBar({
        mode: currentMode, model: currentModel, thinking: currentThinking,
        tokens: u.totalTokens, cost: u.cost,
      }) + '\n');
      drawPrompt();
      return;
    }

    // Backspace
    if (code === 127) {
      if (slashMenuShown && line === '/') {
        hideSlashMenu();
        line = ''; cursor = 0;
        drawPrompt();
        return;
      }
      deleteBeforeCursor();
      if (slashMenuShown) {
        slashFilter = line.slice(1);
      }
      drawPrompt();
      return;
    }

    // Tab — complete slash command
    if (code === 9) {
      if (slashMenuShown) {
        const q = slashFilter.toLowerCase();
        const matches = SLASH_COMMANDS.filter(c => c.cmd.slice(1).startsWith(q));
        if (matches.length === 1) {
          line = matches[0].cmd + ' ';
          cursor = line.length;
          hideSlashMenu();
        }
      }
      drawPrompt();
      return;
    }

    // Up arrow — history
    if (key === '\x1b[A') {
      hideSlashMenu();
      if (historyIdx > 0) {
        historyIdx--;
        line = history[historyIdx] || '';
        cursor = line.length;
      }
      drawPrompt();
      return;
    }

    // Down arrow — history
    if (key === '\x1b[D') {
      hideSlashMenu();
      if (historyIdx < history.length - 1) {
        historyIdx++;
        line = history[historyIdx] || '';
      } else {
        historyIdx = history.length;
        line = '';
      }
      cursor = line.length;
      drawPrompt();
      return;
    }

    // Left arrow
    if (key === '\x1b[C') {
      if (cursor > 0) cursor--;
      drawPrompt();
      return;
    }

    // Right arrow
    if (key === '\x1b[B') {
      if (cursor < line.length) cursor++;
      drawPrompt();
      return;
    }

    // Escape sequences
    if (code === 27) {
      hideSlashMenu();
      drawPrompt();
      return;
    }

    // Ignore other control chars
    if (code < 32) return;

    // Printable character
    const char = key;
    insertAtCursor(char);

    // Auto-show slash menu when first char is /
    if (!slashMenuShown && line === '/') {
      showSlashMenu();
    } else if (slashMenuShown) {
      // Update filter
      if (line.startsWith('/')) {
        slashFilter = line.slice(1);
        drawPrompt();
      } else {
        hideSlashMenu();
        drawPrompt();
      }
    } else {
      drawPrompt();
    }
  });

  // Wait forever
  return new Promise(() => {});
}

// ═══════════════════════════════════════════════════════════
// Local command handler (returns 'HANDLED' or null)
// ═══════════════════════════════════════════════════════════

function handleLocal(input, agent, memory, cwd) {
  const stdout = process.stdout;

  if (input === '/help') {
    const w = process.stdout.columns || 80;
    stdout.write('\n');
    stdout.write(chalk.cyan('╭' + '─'.repeat(w - 2) + '╮\n'));
    stdout.write(chalk.cyan('│') + centerText(chalk.bold(' FundeePseek Commands '), w - 2) + chalk.cyan('│\n'));
    stdout.write(chalk.cyan('│') + ' '.repeat(w - 2) + chalk.cyan('│\n'));
    const maxCmd = Math.max(...SLASH_COMMANDS.map(c => c.cmd.length));
    for (const c of SLASH_COMMANDS) {
      const cmd = chalk.cyan(c.cmd.padEnd(maxCmd + 2));
      stdout.write(chalk.cyan('│ ') + cmd + chalk.gray(c.desc) + chalk.cyan(' │\n'));
    }
    stdout.write(chalk.cyan('╰' + '─'.repeat(w - 2) + '╯\n'));
    stdout.write('\n');
    return 'HANDLED';
  }

  if (input === '/profile') {
    try { stdout.write('\n' + memory.getProfileSummary() + '\n'); } catch {}
    return 'HANDLED';
  }

  if (input === '/memories') {
    try {
      const mems = memory.listMemories();
      if (!mems.length) { stdout.write(chalk.gray('  No memories yet.\n')); }
      else { for (const m of mems.slice(0, 15)) stdout.write(chalk.cyan(`  [${m.metadata.type}] `) + m.description + '\n'); }
    } catch {}
    return 'HANDLED';
  }

  if (input.startsWith('/remember ')) {
    try { memory.rememberFact(input.slice(10).trim()); stdout.write(chalk.green('  ✓ Saved.\n')); } catch {}
    return 'HANDLED';
  }

  if (input.startsWith('/forget ')) {
    try {
      const ok = memory.forget(input.slice(8).trim());
      stdout.write((ok ? chalk.green('  ✓ Deleted') : chalk.red('  ✗ Not found')) + '\n');
    } catch {}
    return 'HANDLED';
  }
  if (input === '/sessions') { listSessionsCli(cwd); return 'HANDLED'; }

  if (input.startsWith('/resume')) {
    const id = input.slice(8).trim() || undefined;
    const resumed = tryResume(cwd, agent, id);
    stdout.write((resumed ? chalk.green('  ✓ Resumed') : chalk.red('  ✗ No session found')) + '\n');
    return 'HANDLED';
  }

  if (input === '/release-notes') {
    stdout.write([
      '\n',
      chalk.bold.cyan('  FundeePseek v1.0.0 — Release Notes'),
      '',
      chalk.white('  ✨ New:'),
      chalk.gray('    • 4 models: V3 · R1 · V4-Pro · V4-Flash'),
      chalk.gray('    • Thinking mode for deep reasoning'),
      chalk.gray('    • Claude Code style interactive UI'),
      chalk.gray('    • Global memory & user profiling'),
      chalk.gray('    • 8 tools: Read/Write/Edit/Bash/Grep/Glob/Git/Web'),
      chalk.gray('    • Session persistence & resume'),
      chalk.gray('    • /auth for no-config startup'),
      '\n',
    ].join('\n'));
    return 'HANDLED';
  }

  return null;
}

// ═══════════════════════════════════════════════════════════
// Event wiring
// ═══════════════════════════════════════════════════════════

let thinkingOn = false;

function wireEvents(agent) {
  agent.removeAllListeners();
  agent.on('thinking', (t) => {
    if (!thinkingOn) { renderer.startThinking(); thinkingOn = true; }
    renderer.appendThinking(t);
  });
  agent.on('stream', (t) => {
    if (thinkingOn) { renderer.endThinking(); thinkingOn = false; }
    renderer.writeStream(t);
  });
  agent.on('tool:start', (name, args) => {
    if (thinkingOn) { renderer.endThinking(); thinkingOn = false; }
    renderer.startTool(name, args);
  });
  agent.on('tool:done', (name, result) => {
    const detail = result?.metadata ? Object.values(result.metadata).join(' · ') : undefined;
    renderer.finishTool(name, true, detail);
  });
  agent.on('tool:error', (name, err) => renderer.finishTool(name, false, err?.slice(0, 60)));
  agent.on('warning', (m) => renderer.warn(m));
  agent.on('error', (e) => renderer.error(e.message));
  agent.on('response', () => { thinkingOn = false; });
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function getProjectFiles(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.') || e.name === '.gitignore')
      .slice(0, 30)
      .map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}${e.isDirectory() ? '/' : ''}`)
      .join('\n');
  } catch { return ''; }
}

function getGitStatus(root) {
  try { return require('child_process').execSync('git status --short', { cwd: root, encoding: 'utf-8', timeout: 5000 }).trim(); }
  catch { return ''; }
}

function saveGlobalKey(key) {
  try {
    const dir = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.fundeepseek');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const cfgPath = path.join(dir, 'config.json');
    const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) : {};
    cfg.apiKey = key;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
    renderer.success('API key saved to ~/.fundeepseek/config.json');
  } catch { renderer.warn('Key set for this session (failed to save permanently).'); }
}

function tryResume(root, agent, id) {
  try {
    if (!agent) return false;
    const storage = new SessionStorage(root);
    const session = (id === true || !id) ? storage.getLatest() : storage.load(id);
    if (session?.messages?.length > 0) { agent.resume(session.messages); return true; }
  } catch {}
  return false;
}

function saveSession(root, agent, memory) {
  try { memory.learnFromMessages(agent.exportContext()); } catch {}
}

function listMemoriesCli(memory) {
  const mems = memory.listMemories();
  if (!mems.length) { console.log('No memories yet.'); return; }
  for (const m of mems) console.log(`[${m.metadata.type}] ${m.description}`);
}

function listSessionsCli(root) {
  const storage = new SessionStorage(root);
  const sessions = storage.list();
  if (!sessions.length) { console.log('No sessions found.'); return; }
  for (const s of sessions) {
    console.log(chalk.cyan(`  ${s.id.slice(0, 16)}...`));
    console.log(chalk.gray(`  ${s.model} · ${s.mode} · ${s.messages.length} msgs · ${new Date(s.updatedAt).toLocaleString()}`));
  }
}

function exportSessionCli(root, id) {
  const storage = new SessionStorage(root);
  const text = storage.exportAsText(id);
  if (text) {
    const out = path.join(root, `session-${id.slice(0, 8)}.md`);
    fs.writeFileSync(out, text, 'utf-8');
    console.log('✓ Exported to ' + out);
  } else { console.log('✗ Session not found'); }
}

function centerText(text, width) {
  const sw = text.replace(/\x1b\[[0-9;]*m/g, '').length;
  const left = Math.floor((width - sw) / 2);
  return ' '.repeat(Math.max(0, left)) + text + ' '.repeat(Math.max(0, width - sw - left));
}

function fmtDur(ms) {
  const s = Math.floor(ms / 1000);
  return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's';
}

program.parse(process.argv);
