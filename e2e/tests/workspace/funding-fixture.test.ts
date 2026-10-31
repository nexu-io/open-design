import { describe, expect, it } from 'vitest';

import { validateFundingFixture, validateFundingRuntimeFixture, requireDpModelCoverage, fundingHeaders, type FundingFixture } from '@/playwright/workspace-funding-fixture';
import { assertFundingLeaseIdentity, withFundingLease } from '@/playwright/workspace-funding-lease';
import type { FundingRuntimeReceipt, CanonicalFundingStatus } from '@/playwright/workspace-funding-lease';

function disposableFixture(): FundingFixture {
  const space = (id: string) => ({ workspaceId: id, ownerMemberId: `${id}-owner`, runtimeKey: `test-only-${id}` });
  return {
    version: 1,
    isolation: { runId: 'unit-run', expiresAt: '2099-01-01T00:00:00.000Z', workspaceNamePrefix: 'unit-only-disposable-', exclusive: true },
    upstream: { apiUrl: 'http://127.0.0.1:10001', linkUrl: 'http://localhost:10002', webUrl: 'http://127.0.0.1:10003', amrSha: 'a'.repeat(40) },
    owner: { sourceRoot: '/explicit/amr', sandboxName: 'unit-named', ownerEnvPath: '/private/owner.json', runtimeReceiptPath: '/private/runtime.json', helperSha256: 'd'.repeat(64) },
    runtime: { velaBin: '/explicit/test-vela', velaSha256: 'b'.repeat(64), openCodeBin: '/explicit/test-opencode', openCodeSha256: 'c'.repeat(64), modelId: 'sandbox-model' },
    actor: { controlKey: 'unit-only-control', userId: 'unit-user', email: 'unit@example.invalid' },
    spaces: { funded: space('funded'), empty: space('empty'), dp: space('dp') },
  };
}

describe('explicit disposable funding sandbox guard', () => {
  it('accepts a matching loopback lease without consulting a host profile', () => {
    const fixture = disposableFixture();
    expect(validateFundingFixture(fixture, 'unit-run')).toBe(fixture);
  });

  it('shares canonical runtime guards without inventing legacy funding spaces for another QA case', () => {
    const { spaces: _legacySpaces, ...runtimeOnly } = disposableFixture();
    expect(validateFundingRuntimeFixture(runtimeOnly, 'unit-run')).toBe(runtimeOnly);
    expect(() => validateFundingFixture(runtimeOnly, 'unit-run')).toThrow('spaces.funded.workspaceId');
  });

  const roleFixture = () => {
    const f = disposableFixture();
    f.version = 2;
    for (const [alias, space] of Object.entries(f.spaces)) {
      space.actorRole = alias === 'funded' ? 'owner' : 'member';
      space.actorMemberId = alias === 'funded' ? space.ownerMemberId : `${space.workspaceId}-actual-member`;
    }
    return f;
  };

  it('keeps the real B owner distinct from the logged-in Member principal', () => {
    const f = roleFixture();
    expect(validateFundingFixture(f, 'unit-run')).toBe(f);
    expect(fundingHeaders(f.spaces.empty)['x-od-workspace-member-id']).toBe('empty-actual-member');
    expect(fundingHeaders(f.spaces.empty)['x-od-workspace-role']).toBe('member');
    expect(f.spaces.empty.ownerMemberId).toBe('empty-owner');
  });

  it.each(['missing-member', 'missing-role', 'false-owner', 'member-is-owner', 'legacy-downgrade'] as const)('rejects role-principal ambiguity: %s', field => {
    const f = roleFixture();
    if (field === 'missing-member') delete f.spaces.empty.actorMemberId;
    if (field === 'missing-role') delete f.spaces.empty.actorRole;
    if (field === 'false-owner') f.spaces.empty.actorRole = 'owner';
    if (field === 'member-is-owner') f.spaces.empty.actorMemberId = f.spaces.empty.ownerMemberId;
    if (field === 'legacy-downgrade') f.version = 1;
    expect(() => validateFundingFixture(f, 'unit-run')).toThrow();
  });

  it.each([
    ['external service', (f: FundingFixture) => { f.upstream.apiUrl = 'https://example.invalid'; }],
    ['embedded credentials', (f: FundingFixture) => { f.upstream.linkUrl = 'http://user:password@localhost:10002'; }],
    ['API URL masquerading as origin', (f: FundingFixture) => { f.upstream.apiUrl += '/api'; }],
    ['expired lease', (f: FundingFixture) => { f.isolation.expiresAt = '2000-01-01T00:00:00Z'; }],
    ['shared workspace', (f: FundingFixture) => { f.spaces.empty.workspaceId = f.spaces.funded.workspaceId; }],
    ['cross-workspace key reuse', (f: FundingFixture) => { f.spaces.dp.runtimeKey = f.spaces.funded.runtimeKey; }],
    ['ambient executable lookup', (f: FundingFixture) => { f.runtime.velaBin = 'vela'; }],
    ['missing live owner file', (f: FundingFixture) => { f.owner.ownerEnvPath = ''; }],
    ['unbound canonical helper', (f: FundingFixture) => { f.owner.helperSha256 = ''; }],
  ] as const)('rejects %s before runtime startup or writes', (_label, mutate) => {
    const fixture = disposableFixture();
    mutate(fixture);
    expect(() => validateFundingFixture(fixture, 'unit-run')).toThrow();
  });

  it('rejects another run ID even for a valid sandbox', () => {
    expect(() => validateFundingFixture(disposableFixture(), 'other-run')).toThrow('run ID mismatch');
  });

  it.each([false, null, undefined])('rejects uncovered/unspecified DP model (%s), even if pool windows are positive', covered => {
    expect(() => requireDpModelCoverage(covered)).toThrow('model must actually be covered');
  });

  it('permits covered DP without requiring advisory fundingCheck to stop being unknown', () => {
    const preflight = { modelCovered: true, fundingCheck: 'unknown' };
    expect(() => requireDpModelCoverage(preflight.modelCovered)).not.toThrow();
    expect(preflight.fundingCheck).toBe('unknown');
  });
});

