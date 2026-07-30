import { useEffect, useMemo, useRef, useState } from 'react';
import { useAnalytics } from '../analytics/provider';
import { trackFileManagerClick } from '../analytics/events';
import { useT } from '../i18n';
import { LIBRARY_UI_VISIBLE } from '../features/libraryUi';
import type { Dict } from '../i18n/types';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { projectFileUrl, projectRawUrl } from '../providers/registry';
import { appendResourceQuery } from '../collab/workspace-identity';
import { useProjectCollabContext } from '../collab/collab-context';
import { buildSrcdoc } from '../runtime/srcdoc';
import type { LiveArtifactWorkspaceEntry, ProjectFile, ProjectFileKind, ProjectFolder } from '../types';
import {
  createFileSystemReadError,
  FILE_SYSTEM_READ_ERROR_MESSAGE,
  isFileSystemReadError,
} from '../utils/fileSystemErrors';
import { isVisualStabilityMode } from '../utils/visualStability';
import type { PluginFolderAgentAction } from './design-files/pluginFolderActions';
import { getPluginFolderCandidates } from './design-files/pluginFolders';
import { FileSyncBadge } from '../collab/FileSyncBadge';
import { Icon } from './Icon';
import { LiveArtifactBadges } from './LiveArtifactBadges';
import { RemixIcon } from './RemixIcon';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

export interface DesignFilesNavState {
  kindFilter: Set<ProjectFileKind>;
  currentDir: string;
  page: number;
  pageSize: number | 'all';
}

interface Props {
  projectId: string;
  /** Read-only viewer of a team-shared project: withholds create/upload actions. */
  viewerOnly?: boolean;
  /**
   * True while a non-owner member's local mirror has not yet caught up to the
   * project's published head. Existing files belong to the last complete
   * local materialization and remain useful while the next version downloads;
   * only an empty local result swaps the creation CTAs for a syncing notice.
   */
  downloadPending?: boolean;
  // Basename of the project's working directory when the user has chosen a
  // real folder (e.g. "openclaw"). Shown as the breadcrumb root instead of
  // the generic "project" label. Undefined for default-storage projects.
  rootDirName?: string;
  // True while the host is reindexing a freshly replaced working dir. Drives
  // a loading overlay so the panel doesn't sit silently on the stale tree.
  reloading?: boolean;
  // True while the chat agent is generating. The footer swaps its idle
  // drop/upload hint for the typewriter "tip" line while a run is in flight.
  running?: boolean;
  files: ProjectFile[];
  // Persisted folders from `/api/projects/:id/folders`, including empty ones
  // that no file lives under. Without these, a folder only appears once a file
  // with a matching path prefix exists, so empty (user-created or imported)
  // folders would vanish from the tree.
  folders?: ProjectFolder[];
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
  onOpenBrowser?: () => void;
  onCreateDesignSystem?: () => void;
  onCreateDesignSystemFromProject?: () => void;
  createDesignSystemFromProjectBusy?: boolean;
  onDuplicateProject?: () => void;
  duplicateProjectBusy?: boolean;
  /** Opens the "Select from library" picker to pull registry assets in. */
  onSelectFromLibrary?: () => void;
  // Reports the folder the panel is currently viewing so the parent can create
  // new files (upload / paste / new sketch / dropped files) under it instead
  // of the project root. Fires whenever the user navigates folders.
  onCurrentDirChange?: (dir: string) => void;
  uploadError?: string | null;
  onClearUploadError?: () => void;
  onPluginFolderAgentAction?: (
    relativePath: string,
    action: PluginFolderAgentAction,
  ) => Promise<{ message?: string; url?: string } | void> | { message?: string; url?: string } | void;
  activePluginActionPaths?: Set<string>;
  hiddenPluginActionPaths?: Set<string>;
  navState?: DesignFilesNavState;
  onNavStateChange?: (state: DesignFilesNavState) => void;
}

interface ActionNotice {
  message: string;
  url?: string;
}

// Display-only refinement of ProjectFileKind. The contract `kind` lumps all
// source under `code`; the Design Files surface splits CSS/SCSS/etc. into a
// dedicated "Stylesheets" section to mirror Claude Design. Everything else
// maps 1:1 to its kind.
type FileCategory = ProjectFileKind | 'stylesheet';

// Section render order. Empty categories are skipped; the FOLDERS section is
// pinned above all of these from the directory list.
const SECTION_ORDER: FileCategory[] = [
  'html',
  'stylesheet',
  'code',
  'document',
  'text',
  'image',
  'sketch',
  'pdf',
  'presentation',
  'spreadsheet',
  'video',
  'audio',
  'binary',
];

const STYLESHEET_EXTENSIONS = new Set(['css', 'scss', 'sass', 'less']);
const HTML_THUMBNAIL_INLINE_MAX_BYTES = 512 * 1024;

