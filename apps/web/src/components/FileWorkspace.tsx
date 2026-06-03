import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from 'react';
import { Button } from '@open-design/components';
import type { TrackingProjectKind } from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import {
  trackFileManagerClick,
  trackFileUploadResult,
  trackPageView,
} from '../analytics/events';
import { deriveUploadCohort } from '../analytics/upload-tracking';
import { useT } from '../i18n';
import { isMacPlatform } from '../utils/platform';
import {
  deleteProjectFile,
  fetchProjectFileText,
  projectFileUrl,
  renameProjectFile,
  updateDesignSystemDraft,
  type UploadProjectFilesResult,
  uploadProjectFiles,
  writeProjectTextFile,
} from '../providers/registry';
import { deriveFileOps, type FileOpEntry } from '../runtime/file-ops';
import { latestTodosFromEvents, type TodoItem } from '../runtime/todos';
import {
  type AgentEvent,
  type ChatAttachment,
  type ChatCommentAttachment,
  liveArtifactSummaryToWorkspaceEntry,
  type LiveArtifactSummary,
  type LiveArtifactEventItem,
  type LiveArtifactWorkspaceEntry,
  type OpenTabsState,
  type PreviewComment,
  type PreviewCommentTarget,
  type DesignSystemSummary,
  type ProjectMetadata,
  type ProjectFile,
} from '../types';
import { DesignFilesPanel } from './DesignFilesPanel';
import type { PluginFolderAgentAction } from './design-files/pluginFolderActions';
import { designSystemGithubEvidenceState, repoConnectCopy } from './design-system-github-evidence';
import { APP_CHROME_FILE_ACTIONS_ID } from './AppChromeHeader';
import { FileViewer, LiveArtifactViewer } from './FileViewer';
import { Icon } from './Icon';
import { LiveArtifactBadges } from './LiveArtifactBadges';
import { MissingBrandFontsBanner } from './MissingBrandFontsBanner';
import { PasteTextDialog } from './PasteTextDialog';
import { QuickSwitcher } from './QuickSwitcher';
import { SketchEditor } from './SketchEditor';
import {
  buildSketchDocument,
  isSketchJsonFileName,
  parseSketchWorkspaceDocument,
  type SketchItem,
} from './sketch-model';
import { GenerationPreviewStage } from './GenerationPreviewStage';
import { AmrGuidance } from './AmrGuidance';
import { buildGenerationPreviewState } from '../runtime/generation-preview';
import type { ChatMessage } from '../types';

interface Props {
  projectId: string;
  projectKind: TrackingProjectKind;
  files: ProjectFile[];
  liveArtifacts: LiveArtifactSummary[];
  filesRefreshKey?: number;
  onRefreshFiles: () => Promise<void> | void;
  isDeck: boolean;
  onExportAsPptx?: ((fileName: string) => void) | undefined;
  streaming?: boolean;
  commentQueueOnSend?: boolean;
  commentSendDisabled?: boolean;
  openRequest?: { name: string; nonce: number } | null;
  liveArtifactEvents?: LiveArtifactEventItem[];
  designSystemActivityEvents?: AgentEvent[];
  // Persisted set of open tabs + active tab. Owned by ProjectView so the
  // daemon's SQLite store can hold the source of truth and survive reloads.
  tabsState: OpenTabsState;
  onTabsStateChange: (next: OpenTabsState) => void;
  previewComments?: PreviewComment[];
  onSavePreviewComment?: (target: PreviewCommentTarget, note: string, attachAfterSave: boolean) => Promise<PreviewComment | null>;
  onRemovePreviewComment?: (commentId: string) => Promise<void>;
  onSendBoardCommentAttachments?: (attachments: ChatCommentAttachment[]) => Promise<boolean | void> | boolean | void;
  onPluginFolderAgentAction?: (
    relativePath: string,
    action: PluginFolderAgentAction,
  ) => Promise<{ message?: string; url?: string } | void> | { message?: string; url?: string } | void;
  activePluginActionPaths?: Set<string>;
  hiddenPluginActionPaths?: Set<string>;
  focusMode?: boolean;
  onFocusModeChange?: (next: boolean) => void;
  designSystemProject?: DesignSystemSummary | null;
  defaultDesignSystemId?: string | null;
  onSetDefaultDesignSystem?: (id: string | null) => void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
  onDesignSystemNeedsWork?: (
    sectionTitle: string,
    feedback: string,
    files: string[],
  ) => DesignSystemReviewAgentTask | void;
  designSystemReview?: ProjectMetadata['designSystemReview'];
  onDesignSystemReviewDecision?: (
    sectionTitle: string,
    decision: DesignSystemReviewDecision,
    details?: DesignSystemReviewDetails,
  ) => void;
  onUseDesignSystem?: (id: string, title: string) => void;
  onConnectRepo?: () => void;
  githubConnected?: boolean;
  commentPortalId?: string;
  onCommentModeChange?: (active: boolean) => void;
  messages?: ChatMessage[];
  artifactHtml?: string | null;
  conversationError?: string | null;
  onRetry?: (message: ChatMessage) => void;
  // Contextual failure recovery, mirrored from the chat error card so the
  // preview surface can offer the same one-click fix (AMR authorize, terminal
  // sign-in) instead of a bare retry.
  onAuthorizeAndRetry?: (message: ChatMessage) => void;
  onLaunchTerminalAuth?: () => void;
  // Conversation id for the AMR promotion-card telemetry payload.
  conversationId?: string | null;
  // Project-level actions (settings, handoff, avatar menu) rendered at the
  // right end of the Design Files tab row. The former standalone chrome header
  // row was removed; these moved here alongside the FileViewer present/Share
  // portal that targets the same actions container.
  headerActions?: ReactNode;
}

interface SketchState {
  version: number;
  rawItems: unknown[];
  discardRawItemsOnSave: boolean;
  items: SketchItem[];
  dirty: boolean;
  persisted: boolean;
  loaded: boolean;
  saving: boolean;
}

const DESIGN_FILES_TAB = '__design_files__';
const DESIGN_SYSTEM_TAB = '__design_system__';
type TabDropEdge = 'before' | 'after';
type DesignSystemReviewDecision =
  NonNullable<ProjectMetadata['designSystemReview']>[string]['decision'];
type DesignSystemReviewEntry = NonNullable<ProjectMetadata['designSystemReview']>[string];
type DesignSystemReviewAgentTask = NonNullable<DesignSystemReviewEntry['agentTask']>;
interface DesignSystemReviewDetails {
  feedback?: string;
  files?: string[];
  agentTask?: DesignSystemReviewAgentTask;
}
type DesignSystemSectionStatus =
  | 'missing'
  | 'planned'
  | 'running'
  | 'needs-review'
  | 'approved'
  | 'needs-work'
  | 'updated';
type DesignSystemReviewCategory = 'Type' | 'Colors' | 'Spacing' | 'Components' | 'Brand';
interface DesignSystemProjectSection {
  title: string;
  subtitle: string;
  files: string[];
  category: DesignSystemReviewCategory;
  requiredFile?: string;
}
type DesignSystemSectionActivityPhase =
  | 'idle'
  | 'planned'
  | 'reading'
  | 'writing'
  | 'updated'
  | 'error';
interface DesignSystemSectionActivity {
  running: boolean;
  mutated: boolean;
  errored: boolean;
  phase: DesignSystemSectionActivityPhase;
  touchedFiles: string[];
  todoText?: string;
  todoStatus?: TodoItem['status'];
}
interface DesignSystemProjectSectionReview {
  section: DesignSystemProjectSection;
  previewFile: ProjectFile | null;
  reviewEntry: DesignSystemReviewEntry | undefined;
  sectionActivity: DesignSystemSectionActivity;
  changedAfterFeedback: boolean;
  sectionStatus: DesignSystemSectionStatus;
  sectionStatusLabel: string;
  reviewTimeLabel: string | null;
}
type DesignSystemGenerationStepStatus = 'pending' | 'running' | 'succeeded';
interface DesignSystemGenerationStep {
  id: string;
  title: string;
  detail: string;
  status: DesignSystemGenerationStepStatus;
}
const DESIGN_SYSTEM_GUIDANCE_FILES = new Set([
  'design.md',
  'readme.md',
  'readme-print.md',
  'skill.md',
]);
const DESIGN_SYSTEM_IMAGE_OR_FONT_EXTENSIONS = /\.(svg|png|jpe?g|gif|webp|avif|ico|otf|ttf|woff2?)$/i;

