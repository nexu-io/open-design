import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import type { FsBrowserListResponse, FsBrowserRoot } from '@open-design/contracts';

import {
  createServerDirectory,
  listServerDirectory,
  listServerDirectoryRoots,
} from '../providers/fs-browser';
import { useT } from '../i18n';
import { Icon } from './Icon';
import styles from './ServerDirectoryPicker.module.css';

export interface ServerDirectoryPickerProps {
  open: boolean;
  initialPath?: string | null;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export function ServerDirectoryPicker({
  open,
  initialPath,
  onSelect,
  onClose,
}: ServerDirectoryPickerProps) {
  const t = useT();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const lifecycleIdRef = useRef(0);
  const directoryRequestIdRef = useRef(0);
  const createDirectoryAbortRef = useRef<AbortController | null>(null);
  const retryPathRef = useRef<string | null>(null);
  const [roots, setRoots] = useState<FsBrowserRoot[]>([]);
  const [listing, setListing] = useState<FsBrowserListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingDirectory, setCreatingDirectory] = useState(false);
  const [createDirectoryName, setCreateDirectoryName] = useState('');
  const [createDirectoryError, setCreateDirectoryError] = useState<string | null>(null);
  const [createDirectoryPending, setCreateDirectoryPending] = useState(false);
  const [rootReloadNonce, setRootReloadNonce] = useState(0);

  const loadDirectory = useCallback(async (path: string) => {
    const requestId = ++directoryRequestIdRef.current;
    retryPathRef.current = path;
    setLoading(true);
    setError(null);

    try {
      const response = await listServerDirectory(path);
      if (requestId !== directoryRequestIdRef.current) return;
      setListing(response);
    } catch {
      if (requestId !== directoryRequestIdRef.current) return;
      setError(t('serverDirectoryPicker.loadDirectoryFailed'));
    } finally {
      if (requestId === directoryRequestIdRef.current) setLoading(false);
    }
  }, [t]);

  const resetCreateDirectory = useCallback(() => {
    createDirectoryAbortRef.current?.abort();
    createDirectoryAbortRef.current = null;
    setCreatingDirectory(false);
    setCreateDirectoryName('');
    setCreateDirectoryError(null);
    setCreateDirectoryPending(false);
  }, []);

  const handleCreateDirectory = useCallback(async () => {
    const parentPath = listing?.path;
    if (!parentPath || createDirectoryPending) return;
    const name = createDirectoryName.trim();
    if (!name) {
      setCreateDirectoryError(t('serverDirectoryPicker.folderName'));
      return;
    }
    setCreateDirectoryPending(true);
    setCreateDirectoryError(null);
    const lifecycleId = lifecycleIdRef.current;
    const controller = new AbortController();
    createDirectoryAbortRef.current?.abort();
    createDirectoryAbortRef.current = controller;
    try {
      const response = await createServerDirectory(parentPath, name, controller.signal);
      if (controller.signal.aborted || lifecycleId !== lifecycleIdRef.current) return;
      resetCreateDirectory();
      await loadDirectory(response.path);
    } catch {
      if (controller.signal.aborted || lifecycleId !== lifecycleIdRef.current) return;
      setCreateDirectoryError(t('serverDirectoryPicker.createFolderFailed'));
    } finally {
      if (createDirectoryAbortRef.current === controller) {
        createDirectoryAbortRef.current = null;
        if (lifecycleId === lifecycleIdRef.current) setCreateDirectoryPending(false);
      }
    }
  }, [
    createDirectoryName,
    createDirectoryPending,
    listing?.path,
    loadDirectory,
    resetCreateDirectory,
    t,
  ]);

