import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type SyntheticEvent,
} from 'react';
import type { ConnectorConnectResponse, ConnectorDetail, ConnectorStatusResponse } from '@open-design/contracts';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import {
  cancelConnectorAuthorization as cancelConnectorAuthorizationRequest,
  connectConnector,
  disconnectConnector,
  fetchConnectorDetail,
  fetchConnectorDiscovery,
  fetchConnectors,
  fetchConnectorStatuses,
} from '../providers/registry';
import {
  isTrustedConnectorCallbackOrigin,
  sortConnectorsForSearch,
} from './EntryView';
import { Icon } from './Icon';
import { CenteredLoader } from './Loading';

const CONNECTOR_CALLBACK_MESSAGE_TYPE = 'open-design:connector-connected';
const CONNECTOR_AUTH_PENDING_STORAGE_KEY = 'od-connectors-authorization-pending';
const CONNECTOR_AUTH_PENDING_POLL_MS = 2_000;
const CONNECTOR_TOOL_PREVIEW_LIMIT = 50;
const AUTHORIZATION_CANCEL_FAILED_MESSAGE = "Couldn't cancel authorization. Try again.";

interface ConnectorAuthorizationPending {
  expiresAt?: string;
}

type ConnectorAuthorizationPendingState = Record<string, ConnectorAuthorizationPending>;

const COMPOSIO_LOGO_SLUG_OVERRIDES: Record<string, string> = {
  google_drive: 'googledrive',
};

/**
 * Composio publishes per-toolkit logos at `logos.composio.dev`, keyed by the
 * lowercased toolkit slug (`AIRTABLE` → `airtable`, `ZOHO_BOOKS` →
 * `zoho_books`). Our connector ids are mostly already that shape. A small
 * override map handles CDN exceptions such as Google Drive, whose logo slug
 * is `googledrive` even though the toolkit id remains `google_drive`.
 */
function composioLogoSlug(connector: ConnectorDetail): string {
  const normalized = connector.id.toLowerCase().replace(/[^a-z0-9_]/g, '');
  return COMPOSIO_LOGO_SLUG_OVERRIDES[normalized] ?? normalized;
}

/**
 * Build the Composio logo URL for a given connector + theme. Returns `null`
 * when the slug normalizes to empty so the fallback tile renders without a
 * pointless 404 round trip.
 */
function composioLogoUrl(
  connector: ConnectorDetail,
  theme: 'light' | 'dark',
): string | null {
  const slug = composioLogoSlug(connector);
  if (!slug) return null;
  return `/api/connectors/logos/${encodeURIComponent(slug)}?theme=${theme}`;
}

/**
 * Resolve the live theme from `<html data-theme>`, falling back to the OS
 * preference when the user is on the implicit "system" mode (no attribute
 * set). Lightweight on purpose — the color of an icon doesn't deserve a
 * full theme provider/context here. The hook listens for both the data
 * attribute changing and the OS-level `prefers-color-scheme` toggling so
 * the logo stays in lockstep with the rest of the chrome.
 */
function useResolvedTheme(): 'light' | 'dark' {
  const read = (): 'light' | 'dark' => {
    if (typeof document === 'undefined') return 'dark';
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  };
  const [theme, setTheme] = useState<'light' | 'dark'>(read);
  useEffect(() => {
    const update = () => setTheme(read());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener?.('change', update);
    return () => {
      observer.disconnect();
      media?.removeEventListener?.('change', update);
    };
  }, []);
  return theme;
}

/**
 * Tiny hash → palette index. Stable across reloads so a connector's
 * fallback tile keeps the same hue, which makes the catalog feel coherent
 * even when many logos are missing (e.g. dev fixtures, network blocked).
 */
function fallbackPaletteIndex(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 6;
}

function fallbackInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/u);
  if (parts.length === 1) {
    const single = parts[0]!;
    return (single[0] ?? '').toUpperCase() + (single[1] ?? '').toLowerCase();
  }
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  return (first + second).toUpperCase();
}

/**
 * Connector brand mark. Tries the Composio logo CDN first (theme-aware) and
 * gracefully degrades to a colored initials tile if the request fails or no
 * slug is derivable. Decorative by default — the surrounding caption (card
 * title / drawer heading) is the accessible label, so the image carries an
 * empty alt and `aria-hidden="true"`.
 */
function ConnectorLogo({
  connector,
  theme,
  size = 'sm',
}: {
  connector: ConnectorDetail;
  theme: 'light' | 'dark';
  /** `sm` for catalog cards (compact 28px), `lg` for the detail drawer mark (44px). */
  size?: 'sm' | 'lg';
}) {
  const url = composioLogoUrl(connector, theme);
  const imageRef = useRef<HTMLImageElement | null>(null);
  // Track load state per (connector, theme, size) instance. Resetting on
  // url change means switching themes mid-session retries the new URL
  // instead of being stuck on a previously-failed request.
  const [state, setState] = useState<'pending' | 'loaded' | 'error'>(
    url ? 'pending' : 'error',
  );
  useEffect(() => {
    if (!url) {
      setState('error');
      return;
    }
    setState('pending');
    const image = imageRef.current;
    // Some browsers can complete tiny cached SVGs before React's onLoad
    // listener observes the event. The image is visually available, but the
    // wrapper stays in `state-pending`, leaving the neutral fallback over it.
    // Reconcile against the DOM image state after mount/theme changes so
    // cached logos still promote to the visible loaded state.
    if (image?.complete) {
      setState(image.naturalWidth > 0 ? 'loaded' : 'error');
    }
  }, [url]);
  const initials = fallbackInitials(connector.name);
  const palette = fallbackPaletteIndex(connector.id || connector.name);
  const showImage = url !== null && state !== 'error';
  return (
    <span
      className={`connector-logo size-${size} state-${state}${showImage ? '' : ' is-fallback'}`}
      data-palette={palette}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          key={url}
          ref={imageRef}
          className="connector-logo-img"
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
        />
      ) : null}
      {/* Fallback tile is always rendered underneath. While the image is
          pending it shows as a soft skeleton; if the image errors we keep
          the fallback visible and the image is unmounted so no broken-icon
          chrome can leak through. Once the image resolves it covers the
          fallback completely. */}
      <span className="connector-logo-fallback">{initials}</span>
    </span>
  );
}

