#!/usr/bin/env node
// ============================================================
// FundeePseek CLI — dsc command entry point
// ============================================================
const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const os = require('os');

// Dynamic imports for TypeScript-compiled modules
let Agent, GlobalMemory, loadConfig, initProject;
let logger, estimateMessageTokens, formatTokens;

const program = new Command();

// ---- CLI Definition ----

program
  .name('dsc')
  .description(chalk.bold('FundeePseek') + ' — DeepSeek-powered CLI coding assistant')
  .version('1.0.0')
  .usage('[options] [prompt]')
  .option('-p, --prompt <text>', 'Single prompt (non-interactive mode)')
  .option('-m, --model <name>', 'Model: deepseek-chat, deepseek-reasoner, deepseek-v4-pro, deepseek-v4-flash')
  .option('-M, --mode <mode>', 'Mode: auto, plan, ask, chat', 'auto')
  .option('-t, --thinking <mode>', 'Thinking: on, off, auto', 'off')
  .option('-r, --resume [session-id]', 'Resume a previous session (latest if no ID)')
  .option('-s, --session <id>', 'Use a specific session ID')
  .option('-n, --new-session', 'Start a new session (don\'t resume)')
  .option('--init', 'Initialize FundeePseek in the current directory')
  .option('--list-sessions', 'List saved sessions')
  .option('--export <session-id>', 'Export a session as text')
  .option('--profile', 'Show user profile')
  .option('--memories', 'List global memories')
  .option('--remember <text>', 'Save a global memory')
  .option('--forget <slug>', 'Delete a global memory')
  .option('-v, --verbose', 'Verbose logging', false)
  .option('--no-color', 'Disable colored output')
  .option('--api-key <key>', 'DeepSeek API key (or set DEEPSEEK_API_KEY env var)')
  .action(main);

// ---- Main ----

