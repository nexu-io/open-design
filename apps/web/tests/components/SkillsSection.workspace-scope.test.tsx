// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SkillSummary, WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workspace = vi.hoisted(() => ({
  context: null as WorkspaceCollabContext | null,
  loading: false,
  identityChangePending: false,
  failure: undefined as 'unsupported' | 'unavailable' | undefined,
  generation: 0,
}));

const workspaceInvalidationHarness = vi.hoisted(() => ({
  handlers: [] as Array<Record<string, (payload: any) => void>>,
  onActive: [] as Array<() => void>,
  autoActivate: true,
}));

vi.mock('../../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: vi.fn((
    handlers: Record<string, (payload: any) => void>,
    options?: { onActive?: () => void; enabled?: boolean; workspaceContext?: unknown },
  ) => {
    workspaceInvalidationHarness.handlers.push(handlers);
    if (options?.onActive) workspaceInvalidationHarness.onActive.push(options.onActive);
    const identity = JSON.stringify(options?.workspaceContext ?? null);
    React.useEffect(() => {
      if (workspaceInvalidationHarness.autoActivate && options?.enabled !== false && options?.workspaceContext) {
        options.onActive?.();
      }
    }, [identity, options?.enabled]);
    return { connected: false };
  }),
}));

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>()),
  useWorkspaceContext: () => ({
    context: workspace.context,
    loading: workspace.loading,
    identityChangePending: workspace.identityChangePending,
    failure: workspace.failure,
  }),
  currentWorkspaceAccountGeneration: () => workspace.generation,
}));

vi.mock('../../src/providers/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/registry')>()),
  fetchSkills: vi.fn(),
  fetchSkill: vi.fn(),
  fetchSkillFiles: vi.fn(),
  updateSkill: vi.fn(),
  importSkill: vi.fn(),
  deleteSkill: vi.fn(),
}));

import { SkillsSection } from '../../src/components/SkillsSection';
import { I18nProvider } from '../../src/i18n';
import {
  deleteSkill,
  fetchSkill,
  fetchSkillFiles,
  fetchSkills,
  importSkill,
  updateSkill,
} from '../../src/providers/registry';
import type { AppConfig } from '../../src/types';

const CONFIG: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: null,
  skillId: null,
  designSystemId: null,
  disabledSkills: [],
};

function context(workspaceId: string, memberId = `member-${workspaceId}`): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId: memberId,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: { seatLimit: 3, usedSeats: 2, availableSeats: 1, isSeatFull: false },
    permissions: {
      canManageMembers: false,
      canManageBilling: false,
      canInviteMembers: false,
      canManageAutoRecharge: false,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: false,
      canManageSharedResources: false,
    },
  } as WorkspaceCollabContext;
}

