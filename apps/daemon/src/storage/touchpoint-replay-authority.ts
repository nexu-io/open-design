import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * POSIX directory synchronization errors fail closed. Windows has no portable
 * directory fsync: its journal contract covers process crashes, not power loss.
 */
export function syncAuthorityDirectory(directory: string): void {
  if (process.platform === 'win32') return;
  const fd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function ensureDirectory(directory: string): void {
  if (fs.existsSync(directory)) return;
  ensureDirectory(path.dirname(directory));
  fs.mkdirSync(directory);
  syncAuthorityDirectory(directory);
  syncAuthorityDirectory(path.dirname(directory));
}

/** Flush the file before rename; also flush its directory entry on POSIX. */
export function writeAuthorityFile(file: string, data: string | Buffer): void {
  const directory = path.dirname(file);
  ensureDirectory(directory);
  const temporary = path.join(directory, `.${path.basename(file)}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, data, { flag: 'wx' });
    const fd = fs.openSync(temporary, 'r+');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
    syncAuthorityDirectory(directory);
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch { /* no authority in temporary files */ }
    throw error;
  }
}

type Journal = { version: 1; generation: string; pending: string[] };

/**
 * One owner per account, enforced by SQLite's OS lock, released on process death.
 * The transaction is never committed and contains no authority data. The separate
 * synchronized journal survives SIGKILL; no PID/lease/stale-file reclamation exists.
 * Requires reliable local filesystem locking and file fsync. POSIX additionally
 * requires directory fsync; Windows guarantees process-crash ordering only and
 * makes no power-loss durability claim. Other synchronization errors fail closed.
 */
export class TouchpointReplayAuthority {
  private lock: Database.Database | null = null;
  private journal: Journal | null = null;
  private readonly file: string;
  private closed = false;

  constructor(directory: string) {
    this.file = path.join(directory, 'replay-authority.json');
    try {
      ensureDirectory(directory);
      this.lock = new Database(path.join(directory, 'replay-owner.sqlite'), { timeout: 0 });
      this.lock.pragma('journal_mode = DELETE');
      this.lock.exec('CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY); BEGIN EXCLUSIVE');
      syncAuthorityDirectory(directory);
      let previous: Journal | null = null;
      try {
        const value: unknown = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (typeof value === 'object' && value !== null &&
          'version' in value && value.version === 1 &&
          'generation' in value && typeof value.generation === 'string' && value.generation &&
          'pending' in value && Array.isArray(value.pending) && value.pending.every(token => typeof token === 'string' && token))
          previous = value as Journal;
      } catch { /* Missing/corrupt provenance cannot bless any prior generation. */ }
      if (previous && previous.pending.length === 0) this.journal = previous;
      else {
        // Advance durably BEFORE discarding unresolved prior-owner tokens.
        const recovered: Journal = { version: 1, generation: randomUUID(), pending: [] };
        writeAuthorityFile(this.file, JSON.stringify(recovered));
        this.journal = recovered;
      }
    } catch {
      this.close();
    }
  }

  get generation(): string | null { return this.closed ? null : this.journal?.generation ?? null; }

  begin(): string | null {
    if (!this.journal || this.closed || this.journal.pending.length >= 4096) return null;
    const token = randomUUID();
    const next = { ...this.journal, pending: [...this.journal.pending, token] };
    // Even an uncertain rename/fsync outcome cannot authorize dispatch. Disable
    // this owner; a successor must recover whichever journal actually survived.
    try { writeAuthorityFile(this.file, JSON.stringify(next)); }
    catch { this.journal = null; return null; }
    this.journal = next;
    return token;
  }

  settle(token: string): boolean {
    if (!this.journal || this.closed || !this.journal.pending.includes(token)) return false;
    const next = { ...this.journal, pending: this.journal.pending.filter(candidate => candidate !== token) };
    try { writeAuthorityFile(this.file, JSON.stringify(next)); }
    catch { return false; }
    this.journal = next;
    return true;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    // Never clear pending tokens during shutdown, even after exit code zero.
    try { if (this.lock?.inTransaction) this.lock.exec('ROLLBACK'); }
    finally { this.lock?.close(); this.lock = null; }
  }
}
