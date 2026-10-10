// OPEND-3436: two requests for the same placement can be in flight at once (a
// focus refresh racing a timer), and nothing guarantees their answers arrive in
// the order the server gave them. The store holds ONE answer per placement and
// replaces it wholesale, so an older answer that lands last would replace the
// newer one — and if the newer one ended the activity early, the older one
// quietly puts the long window back and offline replay outlives the real end.
//
// Local files and a virtual clock only, no sockets.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTouchpointContentCache as createCache } from '../src/routes/touchpoint-content-cache.js';

// Cache-only cold-start fixtures release the prior owner's OS lock. Real
// overlapping owners and SIGKILL are covered by the child-process suite.
const fixtureCaches = new Map<string, ReturnType<typeof createCache>>();
function createTouchpointContentCache(directory: string) {
  const cache = createCache(directory);
  fixtureCaches.set(directory, cache);
  return cache;
}
afterEach(() => { for (const cache of fixtureCaches.values()) cache.close(); fixtureCaches.clear(); });
// Copy only persisted state into an isolated root for a cold-reader assertion.
// The primary is deliberately retained to continue testing its in-flight fences.
const diskReaders: { directory: string; cache: ReturnType<typeof createCache> }[] = [];
function createDiskReader(directory: string) {
  const snapshot = mkdtempSync(path.join(tmpdir(), 'touchpoint-cold-snapshot-'));
  fs.cpSync(directory, snapshot, { recursive: true });
  const cache = createCache(snapshot);
  diskReaders.push({ directory: snapshot, cache });
  return cache;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const reader of diskReaders.splice(0)) { reader.cache.close(); rmSync(reader.directory, { recursive: true, force: true }); }
});


const T0 = Date.parse('2030-01-01T00:00:00Z');
const iso = (ms: number) => new Date(T0 + ms).toISOString();
const HOUR = 3_600_000;
const entry = 'export function mount() {}';
const digest = `sha256:${createHash('sha256').update(entry).digest('hex')}`;
const key = { scope: 'production:A', placementKey: 'opend.home.campaign-modal', locale: 'en-US' };

/** A full answer the server gave at `serverTime`, running until `endsAt`. */
const full = (at: { serverTime: number; endsAt: number }) => ({
  activityId: 'activity-1',
  deploymentId: 'deployment-1',
  touchpointDecisionId: 'decision-1',
  placementKey: key.placementKey,
  requiredCapabilities: [],
  staticActions: [],
  serverTime: iso(at.serverTime),
  startsAt: iso(-60_000),
  endsAt: iso(at.endsAt),
  authorizationExpiresAt: iso(at.serverTime + 60_000),
  content: {
    id: 'version-1',
    placementKey: key.placementKey,
    locale: key.locale,
    manifest: { resources: ['entry.js'], placements: [{ key: key.placementKey, entry: 'entry.js' }] },
    manifestHash: 'sha256:manifest',
    entryPath: 'entry.js',
    entryDigest: digest,
    entryModule: entry,
    resources: [{ path: 'entry.js', digest, bytes: Buffer.from(entry).toString('base64') }],
    runtime: { kind: 'web-component', apiVersion: 1 },
    buildIdentity: { fingerprint: 'fixture' },
  },
});

/** The same answer as the server trims it against the version the daemon holds. */
const trimmed = (at: { serverTime: number; endsAt: number }) => {
  const { content: _content, ...envelope } = full(at);
  return { ...envelope, contentOmitted: true };
};

let dataDir: string;
const records = () =>
  readdirSync(dataDir, { recursive: true })
    .map(String)
    .filter((name) => name.includes('assemblies') && name.endsWith('.json'));
