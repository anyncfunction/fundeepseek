#!/usr/bin/env node
// ============================================================
// FundeePseek CLI — Rich Interactive Terminal UI
// ============================================================
const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Dynamically loaded after build
let Agent, GlobalMemory, loadConfig, initProject, SessionManager, SessionStorage;

let renderer;

const program = new Command();

program
  .name('funds')
  .description('FundeePseek — DeepSeek CLI Coding Agent')
  .version('1.0.0')
  .option('-p, --prompt <text>', 'Single prompt (non-interactive mode)')
  .option('-m, --model <name>', 'Model: deepseek-chat, deepseek-reasoner, deepseek-v4-pro, deepseek-v4-flash')
  .option('-M, --mode <mode>', 'Mode: auto, plan, ask, chat', 'auto')
  .option('-t, --thinking <mode>', 'Thinking: on, off, auto', 'off')
  .option('-r, --resume [session-id]', 'Resume a previous session')
  .option('-n, --new-session', 'Start a new session')
  .option('--init', 'Initialize FundeePseek in current directory')
  .option('--list-sessions', 'List saved sessions')
  .option('--export <session-id>', 'Export a session as text')
  .option('--profile', 'Show your user profile')
  .option('--memories', 'List global memories')
  .option('--remember <text>', 'Save a global memory')
  .option('--forget <slug>', 'Delete a global memory')
  .option('--no-color', 'Disable colored output')
  .option('--api-key <key>', 'DeepSeek API key')
  .action(main);

