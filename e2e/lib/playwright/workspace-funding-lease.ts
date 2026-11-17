import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { FundingFixture } from './workspace-funding-fixture.ts';
import { T } from '../timeouts.ts';

const exec = promisify(execFile);
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const canonicalToolsSha = '3dfcdc6fb4f940f2955cfa4835315d4ee9f83c82';
const canonicalToolPaths = ['sandbox/cli.py', 'sandbox/app/docker-compose.yml'] as const;

/** Only the explicitly reviewed canonical seats-UI opt-in tools may differ
 * from the fixed product HEAD. No general allowDirty or product exception. */
export function assertCanonicalToolsOverlay(
  overlay: NonNullable<FundingFixture['owner']['canonicalToolsOverlay']>, changedPaths: string[],
  observed: Array<{ path: string; rawSha256: string; gitBlobSha256: string }>,
) {
  const paths = [...canonicalToolPaths].sort();
  if (overlay.sourceSha !== canonicalToolsSha || overlay.files.length !== 2
    || JSON.stringify(overlay.files.map(f => f.path).sort()) !== JSON.stringify(paths)
    || JSON.stringify([...changedPaths].sort()) !== JSON.stringify(paths)
    || observed.length !== 2 || JSON.stringify(observed.map(f => f.path).sort()) !== JSON.stringify(paths)) {
    throw new Error('Only the reviewed exact two-file canonical tools overlay is permitted');
  }
  for (const expected of overlay.files) {
    const actual = observed.find(file => file.path === expected.path)!;
    if (!/^[a-f0-9]{64}$/.test(expected.sha256) || expected.sha256 !== actual.rawSha256
      || expected.sha256 !== actual.gitBlobSha256) throw new Error('Canonical tool overlay differs from committed/raw expected bytes');
  }
}

const ownerKeys = ['E2E_DATABASE_URL', 'VELA_E2E_OWNER_TOKEN', 'VELA_E2E_OWNER_LABEL',
  'VELA_E2E_OWNER_KEY', 'VELA_SANDBOX_NAME'] as const;
type FundingLeaseTarget = Pick<FundingFixture, 'owner' | 'upstream'>;

export type FundingRuntimeReceipt = {
  name: string; database: string; targetKey: string; sourceRoot: string; amrSha: string;
  urls: { api: string; link: string; web: string };
  redisDb: number; guardianPid: number; deadlineUtc: string;
  helperPath: string; helperSha256: string;
};

export type CanonicalFundingStatus = {
  name: string; database: string; sourceRoot: string;
  urls: { api: string; link: string; web: string };
  redisDb: number; state: string;
};

export function assertFundingLeaseIdentity(
  fixture: FundingLeaseTarget, receipt: FundingRuntimeReceipt, status: CanonicalFundingStatus,
  ownerEnv: Record<string, string>, actualHead: string, reserveMs: number,
) {
  const equal = (actual: unknown, expected: unknown, field: string) => {
    if (actual !== expected) throw new Error(`Canonical funding sandbox identity mismatch: ${field}`);
  };
  for (const key of ownerKeys) if (typeof ownerEnv[key] !== 'string' || !ownerEnv[key]!.trim()) {
    throw new Error(`Missing inherited owner capability field: ${key}`);
  }
  for (const key of Object.keys(ownerEnv)) if (!(ownerKeys as readonly string[]).includes(key)) {
    throw new Error('Owner capability file contains unexpected environment fields');
  }
  equal(status.state, 'running', 'live state');
  equal(status.name, fixture.owner.sandboxName, 'canonical named identity');
  equal(receipt.name, status.name, 'receipt name');
  equal(ownerEnv.VELA_SANDBOX_NAME, status.name, 'inherited name');
  equal(status.sourceRoot, fixture.owner.sourceRoot, 'canonical source root');
  equal(receipt.sourceRoot, status.sourceRoot, 'receipt source root');
  equal(actualHead.trim(), fixture.upstream.amrSha, 'live source HEAD');
  equal(receipt.amrSha, actualHead.trim(), 'receipt source SHA');
  equal(receipt.helperPath, join(fixture.owner.sourceRoot, 'e2e/helper/e2e_ownership.py'), 'receipt helper path');
  equal(receipt.helperSha256, fixture.owner.helperSha256, 'receipt helper hash');
  equal(receipt.database, status.database, 'canonical database');
  equal(decodeURIComponent(new URL(ownerEnv.E2E_DATABASE_URL!).pathname.slice(1)), status.database, 'inherited database target');
  equal(receipt.targetKey, ownerEnv.VELA_E2E_OWNER_KEY, 'target digest');
  if (!/^[a-f0-9]{64}$/.test(receipt.targetKey)) throw new Error('Canonical target digest must be SHA256');
  equal(receipt.redisDb, status.redisDb, 'Redis database');
  for (const [field, expected] of Object.entries({ api: fixture.upstream.apiUrl, link: fixture.upstream.linkUrl, web: fixture.upstream.webUrl })) {
    equal(status.urls[field as keyof typeof status.urls], expected, `canonical ${field} endpoint`);
    equal(receipt.urls[field as keyof typeof receipt.urls], expected, `receipt ${field} endpoint`);
  }
  if (!Number.isInteger(receipt.guardianPid) || receipt.guardianPid <= 0) throw new Error('Missing guardian identity');
  if (!Number.isFinite(Date.parse(receipt.deadlineUtc)) || Date.parse(receipt.deadlineUtc) - Date.now() < reserveMs) {
    throw new Error('Insufficient canonical guardian budget for this command and cleanup');
  }
}

