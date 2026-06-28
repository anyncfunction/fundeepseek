// ============================================================
// Configuration Loader — reads config from multiple sources
// Priority: env > project settings > global settings > defaults
// ============================================================
import * as fs from 'fs';
import * as path from 'path';
import { AppConfig, ModelName, AgentMode, ThinkingMode } from '../types';

const DEFAULT_CONFIG: AppConfig = {
  version: '1.0.0',
  apiBaseUrl: 'https://api.deepseek.com',
  defaultModel: 'deepseek-v4-flash',
  defaultMode: 'auto',
  defaultThinking: 'auto',
  maxRetries: 3,
  timeout: 180000,
  colors: true,
};

export function loadConfig(projectRoot?: string): AppConfig {
  const config = { ...DEFAULT_CONFIG };

  // 1. Load global config
  const globalConfigPath = path.join(
    process.env.HOME || process.env.USERPROFILE || '~',
    '.fundeepseek',
    'config.json'
  );
  if (fs.existsSync(globalConfigPath)) {
    try {
      const globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
      Object.assign(config, globalConfig);
    } catch {
      // ignore malformed global config
    }
  }

  // 2. Load project config
  if (projectRoot) {
    const projectConfigPath = path.join(projectRoot, '.deepseek', 'settings.json');
    if (fs.existsSync(projectConfigPath)) {
      try {
        const projectConfig = JSON.parse(fs.readFileSync(projectConfigPath, 'utf-8'));
        Object.assign(config, projectConfig);
      } catch {
        // ignore malformed project config
      }
    }
  }

  // 3. Environment variables (highest priority)
  if (process.env.DEEPSEEK_API_KEY) config.apiKey = process.env.DEEPSEEK_API_KEY;
  if (process.env.DEEPSEEK_API_BASE) config.apiBaseUrl = process.env.DEEPSEEK_API_BASE;
  if (process.env.DEEPSEEK_MODEL) config.defaultModel = process.env.DEEPSEEK_MODEL as ModelName;
  if (process.env.DEEPSEEK_MODE) config.defaultMode = process.env.DEEPSEEK_MODE as AgentMode;
  if (process.env.DEEPSEEK_THINKING) config.defaultThinking = process.env.DEEPSEEK_THINKING as ThinkingMode;

  return config;
}

export function saveProjectConfig(projectRoot: string, updates: Partial<AppConfig>): void {
  const configDir = path.join(projectRoot, '.deepseek');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configPath = path.join(configDir, 'settings.json');
  let existing: Partial<AppConfig> = {};
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      // start fresh
    }
  }

  const merged = { ...existing, ...updates };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
}

export function saveGlobalConfig(updates: Partial<AppConfig>): void {
  const configDir = path.join(
    process.env.HOME || process.env.USERPROFILE || '~',
    '.fundeepseek'
  );
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configPath = path.join(configDir, 'config.json');
  let existing: Partial<AppConfig> = {};
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      // start fresh
    }
  }

  const merged = { ...existing, ...updates };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
}

/** Initialize a project directory for FundeePseek */
export function initProject(projectRoot: string): void {
  const deepseekDir = path.join(projectRoot, '.deepseek');
  if (!fs.existsSync(deepseekDir)) {
    fs.mkdirSync(deepseekDir, { recursive: true });
  }

  // Create default project settings if not exists
  const settingsPath = path.join(deepseekDir, 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    const defaults = {
      model: 'deepseek-chat',
      mode: 'auto',
      contextFiles: ['README.md', 'package.json'],
      ignorePatterns: ['node_modules', '.git', 'dist', 'build', '__pycache__', '.cache'],
    };
    fs.writeFileSync(settingsPath, JSON.stringify(defaults, null, 2), 'utf-8');
  }

  // Create .gitignore for .deepseek if not exists
  const gitignorePath = path.join(deepseekDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, 'sessions/\n*.log\n', 'utf-8');
  }

  // Configure global .gitignore
  const rootGitignore = path.join(projectRoot, '.gitignore');
  const deepseekEntry = '.deepseek/';
  let gitignore = '';
  if (fs.existsSync(rootGitignore)) {
    gitignore = fs.readFileSync(rootGitignore, 'utf-8');
  }
  if (!gitignore.includes(deepseekEntry)) {
    fs.writeFileSync(
      rootGitignore,
      (gitignore.trim() ? gitignore + '\n' : '') + deepseekEntry + '\n',
      'utf-8'
    );
  }
}
