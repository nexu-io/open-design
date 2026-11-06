// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VelaLoginStatus } from '../../../src/providers/daemon';
import { useShareGuideAppUserId } from '../../../src/components/share/useShareGuideAppUserId';
import { AMR_LOGIN_STATUS_EVENT } from '../../../src/components/amrLoginPolling';
import { advanceWorkspaceAccountGeneration, resetWorkspaceAccountGeneration } from '../../../src/collab/workspace-identity';
const reader = vi.hoisted(() => vi.fn<() => Promise<VelaLoginStatus | null>>());
vi.mock('../../../src/providers/daemon', () => ({ fetchVelaLoginStatus: reader }));
function account(id: string): VelaLoginStatus {
  return { loggedIn: true, profile: 'test', configPath: '', user: { id, email: 'fixture@example.invalid' } };
}
beforeEach(() => { reader.mockReset(); resetWorkspaceAccountGeneration(); });
afterEach(() => { cleanup(); resetWorkspaceAccountGeneration(); });
describe('guide account reader', () => {
  it('uses the signed-in account id and not the email or profile', async () => {
    reader.mockResolvedValue(account('app-user-1'));
    const { result } = renderHook(useShareGuideAppUserId);
    await waitFor(() => expect(result.current).toBe('app-user-1'));
  });
  it.each([account(''), { ...account('expired'), sessionState: 'reauth_required' as const }, null])('keeps missing or expired identity unknown', async status => {
    reader.mockResolvedValue(status);
    const { result } = renderHook(useShareGuideAppUserId);
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBeNull();
  });
  it('rejects an old account response after a boundary and fresh read', async () => {
    let finishOld: (status: VelaLoginStatus) => void = () => { throw new Error('not started'); };
    reader.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    const { result } = renderHook(useShareGuideAppUserId);
    reader.mockResolvedValue(account('new-account'));
    act(() => {
      advanceWorkspaceAccountGeneration('new-account');
      window.dispatchEvent(new Event(AMR_LOGIN_STATUS_EVENT));
    });
    await waitFor(() => expect(result.current).toBe('new-account'));
    await act(async () => finishOld(account('old-account')));
    expect(result.current).toBe('new-account');
  });
});