async function privateJson<T>(path: string): Promise<T> {
  const mode = (await stat(path)).mode;
  if (process.platform !== 'win32' && (mode & 0o077) !== 0) throw new Error('Owner capability/receipt must be private (0600)');
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

/** Read-only borrowing of the server owner's live lock. Never acquire, start,
 * stop, or repair AMR here. Success requires the real canonical flock verifier. */
export async function verifyFundingLease(fixture: FundingLeaseTarget, reserveMs: number) {
  const root = fixture.owner.sourceRoot;
  const env = await privateJson<Record<string, string>>(fixture.owner.ownerEnvPath);
  const receipt = await privateJson<FundingRuntimeReceipt>(fixture.owner.runtimeReceiptPath);
  const helper = join(root, 'e2e/helper/e2e_ownership.py');
  if (digest(await readFile(helper)) !== fixture.owner.helperSha256) throw new Error('Canonical owner helper hash mismatch');
  const options = { cwd: root, env: { ...process.env, ...env }, timeout: T.long, maxBuffer: 4 * 1024 * 1024 };
  const overlay = fixture.owner.canonicalToolsOverlay;
  if (overlay) {
    const changed = await exec('git', ['diff', '--name-only', 'HEAD', '--'], options);
    const observed = [];
    // Fixed repository paths/source, never a fixture-controlled filesystem read.
    for (const relative of canonicalToolPaths) {
      const original = await exec('git', ['show', `${canonicalToolsSha}:${relative}`], options);
      observed.push({ path: relative, rawSha256: digest(await readFile(join(root, relative))), gitBlobSha256: digest(original.stdout) });
    }
    assertCanonicalToolsOverlay(overlay, changed.stdout.trim().split('\n').filter(Boolean), observed);
    await exec('git', ['diff', '--quiet', 'HEAD', '--', '.', ':(exclude)sandbox/cli.py', ':(exclude)sandbox/app/docker-compose.yml'], options);
  } else await exec('git', ['diff', '--quiet', 'HEAD', '--'], options);
  // Do not trust only the declared helper hash or named manifest source root.
  // Verify both control-plane files against the exact live checkout's Git blob.
  for (const relative of ['e2e/helper/e2e_ownership.py', 'sandbox/cli.py']) {
    const source = overlay && relative === 'sandbox/cli.py' ? canonicalToolsSha : 'HEAD';
    const original = await exec('git', ['show', `${source}:${relative}`], options);
    if (digest(original.stdout) !== digest(await readFile(join(root, relative)))) throw new Error('Canonical control-plane source has uncommitted changes');
  }
  const head = await exec('git', ['rev-parse', 'HEAD'], options);
  const inspected = await exec('python3', [join(root, 'sandbox/cli.py'), 'status', fixture.owner.sandboxName, '--json'], options);
  const status = JSON.parse(inspected.stdout) as CanonicalFundingStatus;
  assertFundingLeaseIdentity(fixture, receipt, status, env, head.stdout, reserveMs);
  try { await exec('python3', [helper, 'verify-inherited'], options); }
  catch { throw new Error('Canonical live inherited ownership verification failed; do not count this run as passed'); }
  const verifiedAt = new Date().toISOString();
  return {
    env,
    safe: { verifiedAt, exitCode: 0, name: receipt.name, database: receipt.database,
      targetKey: receipt.targetKey, sourceRoot: root, amrSha: head.stdout.trim(),
      urls: receipt.urls, redisDb: receipt.redisDb, guardianPid: receipt.guardianPid,
      deadlineUtc: receipt.deadlineUtc, helperSha256: fixture.owner.helperSha256,
      ...(overlay ? { canonicalToolsOverlay: overlay } : {}) },
  };
}

/** Testable pre/post ordering: a failed precheck cannot spawn the child; a
 * failed postcheck rejects even when the browser command returned exit 0. */
export async function withFundingLease<T>(
  verify: (phase: 'pre' | 'post') => Promise<void>, command: () => Promise<T>,
): Promise<T> {
  await verify('pre');
  try { return await command(); }
  finally { await verify('post'); }
}
