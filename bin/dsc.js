#!/usr/bin/env node
// ============================================================
// FundeePseek CLI — Claude Code style interactive terminal
// ╭─ header ─╮  two-column welcome  ╰─ footer ─╯
// ═══════════  > prompt  ═══════════  ◈ status bar
// ============================================================
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

let Agent, GlobalMemory, loadConfig, initProject, SessionStorage;
let renderer;

// ═══════════════════════════════════════════════════════════
// Slash commands with descriptions (for autocomplete)
// ═══════════════════════════════════════════════════════════

const SLASH_COMMANDS = [
  { cmd: '/auto', desc: 'Switch to full autonomy mode — reads, writes, executes freely' },
  { cmd: '/plan', desc: 'Switch to plan mode — plan first, execute after approval' },
  { cmd: '/ask', desc: 'Switch to ask mode — read-only, no modifications' },
  { cmd: '/chat', desc: 'Switch to chat mode — pure conversation, no tools' },
  { cmd: '/model', desc: 'Switch model: deepseek-chat, deepseek-reasoner, deepseek-v4-pro, deepseek-v4-flash' },
  { cmd: '/thinking', desc: 'Toggle thinking mode: on, off, or auto' },
  { cmd: '/auth', desc: 'Set your DeepSeek API key' },
  { cmd: '/clear', desc: 'Start a new session with empty context' },
  { cmd: '/compact', desc: 'Show context window usage statistics' },
  { cmd: '/usage', desc: 'Show token usage and estimated cost' },
  { cmd: '/profile', desc: 'Show your learned coding profile' },
  { cmd: '/remember', desc: 'Save a fact to global memory' },
  { cmd: '/memories', desc: 'List saved global memories' },
  { cmd: '/forget', desc: 'Delete a memory by its name' },
  { cmd: '/resume', desc: 'Resume a previous session' },
  { cmd: '/sessions', desc: 'List all saved sessions' },
  { cmd: '/release-notes', desc: 'Show what\'s new in this version' },
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
  // Load compiled modules
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

  // Offline commands
  if (options.init) { initProject(process.cwd()); console.log('✓ Initialized'); return; }

  const cwd = process.cwd();
  const config = loadConfig(cwd);
  const model = options.model || config.defaultModel || 'deepseek-chat';
  const mode = options.mode || config.defaultMode || 'auto';
  const thinking = options.thinking || config.defaultThinking || 'off';
  let apiKey = options.apiKey || config.apiKey || process.env.DEEPSEEK_API_KEY;

  const memory = new GlobalMemory();

  // Quick offline commands
  if (options.profile) { console.log(memory.getProfileSummary()); return; }
  if (options.memories) { listMemoriesCli(memory); return; }
  if (options.remember) { await memory.rememberFact(options.remember); console.log('✓ Saved'); return; }
  if (options.forget) { console.log(memory.forget(options.forget) ? '✓ Deleted' : '✗ Not found'); return; }
  if (options.listSessions) { listSessionsCli(cwd); return; }
  if (options.export) { exportSessionCli(cwd, options.export); return; }

  // Single prompt needs key
  if (options.prompt && !apiKey) {
    console.error('✗ No API key. Use --api-key or set DEEPSEEK_API_KEY'); process.exit(1);
  }

  // Lazy agent
  let agent = null;
  let currentModel = model, currentMode = mode, currentThinking = thinking;

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
    wireEvents(agent, memory);
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

  // ── Interactive mode ──
  renderer.clearScreen();

  // Show welcome panel
  console.log(renderer.renderWelcome({
    model: currentModel, mode: currentMode, projectRoot: cwd, hasKey: !!agent,
  }));

  // Status bar
  console.log(renderer.renderStatusBar({ mode: currentMode, model: currentModel, thinking: currentThinking }));

  // Divider
  console.log(renderer.renderDivider());

  // If has key, resume session
  if (agent && !options.newSession) {
    const resumed = tryResume(cwd, agent, options.resume);
    if (resumed) { renderer.info('Session resumed. /clear to start fresh.'); }
  }

  // ══════ Readline with autocomplete ══════
  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout,
    prompt: renderer.getPrompt(),
    terminal: true, historySize: 1000,
    completer: slashCompleter,
  });

  rl.prompt();

  // Show status bar again before each prompt
  let lastMode = currentMode, lastModel = currentModel;
  const usage = agent ? agent.getUsage() : { totalTokens: 0, cost: 0 };

  rl.on('line', async (line) => {
    const input = line.trim();

    // Always re-show status + divider if model/mode changed
    if (currentMode !== lastMode || currentModel !== lastModel) {
      lastMode = currentMode; lastModel = currentModel;
      console.log(renderer.renderDivider());
    }

    if (!input) {
      console.log(renderer.renderDivider());
      console.log(renderer.renderStatusBar({
        mode: currentMode, model: currentModel, thinking: currentThinking,
        tokens: agent?.getUsage().totalTokens, cost: agent?.getUsage().cost,
      }));
      rl.setPrompt(renderer.getPrompt());
      rl.prompt();
      return;
    }

    // Exit
    if (input === '/exit' || input === '/quit') {
      console.log(chalk.gray('\n  Goodbye! 👋\n'));
      if (agent) saveSession(cwd, agent, memory);
      rl.close();
      return;
    }

    // ══════ /auth ══════
    if (input.startsWith('/auth ') || input.startsWith('/key ')) {
      const key = input.replace(/^\/(auth|key)\s+/, '').trim();
      if (!key || key.length < 10) { renderer.error('Invalid key'); rl.prompt(); return; }
      saveGlobalKey(key);
      createAgent(key);
      renderer.clearScreen();
      console.log(renderer.renderWelcome({
        model: currentModel, mode: currentMode, projectRoot: cwd, hasKey: true,
      }));
      if (!options.newSession) {
        const resumed = tryResume(cwd, agent, options.resume);
        if (resumed) renderer.info('Session resumed.');
      }
      console.log(renderer.renderDivider());
      console.log(renderer.renderStatusBar({
        mode: currentMode, model: currentModel, thinking: currentThinking,
      }));
      rl.setPrompt(renderer.getPrompt());
      rl.prompt();
      return;
    }

    // ══════ No agent yet ══════
    if (!agent) {
      console.log(chalk.yellow('\n  👋 First, set your API key:'));
      console.log(chalk.cyan('  /auth sk-your-deepseek-api-key\n'));
      console.log(renderer.renderDivider());
      console.log(renderer.renderStatusBar({ mode: currentMode, model: currentModel, thinking: currentThinking }));
      rl.setPrompt(renderer.getPrompt());
      rl.prompt();
      return;
    }

    // ══════ Local slash commands ══════
    const localResult = handleLocal(input, agent, memory, cwd, rl);
    if (localResult === 'HANDLED') {
      // Update mode/model if changed
      if (input.startsWith('/model ')) {
        currentModel = input.slice(7).trim();
        updateStatus(agent, memory, currentMode, currentModel, currentThinking);
        rl.setPrompt(renderer.getPrompt());
        rl.prompt();
        return;
      }
      if (['/auto', '/plan', '/ask', '/chat'].includes(input)) {
        currentMode = input.slice(1);
        lastMode = currentMode;
        updateStatus(agent, memory, currentMode, currentModel, currentThinking);
        rl.setPrompt(renderer.getPrompt());
        rl.prompt();
        return;
      }
      if (input.startsWith('/thinking ')) {
        currentThinking = input.slice(10).trim();
        agent.agentConfig.thinking = currentThinking;
        console.log(chalk.green(`  ✓ Thinking: ${currentThinking}`));
        updateStatus(agent, memory, currentMode, currentModel, currentThinking);
        rl.setPrompt(renderer.getPrompt());
        rl.prompt();
        return;
      }
      updateStatus(agent, memory, currentMode, currentModel, currentThinking);
      rl.setPrompt(renderer.getPrompt());
      rl.prompt();
      return;
    }

    // ══════ Agent turn ══════
    renderer.blank();
    const t0 = Date.now();

    try {
      await agent.chat(input);
    } catch (err) {
      renderer.error('Error: ' + err.message);
    }

    const elapsed = Date.now() - t0;
    memory.learnFromMessages(agent.exportContext());
    const u = agent.getUsage();

    // Status line
    if (u.totalTokens > 0) {
      process.stdout.write(chalk.gray(`  ⏱ ${fmtDur(elapsed)} · ${u.totalTokens.toLocaleString()} tok · $${u.cost.toFixed(4)}`));
    }
    renderer.blank();
    renderer.blank();

    // Re-show divider + status
    console.log(renderer.renderDivider());
    console.log(renderer.renderStatusBar({
      mode: currentMode, model: currentModel, thinking: currentThinking,
      tokens: u.totalTokens, cost: u.cost,
    }));
    rl.setPrompt(renderer.getPrompt());
    rl.prompt();
  });

  rl.on('close', () => { console.log(''); process.exit(0); });
}

