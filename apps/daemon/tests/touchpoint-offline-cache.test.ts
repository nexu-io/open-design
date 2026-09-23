// OPEND-3436. The daemon keeps a production activity on screen while the CMS
// runtime is unreachable, and takes it down — bytes and all — the moment its
// own schedule says it is over or the server says it is withdrawn.
//
// Every case here is about one of the two ways this feature can be wrong:
//
//   1. It shows something it must not (an activity that has ended, one that has
//      not started, one belonging to another account, one the server withdrew,
//      one whose cache carries no schedule at all).
//   2. It deletes something it must not (a resource another live activity is
//      still using, a record a non-matching withdrawal receipt names, a record
//      a 404 or a timeout merely failed to refresh).
//
// The clock cases exist because the only authority here is the SERVER's
// schedule, and the only device-side input is an elapsed measurement that must
// not be reducible by moving the system clock backwards.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTouchpointContentCache } from '../src/routes/touchpoint-content-cache.js';

const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const base64 = (value: string) => Buffer.from(value, 'utf8').toString('base64');

/** One resource deliberately shared by both placements, so deletion has something to get wrong. */
const SHARED = 'export const shared = 1;\n';
const MODAL_ENTRY = "import './shared.js'; export function mount(root) { root.textContent = 'modal'; }";
const BADGE_ENTRY = "import './shared.js'; export function mount(root) { root.textContent = 'badge'; }";

const T0 = Date.parse('2030-04-01T00:00:00.000Z');
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

const manifest = (placementKey: string, entry: string) => ({
  formatVersion: 2,
  runtimeKind: 'web-component',
  runtimeApiVersion: 1,
  platformWrapperVersion: 'vela-touchpoint-wrapper-v1',
  sdkVersion: 'vela-touchpoint-sdk-v1',
  contentLine: 'production',
  placements: [
    {
      key: placementKey,
      entry,
      resources: ['shared.js'],
      locales: ['en-US'],
      requiredCapabilities: [],
      staticActions: [],
    },
  ],
  resources: [entry, 'shared.js'],
  images: [],
});

type Overrides = Partial<{
  contentId: string;
  activityId: string;
  deploymentId: string;
  touchpointDecisionId: string;
  serverTime: string;
  startsAt: string;
  endsAt: string;
  authorizationExpiresAt: string;
}>;

const fullResponse = (
  placementKey: string,
  entryPath: string,
  entryModule: string,
  overrides: Overrides = {},
) => ({
  deploymentId: overrides.deploymentId ?? 'deployment-1',
  activityId: overrides.activityId ?? 'activity-1',
  snapshotHash: 'sha256:snapshot',
  artifactHash: 'sha256:artifact',
  manifestHash: 'sha256:manifest',
  placementKey,
  requiredCapabilities: [],
  staticActions: [],
  testContext: null,
  content: {
    id: overrides.contentId ?? 'version-1',
    placementKey,
    locale: 'en-US',
    manifest: manifest(placementKey, entryPath),
    manifestHash: digest(JSON.stringify(manifest(placementKey, entryPath))),
    entryPath,
    entryDigest: digest(entryModule),
    entryModule,
    resources: [
      { path: entryPath, digest: digest(entryModule), bytes: base64(entryModule) },
      { path: 'shared.js', digest: digest(SHARED), bytes: base64(SHARED) },
    ],
    runtime: {
      kind: 'web-component',
      apiVersion: 1,
      wrapperVersion: 'vela-touchpoint-wrapper-v1',
      sdkVersion: 'vela-touchpoint-sdk-v1',
    },
    buildIdentity: { fingerprint: 'fixed' },
  },
  serverTime: overrides.serverTime ?? iso(T0),
  startsAt: overrides.startsAt ?? iso(T0 - HOUR),
  endsAt: overrides.endsAt ?? iso(T0 + 24 * HOUR),
  authorizationExpiresAt: overrides.authorizationExpiresAt ?? iso(T0 + 60_000),
  touchpointDecisionId: overrides.touchpointDecisionId ?? 'decision-1',
});