function liveIdentity() {
  const fixture = disposableFixture();
  const env = { E2E_DATABASE_URL: 'postgres://unit:unit@localhost:15432/unit_named',
    VELA_E2E_OWNER_TOKEN: 'unit-only-not-live', VELA_E2E_OWNER_LABEL: 'unit',
    VELA_E2E_OWNER_KEY: 'e'.repeat(64), VELA_SANDBOX_NAME: 'unit-named' };
  const receipt: FundingRuntimeReceipt = { name: 'unit-named', database: 'unit_named',
    targetKey: env.VELA_E2E_OWNER_KEY, sourceRoot: fixture.owner.sourceRoot,
    amrSha: fixture.upstream.amrSha, urls: { api: fixture.upstream.apiUrl, link: fixture.upstream.linkUrl, web: fixture.upstream.webUrl },
    redisDb: 5, guardianPid: 123, deadlineUtc: '2099-01-01T00:00:00Z',
    helperPath: '/explicit/amr/e2e/helper/e2e_ownership.py', helperSha256: fixture.owner.helperSha256 };
  const status: CanonicalFundingStatus = { ...receipt, state: 'running' };
  return { fixture, env, receipt, status };
}

describe('live canonical owner binding and command boundary', () => {
  it.each(['database', 'target', 'source', 'endpoint', 'stopped', 'deadline', 'helper', 'blank-token'] as const)('rejects %s mismatch even with exclusive=true and a future fixture expiry', field => {
    const { fixture, env, receipt, status } = liveIdentity();
    if (field === 'database') status.database = 'another_db';
    if (field === 'target') env.VELA_E2E_OWNER_KEY = 'other-target';
    if (field === 'source') status.sourceRoot = '/another/source';
    if (field === 'endpoint') status.urls = { ...status.urls, api: 'http://localhost:9999' };
    if (field === 'stopped') status.state = 'stopped';
    if (field === 'deadline') receipt.deadlineUtc = '2000-01-01T00:00:00Z';
    if (field === 'helper') receipt.helperSha256 = '0'.repeat(64);
    if (field === 'blank-token') env.VELA_E2E_OWNER_TOKEN = ' ';
    expect(() => assertFundingLeaseIdentity(fixture, receipt, status, env, fixture.upstream.amrSha, 1)).toThrow();
  });

  it('does not spawn a child when the real pre-verifier rejects', async () => {
    let started = false;
    await expect(withFundingLease(async () => { throw new Error('lost lease'); }, async () => { started = true; })).rejects.toThrow('lost lease');
    expect(started).toBe(false);
  });

  it('rejects child exit0 when the post-verifier reports lock loss', async () => {
    const phases: string[] = [];
    await expect(withFundingLease(async phase => {
      phases.push(phase);
      if (phase === 'post') throw new Error('lock lost after browser');
    }, async () => { phases.push('child exit0'); return 0; })).rejects.toThrow('lock lost');
    expect(phases).toEqual(['pre', 'child exit0', 'post']);
  });

  it('still performs a post-verifier after browser failure', async () => {
    const phases: string[] = [];
    await expect(withFundingLease(async phase => { phases.push(phase); }, async () => {
      phases.push('child failed'); throw new Error('browser red');
    })).rejects.toThrow('browser red');
    expect(phases).toEqual(['pre', 'child failed', 'post']);
  });
});