async function main(options) {
  // Load compiled modules
  try {
    const mod = require('../dist/index');
    Agent = mod.Agent;
    GlobalMemory = mod.GlobalMemory;
    loadConfig = mod.loadConfig;
    initProject = mod.initProject;
    SessionManager = mod.SessionManager;
    SessionStorage = mod.SessionStorage;
  } catch (e) {
    console.error(chalk.red('✗ FundeePseek not built. Run "npm run build" first.'));
    process.exit(1);
  }

  renderer = require('../dist/ui/renderer');

  // ══════ Init Project ══════
  if (options.init) {
    const cwd = process.cwd();
    initProject(cwd);
    renderer.printSuccess(`FundeePseek initialized in ${cwd}`);
    console.log(chalk.gray('  Created .deepseek/ with project settings'));
    console.log(chalk.gray('  Run ') + chalk.cyan('dsc') + chalk.gray(' to start coding!'));
    return;
  }

  const projectRoot = process.cwd();
  const config = loadConfig(projectRoot);

  const model = options.model || config.defaultModel || 'deepseek-chat';
  const mode = options.mode || config.defaultMode || 'auto';
  const thinking = options.thinking || config.defaultThinking || 'off';

  const memory = new GlobalMemory();

  // ══════ Offline Commands (no API key needed) ══════

  if (options.profile) {
    console.log(memory.getProfileSummary());
    return;
  }

  if (options.memories) {
    const memories = memory.listMemories();
    if (memories.length === 0) {
      renderer.printInfo('No memories saved yet. Use --remember to save one.');
    } else {
      for (const mem of memories) {
        console.log(chalk.cyan(`[${mem.metadata.type}] ${mem.description}`));
        console.log(chalk.gray(`  ${mem.content.substring(0, 200)}`));
      }
    }
    return;
  }

  if (options.remember) {
    await memory.rememberFact(options.remember, 'project');
    renderer.printSuccess('Memory saved.');
    return;
  }

  if (options.forget) {
    const deleted = memory.forget(options.forget);
    console.log(deleted ? chalk.green('✓ Memory deleted.') : chalk.red('✗ Memory not found.'));
    return;
  }

  if (options.listSessions) {
    const storage = new SessionStorage(projectRoot);
    const sessions = storage.list();
    if (sessions.length === 0) {
      renderer.printInfo('No sessions found.');
    } else {
      renderer.printDivider();
      for (const s of sessions) {
        console.log(chalk.cyan(`  ${s.id.substring(0, 12)}...`));
        console.log(chalk.gray(`  ${s.model} · ${s.mode} · ${s.messages.length} msgs · ${new Date(s.updatedAt).toLocaleString()}`));
      }
      renderer.printDivider();
    }
    return;
  }

  if (options.export) {
    const storage = new SessionStorage(projectRoot);
    const text = storage.exportAsText(options.export);
    if (text) {
      const outPath = path.join(projectRoot, `session-${options.export.substring(0, 8)}.md`);
      fs.writeFileSync(outPath, text, 'utf-8');
      renderer.printSuccess(`Session exported to ${outPath}`);
    } else {
      renderer.printError('Session not found.');
    }
    return;
  }

  // ══════ API Key Check ══════
  let apiKey = options.apiKey || config.apiKey || process.env.DEEPSEEK_API_KEY;

  // Single-prompt mode still requires key
  if (options.prompt && !apiKey) {
    console.error(chalk.red('\n✗ No API key found.'));
    console.error(chalk.gray('  Set DEEPSEEK_API_KEY environment variable or use --api-key'));
    console.error(chalk.gray('  Get your key at: https://platform.deepseek.com/api_keys\n'));
    process.exit(1);
  }

  // ══════ Agent Setup (lazy, for when key is available) ══════
  let agent = null;

  function createAgent(key) {
    apiKey = key;
    agent = new Agent({
      apiKey,
      model,
      mode,
      thinking,
      projectRoot,
      promptContext: {
        projectRoot,
        projectFiles: getProjectFiles(projectRoot),
        gitStatus: getGitStatus(projectRoot),
        mode,
        model,
        userProfile: memory.profile,
        memories: memory.getRelevantMemories(),
      },
    });
    wireAgentEvents(agent, memory);
    return agent;
  }

  // Create agent upfront if key exists
  if (apiKey) {
    createAgent(apiKey);
  }

  // ══════ Single Prompt Mode ══════
  if (options.prompt && agent) {
    // Print compact header
    console.log(renderer.renderBanner({ model, mode, thinking, projectRoot }));
    renderer.printDivider();

    // Wire up visual events
    wireAgentEvents(agent, memory);

    const startTime = Date.now();
    await agent.chat(options.prompt);
    const duration = Date.now() - startTime;

    renderer.printBlank();

    // Show session summary
    const usage = agent.getUsage();
    const ctxStats = agent.getContextStats();
    console.log(renderer.renderSessionSummary({
      model,
      mode,
      messages: ctxStats.messageCount,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      reasoningTokens: usage.reasoningTokens,
      cost: usage.cost,
      rounds: usage.rounds,
      duration,
    }));

    // Save session
    saveSession(projectRoot, agent, memory);
    return;
  }

  // ══════ Interactive Mode ══════
  renderer.clearScreen();

  // Print header
  console.log(renderer.renderBanner({ model, mode, thinking, projectRoot }));

  if (!agent) {
    // No API key — show setup screen
    showSetupScreen(projectRoot, memory);
  } else {
    // Has key — show normal help line
    console.log(chalk.gray(`  Commands: ${chalk.white('/auto /plan /ask /chat')}  ${chalk.white('/model <name>')}  ${chalk.white('/clear /compact /usage /help')}  ${chalk.white('/exit')}`));
    renderer.printDivider();

    // Resume session
    if (!options.newSession) {
      const resumed = tryResumeSession(projectRoot, agent, options.resume);
      if (resumed) {
        renderer.printInfo('Session resumed. Type /clear to start fresh.');
        renderer.printBlank();
      }
    }
  }

  // Create readline
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: agent ? renderer.getPrompt(mode) : chalk.yellow.bold('🔑 funds › '),
    terminal: true,
    historySize: 1000,
  });

  rl.prompt();

  // Handle input
  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.setPrompt(agent ? renderer.getPrompt(mode) : chalk.yellow.bold('🔑 funds › '));
      rl.prompt();
      return;
    }

    // Exit
    if (input === '/exit' || input === '/quit') {
      console.log(chalk.gray('\n  Goodbye! 👋\n'));
      if (agent) saveSession(projectRoot, agent, memory);
      rl.close();
      return;
    }

    // ══════ Auth command (available without agent) ══════
    if (input.startsWith('/auth ') || input.startsWith('/key ')) {
      const key = input.replace(/^\/(auth|key)\s+/, '').trim();
      if (!key || key.length < 10) {
        renderer.printError('Invalid API key. Should start with "sk-".');
        rl.setPrompt(chalk.yellow.bold('🔑 funds › '));
        rl.prompt();
        return;
      }

      // Save to global config
      try {
        const configDir = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.fundeepseek');
        if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
        const cfg = fs.existsSync(path.join(configDir, 'config.json'))
          ? JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf-8'))
          : {};
        cfg.apiKey = key;
        fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(cfg, null, 2), 'utf-8');
      } catch (e) {
        renderer.printWarning('API key set for this session, but failed to save permanently.');
      }

      // Create agent with the new key
      createAgent(key);
      renderer.printSuccess('API key configured! FundeePseek is ready.');
      renderer.printBlank();
      renderer.printDivider();

      if (!options.newSession) {
        const resumed = tryResumeSession(projectRoot, agent, options.resume);
        if (resumed) {
          renderer.printInfo('Session resumed. Type /clear to start fresh.');
          renderer.printBlank();
        }
      }

      rl.setPrompt(renderer.getPrompt(mode));
      rl.prompt();
      return;
    }

    // If no agent yet and not auth command
    if (!agent) {
      console.log(chalk.yellow('\n  👋 Welcome! First, set your API key:'));
      console.log(chalk.white('     /auth sk-your-deepseek-api-key'));
      console.log(chalk.gray('\n  Get a key at: https://platform.deepseek.com/api_keys\n'));
      rl.setPrompt(chalk.yellow.bold('🔑 funds › '));
      rl.prompt();
      return;
    }

    // ══════ Normal agent flow ══════

    // Local slash commands
    const cmdResult = handleLocalCommand(input, agent, memory, rl);
    if (cmdResult !== null) {
      rl.setPrompt(renderer.getPrompt(mode));
      rl.prompt();
      return;
    }

    // Agent turn
    renderer.printBlank();
    const startTime = Date.now();

    try {
      await agent.chat(input);
    } catch (err) {
      renderer.printError(`Agent error: ${err.message}`);
    }

    const elapsed = Date.now() - startTime;
    memory.learnFromMessages(agent.exportContext());

    // Quick status line
    const usage = agent.getUsage();
    if (usage.totalTokens > 0) {
      process.stdout.write(chalk.gray(`  ⏱ ${formatDuration(elapsed)} · ${usage.totalTokens.toLocaleString()} tokens · $${usage.cost.toFixed(4)}`));
    }
    renderer.printBlank();
    renderer.printBlank();

    rl.setPrompt(renderer.getPrompt(agent.mode || mode));
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('');
    process.exit(0);
  });
}

