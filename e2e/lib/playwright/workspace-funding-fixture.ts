import { createHash } from 'node:crypto';
import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute } from 'node:path';

export type FundingSpace = {
  workspaceId: string;
  ownerMemberId: string;
  runtimeKey: string;
  workspaceKind?: 'team' | 'personal';
  /** Version2 keeps the actual owner distinct from this logged-in actor. */
  actorMemberId?: string;
  actorRole?: 'owner' | 'admin' | 'member';
};

export type FundingFixture = {
  version: 1 | 2;
  isolation: {
    runId: string;
    expiresAt: string;
    workspaceNamePrefix: string;
    exclusive: true;
  };
  upstream: { apiUrl: string; linkUrl: string; webUrl: string; amrSha: string };
  owner: {
    sourceRoot: string;
    sandboxName: string;
    ownerEnvPath: string;
    runtimeReceiptPath: string;
    helperSha256: string;
    canonicalToolsOverlay?: { sourceSha: string; files: Array<{ path: string; sha256: string }> };
  };
  runtime: {
    velaBin: string;
    velaSha256: string;
    openCodeBin: string;
    openCodeSha256: string;
    modelId: string;
  };
  actor: { controlKey: string; userId: string; email: string };
  spaces: { funded: FundingSpace; empty: FundingSpace; dp: FundingSpace };
  /** WS-005 keeps both real tasks bound to their original workspace. */
  scopeSwitch?: {
    attemptId: string;
    /** One real account DeviceAuthorization credential for the whole A/B flow. */
    deviceRuntimeKey: string;
    spaces: { a: FundingSpace & { workspaceName: string }; b: FundingSpace & { workspaceName: string } };
    proofPath: string;
    proofSha256: string;
    provider: { baseUrl: string; statePath: string; sourcePath: string; sourceSha256: string;
      sourceCommit: string; sourceRepoPath: string; pid: number };
    usage: Record<'a' | 'b', Array<{ kind: 'main' | 'aux'; modelId: string;
      tokens: Record<string, number>; expectedCredits: string }>>;
  };
  /** VIEW-021 uses actual default personal spaces and their separate Owners. */
  freeWallet?: {
    retained: FreeWalletGiven;
    giftOnly: FreeWalletGiven;
    proofPath: string;
    proofSha256: string;
    consoleUi: { phase1Enabled: boolean; proofPath: string; proofSha256: string };
    expiry: { mode?: 'controlled_age' | 'natural_wait'; helperPath: string; helperSha256: string; helperSourceSha: string; helperRepoPath: string };
  };
  /** VIEW-020's actual long Owner profile, verified by the environment owner. */
  noticeLayout?: { ownerUserId: string; ownerDisplayName: string;
    ownerProfileProofPath: string; ownerProfileProofSha256: string };
  /** Explicit server-owned capacity coordinator for the manual Link lane. */
  concurrency?: {
    space: FundingSpace & { actorRole: 'owner'; actorMemberId: string };
    member: { memberId: string; runtimeKey: string };
    holdModelId: string;
    coordinator: { helperPath: string; helperSha256: string; helperSourceSha: string; helperRepoPath: string };
    serverControl: {
      providerBaseUrl: string; providerStatePath: string; providerSourcePath: string;
      providerSourceSha256: string; controlTokenPath: string;
      redisContainer: string; redisKeyPrefix: string;
    };
  };
};

export type FundingRuntimeFixture = Pick<FundingFixture, 'version' | 'isolation' | 'upstream' | 'owner' | 'runtime' | 'actor'>;

export type FreeWalletGiven = {
  actor: FundingFixture['actor'];
  space: FundingSpace & { workspaceName: string; workspaceKind: 'personal'; actorRole: 'owner'; actorMemberId: string };
  beforeBalanceUsd: '40.30' | '0.30';
  afterBalanceUsd: '40.00' | '0.00';
  consoleCookiesPath: string;
  consoleCookiesSha256: string;
};

