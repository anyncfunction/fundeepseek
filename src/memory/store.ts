// ============================================================
// Memory Store — file-based persistent memory storage
// ============================================================
import * as fs from 'fs';
import * as path from 'path';
import { MemoryEntry } from '../types';

export class MemoryStore {
  private memoryDir: string;
  private indexPath: string;

  constructor(globalDir?: string) {
    const home = globalDir || path.join(
      process.env.HOME || process.env.USERPROFILE || '~',
      '.fundeepseek'
    );
    this.memoryDir = path.join(home, 'memory');
    this.indexPath = path.join(this.memoryDir, 'index.json');
    this.ensureDirs();
  }

  /** Get all memories, optionally filtered by type */
  getAll(type?: string): MemoryEntry[] {
    if (!fs.existsSync(this.indexPath)) return [];
    try {
      const index: string[] = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
      const memories: MemoryEntry[] = [];
      for (const slug of index) {
        const mem = this.getBySlug(slug);
        if (mem && (!type || mem.metadata.type === type)) {
          memories.push(mem);
        }
      }
      return memories.sort(
        (a, b) => new Date(b.metadata.updated).getTime() - new Date(a.metadata.updated).getTime()
      );
    } catch {
      return [];
    }
  }

  /** Get a single memory by slug */
  getBySlug(slug: string): MemoryEntry | null {
    const filepath = path.join(this.memoryDir, `${slug}.json`);
    if (!fs.existsSync(filepath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /** Save a memory entry (create or update) */
  save(entry: MemoryEntry): void {
    entry.metadata.updated = new Date().toISOString();
    if (!entry.metadata.created) {
      entry.metadata.created = new Date().toISOString();
    }

    // Write memory file
    const filepath = path.join(this.memoryDir, `${entry.name}.json`);
    fs.writeFileSync(filepath, JSON.stringify(entry, null, 2), 'utf-8');

    // Update index
    this.updateIndex(entry.name);
  }

  /** Delete a memory by slug */
  delete(slug: string): boolean {
    const filepath = path.join(this.memoryDir, `${slug}.json`);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      this.removeFromIndex(slug);
      return true;
    }
    return false;
  }

  /** Search memories by keyword in description and content */
  search(query: string): MemoryEntry[] {
    const all = this.getAll();
    const q = query.toLowerCase();
    return all.filter(
      (m) =>
        m.description.toLowerCase().includes(q) ||
        m.content.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q)
    );
  }

  /** Get recent memories (last N) */
  getRecent(count: number = 10): MemoryEntry[] {
    return this.getAll().slice(0, count);
  }

  /** Count memories by type */
  countByType(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const mem of this.getAll()) {
      counts[mem.metadata.type] = (counts[mem.metadata.type] || 0) + 1;
    }
    return counts;
  }

  // ---- Private ----

  private ensureDirs(): void {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
    if (!fs.existsSync(this.indexPath)) {
      fs.writeFileSync(this.indexPath, '[]', 'utf-8');
    }
  }

  private updateIndex(slug: string): void {
    try {
      const index: string[] = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
      if (!index.includes(slug)) {
        index.push(slug);
        fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2), 'utf-8');
      }
    } catch {
      fs.writeFileSync(this.indexPath, JSON.stringify([slug]), 'utf-8');
    }
  }

  private removeFromIndex(slug: string): void {
    try {
      const index: string[] = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
      const filtered = index.filter((s) => s !== slug);
      fs.writeFileSync(this.indexPath, JSON.stringify(filtered, null, 2), 'utf-8');
    } catch {
      // ignore
    }
  }
}
