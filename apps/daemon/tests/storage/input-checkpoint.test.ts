import Database from 'better-sqlite3';
import express from 'express';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { expect, it, vi } from 'vitest';
import { createInputCheckpointStore } from '../../src/storage/input-checkpoint.js';

vi.mock('../../src/analytics.js', () => ({ createAnalyticsService: () => ({ shutdown: async () => {} }),
  readPublicConfigResponse: () => ({ enabled: true, host: 'https://us.i.posthog.com', key: 'phc_test' }),
  readAnalyticsContext: vi.fn() }));
vi.mock('../../src/app-version.js', async original => ({ ...await original<object>(), readCurrentAppVersionInfo: async () => null }));
vi.mock('../../src/media/stock-telemetry.js', () => ({ startStockTelemetryCollector: () => ({ dispose() {}, flush: async () => {} }) }));
vi.mock('../../src/migration/update-apply-observations.js', () => ({ observeUpdateLifecycleStages: vi.fn() }));
vi.mock('../../src/migration/index.js', () => ({ observePendingInstallerApplyAttempts: vi.fn(async () => {}) }));

const meta = ['meta', JSON.stringify({ version: 2, identity: '', lastTime: 1, nextSendAt: 2, stopped: null })];
const initial = () => [meta, ['completed', '[]']];

it('reuses an existing database, commits atomically and recovers updates/deletions after reopening', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'input-checkpoint-')); const file = join(dir, 'app.sqlite');
  let db = new Database(file);
  try {
    db.pragma('journal_mode=WAL'); db.exec("CREATE TABLE business(value TEXT); INSERT INTO business VALUES ('untouched')");
    let store = createInputCheckpointStore(db);
    store.write('scope', initial(), [], 0);
    expect(() => store.write('scope', [['completed', '["must-rollback"]'], ['invalid', '{}']], [], 1)).toThrow();
    expect(new Map(store.read('scope')).get('completed')).toBe('[]');
    store.write('scope', [['completed', '["saved"]']], [], 1);
    db.close(); db = new Database(file); store = createInputCheckpointStore(db);
    expect(new Map(store.read('scope')).get('completed')).toBe('["saved"]');
    store.write('scope', [], ['completed'], 2); expect(new Map(store.read('scope')).has('completed')).toBe(false);
    expect(db.prepare('SELECT value FROM business').get()).toEqual({ value: 'untouched' });
    expect(() => store.write('scope', [['completed', JSON.stringify(Array.from({ length: 2049 }, () => 'x'))]], [], 3)).toThrow();
    expect(() => store.write('scope', [meta, meta], [], 3)).toThrow();
  } finally { db.close(); await rm(dir, { recursive: true, force: true }); }
});

it('bounds scopes and rolls back a rejected fifth scope without modifying business data', () => {
  const db = new Database(':memory:');
  try {
    const store = createInputCheckpointStore(db);
    for (let n = 0; n < 4; n++) store.write(`scope-${n}`, initial(), [], 0);
    expect(() => store.write('overflow', initial(), [], 0)).toThrow('input queue limit');
    expect(store.read('overflow')).toEqual([]);
  } finally { db.close(); }
});

it('recognizes a repeated commit after a lost reply and rejects a different stale writer', () => {
  const db = new Database(':memory:');
  try {
    const store = createInputCheckpointStore(db);
    expect(store.write('scope', initial(), [], 0)).toBe(1);
    expect(store.write('scope', initial(), [], 0)).toBe(1);
    expect(store.revision('scope')).toBe(1);
    expect(() => store.write('scope', [['completed', '["stale"]']], [], 0)).toThrow('input checkpoint conflict');
    expect(new Map(store.read('scope')).get('completed')).toBe('[]');
    expect(store.write('scope', [['completed', '["next"]']], [], 1)).toBe(2);
    expect(() => store.write('scope', initial(), [], 0)).toThrow('input checkpoint conflict');
  } finally { db.close(); }
});

it('strips undeclared metric fields and rejects non-trial areas without committing a prefix', () => {
  const db = new Database(':memory:');
  try {
    const store = createInputCheckpointStore(db);
    const raw = { event_schema_version: 4, metric_schema_version: 1, event_id: 'raw-1', device_id: 'device',
      app_session_id: 'session', client_type: 'desktop', capture_source: 'web/error-tracking', env: 'test', channel: 'development',
      app_version: '0.25.1', client_version: '0.25.1', platform: null, os_version: null, arch: null,
      occurred_at: new Date().toISOString(), reported_at: new Date().toISOString(), telemetry_capability: 'supported',
      area: 'settings', window_ms: 1000, input_attempt_count: 3, qualified_sample_count: 0, over_500ms_count: 0,
      max_input_to_presentation_ms: null, max_queue_delay_ms: null, sample_floor_ms: 16, content: 'must not persist' };
    store.write('scope', [['collecting:raw-1', JSON.stringify(raw)]], [], 0);
    expect(JSON.parse(store.read('scope')[0]![1])).not.toHaveProperty('content');
    expect(() => store.write('scope', [['completed', '[]'], ['collecting:raw-1', JSON.stringify({ ...raw, area: 'composer' })]], [], 1)).toThrow();
    expect(new Map(store.read('scope')).has('completed')).toBe(false);
  } finally { db.close(); }
});

it('real HTTP checkpoint route requires a matching trial and installation, returns only committed state', async () => {
  const { registerTelemetryRoutes } = await import('../../src/routes/telemetry.js');
  const dir = await mkdtemp(join(tmpdir(), 'input-checkpoint-http-')); const db = new Database(':memory:');
  const app = express(); app.use(express.json({ limit: '4mb' })); const config = { installationId: 'device' };
  const telemetry = registerTelemetryRoutes(app, { dataDir: dir, db, readAppConfig: async () => config, writeAppConfig: async () => config });
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/analytics/input-checkpoint`;
  const scope = 'https://us.i.posthog.com/i/v0/e/:phc_test:device';
  const request = async (value: object) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, ...value }) });
  try {
    expect((await request({ op: 'read' })).status).toBe(403);
    const file = join(dir, 'input-aggregation-trial.json');
    await writeFile(file, JSON.stringify({ trial_id: 'input-01', revision: 'r1', mode: 'shadow', host: 'https://us.i.posthog.com', project_key: 'phc_test' }));
    expect((await request({ op: 'write', padding: 'x'.repeat(3 * 1024 * 1024) })).status).toBe(413);
    expect((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://external.invalid' },
      body: JSON.stringify({ scope, op: 'read' }) })).status).toBe(403);
    expect((await request({ op: 'read', scope: scope + '-other' })).status).toBe(403);
    expect((await request({ op: 'erase' })).status).toBe(400);
    expect(await (await request({ op: 'write', put: initial(), drop: [], revision: 0 })).json()).toEqual({ ok: true, revision: 1 });
    expect(await (await request({ op: 'read' })).json()).toEqual({ ok: true, records: initial(), revision: 1 });
    expect((await request({ op: 'write', put: [['completed', '["rolled-back"]'], ['bad', '{}']], drop: [], revision: 1 })).status).toBe(503);
    expect(await (await request({ op: 'read' })).json()).toEqual({ ok: true, records: initial(), revision: 1 });
    await writeFile(file, '{}'); expect((await request({ op: 'read' })).status).toBe(403);
  } finally {
    telemetry.disposeFatalHandlers(); await telemetry.analyticsService.shutdown();
    await new Promise<void>(resolve => server.close(() => resolve())); db.close(); await rm(dir, { recursive: true, force: true });
  }
});
