/**
 * A persisted workspace selection belongs to the identity that made it.
 *
 * `workspace-selection.json` is the daemon's restart default: the workspace id
 * this client last chose. It used to be written as a bare `{ workspaceId }`,
 * with nothing recording WHICH account or WHICH AMR environment chose it. That
 * makes the record silently portable across identities it was never valid for:
 * switch `OPEN_DESIGN_AMR_PROFILE` between prod and test, or sign in as another
 * account, and the credential changes while the workspace id does not.
 *
 * Downstream that is not a cosmetic mismatch. The client keeps announcing the
 * foreign id, Vela's `findWorkspaceAndMember(workspaceId, appUserId)` finds no
 * membership row, raises `workspace_member_required`, and the bare catch in
 * `getCurrentWorkspaceContext` reports it as `403 missing_principal`. Nothing
 * upstream caches that decision, so every subsequent request repeats it — the
 * field report is a machine that moved between prod and test several times in
 * one morning and then answered 403 to everything until the selection was
 * replaced.
 *
 * So the invariant under test is: a stored selection is only usable while the
 * identity reading it is the identity that wrote it. Anything else — a
 * different account, a different environment, or a legacy record that cannot
 * say who wrote it — reads as "no selection", which is the state the normal
 * directory-driven re-resolution path already knows how to handle.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createActiveWorkspaceSelectionStore } from '../../src/collab/active-workspace-selection.js';

const tempDirs: string[] = [];

/** Workspace ids from the field report, kept verbatim so the case stays legible. */
const PROD_WORKSPACE = 'm46zutn5p4sgpwenaouxfucs';
const TEST_WORKSPACE = 'j2ryucc2ynz4gbtq30l80czf';

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/**
 * A file-backed AMR session, the shape `vela login` leaves behind. Each profile
 * carries its own environment URLs, its own keys, and its own signed-in user —
 * exactly the three axes that make one profile's workspace ids meaningless in
 * another.
 */
function writeAmrConfig(amrHome: string, profiles: Record<string, unknown>): void {
  writeFileSync(
    join(amrHome, 'config.json'),
    JSON.stringify({ profiles }, null, 2),
    'utf8',
  );
}

function prodProfile(): Record<string, unknown> {
  return {
    apiUrl: 'https://amr-api.open-design.ai',
    linkUrl: 'https://link.open-design.ai',
    controlKey: 'prod-control-key',
    runtimeKey: 'prod-runtime-key',
    user: { id: 'user-prod', email: 'prod@example.com' },
  };
}

function testProfile(): Record<string, unknown> {
  return {
    apiUrl: 'https://amr-api-test.open-design.ai',
    linkUrl: 'https://link-test.open-design.ai',
    controlKey: 'test-control-key',
    runtimeKey: 'test-runtime-key',
    user: { id: 'user-test', email: 'test@example.com' },
  };
}

/** Seeds both environments and points the process at `prod`. */
function seedBothEnvironments(): string {
  const amrHome = makeTempDir('od-wsbind-amr-');
  writeAmrConfig(amrHome, { prod: prodProfile(), test: testProfile() });
  vi.stubEnv('AMR_HOME', amrHome);
  vi.stubEnv('OPEN_DESIGN_AMR_PROFILE', 'prod');
  return amrHome;
}