function requireValue(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Sandbox fixture requires ${label}`);
  }
}

export function validateFundingRuntimeFixture(value: unknown, expectedRunId: string): FundingRuntimeFixture {
  const fixture = value as FundingRuntimeFixture | undefined;
  if (![1, 2].includes(fixture?.version ?? 0) || fixture?.isolation?.exclusive !== true) {
    throw new Error('Requires version 1 or 2 exclusively leased disposable sandbox fixture');
  }
  requireValue(expectedRunId, 'OD_FUNDING_RUN_ID');
  if (fixture.isolation.runId !== expectedRunId) throw new Error('Sandbox run ID mismatch');
  if (!Number.isFinite(Date.parse(fixture.isolation.expiresAt))
    || Date.parse(fixture.isolation.expiresAt) <= Date.now()) {
    throw new Error('Sandbox lease has expired');
  }
  requireValue(fixture.isolation.workspaceNamePrefix, 'isolation.workspaceNamePrefix');
  if (fixture.isolation.workspaceNamePrefix.length < 8) throw new Error('Sandbox workspace prefix is too broad');
  for (const field of ['apiUrl', 'linkUrl', 'webUrl'] as const) {
    requireValue(fixture.upstream?.[field], `upstream.${field}`);
    const url = new URL(fixture.upstream[field]);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error(`upstream.${field} must be a credential-free loopback HTTP origin`);
    }
  }
  if (!/^[a-f0-9]{40}$/.test(fixture.upstream.amrSha)) throw new Error('Requires complete AMR source SHA');
  for (const key of ['sourceRoot', 'ownerEnvPath', 'runtimeReceiptPath'] as const) {
    requireValue(fixture.owner?.[key], `owner.${key}`);
    if (!isAbsolute(fixture.owner[key])) throw new Error(`owner.${key} must be absolute`);
  }
  requireValue(fixture.owner?.sandboxName, 'owner.sandboxName');
  if (!/^[a-f0-9]{64}$/.test(fixture.owner.helperSha256)) throw new Error('Requires canonical owner helper SHA256');
  for (const key of ['controlKey', 'userId', 'email'] as const) requireValue(fixture.actor?.[key], `actor.${key}`);
  requireValue(fixture.runtime?.modelId, 'runtime.modelId');
  for (const key of ['vela', 'openCode'] as const) {
    requireValue(fixture.runtime[`${key}Bin`], `runtime.${key}Bin`);
    if (!isAbsolute(fixture.runtime[`${key}Bin`]) || !/^[a-f0-9]{64}$/.test(fixture.runtime[`${key}Sha256`])) {
      throw new Error(`Requires explicit absolute ${key} binary and SHA256`);
    }
  }
  return fixture;
}

export function validateFundingFixture(value: unknown, expectedRunId: string): FundingFixture {
  validateFundingRuntimeFixture(value, expectedRunId);
  const fixture = value as FundingFixture;
  for (const alias of ['funded', 'empty', 'dp'] as const) {
    for (const key of ['workspaceId', 'ownerMemberId', 'runtimeKey'] as const) {
      requireValue(fixture.spaces?.[alias]?.[key], `spaces.${alias}.${key}`);
    }
    const space = fixture.spaces[alias];
    if (space.workspaceKind !== undefined && !['team', 'personal'].includes(space.workspaceKind)) throw new Error('Explicit workspace kind must be team or personal');
    if (fixture.version === 2) {
      requireValue(space.actorMemberId, `spaces.${alias}.actorMemberId`);
      if (!['owner', 'admin', 'member'].includes(space.actorRole ?? '')) throw new Error('Version2 requires an explicit actor role');
      if ((space.actorRole === 'owner') !== (space.actorMemberId === space.ownerMemberId)) {
        throw new Error('Actual owner and actor membership/role must agree');
      }
    } else if (space.actorMemberId !== undefined || space.actorRole !== undefined) {
      throw new Error('Role-aware fixtures require version2; legacy version1 is Owner-only');
    }
  }
  if (new Set(Object.values(fixture.spaces).map(s => s.workspaceId)).size !== 3
    || new Set(Object.values(fixture.spaces).map(s => s.runtimeKey)).size !== 3) {
    throw new Error('funded/empty/dp require three distinct workspaces and scoped runtime keys');
  }
  return fixture;
}

export async function readFundingRuntimeFixture(): Promise<FundingRuntimeFixture> {
  const path = process.env.OD_FUNDING_FIXTURE;
  if (!path || !isAbsolute(path)) throw new Error('OD_FUNDING_FIXTURE must be an explicit absolute private fixture path');
  const info = await stat(path);
  if (process.platform !== 'win32' && (info.mode & 0o077) !== 0) throw new Error('Fixture must be private (0600)');
  const fixture = validateFundingRuntimeFixture(JSON.parse(await readFile(path, 'utf8')), process.env.OD_FUNDING_RUN_ID ?? '');
  for (const key of ['vela', 'openCode'] as const) {
    const binary = fixture.runtime[`${key}Bin`];
    await access(binary, constants.X_OK);
    const hash = createHash('sha256').update(await readFile(binary)).digest('hex');
    if (hash !== fixture.runtime[`${key}Sha256`]) throw new Error(`${key} executable hash mismatch`);
  }
  return fixture;
}

export async function readFundingFixture(): Promise<FundingFixture> {
  return validateFundingFixture(await readFundingRuntimeFixture(), process.env.OD_FUNDING_RUN_ID ?? '');
}

export function fundingHeaders(space: FundingSpace): Record<string, string> {
  return {
    'x-od-workspace-id': space.workspaceId,
    'x-od-workspace-member-id': space.actorMemberId ?? space.ownerMemberId,
    'x-od-workspace-role': space.actorRole ?? 'owner',
    'x-od-workspace-type': space.workspaceKind ?? 'team',
    'x-od-workspace-lifecycle-state': 'active',
    'x-od-workspace-member-status': 'active',
  };
}

export function requireDpModelCoverage(modelCovered: unknown): void {
  if (modelCovered !== true) throw new Error('Chosen model must actually be covered by the available Design Plan');
}
