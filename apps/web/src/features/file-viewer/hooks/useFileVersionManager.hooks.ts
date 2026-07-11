// Feature-local hook for the file-version-history modal: loads a file's
// version list, caches fetched version content, drives the srcDoc preview,
// and owns the restore flow + its click->result analytics. Mirrors
// `MemorySection.tsx`'s `useEntries` shape — one hook owning a whole modal's
// state, with the deps-bag pattern for cross-cutting inputs (t, locale,
// analytics, onClose/onRestored) supplied by the wired wrapper.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { ProjectFileVersion } from '@open-design/contracts';
import {
  anonymizeArtifactId,
  artifactKindToTracking,
  type TrackingFileVersionSource,
  type TrackingProjectKind,
} from '@open-design/contracts/analytics';
import {
  trackFileVersionModalClick,
  trackFileVersionModalSurfaceView,
  trackFileVersionRestoreResult,
} from '../../../analytics/events';
import { openSandboxedPreviewInNewTab } from '../../../runtime/exports';
import { buildSrcdoc } from '../../../runtime/srcdoc';
import type { ProjectFile } from '../../../types';
import type { Locale } from '../../../i18n/types';
import {
  dismissPort as realDismissPort,
  elementSizePort as realElementSizePort,
  fileVersionsPort as realFileVersionsPort,
  portalPort as realPortalPort,
  shareLinkClipboardPort as realShareLinkClipboardPort,
} from '../dependencies';
import type { DismissPort, ElementSizePort, FileVersionsPort, PortalPort, ShareLinkClipboardPort } from '../ports';
import { fileVersionPreviewOptions, fileVersionSourceToTracking } from '../rules';
import { formatVersionDateTime } from '../formatters';
import type { FileVersionManagerAnalytics, PreviewCanvasSize, PreviewViewportId, TranslateFn } from '../types';
import { usePreviewCanvasSize } from './usePreviewCanvasSize.hooks';

export interface FileVersionManagerDeps {
  projectId: string;
  projectKind: TrackingProjectKind | null;
  file: ProjectFile;
  currentSource: string | null;
  entryFrom: 'toolbar' | 'more_menu';
  t: TranslateFn;
  locale: Locale;
  analytics: FileVersionManagerAnalytics;
  onClose: () => void;
  onRestored: (content: string, version: ProjectFileVersion) => Promise<void> | void;
}

export interface FileVersionManagerController {
  versions: ProjectFileVersion[];
  versionCountLabel: string;
  showSearch: boolean;
  search: string;
  setSearch: (value: string) => void;
  visibleVersions: ProjectFileVersion[];
  versionById: Map<string, ProjectFileVersion>;
  loading: boolean;
  onSelectVersion: (version: ProjectFileVersion) => void;
  onPrefetchVersion: (versionId: string) => void;

  selectedVersion: ProjectFileVersion | null;
  selectedDate: string;
  selectedRestoredFrom: ProjectFileVersion | null;
  promptWrapRef: MutableRefObject<HTMLDivElement | null>;
  promptOpen: boolean;
  promptPopoverId: string;
  onTogglePrompt: () => void;
  selectedPrompt: string;
  copied: boolean;
  onCopyPrompt: () => void;
  restoreWrapRef: MutableRefObject<HTMLDivElement | null>;
  confirmRestore: boolean;
  restorePopoverId: string;
  restoreDisabled: boolean;
  restoring: boolean;
  onToggleRestoreConfirm: () => void;
  onCancelRestore: () => void;
  onConfirmRestore: () => void;
  previewViewport: PreviewViewportId;
  onViewportChange: (viewport: PreviewViewportId) => void;
  onOpenInNewTab: () => void;
  loadingContent: boolean;
  selectedContentMatchesVersion: boolean;

  previewFrameRef: MutableRefObject<HTMLDivElement | null>;
  previewFrameSize: PreviewCanvasSize | undefined;
  error: string | null;
  srcDoc: string;
  isDeckPreview: boolean;
  frameReady: boolean;
  onFrameLoad: () => void;

