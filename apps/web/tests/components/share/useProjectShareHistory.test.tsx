// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectShareHistory } from '../../../src/components/share/useProjectShareHistory';
import { AMR_LOGIN_STATUS_EVENT } from '../../../src/components/amrLoginPolling';
import { advanceWorkspaceAccountGeneration, resetWorkspaceAccountGeneration } from '../../../src/collab/workspace-identity';
const neverShared = { projectId: 'p', bindingExists: false, hasEverShared: false, publications: [] };
const stopped = { ...neverShared, bindingExists: true, hasEverShared: true, publications: [{ sourceFilePath: 'page.html', slug: 'stable', status: 'stopped' }] };
const request = vi.fn<typeof fetch>();
beforeEach(() => { request.mockReset(); vi.stubGlobal('fetch', request); resetWorkspaceAccountGeneration(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetWorkspaceAccountGeneration(); });
describe('project share history', () => {
  it.each([neverShared, stopped])('reads authoritative history including stopped bindings', async history => {
    request.mockResolvedValue(Response.json(history));
    const { result } = renderHook(() => useProjectShareHistory('p', null, 'file'));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual(history));
    expect(request).toHaveBeenCalledWith('/api/projects/p/share-state', expect.objectContaining({ cache: 'no-store' }));
  });
  it.each([null, {}, { ...neverShared, projectId: 'other' }, { ...stopped, bindingExists: false }])('keeps untrusted payload unknown', async body => {
    request.mockResolvedValue(Response.json(body));
    const { result } = renderHook(() => useProjectShareHistory('p', null, 'file'));
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBeNull();
  });
  it('invalidates known false after publish and does not turn 503 into false', async () => {
    request.mockResolvedValueOnce(Response.json(neverShared));
    const { result, rerender } = renderHook(key => useProjectShareHistory('p', null, key), { initialProps: 'unpublished' });
    await waitFor(() => expect(result.current?.hasEverShared).toBe(false));
    request.mockResolvedValue(new Response('', { status: 503 }));
    rerender('published');
    expect(result.current).toBeNull();
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBeNull();
  });
  it('rejects late old-account false after a login boundary', async () => {
    let finish!: (response: Response) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useProjectShareHistory('p', null, 'file'));
    request.mockImplementation(async () => Response.json(stopped));
    act(() => { advanceWorkspaceAccountGeneration('other'); window.dispatchEvent(new Event(AMR_LOGIN_STATUS_EVENT)); });
    await waitFor(() => expect(result.current?.hasEverShared).toBe(true));
    await act(async () => finish(Response.json(neverShared)));
    expect(result.current?.hasEverShared).toBe(true);
  });
});
