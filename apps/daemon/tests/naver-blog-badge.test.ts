// Role: Daemon unit + HTTP tests for the naver-blog plugin badge (green tone).
// Key Features: resolveStampBadge reads green badge from manifest; taskKind-collision-reachable assert.
// Dependencies: registerBundledPlugins, resolveStampBadge, startServer, better-sqlite3, vitest
// Notes: example-naver-blog auto-registers at boot via registerBundledPlugins.

import type http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { registerBundledPlugins } from '../src/plugins/bundled.js';
import { startServer } from '../src/server.js';
import { resolveStampBadge } from '../src/project-routes.js';
import { listInstalledPlugins } from '../src/plugins/registry.js';

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as {
    url: string;
    server: http.Server;
  };
  baseUrl = started.url;
  server = started.server;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('resolveStampBadge — naver-blog green badge', () => {
  let unitDb: InstanceType<typeof Database> | null = null;
  const tempFiles: string[] = [];

  beforeAll(async () => {
    const dbPath = path.join(os.tmpdir(), `naver-badge-unit-${Date.now()}.sqlite`);
    tempFiles.push(dbPath);
    unitDb = new Database(dbPath);
    unitDb.pragma('journal_mode = WAL');
    unitDb.pragma('foreign_keys = ON');
    unitDb.exec(`
      CREATE TABLE IF NOT EXISTS installed_plugins (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, version TEXT NOT NULL,
        source_kind TEXT NOT NULL, source TEXT NOT NULL, pinned_ref TEXT,
        source_digest TEXT, source_marketplace_id TEXT,
        source_marketplace_entry_name TEXT, source_marketplace_entry_version TEXT,
        marketplace_trust TEXT, resolved_source TEXT, resolved_ref TEXT,
        manifest_digest TEXT, archive_integrity TEXT,
        trust TEXT NOT NULL, capabilities_granted TEXT NOT NULL,
        manifest_json TEXT NOT NULL, fs_path TEXT NOT NULL,
        installed_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_installed_plugins_source_kind
        ON installed_plugins(source_kind);
    `);
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const bundledRoot = path.join(repoRoot, 'plugins', '_official');
    await registerBundledPlugins({ db: unitDb, bundledRoot });
  });

  afterAll(() => {
    try { unitDb?.close(); } catch { /* 무시 */ }
    unitDb = null;
    for (const f of tempFiles) {
      try { fs.unlinkSync(f); } catch { /* 무시 */ }
    }
  });

  it('returns the green badge from the naver-blog manifest', () => {
    const badge = resolveStampBadge(unitDb!, 'example-naver-blog');
    expect(badge).toEqual({ label: '네이버 블로그', tone: 'green' });
  });

  it('registers example-naver-blog despite a new-generation taskKind collision (reachable via listInstalledPlugins)', () => {
    // collectBundledScenarios dedupes by taskKind, so naver-blog (new-generation,
    // colliding with braze/web-prototype) won't appear in that fallback view —
    // but it IS installed and reachable via the full installed_plugins list,
    // which is how the chip / badge path resolves it.
    const ids = listInstalledPlugins(unitDb!).map((p) => p.id);
    expect(ids).toContain('example-naver-blog');
  });
});

describe('badge stamp at create — naver-blog', () => {
  it('stamps metadata.badge from the naver-blog manifest when pluginId is passed', async () => {
    const id = `proj-naver-badge-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name: 'Naver Blog', pluginId: 'example-naver-blog' }),
    });
    expect(resp.ok).toBe(true);
    const { project } = await resp.json() as { project: { metadata?: { badge?: unknown } } };
    expect(project.metadata?.badge).toEqual({ label: '네이버 블로그', tone: 'green' });
  });
});
