// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InstalledPluginRecord, WorkspaceCollabContext } from '@open-design/contracts';
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

vi.mock('../../src/collab/collab-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/collab-context')>()),
  useProjectCollabContext: () => ({
    workspaceContext: null,
    workspaceContextLoading: false,
  }),
}));

vi.mock('../../src/state/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/state/projects')>()),
  listPlugins: vi.fn(),
  applyPlugin: vi.fn(),
  resolvedWorkspaceContextForWrite: vi.fn((state: { context: WorkspaceCollabContext | null }) => state.context),
}));

import { InlinePluginsRail } from '../../src/components/InlinePluginsRail';
import { applyPlugin, listPlugins } from '../../src/state/projects';

function context(workspaceId: string): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId: `member-${workspaceId}`,
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

function plugin(title: string): InstalledPluginRecord {
  return {
    id: 'same-plugin',
    title,
    version: '1.0.0',
    trust: 'restricted',
    sourceKind: 'local',
    source: `/tmp/${title}`,
    capabilitiesGranted: [],
    manifest: { name: 'same-plugin', title, version: '1.0.0', description: title },
    fsPath: `/tmp/${title}`,
    installedAt: 0,
    updatedAt: 0,
  } as InstalledPluginRecord;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('InlinePluginsRail Workspace identity partition', () => {
  beforeEach(() => {
    workspace.context = context('workspace-a');
    workspace.loading = false;
    workspace.identityChangePending = false;
    workspace.failure = undefined;
    workspace.generation = 0;
    workspaceInvalidationHarness.handlers.length = 0;
    workspaceInvalidationHarness.onActive.length = 0;
    vi.mocked(listPlugins).mockResolvedValue([]);
    vi.mocked(applyPlugin).mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    workspaceInvalidationHarness.handlers.length = 0;
    workspaceInvalidationHarness.onActive.length = 0;
  });

  it('performs exactly one plugin read for one active-surface reconnect', async () => {
    render(<InlinePluginsRail onApplied={vi.fn()} />);
    await waitFor(() => expect(listPlugins).toHaveBeenCalledTimes(1));
    vi.mocked(listPlugins).mockClear();

    const onActive = workspaceInvalidationHarness.onActive.at(-1);
    expect(onActive).toBeTypeOf('function');
    act(() => onActive?.());

    await waitFor(() => expect(listPlugins).toHaveBeenCalledTimes(1));
  });

  it('refreshes a mounted rail after a remote Team Plugin invalidation', async () => {
    let reads = 0;
    vi.mocked(listPlugins).mockImplementation(async () => [
      plugin(reads++ === 0 ? 'Plugin before remote' : 'Plugin after remote'),
    ]);

    render(<InlinePluginsRail onApplied={vi.fn()} />);
    expect(await screen.findByTitle('Plugin before remote')).toBeTruthy();
    const resourceHandler = [...workspaceInvalidationHarness.handlers]
      .reverse()
      .find((handlers) => handlers['team-resources-changed'])?.['team-resources-changed'];
    expect(resourceHandler).toBeTypeOf('function');

    act(() => resourceHandler?.({
      type: 'team-resources-changed',
      resourceKind: 'plugin',
      resourceId: 'same-plugin',
    }));

    expect(await screen.findByTitle('Plugin after remote')).toBeTruthy();
    expect(screen.queryByTitle('Plugin before remote')).toBeNull();
    expect(listPlugins).toHaveBeenCalledTimes(2);
  });

  it('hides A synchronously while the next identity is pending', async () => {
    vi.mocked(listPlugins).mockResolvedValue([plugin('Plugin A')]);
    const view = render(<InlinePluginsRail onApplied={vi.fn()} />);
    expect(await screen.findByTitle('Plugin A')).toBeTruthy();

    workspace.identityChangePending = true;
    view.rerender(<InlinePluginsRail onApplied={vi.fn()} />);

    expect(screen.queryByTitle('Plugin A')).toBeNull();
  });

  it('re-reads when account generation changes with identical Workspace fields', async () => {
    vi.mocked(listPlugins)
      .mockResolvedValueOnce([plugin('Plugin account A')])
      .mockResolvedValueOnce([plugin('Plugin account B')]);
    const view = render(<InlinePluginsRail onApplied={vi.fn()} />);
    expect(await screen.findByTitle('Plugin account A')).toBeTruthy();

    workspace.generation += 1;
    view.rerender(<InlinePluginsRail onApplied={vi.fn()} />);

    expect(screen.queryByTitle('Plugin account A')).toBeNull();
    expect(await screen.findByTitle('Plugin account B')).toBeTruthy();
    expect(listPlugins).toHaveBeenCalledTimes(2);
  });

  it('keeps a same-id late A response out and applies only B under B authority', async () => {
    const readA = deferred<InstalledPluginRecord[]>();
    const readB = deferred<InstalledPluginRecord[]>();
    vi.mocked(listPlugins).mockImplementation(({ workspaceContext } = {}) =>
      workspaceContext?.workspaceId === 'workspace-b' ? readB.promise : readA.promise,
    );
    vi.mocked(applyPlugin).mockResolvedValue({ ok: true } as never);
    const onApplied = vi.fn();
    const view = render(<InlinePluginsRail onApplied={onApplied} />);
    await waitFor(() => expect(listPlugins).toHaveBeenCalledTimes(1));

    workspace.context = context('workspace-b');
    view.rerender(<InlinePluginsRail onApplied={onApplied} />);
    await waitFor(() => expect(listPlugins).toHaveBeenCalledTimes(2));

    await act(async () => readB.resolve([plugin('Plugin B')]));
    const cardB = await screen.findByTitle('Plugin B');
    await act(async () => readA.resolve([plugin('Plugin A')]));
    expect(screen.queryByTitle('Plugin A')).toBeNull();

    fireEvent.click(cardB);
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(onApplied.mock.calls[0]?.[0].title).toBe('Plugin B');
    expect(applyPlugin).toHaveBeenCalledWith('same-plugin', expect.objectContaining({
      workspaceContext: expect.objectContaining({ workspaceId: 'workspace-b' }),
    }));
  });

  it('clears A pending state on identity change without letting A clear B pending state', async () => {
    const applyA = deferred<{ ok: true }>();
    const applyB = deferred<{ ok: true }>();
    vi.mocked(listPlugins).mockImplementation(async ({ workspaceContext } = {}) => [
      plugin(workspaceContext?.workspaceId === 'workspace-b' ? 'Plugin B' : 'Plugin A'),
    ]);
    vi.mocked(applyPlugin).mockImplementation((_id, options) =>
      (options?.workspaceContext?.workspaceId === 'workspace-b'
        ? applyB.promise
        : applyA.promise) as never,
    );
    const onApplied = vi.fn();
    const view = render(<InlinePluginsRail onApplied={onApplied} />);

    const cardA = await screen.findByTitle('Plugin A');
    fireEvent.click(cardA);
    await waitFor(() => expect(cardA).toBeDisabled());

    workspace.context = context('workspace-b');
    view.rerender(<InlinePluginsRail onApplied={onApplied} />);
    const cardB = await screen.findByTitle('Plugin B');
    await waitFor(() => expect(cardB).not.toBeDisabled());
    fireEvent.click(cardB);
    await waitFor(() => expect(cardB).toBeDisabled());

    await act(async () => applyA.resolve({ ok: true }));
    expect(cardB).toBeDisabled();
    expect(onApplied).not.toHaveBeenCalled();

    await act(async () => applyB.resolve({ ok: true }));
    await waitFor(() => expect(cardB).not.toBeDisabled());
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(onApplied.mock.calls[0]?.[0].title).toBe('Plugin B');
  });
});