function skill(id: string, name = id, extra: Partial<SkillSummary> = {}): SkillSummary {
  return {
    id,
    name,
    description: name,
    triggers: [],
    mode: 'prototype',
    source: 'user',
    hasBody: true,
    ...extra,
  } as SkillSummary;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderSection(onSkillsChanged?: (id?: string) => void) {
  return render(
    <I18nProvider initial="en">
      <SkillsSection
        cfg={CONFIG}
        setCfg={vi.fn()}
        onSkillsChanged={onSkillsChanged}
      />
    </I18nProvider>,
  );
}

describe('SkillsSection Workspace identity partition', () => {
  beforeEach(() => {
    workspace.context = context('workspace-a', 'member-a');
    workspace.loading = false;
    workspace.identityChangePending = false;
    workspace.failure = undefined;
    workspace.generation = 0;
    workspaceInvalidationHarness.handlers.length = 0;
    workspaceInvalidationHarness.onActive.length = 0;
    vi.mocked(fetchSkills).mockResolvedValue([]);
    vi.mocked(fetchSkill).mockResolvedValue(null);
    vi.mocked(fetchSkillFiles).mockResolvedValue([]);
    vi.mocked(updateSkill).mockResolvedValue({ error: { message: 'unexpected update' } });
    vi.mocked(importSkill).mockResolvedValue({ error: { message: 'unexpected import' } });
    vi.mocked(deleteSkill).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    workspaceInvalidationHarness.handlers.length = 0;
    workspaceInvalidationHarness.onActive.length = 0;
  });

  it('performs exactly one skill read for one active-surface reconnect', async () => {
    renderSection();
    await waitFor(() => expect(fetchSkills).toHaveBeenCalledTimes(1));
    vi.mocked(fetchSkills).mockClear();

    const onActive = workspaceInvalidationHarness.onActive.at(-1);
    expect(onActive).toBeTypeOf('function');
    act(() => onActive?.());

    await waitFor(() => expect(fetchSkills).toHaveBeenCalledTimes(1));
  });

  it('loads Personal immediately and ignores the disabled Team lifecycle callback', async () => {
    workspace.context = {
      ...context('workspace-personal', 'member-personal'),
      workspaceType: 'personal',
      teamId: undefined,
    };

    renderSection();
    await waitFor(() => expect(fetchSkills).toHaveBeenCalledTimes(1));
    const onActive = workspaceInvalidationHarness.onActive.at(-1);
    expect(onActive).toBeTypeOf('function');
    act(() => onActive?.());
    await act(async () => Promise.resolve());
    expect(fetchSkills).toHaveBeenCalledTimes(1);
  });

  it('refreshes an already-open catalog after a remote Team Skill invalidation', async () => {
    let reads = 0;
    vi.mocked(fetchSkills).mockImplementation(async () => [
      skill(reads++ === 0 ? 'before-remote' : 'after-remote'),
    ]);

    renderSection();
    expect(await screen.findByTestId('skill-row-before-remote')).toBeTruthy();
    const resourceHandler = [...workspaceInvalidationHarness.handlers]
      .reverse()
      .find((handlers) => handlers['team-resources-changed'])?.['team-resources-changed'];
    expect(resourceHandler).toBeTypeOf('function');

    act(() => resourceHandler?.({
      type: 'team-resources-changed',
      resourceKind: 'skill',
      resourceId: 'after-remote',
    }));

    expect(await screen.findByTestId('skill-row-after-remote')).toBeTruthy();
    expect(screen.queryByTestId('skill-row-before-remote')).toBeNull();
    expect(fetchSkills).toHaveBeenCalledTimes(2);
  });

  it('discards a slow A catalog after B resolves', async () => {
    const readA = deferred<SkillSummary[]>();
    const readB = deferred<SkillSummary[]>();
    vi.mocked(fetchSkills).mockImplementation((ctx) =>
      ctx?.workspaceId === 'workspace-b' ? readB.promise : readA.promise,
    );

    const view = renderSection();
    await waitFor(() => expect(fetchSkills).toHaveBeenCalledTimes(1));

    workspace.context = context('workspace-b', 'member-b');
    view.rerender(
      <I18nProvider initial="en">
        <SkillsSection cfg={CONFIG} setCfg={vi.fn()} />
      </I18nProvider>,
    );
    await waitFor(() => expect(fetchSkills).toHaveBeenCalledTimes(2));

    await act(async () => readB.resolve([skill('skill-b')]));
    expect(await screen.findByTestId('skill-row-skill-b')).toBeTruthy();

    await act(async () => readA.resolve([skill('skill-a')]));
    expect(screen.queryByTestId('skill-row-skill-a')).toBeNull();
    expect(screen.getByTestId('skill-row-skill-b')).toBeTruthy();
  });

  it('re-reads and masks the old catalog when only account generation changes', async () => {
    vi.mocked(fetchSkills)
      .mockResolvedValueOnce([skill('account-a')])
      .mockResolvedValueOnce([skill('account-b')]);

    const view = renderSection();
    expect(await screen.findByTestId('skill-row-account-a')).toBeTruthy();

    workspace.generation += 1;
    view.rerender(
      <I18nProvider initial="en">
        <SkillsSection cfg={CONFIG} setCfg={vi.fn()} />
      </I18nProvider>,
    );

    expect(screen.queryByTestId('skill-row-account-a')).toBeNull();
    expect(await screen.findByTestId('skill-row-account-b')).toBeTruthy();
    expect(fetchSkills).toHaveBeenCalledTimes(2);
  });

  it('does not reuse same-id body or files after a Workspace switch', async () => {
    vi.mocked(fetchSkills).mockResolvedValue([skill('same-skill')]);
    vi.mocked(fetchSkill).mockImplementation(async (_id, ctx) => ({
      ...skill('same-skill'),
      body: `body-${ctx?.workspaceId}`,
    }));
    vi.mocked(fetchSkillFiles).mockImplementation(async (_id, ctx) => [{
      path: `${ctx?.workspaceId}.txt`,
      kind: 'file',
      size: 1,
    }]);

    const view = renderSection();
    let row = await screen.findByTestId('skill-row-same-skill');
    fireEvent.click(within(row).getByRole('button', { name: /same-skill/i }));
    expect(await within(row).findByText('body-workspace-a')).toBeTruthy();
    expect(await within(row).findByText('workspace-a.txt')).toBeTruthy();

    workspace.context = context('workspace-b', 'member-b');
    view.rerender(
      <I18nProvider initial="en">
        <SkillsSection cfg={CONFIG} setCfg={vi.fn()} />
      </I18nProvider>,
    );
    row = await screen.findByTestId('skill-row-same-skill');
    fireEvent.click(within(row).getByRole('button', { name: /same-skill/i }));

    expect(await within(row).findByText('body-workspace-b')).toBeTruthy();
    expect(await within(row).findByText('workspace-b.txt')).toBeTruthy();
    expect(within(row).queryByText('body-workspace-a')).toBeNull();
  });

  it('drops an edit draft on identity change instead of writing it into B', async () => {
    vi.mocked(fetchSkills).mockResolvedValue([skill('same-skill')]);
    vi.mocked(fetchSkill).mockImplementation(async (_id, ctx) => ({
      ...skill('same-skill'),
      body: `body-${ctx?.workspaceId}`,
    }));

    const view = renderSection();
    const rowA = await screen.findByTestId('skill-row-same-skill');
    fireEvent.click(within(rowA).getByTestId('skills-edit'));
    const formA = await within(rowA).findByTestId('skills-edit-form');
    const bodyField = within(formA).getAllByRole('textbox').at(-1) as HTMLTextAreaElement;
    fireEvent.change(bodyField, { target: { value: 'private draft from A' } });

    workspace.context = context('workspace-b', 'member-b');
    view.rerender(
      <I18nProvider initial="en">
        <SkillsSection cfg={CONFIG} setCfg={vi.fn()} />
      </I18nProvider>,
    );

    const rowB = await screen.findByTestId('skill-row-same-skill');
    expect(within(rowB).queryByTestId('skills-edit-form')).toBeNull();
    expect(updateSkill).not.toHaveBeenCalled();
  });

  it('does not publish A mutation completion after identity changes during refresh', async () => {
    const refreshA = deferred<SkillSummary[]>();
    vi.mocked(fetchSkills)
      .mockResolvedValueOnce([skill('same-skill')])
      .mockImplementation((ctx) =>
        ctx?.workspaceId === 'workspace-b' ? Promise.resolve([]) : refreshA.promise,
      );
    vi.mocked(fetchSkill).mockResolvedValue({
      ...skill('same-skill'),
      body: 'body-workspace-a',
    });
    vi.mocked(updateSkill).mockResolvedValue({ skill: skill('same-skill') } as never);
    const onSkillsChanged = vi.fn();

    const view = renderSection(onSkillsChanged);
    const rowA = await screen.findByTestId('skill-row-same-skill');
    fireEvent.click(within(rowA).getByTestId('skills-edit'));
    const formA = await within(rowA).findByTestId('skills-edit-form');
    fireEvent.click(within(formA).getByTestId('skills-save'));
    await waitFor(() => expect(fetchSkills).toHaveBeenCalledTimes(2));

    workspace.context = context('workspace-b', 'member-b');
    view.rerender(
      <I18nProvider initial="en">
        <SkillsSection
          cfg={CONFIG}
          setCfg={vi.fn()}
          onSkillsChanged={onSkillsChanged}
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(fetchSkills).toHaveBeenCalledTimes(3));

    await act(async () => refreshA.resolve([skill('same-skill')]));
    expect(onSkillsChanged).not.toHaveBeenCalled();
  });

  it('keeps a Team mirror readonly', async () => {
    vi.mocked(fetchSkills).mockResolvedValue([
      skill('team-skill', 'Team skill', { teamSynced: true }),
    ]);

    renderSection();
    const row = await screen.findByTestId('skill-row-team-skill');
    expect(within(row).queryByTestId('skills-edit')).toBeNull();
    expect(within(row).queryByTestId('skills-delete')).toBeNull();
  });
});
