import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import type { FundingFixture } from './workspace-funding-fixture.ts';
import { T } from '../timeouts.ts';

export type FreeWalletProof = {
  amrSha: string;
  wallets: Record<'retained' | 'giftOnly', {
    workspaceId: string; ownerUserId: string; ownerMemberId: string; workspaceKind: 'personal';
    giftId: string; giftAmountCredits: string; giftRemainingCredits: string; giftExpiresAt: string;
    retainedCredits: string; availableBalanceUsd: string;
  }>;
};

export function assertFreeWalletProof(fixture: FundingFixture, proof: FreeWalletProof, phase: 'before' | 'after' = 'before') {
  const wallets = fixture.freeWallet;
  if (!wallets || proof.amrSha !== fixture.upstream.amrSha) throw new Error('Explicit same-source Free wallet proof required');
  for (const alias of ['retained', 'giftOnly'] as const) {
    const wallet = wallets[alias];
    const actual = proof.wallets?.[alias];
    const before = alias === 'retained' ? '40.30' : '0.30';
    const after = alias === 'retained' ? '40.00' : '0.00';
    if (!wallet || !actual || !wallet.actor?.controlKey || !wallet.actor.userId || !wallet.actor.email
      || !isAbsolute(wallet.consoleCookiesPath) || !/^[a-f0-9]{64}$/.test(wallet.consoleCookiesSha256)
      || !wallet.space?.workspaceName || !wallet.space.runtimeKey || wallet.space.workspaceKind !== 'personal' || wallet.space.actorRole !== 'owner'
      || !wallet.space.ownerMemberId || wallet.space.actorMemberId !== wallet.space.ownerMemberId
      || wallet.beforeBalanceUsd !== before || wallet.afterBalanceUsd !== after
      || actual.workspaceId !== wallet.space.workspaceId || actual.ownerUserId !== wallet.actor.userId
      || actual.ownerMemberId !== wallet.space.ownerMemberId || actual.workspaceKind !== 'personal'
      || !actual.giftId || actual.giftAmountCredits !== '5000' || actual.giftRemainingCredits !== '3000'
      || !Number.isFinite(Date.parse(actual.giftExpiresAt)) || (phase === 'before' && Date.parse(actual.giftExpiresAt) <= Date.now())
      || actual.retainedCredits !== (alias === 'retained' ? '400000' : '0') || actual.availableBalanceUsd !== before) {
      throw new Error(`Actual ${alias} personal Owner, original gift and retained funds differ from VIEW-021 Given`);
    }
  }
  if (wallets.retained.space.workspaceId === wallets.giftOnly.space.workspaceId
    || wallets.retained.actor.userId === wallets.giftOnly.actor.userId
    || wallets.retained.space.runtimeKey === wallets.giftOnly.space.runtimeKey
    || proof.wallets.retained.giftId === proof.wallets.giftOnly.giftId) {
    throw new Error('Two actual separate default personal Owners and original gift buckets required');
  }
}

export async function readFreeWalletProof(fixture: FundingFixture, phase: 'before' | 'after' = 'before') {
  const wallets = fixture.freeWallet;
  if (!wallets || !isAbsolute(wallets.proofPath) || !/^[a-f0-9]{64}$/.test(wallets.proofSha256)) {
    throw new Error('Explicit hashed private Free wallet proof required');
  }
  const info = await stat(wallets.proofPath);
  if (!info.isFile() || (info.mode & 0o077) !== 0) throw new Error('Free wallet proof must be private');
  const bytes = await readFile(wallets.proofPath);
  if (createHash('sha256').update(bytes).digest('hex') !== wallets.proofSha256) throw new Error('Free wallet proof digest mismatch');
  const proof = JSON.parse(bytes.toString('utf8')) as FreeWalletProof;
  assertFreeWalletProof(fixture, proof, phase);
  const consoleUi = wallets.consoleUi;
  if (!consoleUi || typeof consoleUi.phase1Enabled !== 'boolean' || !isAbsolute(consoleUi.proofPath)
    || !/^[a-f0-9]{64}$/.test(consoleUi.proofSha256)) throw new Error('Actual canonical console source/flag proof required');
  const helper = wallets.expiry;
  if (!helper || (helper.mode !== undefined && !['controlled_age', 'natural_wait'].includes(helper.mode)) || !isAbsolute(helper.helperPath) || !/^[a-f0-9]{64}$/.test(helper.helperSha256)
    || !/^[a-f0-9]{40}$/.test(helper.helperSourceSha) || isAbsolute(helper.helperRepoPath)
    || !['e2e/', 'services/api/test/e2e/'].some(prefix => helper.helperRepoPath.startsWith(prefix))
    || helper.helperRepoPath.split('/').includes('..')) {
    throw new Error('Explicit repository-owned expiry helper provenance required');
  }
  const source = await readFile(helper.helperPath);
  const git = await promisify(execFile)('git', ['show', `${helper.helperSourceSha}:${helper.helperRepoPath}`], {
    cwd: fixture.owner.sourceRoot, timeout: T.long, encoding: 'buffer', maxBuffer: 1024 * 1024,
  });
  const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
  if (hash(source) !== helper.helperSha256 || !source.equals(git.stdout)) throw new Error('Expiry helper differs from committed repository bytes');
  return proof;
}
