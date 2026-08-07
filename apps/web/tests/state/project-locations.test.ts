import { afterEach, describe, expect, it, vi } from 'vitest';

import { openProjectLocationFolderDialog } from '../../src/state/project-locations';

describe('openProjectLocationFolderDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a selected result for a native path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ path: '/work/designs' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    await expect(openProjectLocationFolderDialog()).resolves.toEqual({
      status: 'selected',
      path: '/work/designs',
    });
  });

  it('distinguishes user cancellation from failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ path: null }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    await expect(openProjectLocationFolderDialog()).resolves.toEqual({
      status: 'cancelled',
    });
  });

  it('requests the server picker for the remote dialog gate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({
        code: 'NATIVE_FOLDER_DIALOG_REMOTE',
        message: 'Native folder picker is unavailable to a remote browser',
        fallback: 'server-directory-picker',
      }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    )));

    await expect(openProjectLocationFolderDialog()).resolves.toEqual({
      status: 'fallback',
      reason: 'remote',
    });
  });

  it('requests the server picker when the native host dialog cannot execute', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'Could not open folder picker: cannot open display' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )));

    await expect(openProjectLocationFolderDialog()).resolves.toEqual({
      status: 'fallback',
      reason: 'native-unavailable',
    });
  });

  it('returns a localizable error reason for an invalid success response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({}),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    await expect(openProjectLocationFolderDialog()).resolves.toEqual({
      status: 'error',
      reason: 'invalid-response',
    });
  });

  it('returns a localizable error reason for unknown failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'forbidden' }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    )));

    await expect(openProjectLocationFolderDialog()).resolves.toEqual({
      status: 'error',
      reason: 'request-failed',
    });
  });
});
