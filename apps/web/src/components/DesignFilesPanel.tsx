import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import { useAnalytics } from '../analytics/provider';
import { trackFileManagerClick } from '../analytics/events';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { projectFileUrl, projectRawUrl } from '../providers/registry';
import { buildSrcdoc } from '../runtime/srcdoc';
import type { LiveArtifactWorkspaceEntry, ProjectFile, ProjectFileKind, ProjectFolder } from '../types';
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
  /** Absolute on-disk project directory, used to build absolute file paths
   * for the "copy path" menu action. */
  resolvedDir?: string;
  files: ProjectFile[];
  folders?: ProjectFolder[];
  liveArtifacts: LiveArtifactWorkspaceEntry[];
  onRefreshFiles: () => Promise<void> | void;
  /** Notified whenever the viewed folder changes, so the host can route new
   * files (uploads, pastes, sketches) into that folder. '' means project root. */
  onCurrentDirChange?: (dir: string) => void;
  onOpenFile: (name: string) => void;
  onOpenLiveArtifact: (tabId: LiveArtifactWorkspaceEntry['tabId']) => void;
  onRenameFile: (from: string, to: string) => Promise<ProjectFile | null> | ProjectFile | null;
  onDeleteFile: (name: string) => void;
  onDeleteFiles: (names: string[]) => Promise<void> | void;
  onUpload: () => void;
  onUploadFiles: (files: File[]) => void;
  onCreateFolder?: (name: string) => Promise<ProjectFolder | null> | ProjectFolder | null;
  onDeleteFolder?: (folderPath: string) => Promise<boolean> | boolean;
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

interface DirectoryRow {
  label: string;
  path: string;
}

// Storage key for per-project view state. Bump the version suffix (v1 → v2) when
// removing or renaming a persisted field — just adding an optional field is safe
// without a version bump. No cleanup of old keys on project deletion; the keys
// are small preference blobs and orphan gracefully.
const VIEW_STATE_KEY_PREFIX = 'od:design-files:view-state:v1:';

const DEFAULT_SORT_KEY: SortKey = 'mtime';
const DEFAULT_SORT_DIR: SortDir = 'desc';
const DEFAULT_PAGE_SIZE: number | 'all' = 30;
const PAGE_SIZE_OPTIONS = [15, 30, 45, 60, 'all'] as const;

interface PersistedViewState {
  sortKey?: SortKey;
  sortDir?: SortDir;
  pageSize?: number | 'all';
  kindFilter?: string[];
}

