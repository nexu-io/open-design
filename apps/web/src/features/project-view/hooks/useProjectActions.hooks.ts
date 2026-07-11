// Feature-local hook for the project-actions cluster: creating a new project
// from the active design system, promoting the current project into a design
// system, duplicating the project, and the plugin-duplicate-in-context
// navigate/failure callbacks. No transport of its own — every action defers
// to a caller-supplied prop callback (`onCreateProjectFromDesignSystem` etc.)
// and only owns the "in flight" busy flag + the shared project-actions toast.
import { useCallback, useState } from 'react';
import { navigate } from '../../../router';
import type { DesignSystemSummary, Project, ProjectFile } from '../../../types';
import type { useT } from '../../../i18n';
import {
  buildCreateDesignSystemFromProjectPrompt,
  designSystemNameForSourceProject,
} from '../formatters';
import type { ProjectViewTransportPort } from '../ports';

export interface ProjectActionsToast {
  message: string;
  details: string | null;
  tone?: 'default' | 'success' | 'error' | 'loading';
  ttlMs?: number;
}

export interface ProjectActionsController {
  handleCreateDesignFromActiveDesignSystem: () => void;
  createDesignFromActiveDesignSystemBusy: boolean;
  handleCreateDesignSystemFromProject: () => void;
  createDesignSystemFromProjectBusy: boolean;
  handleDuplicateProject: () => void;
  duplicateProjectBusy: boolean;
  handleNavigateToDuplicatedProject: (result: {
    projectId: string;
    conversationId: string;
    fileName: string;
  }) => void;
  handleDuplicateContextPluginFailed: () => void;
  handleProjectRename: (newName: string) => void;
}

export function useProjectActions(
  currentProject: Project,
  projectFiles: ProjectFile[],
  projectIsDesignSystemProject: boolean,
  designSystemProject: DesignSystemSummary | null,
  activeDesignSystemSummary: DesignSystemSummary | null,
  onCreateProjectFromDesignSystem: ((designSystemId: string, title: string) => Promise<void> | void) | undefined,
  onCreateDesignSystemFromProject:
    | ((sourceProjectId: string, input: { name?: string; pendingPrompt?: string }) => Promise<void> | void)
    | undefined,
  onDuplicateProject: ((sourceProjectId: string, input?: { name?: string }) => Promise<void> | void) | undefined,
  onToast: (toast: ProjectActionsToast) => void,
  t: ReturnType<typeof useT>,
  onProjectChange: (next: Project) => void,
  port: ProjectViewTransportPort,
): ProjectActionsController {
  const [createDesignFromActiveDesignSystemBusy, setCreateDesignFromActiveDesignSystemBusy] =
    useState(false);
  const [createDesignSystemFromProjectBusy, setCreateDesignSystemFromProjectBusy] = useState(false);
  const [duplicateProjectBusy, setDuplicateProjectBusy] = useState(false);

  const handleCreateDesignFromActiveDesignSystem = useCallback(() => {
    if (createDesignFromActiveDesignSystemBusy) return;
    const system = designSystemProject ?? activeDesignSystemSummary;
    if (!system || !onCreateProjectFromDesignSystem) return;
    setCreateDesignFromActiveDesignSystemBusy(true);
    void Promise.resolve(onCreateProjectFromDesignSystem(system.id, system.title)).finally(() => {
      setCreateDesignFromActiveDesignSystemBusy(false);
    });
  }, [
    activeDesignSystemSummary,
    createDesignFromActiveDesignSystemBusy,
    designSystemProject,
    onCreateProjectFromDesignSystem,
  ]);

  const handleCreateDesignSystemFromProject = useCallback(() => {
    if (
      createDesignSystemFromProjectBusy ||
      projectIsDesignSystemProject ||
      !onCreateDesignSystemFromProject
    ) {
      return;
    }
    const name = designSystemNameForSourceProject(currentProject);
    const pendingPrompt = buildCreateDesignSystemFromProjectPrompt({
      project: currentProject,
      projectFiles,
      activeDesignSystem: activeDesignSystemSummary,
    });
    setCreateDesignSystemFromProjectBusy(true);
    void Promise.resolve(onCreateDesignSystemFromProject(currentProject.id, {
      name,
      pendingPrompt,
    }))
      .catch((err) => {
        onToast({
          message: err instanceof Error ? err.message : String(err),
          details: null,
          tone: 'error',
        });
      })
      .finally(() => {
        setCreateDesignSystemFromProjectBusy(false);
      });
  }, [
    activeDesignSystemSummary,
    createDesignSystemFromProjectBusy,
    currentProject,
    onCreateDesignSystemFromProject,
    onToast,
    projectFiles,
    projectIsDesignSystemProject,
  ]);

  const handleDuplicateProject = useCallback(() => {
    if (duplicateProjectBusy || !onDuplicateProject) return;
    setDuplicateProjectBusy(true);
    void Promise.resolve(onDuplicateProject(currentProject.id, {}))
      .catch((err) => {
        onToast({
          message: err instanceof Error ? err.message : String(err),
          details: null,
          tone: 'error',
        });
      })
      .finally(() => {
        setDuplicateProjectBusy(false);
      });
  }, [currentProject.id, duplicateProjectBusy, onDuplicateProject, onToast]);

  const handleNavigateToDuplicatedProject = useCallback(
    (result: { projectId: string; conversationId: string; fileName: string }) => {
      navigate({
        kind: 'project',
        projectId: result.projectId,
        conversationId: result.conversationId,
        fileName: result.fileName,
      });
    },
    [],
  );

  const handleDuplicateContextPluginFailed = useCallback(() => {
    onToast({
      message: t('pluginCard.duplicateFailed'),
      details: null,
      tone: 'error',
      ttlMs: 3000,
    });
  }, [onToast, t]);

  const handleProjectRename = useCallback(
    (newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === currentProject.name) return;
      const metadata = currentProject.metadata
        ? { ...currentProject.metadata, nameSource: 'user' as const }
        : undefined;
      const updated: Project = {
        ...currentProject,
        name: trimmed,
        ...(metadata ? { metadata } : {}),
        updatedAt: Date.now(),
      };
      onProjectChange(updated);
      void port.patchProjectName(currentProject.id, {
        name: trimmed,
        ...(metadata ? { metadata } : {}),
      });
    },
    [currentProject, onProjectChange, port],
  );

  return {
    handleCreateDesignFromActiveDesignSystem,
    createDesignFromActiveDesignSystemBusy,
    handleCreateDesignSystemFromProject,
    createDesignSystemFromProjectBusy,
    handleDuplicateProject,
    duplicateProjectBusy,
    handleNavigateToDuplicatedProject,
    handleDuplicateContextPluginFailed,
    handleProjectRename,
  };
}
