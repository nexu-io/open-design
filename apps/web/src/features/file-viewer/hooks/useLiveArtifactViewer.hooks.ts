// Feature-local hook for the live-artifact viewer: owns the preview/code/data/
// refresh-history tab state, the present/zoom menus, the chrome-actions portal
// host, and the refresh action's session-local event log + toast feedback.
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type {
  LiveArtifact,
  LiveArtifactEventItem,
  LiveArtifactRefreshLogEntry,
  LiveArtifactWorkspaceEntry,
} from '../../../types';
import { trackIframeLoad } from '../../../observability/iframe-error';
import {
  chromeActionsHostPort as realChromeActionsHostPort,
  dismissPort as realDismissPort,
  elementSizePort as realElementSizePort,
  liveArtifactPort as realLiveArtifactPort,
  windowOpenPort as realWindowOpenPort,
} from '../dependencies';
import { getCachedPreviewViewport, setCachedPreviewViewport } from '../viewport-cache';
import { appendRefreshEvent, liveArtifactPreviewUrl, liveArtifactViewerTabs, refreshErrorMessage } from '../rules';
import { usePreviewCanvasSize } from './usePreviewCanvasSize.hooks';
import type { ChromeActionsHostPort, DismissPort, ElementSizePort, LiveArtifactPort, WindowOpenPort } from '../ports';
import type { LiveArtifactRefreshEvent, PreviewCanvasSize, PreviewViewportId, TranslateFn } from '../types';

export interface LiveArtifactViewerDeps {
  projectId: string;
  liveArtifact: LiveArtifactWorkspaceEntry;
  liveArtifactEvents: LiveArtifactEventItem[];
  onRefreshArtifacts?: () => Promise<void> | void;
  t: TranslateFn;
}

export interface LiveArtifactViewerController {
  tabs: Array<{ id: 'preview' | 'code' | 'data' | 'refresh-history'; label: string }>;
  mode: 'preview' | 'code' | 'data' | 'refresh-history';
  setMode: (mode: 'preview' | 'code' | 'data' | 'refresh-history') => void;
  detail: LiveArtifact | null;
  loading: boolean;
  previewUrlReloadKey: number;
  zoom: number;
  setZoom: (zoom: number) => void;
  previewViewport: PreviewViewportId;
  setPreviewViewport: (viewport: PreviewViewportId) => void;
  iframeRef: MutableRefObject<HTMLIFrameElement | null>;
  refreshing: boolean;
  refreshError: string | null;
  refreshSuccess: string | null;
  dismissRefreshSuccess: () => void;
  refreshEvents: LiveArtifactRefreshEvent[];
  refreshHistory: LiveArtifactRefreshLogEntry[];
  isRunning: boolean;
  handleRefresh: () => Promise<void>;
  reloadPreview: () => void;
  presentMenuOpen: boolean;
  setPresentMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  presentWrapRef: MutableRefObject<HTMLDivElement | null>;
  presentInThisTab: () => void;
  presentFullscreen: () => void;
  presentNewTab: () => void;
  inTabPresent: boolean;
  exitInTabPresent: () => void;
  zoomMenuOpen: boolean;
  setZoomMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  zoomMenuRef: MutableRefObject<HTMLDivElement | null>;
  chromeActionsHost: HTMLElement | null;
  previewBodyRef: MutableRefObject<HTMLDivElement | null>;
  previewBodySize: PreviewCanvasSize | undefined;
}

