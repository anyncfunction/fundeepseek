// ============================================================
// Session Storage — persist and restore sessions to disk
// ============================================================
import * as fs from 'fs';
import * as path from 'path';
import { Session, Message } from '../types';

export class SessionStorage {
  private sessionsDir: string;
  private globalDir: string;

  constructor(projectRoot: string) {
    this.sessionsDir = path.join(projectRoot, '.deepseek', 'sessions');
    this.globalDir = path.join(
      process.env.HOME || process.env.USERPROFILE || '~',
      '.fundeepseek',
      'history'
    );
    this.ensureDirs();
  }

  /** Save a session to disk */
  save(session: Session): string {
    const filename = `${session.id}.json`;
    const filepath = path.join(this.sessionsDir, filename);
    session.updatedAt = new Date().toISOString();
    fs.writeFileSync(filepath, JSON.stringify(session, null, 2), 'utf-8');
    return filepath;
  }

  /** Load a session by ID */
  load(sessionId: string): Session | null {
    const filepath = path.join(this.sessionsDir, `${sessionId}.json`);
    if (!fs.existsSync(filepath)) {
      // Try global history as fallback
      const globalPath = path.join(this.globalDir, `${sessionId}.json`);
      if (fs.existsSync(globalPath)) {
        return JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
      }
      return null;
    }
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  }

  /** List all sessions for the current project */
  list(): Session[] {
    const sessions: Session[] = [];
    if (!fs.existsSync(this.sessionsDir)) return sessions;

    const files = fs.readdirSync(this.sessionsDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = fs.readFileSync(path.join(this.sessionsDir, file), 'utf-8');
        sessions.push(JSON.parse(data));
      } catch {
        // Skip corrupted files
      }
    }

    return sessions.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  /** Delete a session */
  delete(sessionId: string): boolean {
    const filepath = path.join(this.sessionsDir, `${sessionId}.json`);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      return true;
    }
    return false;
  }

  /** Get the most recent session */
  getLatest(): Session | null {
    const sessions = this.list();
    return sessions.length > 0 ? sessions[0] : null;
  }

  /** Export session messages as plain text (for sharing) */
  exportAsText(sessionId: string): string | null {
    const session = this.load(sessionId);
    if (!session) return null;

    const lines: string[] = [
      `# FundeePseek Session: ${session.id}`,
      `Date: ${session.createdAt}`,
      `Model: ${session.model}`,
      `Messages: ${session.messages.length}`,
      '',
      '---',
      '',
    ];

    for (const msg of session.messages) {
      if (msg.role === 'system') continue;
      const role = msg.role.toUpperCase();
      if (typeof msg.content === 'string') {
        lines.push(`**${role}:** ${msg.content}`);
        lines.push('');
      }
      if (msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          lines.push(`  → Tool: ${tc.function.name}`);
          lines.push(`  → Args: ${tc.function.arguments}`);
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  private ensureDirs(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
    if (!fs.existsSync(this.globalDir)) {
      fs.mkdirSync(this.globalDir, { recursive: true });
    }
  }
}
