// Feature-local hook for the file-workspace embedded-browser-tabs cluster:
// the browser tab list, per-tab navigate/attention requests, the mounted-tab
// keep-alive LRU, and the browser-panel snapshot toast. No transport/DOM here
// (webview navigation itself lives in `DesignBrowserPanel`, already outside
// this slice) — pure state/dispatch, so this hook takes no port.
//
// Cluster 4 sits between cluster 2 (upload/file CRUD) and the still-inline
// cluster 3 (tab activation): it calls into cluster 3's `setActiveTab` /
// `commitTabsState` / `onTabsStateChange` / `workspaceTabsState` /
// `setPersistedActive` as params, and needs cluster 3's derived
// `orderedWorkspaceTabs` to anchor a newly-opened browser tab next to the
// current last workspace tab. `orderedWorkspaceTabs` is itself derived FROM
// this hook's `browserTabs` state (via `useWorkspaceContextTracking`), so a
// plain value param would be a hook-ordering cycle — the orchestrator
// threads it through a ref (`orderedWorkspaceTabsRef`) it updates at render
// time, mirroring the existing `openFileRef` pattern in this same file for
// the identical class of problem.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { OpenTabsState } from '../../../types';
import type {
  BrowserPageInfo,
  BrowserPageSnapshotToastEvent,
} from '../../../components/DesignBrowserPanel';
import { labelFromUrl, normalizeBrowserAddress } from '../../../components/DesignBrowserPanel';
import {
  browserTabIndex,
  browserTabsFromState,
  formatWorkspaceSnapshotElapsed,
  isBrowserTabId,
  maxBrowserTabSequence,
} from '../rules';
import { BROWSER_KEEPALIVE_CAP, BROWSER_TAB_PREFIX, DESIGN_FILES_TAB } from '../constants';
import type {
  BrowserAttentionRequest,
  BrowserOpenRequest,
  BrowserWorkspaceTab,
  TranslateFn,
  WorkspaceActionToast,
  WorkspaceOrderedTab,
  WorkspaceToastTone,
} from '../types';

function lastWorkspaceTabId(orderedTabs: WorkspaceOrderedTab[]): string | null {
  return orderedTabs.length > 0 ? orderedTabs[orderedTabs.length - 1]!.id : null;
}

export interface UseBrowserTabsParams {
  projectId: string;
  pinnedBrowserTabId?: string | null;
  tabsState: OpenTabsState;
  activeTab: string;
  setActiveTab: (name: string) => void;
  persistedTabs: string[];
  orderedWorkspaceTabsRef: MutableRefObject<WorkspaceOrderedTab[]>;
  onTabsStateChange: (next: OpenTabsState) => void;
  commitTabsState: (next: OpenTabsState) => void;
  workspaceTabsState: (
    tabs: string[],
    active: string | null,
    nextBrowserTabs?: BrowserWorkspaceTab[],
  ) => OpenTabsState;
  setUploadError: (error: string | null) => void;
  setPersistedActive: (name: string | null) => void;
  openFileRef: MutableRefObject<(name: string) => void>;
  browserOpenRequest?: BrowserOpenRequest | null;
  t: TranslateFn;
}

export interface BrowserTabsController {
  browserTabs: BrowserWorkspaceTab[];
  // Raw setter, exposed for the not-yet-extracted tab-activation cluster
  // (cluster 3), which still reanchors `browserTabs` directly in its
  // `openRequest`/`openFile` paths — mirrors `useWiredProjectFolders`
  // exposing `setUploadDir` for the same reason.
  setBrowserTabs: Dispatch<SetStateAction<BrowserWorkspaceTab[]>>;
  browserNavigateRequests: Record<string, { url: string; nonce: number }>;
  browserAttentionRequests: Record<string, BrowserAttentionRequest>;
  mountedBrowserTabIds: Set<string>;
  browserSnapshotToast: WorkspaceActionToast | null;
  setBrowserSnapshotToast: Dispatch<SetStateAction<WorkspaceActionToast | null>>;
  openBrowserTab: () => void;
  closeBrowserTab: (tabId: string) => void;
  updateBrowserTabInfo: (tabId: string, info: BrowserPageInfo) => void;
  handleBrowserPageSnapshotToast: (event: BrowserPageSnapshotToastEvent) => void;
}