export function useLiveArtifactViewer(
  liveArtifactPort: LiveArtifactPort,
  dismissPort: DismissPort,
  chromeActionsHostPort: ChromeActionsHostPort,
  elementSizePort: ElementSizePort,
  windowOpenPort: WindowOpenPort,
  deps: LiveArtifactViewerDeps,
): LiveArtifactViewerController {
  const { projectId, liveArtifact, liveArtifactEvents, onRefreshArtifacts, t } = deps;
  const tRef = useRef(t);
  tRef.current = t;

  const tabs = useMemo(() => liveArtifactViewerTabs(tRef.current), [liveArtifact.artifactId]);
  const [mode, setMode] = useState<'preview' | 'code' | 'data' | 'refresh-history'>('preview');
  const [detail, setDetail] = useState<LiveArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewUrlReloadKey, setPreviewUrlReloadKey] = useState(0);
  const [zoom, setZoom] = useState(100);
  const liveArtifactViewportKey = `${projectId}:live-artifact:${liveArtifact.artifactId}`;
  const [previewViewport, setPreviewViewportState] = useState<PreviewViewportId>(
    () => getCachedPreviewViewport(liveArtifactViewportKey) ?? 'desktop',
  );
  const setPreviewViewport = useCallback((viewport: PreviewViewportId) => {
    setCachedPreviewViewport(liveArtifactViewportKey, viewport);
    setPreviewViewportState(viewport);
  }, [liveArtifactViewportKey]);
  const [previewBodyRef, previewBodySize] = usePreviewCanvasSize<HTMLDivElement>(elementSizePort);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshSuccess, setRefreshSuccess] = useState<string | null>(null);
  const [refreshEvents, setRefreshEvents] = useState<LiveArtifactRefreshEvent[]>([]);
  const [refreshHistory, setRefreshHistory] = useState<LiveArtifactRefreshLogEntry[]>([]);
  const refreshEventSequenceRef = useRef(0);
  const nextRefreshEvent = useCallback(
    (next: Omit<LiveArtifactRefreshEvent, 'id' | 'at' | 'durationMs'>) => {
      refreshEventSequenceRef.current += 1;
      setRefreshEvents((prev) => appendRefreshEvent(prev, next, refreshEventSequenceRef.current, Date.now()));
    },
    [],
  );
  const [presentMenuOpen, setPresentMenuOpen] = useState(false);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const zoomMenuRef = useRef<HTMLDivElement | null>(null);
  const [inTabPresent, setInTabPresent] = useState(false);
  const presentWrapRef = useRef<HTMLDivElement | null>(null);
  const [chromeActionsHost, setChromeActionsHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setChromeActionsHost(chromeActionsHostPort.getChromeActionsHost());
  }, [chromeActionsHostPort]);

  useEffect(() => {
    if (!presentMenuOpen) return undefined;
    return dismissPort.subscribeOutsideDismiss(() => presentWrapRef.current, () => setPresentMenuOpen(false));
  }, [dismissPort, presentMenuOpen]);

  useEffect(() => {
    setRefreshError(null);
    setRefreshSuccess(null);
    setRefreshEvents([]);
  }, [projectId, liveArtifact.artifactId]);

  useEffect(() => {
    setPreviewViewportState(getCachedPreviewViewport(liveArtifactViewportKey) ?? 'desktop');
  }, [liveArtifactViewportKey]);

  useEffect(() => {
    if (!refreshSuccess) return undefined;
    const timeout = setTimeout(() => setRefreshSuccess(null), 6000);
    return () => clearTimeout(timeout);
  }, [refreshSuccess]);

  const processedLiveArtifactEventIdRef = useRef(0);

  useEffect(() => {
    const pendingEvents = liveArtifactEvents.filter((item) => item.id > processedLiveArtifactEventIdRef.current);
    if (pendingEvents.length === 0) return;
    processedLiveArtifactEventIdRef.current = pendingEvents[pendingEvents.length - 1]?.id ?? processedLiveArtifactEventIdRef.current;

    for (const { event: liveArtifactEvent } of pendingEvents) {
      if (
        (liveArtifactEvent.kind !== 'live_artifact' && liveArtifactEvent.kind !== 'live_artifact_refresh') ||
        liveArtifactEvent.projectId !== projectId ||
        liveArtifactEvent.artifactId !== liveArtifact.artifactId
      ) {
        continue;
      }

      if (liveArtifactEvent.kind === 'live_artifact') {
        setRefreshError(null);
        if (liveArtifactEvent.action === 'deleted') {
          setRefreshSuccess(`Live artifact deleted: ${liveArtifactEvent.title}`);
          continue;
        }
        setRefreshSuccess(
          liveArtifactEvent.action === 'created'
            ? `Live artifact created: ${liveArtifactEvent.title}`
            : `Live artifact updated: ${liveArtifactEvent.title}`,
        );
        void liveArtifactPort.fetchLiveArtifact(projectId, liveArtifact.artifactId).then((next) => {
          if (next) setDetail(next);
        });
        void liveArtifactPort.fetchLiveArtifactRefreshes(projectId, liveArtifact.artifactId).then(setRefreshHistory);
        setPreviewUrlReloadKey((n) => n + 1);
        continue;
      }

      if (liveArtifactEvent.phase === 'started') {
        setRefreshing(true);
        setRefreshError(null);
        setRefreshSuccess(null);
        nextRefreshEvent({ phase: 'started' });
        continue;
      }

      if (liveArtifactEvent.phase === 'failed') {
        setRefreshing(false);
        setRefreshError(liveArtifactEvent.error ?? tRef.current('liveArtifact.refresh.genericFailure'));
        nextRefreshEvent({ phase: 'failed', error: liveArtifactEvent.error ?? undefined });
        void liveArtifactPort.fetchLiveArtifact(projectId, liveArtifact.artifactId).then((next) => {
          if (next) setDetail(next);
        });
        void liveArtifactPort.fetchLiveArtifactRefreshes(projectId, liveArtifact.artifactId).then(setRefreshHistory);
        continue;
      }

      setRefreshing(false);
      setRefreshError(null);
      nextRefreshEvent({
        phase: 'succeeded',
        refreshedSourceCount: liveArtifactEvent.refreshedSourceCount ?? 0,
      });
      if ((liveArtifactEvent.refreshedSourceCount ?? 0) > 0) {
        setRefreshSuccess(tRef.current('liveArtifact.refresh.successOne'));
      } else {
        setRefreshError(tRef.current('liveArtifact.refresh.noSourceTitle'));
      }
      void liveArtifactPort.fetchLiveArtifact(projectId, liveArtifact.artifactId).then((next) => {
        if (next) setDetail(next);
      });
      void liveArtifactPort.fetchLiveArtifactRefreshes(projectId, liveArtifact.artifactId).then(setRefreshHistory);
      setPreviewUrlReloadKey((n) => n + 1);
    }
  }, [liveArtifactEvents, liveArtifact.artifactId, projectId, liveArtifactPort, nextRefreshEvent]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    void liveArtifactPort.fetchLiveArtifact(projectId, liveArtifact.artifactId).then((next) => {
      if (cancelled) return;
      setDetail(next);
      setLoading(false);
    });
    void liveArtifactPort.fetchLiveArtifactRefreshes(projectId, liveArtifact.artifactId).then((next) => {
      if (!cancelled) setRefreshHistory(next);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, liveArtifact.artifactId, liveArtifact.updatedAt, liveArtifactPort]);

  // Instrument the live-artifact iframe so failed loads — usually a missing
  // artifact file or a stuck `od://` resolver — surface in PostHog. iframe
  // load errors don't propagate to window.error, so observability/install.ts
  // cannot catch them globally.
  useEffect(() => {
    if (mode !== 'preview') return undefined;
    const node = iframeRef.current;
    if (!node) return undefined;
    return trackIframeLoad({
      iframe: node,
      surface: 'live_artifact_preview',
      artifactId: liveArtifact.artifactId,
      projectId,
    });
  }, [mode, previewUrlReloadKey, liveArtifact.artifactId, projectId]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    setRefreshSuccess(null);
    nextRefreshEvent({ phase: 'started' });
    try {
      const result = await liveArtifactPort.refreshLiveArtifact(projectId, liveArtifact.artifactId);
      setDetail(result.artifact);
      void liveArtifactPort.fetchLiveArtifactRefreshes(projectId, liveArtifact.artifactId).then(setRefreshHistory);
      setPreviewUrlReloadKey((n) => n + 1);
      nextRefreshEvent({
        phase: 'succeeded',
        refreshedSourceCount: result.refresh.refreshedSourceCount,
      });
      if (result.refresh.refreshedSourceCount > 0) {
        setRefreshSuccess(tRef.current('liveArtifact.refresh.successOne'));
      } else {
        setRefreshError(tRef.current('liveArtifact.refresh.noSourceTitle'));
      }
      await onRefreshArtifacts?.();
    } catch (error) {
      const message = refreshErrorMessage(error, tRef.current);
      setRefreshError(message);
      nextRefreshEvent({ phase: 'failed', error: message });
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, liveArtifactPort, projectId, liveArtifact.artifactId, onRefreshArtifacts, nextRefreshEvent]);

  const presentInThisTab = useCallback(() => {
    setPresentMenuOpen(false);
    setMode('preview');
    setInTabPresent(true);
  }, []);
  const presentFullscreen = useCallback(() => {
    setPresentMenuOpen(false);
    setMode('preview');
    const target = previewBodyRef.current ?? iframeRef.current;
    if (target?.requestFullscreen) {
      void target.requestFullscreen().catch(() => {});
    }
  }, [previewBodyRef]);
  const presentNewTab = useCallback(() => {
    setPresentMenuOpen(false);
    windowOpenPort.openInNewTab(liveArtifactPreviewUrl(projectId, liveArtifact.artifactId));
  }, [windowOpenPort, projectId, liveArtifact.artifactId]);

  useEffect(() => {
    if (!inTabPresent) return undefined;
    return dismissPort.subscribeEscapeKey(() => setInTabPresent(false));
  }, [dismissPort, inTabPresent]);

  useEffect(() => {
    if (!zoomMenuOpen) return undefined;
    return dismissPort.subscribeOutsideDismiss(() => zoomMenuRef.current, () => setZoomMenuOpen(false));
  }, [dismissPort, zoomMenuOpen]);

  const currentRefreshStatus = detail?.refreshStatus ?? liveArtifact.refreshStatus;
  const isRunning = refreshing || currentRefreshStatus === 'running';

  return {
    tabs,
    mode,
    setMode,
    detail,
    loading,
    previewUrlReloadKey,
    zoom,
    setZoom,
    previewViewport,
    setPreviewViewport,
    iframeRef,
    refreshing,
    refreshError,
    refreshSuccess,
    dismissRefreshSuccess: () => setRefreshSuccess(null),
    refreshEvents,
    refreshHistory,
    isRunning,
    handleRefresh,
    reloadPreview: () => setPreviewUrlReloadKey((n) => n + 1),
    presentMenuOpen,
    setPresentMenuOpen,
    presentWrapRef,
    presentInThisTab,
    presentFullscreen,
    presentNewTab,
    inTabPresent,
    exitInTabPresent: () => setInTabPresent(false),
    zoomMenuOpen,
    setZoomMenuOpen,
    zoomMenuRef,
    chromeActionsHost,
    previewBodyRef,
    previewBodySize,
  };
}

export function useWiredLiveArtifactViewer(deps: LiveArtifactViewerDeps): LiveArtifactViewerController {
  return useLiveArtifactViewer(
    realLiveArtifactPort,
    realDismissPort,
    realChromeActionsHostPort,
    realElementSizePort,
    realWindowOpenPort,
    deps,
  );
}
