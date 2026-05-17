// Modal wrapper around NewProjectPanel.
//
// Triggered by the "+" button on the entry nav rail. Reuses the
// existing NewProjectPanel surface so all of the per-kind tabs
// (prototype / live-artifact / deck / template / image / video /
// audio / other) and their connector / template / design-system
// pickers carry over without duplication. The modal closes itself
// when the panel calls onCreate (success path) or when the user
// clicks the backdrop / Esc.

import { useEffect, useRef } from 'react';
import type { ConnectorDetail } from '@open-design/contracts';
import type {
  DesignSystemSummary,
  MediaProviderCredentials,
  ProjectTemplate,
  PromptTemplateSummary,
  SkillSummary,
} from '../types';
import { Icon } from './Icon';
import { NewProjectPanel, type CreateInput } from './NewProjectPanel';

interface Props {
  open: boolean;
  skills: SkillSummary[];
  designSystems: DesignSystemSummary[];
  defaultDesignSystemId: string | null;
  templates: ProjectTemplate[];
  promptTemplates: PromptTemplateSummary[];
  mediaProviders?: Record<string, MediaProviderCredentials>;
  connectors?: ConnectorDetail[];
  connectorsLoading?: boolean;
  loading?: boolean;
  onCreate: (input: CreateInput) => void;
  onImportClaudeDesign?: (file: File) => Promise<void> | void;
  onImportFolder?: (baseDir: string) => Promise<void> | void;
  onOpenConnectorsTab?: () => void;
  onClose: () => void;
}

export function NewProjectModal({
  open,
  skills,
  designSystems,
  defaultDesignSystemId,
  templates,
  promptTemplates,
  mediaProviders,
  connectors,
  connectorsLoading,
  loading,
  onCreate,
  onImportClaudeDesign,
  onImportFolder,
  onOpenConnectorsTab,
  onClose,
}: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="new-project-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="New project"
      data-testid="new-project-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="new-project-modal">
        <header className="new-project-modal__head">
          <h2 className="new-project-modal__title">New project</h2>
          <button
            ref={closeRef}
            type="button"
            className="new-project-modal__close"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
          >
            <Icon name="close" size={14} />
          </button>
        </header>
        <div className="new-project-modal__body">
          <NewProjectPanel
            skills={skills}
            designSystems={designSystems}
            defaultDesignSystemId={defaultDesignSystemId}
            templates={templates}
            promptTemplates={promptTemplates}
            {...(mediaProviders ? { mediaProviders } : {})}
            {...(connectors ? { connectors } : {})}
            {...(typeof connectorsLoading === 'boolean' ? { connectorsLoading } : {})}
            {...(typeof loading === 'boolean' ? { loading } : {})}
            onCreate={(input) => {
              onCreate(input);
              onClose();
            }}
            {...(onImportClaudeDesign ? { onImportClaudeDesign } : {})}
            {...(onImportFolder ? { onImportFolder } : {})}
            {...(onOpenConnectorsTab ? { onOpenConnectorsTab } : {})}
          />
        </div>
      </div>
    </div>
  );
}