function fileCategory(file: ProjectFile): FileCategory {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  if (STYLESHEET_EXTENSIONS.has(ext)) return 'stylesheet';
  return file.kind;
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

// Useful-info tips that rotate one at a time in the panel footer, ordered as
// a loose journey: file basics → feeding context → generating → iterating →
// exporting/sharing → community. A tip with a `url` renders its typed line as
// a link to that destination.
const USEFUL_TIPS: ReadonlyArray<{ key: keyof Dict; url?: string }> = [
  { key: 'designFiles.usefulInfoTip' },
  { key: 'designFiles.usefulInfoTip2' },
  { key: 'designFiles.usefulInfoTip9' },
  { key: 'designFiles.usefulInfoTip10' },
  { key: 'designFiles.usefulInfoTip4' },
  { key: 'designFiles.usefulInfoTip11' },
  { key: 'designFiles.usefulInfoTip12' },
  { key: 'designFiles.usefulInfoTip13' },
  { key: 'designFiles.usefulInfoTip14' },
  { key: 'designFiles.usefulInfoTip15' },
  { key: 'designFiles.usefulInfoTip5' },
  { key: 'designFiles.usefulInfoTip6', url: 'https://discord.gg/mHAjSMV6gz' },
  { key: 'designFiles.usefulInfoTip7', url: 'https://github.com/nexu-io/open-design' },
  { key: 'designFiles.usefulInfoTip8', url: 'https://x.com/OpenDesignHQ' },
  { key: 'designFiles.usefulInfoTip16', url: 'https://www.threads.com/@opendesign.ai' },
  { key: 'designFiles.usefulInfoTip17', url: 'https://www.instagram.com/opendesign.ai/' },
  { key: 'designFiles.usefulInfoTip18', url: 'https://www.youtube.com/@Open-Design-ai' },
  { key: 'designFiles.usefulInfoTip19', url: 'https://www.linkedin.com/company/open-design-ai/' },
  {
    key: 'designFiles.usefulInfoTip20',
    url: 'https://www.xiaohongshu.com/user/profile/691effad000000003002978f',
  },
];
const TIP_TYPE_MS = 32; // per-character typing speed
const TIP_HOLD_MS = 3800; // pause on a fully-typed tip before advancing

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// Footer "tip" line that types out one tip at a time (typewriter), holds, then
// advances to the next — mirroring Claude Design's empty-state hint. It is
// intentionally auxiliary while a run is active; the preview status bar owns
// progress and recovery feedback. Under prefers-reduced-motion the full tip is
// shown immediately and just cycles.
function RotatingTip({ auxiliary = false }: { auxiliary?: boolean }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  // Resolve tips each render but read them through a ref so the typing effect
  // depends only on `index` — depending on the (re-created) array would reset
  // the typewriter on every render and never advance.
  const tipsRef = useRef<string[]>([]);
  tipsRef.current = USEFUL_TIPS.map(({ key }) => t(key));

  useEffect(() => {
    const tips = tipsRef.current;
    const full = tips[index] ?? '';
    if (isVisualStabilityMode()) {
      setIndex(0);
      setTyped(tips[0] ?? '');
      return;
    }
    if (prefersReducedMotion()) {
      setTyped(full);
      if (tips.length < 2) return;
      const hold = window.setTimeout(
        () => setIndex((i) => (i + 1) % tips.length),
        TIP_HOLD_MS,
      );
      return () => window.clearTimeout(hold);
    }
    setTyped('');
    let i = 0;
    let holdTimer = 0;
    const typeTimer = window.setInterval(() => {
      i += 1;
      setTyped(full.slice(0, i));
      if (i >= full.length) {
        window.clearInterval(typeTimer);
        if (tips.length < 2) return;
        holdTimer = window.setTimeout(
          () => setIndex((p) => (p + 1) % tips.length),
          TIP_HOLD_MS,
        );
      }
    }, TIP_TYPE_MS);
    return () => {
      window.clearInterval(typeTimer);
      window.clearTimeout(holdTimer);
    };
  }, [index]);

  return (
    <div className={`df-useful-info${auxiliary ? ' df-useful-info-auxiliary' : ''}`}>
      <div className="df-useful-info-head">
        <Icon name="sparkles" size={12} />
        <span className="df-useful-info-label">{t('designFiles.usefulInfoLabel')}</span>
      </div>
      <span className="df-useful-info-tip">
        {USEFUL_TIPS[index]?.url ? (
          <a className="df-tip-link" href={USEFUL_TIPS[index].url} target="_blank" rel="noreferrer">
            {typed}
          </a>
        ) : (
          typed
        )}
        <span className="df-tip-caret" aria-hidden />
      </span>
    </div>
  );
}

/**
 * Full-panel browser for a project's `.od/projects/<id>/` folder. Mirrors
 * Claude Design's "Design Files" surface: a single-line toolbar (up / refresh
 * / breadcrumbs + actions), semantic sections (Folders, Stylesheets, Scripts,
 * Documents, Images …), hover-revealed row checkbox + menu, and a static
 * "useful info" footer. Triggered as a sticky first tab in FileWorkspace.
 *
 * There is no detail/preview pane: the card grid IS the preview surface, so
 * every non-control click target (row name, card thumb, plugin-folder row)
 * opens the file in a workspace tab through `onOpenFile`.
 */
export function DesignFilesPanel({
  projectId,
  viewerOnly = false,
  downloadPending = false,
  rootDirName,
  reloading,
  running = false,
  files,
  folders,
  liveArtifacts,
  onOpenFile,
  onOpenLiveArtifact,
  onRenameFile,
  onDeleteFile,
  onDeleteFiles,
  onUpload,
  onUploadFiles,
  onPaste,
  onNewSketch,
  onOpenBrowser,
  onCreateDesignSystem,
  onCreateDesignSystemFromProject,
  createDesignSystemFromProjectBusy = false,
  onDuplicateProject,
  duplicateProjectBusy = false,
  onSelectFromLibrary,
  uploadError = null,
  onClearUploadError,
  onCurrentDirChange,
  onPluginFolderAgentAction,
  activePluginActionPaths = new Set(),
  hiddenPluginActionPaths = new Set(),
  navState,
  onNavStateChange,
}: Props) {
  const { workspaceContext } = useProjectCollabContext();
  const t = useT();
  const analytics = useAnalytics();
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [dropReadError, setDropReadError] = useState<string | null>(null);
  const dragDepthRef = useRef(0);
  const [hover, setHover] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ name: string; top: number; left: number } | null>(null);
  const MENU_ESTIMATED_HEIGHT = 180;
  const MENU_SAFE_PADDING = 8;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [installingFolder, setInstallingFolder] = useState<string | null>(null);
  const [sharingFolder, setSharingFolder] = useState<string | null>(null);
  const [installNotice, setInstallNotice] = useState<ActionNotice | null>(null);
  const [renaming, setRenaming] = useState<{ name: string; draft: string; saving: boolean } | null>(null);
  const [copiedLocalPath, setCopiedLocalPath] = useState<string | null>(null);
  const [currentDir, setCurrentDir] = useState<string>(() => navState?.currentDir ?? '');
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);

  // Keep the parent's create-target in sync with the folder being viewed, so
  // uploads / pastes / new sketches / dropped files land in the open folder
  // rather than the project root.
  useEffect(() => {
    onCurrentDirChange?.(currentDir);
  }, [currentDir, onCurrentDirChange]);

  useEffect(() => {
    onNavStateChange?.({
      kindFilter: navState?.kindFilter ?? new Set(),
      currentDir,
      page: 0,
      pageSize: 30,
    });
  }, [currentDir, navState?.kindFilter, onNavStateChange]);

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
        if (currentDir === '') localFiles.push(f);
      }
    }
    // Also surface persisted folders (including empty ones with no files under
    // them) as immediate children of the current directory.
    for (const folder of folders ?? []) {
      if (!folder.path.startsWith(prefix)) continue;
      const remainder = folder.path.slice(prefix.length);
      if (!remainder) continue; // the current directory itself
      const slashIdx = remainder.indexOf('/');
      dirs.add(slashIdx === -1 ? remainder : remainder.slice(0, slashIdx));
    }
    return {
      dirsAtCurrentDir: [...dirs].sort((a, b) => a.localeCompare(b)),
      filesAtCurrentDir: localFiles,
    };
  }, [files, folders, currentDir]);

  // Group files at the current level into semantic sections, ordered by
  // SECTION_ORDER. Files within a section sort most-recently-modified first.
  const sections = useMemo(() => {
    const grouped = new Map<FileCategory, ProjectFile[]>();
    for (const f of filesAtCurrentDir) {
      const category = fileCategory(f);
      const bucket = grouped.get(category) ?? [];
      bucket.push(f);
      grouped.set(category, bucket);
    }
    for (const bucket of grouped.values()) {
      bucket.sort((a, b) => b.mtime - a.mtime);
    }
    return SECTION_ORDER.filter((category) => grouped.has(category)).map(
      (category) => [category, grouped.get(category)!] as const,
    );
  }, [filesAtCurrentDir]);

  // Active category tab (null = default). Declared before the reset effect
  // below that clears it on directory change.
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Reset selection, renaming, and the picked tab when the user navigates
  // into or out of a directory — each level has its own set of groups.
  useEffect(() => {
    setSelected(new Set());
    setRenaming(null);
    setActiveTab(null);
  }, [currentDir]);

  // Navigate up to the nearest ancestor that still exists when the current
  // directory disappears (e.g. after deleting the last file in a subfolder).
  // A directory "exists" if it has files under it OR is a persisted folder
  // (possibly empty) — otherwise navigating into an empty folder would bounce
  // straight back to the root.
  useEffect(() => {
    if (currentDir === '') return;
    const dirExists = (dir: string) =>
      files.some((f) => f.name.startsWith(`${dir}/`)) ||
      (folders ?? []).some((fo) => fo.path === dir || fo.path.startsWith(`${dir}/`));
    if (dirExists(currentDir)) return;
    const parts = currentDir.split('/');
    for (let i = parts.length - 1; i > 0; i--) {
      const ancestor = parts.slice(0, i).join('/');
      if (dirExists(ancestor)) {
        setCurrentDir(ancestor);
        return;
      }
    }
    setCurrentDir('');
  }, [files, folders, currentDir]);

  const pluginFolders = useMemo(() => getPluginFolderCandidates(files), [files]);

  // Category tabs: the panel shows one group at a time behind a tab bar
  // instead of stacking every section into one long list. A tab exists only
  // when its group has content at the current level, so an empty category
  // simply has no tab.
  const availableTabs = useMemo(() => {
    const tabs: Array<{ id: string; label: string; count: number }> = [];
    if (liveArtifacts.length > 0) {
      tabs.push({
        id: 'live-artifacts',
        label: t('designFiles.sectionLiveArtifacts'),
        count: liveArtifacts.length,
      });
    }
    if (pluginFolders.length > 0) {
      tabs.push({ id: 'plugin-folders', label: 'Plugin folders', count: pluginFolders.length });
    }
    if (dirsAtCurrentDir.length > 0) {
      tabs.push({
        id: 'folders',
        label: t('designFiles.sectionFolders'),
        count: dirsAtCurrentDir.length,
      });
    }
    for (const [category, sectionFiles] of sections) {
      tabs.push({
        id: `cat:${category}`,
        label: sectionLabel(category, t),
        count: sectionFiles.length,
      });
    }
    return tabs;
  }, [liveArtifacts, pluginFolders, dirsAtCurrentDir, sections, t]);
  // Pages are the primary artifact — land on them by default. Derived (not
  // synced through an effect) so a picked tab that empties out (last file
  // deleted, directory change) falls back instantly without a stale frame.
  const resolvedTab = useMemo(() => {
    if (activeTab && availableTabs.some((tab) => tab.id === activeTab)) return activeTab;
    const pages = availableTabs.find((tab) => tab.id === 'cat:html');
    return (pages ?? availableTabs[0])?.id ?? null;
  }, [activeTab, availableTabs]);

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

  useEffect(() => {
    const onClipboardPaste = (event: ClipboardEvent) => {
      if (shouldIgnoreClipboardFilePaste(event.target)) return;
      const pastedFiles = filesFromClipboardData(event.clipboardData);
      if (pastedFiles.length === 0) return;
      event.preventDefault();
      setDropReadError(null);
      onClearUploadError?.();
      onUploadFiles(pastedFiles);
    };
    window.addEventListener('paste', onClipboardPaste);
    return () => window.removeEventListener('paste', onClipboardPaste);
  }, [onClearUploadError, onUploadFiles]);
  useEffect(() => {
    if (!projectMenuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && projectMenuRef.current?.contains(target)) return;
      setProjectMenuOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setProjectMenuOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [projectMenuOpen]);

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

  async function copyLocalPath(fileName: string) {
    const localPath = files.find((file) => file.name === fileName)?.localPath;
    if (!localPath) return;
    const copied = await copyToClipboard(localPath);
    if (copied) {
      setCopiedLocalPath(fileName);
      window.setTimeout(() => {
        setCopiedLocalPath((current) => (current === fileName ? null : current));
      }, 1600);
    }
  }

  function startRename(name: string) {
    setMenuPos(null);
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

  function renderFileRow(f: ProjectFile, category: FileCategory) {
    const isSelected = selected.has(f.name);
    const isHovered = hover === f.name;
    const renameState = renaming?.name === f.name ? renaming : null;
    return (
      <div
        key={f.name}
        data-testid={`design-file-row-${f.name}`}
        className={`df-row df-file-row ${isSelected ? 'selected' : ''}`}
        onMouseEnter={() => setHover(f.name)}
        onMouseLeave={() => setHover((c) => (c === f.name ? null : c))}
      >
        <span
          className="df-row-check"
          onClick={(e) => {
            e.stopPropagation();
            if (viewerOnly) return; // read-only viewer cannot batch-select files
            toggleSelect(f.name);
          }}
          role={viewerOnly ? undefined : 'checkbox'}
          aria-checked={viewerOnly ? undefined : isSelected}
          aria-disabled={viewerOnly ? 'true' : undefined}
          tabIndex={viewerOnly ? -1 : 0}
          onKeyDown={(e) => {
            if (viewerOnly) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              toggleSelect(f.name);
            }
          }}
        >
          {viewerOnly ? null : (
            <RemixIcon name={isSelected ? 'checkbox-line' : 'checkbox-blank-line'} size={14} />
          )}
        </span>
        <span
          className="df-row-icon df-row-openable"
          data-kind={category}
          aria-hidden
          onClick={() => onOpenFile(f.name)}
        >
          {categoryGlyph(category)}
        </span>
        <div className="df-row-name-wrap">
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
              onClick={() => onOpenFile(f.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenFile(f.name);
                }
              }}
            >
              <span className="df-row-name-wrap">
                <span
                  className="df-row-name"
                  title={currentDir === '' ? f.name : f.name.slice(currentDir.length + 1)}
                >
                  {currentDir === '' ? f.name : f.name.slice(currentDir.length + 1)}
                </span>
                <span className="df-row-sub">{categoryLabel(category, t)}</span>
              </span>
            </button>
          )}
        </div>
        <span
          className="df-row-size df-row-openable"
          onClick={() => onOpenFile(f.name)}
        >
          {humanBytes(f.size)}
        </span>
        <span
          className="df-row-time df-row-openable"
          onClick={() => onOpenFile(f.name)}
        >
          {relativeTime(f.mtime, t)}
        </span>
        {viewerOnly ? (
          // Read-only viewer: the row menu (rename / delete / move) is a mutation
          // entry point, so render an inert placeholder that keeps row layout.
          <span className="df-row-menu df-row-menu-placeholder" aria-hidden />
        ) : (
          <span
            data-testid={`design-file-menu-${f.name}`}
            className="df-row-menu"
            style={isHovered ? { opacity: 1 } : undefined}
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
        )}
      </div>
    );
  }

  // HTML pages render as thumbnail cards (live page preview + meta strip)
  // instead of compact list rows — the #5517 reference card grid. The grid IS
  // the preview surface, so a single click on the thumb opens the page in a
  // workspace tab; the name button is the inline-rename entry point for
  // editors (read-only viewers open instead), and the ⋯ menu carries
  // open / rename / copy-path / download / delete.
  function renderPageCard(f: ProjectFile, category: FileCategory) {
    const isSelected = selected.has(f.name);
    const renameState = renaming?.name === f.name ? renaming : null;
    const displayName = currentDir === '' ? f.name : f.name.slice(currentDir.length + 1);
    const openLabel = `${t('designFiles.previewOpen')} ${f.name}`;
    return (
      <div
        key={f.name}
        data-testid={`design-file-row-${f.name}`}
        className={`df-card ${isSelected ? 'selected' : ''}`}
      >
        <span
          className="df-card-check"
          onClick={(e) => {
            e.stopPropagation();
            if (viewerOnly) return; // read-only viewer cannot batch-select files
            toggleSelect(f.name);
          }}
          role={viewerOnly ? undefined : 'checkbox'}
          aria-checked={viewerOnly ? undefined : isSelected}
          aria-disabled={viewerOnly ? 'true' : undefined}
          tabIndex={viewerOnly ? -1 : 0}
          onKeyDown={(e) => {
            if (viewerOnly) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              toggleSelect(f.name);
            }
          }}
        >
          {viewerOnly ? null : (
            <RemixIcon name={isSelected ? 'checkbox-line' : 'checkbox-blank-line'} size={14} />
          )}
        </span>
        <button
          type="button"
          className="df-card-thumb"
          onClick={() => onOpenFile(f.name)}
          title={openLabel}
          aria-label={openLabel}
        >
          <HtmlCardThumbnail projectId={projectId} file={f} />
        </button>
        <div className="df-card-meta">
          <div className="df-card-meta-text">
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
                className={`df-card-name-btn ${viewerOnly ? '' : 'is-renamable'}`}
                title={viewerOnly ? openLabel : t('common.rename')}
                onClick={(e) => {
                  e.stopPropagation();
                  // Read-only viewers have no rename entry point, so the name
                  // stays a plain open target for them.
                  if (viewerOnly) {
                    onOpenFile(f.name);
                    return;
                  }
                  startRename(f.name);
                }}
              >
                <span className="df-card-name" title={displayName}>{displayName}</span>
              </button>
            )}
            <span className="df-card-sub">
              {categoryLabel(category, t)} · {relativeTime(f.mtime, t)}
            </span>
          </div>
          {viewerOnly ? (
            // Read-only viewer: the ⋯ menu is a mutation entry point, so keep
            // an inert placeholder that preserves the meta-strip layout.
            <span className="df-row-menu df-row-menu-placeholder" aria-hidden />
          ) : (
            <span
              data-testid={`design-file-menu-${f.name}`}
              className="df-row-menu"
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
          )}
        </div>
      </div>
    );
  }

  // Images in the masonry waterfall: bare image cards — no name/meta strip,
  // the picture IS the card. Check chip floats top-left and the row menu
  // (rename/delete live there) floats top-right, both hover-revealed. A single
  // click on the picture opens the image in a workspace tab.
  function renderImageCard(f: ProjectFile, _category: FileCategory) {
    const isSelected = selected.has(f.name);
    const openLabel = `${t('designFiles.previewOpen')} ${f.name}`;
    return (
      <div
        key={f.name}
        data-testid={`design-file-row-${f.name}`}
        className={`df-card df-card--image ${isSelected ? 'selected' : ''}`}
      >
        <span
          className="df-card-check"
          onClick={(e) => {
            e.stopPropagation();
            if (viewerOnly) return; // read-only viewer cannot batch-select files
            toggleSelect(f.name);
          }}
          role={viewerOnly ? undefined : 'checkbox'}
          aria-checked={viewerOnly ? undefined : isSelected}
          aria-disabled={viewerOnly ? 'true' : undefined}
          tabIndex={viewerOnly ? -1 : 0}
          onKeyDown={(e) => {
            if (viewerOnly) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              toggleSelect(f.name);
            }
          }}
        >
          {viewerOnly ? null : (
            <RemixIcon name={isSelected ? 'checkbox-line' : 'checkbox-blank-line'} size={14} />
          )}
        </span>
        <button
          type="button"
          className="df-card-thumb"
          onClick={() => onOpenFile(f.name)}
          title={openLabel}
          aria-label={openLabel}
        >
          <img
            src={appendResourceQuery(
              projectRawUrl(projectId, f.name, workspaceContext),
              `v=${Math.round(f.mtime)}`,
            )}
            alt=""
            loading="lazy"
          />
        </button>
        {/* Positioned overlay — rendered after the thumb so the card's first
            button stays the primary open target (mirrors list rows, where
            controls never precede the openable name). */}
        {viewerOnly ? null : (
          <span
            data-testid={`design-file-menu-${f.name}`}
            className="df-row-menu df-card-menu-overlay"
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
        )}
      </div>
    );
  }

  function renderDirRow(dirName: string) {
    const fullPath = currentDir === '' ? dirName : `${currentDir}/${dirName}`;
    const prefix = `${fullPath}/`;
    const count = files.filter((f) => f.name.startsWith(prefix)).length;
    return (
      <div key={`dir:${fullPath}`} className="df-row df-dir-row" onClick={() => setCurrentDir(fullPath)}>
        <span className="df-row-check" aria-hidden />
        <span className="df-row-icon" data-kind="folder" aria-hidden>
          <Icon name="folder" size={14} />
        </span>
        <div className="df-row-name-wrap">
          <button type="button" className="df-row-name-btn" onClick={() => setCurrentDir(fullPath)}>
            <span className="df-row-name-wrap">
              <span className="df-row-name" title={dirName}>{dirName}</span>
              <span className="df-row-sub">{t('designFiles.folderCount', { n: count })}</span>
            </span>
          </button>
        </div>
        <span className="df-row-size" />
        <span className="df-row-time" />
        <span className="df-row-menu df-row-menu-placeholder" aria-hidden />
      </div>
    );
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
    // Read-only viewer of a shared project: dropping files is a mutation, so
    // ignore the drop entirely (the drag affordance is also suppressed below).
    if (viewerOnly) return;
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

  const fileActions = viewerOnly ? null : (
    <div className="df-actions">
      {LIBRARY_UI_VISIBLE && onSelectFromLibrary ? (
        <button
          type="button"
          data-testid="design-files-library-trigger"
          onClick={onSelectFromLibrary}
          title={t('designFiles.library.title')}
        >
          <Icon name="layers-filled" size={13} />
          <span>{t('designFiles.library.label')}</span>
        </button>
      ) : null}
      <button type="button" onClick={onNewSketch} title={t('designFiles.newSketch')}>
        <Icon name="pencil" size={13} />
        <span>{t('designFiles.newSketch')}</span>
      </button>
      {/* `onPaste` is a historical prop name — the action creates a new blank
          Markdown document, so it is labelled for what it does. */}
      <button type="button" onClick={onPaste} title={t('designFiles.newDocumentTitle')}>
        <Icon name="file" size={13} />
        <span>{t('designFiles.newDocument')}</span>
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
      {onCreateDesignSystemFromProject || onDuplicateProject ? (
        <div className="df-project-menu-anchor" ref={projectMenuRef}>
          <button
            type="button"
            className="df-project-menu-trigger"
            aria-label={t('designFiles.projectMenu')}
            aria-haspopup="menu"
            aria-expanded={projectMenuOpen}
            title={t('designFiles.projectMenu')}
            onClick={() => setProjectMenuOpen((current) => !current)}
          >
            <Icon name="more-horizontal" size={14} />
          </button>
          {projectMenuOpen ? (
            <div className="df-project-menu" role="menu">
              {onCreateDesignSystemFromProject ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={createDesignSystemFromProjectBusy}
                  onClick={() => {
                    trackFileManagerClick(analytics.track, {
                      page_name: 'file_manager',
                      area: 'file_manager',
                      element: 'create_design_system_from_project',
                    });
                    setProjectMenuOpen(false);
                    onCreateDesignSystemFromProject();
                  }}
                >
                  <Icon name={createDesignSystemFromProjectBusy ? 'spinner' : 'blocks'} size={13} />
                  <span>{t('designFiles.createDesignSystemFromProject')}</span>
                </button>
              ) : null}
              {onDuplicateProject ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={duplicateProjectBusy}
                  onClick={() => {
                    trackFileManagerClick(analytics.track, {
                      page_name: 'file_manager',
                      area: 'file_manager',
                      element: 'duplicate_project',
                    });
                    setProjectMenuOpen(false);
                    onDuplicateProject();
                  }}
                >
                  <Icon name={duplicateProjectBusy ? 'spinner' : 'copy'} size={13} />
                  <span>{t('designFiles.duplicateProject')}</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const breadcrumbs = (
    <nav className="df-breadcrumbs" aria-label={t('designFiles.crumbs')}>
      {currentDir === '' ? (
        <span className="df-breadcrumb-current">
          {rootDirName ?? t('designFiles.crumbs')}
        </span>
      ) : (
        <button
          type="button"
          className="df-breadcrumb-btn"
          onClick={() => setCurrentDir('')}
        >
          {rootDirName ?? t('designFiles.crumbs')}
        </button>
      )}
      {currentDir.split('/').filter(Boolean).map((segment, idx, parts) => {
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
  );

  const visibleUploadError = uploadError ?? dropReadError;
  const hasSelection = selected.size > 0;

  return (
    <div className={`df-panel ${hasSelection ? 'has-selection' : ''}`}>
      {reloading ? (
        <div className="df-reloading-overlay" data-testid="design-files-reloading">
          <span className="loading-spinner">
            <Icon name="spinner" size={16} />
            <span className="loading-spinner-label">{t('common.loading')}</span>
          </span>
        </div>
      ) : null}
      <div className="df-main">
        <div className="df-topbar">
          <div className="df-topbar-left">{breadcrumbs}</div>
          <div className="df-topbar-right">{fileActions}</div>
        </div>
        <div
          className="df-body"
          onDragEnter={(ev) => {
            ev.preventDefault();
            if (viewerOnly) return; // no "drop to upload" hint in read-only
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
          {visibleUploadError ? (
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
          {hasSelection ? (
            <div className="df-batch-bar" data-testid="design-files-batch-bar">
              <span className="df-batch-count">
                {t('designFiles.downloadSelected', { n: selected.size })}
              </span>
              <div className="df-batch-actions">
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
                  <span>{t('designFiles.download')}</span>
                </button>
                {viewerOnly ? null : (
                  <button
                    type="button"
                    className="danger"
                    data-testid="design-files-batch-delete"
                    disabled={deleting}
                    onClick={() => void handleBatchDelete()}
                    title={t('designFiles.deleteSelected', { n: selected.size })}
                  >
                    <span>{t('designFiles.delete')}</span>
                  </button>
                )}
                <button type="button" className="df-batch-clear" onClick={clearSelection}>
                  {t('designFiles.clearSelection')}
                </button>
              </div>
            </div>
          ) : null}
          {files.length === 0 && liveArtifacts.length === 0 && (folders?.length ?? 0) === 0 ? (
            downloadPending ? (
              // A shared project whose local mirror has not caught up yet
              // reads as EXACTLY the same zero-files result as a genuinely
              // empty project (this list is a plain local-disk read — see
              // `downloadPending`'s doc comment). Without this branch the two
              // are indistinguishable and the CTAs below (which create NEW
              // content) actively mislead a viewer whose project is about to
              // have real files. Swap them for a syncing notice instead.
              <div className="df-empty df-empty-syncing" data-testid="design-files-syncing">
                <div className="df-empty-pill">
                  <FileSyncBadge state="downloading" size={20} />
                  <span className="df-empty-title">
                    {t('designFiles.syncing')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="df-empty" data-testid="design-files-empty">
                <div className="df-empty-pill">
                  <span className="df-empty-title">
                    {t('designFiles.empty')}
                  </span>
                  {/* Product call: the empty state shows this component with its
                      CTAs for EVERY empty project, shared read-only ones
                      included — the create actions themselves stay guarded by
                      the read-only enforcement downstream. */}
                  <div className="df-empty-actions">
                    <button
                      type="button"
                      className="df-empty-cta df-empty-cta-primary"
                      data-testid="design-files-empty-new-sketch"
                      onClick={onNewSketch}
                      title={t('designFiles.newSketch')}
                    >
                      <Icon name="pencil" size={13} />
                      <span>{t('designFiles.newSketch')}</span>
                    </button>
                    {onOpenBrowser ? (
                      <button
                        type="button"
                        className="df-empty-cta df-empty-cta-secondary"
                        data-testid="design-files-empty-open-browser"
                        onClick={onOpenBrowser}
                        aria-label={t('workspace.newBrowserDescription')}
                        title={t('workspace.newBrowserDescription')}
                      >
                        <Icon name="globe" size={13} />
                        <span>{t('workspace.newBrowser')}</span>
                      </button>
                    ) : null}
                    {onCreateDesignSystem ? (
                      <button
                        type="button"
                        className="df-empty-cta df-empty-cta-tertiary"
                        data-testid="design-files-empty-create-design-system"
                        onClick={onCreateDesignSystem}
                        title={t('dsManager.createTitle')}
                      >
                        <Icon name="blocks" size={14} />
                        <span>{t('dsManager.createTitle')}</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          ) : (
            <>
              {availableTabs.length > 0 ? (
                <div className="df-tabs" role="tablist" data-testid="design-files-tabs">
                  {availableTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={resolvedTab === tab.id}
                      className={`df-tab ${resolvedTab === tab.id ? 'active' : ''}`}
                      data-testid={`design-files-tab-${tab.id}`}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      {tab.label}
                      <span className="df-tab-count">{tab.count}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {resolvedTab === 'live-artifacts' ? (
                <div className="df-section" key="live-artifacts">
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
              {resolvedTab === 'plugin-folders' ? (
                <div className="df-section" key="plugin-folders">
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
                        onClick={() => onOpenFile(folder.manifestPath)}
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
              {resolvedTab === 'folders' ? (
                <div className="df-section" key="folders">
                  {dirsAtCurrentDir.map((d) => renderDirRow(d))}
                </div>
              ) : null}
              {sections.map(([category, sectionFiles]) =>
                resolvedTab === `cat:${category}` ? (
                  <div className="df-section" key={`cat:${category}`}>
                    {category === 'html' ? (
                      // Page cards are self-describing — a straight grid
                      // under the tab bar.
                      <div className="df-card-grid">
                        {sectionFiles.map((f) => renderPageCard(f, category))}
                      </div>
                    ) : category === 'image' ? (
                      // Images read as their own preview — a masonry waterfall
                      // of natural-aspect thumbnails instead of list rows.
                      <div className="df-image-masonry" data-testid="design-files-image-masonry">
                        {sectionFiles.map((f) => renderImageCard(f, category))}
                      </div>
                    ) : (
                      sectionFiles.map((f) => renderFileRow(f, category))
                    )}
                  </div>
                ) : null,
              )}
            </>
          )}
          {/* #5517 drops the always-on footer drop-hint strip — drag & drop
              still works through the df-drop-overlay below. */}
        </div>
        {draggingFiles ? (
          <div className="df-drop-overlay" aria-hidden>
            <div className="df-drop-overlay-card">
              <Icon name="upload" size={22} />
              <span className="label">{t('designFiles.dropTitle')}</span>
              <span className="desc">{t('designFiles.dropDesc')}</span>
            </div>
          </div>
        ) : null}
      </div>
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
            disabled={!files.some((file) => file.name === menuPos.name && file.localPath)}
            onClick={(e) => {
              e.stopPropagation();
              const name = menuPos.name;
              setMenuPos(null);
              void copyLocalPath(name);
            }}
          >
            {copiedLocalPath === menuPos.name
              ? t('designFiles.copiedLocalPath')
              : t('designFiles.copyLocalPath')}
          </button>
          <a
            href={projectFileUrl(projectId, menuPos.name, workspaceContext)}
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

// Pages are laid out at a desktop-ish width and scaled down to the card, so
// the thumbnail reads as a zoomed-out page preview instead of the page's
// narrow mobile layout cropped to the card's top-left corner.
const PAGE_THUMB_LAYOUT_WIDTH = 1200;
// Matches the card thumb's 16/9 aspect-ratio box.
const PAGE_THUMB_LAYOUT_HEIGHT = Math.round(PAGE_THUMB_LAYOUT_WIDTH * (9 / 16));

// The HTML page thumbnail: fetch + buildSrcdoc (guarded by the inline size
// cap), rendered through the #5517 reference's fixed-layout iframe scaled to
// the card width. While no srcdoc is available (too large, still fetching, or
// fetch failed) the glyph placeholder shows instead of URL-loading the iframe.
function HtmlCardThumbnail({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const { workspaceContext } = useProjectCollabContext();
  const tooLargeForThumbnail = file.size > HTML_THUMBNAIL_INLINE_MAX_BYTES;
  const url = projectFileUrl(projectId, file.name, workspaceContext);
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState<number | null>(null);

  useEffect(() => {
    setSrcDoc(null);
    if (tooLargeForThumbnail) return;
    const controller = new AbortController();
    let cancelled = false;
    void fetch(appendResourceQuery(url, `v=${Math.round(file.mtime)}`), {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.text() : null))
      .then((html) => {
        if (cancelled || html === null) return;
        const nextSrcDoc = buildSrcdoc(html, {
          baseHref: projectRawUrl(
            projectId,
            baseDirForFile(file.name),
            workspaceContext,
          ),
        });
        if (!cancelled) setSrcDoc(nextSrcDoc);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!cancelled) setSrcDoc(null);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    file.mtime,
    file.name,
    projectId,
    tooLargeForThumbnail,
    url,
    workspaceContext,
  ]);

  // Track the host width so the fixed-layout iframe scales with the card.
  // Environments without ResizeObserver (jsdom) fall back to an unscaled
  // fill-the-box iframe.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const width = host.clientWidth;
      if (width > 0) setScale(width / PAGE_THUMB_LAYOUT_WIDTH);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="df-thumb-scale-host">
      {tooLargeForThumbnail || srcDoc === null ? (
        <FilePreviewPlaceholder file={file} />
      ) : (
        <iframe
          title={file.name}
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-downloads"
          loading="lazy"
          style={
            scale
              ? {
                  width: PAGE_THUMB_LAYOUT_WIDTH,
                  height: PAGE_THUMB_LAYOUT_HEIGHT,
                  transform: `scale(${scale})`,
                  transformOrigin: '0 0',
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function FilePreviewPlaceholder({
  file,
  title,
}: {
  file: ProjectFile;
  title?: string;
}) {
  return (
    <div className="df-preview-placeholder" title={title}>
      {categoryGlyph(fileCategory(file))}
    </div>
  );
}

function baseDirForFile(name: string): string {
  const index = name.lastIndexOf('/');
  return index >= 0 ? name.slice(0, index + 1) : '';
}

function fileExtensionLabel(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toUpperCase();
}

// Plural section header for a category. Reuses existing plural labels where a
// dedicated one exists; otherwise falls back to the singular type label so
// each category gets a distinct, readable header.
function sectionLabel(category: FileCategory, t: TranslateFn): string {
  switch (category) {
    case 'html':
      return t('designFiles.sectionPages');
    case 'stylesheet':
      return t('designFiles.sectionStylesheets');
    case 'code':
      return t('designFiles.sectionScripts');
    case 'document':
      return t('designFiles.sectionDocuments');
    case 'image':
      return t('designFiles.sectionImages');
    case 'sketch':
      return t('designFiles.sectionSketches');
    case 'binary':
      return t('designFiles.sectionOther');
    default:
      return categoryLabel(category, t);
  }
}

// Singular row subtitle for a category.
function categoryLabel(category: FileCategory, t: TranslateFn): string {
  if (category === 'stylesheet') return t('designFiles.kindStylesheet');
  return kindLabel(category, t);
}

function categoryGlyph(category: FileCategory): string {
  if (category === 'stylesheet') return '#';
  return kindGlyph(category);
}

function filesFromClipboardData(clipboardData: DataTransfer | null): File[] {
  const files = Array.from(clipboardData?.files ?? []);
  if (files.length > 0) return files.map(normalizePastedFile);
  const items = Array.from(clipboardData?.items ?? []);
  return items
    .filter((item) => item.kind === 'file')
    .flatMap((item) => {
      const file = item.getAsFile();
      return file ? [normalizePastedFile(file)] : [];
    });
}

function normalizePastedFile(file: File): File {
  if (file.name.trim()) return file;
  const extension = extensionForMimeType(file.type);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return new File([file], `pasted-${stamp}${extension}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/gif') return '.gif';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/svg+xml') return '.svg';
  if (mimeType === 'text/html') return '.html';
  if (mimeType === 'text/plain') return '.txt';
  return '';
}

function shouldIgnoreClipboardFilePaste(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[contenteditable="true"]')) return true;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
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
  if (kind === 'html') return '⟨⟩';
  if (kind === 'image') return '▣';
  if (kind === 'sketch') return '✎';
  if (kind === 'text') return '¶';
  if (kind === 'code') return '{}';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'document') return 'DOC';
  if (kind === 'presentation') return 'PPT';
  if (kind === 'spreadsheet') return 'XLS';
  return '·';
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