// ═══════════════════════════════════════════════════════════
// Slash Autocomplete — /<tab> shows all commands
// ═══════════════════════════════════════════════════════════

function slashCompleter(line) {
  if (!line.startsWith('/')) return [[], line];

  const partial = line.slice(1).toLowerCase();
  const matches = SLASH_COMMANDS.filter(c => c.cmd.slice(1).startsWith(partial));

  if (matches.length === 1) {
    // Single match — complete the command
    return [[matches[0].cmd + ' '], line];
  }

  if (matches.length > 1) {
    // Multiple matches — show menu
    const maxCmdLen = Math.max(...matches.map(m => m.cmd.length));
    const w = process.stdout.columns || 80;
    const colW = Math.min(w - 4, 80);

    console.log('');
    console.log(renderer.renderDivider());

    for (const m of matches) {
      const cmd = chalk.cyan(m.cmd.padEnd(maxCmdLen + 4));
      const desc = chalk.gray(m.desc.slice(0, colW - maxCmdLen - 6));
      console.log(cmd + desc);
    }

    console.log(renderer.renderDivider());
    console.log(renderer.renderStatusBar({ mode: 'auto', model: 'deepseek-chat', thinking: 'off' }));
    // Redraw prompt with partial input
    process.stdout.write(renderer.getPrompt() + line);
  }

  return [[], line];
}