function mergeConnectors(current: ConnectorDetail[], incoming: ConnectorDetail[]): ConnectorDetail[] {
  if (current.length === 0) return incoming;
  const incomingById = new Map(incoming.map((connector) => [connector.id, connector]));
  const merged = current.map((connector) => {
    const next = incomingById.get(connector.id);
    if (!next) return connector;
    return {
      ...connector,
      ...next,
      tools: next.tools.length > 0 ? next.tools : connector.tools,
      toolCount: next.toolCount ?? connector.toolCount,
      toolsNextCursor: next.toolsNextCursor ?? connector.toolsNextCursor,
      toolsHasMore: next.toolsHasMore ?? connector.toolsHasMore,
    };
  });
  const currentIds = new Set(current.map((connector) => connector.id));
  for (const connector of incoming) {
    if (!currentIds.has(connector.id)) merged.push(connector);
  }
  return merged;
}

function loadConnectorAuthorizationPending(): ConnectorAuthorizationPendingState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(CONNECTOR_AUTH_PENDING_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const pending: ConnectorAuthorizationPendingState = {};
    for (const [connectorId, state] of Object.entries(parsed as Record<string, unknown>)) {
      if (!connectorId) continue;
      if (state && typeof state === 'object' && !Array.isArray(state)) {
        const expiresAt = (state as Record<string, unknown>).expiresAt;
        pending[connectorId] = typeof expiresAt === 'string' && expiresAt.trim() ? { expiresAt } : {};
      } else {
        pending[connectorId] = {};
      }
    }
    return pruneConnectorAuthorizationPending(pending);
  } catch {
    return {};
  }
}

function saveConnectorAuthorizationPending(pending: ConnectorAuthorizationPendingState): void {
  if (typeof window === 'undefined') return;
  try {
    if (Object.keys(pending).length === 0) {
      window.sessionStorage.removeItem(CONNECTOR_AUTH_PENDING_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(CONNECTOR_AUTH_PENDING_STORAGE_KEY, JSON.stringify(pending));
    }
  } catch {
    /* Ignore unavailable sessionStorage. */
  }
}

export function pruneConnectorAuthorizationPending(
  pending: ConnectorAuthorizationPendingState,
  nowMs = Date.now(),
): ConnectorAuthorizationPendingState {
  const next: ConnectorAuthorizationPendingState = {};
  for (const [connectorId, state] of Object.entries(pending)) {
    const expiresAtMs = state.expiresAt ? Date.parse(state.expiresAt) : Number.NaN;
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) continue;
    next[connectorId] = state.expiresAt ? { expiresAt: state.expiresAt } : {};
  }
  return next;
}

export function updateConnectorAuthorizationPendingFromConnectResponse(
  pending: ConnectorAuthorizationPendingState,
  response: ConnectorConnectResponse,
  nowMs = Date.now(),
): ConnectorAuthorizationPendingState {
  const connectorId = response.connector.id;
  const next = { ...pending };
  if (response.auth?.kind === 'redirect_required' || response.auth?.kind === 'pending') {
    next[connectorId] = response.auth.expiresAt ? { expiresAt: response.auth.expiresAt } : {};
    return pruneConnectorAuthorizationPending(next, nowMs);
  }
  delete next[connectorId];
  return pruneConnectorAuthorizationPending(next, nowMs);
}

export function updateConnectorAuthorizationPendingFromStatuses(
  pending: ConnectorAuthorizationPendingState,
  statuses: ConnectorStatusResponse['statuses'],
  nowMs = Date.now(),
): ConnectorAuthorizationPendingState {
  const next = { ...pending };
  for (const [connectorId, status] of Object.entries(statuses)) {
    if (status.status === 'connected') delete next[connectorId];
  }
  return pruneConnectorAuthorizationPending(next, nowMs);
}

export function clearConnectorAuthorizationPending(
  pending: ConnectorAuthorizationPendingState,
  connectorId: string,
): ConnectorAuthorizationPendingState {
  if (pending[connectorId] === undefined) return pending;
  const next = { ...pending };
  delete next[connectorId];
  return next;
}

export function getConnectorDisplayToolCount(connector: ConnectorDetail): number {
  // Prefer the hand-curated catalog subset so the card/header badge stays
  // stable across Composio hydration: `toolCount` is sourced from the
  // provider's totalItems (a GitHub-style toolkit jumps from 2 to 48 once an
  // API key is configured), and `tools.length` shifts the same way after
  // hydration. `curatedToolNames` is fixed at the catalog and is what the
  // "N tools" badge is meant to reflect (issue #748).
  if (connector.curatedToolNames && connector.curatedToolNames.length > 0) {
    return connector.curatedToolNames.length;
  }
  return connector.toolCount ?? connector.tools.length;
}

export function hasLoadedAllAdvertisedConnectorTools(connector: ConnectorDetail): boolean {
  if (connector.toolsNextCursor) return false;
  if (connector.toolCount === undefined) return connector.tools.length > 0;
  return connector.tools.length >= connector.toolCount;
}

function mergeConnectorTools(current: ConnectorDetail['tools'], incoming: ConnectorDetail['tools']): ConnectorDetail['tools'] {
  const seen = new Set<string>();
  const merged: ConnectorDetail['tools'] = [];
  for (const tool of [...current, ...incoming]) {
    if (seen.has(tool.name)) continue;
    seen.add(tool.name);
    merged.push(tool);
  }
  return merged;
}

export function mergeConnectorToolPreview(current: ConnectorDetail, next: ConnectorDetail, append: boolean): ConnectorDetail {
  const merged: ConnectorDetail = {
    ...current,
    ...next,
    tools: append ? mergeConnectorTools(current.tools, next.tools) : next.tools,
    toolCount: next.toolCount ?? current.toolCount,
    toolsHasMore: next.toolsHasMore ?? false,
    featuredToolNames: next.featuredToolNames ?? current.featuredToolNames,
  };
  if (next.toolsNextCursor !== undefined) return { ...merged, toolsNextCursor: next.toolsNextCursor };
  const { toolsNextCursor: _toolsNextCursor, ...withoutCursor } = merged;
  return withoutCursor;
}

export function mergeConnectorActionResult(current: ConnectorDetail, next: ConnectorDetail): ConnectorDetail {
  return {
    ...current,
    ...next,
    tools: next.tools.length > 0 ? next.tools : current.tools,
    toolCount: next.toolCount ?? current.toolCount,
    featuredToolNames: next.featuredToolNames ?? current.featuredToolNames,
  };
}

