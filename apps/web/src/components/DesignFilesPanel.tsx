import { useEffect, useMemo, useRef, useState } from 'react';
import { useAnalytics } from '../analytics/provider';
import { trackFileManagerClick } from '../analytics/events';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import { projectFileUrl, projectRawUrl } from '../providers/registry';
import { buildSrcdoc } from '../runtime/srcdoc';
import type { LiveArtifactWorkspaceEntry, ProjectFile, ProjectFileKind } from '../types';
import {
  createFileSystemReadError,
  FILE_SYSTEM_READ_ERROR_MESSAGE,
  isFileSystemReadError,
} from '../utils/fileSystemErrors';
import type { PluginFolderAgentAction } from './design-files/pluginFolderActions';
import { getPluginFolderCandidates } from './design-files/pluginFolders';
import { Icon } from './Icon';
import { LiveArtifactBadges } from './LiveArtifactBadges';
import { isRenderableSketchJson, SketchPreview } from './SketchPreview';

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
  uploadError?: string | null;
  onClearUploadError?: () => void;
  onPluginFolderAgentAction?: (
    relativePath: string,
    action: PluginFolderAgentAction,
  ) => Promise<{ message?: string; url?: string } | void> | { message?: string; url?: string } | void;
  activePluginActionPaths?: Set<string>;
  hiddenPluginActionPaths?: Set<string>;
}

interface ActionNotice {
  message: string;
  url?: string;
}

type DesignFilesGroupMode = 'kind' | 'modified';
type ModifiedSection = 'today' | 'yesterday' | 'previous7Days' | 'previous30Days' | 'older';
type SortKey = 'name' | 'kind' | 'mtime';
type SortDir = 'asc' | 'desc';
type FileSystemEntryWithReader = FileSystemEntry & {
  createReader?: () => FileSystemDirectoryReader;
};
type FileSystemFileEntryWithFile = FileSystemFileEntry & {
  file: (
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void,
  ) => void;
};
type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntry | null;
};

const MODIFIED_SECTION_ORDER: ModifiedSection[] = [
  'today',
  'yesterday',
  'previous7Days',
  'previous30Days',
  'older',
];
const MODIFIED_SECTION_LABEL_KEY: Record<ModifiedSection, keyof Dict> = {
  today: 'designFiles.modifiedToday',
  yesterday: 'designFiles.modifiedYesterday',
  previous7Days: 'designFiles.modifiedPrevious7Days',
  previous30Days: 'designFiles.modifiedPrevious30Days',
  older: 'designFiles.modifiedOlder',
};