async function main(options) {
  // Load modules
  await loadModules();

  // Initialize
  if (options.init) {
    const cwd = process.cwd();
    initProject(cwd);
    console.log(chalk.green(`✓ FundeePseek initialized in ${cwd}`));
    console.log(chalk.gray('  Created .deepseek/ with project settings'));
    console.log(chalk.gray('  Run dsc to start coding!'));
    return;
  }

  // Load config
  const projectRoot = process.cwd();
  const config = loadConfig(projectRoot);

  // Determine model and mode (can be set without API key)
  const model = options.model || config.defaultModel || 'deepseek-chat';
  const mode = options.mode || config.defaultMode || 'auto';
  const thinking = options.thinking || config.defaultThinking || 'off';

  // Initialize global memory (no API key needed)
  const memory = new GlobalMemory();

  // ══════ Non-agent commands (no API key needed) ══════

  // Show profile
  if (options.profile) {
    console.log(memory.getProfileSummary());
    return;
  }

  // List memories
  if (options.memories) {
    const memories = memory.listMemories();
    if (memories.length === 0) {
      console.log(chalk.gray('No memories saved yet.'));
    } else {
      for (const mem of memories) {
        console.log(chalk.cyan(`[${mem.metadata.type}] ${mem.description}`));
        console.log(chalk.gray(`  ${mem.content.substring(0, 200)}`));
      }
    }
    return;
  }

  // Save memory
  if (options.remember) {
    await memory.rememberFact(options.remember, 'project');
    console.log(chalk.green('✓ Memory saved.'));
    return;
  }

  // Forget memory
  if (options.forget) {
    const deleted = memory.forget(options.forget);
    console.log(deleted ? chalk.green('✓ Memory deleted.') : chalk.red('✗ Memory not found.'));
    return;
  }

  // List sessions
  if (options.listSessions) {
    const { SessionStorage } = require('../dist/session/storage');
    const storage = new SessionStorage(projectRoot);
    const sessions = storage.list();
    if (sessions.length === 0) {
      console.log(chalk.gray('No sessions found.'));
    } else {
      for (const s of sessions) {
        console.log(chalk.cyan(`${s.id.substring(0, 12)}...`));
        console.log(chalk.gray(`  Model: ${s.model} | Mode: ${s.mode} | ${s.messages.length} msgs | ${s.updatedAt}`));
      }
    }
    return;
  }

  // Export session
  if (options.export) {
    const { SessionStorage } = require('../dist/session/storage');
    const storage = new SessionStorage(projectRoot);
    const text = storage.exportAsText(options.export);
    if (text) {
      const outPath = path.join(projectRoot, `session-${options.export.substring(0, 8)}.md`);
      fs.writeFileSync(outPath, text, 'utf-8');
      console.log(chalk.green(`✓ Session exported to ${outPath}`));
    } else {
      console.log(chalk.red('✗ Session not found.'));
    }
    return;
  }

  // ══════ Agent commands (API key required) ══════

  // Get API key
  const apiKey = options.apiKey || config.apiKey || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error(chalk.red('✗ No API key found. Set DEEPSEEK_API_KEY environment variable or use --api-key'));
    console.error(chalk.gray('  Get your key at: https://platform.deepseek.com/api_keys'));
    process.exit(1);
  }

  // ---- Get project context ----
  const projectContext = await getProjectContext(projectRoot);

  // ---- Create Agent ----
  const agent = new Agent({
    apiKey,
    model,
    mode,
    thinking,
    projectRoot,
    promptContext: {
      projectRoot,
      projectFiles: projectContext.files,
      gitStatus: projectContext.gitStatus,
      mode,
      model,
      userProfile: memory.profile,
      memories: memory.getRelevantMemories(),
    },
  });

  // ---- Handle single prompt mode ----
  if (options.prompt) {
    console.log(chalk.gray(`Model: ${model} | Mode: ${mode} | Thinking: ${thinking}`));
    console.log(chalk.gray('─'.repeat(60)));

    setupStreamHandlers(agent);

    const response = await agent.chat(options.prompt);
    console.log('');

    // Update memory
    memory.learnFromMessages(agent.exportContext());

    // Show usage
    const usage = agent.getUsage();
    if (usage.totalTokens > 0) {
      console.log(chalk.gray(`\nTokens: ${usage.totalTokens.toLocaleString()} | Cost: $${usage.cost.toFixed(4)}`));
    }

    return;
  }

  // ---- Interactive mode ----
  console.log(chalk.bold.cyan('╔══════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║') + chalk.bold.white('          FundeePseek v1.0.0                 ') + chalk.bold.cyan('║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════╝'));
  console.log('');
  console.log(chalk.gray(`Model: ${model} | Mode: ${mode} | Thinking: ${thinking}`));
  console.log(chalk.gray(`Project: ${projectRoot}`));
  console.log(chalk.gray(`Type /help for commands, /auto /plan /ask /chat to switch modes`));
  console.log('');

  // Resume session if available and not --new-session
  if (!options.newSession) {
    const resumed = await tryResume(projectRoot, agent, options.resume);
    if (resumed) {
      console.log(chalk.gray('(Session resumed. Type /clear to start fresh)'));
      console.log('');
    }
  }

  setupStreamHandlers(agent);

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('dsc › '),
    terminal: true,
    historySize: 1000,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    // Exit command
    if (input === '/exit' || input === '/quit') {
      console.log(chalk.gray('Goodbye!'));
      // Save session
      const { SessionManager } = require('../dist/session/manager');
      const sessionMgr = new SessionManager(projectRoot, model, mode);
      sessionMgr.session.messages = agent.exportContext();
      sessionMgr.save();
      memory.learnFromMessages(agent.exportContext());
      rl.close();
      return;
    }

    // Handle slash commands locally
    if (input === '/profile') {
      console.log(memory.getProfileSummary());
      rl.prompt();
      return;
    }

    if (input === '/memories') {
      const mems = memory.listMemories();
      if (mems.length === 0) {
        console.log(chalk.gray('No memories saved yet.'));
      } else {
        for (const mem of mems.slice(0, 10)) {
          console.log(chalk.cyan(`[${mem.metadata.type}] ${mem.description}`));
        }
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('/remember ')) {
      const fact = input.slice(10).trim();
      await memory.rememberFact(fact);
      console.log(chalk.green('✓ Memory saved.'));
      rl.prompt();
      return;
    }

    if (input.startsWith('/forget ')) {
      const slug = input.slice(8).trim();
      memory.forget(slug);
      console.log(chalk.green('✓ Memory deleted.'));
      rl.prompt();
      return;
    }

    // Agent turn
    console.log('');
    try {
      const response = await agent.chat(input);
      // Response is already streamed; we can print additional info here
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
    console.log('');

    // Update memory after each turn
    memory.learnFromMessages(agent.exportContext());

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('');
    process.exit(0);
  });

  // Handle Ctrl+C gracefully
  rl.on('SIGINT', () => {
    console.log(chalk.gray('\nUse /exit or /quit to exit, or Ctrl+C again to force quit'));
    rl.prompt();
  });
}