function applyConnectorStatuses(
  current: ConnectorDetail[],
  statuses: ConnectorStatusResponse['statuses'],
): ConnectorDetail[] {
  if (Object.keys(statuses).length === 0) return current;
  return current.map((connector) => {
    const next = statuses[connector.id];
    if (!next) return connector;
    const { accountLabel: _accountLabel, lastError: _lastError, ...base } = connector;
    return { ...base, ...next };
  });
}

interface ConnectorsBrowserProps {
  composioConfigured: boolean;
  catalogRefreshKey?: string | number;
}

/**
 * Connector cards + search, lifted out of the entry-view top tab so it can
 * live under Settings → Connectors. Owns its own data lifecycle: fetches the
 * catalog on mount, lazily enriches with Composio discovery when the user
 * actually opens the surface, and rehydrates statuses on window focus and
 * OAuth callback messages.
 */
/**
 * Provider tab definition. Today this is just Composio, but the surface is
 * structured as a list-of-tabs because the next provider integration (e.g.
 * a self-hosted MCP registry) is expected to drop in here without rework.
 *
 * `match` decides whether a given catalog entry belongs to this provider:
 * the entry's `auth.provider` is the source of truth, falling back to the
 * lowercased display `provider` for catalog rows that don't carry an auth
 * payload yet.
 */
const PROVIDER_TABS: ReadonlyArray<{
  id: string;
  label: string;
  match: (connector: ConnectorDetail) => boolean;
}> = [
  {
    id: 'composio',
    label: 'Composio',
    match: (connector) => {
      const provider = connector.auth?.provider ?? connector.provider.toLowerCase();
      return provider === 'composio';
    },
  },
];

const DEFAULT_PROVIDER_TAB_ID = 'composio';

const CONNECTOR_CATEGORY_KEYS = {
  'accounting': 'connectors.category.accounting',
  'admin': 'connectors.category.admin',
  'ads & conversion': 'connectors.category.advertising',
  'advertising': 'connectors.category.advertising',
  'ai agents': 'connectors.category.aiAgents',
  'ai chatbots': 'connectors.category.aiAgents',
  'ai infrastructure': 'connectors.category.aiInfrastructure',
  'ai meeting assistants': 'connectors.category.meetings',
  'analytics': 'connectors.category.analytics',
  'artificial intelligence': 'connectors.category.aiAgents',
  'automation': 'connectors.category.automation',
  'bookmark managers': 'connectors.category.personal',
  'calendar': 'connectors.category.calendar',
  'cms': 'connectors.category.cms',
  'code': 'connectors.category.developer',
  'commerce': 'connectors.category.commerce',
  'communication': 'connectors.category.communication',
  'connectors': 'connectors.category.integration',
  'contacts': 'connectors.category.contacts',
  'crm': 'connectors.category.crm',
  'customer support': 'connectors.category.support',
  'data platform': 'connectors.category.dataPlatform',
  'database': 'connectors.category.database',
  'databases': 'connectors.category.database',
  'design': 'connectors.category.design',
  'developer': 'connectors.category.developer',
  'developer tools': 'connectors.category.developer',
  'documents': 'connectors.category.documentation',
  'documentation': 'connectors.category.documentation',
  'ecommerce': 'connectors.category.commerce',
  'education': 'connectors.category.education',
  'email': 'connectors.category.email',
  'email newsletters': 'connectors.category.email',
  'erp': 'connectors.category.erp',
  'electronics': 'connectors.category.commerce',
  'events': 'connectors.category.events',
  'event management': 'connectors.category.events',
  'example': 'connectors.category.integration',
  'feedback': 'connectors.category.surveys',
  'field service': 'connectors.category.fieldService',
  'file management & storage': 'connectors.category.storage',
  'finance': 'connectors.category.finance',
  'fitness': 'connectors.category.fitness',
  'forms': 'connectors.category.forms',
  'forms & surveys': 'connectors.category.forms',
  'fundraising': 'connectors.category.nonprofit',
  'gaming': 'connectors.category.gaming',
  'hospitality': 'connectors.category.hospitality',
  'hr': 'connectors.category.hr',
  'hr talent & recruitment': 'connectors.category.recruiting',
  'human resources': 'connectors.category.hr',
  'images & design': 'connectors.category.design',
  'important': 'connectors.category.integration',
  'integration': 'connectors.category.integration',
  'itsm': 'connectors.category.itsm',
  'it operations': 'connectors.category.itsm',
  'localization': 'connectors.category.localization',
  'logistics': 'connectors.category.logistics',
  'maps': 'connectors.category.maps',
  'marketing': 'connectors.category.marketing',
  'marketing automation': 'connectors.category.marketing',
  'media': 'connectors.category.media',
  'meetings': 'connectors.category.meetings',
  'model context protocol': 'connectors.category.developer',
  'news & lifestyle': 'connectors.category.media',
  'nonprofit': 'connectors.category.nonprofit',
  'notes': 'connectors.category.documentation',
  'notifications': 'connectors.category.communication',
  'observability': 'connectors.category.observability',
  'online courses': 'connectors.category.education',
  'payments': 'connectors.category.payments',
  'payment processing': 'connectors.category.payments',
  'personal': 'connectors.category.personal',
  'phone & sms': 'connectors.category.communication',
  'presentations': 'connectors.category.presentations',
  'premium': 'connectors.category.integration',
  'procurement': 'connectors.category.procurement',
  'product': 'connectors.category.product',
  'product management': 'connectors.category.product',
  'productivity': 'connectors.category.productivity',
  'productivity & project management': 'connectors.category.projectManagement',
  'project management': 'connectors.category.projectManagement',
  'proposal & invoice management': 'connectors.category.accounting',
  'recruiting': 'connectors.category.recruiting',
  'research': 'connectors.category.research',
  'sales': 'connectors.category.salesIntelligence',
  'sales intelligence': 'connectors.category.salesIntelligence',
  'scheduling': 'connectors.category.scheduling',
  'scheduling & booking': 'connectors.category.scheduling',
  'search': 'connectors.category.search',
  'security': 'connectors.category.security',
  'security & identity tools': 'connectors.category.security',
  'server monitoring': 'connectors.category.observability',
  'signing': 'connectors.category.signing',
  'signatures': 'connectors.category.signing',
  'social': 'connectors.category.social',
  'social media accounts': 'connectors.category.social',
  'social media marketing': 'connectors.category.marketing',
  'spreadsheets': 'connectors.category.spreadsheets',
  'storage': 'connectors.category.storage',
  'support': 'connectors.category.support',
  'surveys': 'connectors.category.surveys',
  'task management': 'connectors.category.tasks',
  'tasks': 'connectors.category.tasks',
  'team chat': 'connectors.category.communication',
  'team collaboration': 'connectors.category.communication',
  'time tracking': 'connectors.category.timeTracking',
  'time tracking software': 'connectors.category.timeTracking',
  'url shortener': 'connectors.category.marketing',
  'video': 'connectors.category.video',
  'video & audio': 'connectors.category.video',
  'video conferencing': 'connectors.category.meetings',
  'website builders': 'connectors.category.cms',
  'whiteboard': 'connectors.category.whiteboard',
} as const satisfies Record<string, keyof Dict>;