const replayAfterRestart = () =>
  createDiskReader(dataDir).replayOffline(key, 'upstream_unreachable');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(T0);
  dataDir = mkdtempSync(path.join(tmpdir(), 'touchpoint-ordering-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('touchpoint content cache answer ordering', () => {
  const ioFailure = () => Object.assign(new Error('injected cache storage failure'), { code: 'EACCES' });

  it('drains a failed owner before recovering and cannot accept its late grant or settlement', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    const operation = cache.beginAuthority(key.scope)!;
    expect(operation).not.toBeNull();
    const ticket = cache.ticket(key);
    const write = fs.writeFileSync;
    const fault = vi.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
      if (String(file).includes('replay-authority.json')) throw ioFailure();
      return Reflect.apply(write, fs, [file, ...args]);
    });
    expect(cache.beginAuthority(key.scope)).toBeNull();
    fault.mockRestore();
    // The first upstream operation is still active. Recovery cannot create a
    // new generation underneath its late response, even after storage recovers.
    expect(cache.beginAuthority(key.scope)).toBeNull();
    cache.remember(key, full({ serverTime: 1, endsAt: HOUR * 2 }), ticket);
    cache.finishTicket(ticket);
    cache.settleAuthority(key.scope, operation);
    const successor = cache.beginAuthority(key.scope)!;
    expect(successor).not.toBeNull();
    expect(cache.replayOffline(key, 'upstream_unreachable')).toBeNull();
    const journal = fs.readdirSync(dataDir, { recursive: true }).map(String)
      .find(name => name.endsWith('replay-authority.json'))!;
    cache.settleAuthority(key.scope, operation); // duplicate old completion
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, journal), 'utf8')).pending).toEqual([successor]);
    const freshTicket = cache.ticket(key);
    cache.remember(key, full({ serverTime: 2, endsAt: HOUR / 2 }), freshTicket);
    cache.finishTicket(freshTicket);
    cache.settleAuthority(key.scope, successor);
    expect(cache.replayOffline(key, 'upstream_unreachable')?.endsAt).toBe(iso(HOUR / 2));
    expect(replayAfterRestart()?.endsAt).toBe(iso(HOUR / 2));
  });

  it('a 404 tombstone remains settled when a later account refusal visits it', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    const operation = cache.beginAuthority(key.scope)!;
    const read = fs.readFileSync;
    const fault = vi.spyOn(fs, 'readFileSync').mockImplementation((file, ...args) => {
      if (String(file).includes('/assemblies/')) throw ioFailure();
      return Reflect.apply(read, fs, [file, ...args]);
    });
    cache.refuseReplay(key, 404);
    cache.settleAuthority(key.scope, operation);
    fault.mockRestore();
    const next = cache.beginAuthority(key.scope)!;
    cache.refuseScope(key.scope);
    cache.settleAuthority(key.scope, next);
    const journal = fs.readdirSync(dataDir, { recursive: true }).map(String)
      .find(name => name.endsWith('replay-authority.json'))!;
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, journal), 'utf8')).pending).toEqual([]);
    expect(cache.replayOffline(key, 'upstream_unreachable')).toBeNull();
  });

  it.each(['full', 'trimmed'] as const)('never replays the old window after a shortened %s answer fails assembly replacement', kind => {
    const cache = createTouchpointContentCache(dataDir);
    const alias = { ...key, locale: 'zh-TW' };
    const account = { ...key, scope: 'production:B' };
    for (const candidate of [key, alias, account])
      cache.remember(candidate, full({ serverTime: 0, endsAt: HOUR }));
    const held = cache.held(key)!;
    const ticket = cache.ticket(key);
    vi.advanceTimersByTime(1_000);
    const renameFile = fs.renameSync.bind(fs);
    let failed = false;
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (!failed && String(target).includes('/assemblies/')) {
        failed = true;
        throw ioFailure();
      }
      return renameFile(source, target);
    });
    if (kind === 'full') cache.remember(key, full({ serverTime: 1_000, endsAt: 2_000 }), ticket);
    else expect(cache.reassemble(key, held, trimmed({ serverTime: 1_000, endsAt: 2_000 }), ticket)?.endsAt).toBe(iso(2_000));
    expect(failed).toBe(true);
    rename.mockRestore(); // Only one assembly rename failed; storage has recovered.
    vi.advanceTimersByTime(2_000);
    expect(cache.replayOffline(key, 'upstream_unavailable')).toBeNull();
    expect(replayAfterRestart()).toBeNull();
    for (const candidate of [alias, account])
      expect(cache.replayOffline(candidate, 'upstream_unavailable')?.endsAt).toBe(iso(HOUR));
    // A subsequent fresh online grant can restore offline authority.
    cache.remember(key, full({ serverTime: 3_000, endsAt: HOUR }), cache.ticket(key));
    expect(cache.replayOffline(key, 'upstream_unavailable')?.endsAt).toBe(iso(HOUR));
    expect(replayAfterRestart()?.endsAt).toBe(iso(HOUR));
  });

  it.each(['full', 'trimmed'] as const)('keeps the failed %s replacement ordered until a fresh trimmed grant recovers it', kind => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    const held = cache.held(key)!;
    vi.advanceTimersByTime(1_000);
    const renameFile = fs.renameSync.bind(fs);
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (String(target).includes('/assemblies/')) throw ioFailure();
      return renameFile(source, target);
    });
    if (kind === 'full') cache.remember(key, full({ serverTime: 1_000, endsAt: 2_000 }), cache.ticket(key));
    else cache.reassemble(key, held, trimmed({ serverTime: 1_000, endsAt: 2_000 }), cache.ticket(key));
    rename.mockRestore(); // Direct retirement must preserve the failed answer's ordering fence.
    cache.remember(key, full({ serverTime: 500, endsAt: HOUR }), cache.ticket(key));
    cache.reassemble(key, held, trimmed({ serverTime: 500, endsAt: HOUR }), cache.ticket(key));
    expect(cache.replayOffline(key, 'upstream_unavailable')).toBeNull();
    expect(replayAfterRestart()).toBeNull();
    expect(cache.held(key)).toEqual(held);
    vi.advanceTimersByTime(500);
    expect(cache.reassemble(key, held, trimmed({ serverTime: 1_500, endsAt: HOUR }), cache.ticket(key))).not.toBeNull();
    expect(cache.replayOffline(key, 'upstream_unavailable')?.endsAt).toBe(iso(HOUR));
    expect(replayAfterRestart()?.endsAt).toBe(iso(HOUR));
  });

  it.each([401, 403, 404] as const)('persists refusal after %s when atomic replacement fails', status => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    const held = cache.held(key);
    vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw ioFailure(); });
    cache.refuseReplay(key, status);
    expect(cache.held(key)).toEqual(held);
    expect(cache.replayOffline(key, 'upstream_unavailable')).toBeNull();
    vi.restoreAllMocks();
    expect(replayAfterRestart()).toBeNull();
  });

  it('persists a matching withdrawal before failed deletion and never replays it after restart', () => {
    const cache = createTouchpointContentCache(dataDir);
    const grant = full({ serverTime: 0, endsAt: HOUR });
    cache.remember(key, grant);
    vi.spyOn(fs, 'rmSync').mockImplementation(() => { throw ioFailure(); });
    cache.forgetWithdrawn(key, { error: 'production_runtime_revoked', receipt: {
      activityId: grant.activityId, deploymentId: grant.deploymentId,
      contentVersionId: grant.content.id, touchpointDecisionId: grant.touchpointDecisionId,
    } });
    expect(cache.replayOffline(key, 'upstream_unavailable')).toBeNull();
    vi.restoreAllMocks();
    expect(replayAfterRestart()).toBeNull();
  });

  it.each([401, 403, 404, 410] as const)('fails closed after %s while the cache cannot be written or deleted', status => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    expect(cache.replayOffline(key, 'upstream_unavailable')).not.toBeNull();
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw ioFailure(); });
    vi.spyOn(fs, 'rmSync').mockImplementation(() => { throw ioFailure(); });
    if (status === 410) cache.forgetWithdrawn(key, null);
    else cache.refuseReplay(key, status);
    expect(cache.replayOffline(key, 'upstream_unavailable')).toBeNull();
    // A cold reader under the same storage fault cannot advance its authority either.
    expect(replayAfterRestart()).toBeNull();
  });

  it('keeps refusal in memory after storage recovers until a fresh grant is durably stored', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    const held = cache.held(key)!;
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw ioFailure(); });
    cache.refuseReplay(key, 401);
    vi.advanceTimersByTime(1_000);
    cache.reassemble(key, held, trimmed({ serverTime: 1_000, endsAt: HOUR }), cache.ticket(key));
    write.mockRestore();
    expect(cache.replayOffline(key, 'upstream_unavailable')).toBeNull();
    expect(replayAfterRestart()).toBeNull(); // The recovered store now remembers the refusal.
    cache.reassemble(key, held, trimmed({ serverTime: 1_000, endsAt: HOUR }), cache.ticket(key));
    expect(cache.replayOffline(key, 'upstream_unavailable')).not.toBeNull();
    expect(replayAfterRestart()).not.toBeNull();
  });

  it.each([401, 403] as const)('refuses the account after %s even if directory enumeration fails', status => {
    const cache = createTouchpointContentCache(dataDir);
    const alias = { ...key, locale: 'zh-TW' };
    const account = { ...key, scope: 'production:B' };
    const environment = { ...key, scope: 'test:A' };
    for (const candidate of [key, alias, account, environment])
      cache.remember(candidate, full({ serverTime: 0, endsAt: HOUR }));
    const read = vi.spyOn(fs, 'readdirSync').mockImplementation(() => { throw ioFailure(); });
    cache.refuseReplay(key, status);
    read.mockRestore();
    expect(cache.replayOffline(key, 'upstream_unavailable')).toBeNull();
    expect(createDiskReader(dataDir).replayOffline(alias, 'upstream_unavailable')).toBeNull();
    expect(cache.replayOffline(alias, 'upstream_unavailable')).toBeNull();
    expect(cache.replayOffline(account, 'upstream_unavailable')).not.toBeNull();
    expect(cache.replayOffline(environment, 'upstream_unavailable')).not.toBeNull();
    vi.advanceTimersByTime(1_000);
    cache.remember(key, full({ serverTime: 1_000, endsAt: HOUR }), cache.ticket(key));
    expect(cache.replayOffline(key, 'upstream_unavailable')).not.toBeNull();
    expect(cache.replayOffline(alias, 'upstream_unavailable')).toBeNull();
  });

  it('continues retiring other cached languages when the first record cannot be persisted', () => {
    const cache = createTouchpointContentCache(dataDir);
    const alias = { ...key, locale: 'zh-TW' };
    for (const candidate of [key, alias])
      cache.remember(candidate, full({ serverTime: 0, endsAt: HOUR }));
    const first = records()[0]!;
    const writeFile = fs.writeFileSync.bind(fs);
    vi.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
      if (String(file).includes(path.basename(first, '.json'))) throw ioFailure();
      return writeFile(file, ...args);
    });
    cache.refuseReplay(key, 403);
    for (const candidate of [key, alias])
      expect(cache.replayOffline(candidate, 'upstream_unavailable')).toBeNull();
    const persisted = records().filter(name => name !== first)
      .map(name => JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8')));
    expect(persisted).toHaveLength(1);
    expect(persisted[0].replayRefused).toBe(true);
  });

  it.each([401, 403] as const)('keeps account refusal after %s when an assembly temporarily cannot be read', status => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    const readFile = fs.readFileSync.bind(fs);
    const read = vi.spyOn(fs, 'readFileSync').mockImplementation((file, ...args) => {
      if (String(file).includes('/assemblies/')) throw ioFailure();
      return readFile(file, ...args);
    });
    cache.refuseReplay(key, status);
    read.mockRestore();
    expect(cache.replayOffline(key, 'upstream_unavailable')).toBeNull();
    expect(replayAfterRestart()).toBeNull();
  });

  it.each(['unqualified', 'matching'] as const)('remembers a %s withdrawal when directory enumeration fails', kind => {
    const cache = createTouchpointContentCache(dataDir);
    const alias = { ...key, locale: 'zh-TW' };
    const unrelated = { ...key, locale: 'ja-JP' };
    for (const candidate of [key, alias])
      cache.remember(candidate, full({ serverTime: 0, endsAt: HOUR }));
    cache.remember(unrelated, { ...full({ serverTime: 0, endsAt: HOUR }), deploymentId: 'deployment-2' });
    const lateTicket = cache.ticket(alias);
    const held = cache.held(alias)!;
    const read = vi.spyOn(fs, 'readdirSync').mockImplementation(() => { throw ioFailure(); });
    cache.forgetWithdrawn(key, kind === 'unqualified' ? null : { error: 'production_runtime_revoked', receipt: {
      activityId: 'activity-1', deploymentId: 'deployment-1', contentVersionId: 'version-1', touchpointDecisionId: 'decision-1',
    } });
    read.mockRestore();
    cache.remember(alias, full({ serverTime: 1_000, endsAt: HOUR }), lateTicket);
    cache.reassemble(alias, held, trimmed({ serverTime: 1_000, endsAt: HOUR }), lateTicket);
    expect(cache.replayOffline(key, 'upstream_unavailable')).toBeNull();
    expect(createDiskReader(dataDir).replayOffline(alias, 'upstream_unavailable')).toBeNull();
    for (const candidate of [key, alias])
      expect(cache.replayOffline(candidate, 'upstream_unavailable')).toBeNull();
    if (kind === 'matching') expect(cache.replayOffline(unrelated, 'upstream_unavailable')).not.toBeNull();
    else expect(cache.replayOffline(unrelated, 'upstream_unavailable')).toBeNull();
    expect(replayAfterRestart()).toBeNull();
    vi.advanceTimersByTime(1_000);
    cache.remember(key, full({ serverTime: 1_000, endsAt: HOUR }), cache.ticket(key));
    expect(cache.replayOffline(key, 'upstream_unavailable')).not.toBeNull();
    expect(cache.replayOffline(alias, 'upstream_unavailable')).toBeNull();
  });

  it('keeps a different delivery displayable when matching withdrawal deletion fails', () => {
    const cache = createTouchpointContentCache(dataDir);
    const alias = { ...key, locale: 'zh-TW' };
    const unrelated = { ...key, locale: 'ja-JP' };
    for (const candidate of [key, alias])
      cache.remember(candidate, full({ serverTime: 0, endsAt: HOUR }));
    cache.remember(unrelated, { ...full({ serverTime: 0, endsAt: HOUR }), deploymentId: 'deployment-2' });
    vi.spyOn(fs, 'rmSync').mockImplementation(() => { throw ioFailure(); });
    cache.forgetWithdrawn(key, { error: 'production_runtime_revoked', receipt: {
      activityId: 'activity-1', deploymentId: 'deployment-1', contentVersionId: 'version-1', touchpointDecisionId: 'decision-1',
    } });
    for (const candidate of [key, alias])
      expect(cache.replayOffline(candidate, 'upstream_unavailable')).toBeNull();
    expect(cache.replayOffline(unrelated, 'upstream_unavailable')).not.toBeNull();
    vi.restoreAllMocks();
    expect(createDiskReader(dataDir).replayOffline(unrelated, 'upstream_unavailable')).not.toBeNull();
  });

  it.each([401, 410] as const)('retires unvisited locales when a fresh online grant recovers storage after %s', status => {
    const cache = createTouchpointContentCache(dataDir);
    const alias = { ...key, locale: 'zh-TW' };
    for (const candidate of [key, alias])
      cache.remember(candidate, full({ serverTime: 0, endsAt: HOUR }));
    const read = vi.spyOn(fs, 'readdirSync').mockImplementation(() => { throw ioFailure(); });
    if (status === 410) cache.forgetWithdrawn(key, null);
    else cache.refuseReplay(key, status);
    read.mockRestore();
    vi.advanceTimersByTime(1_000);
    cache.remember(key, full({ serverTime: 1_000, endsAt: HOUR }), cache.ticket(key));
    const restarted = createDiskReader(dataDir);
    expect(restarted.replayOffline(key, 'upstream_unavailable')).not.toBeNull();
    expect(restarted.replayOffline(alias, 'upstream_unavailable')).toBeNull();
  });

  it('requires a fresh grant after refusal, including a trimmed renewal', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    const held = cache.held(key)!;
    cache.refuseReplay(key, 401);
    expect(cache.held(key)).toEqual(held); // Byte reuse is still possible.
    expect(replayAfterRestart()).toBeNull();
    vi.advanceTimersByTime(1_000);
    const grant = trimmed({ serverTime: 1_000, endsAt: HOUR });
    expect(cache.reassemble(key, held, grant, cache.ticket(key))).not.toBeNull();
    expect(replayAfterRestart()).not.toBeNull();
  });

  it.each([401, 403, 404] as const)('fences a late full or trimmed grant after %s', status => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    const held = cache.held(key)!;
    const lateTicket = cache.ticket(key);
    cache.refuseReplay(key, status);
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }), lateTicket);
    cache.reassemble(key, held, trimmed({ serverTime: 0, endsAt: HOUR }), lateTicket);
    expect(replayAfterRestart()).toBeNull();
  });

  it('isolates refusal by account and environment, and rejects all grants of the refused account', () => {
    const cache = createTouchpointContentCache(dataDir);
    const otherAccount = { ...key, scope: 'production:B' };
    const otherEnvironment = { ...key, scope: 'test:A' };
    const otherLocale = { ...key, locale: 'zh-TW' };
    for (const candidate of [key, otherAccount, otherEnvironment, otherLocale])
      cache.remember(candidate, full({ serverTime: 0, endsAt: HOUR }));
    cache.refuseReplay(key, 403);
    const restarted = createDiskReader(dataDir);
    for (const candidate of [key, otherLocale])
      expect(restarted.replayOffline(candidate, 'upstream_unavailable')).toBeNull();
    for (const candidate of [otherAccount, otherEnvironment])
      expect(restarted.replayOffline(candidate, 'upstream_unavailable')).not.toBeNull();
  });

  it('withdraws fallback locale aliases but preserves unrelated deliveries', () => {
    const cache = createTouchpointContentCache(dataDir);
    const alias = { ...key, locale: 'zh-TW' };
    const unrelated = { ...key, locale: 'ja-JP' };
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    cache.remember(alias, full({ serverTime: 0, endsAt: HOUR }));
    cache.remember(unrelated, { ...full({ serverTime: 0, endsAt: HOUR }), deploymentId: 'deployment-2' });
    const lateTicket = cache.ticket(alias);
    cache.forgetWithdrawn(key, { error: 'production_runtime_revoked', receipt: {
      activityId: 'activity-1', deploymentId: 'deployment-1', contentVersionId: 'version-1', touchpointDecisionId: 'decision-1',
    } });
    cache.remember(alias, full({ serverTime: 1_000, endsAt: HOUR }), lateTicket);
    const restarted = createDiskReader(dataDir);
    expect(restarted.replayOffline(alias, 'upstream_unavailable')).toBeNull();
    expect(restarted.replayOffline(unrelated, 'upstream_unavailable')).not.toBeNull();
  });

  it('does not let an older full answer undo a newer early end', () => {
    const cache = createTouchpointContentCache(dataDir);
    vi.advanceTimersByTime(30_000);
    // The newer answer — the operator ended the activity early — lands first.
    cache.remember(key, full({ serverTime: 30_000, endsAt: 90_000 }));
    // The older one, requested before the change, lands after it.
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    expect(replayAfterRestart()?.endsAt).toBe(iso(90_000));
    vi.advanceTimersByTime(60_001);
    expect(replayAfterRestart()).toBeNull();
    expect(records()).toHaveLength(0);
  });

  it('does not let an older trimmed renewal undo a newer early end', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    const held = cache.held(key)!;
    vi.advanceTimersByTime(30_000);
    expect(cache.reassemble(key, held, trimmed({ serverTime: 30_000, endsAt: 90_000 }))?.endsAt).toBe(
      iso(90_000),
    );
    // Still rebuilt for the caller that asked — only the WRITE is refused.
    expect(cache.reassemble(key, held, trimmed({ serverTime: 20_000, endsAt: HOUR }))?.endsAt).toBe(
      iso(HOUR),
    );
    expect(replayAfterRestart()?.endsAt).toBe(iso(90_000));
    vi.advanceTimersByTime(60_001);
    expect(replayAfterRestart()).toBeNull();
    expect(records()).toHaveLength(0);
  });

  it.each(['full', 'trimmed'] as const)('orders %s answers when the device is sixty seconds behind the server', (kind) => {
    vi.setSystemTime(T0 - 60_000);
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    const held = cache.held(key)!;
    vi.advanceTimersByTime(30_000);
    const newer = { serverTime: 30_000, endsAt: 90_000 };
    const older = { serverTime: 20_000, endsAt: HOUR };
    if (kind === 'full') {
      cache.remember(key, full(newer));
      cache.remember(key, full(older));
    } else {
      cache.reassemble(key, held, trimmed(newer));
      cache.reassemble(key, held, trimmed(older));
    }
    expect(replayAfterRestart()?.endsAt).toBe(iso(90_000));
    vi.advanceTimersByTime(60_001);
    expect(replayAfterRestart()).toBeNull();
  });

  it.each(['full', 'trimmed'] as const)('consumes a nine-second %s request before caching a five-second window', (kind) => {
    const cache = createTouchpointContentCache(dataDir);
    if (kind === 'trimmed') cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    const held = kind === 'trimmed' ? cache.held(key)! : null;
    vi.advanceTimersByTime(9_000);
    if (kind === 'full') cache.remember(key, full({ serverTime: 0, endsAt: 5_000 }), undefined, 9_000);
    else cache.reassemble(key, held!, trimmed({ serverTime: 0, endsAt: 5_000 }), undefined, 9_000);
    expect(cache.replayOffline(key, 'upstream_unreachable')).toBeNull();
    expect(replayAfterRestart()).toBeNull();
  });

  it.each(['full', 'trimmed'] as const)('requires monotonic server time for a %s correction after a future server clock', (kind) => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(key, full({ serverTime: 10 * 60_000, endsAt: HOUR }));
    const held = cache.held(key)!;
    vi.advanceTimersByTime(30_000);
    const corrected = { serverTime: 30_000, endsAt: 90_000 };
    if (kind === 'full') cache.remember(key, full(corrected));
    else cache.reassemble(key, held, trimmed(corrected));
    // A local device offset cannot prove the previous server timestamp corrupt.
    expect(replayAfterRestart()?.endsAt).toBe(iso(HOUR));
    const monotonic = { serverTime: 10 * 60_000 + 1, endsAt: 11 * 60_000 };
    if (kind === 'full') cache.remember(key, full(monotonic));
    else cache.reassemble(key, held, trimmed(monotonic));
    expect(replayAfterRestart()?.endsAt).toBe(iso(monotonic.endsAt));
    vi.advanceTimersByTime(60_001);
    expect(replayAfterRestart()).toBeNull();
    expect(records()).toHaveLength(0);
  });

  it('still orders answers with a small server clock lead', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(key, full({ serverTime: 2_000, endsAt: 90_000 }));
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    expect(replayAfterRestart()?.endsAt).toBe(iso(90_000));
  });

  it('adopts an answer as new as the stored one, and replaces rather than merges', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    // Same server time: the later write wins, even when it shortens.
    cache.remember(key, full({ serverTime: 0, endsAt: 90_000 }));
    expect(replayAfterRestart()?.endsAt).toBe(iso(90_000));
    // Newer: adopted even when it lengthens — REPLACE, never max().
    vi.advanceTimersByTime(10_000);
    cache.reassemble(key, cache.held(key)!, trimmed({ serverTime: 10_000, endsAt: 2 * HOUR }));
    expect(replayAfterRestart()?.endsAt).toBe(iso(2 * HOUR));
  });
});