// ═══════════════════════════════════════════════════════════
// Setup Screen — shown when no API key configured
// ═══════════════════════════════════════════════════════════

function showSetupScreen(projectRoot, memory) {
  const w = Math.min(process.stdout.columns || 80, 70);

  console.log([
    '',
    chalk.yellow.bold('  ╔' + '═'.repeat(w - 4) + '╗'),
    chalk.yellow.bold('  ║') + chalk.white.bold('  👋 Welcome to FundeePseek!') + ' '.repeat(Math.max(0, w - 31)) + chalk.yellow.bold('║'),
    chalk.yellow.bold('  ║') + ' '.repeat(w - 4) + chalk.yellow.bold('║'),
    chalk.yellow.bold('  ║') + chalk.white('  To get started, set your DeepSeek API key:') + ' '.repeat(Math.max(0, w - 50)) + chalk.yellow.bold('║'),
    chalk.yellow.bold('  ║') + ' '.repeat(w - 4) + chalk.yellow.bold('║'),
    chalk.yellow.bold('  ║') + chalk.cyan.bold('     /auth sk-your-api-key-here') + ' '.repeat(Math.max(0, w - 34)) + chalk.yellow.bold('║'),
    chalk.yellow.bold('  ║') + ' '.repeat(w - 4) + chalk.yellow.bold('║'),
    chalk.yellow.bold('  ║') + chalk.gray('  Or set via:') + ' '.repeat(Math.max(0, w - 20)) + chalk.yellow.bold('║'),
    chalk.yellow.bold('  ║') + chalk.gray('    • Environment:  setx DEEPSEEK_API_KEY sk-xxx') + ' '.repeat(Math.max(0, w - 53)) + chalk.yellow.bold('║'),
    chalk.yellow.bold('  ║') + chalk.gray('    • Config file:  ~/.fundeepseek/config.json') + ' '.repeat(Math.max(0, w - 50)) + chalk.yellow.bold('║'),
    chalk.yellow.bold('  ║') + chalk.gray('    • CLI flag:     funds --api-key sk-xxx') + ' '.repeat(Math.max(0, w - 46)) + chalk.yellow.bold('║'),
    chalk.yellow.bold('  ║') + ' '.repeat(w - 4) + chalk.yellow.bold('║'),
    chalk.yellow.bold('  ║') + chalk.gray('  Get your key: https://platform.deepseek.com/api_keys') + ' '.repeat(Math.max(0, w - 57)) + chalk.yellow.bold('║'),
    chalk.yellow.bold('  ╚' + '═'.repeat(w - 4) + '╝'),
    '',
  ].join('\n'));
}