function selectionFileOf(root: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(root, 'workspace-selection.json'), 'utf8'),
  ) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('persisted workspace selection is bound to the identity that chose it', () => {
  it('stops handing back a prod selection once the process switches to test', async () => {
    seedBothEnvironments();
    const root = makeTempDir('od-wsbind-data-');

    const store = createActiveWorkspaceSelectionStore(root);
    await store.set(PROD_WORKSPACE);
    expect(store.get()).toBe(PROD_WORKSPACE);

    // Same machine, same data directory, different environment. The credential
    // in play is now test's; the prod workspace id has no membership row behind
    // it, so announcing it is what produces the sustained 403.
    vi.stubEnv('OPEN_DESIGN_AMR_PROFILE', 'test');

    expect(store.get()).toBeNull();
    expect(store.snapshot().workspaceId).toBeNull();
    // A daemon restart under test must not resurrect it from disk either.
    expect(createActiveWorkspaceSelectionStore(root).get()).toBeNull();
  });

  it('stops handing back a selection made by a different account on the same profile', async () => {
    const amrHome = seedBothEnvironments();
    const root = makeTempDir('od-wsbind-data-');

    const store = createActiveWorkspaceSelectionStore(root);
    await store.set(PROD_WORKSPACE);
    expect(store.get()).toBe(PROD_WORKSPACE);

    // A second `vela login` on the same profile: same environment, different
    // person. Their membership rows are disjoint from the first account's.
    writeAmrConfig(amrHome, {
      prod: {
        ...prodProfile(),
        controlKey: 'prod-control-key-second-account',
        runtimeKey: 'prod-runtime-key-second-account',
        user: { id: 'user-prod-second', email: 'second@example.com' },
      },
      test: testProfile(),
    });

    expect(store.get()).toBeNull();
    expect(createActiveWorkspaceSelectionStore(root).get()).toBeNull();
  });

  it('discards a legacy record that cannot say which identity wrote it', () => {
    seedBothEnvironments();
    const root = makeTempDir('od-wsbind-data-');

    // The pre-migration on-disk shape. It may well have been written by this
    // identity, but nothing in it says so, and trusting an unattributable
    // record is the exact failure this change exists to remove. Discarding it
    // costs one re-resolution; trusting it costs a persistent 403.
    writeFileSync(
      join(root, 'workspace-selection.json'),
      `${JSON.stringify({ workspaceId: TEST_WORKSPACE }, null, 2)}\n`,
      'utf8',
    );

    expect(createActiveWorkspaceSelectionStore(root).get()).toBeNull();
  });

  it('records the identity alongside the workspace id it selected', async () => {
    seedBothEnvironments();
    const root = makeTempDir('od-wsbind-data-');

    await createActiveWorkspaceSelectionStore(root).set(PROD_WORKSPACE);

    const persisted = selectionFileOf(root);
    expect(persisted.workspaceId).toBe(PROD_WORKSPACE);
    expect(typeof persisted.identity).toBe('string');
    expect(persisted.identity).not.toBe('');
  });

  it('keeps serving the selection across a restart under the unchanged identity', async () => {
    seedBothEnvironments();
    const root = makeTempDir('od-wsbind-data-');

    await createActiveWorkspaceSelectionStore(root).set(PROD_WORKSPACE);

    expect(createActiveWorkspaceSelectionStore(root).get()).toBe(PROD_WORKSPACE);
  });

  it('keeps serving the selection when the AMR config is rewritten without changing the account', async () => {
    const amrHome = seedBothEnvironments();
    const root = makeTempDir('od-wsbind-data-');

    const store = createActiveWorkspaceSelectionStore(root);
    await store.set(PROD_WORKSPACE);

    // A config rewrite that leaves the account and the environment alone —
    // vela touches this file for its own bookkeeping. Binding to the mtime
    // instead of the identity would log the user out of their own selection
    // every time that happened, so the stamp must ignore it.
    writeFileSync(
      join(amrHome, 'config.json'),
      JSON.stringify(
        { lastUsedAt: new Date().toISOString(), profiles: { prod: prodProfile(), test: testProfile() } },
        null,
        2,
      ),
      'utf8',
    );

    expect(store.get()).toBe(PROD_WORKSPACE);
    expect(createActiveWorkspaceSelectionStore(root).get()).toBe(PROD_WORKSPACE);
  });

  it('lets the normal re-resolution path claim the file for the new identity', async () => {
    seedBothEnvironments();
    const root = makeTempDir('od-wsbind-data-');

    const store = createActiveWorkspaceSelectionStore(root);
    await store.set(PROD_WORKSPACE);

    vi.stubEnv('OPEN_DESIGN_AMR_PROFILE', 'test');

    // This is how `resolveCurrent` writes a directory-derived bootstrap: it
    // passes the selection it just read as the expected value. Under a foreign
    // identity that read is `null`, so the conditional write must succeed
    // rather than being blocked by the previous environment's leftover.
    await expect(store.replaceIf(null, TEST_WORKSPACE)).resolves.toBe(TEST_WORKSPACE);
    expect(store.get()).toBe(TEST_WORKSPACE);

    // ...and going back to prod does not re-expose the test id.
    vi.stubEnv('OPEN_DESIGN_AMR_PROFILE', 'prod');
    expect(store.get()).toBeNull();
  });
});
