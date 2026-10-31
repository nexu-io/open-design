// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectCollab } from '../src/collab/useProjectCollab';
import { workspaceContextFixture } from './helpers/workspace-context';

const workspaceContext = workspaceContextFixture({
  workspaceId: 'workspace', workspaceMemberId: 'owner', role: 'owner',
});
const response = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('owned replacement state (OPEND-4492)', () => {
  it('keeps ownership but suspends writes while this client accepts replacement, then restores them', async () => {
    let finish!: (response: Response) => void;
    const accepted = new Promise<Response>((resolve) => { finish = resolve; });
    const fetchImpl = (async (input, init) => {
      const pathname = new URL(String(input), 'http://daemon.local').pathname;
      if (pathname.endsWith('/collab/update') && init?.body
        && JSON.parse(String(init.body)).action === 'accept') return accepted;
      if (pathname.endsWith('/collab/status')) return response({
        syncState: 'synced', ownerMemberId: 'owner',
        ownedContentUpdate: { state: 'confirmation_required', latestVersion: 2, localVersion: 1, promptSuppressedUntil: null, updatedAt: 1 },
      });
      return response({ present: [] });
    }) as typeof fetch;
    const { result } = renderHook(() => useProjectCollab('owner-project', { workspaceContext, fetch: fetchImpl }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.writerAuthority).toBe('allowed');
    let pending!: Promise<unknown>;
    await act(async () => { pending = result.current.requestContentUpdate!({ action: 'accept', version: 2 }); });
    expect(result.current.isOwner).toBe(true);
    expect(result.current.viewerOnly).toBe(false);
    expect(result.current.contentUpdatePending).toBe(true);
    expect(result.current.writerAuthority).toBe('pending');
    await act(async () => {
      finish(response({ update: { state: 'up_to_date', latestVersion: 2, localVersion: 2, promptSuppressedUntil: null, updatedAt: 2 } }));
      await pending;
    });
    expect(result.current.contentUpdatePending).toBe(false);
    expect(result.current.writerAuthority).toBe('allowed');
  });

  it('allows the owner to keep writing during background uploads', async () => {
    const fetchImpl = (async (input) => new URL(String(input), 'http://daemon.local').pathname.endsWith('/collab/status')
      ? response({ syncState: 'pending_upload', ownerMemberId: 'owner', ownedContentUpdate: {
        state: 'up_to_date', latestVersion: 1, localVersion: 1, promptSuppressedUntil: null, updatedAt: 1,
      } }) : response({ present: [] })) as typeof fetch;
    const { result } = renderHook(() => useProjectCollab('owner-project', { workspaceContext, fetch: fetchImpl }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.isOwner).toBe(true);
    expect(result.current.syncState).toBe('pending_upload');
    expect(result.current.materializationPending).toBe(false);
    expect(result.current.contentUpdatePending).toBe(false);
    expect(result.current.writerAuthority).toBe('allowed');
  });

  it('suspends writes when a reload observes the daemon already downloading', async () => {
    const fetchImpl = (async (input) => new URL(String(input), 'http://daemon.local').pathname.endsWith('/collab/status')
      ? response({ syncState: 'synced', ownerMemberId: 'owner', ownedContentUpdate: {
        state: 'downloading', latestVersion: 2, localVersion: 1, promptSuppressedUntil: null, updatedAt: 1,
      } }) : response({ present: [] })) as typeof fetch;
    const { result } = renderHook(() => useProjectCollab('owner-project', { workspaceContext, fetch: fetchImpl }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.isOwner).toBe(true);
    expect(result.current.contentUpdatePending).toBe(true);
    expect(result.current.writerAuthority).toBe('pending');
  });
});
