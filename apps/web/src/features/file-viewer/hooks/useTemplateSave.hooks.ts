// Feature-local hook for the "Save as template" flow: snapshots the whole
// project as a reusable template. Owns the modal's state, the click->result
// analytics correlation (a template session emits exactly one terminal
// success/failed/cancelled, whether it ends in a save or a modal dismiss),
// and the onboarding first-loop "delivered" signal on a successful save.
import { useId, useRef, useState } from 'react';
import {
  anonymizeArtifactId,
  artifactKindToTracking,
  type TrackingProjectKind,
} from '@open-design/contracts/analytics';
import { trackArtifactExportResult, trackShareOptionPopoverClick } from '../../../analytics/events';
import { recordFirstLoopStep } from '../../../onboarding/first-loop';
import { templateSavePort as realTemplateSavePort } from '../dependencies';
import { defaultTemplateName } from '../formatters';
import type { TemplateSavePort } from '../ports';
import type { TemplateSaveAnalytics, TranslateFn } from '../types';

export interface TemplateSaveDeps {
  projectId: string;
  projectKind: TrackingProjectKind;
  fileName: string;
  fileKind: string | null;
  t: TranslateFn;
  analytics: TemplateSaveAnalytics;
  /** Save-as-template is surfaced from the Download menu; opening the modal closes it. */
  closeDownloadMenu: () => void;
}

export interface TemplateSaveController {
  savingTemplate: boolean;
  templateNote: string | null;
  templateModalOpen: boolean;
  templateName: string;
  setTemplateName: (name: string) => void;
  templateNameId: string;
  templateDescription: string;
  setTemplateDescription: (description: string) => void;
  templateDescriptionId: string;
  templateSaveError: string | null;
  templateSavedToast: string | null;
  dismissTemplateSavedToast: () => void;
  openSaveAsTemplateModal: () => void;
  cancelSaveAsTemplateModal: () => void;
  handleSaveAsTemplate: () => Promise<void>;
}

export function useTemplateSave(
  port: TemplateSavePort,
  deps: TemplateSaveDeps,
): TemplateSaveController {
  const { projectId, projectKind, fileName, fileKind, t, analytics, closeDownloadMenu } = deps;

  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateNote, setTemplateNote] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateSaveError, setTemplateSaveError] = useState<string | null>(null);
  const [templateSavedToast, setTemplateSavedToast] = useState<string | null>(null);
  const templateNameId = useId();
  const templateDescriptionId = useId();

  // Same click->result correlation as the other share-menu exports, but the
  // export result fires only after the template is actually saved (not on
  // open) — reset on every openSaveAsTemplateModal call.
  const templateExportRequestIdRef = useRef<string | null>(null);
  const templateExportStartedRef = useRef(0);
  const templateExportResolvedRef = useRef(false);

  const artifactId = () => anonymizeArtifactId({ projectId, fileName });
  const artifactKind = () => artifactKindToTracking({ fileKind });

  const openSaveAsTemplateModal = () => {
    closeDownloadMenu();
    const requestId = analytics.newRequestId();
    templateExportRequestIdRef.current = requestId;
    templateExportStartedRef.current = performance.now();
    templateExportResolvedRef.current = false;
    trackShareOptionPopoverClick(
      analytics.track,
      {
        page_name: 'artifact',
        area: 'share_option_popover',
        artifact_id: artifactId(),
        artifact_kind: artifactKind(),
        element: 'template',
        project_id: projectId,
        project_kind: projectKind,
      },
      { requestId },
    );
    setTemplateName(defaultTemplateName(fileName, t));
    setTemplateDescription('');
    setTemplateSaveError(null);
    setTemplateModalOpen(true);
  };

  const fireTemplateExportResult = (result: 'success' | 'failed' | 'cancelled', errorCode?: string) => {
    if (templateExportResolvedRef.current) return;
    templateExportResolvedRef.current = true;
    const requestId = templateExportRequestIdRef.current ?? analytics.newRequestId();
    const started = templateExportStartedRef.current || performance.now();
    trackArtifactExportResult(
      analytics.track,
      {
        page_name: 'artifact',
        area: 'share_option_popover',
        artifact_id: artifactId(),
        artifact_kind: artifactKind(),
        export_format: 'template',
        result,
        ...(errorCode ? { error_code: errorCode } : {}),
        export_duration_ms: Math.round(performance.now() - started),
        project_id: projectId,
        project_kind: projectKind,
      },
      { requestId },
    );
    // Onboarding first-loop delivered step (spec S8.3): only a SUCCESSFUL
    // template export closes the loop. Project-scoped no-op unless started
    // from Home.
    if (result === 'success') recordFirstLoopStep(analytics.track, 'delivered', projectId);
  };

  const cancelSaveAsTemplateModal = () => {
    // Dismissed without saving — close the ui_click(template)->result funnel
    // as cancelled.
    fireTemplateExportResult('cancelled', 'MODAL_DISMISSED');
    setTemplateModalOpen(false);
    setTemplateSaveError(null);
  };

  const handleSaveAsTemplate = async () => {
    const name = templateName.trim();
    if (!name) return;
    setSavingTemplate(true);
    setTemplateNote(null);
    setTemplateSaveError(null);
    let savedName: string | null = null;
    // Default to failed; flips to success only when the save resolves. The
    // finally block reports exactly one artifact_export_result(template),
    // covering the !tpl branch and any thrown error too.
    let templateOutcome: 'success' | 'failed' = 'failed';
    let templateErrorCode: string | undefined = 'UNKNOWN';
    try {
      const tpl = await port.saveTemplate({
        name,
        description: templateDescription.trim() || undefined,
        sourceProjectId: projectId,
      });
      if (!tpl) {
        setTemplateSaveError(t('fileViewer.savedTemplateFail'));
        templateErrorCode = 'SAVE_FAILED';
        return;
      }
      savedName = tpl.name;
      setTemplateModalOpen(false);
      setTemplateName('');
      setTemplateDescription('');
      setTemplateNote(t('fileViewer.savedTemplate', { name: tpl.name }));
      setTemplateSavedToast(t('fileViewer.savedTemplate', { name: tpl.name }));
      templateOutcome = 'success';
      templateErrorCode = undefined;
    } finally {
      setSavingTemplate(false);
      fireTemplateExportResult(templateOutcome, templateErrorCode);
      if (savedName) {
        // Auto-clear the note so the menu doesn't keep stale state next open.
        setTimeout(() => setTemplateNote(null), 4000);
      }
    }
  };

  return {
    savingTemplate,
    templateNote,
    templateModalOpen,
    templateName,
    setTemplateName,
    templateNameId,
    templateDescription,
    setTemplateDescription,
    templateDescriptionId,
    templateSaveError,
    templateSavedToast,
    dismissTemplateSavedToast: () => setTemplateSavedToast(null),
    openSaveAsTemplateModal,
    cancelSaveAsTemplateModal,
    handleSaveAsTemplate,
  };
}

export function useWiredTemplateSave(deps: TemplateSaveDeps): TemplateSaveController {
  return useTemplateSave(realTemplateSavePort, deps);
}