  useEffect(() => {
    if (!open) {
      lifecycleIdRef.current += 1;
      directoryRequestIdRef.current += 1;
      createDirectoryAbortRef.current?.abort();
      createDirectoryAbortRef.current = null;
      return;
    }

    const lifecycleId = ++lifecycleIdRef.current;
    setRoots([]);
      setListing(null);
      setError(null);
      setLoading(true);
      resetCreateDirectory();
      retryPathRef.current = null;

    void listServerDirectoryRoots()
      .then((response) => {
        if (lifecycleId !== lifecycleIdRef.current) return;
        setRoots(response.roots);
        const requestedPath = initialPath?.trim() || response.roots[0]?.path;
        if (!requestedPath) {
          setError(t('serverDirectoryPicker.noRoots'));
          setLoading(false);
          return;
        }
        void loadDirectory(requestedPath);
      })
      .catch(() => {
        if (lifecycleId !== lifecycleIdRef.current) return;
        setError(t('serverDirectoryPicker.loadRootsFailed'));
        setLoading(false);
      });

    return () => {
      lifecycleIdRef.current += 1;
      directoryRequestIdRef.current += 1;
      createDirectoryAbortRef.current?.abort();
      createDirectoryAbortRef.current = null;
    };
  }, [initialPath, loadDirectory, open, resetCreateDirectory, rootReloadNonce]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute('hidden'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!panelRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    return () => {
      const previouslyFocused = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const currentPath = listing?.path ?? null;
  const retryPath = retryPathRef.current;

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="server-directory-picker-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        className={styles.panel}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <h2 id="server-directory-picker-title" className={styles.title}>
              {t('serverDirectoryPicker.title')}
            </h2>
            <p className={styles.subtitle}>{t('serverDirectoryPicker.subtitle')}</p>
          </div>
          <Button
            ref={closeButtonRef}
            variant="ghost"
            size="icon"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t('serverDirectoryPicker.close')}
            title={t('serverDirectoryPicker.closeTitle')}
          >
            <Icon name="close" size={16} />
          </Button>
        </header>

        <nav className={styles.roots} aria-label={t('serverDirectoryPicker.rootsAria')}>
          {roots.map((root) => (
            <Button
              key={`${root.kind}:${root.path}`}
              variant={currentPath === root.path ? 'subtle' : 'ghost'}
              className={styles.rootButton}
              onClick={() => void loadDirectory(root.path)}
            >
              <Icon name="folder" size={14} />
              <span>{root.label}</span>
            </Button>
          ))}
        </nav>

        <div className={styles.locationBar}>
          <Button
            variant="ghost"
            size="icon"
            className={styles.upButton}
            onClick={() => listing?.parent && void loadDirectory(listing.parent)}
            disabled={!listing?.parent || loading}
            aria-label={t('serverDirectoryPicker.up')}
            title={t('serverDirectoryPicker.upTitle')}
          >
            <Icon name="arrow-up" size={15} />
          </Button>
          <div className={styles.path} title={currentPath ?? undefined}>
            {currentPath ?? retryPath ?? t('serverDirectoryPicker.loading')}
          </div>
          <Button
            variant="ghost"
            className={styles.newFolderButton}
            onClick={() => {
              setCreatingDirectory((value) => !value);
              setCreateDirectoryError(null);
            }}
            disabled={!currentPath || loading || Boolean(error)}
          >
            <Icon name="plus" size={14} />
            {t('serverDirectoryPicker.newFolder')}
          </Button>
        </div>

        {creatingDirectory ? (
          <form
            className={styles.createForm}
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateDirectory();
            }}
          >
            <label className={styles.createLabel}>
              <span>{t('serverDirectoryPicker.folderName')}</span>
              <input
                value={createDirectoryName}
                onChange={(event) => {
                  setCreateDirectoryName(event.target.value);
                  setCreateDirectoryError(null);
                }}
                placeholder={t('serverDirectoryPicker.folderNamePlaceholder')}
                aria-label={t('serverDirectoryPicker.folderName')}
                disabled={createDirectoryPending}
              />
            </label>
            <Button
              type="submit"
              variant="primary"
              disabled={createDirectoryPending || !createDirectoryName.trim()}
            >
              <Icon name="plus" size={14} />
              {t('serverDirectoryPicker.createFolder')}
            </Button>
            <Button type="button" variant="ghost" onClick={resetCreateDirectory}>
              {t('serverDirectoryPicker.cancel')}
            </Button>
            {createDirectoryError ? (
              <p className={styles.createError} role="alert">
                {createDirectoryError}
              </p>
            ) : null}
          </form>
        ) : null}

        <div className={styles.browser} aria-busy={loading}>
          {loading ? (
            <div className={styles.state} role="status">
              <Icon name="spinner" size={18} className={styles.spinner} />
              <span>{t('serverDirectoryPicker.loading')}</span>
            </div>
          ) : error ? (
            <div className={styles.state} role="alert">
              <Icon name="alert-triangle" size={18} />
              <span>{error}</span>
              <Button
                variant="primary-ghost"
                onClick={() => {
                  if (retryPath) void loadDirectory(retryPath);
                  else {
                    const fallback = initialPath?.trim() || roots[0]?.path;
                    if (fallback) void loadDirectory(fallback);
                    else setRootReloadNonce((value) => value + 1);
                  }
                }}
              >
                <Icon name="refresh" size={14} />
                {t('serverDirectoryPicker.retry')}
              </Button>
            </div>
          ) : listing?.entries.length ? (
            <div
              className={styles.entries}
              role="list"
              aria-label={t('serverDirectoryPicker.contentsAria')}
            >
              {listing.entries.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  className={styles.entry}
                  onClick={() => void loadDirectory(entry.path)}
                  aria-label={t('serverDirectoryPicker.openFolderAria', { name: entry.name })}
                  role="button"
                >
                  <Icon name="folder" size={16} />
                  <span className={styles.entryName}>{entry.name}</span>
                  <span className={styles.entryType}>{t('serverDirectoryPicker.folder')}</span>
                  <Icon name="chevron-right" size={14} />
                </button>
              ))}
            </div>
          ) : listing ? (
            <div className={styles.state} role="status">
              {t('serverDirectoryPicker.empty')}
            </div>
          ) : null}
        </div>

        {listing?.truncated ? (
          <p className={styles.notice} role="status">
            {t('serverDirectoryPicker.truncated')}
          </p>
        ) : null}

        <footer className={styles.footer}>
          <Button variant="ghost" onClick={onClose}>
            {t('serverDirectoryPicker.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => currentPath && onSelect(currentPath)}
            disabled={!currentPath || loading || Boolean(error)}
          >
            <Icon name="check" size={14} />
            {t('serverDirectoryPicker.select')}
          </Button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