function buildActionNotice(message: string, url?: string): ActionNotice {
  const trimmedMessage = message.trim();
  const trimmedUrl = url?.trim();
  if (!trimmedUrl) return { message: trimmedMessage };
  const normalizedMessage = trimmedMessage.replace(new RegExp(`\\s*${escapeRegExp(trimmedUrl)}\\s*$`), '');
  return { message: normalizedMessage.trim() || trimmedUrl, url: trimmedUrl };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ActionNoticeView({ notice }: { notice: ActionNotice | null }) {
  if (!notice) return null;
  return (
    <>
      <span>{notice.message}</span>
      {notice.url ? (
        <>
          {' '}
          <a href={notice.url} target="_blank" rel="noreferrer">
            {notice.url}
          </a>
        </>
      ) : null}
    </>
  );
}

/**
 * Full-panel browser for a project's `.od/projects/<id>/` folder. Mirrors
 * Claude Design's "Design Files" surface: grouped sections, hover-revealed
 * row menu, drop-files footer, and (when a row is selected) a right-side
 * preview pane. Triggered as a sticky first tab in FileWorkspace.
 */
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
  uploadError = null,
  onClearUploadError,
  onPluginFolderAgentAction,
  activePluginActionPaths = new Set(),
  hiddenPluginActionPaths = new Set(),
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const [refreshing, setRefreshing] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [dropReadError, setDropReadError] = useState<string | null>(null);
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
  const [installingFolder, setInstallingFolder] = useState<string | null>(null);
  const [sharingFolder, setSharingFolder] = useState<string | null>(null);
  const [installNotice, setInstallNotice] = useState<ActionNotice | null>(null);
  const [groupMode, setGroupMode] = useState<DesignFilesGroupMode>('kind');
  const [collapsedModifiedSections, setCollapsedModifiedSections] = useState<
    Set<ModifiedSection>
  >(new Set());
  const [renaming, setRenaming] = useState<{ name: string; draft: string; saving: boolean } | null>(null);
  const [dayBoundary, setDayBoundary] = useState(() => Date.now());
  const [kindFilter, setKindFilter] = useState<Set<ProjectFileKind>>(() => new Set());
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const [currentDir, setCurrentDir] = useState<string>('');

  // Derive immediate subdirectories and files at the current directory level
  // from the flat files list. Files with names like "a/b/c.html" contribute
  // "a" as a directory when currentDir is '' and "b" when currentDir is "a".
  const { dirsAtCurrentDir, filesAtCurrentDir } = useMemo(() => {
    const prefix = currentDir === '' ? '' : `${currentDir}/`;
    const dirs = new Set<string>();
    const localFiles: ProjectFile[] = [];
    for (const f of files) {
      if (!f.name.startsWith(prefix)) continue;
      const remainder = f.name.slice(prefix.length);
      const slashIdx = remainder.indexOf('/');
      if (slashIdx === -1) {
        localFiles.push(f);
      } else {
        dirs.add(remainder.slice(0, slashIdx));
      }
    }
    return {
      dirsAtCurrentDir: [...dirs].sort((a, b) => a.localeCompare(b)),
      filesAtCurrentDir: localFiles,
    };
  }, [files, currentDir]);

  const kindCounts = useMemo(() => {
    const counts = new Map<ProjectFileKind, number>();
    for (const f of filesAtCurrentDir) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
    return counts;
  }, [filesAtCurrentDir]);

  const availableKinds = useMemo(
    () =>
      Array.from(kindCounts.keys()).sort(
        (a, b) => kindSortPriority(a) - kindSortPriority(b),
      ),
    [kindCounts],
  );

  // Drop any selected-filter kinds that no longer appear in the file list
  // (e.g. after a delete leaves the kind empty). Keeps the filter UI honest
  // and prevents a stale filter from silently hiding everything.
  useEffect(() => {
    setKindFilter((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(availableKinds);
      const next = new Set<ProjectFileKind>();
      let changed = false;
      for (const k of prev) {
        if (present.has(k)) next.add(k);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [availableKinds]);

  const filteredFiles = useMemo(() => {
    if (kindFilter.size === 0) return filesAtCurrentDir;
    return filesAtCurrentDir.filter((f) => kindFilter.has(f.kind));
  }, [filesAtCurrentDir, kindFilter]);

  const sortedFiles = useMemo(() => {
    return [...filteredFiles].sort((a, b) => {
      let cmp: number;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'kind') cmp = kindSortPriority(a.kind) - kindSortPriority(b.kind);
      else cmp = a.mtime - b.mtime;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredFiles, sortKey, sortDir]);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number | 'all'>(30);

  const effectivePageSize = pageSize === 'all' ? Math.max(1, sortedFiles.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(sortedFiles.length / effectivePageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageFiles = useMemo(
    () =>
      sortedFiles.slice(
        safePage * effectivePageSize,
        (safePage + 1) * effectivePageSize,
      ),
    [effectivePageSize, safePage, sortedFiles],
  );
  const modifiedGroups = useMemo(() => {
    const groups: Record<ModifiedSection, ProjectFile[]> = {
      today: [],
      yesterday: [],
      previous7Days: [],
      previous30Days: [],
      older: [],
    };
    const thresholds = modifiedSectionThresholds(dayBoundary);
    for (const f of pageFiles) {
      groups[modifiedSectionFor(f.mtime, thresholds)].push(f);
    }
    return groups;
  }, [dayBoundary, pageFiles]);
  const visibleModifiedSections = MODIFIED_SECTION_ORDER.filter(
    (section) => modifiedGroups[section].length > 0,
  );
  const rangeStart = safePage * effectivePageSize + 1;
  const rangeEnd = Math.min((safePage + 1) * effectivePageSize, sortedFiles.length);
  const allPageSelected = pageFiles.length > 0 && pageFiles.every((f) => selected.has(f.name));
  const somePageSelected = !allPageSelected && pageFiles.some((f) => selected.has(f.name));
  const hasMultiplePages = totalPages > 1;
  const showListControls = sortedFiles.length > 15 || selected.size > 0;

  useEffect(() => {
    setPage(0);
  }, [pageSize]);

  // Reset to the first page when the filter changes — the previous page
  // index may no longer exist (or may now sit past the new totalPages).
  useEffect(() => {
    setPage(0);
  }, [kindFilter]);

  // Drop any selected files that fall outside the active filter. Without
  // this, bulk delete / download would silently operate on rows the user
  // can no longer see — particularly dangerous for destructive deletes.
  // We keep the empty-filter branch a no-op so clearing the filter
  // doesn't disturb existing selections.
  useEffect(() => {
    if (kindFilter.size === 0) return;
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filteredFiles.map((f) => f.name));
      const next = new Set<string>();
      let changed = false;
      for (const name of prev) {
        if (visible.has(name)) next.add(name);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [filteredFiles, kindFilter]);

  // Reset page, selection, and renaming state when the user navigates
  // into or out of a directory.
  useEffect(() => {
    setPage(0);
    setSelected(new Set());
    setRenaming(null);
  }, [currentDir]);

  // Navigate up to the nearest ancestor that still exists when files under
  // currentDir disappear (e.g. after deleting the last file in a subfolder).
  useEffect(() => {
    if (currentDir === '') return;
    const prefix = `${currentDir}/`;
    if (files.some((f) => f.name.startsWith(prefix))) return;
    const parts = currentDir.split('/');
    for (let i = parts.length - 1; i > 0; i--) {
      const ancestor = parts.slice(0, i).join('/');
      if (files.some((f) => f.name.startsWith(`${ancestor}/`))) {
        setCurrentDir(ancestor);
        return;
      }
    }
    setCurrentDir('');
  }, [files, currentDir]);

  // Outside-click + escape to close the filter popover. Stops short of a
  // full focus trap because the popover hosts only checkboxes plus a
  // small clear button; the existing tab order through them is fine.
  useEffect(() => {
    if (!filterMenuOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      const root = filterMenuRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) {
        setFilterMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFilterMenuOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [filterMenuOpen]);

  function toggleKindFilter(kind: ProjectFileKind): void {
    setKindFilter((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  useEffect(() => {
    if (Number.isFinite(totalPages)) setPage((p) => Math.min(p, totalPages - 1));
  }, [totalPages]);

  useEffect(() => {
    const now = Date.now();
    const startOfTomorrow = new Date(now);
    startOfTomorrow.setHours(24, 0, 0, 0);
    const timer = window.setTimeout(
      () => setDayBoundary(Date.now()),
      Math.max(1, startOfTomorrow.getTime() - now),
    );
    return () => window.clearTimeout(timer);
  }, [dayBoundary]);

  const pluginFolders = useMemo(() => getPluginFolderCandidates(files), [files]);

  // Prune selections that no longer exist in the current file list
  // (e.g. after a refresh or delete within the same project).
  // Cross-project leaks are handled by the parent remounting this
  // component via key={projectId}.
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
    const draft = currentDir === '' ? name : name.slice(currentDir.length + 1);
    setRenaming({ name, draft, saving: false });
  }

  async function commitRename(name: string, draft: string) {
    const nextBasename = draft.trim();
    if (!nextBasename) {
      setRenaming(null);
      return;
    }
    const nextName = currentDir === '' ? nextBasename : `${currentDir}/${nextBasename}`;
    if (nextName === name) {
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

  function toggleModifiedSection(section: ModifiedSection) {
    setCollapsedModifiedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }

  function renderFileRow(f: ProjectFile) {
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
              onChange={(e) => setRenaming({ ...renameState, draft: e.target.value })}
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
                <span className="df-row-name">{currentDir === '' ? f.name : f.name.slice(currentDir.length + 1)}</span>
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
  }

  function renderDirRow(dirName: string) {
    const fullPath = currentDir === '' ? dirName : `${currentDir}/${dirName}`;
    const prefix = `${fullPath}/`;
    const count = files.filter((f) => f.name.startsWith(prefix)).length;
    return (
      <tr key={`dir:${fullPath}`} className="df-file-row df-dir-row">
        <td className="df-cell-check" />
        <td className="df-cell-icon df-cell-openable" onClick={() => setCurrentDir(fullPath)}>
          <span className="df-row-icon" data-kind="folder" aria-hidden>
            <Icon name="folder" size={14} />
          </span>
        </td>
        <td className="df-cell-name df-cell-openable" onClick={() => setCurrentDir(fullPath)}>
          <button type="button" className="df-row-name-btn" onClick={() => setCurrentDir(fullPath)}>
            <span className="df-row-name-wrap">
              <span className="df-row-name">{dirName}</span>
              <span className="df-row-sub">{t('designFiles.folderCount', { n: count })}</span>
            </span>
          </button>
        </td>
        <td className="df-cell-kind df-cell-openable" onClick={() => setCurrentDir(fullPath)}>
          <span className="df-kind-label">{t('designFiles.kindFolder')}</span>
        </td>
        <td className="df-cell-time df-cell-openable" onClick={() => setCurrentDir(fullPath)} />
        <td className="df-cell-menu" />
      </tr>
    );
  }

  function renderModifiedSections() {
    const dirRows = dirsAtCurrentDir.map((d) => renderDirRow(d));
    const sectionRows = visibleModifiedSections.flatMap((section) => {
      const sectionFiles = modifiedGroups[section];
      const collapsed = collapsedModifiedSections.has(section);
      const label = t(MODIFIED_SECTION_LABEL_KEY[section]);
      return [
        <tr className="df-section-row" key={`${section}-label`}>
          <td colSpan={6}>
            <button
              type="button"
              className="df-section-toggle"
              aria-expanded={!collapsed}
              aria-label={`${collapsed ? t('designFiles.expandGroup') : t('designFiles.collapseGroup')} ${label}`}
              onClick={() => toggleModifiedSection(section)}
            >
              <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} size={13} />
              <span>{label}</span>
              <span className="df-section-count">{sectionFiles.length}</span>
            </button>
          </td>
        </tr>,
        ...(collapsed ? [] : sectionFiles.map(renderFileRow)),
      ];
    });
    return [...dirRows, ...sectionRows];
  }

  function renderKindSections() {
    const dirRows = dirsAtCurrentDir.map((d) => renderDirRow(d));
    const grouped = new Map<ProjectFileKind, ProjectFile[]>();
    for (const file of pageFiles) {
      const next = grouped.get(file.kind) ?? [];
      next.push(file);
      grouped.set(file.kind, next);
    }

    const kindRows = [...grouped.entries()]
      .sort(([a], [b]) => kindSortPriority(a) - kindSortPriority(b))
      .flatMap(([kind, kindFiles]) => [
        <tr className="df-section-row" key={`${kind}-label`}>
          <td colSpan={6}>
            <div className="df-section-label">
              <span>{kindLabel(kind, t)}</span>
              <span className="df-section-count">{kindFiles.length}</span>
            </div>
          </td>
        </tr>,
        ...kindFiles.map(renderFileRow),
      ]);
    return [...dirRows, ...kindRows];
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

  async function handleDrop(ev: React.DragEvent<HTMLDivElement>) {
    ev.preventDefault();
    dragDepthRef.current = 0;
    setDraggingFiles(false);
    setDropReadError(null);
    try {
      const dropped = await filesFromDataTransfer(ev.dataTransfer);
      if (dropped.length > 0) onUploadFiles(dropped);
    } catch (error) {
      if (!isFileSystemReadError(error)) throw error;
      setDropReadError(FILE_SYSTEM_READ_ERROR_MESSAGE);
    }
  }

  async function handlePluginFolderAgentAction(
    relativePath: string,
    action: PluginFolderAgentAction,
  ) {
    if (!onPluginFolderAgentAction || installingFolder || sharingFolder) return;
    setInstallNotice(null);
    if (action === 'install') {
      setInstallingFolder(relativePath);
    } else {
      setSharingFolder(`${action}:${relativePath}`);
    }
    try {
      const outcome = await onPluginFolderAgentAction(relativePath, action);
      const url = outcome && typeof outcome === 'object' && typeof outcome.url === 'string'
        ? outcome.url
        : '';
      const message = outcome && typeof outcome === 'object' && typeof outcome.message === 'string'
        ? outcome.message
        : '';
      if (message || url) setInstallNotice(buildActionNotice(message || url, url));
    } catch (err) {
      setInstallNotice({ message: err instanceof Error ? err.message : String(err) });
    } finally {
      setInstallingFolder(null);
      setSharingFolder(null);
    }
  }

  const refreshControl = (
    <button
      type="button"
      className="icon-only df-refresh-control"
      onClick={() => void handleRefresh()}
      disabled={refreshing}
      title={t('designFiles.refresh')}
      aria-label={t('designFiles.refresh')}
    >
      <Icon name={refreshing ? 'spinner' : 'reload'} size={14} />
    </button>
  );

  const fileActions =
    selected.size > 0 ? (
      <div className="df-actions">
        <button
          type="button"
          onClick={() => {
            trackFileManagerClick(analytics.track, {
              page_name: 'file_manager',
              area: 'file_manager',
              element: 'download_as_zip',
            });
            void handleBatchDownload();
          }}
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
    );

  const groupToggle =
    files.length > 0 ? (
      <div
        className="df-group-toggle"
        role="group"
        aria-label={t('designFiles.groupBy')}
      >
        <span>{t('designFiles.groupBy')}</span>
        <button
          type="button"
          className={groupMode === 'kind' ? 'active' : ''}
          aria-pressed={groupMode === 'kind'}
          onClick={() => setGroupMode('kind')}
        >
          {t('designFiles.groupByKind')}
        </button>
        <button
          type="button"
          className={groupMode === 'modified' ? 'active' : ''}
          aria-pressed={groupMode === 'modified'}
          onClick={() => setGroupMode('modified')}
        >
          {t('designFiles.groupByModified')}
        </button>
      </div>
    ) : (
      <span className="df-controls-spacer" aria-hidden="true" />
    );

  const kindFilterControl =
    files.length > 0 && availableKinds.length > 1 ? (
      <div className="df-kind-filter" ref={filterMenuRef}>
        <button
          type="button"
          className={`df-kind-filter-trigger${kindFilter.size > 0 ? ' active' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={filterMenuOpen}
          aria-label={t('designFiles.filterBy')}
          onClick={() => setFilterMenuOpen((open) => !open)}
        >
          <Icon name="sliders" size={13} />
          <span className="df-kind-filter-trigger-label">
            {kindFilter.size === 0
              ? t('designFiles.filterBy')
              : kindFilter.size === 1
                ? kindLabel(Array.from(kindFilter)[0]!, t)
                : t('designFiles.filterCount', { n: kindFilter.size })}
          </span>
          {kindFilter.size > 0 ? (
            <span
              className="df-kind-filter-count"
              aria-hidden
            >
              {kindFilter.size}
            </span>
          ) : null}
        </button>
        {filterMenuOpen ? (
          <div
            className="df-kind-filter-popover"
            role="dialog"
            aria-label={t('designFiles.filterBy')}
          >
            <div className="df-kind-filter-header">
              <span>{t('designFiles.filterBy')}</span>
              {kindFilter.size > 0 ? (
                <button
                  type="button"
                  className="df-kind-filter-clear"
                  onClick={() => setKindFilter(new Set())}
                >
                  {t('designFiles.filterClear')}
                </button>
              ) : null}
            </div>
            <ul className="df-kind-filter-list">
              {availableKinds.map((kind) => {
                const checked = kindFilter.has(kind);
                const count = kindCounts.get(kind) ?? 0;
                return (
                  <li key={kind}>
                    <label className="df-kind-filter-item">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleKindFilter(kind)}
                      />
                      <span className="df-kind-filter-glyph" aria-hidden>
                        {kindGlyph(kind)}
                      </span>
                      <span className="df-kind-filter-label">
                        {kindLabel(kind, t)}
                      </span>
                      <span className="df-kind-filter-itemcount">
                        {count}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    ) : null;

  const visibleUploadError = uploadError ?? dropReadError;

  return (
    <div className={`df-panel ${preview ? '' : 'no-preview'}`}>
      <div className="df-main">
        <div className="df-body">
          {visibleUploadError && !preview ? (
            <div className="df-upload-banner" data-testid="upload-error-banner">
              <span>{visibleUploadError}</span>
              {onClearUploadError || dropReadError ? (
                <button
                  type="button"
                  data-testid="upload-error-dismiss"
                  onClick={() => {
                    setDropReadError(null);
                    onClearUploadError?.();
                  }}
                >
                  Dismiss
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="df-controls-row">
            {refreshControl}
            {groupToggle}
            {kindFilterControl}
            {fileActions}
          </div>
          {currentDir !== '' ? (
            <nav className="df-breadcrumbs" aria-label={t('designFiles.crumbs')}>
              <button
                type="button"
                className="df-breadcrumb-btn"
                onClick={() => setCurrentDir('')}
              >
                {t('designFiles.crumbs')}
              </button>
              {currentDir.split('/').map((segment, idx, parts) => {
                const path = parts.slice(0, idx + 1).join('/');
                const isLast = idx === parts.length - 1;
                return (
                  <span key={path} className="df-breadcrumb-segment">
                    <span className="df-breadcrumb-sep" aria-hidden>/</span>
                    {isLast ? (
                      <span className="df-breadcrumb-current">{segment}</span>
                    ) : (
                      <button
                        type="button"
                        className="df-breadcrumb-btn"
                        onClick={() => setCurrentDir(path)}
                      >
                        {segment}
                      </button>
                    )}
                  </span>
                );
              })}
            </nav>
          ) : null}
          {files.length === 0 && liveArtifacts.length === 0 ? (
            <div className="df-empty" data-testid="design-files-empty">
              <div className="df-empty-pill">
                <span className="df-empty-title">
                  {t('designFiles.empty')}
                </span>
                <button
                  type="button"
                  className="df-empty-cta"
                  data-testid="design-files-empty-new-sketch"
                  onClick={onNewSketch}
                  title={t('designFiles.newSketch')}
                >
                  <Icon name="pencil" size={13} />
                  <span>{t('designFiles.newSketch')}</span>
                </button>
              </div>
            </div>
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
              {pluginFolders.length > 0 ? (
                <div className="df-section" key="plugin-folders">
                  <div className="df-section-label">
                    Plugin folders
                    <span className="df-section-count">{pluginFolders.length}</span>
                  </div>
                  {installNotice ? (
                    <div className="df-inline-notice" role="status">
                      <ActionNoticeView notice={installNotice} />
                    </div>
                  ) : null}
                  {pluginFolders.filter((folder) => !hiddenPluginActionPaths.has(folder.path)).map((folder) => {
                    const actionBusy = activePluginActionPaths.has(folder.path);
                    return (
                    <div
                      key={folder.path}
                      className="df-row df-row-plugin-folder"
                      data-testid={`design-plugin-folder-${folder.path}`}
                    >
                      <button
                        type="button"
                        className="df-row-folder-main"
                        onClick={() => setPreview(folder.manifestPath)}
                      >
                        <span className="df-row-icon" data-kind="folder" aria-hidden>
                          DIR
                        </span>
                        <span className="df-row-name-wrap">
                          <span className="df-row-name">{folder.path}</span>
                          <span className="df-row-sub">
                            {folder.fileCount} files · ready to add to My plugins
                          </span>
                        </span>
                      </button>
                      <span className="df-row-time">{relativeTime(folder.updatedAt, t)}</span>
                      {onPluginFolderAgentAction ? (
                        <div className="df-plugin-actions">
                          <button
                            type="button"
                            className="df-plugin-install"
                            data-testid={`design-plugin-folder-install-${folder.path}`}
                            disabled={actionBusy || installingFolder !== null || sharingFolder !== null}
                            onClick={() =>
                              void handlePluginFolderAgentAction(folder.path, 'install')
                            }
                          >
                            {installingFolder === folder.path ? 'Sending…' : 'Add to My plugins'}
                          </button>
                          <button
                            type="button"
                            className="df-plugin-install"
                            data-testid={`design-plugin-folder-publish-${folder.path}`}
                            disabled={actionBusy || installingFolder !== null || sharingFolder !== null}
                            onClick={() =>
                              void handlePluginFolderAgentAction(folder.path, 'publish')
                            }
                          >
                            {sharingFolder === `publish:${folder.path}` ? 'Sending…' : 'Publish repo'}
                          </button>
                          <button
                            type="button"
                            className="df-plugin-install"
                            data-testid={`design-plugin-folder-contribute-${folder.path}`}
                            disabled={actionBusy || installingFolder !== null || sharingFolder !== null}
                            onClick={() =>
                              void handlePluginFolderAgentAction(folder.path, 'contribute')
                            }
                          >
                            {sharingFolder === `contribute:${folder.path}` ? 'Sending…' : 'Open Design PR'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )})}
                </div>
              ) : null}
              {(sortedFiles.length > 0 || dirsAtCurrentDir.length > 0) ? (
                <>
                  {showListControls ? (
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
                      {!hasMultiplePages ? (
                        <span className="df-page-info">
                          {t('designFiles.pageInfo', { start: rangeStart, end: rangeEnd, total: sortedFiles.length })}
                        </span>
                      ) : null}
                      <div className="df-select-bar">
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
                    </div>
                  ) : null}
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
                      {groupMode === 'modified'
                        ? renderModifiedSections()
                        : groupMode === 'kind'
                          ? renderKindSections()
                          : [...dirsAtCurrentDir.map(renderDirRow), ...pageFiles.map(renderFileRow)]}
                    </tbody>
                  </table>
                  {hasMultiplePages ? (
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
                  ) : null}
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
        // Key on the file name so React unmounts the previous DfPreview
        // (and its iframe / image element) when the user clicks a
        // different file. Without this, React diffing reuses the same
        // iframe DOM node and the browser keeps showing the first
        // file's contents — only the `src` prop changes but the iframe
        // never actually navigates.
        <DfPreview
          key={previewFile.name}
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
  const rendersSketchJson = isRenderableSketchJson(file);
  const openPreviewLabel = `${t('designFiles.previewOpen')} ${file.name}`;
  const thumbCanOpen = file.kind !== 'audio' && file.kind !== 'video';
  return (
    <aside className="df-preview">
      <button
        type="button"
        className="df-preview-close"
        onClick={onClose}
        title={t('designFiles.previewClose')}
        aria-label={t('designFiles.previewClose')}
      >
        <Icon name="close" size={13} />
      </button>
      <div className={`df-preview-thumb${thumbCanOpen ? ' is-openable' : ''}`}>
        {rendersSketchJson ? (
          <SketchPreview projectId={projectId} file={file} />
        ) : file.kind === 'image' || file.kind === 'sketch' ? (
          <img src={`${url}?v=${Math.round(file.mtime)}`} alt={file.name} />
        ) : file.kind === 'html' ? (
          <HtmlPreviewThumbnail projectId={projectId} file={file} />
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
        {thumbCanOpen ? (
          <button
            type="button"
            className="df-preview-thumb-open"
            onClick={onOpen}
            title={openPreviewLabel}
            aria-label={openPreviewLabel}
          />
        ) : null}
      </div>
      <div className="df-preview-meta" data-testid="design-file-preview">
        <div className="df-preview-actions">
          <button type="button" className="ghost" onClick={onOpen}>
            <Icon name="eye" size={13} />
            <span>{t('designFiles.previewOpen')}</span>
          </button>
          <a
            className="ghost-link"
            href={url}
            download={file.name}
          >
            <Icon name="download" size={13} />
            <span>{t('designFiles.download')}</span>
          </a>
        </div>
        <div className="df-preview-name">{file.name}</div>
        <div className="df-preview-kind">{kindLabel(file.kind, t)}</div>
        <div className="df-preview-stats">
          {t('designFiles.modified', {
            time: relativeTime(file.mtime, t),
            size: humanBytes(file.size),
          })}
        </div>
      </div>
    </aside>
  );
}

function HtmlPreviewThumbnail({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const url = projectFileUrl(projectId, file.name);
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch(`${url}?v=${Math.round(file.mtime)}`)
      .then((response) => (response.ok ? response.text() : null))
      .then((html) => {
        if (cancelled || html === null) return;
        setSrcDoc(buildSrcdoc(html, { baseHref: projectRawUrl(projectId, baseDirForFile(file.name)) }));
      })
      .catch(() => {
        if (!cancelled) setSrcDoc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [file.mtime, file.name, projectId, url]);

  return (
    <iframe
      title={file.name}
      src={srcDoc ? undefined : url}
      srcDoc={srcDoc ?? undefined}
      sandbox="allow-scripts allow-downloads"
    />
  );
}

function baseDirForFile(name: string): string {
  const index = name.lastIndexOf('/');
  return index >= 0 ? name.slice(0, index + 1) : '';
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

interface ModifiedSectionThresholds {
  todayStart: number;
  yesterdayStart: number;
  previous7DaysStart: number;
  previous30DaysStart: number;
}

function modifiedSectionThresholds(now: number): ModifiedSectionThresholds {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return {
    todayStart: startOfToday.getTime(),
    yesterdayStart: dateDaysBefore(startOfToday, 1).getTime(),
    previous7DaysStart: dateDaysBefore(startOfToday, 7).getTime(),
    previous30DaysStart: dateDaysBefore(startOfToday, 30).getTime(),
  };
}

function modifiedSectionFor(ts: number, thresholds: ModifiedSectionThresholds): ModifiedSection {
  const { todayStart, yesterdayStart, previous7DaysStart, previous30DaysStart } = thresholds;
  if (ts >= todayStart) return 'today';
  if (ts >= yesterdayStart) return 'yesterday';
  if (ts >= previous7DaysStart) return 'previous7Days';
  if (ts >= previous30DaysStart) return 'previous30Days';
  return 'older';
}

function dateDaysBefore(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

async function filesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const fallbackFiles = Array.from(dataTransfer.files ?? []);
  if (items.length === 0) return fallbackFiles;

  const results = await Promise.allSettled(items.map(filesFromDataTransferItem));
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (rejected) {
    if (fallbackFiles.length > 0) return fallbackFiles;
    throw rejected.reason;
  }
  const files = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  return files.length > 0 ? files : fallbackFiles;
}

async function filesFromDataTransferItem(item: DataTransferItem): Promise<File[]> {
  const entry = (item as DataTransferItemWithEntry).webkitGetAsEntry?.();
  if (!entry) {
    const file = item.kind === 'file' ? item.getAsFile() : null;
    return file ? [file] : [];
  }
  return filesFromFileSystemEntry(entry);
}

async function filesFromFileSystemEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) return [await fileFromEntry(entry as FileSystemFileEntryWithFile)];
  if (!entry.isDirectory) return [];

  const reader = (entry as FileSystemEntryWithReader).createReader?.();
  if (!reader) return [];

  const files: File[] = [];
  for (;;) {
    const entries = await readEntryBatch(reader);
    if (entries.length === 0) break;
    const nested = await Promise.all(entries.map(filesFromFileSystemEntry));
    files.push(...nested.flat());
  }
  return files;
}

function fileFromEntry(entry: FileSystemFileEntryWithFile): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, (error) => {
      reject(createFileSystemReadError('Could not read dropped file', error));
    });
  });
}

function readEntryBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, (error) => {
      reject(createFileSystemReadError('Could not read dropped folder', error));
    });
  });
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