describe('pending revocation monotonicity', () => {
  it.each([false, true])('must preserve latest revoke after earlier pending cleanup (earlierPending=%s)', earlierPending => {
    const cache = createTouchpointContentCache(dataDir);
    const alias = { ...key, locale: 'zh-TW' };
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    // First 410 request already entered the real proxy's held -> ticket path.
    cache.held(key);
    cache.ticket(key);
    let pendingReadFault: ReturnType<typeof vi.spyOn> | undefined;
    if (earlierPending) {
      pendingReadFault = vi.spyOn(fs, 'readdirSync').mockImplementation(() => { throw new Error('injected enumerate failure'); });
      const removeFirst = vi.spyOn(fs, 'rmSync').mockImplementation(() => { throw new Error('injected initial unlink failure'); });
      cache.forgetWithdrawn(key, null);
      removeFirst.mockRestore();
      // Enumeration remains broken through both later request-entry calls.
    }
    vi.advanceTimersByTime(500);
    cache.held(alias); // Real request入口: retryRefusals cannot enumerate yet.
    const lateTicket = cache.ticket(alias);
    const lateGrant = full({ serverTime: 500, endsAt: HOUR });
    cache.held(key); // Second precise 410 request is also already in flight.
    cache.ticket(key);
    pendingReadFault?.mockRestore(); // Restore enumeration only after request start.
    vi.advanceTimersByTime(500);
    const remove = vi.spyOn(fs, 'rmSync').mockImplementation(() => { throw new Error('injected unlink failure'); });
    cache.forgetWithdrawn(key, { error: 'production_runtime_revoked', receipt: {
      activityId: 'activity-1', deploymentId: 'deployment-1', contentVersionId: 'version-1', touchpointDecisionId: 'decision-1',
    } });
    remove.mockRestore();
    cache.held(key); // Recover prior pending unqualified withdrawal; may overwrite the later revocation.
    cache.remember(alias, lateGrant, lateTicket);
    expect(cache.replayOffline(alias, 'upstream_unavailable')).toBeNull();
  });
});

