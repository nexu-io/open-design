import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import { projectFileUrl } from '../providers/registry';
import type { LiveArtifactWorkspaceEntry, ProjectFile, ProjectFileKind } from '../types';
import { Icon } from './Icon';
import { LiveArtifactBadges } from './LiveArtifactBadges';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

interface Props {
  projectId: string;
  files: ProjectFile[];
  liveArtifacts: LiveArtifactWorkspaceEntry[];
  onRefreshFiles: () => Promise<void> | void;
  onOpenFile: (name: string) => void;
  onOpenLiveArtifact: (tabId: LiveArtifactWorkspaceEntry['tabId']) => void;
  onRenameFile: (from: string, to: string) => Promise<ProjectFile | null> | ProjectFile | null;
  onDeleteFile: (name: string) => void;
  onDeleteFiles: (names: string[]) => Promise<void> | void;
  onUpload: () => void;
  onUploadFiles: (files: File[]) => void;
  onPaste: () => void;
  onNewSketch: () => void;
}

type SortKey = 'name' | 'kind' | 'mtime';
type SortDir = 'asc' | 'desc';

export function DesignFilesPanel({
  projectId,
  files,
  liveArtifacts,
  onRefreshFiles,
  onOpenFile,
  onOpenLiveArtifact,
  onRenameFile,
  onDeleteFile,
  onDeleteFiles,
  onUpload,
  onUploadFiles,
  onPaste,
  onNewSketch,
}: Props) {
  const t = useT();
  const [refreshing, setRefreshing] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const dragDepthRef = useRef(0);
  const [hover, setHover] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ name: string; top: number; left: number } | null>(null);
  const MENU_ESTIMATED_HEIGHT = 145;
  const MENU_SAFE_PADDING = 8;
  const [preview, setPreview] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('mtime');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const lastKeyPress = useRef<Map<string, number>>(new Map());
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState<{ name: string; draft: string; saving: boolean } | null>(null);

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      let cmp: number;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'kind') cmp = kindSortPriority(a.kind) - kindSortPriority(b.kind);
      else cmp = a.mtime - b.mtime;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [files, sortKey, sortDir]);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number | 'all'>(30);

  const effectivePageSize = pageSize === 'all' ? Math.max(1, sortedFiles.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(sortedFiles.length / effectivePageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageFiles = sortedFiles.slice(safePage * effectivePageSize, (safePage + 1) * effectivePageSize);
  const rangeStart = safePage * effectivePageSize + 1;
  const rangeEnd = Math.min((safePage + 1) * effectivePageSize, sortedFiles.length);
  const allPageSelected = pageFiles.every((f) => selected.has(f.name));
  const somePageSelected = !allPageSelected && pageFiles.some((f) => selected.has(f.name));

  useEffect(() => {
    setPage(0);
  }, [pageSize]);

  useEffect(() => {
    if (Number.isFinite(totalPages)) setPage((p) => Math.min(p, totalPages - 1));
  }, [totalPages]);

  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const names = new Set(files.map((f) => f.name));
      const next = new Set(prev);
      let changed = false;
      for (const n of next) {
        if (!names.has(n)) {
          next.delete(n);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [files]);

  const previewFile = useMemo(
    () => files.find((f) => f.name === preview) ?? null,
    [preview, files],
  );

  useEffect(() => {
    if (!menuPos) return;
    const close = () => setMenuPos(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuPos]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await onRefreshFiles();
    } finally {
      setRefreshing(false);
    }
  }

  function toggleSort(key: SortKey) {
    return () => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    };
  }

  function toggleSelect(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  function toggleSelectPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const f of pageFiles) next.delete(f.name);
      } else {
        for (const f of pageFiles) next.add(f.name);
      }
      return next;
    });
  }

  function selectAllFiles() {
    setSelected(new Set(sortedFiles.map((f) => f.name)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function openMenuFor(name: string, el: HTMLElement) {
    const rect = el.closest('.df-row-menu')?.getBoundingClientRect();
    if (!rect) return;

    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top: number;
    if (spaceBelow >= MENU_ESTIMATED_HEIGHT + MENU_SAFE_PADDING) {
      top = rect.bottom + 4;
    } else if (spaceAbove >= MENU_ESTIMATED_HEIGHT + MENU_SAFE_PADDING) {
      top = rect.top - MENU_ESTIMATED_HEIGHT - 4;
    } else {
      top = Math.max(
        MENU_SAFE_PADDING,
        viewportHeight - MENU_ESTIMATED_HEIGHT - MENU_SAFE_PADDING,
      );
    }

    const left = Math.max(MENU_SAFE_PADDING, rect.right - 160);

    setMenuPos({ name, top, left });
  }

  function startRename(name: string) {
    setMenuPos(null);
    setPreview(name);
    setRenaming({ name, draft: name, saving: false });
  }

  async function commitRename(name: string, draft: string) {
    const nextName = draft.trim();
    if (!nextName || nextName === name) {
      setRenaming(null);
      return;
    }
    setRenaming({ name, draft, saving: true });
    try {
      const renamed = await onRenameFile(name, nextName);
      if (!renamed) throw new Error('Rename failed');
      setPreview((curr) => (curr === name ? renamed.name : curr));
      setSelected((prev) => {
        if (!prev.has(name)) return prev;
        const next = new Set(prev);
        next.delete(name);
        next.add(renamed.name);
        return next;
      });
      setRenaming(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setRenaming({ name, draft, saving: false });
    }
  }

  async function handleBatchDelete() {
    if (deleting) return;
    const fileList = [...selected];
    if (fileList.length === 0) return;
    setDeleting(true);
    try {
      await onDeleteFiles(fileList);
      // Don't clear `selected` here: confirm-cancel and all-fail paths
      // should leave the user's selection intact for retry. The
      // `useEffect` above prunes successfully-deleted names automatically
      // once `files` refreshes.
    } finally {
      setDeleting(false);
    }
  }

  async function handleBatchDownload() {
    const fileList = [...selected];
    if (fileList.length === 0) return;
    try {
      const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/archive/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: fileList }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.message || `request failed (${resp.status})`);
      }
      const blob = await resp.blob();
      const header = resp.headers.get('content-disposition') || '';
      const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
      let filename = 'project.zip';
      if (star && star[1]) {
        try {
          filename = decodeURIComponent(star[1]);
        } catch {
          filename = star[1];
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.warn('[batchDownload] failed:', err);
    }
  }

  function handleDrop(ev: React.DragEvent<HTMLDivElement>) {
    ev.preventDefault();
    dragDepthRef.current = 0;
    setDraggingFiles(false);
    const dropped = Array.from(ev.dataTransfer.files ?? []);
    if (dropped.length > 0) onUploadFiles(dropped);
  }

  return (
    <div className={`df-panel ${preview ? '' : 'no-preview'}`}>
      <div className="df-main">
        <div className="df-head">
          <button
            type="button"
            className="icon-only"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            title={t('designFiles.refresh')}
            aria-label={t('designFiles.refresh')}
          >
            <Icon name={refreshing ? 'spinner' : 'reload'} size={14} />
          </button>
          <span className="crumbs">{t('designFiles.crumbs')}</span>
          {selected.size > 0 ? (
            <div className="df-actions">
              <button
                type="button"
                onClick={() => void handleBatchDownload()}
                title={t('designFiles.downloadSelected', { n: selected.size })}
              >
                <Icon name="download" size={13} />
                <span>{t('designFiles.downloadSelected', { n: selected.size })}</span>
              </button>
              <button
                type="button"
                className="danger"
                data-testid="design-files-batch-delete"
                disabled={deleting}
                onClick={() => void handleBatchDelete()}
                title={t('designFiles.deleteSelected', { n: selected.size })}
              >
                <span>{t('designFiles.deleteSelected', { n: selected.size })}</span>
              </button>
            </div>
          ) : (
            <div className="df-actions">
            <button type="button" onClick={onNewSketch} title={t('designFiles.newSketch')}>
              <Icon name="pencil" size={13} />
              <span>{t('designFiles.newSketch')}</span>
            </button>
            <button type="button" onClick={onPaste} title={t('designFiles.paste.title')}>
              <Icon name="copy" size={13} />
              <span>{t('designFiles.paste.label')}</span>
            </button>
            <button
              type="button"
              data-testid="design-files-upload-trigger"
              onClick={onUpload}
              title={t('designFiles.upload.title')}
            >
              <Icon name="upload" size={13} />
              <span>{t('designFiles.upload.label')}</span>
            </button>
          </div>
          )}
        </div>
        <div className="df-body">
          {files.length === 0 && liveArtifacts.length === 0 ? (
            <div className="df-empty">{t('designFiles.empty')}</div>
          ) : (
            <>
              {liveArtifacts.length > 0 ? (
                <div className="df-section" key="live-artifacts">
                  <div className="df-section-label">{t('designFiles.sectionLiveArtifacts')}</div>
                  {liveArtifacts.map((artifact) => (
                    <button
                      key={artifact.artifactId}
                      type="button"
                      data-testid={`design-file-row-${artifact.tabId}`}
                      className="df-row df-row-live-artifact"
                      onDoubleClick={() => onOpenLiveArtifact(artifact.tabId)}
                      onClick={() => onOpenLiveArtifact(artifact.tabId)}
                    >
                      <span className="df-row-icon" data-kind="live-artifact" aria-hidden>
                        ◉
                      </span>
                      <span className="df-row-name-wrap">
                        <span className="df-row-name">{artifact.title}</span>
                        <span className="df-row-sub">
                          <span>{t('designFiles.kindLiveArtifact')}</span>
                          <LiveArtifactBadges
                            compact
                            status={artifact.status}
                            refreshStatus={artifact.refreshStatus}
                          />
                        </span>
                      </span>
                      <span className="df-row-time">
                        {relativeTime(Date.parse(artifact.updatedAt) || Date.now(), t)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {sortedFiles.length > 0 ? (
                <>
                  <div className="df-pagination df-pagination-start">
                    <label>
                      {t('designFiles.perPage')}:
                      <select
                        value={pageSize === 'all' ? 'all' : pageSize}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPageSize(val === 'all' ? 'all' : Number(val));
                        }}
                      >
                        <option value={15}>15</option>
                        <option value={30}>30</option>
                        <option value={45}>45</option>
                        <option value={60}>60</option>
                        <option value="all">{t('designFiles.all')}</option>
                      </select>
                    </label>
                    <span className="df-page-info">
                      {t('designFiles.pageInfo', { start: rangeStart, end: rangeEnd, total: sortedFiles.length })}
                    </span>
                    <div className="df-select-bar">
                      <button type="button" className="df-select-all" onClick={toggleSelectPage}>
                        {t('designFiles.selectPage')}
                      </button>
                      {selected.size < sortedFiles.length ? (
                        <button type="button" className="df-select-all" onClick={selectAllFiles}>
                          {t('designFiles.selectAll', { n: sortedFiles.length })}
                        </button>
                      ) : null}
                      {selected.size > 0 ? (
                        <button type="button" className="df-select-all" onClick={clearSelection}>
                          {t('designFiles.clearSelection')}
                        </button>
                      ) : null}
                    </div>
                    <div className="df-pagination-right">
                      <button
                        type="button"
                        className="df-page-btn"
                        disabled={safePage <= 0}
                        onClick={() => setPage(Math.max(0, safePage - 1))}
                      >
                        {t('designFiles.prev')}
                      </button>
                      <button
                        type="button"
                        className="df-page-btn"
                        disabled={safePage >= totalPages - 1}
                        onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
                      >
                        {t('designFiles.next')}
                      </button>
                    </div>
                  </div>
                  <table className="df-table">
                    <thead>
                      <tr>
                        <th className="df-th-check">
                          <span
                            className="df-row-check"
                            onClick={toggleSelectPage}
                            role="checkbox"
                            aria-checked={allPageSelected}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleSelectPage();
                              }
                            }}
                            ref={(el) => {
                              if (el) (el as HTMLElement).ariaChecked = allPageSelected ? 'true' : somePageSelected ? 'mixed' : 'false';
                            }}
                          >
                            {allPageSelected ? '\u2611' : somePageSelected ? '\u25A3' : '\u2610'}
                          </span>
                        </th>
                        <th className="df-th-icon" />
                        <th
                          className="df-th-name df-th-sortable"
                          aria-sort={sortKey === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <button type="button" className="df-th-btn" onClick={toggleSort('name')}>
                            {t('designFiles.colName')}
                            {sortKey === 'name' ? <span className="df-sort-arrow">{sortDir === 'asc' ? ' \u2191' : ' \u2193'}</span> : null}
                          </button>
                        </th>
                        <th
                          className="df-th-kind df-th-sortable"
                          aria-sort={sortKey === 'kind' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <button type="button" className="df-th-btn" onClick={toggleSort('kind')}>
                            {t('designFiles.colKind')}
                            {sortKey === 'kind' ? <span className="df-sort-arrow">{sortDir === 'asc' ? ' \u2191' : ' \u2193'}</span> : null}
                          </button>
                        </th>
                        <th
                          className="df-th-time df-th-sortable"
                          aria-sort={sortKey === 'mtime' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <button type="button" className="df-th-btn" onClick={toggleSort('mtime')}>
                            {t('designFiles.colModified')}
                            {sortKey === 'mtime' ? <span className="df-sort-arrow">{sortDir === 'asc' ? ' \u2191' : ' \u2193'}</span> : null}
                          </button>
                        </th>
                        <th className="df-th-menu" />
                      </tr>
                    </thead>
                    <tbody>
                      {pageFiles.map((f) => {
                        const active = preview === f.name;
                        const isHovered = hover === f.name;
                        const renameState = renaming?.name === f.name ? renaming : null;
                        return (
                          <tr
                            key={f.name}
                            data-testid={`design-file-row-${f.name}`}
                            className={`df-file-row ${active ? 'active' : ''} ${selected.has(f.name) ? 'selected' : ''}`}
                            onMouseEnter={() => setHover(f.name)}
                            onMouseLeave={() => setHover((c) => (c === f.name ? null : c))}
                          >
                            <td className="df-cell-check">
                              <span
                                className="df-row-check"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelect(f.name);
                                }}
                                role="checkbox"
                                aria-checked={selected.has(f.name)}
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toggleSelect(f.name);
                                  }
                                }}
                              >
                                {selected.has(f.name) ? '\u2611' : '\u2610'}
                              </span>
                            </td>
                            <td
                              className="df-cell-icon df-cell-openable"
                              onClick={() => setPreview(f.name)}
                              onDoubleClick={() => onOpenFile(f.name)}
                            >
                              <span className="df-row-icon" data-kind={f.kind} aria-hidden>
                                {kindGlyph(f.kind)}
                              </span>
                            </td>
                            <td
                              className="df-cell-name df-cell-openable"
                              onClick={() => {
                                if (!renameState) setPreview(f.name);
                              }}
                              onDoubleClick={() => {
                                if (!renameState) onOpenFile(f.name);
                              }}
                            >
                              {renameState ? (
                                <input
                                  autoFocus
                                  className="df-rename-input"
                                  value={renameState.draft}
                                  disabled={renameState.saving}
                                  onChange={(e) =>
                                    setRenaming({ ...renameState, draft: e.target.value })
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  onDoubleClick={(e) => e.stopPropagation()}
                                  onBlur={(e) => {
                                    if (e.currentTarget.dataset.skipRenameCommit === '1') return;
                                    void commitRename(f.name, renameState.draft);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      e.currentTarget.dataset.skipRenameCommit = '1';
                                      void commitRename(f.name, renameState.draft);
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      e.currentTarget.dataset.skipRenameCommit = '1';
                                      setRenaming(null);
                                    }
                                  }}
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="df-row-name-btn"
                                  onClick={() => setPreview(f.name)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      const now = Date.now();
                                      const last = lastKeyPress.current.get(f.name) ?? 0;
                                      if (now - last < 300) {
                                        lastKeyPress.current.delete(f.name);
                                        onOpenFile(f.name);
                                      } else {
                                        lastKeyPress.current.set(f.name, now);
                                        setPreview(f.name);
                                      }
                                    }
                                  }}
                                >
                                  <span className="df-row-name-wrap">
                                    <span className="df-row-name">{f.name}</span>
                                    <span className="df-row-sub">{humanBytes(f.size)}</span>
                                  </span>
                                </button>
                              )}
                            </td>
                            <td
                              className="df-cell-kind df-cell-openable"
                              onClick={() => setPreview(f.name)}
                              onDoubleClick={() => onOpenFile(f.name)}
                            >
                              <span className="df-kind-label">{kindLabel(f.kind, t)}</span>
                            </td>
                            <td
                              className="df-cell-time df-cell-openable"
                              onClick={() => setPreview(f.name)}
                              onDoubleClick={() => onOpenFile(f.name)}
                            >
                              {relativeTime(f.mtime, t)}
                            </td>
                            <td className="df-cell-menu">
                              <span
                                data-testid={`design-file-menu-${f.name}`}
                                className="df-row-menu"
                                style={isHovered || active ? { opacity: 1 } : undefined}
                                role="button"
                                tabIndex={0}
                                aria-label={t('designFiles.rowMenu')}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openMenuFor(f.name, e.target as HTMLElement);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    openMenuFor(f.name, e.currentTarget as HTMLElement);
                                  }
                                }}
                              >
                                ⋯
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="df-pagination df-pagination-center">
                    <button
                      type="button"
                      className="df-page-btn"
                      disabled={safePage <= 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      {t('designFiles.prev')}
                    </button>
                    <label>
                      {t('designFiles.jumpToPage')}:
                      <select
                        value={safePage}
                        onChange={(e) => setPage(Number(e.target.value))}
                      >
                        {Array.from({ length: totalPages }, (_, i) => (
                          <option key={i} value={i}>
                            {i + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="df-page-btn"
                      disabled={safePage >= totalPages - 1}
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    >
                      {t('designFiles.next')}
                    </button>
                    <span className="df-page-info">
                      {t('designFiles.pageInfo', { start: rangeStart, end: rangeEnd, total: sortedFiles.length })}
                    </span>
                  </div>
                </>
              ) : null}
            </>
          )}
          <div
            className={`df-drop ${draggingFiles ? 'dragging' : ''}`}
            onDragEnter={(ev) => {
              ev.preventDefault();
              dragDepthRef.current += 1;
              setDraggingFiles(true);
            }}
            onDragOver={(ev) => {
              ev.preventDefault();
              ev.dataTransfer.dropEffect = 'copy';
            }}
            onDragLeave={(ev) => {
              if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) {
                dragDepthRef.current = 0;
                setDraggingFiles(false);
                return;
              }
              dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
              if (dragDepthRef.current === 0) setDraggingFiles(false);
            }}
            onDrop={handleDrop}
          >
            <span className="label">{t('designFiles.dropTitle')}</span>
            <span className="desc">{t('designFiles.dropDesc')}</span>
          </div>
        </div>
      </div>
      {preview && previewFile ? (
        <DfPreview
          projectId={projectId}
          file={previewFile}
          onOpen={() => onOpenFile(previewFile.name)}
          onClose={() => setPreview(null)}
        />
      ) : null}
      {menuPos ? (
        <div
          data-testid="design-file-menu-popover"
          className="df-row-popover"
          style={{ top: menuPos.top, left: menuPos.left }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const name = menuPos.name;
              setMenuPos(null);
              onOpenFile(name);
            }}
          >
            {t('designFiles.openInTab')}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              startRename(menuPos.name);
            }}
          >
            {t('common.rename')}
          </button>
          <a
            href={projectFileUrl(projectId, menuPos.name)}
            download={menuPos.name}
            style={{ textDecoration: 'none' }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuPos(null);
              }}
            >
              {t('designFiles.download')}
            </button>
          </a>
          <button
            type="button"
            className="danger"
            data-testid={`design-file-delete-${menuPos.name}`}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const name = menuPos.name;
              setMenuPos(null);
              onDeleteFile(name);
            }}
          >
            {t('designFiles.delete')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function DfPreview({
  projectId,
  file,
  onOpen,
  onClose,
}: {
  projectId: string;
  file: ProjectFile;
  onOpen: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const url = projectFileUrl(projectId, file.name);
  return (
    <aside className="df-preview">
      <div className="df-preview-thumb">
        {file.kind === 'image' || file.kind === 'sketch' ? (
          <img src={`${url}?v=${Math.round(file.mtime)}`} alt={file.name} />
        ) : file.kind === 'html' ? (
          <iframe title={file.name} src={url} sandbox="allow-scripts" />
        ) : file.kind === 'video' ? (
          <video
            src={`${url}?v=${Math.round(file.mtime)}`}
            controls
            playsInline
            preload="metadata"
          />
        ) : file.kind === 'audio' ? (
          <audio src={`${url}?v=${Math.round(file.mtime)}`} controls preload="metadata" />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-faint)',
              fontSize: 38,
            }}
          >
            {kindGlyph(file.kind)}
          </div>
        )}
      </div>
      <div className="df-preview-meta" data-testid="design-file-preview">
        <button
          type="button"
          className="ghost"
          onClick={onOpen}
          style={{ alignSelf: 'flex-start' }}
        >
          <Icon name="eye" size={13} />
          <span>{t('designFiles.previewOpen')}</span>
        </button>
        <div className="df-preview-name">{file.name}</div>
        <div className="df-preview-kind">{kindLabel(file.kind, t)}</div>
        <div className="df-preview-stats">
          {t('designFiles.modified', {
            time: relativeTime(file.mtime, t),
            size: humanBytes(file.size),
          })}
        </div>
        <div className="df-preview-actions">
          <a
            className="ghost-link"
            href={url}
            download={file.name}
            style={{ textDecoration: 'none' }}
          >
            {t('designFiles.download')}
          </a>
          <button type="button" onClick={onClose}>
            {t('designFiles.previewClose')}
          </button>
        </div>
      </div>
    </aside>
  );
}

function kindSortPriority(kind: ProjectFileKind): number {
  if (kind === 'html') return 0;
  if (kind === 'text') return 1;
  if (kind === 'code') return 2;
  if (kind === 'sketch') return 3;
  if (kind === 'image') return 4;
  if (kind === 'document') return 5;
  if (kind === 'pdf') return 6;
  if (kind === 'presentation') return 7;
  if (kind === 'spreadsheet') return 8;
  if (kind === 'video') return 9;
  if (kind === 'audio') return 10;
  return 11;
}

function kindGlyph(kind: ProjectFileKind): string {
  if (kind === 'html') return '\u27E8\u27E9';
  if (kind === 'image') return '\u25A3';
  if (kind === 'sketch') return '\u270E';
  if (kind === 'text') return '\u00B6';
  if (kind === 'code') return '\u007B\u007D';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'document') return 'DOC';
  if (kind === 'presentation') return 'PPT';
  if (kind === 'spreadsheet') return 'XLS';
  return '\u00B7';
}

function kindLabel(kind: ProjectFileKind, t: TranslateFn): string {
  if (kind === 'html') return t('designFiles.kindHtml');
  if (kind === 'image') return t('designFiles.kindImage');
  if (kind === 'sketch') return t('designFiles.kindSketch');
  if (kind === 'text') return t('designFiles.kindText');
  if (kind === 'code') return t('designFiles.kindCode');
  if (kind === 'pdf') return t('designFiles.kindPdf');
  if (kind === 'document') return t('designFiles.kindDocument');
  if (kind === 'presentation') return t('designFiles.kindPresentation');
  if (kind === 'spreadsheet') return t('designFiles.kindSpreadsheet');
  return t('designFiles.kindBinary');
}

function relativeTime(ts: number, t: TranslateFn): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return t('common.justNow');
  if (diff < hr) return t('common.minutesAgo', { n: Math.floor(diff / min) });
  if (diff < day) return t('common.hoursAgo', { n: Math.floor(diff / hr) });
  if (diff < 7 * day) return t('common.daysAgo', { n: Math.floor(diff / day) });
  if (diff < 30 * day)
    return t('designFiles.weeksAgo', { n: Math.floor(diff / (7 * day)) });
  return new Date(ts).toLocaleDateString();
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
