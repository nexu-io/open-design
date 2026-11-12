import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { readFundingRuntimeFixture, type FundingRuntimeFixture, type FundingFixture, type FundingSpace } from './workspace-funding-fixture.ts';
import { requireConcurrencyFixture } from './workspace-concurrency-fixture.ts';
import { T } from '../timeouts.ts';

type Source = { helperPath: string; helperSha256: string; helperSourceSha: string; helperRepoPath: string };
export type FreeConcurrencyFixture = FundingRuntimeFixture & Pick<FundingFixture, 'concurrency'> & {
  freeConcurrency: {
    caseKey: 'client:RUN-013-CLIENT'; limit: 3; attemptId: string;
    spaces: { w1: FundingSpace; w2: FundingSpace };
    observer: { actor: FundingFixture['actor']; space: FundingSpace; runtimeKey: string };
    ownerRuntimeKey: string; givenDirectory: string;
    coordinator: Source; fixtureHelper: Source;
    authoritativePolicy: { path: string; sha256: string };
    identityProofs: Array<{ path: string; sha256: string }>;
    manualRetry?: { caseKey: 'server:RUN-002'; coordinator: Source };
  };
};
export function validateFreeConcurrencyFixture(fixture: FreeConcurrencyFixture) {
  requireConcurrencyFixture(fixture);
  const f = fixture.freeConcurrency;
  if (f?.caseKey !== 'client:RUN-013-CLIENT' || f.limit !== 3 || !/^[a-f0-9-]{36}$/.test(f.attemptId)) throw new Error('Explicit original Free3 QA case and fresh attempt required');
  if (f.spaces.w1.workspaceId === f.spaces.w2.workspaceId || f.spaces.w1.actorRole !== 'owner'
    || f.spaces.w2.actorRole !== 'owner' || f.ownerRuntimeKey !== f.spaces.w1.runtimeKey || f.ownerRuntimeKey !== f.spaces.w2.runtimeKey
    || f.observer.actor.userId === fixture.actor.userId || f.observer.space.actorRole !== 'member'
    || f.observer.space.workspaceId !== f.spaces.w1.workspaceId || f.observer.runtimeKey === f.ownerRuntimeKey
    || f.observer.space.actorMemberId === f.spaces.w1.ownerMemberId) throw new Error('Actual Owner W1/W2 and independent real Member Observer required');
  if (!isAbsolute(f.givenDirectory) || !f.identityProofs.length || f.authoritativePolicy.sha256 !== 'c115ac299e9e63aa4dc2f528997ec87bac8fd9fbd6fb0454d3b9e50d61741b56') throw new Error('Original production Free limit provenance and real identities required');
  if (f.manualRetry && f.manualRetry.caseKey !== 'server:RUN-002') throw new Error('Explicit RUN002 mapping required');
}
export async function readFreeConcurrencyFixture(): Promise<FreeConcurrencyFixture> {
  const fixture = await readFundingRuntimeFixture() as FreeConcurrencyFixture;
  validateFreeConcurrencyFixture(fixture);
  const f = fixture.freeConcurrency;
  const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
  for (const source of [fixture.concurrency!.coordinator, f.coordinator, f.fixtureHelper, ...(f.manualRetry ? [f.manualRetry.coordinator] : [])]) {
    if (!isAbsolute(source.helperPath) || !/^[a-f0-9]{40}$/.test(source.helperSourceSha) || isAbsolute(source.helperRepoPath) || source.helperRepoPath.split('/').includes('..')) throw new Error('Immutable repository helper required');
    const raw = await readFile(source.helperPath);
    const original = await promisify(execFile)('git', ['show', `${source.helperSourceSha}:${source.helperRepoPath}`], { cwd: fixture.owner.sourceRoot, timeout: T.long });
    if (digest(raw) !== source.helperSha256 || digest(original.stdout) !== source.helperSha256) throw new Error('Actual/Git helper source differs');
  }
  for (const proof of [f.authoritativePolicy, ...f.identityProofs]) {
    if (!isAbsolute(proof.path) || ((await stat(proof.path)).mode & 0o077) !== 0 || digest(await readFile(proof.path)) !== proof.sha256) throw new Error('Private identity/policy proof digest mismatch');
  }
  return fixture;
}
