// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWorkspaceContentView } from '../../src/analytics/use-workspace-content-view';
import { workspaceContextFixture } from '../helpers/workspace-context';

const track = vi.hoisted(() => vi.fn());
vi.mock('../../src/analytics/provider', () => ({ useAnalytics: () => ({ track }) }));
const context = workspaceContextFixture({ workspaceId: 'invited-workspace', workspaceMemberId: 'invitee-member' });
beforeEach(() => {
  track.mockReset();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('waits for visible, authorized content and deduplicates refreshes and StrictMode', () => {
  const hook = renderHook(({ ready }) => useWorkspaceContentView({
    context: { ...context }, pageName: 'home', ready, active: true,
  }), { initialProps: { ready: false }, wrapper: StrictMode });
  expect(track).not.toHaveBeenCalled();
  hook.rerender({ ready: true });
  hook.rerender({ ready: true });
  expect(track).toHaveBeenCalledExactlyOnceWith('surface_view', expect.objectContaining({
    area: 'workspace_content', page_name: 'home', workspace_key: 'invited-workspace',
    workspace_member_id: 'invitee-member', surface_instance_id: expect.any(String),
  }), undefined);
});

it('does not expose a background window until it becomes visible', () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  renderHook(() => useWorkspaceContentView({ context, pageName: 'home', ready: true, active: true }));
  expect(track).not.toHaveBeenCalled();
  act(() => { visibility.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange')); });
  expect(track).toHaveBeenCalledTimes(1);
});

it('separates member/workspace changes and ignores removed or deleted memberships', () => {
  const hook = renderHook(({ current }) => useWorkspaceContentView({
    context: current, pageName: 'home', ready: true, active: true,
  }), { initialProps: { current: context } });
  hook.rerender({ current: { ...context, workspaceMemberId: 'second-account-member' } });
  hook.rerender({ current: { ...context, workspaceId: 'other-workspace' } });
  hook.rerender({ current: { ...context, memberStatus: 'removed' } });
  hook.rerender({ current: { ...context, lifecycleState: 'deleted' } });
  expect(track).toHaveBeenCalledTimes(3);
  expect(new Set(track.mock.calls.map(([, p]) => p.surface_instance_id)).size).toBe(3);
});

it('excludes hidden/onboarding surfaces and starts a new visit after leaving', () => {
  const hook = renderHook(({ active }) => useWorkspaceContentView({
    context, pageName: 'home', ready: true, active,
  }), { initialProps: { active: false } });
  expect(track).not.toHaveBeenCalled();
  hook.rerender({ active: true });
  hook.rerender({ active: false });
  hook.rerender({ active: true });
  expect(track).toHaveBeenCalledTimes(2);
});
