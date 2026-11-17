// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../src/i18n';
import { WorkspaceRemovalBoundary } from '../../src/components/WorkspaceRemovalBoundary';
import { clearWorkspaceRemoval, recordWorkspaceRemoval } from '../../src/collab/workspace-removal';
import { workspaceContextFixture } from '../helpers/workspace-context';
const mocks = vi.hoisted(() => ({ directory: vi.fn(), refresh: vi.fn(), navigate: vi.fn() }));
vi.mock('../../src/collab/useWorkspaceContext', () => ({ useWorkspaceContext: () => ({}), readWorkspaceDirectoryForCurrentGeneration: mocks.directory, notifyWorkspaceContextRefresh: mocks.refresh }));
vi.mock('../../src/router', () => ({ navigate: mocks.navigate }));
const removed = workspaceContextFixture({ workspaceId: 'removed', workspaceMemberId: 'old-member', workspaceName: 'Design space' });
const target = workspaceContextFixture({ workspaceId: 'default', workspaceMemberId: 'owner-member', workspaceType: 'personal', role: 'owner' });
function mount() { return render(<I18nProvider initial="en"><WorkspaceRemovalBoundary><div>Private project content</div></WorkspaceRemovalBoundary></I18nProvider>); }
function revoke(workspaceId = removed.workspaceId, workspaceMemberId = removed.workspaceMemberId) { act(() => { recordWorkspaceRemoval({ type: 'workspace-context-changed', memberRemoval: { reason: 'member-removed', workspaceId, workspaceMemberId } }, removed); }); }
afterEach(() => { cleanup(); clearWorkspaceRemoval(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('exact member removal recovery', () => {
  it('ignores other members, workspaces and generic invalidations', () => {
    mount(); revoke('other'); revoke(removed.workspaceId, 'replacement-member');
    act(() => { recordWorkspaceRemoval({ type: 'workspace-context-changed' }, removed); });
    expect(screen.queryByRole('alertdialog')).toBeNull(); expect(screen.getByText('Private project content')).toBeTruthy();
  });
  it('unmounts private content and selects only the unique verified default', async () => {
    mocks.directory.mockResolvedValue({ items: [{ ...target, isDefault: true }] });
    const fetch = vi.fn(async () => new Response(JSON.stringify({ context: target }), { status: 200 })); vi.stubGlobal('fetch', fetch);
    mount(); revoke(); expect(screen.queryByText('Private project content')).toBeNull();
    expect(screen.getByRole('alertdialog').textContent).toContain('Design space');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledWith({ context: target }));
    expect(mocks.directory).toHaveBeenCalledWith({ fresh: true });
    expect(fetch).toHaveBeenCalledWith('/api/workspace/active', expect.objectContaining({ body: JSON.stringify({ workspaceId: target.workspaceId, workspaceMemberId: target.workspaceMemberId }) }));
    expect(mocks.navigate).toHaveBeenCalledWith({ kind: 'home', view: 'home' }, { replace: true });
  });
  it.each(['missing', 'ambiguous', 'inactive', 'wrong-member', 'server-error'])('retains a recoverable notice on %s', async mode => {
    let items = [{ ...target, isDefault: true }];
    if (mode === 'missing') items = [{ ...target, isDefault: false }];
    if (mode === 'ambiguous') items.push({ ...target, workspaceId: 'other-default', isDefault: true });
    if (mode === 'inactive') items = [{ ...target, memberStatus: 'removed', isDefault: true }];
    mocks.directory.mockResolvedValue({ items });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ context: { ...target, workspaceMemberId: mode === 'wrong-member' ? 'wrong' : target.workspaceMemberId } }), { status: mode === 'server-error' ? 503 : 200 })));
    mount(); revoke(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); await screen.findByRole('alert');
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('Private project content')).toBeNull(); expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it('discards late recovery after an account change', async () => {
    let resolve!: (value: unknown) => void; mocks.directory.mockReturnValue(new Promise(r => { resolve = r; }));
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    mount(); revoke(); fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await act(async () => { clearWorkspaceRemoval(); resolve({ items: [{ ...target, isDefault: true }] }); });
    expect(fetch).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
