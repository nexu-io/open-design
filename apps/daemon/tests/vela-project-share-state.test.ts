import { expect, it, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { createVelaProjectShareState, currentFileSharePublication, parseProjectShareState } from '../src/collab/vela-project-share-state.js';
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
it('reads status through one pinned cloud call without directory checks or registration', async () => {
  const session = { profile: 'test' as const, apiUrl: 'https://example.test', controlKey: 'synthetic', user: null, configMtimeMs: null };
  const runCommand = vi.fn().mockResolvedValue('{"projectId":"p","bindingExists":false,"publications":[]}');
  const read = createVelaProjectShareState({dataRoot:tmpdir(),readSession:()=>session,runCommand});
  expect((await read({projectId:'p',resourceTeamId:'w',ownerMemberId:'o'})).bindingExists).toBe(false);
  expect(runCommand).toHaveBeenCalledTimes(1);
  expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({workspaceId:'w',session:expect.objectContaining({controlKey:'synthetic'}),args:['share','project-status','p','--json']}));
  runCommand.mockRejectedValue(new Error('403'));
  await expect(read({projectId:'p',resourceTeamId:'w',ownerMemberId:'o'})).rejects.toThrow('403');
});

it('preserves distinct same-path lifetime histories instead of rejecting F1/F2 as duplicate paths', () => {
  const publications = [
    { sourceFilePath: 'a.html', sourceFileId: '11111111-1111-4111-8111-111111111111', slug, status: 'stopped' },
    { sourceFilePath: 'a.html', sourceFileId: '22222222-2222-4222-8222-222222222222', slug: '22222222-2222-4222-8222-222222222222', status: 'active' },
  ];
  expect(parseProjectShareState(JSON.stringify({ projectId: 'p', bindingExists: true, publications }), 'p').publications).toEqual(publications);
});

it('does not infer the current lifetime from a lone historical alias or select the first reused path', () => {
  const first = { sourceFilePath: 'a.html', sourceFileId: '11111111-1111-4111-8111-111111111111', slug, status: 'stopped' as const };
  const second = { ...first, sourceFileId: '22222222-2222-4222-8222-222222222222', slug: '22222222-2222-4222-8222-222222222222', status: 'active' as const };
  const history = { projectId: 'p', bindingExists: true, hasEverShared: true, publications: [first] };
  expect(currentFileSharePublication(history, 'a.html', second.sourceFileId)).toBeUndefined();
  expect(currentFileSharePublication({ ...history, publications: [first, second] }, 'a.html', second.sourceFileId)).toEqual(second);
  expect(currentFileSharePublication({ ...history, publications: [first, second] }, 'a.html')).toBeUndefined();
});

it('never calls a live identity-less share absent or guesses it belongs to a new lifetime', () => {
  const legacy = { sourceFilePath: 'a.html', slug, status: 'active' as const };
  const history = { projectId: 'p', bindingExists: true, hasEverShared: true, publications: [legacy] };
  expect(() => currentFileSharePublication(history, 'a.html', '22222222-2222-4222-8222-222222222222'))
    .toThrow('SHARE_FILE_IDENTITY_UNAVAILABLE');
  expect(currentFileSharePublication(history, 'a.html')).toEqual(legacy); // Existing project history/stop remains addressable.
  expect(history.publications[0]).not.toHaveProperty('sourceFileId');
  expect(currentFileSharePublication({ ...history, publications: [{ ...legacy, status: 'stopped' }] }, 'a.html', '22222222-2222-4222-8222-222222222222')).toBeUndefined();
  expect(currentFileSharePublication(history, 'unrelated.html', '22222222-2222-4222-8222-222222222222')).toBeUndefined();
});