export function ConnectorsBrowser({
  composioConfigured,
  catalogRefreshKey = 0,
}: ConnectorsBrowserProps) {
  const t = useT();
  const [connectors, setConnectors] = useState<ConnectorDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsLoaded, setToolsLoaded] = useState(false);
  const [pendingConnectorAction, setPendingConnectorAction] = useState<{
    connectorId: string;
    action: 'connect' | 'disconnect';
  } | null>(null);
  const [connectorAuthorizationPending, setConnectorAuthorizationPending] = useState<ConnectorAuthorizationPendingState>(() => loadConnectorAuthorizationPending());
  const [connectorAuthorizationCancelFailed, setConnectorAuthorizationCancelFailed] = useState<Record<string, boolean>>({});
  const [detailConnectorId, setDetailConnectorId] = useState<string | null>(null);
  const [toolPreviewLoadingIds, setToolPreviewLoadingIds] = useState<Record<string, boolean>>({});
  const [toolPreviewFetchedIds, setToolPreviewFetchedIds] = useState<Record<string, boolean>>({});
  const [toolPreviewFailedIds, setToolPreviewFailedIds] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>(DEFAULT_PROVIDER_TAB_ID);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const logoTheme = useResolvedTheme();
  const toolPreviewRetryToken = `${composioConfigured ? 'configured' : 'unconfigured'}:${String(catalogRefreshKey)}`;

  const reloadConnectorStatuses = useCallback(async () => {
    const statuses = await fetchConnectorStatuses();
    setConnectors((curr) => applyConnectorStatuses(curr, statuses));
    setConnectorAuthorizationPending((curr) => updateConnectorAuthorizationPendingFromStatuses(curr, statuses));
  }, []);

  useEffect(() => {
    saveConnectorAuthorizationPending(connectorAuthorizationPending);
  }, [connectorAuthorizationPending]);

  useEffect(() => {
    if (Object.keys(connectorAuthorizationPending).length === 0) return;
    const interval = window.setInterval(() => {
      setConnectorAuthorizationPending((curr) => pruneConnectorAuthorizationPending(curr));
      void reloadConnectorStatuses();
    }, CONNECTOR_AUTH_PENDING_POLL_MS);
    return () => window.clearInterval(interval);
  }, [connectorAuthorizationPending, reloadConnectorStatuses]);

  // Initial catalog fetch — always loads the lightweight registry payload so
  // already-configured connectors render immediately.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setToolsLoaded(false);
    (async () => {
      const next = await fetchConnectors();
      if (cancelled) return;
      setConnectors((curr) => mergeConnectors(curr, next));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [composioConfigured, catalogRefreshKey]);

  // Lazy Composio discovery — enriched toolkit metadata + auth configuration.
  // Heavier round trip; only worth it once a Composio API key is actually
  // saved. Before that, discovery returns no live tools and the web-side
  // provider cache can otherwise keep those empty tool lists after Save key.
  useEffect(() => {
    if (!composioConfigured) {
      setToolsLoaded(false);
      setToolsLoading(false);
      return;
    }
    if (toolsLoaded) return;

    let cancelled = false;
    setToolsLoading(true);
    (async () => {
      const next = await fetchConnectorDiscovery({ refresh: true });
      if (cancelled) return;
      setConnectors((curr) => mergeConnectors(curr, next));
      setToolsLoaded(true);
      setToolsLoading(false);
    })();
    return () => {
      cancelled = true;
      setToolsLoading(false);
    };
  }, [composioConfigured, catalogRefreshKey, toolsLoaded]);

  // OAuth callback: a popup or system-browser tab postMessages back when an
  // auth flow completes. Trust same-origin + localhost-loopback so packaged
  // dev URLs (different ports) keep working.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (
        !data ||
        typeof data !== 'object' ||
        (data as { type?: unknown }).type !== CONNECTOR_CALLBACK_MESSAGE_TYPE
      )
        return;
      if (!isTrustedConnectorCallbackOrigin(event.origin)) return;
      void reloadConnectorStatuses();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [reloadConnectorStatuses]);

  // System-browser auth flows have no opener to post back to; refresh
  // whenever the window regains focus so the UI catches up silently.
  useEffect(() => {
    function onFocus() {
      void reloadConnectorStatuses();
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reloadConnectorStatuses]);

  // The local Composio API-key state is authoritative for masking. Cached
  // connector auth can be stale immediately after the user clears the key.
  const needsComposioKey = !composioConfigured;

  // Filter and rank connectors by user-visible fields. Exact/prefix matches
  // on connector name/provider are strongest; broad description matches stay
  // searchable but are down-ranked. The provider tab restricts the catalog
  // to a single backing provider before search runs so result rankings stay
  // tab-local.
  const providerScopedConnectors = useMemo(() => {
    const tab =
      PROVIDER_TABS.find((p) => p.id === selectedProvider) ??
      PROVIDER_TABS.find((p) => p.id === DEFAULT_PROVIDER_TAB_ID);
    if (!tab) return connectors;
    return connectors.filter((connector) => tab.match(connector));
  }, [connectors, selectedProvider]);

  const filteredConnectors = useMemo(() => {
    return sortConnectorsForSearch(providerScopedConnectors, filter);
  }, [providerScopedConnectors, filter]);

  const hasQuery = filter.trim().length > 0;
  const hasNoResults = hasQuery && filteredConnectors.length === 0;

  function updateConnector(next: ConnectorDetail | null) {
    if (!next) return;
    setConnectors((curr) => curr.map((connector) => (
      connector.id === next.id ? mergeConnectorActionResult(connector, next) : connector
    )));
  }

  async function runConnectorAction(connectorId: string, action: 'connect' | 'disconnect') {
    if (pendingConnectorAction) return;
    setPendingConnectorAction({ connectorId, action });
    try {
      if (action === 'connect') {
        setConnectorAuthorizationCancelFailed((curr) => {
          if (curr[connectorId] === undefined) return curr;
          const next = { ...curr };
          delete next[connectorId];
          return next;
        });
        const result = await connectConnector(connectorId);
        updateConnector(result.connector);
        if (result.connector && !result.error) {
          setConnectorAuthorizationPending((curr) => updateConnectorAuthorizationPendingFromConnectResponse(curr, {
            connector: result.connector!,
            ...(result.auth === undefined ? {} : { auth: result.auth }),
          }));
        } else {
          setConnectorAuthorizationPending((curr) => clearConnectorAuthorizationPending(curr, connectorId));
        }
      } else {
        setConnectorAuthorizationPending((curr) => clearConnectorAuthorizationPending(curr, connectorId));
        updateConnector(await disconnectConnector(connectorId));
      }
    } finally {
      setPendingConnectorAction(null);
    }
  }

  const detailConnector = useMemo(
    () => (detailConnectorId ? connectors.find((c) => c.id === detailConnectorId) ?? null : null),
    [detailConnectorId, connectors],
  );

  async function hydrateToolPreview(connectorId: string, cursor?: string) {
    if (!composioConfigured) return;
    if (toolPreviewLoadingIds[connectorId]) return;
    setToolPreviewLoadingIds((curr) => ({ ...curr, [connectorId]: true }));
    try {
      const next = await fetchConnectorDetail(connectorId, {
        hydrateTools: true,
        toolsLimit: CONNECTOR_TOOL_PREVIEW_LIMIT,
        ...(cursor === undefined ? {} : { toolsCursor: cursor }),
      });
      if (next) {
        setConnectors((curr) => curr.map((connector) => (
          connector.id === next.id ? mergeConnectorToolPreview(connector, next, cursor !== undefined) : connector
        )));
        setToolPreviewFetchedIds((curr) => ({ ...curr, [connectorId]: true }));
        setToolPreviewFailedIds((curr) => {
          if (curr[connectorId] === undefined) return curr;
          const nextFailed = { ...curr };
          delete nextFailed[connectorId];
          return nextFailed;
        });
      } else {
        setToolPreviewFailedIds((curr) => ({ ...curr, [connectorId]: toolPreviewRetryToken }));
      }
    } catch {
      setToolPreviewFailedIds((curr) => ({ ...curr, [connectorId]: toolPreviewRetryToken }));
    } finally {
      setToolPreviewLoadingIds((curr) => ({ ...curr, [connectorId]: false }));
    }
  }

  useEffect(() => {
    if (!detailConnector) return;
    if (!composioConfigured) return;
    if (hasLoadedAllAdvertisedConnectorTools(detailConnector)) return;
    if (toolPreviewFetchedIds[detailConnector.id]) return;
    if (toolPreviewFailedIds[detailConnector.id] === toolPreviewRetryToken) return;
    if (toolPreviewLoadingIds[detailConnector.id]) return;
    void hydrateToolPreview(detailConnector.id);
  }, [composioConfigured, detailConnector, toolPreviewFailedIds, toolPreviewFetchedIds, toolPreviewLoadingIds, toolPreviewRetryToken]);

  function openConnectorDetails(connectorId: string) {
    setToolPreviewFailedIds((curr) => {
      if (curr[connectorId] === undefined) return curr;
      const next = { ...curr };
      delete next[connectorId];
      return next;
    });
    setDetailConnectorId(connectorId);
  }

  async function cancelConnectorAuthorization(connectorId: string) {
    const connector = await cancelConnectorAuthorizationRequest(connectorId);
    if (connector) {
      updateConnector(connector);
      setConnectorAuthorizationCancelFailed((curr) => {
        if (curr[connectorId] === undefined) return curr;
        const next = { ...curr };
        delete next[connectorId];
        return next;
      });
      setConnectorAuthorizationPending((curr) => clearConnectorAuthorizationPending(curr, connectorId));
      return;
    }
    setConnectorAuthorizationCancelFailed((curr) => ({ ...curr, [connectorId]: true }));
  }

  return (
    <div className="tab-panel connectors-panel connectors-panel-embedded">
      <div className="tab-panel-toolbar">
        <div className="toolbar-left connectors-heading">
          <div>
            <h2>{t('connectors.title')}</h2>
            <p>{t('connectors.subtitle')}</p>
          </div>
        </div>
        <div className="toolbar-right">
          <div
            className="connectors-provider-tabs"
            role="tablist"
            aria-label="Connector provider"
          >
            {PROVIDER_TABS.map((provider) => {
              const active = provider.id === selectedProvider;
              return (
                <button
                  key={provider.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`connectors-provider-tab${active ? ' is-active' : ''}`}
                  onClick={() => setSelectedProvider(provider.id)}
                  data-testid={`connectors-provider-tab-${provider.id}`}
                >
                  {provider.label}
                </button>
              );
            })}
          </div>
          <div className="toolbar-search connectors-search">
            <span className="search-icon" aria-hidden>
              <Icon name="search" size={13} />
            </span>
            <input
              ref={searchInputRef}
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && filter) {
                  event.preventDefault();
                  event.stopPropagation();
                  setFilter('');
                }
              }}
              placeholder={t('connectors.searchPlaceholder')}
              aria-label={t('connectors.searchAriaLabel')}
              disabled={needsComposioKey}
              data-testid="connectors-search-input"
            />
            {hasQuery ? (
              <button
                type="button"
                className="toolbar-search-clear"
                aria-label={t('connectors.searchClear')}
                onClick={() => {
                  setFilter('');
                  searchInputRef.current?.focus();
                }}
                data-testid="connectors-search-clear"
              >
                <Icon name="close" size={12} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {loading ? (
        <CenteredLoader label={t('common.loading')} />
      ) : (
        <div
          className={`connector-grid-wrap${needsComposioKey ? ' is-masked' : ''}`}
          data-testid="connector-grid-wrap"
        >
          {hasNoResults && !needsComposioKey ? (
            <div
              className="tab-empty connectors-empty"
              role="status"
              aria-live="polite"
              data-testid="connectors-empty"
            >
              <p className="connectors-empty-title">
                {t('connectors.emptyNoMatchTitle', { query: filter.trim() })}
              </p>
              <p className="connectors-empty-body">{t('connectors.emptyNoMatchBody')}</p>
              <button
                type="button"
                className="ghost connectors-empty-action"
                onClick={() => {
                  setFilter('');
                  searchInputRef.current?.focus();
                }}
              >
                {t('connectors.emptyNoMatchAction')}
              </button>
            </div>
          ) : (
            <div
              className="connector-grid"
              aria-hidden={needsComposioKey || undefined}
            >
              {filteredConnectors.map((connector) => (
                <ConnectorCard
                  key={connector.id}
                  connector={connector}
                  disabled={needsComposioKey}
                  pendingAction={
                    pendingConnectorAction?.connectorId === connector.id
                      ? pendingConnectorAction.action
                      : null
                  }
                  authorizationPending={connectorAuthorizationPending[connector.id]}
                  authorizationCancelFailed={connectorAuthorizationCancelFailed[connector.id] === true}
                  toolsLoading={toolsLoading}
                  toolsLoaded={toolsLoaded}
                  logoTheme={logoTheme}
                  onConnect={(connectorId) => runConnectorAction(connectorId, 'connect')}
                  onDisconnect={(connectorId) => runConnectorAction(connectorId, 'disconnect')}
                  onCancelAuthorization={cancelConnectorAuthorization}
                  onOpenDetails={openConnectorDetails}
                />
              ))}
            </div>
          )}
          {needsComposioKey ? (
            <div
              className="connector-gate"
              role="region"
              aria-label={t('connectors.gateTitle')}
              data-testid="connector-gate"
            >
              <div className="connector-gate-card">
                <div className="connector-gate-icon" aria-hidden>
                  <Icon name="settings" size={20} />
                </div>
                <h3 className="connector-gate-title">{t('connectors.gateTitle')}</h3>
                <p className="connector-gate-body">{t('connectors.gateBody')}</p>
              </div>
            </div>
          ) : null}
        </div>
      )}
      {detailConnector ? (
        <ConnectorDetailDrawer
          connector={detailConnector}
          disabled={needsComposioKey}
          pendingAction={
            pendingConnectorAction?.connectorId === detailConnector.id
              ? pendingConnectorAction.action
              : null
          }
          authorizationPending={connectorAuthorizationPending[detailConnector.id]}
          authorizationCancelFailed={connectorAuthorizationCancelFailed[detailConnector.id] === true}
          toolsLoading={toolsLoading}
          toolsPreviewLoading={Boolean(toolPreviewLoadingIds[detailConnector.id])}
          toolsLoaded={
            Boolean(toolPreviewFetchedIds[detailConnector.id])
            || toolPreviewFailedIds[detailConnector.id] === toolPreviewRetryToken
            || hasLoadedAllAdvertisedConnectorTools(detailConnector)
          }
          logoTheme={logoTheme}
          onClose={() => setDetailConnectorId(null)}
          onConnect={(connectorId) => runConnectorAction(connectorId, 'connect')}
          onDisconnect={(connectorId) => runConnectorAction(connectorId, 'disconnect')}
          onCancelAuthorization={cancelConnectorAuthorization}
          onLoadMoreTools={(connectorId, cursor) => hydrateToolPreview(connectorId, cursor)}
        />
      ) : null}
    </div>
  );
}