export function FileWorkspace({
  projectId,
  projectKind,
  files,
  liveArtifacts,
  filesRefreshKey = 0,
  onRefreshFiles,
  isDeck,
  onExportAsPptx,
  streaming,
  commentQueueOnSend = false,
  commentSendDisabled = false,
  openRequest,
  liveArtifactEvents = [],
  designSystemActivityEvents = [],
  tabsState,
  onTabsStateChange,
  previewComments = [],
  onSavePreviewComment,
  onRemovePreviewComment,
  onSendBoardCommentAttachments,
  onPluginFolderAgentAction,
  activePluginActionPaths,
  hiddenPluginActionPaths,
  focusMode = false,
  onFocusModeChange,
  designSystemProject = null,
  defaultDesignSystemId = null,
  onSetDefaultDesignSystem,
  onDesignSystemsRefresh,
  onDesignSystemNeedsWork,
  designSystemReview,
  onDesignSystemReviewDecision,
  onUseDesignSystem,
  onConnectRepo,
  githubConnected,
  commentPortalId,
  onCommentModeChange,
  messages = [],
  artifactHtml,
  conversationError,
  onRetry,
  onAuthorizeAndRetry,
  onLaunchTerminalAuth,
  conversationId,
  headerActions,
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  // P1 page_view page_name=file_manager — once per project the user lands
  // inside the workspace. Re-fire when the projectId changes so a
  // project-switch session shows up as a fresh view rather than reusing
  // the previous one.
  const fileManagerViewedProjectRef = useRef<string | null>(null);
  useEffect(() => {
    if (fileManagerViewedProjectRef.current === projectId) return;
    fileManagerViewedProjectRef.current = projectId;
    trackPageView(analytics.track, { page_name: 'file_manager' });
  }, [projectId, analytics.track]);
  const defaultRootTab = designSystemProject ? DESIGN_SYSTEM_TAB : DESIGN_FILES_TAB;
  // Persisted tabs come from the parent. Active tab can transiently point
  // at a pending sketch — pending sketches are not in tabsState.tabs.
  const persistedTabs = tabsState.tabs;
  const [activeTab, setActiveTab] = useState<string>(
    tabsState.active ?? defaultRootTab,
  );

  const [showPasteDialog, setShowPasteDialog] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sketches, setSketches] = useState<Record<string, SketchState>>({});
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [draggedTabName, setDraggedTabName] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<{
    name: string;
    edge: TabDropEdge;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tabsBarRef = useRef<HTMLDivElement | null>(null);
  const draggedTabNameRef = useRef<string | null>(null);

  const visibleFiles = useMemo(
    () => files.filter((file) => !isLiveArtifactImplementationPath(file.name)),
    [files],
  );

  const liveArtifactEntries = useMemo(
    () => liveArtifacts.map(liveArtifactSummaryToWorkspaceEntry),
    [liveArtifacts],
  );

  const generationPreview = useMemo(
    () =>
      buildGenerationPreviewState({
        designSystemProject: Boolean(designSystemProject),
        messages,
        streaming: Boolean(streaming),
        activeTab,
        projectFiles: visibleFiles,
        liveArtifacts,
        artifactHtml,
        conversationError,
      }),
    [designSystemProject, messages, streaming, activeTab, visibleFiles, liveArtifacts, artifactHtml, conversationError],
  );

  // Pull the persisted active tab in when the parent's hydration completes
  // (or on project switch). Fall back to the Design Files browser so a
  // fresh project lands in a useful place.
  useEffect(() => {
    setActiveTab(tabsState.active ?? defaultRootTab);
  }, [tabsState.active, defaultRootTab]);

  function setPersistedActive(name: string | null) {
    setActiveTab(name ?? defaultRootTab);
    onTabsStateChange({ tabs: persistedTabs, active: name });
  }

  function activatePending(name: string) {
    // Pending sketches are not in tabsState.tabs — flip the local
    // activeTab without round-tripping through the parent.
    setActiveTab(name);
  }

  // When the persisted tab list changes and the active tab is gone, fall
  // back to the last remaining tab. Skip transient activeTab values
  // (DESIGN_FILES_TAB, pending sketches) since those aren't in persistedTabs.
  useEffect(() => {
    if (activeTab === DESIGN_FILES_TAB || activeTab === DESIGN_SYSTEM_TAB) return;
    if (sketches[activeTab] && !sketches[activeTab]!.persisted) return;
    if (!persistedTabs.includes(activeTab)) {
      setPersistedActive(persistedTabs[persistedTabs.length - 1] ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedTabs, activeTab]);

  // External open requests from chat (tool cards, produced-file chips,
  // deep-linked URL, or the parent's auto-open after an agent Write) —
  // add the file to the open-tabs set and focus it.
  useEffect(() => {
    if (!openRequest) return;
    const name = openRequest.name;
    if (!name) return;
    onTabsStateChange({
      tabs: persistedTabs.includes(name) ? persistedTabs : [...persistedTabs, name],
      active: name,
    });
    setActiveTab(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  function openFile(name: string) {
    setUploadError(null);
    onTabsStateChange({
      tabs: persistedTabs.includes(name) ? persistedTabs : [...persistedTabs, name],
      active: name,
    });
    setActiveTab(name);
  }

  // Open `openName` (focusing it) and close `closeName` in a single tab-state
  // update. Used by the React module pointer (issue #2744): once the user
  // jumps to the HTML entry that renders a module, the dead-end module tab is
  // dropped. Done atomically because calling openFile() then closeTab() would
  // each read the same stale `persistedTabs` prop and the second would clobber
  // the first.
  function openFileReplacing(openName: string, closeName: string) {
    setUploadError(null);
    const withoutClosed = persistedTabs.filter((tabName) => tabName !== closeName);
    const nextTabs = withoutClosed.includes(openName)
      ? withoutClosed
      : [...withoutClosed, openName];
    onTabsStateChange({ tabs: nextTabs, active: openName });
    setActiveTab(openName);
  }

  function closeTab(name: string) {
    const sketchEntry = sketches[name];
    const isPending = sketchEntry && !sketchEntry.persisted;
    const hasUnsavedStrokes = sketchEntry && (sketchEntry.dirty || !sketchEntry.persisted);
    if (hasUnsavedStrokes && !confirm(t('sketch.closeConfirm'))) return;
    if (isPending) {
      setSketches((curr) => {
        const next = { ...curr };
        delete next[name];
        return next;
      });
      if (activeTab === name) {
        setPersistedActive(persistedTabs[persistedTabs.length - 1] ?? null);
      }
      return;
    }
    const nextTabs = persistedTabs.filter((n) => n !== name);
    const nextActive =
      tabsState.active === name
        ? nextTabs[nextTabs.length - 1] ?? null
        : tabsState.active;
    onTabsStateChange({ tabs: nextTabs, active: nextActive });
    setActiveTab(nextActive ?? DESIGN_FILES_TAB);
    setSketches((curr) => {
      const next = { ...curr };
      const entry = next[name];
      if (entry && !entry.persisted) delete next[name];
      return next;
    });
  }

  function reorderPersistedTab(
    draggedName: string,
    targetName: string,
    edge: TabDropEdge,
  ) {
    if (draggedName === targetName) return;
    if (!persistedTabs.includes(draggedName)) return;
    if (!persistedTabs.includes(targetName)) return;

    const nextTabs = persistedTabs.filter((name) => name !== draggedName);
    const targetIndex = nextTabs.indexOf(targetName);
    if (targetIndex === -1) return;
    nextTabs.splice(edge === 'after' ? targetIndex + 1 : targetIndex, 0, draggedName);
    if (arraysEqual(nextTabs, persistedTabs)) return;
    onTabsStateChange({ tabs: nextTabs, active: tabsState.active });
  }

  function clearTabDragState() {
    draggedTabNameRef.current = null;
    setDraggedTabName(null);
    setDragOverTab(null);
  }

  async function handleFilePicked(ev: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(ev.target.files ?? []);
    ev.target.value = '';
    await uploadFiles(picked);
  }

  async function uploadFiles(picked: File[]) {
    if (picked.length === 0) return;

    setUploadError(null);
    // Cohort math is shared across all three upload surfaces; see
    // `analytics/upload-tracking.ts` for the per-file → batch reduction.
    const cohort = deriveUploadCohort(picked);
    let result: UploadProjectFilesResult;
    try {
      result = await uploadProjectFiles(projectId, picked);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setUploadError(`Upload failed for ${picked.length} file(s) (${detail}).`);
      trackFileUploadResult(analytics.track, {
        page_name: 'file_manager',
        area: 'file_manager',
        project_id: projectId,
        ...cohort,
        result: 'failed',
        error_code: detail,
      });
      return;
    }
    if (result.uploaded.length > 0) {
      await onRefreshFiles();
      const lastUploaded = result.uploaded[result.uploaded.length - 1];
      if (lastUploaded?.path) openFile(lastUploaded.path);
    }

    if (result.failed.length > 0) {
      const failedCount = result.failed.length;
      const uploadedCount = result.uploaded.length;
      const detail = result.error ? ` (${result.error})` : '';
      setUploadError(
        uploadedCount > 0
          ? `Uploaded ${uploadedCount} file(s), but ${failedCount} failed${detail}.`
          : `Upload failed for ${failedCount} file(s)${detail}.`,
      );
      console.warn('Project upload had failures', result.failed);
      trackFileUploadResult(analytics.track, {
        page_name: 'file_manager',
        area: 'file_manager',
        project_id: projectId,
        ...cohort,
        result: 'failed',
        ...(result.error ? { error_code: result.error } : {}),
      });
    } else if (result.uploaded.length > 0) {
      trackFileUploadResult(analytics.track, {
        page_name: 'file_manager',
        area: 'file_manager',
        project_id: projectId,
        ...cohort,
        result: 'success',
      });
    }
  }

  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const isAllowedDropTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest('.df-drop, .composer'));
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e) || isAllowedDropTarget(e.target)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e) || isAllowedDropTarget(e.target)) return;
      e.preventDefault();
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  useEffect(() => {
    const tabBar = tabsBarRef.current;
    if (!tabBar) return;

    const onWheel = (event: globalThis.WheelEvent) => {
      scrollWorkspaceTabsWithWheel(tabBar, event);
    };
    tabBar.addEventListener('wheel', onWheel, { passive: false });
    return () => tabBar.removeEventListener('wheel', onWheel);
  }, []);

  // Browser-style tab bar: when the active tab changes (open from a chat
  // file chip, switch via Cmd+P, etc.), scroll it into view so the user
  // can always see what they have selected even when the strip overflows.
  // The Design Files entry is already sticky-pinned, so we only scroll
  // for real workspace tabs. Issue #775.
  useEffect(() => {
    if (activeTab === DESIGN_FILES_TAB || activeTab === DESIGN_SYSTEM_TAB) return;
    const tabBar = tabsBarRef.current;
    if (!tabBar) return;
    const el = tabBar.querySelector<HTMLElement>('.ws-tab.active');
    if (!el) return;
    // The Design Files tab is sticky-pinned to the scrollport's left
    // edge (index.css:.ws-tab.design-files-tab), so a naive scrollIntoView
    // with inline: 'nearest' would slide a leftward-jumped active tab
    // flush with that edge and leave it hidden underneath the sticky
    // panel. Compute scrollLeft manually instead, treating the sticky
    // tab's right edge as the effective visible-left boundary.
    const tabRect = el.getBoundingClientRect();
    const barRect = tabBar.getBoundingClientRect();
    const stickyEl = tabBar.querySelector<HTMLElement>('.ws-tab.design-files-tab');
    const stickyWidth = stickyEl ? stickyEl.getBoundingClientRect().width : 0;
    const visibleLeft = barRect.left + stickyWidth;
    const visibleRight = barRect.right;
    if (tabRect.left < visibleLeft) {
      tabBar.scrollLeft += tabRect.left - visibleLeft;
    } else if (tabRect.right > visibleRight) {
      tabBar.scrollLeft += tabRect.right - visibleRight;
    }
  }, [activeTab]);

  // Cmd+P (mac) / Ctrl+P (win/linux) opens the file palette. Capture phase
  // so we beat the browser's default print dialog. Platform-gated so on
  // macOS we don't steal Ctrl+P from native readline ("previous line") in
  // text fields, and on win/linux we don't steal Cmd+P (rare but possible
  // on remapped keyboards).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const primary = isMacPlatform() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (primary && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
        if (e.isComposing) return;
        e.preventDefault();
        setQuickSwitcherOpen((open) => !open);
      } else if (e.key === 'Escape' && quickSwitcherOpen) {
        // The palette handles Esc itself, but also catch it here for the
        // case where focus has drifted off the palette input.
        setQuickSwitcherOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [quickSwitcherOpen]);

  async function handleDelete(name: string) {
    if (!confirm(t('workspace.deleteFileConfirm', { name }))) return;
    const ok = await deleteProjectFile(projectId, name);
    if (ok) {
      await onRefreshFiles();
      const nextTabs = persistedTabs.filter((n) => n !== name);
      if (activeTab === name) {
        // User is viewing the file being deleted: fall back to another
        // open tab (or the Design Files panel if none remain).
        const nextActive = nextTabs[nextTabs.length - 1] ?? null;
        onTabsStateChange({ tabs: nextTabs, active: nextActive });
        setActiveTab(nextActive ?? DESIGN_FILES_TAB);
      } else {
        // Deletion was triggered from the Design Files panel (or another
        // tab). We preserve `activeTab` because the user is viewing a
        // different context (Design Files or another tab) and shouldn't
        // be navigated away. Only clear the persisted active reference
        // when it points at the deleted file so we don't leave a dangling
        // pointer behind.
        const nextActive = tabsState.active === name ? null : tabsState.active;
        onTabsStateChange({ tabs: nextTabs, active: nextActive });
      }
      setSketches((curr) => {
        const next = { ...curr };
        delete next[name];
        return next;
      });
    }
  }

  async function handleDeleteMany(names: string[]) {
    if (names.length === 0) return;
    if (!confirm(t('workspace.deleteSelectedFilesConfirm', { n: names.length }))) return;
    const deleted: string[] = [];
    const failed: string[] = [];
    for (const name of names) {
      const ok = await deleteProjectFile(projectId, name);
      if (ok) deleted.push(name);
      else failed.push(name);
    }
    if (deleted.length > 0) {
      await onRefreshFiles();
      const deletedSet = new Set(deleted);
      const nextTabs = persistedTabs.filter((n) => !deletedSet.has(n));
      if (activeTab && deletedSet.has(activeTab)) {
        const nextActive = nextTabs[nextTabs.length - 1] ?? null;
        onTabsStateChange({ tabs: nextTabs, active: nextActive });
        setActiveTab(nextActive ?? DESIGN_FILES_TAB);
      } else {
        const nextActive =
          tabsState.active && deletedSet.has(tabsState.active) ? null : tabsState.active;
        onTabsStateChange({ tabs: nextTabs, active: nextActive });
      }
      setSketches((curr) => {
        const next = { ...curr };
        for (const name of deleted) delete next[name];
        return next;
      });
    }
    if (failed.length > 0) {
      alert(t('workspace.deleteSelectedFilesPartial', { n: failed.length }));
    }
  }

  async function handleRename(oldName: string, nextName: string): Promise<ProjectFile | null> {
    const hasPendingSketchConflict = Object.entries(sketches).some(
      ([name, sketch]) => !sketch.persisted && sameFileName(name, nextName),
    );
    if (nextName !== oldName && hasPendingSketchConflict) {
      throw new Error(
        `A pending sketch named "${nextName}" is already open. Save or close it before renaming.`,
      );
    }

    const result = await renameProjectFile(projectId, oldName, nextName);
    const renamed = result.file;
    await onRefreshFiles();

    const nextTabs = persistedTabs.map((name) => (name === oldName ? renamed.name : name));
    const nextActive = tabsState.active === oldName ? renamed.name : tabsState.active;
    onTabsStateChange({ tabs: nextTabs, active: nextActive });
    if (activeTab === oldName) setActiveTab(renamed.name);

    setSketches((curr) => {
      const entry = curr[oldName];
      if (!entry) return curr;
      const next = { ...curr };
      delete next[oldName];
      next[renamed.name] = entry;
      return next;
    });

    return renamed;
  }

  function startNewSketch() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = `sketch-${stamp}.sketch.json`;
    setSketches((curr) => ({
      ...curr,
      [name]: {
        version: 1,
        rawItems: [],
        discardRawItemsOnSave: false,
        items: [],
        dirty: false,
        persisted: false,
        loaded: true,
        saving: false,
      },
    }));
    activatePending(name);
  }

  // When the active tab is a sketch we don't have items for yet, load from
  // disk. Pending sketches start with loaded=true and skip this path.
  useEffect(() => {
    if (activeTab === DESIGN_FILES_TAB) return;
    if (!isSketchName(activeTab)) return;
    if (sketches[activeTab]?.loaded) return;
    let cancelled = false;
    void fetchProjectFileText(projectId, activeTab).then((text) => {
      if (cancelled) return;
      const doc = parseSketchWorkspaceDocument(text);
      setSketches((curr) => ({
        ...curr,
        [activeTab]: {
          version: doc.version,
          rawItems: doc.rawItems,
          discardRawItemsOnSave: false,
          items: doc.items,
          dirty: false,
          persisted: true,
          loaded: true,
          saving: false,
        },
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab, projectId, sketches]);

  function setSketchItems(name: string, items: SketchItem[]) {
    setSketches((curr) => ({
      ...curr,
      [name]: {
        ...(curr[name] ?? {
          version: 1,
          rawItems: [],
          discardRawItemsOnSave: false,
          persisted: false,
          loaded: true,
          saving: false,
        }),
        items,
        dirty: true,
      } as SketchState,
    }));
  }

  function clearSketch(name: string) {
    setSketches((curr) => ({
      ...curr,
      [name]: {
        ...(curr[name] ?? {
          version: 1,
          rawItems: [],
          discardRawItemsOnSave: false,
          persisted: false,
          loaded: true,
          saving: false,
        }),
        items: [],
        dirty: true,
        discardRawItemsOnSave: true,
      } as SketchState,
    }));
  }

  async function saveSketch(name: string) {
    const entry = sketches[name];
    if (!entry) return;
    setSketches((curr) => ({ ...curr, [name]: { ...curr[name]!, saving: true } }));
    const doc = buildSketchDocument(
      entry.version,
      entry.discardRawItemsOnSave ? [] : entry.rawItems,
      entry.items,
    );
    const startedAt = Date.now();
    const file = await writeProjectTextFile(projectId, name, JSON.stringify(doc, null, 2));
    const elapsed = Date.now() - startedAt;
    // Ensures saving UI shows so the button does not flicker
    if (elapsed < 500) await new Promise((resolve) => setTimeout(resolve, 500 - elapsed));
    if (file) {
      setSketches((curr) => ({
        ...curr,
        [name]: {
          ...curr[name]!,
          version: doc.version,
          rawItems: doc.items.slice(),
          discardRawItemsOnSave: false,
          dirty: false,
          persisted: true,
          saving: false,
        },
      }));
      // Promote the previously-pending sketch into the persisted tab list.
      onTabsStateChange({
        tabs: persistedTabs.includes(name) ? persistedTabs : [...persistedTabs, name],
        active: name,
      });
      setActiveTab(name);
      await onRefreshFiles();
      return true;
    } else {
      setSketches((curr) => ({ ...curr, [name]: { ...curr[name]!, saving: false } }));
      return false;
    }
  }

  const activeFile = useMemo<ProjectFile | null>(() => {
    if (activeTab === DESIGN_FILES_TAB || activeTab === DESIGN_SYSTEM_TAB) return null;
    const onDisk = visibleFiles.find((f) => f.name === activeTab);
    if (onDisk) return onDisk;
    if (isSketchName(activeTab) && sketches[activeTab]) {
      return {
        name: activeTab,
        size: 0,
        mtime: Date.now(),
        kind: 'sketch',
        mime: 'application/json',
      };
    }
    return null;
  }, [activeTab, visibleFiles, sketches]);

  const activeLiveArtifact = useMemo<LiveArtifactWorkspaceEntry | null>(() => {
    if (activeTab === DESIGN_FILES_TAB || activeTab === DESIGN_SYSTEM_TAB) return null;
    return liveArtifactEntries.find((entry) => entry.tabId === activeTab) ?? null;
  }, [activeTab, liveArtifactEntries]);

  // Tabs rendered are persisted tabs plus any pending (un-saved) sketches.
  const tabNames = useMemo(() => {
    const seen = new Set(persistedTabs);
    const extras: string[] = [];
    for (const name of Object.keys(sketches)) {
      if (!sketches[name]?.persisted && !seen.has(name)) {
        extras.push(name);
        seen.add(name);
      }
    }
    return [...persistedTabs, ...extras];
  }, [persistedTabs, sketches]);

  const isActiveSketch = activeFile?.kind === 'sketch' && isSketchName(activeFile.name);
  const activeSketch = activeFile && isActiveSketch ? sketches[activeFile.name] : null;

  return (
    <div
      className={[
        'workspace',
        designSystemProject ? 'has-design-system-tab' : '',
      ].filter(Boolean).join(' ')}
      data-testid="file-workspace"
    >
      <div className="ws-tabs-shell">
        {onFocusModeChange && focusMode ? (
          <button
            type="button"
            className="icon-only ws-focus-expand"
            data-testid="workspace-focus-toggle"
            aria-pressed={focusMode}
            title={t('workspace.showChat')}
            aria-label={t('workspace.showChat')}
            onClick={() => onFocusModeChange(false)}
          >
            <Icon name="chevron-right" size={15} />
          </button>
        ) : null}
        <div
          ref={tabsBarRef}
          className="ws-tabs-bar"
          role="tablist"
          aria-label={t('workspace.designFiles')}
          onWheel={(event) => {
            // Translate vertical wheel into horizontal tab scroll so Windows
            // mouse-wheel users (no horizontal wheel/trackpad) can reach
            // overflowed tabs. Only act when there's actually horizontal
            // overflow and the gesture is predominantly vertical.
            const el = event.currentTarget;
            if (el.scrollWidth <= el.clientWidth) return;
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            el.scrollLeft += event.deltaY;
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setDragOverTab(null);
          }}
          onDrop={(event) => {
            if (event.target !== event.currentTarget) return;
            clearTabDragState();
          }}
        >
          {designSystemProject ? (
            <button
              type="button"
              className={`ws-tab design-system-tab ${activeTab === DESIGN_SYSTEM_TAB ? 'active' : ''}`}
              role="tab"
              aria-selected={activeTab === DESIGN_SYSTEM_TAB}
              tabIndex={0}
              data-testid="design-system-project-tab"
              onClick={() => setActiveTab(DESIGN_SYSTEM_TAB)}
              title="Design System"
            >
              <span className="tab-icon" aria-hidden>
                <Icon name="blocks" size={13} />
              </span>
              <span className="ws-tab-label">Design System</span>
            </button>
          ) : null}
          <button
            type="button"
            className={`ws-tab design-files-tab ${activeTab === DESIGN_FILES_TAB ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === DESIGN_FILES_TAB}
            tabIndex={0}
            data-testid="design-files-tab"
            onClick={() => setActiveTab(DESIGN_FILES_TAB)}
            title={t('workspace.designFiles')}
          >
            <span className="tab-icon" aria-hidden>
              <Icon name="grid" size={13} />
            </span>
            <span className="ws-tab-label">{t('workspace.designFiles')}</span>
          </button>
          {tabNames.map((name) => {
            const sketchEntry = sketches[name];
            const dirtyMark =
              sketchEntry && (sketchEntry.dirty || !sketchEntry.persisted) ? ' •' : '';
            const isPending = sketchEntry && !sketchEntry.persisted;
            const onDisk = visibleFiles.find((f) => f.name === name);
            const liveArtifact = liveArtifactEntries.find((entry) => entry.tabId === name);
            const kind = liveArtifact ? 'live-artifact' : onDisk?.kind ?? (isSketchName(name) ? 'sketch' : 'text');
            return (
              <Tab
                key={name}
                label={`${liveArtifact?.title ?? name}${dirtyMark}`}
                active={activeTab === name}
                onActivate={() =>
                  isPending ? activatePending(name) : setPersistedActive(name)
                }
                onClose={() => closeTab(name)}
                kind={kind}
                liveArtifact={liveArtifact}
                draggable={persistedTabs.includes(name)}
                dragging={draggedTabName === name}
                dragOverEdge={
                  dragOverTab?.name === name && draggedTabName !== name
                    ? dragOverTab.edge
                    : null
                }
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', name);
                  draggedTabNameRef.current = name;
                  setDraggedTabName(name);
                }}
                onDragOver={(event) => {
                  const currentDraggedName = draggedTabNameRef.current ?? draggedTabName;
                  if (!currentDraggedName || currentDraggedName === name) return;
                  if (!persistedTabs.includes(currentDraggedName)) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  const edge = tabDropEdgeFromEvent(event);
                  setDragOverTab((current) =>
                    current?.name === name && current.edge === edge
                      ? current
                      : { name, edge },
                  );
                }}
                onDragLeave={() => {
                  setDragOverTab((current) => (current?.name === name ? null : current));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const draggedName = draggedTabNameRef.current || draggedTabName;
                  if (draggedName) {
                    reorderPersistedTab(draggedName, name, tabDropEdgeFromEvent(event));
                  }
                  clearTabDragState();
                }}
                onDragEnd={clearTabDragState}
              />
            );
          })}
        </div>
        <div className="ws-tabs-actions">
          <div
            id={APP_CHROME_FILE_ACTIONS_ID}
            className="ws-tabs-file-actions"
            data-app-chrome-file-actions="true"
          />
          {headerActions ? (
            <div className="ws-tabs-project-actions">{headerActions}</div>
          ) : null}
        </div>
      </div>
      <div className="ws-body">
        {/* Banner moved into DesignFilesPanel for the Design Files tab so
            single-click preview (which keeps activeTab on DESIGN_FILES_TAB)
            no longer leaves a stale banner mounted above the preview.
            Keep a fallback here that fires only when activeTab is not the
            Design Files tab, which preserves visibility for the
            partial-upload case where the last successful file auto-opens
            into a viewer surface. */}
        {uploadError && activeTab !== DESIGN_FILES_TAB ? (
          <div className="df-upload-banner" data-testid="upload-error-banner">
            <span>{uploadError}</span>
            <button
              type="button"
              data-testid="upload-error-dismiss"
              onClick={() => setUploadError(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        {activeTab === DESIGN_SYSTEM_TAB && designSystemProject ? (
          <DesignSystemProjectPanel
            projectId={projectId}
            system={designSystemProject}
            files={visibleFiles}
            streaming={Boolean(streaming)}
            activityEvents={designSystemActivityEvents}
            onOpenFile={openFile}
            onUploadAssets={() => fileInputRef.current?.click()}
            defaultDesignSystemId={defaultDesignSystemId}
            onSetDefaultDesignSystem={onSetDefaultDesignSystem}
            onDesignSystemsRefresh={onDesignSystemsRefresh}
            onNeedsWork={onDesignSystemNeedsWork}
            designSystemReview={designSystemReview}
            onReviewDecision={onDesignSystemReviewDecision}
            onUseDesignSystem={onUseDesignSystem}
            onConnectRepo={onConnectRepo}
            githubConnected={githubConnected}
          />
        ) : generationPreview ? (
          <GenerationPreviewStage
            model={generationPreview}
            onRetry={
              generationPreview.retryTarget && onRetry
                ? () => onRetry(generationPreview.retryTarget!)
                : undefined
            }
            onAuthorizeAndRetry={
              generationPreview.retryTarget && onAuthorizeAndRetry
                ? () => onAuthorizeAndRetry(generationPreview.retryTarget!)
                : undefined
            }
            onLaunchTerminalAuth={onLaunchTerminalAuth}
            amrGuidance={
              generationPreview.promoteAmrSwitch
                && generationPreview.errorCode
                && generationPreview.retryTarget
                && onAuthorizeAndRetry ? (
                <AmrGuidance
                  errorCode={generationPreview.errorCode}
                  projectId={projectId}
                  projectKind={projectKind}
                  conversationId={conversationId ?? null}
                  assistantMessageId={generationPreview.retryTarget.id}
                  runId={generationPreview.retryTarget.runId ?? null}
                  onActivate={() => onAuthorizeAndRetry(generationPreview.retryTarget!)}
                />
              ) : undefined
            }
          />
        ) : activeTab === DESIGN_FILES_TAB ? (
          <DesignFilesPanel
            key={projectId}
            projectId={projectId}
            files={visibleFiles}
            liveArtifacts={liveArtifactEntries}
            onRefreshFiles={onRefreshFiles}
            onOpenFile={openFile}
            onOpenLiveArtifact={(tabId) => openFile(tabId)}
            onRenameFile={handleRename}
            onDeleteFile={(name) => {
              trackFileManagerClick(analytics.track, {
                page_name: 'file_manager',
                area: 'file_manager',
                element: 'delete',
              });
              void handleDelete(name);
            }}
            onDeleteFiles={(names) => {
              trackFileManagerClick(analytics.track, {
                page_name: 'file_manager',
                area: 'file_manager',
                element: 'delete',
              });
              return handleDeleteMany(names);
            }}
            onUpload={() => {
              trackFileManagerClick(analytics.track, {
                page_name: 'file_manager',
                area: 'file_manager',
                element: 'upload',
              });
              fileInputRef.current?.click();
            }}
            onUploadFiles={(picked) => void uploadFiles(picked)}
            onPaste={() => {
              trackFileManagerClick(analytics.track, {
                page_name: 'file_manager',
                area: 'file_manager',
                element: 'paste',
              });
              setShowPasteDialog(true);
            }}
            onNewSketch={() => {
              trackFileManagerClick(analytics.track, {
                page_name: 'file_manager',
                area: 'file_manager',
                element: 'new_sketch',
              });
              startNewSketch();
            }}
            uploadError={uploadError}
            onClearUploadError={() => setUploadError(null)}
            onPluginFolderAgentAction={onPluginFolderAgentAction}
            activePluginActionPaths={activePluginActionPaths}
            hiddenPluginActionPaths={hiddenPluginActionPaths}
          />
        ) : isActiveSketch && activeSketch && activeFile ? (
          activeSketch.loaded ? (
            <SketchEditor
              fileName={activeFile.name}
              items={activeSketch.items}
              hasPreservedRawItems={
                !activeSketch.discardRawItemsOnSave && activeSketch.rawItems.length > activeSketch.items.length
              }
              onItemsChange={(items) => setSketchItems(activeFile.name, items)}
              onClear={() => clearSketch(activeFile.name)}
              onSave={() => saveSketch(activeFile.name)}
              saving={activeSketch.saving}
              dirty={activeSketch.dirty || !activeSketch.persisted}
              onCancel={() => closeTab(activeFile.name)}
            />
          ) : (
            <div className="viewer-empty">{t('workspace.loadingSketch')}</div>
          )
        ) : activeLiveArtifact ? (
          <LiveArtifactViewer
            projectId={projectId}
            liveArtifact={activeLiveArtifact}
            liveArtifactEvents={liveArtifactEvents}
            onRefreshArtifacts={onRefreshFiles}
          />
        ) : activeFile ? (
          <FileViewer
            projectId={projectId}
            projectKind={projectKind}
            file={activeFile}
            filesRefreshKey={filesRefreshKey}
            isDeck={isDeck}
            onExportAsPptx={onExportAsPptx}
            streaming={streaming}
            commentQueueOnSend={commentQueueOnSend}
            commentSendDisabled={commentSendDisabled}
            previewComments={previewComments.filter((comment) => comment.filePath === activeFile.name)}
            onSavePreviewComment={onSavePreviewComment}
            onRemovePreviewComment={onRemovePreviewComment}
            onSendBoardCommentAttachments={onSendBoardCommentAttachments}
            onFileSaved={onRefreshFiles}
            onOpenFileReplacing={openFileReplacing}
            commentPortalId={commentPortalId}
            onCommentModeChange={onCommentModeChange}
          />
        ) : (
          <div className="viewer-empty">
            {t('workspace.openFromDesignFiles')}{' '}
            <a
              className="link"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab(DESIGN_FILES_TAB);
              }}
            >
              {t('workspace.designFilesLink')}
            </a>
            .
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        data-testid="design-files-upload-input"
        style={{ display: 'none' }}
        onChange={handleFilePicked}
      />
      {showPasteDialog ? (
        <PasteTextDialog
          onClose={() => setShowPasteDialog(false)}
          onSave={async (name, content) => {
            setShowPasteDialog(false);
            const file = await writeProjectTextFile(projectId, name, content);
            if (file) {
              await onRefreshFiles();
              openFile(file.name);
            }
          }}
        />
      ) : null}
      {quickSwitcherOpen ? (
        <QuickSwitcher
          projectId={projectId}
          files={visibleFiles}
          onOpenFile={(name) => {
            openFile(name);
            setQuickSwitcherOpen(false);
          }}
          onClose={() => setQuickSwitcherOpen(false)}
        />
      ) : null}
    </div>
  );
}

function DesignSystemProjectPanel({
  projectId,
  system,
  files,
  streaming,
  activityEvents,
  onOpenFile,
  onUploadAssets,
  defaultDesignSystemId,
  onSetDefaultDesignSystem,
  onDesignSystemsRefresh,
  onNeedsWork,
  designSystemReview,
  onReviewDecision,
  onUseDesignSystem,
  onConnectRepo,
  githubConnected,
}: {
  projectId: string;
  system: DesignSystemSummary;
  files: ProjectFile[];
  streaming: boolean;
  activityEvents: AgentEvent[];
  onOpenFile: (name: string) => void;
  onUploadAssets: () => void;
  defaultDesignSystemId?: string | null;
  onSetDefaultDesignSystem?: (id: string | null) => void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
  onNeedsWork?: (
    sectionTitle: string,
    feedback: string,
    files: string[],
  ) => DesignSystemReviewAgentTask | void;
  designSystemReview?: ProjectMetadata['designSystemReview'];
  onReviewDecision?: (
    sectionTitle: string,
    decision: DesignSystemReviewDecision,
    details?: DesignSystemReviewDetails,
  ) => void;
  onUseDesignSystem?: (id: string, title: string) => void;
  onConnectRepo?: () => void;
  githubConnected?: boolean;
}) {
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, DesignSystemReviewDecision>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [feedbackSection, setFeedbackSection] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [status, setStatus] = useState(system.status ?? 'draft');
  const [statusBusy, setStatusBusy] = useState(false);
  useEffect(() => {
    setStatus(system.status ?? 'draft');
  }, [system.status]);
  useEffect(() => {
    const next: Record<string, DesignSystemReviewDecision> = {};
    for (const [sectionTitle, entry] of Object.entries(designSystemReview ?? {})) {
      next[sectionTitle] = entry.decision;
    }
    setReviewDecisions(next);
  }, [designSystemReview]);
  const allFileNames = files.map((file) => file.name);
  const fileByName = new Map(files.map((file) => [file.name, file]));
  const fontFiles = allFileNames.filter((name) =>
    /\.(otf|ttf|woff|woff2)$/i.test(name) || name.toLowerCase().includes('/fonts/'),
  );
  const githubEvidence = designSystemGithubEvidenceState(system, allFileNames);
  const sections = buildDesignSystemReviewSections(allFileNames, fileByName);
  const published = status === 'published';
  const isDefault = published && defaultDesignSystemId === system.id;
  // Strip a trailing "design system" from the title so the heading
  // "Review <name> design system" does not read redundantly when a system is
  // already named e.g. "Acme Design System".
  const systemDisplayName = system.title.replace(/\s*design system$/i, '').trim() || system.title;
  const activityFileOps = useMemo(() => deriveFileOps(activityEvents), [activityEvents]);
  const activityTodos = useMemo(() => latestTodosFromEvents(activityEvents), [activityEvents]);
  const sectionReviews: DesignSystemProjectSectionReview[] = sections.map((section) => {
    const previewFile = designSystemSectionPreviewFile(section.files, fileByName);
    const reviewEntry = designSystemReview?.[section.title];
    const reviewDecision = reviewDecisions[section.title] ?? reviewEntry?.decision;
    const sectionActivity = designSystemSectionActivity(section, activityFileOps, activityTodos);
    const changedAfterFeedback = designSystemSectionChangedAfterReview(
      section.files,
      fileByName,
      reviewEntry,
    );
    const sectionStatus = designSystemSectionStatus(
      section,
      reviewDecision,
      changedAfterFeedback,
      sectionActivity,
    );
    return {
      section,
      previewFile,
      reviewEntry,
      sectionActivity,
      changedAfterFeedback,
      sectionStatus,
      sectionStatusLabel: designSystemSectionStatusLabel(section, sectionStatus, sectionActivity),
      reviewTimeLabel: reviewEntry?.updatedAt
        ? designSystemReviewTimeLabel(reviewEntry.updatedAt)
        : null,
    };
  });
  const generationReviewHasStarted = published || designSystemGenerationReviewHasStarted(sectionReviews);
  const visibleSectionReviews = streaming && !published && generationReviewHasStarted
    ? sectionReviews.filter((item) => designSystemSectionVisibleDuringGeneration(item))
    : sectionReviews;
  const needsReviewSectionReviews = visibleSectionReviews.filter(designSystemReviewNeedsAttention);
  const primaryNeedsReview = needsReviewSectionReviews.slice(0, 1);
  const groupedSectionReviews = designSystemReviewGroups(visibleSectionReviews);
  const creatingInitialDraft = streaming && !published;
  const generationSteps = designSystemInitialGenerationSteps({
    files,
    sectionReviews,
    system,
  });
  const generationProgress = designSystemGenerationProgress(generationSteps);

  async function togglePublished(nextPublished: boolean) {
    if (nextPublished && !githubEvidence.ready) return;
    setStatusBusy(true);
    try {
      const nextStatus = nextPublished ? 'published' : 'draft';
      const updated = await updateDesignSystemDraft(system.id, { status: nextStatus });
      if (updated) setStatus(updated.status ?? nextStatus);
      await onDesignSystemsRefresh?.();
    } finally {
      setStatusBusy(false);
    }
  }

  function markSectionReview(
    sectionTitle: string,
    decision: DesignSystemReviewDecision,
    details?: DesignSystemReviewDetails,
  ) {
    setReviewDecisions((current) => ({ ...current, [sectionTitle]: decision }));
    onReviewDecision?.(sectionTitle, decision, details);
    if (decision === 'looks-good' && feedbackSection === sectionTitle) {
      setFeedbackSection(null);
      setFeedbackText('');
    }
  }

  function toggleSection(sectionTitle: string) {
    setExpandedSections((current) => ({
      ...current,
      [sectionTitle]: !(current[sectionTitle] ?? false),
    }));
  }

  function openNeedsWorkFeedback(sectionTitle: string) {
    setReviewDecisions((current) => ({ ...current, [sectionTitle]: 'needs-work' }));
    setExpandedSections((current) => ({ ...current, [sectionTitle]: true }));
    setFeedbackSection(sectionTitle);
    setFeedbackText('');
  }

  function submitNeedsWorkFeedback(sectionTitle: string, sectionFiles: string[]) {
    const feedback = feedbackText.trim();
    if (!feedback) return;
    const agentTask = onNeedsWork?.(sectionTitle, feedback, sectionFiles);
    markSectionReview(sectionTitle, 'needs-work', {
      feedback,
      files: sectionFiles,
      ...(agentTask ? { agentTask } : {}),
    });
    setFeedbackSection(null);
    setFeedbackText('');
  }

  function renderReviewCard(
    item: DesignSystemProjectSectionReview,
    instanceId: string,
    defaultExpanded: boolean,
  ) {
    const {
      section,
      previewFile,
      reviewEntry,
      sectionActivity,
      changedAfterFeedback,
      sectionStatus,
      sectionStatusLabel,
    } = item;
    const needsAttention = designSystemReviewNeedsAttention(item);
    // A section the user marked "Looks good" is validated, so collapse it by
    // default to show it is done. Gate that on the current status, not just the
    // stored decision: when a section is regenerated after approval its status
    // moves back to needs-attention, and it has to reopen so the "review again"
    // notice and the review buttons (both rendered only while expanded) stay
    // visible. Without the needsAttention guard a stale "looks-good" decision
    // keeps the regenerated section collapsed and the change is easy to miss.
    // The user can still re-expand with the chevron (expandedSections[instanceId]),
    // and an active agent run forces it open.
    const reviewedGood =
      !needsAttention && (reviewDecisions[section.title] ?? reviewEntry?.decision) === 'looks-good';
    const expanded =
      (expandedSections[instanceId] ?? (defaultExpanded && !reviewedGood)) || sectionActivity.running;
    return (
      <section
        key={instanceId}
        className={[
          'ds-project-section',
          'ds-project-review-item',
          expanded ? 'is-expanded' : 'is-collapsed',
        ].join(' ')}
      >
        <div className="ds-project-section-head">
          {/* The trigger is a stretched button covering the whole head, so the
              entire row toggles. It is a sibling of the review action buttons
              (not a parent), so there are no nested interactive elements. The
              title below is display-only (pointer-events: none) and lets clicks
              fall through to this trigger. */}
          <button
            type="button"
            className="ds-project-section-head-trigger"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${section.title}`}
            onClick={() => toggleSection(instanceId)}
          />
          <span className="ds-project-section-title">
            <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={13} />
            <span>
              <strong>{section.title}</strong>
              <small>{section.subtitle}</small>
            </span>
            {!expanded ? (
              <span
                className={[
                  'ds-project-section-state',
                  'ds-project-section-dot',
                  designSystemSectionStatusClass(sectionStatus),
                ].join(' ')}
                aria-label={sectionStatusLabel}
                title={sectionStatusLabel}
              >
                {needsAttention ? 'Needs review' : 'Looks good'}
              </span>
            ) : null}
          </span>
          {expanded ? (
            <div className="ds-project-review-actions" aria-label={`${section.title} review`}>
              <button
                type="button"
                className={`ghost success ${reviewDecisions[section.title] === 'looks-good' ? 'active' : ''}`}
                data-testid={`design-system-review-good-${slugForTestId(section.title)}`}
                onClick={() => {
                  markSectionReview(section.title, 'looks-good');
                  // Collapse on validate, overriding any manual expand so the
                  // section always tidies away once it is marked good.
                  setExpandedSections((current) => ({ ...current, [instanceId]: false }));
                }}
              >
                <Icon name="check" size={13} />
                Looks good
              </button>
              <button
                type="button"
                className={`ghost danger ${reviewDecisions[section.title] === 'needs-work' ? 'active' : ''}`}
                data-testid={`design-system-review-work-${slugForTestId(section.title)}`}
                onClick={() => openNeedsWorkFeedback(section.title)}
              >
                <Icon name="comment" size={13} />
                Needs work...
              </button>
              {feedbackSection === section.title ? (
                <form
                  className="ds-project-feedback-popover"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitNeedsWorkFeedback(section.title, section.files);
                  }}
                >
                  <label htmlFor={`ds-feedback-${slugForTestId(section.title)}`}>
                    Tell the agent what to change
                  </label>
                  <textarea
                    id={`ds-feedback-${slugForTestId(section.title)}`}
                    value={feedbackText}
                    rows={3}
                    placeholder={`e.g. tighten spacing in ${section.title}, regenerate this preview...`}
                    onChange={(event) => setFeedbackText(event.target.value)}
                    autoFocus
                  />
                  <div>
                    <button
                      type="button"
                      className="ghost compact"
                      onClick={() => {
                        setFeedbackSection(null);
                        setFeedbackText('');
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="primary compact"
                      disabled={!feedbackText.trim()}
                    >
                      Send
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
        {expanded ? (
          <div className="ds-project-section-body">
            {sectionActivity.running ? (
              <div className="ds-project-review-notice is-running">
                <Icon name="sparkles" size={14} />
                <span>{designSystemSectionRunningNotice(section, sectionActivity)}</span>
              </div>
            ) : changedAfterFeedback || sectionActivity.mutated ? (
              <div className="ds-project-review-notice">
                <Icon name="check" size={14} />
                <span>
                  {changedAfterFeedback
                    ? 'This section changed after your feedback. Review it again before publishing.'
                    : 'This section changed during the latest run. Review it before publishing.'}
                </span>
              </div>
            ) : null}
            {reviewEntry?.decision === 'needs-work' && reviewEntry.feedback ? (
              <div className="ds-project-last-feedback">
                <Icon name="comment" size={14} />
                <span>
                  <strong>Last feedback</strong>
                  <small>{reviewEntry.feedback}</small>
                  {reviewEntry.agentTask ? (
                    <small>{designSystemReviewAgentTaskLabel(reviewEntry.agentTask)}</small>
                  ) : null}
                </span>
              </div>
            ) : null}
            {previewFile ? (
              <div className="ds-project-inline-preview">
                <DesignSystemInlinePreview projectId={projectId} file={previewFile} />
              </div>
            ) : (
              <div className="ds-project-preview-placeholder">
                <Icon name="sparkles" size={16} />
                <span>Generating preview...</span>
              </div>
            )}
          </div>
        ) : null}
      </section>
    );
  }

  if (creatingInitialDraft) {
    return (
      <div className="ds-project-panel ds-project-panel--generating">
        <div className="ds-project-generation-stage">
          <span className="ds-project-generation-mark">
            <Icon name="blocks" size={24} />
          </span>
          <h1>Creating your design system...</h1>
          <p>Keep this tab open. You can come back in a few minutes.</p>
          <div
            className="ds-project-generation-progress"
            role="progressbar"
            aria-label={`Design system generation progress ${generationProgress}%`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={generationProgress}
          >
            <span style={{ width: `${generationProgress}%` }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-project-panel">
      <div className="ds-project-main ds-project-main--review">
        <div className="ds-project-head ds-project-head--review">
          <h1>
            {published
              ? `${systemDisplayName} design system`
              : `Review ${systemDisplayName} design system`}
          </h1>
          <div className="ds-project-publish-card__toggles">
            {/* The publish button is disabled until the GitHub import evidence is
                ready, and a disabled button never fires the hover or focus that
                surfaces a `title` tooltip. Keep the guidance on this wrapper,
                which is never disabled, and let pointer events fall through the
                disabled button to it (see .ds-project-publish-trigger) so the
                explanation stays reachable exactly when publishing is blocked. */}
            <span
              className="ds-project-publish-trigger"
              title={
                !published && !githubEvidence.ready
                  ? 'Finish importing your GitHub repo before you can publish.'
                  : undefined
              }
            >
              <button
                type="button"
                className={published ? 'ghost compact' : 'primary'}
                data-testid="design-system-publish"
                disabled={statusBusy || (!published && !githubEvidence.ready)}
                onClick={() => void togglePublished(!published)}
              >
                {published ? <Icon name="check" size={14} /> : null}
                {published ? 'Published' : 'Publish'}
              </button>
            </span>
            {published ? (
              <label>
                <input
                  type="checkbox"
                  checked={isDefault}
                  disabled={statusBusy}
                  onChange={(event) => {
                    onSetDefaultDesignSystem?.(event.target.checked ? system.id : null);
                  }}
                />
                Default
              </label>
            ) : null}
          </div>
        </div>

        <div className="ds-project-publish-card ds-project-publish-card--review">
          <p>
            {published
              ? "Your team's new projects can use this design system as context by default."
              : 'Your design system is ready, but your feedback will improve it. Publish it when it is ready to use in future projects.'}
          </p>
          {published ? (
            <div className="ds-project-use-row">
              <span>Use this system</span>
              <Button
                variant="ghost"
                className="compact"
                onClick={() => onUseDesignSystem?.(system.id, system.title)}
              >
                <Icon name="external-link" size={13} />
                New design
              </Button>
            </div>
          ) : null}
        </div>

        {!githubEvidence.ready ? (
          <div className="ds-project-warning-card">
            <Icon name="github" size={16} />
            <span>
              <strong>{repoConnectCopy(githubConnected).bannerTitle}</strong>
              <small>{repoConnectCopy(githubConnected).bannerBody}</small>
            </span>
            {onConnectRepo ? (
              <Button
                variant="ghost"
                className="compact"
                disabled={githubConnected === undefined}
                onClick={onConnectRepo}
              >
                <Icon name="github" size={13} />
                {repoConnectCopy(githubConnected).buttonLabel}
              </Button>
            ) : githubEvidence.hasSourceManifest ? (
              <Button variant="ghost" className="compact" onClick={() => onOpenFile('context/source-context.md')}>
                <Icon name="file" size={13} />
                Open source context
              </Button>
            ) : null}
          </div>
        ) : null}

        {fontFiles.length === 0 ? (
          <MissingBrandFontsBanner projectId={projectId} onUploadAssets={onUploadAssets} />
        ) : null}

        <div className="ds-project-sections">
          {primaryNeedsReview.length > 0 ? (
            <div className="ds-project-section-group">
              {primaryNeedsReview.map((item, index) =>
                renderReviewCard(item, `needs-review:${item.section.title}`, index === 0),
              )}
            </div>
          ) : null}

          {groupedSectionReviews.map((group) => (
            <div key={group.title} className="ds-project-section-group">
              <h2>{group.title}</h2>
              {group.items.map((item) =>
                renderReviewCard(item, `${group.title}:${item.section.title}`, Boolean(item.previewFile)),
              )}
            </div>
          ))}

          {visibleSectionReviews.length === 0 ? (
            <div className="ds-project-empty-review">
              <Icon name="sparkles" size={18} />
              <span>Preview cards will appear here as the agent creates them.</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function designSystemHasSourceContext(system: DesignSystemSummary): boolean {
  const provenance = system.provenance;
  if (!provenance) return false;
  return Boolean(
    provenance.companyBlurb?.trim() ||
    provenance.githubUrls?.length ||
    provenance.localCodeFiles?.length ||
    provenance.figFiles?.length ||
    provenance.assetFiles?.length ||
    provenance.notes?.trim() ||
    provenance.sourceNotes?.trim(),
  );
}

function slugForTestId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function designSystemSectionPreviewFile(
  names: string[],
  fileByName: Map<string, ProjectFile>,
): ProjectFile | null {
  for (const name of names) {
    const file = fileByName.get(name);
    if (!file) continue;
    if (file.kind === 'html' || file.kind === 'image' || file.kind === 'sketch') return file;
  }
  return null;
}

function buildDesignSystemReviewSections(
  names: string[],
  fileByName: Map<string, ProjectFile>,
): DesignSystemProjectSection[] {
  const artifactNames = names
    .filter((name) => isDesignSystemReviewArtifactFile(name, fileByName))
    .sort(designSystemReviewArtifactSort);
  if (artifactNames.length > 0) {
    const reviewNames = preferPreviewArtifactsOverRawAssets(artifactNames);
    return reviewNames.map((name) => {
      const title = designSystemReviewTitleFromPath(name);
      const category = inferDesignSystemReviewCategory(name, title);
      return {
        title,
        subtitle: designSystemReviewSubtitle(title, category),
        category,
        files: designSystemRelatedFilesForCategory(name, category, names),
      };
    });
  }
  return designSystemFallbackReviewSections(names);
}

function preferPreviewArtifactsOverRawAssets(names: string[]): string[] {
  const hasBrandPreview = names.some((name) => {
    const path = normalizeDesignSystemPath(name);
    const title = designSystemReviewTitleFromPath(name);
    return inferDesignSystemReviewCategory(name, title) === 'Brand'
      && (path.startsWith('preview/') || path.includes('/preview/') || path.endsWith('.html'));
  });
  if (!hasBrandPreview) return names;
  return names.filter((name) => {
    const path = normalizeDesignSystemPath(name);
    const title = designSystemReviewTitleFromPath(name);
    if (inferDesignSystemReviewCategory(name, title) !== 'Brand') return true;
    return path.startsWith('preview/') || path.includes('/preview/') || path.endsWith('.html');
  });
}

function isDesignSystemReviewArtifactFile(
  name: string,
  fileByName: Map<string, ProjectFile>,
): boolean {
  const path = normalizeDesignSystemPath(name);
  const file = fileByName.get(name);
  if (!file || isDesignSystemEvidenceFile(path) || path === 'metadata.json') return false;
  const isRenderable = file.kind === 'html' || file.kind === 'image' || file.kind === 'sketch';
  if (!isRenderable) return false;
  if (path === 'index.html') return true;
  if (path.startsWith('preview/') || path.includes('/preview/')) return true;
  if (path.startsWith('ui_kits/') || path.includes('/ui_kits/')) return true;
  if (
    path.startsWith('assets/')
    || path.startsWith('src/assets/')
    || path.startsWith('public/')
    || path.includes('/assets/')
    || path.includes('/logos/')
  ) {
    return /\b(brand|logo|mark|icon)\b/u.test(path) || DESIGN_SYSTEM_IMAGE_OR_FONT_EXTENSIONS.test(path);
  }
  return false;
}

function designSystemReviewArtifactSort(first: string, second: string): number {
  const firstCategory = inferDesignSystemReviewCategory(first, designSystemReviewTitleFromPath(first));
  const secondCategory = inferDesignSystemReviewCategory(second, designSystemReviewTitleFromPath(second));
  return designSystemReviewCategoryRank(firstCategory) - designSystemReviewCategoryRank(secondCategory)
    || designSystemReviewTitleFromPath(first).localeCompare(designSystemReviewTitleFromPath(second));
}

function designSystemReviewTitleFromPath(name: string): string {
  const path = normalizeDesignSystemPath(name);
  const parts = path.split('/').filter(Boolean);
  let basename = parts[parts.length - 1] ?? path;
  if (/^index\.(html?|png|jpe?g|svg|webp|avif)$/iu.test(basename) && parts.length > 1) {
    basename = parts[parts.length - 2] ?? basename;
  }
  return basename
    .replace(/\.(html?|png|jpe?g|gif|webp|avif|svg|fig|pen)$/iu, '')
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'overview';
}

function inferDesignSystemReviewCategory(name: string, title: string): DesignSystemReviewCategory {
  const text = `${normalizeDesignSystemPath(name)} ${title}`.toLowerCase();
  if (/\b(type|typography|font|text)\b/u.test(text)) return 'Type';
  if (/\b(color|colors|palette|theme)\b/u.test(text)) return 'Colors';
  if (/\b(space|spacing|radius|layout-grid)\b/u.test(text)) return 'Spacing';
  if (/\b(brand|logo|logos|mark|wordmark|icon)\b/u.test(text)) return 'Brand';
  return 'Components';
}

function designSystemReviewSubtitle(title: string, category: DesignSystemReviewCategory): string {
  const text = title.toLowerCase();
  if (text.includes('typography')) return 'Text hierarchy and styles';
  if (text.includes('font')) return 'Font family specimens';
  if (text.includes('node')) return 'Data type color coding system';
  if (text.includes('ui-palette') || text.includes('palette')) return 'Interface color palette';
  if (text.includes('dark')) return 'Dark theme color palette';
  if (text.includes('spacing') || text.includes('radius')) return 'Spacing scale and border radius tokens';
  if (text.includes('logo') || text.includes('brand')) return 'Brand logo marks';
  if (text.includes('interface') || text.includes('ui')) return 'Interface and component patterns';
  switch (category) {
    case 'Type':
      return 'Typography scale and font guidance';
    case 'Colors':
      return 'Color palette and token specimens';
    case 'Spacing':
      return 'Spacing and radius system';
    case 'Brand':
      return 'Brand assets and identity usage';
    case 'Components':
      return 'Reusable product interface examples';
  }
}

function designSystemRelatedFilesForCategory(
  artifactName: string,
  category: DesignSystemReviewCategory,
  names: string[],
): string[] {
  const related = names.filter((name) => {
    if (name === artifactName || isDesignSystemEvidenceFile(name)) return false;
    switch (category) {
      case 'Type':
      case 'Colors':
      case 'Spacing':
        return isDesignSystemTokenFile(name);
      case 'Components':
        return isDesignSystemUiKitFile(name);
      case 'Brand':
        return isDesignSystemAssetFile(name);
    }
  });
  return Array.from(new Set([artifactName, ...related])).slice(0, 12);
}

function designSystemFallbackReviewSections(names: string[]): DesignSystemProjectSection[] {
  const tokenFiles = names.filter(isDesignSystemTokenFile).slice(0, 8);
  const uiKitFiles = names.filter(isDesignSystemUiKitFile).slice(0, 8);
  const assetFiles = names.filter(isDesignSystemAssetFile).slice(0, 8);
  const sections: Array<DesignSystemProjectSection | null> = [
    tokenFiles.length > 0
      ? {
        title: 'colors-and-type',
        subtitle: 'Color, type, spacing, and token guidance',
        category: 'Colors',
        files: tokenFiles,
      }
      : null,
    uiKitFiles.length > 0
      ? {
        title: 'components',
        subtitle: 'Reusable interface examples',
        category: 'Components',
        files: uiKitFiles,
      }
      : null,
    assetFiles.length > 0
      ? {
        title: 'assets',
        subtitle: 'Brand logos, fonts, and uploaded assets',
        category: 'Brand',
        files: assetFiles,
      }
      : null,
  ];
  return sections.filter((section): section is DesignSystemProjectSection => section !== null);
}

function designSystemReviewGroups(
  reviews: DesignSystemProjectSectionReview[],
): Array<{ title: DesignSystemReviewCategory; items: DesignSystemProjectSectionReview[] }> {
  const categories: DesignSystemReviewCategory[] = ['Type', 'Colors', 'Spacing', 'Components', 'Brand'];
  return categories
    .map((title) => ({
      title,
      items: reviews.filter((review) => review.section.category === title),
    }))
    .filter((group) => group.items.length > 0);
}

function designSystemReviewCategoryRank(category: DesignSystemReviewCategory): number {
  return ['Type', 'Colors', 'Spacing', 'Components', 'Brand'].indexOf(category);
}

function designSystemReviewNeedsAttention(review: DesignSystemProjectSectionReview): boolean {
  return review.sectionStatus === 'needs-review'
    || review.sectionStatus === 'needs-work'
    || review.sectionStatus === 'updated'
    || review.sectionStatus === 'running'
    || review.sectionStatus === 'planned'
    || review.sectionStatus === 'missing';
}

function isDesignSystemEvidenceFile(name: string): boolean {
  const path = normalizeDesignSystemPath(name);
  return path.startsWith('context/') || path.includes('/context/');
}

function isDesignSystemGuidanceFile(name: string): boolean {
  const path = normalizeDesignSystemPath(name);
  if (path.includes('/')) return false;
  return DESIGN_SYSTEM_GUIDANCE_FILES.has(path);
}

function designSystemGuidanceSort(first: string, second: string): number {
  const order = ['design.md', 'readme.md', 'readme-print.md', 'skill.md'];
  const firstRank = order.indexOf(normalizeDesignSystemPath(first));
  const secondRank = order.indexOf(normalizeDesignSystemPath(second));
  return (firstRank === -1 ? order.length : firstRank)
    - (secondRank === -1 ? order.length : secondRank)
    || first.localeCompare(second);
}

function isDesignSystemTokenFile(name: string): boolean {
  const path = normalizeDesignSystemPath(name);
  if (isDesignSystemEvidenceFile(path)) return false;
  if (
    path.startsWith('preview/')
    || path.startsWith('ui_kits/')
    || path.startsWith('assets/')
    || path.startsWith('src/assets/')
    || path.startsWith('public/')
    || path.includes('/preview/')
    || path.includes('/ui_kits/')
    || path.includes('/assets/')
    || path.includes('/src/assets/')
    || DESIGN_SYSTEM_IMAGE_OR_FONT_EXTENSIONS.test(path)
  ) {
    return false;
  }
  const basename = designSystemBasename(path);
  if (basename.endsWith('.html')) return false;
  return basename === 'colors_and_type.css'
    || basename === 'tailwind.config.ts'
    || basename === 'tailwind.config.js'
    || basename === 'tailwind.config.mjs'
    || basename === 'theme.css'
    || basename === 'tokens.css'
    || basename === 'variables.css'
    || basename === 'design-tokens.json'
    || path.includes('/tokens/')
    || path.startsWith('src/tokens/')
    || path.startsWith('src/styles/')
    || path.startsWith('styles/')
    || /\b(color|colors|palette|typography|spacing|radius|theme|token)s?\b/u.test(path);
}

function isDesignSystemPreviewFile(name: string): boolean {
  const path = normalizeDesignSystemPath(name);
  if (isDesignSystemEvidenceFile(path) || path.startsWith('ui_kits/')) return false;
  const basename = designSystemBasename(path);
  return path.startsWith('preview/')
    || (path.split('/').length === 1 && basename.endsWith('.html'))
    || (basename.endsWith('.html') && /\b(index|overview|preview|showcase|styleguide)\b/u.test(path));
}

function isDesignSystemUiKitFile(name: string): boolean {
  const path = normalizeDesignSystemPath(name);
  if (isDesignSystemEvidenceFile(path)) return false;
  return path.startsWith('ui_kits/')
    || path.startsWith('src/components/')
    || path.startsWith('components/')
    || path.includes('/ui_kits/')
    || path.includes('/src/components/')
    || /\b(component|components|interface|ui-kit|uikit)\b/u.test(path);
}

function isDesignSystemAssetFile(name: string): boolean {
  const path = normalizeDesignSystemPath(name);
  if (isDesignSystemEvidenceFile(path)) return false;
  return path.startsWith('assets/')
    || path.startsWith('src/assets/')
    || path.startsWith('public/')
    || path.includes('/assets/')
    || path.includes('/src/assets/')
    || path.includes('/fonts/')
    || path.includes('/icons/')
    || path.includes('/logos/')
    || DESIGN_SYSTEM_IMAGE_OR_FONT_EXTENSIONS.test(path);
}

function designSystemGenerationReviewHasStarted(
  sectionReviews: DesignSystemProjectSectionReview[],
): boolean {
  return sectionReviews.some((review) => {
    const { previewFile, section, sectionActivity } = review;
    if (previewFile) return true;
    if (section.files.length > 0 && sectionActivity.phase !== 'idle') return true;
    return sectionActivity.phase === 'writing'
      || sectionActivity.phase === 'updated'
      || sectionActivity.phase === 'planned';
  });
}

function designSystemSectionVisibleDuringGeneration(
  review: DesignSystemProjectSectionReview,
): boolean {
  const { section, reviewEntry, sectionActivity, previewFile } = review;
  if (reviewEntry) return true;
  if (previewFile) return true;
  if (sectionActivity.phase !== 'idle') return true;
  return section.files.length > 0;
}

function designSystemSectionStatus(
  section: DesignSystemProjectSection,
  decision: DesignSystemReviewDecision | undefined,
  changedAfterFeedback: boolean,
  activity: DesignSystemSectionActivity,
): DesignSystemSectionStatus {
  if (activity.running) return 'running';
  if (activity.phase === 'planned') return 'planned';
  if (changedAfterFeedback || activity.mutated) return 'updated';
  if (section.files.length === 0) return 'missing';
  if (decision === 'looks-good') return 'approved';
  if (decision === 'needs-work') return 'needs-work';
  return 'needs-review';
}

function designSystemSectionStatusLabel(
  section: DesignSystemProjectSection,
  status: DesignSystemSectionStatus,
  activity: DesignSystemSectionActivity,
): string {
  switch (status) {
    case 'running':
      return designSystemSectionPhaseLabel(section, activity);
    case 'planned':
      return 'Queued';
    case 'updated':
      return 'Review updated files';
    case 'approved':
      return 'Looks good';
    case 'needs-work':
      return 'Needs work';
    case 'needs-review':
      return 'Needs review';
    case 'missing':
      return section.requiredFile ? `${section.requiredFile} missing` : 'No files yet';
  }
}

function designSystemSectionStatusClass(status: DesignSystemSectionStatus): string {
  switch (status) {
    case 'running':
      return 'is-running';
    case 'planned':
      return 'is-planned';
    case 'updated':
      return 'is-review';
    case 'approved':
      return 'is-approved';
    case 'needs-work':
      return 'is-work';
    case 'needs-review':
      return 'is-ready';
    case 'missing':
      return 'is-missing';
  }
}

function designSystemInitialGenerationSteps({
  files,
  sectionReviews,
  system,
}: {
  files: ProjectFile[];
  sectionReviews: DesignSystemProjectSectionReview[];
  system: DesignSystemSummary;
}): DesignSystemGenerationStep[] {
  const hasSourceContext =
    designSystemGithubEvidenceState(system, files.map((file) => file.name)).ready
    && (
      files.some((file) => normalizeDesignSystemPath(file.name).startsWith('context/')) ||
      designSystemHasSourceContext(system)
    );
  const fileNames = files.map((file) => file.name);
  const categoryHasReview = (category: DesignSystemReviewCategory) =>
    sectionReviews.some((review) => review.section.category === category);
  const categoryIsRunning = (category: DesignSystemReviewCategory) =>
    sectionReviews.some((review) => review.section.category === category && review.sectionActivity.running);
  const guidanceRunning = sectionReviews.some((review) =>
    review.sectionActivity.running
    && review.section.files.some((name) => isDesignSystemGuidanceFile(name)),
  );
  const steps: DesignSystemGenerationStep[] = [
    {
      id: 'source-context',
      title: 'Explore provided resources',
      detail: 'Company context, GitHub repositories, local code folders, Figma files, fonts, logos, and notes.',
      status: hasSourceContext ? 'succeeded' : 'running',
    },
    {
      id: 'guidance',
      title: 'Create DESIGN.md',
      detail: 'Canonical guidance used as project context.',
      status: fileNames.some(isDesignSystemGuidanceFile)
        ? 'succeeded'
        : guidanceRunning
          ? 'running'
          : 'pending',
    },
    {
      id: 'tokens',
      title: 'Create tokens',
      detail: 'Color, type, spacing, and radius evidence.',
      status: fileNames.some(isDesignSystemTokenFile)
        ? 'succeeded'
        : (categoryIsRunning('Type') || categoryIsRunning('Colors') || categoryIsRunning('Spacing'))
          ? 'running'
          : 'pending',
    },
    {
      id: 'previews',
      title: 'Create preview cards',
      detail: 'HTML review cards for the Design System tab.',
      status: sectionReviews.some((review) => review.previewFile)
        ? 'succeeded'
        : (categoryIsRunning('Type') || categoryIsRunning('Colors') || categoryIsRunning('Spacing') || categoryIsRunning('Brand'))
          ? 'running'
          : 'pending',
    },
    {
      id: 'ui-kit',
      title: 'Create UI kit',
      detail: 'Reusable interface examples.',
      status: categoryHasReview('Components') || fileNames.some(isDesignSystemUiKitFile)
        ? 'succeeded'
        : categoryIsRunning('Components')
          ? 'running'
          : 'pending',
    },
    {
      id: 'assets',
      title: 'Register assets',
      detail: 'Logos, icons, fonts, and brand files.',
      status: categoryHasReview('Brand') || fileNames.some(isDesignSystemAssetFile)
        ? 'succeeded'
        : categoryIsRunning('Brand')
          ? 'running'
          : 'pending',
    },
  ];
  if (!steps.some((step) => step.status === 'running')) {
    const firstPending = steps.find((step) => step.status === 'pending');
    if (firstPending) firstPending.status = 'running';
  }
  return steps;
}

function designSystemGenerationProgress(steps: DesignSystemGenerationStep[]): number {
  if (steps.length === 0) return 8;
  const succeeded = steps.filter((step) => step.status === 'succeeded').length;
  const running = steps.some((step) => step.status === 'running') ? 0.45 : 0;
  return Math.max(8, Math.min(92, Math.round(((succeeded + running) / steps.length) * 100)));
}

function designSystemSectionActivity(
  section: DesignSystemProjectSection,
  fileOps: FileOpEntry[],
  todos: TodoItem[],
): DesignSystemSectionActivity {
  const touched = fileOps.filter((entry) => designSystemFileOpBelongsToSection(entry, section));
  const touchedFiles = Array.from(new Set(touched.map((entry) => entry.path)));
  const todo = designSystemSectionTodo(section, todos);
  const hasRunningMutation = touched.some((entry) =>
    entry.status === 'running' && (entry.ops.includes('write') || entry.ops.includes('edit')),
  );
  const hasRunningRead = touched.some((entry) =>
    entry.status === 'running' && entry.ops.includes('read'),
  );
  const mutated = touched.some((entry) =>
    entry.status === 'done' && (entry.ops.includes('write') || entry.ops.includes('edit')),
  );
  const errored = touched.some((entry) => entry.status === 'error');
  const todoPhase = todo ? designSystemTodoActivityPhase(section, todo) : null;
  const hasRunningTodo = todo?.status === 'in_progress';
  const phase: DesignSystemSectionActivityPhase =
    errored
      ? 'error'
      : hasRunningMutation
        ? 'writing'
        : hasRunningRead
          ? 'reading'
          : hasRunningTodo && todoPhase
            ? todoPhase
            : mutated
              ? 'updated'
              : todoPhase
                ? todoPhase
                : 'idle';
  return {
    running: hasRunningMutation || hasRunningRead || hasRunningTodo,
    mutated,
    errored,
    phase,
    touchedFiles,
    todoText: todo?.content,
    todoStatus: todo?.status,
  };
}

function designSystemSectionTodo(
  section: DesignSystemProjectSection,
  todos: TodoItem[],
): TodoItem | undefined {
  return todos
    .filter((todo) => todo.status !== 'completed')
    .filter((todo) => designSystemTodoBelongsToSection(todo, section))
    .sort((first, second) => designSystemTodoRank(first) - designSystemTodoRank(second))[0];
}

function designSystemTodoRank(todo: TodoItem): number {
  if (todo.status === 'in_progress') return 0;
  if (todo.status === 'pending') return 1;
  return 2;
}

function designSystemTodoActivityPhase(
  section: DesignSystemProjectSection,
  todo: TodoItem,
): DesignSystemSectionActivityPhase {
  if (todo.status === 'pending') return 'planned';
  const text = designSystemTodoSearchText(todo);
  const isMutation = [
    'build',
    'copy',
    'create',
    'edit',
    'generate',
    'import',
    'register',
    'update',
    'write',
  ].some((keyword) => text.includes(keyword));
  if (isMutation) return 'writing';
  const isReading = [
    'analy',
    'browse',
    'explore',
    'fetch',
    'github',
    'inspect',
    'read',
    'repo',
    'search',
  ].some((keyword) => text.includes(keyword));
  if (isReading) return 'reading';
  return section.title === 'Preview' || section.title === 'UI kit' ? 'writing' : 'reading';
}

function designSystemTodoBelongsToSection(
  todo: TodoItem,
  section: DesignSystemProjectSection,
): boolean {
  const text = designSystemTodoSearchText(todo);
  if (section.files.some((name) => text.includes(designSystemReviewTitleFromPath(name)))) {
    return true;
  }
  switch (section.category) {
    case 'Type':
      return [
        'font',
        'type',
        'typography',
      ].some((keyword) => text.includes(keyword));
    case 'Colors':
      return [
        'color',
        'colors_and_type',
        'css variable',
        'palette',
        'theme',
        'token',
      ].some((keyword) => text.includes(keyword));
    case 'Spacing':
      return [
        'radius',
        'spacing',
        'space',
      ].some((keyword) => text.includes(keyword));
    case 'Components':
      return [
        'component',
        'interface',
        'prototype',
        'react',
        'ui kit',
        'ui_kit',
        'ui_kits',
      ].some((keyword) => text.includes(keyword));
    case 'Brand':
      return [
        'font',
        'icon',
        'logo',
        'brand',
        'asset',
        'upload',
      ].some((keyword) => text.includes(keyword));
  }
}

function designSystemTodoSearchText(todo: TodoItem): string {
  return `${todo.content} ${todo.activeForm ?? ''}`.toLowerCase();
}

function designSystemFileOpBelongsToSection(
  entry: FileOpEntry,
  section: DesignSystemProjectSection,
): boolean {
  const candidates = [entry.fullPath, entry.path].map(normalizeDesignSystemPath);
  const sectionFiles = [...section.files, section.requiredFile]
    .filter((name): name is string => Boolean(name))
    .map(normalizeDesignSystemPath);
  if (sectionFiles.some((name) => candidates.some((candidate) =>
    candidate === name || candidate.endsWith(`/${name}`),
  ))) {
    return true;
  }
  return candidates.some((path) => designSystemPathMatchesSection(path, section.category));
}

function designSystemPathMatchesSection(path: string, sectionTitle: string): boolean {
  const basename = designSystemBasename(path);
  switch (sectionTitle) {
    case 'Type':
      return !isDesignSystemEvidenceFile(path)
        && (isDesignSystemTokenFile(path) || DESIGN_SYSTEM_GUIDANCE_FILES.has(basename))
        && /\b(type|typography|font|text)\b/u.test(path);
    case 'Colors':
      return isDesignSystemTokenFile(path)
        && /\b(color|colors|palette|theme|token)\b/u.test(path);
    case 'Spacing':
      return isDesignSystemTokenFile(path)
        && /\b(space|spacing|radius)\b/u.test(path);
    case 'Components':
      return isDesignSystemUiKitFile(path);
    case 'Brand':
      return isDesignSystemAssetFile(path);
    default:
      return false;
  }
}

function normalizeDesignSystemPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
}

function designSystemBasename(path: string): string {
  const segments = normalizeDesignSystemPath(path).split('/').filter(Boolean);
  return segments[segments.length - 1] ?? normalizeDesignSystemPath(path);
}

function designSystemSectionPhaseLabel(
  section: DesignSystemProjectSection,
  activity: DesignSystemSectionActivity,
): string {
  if (activity.phase === 'planned') {
    switch (section.category) {
      case 'Type':
        return 'Queued typography';
      case 'Colors':
        return 'Queued tokens';
      case 'Spacing':
        return 'Queued spacing';
      case 'Components':
        return 'Queued UI kit';
      case 'Brand':
        return 'Queued assets';
    }
  }
  if (activity.phase === 'reading') {
    switch (section.category) {
      case 'Type':
        return 'Reading typography';
      case 'Colors':
        return 'Reading tokens';
      case 'Spacing':
        return 'Reading spacing';
      case 'Components':
        return 'Reading UI kit';
      case 'Brand':
        return 'Reading assets';
    }
  }
  if (activity.phase === 'writing') {
    switch (section.category) {
      case 'Type':
        return 'Writing typography';
      case 'Colors':
        return 'Writing tokens';
      case 'Spacing':
        return 'Writing spacing';
      case 'Components':
        return 'Building UI kit';
      case 'Brand':
        return 'Updating assets';
    }
  }
  if (activity.phase === 'error') return 'Needs attention';
  if (activity.phase === 'updated') return 'Updated';
  return 'Needs review';
}

function designSystemSectionActivityLabel(
  section: DesignSystemProjectSection,
  activity: DesignSystemSectionActivity,
): string {
  if (activity.touchedFiles.length === 0) {
    return activity.todoText
      ? `${designSystemSectionPhaseLabel(section, activity)} from todo: ${truncateDesignSystemActivityText(activity.todoText)}`
      : designSystemSectionPhaseLabel(section, activity);
  }
  const label = activity.touchedFiles.slice(0, 3).join(', ');
  const suffix = activity.touchedFiles.length > 3 ? ` +${activity.touchedFiles.length - 3}` : '';
  if (activity.phase === 'idle') return `Read ${label}${suffix}`;
  return `${designSystemSectionPhaseLabel(section, activity)} ${label}${suffix}`;
}

function truncateDesignSystemActivityText(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

function designSystemSectionRunningNotice(
  section: DesignSystemProjectSection,
  activity: DesignSystemSectionActivity,
): string {
  if (activity.phase === 'reading') {
    return `Open Design is reading ${section.title} context for this section.`;
  }
  return `${designSystemSectionPhaseLabel(section, activity)} now.`;
}

function designSystemReviewTimeLabel(value: string): string | null {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return `Last reviewed ${new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(time))}`;
}

function designSystemReviewAgentTaskLabel(task: DesignSystemReviewAgentTask): string {
  switch (task.status) {
    case 'queued':
      return 'Feedback saved. The agent will pick it up when the current run finishes.';
    case 'sent':
      if (!task.sentAt) return 'Sent to agent.';
      {
        const label = designSystemReviewTimeLabel(task.sentAt)?.replace('Last reviewed', '').trim();
        return label ? `Sent to agent ${label}.` : 'Sent to agent.';
      }
    case 'failed':
      return task.error ? `Agent task failed: ${task.error}` : 'Agent task failed.';
  }
  return 'Agent task status unknown.';
}

function designSystemSectionChangedAfterReview(
  names: string[],
  fileByName: Map<string, ProjectFile>,
  reviewEntry: DesignSystemReviewEntry | undefined,
): boolean {
  if (!reviewEntry || reviewEntry.decision !== 'needs-work') return false;
  const reviewedAt = Date.parse(reviewEntry.updatedAt);
  if (!Number.isFinite(reviewedAt)) return false;
  const trackedNames: string[] = reviewEntry.files && reviewEntry.files.length > 0
    ? reviewEntry.files
    : names;
  return trackedNames.some((name) => {
    const file = fileByName.get(name);
    return file ? file.mtime > reviewedAt : false;
  });
}

function DesignSystemInlinePreview({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const url = projectFileUrl(projectId, file.name);
  if (file.kind === 'html') {
    return <iframe title={file.name} src={url} sandbox="allow-scripts" />;
  }
  return <img src={`${url}?v=${Math.round(file.mtime)}`} alt={file.name} />;
}



function Tab({
  label,
  active,
  onActivate,
  onClose,
  closable = true,
  kind,
  liveArtifact,
  draggable = false,
  dragging = false,
  dragOverEdge,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  label: string;
  active: boolean;
  onActivate: () => void;
  onClose?: () => void;
  closable?: boolean;
  kind?: ProjectFile['kind'] | 'live-artifact';
  liveArtifact?: LiveArtifactWorkspaceEntry;
  draggable?: boolean;
  dragging?: boolean;
  dragOverEdge?: TabDropEdge | null;
  onDragStart?: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}) {
  const t = useT();
  const iconName = kindIconName(kind);
  return (
    <div
      className={[
        'ws-tab',
        kind === 'live-artifact' ? 'live-artifact-tab' : '',
        active ? 'active' : '',
        draggable ? 'draggable' : '',
        dragging ? 'dragging' : '',
        dragOverEdge ? `drag-over-${dragOverEdge}` : '',
      ].filter(Boolean).join(' ')}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate();
        }
      }}
      role="tab"
      aria-selected={active}
      tabIndex={0}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragOver={draggable ? onDragOver : undefined}
      onDragLeave={draggable ? onDragLeave : undefined}
      onDrop={draggable ? onDrop : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
    >
      {iconName ? (
        <span className="tab-icon" aria-hidden>
          <Icon name={iconName} size={13} />
        </span>
      ) : null}
      <span className="ws-tab-label">{label}</span>
      {liveArtifact ? (
        <LiveArtifactBadges
          compact
          className="ws-live-artifact-badges"
          status={liveArtifact.status}
          refreshStatus={liveArtifact.refreshStatus}
        />
      ) : null}
      {closable && onClose ? (
        <button
          type="button"
          className="ws-tab-close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title={t('workspace.closeTab')}
        >
          <Icon name="close" size={11} />
        </button>
      ) : null}
    </div>
  );
}

function tabDropEdgeFromEvent(event: ReactDragEvent<HTMLDivElement>): TabDropEdge {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX > rect.left + rect.width / 2 ? 'after' : 'before';
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function scrollWorkspaceTabsWithWheel(
  tabBar: Pick<HTMLDivElement, 'clientWidth' | 'scrollLeft' | 'scrollWidth'>,
  event: Pick<globalThis.WheelEvent, 'ctrlKey' | 'deltaMode' | 'deltaX' | 'deltaY' | 'preventDefault'>,
) {
  if (event.ctrlKey) return;
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  if (tabBar.scrollWidth <= tabBar.clientWidth) return;

  const before = tabBar.scrollLeft;
  tabBar.scrollLeft += wheelDeltaToPixels(event.deltaY, event.deltaMode);
  if (tabBar.scrollLeft === before) return;

  event.preventDefault();
}

function wheelDeltaToPixels(delta: number, deltaMode: number): number {
  const WHEEL_DELTA_LINE = 1;
  const WHEEL_DELTA_PAGE = 2;

  if (deltaMode === WHEEL_DELTA_LINE) return delta * 16;
  if (deltaMode === WHEEL_DELTA_PAGE) return delta * 160;
  return delta;
}

function kindIconName(
  kind?: string,
):
  | 'file-code'
  | 'image'
  | 'pencil'
  | 'file'
  | null {
  if (kind === 'live-artifact') return 'file-code';
  if (kind === 'html') return 'file-code';
  if (kind === 'image') return 'image';
  if (kind === 'sketch') return 'pencil';
  if (kind === 'code') return 'file-code';
  if (kind === 'text') return 'file';
  return 'file';
}

function isSketchName(name: string): boolean {
  return isSketchJsonFileName(name);
}

function sameFileName(a: string, b: string): boolean {
  return a === b || a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

function isLiveArtifactImplementationPath(name: string): boolean {
  if (name === '.live-artifacts') return true;
  if (!name.startsWith('.live-artifacts/')) return false;
  // Live artifacts are exposed through virtual tree nodes only. In
  // particular, keep implementation-only snapshot and tile files hidden even
  // if a generic project-files endpoint returns them in older daemon builds.
  return true;
}
