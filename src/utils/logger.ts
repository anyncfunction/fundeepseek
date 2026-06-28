// ============================================================
// Logger — colored, leveled logging for the CLI
// ============================================================
import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

export class Logger {
  private level: LogLevel;
  private useColors: boolean;
  private logFile: string | null = null;

  constructor(level: LogLevel = LogLevel.INFO, useColors: boolean = true) {
    this.level = level;
    this.useColors = useColors;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setLogFile(filepath: string): void {
    this.logFile = filepath;
  }

  debug(msg: string, ...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      this.log('DEBUG', chalk.gray, msg, args);
    }
  }

  info(msg: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      this.log('INFO', chalk.blue, msg, args);
    }
  }

  success(msg: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      this.log('OK', chalk.green, msg, args);
    }
  }

  warn(msg: string, ...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      this.log('WARN', chalk.yellow, msg, args);
    }
  }

  error(msg: string, ...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      this.log('ERROR', chalk.red, msg, args);
    }
  }

  /** Log a section header */
  section(title: string): void {
    if (this.level <= LogLevel.INFO) {
      console.log('');
      console.log(this.useColors ? chalk.bold.cyan(`═══ ${title} ═══`) : `=== ${title} ===`);
    }
  }

  /** Log a separator line */
  separator(char: string = '─', length: number = 60): void {
    if (this.level <= LogLevel.INFO) {
      console.log(this.useColors ? chalk.gray(char.repeat(length)) : char.repeat(length));
    }
  }

  /** Log raw text (no prefix, no color) */
  raw(msg: string): void {
    if (this.level <= LogLevel.INFO) {
      console.log(msg);
    }
  }

  /** Log markdown content (rendered for terminal) */
  markdown(md: string): void {
    if (this.level <= LogLevel.INFO) {
      // Simple markdown rendering for terminal
      const rendered = md
        .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
          return this.useColors
            ? chalk.gray(`\n┌── ${lang || 'code'} ──\n`) +
                code
                  .split('\n')
                  .map((l: string) => chalk.gray('│ ') + l)
                  .join('\n') +
                chalk.gray('\n└' + '─'.repeat(40))
            : `[${lang || 'code'}]\n${code}\n[/code]`;
        })
        .replace(/\*\*(.+?)\*\*/g, (_, text) =>
          this.useColors ? chalk.bold(text) : text
        )
        .replace(/\*(.+?)\*/g, (_, text) =>
          this.useColors ? chalk.italic(text) : text
        )
        .replace(/`(.+?)`/g, (_, text) =>
          this.useColors ? chalk.cyan(text) : text
        );
      console.log(rendered);
    }
  }

  /** Log a progress message (for agent steps) */
  step(action: string, detail?: string): void {
    if (this.level <= LogLevel.INFO) {
      const icon = this.useColors ? chalk.blue('→') : '→';
      const text = this.useColors ? chalk.white(action) : action;
      const extra = detail ? (this.useColors ? chalk.gray(` (${detail})`) : ` (${detail})`) : '';
      console.log(`${icon} ${text}${extra}`);
    }
  }

  private log(
    level: string,
    colorFn: (s: string) => string,
    msg: string,
    args: any[]
  ): void {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const prefix = this.useColors
      ? `${chalk.gray(timestamp)} ${colorFn(`[${level}]`)}`
      : `${timestamp} [${level}]`;

    const formatted = [prefix, msg, ...args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))].join(' ');

    console.log(formatted);

    // Also write to log file if configured
    if (this.logFile) {
      const fs = require('fs');
      fs.appendFileSync(
        this.logFile,
        `${timestamp} [${level}] ${msg} ${args.join(' ')}\n`
      );
    }
  }
}

export const logger = new Logger();
