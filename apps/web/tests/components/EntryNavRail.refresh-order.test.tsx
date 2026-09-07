// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from '@testing-library/react';
import type { ChatRunStatusResponse, WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { EntryNavRail } from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';
import { RUNS_CHANGED_EVENT } from '../../src/providers/daemon';
import type { Project } from '../../src/types';

const context = {
  workspaceId: 'ws-personal',
  workspaceType: 'personal',
  workspaceMemberId: 'wm-1',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'free',
  planId: null,
  providerMode: 'platform_credits',
  seatSummary: { seatLimit: 1, usedSeats: 1, availableSeats: 0, isSeatFull: true },
  permissions: {
    canManageMembers: true,
    canManageBilling: true,
    canInviteMembers: true,
    canManageAutoRecharge: true,
    canShareProjects: true,
    canWriteSyncedFiles: true,
    canViewWorkspaceSettings: true,
    canManageSharedResources: true,
  },
} satisfies WorkspaceCollabContext;

const projects = ['p1', 'p2'].map((id, index) => ({
  id,
  name: `Project ${id}`,
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 10 - index,
})) satisfies Project[];

type PendingRequest = {
  readonly projectId: string;
  readonly resolve: (response: Response) => void;
};

const pendingRequests: PendingRequest[] = [];

function run(
  projectId: string,
  status: ChatRunStatusResponse['status'],
  updatedAt: number,
): ChatRunStatusResponse {
  return {
    id: `${projectId}-${status}-${updatedAt}`,
    projectId,
    conversationId: null,
    assistantMessageId: null,
    agentId: 'claude',
    status,
    createdAt: updatedAt,
    updatedAt,
  };
}

async function answer(
  requestIndex: number,
  status: ChatRunStatusResponse['status'],
  updatedAt: number,
): Promise<void> {
  const request = pendingRequests[requestIndex];
  if (!request) throw new Error(`No pending request at index ${requestIndex}`);
  const body = {
    runs: [
      run(request.projectId, 'succeeded', 0),
      ...(status === 'running' ? [run(request.projectId, 'succeeded', 1)] : []),
      run(request.projectId, status, updatedAt),
    ],
    awaitingInputProjectIds: [],
  };
  await act(async () => {
    request.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  pendingRequests.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const match = /^\/api\/runs\?projectId=([^&]+)$/.exec(url);
      const encodedProjectId = match?.[1];
      if (!encodedProjectId) return Promise.resolve(new Response('{}', { status: 200 }));
      return new Promise<Response>((resolve) => {
        pendingRequests.push({ projectId: decodeURIComponent(encodedProjectId), resolve });
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('keeps a newer Running rail state when an older two-project batch completes last', async () => {
  // Given the rail starts one request per recent project.
  render(
    <I18nProvider initial="en">
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open
        context={context}
        recentProjects={projects}
      />
    </I18nProvider>,
  );
  expect(pendingRequests.map(({ projectId }) => projectId)).toEqual(['p1', 'p2']);

  // When p1's old response is held by slow p2 while a newer batch applies Running.
  await answer(0, 'succeeded', 1);
  await act(async () => window.dispatchEvent(new Event(RUNS_CHANGED_EVENT)));
  expect(pendingRequests.map(({ projectId }) => projectId)).toEqual(['p1', 'p2', 'p1', 'p2']);
  await answer(2, 'running', 2);
  await answer(3, 'succeeded', 1);
  const firstRow = screen.getAllByTestId('entry-nav-recent-item')[0];
  if (!firstRow) throw new Error('Expected the first recent project row');
  expect(within(firstRow).getByRole('img', { name: 'Running' })).toBeTruthy();

  // Then releasing old p2 cannot apply the stale whole-batch terminal snapshot for p1.
  await answer(1, 'succeeded', 1);
  expect(within(firstRow).getByRole('img', { name: 'Running' })).toBeTruthy();
});
