// Feature-local hook for the brand-browser-assist snapshot IO cluster: the
// local page-archive snapshot reader, the live embedded-webview snapshot
// reader (+ retry loop), the "download page" fallback, the client-side
// confirm handler for the brand-browser-assist od-card, and the one-shot
// assist-injection effect that drops the card into the conversation when
// extraction is anti-bot-walled.
//
// `setBrowserOpenRequest` (Cluster 9), `activeConversationId`/
// `messagesConversationId`/`appendConversationMessage`/`messagesRef`
// (Cluster 4), `setProjectActionsToast` (cross-cutting, shared with several
// other not-yet-extracted clusters), `brandSourceUrl`/`config`/`agentsById`,
// and the pre-existing `useBrandReadyPrompt` hook's `brandBrowserAssist`/
// `dismissBrandBrowserAssist` outputs are all taken as params.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { isOpenDesignHostAvailable } from '@open-design/host';
import {
  getBrandBrowser,
  BRAND_BROWSER_TAB_ID,
  type BrandBrowserPageSnapshotResult,
} from '../../../runtime/brand-browser-bridge';
import {
  BROWSER_PAGE_ARCHIVE_INDEX_FILE,
  BROWSER_SERIALIZE_HTML_SCRIPT,
  BROWSER_SERIALIZE_STYLES_SCRIPT,
  isBrowserPageArchiveManifest,
} from '../../../components/design-browser-tools';
import type {
  BrandBrowserAssistConfirm,
  BrandBrowserAssistResult,
} from '../../../components/OdCard';
import type { BrowserOpenRequest } from '../../../components/FileWorkspace';
import { effectiveAgentModelChoice } from '../../../components/agentModelSelection';
import { agentModelDisplayName } from '../../../utils/agentLabels';
import { apiProtocolAgentId, apiProtocolModelLabel } from '../../../utils/apiProtocol';
import { randomUUID } from '../../../utils/uuid';
import type { useT } from '../../../i18n';
import type { AgentInfo, AppConfig, ChatMessage } from '../../../types';
import { brandBrowserSnapshotMatchesSource, conversationHasBrandBrowserAssist } from '../rules';
import type { BrandBrowserSnapshot, SaveMessageOptions } from '../types';
import { projectViewTransportPort } from '../dependencies';
import type { ProjectViewTransportPort } from '../ports';

interface BrandBrowserAssistState {
  brandId: string;
  sourceUrl?: string | null;
  reason?: string;
}

export interface BrandBrowserSnapshotController {
  readLocalBrowserPageArchiveSnapshot: (
    sourceUrl: string | null | undefined,
  ) => Promise<BrandBrowserSnapshot>;
  readBrandBrowserSnapshot: (tabId?: string, timeoutMs?: number) => Promise<BrandBrowserSnapshot>;
  downloadBrandBrowserPageArchive: (
    sourceUrl: string | null | undefined,
    tabId?: string,
    timeoutMs?: number,
  ) => Promise<BrandBrowserSnapshot>;
  readBrandBrowserSnapshotWithRetry: (tabId?: string) => Promise<BrandBrowserSnapshot>;
  handleBrandBrowserAssistConfirm: BrandBrowserAssistConfirm;
  selectedAssistantIdentity: { agentId: string | undefined; agentName: string | undefined };
}

