// ============================================================
// Session Manager — orchestrates session lifecycle
// ============================================================
import { Session, Message, ModelName, AgentMode } from '../types';
import { SessionStorage } from './storage';

let sessionCounter = 0;

export class SessionManager {
  private storage: SessionStorage;
  private currentSession: Session;
  private projectRoot: string;

  constructor(
    projectRoot: string,
    model: ModelName,
    mode: AgentMode
  ) {
    this.projectRoot = projectRoot;
    this.storage = new SessionStorage(projectRoot);
    this.currentSession = this.createNew(model, mode);
  }

  get session(): Session {
    return this.currentSession;
  }

  /** Record messages to the current session */
  recordMessages(messages: Message[]): void {
    this.currentSession.messages = messages;
    this.currentSession.updatedAt = new Date().toISOString();
  }

  /** Update token usage */
  updateUsage(prompt: number, completion: number, reasoning: number = 0): void {
    this.currentSession.tokenUsage.prompt += prompt;
    this.currentSession.tokenUsage.completion += completion;
    this.currentSession.tokenUsage.reasoning += reasoning;
    this.currentSession.tokenUsage.total += prompt + completion;
  }

  /** Switch model for current session */
  switchModel(model: ModelName): void {
    this.currentSession.model = model;
  }

  /** Switch mode */
  switchMode(mode: AgentMode): void {
    this.currentSession.mode = mode;
  }

  /** Save current session to disk */
  save(): string {
    return this.storage.save(this.currentSession);
  }

  /** Resume from a saved session */
  resume(sessionId: string): Session | null {
    const session = this.storage.load(sessionId);
    if (session) {
      this.currentSession = session;
      this.currentSession.updatedAt = new Date().toISOString();
    }
    return session;
  }

  /** List saved sessions */
  listSessions(): Session[] {
    return this.storage.list();
  }

  /** Start a new session (saves current first) */
  newSession(model?: ModelName, mode?: AgentMode): Session {
    this.save();
    this.currentSession = this.createNew(
      model || this.currentSession.model,
      mode || this.currentSession.mode
    );
    return this.currentSession;
  }

  /** Delete a session */
  deleteSession(sessionId: string): boolean {
    return this.storage.delete(sessionId);
  }

  /** Export session as text */
  exportAsText(sessionId?: string): string | null {
    return this.storage.exportAsText(sessionId || this.currentSession.id);
  }

  /** Get formatted session summary for display */
  getSummary(): string {
    const s = this.currentSession;
    return [
      `Session: ${s.id.substring(0, 8)}...`,
      `Created: ${s.createdAt}`,
      `Model: ${s.model}`,
      `Mode: ${s.mode}`,
      `Messages: ${s.messages.length}`,
      `Tokens: ${s.tokenUsage.total.toLocaleString()} (est. cost: $${this.estimateCost().toFixed(4)})`,
    ].join(' | ');
  }

  private createNew(model: ModelName, mode: AgentMode): Session {
    sessionCounter++;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const id = `funds-${timestamp}-${sessionCounter}`;

    return {
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projectRoot: this.projectRoot,
      model,
      mode,
      messages: [],
      tokenUsage: {
        prompt: 0,
        completion: 0,
        total: 0,
        reasoning: 0,
      },
    };
  }

  private estimateCost(): number {
    // Simplified cost estimation
    const rates: Record<string, { input: number; output: number }> = {
      'deepseek-chat': { input: 0.27, output: 1.10 },
      'deepseek-reasoner': { input: 0.55, output: 2.19 },
      'deepseek-v4-pro': { input: 1.10, output: 4.40 },
      'deepseek-v4-flash': { input: 0.14, output: 0.55 },
    };
    const rate = rates[this.currentSession.model] || rates['deepseek-chat'];
    const inputCost = (this.currentSession.tokenUsage.prompt / 1_000_000) * rate.input;
    const outputCost = (this.currentSession.tokenUsage.completion / 1_000_000) * rate.output;
    return inputCost + outputCost;
  }
}