// ---- Helpers ----

async function loadModules() {
  try {
    const mod = require('../dist/index');
    Agent = mod.Agent;
    GlobalMemory = mod.GlobalMemory;
    loadConfig = mod.loadConfig;
    initProject = mod.initProject;
    logger = mod.logger;
    estimateMessageTokens = mod.estimateMessageTokens;
    formatTokens = mod.formatTokens;
  } catch (e) {
    console.error(chalk.red('Error: FundeePseek not built. Run "npm run build" first.'));
    process.exit(1);
  }
}

async function getProjectContext(projectRoot) {
  let files = '';
  let gitStatus = '';

  // List top-level project files
  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
    const fileList = entries
      .filter(e => !e.name.startsWith('.') || e.name === '.gitignore')
      .slice(0, 30)
      .map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}${e.isDirectory() ? '/' : ''}`)
      .join('\n');
    files = fileList;
  } catch {
    // ignore
  }

  // Get git status
  try {
    const { execSync } = require('child_process');
    gitStatus = execSync('git status --short', { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    // Not a git repo or git not available
  }

  return { files, gitStatus };
}

async function tryResume(projectRoot, agent, specificId) {
  try {
    const { SessionStorage } = require('../dist/session/storage');
    const storage = new SessionStorage(projectRoot);

    let session;
    if (specificId === true) {
      // --resume without specific ID: get latest
      session = storage.getLatest();
    } else if (typeof specificId === 'string') {
      session = storage.load(specificId);
    }

    if (session && session.messages?.length > 0) {
      await agent.resume(session.messages);
      return true;
    }
  } catch {
    // ignore resume errors
  }
  return false;
}

function setupStreamHandlers(agent) {
  let thinkingShown = false;

  agent.on('thinking', (text) => {
    if (!thinkingShown) {
      process.stdout.write(chalk.yellow('\n🤔 Thinking: '));
      thinkingShown = true;
    }
    process.stdout.write(chalk.yellow.dim(text));
  });

  agent.on('stream', (text) => {
    if (thinkingShown) {
      process.stdout.write('\n' + chalk.gray('─'.repeat(40)) + '\n');
      thinkingShown = false;
    }
    process.stdout.write(text);
  });

  agent.on('tool:name', (name) => {
    if (thinkingShown) {
      process.stdout.write('\n' + chalk.gray('─'.repeat(40)) + '\n');
      thinkingShown = false;
    }
    process.stdout.write(chalk.blue(`\n🔧 Using: ${name}...`));
  });

  agent.on('tool:done', (name) => {
    process.stdout.write(chalk.green(' ✓'));
  });

  agent.on('tool:error', (name, err) => {
    process.stdout.write(chalk.red(` ✗ ${err || ''}`));
  });

  agent.on('warning', (msg) => {
    console.log(chalk.yellow(`\n⚠ ${msg}`));
  });

  agent.on('error', (err) => {
    console.error(chalk.red(`\n✗ Error: ${err.message}`));
  });
}

program.parse(process.argv);