export function useBrandBrowserSnapshot(
  port: ProjectViewTransportPort,
  projectId: string,
  t: ReturnType<typeof useT>,
  brandSourceUrl: string | null | undefined,
  setBrowserOpenRequest: Dispatch<SetStateAction<BrowserOpenRequest | null>>,
  setProjectActionsToast: (
    toast: {
      message: string;
      details: string | null;
      code?: string | null;
      tone?: 'default' | 'success' | 'error' | 'loading';
      ttlMs?: number;
    } | null,
  ) => void,
  config: AppConfig,
  agentsById: Map<string, AgentInfo>,
  brandBrowserAssist: BrandBrowserAssistState | null | undefined,
  dismissBrandBrowserAssist: () => void,
  activeConversationId: string | null,
  messagesConversationId: string | null,
  messagesRef: MutableRefObject<ChatMessage[]>,
  appendConversationMessage: (
    conversationId: string,
    message: ChatMessage,
    options?: SaveMessageOptions,
    persist?: boolean,
  ) => void,
): BrandBrowserSnapshotController {
  const readLocalBrowserPageArchiveSnapshot = useCallback(
    async (sourceUrl: string | null | undefined): Promise<BrandBrowserSnapshot> => {
      const manifestText = await port.fetchProjectFileText(projectId, BROWSER_PAGE_ARCHIVE_INDEX_FILE, {
        cache: 'no-store',
        cacheBustKey: Date.now(),
      });
      if (!manifestText) {
        return { status: 'unavailable', message: t('chat.brandBrowserLocalSnapshotMissing') };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(manifestText);
      } catch {
        return { status: 'read-failed', message: t('chat.brandBrowserLocalSnapshotReadFailed') };
      }
      if (!isBrowserPageArchiveManifest(parsed)) {
        return { status: 'read-failed', message: t('chat.brandBrowserLocalSnapshotReadFailed') };
      }
      if (!brandBrowserSnapshotMatchesSource(parsed.baseUrl || parsed.url, sourceUrl)) {
        return { status: 'unavailable', message: t('chat.brandBrowserLocalSnapshotMissing') };
      }
      const [html, css] = await Promise.all([
        port.fetchProjectFileText(projectId, parsed.htmlFile, { cache: 'no-store', cacheBustKey: parsed.capturedAt }),
        port.fetchProjectFileText(projectId, parsed.cssFile, { cache: 'no-store', cacheBustKey: parsed.capturedAt }),
      ]);
      if (!html?.trim()) {
        return { status: 'read-failed', message: t('chat.brandBrowserLocalSnapshotReadFailed') };
      }
      return {
        status: 'ready',
        html,
        css: css ?? '',
        baseUrl: parsed.baseUrl || parsed.url,
      };
    },
    [port, projectId, t],
  );

  const readBrandBrowserSnapshot = useCallback(
    async (tabId = BRAND_BROWSER_TAB_ID, timeoutMs = 8000): Promise<BrandBrowserSnapshot> => {
      const handle = getBrandBrowser(projectId, tabId);
      if (!handle || !handle.isDesktopWebview) {
        return { status: 'unavailable', message: t('chat.brandBrowserAssistDesktopOnly') };
      }
      // Guard against a tab that never actually navigated/loaded — reading a
      // blank webview would otherwise look like an empty page.
      const tabUrl = handle.getURL();
      if (!tabUrl || tabUrl === 'about:blank') {
        return { status: 'read-failed', message: t('chat.brandBrowserAssistReadFailed') };
      }
      // Electron's executeJavaScript never times out on its own; a tab still on a
      // challenge wall / mid-redirect / hung renderer would freeze the recovery
      // forever. Cap each read so the UI surfaces a retryable error instead.
      const readTab = (script: string): Promise<string> => {
        const promise = handle.executeJavaScript<string>(script, true);
        if (!promise) return Promise.resolve('');
        return Promise.race([
          promise,
          new Promise<string>((_, reject) =>
            setTimeout(
              () => reject(new Error(t('chat.brandBrowserAssistReadFailed'))),
              timeoutMs,
            ),
          ),
        ]);
      };
      let html = '';
      let css = '';
      try {
        // Read the DOM and the computed-style digest CONCURRENTLY: serially they
        // stacked two full timeout windows back-to-back (a slow page meant ~16s
        // per attempt, and the retry loop multiplied that into a minute-long
        // spinner). The CSS digest is best-effort — a sparse/empty palette no
        // longer fails extraction server-side — so it must never reject the read.
        [html, css] = await Promise.all([
          readTab(BROWSER_SERIALIZE_HTML_SCRIPT),
          readTab(BROWSER_SERIALIZE_STYLES_SCRIPT).catch(() => ''),
        ]);
      } catch (err) {
        return {
          status: 'read-failed',
          message: err instanceof Error ? err.message : t('chat.brandBrowserAssistReadFailed'),
        };
      }
      if (!html.trim()) {
        return { status: 'read-failed', message: t('chat.brandBrowserAssistReadFailed') };
      }
      const baseUrl = handle.getURL() || tabUrl;
      return { status: 'ready', html, css, baseUrl };
    },
    [projectId, t],
  );

  const downloadBrandBrowserPageArchive = useCallback(
    async (
      sourceUrl: string | null | undefined,
      tabId = BRAND_BROWSER_TAB_ID,
      // The page-snapshot download now persists only page.html + styles.css
      // (extraction reads nothing else), so it completes in well under a
      // second. This race is just a generous safety ceiling for serializing a
      // very large DOM, not a budget for asset fetching.
      timeoutMs = 30_000,
    ): Promise<BrandBrowserSnapshot> => {
      const handle = getBrandBrowser(projectId, tabId);
      if (!handle || !handle.isDesktopWebview || !handle.downloadPageSnapshot) {
        return { status: 'unavailable', message: t('chat.brandBrowserAssistDesktopOnly') };
      }
      const result: BrandBrowserPageSnapshotResult = await Promise.race<BrandBrowserPageSnapshotResult>([
        handle.downloadPageSnapshot(),
        new Promise<BrandBrowserPageSnapshotResult>((_, reject) =>
          setTimeout(
            () => reject(new Error(t('chat.brandBrowserSnapshotSaveFailed'))),
            timeoutMs,
          ),
        ),
      ]).catch((err): BrandBrowserPageSnapshotResult => ({
        ok: false,
        message: err instanceof Error ? err.message : t('chat.brandBrowserSnapshotSaveFailed'),
      }));
      if (!result.ok) {
        return { status: 'read-failed', message: result.message || t('chat.brandBrowserSnapshotSaveFailed') };
      }
      return readLocalBrowserPageArchiveSnapshot(sourceUrl || result.baseUrl || '');
    },
    [projectId, readLocalBrowserPageArchiveSnapshot, t],
  );

  const readBrandBrowserSnapshotWithRetry = useCallback(
    async (tabId = BRAND_BROWSER_TAB_ID): Promise<BrandBrowserSnapshot> => {
      // The pinned webview can still be mounting/registering right after a
      // workspace remount, and a freshly-focused tab may not have committed its
      // post-wall URL yet — so a single read can spuriously report the live DOM
      // unreadable. Re-read a few times before giving up. Only meaningful on the
      // desktop host: the web-only host never exposes a webview, so retrying
      // can't change an `unavailable` verdict.
      let snapshot = await readBrandBrowserSnapshot(tabId, 8000);
      if (snapshot.status === 'ready' || !isOpenDesignHostAvailable()) return snapshot;
      // Retries cover the mount/registration race only — a ready webview resolves
      // these reads almost instantly. Use a short per-retry cap so a genuinely
      // hung/walled page fails fast instead of stacking full timeout windows.
      for (let attempt = 0; attempt < 3 && snapshot.status !== 'ready'; attempt += 1) {
        await new Promise((resolve) => {
          setTimeout(resolve, 500);
        });
        snapshot = await readBrandBrowserSnapshot(tabId, 3000);
      }
      return snapshot;
    },
    [readBrandBrowserSnapshot],
  );

  // Client-side handler for the brand-browser-assist od-card's button: open or
  // focus the bound Browser tab, surface the Download Page menu action, and let
  // Continue extraction consume the saved snapshot or live DOM.
  const handleBrandBrowserAssistConfirm = useCallback<BrandBrowserAssistConfirm>(
    async (card): Promise<BrandBrowserAssistResult> => {
      const url = card.url?.trim() || brandSourceUrl?.trim() || '';
      if (!url) return { ok: false, message: t('chat.brandBrowserAssistReadFailed') };
      const nonce = Date.now();
      setBrowserOpenRequest({
        tabId: card.browserTabId || BRAND_BROWSER_TAB_ID,
        url,
        nonce,
        attentionAction: 'download-page',
      });
      setProjectActionsToast({
        message: t('chat.brandBrowserAssistDownloadGuideTitle'),
        details: t('chat.brandBrowserAssistDownloadGuideDetails'),
        tone: 'default',
        ttlMs: 12000,
      });
      return { ok: true, action: 'opened' };
    },
    [brandSourceUrl, setBrowserOpenRequest, setProjectActionsToast, t],
  );

  // Identity for host-authored chat messages (the brand browser-assist prompt
  // below). Without it the message collapses to the generic "Assistant" label +
  // monogram; stamping the user's currently-selected design agent makes its
  // avatar and role name follow that selection (Claude by default), matching how
  // handleSend identifies a real turn.
  const selectedAssistantIdentity = useMemo<{
    agentId: string | undefined;
    agentName: string | undefined;
  }>(() => {
    if (config.mode === 'daemon') {
      const selectedAgent = config.agentId ? agentsById.get(config.agentId) : null;
      const selectedAgentChoice = config.agentId
        ? config.agentModels?.[config.agentId]
        : undefined;
      const effectiveChoice = effectiveAgentModelChoice(selectedAgent, selectedAgentChoice);
      return {
        agentId: config.agentId ?? undefined,
        agentName: agentModelDisplayName(
          config.agentId,
          selectedAgent?.name,
          effectiveChoice?.model,
        ),
      };
    }
    return {
      agentId: apiProtocolAgentId(config.apiProtocol),
      agentName: apiProtocolModelLabel(config.apiProtocol, config.model),
    };
  }, [config, agentsById]);

  // One-shot: when extraction is blocked by an anti-bot wall (or has stalled past
  // the timeout), drop the assist card into the conversation so the user can
  // clear the wall in the Browser tab and Confirm. Keyed per conversation+brand
  // so it can't double-post.
  const injectedAssistRef = useRef<string | null>(null);
  useEffect(() => {
    if (!brandBrowserAssist || !activeConversationId) return;
    if (messagesConversationId !== activeConversationId) return;
    const { brandId, sourceUrl, reason } = brandBrowserAssist;
    const dedupeKey = `${activeConversationId}:${brandId}`;
    if (injectedAssistRef.current === dedupeKey) return;
    injectedAssistRef.current = dedupeKey;
    if (conversationHasBrandBrowserAssist(messagesRef.current, brandId)) {
      dismissBrandBrowserAssist();
      return;
    }
    const payload = JSON.stringify({
      brandId,
      browserTabId: BRAND_BROWSER_TAB_ID,
      ...(sourceUrl ? { url: sourceUrl } : {}),
      reason,
    });
    const content = `${t('chat.brandBrowserAssistMessage')}\n\n<od-card type="brand-browser-assist">${payload}</od-card>`;
    appendConversationMessage(activeConversationId, {
      id: randomUUID(),
      role: 'assistant',
      agentId: selectedAssistantIdentity.agentId,
      agentName: selectedAssistantIdentity.agentName,
      content,
      events: [{ kind: 'text', text: content }],
      createdAt: Date.now(),
    });
    dismissBrandBrowserAssist();
  }, [
    brandBrowserAssist,
    activeConversationId,
    appendConversationMessage,
    dismissBrandBrowserAssist,
    messagesConversationId,
    messagesRef,
    selectedAssistantIdentity,
    t,
  ]);

  return {
    readLocalBrowserPageArchiveSnapshot,
    readBrandBrowserSnapshot,
    downloadBrandBrowserPageArchive,
    readBrandBrowserSnapshotWithRetry,
    handleBrandBrowserAssistConfirm,
    selectedAssistantIdentity,
  };
}

