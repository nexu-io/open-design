import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';

import { readFundingFixture, type FundingFixture } from './workspace-funding-fixture.ts';
import { T } from '../timeouts.ts';

export type ConcurrencyBinding = {
  protocol: 'od-link-concurrency-v1';
  runId: string;
  attemptId: string;
  tag: string;
  workspaceId: string;
  surface: 'home' | 'project';
  fixtureSha256: string;
};

export function requireConcurrencyFixture(fixture: Pick<FundingFixture, 'concurrency'>) {
  const c = fixture.concurrency;
  if (!c) throw new Error('Explicit server-owned concurrency fixture required');
  if (!c.space.workspaceId || !c.space.ownerMemberId || !c.space.runtimeKey
    || c.space.actorRole !== 'owner' || c.space.actorMemberId !== c.space.ownerMemberId) {
    throw new Error('Concurrency lane requires the exact logged-in Owner principal');
  }
  if (!c.member.memberId || !c.member.runtimeKey
    || c.member.memberId === c.space.ownerMemberId || c.member.runtimeKey === c.space.runtimeKey) {
    throw new Error('Concurrency hold requires a distinct actual Member and scoped key');
  }
  if (!c.holdModelId || !isAbsolute(c.coordinator.helperPath)
    || !/^[a-f0-9]{64}$/.test(c.coordinator.helperSha256)
    || !/^[a-f0-9]{40}$/.test(c.coordinator.helperSourceSha)
    || !c.coordinator.helperRepoPath || isAbsolute(c.coordinator.helperRepoPath)
    || c.coordinator.helperRepoPath.split(/[\\/]/).includes('..')) {
    throw new Error('Requires an explicit immutable repository coordinator source');
  }
  const control = c.serverControl;
  if (!control || !control.redisContainer || !control.redisKeyPrefix
    || !/^[a-f0-9]{64}$/.test(control.providerSourceSha256)) throw new Error('Explicit server control capability required');
  const origin = new URL(control.providerBaseUrl);
  if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
    || !origin.port || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Provider control must be a credential-free loopback origin');
  }
  if (![control.providerStatePath, control.providerSourcePath, control.controlTokenPath].every(path => typeof path === 'string' && isAbsolute(path))) {
    throw new Error('Explicit private server capability file paths required');
  }
  return c;
}

export function assertConcurrencyBinding(value: unknown, binding: ConcurrencyBinding): void {
  if (!value || typeof value !== 'object') throw new Error('Missing bound concurrency receipt');
  const row = value as Record<string, unknown>;
  for (const key of Object.keys(binding) as (keyof ConcurrencyBinding)[]) {
    if (row[key] !== binding[key]) throw new Error(`Concurrency receipt binding mismatch: ${key}`);
  }
}

export function assertConcurrencyReceipt(
  marker: Record<string, unknown>, binding: ConcurrencyBinding, bytes: Buffer, phase: 'held' | 'one-released' | 'released',
) {
  assertConcurrencyBinding(marker, binding);
  const expectedName = `server-${phase}-receipt.safe.json`;
  if (marker.receiptPath !== expectedName
    || createHash('sha256').update(bytes).digest('hex') !== marker.receiptSha256) {
    throw new Error('Coordinator receipt path or content digest mismatch');
  }
  const receipt = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
  assertConcurrencyBinding(receipt, binding);
  if (phase === 'held' && (marker.ready !== true || marker.count !== 10 || receipt.heldCount !== 10)) {
    throw new Error('Actual 10 held requests required');
  }
  if (phase === 'released' && (marker.released !== true || marker.remaining !== 0 || receipt.remaining !== 0)) {
    throw new Error('Actual zero remaining requests required');
  }
  if (phase === 'one-released') {
    const held = Array.from({ length: 9 }, (_, index) => `${binding.tag}-${index + 1}`);
    if (marker.released !== true || marker.remaining !== 9 || receipt.remaining !== 9
      || receipt.releasedCount !== 1 || JSON.stringify(receipt.releasedRequestIds) !== JSON.stringify([`${binding.tag}-0`])
      || JSON.stringify(receipt.heldRequestIds) !== JSON.stringify(held)) {
      throw new Error('Exactly one completed request and nine held requests required');
    }
  }
}

export async function readConcurrencyFixture() {
  const fixture = await readFundingFixture();
  const c = requireConcurrencyFixture(fixture);
  const helper = await stat(c.coordinator.helperPath);
  if (!helper.isFile() || (process.platform !== 'win32' && (helper.mode & 0o022) !== 0)) {
    throw new Error('Coordinator must be a regular file without group/world write access');
  }
  const bytes = await readFile(c.coordinator.helperPath);
  const hash = (input: string | Buffer) => createHash('sha256').update(input).digest('hex');
  if (hash(bytes) !== c.coordinator.helperSha256) throw new Error('Coordinator source hash mismatch');
  const original = await promisify(execFile)('git', ['show', `${c.coordinator.helperSourceSha}:${c.coordinator.helperRepoPath}`],
    { cwd: fixture.owner.sourceRoot, timeout: T.long, maxBuffer: 4 * 1024 * 1024 });
  if (hash(original.stdout) !== hash(bytes)) throw new Error('Coordinator differs from its repository source');
  return fixture;
}
