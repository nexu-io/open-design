import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@open-design/components';
import type { ConnectorDetail } from '@open-design/contracts';
import type { OpenDesignHostProjectImportSuccess } from '@open-design/host';
import { modalOverlay, modalContent } from '../motion';
import { useT } from '../i18n';
import type {
  DesignSystemSummary,
  MediaProviderCredentials,
  ProjectTemplate,
  PromptTemplateSummary,
  SkillSummary,
} from '../types';
import { Icon } from './Icon';
import { useOpenFolderImport } from './useOpenFolderImport';
import styles from './NewProjectModal.module.css';
import {
  type CreateInput,
  type CreateTab,
  type ImportClaudeDesignOutcome,
} from './NewProjectPanel';

interface Props {
  open: boolean;
  skills: SkillSummary[];
  designTemplates?: SkillSummary[];
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
// name field, lock body scroll, bind Esc) fire exactly when it appears.
export function NewProjectModal({ open, ...rest }: Props) {
  return (
    <AnimatePresence>
      {open ? <NewProjectModalBody {...rest} /> : null}
    </AnimatePresence>
  );
}

function NewProjectModalBody({
  onCreate,
  onImportFolder,
  onImportFolderResponse,
  onClose,
}: Omit<Props, 'open'>) {
  const nameRef = useRef<HTMLInputElement | null>(null);
  const composingRef = useRef(false);
  const [name, setName] = useState('');
  const [nameTooLong, setNameTooLong] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const t = useT();
  const title = t('newproj.titleOther');
  const folderImport = useOpenFolderImport({
    skillId: null,
    ...(onImportFolder ? { onImportFolder: async (path: string) => {
      await onImportFolder(path);
      onClose();
    } } : {}),
    ...(onImportFolderResponse ? { onImportFolderResponse: async (response: OpenDesignHostProjectImportSuccess) => {
      await onImportFolderResponse(response);
      onClose();
    } } : {}),
  });
  const busy = creating || folderImport.importing;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  async function handleCreate() {
    const projectName = name.trim();
    if (busy || composingRef.current || !projectName || Array.from(projectName).length > 24) return;
    setCreating(true);
    setCreateError(null);
    try {
      const result = await onCreate({
        name: projectName,
        skillId: null,
        designSystemId: null,
        metadata: { kind: 'other', nameSource: 'user' },
      });
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

  function updateName(value: string) {
    const characters = Array.from(value);
    setName(characters.slice(0, 24).join(''));
    setNameTooLong(characters.length > 24);
  }

  return (
    <motion.div
      className="new-project-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="new-project-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
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
          <h2 className="new-project-modal__title">{title}</h2>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="new-project-modal__close"
            onClick={onClose}
            disabled={busy}
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <Icon name="close" size={14} />
          </Button>
        </header>
        <div className="new-project-modal__body">
          <form className="new-project-modal__form" onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}>
            <div className={styles.nameField}>
              <input
                ref={nameRef}
                className={styles.name}
                aria-label={t('newproj.namePlaceholder')}
                aria-describedby={nameTooLong ? 'new-project-name-limit' : undefined}
                placeholder={t('newproj.namePlaceholder')}
                value={name}
                onChange={(event) => {
                  if (composingRef.current) {
                    setName(event.target.value);
                  } else {
                    updateName(event.target.value);
                  }
                }}
                onCompositionStart={() => { composingRef.current = true; }}
                onCompositionEnd={(event) => {
                  composingRef.current = false;
                  updateName(event.currentTarget.value);
                }}
                disabled={busy}
              />
              <Button className={styles.create} type="submit" variant="primary"
                disabled={busy || !name.trim() || Array.from(name.trim()).length > 24}
                data-testid="create-project">
                <Icon name="plus" size={14} />
                {creating ? <span role="status">{t('common.loading')}</span> : t('newproj.create')}
              </Button>
            </div>
            {nameTooLong ? (
              <p id="new-project-name-limit" className={styles.nameLimit} role="alert">
                {t('newproj.nameTooLong')}
              </p>
            ) : null}
          </form>
          {folderImport.available ? (
            <Button className={styles.folder} variant="ghost" disabled={busy}
              onClick={() => void folderImport.openFolder()}>
              <Icon name="folder" size={28} />
              <span>{t(folderImport.importing ? 'newproj.openingFolder' : 'workspace.openFile')}</span>
            </Button>
          ) : null}
          {folderImport.error ? (
            <div className="new-project-modal__status error" role="alert">
              {folderImport.error.message}
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
