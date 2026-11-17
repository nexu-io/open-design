import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assertConcurrencyBinding, assertConcurrencyReceipt, requireConcurrencyFixture, type ConcurrencyBinding } from '@/playwright/workspace-concurrency-fixture';
import type { FundingFixture } from '@/playwright/workspace-funding-fixture';

function capability() {
  return { concurrency: {
    space: { workspaceId: 'only-this-disposable-workspace', ownerMemberId: 'owner', actorRole: 'owner', actorMemberId: 'owner', runtimeKey: 'unit-owner-key' },
    member: { memberId: 'member', runtimeKey: 'unit-member-key' },
    holdModelId: 'unit-model', coordinator: { helperPath: '/private/coordinator.py', helperSha256: 'a'.repeat(64), helperSourceSha: 'b'.repeat(40), helperRepoPath: 'e2e/helper/link_concurrency.py' },
    serverControl: { providerBaseUrl: 'http://127.0.0.1:12345', providerStatePath: '/private/provider.json',
      providerSourcePath: '/private/provider.py', providerSourceSha256: 'c'.repeat(64),
      controlTokenPath: '/private/control-token', redisContainer: 'owned-test-redis', redisKeyPrefix: 'owned-test:' },
  } } as FundingFixture;
}
const binding: ConcurrencyBinding = { protocol: 'od-link-concurrency-v1', runId: 'only-this-run', attemptId: 'only-this-attempt',
  tag: 'only-this-tag', workspaceId: 'only-this-space', surface: 'home', fixtureSha256: 'a'.repeat(64) };

describe('bound server-owned Link capacity capability', () => {
  it('accepts separate real Owner and Member keys with an immutable repository helper', () => {
    const f = capability(); expect(requireConcurrencyFixture(f)).toBe(f.concurrency);
  });
  it.each(['owner', 'member', 'key', 'helper-hash', 'helper-source', 'helper-path', 'repo-traversal'] as const)('rejects invalid %s before child startup', field => {
    const f = capability(); const c = f.concurrency!;
    if (field === 'owner') c.space.actorMemberId = 'another-owner';
    if (field === 'member') c.member.memberId = c.space.ownerMemberId;
    if (field === 'key') c.member.runtimeKey = c.space.runtimeKey;
    if (field === 'helper-hash') c.coordinator.helperSha256 = '';
    if (field === 'helper-source') c.coordinator.helperSourceSha = 'latest';
    if (field === 'helper-path') c.coordinator.helperPath = 'ambient.py';
    if (field === 'repo-traversal') c.coordinator.helperRepoPath = '../unrelated.py';
    expect(() => requireConcurrencyFixture(f)).toThrow();
  });
  it('does not accept a ready flag without the command binding', () => {
    expect(() => assertConcurrencyBinding({ ready: true }, binding)).toThrow('binding mismatch');
  });
  it.each(Object.keys(binding) as (keyof ConcurrencyBinding)[])('rejects a stale or different %s even when count and ready match', field => {
    const receipt = { ...binding, ready: true, count: 10, [field]: 'old-or-other-command' };
    expect(() => assertConcurrencyBinding(receipt, binding)).toThrow(field);
  });
  it('accepts the exact response binding while leaving quantity assertions to the actual lane', () => {
    expect(() => assertConcurrencyBinding({ ...binding, count: 10, ready: true }, binding)).not.toThrow();
  });
});