// ═══════════════════════════════════════════════════════════
// Local command handler
// ═══════════════════════════════════════════════════════════

function handleLocal(input, agent, memory, cwd, rl) {
  if (input === '/help') {
    const w = process.stdout.columns || 80;
    console.log('');
    console.log(chalk.cyan('╭' + '─'.repeat(w - 2) + '╮'));
    console.log(chalk.cyan('│') + centerText(chalk.bold(' FundeePseek Commands '), w - 2) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + ' '.repeat(w - 2) + chalk.cyan('│'));

    const maxCmd = Math.max(...SLASH_COMMANDS.map(c => c.cmd.length));
    for (const c of SLASH_COMMANDS) {
      const cmd = chalk.cyan(c.cmd.padEnd(maxCmd + 2));
      const desc = chalk.gray(c.desc);
      const pad = Math.max(0, w - 4 - maxCmd - 2 - c.desc.length);
      console.log(chalk.cyan('│ ') + cmd + desc + ' '.repeat(pad) + chalk.cyan(' │'));
    }

    console.log(chalk.cyan('╰' + '─'.repeat(w - 2) + '╯'));
    console.log('');
    return 'HANDLED';
  }

  if (input === '/profile') {
    console.log('\n' + memory.getProfileSummary() + '\n');
    return 'HANDLED';
  }

  if (input === '/memories') {
    const mems = memory.listMemories();
    if (mems.length === 0) { renderer.info('No memories yet.'); }
    else { for (const m of mems.slice(0, 10)) console.log(chalk.cyan(`  [${m.metadata.type}]`) + ' ' + m.description); }
    return 'HANDLED';
  }

  if (input.startsWith('/remember ')) {
    memory.rememberFact(input.slice(10).trim());
    renderer.success('Saved to memory.');
    return 'HANDLED';
  }

  if (input.startsWith('/forget ')) {
    const ok = memory.forget(input.slice(8).trim());
    console.log(ok ? chalk.green('  ✓ Deleted') : chalk.red('  ✗ Not found'));
    return 'HANDLED';
  }

  if (input === '/release-notes') {
    console.log([
      '',
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
      '',
    ].join('\n'));
    return 'HANDLED';
  }

  if (input === '/sessions') {
    listSessionsCli(cwd);
    return 'HANDLED';
  }

  if (input.startsWith('/resume')) {
    const id = input.slice(8).trim() || undefined;
    const resumed = tryResume(cwd, agent, id);
    console.log(resumed ? chalk.green('  ✓ Resumed') : chalk.red('  ✗ No session found'));
    return 'HANDLED';
  }

  return null; // pass to agent
}

// ═══════════════════════════════════════════════════════════
// Event wiring
// ═══════════════════════════════════════════════════════════

let thinkingOn = false;

function wireEvents(agent, memory) {
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
    const storage = new SessionStorage(root);
    const session = (id === true || !id) ? storage.getLatest() : storage.load(id);
    if (session?.messages?.length > 0) { agent.resume(session.messages); return true; }
  } catch {}
  return false;
}

function saveSession(root, agent, memory) {
  try { memory.learnFromMessages(agent.exportContext()); } catch {}
}

function updateStatus(agent, memory, mode, model, thinking) {
  console.log(renderer.renderDivider());
  const u = agent?.getUsage();
  console.log(renderer.renderStatusBar({
    mode, model, thinking,
    tokens: u?.totalTokens, cost: u?.cost,
  }));
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
