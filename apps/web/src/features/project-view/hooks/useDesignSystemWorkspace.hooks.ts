// Feature-local hook for the design-system workspace audit & picker cluster:
// re-auditing a design-system project's packaged output after every run
// terminates (`auditDesignSystemWorkspaceAfterRun`, called from the
// not-yet-extracted run-reattach and chat-send-pipeline clusters),
// persisting the project's picked `designSystemId` with the matching
// analytics event (`handleChangeDesignSystemId`), the project-type chip
// label, and the resolved active/registry design-system summaries + the
// effect that refreshes the registry when a project's design system is
// missing from it.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { useAnalytics } from '../../../analytics/provider';
import { trackDesignSystemApplyResult } from '../../../analytics/events';
import { projectKindToTracking } from '@open-design/contracts/analytics';
import type {
  TrackingDesignSystemApplyTargetKind,
  TrackingDesignSystemOrigin,
  TrackingDesignSystemStatusValue,
} from '@open-design/contracts/analytics';
import type { useT } from '../../../i18n';
import type {
  ChatMessage,
  DesignSystemSummary,
  Project,
  SkillSummary,
} from '../../../types';
import {
  buildDesignSystemPackageAuditRepairPrompt,
  summarizeDesignSystemPackageAudit,
} from '../../../runtime/design-system-package-audit';
import { isDesignSystemWorkspaceMetadata } from '../rules';
import { fallbackDesignSystemSummaryForProject } from '../formatters';
import { projectViewTransportPort } from '../dependencies';
import type { ProjectViewTransportPort } from '../ports';
import type { SaveMessageOptions } from '../types';

export interface DesignSystemWorkspaceController {
  designSystemProject: DesignSystemSummary | null;
  designSystemProjectFromRegistry: DesignSystemSummary | null;
  activeDesignSystemSummary: DesignSystemSummary | null;
  projectTypeLabel: string | null;
  handleChangeDesignSystemId: (nextId: string | null) => void;
  auditDesignSystemWorkspaceAfterRun: (assistantMessageId: string) => Promise<void>;
}