describe('receipt late-locale fences', () => {
  const receipt = { error: 'production_runtime_revoked', receipt: {
    activityId: 'activity-1', deploymentId: 'deployment-1', contentVersionId: 'version-1', touchpointDecisionId: 'decision-1',
  } };
  it('rejects a withdrawn delivery arriving late for a previously uncached locale', () => {
    const cache = createTouchpointContentCache(dataDir);
    const alias = { ...key, locale: 'zh-TW' };
    // Ensure the account directory exists, with a different delivery at another locale.
    cache.remember(key, { ...full({ serverTime: 0, endsAt: HOUR }), deploymentId: 'deployment-2' });
    const lateTicket = cache.ticket(alias);
    cache.forgetWithdrawn(key, receipt);
    cache.remember(alias, full({ serverTime: 0, endsAt: HOUR }), lateTicket);
    expect(cache.replayOffline(alias, 'upstream_unavailable')).toBeNull();
  });
  it('keeps the receipt fence after enumeration failure recovery with no matching stored delivery', () => {
    const cache = createTouchpointContentCache(dataDir);
    const alias = { ...key, locale: 'zh-TW' };
    cache.remember(key, { ...full({ serverTime: 0, endsAt: HOUR }), deploymentId: 'deployment-2' });
    const lateTicket = cache.ticket(alias);
    const read = vi.spyOn(fs, 'readdirSync').mockImplementation(() => { throw new Error('injected'); });
    cache.forgetWithdrawn(key, receipt);
    read.mockRestore();
    cache.held(key); // Trigger retryRefusals, which has no matching stored records to retire.
    cache.remember(alias, full({ serverTime: 0, endsAt: HOUR }), lateTicket);
    expect(cache.replayOffline(alias, 'upstream_unavailable')).toBeNull();
  });
  it('rejects an unqualified withdrawal arriving before an uncached locale answer', () => {
    const cache = createTouchpointContentCache(dataDir);
    const alias = { ...key, locale: 'zh-TW' };
    cache.remember(key, { ...full({ serverTime: 0, endsAt: HOUR }), deploymentId: 'deployment-2' });
    const lateTicket = cache.ticket(alias);
    cache.forgetWithdrawn(key, null);
    cache.remember(alias, full({ serverTime: 0, endsAt: HOUR }), lateTicket);
    expect(cache.replayOffline(alias, 'upstream_unavailable')).toBeNull();
  });
});