  /** The DOM node to portal the modal into, or `null` before/without a DOM. */
  portalRoot: HTMLElement | null;
}

export function useFileVersionManager(
  port: FileVersionsPort,
  dismissPort: DismissPort,
  elementSizePort: ElementSizePort,
  portalPort: PortalPort,
  clipboardPort: ShareLinkClipboardPort,
  deps: FileVersionManagerDeps,
): FileVersionManagerController {
  const { projectId, projectKind, file, currentSource, entryFrom, t, locale, analytics, onClose, onRestored } = deps;
  const tRef = useRef(t);

  const [versions, setVersions] = useState<ProjectFileVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedContent, setSelectedContent] = useState<string | null>(currentSource);
  const [selectedContentVersionId, setSelectedContentVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [previewViewport, setPreviewViewport] = useState<PreviewViewportId>('desktop');
  const [search, setSearch] = useState('');
  const [promptOpen, setPromptOpen] = useState(false);
  const promptWrapRef = useRef<HTMLDivElement | null>(null);
  const promptPopoverId = useId();
  const [confirmRestore, setConfirmRestore] = useState(false);
  const restoreWrapRef = useRef<HTMLDivElement | null>(null);
  const restorePopoverId = useId();
  const [previewFrameRef, previewFrameSize] = usePreviewCanvasSize<HTMLDivElement>(elementSizePort);
  // Track which srcDoc the iframe has finished rendering. Deriving readiness by
  // comparing to the current srcDoc during render (rather than toggling a bool
  // in a post-paint effect) keeps the overlay up across a switch with no
  // one-frame flicker while the new document reparses.
  const [loadedSrcDoc, setLoadedSrcDoc] = useState<string | null>(null);
  // Client-side cache of fetched version HTML keyed by version id. Revisiting a
  // version is then zero-fetch (and, because the srcDoc string value is stable,
  // zero-reparse). `inFlightRef` dedupes concurrent hover-prefetch + click.
  const contentCacheRef = useRef<Map<string, string>>(new Map());
  const inFlightRef = useRef<Map<string, Promise<void>>>(new Map());

  const trackingArtifactId = useMemo(
    () => anonymizeArtifactId({ projectId, fileName: file.name }),
    [projectId, file.name],
  );
  const trackingArtifactKind = artifactKindToTracking({ fileKind: file.kind ?? null });
  const fireModalClick = (
    element:
      | 'version_item'
      | 'viewport_toggle'
      | 'prompt_toggle'
      | 'copy_prompt'
      | 'open_in_new_tab'
      | 'restore'
      | 'restore_confirm'
      | 'restore_cancel',
    extra?: {
      version_source?: TrackingFileVersionSource;
      version_is_current?: boolean;
      viewport?: PreviewViewportId;
    },
  ) => {
    trackFileVersionModalClick(analytics.track, {
      page_name: 'artifact',
      area: 'file_version_modal',
      element,
      artifact_id: trackingArtifactId,
      artifact_kind: trackingArtifactKind,
      version_count: versions.length,
      ...extra,
    });
  };
  // One impression per modal open. The component unmounts on close, so a
  // fire-once ref is enough — no dependency bookkeeping needed.
  const surfaceViewFiredRef = useRef(false);
  useEffect(() => {
    if (surfaceViewFiredRef.current) return;
    surfaceViewFiredRef.current = true;
    trackFileVersionModalSurfaceView(analytics.track, {
      page_name: 'artifact',
      area: 'file_version_modal',
      entry_from: entryFrom,
      artifact_id: trackingArtifactId,
      artifact_kind: trackingArtifactKind,
    });
  }, [analytics.track, entryFrom, trackingArtifactId, trackingArtifactKind]);

  const versionById = useMemo(() => {
    const map = new Map<string, ProjectFileVersion>();
    for (const version of versions) map.set(version.id, version);
    return map;
  }, [versions]);
  const selectedVersion =
    (selectedId ? versionById.get(selectedId) : undefined) ??
    versions.find((version) => version.current) ??
    versions[0] ??
    null;
  const versionCountLabel = versions.length === 1
    ? t('fileViewer.versions.countOne')
    : t('fileViewer.versions.countMany', { count: versions.length });
  // Show the filter box only once the list is long enough to need it.
  const showSearch = versions.length > 3;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleVersions = useMemo(() => {
    if (!showSearch || !normalizedSearch) return versions;
    return versions.filter((version) => {
      const restoredFrom = version.restoreFromVersionId
        ? versionById.get(version.restoreFromVersionId)
        : null;
      const haystack = [
        `v${version.version}`,
        `version ${version.version}`,
        version.prompt ?? '',
        version.label ?? '',
        version.source === 'manual'
          ? t('fileViewer.versions.sourceManual')
          : version.source === 'restore'
            ? t('fileViewer.versions.sourceRestore')
            : t('fileViewer.versions.sourceAi'),
        formatVersionDateTime(version.createdAt, locale),
        restoredFrom ? `v${restoredFrom.version}` : '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [showSearch, normalizedSearch, versions, versionById, t, locale]);
  // Decks are 16:9; the desktop preview centers them in an aspect box (see the
  // `.preview-viewport-deck` CSS) instead of letting the slide bottom-anchor in
  // a taller pane. Cheap source sniff, memoized on the selected content.
  const isDeckPreview = useMemo(
    () =>
      Boolean(
        selectedContent && fileVersionPreviewOptions(projectId, file.name, selectedContent).deck,
      ),
    [selectedContent, projectId, file.name],
  );
  const selectedPrompt = selectedVersion?.prompt?.trim() ?? '';
  const selectedDate = selectedVersion ? formatVersionDateTime(selectedVersion.createdAt, locale) : file.name;
  const selectedRestoredFrom = selectedVersion?.restoreFromVersionId
    ? versionById.get(selectedVersion.restoreFromVersionId) ?? null
    : null;
  const selectedContentMatchesVersion = Boolean(selectedId && selectedContentVersionId === selectedId && selectedContent);
  const restoreDisabled =
    !selectedVersion || selectedVersion.current || restoring || loadingContent || !selectedContentMatchesVersion;
  const srcDoc = useMemo(() => {
    if (!selectedContent) return '';
    const previewOptions = fileVersionPreviewOptions(projectId, file.name, selectedContent);
    return buildSrcdoc(selectedContent, {
      ...previewOptions,
      previewFocusGuard: true,
    });
  }, [file.name, projectId, selectedContent]);
  const frameReady = loadedSrcDoc === srcDoc;

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // Fetch a single version's HTML into the cache exactly once. Reused by the
  // selection effect and by hover/focus prefetch so a click lands on warm data.
  const primeVersionContent = useCallback((versionId: string): Promise<void> => {
    if (contentCacheRef.current.has(versionId)) return Promise.resolve();
    const pending = inFlightRef.current.get(versionId);
    if (pending) return pending;
    const request = port.fetchProjectFileVersion(projectId, file.name, versionId)
      .then((result) => {
        if (result) contentCacheRef.current.set(versionId, result.content);
      })
      .catch(() => {})
      .finally(() => {
        inFlightRef.current.delete(versionId);
      });
    inFlightRef.current.set(versionId, request);
    return request;
  }, [port, file.name, projectId]);

  const loadVersions = useCallback(async (preferredId?: string | null) => {
    setLoading(true);
    setError(null);
    const result = await port.fetchProjectFileVersions(projectId, file.name);
    if (!result) {
      setError(tRef.current('fileViewer.versions.loadFailed'));
      setLoading(false);
      return;
    }
    const nextVersions = [...result.versions].sort((a, b) => b.version - a.version);
    setVersions(nextVersions);
    // Seed the cache with the live document so opening the modal renders the
    // current version instantly — no round-trip for the version you're on.
    const currentVersion = nextVersions.find((version) => version.current);
    if (currentVersion && currentSource != null && !contentCacheRef.current.has(currentVersion.id)) {
      contentCacheRef.current.set(currentVersion.id, currentSource);
    }
    const nextSelected =
      (preferredId ? nextVersions.find((version) => version.id === preferredId) : null) ??
      currentVersion ??
      nextVersions[0] ??
      null;
    setSelectedId(nextSelected?.id ?? null);
    setLoading(false);
  }, [port, currentSource, file.name, projectId]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  useEffect(() => {
    setCopied(false);
    setConfirmRestore(false);
    setPromptOpen(false);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedContent(null);
      setSelectedContentVersionId(null);
      return;
    }
    // Cache hit: swap instantly with no fetch, no flash.
    const cached = contentCacheRef.current.get(selectedId);
    if (cached !== undefined) {
      setSelectedContent(cached);
      setSelectedContentVersionId(selectedId);
      setLoadingContent(false);
      setError(null);
      return;
    }
    // Cache miss: keep the previous preview mounted under the loading overlay
    // (do NOT clear selectedContent) so switching never blanks to white.
    let cancelled = false;
    setLoadingContent(true);
    setError(null);
    void primeVersionContent(selectedId).then(() => {
      if (cancelled) return;
      const next = contentCacheRef.current.get(selectedId);
      if (next === undefined) {
        setSelectedContent(null);
        setSelectedContentVersionId(null);
        setError(tRef.current('fileViewer.versions.previewFailed'));
      } else {
        setSelectedContent(next);
        setSelectedContentVersionId(selectedId);
      }
      setLoadingContent(false);
    });
    return () => {
      cancelled = true;
    };
  }, [primeVersionContent, selectedId]);

  // Safety net: if the iframe's load event is ever missed, clear the overlay
  // after a grace period so it can't get stuck over a rendered document.
  useEffect(() => {
    if (!srcDoc || loadedSrcDoc === srcDoc) return;
    const fallback = setTimeout(() => setLoadedSrcDoc(srcDoc), 6000);
    return () => clearTimeout(fallback);
  }, [srcDoc, loadedSrcDoc]);

  useEffect(() => {
    return dismissPort.subscribeEscapeKey(() => {
      if (confirmRestore) {
        setConfirmRestore(false);
        return;
      }
      if (promptOpen) {
        setPromptOpen(false);
        return;
      }
      onClose();
    });
  }, [dismissPort, onClose, promptOpen, confirmRestore]);

  useEffect(() => {
    if (!promptOpen) return undefined;
    return dismissPort.subscribeOutsidePointerDown(
      () => promptWrapRef.current,
      () => setPromptOpen(false),
    );
  }, [dismissPort, promptOpen]);

  useEffect(() => {
    if (!confirmRestore) return undefined;
    return dismissPort.subscribeOutsidePointerDown(
      () => restoreWrapRef.current,
      () => setConfirmRestore(false),
    );
  }, [dismissPort, confirmRestore]);

  const onCopyPrompt = async () => {
    if (!selectedPrompt) return;
    fireModalClick('copy_prompt', {
      ...(selectedVersion ? { version_source: fileVersionSourceToTracking(selectedVersion) } : {}),
    });
    const ok = await clipboardPort.copyToClipboard(selectedPrompt);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const onOpenInNewTab = () => {
    if (loadingContent || !selectedContentMatchesVersion || !selectedContent || !selectedVersion) return;
    fireModalClick('open_in_new_tab', {
      version_source: fileVersionSourceToTracking(selectedVersion),
    });
    openSandboxedPreviewInNewTab(
      selectedContent,
      `${file.name} · v${selectedVersion.version}`,
      fileVersionPreviewOptions(projectId, file.name, selectedContent),
    );
  };

  const restoreVersion = async () => {
    if (restoreDisabled || !selectedVersion || !selectedContentMatchesVersion || !selectedContent) return;
    setRestoring(true);
    setError(null);
    let closingAfterRestore = false;
    const restoreStarted = performance.now();
    // `versions` is sorted newest-first, so the index is "how many versions
    // back from the newest" the restore target sits.
    const fireRestoreResult = (result: 'success' | 'failed', errorCode?: string) => {
      trackFileVersionRestoreResult(analytics.track, {
        page_name: 'artifact',
        area: 'file_version_modal',
        artifact_id: trackingArtifactId,
        artifact_kind: trackingArtifactKind,
        project_id: projectId,
        project_kind: projectKind,
        version_source: fileVersionSourceToTracking(selectedVersion),
        version_gap: Math.max(0, versions.findIndex((version) => version.id === selectedVersion.id)),
        version_count: versions.length,
        result,
        ...(errorCode ? { error_code: errorCode } : {}),
        restore_duration_ms: Math.round(performance.now() - restoreStarted),
      });
    };
    try {
      const result = await port.restoreProjectFileVersion(projectId, file.name, selectedVersion);
      if (!result) {
        fireRestoreResult('failed', 'restore_request_failed');
        setError(t('fileViewer.versions.restoreFailed'));
        return;
      }
      fireRestoreResult('success', result.versionWarning?.code);
      const restoredVersion = result.version ?? selectedVersion;
      await onRestored(selectedContent, restoredVersion);
      if (result.versionWarning) {
        await loadVersions(result.version?.id ?? selectedVersion.id);
        setError(result.versionWarning.message);
        return;
      }
      closingAfterRestore = true;
      onClose();
    } finally {
      if (!closingAfterRestore) setRestoring(false);
    }
  };

  return {
    versions,
    versionCountLabel,
    showSearch,
    search,
    setSearch,
    visibleVersions,
    versionById,
    loading,
    onSelectVersion: (version) => {
      if (version.id !== selectedVersion?.id) {
        fireModalClick('version_item', {
          version_source: fileVersionSourceToTracking(version),
          version_is_current: Boolean(version.current),
        });
      }
      setSelectedId(version.id);
    },
    onPrefetchVersion: (versionId) => {
      void primeVersionContent(versionId);
    },

    selectedVersion,
    selectedDate,
    selectedRestoredFrom,
    promptWrapRef,
    promptOpen,
    promptPopoverId,
    onTogglePrompt: () => {
      if (!promptOpen) {
        fireModalClick('prompt_toggle', {
          ...(selectedVersion ? { version_source: fileVersionSourceToTracking(selectedVersion) } : {}),
        });
      }
      setPromptOpen((value) => !value);
    },
    selectedPrompt,
    copied,
    onCopyPrompt,
    restoreWrapRef,
    confirmRestore,
    restorePopoverId,
    restoreDisabled,
    restoring,
    onToggleRestoreConfirm: () => {
      if (!confirmRestore && selectedVersion) {
        fireModalClick('restore', {
          version_source: fileVersionSourceToTracking(selectedVersion),
        });
      }
      setConfirmRestore((value) => !value);
    },
    onCancelRestore: () => {
      if (selectedVersion) {
        fireModalClick('restore_cancel', {
          version_source: fileVersionSourceToTracking(selectedVersion),
        });
      }
      setConfirmRestore(false);
    },
    onConfirmRestore: () => {
      if (selectedVersion) {
        fireModalClick('restore_confirm', {
          version_source: fileVersionSourceToTracking(selectedVersion),
        });
      }
      setConfirmRestore(false);
      void restoreVersion();
    },
    previewViewport,
    onViewportChange: (viewport) => {
      if (viewport !== previewViewport) {
        fireModalClick('viewport_toggle', { viewport });
      }
      setPreviewViewport(viewport);
    },
    onOpenInNewTab,
    loadingContent,
    selectedContentMatchesVersion,

    previewFrameRef,
    previewFrameSize,
    error,
    srcDoc,
    isDeckPreview,
    frameReady,
    onFrameLoad: () => setLoadedSrcDoc(srcDoc),
    portalRoot: portalPort.getPortalRoot(),
  };
}

export function useWiredFileVersionManager(deps: FileVersionManagerDeps): FileVersionManagerController {
  return useFileVersionManager(
    realFileVersionsPort,
    realDismissPort,
    realElementSizePort,
    realPortalPort,
    realShareLinkClipboardPort,
    deps,
  );
}