/** Wirer: binds the real project-view transport port; swap in tests. */
export function useWiredBrandBrowserSnapshot(
  projectId: string,
  t: ReturnType<typeof useT>,
  brandSourceUrl: string | null | undefined,
  setBrowserOpenRequest: Dispatch<SetStateAction<BrowserOpenRequest | null>>,
  setProjectActionsToast: (
    toast: {
      message: string;
      details: string | null;
      code?: string | null;
      tone?: 'default' | 'success' | 'error' | 'loading';
      ttlMs?: number;
    } | null,
  ) => void,
  config: AppConfig,
  agentsById: Map<string, AgentInfo>,
  brandBrowserAssist: BrandBrowserAssistState | null | undefined,
  dismissBrandBrowserAssist: () => void,
  activeConversationId: string | null,
  messagesConversationId: string | null,
  messagesRef: MutableRefObject<ChatMessage[]>,
  appendConversationMessage: (
    conversationId: string,
    message: ChatMessage,
    options?: SaveMessageOptions,
    persist?: boolean,
  ) => void,
): BrandBrowserSnapshotController {
  return useBrandBrowserSnapshot(
    projectViewTransportPort,
    projectId,
    t,
    brandSourceUrl,
    setBrowserOpenRequest,
    setProjectActionsToast,
    config,
    agentsById,
    brandBrowserAssist,
    dismissBrandBrowserAssist,
    activeConversationId,
    messagesConversationId,
    messagesRef,
    appendConversationMessage,
  );
}