describe('delivery receipt fence recovery', () => {
  const receipt = { error: 'production_runtime_revoked', receipt: {
    activityId: 'activity-1', deploymentId: 'deployment-1', contentVersionId: 'version-1', touchpointDecisionId: 'decision-1',
  } };
  it.each([false, true])('rejects late trimmed authorization after cleanup (storageFault=%s)', storageFault => {
    const cache = createTouchpointContentCache(dataDir);
    const alias = { ...key, locale: 'zh-TW' };
    const other = { ...full({ serverTime: 0, endsAt: HOUR }), deploymentId: 'deployment-2' };
    cache.remember(key, other); cache.remember(alias, other);
    const held = cache.held(alias)!; const old = cache.ticket(alias);
    const read = storageFault ? vi.spyOn(fs, 'readdirSync').mockImplementation(() => { throw new Error('enumeration failed'); }) : null;
    cache.forgetWithdrawn(key, receipt); read?.mockRestore(); cache.held(key);
    expect(cache.reassemble(alias, held, trimmed({ serverTime: 0, endsAt: HOUR }), old)?.deploymentId).toBe('deployment-1');
    expect(cache.replayOffline(alias, 'upstream_unavailable')?.deploymentId).toBe('deployment-2');
    expect(createDiskReader(dataDir).replayOffline(alias, 'upstream_unavailable')?.deploymentId).toBe('deployment-2');
    // Truly new authorization for the same delivery can restore this key.
    cache.reassemble(alias, held, trimmed({ serverTime: 1_000, endsAt: HOUR }), cache.ticket(alias));
    expect(cache.replayOffline(alias, 'upstream_unavailable')?.deploymentId).toBe('deployment-1');
  });
  it('a precise withdrawal never fences another in-flight delivery at the same locale', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    cache.held(key); const otherTicket = cache.ticket(key);
    cache.forgetWithdrawn(key, receipt);
    cache.remember(key, { ...full({ serverTime: 1_000, endsAt: HOUR }), deploymentId: 'deployment-2' }, otherTicket);
    expect(cache.replayOffline(key, 'upstream_unavailable')?.deploymentId).toBe('deployment-2');
  });
  it('non-finite withdrawal estimates fail closed during retry recovery', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    const file = path.join(dataDir, records()[0]!);
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    record.schedule.serverTime = 'invalid-server-clock';
    fs.writeFileSync(file, JSON.stringify(record));
    const read = vi.spyOn(fs, 'readdirSync').mockImplementation(() => { throw new Error('enumeration failed'); });
    cache.forgetWithdrawn(key, null); read.mockRestore(); cache.held(key);
    cache.remember(key, full({ serverTime: 1_000, endsAt: HOUR }), cache.ticket(key));
    expect(cache.replayOffline(key, 'upstream_unavailable')).toBeNull();
  });
});


