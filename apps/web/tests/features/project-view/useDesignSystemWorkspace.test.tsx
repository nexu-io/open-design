// @vitest-environment jsdom
//
// Design-system workspace audit & picker: re-auditing a design-system
// project's packaged output after every run (`auditDesignSystemWorkspaceAfterRun`),
// persisting a picked `designSystemId` with its analytics event
// (`handleChangeDesignSystemId`), the project-type chip label, and the
// resolved active/registry design-system summaries + the effect that
// refreshes the registry when a project's design system is missing from it.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Dispatch, SetStateAction } from 'react';
import type {
  ChatMessage,
  DesignSystemSummary,
  Project,
  SkillSummary,
} from '../../../src/types';
import type { DesignSystemPackageAudit } from '@open-design/contracts';

import { useDesignSystemWorkspace } from '../../../src/features/project-view/hooks/useDesignSystemWorkspace.hooks';
import type { ProjectViewTransportPort } from '../../../src/features/project-view/ports';

function makePort(overrides: Partial<ProjectViewTransportPort> = {}): ProjectViewTransportPort {
  return {
    readProjectRawText: vi.fn(async () => null),
    extractMemory: vi.fn(async () => {}),
    loadQueuedChatSends: vi.fn(() => []),
    saveQueuedChatSends: vi.fn(),
    readSavedChatPanelWidth: vi.fn(() => 460),
    saveChatPanelWidth: vi.fn(),
    hasAutoSendFirstMessageFlag: vi.fn(() => false),
    readAmrGateOkFlag: vi.fn(() => false),
    readAutoSendAttachments: vi.fn(() => []),
    readAutoSendContext: vi.fn(() => null),
    clearAutoSendSession: vi.fn(),
    markDesignSystemAuditAutoRepairEligible: vi.fn(),
    consumeDesignSystemAuditAutoRepair: vi.fn(() => false),
    clearDesignSystemAuditAutoRepair: vi.fn(),
    subscribeSplitResize: vi.fn(() => () => {}),
    getSplitIsRtl: vi.fn(() => false),
    subscribeChatPanelPointerDrag: vi.fn(() => () => {}),
    checkGithubConnected: vi.fn(async () => false),
    subscribeGithubConnectRefreshTriggers: vi.fn(() => () => {}),
    fetchAppliedPluginSnapshot: vi.fn(async () => null),
    listPlugins: vi.fn(async () => []),
    duplicatePluginAsProject: vi.fn(async () => {
      throw new Error('not implemented in this fake');
    }),
    copyTextToClipboard: vi.fn(async () => true),
    subscribeCapturedKeyDown: vi.fn(() => () => {}),
    patchProjectMetadata: vi.fn(async () => {}),
    patchProjectName: vi.fn(async () => {}),
    listConversations: vi.fn(async () => []),
    createConversation: vi.fn(async () => null),
    patchConversation: vi.fn(async () => null),
    deleteConversation: vi.fn(async () => true),
    fetchRunStatus: vi.fn(async () => null),
    subscribeBufferedTextFlushTriggers: vi.fn(() => () => {}),
    isDocumentHidden: vi.fn(() => false),
    isDocumentFocused: vi.fn(() => true),
    focusWindow: vi.fn(),
    listMessages: vi.fn(async () => []),
    saveMessage: vi.fn(async () => {}),
    fetchPreviewComments: vi.fn(async () => []),
    uploadPreviewCommentImages: vi.fn(async () => []),
    savePreviewComment: vi.fn(async () => null),
    patchPreviewCommentStatus: vi.fn(async () => null),
    deletePreviewComment: vi.fn(async () => true),
    loadOpenTabs: vi.fn(async () => ({ tabs: [], active: null })),
    cacheOpenTabsLocally: vi.fn((_projectId, state) => state),
    persistOpenTabsToDaemon: vi.fn(async () => {}),
    fetchProjectFiles: vi.fn(async () => []),
    fetchLiveArtifacts: vi.fn(async () => []),
    writeProjectTextFile: vi.fn(async () => null),
    subscribeProjectFileEvents: vi.fn(() => () => {}),
    fetchProjectFileText: vi.fn(async () => null),
    installGeneratedPluginFolder: vi.fn(async () => ({ ok: true, message: 'installed', warnings: [], log: [] })),
    startGeneratedPluginShareTask: vi.fn(async () => {
      throw new Error('not implemented in this fake');
    }),
    waitGeneratedPluginShareTask: vi.fn(async () => {
      throw new Error('not implemented in this fake');
    }),
    finalizeBrandProject: vi.fn(async () => ({ ok: true as const, result: {} as never })),
    fetchDesignSystemPackageAudit: vi.fn(async () => null),
    patchProjectDesignSystemId: vi.fn(async () => {}),
    fetchAmrLoginStatus: vi.fn(async () => ({ loggedIn: false })),
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Project One',
    skillId: null,
    pendingPrompt: null,
    metadata: null,
    appliedPluginSnapshotId: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  } as unknown as Project;
}