const SCOPE_A = 'account-a@https://amr-api.example';
const SCOPE_B = 'account-b@https://amr-api.example';
const MODAL = { scope: SCOPE_A, placementKey: 'opend.home.campaign-modal', locale: 'en-US' } as const;
const BADGE = { scope: SCOPE_A, placementKey: 'opend.home.account-badge', locale: 'en-US' } as const;

const RECEIPT = {
  activityId: 'activity-1',
  deploymentId: 'deployment-1',
  contentVersionId: 'version-1',
  touchpointDecisionId: 'decision-1',
} as const;
/** A 410 body as the runtime frames one. */
const revoked = (receipt: Record<string, string> | null = { ...RECEIPT }) =>
  receipt === null
    ? { error: 'production_runtime_revoked' }
    : { error: 'production_runtime_revoked', receipt };

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'od-touchpoint-offline-'));
  // Every cache instance in this file is constructed AFTER the system time is
  // set, because the store anchors its monotonic clock when it is created.
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(dataDir, { recursive: true, force: true });
});

const root = () => path.join(dataDir, 'touchpoint-content-cache');
/** Every blob file currently on disk, whatever scope directory holds it. */
const storedBlobs = (): string[] => {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(full);
    }
  };
  walk(root());
  return found;
};
const blobExists = (value: string) =>
  storedBlobs().some((file) => path.basename(file) === value.slice('sha256:'.length));
const assemblyCount = () =>
  storedBlobs().filter((file) => file.includes(`${path.sep}assemblies${path.sep}`)).length;
/** The one assembly record on disk, as parsed JSON. */
const assemblyFileOnDisk = (): string => {
  const files = storedBlobs().filter((file) => file.includes(`${path.sep}assemblies${path.sep}`));
  expect(files).toHaveLength(1);
  return files[0] as string;
};