function ConnectorCard({
  connector,
  disabled = false,
  pendingAction,
  authorizationPending,
  authorizationCancelFailed,
  toolsLoading: _toolsLoading,
  toolsLoaded,
  logoTheme,
  onConnect,
  onDisconnect,
  onCancelAuthorization,
  onOpenDetails,
}: {
  connector: ConnectorDetail;
  disabled?: boolean;
  pendingAction: 'connect' | 'disconnect' | null;
  authorizationPending?: ConnectorAuthorizationPending;
  authorizationCancelFailed: boolean;
  toolsLoading: boolean;
  toolsLoaded: boolean;
  logoTheme: 'light' | 'dark';
  onConnect: (connectorId: string) => Promise<void> | void;
  onDisconnect: (connectorId: string) => Promise<void> | void;
  onCancelAuthorization: (connectorId: string) => void;
  onOpenDetails: (connectorId: string) => void;
}) {
  const t = useT();
  const isConnecting = pendingAction === 'connect';
  const isDisconnecting = pendingAction === 'disconnect';
  const isConnected = connector.status === 'connected';
  const isAuthorizationPending = !isConnected && authorizationPending !== undefined;
  const isPending = pendingAction !== null || isAuthorizationPending;
  const canConnect = !disabled && !isPending && connector.status === 'available';
  const canDisconnect = !disabled && !isPending && isConnected;
  const toolCount = getConnectorDisplayToolCount(connector);
  const showToolsBadge = connector.toolCount !== undefined || connector.tools.length > 0 || toolsLoaded;
  const toolsBadgeLabel = formatToolsBadge(toolCount, t);
  const categoryLabel = connectorCategoryLabel(connector.category, t);

  function openDetails() {
    if (disabled) return;
    onOpenDetails(connector.id);
  }

  function onKeyActivate(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    openDetails();
  }

  function stop(event: SyntheticEvent) {
    event.stopPropagation();
  }

  return (
    <article
      className={`connector-card status-${connector.status}${disabled ? ' is-locked' : ''}`}
      data-connector-id={connector.id}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={t('connectors.openDetailsAria', { name: connector.name })}
      onClick={openDetails}
      onKeyDown={onKeyActivate}
    >
      <div className="connector-card-top">
        <ConnectorLogo connector={connector} theme={logoTheme} size="sm" />
        <div className="connector-card-head">
          {/* Title row composes the connector name with an inline
              connection dot when applicable, instead of putting the
              dot in the action column. The dot now reads as a small
              "live status" indicator anchored to the brand label,
              while the action column is reserved purely for the
              connect/disconnect controls and any error/disabled
              status chips. The name span carries the ellipsis so a
              long brand never crowds the dot out of the row. */}
          <h3 className="connector-card-title">
            <span className="connector-card-title-name">{connector.name}</span>
            {isConnected ? (
              <span
                className={`connector-status-dot connector-card-title-dot status-${connector.status}`}
                aria-label={statusLabel(connector.status, t)}
                title={statusLabel(connector.status, t)}
                role="img"
              />
            ) : isAuthorizationPending ? (
              <span
                className="connector-status-dot connector-card-title-dot status-pending"
                aria-label={t('connectors.authorizationPending')}
                title={t('connectors.authorizationPending')}
                role="img"
              />
            ) : null}
          </h3>
          {/* Two-row meta block. Splitting category and tools-badge onto
              their own rows keeps card heights deterministic — long
              category labels no longer push the badge to a new line in
              an unpredictable way, and the tools-badge slot reserves
              its row even before the async discovery resolves so the
              card doesn't grow when the badge appears. The category
              row truncates with ellipsis (one line); the badge row is
              a fixed-height anchor that the badge animates into. */}
          <div className="connector-meta">
            <span
              className="connector-meta-item connector-meta-category"
              title={categoryLabel}
            >
              {categoryLabel}
            </span>
            <span className="connector-meta-tools" aria-hidden={!showToolsBadge}>
              {showToolsBadge ? (
                <span className="connector-tools-badge is-ready" title={toolsBadgeLabel}>
                  <span>{toolsBadgeLabel}</span>
                </span>
              ) : null}
            </span>
          </div>
        </div>
        <div className="connector-card-actions">
          {isConnected ? (
            <button
              type="button"
              className={`icon-only connector-action is-disconnect${isDisconnecting ? ' is-loading' : ''}`}
              disabled={!canDisconnect}
              aria-busy={isDisconnecting || undefined}
              aria-label={t('connectors.disconnect')}
              title={t('connectors.disconnect')}
              tabIndex={disabled ? -1 : undefined}
              onMouseDown={stop}
              onKeyDown={stop}
              onClick={(e) => {
                stop(e);
                onDisconnect(connector.id);
              }}
            >
              <Icon name={isDisconnecting ? 'spinner' : 'close'} size={12} />
            </button>
          ) : (
            <button
              type="button"
              className={`icon-only connector-action is-connect${isConnecting || isAuthorizationPending ? ' is-loading' : ''}`}
              disabled={!canConnect}
              aria-busy={isConnecting || isAuthorizationPending || undefined}
              aria-label={isAuthorizationPending ? t('connectors.authorizationPending') : t('connectors.connect')}
              title={isAuthorizationPending ? t('connectors.authorizationPendingHint') : t('connectors.connect')}
              tabIndex={disabled ? -1 : undefined}
              onMouseDown={stop}
              onKeyDown={stop}
              onClick={(e) => {
                stop(e);
                onConnect(connector.id);
              }}
            >
              <Icon name={isConnecting || isAuthorizationPending ? 'spinner' : 'plus'} size={12} />
            </button>
          )}
          {isAuthorizationPending ? (
            <button
              type="button"
              className="icon-only connector-action is-cancel-authorization"
              aria-label={t('connectors.cancelAuthorization')}
              title={t('connectors.cancelAuthorization')}
              onMouseDown={stop}
              onKeyDown={stop}
              onClick={(e) => {
                stop(e);
                onCancelAuthorization(connector.id);
              }}
            >
              <Icon name="close" size={12} />
            </button>
          ) : null}
          {connector.status === 'error' || connector.status === 'disabled' ? (
            <span className={`connector-status-pill status-${connector.status}`}>
              {statusLabel(connector.status, t)}
            </span>
          ) : null}
        </div>
      </div>
      {authorizationCancelFailed ? (
        <p className="connector-authorization-hint connector-authorization-error" role="alert">
          {AUTHORIZATION_CANCEL_FAILED_MESSAGE}
        </p>
      ) : null}
    </article>
  );
}