function readViewState(projectId: string): PersistedViewState {
  try {
    if (typeof window === 'undefined') return {};
    const raw = localStorage.getItem(VIEW_STATE_KEY_PREFIX + projectId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as PersistedViewState;
  } catch {
    return {};
  }
}

function writeViewState(projectId: string, state: PersistedViewState): void {
  try {
    localStorage.setItem(VIEW_STATE_KEY_PREFIX + projectId, JSON.stringify(state));
  } catch {
    // localStorage unavailable (private mode, quota exceeded) — silently skip
  }
}

function isSortKey(v: unknown): v is SortKey {
  return v === 'name' || v === 'kind' || v === 'mtime';
}

function isSortDir(v: unknown): v is SortDir {
  return v === 'asc' || v === 'desc';
}

function isPageSize(v: unknown): v is number | 'all' {
  return (PAGE_SIZE_OPTIONS as ReadonlyArray<unknown>).includes(v);
}

// Validate that a value is one of the known ProjectFileKind literals. This
// guards against stored values that were valid under a previous schema but
// are no longer part of the union — they are silently dropped rather than
// poisoning the kindFilter state.
const VALID_KIND_SET: ReadonlySet<string> = new Set<ProjectFileKind>([
  'html', 'image', 'video', 'audio', 'sketch', 'text',
  'code', 'pdf', 'document', 'presentation', 'spreadsheet', 'binary',
]);

function isProjectFileKind(v: unknown): v is ProjectFileKind {
  return typeof v === 'string' && VALID_KIND_SET.has(v);
}
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
  resolvedDir,
  files,
  folders = [],
  liveArtifacts,
  onRefreshFiles,
  onCurrentDirChange,
  onOpenFile,
  onOpenLiveArtifact,
  onRenameFile,
  onDeleteFile,
  onDeleteFiles,
  onUpload,
  onUploadFiles,
  onCreateFolder,
  onDeleteFolder,
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
  const internalDragNamesRef = useRef<string[]>([]);
  const [menuPos, setMenuPos] = useState<{ name: string; top: number; left: number } | null>(null);
  // Folder rows get their own context menu (open / copy path / delete); `path`
  // is the folder's project-relative path.
  const [folderMenuPos, setFolderMenuPos] = useState<{ path: string; top: number; left: number } | null>(null);
  // Transient confirmation toast shown after an action (copy path, create /
  // delete folder, move files). Auto-dismisses.
  const [toast, setToast] = useState<string | null>(null);
  const MENU_ESTIMATED_HEIGHT = 180;
  const MENU_SAFE_PADDING = 8;
  const [preview, setPreview] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Read once at mount; projectId is stable for this component instance
  // (parent uses key={projectId} to remount on project switch).
  const savedViewState = useRef(readViewState(projectId));
  // Guard for the persist useEffect: skip the initial write so we only
  // flush to localStorage when the user actually changes a preference.
  // Without this, every project the user opens gets a default-value entry
  // written on first render, making stale-key garbage grow unbounded.
  // Note: React 18 StrictMode (active in next dev) fires effects twice,
  // keeping refs intact across the simulated remount. This means the guard
  // fires on the first effect run, sets the ref true, and the second run
  // then writes the defaults. The result is a harmless default-value entry
  // for the project; subsequent user changes overwrite it correctly. The
  // invariant ("no write without a user action") only holds in production
  // builds where StrictMode is not active.
  const viewStateHasMounted = useRef(false);
  const [sortKey, setSortKey] = useState<SortKey>(
    () => isSortKey(savedViewState.current.sortKey) ? savedViewState.current.sortKey : DEFAULT_SORT_KEY,
  );
  const [sortDir, setSortDir] = useState<SortDir>(
    () => isSortDir(savedViewState.current.sortDir) ? savedViewState.current.sortDir : DEFAULT_SORT_DIR,
  );
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
  // In-app dialogs for folder name input and move-to-folder. These replace
  // window.prompt(), which throws ("prompt() is not supported.") in the
  // Electron desktop host and silently aborted folder creation / moves there.
  const [folderDialogDefault, setFolderDialogDefault] = useState<string | null>(null);
  const [moveDialogNames, setMoveDialogNames] = useState<string[] | null>(null);
  const [dayBoundary, setDayBoundary] = useState(() => Date.now());
  const [kindFilter, setKindFilter] = useState<Set<ProjectFileKind>>(() => {
    const { kindFilter: kf } = savedViewState.current;
    if (!Array.isArray(kf) || kf.length === 0) return new Set();
    // Validate each stored value against the current ProjectFileKind union so
    // stale values from a prior schema (e.g. a renamed kind) are dropped silently.
    return new Set(kf.filter(isProjectFileKind));
  });
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const [currentDir, setCurrentDir] = useState<string>('');
  const [optimisticFolderPaths, setOptimisticFolderPaths] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const folderPaths = useMemo(() => {
    const dirs = new Set<string>();
    const addAncestors = (name: string) => {
      const parts = name.split('/').filter(Boolean);
      const max = name.endsWith('/') ? parts.length : parts.length - 1;
      for (let i = 1; i <= max; i += 1) {
        dirs.add(parts.slice(0, i).join('/'));
      }
    };
    for (const f of files) addAncestors(f.name);
    for (const folder of folders) {
      const path = folder.path || folder.name;
      const parts = path.split('/').filter(Boolean);
      for (let i = 1; i <= parts.length; i += 1) {
        dirs.add(parts.slice(0, i).join('/'));
      }
    }
    for (const folderPath of optimisticFolderPaths) addAncestors(`${folderPath}/`);
    return [...dirs].sort((a, b) => a.localeCompare(b));
  }, [files, folders, optimisticFolderPaths]);

  const folderPathSet = useMemo(() => new Set(folderPaths), [folderPaths]);

  // Modified time per folder path, from the persisted folder listing. Derived
  // folders (inferred from a file's path) and freshly-created optimistic
  // folders have no entry, so their row shows no time until the next refresh.
  const folderMtimeByPath = useMemo(() => {
    const map = new Map<string, number>();
    for (const folder of folders) {
      const p = folder.path || folder.name;
      if (p) map.set(p, folder.mtime);
    }
    return map;
  }, [folders]);

  // Recursive descendant count per folder path, in ONE pass over `files`.
  // Each dir row previously ran `files.filter(f => f.name.startsWith(prefix))`,
  // making rendering O(dirs × files); this makes it O(files) once + an O(1)
  // lookup per row. Walking each entry's `/` boundaries and incrementing every
  // ancestor prefix reproduces the old startsWith(`${folder}/`) count exactly.
  const fileCountByFolder = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of files) {
      const name = f.name;
      let idx = name.indexOf('/');
      while (idx !== -1) {
        const folder = name.slice(0, idx);
        counts.set(folder, (counts.get(folder) ?? 0) + 1);
        idx = name.indexOf('/', idx + 1);
      }
    }
    return counts;
  }, [files]);

  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const searchActive = normalizedSearchQuery.length > 0;

  // Derive immediate subdirectories and files at the current directory level
  // from the flat files list and persisted empty folders. With a search query,
  // switch to a project-wide result set so nested files are discoverable.
  const { dirsAtCurrentDir, filesAtCurrentDir } = useMemo(() => {
    if (normalizedSearchQuery) {
      return {
        dirsAtCurrentDir: folderPaths
          .filter((folderPath) => folderPath.toLocaleLowerCase().includes(normalizedSearchQuery))
          .map((folderPath) => ({ label: folderPath, path: folderPath })),
        filesAtCurrentDir: files.filter((f) => f.name.toLocaleLowerCase().includes(normalizedSearchQuery)),
      };
    }
    const prefix = currentDir === '' ? '' : `${currentDir}/`;
    const localFiles: ProjectFile[] = [];
    const localDirs = new Map<string, DirectoryRow>();
    for (const folderPath of folderPaths) {
      if (!folderPath.startsWith(prefix)) continue;
      const remainder = folderPath.slice(prefix.length);
      if (!remainder) continue;
      const slashIdx = remainder.indexOf('/');
      const label = slashIdx === -1 ? remainder : remainder.slice(0, slashIdx);
      const path = currentDir === '' ? label : `${currentDir}/${label}`;
      localDirs.set(path, { label, path });
    }
    for (const f of files) {
      if (!f.name.startsWith(prefix)) continue;
      const remainder = f.name.slice(prefix.length);
      const slashIdx = remainder.indexOf('/');
      if (slashIdx === -1) {
        localFiles.push(f);
      } else {
        const label = remainder.slice(0, slashIdx);
        const path = currentDir === '' ? label : `${currentDir}/${label}`;
        localDirs.set(path, { label, path });
      }
    }
    return {
      dirsAtCurrentDir: [...localDirs.values()].sort((a, b) => a.label.localeCompare(b.label)),
      filesAtCurrentDir: localFiles,
    };
  }, [currentDir, files, folderPaths, normalizedSearchQuery]);

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
  // Guard: skip when no kinds are available yet — availableKinds is empty only
  // when files haven't loaded. Running cleanup against an empty set would
  // clear a kindFilter that was correctly restored from localStorage before
  // the async file list arrived.
  useEffect(() => {
    if (availableKinds.length === 0) return;
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
  const [pageSize, setPageSize] = useState<number | 'all'>(
    () => isPageSize(savedViewState.current.pageSize) ? savedViewState.current.pageSize : DEFAULT_PAGE_SIZE,
  );

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

  // Persist view state so it survives navigation (the panel remounts via
  // key={projectId} when the user tabs away and back).
  // Skip the initial render: we only want to write when the user actually
  // changes a preference, not on every project the user visits.
  useEffect(() => {
    if (!viewStateHasMounted.current) {
      viewStateHasMounted.current = true;
      return;
    }
    writeViewState(projectId, {
      sortKey,
      sortDir,
      pageSize,
      kindFilter: Array.from(kindFilter),
    });
  }, [projectId, sortKey, sortDir, pageSize, kindFilter]);

  // Reset to the first page when the filter changes — the previous page
  // index may no longer exist (or may now sit past the new totalPages).
  useEffect(() => {
    setPage(0);
  }, [kindFilter]);

  useEffect(() => {
    setPage(0);
  }, [normalizedSearchQuery]);

  useEffect(() => {
    if (!searchExpanded) return;
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [searchExpanded]);

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

  // Tell the host which folder is being viewed so new files (uploads, pastes,
  // sketches, dropped files) are created under it instead of the project root.
  useEffect(() => {
    onCurrentDirChange?.(currentDir);
  }, [currentDir, onCurrentDirChange]);

  // Auto-dismiss the confirmation toast.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Navigate up to the nearest ancestor that still exists when files under
  // currentDir disappear (e.g. after deleting the last file in a subfolder).
  useEffect(() => {
    if (currentDir === '') return;
    const prefix = `${currentDir}/`;
    if (folderPathSet.has(currentDir) || files.some((f) => f.name.startsWith(prefix))) return;
    const parts = currentDir.split('/');
    for (let i = parts.length - 1; i > 0; i--) {
      const ancestor = parts.slice(0, i).join('/');
      if (folderPathSet.has(ancestor) || files.some((f) => f.name.startsWith(`${ancestor}/`))) {
        setCurrentDir(ancestor);
        return;
      }
    }
    setCurrentDir('');
  }, [files, folderPathSet, currentDir]);

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
    if (!menuPos && !folderMenuPos) return;
    const close = () => {
      setMenuPos(null);
      setFolderMenuPos(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuPos, folderMenuPos]);

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

  function openFolderMenuFor(path: string, el: HTMLElement) {
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
      top = Math.max(MENU_SAFE_PADDING, viewportHeight - MENU_ESTIMATED_HEIGHT - MENU_SAFE_PADDING);
    }
    const left = Math.max(MENU_SAFE_PADDING, rect.right - 160);
    setMenuPos(null);
    setFolderMenuPos({ path, top, left });
  }

  // Absolute on-disk path for a project-relative file/folder path. Falls back
  // to the relative path when the project root is unknown (e.g. a non-desktop
  // host that didn't resolve it).
  function absPathFor(name: string): string {
    const base = (resolvedDir ?? '').replace(/[/\\]+$/, '');
    return base ? `${base}/${name}` : name;
  }

  async function copyPath(name: string) {
    setMenuPos(null);
    setFolderMenuPos(null);
    const ok = await copyToClipboard(absPathFor(name));
    if (ok) setToast(t('designFiles.copiedPath'));
  }

  async function handleDeleteFolder(path: string) {
    setFolderMenuPos(null);
    if (!onDeleteFolder) return;
    const label = basenameForProjectPath(path);
    if (!window.confirm(t('designFiles.deleteFolderConfirm', { name: label }))) return;
    const ok = await onDeleteFolder(path);
    if (ok) {
      setOptimisticFolderPaths((current) => current.filter((p) => p !== path && !p.startsWith(`${path}/`)));
      if (currentDir === path || currentDir.startsWith(`${path}/`)) {
        const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        setCurrentDir(parent);
      }
      setToast(t('designFiles.folderDeleted', { name: label }));
    }
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

  function handleCreateFolder() {
    if (!onCreateFolder) return;
    const suggestedPath = nextAvailableFolderPath(currentDir, folderPathSet, files);
    setFolderDialogDefault(basenameForProjectPath(suggestedPath));
  }

  async function commitCreateFolder(rawName: string) {
    setFolderDialogDefault(null);
    if (!onCreateFolder) return;
    const cleanName = rawName.trim().replace(/^\/+|\/+$/g, '');
    if (!cleanName) return;
    const targetPath =
      currentDir && !cleanName.startsWith(`${currentDir}/`)
        ? joinProjectPath(currentDir, cleanName)
        : cleanName;
    const folder = await onCreateFolder(targetPath);
    const createdPath = folder?.path || targetPath;
    if (createdPath) {
      setOptimisticFolderPaths((current) =>
        current.includes(createdPath) ? current : [...current, createdPath],
      );
      setSearchQuery('');
      setCurrentDir(createdPath);
      setToast(t('designFiles.folderCreated', { name: basenameForProjectPath(createdPath) }));
    }
  }

  function displayNameForFile(name: string): string {
    if (searchActive || currentDir === '') return name;
    return name.slice(currentDir.length + 1);
  }

  function openDirectory(path: string): void {
    setSearchQuery('');
    setCurrentDir(path);
  }

  async function moveFilesToFolder(names: string[], folderPath: string) {
    const uniqueNames = Array.from(new Set(names));
    const failed: string[] = [];
    let moved = 0;
    for (const name of uniqueNames) {
      const nextName = joinProjectPath(folderPath, basenameForProjectPath(name));
      if (nextName === name) continue;
      try {
        const renamed = await onRenameFile(name, nextName);
        if (!renamed) throw new Error('Move failed');
        moved += 1;
        setPreview((curr) => (curr === name ? renamed.name : curr));
        setSelected((prev) => {
          if (!prev.has(name)) return prev;
          const next = new Set(prev);
          next.delete(name);
          next.add(renamed.name);
          return next;
        });
      } catch (err) {
        failed.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (failed.length > 0) {
      alert(`Could not move ${failed.length} file(s).\n${failed.slice(0, 4).join('\n')}`);
    } else if (moved > 0) {
      const dest = folderPath ? basenameForProjectPath(folderPath) : t('designFiles.moveRoot');
      setToast(t('designFiles.filesMoved', { n: moved, dest }));
    }
  }

  function startMove(name: string) {
    setMenuPos(null);
    setMoveDialogNames([name]);
  }

  function commitMove(targetPath: string) {
    const names = moveDialogNames;
    setMoveDialogNames(null);
    if (!names || names.length === 0) return;
    void moveFilesToFolder(names, targetPath.trim().replace(/^\/+|\/+$/g, ''));
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
    const renameState = renaming?.name === f.name ? renaming : null;
    return (
      <tr
        key={f.name}
        data-testid={`design-file-row-${f.name}`}
        className={`df-file-row ${active ? 'active' : ''} ${selected.has(f.name) ? 'selected' : ''}`}
        draggable={!renameState}
        onDragStart={(e) => {
          const names = selected.has(f.name) ? Array.from(selected) : [f.name];
          internalDragNamesRef.current = names;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('application/x-open-design-files', JSON.stringify(names));
          e.dataTransfer.setData('text/plain', names.join('\n'));
        }}
        onDragEnd={() => {
          internalDragNamesRef.current = [];
          setDragOverFolder(null);
        }}
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
                <span className="df-row-name" title={displayNameForFile(f.name)}>
                  {displayNameForFile(f.name)}
                </span>
                <span className="df-row-sub">
                  <span>{humanBytes(f.size)}</span>
                  <span className="df-row-sub-kind">{kindLabel(f.kind, t)}</span>
                  <span className="df-row-sub-time">{relativeTime(f.mtime, t)}</span>
                </span>
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
            style={active ? { opacity: 1 } : undefined}
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

  function renderDirRow(dir: DirectoryRow) {
    const fullPath = dir.path;
    const count = fileCountByFolder.get(fullPath) ?? 0;
    const dragActive = dragOverFolder === fullPath;
    const folderMtime = folderMtimeByPath.get(fullPath);
    const menuVisible = folderMenuPos?.path === fullPath;
    return (
      <tr
        key={`dir:${fullPath}`}
        className={`df-file-row df-dir-row ${dragActive ? 'drag-over' : ''}`}
        onDragEnter={(e) => {
          if (!hasInternalFileDrag(e.dataTransfer)) return;
          e.preventDefault();
          setDragOverFolder(fullPath);
        }}
        onDragOver={(e) => {
          if (!hasInternalFileDrag(e.dataTransfer)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDragOverFolder(fullPath);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDragOverFolder((current) => (current === fullPath ? null : current));
          }
        }}
        onDrop={(e) => {
          if (!hasInternalFileDrag(e.dataTransfer)) return;
          e.preventDefault();
          e.stopPropagation();
          const names = namesFromInternalDrag(e.dataTransfer, internalDragNamesRef.current);
          internalDragNamesRef.current = [];
          setDragOverFolder(null);
          void moveFilesToFolder(names, fullPath);
        }}
      >
        <td className="df-cell-check" />
        <td className="df-cell-icon df-cell-openable" onClick={() => openDirectory(fullPath)}>
          <span className="df-row-icon" data-kind="folder" aria-hidden>
            <Icon name="folder" size={14} />
          </span>
        </td>
        <td className="df-cell-name df-cell-openable" onClick={() => openDirectory(fullPath)}>
          <button type="button" className="df-row-name-btn" onClick={() => openDirectory(fullPath)}>
            <span className="df-row-name-wrap">
              <span className="df-row-name" title={dir.label}>{dir.label}</span>
              <span className="df-row-sub">{t('designFiles.folderCount', { n: count })}</span>
            </span>
          </button>
        </td>
        <td className="df-cell-kind df-cell-openable" onClick={() => openDirectory(fullPath)}>
          <span className="df-kind-label">{t('designFiles.kindFolder')}</span>
        </td>
        <td className="df-cell-time df-cell-openable" onClick={() => openDirectory(fullPath)}>
          {folderMtime != null ? relativeTime(folderMtime, t) : null}
        </td>
        <td className="df-cell-menu">
          <span
            data-testid={`design-folder-menu-${fullPath}`}
            className="df-row-menu"
            style={menuVisible ? { opacity: 1 } : undefined}
            role="button"
            tabIndex={0}
            aria-label={t('designFiles.rowMenu')}
            onClick={(e) => {
              e.stopPropagation();
              openFolderMenuFor(fullPath, e.target as HTMLElement);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                openFolderMenuFor(fullPath, e.currentTarget as HTMLElement);
              }
            }}
          >
            ⋯
          </span>
        </td>
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
    if (!hasNativeFiles(ev.dataTransfer)) return;
    ev.preventDefault();
    ev.stopPropagation();
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
        {onCreateFolder ? (
          <button type="button" onClick={() => void handleCreateFolder()} title="New folder">
            <Icon name="folder" size={13} />
            <span>{t('designFiles.kindFolder')}</span>
          </button>
        ) : null}
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
    ) : null;

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
    <div
      className={`df-panel ${preview ? '' : 'no-preview'} ${draggingFiles ? 'dragging-files' : ''}`}
      onDragEnter={(ev) => {
        if (!hasNativeFiles(ev.dataTransfer)) return;
        ev.preventDefault();
        dragDepthRef.current += 1;
        setDraggingFiles(true);
      }}
      onDragOver={(ev) => {
        if (!hasNativeFiles(ev.dataTransfer)) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(ev) => {
        if (!hasNativeFiles(ev.dataTransfer)) return;
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
            <div className="df-controls-topline">
              <div className="df-controls-primary">
                {refreshControl}
                <div
                  className={`df-search-control${searchExpanded ? ' is-expanded' : ''}${searchQuery ? ' has-value' : ''}`}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setSearchExpanded(false);
                    }
                  }}
                >
                  {searchExpanded ? (
                    <>
                      <Icon name="search" size={13} />
                      <input
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            if (searchQuery) setSearchQuery('');
                            else setSearchExpanded(false);
                          }
                        }}
                        placeholder={t('designFiles.searchPlaceholder')}
                        aria-label={t('designFiles.searchPlaceholder')}
                      />
                      {searchQuery ? (
                        <button
                          type="button"
                          className="df-search-clear"
                          onClick={() => {
                            setSearchQuery('');
                            searchInputRef.current?.focus();
                          }}
                          aria-label={t('designFiles.filterClear')}
                          title={t('designFiles.filterClear')}
                        >
                          <Icon name="close" size={11} />
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <button
                      type="button"
                      className="df-search-icon-trigger"
                      onClick={() => setSearchExpanded(true)}
                      aria-label={t('designFiles.searchPlaceholder')}
                      title={t('designFiles.searchPlaceholder')}
                    >
                      <Icon name="search" size={14} />
                      {searchQuery ? <span className="df-search-active-dot" aria-hidden /> : null}
                    </button>
                  )}
                </div>
              </div>
              <div className="df-controls-actions">
                {fileActions}
              </div>
            </div>
            <div className="df-controls-toggles">
              {groupToggle}
              {kindFilterControl}
            </div>
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
          {files.length === 0 && folderPaths.length === 0 && liveArtifacts.length === 0 ? (
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
                        <span className="df-row-name" title={artifact.title}>
                          {artifact.title}
                        </span>
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
                          data-testid="df-page-size-select"
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
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              startMove(menuPos.name);
            }}
          >
            {t('designFiles.moveTitle')}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void copyPath(menuPos.name);
            }}
          >
            {t('designFiles.copyPath')}
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
      {folderMenuPos ? (
        <div
          data-testid="design-folder-menu-popover"
          className="df-row-popover"
          style={{ top: folderMenuPos.top, left: folderMenuPos.left }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const path = folderMenuPos.path;
              setFolderMenuPos(null);
              openDirectory(path);
            }}
          >
            {t('designFiles.previewOpen')}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void copyPath(folderMenuPos.path);
            }}
          >
            {t('designFiles.copyPath')}
          </button>
          {onDeleteFolder ? (
            <button
              type="button"
              className="danger"
              data-testid={`design-folder-delete-${folderMenuPos.path}`}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                void handleDeleteFolder(folderMenuPos.path);
              }}
            >
              {t('designFiles.delete')}
            </button>
          ) : null}
        </div>
      ) : null}
      {toast ? (
        <div className="df-toast" role="status">
          {toast}
        </div>
      ) : null}
      {folderDialogDefault !== null ? (
        <FolderNameDialog
          t={t}
          defaultName={folderDialogDefault}
          onCancel={() => setFolderDialogDefault(null)}
          onSubmit={(name) => void commitCreateFolder(name)}
        />
      ) : null}
      {moveDialogNames !== null ? (
        <MoveToFolderDialog
          t={t}
          currentDir={currentDir}
          folderPaths={folderPaths}
          onCancel={() => setMoveDialogNames(null)}
          onSubmit={commitMove}
        />
      ) : null}
    </div>
  );
}

