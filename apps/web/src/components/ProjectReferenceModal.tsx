import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Project } from '../types';
import { useI18n } from '../i18n';
import { getProjectDetail, listProjects } from '../state/projects';
import { dirExists } from '../providers/registry';
import { Icon } from './Icon';
import styles from './ProjectReferenceModal.module.css';

export interface ProjectReferenceSelection {
  project: Project;
  resolvedDir: string;
}

interface Props {
  currentProjectId?: string | null;
  onClose: () => void;
  onSelect: (items: ProjectReferenceSelection[]) => void;
}

function projectSearchText(project: Project): string {
  return [
    project.id,
    project.name,
    project.metadata?.kind ?? '',
    project.metadata?.baseDir ?? '',
    project.metadata?.entryFile ?? '',
    ...(project.metadata?.linkedDirs ?? []),
  ].join(' ');
}

function projectMeta(project: Project): string {
  return project.metadata?.baseDir || project.metadata?.entryFile || project.metadata?.kind || project.id;
}

export function ProjectReferenceModal({ currentProjectId, onClose, onSelect }: Props) {
  const { t } = useI18n();
  const loadFailedMessage = t('chat.referenceProject.loadFailed');
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProjects(null);
    setSelectedIds([]);
    setLoadError(null);
    void listProjects({ throwOnError: true })
      .then(async (rows) => {
        if (cancelled) return;
        const candidates = rows.filter((project) => project.id !== currentProjectId);
        // Hide imported/external projects whose on-disk folder is gone — they
        // can't be referenced. Managed projects have no external baseDir and
        // are always materializable on demand, so they skip the probe (and a
        // daemon that can't answer leaves everything visible).
        const stillExists = await Promise.all(
          candidates.map(async (project) => {
            const baseDir = project.metadata?.baseDir?.trim();
            return baseDir ? dirExists(baseDir) : true;
          }),
        );
        if (cancelled) return;
        const filtered = candidates.filter((_, index) => stillExists[index]);
        setProjects(filtered);
        setSelectedIds((current) => current.length > 0 ? current : filtered[0] ? [filtered[0].id] : []);
      })
      .catch(() => {
        if (cancelled) return;
        setProjects([]);
        setLoadError(loadFailedMessage);
      });
    return () => {
      cancelled = true;
    };
  }, [currentProjectId, loadFailedMessage]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, pending]);

  const visibleProjects = useMemo(() => {
    if (!projects) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) => projectSearchText(project).toLowerCase().includes(needle));
  }, [projects, query]);

  const selectedProjects = useMemo(() => {
    if (!projects) return [];
    const selected = new Set(selectedIds);
    return projects.filter((project) => selected.has(project.id));
  }, [projects, selectedIds]);

  async function confirm() {
    if (selectedProjects.length === 0 || pending) return;
    setPending(true);
    setError(null);
    try {
      const selections: ProjectReferenceSelection[] = [];
      for (const project of selectedProjects) {
        // `ensureDir` materializes a managed project's folder before we read
        // its resolved dir, so an empty (never-generated) project references
        // to a real directory instead of a path that fails existence checks.
        const detail = await getProjectDetail(project.id, { ensureDir: true });
        const resolvedDir =
          detail?.resolvedDir?.trim() || detail?.project.metadata?.baseDir?.trim() || '';
        if (!detail || !resolvedDir) {
          setError(t('homeWorkingDir.applyFailed'));
          return;
        }
        selections.push({ project: detail.project, resolvedDir });
      }
      onSelect(selections);
    } finally {
      setPending(false);
    }
  }

  function toggleSelected(projectId: string) {
    setSelectedIds((current) => (
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId]
    ));
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !pending) onClose();
    }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="project-reference-title">
        <header className={styles.head}>
          <h2 id="project-reference-title" className={styles.title}>
            {t('chat.referenceProject.title')}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={t('common.close')}
            disabled={pending}
          >
            <Icon name="close" size={17} />
          </button>
        </header>
        <div className={styles.body}>
          <label className={styles.search}>
            <Icon name="search" size={14} />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('chat.referenceProject.search')}
            />
          </label>
          <div
            className={styles.list}
            role="listbox"
            aria-label={t('chat.referenceProject.title')}
            aria-multiselectable="true"
          >
            {projects === null ? (
              <div className={styles.empty}>{t('common.loading')}</div>
            ) : loadError ? (
              <div className={styles.error} role="alert">
                {loadError}
              </div>
            ) : visibleProjects.length === 0 ? (
              <div className={styles.empty}>
                {query.trim()
                  ? t('chat.referenceProject.empty', { query })
                  : t('chat.referenceProject.emptyAll')}
              </div>
            ) : (
              visibleProjects.map((project) => {
                const selected = selectedIds.includes(project.id);
                return (
                  <button
                    key={project.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`${styles.item}${selected ? ` ${styles.itemSelected}` : ''}`}
                    onClick={() => toggleSelected(project.id)}
                  >
                    <span className={styles.itemIcon} aria-hidden>
                      <Icon name="folder" size={15} />
                    </span>
                    <span className={styles.itemText}>
                      <span className={styles.itemTitle}>{project.name}</span>
                      <span className={styles.itemMeta}>{projectMeta(project)}</span>
                    </span>
                    {selected ? (
                      <span className={styles.currentTag}>{t('common.selected')}</span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
          {error ? (
            <div className={styles.error} role="alert">
              {error}
            </div>
          ) : null}
        </div>
        <footer className={styles.footer}>
          <button type="button" className={styles.button} onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            onClick={() => void confirm()}
            disabled={selectedProjects.length === 0 || pending}
          >
            {pending ? t('common.loading') : t('chat.referenceProject.confirm')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
