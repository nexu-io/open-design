// OPEND-3436: two requests for the same placement can be in flight at once (a
// focus refresh racing a timer), and nothing guarantees their answers arrive in
// the order the server gave them. The store holds ONE answer per placement and
// replaces it wholesale, so an older answer that lands last would replace the
// newer one — and if the newer one ended the activity early, the older one
// quietly puts the long window back and offline replay outlives the real end.
//
// Local files and a virtual clock only, no sockets.
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTouchpointContentCache } from '../src/routes/touchpoint-content-cache.js';

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
  createTouchpointContentCache(dataDir).replayOffline(key, 'upstream_unreachable');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(T0);
  dataDir = mkdtempSync(path.join(tmpdir(), 'touchpoint-ordering-'));
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('touchpoint content cache answer ordering', () => {
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