describe('bounded revocation eviction with real request ordering', () => {
  const receiptFor = (grant: ReturnType<typeof full>) => ({ error: 'production_runtime_revoked', receipt: {
    activityId: grant.activityId, deploymentId: grant.deploymentId,
    contentVersionId: grant.content.id, touchpointDecisionId: grant.touchpointDecisionId,
  } });
  it.each(['precise', 'unqualified', 'account'] as const)('does not resurrect an old response after %s fence eviction', kind => {
    const cache = createTouchpointContentCache(dataDir);
    const alias = { ...key, locale: 'zh-TW' };
    const grant = full({ serverTime: 0, endsAt: HOUR });
    // Match the proxy: held (including refusal recovery), ticket, delayed response.
    cache.remember(key, { ...grant, deploymentId: 'other-delivery' });
    expect(cache.held(alias)).toBeNull();
    const old = cache.ticket(alias);
    if (kind === 'account') cache.refuseScope(key.scope);
    else cache.forgetWithdrawn(key, kind === 'precise' ? receiptFor(grant) : null);
    for (let i = 0; i < 257; i++) {
      const filler = { ...key, scope: `production:filler-${i}`, placementKey: `placement-${i}` };
      cache.remember(filler, { ...grant, placementKey: filler.placementKey,
        deploymentId: `filler-${i}`, content: { ...grant.content, placementKey: filler.placementKey } });
      if (kind === 'account') cache.refuseScope(filler.scope);
      else cache.forgetWithdrawn(filler, kind === 'precise' ? receiptFor({ ...grant, deploymentId: `filler-${i}` }) : null);
    }
    cache.remember(alias, grant, old);
    expect(cache.replayOffline(alias, 'upstream_unavailable')).toBeNull();
    cache.held(alias);
    cache.remember(alias, full({ serverTime: 1_000, endsAt: HOUR }), cache.ticket(alias));
    expect(cache.replayOffline(alias, 'upstream_unavailable')).not.toBeNull();
  });
  it('does not adopt a late trimmed grant after receipt eviction', () => {
    const cache = createTouchpointContentCache(dataDir);
    const alias = { ...key, locale: 'zh-TW' };
    const grant = full({ serverTime: 0, endsAt: HOUR });
    cache.remember(alias, { ...grant, deploymentId: 'other-delivery' });
    const held = cache.held(alias)!; const old = cache.ticket(alias);
    cache.held(key); const withdrawal = cache.ticket(key);
    cache.forgetWithdrawn(key, receiptFor(grant)); cache.finishTicket(withdrawal);
    for (let i = 0; i < 257; i++) cache.forgetWithdrawn({ ...key, placementKey: `filler-${i}` },
      receiptFor({ ...grant, deploymentId: `filler-${i}` }));
    expect(cache.reassemble(alias, held, trimmed({ serverTime: 1_000, endsAt: HOUR }), old)?.deploymentId).toBe('deployment-1');
    expect(cache.replayOffline(alias, 'upstream_unavailable')?.deploymentId).toBe('other-delivery');
  });
  it('keeps precise scope after eviction for a different late delivery and another account', () => {
    const cache = createTouchpointContentCache(dataDir);
    const alias = { ...key, locale: 'zh-TW' };
    const account = { ...key, scope: 'production:B' };
    cache.held(alias); const other = cache.ticket(alias);
    cache.held(account); const accountTicket = cache.ticket(account);
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }));
    cache.forgetWithdrawn(key, receiptFor(full({ serverTime: 0, endsAt: HOUR })));
    for (let i = 0; i < 257; i++) cache.forgetWithdrawn({ ...key, placementKey: `filler-${i}` },
      receiptFor({ ...full({ serverTime: 0, endsAt: HOUR }), deploymentId: `filler-${i}` }));
    cache.remember(alias, { ...full({ serverTime: 1_000, endsAt: HOUR }), deploymentId: 'other-delivery' }, other);
    cache.remember(account, full({ serverTime: 1_000, endsAt: HOUR }), accountTicket);
    expect(cache.replayOffline(alias, 'upstream_unavailable')?.deploymentId).toBe('other-delivery');
    expect(cache.replayOffline(account, 'upstream_unavailable')?.deploymentId).toBe('deployment-1');
  });
});


