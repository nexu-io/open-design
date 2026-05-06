import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import {
  deleteProjectFile,
  fetchProjectFileText,
  uploadProjectFiles,
  writeProjectTextFile,
} from '../providers/registry';
import {
  type ChatCommentAttachment,
  liveArtifactSummaryToWorkspaceEntry,
  type LiveArtifactSummary,
  type LiveArtifactEventItem,
  type LiveArtifactWorkspaceEntry,
  type OpenTabsState,
  type PreviewComment,
  type PreviewCommentTarget,
  type ProjectFile,
} from '../types';
import { DesignFilesPanel } from './DesignFilesPanel';
import { FileViewer, LiveArtifactViewer } from './FileViewer';
import { Icon } from './Icon';
import { LiveArtifactBadges } from './LiveArtifactBadges';
import { PasteTextDialog } from './PasteTextDialog';
import { QuickSwitcher } from './QuickSwitcher';
import { SketchEditor, type SketchDocument, type SketchItem } from './SketchEditor';

interface Props {
  projectId: string;
  files: ProjectFile[];
  liveArtifacts: LiveArtifactSummary[];
  onRefreshFiles: () => Promise<void> | void;
  isDeck: boolean;
  onExportAsPptx?: ((fileName: string) => void) | undefined;
  streaming?: boolean;
  openRequest?: { name: string; nonce: number } | null;
  liveArtifactEvents?: LiveArtifactEventItem[];
  // Persisted set of open tabs + active tab. Owned by ProjectView so the
  // daemon's SQLite store can hold the source of truth and survive reloads.
  tabsState: OpenTabsState;
  onTabsStateChange: (next: OpenTabsState) => void;
  previewComments?: PreviewComment[];
  onSavePreviewComment?: (target: PreviewCommentTarget, note: string, attachAfterSave: boolean) => Promise<PreviewComment | null>;
  onRemovePreviewComment?: (commentId: string) => Promise<void>;
  onSendBoardCommentAttachments?: (attachments: ChatCommentAttachment[]) => Promise<void> | void;
  focusMode?: boolean;
  onFocusModeChange?: (next: boolean) => void;
}

interface SketchState {
  items: SketchItem[];
  dirty: boolean;
  persisted: boolean;
  loaded: boolean;
  saving: boolean;
}

const DESIGN_FILES_TAB = '__design_files__';

