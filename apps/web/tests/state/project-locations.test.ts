import { afterEach, describe, expect, it, vi } from 'vitest';
import { openProjectLocationFolderDialog } from '../../src/state/project-locations';

describe('openProjectLocationFolderDialog', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    [200, { path: '/work/designs' }, { status: 'selected', path: '/work/designs' }],
    [200, { path: null }, { status: 'cancelled' }],
    [403, { code: 'NATIVE_FOLDER_DIALOG_REMOTE', message: 'remote', fallback: 'server-directory-picker' }, { status: 'fallback', reason: 'remote' }],
    [503, { code: 'NATIVE_FOLDER_DIALOG_UNAVAILABLE', message: 'unavailable', fallback: 'server-directory-picker' }, { status: 'fallback', reason: 'native-unavailable' }],
    [401, { code: 'NATIVE_FOLDER_DIALOG_REMOTE', message: 'unauthorized', fallback: 'server-directory-picker' }, { status: 'error', reason: 'request-failed' }],
    [403, { code: 'NATIVE_FOLDER_DIALOG_UNAVAILABLE', message: 'wrong status', fallback: 'server-directory-picker' }, { status: 'error', reason: 'request-failed' }],
    [500, { error: 'host failure' }, { status: 'error', reason: 'request-failed' }],
  ])('discriminates response %s', async (status, body, expected) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
    await expect(openProjectLocationFolderDialog()).resolves.toEqual(expected);
  });
});
