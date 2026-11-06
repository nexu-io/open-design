// @vitest-environment jsdom
//
// `useWorkspaceContext()` and `useTeamProjects()` are each mounted by a
// dozen-plus components at once (App, EntryShell, SettingsDialog, HomeView,
// ...). An identity-change broadcast — `notifyWorkspaceContextRefresh()` /
// `notifyTeamProjectsChanged()` — is heard by every mounted instance in the
// SAME synchronous `dispatchEvent` pass. Before `forceCoalescedGet`, each
// instance's handler called `evictCoalescedGet(key)` then `coalescedGet(key,
// run)` directly: the first instance's eviction is harmless, but the SECOND
// instance's eviction destroys the in-flight entry the FIRST instance just
// created, so N mounted instances fired N real network requests for the same
// broadcast instead of one shared request. This file locks in the fix: one
// broadcast collapses to exactly one fetch no matter how many consumers are
// mounted.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetCoalescedGet } from '../src/lib/coalesced-get';
import {
  notifyTeamProjectsChanged,
  notifyWorkspaceContextRefresh,
  resetTeamProjectsCache,
  resetWorkspaceContextCache,
  useTeamProjects,
  useWorkspaceContext,
} from '../src/collab/useWorkspaceContext';
import {
  workspaceContextFixture,
  workspaceDirectoryFixture,
} from './helpers/workspace-context';

const TEAM_CONTEXT = workspaceContextFixture({
  workspaceId: 'workspace-team',
  workspaceMemberId: 'member-viewer',
});

describe('workspace refresh broadcasts collapse a multi-consumer burst', () => {
  beforeEach(() => {
    resetCoalescedGet();
    resetWorkspaceContextCache();
    resetTeamProjectsCache();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    resetCoalescedGet();
    resetWorkspaceContextCache();
    resetTeamProjectsCache();
  });

  it('useWorkspaceContext: one notifyWorkspaceContextRefresh() fetches once, not once per mounted consumer', async () => {
    const contextCalls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/workspace/directory')) {
        return new Response(JSON.stringify(workspaceDirectoryFixture([TEAM_CONTEXT])), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/api/workspace/context')) {
        contextCalls.push(url);
        return new Response(JSON.stringify({ context: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    // Three simultaneously-mounted consumers, mirroring App + EntryShell +
    // SettingsDialog all reading the same workspace context at once.
    const consumers = [
      renderHook(() => useWorkspaceContext()),
      renderHook(() => useWorkspaceContext()),
      renderHook(() => useWorkspaceContext()),
    ];
    await waitFor(() => {
      consumers.forEach((c) => expect(c.result.current.loading).toBe(false));
    });

    const before = contextCalls.length;
    await act(async () => {
      notifyWorkspaceContextRefresh();
    });

    // Give every consumer's re-fetch a chance to land before asserting the
    // final count — real network latency, not just microtasks, in the real
    // app.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(contextCalls.length - before).toBe(1);

    consumers.forEach((c) => c.unmount());
  });

  it('useTeamProjects: one notifyTeamProjectsChanged() fetches once, not once per mounted consumer', async () => {
    const teamProjectCalls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/workspace/directory')) {
        return new Response(JSON.stringify(workspaceDirectoryFixture([TEAM_CONTEXT])), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/api/workspace/projects/team')) {
        teamProjectCalls.push(url);
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/api/workspace/context')) {
        return new Response(JSON.stringify({ context: TEAM_CONTEXT }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    // Mirrors HomeView + EntryShell both reading the team-shared catalog at
    // once.
    const consumers = [
      renderHook(() => useTeamProjects()),
      renderHook(() => useTeamProjects()),
      renderHook(() => useTeamProjects()),
    ];
    await waitFor(() => {
      consumers.forEach((c) => expect(c.result.current.loading).toBe(false));
    });

    const before = teamProjectCalls.length;
    await act(async () => {
      notifyTeamProjectsChanged();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(teamProjectCalls.length - before).toBe(1);

    consumers.forEach((c) => c.unmount());
  });
});