export function useBrowserTabs(params: UseBrowserTabsParams): BrowserTabsController {
  const {
    projectId,
    pinnedBrowserTabId,
    tabsState,
    activeTab,
    setActiveTab,
    persistedTabs,
    orderedWorkspaceTabsRef,
    onTabsStateChange,
    commitTabsState,
    workspaceTabsState,
    setUploadError,
    setPersistedActive,
    openFileRef,
    browserOpenRequest,
    t,
  } = params;

  const [browserTabs, setBrowserTabs] = useState<BrowserWorkspaceTab[]>(
    () => browserTabsFromState(tabsState.browserTabs),
  );
  const [browserNavigateRequests, setBrowserNavigateRequests] = useState<
    Record<string, { url: string; nonce: number }>
  >({});
  const [browserAttentionRequests, setBrowserAttentionRequests] = useState<
    Record<string, BrowserAttentionRequest>
  >({});
  const [browserSnapshotToast, setBrowserSnapshotToast] = useState<WorkspaceActionToast | null>(null);
  // LRU of browser tab ids whose `<webview>` is currently mounted (most-recent
  // first). A browser tab is mounted only after it has been activated; we cap
  // the live set at BROWSER_KEEPALIVE_CAP and unmount the rest.
  const [liveBrowserTabIds, setLiveBrowserTabIds] = useState<string[]>([]);
  const browserTabSequenceRef = useRef(0);

  // The set actually rendered. The activation LRU governs ad-hoc browser tabs,
  // but a pinned brand-extraction tab must stay mounted even when it was never
  // activated this session (a refresh can remount the workspace with brand.html
  // active and the LRU empty). Keeping its <webview> alive is what lets the chat
  // "Continue extraction" handler read the live, post-wall DOM instead of
  // silently degrading to a re-walled server fetch.
  const mountedBrowserTabIds = useMemo(() => {
    const ids = new Set(liveBrowserTabIds);
    if (pinnedBrowserTabId && browserTabs.some((tab) => tab.id === pinnedBrowserTabId)) {
      ids.add(pinnedBrowserTabId);
    }
    return ids;
  }, [liveBrowserTabIds, pinnedBrowserTabId, browserTabs]);

  useEffect(() => {
    setBrowserTabs([]);
    setBrowserNavigateRequests({});
    browserTabSequenceRef.current = 0;
  }, [projectId]);

  useEffect(() => {
    const nextBrowserTabs = browserTabsFromState(tabsState.browserTabs);
    setBrowserTabs(nextBrowserTabs);
    browserTabSequenceRef.current = maxBrowserTabSequence(nextBrowserTabs);
  }, [tabsState.browserTabs]);

  // Promote the active browser tab to the front of the keep-alive LRU (and cap
  // it). Activating a browser tab is the only thing that mounts its webview.
  useEffect(() => {
    if (!isBrowserTabId(activeTab)) return;
    setLiveBrowserTabIds((prev) => {
      if (prev[0] === activeTab) return prev;
      return [activeTab, ...prev.filter((id) => id !== activeTab)].slice(0, BROWSER_KEEPALIVE_CAP);
    });
  }, [activeTab]);

  // Drop closed browser tabs from the live set so their webview unmounts.
  useEffect(() => {
    setLiveBrowserTabIds((prev) => {
      const existing = new Set(browserTabs.map((tab) => tab.id));
      const next = prev.filter((id) => existing.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [browserTabs]);

  function openRequestedBrowserTab(request: BrowserOpenRequest) {
    const requestedTabId = request.tabId?.trim();
    const normalizedUrl = normalizeBrowserAddress(request.url);
    const tabId =
      requestedTabId && isBrowserTabId(requestedTabId)
        ? requestedTabId
        : `${BROWSER_TAB_PREFIX}${browserTabSequenceRef.current + 1}`;
    const requestedIndex = browserTabIndex(tabId);
    if (requestedIndex > 0) {
      browserTabSequenceRef.current = Math.max(browserTabSequenceRef.current, requestedIndex);
    }
    // Focus-only: the tab already exists and is parked on the (cleared) page —
    // just foreground it so its webview un-throttles, without issuing a navigate
    // request that would reload and re-trigger the anti-bot wall.
    if (request.focusOnly && browserTabs.some((tab) => tab.id === tabId)) {
      setUploadError(null);
      setActiveTab(tabId);
      const attentionAction = request.attentionAction;
      if (attentionAction) {
        setBrowserAttentionRequests((current) => ({
          ...current,
          [tabId]: { action: attentionAction, nonce: request.nonce },
        }));
      }
      commitTabsState(workspaceTabsState(persistedTabs, tabId, browserTabs));
      return;
    }
    const browserTitle = normalizedUrl && normalizedUrl !== 'about:blank'
      ? labelFromUrl(normalizedUrl)
      : undefined;
    let found = false;
    const nextTabs = browserTabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      found = true;
      return {
        ...tab,
        ...(browserTitle ? { title: browserTitle, url: normalizedUrl } : {}),
      };
    });
    if (!found) {
      const anchor = lastWorkspaceTabId(orderedWorkspaceTabsRef.current) ?? activeTab;
      const label = requestedIndex > 1 ? `Browser ${requestedIndex}` : 'Browser';
      nextTabs.push({
        id: tabId,
        insertAfter: anchor,
        label,
        ...(browserTitle ? { title: browserTitle, url: normalizedUrl } : {}),
      });
    }
    setUploadError(null);
    setBrowserTabs(nextTabs);
    setBrowserNavigateRequests((current) => ({
      ...current,
      [tabId]: { url: normalizedUrl, nonce: request.nonce },
    }));
    const attentionAction = request.attentionAction;
    if (attentionAction) {
      setBrowserAttentionRequests((current) => ({
        ...current,
        [tabId]: { action: attentionAction, nonce: request.nonce },
      }));
    }
    setActiveTab(tabId);
    commitTabsState(workspaceTabsState(persistedTabs, tabId, nextTabs));
  }

  useEffect(() => {
    if (!browserOpenRequest) return;
    openRequestedBrowserTab(browserOpenRequest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserOpenRequest]);

  function openBrowserTab() {
    setUploadError(null);
    const nextIndex = browserTabSequenceRef.current + 1;
    browserTabSequenceRef.current = nextIndex;
    const anchor = lastWorkspaceTabId(orderedWorkspaceTabsRef.current) ?? activeTab;
    const nextTab: BrowserWorkspaceTab = {
      id: `${BROWSER_TAB_PREFIX}${nextIndex}`,
      insertAfter: anchor,
      label: nextIndex === 1 ? 'Browser' : `Browser ${nextIndex}`,
    };
    const nextTabs = [...browserTabs, nextTab];
    setBrowserTabs(nextTabs);
    setActiveTab(nextTab.id);
    commitTabsState(workspaceTabsState(persistedTabs, nextTab.id, nextTabs));
  }

  function closeBrowserTab(tabId: string) {
    const closingIndex = browserTabs.findIndex((tab) => tab.id === tabId);
    const nextTabs = browserTabs.filter((tab) => tab.id !== tabId);
    setBrowserTabs(nextTabs);
    const nextActive =
      activeTab === tabId
        ? nextTabs[Math.min(Math.max(closingIndex, 0), nextTabs.length - 1)]?.id ?? DESIGN_FILES_TAB
        : tabsState.active === tabId
          ? DESIGN_FILES_TAB
          : tabsState.active;
    if (activeTab === tabId) {
      setActiveTab(nextActive ?? DESIGN_FILES_TAB);
    }
    onTabsStateChange(workspaceTabsState(persistedTabs, nextActive, nextTabs));
  }

  const updateBrowserTabInfo = useCallback((tabId: string, info: BrowserPageInfo) => {
    const nextUrl = info.url.trim();
    const nextIconUrl = info.iconUrl?.trim() ?? '';
    let changed = false;
    const nextTabs = browserTabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      const nextTitle = nextUrl
        ? info.title.trim() || labelFromUrl(nextUrl)
        : tab.label;
      const normalizedUrl = nextUrl === 'about:blank' ? '' : nextUrl;
      if (
        tab.title === nextTitle
        && (tab.url ?? '') === normalizedUrl
        && (tab.iconUrl ?? '') === nextIconUrl
      ) {
        return tab;
      }
      changed = true;
      const nextTab: BrowserWorkspaceTab = {
        ...tab,
        title: nextTitle,
        url: normalizedUrl,
      };
      if (nextIconUrl) {
        nextTab.iconUrl = nextIconUrl;
      } else {
        delete nextTab.iconUrl;
      }
      return nextTab;
    });
    if (!changed) return;
    setBrowserTabs(nextTabs);
    onTabsStateChange(workspaceTabsState(persistedTabs, activeTab, nextTabs));
  }, [activeTab, browserTabs, onTabsStateChange, persistedTabs]);

  const handleBrowserPageSnapshotToast = useCallback((event: BrowserPageSnapshotToastEvent) => {
    const details = event.elapsedSeconds == null
      ? null
      : `${t('homeHero.footer.duration')}: ${formatWorkspaceSnapshotElapsed(event.elapsedSeconds)}`;
    const tone: WorkspaceToastTone =
      event.status === 'loading'
        ? 'loading'
        : event.status === 'success'
          ? 'success'
          : event.status === 'error'
            ? 'error'
            : 'default';
    const actionLabel = event.status === 'loading'
      ? t('common.cancel')
      : event.actionLabel;
    const onAction = event.status === 'loading'
      ? event.onCancel
      : event.actionTarget === 'design-files'
        ? () => {
            setPersistedActive(DESIGN_FILES_TAB);
            setBrowserSnapshotToast(null);
          }
        : event.actionFileName
          ? () => {
              openFileRef.current(event.actionFileName!);
              setBrowserSnapshotToast(null);
            }
          : undefined;
    setBrowserSnapshotToast({
      actionLabel,
      details,
      className: 'od-toast-browser-snapshot',
      message: event.message,
      onAction,
      role: event.status === 'error' ? 'alert' : 'status',
      tone,
      ttlMs: event.ttlMs,
    });
  }, [t]);

  return {
    browserTabs,
    setBrowserTabs,
    browserNavigateRequests,
    browserAttentionRequests,
    mountedBrowserTabIds,
    browserSnapshotToast,
    setBrowserSnapshotToast,
    openBrowserTab,
    closeBrowserTab,
    updateBrowserTabInfo,
    handleBrowserPageSnapshotToast,
  };
}
