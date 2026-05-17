// Plan §3.A2 / spec §9.1 / §5.3 — capability grant + revoke unit test.
//
// `installed_plugins.capabilities_granted` has exactly two writers in v1:
// the install path (sets the default tier) and the trust path
// (`grantCapabilities` / `revokeCapabilities`). This suite locks the
// contract for the latter so future spec patches that add capability
// strings (Phase 4 atoms migration) don't silently widen the
// vocabulary.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migratePlugins } from '../src/plugins/persistence.js';
import {
  defaultCapabilities,
  grantCapabilities,
  revokeCapabilities,
  validateCapabilityList,
} from '../src/plugins/trust.js';

let db: Database.Database;
let tmpDir: string;

const PLUGIN_ID = 'sample-plugin';

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-trust-'));
  db = new Database(path.join(tmpDir, 'test.sqlite'));
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT);
  `);
  migratePlugins(db);
  const now = Date.now();
  db.prepare(
    `INSERT INTO installed_plugins
       (id, title, version, source_kind, source, pinned_ref, source_digest,
        source_marketplace_id, trust, capabilities_granted, manifest_json,
        fs_path, installed_at, updated_at)
     VALUES (?, ?, ?, 'local', '/tmp/sample', NULL, NULL, NULL, 'restricted',
             ?, '{}', '/tmp/sample', ?, ?)`,
  ).run(
    PLUGIN_ID,
    'Sample Plugin',
    '1.0.0',
    JSON.stringify(defaultCapabilities('restricted')),
    now,
    now,
  );
});

afterEach(async () => {
  db.close();
  await rm(tmpDir, { recursive: true, force: true });
});

describe('validateCapabilityList', () => {
  it('accepts spec §5.3 vocabulary and connector / mcp scoped forms', () => {
    const { accepted, rejected } = validateCapabilityList([
      'prompt:inject',
      'fs:read',
      'fs:write',
      'mcp',
      'subprocess',
      'bash',
      'network',
      'connector',
      'connector:slack',
      'mcp:tavily',
    ]);
    expect(rejected).toEqual([]);
    expect(accepted.sort()).toEqual([
      'bash',
      'connector',
      'connector:slack',
      'fs:read',
      'fs:write',
      'mcp',
      'mcp:tavily',
      'network',
      'prompt:inject',
      'subprocess',
    ]);
  });

  it('rejects unknown shapes without dropping good entries', () => {
    const { accepted, rejected } = validateCapabilityList([
      'fs:read',
      'foo:bar',
      'connector:Capital',
      'connector:',
    ]);
    expect(accepted).toEqual(['fs:read']);
    expect(rejected.map((r) => r.capability)).toEqual([
      'foo:bar',
      'connector:Capital',
      'connector:',
    ]);
    expect(new Set(rejected.map((r) => r.reason))).toEqual(new Set(['unknown']));
  });

  it('skips empty / non-string entries silently', () => {
    const { accepted, rejected } = validateCapabilityList([
      '',
      '   ',
      42,
      null,
      'fs:read',
    ]);
    expect(accepted).toEqual(['fs:read']);
    expect(rejected.map((r) => r.reason)).toEqual(['malformed', 'malformed']);
  });

  it('returns empty arrays for non-array input', () => {
    expect(validateCapabilityList(null)).toEqual({ accepted: [], rejected: [] });
    expect(validateCapabilityList('connector:slack')).toEqual({ accepted: [], rejected: [] });
  });
});

describe('grantCapabilities / revokeCapabilities', () => {
  it('unions the new set with the prior capabilities and is idempotent', () => {
    const next = grantCapabilities({
      db,
      pluginId: PLUGIN_ID,
      capabilities: ['fs:read', 'connector:slack'],
    });
    expect(next).toContain('fs:read');
    expect(next).toContain('connector:slack');
    expect(next).toContain('prompt:inject');

    const second = grantCapabilities({
      db,
      pluginId: PLUGIN_ID,
      capabilities: ['fs:read'],
    });
    expect(second).toEqual(next);
  });

  it('revoke removes selected capabilities but never strips prompt:inject', () => {
    grantCapabilities({
      db,
      pluginId: PLUGIN_ID,
      capabilities: ['fs:read', 'mcp', 'connector:slack'],
    });
    const next = revokeCapabilities({
      db,
      pluginId: PLUGIN_ID,
      capabilities: ['mcp', 'prompt:inject'],
    });
    expect(next).not.toContain('mcp');
    expect(next).toContain('prompt:inject');
    expect(next).toContain('fs:read');
  });

  it('throws when the plugin is missing', () => {
    expect(() =>
      grantCapabilities({ db, pluginId: 'does-not-exist', capabilities: ['fs:read'] }),
    ).toThrow(/plugin not found/);
  });
});