export function FileWorkspace({
  projectId,
  files,
  liveArtifacts,
  onRefreshFiles,
  isDeck,
  onExportAsPptx,
  streaming,
  openRequest,
  liveArtifactEvents = [],
  tabsState,
  onTabsStateChange,
  previewComments = [],
  onSavePreviewComment,
  onRemovePreviewComment,
  onSendBoardCommentAttachments,
  focusMode = false,
  onFocusModeChange,
}: Props) {
  const t = useT();
  // Persisted tabs come from the parent. Active tab can transiently point
  // at a pending sketch — pending sketches are not in tabsState.tabs.
  const persistedTabs = tabsState.tabs;
  const [activeTab, setActiveTab] = useState<string>(
    tabsState.active ?? DESIGN_FILES_TAB,
  );

  const [showPasteDialog, setShowPasteDialog] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sketches, setSketches] = useState<Record<string, SketchState>>({});
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tabsBarRef = useRef<HTMLDivElement | null>(null);

  const visibleFiles = useMemo(
    () => files.filter((file) => !isLiveArtifactImplementationPath(file.name)),
    [files],
  );

  const liveArtifactEntries = useMemo(
    () => liveArtifacts.map(liveArtifactSummaryToWorkspaceEntry),
    [liveArtifacts],
  );

  // Pull the persisted active tab in when the parent's hydration completes
  // (or on project switch). Fall back to the Design Files browser so a
  // fresh project lands in a useful place.
  useEffect(() => {
    setActiveTab(tabsState.active ?? DESIGN_FILES_TAB);
  }, [tabsState.active]);

  function setPersistedActive(name: string | null) {
    setActiveTab(name ?? DESIGN_FILES_TAB);
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
    if (activeTab === DESIGN_FILES_TAB) return;
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
    onTabsStateChange({
      tabs: persistedTabs.includes(name) ? persistedTabs : [...persistedTabs, name],
      active: name,
    });
    setActiveTab(name);
  }

  function closeTab(name: string) {
    const isPending = sketches[name] && !sketches[name]!.persisted;
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

  async function handleFilePicked(ev: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(ev.target.files ?? []);
    ev.target.value = '';
    await uploadFiles(picked);
  }

  async function uploadFiles(picked: File[]) {
    if (picked.length === 0) return;

    setUploadError(null);
    const result = await uploadProjectFiles(projectId, picked);
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

  // Cmd+P (mac) / Ctrl+P (win/linux) opens the file palette. Capture phase
  // so we beat the browser's default print dialog. Platform-gated so on
  // macOS we don't steal Ctrl+P from native readline ("previous line") in
  // text fields, and on win/linux we don't steal Cmd+P (rare but possible
  // on remapped keyboards).
  useEffect(() => {
    const isMac =
      typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const onKeyDown = (e: KeyboardEvent) => {
      const primary = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
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

  function startNewSketch() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = `sketch-${stamp}.sketch.json`;
    setSketches((curr) => ({
      ...curr,
      [name]: { items: [], dirty: false, persisted: false, loaded: true, saving: false },
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
      const items = parseSketchDocument(text);
      setSketches((curr) => ({
        ...curr,
        [activeTab]: {
          items,
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
        ...(curr[name] ?? { persisted: false, loaded: true, saving: false }),
        items,
        dirty: true,
      } as SketchState,
    }));
  }

  async function saveSketch(name: string) {
    const entry = sketches[name];
    if (!entry) return;
    setSketches((curr) => ({ ...curr, [name]: { ...curr[name]!, saving: true } }));
    const doc: SketchDocument = { version: 1, items: entry.items };
    const file = await writeProjectTextFile(projectId, name, JSON.stringify(doc, null, 2));
    if (file) {
      setSketches((curr) => ({
        ...curr,
        [name]: { ...curr[name]!, dirty: false, persisted: true, saving: false },
      }));
      // Promote the previously-pending sketch into the persisted tab list.
      onTabsStateChange({
        tabs: persistedTabs.includes(name) ? persistedTabs : [...persistedTabs, name],
        active: name,
      });
      setActiveTab(name);
      await onRefreshFiles();
    } else {
      setSketches((curr) => ({ ...curr, [name]: { ...curr[name]!, saving: false } }));
    }
  }

  const activeFile = useMemo<ProjectFile | null>(() => {
    if (activeTab === DESIGN_FILES_TAB) return null;
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
    if (activeTab === DESIGN_FILES_TAB) return null;
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
    <div className="workspace" data-testid="file-workspace">
      <div className="ws-tabs-shell">
        <div
          ref={tabsBarRef}
          className="ws-tabs-bar"
          role="tablist"
          aria-label={t('workspace.designFiles')}
        >
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
              />
            );
          })}
        </div>
        {onFocusModeChange ? (
          <div className="ws-tabs-actions">
            <button
              type="button"
              className="ws-focus-toggle"
              data-testid="workspace-focus-toggle"
              aria-pressed={focusMode}
              title={focusMode ? t('workspace.showChat') : t('workspace.focusMode')}
              onClick={() => onFocusModeChange(!focusMode)}
            >
              <Icon name={focusMode ? 'comment' : 'zoom-in'} size={13} />
              <span>{focusMode ? t('workspace.showChat') : t('workspace.focusMode')}</span>
            </button>
          </div>
        ) : null}
      </div>
      <div className="ws-body">
        {uploadError ? <div className="viewer-empty">{uploadError}</div> : null}
        {activeTab === DESIGN_FILES_TAB ? (
          <DesignFilesPanel
            key={projectId}
            projectId={projectId}
            files={visibleFiles}
            liveArtifacts={liveArtifactEntries}
            onRefreshFiles={onRefreshFiles}
            onOpenFile={openFile}
            onOpenLiveArtifact={(tabId) => openFile(tabId)}
            onDeleteFile={(name) => void handleDelete(name)}
            onUpload={() => fileInputRef.current?.click()}
            onUploadFiles={(picked) => void uploadFiles(picked)}
            onPaste={() => setShowPasteDialog(true)}
            onNewSketch={startNewSketch}
          />
        ) : isActiveSketch && activeSketch && activeFile ? (
          activeSketch.loaded ? (
            <SketchEditor
              fileName={activeFile.name}
              items={activeSketch.items}
              onItemsChange={(items) => setSketchItems(activeFile.name, items)}
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
            file={activeFile}
            isDeck={isDeck}
            onExportAsPptx={onExportAsPptx}
            streaming={streaming}
            previewComments={previewComments.filter((comment) => comment.filePath === activeFile.name)}
            onSavePreviewComment={onSavePreviewComment}
            onRemovePreviewComment={onRemovePreviewComment}
            onSendBoardCommentAttachments={onSendBoardCommentAttachments}
            onFileSaved={onRefreshFiles}
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

function Tab({
  label,
  active,
  onActivate,
  onClose,
  closable = true,
  kind,
  liveArtifact,
}: {
  label: string;
  active: boolean;
  onActivate: () => void;
  onClose?: () => void;
  closable?: boolean;
  kind?: ProjectFile['kind'] | 'live-artifact';
  liveArtifact?: LiveArtifactWorkspaceEntry;
}) {
  const t = useT();
  const iconName = kindIconName(kind);
  return (
    <div
      className={`ws-tab ${active ? 'active' : ''}`}
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
  return name.endsWith('.sketch.json');
}

function isLiveArtifactImplementationPath(name: string): boolean {
  if (name === '.live-artifacts') return true;
  if (!name.startsWith('.live-artifacts/')) return false;
  // Live artifacts are exposed through virtual tree nodes only. In
  // particular, keep implementation-only snapshot and tile files hidden even
  // if a generic project-files endpoint returns them in older daemon builds.
  return true;
}

function parseSketchDocument(text: string | null): SketchItem[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as SketchDocument | { items?: SketchItem[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}
