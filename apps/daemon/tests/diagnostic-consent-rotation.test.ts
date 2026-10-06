import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Windows file-system tunneling cannot be triggered on CI hosts, so file identity
// (inode + creation time) is simulated per path while sizes stay real.
const identities = new Map<string, { ino: number; birthtimeMs: number }>();
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    stat: async (path: string) => {
      const info = await actual.stat(path);
      const identity = identities.get(path);
      return identity ? Object.assign(info, identity) : info;
    },
  };
});

const { DiagnosticConsentFence } = await import('../src/services/diagnostic-consent.js');

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'diagnostic-rotation-')); identities.clear(); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

async function optedIn(latest: string) {
  await writeFile(latest, 'written before consent\n');
  identities.set(latest, { ino: 1, birthtimeMs: Date.now() - 60_000 });
  const fence = new DiagnosticConsentFence(dir, false);
  fence.change(true);
  await fence.baseline([{ name: 'logs/daemon/latest.log', absolutePath: latest, kind: 'text' }]);
  return fence;
}

it('admits a log re-created under a rotated name that inherited the prior creation time', async () => {
  const latest = join(dir, 'latest.log'); const previous = join(dir, 'previous.log');
  const fence = await optedIn(latest);
  const inherited = identities.get(latest)!.birthtimeMs;
  // Next launch: latest.log -> previous.log, then a new latest.log within the tunneling window.
  await writeFile(previous, 'written before consent\nafter consent\n');
  identities.set(previous, { ino: 1, birthtimeMs: inherited });
  await writeFile(latest, 'new session\n');
  identities.set(latest, { ino: 2, birthtimeMs: inherited });
  const [current, rotated] = await fence.apply([
    { name: 'logs/daemon/latest.log', absolutePath: latest, kind: 'text' },
    { name: 'logs/daemon/previous.log', absolutePath: previous, kind: 'text' },
  ]);
  expect(current).not.toHaveProperty('omitReason');
  expect(current).not.toHaveProperty('startOffset');
  // The rotated file keeps its identity, so only bytes after the boundary are read.
  expect(rotated).toMatchObject({ startOffset: 'written before consent\n'.length });
  expect(rotated).not.toHaveProperty('omitReason');
  const restarted = new DiagnosticConsentFence(dir, true);
  const [retained] = await restarted.apply([{ name: 'logs/daemon/previous.log', absolutePath: previous, kind: 'text' }]);
  expect(retained).toMatchObject({ startOffset: 'written before consent\n'.length });
  expect(retained).not.toHaveProperty('omitReason');
});

it.each([0, -1])('keeps omitting an unrelated pre-consent file with birth-time delta %i', async (delta) => {
  const latest = join(dir, 'latest.log'); const other = join(dir, 'other.log');
  const fence = await optedIn(latest);
  await writeFile(other, 'older private text\n');
  identities.set(other, { ino: 3, birthtimeMs: identities.get(latest)!.birthtimeMs + delta });
  const [result] = await fence.apply([{ name: 'logs/other.log', absolutePath: other, kind: 'text' }]);
  expect(result).toMatchObject({ omitReason: 'pre_consent_source' });
});

it.each([false, true])('recognizes an admitted identity after restart and rotation (previous first: %s)', async (previousFirst) => {
  const latest = join(dir, 'latest.log'); const previous = join(dir, 'previous.log');
  const fence = await optedIn(latest);
  const inherited = identities.get(latest)!.birthtimeMs;
  const source = { name: 'logs/daemon/latest.log', absolutePath: latest, kind: 'text' as const };
  const rotatedSource = { name: 'logs/daemon/previous.log', absolutePath: previous, kind: 'text' as const };
  await writeFile(latest, 'first consented session\n');
  identities.set(latest, { ino: 2, birthtimeMs: inherited });
  await fence.apply([source]);
  await writeFile(previous, 'first consented session\n');
  identities.set(previous, { ino: 2, birthtimeMs: inherited });
  await writeFile(latest, 'second consented session\n');
  identities.set(latest, { ino: 3, birthtimeMs: inherited });
  const restarted = new DiagnosticConsentFence(dir, true);
  const results = await restarted.apply(previousFirst ? [rotatedSource, source] : [source, rotatedSource]);
  for (const result of results) {
    expect(result).not.toHaveProperty('omitReason');
    expect(result.startOffset ?? 0).toBe(0);
  }
  // The rotated identity remains recognized on a subsequent restart.
  const rotatedOnly = new DiagnosticConsentFence(dir, true);
  expect((await rotatedOnly.apply([rotatedSource]))[0]).toMatchObject({ startOffset: 0 });
  rotatedOnly.change(false);
  rotatedOnly.change(true);
  expect((await rotatedOnly.apply([rotatedSource]))[0]).toMatchObject({ omitReason: 'pre_consent_source' });
  await rotatedOnly.baseline([rotatedSource]);
  const [rebased] = await rotatedOnly.apply([rotatedSource]);
  expect(rebased).toMatchObject({ startOffset: 'first consented session\n'.length });
});

it('keeps a session log admitted after rotation even when that session had no incident', async () => {
  const latest = join(dir, 'latest.log'); const previous = join(dir, 'previous.log');
  await optedIn(latest);
  const inherited = identities.get(latest)!.birthtimeMs;
  const sources = [
    { name: 'logs/daemon/latest.log', absolutePath: latest, kind: 'text' as const },
    { name: 'logs/daemon/previous.log', absolutePath: previous, kind: 'text' as const },
  ];
  // Launch 2: rotation, then the daemon starts and observes its logs; no incident follows.
  await writeFile(previous, 'written before consent\n'); identities.set(previous, { ino: 1, birthtimeMs: inherited });
  await writeFile(latest, 'second session\n'); identities.set(latest, { ino: 2, birthtimeMs: inherited });
  await new DiagnosticConsentFence(dir, true).observe(sources);
  // Launch 3 (e.g. after a crash): the second session's log is now previous.log.
  await writeFile(previous, 'second session\n'); identities.set(previous, { ino: 2, birthtimeMs: inherited });
  await writeFile(latest, 'third session\n'); identities.set(latest, { ino: 3, birthtimeMs: inherited });
  const relaunched = new DiagnosticConsentFence(dir, true);
  await relaunched.observe(sources);
  const [current, rotated] = await relaunched.apply(sources);
  expect(current).not.toHaveProperty('omitReason');
  expect(rotated).not.toHaveProperty('omitReason');
  expect(rotated?.startOffset ?? 0).toBe(0);
});

it('reports a missing source as not found rather than as pre-consent', async () => {
  const fence = await optedIn(join(dir, 'latest.log'));
  const [result] = await fence.apply([{ name: 'logs/desktop/renderer.log', absolutePath: join(dir, 'renderer.log'), kind: 'text' }]);
  expect(result).toMatchObject({ omitReason: 'source_not_found' });
});