function makeDesignSystem(overrides: Partial<DesignSystemSummary> = {}): DesignSystemSummary {
  return {
    id: 'ds1',
    title: 'DS One',
    source: 'user',
    status: 'draft',
    ...overrides,
  } as unknown as DesignSystemSummary;
}

function makeAudit(overrides: Partial<DesignSystemPackageAudit> = {}): DesignSystemPackageAudit {
  return {
    ok: true,
    projectPath: '/tmp/p1',
    filesInspected: 3,
    errors: [],
    warnings: [],
    ...overrides,
  };
}

const noopT = ((key: string) => key) as never;

function renderDesignSystemWorkspace(
  overrides: {
    port?: ProjectViewTransportPort;
    project?: Project;
    currentProject?: Project;
    projectIsDesignSystemProject?: boolean;
    projectDesignSystemId?: string | null;
    designSystemBrandId?: string | null;
    designSystems?: DesignSystemSummary[];
    skills?: SkillSummary[];
    designTemplates?: SkillSummary[];
    onDesignSystemsRefresh?: () => Promise<void> | void;
    onProjectsRefresh?: () => void;
    onProjectChange?: (next: Project) => void;
    projectDetailRefresh?: () => Promise<void>;
    refreshWorkspaceItems?: () => Promise<unknown>;
    updateMessageById?: (
      messageId: string,
      updater: (message: ChatMessage) => ChatMessage,
      persist?: boolean,
      persistOptions?: { telemetryFinalized?: boolean },
    ) => void;
    setDesignMdRefreshKey?: Dispatch<SetStateAction<number>>;
    setChatSeed?: (seed: { id: string; value: string } | null) => void;
    setAutoAuditRepairSeed?: (seed: { id: string; value: string } | null) => void;
    track?: (event: string, properties: Record<string, unknown>) => void;
  } = {},
) {
  const port = overrides.port ?? makePort();
  const project = overrides.project ?? makeProject();
  const onProjectChange = overrides.onProjectChange ?? vi.fn();
  const onProjectsRefresh = overrides.onProjectsRefresh ?? vi.fn();
  const onDesignSystemsRefresh = overrides.onDesignSystemsRefresh ?? vi.fn(async () => {});
  const projectDetailRefresh = overrides.projectDetailRefresh ?? vi.fn(async () => {});
  const refreshWorkspaceItems = overrides.refreshWorkspaceItems ?? vi.fn(async () => []);
  const updateMessageById = overrides.updateMessageById ?? vi.fn();
  const setDesignMdRefreshKey = overrides.setDesignMdRefreshKey ?? vi.fn();
  const setChatSeed = overrides.setChatSeed ?? vi.fn();
  const setAutoAuditRepairSeed = overrides.setAutoAuditRepairSeed ?? vi.fn();
  const track = overrides.track ?? vi.fn();
  const rendered = renderHook(() =>
    useDesignSystemWorkspace(
      port,
      project,
      overrides.currentProject ?? project,
      overrides.projectIsDesignSystemProject ?? false,
      overrides.projectDesignSystemId === undefined ? null : overrides.projectDesignSystemId,
      overrides.designSystemBrandId === undefined ? null : overrides.designSystemBrandId,
      overrides.designSystems ?? [],
      overrides.skills ?? [],
      overrides.designTemplates ?? [],
      onDesignSystemsRefresh,
      onProjectsRefresh,
      onProjectChange,
      projectDetailRefresh,
      refreshWorkspaceItems,
      updateMessageById,
      setDesignMdRefreshKey,
      setChatSeed,
      setAutoAuditRepairSeed,
      track as never,
      noopT,
    ),
  );
  return {
    ...rendered,
    port,
    project,
    onProjectChange,
    onProjectsRefresh,
    onDesignSystemsRefresh,
    projectDetailRefresh,
    refreshWorkspaceItems,
    updateMessageById,
    setDesignMdRefreshKey,
    setChatSeed,
    setAutoAuditRepairSeed,
    track,
  };
}