// Sentinel <option> value that switches the move picker into "type a new
// folder path" mode. Colons can never appear in a real project folder path
// (the daemon's sanitizeName rewrites ':' to '_'), so this can't collide with
// an actual folder.
const MOVE_NEW_FOLDER = '::new-folder::';

/**
 * In-app replacement for `window.prompt('New folder name')`. The native prompt
 * throws in the Electron desktop host, so folder creation died there with an
 * uncaught "prompt() is not supported." error; this dialog works in both web
 * and desktop. Enter commits, Escape / backdrop click cancels.
 */
function FolderNameDialog({
  t,
  defaultName,
  onCancel,
  onSubmit,
}: {
  t: TranslateFn;
  defaultName: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);
  function commit() {
    if (!name.trim()) return;
    onSubmit(name.trim());
  }
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('designFiles.newFolderTitle')}</h2>
        <label>
          {t('designFiles.newFolderLabel')}
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
              }
            }}
          />
        </label>
        <div className="row">
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="primary" onClick={commit} disabled={!name.trim()}>
            {t('common.create')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * In-app replacement for the `window.prompt('Move to folder path')` flow. Lists
 * existing folders plus the project root, and offers a "New folder…" option
 * that reveals a path input. Submitting an empty target moves the file(s) to
 * the project root. Works in both web and the Electron desktop host.
 */
function MoveToFolderDialog({
  t,
  currentDir,
  folderPaths,
  onCancel,
  onSubmit,
}: {
  t: TranslateFn;
  currentDir: string;
  folderPaths: string[];
  onCancel: () => void;
  onSubmit: (targetPath: string) => void;
}) {
  const sortedFolders = useMemo(
    () => [...folderPaths].sort((a, b) => a.localeCompare(b)),
    [folderPaths],
  );
  const [selection, setSelection] = useState<string>(() =>
    currentDir && folderPaths.includes(currentDir) ? currentDir : '',
  );
  const [newFolder, setNewFolder] = useState('');
  const isNew = selection === MOVE_NEW_FOLDER;
  function commit() {
    if (isNew) {
      const trimmed = newFolder.trim().replace(/^\/+|\/+$/g, '');
      if (!trimmed) return;
      onSubmit(trimmed);
      return;
    }
    onSubmit(selection);
  }
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('designFiles.moveTitle')}</h2>
        <label>
          {t('designFiles.moveLabel')}
          <select value={selection} onChange={(e) => setSelection(e.target.value)}>
            <option value="">{t('designFiles.moveRoot')}</option>
            {sortedFolders.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value={MOVE_NEW_FOLDER}>{t('designFiles.moveNewFolder')}</option>
          </select>
        </label>
        {isNew ? (
          <label>
            {t('designFiles.newFolderLabel')}
            <input
              type="text"
              value={newFolder}
              autoFocus
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                }
              }}
            />
          </label>
        ) : null}
        <div className="row">
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="primary"
            onClick={commit}
            disabled={isNew && !newFolder.trim()}
          >
            {t('designFiles.move')}
          </button>
        </div>
      </div>
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
          <Button variant="ghost" onClick={onOpen}>
            <Icon name="eye" size={13} />
            <span>{t('designFiles.previewOpen')}</span>
          </Button>
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