export function useDesignSystemWorkspace(
  port: ProjectViewTransportPort,
  project: Project,
  currentProject: Project,
  projectIsDesignSystemProject: boolean,
  projectDesignSystemId: string | null,
  designSystemBrandId: string | null,
  designSystems: DesignSystemSummary[],
  skills: SkillSummary[],
  designTemplates: SkillSummary[],
  onDesignSystemsRefresh: (() => Promise<void> | void) | undefined,
  onProjectsRefresh: () => void,
  onProjectChange: (next: Project) => void,
  projectDetailRefresh: () => Promise<void>,
  refreshWorkspaceItems: () => Promise<unknown>,
  updateMessageById: (
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
    persist?: boolean,
    persistOptions?: SaveMessageOptions,
  ) => void,
  setDesignMdRefreshKey: Dispatch<SetStateAction<number>>,
  setChatSeed: (seed: { id: string; value: string } | null) => void,
  setAutoAuditRepairSeed: (seed: { id: string; value: string } | null) => void,
  track: ReturnType<typeof useAnalytics>['track'],
  t: ReturnType<typeof useT>,
): DesignSystemWorkspaceController {
  const missingDesignSystemRefreshRef = useRef<string | null>(null);

  const auditDesignSystemWorkspaceAfterRun = useCallback(
    async (assistantMessageId: string) => {
      const isDesignSystemWorkspace =
        isDesignSystemWorkspaceMetadata(currentProject.metadata) || projectIsDesignSystemProject;
      if (!isDesignSystemWorkspace) return;
      try {
        if (designSystemBrandId) {
          const outcome = await port.finalizeBrandProject(designSystemBrandId, project.id);
          if (outcome.ok) {
            await Promise.all([
              projectDetailRefresh(),
              Promise.resolve(onDesignSystemsRefresh?.()),
              refreshWorkspaceItems(),
            ]);
            onProjectsRefresh();
            setDesignMdRefreshKey((n) => n + 1);
            updateMessageById(
              assistantMessageId,
              (prev) => ({
                ...prev,
                events: [
                  ...(prev.events ?? []),
                  {
                    kind: 'status',
                    label: 'design_system',
                    detail: 'Rebuilt derived kit, assets, and registered design system from brand.json.',
                  },
                ],
              }),
              true,
              { telemetryFinalized: true },
            );
          } else {
            updateMessageById(
              assistantMessageId,
              (prev) => ({
                ...prev,
                events: [
                  ...(prev.events ?? []),
                  {
                    kind: 'status',
                    label: 'design_system',
                    detail: `Design system sync could not run: ${outcome.error}`,
                  },
                ],
              }),
              true,
              { telemetryFinalized: true },
            );
          }
        }
        const audit = await port.fetchDesignSystemPackageAudit(project.id);
        if (!audit) return;
        const auditSummary = summarizeDesignSystemPackageAudit(audit);
        updateMessageById(
          assistantMessageId,
          (prev) => ({
            ...prev,
            events: [...(prev.events ?? []), { kind: 'status', label: 'audit', detail: auditSummary }],
          }),
          true,
          { telemetryFinalized: true },
        );
        const repairPrompt = buildDesignSystemPackageAuditRepairPrompt(audit);
        if (repairPrompt) {
          if (port.consumeDesignSystemAuditAutoRepair(project.id)) {
            const seed = { id: `audit-${Date.now()}`, value: repairPrompt };
            setChatSeed(seed);
            setAutoAuditRepairSeed(seed);
          }
        } else {
          port.clearDesignSystemAuditAutoRepair(project.id);
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        updateMessageById(
          assistantMessageId,
          (prev) => ({
            ...prev,
            events: [
              ...(prev.events ?? []),
              { kind: 'status', label: 'audit', detail: `Package audit could not run: ${detail}` },
            ],
          }),
          true,
          { telemetryFinalized: true },
        );
      }
    },
    [
      currentProject.metadata,
      designSystemBrandId,
      onDesignSystemsRefresh,
      onProjectsRefresh,
      port,
      project.id,
      projectDetailRefresh,
      projectIsDesignSystemProject,
      refreshWorkspaceItems,
      setAutoAuditRepairSeed,
      setChatSeed,
      setDesignMdRefreshKey,
      updateMessageById,
    ],
  );

  const handleChangeDesignSystemId = useCallback(
    (nextId: string | null) => {
      if ((projectDesignSystemId ?? null) === nextId) return;
      // `design_system_apply_result` studio variant. The existing
      // NewProjectPanel picker fires the same event under
      // `page_name=home`; this in-project header picker fires under
      // `page_name=studio` so the funnel sees applies from both
      // surfaces. `target_project_kind` derives from
      // `project.metadata.kind`.
      const target =
        // NOTE: `target_project_kind` uses the narrower
        // `TrackingDesignSystemApplyTargetKind` enum, which intentionally does
        // NOT carry the prototype subtypes (wireframe/mobile) or `document`.
        // Derive the coarse kind here (subtypes collapse back to `prototype`)
        // so a Home-created Wireframe/Mobile/Document project never emits a
        // value outside this field's schema. The fine-grained split only
        // belongs on `project_kind` (create/run events).
        (projectKindToTracking(project.metadata?.kind ?? null, project.metadata?.videoModel) ?? 'unknown') as TrackingDesignSystemApplyTargetKind;
      const picked = nextId
        ? designSystems.find((d) => d.id === nextId)
        : null;
      const origin: TrackingDesignSystemOrigin | undefined = picked
        ? picked.source === 'user'
          ? 'manual_create'
          : picked.source === 'built-in'
            ? 'official_preset'
            : picked.source === 'installed'
              ? 'template'
              : 'unknown'
        : undefined;
      const status: TrackingDesignSystemStatusValue | undefined = picked
        ? picked.status === 'draft' || picked.status === 'published'
          ? picked.status
          : 'unknown'
        : undefined;
      if (nextId === null) {
        trackDesignSystemApplyResult(track, {
          page_name: 'studio',
          area: 'design_system_picker',
          action: 'clear_selection',
          result: 'success',
          target_project_kind: target,
          design_system_applied: false,
          design_system_selection_mode: 'none',
          is_default: false,
          is_auto_selected: false,
          available_design_system_count: designSystems.length,
          duration_ms: 0,
        });
      } else {
        trackDesignSystemApplyResult(track, {
          page_name: 'studio',
          area: 'design_system_picker',
          action: 'select_design_system',
          result: 'success',
          target_project_kind: target,
          design_system_id: nextId,
          design_system_source: origin,
          design_system_status: status,
          design_system_applied: true,
          design_system_selection_mode: 'manual',
          is_default: false,
          is_auto_selected: false,
          available_design_system_count: designSystems.length,
          duration_ms: 0,
        });
      }
      const updated: Project = {
        ...project,
        designSystemId: nextId,
        updatedAt: Date.now(),
      };
      onProjectChange(updated);
      void port.patchProjectDesignSystemId(project.id, nextId);
    },
    [project, projectDesignSystemId, onProjectChange, designSystems, track, port],
  );

  // Canonical project-type chip shown next to the editable title. We label
  // by the resolved skill/template `mode` (the real type taxonomy) rather
  // than the skill's display name, so every project kind — prototype, deck,
  // template, image, video, audio, design system — reads as one consistent,
  // short type just like "Design system". Returns null for freeform projects
  // (no resolvable type), which hides the chip.
  const projectTypeLabel = useMemo<string | null>(() => {
    if (projectIsDesignSystemProject) return t('dsManager.tabDesignSystem');
    const summary =
      skills.find((s) => s.id === project.skillId) ??
      designTemplates.find((s) => s.id === project.skillId);
    switch (summary?.mode) {
      case 'prototype':
        return t('project.typePrototype');
      case 'deck':
        return t('project.typeDeck');
      case 'template':
        return t('project.typeTemplate');
      case 'design-system':
        return t('dsManager.tabDesignSystem');
      case 'image':
        return t('project.typeImage');
      case 'video':
        return t('project.typeVideo');
      case 'audio':
        return t('project.typeAudio');
      default:
        return null;
    }
  }, [projectIsDesignSystemProject, skills, designTemplates, project.skillId, t]);

  const activeDesignSystemSummary = useMemo(() => {
    if (!projectDesignSystemId) return null;
    return designSystems.find((d) => d.id === projectDesignSystemId) ?? null;
  }, [designSystems, projectDesignSystemId]);

  const designSystemProject = useMemo(() => {
    if (!projectIsDesignSystemProject || !projectDesignSystemId) return null;
    return designSystems.find((d) => d.id === projectDesignSystemId)
      ?? fallbackDesignSystemSummaryForProject(currentProject, projectDesignSystemId);
  }, [
    currentProject,
    designSystems,
    projectDesignSystemId,
    projectIsDesignSystemProject,
  ]);
  const designSystemProjectFromRegistry = useMemo(() => {
    if (!projectIsDesignSystemProject || !projectDesignSystemId) return null;
    return designSystems.find((d) => d.id === projectDesignSystemId) ?? null;
  }, [designSystems, projectDesignSystemId, projectIsDesignSystemProject]);
  useEffect(() => {
    if (!projectIsDesignSystemProject || !projectDesignSystemId) {
      missingDesignSystemRefreshRef.current = null;
      return;
    }
    if (designSystemProjectFromRegistry) {
      missingDesignSystemRefreshRef.current = null;
      return;
    }
    if (missingDesignSystemRefreshRef.current === projectDesignSystemId) return;
    missingDesignSystemRefreshRef.current = projectDesignSystemId;
    void Promise.resolve(onDesignSystemsRefresh?.()).catch((err) => {
      missingDesignSystemRefreshRef.current = null;
      console.warn('[design-system] failed to refresh missing project design system', err);
    });
  }, [
    designSystemProjectFromRegistry,
    onDesignSystemsRefresh,
    projectDesignSystemId,
    projectIsDesignSystemProject,
  ]);

  return {
    designSystemProject,
    designSystemProjectFromRegistry,
    activeDesignSystemSummary,
    projectTypeLabel,
    handleChangeDesignSystemId,
    auditDesignSystemWorkspaceAfterRun,
  };
}

/** Wirer: binds the real project-view transport port; swap in tests. */
export function useWiredDesignSystemWorkspace(
  project: Project,
  currentProject: Project,
  projectIsDesignSystemProject: boolean,
  projectDesignSystemId: string | null,
  designSystemBrandId: string | null,
  designSystems: DesignSystemSummary[],
  skills: SkillSummary[],
  designTemplates: SkillSummary[],
  onDesignSystemsRefresh: (() => Promise<void> | void) | undefined,
  onProjectsRefresh: () => void,
  onProjectChange: (next: Project) => void,
  projectDetailRefresh: () => Promise<void>,
  refreshWorkspaceItems: () => Promise<unknown>,
  updateMessageById: (
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
    persist?: boolean,
    persistOptions?: SaveMessageOptions,
  ) => void,
  setDesignMdRefreshKey: Dispatch<SetStateAction<number>>,
  setChatSeed: (seed: { id: string; value: string } | null) => void,
  setAutoAuditRepairSeed: (seed: { id: string; value: string } | null) => void,
  track: ReturnType<typeof useAnalytics>['track'],
  t: ReturnType<typeof useT>,
): DesignSystemWorkspaceController {
  return useDesignSystemWorkspace(
    projectViewTransportPort,
    project,
    currentProject,
    projectIsDesignSystemProject,
    projectDesignSystemId,
    designSystemBrandId,
    designSystems,
    skills,
    designTemplates,
    onDesignSystemsRefresh,
    onProjectsRefresh,
    onProjectChange,
    projectDetailRefresh,
    refreshWorkspaceItems,
    updateMessageById,
    setDesignMdRefreshKey,
    setChatSeed,
    setAutoAuditRepairSeed,
    track,
    t,
  );
}
