// @vitest-environment jsdom
//
// OPEND-3140 — the signed-out (local CLI / BYOK) shell gets the same entry
// rail layout the cloud shell has: the 最近项目 section fed from the local
// project list with live run status and the 项目 destination. A01 keeps the
// sign-in footer without the former local identity/notification row.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail } from '../../src/components/EntryNavRail';
import { resetProjectRunStatusStore } from '../../src/hooks/useProjectRunStatuses';
import { I18nProvider } from '../../src/i18n';
import type { Project } from '../../src/types';

function project(id: string, updatedAt: number, name = `Project ${id}`): Project {
  return {
    id,
    name,
    skillId: null,
    designSystemId: null,
    createdAt: updatedAt,
    updatedAt,
  } as Project;
}

type RunFixture = { status: string; awaiting?: boolean };

const RUNS: Record<string, RunFixture> = {
  p1: { status: 'running' },
  p2: { status: 'succeeded', awaiting: true },
  p3: { status: 'failed' },
  p4: { status: 'succeeded' },
};

const originalFetch = globalThis.fetch;

function stubFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const match = /^\/api\/runs\?projectId=([^&]+)$/.exec(url);
    if (match) {
      // A local project is read without any Workspace header — the daemon's
      // headerless local branch is what answers.
      const headers = new Headers(init?.headers);
      expect(headers.has('x-od-workspace-id')).toBe(false);
      const id = decodeURIComponent(match[1]!);
      const fixture = RUNS[id];
      const runs = fixture
        ? [{
            id: `run-${id}`,
            projectId: id,
            conversationId: null,
            assistantMessageId: null,
            agentId: 'claude',
            status: fixture.status,
            createdAt: 1,
            updatedAt: 2,
          }]
        : [];
      return new Response(
        JSON.stringify({ runs, awaitingInputProjectIds: fixture?.awaiting ? [id] : [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('/messages?')) {
      return Response.json({ messages: [], nextCursor: null, unreadCount: 0 });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
}

function renderLocalRail(overrides: Partial<Parameters<typeof EntryNavRail>[0]> = {}) {
  const onViewChange = vi.fn();
  const onOpen = vi.fn();
  const onRename = vi.fn();
  const onDelete = vi.fn(async () => true);
  const onDuplicate = vi.fn(async () => {});
  const onOpenSettings = vi.fn();
  render(
    <I18nProvider initial="en">
      <EntryNavRail
        view="home"
        onViewChange={onViewChange}
        onNewProject={() => {}}
        open
        context={null}
        billing={null}
        onOpenSettings={onOpenSettings}
        footerNotice={<div data-testid="local-sign-in-card">Sign in</div>}
        recentProjects={Array.from({ length: 5 }, (_, index) =>
          project(`p${index + 1}`, 1_000 - index))}
        onOpenRecentProject={onOpen}
        onRenameRecentProject={onRename}
        onDeleteRecentProject={onDelete}
        onDuplicateRecentProject={onDuplicate}
        {...overrides}
      />
    </I18nProvider>,
  );
  return { onViewChange, onOpen, onRename, onDelete, onDuplicate, onOpenSettings };
}

beforeEach(() => {
  window.localStorage.clear();
  resetProjectRunStatusStore();
  stubFetch();
});

afterEach(() => {
  cleanup();
  resetProjectRunStatusStore();
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
});

describe('EntryNavRail local (signed-out) shell', () => {
  it('lists the local projects in the 最近项目 section, newest first, with live run status', async () => {
    renderLocalRail();
    const toggle = screen.getByTestId('entry-nav-recent-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const rows = screen.getAllByTestId('entry-nav-recent-item');
    expect(rows.map((row) => row.textContent)).toEqual(
      ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => `Project ${id}`),
    );
    // The same feed and the same display mapping the cloud rail reads.
    await waitFor(() => {
      expect(within(rows[0]!).getByRole('img', { name: 'Running' })).toBeTruthy();
    });
    expect(within(rows[1]!).getByRole('img', { name: 'Needs input' })).toBeTruthy();
    expect(within(rows[2]!).getByRole('img', { name: 'Failed' })).toBeTruthy();
    expect(within(rows[3]!).getByRole('img', { name: 'Completed' })).toBeTruthy();
    expect(within(rows[4]!).queryByRole('img')).toBeNull();
  });

  it('opens a local project through the shell opener and spends its ✓', async () => {
    const { onOpen } = renderLocalRail();
    const rows = screen.getAllByTestId('entry-nav-recent-item');
    await waitFor(() => {
      expect(within(rows[3]!).getByRole('img', { name: 'Completed' })).toBeTruthy();
    });
    fireEvent.click(rows[3]!);
    expect(onOpen).toHaveBeenCalledWith('p4');
    await waitFor(() => {
      expect(within(screen.getAllByTestId('entry-nav-recent-item')[3]!).queryByRole('img')).toBeNull();
    });
  });

  it('offers only the local row actions: rename / duplicate / delete', () => {
    const { onDuplicate } = renderLocalRail();
    fireEvent.click(screen.getAllByTestId('entry-nav-recent-more')[0]!);
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(
      ['Rename', 'Duplicate project', 'Delete'],
    );
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Duplicate project' }));
    expect(onDuplicate).toHaveBeenCalledWith('p1');
  });

  it('hides the section when there are no local projects', () => {
    renderLocalRail({ recentProjects: [] });
    expect(screen.queryByTestId('entry-nav-recent-toggle')).toBeNull();
  });

  it('reaches the 项目 destination from the rail', () => {
    const { onViewChange } = renderLocalRail();
    const drafts = screen.getByTestId('entry-nav-drafts');
    expect(drafts.textContent).toContain('All projects');
    fireEvent.click(drafts);
    expect(onViewChange).toHaveBeenCalledWith('drafts');
    // Still no team catalogue without a workspace.
    expect(screen.queryByTestId('entry-nav-all-projects')).toBeNull();
  });

  it.each([true, false])('keeps the A01 sign-in footer without a local identity or notification row (open=%s)', (open) => {
    const { onOpenSettings } = renderLocalRail({ open });
    expect(screen.queryByTestId('entry-nav-local-account')).toBeNull();
    expect(screen.queryByTestId('entry-nav-message-center')).toBeNull();
    expect(screen.getByTestId('local-sign-in-card')).toBeTruthy();
    // Existing community links are outside this local-row correction.
    expect(screen.getByTestId('entry-nav-rail-social')).toBeTruthy();
    // Settings remains a single navigation destination after removing the
    // duplicate local identity trigger.
    fireEvent.click(screen.getByTestId('entry-settings-button'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
