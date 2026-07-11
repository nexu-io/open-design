// @vitest-environment jsdom
//
// The project-actions cluster (create design from active design system,
// promote a project into a design system, duplicate the project, and the
// plugin-duplicate-in-context navigate/failure callbacks). No transport port
// — every action defers to a caller-supplied prop callback.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DesignSystemSummary, Project, ProjectFile } from '../../../src/types';

import { useProjectActions } from '../../../src/features/project-view/hooks/useProjectActions.hooks';

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
    ...overrides,
  } as unknown as DesignSystemSummary;
}

const noopT = ((key: string) => key) as never;

describe('useProjectActions', () => {
  describe('handleCreateDesignFromActiveDesignSystem', () => {
    it('is a no-op when there is no active design system', () => {
      const onCreate = vi.fn();
      const { result } = renderHook(() =>
        useProjectActions(
          makeProject(),
          [] as ProjectFile[],
          false,
          null,
          null,
          onCreate,
          undefined,
          undefined,
          vi.fn(),
          noopT,
        ),
      );
      act(() => result.current.handleCreateDesignFromActiveDesignSystem());
      expect(onCreate).not.toHaveBeenCalled();
    });

    it('calls onCreateProjectFromDesignSystem with the resolved system and toggles busy', async () => {
      const onCreate = vi.fn(async () => {});
      const system = makeDesignSystem();
      const { result } = renderHook(() =>
        useProjectActions(
          makeProject(),
          [] as ProjectFile[],
          false,
          system,
          null,
          onCreate,
          undefined,
          undefined,
          vi.fn(),
          noopT,
        ),
      );
      expect(result.current.createDesignFromActiveDesignSystemBusy).toBe(false);
      await act(async () => {
        result.current.handleCreateDesignFromActiveDesignSystem();
        await Promise.resolve();
      });
      expect(onCreate).toHaveBeenCalledWith('ds1', 'DS One');
      expect(result.current.createDesignFromActiveDesignSystemBusy).toBe(false);
    });

    it('falls back to activeDesignSystemSummary when designSystemProject is null', async () => {
      const onCreate = vi.fn(async () => {});
      const active = makeDesignSystem({ id: 'ds2', title: 'DS Two' });
      const { result } = renderHook(() =>
        useProjectActions(
          makeProject(),
          [] as ProjectFile[],
          false,
          null,
          active,
          onCreate,
          undefined,
          undefined,
          vi.fn(),
          noopT,
        ),
      );
      await act(async () => {
        result.current.handleCreateDesignFromActiveDesignSystem();
        await Promise.resolve();
      });
      expect(onCreate).toHaveBeenCalledWith('ds2', 'DS Two');
    });
  });

  describe('handleCreateDesignSystemFromProject', () => {
    it('is a no-op when the project is already a design system project', () => {
      const onCreate = vi.fn();
      const { result } = renderHook(() =>
        useProjectActions(
          makeProject(),
          [] as ProjectFile[],
          true,
          null,
          null,
          undefined,
          onCreate,
          undefined,
          vi.fn(),
          noopT,
        ),
      );
      act(() => result.current.handleCreateDesignSystemFromProject());
      expect(onCreate).not.toHaveBeenCalled();
    });

    it('calls onCreateDesignSystemFromProject with a name and pending prompt', async () => {
      const onCreate = vi.fn(async (_sourceProjectId: string, _input: { name?: string; pendingPrompt?: string }) => {});
      const project = makeProject({ name: 'Acme' });
      const { result } = renderHook(() =>
        useProjectActions(
          project,
          [] as ProjectFile[],
          false,
          null,
          null,
          undefined,
          onCreate,
          undefined,
          vi.fn(),
          noopT,
        ),
      );
      await act(async () => {
        result.current.handleCreateDesignSystemFromProject();
        await Promise.resolve();
      });
      expect(onCreate).toHaveBeenCalledOnce();
      const [sourceProjectId, input] = onCreate.mock.calls[0]!;
      expect(sourceProjectId).toBe('p1');
      expect(typeof input?.name).toBe('string');
      expect(typeof input?.pendingPrompt).toBe('string');
    });

    it('surfaces a toast on failure', async () => {
      const onCreate = vi.fn(async () => {
        throw new Error('boom');
      });
      const onToast = vi.fn();
      const { result } = renderHook(() =>
        useProjectActions(
          makeProject(),
          [] as ProjectFile[],
          false,
          null,
          null,
          undefined,
          onCreate,
          undefined,
          onToast,
          noopT,
        ),
      );
      await act(async () => {
        result.current.handleCreateDesignSystemFromProject();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(onToast).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'boom', tone: 'error' }),
      );
      expect(result.current.createDesignSystemFromProjectBusy).toBe(false);
    });
  });

  describe('handleDuplicateProject', () => {
    it('is a no-op when onDuplicateProject is not provided', () => {
      const { result } = renderHook(() =>
        useProjectActions(
          makeProject(),
          [] as ProjectFile[],
          false,
          null,
          null,
          undefined,
          undefined,
          undefined,
          vi.fn(),
          noopT,
        ),
      );
      act(() => result.current.handleDuplicateProject());
      expect(result.current.duplicateProjectBusy).toBe(false);
    });

    it('calls onDuplicateProject with the current project id', async () => {
      const onDuplicate = vi.fn(async () => {});
      const { result } = renderHook(() =>
        useProjectActions(
          makeProject({ id: 'p9' }),
          [] as ProjectFile[],
          false,
          null,
          null,
          undefined,
          undefined,
          onDuplicate,
          vi.fn(),
          noopT,
        ),
      );
      await act(async () => {
        result.current.handleDuplicateProject();
        await Promise.resolve();
      });
      expect(onDuplicate).toHaveBeenCalledWith('p9', {});
    });

    it('surfaces a toast on failure', async () => {
      const onDuplicate = vi.fn(async () => {
        throw new Error('dup failed');
      });
      const onToast = vi.fn();
      const { result } = renderHook(() =>
        useProjectActions(
          makeProject(),
          [] as ProjectFile[],
          false,
          null,
          null,
          undefined,
          undefined,
          onDuplicate,
          onToast,
          noopT,
        ),
      );
      await act(async () => {
        result.current.handleDuplicateProject();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(onToast).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'dup failed', tone: 'error' }),
      );
    });
  });

  describe('handleNavigateToDuplicatedProject', () => {
    it('navigates to the duplicated project route', () => {
      const { result } = renderHook(() =>
        useProjectActions(
          makeProject(),
          [] as ProjectFile[],
          false,
          null,
          null,
          undefined,
          undefined,
          undefined,
          vi.fn(),
          noopT,
        ),
      );
      act(() => {
        result.current.handleNavigateToDuplicatedProject({
          projectId: 'p2',
          conversationId: 'c1',
          fileName: 'a/b.txt',
        });
      });
      expect(window.location.pathname).toBe('/projects/p2/conversations/c1/files/a/b.txt');
    });
  });

  describe('handleDuplicateContextPluginFailed', () => {
    it('surfaces a translated error toast', () => {
      const onToast = vi.fn();
      const t = ((key: string) => `translated:${key}`) as never;
      const { result } = renderHook(() =>
        useProjectActions(
          makeProject(),
          [] as ProjectFile[],
          false,
          null,
          null,
          undefined,
          undefined,
          undefined,
          onToast,
          t,
        ),
      );
      act(() => result.current.handleDuplicateContextPluginFailed());
      expect(onToast).toHaveBeenCalledWith({
        message: 'translated:pluginCard.duplicateFailed',
        details: null,
        tone: 'error',
        ttlMs: 3000,
      });
    });
  });
});