function basenameForProjectPath(name: string): string {
  const parts = name.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? name;
}

function joinProjectPath(dir: string, basename: string): string {
  const cleanDir = dir.trim().replace(/^\/+|\/+$/g, '');
  return cleanDir ? `${cleanDir}/${basename}` : basename;
}

function nextAvailableFolderPath(
  currentDir: string,
  folderPathSet: ReadonlySet<string>,
  files: ProjectFile[],
): string {
  const baseName = 'untitled-folder';
  const cleanDir = currentDir.trim().replace(/^\/+|\/+$/g, '');
  let suffix = 0;
  while (suffix < 1000) {
    const basename = suffix === 0 ? baseName : `${baseName}-${suffix + 1}`;
    const candidate = joinProjectPath(cleanDir, basename);
    const prefix = `${candidate}/`;
    const exists =
      folderPathSet.has(candidate)
      || files.some((file) => file.name === candidate || file.name.startsWith(prefix));
    if (!exists) return candidate;
    suffix += 1;
  }
  return joinProjectPath(cleanDir, `${baseName}-${Date.now().toString(36)}`);
}

function hasNativeFiles(dataTransfer: DataTransfer): boolean {
  if (Array.from(dataTransfer.types ?? []).includes('Files')) return true;
  if ((dataTransfer.files?.length ?? 0) > 0) return true;
  return Array.from(dataTransfer.items ?? []).some((item) => {
    if (item.kind === 'file') return true;
    return typeof (item as DataTransferItemWithEntry).webkitGetAsEntry === 'function';
  });
}

function hasInternalFileDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types ?? []).includes('application/x-open-design-files');
}

function namesFromInternalDrag(dataTransfer: DataTransfer, fallback: string[]): string[] {
  const raw = dataTransfer.getData('application/x-open-design-files');
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    // Fall through to the in-memory fallback from the current drag gesture.
  }
  return fallback;
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
