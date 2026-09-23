import { expect, it, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { createVelaProjectShareState, parseProjectShareState } from '../src/collab/vela-project-share-state.js';
const slug = '93a3c7e6-198d-4b72-9f70-0bbfdf9f9c55';
it.each(['active', 'stopped'] as const)('preserves authoritative %s history', status => {
  expect(parseProjectShareState(JSON.stringify({ projectId: 'p', bindingExists: true, publications: [{ sourceFilePath: 'pages/local.html', slug, status }] }), 'p'))
    .toEqual({ projectId: 'p', bindingExists: true, hasEverShared: true, publications: [{ sourceFilePath: 'pages/local.html', slug, status }] });
});
it('accepts only an explicit successful empty history', () => {
  expect(parseProjectShareState('{"projectId":"p","bindingExists":false,"publications":[]}', 'p').hasEverShared).toBe(false);
});
it.each([{ error: 'NOT_FOUND' }, { projectId: 'other', bindingExists: false, publications: [] }, { projectId: 'p', bindingExists: true, publications: [] }, { projectId: 'p', bindingExists: false, publications: [{ sourceFilePath: 'index.html', slug, status: 'active' }] }])('refuses malformed/error history %j', value => {
  expect(() => parseProjectShareState(JSON.stringify(value), 'p')).toThrow();
});
it('runs the real command shape under a captured session', async () => {
  const session = { profile: 'test' as const, apiUrl: 'https://example.test', controlKey: 'synthetic', user: null, configMtimeMs: null };
  const runCommand = vi.fn().mockResolvedValue('{"projectId":"p","bindingExists":false,"publications":[]}');
  const read = createVelaProjectShareState({ dataRoot: tmpdir(), readSession: () => session,
    fetchDirectory: async () => { session.controlKey = 'changed'; return { ok: true, items: [{ workspaceId: 'w', workspaceName: 'W', workspaceType: 'personal', workspaceMemberId: 'o', role: 'member', memberStatus: 'active', lifecycleState: 'active' }] }; }, runCommand });
  expect((await read({ projectId: 'p', resourceTeamId: 'w', ownerMemberId: 'o' })).bindingExists).toBe(false);
  expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w', session: expect.objectContaining({ controlKey: 'synthetic' }), args: ['share', 'project-status', 'p', '--json'] }));
  runCommand.mockRejectedValue(new Error('404'));
  await expect(read({ projectId: 'p', resourceTeamId: 'w', ownerMemberId: 'o' })).rejects.toThrow();
});
