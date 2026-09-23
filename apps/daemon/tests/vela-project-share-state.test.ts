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
it('registers a proven local personal Owner before asking for never-shared history without uploading content', async () => {
  const session = { profile: 'test' as const, apiUrl: 'https://example.test', controlKey: 'synthetic', user: null, configMtimeMs: null };
  let registered = false;
  const runCommand = vi.fn(async (input: { args: string[] }) => {
    if (input.args[0] === 'team-projects' && input.args[1] === 'upsert') { registered = true; return '{}'; }
    if (!registered) throw new Error('404 owner catalog missing');
    return '{"projectId":"p","bindingExists":false,"publications":[]}';
  });
  const options = { dataRoot: tmpdir(), readSession: () => session,
    resolveLocalProjectOwner: () => 'o',
    fetchDirectory: async () => ({ ok: true as const, items: [{ workspaceId: 'w', workspaceName: 'W', workspaceType: 'personal' as const, workspaceMemberId: 'o', role: 'owner' as const, memberStatus: 'active' as const, lifecycleState: 'active' as const }] }), runCommand };
  expect(await createVelaProjectShareState(options)({ projectId: 'p', resourceTeamId: 'w', ownerMemberId: 'o' })).toMatchObject({ hasEverShared: false });
  expect(runCommand.mock.calls.map(([input]) => input.args.slice(0, 2))).toEqual([['team-projects', 'upsert'], ['share', 'project-status']]);
  const registration = runCommand.mock.calls[0]![0].args;
  expect(registration).not.toContain('--sync-state');
  expect(registration).not.toContain('--metadata-json');
});

it.each(['unknown-owner', 'other-owner', 'other-workspace', 'team', 'upsert-failed'] as const)('never invents an empty history or claims an unrelated project: %s', async mode => {
  const runCommand = vi.fn(async () => { throw new Error('unavailable'); });
  const read = createVelaProjectShareState({ dataRoot: tmpdir(),
    readSession: () => ({ profile: 'test', apiUrl: 'https://example.test', controlKey: 'synthetic', user: null, configMtimeMs: null }),
    resolveLocalProjectOwner: (_project, workspace) => { expect(workspace).toBe('w'); return mode === 'unknown-owner' ? null : mode === 'other-owner' ? 'other' : 'o'; },
    fetchDirectory: async () => ({ ok: true, items: [{ workspaceId: mode === 'other-workspace' ? 'other' : 'w', workspaceName: 'W', workspaceType: mode === 'team' ? 'team' : 'personal', workspaceMemberId: 'o', role: 'owner', memberStatus: 'active', lifecycleState: 'active' }] }), runCommand });
  await expect(read({ projectId: 'p', resourceTeamId: 'w', ownerMemberId: 'o' })).rejects.toThrow();
  if (mode === 'other-workspace') expect(runCommand).not.toHaveBeenCalled();
  else {
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({ args: expect.arrayContaining(mode === 'upsert-failed' ? ['team-projects', 'upsert'] : ['share', 'project-status']) }));
  }
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
