// Modal wrapper around NewProjectPanel.
//
// Triggered by the "+" button on the entry nav rail. Reuses the
// existing NewProjectPanel surface so all of the per-kind tabs
// (prototype / live-artifact / deck / template / image / video /
// audio / other) and their connector / template / design-system
// pickers carry over without duplication. The modal closes itself
// when the panel calls onCreate and it completes (success path) or when the user
// clicks the backdrop / Esc.

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { ConnectorDetail } from '@open-design/contracts';
import type { OpenDesignHostProjectImportSuccess } from '@open-design/host';
import { modalOverlay, modalContent } from '../motion';
import type {
  DesignSystemSummary,
  MediaProviderCredentials,
  ProjectTemplate,
  PromptTemplateSummary,
  SkillSummary,
} from '../types';
import { Icon } from './Icon';
import {
  NewProjectPanel,
  type CreateInput,
  type CreateTab,
  type ImportClaudeDesignOutcome,
} from './NewProjectPanel';

interface Props {
  open: boolean;
  skills: SkillSummary[];
  designSystems: DesignSystemSummary[];
  defaultDesignSystemId: string | null;
  templates: ProjectTemplate[];
  onDeleteTemplate?: (id: string) => Promise<boolean>;
  promptTemplates: PromptTemplateSummary[];
  mediaProviders?: Record<string, MediaProviderCredentials>;
  connectors?: ConnectorDetail[];
  connectorsLoading?: boolean;
  loading?: boolean;
  onCreate: (input: CreateInput & { requestId?: string }) => Promise<boolean> | boolean | void;
  onImportClaudeDesign?: (
    file: File,
  ) => Promise<ImportClaudeDesignOutcome | void> | ImportClaudeDesignOutcome | void;
  onImportFolder?: (baseDir: string) => Promise<void> | void;
  onImportFolderResponse?: (response: OpenDesignHostProjectImportSuccess) => Promise<void> | void;
  onOpenConnectorsTab?: () => void;
  onClose: () => void;
  initialTab?: CreateTab;
}

// The `open` flag stays the public API, but the close animation has to play
// before the modal leaves the DOM. So the outer component never early-returns
// null: it renders the body inside `AnimatePresence` and gates the body on
// `open`. When `open` flips to false the body unmounts through
// `AnimatePresence`, which runs the `exit` variants on the overlay + content
// first. The body lives in its own component so its mount effects (focus the
// close button, lock body scroll, bind Esc) fire exactly when it appears.
export function NewProjectModal({ open, ...rest }: Props) {
  return (
    <AnimatePresence>
      {open ? <NewProjectModalBody {...rest} /> : null}
    </AnimatePresence>
  );
}

function NewProjectModalBody({
  skills,
  designSystems,
  defaultDesignSystemId,
  templates,
  onDeleteTemplate,
  promptTemplates,
  mediaProviders,
  connectors,
  connectorsLoading,
  loading,
  onCreate,
  onImportClaudeDesign,
  onImportFolder,
  onImportFolderResponse,
  onOpenConnectorsTab,
  onClose,
  initialTab,
}: Omit<Props, 'open'>) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !creating) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [creating, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  async function handleCreate(input: CreateInput & { requestId?: string }) {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const result = await onCreate(input);
      if (result === false) {
        setCreateError('Could not create project. Please try again.');
        return;
      }
      onClose();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create project. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <motion.div
      className="new-project-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="New project"
      data-testid="new-project-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget && !creating) onClose();
      }}
      variants={modalOverlay}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div
        className="new-project-modal"
        variants={modalContent}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <header className="new-project-modal__head">
          <h2 className="new-project-modal__title">New project</h2>
          <button
            ref={closeRef}
            type="button"
            className="new-project-modal__close"
            onClick={onClose}
            disabled={creating}
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
            {...(onDeleteTemplate ? { onDeleteTemplate } : {})}
            promptTemplates={promptTemplates}
            {...(mediaProviders ? { mediaProviders } : {})}
            {...(connectors ? { connectors } : {})}
            {...(typeof connectorsLoading === 'boolean' ? { connectorsLoading } : {})}
            loading={Boolean(loading) || creating}
            onCreate={(input) => {
              void handleCreate(input);
            }}
            {...(onImportClaudeDesign ? { onImportClaudeDesign } : {})}
            {...(onImportFolder ? { onImportFolder } : {})}
            {...(onImportFolderResponse ? { onImportFolderResponse } : {})}
            {...(onOpenConnectorsTab ? { onOpenConnectorsTab } : {})}
            {...(initialTab ? { initialTab } : {})}
          />
          {creating ? (
            <div className="new-project-modal__status" role="status">
              Creating project…
            </div>
          ) : null}
          {createError ? (
            <div className="new-project-modal__status error" role="alert">
              {createError}
            </div>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}
