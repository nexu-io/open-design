import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { parseClientMetricEvent } from '@open-design/contracts/analytics';

const keyPattern = /^(meta|completed|(collecting|rawPending|active|pending):[a-zA-Z0-9_-]{1,128})$/;

/** Reuse the daemon connection; checkpoint changes commit as one bounded transaction. */
export function createInputCheckpointStore(db: Database.Database): {
  revision(scope: string): number;
  read(scope: string): [string, string][];
  write(scope: string, put: unknown, drop: unknown, expectedRevision: number): number;
} {
  db.exec('CREATE TABLE IF NOT EXISTS input_checkpoints (scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(scope, key))');
  db.exec('CREATE TABLE IF NOT EXISTS input_checkpoint_versions (scope TEXT PRIMARY KEY, revision INTEGER NOT NULL, patch_hash TEXT NOT NULL)');
  const upsert = db.prepare('INSERT INTO input_checkpoints VALUES (?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value=excluded.value');
  const remove = db.prepare('DELETE FROM input_checkpoints WHERE scope=? AND key=?');
  const version = (scope: string) => db.prepare('SELECT revision, patch_hash FROM input_checkpoint_versions WHERE scope=?').get(scope) as { revision: number; patch_hash: string } | undefined;
  return {
    revision: (scope: string) => version(scope)?.revision ?? 0,
    read(scope: string): [string, string][] {
      return (db.prepare('SELECT key, value FROM input_checkpoints WHERE scope=? ORDER BY rowid').all(scope) as { key: string; value: string }[])
        .map(row => [row.key, row.value]);
    },
    write: db.transaction((scope: string, put: unknown, drop: unknown, expectedRevision: number) => {
      if (!Array.isArray(put) || !Array.isArray(drop) || put.length + drop.length > 1600) throw new Error('invalid input patch');
      const previous = version(scope);
      const hash = createHash('sha256').update(JSON.stringify({ put, drop })).digest('hex');
      // A lost reply may repeat the last commit; a different stale writer must never overwrite it.
      if (previous?.revision === expectedRevision + 1 && previous.patch_hash === hash) return previous.revision;
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision !== (previous?.revision ?? 0)) throw new Error('input checkpoint conflict');
      const keys = new Set<string>();
      for (const entry of put) {
        if (!Array.isArray(entry) || entry.length !== 2) throw new Error('invalid input record');
        const [key, text] = entry;
        if (typeof key !== 'string' || !keyPattern.test(key) || keys.has(key) || typeof text !== 'string'
          || Buffer.byteLength(text) > (key === 'completed' ? 280_000 : 8192)) throw new Error('invalid input record');
        keys.add(key);
        const value = JSON.parse(text);
        let stored = text;
        if (key === 'completed') {
          if (!Array.isArray(value) || value.length > 2048 || value.some(v => typeof v !== 'string' || v.length > 128)) throw new Error('invalid completed sources');
        } else if (key === 'meta') {
          if (!value || value.version !== 2 || typeof value.identity !== 'string' || value.identity.length > 2048
            || !Number.isFinite(value.lastTime) || !Number.isFinite(value.nextSendAt)
            || !(value.stopped === null || typeof value.stopped === 'string')
            || (value.rawPassthrough !== undefined && typeof value.rawPassthrough !== 'boolean')
            || Object.keys(value).some(k => !['version', 'identity', 'lastTime', 'nextSendAt', 'stopped', 'rawPassthrough'].includes(k))) throw new Error('invalid input metadata');
        } else {
          const name = /^(active|pending):/.test(key) ? 'client_input_responsiveness_summary' : 'client_input_responsiveness';
          const parsed = parseClientMetricEvent(name, value);
          if (!parsed || !['settings', 'search'].includes(String(parsed.area)) || key.split(':')[1] !== parsed.event_id) throw new Error('invalid input metric');
          stored = JSON.stringify(parsed);
        }
        upsert.run(scope, key, stored);
      }
      for (const key of drop) {
        if (typeof key !== 'string' || !keyPattern.test(key) || keys.has(key)) throw new Error('invalid input deletion');
        keys.add(key); remove.run(scope, key);
      }
      const size = db.prepare('SELECT count(*) AS n, coalesce(sum(length(CAST(value AS BLOB))),0) AS bytes FROM input_checkpoints WHERE scope=?').get(scope) as { n: number; bytes: number };
      db.prepare('INSERT INTO input_checkpoint_versions VALUES (?, ?, ?) ON CONFLICT(scope) DO UPDATE SET revision=excluded.revision, patch_hash=excluded.patch_hash').run(scope, expectedRevision + 1, hash);
      const scopes = db.prepare('SELECT count(*) AS n FROM input_checkpoint_versions').get() as { n: number };
      if (size.n > 1600 || size.bytes > 2 * 1024 * 1024 || scopes.n > 4) throw new Error('input queue limit');
      return expectedRevision + 1;
    }),
  };
}