function statusLabel(status: ConnectorDetail['status'], t: ReturnType<typeof useT>): string {
  switch (status) {
    case 'available':
      return t('connectors.statusAvailable');
    case 'connected':
      return t('connectors.statusConnected');
    case 'error':
      return t('connectors.statusError');
    case 'disabled':
      return t('connectors.statusDisabled');
  }
}

function connectorCategoryLabel(category: string, t: ReturnType<typeof useT>): string {
  const normalized = category.trim().toLowerCase();
  const key = CONNECTOR_CATEGORY_KEYS[normalized as keyof typeof CONNECTOR_CATEGORY_KEYS];
  return key ? t(key) : category;
}

function formatToolsBadge(count: number, t: ReturnType<typeof useT>): string {
  if (count === 0) return t('connectors.toolsBadgeNone');
  if (count === 1) return t('connectors.toolsBadgeOne', { n: count });
  return t('connectors.toolsBadgeMany', { n: count });
}

function ConnectorDetailDrawer({
  connector,
  disabled,
  pendingAction,
  authorizationPending,
  authorizationCancelFailed,
  toolsLoading,
  toolsPreviewLoading,
  toolsLoaded,
  logoTheme,
  onClose,
  onConnect,
  onDisconnect,
  onCancelAuthorization,
  onLoadMoreTools,
}: {
  connector: ConnectorDetail;
  disabled: boolean;
  pendingAction: 'connect' | 'disconnect' | null;
  authorizationPending?: ConnectorAuthorizationPending;
  authorizationCancelFailed: boolean;
  toolsLoading: boolean;
  toolsPreviewLoading: boolean;
  toolsLoaded: boolean;
  logoTheme: 'light' | 'dark';
  onClose: () => void;
  onConnect: (connectorId: string) => Promise<void> | void;
  onDisconnect: (connectorId: string) => Promise<void> | void;
  onCancelAuthorization: (connectorId: string) => void;
  onLoadMoreTools: (connectorId: string, cursor: string) => Promise<void> | void;
}) {
  const t = useT();
  const isConnected = connector.status === 'connected';
  const isConnecting = pendingAction === 'connect';
  const isDisconnecting = pendingAction === 'disconnect';
  const isAuthorizationPending = !isConnected && authorizationPending !== undefined;
  const isPending = pendingAction !== null || isAuthorizationPending;
  const canConnect = !disabled && !isPending && connector.status === 'available';
  const canDisconnect = !disabled && !isPending && isConnected;
  const accountLabel = getDisplayableConnectorAccountLabel(connector);
  const actualToolCount = connector.tools.length;
  const toolCount = getConnectorDisplayToolCount(connector);
  const isLoadingTools = toolsPreviewLoading || !toolsLoaded || (toolsLoading && actualToolCount === 0);
  const toolDetailsUnavailable = toolsLoaded && actualToolCount === 0 && toolCount > 0;
  const showToolsBadge = connector.toolCount !== undefined || actualToolCount > 0 || toolsLoaded;
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const categoryLabel = connectorCategoryLabel(connector.category, t);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    closeBtnRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const statusTone = isAuthorizationPending ? 'pending' : connector.status;

  return (
    <div
      className="connector-drawer-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className="connector-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connector-drawer-title"
        data-testid="connector-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="connector-drawer-head">
          <ConnectorLogo connector={connector} theme={logoTheme} size="lg" />
          <div className="connector-drawer-titles">
            <div className="connector-drawer-eyebrow">
              <span>{categoryLabel}</span>
              <span className="connector-meta-dot" aria-hidden>·</span>
              <span>{connector.provider}</span>
            </div>
            <h2 id="connector-drawer-title">{connector.name}</h2>
            <div className="connector-drawer-status">
              <span className={`connector-status-pill status-${statusTone}`}>
                <span className="connector-status-dot" aria-hidden />
                {isAuthorizationPending ? t('connectors.authorizationPending') : statusLabel(connector.status, t)}
              </span>
              {showToolsBadge ? (
                <span className="connector-tools-badge is-ready" title={formatToolsBadge(toolCount, t)}>
                  <Icon name="settings" size={10} />
                  <span>{formatToolsBadge(toolCount, t)}</span>
                </span>
              ) : null}
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="ghost connector-drawer-close"
            onClick={onClose}
            aria-label={t('common.close')}
            data-testid="connector-drawer-close"
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="connector-drawer-body">
          {connector.description ? (
            <section className="connector-drawer-section">
              <h3 className="connector-drawer-section-title">{t('connectors.aboutLabel')}</h3>
              <p className="connector-drawer-description">{connector.description}</p>
              {isAuthorizationPending ? (
                <p className="connector-authorization-hint" role="status">
                  {t('connectors.authorizationPendingHint')}
                </p>
              ) : null}
            </section>
          ) : null}
          {authorizationCancelFailed ? (
            <p className="connector-authorization-hint connector-authorization-error" role="alert">
              {AUTHORIZATION_CANCEL_FAILED_MESSAGE}
            </p>
          ) : null}

          <section className="connector-drawer-section">
            <h3 className="connector-drawer-section-title">{t('connectors.detailsLabel')}</h3>
            <dl className="connector-drawer-details">
              <div>
                <dt>{t('connectors.statusLabel')}</dt>
                <dd>{statusLabel(connector.status, t)}</dd>
              </div>
              <div>
                <dt>{t('connectors.categoryLabel')}</dt>
                <dd>{categoryLabel}</dd>
              </div>
              <div>
                <dt>{t('connectors.providerLabel')}</dt>
                <dd>{connector.provider}</dd>
              </div>
              {accountLabel ? (
                <div>
                  <dt>{t('connectors.account')}</dt>
                  <dd>{accountLabel}</dd>
                </div>
              ) : null}
              {connector.lastError ? (
                <div className="connector-drawer-details-error">
                  <dt>{t('connectors.statusError')}</dt>
                  <dd>{connector.lastError}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="connector-drawer-section">
            <h3 className="connector-drawer-section-title">
              {t('connectors.toolsSection')} <span className="connector-drawer-count">{toolCount}</span>
            </h3>
            {isLoadingTools ? (
              <p className="connector-drawer-empty"><Icon name="spinner" size={12} /> {t('connectors.toolsLoading')}</p>
            ) : toolDetailsUnavailable ? (
              <p className="connector-drawer-empty">{t('connectors.toolDetailsUnavailable', { n: toolCount })}</p>
            ) : actualToolCount === 0 ? (
              <p className="connector-drawer-empty">{t('connectors.noToolsAvailable')}</p>
            ) : (
              <>
                <ul className="connector-drawer-tools">
                  {connector.tools.map((tool) => (
                    <li key={tool.name} className="connector-drawer-tool">
                      <div className="connector-drawer-tool-head">
                        <span className="connector-drawer-tool-title">{tool.title || tool.name}</span>
                        <span
                          className={`connector-drawer-tool-badge side-${tool.safety.sideEffect}`}
                          title={tool.safety.reason}
                        >
                          {tool.safety.sideEffect}
                        </span>
                      </div>
                      {tool.description ? (
                        <p className="connector-drawer-tool-desc">{tool.description}</p>
                      ) : null}
                      <code className="connector-drawer-tool-name">{tool.name}</code>
                    </li>
                  ))}
                </ul>
                {connector.toolsNextCursor ? (
                  <button
                    type="button"
                    className="ghost connector-drawer-load-more"
                    disabled={toolsPreviewLoading}
                    onClick={() => onLoadMoreTools(connector.id, connector.toolsNextCursor!)}
                  >
                    {toolsPreviewLoading ? <Icon name="spinner" size={12} /> : null}
                    <span>{t('connectors.loadMoreTools')}</span>
                  </button>
                ) : null}
              </>
            )}
          </section>
        </div>

        <footer className="connector-drawer-foot">
          {isConnected ? (
            <button
              type="button"
              className={`ghost connector-action is-disconnect${isDisconnecting ? ' is-loading' : ''}`}
              disabled={!canDisconnect}
              aria-busy={isDisconnecting || undefined}
              onClick={() => onDisconnect(connector.id)}
            >
              {isDisconnecting ? <Icon name="spinner" size={12} /> : null}
              <span>{t('connectors.disconnect')}</span>
            </button>
          ) : (
            <button
              type="button"
              className={`primary connector-action is-connect${isConnecting || isAuthorizationPending ? ' is-loading' : ''}`}
              disabled={!canConnect}
              aria-busy={isConnecting || isAuthorizationPending || undefined}
              onClick={() => onConnect(connector.id)}
            >
              {isConnecting || isAuthorizationPending ? <Icon name="spinner" size={12} /> : null}
              <span>{isAuthorizationPending ? t('connectors.authorizationPending') : t('connectors.connect')}</span>
            </button>
          )}
          {isAuthorizationPending ? (
            <button
              type="button"
              className="ghost connector-action is-cancel-authorization"
              onClick={() => onCancelAuthorization(connector.id)}
            >
              <span>{t('connectors.cancelAuthorization')}</span>
            </button>
          ) : null}
        </footer>
      </aside>
    </div>
  );
}

function getDisplayableConnectorAccountLabel(connector: ConnectorDetail): string | undefined {
  if (!connector.accountLabel) return undefined;
  const provider = connector.auth?.provider ?? connector.provider.toLowerCase();
  if (provider === 'composio') return undefined;
  return connector.accountLabel;
}
