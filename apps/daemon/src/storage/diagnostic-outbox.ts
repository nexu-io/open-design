import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

export interface DiagnosticIncident {
  id: string; sourceId: string; createdAt: number; state: 'collect' | 'pending' | 'delivered' | 'discarded';
  summary: string; manifest: string | null; bytes: number; deviceId: string | null;
  attempts: number; version: number; leaseUntil: number; nextAttemptAt: number;
  deliveredAt: number | null; receipt: string | null; reason: string | null;
}
export const PENDING_MAX_AGE = 7 * 86400_000;
export const DELIVERED_MAX_AGE = 86400_000;
export const QUEUE_MAX_BYTES = 1024 ** 3;

/** A separate database avoids coupling fault delivery to the application's billing/state DB. */
export class DiagnosticOutbox {
  readonly directory: string;
  private readonly db: Database.Database;
  constructor(dataRoot: string) {
    this.directory = join(dataRoot, 'diagnostics');
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const file = join(this.directory, 'outbox.sqlite');
    this.db = new Database(file);
    chmodSync(file, 0o600);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY, sourceId TEXT NOT NULL UNIQUE, createdAt INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'collect', summary TEXT NOT NULL,
      manifest TEXT, bytes INTEGER NOT NULL DEFAULT 0, deviceId TEXT,
      attempts INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 0,
      leaseUntil INTEGER NOT NULL DEFAULT 0, nextAttemptAt INTEGER NOT NULL DEFAULT 0,
      deliveredAt INTEGER, receipt TEXT, reason TEXT
    ); CREATE INDEX IF NOT EXISTS diagnostic_due ON incidents(state, nextAttemptAt);
    CREATE TABLE IF NOT EXISTS active_runs(id TEXT PRIMARY KEY, summary TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS loss_counts(reason TEXT PRIMARY KEY, count INTEGER NOT NULL);`);
  }
  enqueue(sourceId: string, summary: string, now = Date.now()): DiagnosticIncident {
    // Hash source identities so dropped records retain only a dedupe tombstone, not content.
    const key = createHash('sha256').update(sourceId).digest('hex');
    this.db.prepare('INSERT OR IGNORE INTO incidents(id, sourceId, createdAt, summary) VALUES (?, ?, ?, ?)')
      .run(randomUUID(), key, now, summary);
    return this.db.prepare('SELECT * FROM incidents WHERE sourceId = ?').get(key) as DiagnosticIncident;
  }
  get(id: string): DiagnosticIncident | undefined {
    return this.db.prepare('SELECT * FROM incidents WHERE id = ?').get(id) as DiagnosticIncident | undefined;
  }
  trackRun(id: string, summary: string): void {
    this.db.prepare('INSERT OR REPLACE INTO active_runs(id, summary) VALUES (?, ?)').run(id, summary);
  }
  finishRun(id: string): void { this.db.prepare('DELETE FROM active_runs WHERE id=?').run(id); }
  noteRecovery(runId: string, at: number): void {
    // A recovery updates the same incident identity. If already uploaded, a new immutable
    // manifest generation carries the outcome; outstanding callbacks lose their version lease.
    this.db.prepare(`UPDATE incidents SET summary=json_set(summary, '$.recovered', json('true'), '$.recoveredAt', ?),
      state=CASE WHEN manifest IS NULL THEN 'collect' ELSE 'pending' END,
      manifest=CASE WHEN manifest IS NULL THEN NULL ELSE json_set(manifest, '$.recoveredAt', ?) END,
      version=version+1, leaseUntil=0, nextAttemptAt=0, deliveredAt=NULL
      WHERE state != 'discarded' AND json_extract(summary, '$.runId')=?
      AND COALESCE(json_extract(summary, '$.recovered'), 0)=0`).run(at, at, runId);
  }
  recoverRuns(consent: boolean, now = Date.now()): void {
    this.db.transaction(() => {
      if (consent) {
        const entries = this.db.prepare('SELECT summary FROM active_runs').all() as Array<{ summary: string }>;
        for (const entry of entries) {
          const evidence = JSON.parse(entry.summary);
          evidence.kind = 'daemon_interrupted'; evidence.at = now;
          evidence.errorCode = 'DAEMON_RESTARTED';
          this.enqueue(evidence.sourceId, JSON.stringify(evidence), now);
        }
      }
      this.db.prepare('DELETE FROM active_runs').run();
    }).immediate();
  }
  list(): DiagnosticIncident[] {
    return this.db.prepare('SELECT * FROM incidents ORDER BY createdAt, id').all() as DiagnosticIncident[];
  }
  ids(): string[] {
    return (this.db.prepare('SELECT id FROM incidents').all() as Array<{ id: string }>).map((row) => row.id);
  }
  diagnostics(): Record<string, unknown> {
    return {
      states: this.db.prepare('SELECT state, COUNT(*) AS count, SUM(bytes) AS contentBytes FROM incidents GROUP BY state').all(),
      losses: this.db.prepare('SELECT reason, count FROM loss_counts ORDER BY reason').all(),
      recent: this.db.prepare('SELECT id, state, createdAt, deliveredAt, attempts, reason FROM incidents ORDER BY createdAt DESC LIMIT 100').all(),
    };
  }
  claim(now = Date.now(), leaseMs = 120_000): DiagnosticIncident | undefined {
    return this.db.transaction(() => {
      const item = this.db.prepare("SELECT * FROM incidents WHERE state IN ('collect','pending') AND nextAttemptAt <= ? AND leaseUntil <= ? ORDER BY createdAt LIMIT 1")
        .get(now, now) as DiagnosticIncident | undefined;
      if (!item) return undefined;
      this.db.prepare('UPDATE incidents SET leaseUntil = ?, version = version + 1, attempts = attempts + 1 WHERE id = ?')
        .run(now + leaseMs, item.id);
      return this.get(item.id);
    }).immediate();
  }
  prepared(item: DiagnosticIncident, manifest: string, bytes: number): boolean {
    return this.db.prepare("UPDATE incidents SET state='pending', manifest=CASE WHEN json_extract(summary, '$.recoveredAt') IS NULL THEN ? ELSE json_set(?, '$.recoveredAt', json_extract(summary, '$.recoveredAt')) END, bytes=?, leaseUntil=0 WHERE id=? AND version=? AND state='collect'")
      .run(manifest, manifest, bytes, item.id, item.version).changes === 1;
  }
  bindDevice(item: DiagnosticIncident, deviceId: string): boolean {
    return this.db.prepare("UPDATE incidents SET deviceId=? WHERE id=? AND version=? AND state='pending' AND (deviceId IS NULL OR deviceId=?)")
      .run(deviceId, item.id, item.version, deviceId).changes === 1;
  }
  renew(item: DiagnosticIncident, now = Date.now()): boolean {
    return this.db.prepare("UPDATE incidents SET leaseUntil=? WHERE id=? AND version=? AND state IN ('collect','pending')")
      .run(now + 120_000, item.id, item.version).changes === 1;
  }
  delivered(item: DiagnosticIncident, receipt: string, now = Date.now()): boolean {
    return this.db.prepare("UPDATE incidents SET state='delivered', receipt=?, deliveredAt=?, leaseUntil=0, reason=NULL WHERE id=? AND version=? AND state='pending'")
      .run(receipt, now, item.id, item.version).changes === 1;
  }
  defer(item: DiagnosticIncident, at: number, reason: string): boolean {
    return this.db.prepare("UPDATE incidents SET nextAttemptAt=?, leaseUntil=0, reason=? WHERE id=? AND version=? AND state IN ('collect','pending')")
      .run(at, reason, item.id, item.version).changes === 1;
  }
  discard(id: string, reason: string): void {
    const changed = this.db.prepare("UPDATE incidents SET state='discarded', summary='{}', manifest=NULL, bytes=0, receipt=NULL, deviceId=NULL, version=version+1, leaseUntil=0, reason=? WHERE id=? AND state != 'discarded'")
      .run(reason, id);
    if (changed.changes) this.db.prepare('INSERT INTO loss_counts(reason,count) VALUES (?,1) ON CONFLICT(reason) DO UPDATE SET count=count+1').run(reason);
  }
  /** Returns directories to remove. Persist tombstones before deleting files so restart is safe. */
  prune(now = Date.now(), consent = true, reserveBytes = 0): string[] {
    return this.db.transaction(() => {
      if (!consent) this.db.prepare('DELETE FROM active_runs').run();
      const removed: string[] = [];
      let remaining = 0;
      type Inventory = Pick<DiagnosticIncident, 'id' | 'state' | 'createdAt' | 'deliveredAt'> & { storedBytes: number };
      const retained: Inventory[] = [];
      // Do not materialize queued summaries/manifest JSON during capacity checks.
      const inventory = this.db.prepare(`SELECT id,state,createdAt,deliveredAt,
        bytes + length(CAST(summary AS BLOB)) + length(CAST(COALESCE(manifest,'') AS BLOB))
        + length(CAST(COALESCE(receipt,'') AS BLOB)) + 512 AS storedBytes
        FROM incidents ORDER BY createdAt,id`).all() as Inventory[];
      for (const item of inventory) {
        let reason: string | undefined;
        if (item.state === 'discarded') { removed.push(item.id); continue; }
        if (!consent) reason = 'consent_disabled';
        else if (item.state === 'delivered' && now - item.deliveredAt! >= DELIVERED_MAX_AGE) reason = 'delivered_expired';
        else if (item.state !== 'delivered' && now - item.createdAt >= PENDING_MAX_AGE) reason = 'pending_expired';
        if (reason) { this.discard(item.id, reason); removed.push(item.id); }
        else { remaining += item.storedBytes; retained.push(item); }
      }
      // Delivered copies are expendable first, then oldest pending evidence.
      retained.sort((a, b) => Number(b.state === 'delivered') - Number(a.state === 'delivered') || a.createdAt - b.createdAt);
      for (const item of retained) {
        if (remaining + reserveBytes <= QUEUE_MAX_BYTES) break;
        this.discard(item.id, 'capacity_evicted'); removed.push(item.id); remaining -= item.storedBytes;
      }
      // Keep reason counters and only a small recent dedupe window after content removal.
      // Tombstones must not become an unbounded second queue during a prolonged outage.
      this.db.prepare("DELETE FROM incidents WHERE id IN (SELECT id FROM incidents WHERE state='discarded' ORDER BY createdAt DESC LIMIT -1 OFFSET 1024)").run();
      return removed;
    }).immediate();
  }
  close(): void { this.db.close(); }
}