describe('bounded request authority lifetime', () => {
  it.each(['release', 'expire'] as const)('recovers cache capacity after request %s', mode => {
    const cache = createTouchpointContentCache(dataDir);
    const tickets = Array.from({ length: 256 }, () => { cache.held(key); return cache.ticket(key); });
    cache.held(key);
    const saturated = cache.ticket(key);
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }), saturated);
    expect(cache.held(key)).toBeNull();
    if (mode === 'release') cache.finishTicket(tickets[0]!);
    else vi.advanceTimersByTime(10_000);
    cache.held(key);
    cache.remember(key, full({ serverTime: 10_000, endsAt: HOUR }), cache.ticket(key));
    expect(cache.replayOffline(key, 'upstream_unavailable')).not.toBeNull();
    // A released/expired request never gains authority back through a later grant.
    cache.remember(key, { ...full({ serverTime: 20_000, endsAt: HOUR }), deploymentId: 'late' }, tickets[0]);
    expect(cache.replayOffline(key, 'upstream_unavailable')?.deploymentId).toBe('deployment-1');
  });
  it('caps exact receipts per active request and allows a new grant after saturation', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.held(key); const old = cache.ticket(key);
    for (let i = 0; i < 257; i++) cache.forgetWithdrawn(key, { error: 'production_runtime_revoked', receipt: {
      activityId: 'activity-1', deploymentId: `delivery-${i}`, contentVersionId: 'version-1', touchpointDecisionId: 'decision-1',
    } });
    // Normal receipt precision is retained by earlier tests; saturated tracking declines all persistence.
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }), old);
    expect(cache.held(key)).toBeNull();
    cache.finishTicket(old);
    cache.held(key); const fresh = cache.ticket(key);
    cache.remember(key, full({ serverTime: 1_000, endsAt: HOUR }), fresh);
    expect(cache.replayOffline(key, 'upstream_unavailable')).not.toBeNull();
  });
  it('declines persistence at the exact ten-second request boundary', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.held(key); const ticket = cache.ticket(key);
    vi.advanceTimersByTime(9_999);
    cache.remember(key, full({ serverTime: 0, endsAt: HOUR }), ticket);
    expect(cache.held(key)).not.toBeNull();
    vi.advanceTimersByTime(1);
    cache.remember(key, { ...full({ serverTime: 1_000, endsAt: HOUR }), deploymentId: 'late' }, ticket);
    expect(cache.replayOffline(key, 'upstream_unavailable')?.deploymentId).toBe('deployment-1');
  });
});