// ═══════════════════════════════════════════════════════════
// Event Wiring — connects Agent events to visual renderer
// ═══════════════════════════════════════════════════════════

let thinkingActiveInTurn = false;

function wireAgentEvents(agent, memory) {
  // Remove old listeners to avoid duplicates
  agent.removeAllListeners('thinking');
  agent.removeAllListeners('stream');
  agent.removeAllListeners('tool:start');
  agent.removeAllListeners('tool:done');
  agent.removeAllListeners('tool:error');
  agent.removeAllListeners('warning');
  agent.removeAllListeners('error');
  agent.removeAllListeners('response');

  agent.on('thinking', (text) => {
    if (!thinkingActiveInTurn) {
      renderer.startThinking();
      thinkingActiveInTurn = true;
    }
    renderer.appendThinking(text);
  });

  agent.on('stream', (text) => {
    if (thinkingActiveInTurn) {
      renderer.endThinking();
      thinkingActiveInTurn = false;
    }
    renderer.writeStream(text);
  });

  agent.on('tool:start', (name, args) => {
    if (thinkingActiveInTurn) {
      renderer.endThinking();
      thinkingActiveInTurn = false;
    }
    renderer.startToolProgress(name, args);
  });

  agent.on('tool:done', (name, result) => {
    const detail = result?.metadata
      ? Object.values(result.metadata).join(', ')
      : undefined;
    renderer.finishToolProgress(name, true, detail);
  });

  agent.on('tool:error', (name, err) => {
    renderer.finishToolProgress(name, false, err?.substring(0, 60));
  });

  agent.on('warning', (msg) => {
    renderer.printWarning(msg);
  });

  agent.on('error', (err) => {
    renderer.printError(err.message);
  });

  agent.on('response', () => {
    thinkingActiveInTurn = false;
  });
}

// ═══════════════════════════════════════════════════════════
// Local Command Handlers
// ═══════════════════════════════════════════════════════════