describe('capacity marker binds actual hashed server receipt', () => {
  const receipt = (extra: Record<string, unknown> = {}) => Buffer.from(JSON.stringify({ ...binding, heldCount: 10, remaining: 0, ...extra }));
  const marker = (bytes: Buffer, phase: 'held' | 'released' = 'held') => ({ ...binding, ready: true, count: 10, released: true, remaining: 0,
    receiptPath: phase === 'held' ? 'server-held-receipt.safe.json' : 'server-released-receipt.safe.json', receiptSha256: createHash('sha256').update(bytes).digest('hex') });
  it('verifies both actual hold and release receipt quantities', () => {
    const bytes = receipt(); expect(() => assertConcurrencyReceipt(marker(bytes), binding, bytes, 'held')).not.toThrow();
    expect(() => assertConcurrencyReceipt(marker(bytes, 'released'), binding, bytes, 'released')).not.toThrow();
  });
  it('rejects a changed receipt even if the ready flag and scope match', () => {
    expect(() => assertConcurrencyReceipt(marker(receipt()), binding, receipt({ heldCount: 9 }), 'held')).toThrow('digest');
  });
  it('rejects a correct digest whose actual hold count is short', () => {
    const bytes = receipt({ heldCount: 9 }); expect(() => assertConcurrencyReceipt(marker(bytes), binding, bytes, 'held')).toThrow('10 held');
  });
  it('rejects a release receipt with remaining actual capacity owners', () => {
    const bytes = receipt({ remaining: 1 }); expect(() => assertConcurrencyReceipt(marker(bytes, 'released'), binding, bytes, 'released')).toThrow('zero remaining');
  });
  it('rejects another workspace receipt even with a newly computed matching digest', () => {
    const bytes = receipt({ workspaceId: 'other-workspace' }); expect(() => assertConcurrencyReceipt(marker(bytes), binding, bytes, 'held')).toThrow('workspaceId');
  });
});


describe('restricted provider control fixture', () => {
  it.each(['external', 'credentials', 'relative-token', 'source-digest', 'missing-redis'] as const)('rejects %s before launching helper or browser', field => {
    const f = capability(); const c = f.concurrency!.serverControl;
    if (field === 'external') c.providerBaseUrl = 'https://example.invalid';
    if (field === 'credentials') c.providerBaseUrl = 'http://secret@127.0.0.1:1234';
    if (field === 'relative-token') c.controlTokenPath = 'ambient-token';
    if (field === 'source-digest') c.providerSourceSha256 = 'latest';
    if (field === 'missing-redis') c.redisContainer = '';
    expect(() => requireConcurrencyFixture(f)).toThrow();
  });
  it('cannot substitute the released receipt for the held phase', () => {
    const bytes = Buffer.from(JSON.stringify({ ...binding, heldCount: 10, remaining: 0 }));
    const marker = { ...binding, ready: true, count: 10, receiptPath: 'server-released-receipt.safe.json',
      receiptSha256: createHash('sha256').update(bytes).digest('hex') };
    expect(() => assertConcurrencyReceipt(marker, binding, bytes, 'held')).toThrow('path');
  });
  it.each(['zero-left', 'short-held', 'other-tag', 'wrong-released'] as const)('rejects invalid single-release evidence: %s', variant => {
    const held = Array.from({ length: 9 }, (_, i) => `${binding.tag}-${i + 1}`);
    const data = { ...binding, releasedCount: 1, remaining: variant === 'zero-left' ? 0 : 9,
      releasedRequestIds: [variant === 'wrong-released' ? `${binding.tag}-1` : `${binding.tag}-0`],
      heldRequestIds: variant === 'short-held' ? held.slice(0, 8) : variant === 'other-tag' ? [...held.slice(0, 8), 'another-attempt-9'] : held };
    const bytes = Buffer.from(JSON.stringify(data));
    const marker = { ...binding, released: true, remaining: 9, receiptPath: 'server-one-released-receipt.safe.json',
      receiptSha256: createHash('sha256').update(bytes).digest('hex') };
    expect(() => assertConcurrencyReceipt(marker, binding, bytes, 'one-released')).toThrow('nine held');
  });
  it('accepts the separate immutable single-release phase and rejects final zero as a substitute', () => {
    const bytes = Buffer.from(JSON.stringify({ ...binding, remaining: 9, releasedCount: 1,
      releasedRequestIds: [`${binding.tag}-0`], heldRequestIds: Array.from({ length: 9 }, (_, i) => `${binding.tag}-${i + 1}`) }));
    const marker = { ...binding, released: true, remaining: 9, receiptPath: 'server-one-released-receipt.safe.json',
      receiptSha256: createHash('sha256').update(bytes).digest('hex') };
    expect(() => assertConcurrencyReceipt(marker, binding, bytes, 'one-released')).not.toThrow();
    expect(() => assertConcurrencyReceipt({ ...marker, receiptPath: 'server-released-receipt.safe.json' }, binding, bytes, 'one-released')).toThrow('path');
  });
});
