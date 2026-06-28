// ============================================================
// Global Memory Manager — high-level memory API
// Combines store + profile for the agent to use
// ============================================================
import { MemoryEntry, UserProfile, Message } from '../types';
import { MemoryStore } from './store';
import { UserProfileAnalyzer } from './profile';

export class GlobalMemory {
  private store: MemoryStore;
  private analyzer: UserProfileAnalyzer;

  constructor(globalDir?: string) {
    this.store = new MemoryStore(globalDir);
    this.analyzer = new UserProfileAnalyzer(this.store);
  }

  // ---- Profile ----

  get profile(): UserProfile {
    return this.analyzer.current;
  }

  /** Analyze conversation messages and update user profile */
  learnFromMessages(messages: Message[]): void {
    this.analyzer.analyzeMessages(messages);
  }

  /** Show user profile summary */
  getProfileSummary(): string {
    return this.analyzer.getSummary();
  }

  /** Process explicit user feedback */
  processFeedback(feedback: string): void {
    this.analyzer.updateWithFeedback(feedback);
  }

  // ---- Memories ----

  /** Get memories relevant to the current context */
  getRelevantMemories(context?: string): MemoryEntry[] {
    if (!context) return this.store.getRecent(10);
    return this.store.search(context).slice(0, 10);
  }

  /** Save a new memory */
  remember(entry: MemoryEntry): void {
    this.store.save(entry);
  }

  /** Save a simple text memory (auto-generates metadata) */
  async rememberFact(
    fact: string,
    type: 'user' | 'feedback' | 'project' | 'reference' = 'project'
  ): Promise<void> {
    const slug = fact
      .substring(0, 50)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    this.store.save({
      name: `${slug}-${Date.now().toString(36)}`,
      description: fact.substring(0, 100),
      metadata: {
        type,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
      content: fact,
    });
  }

  /** Forget a memory */
  forget(slug: string): boolean {
    return this.store.delete(slug);
  }

  /** List all memories of a type */
  listMemories(type?: string): MemoryEntry[] {
    return this.store.getAll(type);
  }

  /** Search memories */
  searchMemories(query: string): MemoryEntry[] {
    return this.store.search(query);
  }

  /** Get memory statistics */
  getStats(): Record<string, number> {
    return this.store.countByType();
  }
}