function handleLocalCommand(input, agent, memory, rl) {
  // Profile
  if (input === '/profile') {
    console.log('\n' + memory.getProfileSummary() + '\n');
    return true;
  }

  // Memories
  if (input === '/memories') {
    const mems = memory.listMemories();
    if (mems.length === 0) {
      renderer.printInfo('No memories yet. Use /remember <text> to save one.');
    } else {
      renderer.printDivider();
      for (const mem of mems.slice(0, 10)) {
        console.log(chalk.cyan(`  [${mem.metadata.type}] ${mem.description}`));
      }
      renderer.printDivider();
    }
    return true;
  }

  // Remember
  if (input.startsWith('/remember ')) {
    const fact = input.slice(10).trim();
    memory.rememberFact(fact);
    renderer.printSuccess('Memory saved.');
    return true;
  }

  // Forget
  if (input.startsWith('/forget ')) {
    const slug = input.slice(8).trim();
    const deleted = memory.forget(slug);
    console.log(deleted ? chalk.green('  ✓ Deleted.') : chalk.red('  ✗ Not found.'));
    return true;
  }

  // Help
  if (input === '/help') {
    console.log([
      '',
      chalk.bold.cyan('  FundeePseek Commands'),
      '',
      chalk.white('  /auto') + chalk.gray('      — Full autonomy mode'),
      chalk.white('  /plan') + chalk.gray('      — Plan-first mode'),
      chalk.white('  /ask') + chalk.gray('       — Read-only mode'),
      chalk.white('  /chat') + chalk.gray('      — Pure conversation'),
      chalk.white('  /auth <key>') + chalk.gray(' — Set API key'),
      chalk.white('  /model <name>') + chalk.gray(' — Switch model'),
      chalk.white('  /clear') + chalk.gray('     — Clear context'),
      chalk.white('  /compact') + chalk.gray('   — Show context usage'),
      chalk.white('  /usage') + chalk.gray('     — Token usage & cost'),
      chalk.white('  /profile') + chalk.gray('   — Your coding profile'),
      chalk.white('  /remember <t>') + chalk.gray(' — Save a memory'),
      chalk.white('  /memories') + chalk.gray('  — List memories'),
      chalk.white('  /exit') + chalk.gray('      — Exit & save'),
      '',
    ].join('\n'));
    return true;
  }

  // Mode changes — update prompt
  if (['/auto', '/plan', '/ask', '/chat'].includes(input)) {
    return true; // Handled by agent
  }

  // Model change
  if (input.startsWith('/model ')) {
    return true; // Handled by agent
  }

  // Clear context
  if (input === '/clear') {
    return true; // Handled by agent
  }

  return null; // Not handled locally, pass to agent
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function getProjectFiles(projectRoot) {
  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
    return entries
      .filter(e => !e.name.startsWith('.') || e.name === '.gitignore')
      .slice(0, 30)
      .map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}${e.isDirectory() ? '/' : ''}`)
      .join('\n');
  } catch {
    return '';
  }
}

function getGitStatus(projectRoot) {
  try {
    const { execSync } = require('child_process');
    return execSync('git status --short', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
  } catch {
    return '';
  }
}

function tryResumeSession(projectRoot, agent, specificId) {
  try {
    const storage = new SessionStorage(projectRoot);
    let session;
    if (specificId === true || specificId === undefined) {
      session = storage.getLatest();
    } else if (typeof specificId === 'string') {
      session = storage.load(specificId);
    }
    if (session && session.messages?.length > 0) {
      agent.resume(session.messages);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function saveSession(projectRoot, agent, memory) {
  try {
    const mgr = new SessionManager(projectRoot, agent._config?.model || 'deepseek-chat', agent._config?.mode || 'auto');
    mgr.save();
    memory.learnFromMessages(agent.exportContext());
  } catch {
    // silent fail
  }
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return seconds + 's';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + 'm ' + s + 's';
}

program.parse(process.argv);