describe('offline schedule cache', () => {
  it('persists the server schedule and activity identity, and replays them from a fresh instance', () => {
    const writer = createTouchpointContentCache(dataDir);
    writer.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));

    // A restart: nothing survives in memory, so anything read back came off disk.
    vi.setSystemTime(T0 + 2 * HOUR);
    const reader = createTouchpointContentCache(dataDir);
    const replayed = reader.replayOffline(MODAL, 'upstream_unreachable');
    expect(replayed).not.toBeNull();
    const decision = replayed as Record<string, any>;

    expect(decision.activityId).toBe('activity-1');
    expect(decision.deploymentId).toBe('deployment-1');
    expect(decision.touchpointDecisionId).toBe('decision-1');
    expect(decision.content.id).toBe('version-1');
    expect(decision.content.entryModule).toBe(MODAL_ENTRY);
    // The schedule is the server's, replayed verbatim.
    expect(decision.startsAt).toBe(iso(T0 - HOUR));
    expect(decision.endsAt).toBe(iso(T0 + 24 * HOUR));
    // ...and the two rewritten fields: now, and "authorized until the end".
    expect(decision.serverTime).toBe(iso(T0 + 2 * HOUR));
    expect(decision.authorizationExpiresAt).toBe(iso(T0 + 24 * HOUR));
    expect(decision.offlineReplay).toEqual({
      reason: 'upstream_unreachable',
      cachedServerTime: iso(T0),
      effectiveServerTime: iso(T0 + 2 * HOUR),
    });
  });

  it('keeps one account/environment out of another one\'s cache', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
    const otherAccount = { ...MODAL, scope: SCOPE_B };
    expect(cache.held(otherAccount)).toBeNull();
    expect(cache.replayOffline(otherAccount, 'upstream_unreachable')).toBeNull();
    // ...and the account that does hold it is unaffected by the miss.
    expect(cache.replayOffline(MODAL, 'upstream_unreachable')).not.toBeNull();
  });

  it('does not display before the activity starts, and keeps the record for when it does', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(
      MODAL,
      fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY, {
        startsAt: iso(T0 + HOUR),
        endsAt: iso(T0 + 2 * HOUR),
      }),
    );
    expect(cache.replayOffline(MODAL, 'upstream_unreachable')).toBeNull();
    expect(assemblyCount()).toBe(1);
    vi.setSystemTime(T0 + 90 * 60_000);
    expect(cache.replayOffline(MODAL, 'upstream_unreachable')).not.toBeNull();
  });

  it('refuses to replay a record that carries no schedule', () => {
    const cache = createTouchpointContentCache(dataDir);
    const timeless = fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY) as Record<string, unknown>;
    delete timeless.endsAt;
    cache.remember(MODAL, timeless);
    // The content half may still be cached — that is OPEND-3371's job — but a
    // decision with no end is not one this feature may put back on the screen.
    expect(cache.replayOffline(MODAL, 'upstream_unreachable')).toBeNull();
  });

  it('refuses to replay a damaged record', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
    const assemblies = storedBlobs().filter((file) => file.includes(`${path.sep}assemblies${path.sep}`));
    expect(assemblies).toHaveLength(1);
    fs.writeFileSync(assemblies[0] as string, '{"version":2,"schedule":');
    expect(cache.replayOffline(MODAL, 'upstream_unreachable')).toBeNull();
  });

  it('stops display and deletes the package once the activity has ended', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
    expect(blobExists(digest(MODAL_ENTRY))).toBe(true);
    vi.setSystemTime(T0 + 25 * HOUR);
    expect(cache.replayOffline(MODAL, 'upstream_unreachable')).toBeNull();
    expect(assemblyCount()).toBe(0);
    expect(blobExists(digest(MODAL_ENTRY))).toBe(false);
    expect(blobExists(digest(SHARED))).toBe(false);
    // A record that is gone cannot come back on the next read either.
    expect(cache.held(MODAL)).toBeNull();
  });

  // The blob pool is content-addressed and therefore SHARED: four placements of
  // one activity legitimately point at the same `shared.js`. Reclaiming an
  // expired record by digest, without asking who else still references it, is
  // how one activity ending silently breaks every other one on the machine.
  it('never reclaims a resource another live activity still references', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(
      MODAL,
      fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY, { endsAt: iso(T0 + HOUR) }),
    );
    cache.remember(
      BADGE,
      fullResponse(BADGE.placementKey, 'badge.js', BADGE_ENTRY, {
        activityId: 'activity-2',
        contentId: 'version-2',
        endsAt: iso(T0 + 48 * HOUR),
      }),
    );
    expect(blobExists(digest(SHARED))).toBe(true);

    vi.setSystemTime(T0 + 2 * HOUR);
    expect(cache.replayOffline(MODAL, 'upstream_unreachable')).toBeNull();

    // The modal's own entry goes...
    expect(blobExists(digest(MODAL_ENTRY))).toBe(false);
    // ...the resource the badge still needs stays...
    expect(blobExists(digest(SHARED))).toBe(true);
    // ...and the badge is still whole, which is the assertion that would catch a
    // deletion that merely left the file behind with the wrong bytes.
    const badge = cache.replayOffline(BADGE, 'upstream_unreachable') as Record<string, any> | null;
    expect(badge).not.toBeNull();
    expect(badge?.content.entryModule).toBe(BADGE_ENTRY);
    expect(
      (badge?.content.resources as Array<{ path: string; bytes: string }>).find(
        (resource) => resource.path === 'shared.js',
      )?.bytes,
    ).toBe(base64(SHARED));
  });

  it('deletes the package a matching withdrawal receipt names', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
    expect(cache.forgetWithdrawn(MODAL, revoked())).toBe(true);
    expect(assemblyCount()).toBe(0);
    expect(blobExists(digest(MODAL_ENTRY))).toBe(false);
    // Withdrawal survives a restart: nothing to replay, offline or not.
    expect(createTouchpointContentCache(dataDir).replayOffline(MODAL, 'upstream_unreachable')).toBeNull();
  });

  // A withdrawn deployment answers 410 with no receipt at all. The browser
  // already clears the screen on it; leaving the package behind would let the
  // next offline start put the withdrawn activity back.
  it('deletes the package on a withdrawal that names nothing', () => {
    for (const body of [
      { error: 'production_runtime_withdrawn' },
      revoked(null),
      { error: 'production_runtime_revoked', receipt: { touchpointDecisionId: 'decision-1' } },
      null,
    ]) {
      const cache = createTouchpointContentCache(dataDir);
      cache.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
      expect(cache.forgetWithdrawn(MODAL, body), JSON.stringify(body)).toBe(true);
      expect(assemblyCount()).toBe(0);
    }
  });

  it('leaves every other activity alone when a receipt does not match', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
    cache.remember(
      BADGE,
      fullResponse(BADGE.placementKey, 'badge.js', BADGE_ENTRY, {
        activityId: 'activity-2',
        contentId: 'version-2',
      }),
    );
    // Same activity, a different delivery of it: still not this record.
    expect(cache.forgetWithdrawn(MODAL, revoked({ ...RECEIPT, deploymentId: 'deployment-9' }))).toBe(false);
    expect(cache.forgetWithdrawn(MODAL, revoked({ ...RECEIPT, contentVersionId: 'version-9' }))).toBe(false);
    expect(cache.forgetWithdrawn(BADGE, revoked())).toBe(false);
    expect(assemblyCount()).toBe(2);
    expect(cache.replayOffline(MODAL, 'upstream_unreachable')).not.toBeNull();
    expect(cache.replayOffline(BADGE, 'upstream_unreachable')).not.toBeNull();
  });

  // A fresh answer REPLACES the stored schedule. It is worth a case of its own
  // because the wrong version of this is the one that looks careful: taking
  // `max(cached.endsAt, fresh.endsAt)` reads like "never shorten display by
  // accident", and it permanently defeats every early finish an operator can
  // order. Nothing else in this file would go red if someone added it.
  //
  // Note for anyone tempted to make the two sides agree: Vela's own lease
  // renewal (`persistence.ts`) deliberately does the opposite and takes
  // `greatest()`, so that a slow request cannot write `expires_at` BACKWARDS.
  // That is a different question with a different answer — the server's own
  // grant must be monotonic, and a client's copy of the server's schedule must
  // follow it wherever it goes. They are not two implementations of one rule.
  it('follows a shortened end time down, including one that has already passed', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(
      MODAL,
      fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY, { endsAt: iso(T0 + 30 * 24 * HOUR) }),
    );
    expect(
      (cache.replayOffline(MODAL, 'upstream_unreachable') as Record<string, any>).endsAt,
    ).toBe(iso(T0 + 30 * 24 * HOUR));

    // An operator cuts the activity to five minutes from now.
    vi.setSystemTime(T0 + HOUR);
    cache.remember(
      MODAL,
      fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY, {
        serverTime: iso(T0 + HOUR),
        endsAt: iso(T0 + HOUR + 5 * 60_000),
      }),
    );
    const stored = JSON.parse(
      fs.readFileSync(
        storedBlobs().find((file) => file.includes(`${path.sep}assemblies${path.sep}`)) as string,
        'utf8',
      ),
    ) as { schedule: { endsAt: string } };
    // The record itself, not merely what a replay happens to report.
    expect(stored.schedule.endsAt).toBe(iso(T0 + HOUR + 5 * 60_000));
    expect(
      (cache.replayOffline(MODAL, 'upstream_unreachable') as Record<string, any>).endsAt,
    ).toBe(iso(T0 + HOUR + 5 * 60_000));

    // ...and it really binds: six minutes later there is nothing to show, and
    // the package is gone rather than waiting on the old thirty-day window.
    vi.setSystemTime(T0 + HOUR + 6 * 60_000);
    expect(cache.replayOffline(MODAL, 'upstream_unreachable')).toBeNull();
    expect(assemblyCount()).toBe(0);
    expect(blobExists(digest(MODAL_ENTRY))).toBe(false);
  });

  it('stops immediately when the fresh schedule has already ended', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(
      MODAL,
      fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY, { endsAt: iso(T0 + 30 * 24 * HOUR) }),
    );
    // The last answer before the network went away already said it was over.
    vi.setSystemTime(T0 + HOUR);
    cache.remember(
      MODAL,
      fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY, {
        serverTime: iso(T0 + HOUR),
        startsAt: iso(T0 - HOUR),
        endsAt: iso(T0 + 30 * 60_000),
      }),
    );
    expect(cache.replayOffline(MODAL, 'upstream_unreachable')).toBeNull();
    expect(assemblyCount()).toBe(0);
  });

  // A record is one activity's, whole. Merging a new answer into the old one
  // would leave a package whose identity half and schedule half came from
  // different activities, and the only thing that compares identity — the
  // withdrawal receipt — would then answer for the wrong one.
  it('replaces the record outright when the server moves to another activity', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
    cache.remember(
      MODAL,
      fullResponse(MODAL.placementKey, 'modal.js', BADGE_ENTRY, {
        activityId: 'activity-2',
        deploymentId: 'deployment-2',
        contentId: 'version-2',
        touchpointDecisionId: 'decision-2',
        endsAt: iso(T0 + 2 * HOUR),
      }),
    );
    const replayed = cache.replayOffline(MODAL, 'upstream_unreachable') as Record<string, any>;
    expect(replayed.activityId).toBe('activity-2');
    expect(replayed.deploymentId).toBe('deployment-2');
    expect(replayed.touchpointDecisionId).toBe('decision-2');
    expect(replayed.content.id).toBe('version-2');
    expect(replayed.content.entryModule).toBe(BADGE_ENTRY);
    expect(replayed.endsAt).toBe(iso(T0 + 2 * HOUR));
    // The previous activity's receipt is now a receipt for something this
    // record is not, and must not be able to delete it.
    expect(cache.forgetWithdrawn(MODAL, revoked())).toBe(false);
    expect(assemblyCount()).toBe(1);
    expect(
      cache.forgetWithdrawn(
        MODAL,
        revoked({
          activityId: 'activity-2',
          deploymentId: 'deployment-2',
          contentVersionId: 'version-2',
          touchpointDecisionId: 'decision-2',
        }),
      ),
    ).toBe(true);
    expect(assemblyCount()).toBe(0);
  });

  it('applies a shortened schedule as soon as one arrives', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
    vi.setSystemTime(T0 + HOUR);
    cache.remember(
      MODAL,
      fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY, {
        serverTime: iso(T0 + HOUR),
        endsAt: iso(T0 + 2 * HOUR),
      }),
    );
    const replayed = cache.replayOffline(MODAL, 'upstream_unavailable') as Record<string, any> | null;
    expect(replayed?.endsAt).toBe(iso(T0 + 2 * HOUR));
    vi.setSystemTime(T0 + 3 * HOUR);
    expect(cache.replayOffline(MODAL, 'upstream_unavailable')).toBeNull();
  });

  // A record can be valid JSON, carry the current version, and still be
  // structurally damaged. Every field this module dereferences without a guard
  // has to be rejected HERE, because the callers are the proxy's upstream
  // `error`/5xx handlers: an exception thrown there is uncaught and takes the
  // daemon with it, which is strictly worse than the cache miss it replaces.
  it('treats a structurally damaged record as a miss, not an exception', () => {
    const writer = createTouchpointContentCache(dataDir);
    writer.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
    const held = writer.held(MODAL);
    expect(held).not.toBeNull();

    const file = assemblyFileOnDisk();
    const record = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    // Valid JSON, right version, every scalar intact — only the envelope is gone.
    record.envelope = null;
    fs.writeFileSync(file, JSON.stringify(record));

    vi.setSystemTime(T0 + 2 * HOUR);
    const reader = createTouchpointContentCache(dataDir);
    expect(() => reader.replayOffline(MODAL, 'upstream_unavailable')).not.toThrow();
    expect(reader.replayOffline(MODAL, 'upstream_unavailable')).toBeNull();
    expect(() =>
      reader.reassemble(MODAL, held!, { placementKey: MODAL.placementKey, contentOmitted: true }),
    ).not.toThrow();
    expect(
      reader.reassemble(MODAL, held!, { placementKey: MODAL.placementKey, contentOmitted: true }),
    ).toBeNull();
  });

  it('counts elapsed time through an in-process clock rollback before the first replay', () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'] });
    vi.setSystemTime(T0);
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));

    vi.advanceTimersByTime(HOUR);
    vi.setSystemTime(T0 - 48 * HOUR);
    expect(cache.replayOffline(MODAL, 'upstream_unreachable')).not.toBeNull();
    vi.advanceTimersByTime(23 * HOUR);
    expect(cache.replayOffline(MODAL, 'upstream_unreachable')).toBeNull();
  });

  // A new process cannot measure the downtime hidden by a wall-clock rollback.
  // Keep the bytes for online revalidation, but do not restore display authority.
  it('refuses offline replay after downtime and rollback, even after the wall clock catches up', () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'] });
    vi.setSystemTime(T0);
    const before = createTouchpointContentCache(dataDir);
    before.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
    expect(before.replayOffline(MODAL, 'upstream_unreachable')).not.toBeNull();

    vi.advanceTimersByTime(HOUR);
    vi.setSystemTime(T0 + HOUR - 24 * HOUR);
    const after = createTouchpointContentCache(dataDir);
    expect(after.replayOffline(MODAL, 'upstream_unreachable')).toBeNull();
    expect(after.held(MODAL)).not.toBeNull();

    // The server window has now ended, although wall time has only reached T0.
    vi.advanceTimersByTime(23 * HOUR + 60_000);
    expect(Date.now()).toBeGreaterThan(T0);
    expect(after.replayOffline(MODAL, 'upstream_unreachable')).toBeNull();
  });

  it('refuses an uncertain restart even when its first replay is delayed until clock catch-up', () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'] });
    vi.setSystemTime(T0);
    const before = createTouchpointContentCache(dataDir);
    before.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
    vi.advanceTimersByTime(HOUR);
    vi.setSystemTime(T0 + HOUR - 24 * HOUR);
    const after = createTouchpointContentCache(dataDir);
    vi.advanceTimersByTime(23 * HOUR + 60_000);
    expect(after.replayOffline(MODAL, 'upstream_unreachable')).toBeNull();
  });

  it('restores offline replay when an online response establishes a new clock baseline', () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'] });
    vi.setSystemTime(T0);
    const before = createTouchpointContentCache(dataDir);
    before.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
    vi.advanceTimersByTime(HOUR);
    vi.setSystemTime(T0 - 24 * HOUR);
    const after = createTouchpointContentCache(dataDir);
    expect(after.replayOffline(MODAL, 'upstream_unreachable')).toBeNull();

    vi.advanceTimersByTime(HOUR);
    const refreshed = fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY, {
      serverTime: iso(T0 + 2 * HOUR),
    });
    const held = after.held(MODAL)!;
    const { content: _content, ...envelope } = refreshed;
    const assembled = after.reassemble(MODAL, held, { ...envelope, contentOmitted: true });
    expect(assembled).not.toBeNull();
    after.remember(MODAL, assembled);
    const replayed = after.replayOffline(MODAL, 'upstream_unreachable');
    expect(replayed?.serverTime).toBe(iso(T0 + 2 * HOUR));
    vi.advanceTimersByTime(22 * HOUR);
    expect(after.replayOffline(MODAL, 'upstream_unreachable')).toBeNull();
  });

  it('supports offline restart on a consistently slow device clock', () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'] });
    vi.setSystemTime(T0 - 48 * HOUR);
    const before = createTouchpointContentCache(dataDir);
    before.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
    vi.advanceTimersByTime(HOUR);
    const after = createTouchpointContentCache(dataDir);
    expect(after.replayOffline(MODAL, 'upstream_unreachable')?.serverTime).toBe(iso(T0 + HOUR));
    vi.advanceTimersByTime(23 * HOUR);
    expect(after.replayOffline(MODAL, 'upstream_unreachable')).toBeNull();
  });

  it('accepts a fresh decision fetched after startup and resets the previous clock anchor', () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'] });
    vi.setSystemTime(T0);
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
    vi.setSystemTime(T0 + 12 * HOUR);
    expect(cache.replayOffline(MODAL, 'upstream_unreachable')?.serverTime).toBe(iso(T0 + 12 * HOUR));

    vi.setSystemTime(T0);
    vi.advanceTimersByTime(HOUR);
    cache.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY, {
      serverTime: iso(T0 + HOUR),
    }));
    expect(cache.replayOffline(MODAL, 'upstream_unreachable')?.serverTime).toBe(iso(T0 + HOUR));
  });

  it('never replays an ended activity after a backwards-clock restart', () => {
    const before = createTouchpointContentCache(dataDir);
    before.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
    vi.setSystemTime(T0 + 30 * HOUR);
    expect(before.replayOffline(MODAL, 'upstream_unreachable')).toBeNull();
    vi.setSystemTime(T0 + HOUR);
    const restarted = createTouchpointContentCache(dataDir);
    expect(restarted.replayOffline(MODAL, 'upstream_unreachable')).toBeNull();
  });
});