describe('useDesignSystemWorkspace', () => {
  describe('projectTypeLabel', () => {
    it('returns the design-system label when the project is a design-system project', () => {
      const { result } = renderDesignSystemWorkspace({ projectIsDesignSystemProject: true });
      expect(result.current.projectTypeLabel).toBe('dsManager.tabDesignSystem');
    });

    it('resolves the label from the matched skill mode', () => {
      const project = makeProject({ skillId: 'skill-1' });
      const skills = [{ id: 'skill-1', mode: 'prototype' } as unknown as SkillSummary];
      const { result } = renderDesignSystemWorkspace({ project, skills });
      expect(result.current.projectTypeLabel).toBe('project.typePrototype');
    });

    it('falls back to designTemplates when no skill matches', () => {
      const project = makeProject({ skillId: 'tmpl-1' });
      const designTemplates = [{ id: 'tmpl-1', mode: 'deck' } as unknown as SkillSummary];
      const { result } = renderDesignSystemWorkspace({ project, designTemplates });
      expect(result.current.projectTypeLabel).toBe('project.typeDeck');
    });

    it('returns null for a freeform project with no resolvable type', () => {
      const { result } = renderDesignSystemWorkspace({ project: makeProject({ skillId: null }) });
      expect(result.current.projectTypeLabel).toBeNull();
    });
  });

  describe('design-system summaries', () => {
    it('resolves activeDesignSystemSummary from the registry by id', () => {
      const ds = makeDesignSystem({ id: 'ds1' });
      const { result } = renderDesignSystemWorkspace({
        projectDesignSystemId: 'ds1',
        designSystems: [ds],
      });
      expect(result.current.activeDesignSystemSummary).toBe(ds);
    });

    it('is null when the project has no active designSystemId', () => {
      const { result } = renderDesignSystemWorkspace({ projectDesignSystemId: null });
      expect(result.current.activeDesignSystemSummary).toBeNull();
    });

    it('designSystemProject is null unless the project is a design-system project', () => {
      const ds = makeDesignSystem({ id: 'ds1' });
      const { result } = renderDesignSystemWorkspace({
        projectIsDesignSystemProject: false,
        projectDesignSystemId: 'ds1',
        designSystems: [ds],
      });
      expect(result.current.designSystemProject).toBeNull();
    });

    it('designSystemProject resolves from the registry when the project is a design-system project', () => {
      const ds = makeDesignSystem({ id: 'ds1' });
      const { result } = renderDesignSystemWorkspace({
        projectIsDesignSystemProject: true,
        projectDesignSystemId: 'ds1',
        designSystems: [ds],
      });
      expect(result.current.designSystemProject).toBe(ds);
      expect(result.current.designSystemProjectFromRegistry).toBe(ds);
    });

    it('triggers a registry refresh when the project design system is missing from the registry', () => {
      const onDesignSystemsRefresh = vi.fn(async () => {});
      renderDesignSystemWorkspace({
        projectIsDesignSystemProject: true,
        projectDesignSystemId: 'ds-missing',
        designSystems: [],
        onDesignSystemsRefresh,
      });
      expect(onDesignSystemsRefresh).toHaveBeenCalledOnce();
    });

    it('does not re-trigger the refresh for the same missing id across re-renders', () => {
      const onDesignSystemsRefresh = vi.fn(async () => {});
      const { rerender } = renderHook(
        () => {
          const port = makePort();
          return useDesignSystemWorkspace(
            port,
            makeProject(),
            makeProject(),
            true,
            'ds-missing',
            null,
            [],
            [],
            [],
            onDesignSystemsRefresh,
            vi.fn(),
            vi.fn(),
            vi.fn(async () => {}),
            vi.fn(async () => []),
            vi.fn(),
            vi.fn(),
            vi.fn(),
            vi.fn(),
            vi.fn() as never,
            noopT,
          );
        },
      );
      rerender();
      expect(onDesignSystemsRefresh).toHaveBeenCalledOnce();
    });
  });

  describe('handleChangeDesignSystemId', () => {
    it('is a no-op when the next id equals the current id', () => {
      const onProjectChange = vi.fn();
      const port = makePort();
      const { result } = renderDesignSystemWorkspace({ projectDesignSystemId: 'ds1', onProjectChange, port });
      act(() => result.current.handleChangeDesignSystemId('ds1'));
      expect(onProjectChange).not.toHaveBeenCalled();
      expect(port.patchProjectDesignSystemId).not.toHaveBeenCalled();
    });

    it('clears the selection, tracking a clear_selection event', () => {
      const onProjectChange = vi.fn();
      const track = vi.fn();
      const port = makePort();
      const { result } = renderDesignSystemWorkspace({
        projectDesignSystemId: 'ds1',
        onProjectChange,
        track,
        port,
      });
      act(() => result.current.handleChangeDesignSystemId(null));
      expect(onProjectChange).toHaveBeenCalledOnce();
      const updated = onProjectChange.mock.calls[0]![0] as Project;
      expect(updated.designSystemId).toBeNull();
      expect(port.patchProjectDesignSystemId).toHaveBeenCalledWith('p1', null);
      expect(track).toHaveBeenCalledWith(
        'design_system_apply_result',
        expect.objectContaining({ action: 'clear_selection' }),
        undefined,
      );
    });

    it('selects a new design system, tracking a select_design_system event', () => {
      const onProjectChange = vi.fn();
      const track = vi.fn();
      const port = makePort();
      const ds = makeDesignSystem({ id: 'ds2', source: 'built-in', status: 'published' });
      const { result } = renderDesignSystemWorkspace({
        projectDesignSystemId: 'ds1',
        designSystems: [ds],
        onProjectChange,
        track,
        port,
      });
      act(() => result.current.handleChangeDesignSystemId('ds2'));
      expect(onProjectChange).toHaveBeenCalledOnce();
      const updated = onProjectChange.mock.calls[0]![0] as Project;
      expect(updated.designSystemId).toBe('ds2');
      expect(port.patchProjectDesignSystemId).toHaveBeenCalledWith('p1', 'ds2');
      expect(track).toHaveBeenCalledWith(
        'design_system_apply_result',
        expect.objectContaining({
          action: 'select_design_system',
          design_system_id: 'ds2',
          design_system_source: 'official_preset',
          design_system_status: 'published',
        }),
        undefined,
      );
    });
  });

  describe('auditDesignSystemWorkspaceAfterRun', () => {
    it('is a no-op when neither the metadata nor the project flag mark it a design-system workspace', async () => {
      const port = makePort();
      const { result } = renderDesignSystemWorkspace({ port, projectIsDesignSystemProject: false });
      await act(async () => {
        await result.current.auditDesignSystemWorkspaceAfterRun('m1');
      });
      expect(port.finalizeBrandProject).not.toHaveBeenCalled();
      expect(port.fetchDesignSystemPackageAudit).not.toHaveBeenCalled();
    });

    it('finalizes the brand project, refreshes, and posts a design_system status event on success', async () => {
      const port = makePort({
        finalizeBrandProject: vi.fn(async () => ({ ok: true as const, result: {} as never })),
        fetchDesignSystemPackageAudit: vi.fn(async () => null),
      });
      const onProjectsRefresh = vi.fn();
      const projectDetailRefresh = vi.fn(async () => {});
      const refreshWorkspaceItems = vi.fn(async () => []);
      const setDesignMdRefreshKey = vi.fn();
      const updateMessageById = vi.fn();
      const { result } = renderDesignSystemWorkspace({
        port,
        projectIsDesignSystemProject: true,
        designSystemBrandId: 'brand-1',
        onProjectsRefresh,
        projectDetailRefresh,
        refreshWorkspaceItems,
        setDesignMdRefreshKey,
        updateMessageById,
      });
      await act(async () => {
        await result.current.auditDesignSystemWorkspaceAfterRun('m1');
      });
      expect(port.finalizeBrandProject).toHaveBeenCalledWith('brand-1', 'p1');
      expect(projectDetailRefresh).toHaveBeenCalledOnce();
      expect(refreshWorkspaceItems).toHaveBeenCalledOnce();
      expect(onProjectsRefresh).toHaveBeenCalledOnce();
      expect(setDesignMdRefreshKey).toHaveBeenCalledOnce();
      expect(updateMessageById).toHaveBeenCalledWith(
        'm1',
        expect.any(Function),
        true,
        { telemetryFinalized: true },
      );
    });

    it('posts a failure status event when finalizing the brand project fails', async () => {
      const port = makePort({
        finalizeBrandProject: vi.fn(async () => ({ ok: false as const, error: 'boom' })),
        fetchDesignSystemPackageAudit: vi.fn(async () => null),
      });
      const updateMessageById = vi.fn();
      const { result } = renderDesignSystemWorkspace({
        port,
        projectIsDesignSystemProject: true,
        designSystemBrandId: 'brand-1',
        updateMessageById,
      });
      await act(async () => {
        await result.current.auditDesignSystemWorkspaceAfterRun('m1');
      });
      const [, updater] = updateMessageById.mock.calls[0]!;
      const next = updater({ id: 'm1', role: 'assistant', content: '', events: [] } as unknown as ChatMessage);
      expect(JSON.stringify(next)).toContain('Design system sync could not run: boom');
    });

    it('returns early when the package audit is unavailable', async () => {
      const port = makePort({ fetchDesignSystemPackageAudit: vi.fn(async () => null) });
      const updateMessageById = vi.fn();
      const { result } = renderDesignSystemWorkspace({
        port,
        projectIsDesignSystemProject: true,
        updateMessageById,
      });
      await act(async () => {
        await result.current.auditDesignSystemWorkspaceAfterRun('m1');
      });
      expect(port.fetchDesignSystemPackageAudit).toHaveBeenCalledWith('p1');
      expect(updateMessageById).not.toHaveBeenCalled();
    });

    it('posts an audit-summary status event and arms auto-repair when the audit has findings and auto-repair is eligible', async () => {
      const audit = makeAudit({
        ok: false,
        errors: [{ severity: 'error', code: 'missing_file', message: 'DESIGN.md missing' }],
      });
      const port = makePort({
        fetchDesignSystemPackageAudit: vi.fn(async () => audit),
        consumeDesignSystemAuditAutoRepair: vi.fn(() => true),
      });
      const setChatSeed = vi.fn();
      const setAutoAuditRepairSeed = vi.fn();
      const updateMessageById = vi.fn();
      const { result } = renderDesignSystemWorkspace({
        port,
        projectIsDesignSystemProject: true,
        setChatSeed,
        setAutoAuditRepairSeed,
        updateMessageById,
      });
      await act(async () => {
        await result.current.auditDesignSystemWorkspaceAfterRun('m1');
      });
      expect(updateMessageById).toHaveBeenCalledWith(
        'm1',
        expect.any(Function),
        true,
        { telemetryFinalized: true },
      );
      expect(setChatSeed).toHaveBeenCalledOnce();
      expect(setAutoAuditRepairSeed).toHaveBeenCalledOnce();
    });

    it('catches a thrown error and posts a package-audit-could-not-run status event', async () => {
      const port = makePort({
        fetchDesignSystemPackageAudit: vi.fn(async () => {
          throw new Error('network down');
        }),
      });
      const updateMessageById = vi.fn();
      const { result } = renderDesignSystemWorkspace({
        port,
        projectIsDesignSystemProject: true,
        updateMessageById,
      });
      await act(async () => {
        await result.current.auditDesignSystemWorkspaceAfterRun('m1');
      });
      const [, updater] = updateMessageById.mock.calls[0]!;
      const next = updater({ id: 'm1', role: 'assistant', content: '', events: [] } as unknown as ChatMessage);
      expect(JSON.stringify(next)).toContain('Package audit could not run: network down');
    });
  });
});
