import { expect, it } from 'vitest';
import { authorizeHeaderlessTeamRead } from '../../src/collab/headerless-team-read.js';
import type { WorkspaceDirectoryItem } from '@open-design/contracts';
const a = { profile: 'local', apiUrl: 'http://local', userId: 'A' };
const team = { workspaceId: 'team-a', workspaceMemberId: 'member-a', workspaceType: 'team', memberStatus: 'active', lifecycleState: 'active' } as WorkspaceDirectoryItem;
const make = (overrides: Partial<Parameters<typeof authorizeHeaderlessTeamRead>[0]> = {}) => ({
  workspaceId: 'team-a', account: a, currentIdentity: () => 'A',
  fetchDirectory: async () => ({ ok: true, items: [team] }),
  hasSnapshot: (identity: typeof a, workspaceId: string) => identity.userId === 'A' && workspaceId === 'team-a',
  ...overrides,
});
it('accepts current online membership but rejects another account', async () => {
  expect(await authorizeHeaderlessTeamRead(make())).toBe('allowed');
  expect(await authorizeHeaderlessTeamRead(make({ account: { ...a, userId: 'B' }, fetchDirectory: async () => ({ ok: true, items: [] }) }))).toBe('forbidden');
});
it('uses only the same account snapshot when the directory cannot be reached', async () => {
  const offline = async () => ({ ok: false, items: [], reason: 'network' as const });
  expect(await authorizeHeaderlessTeamRead(make({ fetchDirectory: offline }))).toBe('allowed');
  expect(await authorizeHeaderlessTeamRead(make({ account: { ...a, userId: 'B' }, fetchDirectory: offline }))).toBe('unavailable');
  expect(await authorizeHeaderlessTeamRead(make({ account: null, fetchDirectory: offline }))).toBe('unavailable');
  expect(await authorizeHeaderlessTeamRead(make({ hasSnapshot: () => false, fetchDirectory: async () => ({ ok: false, items: [], reason: 'unauthorized' }) }))).toBe('forbidden');
});
it('drops a saved membership when the live directory no longer includes it', async () => {
  let forgotten = '';
  expect(await authorizeHeaderlessTeamRead(make({
    fetchDirectory: async () => ({ ok: true, items: [] }),
    onMembershipLost: (_account, workspaceId) => { forgotten = workspaceId; },
  }))).toBe('forbidden');
  expect(forgotten).toBe('team-a');
});
it('checks the claimed member online and against the account snapshot offline', async () => {
  expect(await authorizeHeaderlessTeamRead(make({ expectedMemberId: 'member-a' }))).toBe('allowed');
  expect(await authorizeHeaderlessTeamRead(make({ expectedMemberId: 'removed-member' }))).toBe('forbidden');
  const offline = async () => ({ ok: false, items: [], reason: 'network' as const });
  const snapshotMember = () => 'member-a';
  expect(await authorizeHeaderlessTeamRead(make({ expectedMemberId: 'member-a', snapshotMember, fetchDirectory: offline }))).toBe('allowed');
  expect(await authorizeHeaderlessTeamRead(make({ expectedMemberId: 'removed-member', snapshotMember, fetchDirectory: offline }))).toBe('forbidden');
});
it('does not accept a result that arrives after the account changed', async () => {
  let identity = 'A';
  expect(await authorizeHeaderlessTeamRead(make({ hasSnapshot: () => false, currentIdentity: () => identity, fetchDirectory: async () => { identity = 'B'; return { ok: true, items: [team] }; } }))).toBe('unavailable');
});
it('rejects the current read and clears the snapshot when the credential is rejected', async () => {
  let removed = false;
  expect(await authorizeHeaderlessTeamRead(make({
    fetchDirectory: async () => ({ ok: false, items: [], reason: 'unauthorized' }),
    onUnauthorized: () => { removed = true; },
  }))).toBe('forbidden');
  expect(removed).toBe(true);
});
