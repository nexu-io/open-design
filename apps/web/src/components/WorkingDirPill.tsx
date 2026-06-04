import { useEffect, useRef, useState } from 'react';
import {
  isOpenDesignHostAvailable,
  openHostProjectPath,
  pickAndReplaceHostProjectWorkingDir,
} from '@open-design/host';
import {
  openFolderDialog,
  replaceProjectWorkingDir,
} from '../providers/registry';
import { useT } from '../i18n';
import type { Project } from '../types';
import { Icon } from './Icon';

interface Props {
  projectId: string;
  resolvedDir?: string | null;
  onReplaced?: (result: {
    baseDir: string;
    entryFile: string | null;
    project?: Project;
  }) => void;
}

function shortPath(dir: string): string {
  return dir.split(/[/\\]/).filter(Boolean).slice(-1)[0] ?? dir;
}

export function WorkingDirPill({ projectId, resolvedDir: propResolvedDir, onReplaced }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedDir, setFetchedDir] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFetchedDir(null);
  }, [projectId, propResolvedDir]);

  useEffect(() => {
    if (propResolvedDir !== undefined) return;
    let cancelled = false;
    void fetch(`/api/projects/${encodeURIComponent(projectId)}`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.resolvedDir === 'string') setFetchedDir(data.resolvedDir);
      })
      .catch(() => {
        // The pill can still open the picker without an initial path.
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, propResolvedDir]);

  const resolvedDir = fetchedDir ?? propResolvedDir ?? null;

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function applyDir(dir: string) {
    setError(null);
    setBusy(true);
    setOpen(false);
    try {
      const result = await replaceProjectWorkingDir(projectId, dir);
      setFetchedDir(result.baseDir);
      onReplaced?.({
        baseDir: result.baseDir,
        entryFile: result.entryFile,
        project: result.project,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handlePickDir() {
    if (isOpenDesignHostAvailable()) {
      setError(null);
      setBusy(true);
      setOpen(false);
      try {
        const result = await pickAndReplaceHostProjectWorkingDir(projectId);
        if (result.ok) {
          setFetchedDir(result.baseDir);
          onReplaced?.({
            baseDir: result.baseDir,
            entryFile: result.entryFile,
          });
          return;
        }
        if (!('canceled' in result) || !result.canceled) {
          const reason =
            'reason' in result && typeof result.reason === 'string' && result.reason.length > 0
              ? result.reason
              : t('workingDirPicker.replaceFailed');
          setError(reason);
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    const picked = await openFolderDialog();
    if (!picked) {
      setError(t('workingDirPicker.unavailable'));
      return;
    }
    await applyDir(picked);
  }

  async function handleShowInFileManager() {
    if (!resolvedDir || busy) return;

    setError(null);
    if (!isOpenDesignHostAvailable()) {
      setOpen(true);
      setError(t('workingDirPicker.openUnavailable'));
      return;
    }

    setBusy(true);
    try {
      const result = await openHostProjectPath(projectId);
      if (result.ok) {
        setOpen(false);
        return;
      }
      const reason = result.reason.length > 0
        ? result.reason
        : t('workingDirPicker.openFailed');
      setOpen(true);
      setError(reason);
    } catch (err) {
      setOpen(true);
      setError(err instanceof Error ? err.message : t('workingDirPicker.openFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={wrapRef}
      className={`working-dir-pill${open ? ' open' : ''}`}
      data-testid="working-dir-pill"
    >
      <button
        type="button"
        className="working-dir-pill-trigger"
        data-testid="working-dir-pill-trigger"
        onClick={() => setOpen((value) => !value)}
        disabled={busy}
        title={resolvedDir ?? t('workingDirPicker.title')}
      >
        <Icon name="folder" size={12} />
        <span className="working-dir-pill-label">
          {busy ? t('workingDirPicker.processing') : resolvedDir ? shortPath(resolvedDir) : t('workingDirPicker.select')}
        </span>
        <Icon name="chevron-down" size={10} />
      </button>
      {open ? (
        <div className="working-dir-pill-menu" role="menu" data-testid="working-dir-pill-menu">
          {resolvedDir ? (
            <>
              <div className="working-dir-pill-menu-path" title={resolvedDir}>
                {resolvedDir}
              </div>
              <button
                type="button"
                role="menuitem"
                className="working-dir-pill-menu-item"
                onClick={() => void handleShowInFileManager()}
                disabled={busy}
              >
                <Icon name="folder" size={12} />
                <span>{t('workingDirPicker.showInFileManager')}</span>
              </button>
              <div className="working-dir-pill-menu-divider" />
            </>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="working-dir-pill-menu-item"
            onClick={() => void handlePickDir()}
            data-testid="working-dir-pill-replace"
            disabled={busy}
          >
            <Icon name="folder" size={12} />
            <span>{t('workingDirPicker.replace')}</span>
          </button>
          {error ? (
            <>
              <div className="working-dir-pill-menu-divider" />
              <div className="working-dir-pill-menu-error">{error}</div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
