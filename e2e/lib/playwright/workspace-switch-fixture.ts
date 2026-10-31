import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';

import type { FundingFixture } from './workspace-funding-fixture.ts';
import { T } from '../timeouts.ts';

export type WorkspaceSwitchProof = {
  amrSha: string;
  actorUserId: string;
  deviceAuth: {
    runtimeKeySource: 'cli_device'; userId: string; authorizationId: string; status: 'approved';
    runtimeKeySha256: string; controlKeySha256: string;
    memberships: Record<'a' | 'b', { workspaceId: string; workspaceMemberId: string; status: 'active' }>;
  };
  spaces: Record<'a' | 'b', { workspaceId: string; workspaceMemberId: string;
    balanceCredits: string; availableBalanceUsd: string }>;
};

export function assertWorkspaceSwitchProof(fixture: FundingFixture, proof: WorkspaceSwitchProof) {
  const given = fixture.scopeSwitch;
  if (!given || proof.amrSha !== fixture.upstream.amrSha || proof.actorUserId !== fixture.actor.userId
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(given.attemptId)) {
    throw new Error('Same-source WS-005 actor and fresh attempt required');
  }
  const auth = proof.deviceAuth;
  const keyHash = (value: string) => createHash('sha256').update(value).digest('hex');
  if (!given.deviceRuntimeKey || !auth || auth.runtimeKeySource !== 'cli_device'
    || auth.userId !== fixture.actor.userId || !auth.authorizationId || auth.status !== 'approved'
    || auth.runtimeKeySha256 !== keyHash(given.deviceRuntimeKey)
    || auth.controlKeySha256 !== keyHash(fixture.actor.controlKey)) {
    throw new Error('Real same-account DeviceAuthorization runtime/control credential proof required');
  }
  for (const alias of ['a', 'b'] as const) {
    const space = given.spaces[alias];
    const actual = proof.spaces[alias];
    const before = alias === 'a' ? 10 : 20;
    const charges = given.usage[alias];
    if (!space.workspaceId || !space.runtimeKey || !space.ownerMemberId || !space.workspaceName
      || actual.workspaceId !== space.workspaceId
      || actual.workspaceMemberId !== (space.actorMemberId ?? space.ownerMemberId)
      || auth.memberships?.[alias]?.workspaceId !== space.workspaceId
      || auth.memberships[alias].workspaceMemberId !== actual.workspaceMemberId
      || auth.memberships[alias].status !== 'active'
      || actual.balanceCredits !== String(before * 10_000) || Number(actual.availableBalanceUsd) !== before
      || !charges.length || !charges.some(row => row.kind === 'main')
      || charges.some(row => !['main', 'aux'].includes(row.kind) || !row.modelId
        || !/^\d+$/.test(row.expectedCredits)
        || !Object.keys(row.tokens).length
        || Object.values(row.tokens).some(value => !Number.isSafeInteger(value) || value < 0))
      || charges.reduce((sum, row) => sum + BigInt(row.expectedCredits), 0n) !== BigInt(alias === 'a' ? 20_000 : 30_000)) {
      throw new Error(`Original WS-005 ${alias} scope, starting funds or complete usage budget differs`);
    }
  }
  if (given.spaces.a.workspaceId === given.spaces.b.workspaceId) throw new Error('Distinct WS-005 workspaces required');
}

export async function readWorkspaceSwitchProof(fixture: FundingFixture) {
  const given = fixture.scopeSwitch;
  if (!given || !isAbsolute(given.proofPath) || !/^[a-f0-9]{64}$/.test(given.proofSha256)) {
    throw new Error('Explicit private original WS-005 balance proof required');
  }
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const info = await stat(given.proofPath);
  if (!info.isFile() || (info.mode & 0o077) !== 0) throw new Error('WS-005 proof must be private');
  const bytes = await readFile(given.proofPath);
  if (hash(bytes) !== given.proofSha256) throw new Error('WS-005 proof digest mismatch');
  const proof = JSON.parse(bytes.toString('utf8')) as WorkspaceSwitchProof;
  assertWorkspaceSwitchProof(fixture, proof);
  const provider = given.provider;
  const origin = new URL(provider.baseUrl);
  if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
    || !Number.isSafeInteger(provider.pid) || provider.pid <= 0 || !isAbsolute(provider.sourcePath)
    || !isAbsolute(provider.statePath) || !/^[a-f0-9]{64}$/.test(provider.sourceSha256)
    || !/^[a-f0-9]{40}$/.test(provider.sourceCommit) || isAbsolute(provider.sourceRepoPath)
    || provider.sourceRepoPath.split('/').includes('..')
    || !['e2e/', 'services/api/test/e2e/'].some(prefix => provider.sourceRepoPath.startsWith(prefix))) {
    throw new Error('Explicit repository-owned loopback WS-005 provider required');
  }
  const source = await readFile(provider.sourcePath);
  const committed = await promisify(execFile)('git', ['show', `${provider.sourceCommit}:${provider.sourceRepoPath}`], {
    cwd: fixture.owner.sourceRoot, timeout: T.long, encoding: 'buffer', maxBuffer: 1024 * 1024,
  });
  if (hash(source) !== provider.sourceSha256 || !source.equals(committed.stdout)) throw new Error('WS-005 provider source differs from committed bytes');
  return proof;
}
