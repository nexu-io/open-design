import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Button } from '@open-design/components';
import { Icon, type IconName } from './Icon';
import { ConnectorLogo, useResolvedTheme } from './ConnectorLogo';
import { useT } from '../i18n';

type Translate = ReturnType<typeof useT>;
import { renderMarkdown } from '../runtime/markdown';
import type {
  ConnectorDetail,
  ConnectorDiscoveryResponse,
  ConnectorMemorySuggestionResponse,
  ConnectorStatusResponse,
  MemoryChangeEvent,
  MemoryEntry,
  MemoryEntrySummary,
  MemoryExtractionEvent,
  MemoryExtractionRecord,
  MemoryExtractionSkipReason,
  MemoryExtractionsResponse,
  MemoryListResponse,
  MemoryTreeListResponse,
  MemoryTreeNode,
  MemorySuggestion,
  MemoryType,
} from '@open-design/contracts';
import {
  connectConnector,
  fetchConnectorStatuses,
} from '../providers/registry';

const TYPES: MemoryType[] = ['user', 'feedback', 'project', 'reference'];

interface DraftEntry {
  id?: string;
  name: string;
  description: string;
  type: MemoryType;
  body: string;
}

const EMPTY_DRAFT: DraftEntry = {
  name: '',
  description: '',
  type: 'user',
  body: '',
};

// Small uppercase caption used above each form field. Centralised so
// every field renders with the same color/letter-spacing/baseline; this
// is what gives the editor a Settings-form rhythm rather than a stack
// of unlabelled inputs.
const FIELD_LABEL_STYLE: CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  color: 'var(--text-muted, #888)',
  marginBottom: 4,
};

// Click-to-prefill examples shown above the editor when creating a new
// memory. Three starters cover the most common reasons a person writes
// a memory by hand: tell the assistant about themselves, lock in a
// repeated UI/output preference, or pin the current project. The
// strings live behind i18n keys so each chip stays localized.
const STARTERS: ReadonlyArray<{
  type: MemoryType;
  nameKey: 'settings.memoryStarterUserName' | 'settings.memoryStarterFeedbackName' | 'settings.memoryStarterProjectName';
  descKey: 'settings.memoryStarterUserDesc' | 'settings.memoryStarterFeedbackDesc' | 'settings.memoryStarterProjectDesc';
  bodyKey: 'settings.memoryStarterUserBody' | 'settings.memoryStarterFeedbackBody' | 'settings.memoryStarterProjectBody';
}> = [
  {
    type: 'user',
    nameKey: 'settings.memoryStarterUserName',
    descKey: 'settings.memoryStarterUserDesc',
    bodyKey: 'settings.memoryStarterUserBody',
  },
  {
    type: 'feedback',
    nameKey: 'settings.memoryStarterFeedbackName',
    descKey: 'settings.memoryStarterFeedbackDesc',
    bodyKey: 'settings.memoryStarterFeedbackBody',
  },
  {
    type: 'project',
    nameKey: 'settings.memoryStarterProjectName',
    descKey: 'settings.memoryStarterProjectDesc',
    bodyKey: 'settings.memoryStarterProjectBody',
  },
];

const MEMORY_CONNECTOR_APP_IDS = [
  'notion',
  'figma',
  'linear',
  'google_drive',
  'github',
  'slack',
] as const;

const MEMORY_CONNECTOR_APP_LABELS: Record<string, string> = {
  notion: 'Notion',
  figma: 'Figma',
  linear: 'Linear',
  google_drive: 'Google Drive',
  github: 'GitHub',
  slack: 'Slack',
};

type ConnectorMemoryAttempt = ConnectorMemorySuggestionResponse['connectors'][number];
type ConnectorStatusMap = ConnectorStatusResponse['statuses'];

const CONNECTOR_CALLBACK_MESSAGE_TYPE = 'open-design:connector-connected';
const MEMORY_CONNECTOR_PENDING_AUTH_STORAGE_KEY = 'od:memory:pending-connector-auth';

function isTrustedConnectorCallbackOrigin(origin: string): boolean {
  const expectedOrigin = typeof window === 'undefined' ? '' : window.location.origin;
  if (origin === expectedOrigin) return true;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return (
      url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
      || url.hostname === '[::1]'
      || url.hostname === '::1'
    );
  } catch {
    return false;
  }
}

function readPendingConnectorAuthIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(MEMORY_CONNECTOR_PENDING_AUTH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0));
  } catch {
    return new Set();
  }
}

function writePendingConnectorAuthIds(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    if (ids.size === 0) {
      window.sessionStorage.removeItem(MEMORY_CONNECTOR_PENDING_AUTH_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(
      MEMORY_CONNECTOR_PENDING_AUTH_STORAGE_KEY,
      JSON.stringify([...ids]),
    );
  } catch {
    // Session storage can be blocked; the in-memory state still works.
  }
}

async function fetchMemoryList(): Promise<MemoryListResponse> {
  const resp = await fetch('/api/memory');
  if (!resp.ok) {
    return {
      enabled: true,
      chatExtractionEnabled: true,
      rootDir: '',
      index: '',
      entries: [],
      extraction: null,
    };
  }
  return (await resp.json()) as MemoryListResponse;
}

async function fetchMemoryTree(): Promise<MemoryTreeNode[]> {
  const resp = await fetch('/api/memory/tree');
  if (!resp.ok) return [];
  const json = (await resp.json()) as MemoryTreeListResponse;
  return json.tree ?? [];
}

async function fetchMemoryEntry(id: string): Promise<MemoryEntry | null> {
  const resp = await fetch(`/api/memory/${encodeURIComponent(id)}`);
  if (!resp.ok) return null;
  const json = (await resp.json()) as { entry: MemoryEntry };
  return json.entry ?? null;
}

async function saveMemoryEntry(draft: DraftEntry): Promise<MemoryEntry | null> {
  const url = draft.id
    ? `/api/memory/${encodeURIComponent(draft.id)}`
    : '/api/memory';
  const resp = await fetch(url, {
    method: draft.id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
  if (!resp.ok) return null;
  const json = (await resp.json()) as { entry: MemoryEntry };
  return json.entry ?? null;
}

function memoryEntryIdForConnectorSuggestion(suggestion: MemorySuggestion): string | undefined {
  return /^[a-z0-9_]+$/.test(suggestion.id) ? suggestion.id : undefined;
}

async function deleteMemoryEntry(id: string): Promise<boolean> {
  const resp = await fetch(`/api/memory/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return resp.ok;
}

async function saveMemoryIndex(index: string): Promise<boolean> {
  const resp = await fetch('/api/memory/index', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index }),
  });
  return resp.ok;
}

async function setMemoryEnabled(enabled: boolean): Promise<boolean> {
  const resp = await fetch('/api/memory/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  return resp.ok;
}

async function setMemoryChatExtractionEnabled(
  chatExtractionEnabled: boolean,
): Promise<boolean> {
  const resp = await fetch('/api/memory/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatExtractionEnabled }),
  });
  return resp.ok;
}

async function fetchExtractions(): Promise<MemoryExtractionRecord[]> {
  const resp = await fetch('/api/memory/extractions');
  if (!resp.ok) return [];
  const json = (await resp.json()) as MemoryExtractionsResponse;
  return json.extractions ?? [];
}

async function fetchMemoryConnectors(): Promise<ConnectorDetail[]> {
  const resp = await fetch('/api/connectors/discovery?hydrateTools=false');
  if (!resp.ok) return [];
  const json = (await resp.json()) as ConnectorDiscoveryResponse;
  return json.connectors ?? [];
}

async function suggestConnectorMemories(
  connectorIds: string[],
  context: { chatAgentId?: string | null; chatModel?: string | null } = {},
): Promise<ConnectorMemorySuggestionResponse | null> {
  const body: {
    connectorIds: string[];
    chatAgentId?: string;
    chatModel?: string;
  } = { connectorIds };
  if (context.chatAgentId) body.chatAgentId = context.chatAgentId;
  if (context.chatModel) body.chatModel = context.chatModel;
  const resp = await fetch('/api/memory/connectors/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) return null;
  return (await resp.json()) as ConnectorMemorySuggestionResponse;
}

function describeConnectorReadIssue(
  result: ConnectorMemorySuggestionResponse,
): string | null {
  const failed = result.connectors.filter((connector) => connector.status === 'failed');
  const skipped = result.connectors.filter((connector) => connector.status === 'skipped');
  const firstIssue = failed[0] ?? skipped[0];
  if (!firstIssue) return null;

  const connectorName =
    firstIssue.connectorName
    || MEMORY_CONNECTOR_APP_LABELS[firstIssue.connectorId]
    || firstIssue.connectorId;
  const reason = (firstIssue.error || firstIssue.summary || '').trim();
  const suffix = reason ? ` ${reason}` : '';

  if (failed.length > 0) {
    return `Couldn't read ${connectorName}.${suffix}`;
  }
  return `No readable content from ${connectorName}.${suffix}`;
}

interface FriendlyExtractionFailure {
  title: string;
  detail: string;
  action?: string;
}

function providerDisplayName(provider: MemoryExtractionRecord['provider'] | undefined): string {
  if (provider?.credentialSource === 'chat-cli') {
    if (provider.kind === 'anthropic') return 'Claude Code';
    return 'Local CLI';
  }
  switch (provider?.kind) {
    case 'anthropic':
      return 'Anthropic';
    case 'azure':
      return 'Azure OpenAI';
    case 'google':
      return 'Google Gemini';
    case 'ollama':
      return 'Ollama';
    case 'openai':
      return 'OpenAI';
    default:
      return 'Memory model';
  }
}

function parseProviderError(raw: string): { message: string; code: string; status: number | null } {
  const jsonStart = raw.indexOf('{');
  let message = raw.trim();
  let code = '';
  let status: number | null = null;

  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart));
      const error = parsed?.error;
      if (typeof error?.message === 'string') message = error.message;
      else if (typeof parsed?.message === 'string') message = parsed.message;
      if (typeof error?.code === 'string') code = error.code;
      else if (typeof parsed?.code === 'string') code = parsed.code;
      if (typeof parsed?.status === 'number') status = parsed.status;
      else if (typeof error?.status === 'number') status = error.status;
    } catch {
      // Fall through to regex parsing below.
    }
  }

  const statusMatch = /\b(4\d\d|5\d\d)\b/.exec(raw);
  if (status === null && statusMatch?.[1]) status = Number(statusMatch[1]);

  return {
    message: message.replace(/\s+/g, ' ').trim(),
    code,
    status,
  };
}

function describeExtractionFailure(record: MemoryExtractionRecord): FriendlyExtractionFailure | null {
  if (record.phase !== 'failed' || !record.error) return null;
  const providerName = providerDisplayName(record.provider);
  const usesChatCli = record.provider?.credentialSource === 'chat-cli';
  const parsed = parseProviderError(record.error);
  const haystack = `${parsed.message} ${parsed.code} ${record.error}`.toLowerCase();
  const source =
    record.kind === 'connector'
      ? 'Connected apps were read, but OpenDesign could not turn that context into memory.'
      : 'OpenDesign could not run memory extraction for this chat.';

  if (
    parsed.status === 401
    || /token[_ -]?expired|authentication token has expired|invalid[_ -]?api[_ -]?key|unauthorized/.test(haystack)
  ) {
    return {
      title: `${providerName} authentication expired`,
      detail: source,
      action: usesChatCli
        ? 'Sign in to the selected Local CLI or choose a different Memory model.'
        : 'Update the Memory extraction model key or sign in again.',
    };
  }

  if (parsed.status === 429 || /rate limit|quota|too many requests|insufficient_quota/.test(haystack)) {
    return {
      title: `${providerName} quota or rate limit hit`,
      detail: source,
      action: 'Try again later or switch the Memory extraction model.',
    };
  }

  if (/network|fetch failed|timeout|timed out|econnreset|enotfound/.test(haystack)) {
    return {
      title: `${providerName} request failed`,
      detail: source,
      action: usesChatCli
        ? 'Check the selected Local CLI and try again.'
        : 'Check the model provider connection and try again.',
    };
  }

  return {
    title: 'Memory extraction failed',
    detail: parsed.message || source,
    action: usesChatCli
      ? 'Try again after checking the selected Local CLI.'
      : 'Try again after checking the Memory extraction model settings.',
  };
}

function formatConnectorContextBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'No data';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function connectorAttemptName(attempt: ConnectorMemoryAttempt): string {
  return attempt.connectorName
    || MEMORY_CONNECTOR_APP_LABELS[attempt.connectorId]
    || attempt.connectorId;
}

function connectorAttemptTitle(attempt: ConnectorMemoryAttempt): string {
  const connectorName = connectorAttemptName(attempt);
  if (attempt.status === 'succeeded') return `Read ${connectorName}`;
  if (attempt.status === 'failed') return `Could not read ${connectorName}`;
  return `Skipped ${connectorName}`;
}

function connectorAttemptDetail(attempt: ConnectorMemoryAttempt): string {
  const parts = [
    attempt.toolTitle || attempt.toolName,
    attempt.status === 'failed' ? attempt.error : null,
    attempt.summary,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.join(' · ');
}

function mergeMemoryConnector(current: ConnectorDetail, next: ConnectorDetail): ConnectorDetail {
  return {
    ...current,
    ...next,
    tools: next.tools.length > 0 ? next.tools : current.tools,
    toolCount: next.toolCount ?? current.toolCount,
    toolsNextCursor: next.toolsNextCursor ?? current.toolsNextCursor,
    toolsHasMore: next.toolsHasMore ?? current.toolsHasMore,
  };
}

function upsertMemoryConnector(
  current: ConnectorDetail[],
  next: ConnectorDetail | null,
): ConnectorDetail[] {
  if (!next) return current;
  let found = false;
  const merged = current.map((connector) => {
    if (connector.id !== next.id) return connector;
    found = true;
    return mergeMemoryConnector(connector, next);
  });
  return found ? merged : [...merged, next];
}

function applyMemoryConnectorStatus(
  connector: ConnectorDetail,
  status: ConnectorStatusMap[string],
): ConnectorDetail {
  const { accountLabel: _accountLabel, lastError: _lastError, ...base } = connector;
  return { ...base, ...status };
}

function applyMemoryConnectorStatuses(
  current: ConnectorDetail[],
  statuses: ConnectorStatusMap,
): ConnectorDetail[] {
  if (Object.keys(statuses).length === 0) return current;
  return current.map((connector) => {
    const status = statuses[connector.id];
    if (!status) return connector;
    return applyMemoryConnectorStatus(connector, status);
  });
}

function connectorWithPendingAuthorization(connector: ConnectorDetail): ConnectorDetail {
  const { accountLabel: _accountLabel, lastError: _lastError, ...base } = connector;
  return {
    ...base,
    status: base.status === 'disabled' ? 'disabled' : 'available',
  };
}

// Drop one extraction row server-side. Returns true on a 2xx — the
// listing always re-fetches from the SSE stream, so the UI doesn't need
// the new state back here.
async function deleteExtraction(id: string): Promise<boolean> {
  const resp = await fetch(
    `/api/memory/extractions/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  return resp.ok;
}

async function clearExtractionHistory(): Promise<boolean> {
  const resp = await fetch('/api/memory/extractions', { method: 'DELETE' });
  return resp.ok;
}

// Map a record back to a single human label for the small badge that
// appears next to the row's preview text. Centralised so phase + skip
// reason render consistently across the empty banner and the list.
//
// `tone` only covers the four phases we actually render in the list —
// the `'deleted'` and `'cleared'` pseudo-phases ride the SSE channel
// and never show up in `extractions[]`, so they're filtered out before
// reaching describeRecord. We fall back to 'skipped' defensively in
// case a daemon-side regression sneaks one through.
function describeRecord(
  record: MemoryExtractionRecord,
  t: Translate,
): {
  phaseLabel: string;
  reasonLabel: string | null;
  kindLabel: string;
  tone: 'running' | 'success' | 'skipped' | 'failed';
} {
  const tone: 'running' | 'success' | 'skipped' | 'failed' =
    record.phase === 'running'
    || record.phase === 'success'
    || record.phase === 'failed'
      ? record.phase
      : 'skipped';
  const phaseLabel = (() => {
    switch (record.phase) {
      case 'running':
        return t('settings.memoryExtractionPhaseRunning');
      case 'success':
        return t('settings.memoryExtractionPhaseSuccess');
      case 'skipped':
        return t('settings.memoryExtractionPhaseSkipped');
      case 'failed':
        return t('settings.memoryExtractionPhaseFailed');
      default:
        return record.phase;
    }
  })();
  const reasonLabel = (() => {
    if (record.phase !== 'skipped') return null;
    const reason: MemoryExtractionSkipReason | undefined = record.reason;
    if (reason === 'no-provider') return t('settings.memoryExtractionSkipNoProvider');
    if (reason === 'memory-disabled') return t('settings.memoryExtractionSkipDisabled');
    if (reason === 'chat-disabled') return 'Chat conversation learning is off.';
    if (reason === 'empty-message') return t('settings.memoryExtractionSkipEmpty');
    if (reason === 'no-match') return t('settings.memoryExtractionSkipNoMatch');
    return null;
  })();
  // Records written before the `kind` field existed default to 'llm' —
  // that was the only writer at the time, so labelling them as such
  // keeps the history list legible after upgrading.
  const kind = record.kind ?? 'llm';
  const kindLabel =
    kind === 'heuristic'
      ? t('settings.memoryExtractionKindHeuristic')
      : kind === 'connector'
        ? 'Connected apps'
      : t('settings.memoryExtractionKindLlm');
  return { phaseLabel, reasonLabel, kindLabel, tone };
}

function formatRelativeTime(at: number, now: number): string {
  const delta = Math.max(0, now - at);
  if (delta < 60_000) return `${Math.round(delta / 1000)}s`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h`;
  return `${Math.round(delta / 86_400_000)}d`;
}

// Wall-clock timestamp shown next to the relative age. The user asked
// to "see when each extraction started" — relative ages on their own
// drift after the panel sits open for a few minutes, and "5m" gives no
// hint about whether that 5m was during today's session or a stale row
// from yesterday. We omit the date for same-day rows so the line stays
// short, and tack on the date for older rows.
function formatAbsoluteTime(at: number, now: number): string {
  const date = new Date(at);
  const today = new Date(now);
  const sameDay =
    date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
  const time = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  if (sameDay) return time;
  const day = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return `${day} ${time}`;
}

function formatDuration(record: MemoryExtractionRecord): string | null {
  if (!record.finishedAt) return null;
  const ms = Math.max(0, record.finishedAt - record.startedAt);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}

function formatRelativeTimeAgo(at: number, now: number): string {
  const relative = formatRelativeTime(at, now);
  return relative === '0s' ? 'just now' : `${relative} ago`;
}

function memoryCountLabel(count: number): string {
  return count === 1 ? 'memory' : 'memories';
}

function extractionCardTitle(record: MemoryExtractionRecord, t: Translate): string {
  const kind = record.kind ?? 'llm';
  if (kind !== 'connector') {
    return record.userMessagePreview || t('settings.memoryExtractions');
  }

  if (record.phase === 'running') return 'Scanning connected apps';
  if (record.phase === 'failed') return 'Connected app scan failed';
  if (record.phase === 'skipped') return 'Connected app scan skipped';

  if (record.phase === 'success') {
    const writtenCount =
      typeof record.writtenCount === 'number' ? record.writtenCount : null;
    if (writtenCount && writtenCount > 0) {
      return `Saved ${writtenCount} ${memoryCountLabel(writtenCount)}`;
    }
    return 'No new memories found';
  }

  return 'Connected app scan';
}

function extractionCardMeta(
  record: MemoryExtractionRecord,
  now: number,
  t: Translate,
): string {
  const kind = record.kind ?? 'llm';
  const age = formatRelativeTimeAgo(record.startedAt, now);
  if (kind === 'connector') {
    if (record.phase === 'running') return 'Checking selected apps';
    if (record.phase === 'failed') return `Needs attention · ${age}`;
    if (record.phase === 'skipped') return `Skipped · ${age}`;
    if (record.phase === 'success') {
      const writtenCount =
        typeof record.writtenCount === 'number' ? record.writtenCount : null;
      const result =
        writtenCount && writtenCount > 0
          ? 'From connected apps'
          : 'Checked selected apps';
      return `${result} · ${age}`;
    }
    return `Connected apps · ${age}`;
  }

  const duration = formatDuration(record);
  const parts = [
    formatAbsoluteTime(record.startedAt, now),
    formatRelativeTime(record.startedAt, now),
  ];
  if (duration) parts.push(`${t('settings.memoryExtractionDuration')} ${duration}`);
  if (record.phase === 'success' && typeof record.writtenCount === 'number') {
    parts.push(`${record.writtenCount} ${t('settings.memoryExtractionWritten')}`);
  }
  return parts.join(' · ');
}

type FlashKind = 'created' | 'saved' | 'deleted' | 'indexSaved' | 'pathCopied';
type MemoryTab = 'manual' | 'chat' | 'connected';

interface MemorySectionProps {
  onOpenConnectors?: () => void;
  chatAgentId?: string | null;
  chatModel?: string | null;
}

export function MemorySection({
  onOpenConnectors,
  chatAgentId = null,
  chatModel = null,
}: MemorySectionProps = {}) {
  const t = useT();
  const logoTheme = useResolvedTheme();
  const [enabled, setEnabled] = useState(true);
  const [chatExtractionEnabled, setChatExtractionEnabled] = useState(true);
  const [rootDir, setRootDir] = useState('');
  const [index, setIndex] = useState('');
  const [indexDraft, setIndexDraft] = useState<string | null>(null);
  const [entries, setEntries] = useState<MemoryEntrySummary[]>([]);
  const [memoryTree, setMemoryTree] = useState<MemoryTreeNode[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewBody, setPreviewBody] = useState<string | null>(null);
  const [editing, setEditing] = useState<DraftEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | MemoryType>('all');
  const [activeTab, setActiveTab] = useState<MemoryTab>('manual');
  // Brief inline confirmation after a manual save/create/delete. The
  // form vanishes on success and the existing list re-renders, but
  // those signals are subtle — a 1.8s pill makes "your click did
  // something" obvious without the heavyweight global toast.
  const [flash, setFlash] = useState<{ kind: FlashKind; key: number } | null>(
    null,
  );
  const editorRef = useRef<HTMLDivElement | null>(null);
  const editorNameRef = useRef<HTMLInputElement | null>(null);
  const editingTarget = editing?.id ?? (editing ? 'new' : null);
  // Recent LLM-extraction attempts, newest first. Driven by a one-shot
  // fetch on mount + live SSE updates merged by id so phase transitions
  // (running → success) replace the row in place.
  const [extractions, setExtractions] = useState<MemoryExtractionRecord[]>([]);
  const [connectors, setConnectors] = useState<ConnectorDetail[]>([]);
  const [connectorStatuses, setConnectorStatuses] = useState<ConnectorStatusMap>({});
  const [connectorsLoading, setConnectorsLoading] = useState(true);
  const [selectedConnectorIds, setSelectedConnectorIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [connectorExtracting, setConnectorExtracting] = useState(false);
  const [connectorSaving, setConnectorSaving] = useState(false);
  const [connectorSuggestions, setConnectorSuggestions] = useState<MemorySuggestion[]>([]);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [connectorAttempts, setConnectorAttempts] = useState<ConnectorMemoryAttempt[]>([]);
  const [connectorContextBytes, setConnectorContextBytes] = useState(0);
  const [connectorStatus, setConnectorStatus] = useState<string | null>(null);
  const [connectorError, setConnectorError] = useState<string | null>(null);
  const [connectingConnectorIds, setConnectingConnectorIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingConnectorAuthIds, setPendingConnectorAuthIds] = useState<Set<string>>(
    readPendingConnectorAuthIds,
  );
  const [connectorConnectErrors, setConnectorConnectErrors] = useState<Record<string, string>>({});

  const fireFlash = useCallback((kind: FlashKind) => {
    setFlash({ kind, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(id);
  }, [flash]);

  useEffect(() => {
    if (!editingTarget) return;
    editorRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    editorNameRef.current?.focus({ preventScroll: true });
  }, [editingTarget]);

  const flashLabel = useMemo<Record<FlashKind, string>>(
    () => ({
      created: t('settings.memoryFlashCreated'),
      saved: t('settings.memoryFlashSaved'),
      deleted: t('settings.memoryFlashDeleted'),
      indexSaved: t('settings.memoryFlashIndexSaved'),
      pathCopied: t('settings.memoryFlashPathCopied'),
    }),
    [t],
  );

  const onCopyPath = useCallback(async () => {
    if (!rootDir) return;
    try {
      await navigator.clipboard.writeText(rootDir);
      fireFlash('pathCopied');
    } catch {
      // Some sandboxed contexts block clipboard writes silently. Fall
      // back to a transient input so the user can still grab the path
      // with a manual select-all + copy.
      const input = document.createElement('input');
      input.value = rootDir;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      fireFlash('pathCopied');
    }
  }, [rootDir, fireFlash]);

  const TYPE_LABEL: Record<MemoryType, string> = useMemo(
    () => ({
      user: t('settings.memoryTypeUser'),
      feedback: t('settings.memoryTypeFeedback'),
      project: t('settings.memoryTypeProject'),
      reference: t('settings.memoryTypeReference'),
    }),
    [t],
  );

  const reload = useCallback(async () => {
    const [list, tree] = await Promise.all([
      fetchMemoryList(),
      fetchMemoryTree(),
    ]);
    setEnabled(list.enabled);
    setChatExtractionEnabled(list.chatExtractionEnabled !== false);
    setRootDir(list.rootDir);
    setIndex(list.index);
    setEntries(list.entries);
    setMemoryTree(tree);
  }, []);

  const reloadExtractions = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const next = await fetchExtractions();
      setExtractions(next);
      return next;
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const reloadConnectors = useCallback(async () => {
    setConnectorsLoading(true);
    try {
      const statusesPromise = fetchConnectorStatuses();
      const connectorsPromise = fetchMemoryConnectors();
      const statuses = await statusesPromise;
      setConnectorStatuses(statuses);
      setConnectors((prev) => applyMemoryConnectorStatuses(prev, statuses));
      setConnectors(applyMemoryConnectorStatuses(await connectorsPromise, statuses));
    } finally {
      setConnectorsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    void reloadExtractions();
  }, [reload, reloadExtractions]);

  useEffect(() => {
    if (activeTab !== 'connected') return;
    void reloadConnectors();
  }, [activeTab, reloadConnectors]);

  useEffect(() => {
    writePendingConnectorAuthIds(pendingConnectorAuthIds);
  }, [pendingConnectorAuthIds]);

  // Live updates: when the daemon emits a memory change event (chat
  // hook, LLM extractor, settings PATCH from a different tab, curl…),
  // re-fetch the list so what the user sees stays in sync. We
  // deliberately ignore events the user just triggered themselves
  // (manual upserts/deletes via this same panel) by listening only to
  // the broader signals — the local code already updated state
  // optimistically, but a re-fetch keeps mtime / index in sync anyway,
  // so we just always reload on any change. EventSource auto-reconnects
  // on temporary daemon hiccups.
  useEffect(() => {
    const es = new EventSource('/api/memory/events');
    es.addEventListener('change', (raw) => {
      try {
        const ev = JSON.parse((raw as MessageEvent).data) as MemoryChangeEvent;
        // Don't reload if the event payload is just a connection ping.
        if (!ev || !ev.kind) return;
        void reload();
      } catch {
        // Malformed — ignore.
      }
    });
    es.addEventListener('extraction', (raw) => {
      try {
        const ev = JSON.parse((raw as MessageEvent).data) as MemoryExtractionEvent;
        if (!ev || !ev.id) return;
        // Pseudo-phases: the daemon emits these synthetically when a
        // row is dropped from the buffer, either by the manual delete
        // button per row or by the "Clear" affordance at the top.
        if (ev.phase === 'cleared') {
          setExtractions([]);
          return;
        }
        if (ev.phase === 'deleted') {
          setExtractions((prev) => prev.filter((r) => r.id !== ev.id));
          return;
        }
        // Merge by id: phase transitions for an in-flight attempt
        // collapse onto a single row instead of stacking N entries
        // for the same attempt. New ids are unshifted so the latest
        // appears at the top.
        setExtractions((prev) => {
          const existing = prev.findIndex((r) => r.id === ev.id);
          if (existing >= 0) {
            const next = prev.slice();
            next[existing] = ev;
            return next;
          }
          return [ev, ...prev].slice(0, 30);
        });
      } catch {
        // Malformed — ignore.
      }
    });
    return () => {
      es.close();
    };
  }, [reload]);

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((e) => e.type === filter);
  }, [entries, filter]);

  // The "no API key" banner only shows when the most recent attempt
  // skipped for that specific reason. We don't show it for
  // memory-disabled (the user's own toggle) or empty-message (a
  // routine no-op on tool-only turns); those skips just appear in the
  // history list with a muted subtitle.
  const showNoProviderBanner = useMemo(() => {
    const latest = extractions[0];
    return Boolean(
      latest && latest.phase === 'skipped' && latest.reason === 'no-provider',
    );
  }, [extractions]);

  // Now-clock for relative timestamps in the extraction list. Refresh
  // every 30s so "12s ago" doesn't get stuck reading "12s ago" five
  // minutes after the user opened the panel. Using state (not a ref)
  // keeps the re-render in the React scheduler.
  const [nowClock, setNowClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowClock(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

	  const connectorExtractions = useMemo(
	    () => extractions.filter((record) => record.kind === 'connector'),
	    [extractions],
  );
  const visibleExtractions = useMemo(
    () =>
      filter === 'all'
        ? extractions.filter((record) => record.kind !== 'connector')
        : [],
    [extractions, filter],
  );
  const unifiedMemoryCount = filtered.length + visibleExtractions.length;
  const memoryConnectors = useMemo(() => {
    const byId = new Map(connectors.map((connector) => [connector.id, connector]));
    return MEMORY_CONNECTOR_APP_IDS.map((id) => {
      const connector = byId.get(id);
      const status = connectorStatuses[id];
      if (connector) {
        return status ? applyMemoryConnectorStatus(connector, status) : connector;
      }
      return {
        id,
        name: MEMORY_CONNECTOR_APP_LABELS[id] ?? id,
        provider: 'composio',
        category: 'Memory source',
        status: status?.status ?? 'available' as const,
        ...(status?.accountLabel ? { accountLabel: status.accountLabel } : {}),
        ...(status?.lastError ? { lastError: status.lastError } : {}),
        tools: [],
      };
    });
  }, [connectorStatuses, connectors]);
  const connectorIdsWithDetails = useMemo(
    () => new Set(connectors.map((connector) => connector.id)),
    [connectors],
  );
  const connectedMemoryConnectors = useMemo(
    () => memoryConnectors.filter((connector) => connector.status === 'connected'),
    [memoryConnectors],
  );
  const selectedConnectedConnectorIds = useMemo(
    () =>
      [...selectedConnectorIds].filter((id) =>
        connectedMemoryConnectors.some((connector) => connector.id === id),
      ),
	    [selectedConnectorIds, connectedMemoryConnectors],
	  );
	  const connectedCount = connectedMemoryConnectors.length;
	  const connectorScanLabel = connectorExtracting
	    ? 'Scanning apps'
	    : selectedConnectedConnectorIds.length === 0
	      ? 'Select apps to scan'
	      : 'Scan selected apps';
	  const selectedConnectorSuggestions = useMemo(
	    () => connectorSuggestions.filter((suggestion) => selectedSuggestionIds.has(suggestion.id)),
	    [connectorSuggestions, selectedSuggestionIds],
	  );

  useEffect(() => {
    setSelectedConnectorIds((prev) => {
      const connectedIds = connectedMemoryConnectors.map((connector) => connector.id);
      const connected = new Set(connectedIds);
      const next = new Set([...prev].filter((id) => connected.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [connectedMemoryConnectors]);

  const treeFolders = useMemo(
    () => memoryTree.filter((node) => node.kind === 'folder'),
    [memoryTree],
  );

  const treeChildren = useMemo(() => {
    const map = new Map<string, MemoryTreeNode[]>();
    for (const node of memoryTree) {
      if (node.kind !== 'entry' || !node.parentId) continue;
      const list = map.get(node.parentId) ?? [];
      list.push(node);
      map.set(node.parentId, list);
    }
    return map;
  }, [memoryTree]);

  const openPreview = useCallback(
    async (id: string) => {
      if (previewId === id) {
        setPreviewId(null);
        setPreviewBody(null);
        return;
      }
      setPreviewId(id);
      setPreviewBody(null);
      const entry = await fetchMemoryEntry(id);
      setPreviewBody(entry?.body ?? '');
    },
    [previewId],
  );

  const startEdit = useCallback(async (id: string) => {
    const entry = await fetchMemoryEntry(id);
    if (!entry) return;
    setEditing({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      type: entry.type,
      body: entry.body,
    });
  }, []);

  const startNew = useCallback(() => {
    setEditing({ ...EMPTY_DRAFT });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditing(null);
  }, []);

  const toggleConnectorSelection = useCallback((connectorId: string) => {
    setSelectedConnectorIds((prev) => {
      const next = new Set(prev);
      if (next.has(connectorId)) {
        next.delete(connectorId);
      } else {
        next.add(connectorId);
      }
      return next;
    });
  }, []);

  const refreshMemoryConnectorStatuses = useCallback(async () => {
    const statuses = await fetchConnectorStatuses();
    setConnectorStatuses(statuses);
    setConnectors((prev) => applyMemoryConnectorStatuses(prev, statuses));
    setPendingConnectorAuthIds((prev) => {
      const next = new Set(prev);
      for (const connectorId of prev) {
        if (statuses[connectorId]?.status === 'connected') next.delete(connectorId);
      }
      return next.size === prev.size ? prev : next;
    });
    setConnectorConnectErrors((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [connectorId, status] of Object.entries(statuses)) {
        if (status.status === 'connected' && next[connectorId] !== undefined) {
          delete next[connectorId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    if (pendingConnectorAuthIds.size === 0) return;
    const interval = window.setInterval(() => {
      void refreshMemoryConnectorStatuses();
    }, 2_000);
    const onFocus = () => {
      void refreshMemoryConnectorStatuses();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [pendingConnectorAuthIds, refreshMemoryConnectorStatuses]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if ((data as { type?: unknown }).type !== CONNECTOR_CALLBACK_MESSAGE_TYPE) return;
      if (!isTrustedConnectorCallbackOrigin(event.origin)) return;
      void refreshMemoryConnectorStatuses();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refreshMemoryConnectorStatuses]);

  const onConnectMemoryConnector = useCallback(async (connectorId: string) => {
    if (connectingConnectorIds.has(connectorId)) return;
    setConnectingConnectorIds((prev) => new Set(prev).add(connectorId));
    setConnectorConnectErrors((prev) => {
      if (prev[connectorId] === undefined) return prev;
      const next = { ...prev };
      delete next[connectorId];
      return next;
    });
    try {
      const result = await connectConnector(connectorId);
      const requiresAuthorizationCompletion =
        result.auth?.kind === 'redirect_required' || result.auth?.kind === 'pending';
      setConnectors((prev) =>
        upsertMemoryConnector(
          prev,
          requiresAuthorizationCompletion && result.connector
            ? connectorWithPendingAuthorization(result.connector)
            : result.connector,
        ),
      );
      if (result.error) {
        setConnectorConnectErrors((prev) => ({ ...prev, [connectorId]: result.error! }));
        setPendingConnectorAuthIds((prev) => {
          if (!prev.has(connectorId)) return prev;
          const next = new Set(prev);
          next.delete(connectorId);
          return next;
        });
        return;
      }
      if (result.auth?.kind === 'redirect_required' || result.auth?.kind === 'pending') {
        setPendingConnectorAuthIds((prev) => new Set(prev).add(connectorId));
      } else {
        setPendingConnectorAuthIds((prev) => {
          if (!prev.has(connectorId)) return prev;
          const next = new Set(prev);
          next.delete(connectorId);
          return next;
        });
      }
      await refreshMemoryConnectorStatuses();
    } finally {
      setConnectingConnectorIds((prev) => {
        if (!prev.has(connectorId)) return prev;
        const next = new Set(prev);
        next.delete(connectorId);
        return next;
      });
    }
  }, [connectingConnectorIds, refreshMemoryConnectorStatuses]);

  const toggleConnectorSuggestion = useCallback((suggestionId: string) => {
    setSelectedSuggestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(suggestionId)) {
        next.delete(suggestionId);
      } else {
        next.add(suggestionId);
      }
      return next;
    });
  }, []);

  const onSuggestConnectorMemory = useCallback(async () => {
    if (selectedConnectedConnectorIds.length === 0) return;
    setConnectorExtracting(true);
    setConnectorSuggestions([]);
    setSelectedSuggestionIds(new Set());
    setConnectorAttempts([]);
    setConnectorContextBytes(0);
    setConnectorStatus(null);
    setConnectorError(null);
    const startedAt = Date.now();
    try {
      const result = await suggestConnectorMemories(selectedConnectedConnectorIds, {
        chatAgentId,
        chatModel,
      });
      if (!result) {
        setConnectorError('Could not read connected apps. Try again from the Connectors tab.');
        return;
      }
      const latestExtractions = await reloadExtractions();
      const latestFailure = latestExtractions.find(
        (record) =>
          record.kind === 'connector'
          && record.phase === 'failed'
          && record.startedAt >= startedAt - 5_000,
      );
      const friendlyFailure = latestFailure
        ? describeExtractionFailure(latestFailure)
        : null;
      setConnectorAttempts(result.connectors);
      setConnectorContextBytes(result.contextBytes);
      const succeeded = result.connectors.filter(
        (connector) => connector.status === 'succeeded',
      ).length;
      if (friendlyFailure) {
        setConnectorError([
          friendlyFailure.title,
          friendlyFailure.detail,
          friendlyFailure.action,
        ].filter(Boolean).join(' '));
      } else if (result.suggestions.length > 0) {
        setConnectorSuggestions(result.suggestions);
        setSelectedSuggestionIds(new Set(result.suggestions.map((suggestion) => suggestion.id)));
        setConnectorStatus(
          `Found ${result.suggestions.length} suggested memor${result.suggestions.length === 1 ? 'y' : 'ies'} from ${succeeded} app${succeeded === 1 ? '' : 's'}. Review before saving.`,
        );
      } else if (!result.attemptedLLM) {
        setConnectorError(
          describeConnectorReadIssue(result)
          ?? 'No memory suggestions found. OpenDesign could not read useful content from the selected app yet.',
        );
      } else {
        setConnectorStatus(
          `Checked ${succeeded} selected app${succeeded === 1 ? '' : 's'}, but found no new memory suggestions.`,
        );
      }
    } catch (err) {
      setConnectorError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnectorExtracting(false);
    }
  }, [chatAgentId, chatModel, reloadExtractions, selectedConnectedConnectorIds]);

  const onDiscardConnectorSuggestions = useCallback(() => {
    setConnectorSuggestions([]);
    setSelectedSuggestionIds(new Set());
    setConnectorAttempts([]);
    setConnectorContextBytes(0);
    setConnectorStatus(null);
  }, []);

  const onSaveConnectorSuggestions = useCallback(async () => {
    if (selectedConnectorSuggestions.length === 0) return;
    setConnectorSaving(true);
    setConnectorError(null);
    try {
      const saved: MemoryEntry[] = [];
      const savedSuggestionIds = new Set<string>();
      for (const suggestion of selectedConnectorSuggestions) {
        const entry = await saveMemoryEntry({
          id: memoryEntryIdForConnectorSuggestion(suggestion),
          name: suggestion.name,
          description: suggestion.description,
          type: suggestion.type,
          body: suggestion.body,
        });
        if (entry) {
          saved.push(entry);
          savedSuggestionIds.add(suggestion.id);
        }
      }
      await reload();
      const savedEntriesById = new Map(saved.map((entry) => [entry.id, entry]));
      setConnectorSuggestions((prev) =>
        prev.filter((suggestion) => !savedSuggestionIds.has(suggestion.id)),
      );
      setSelectedSuggestionIds(
        new Set(
          selectedConnectorSuggestions
            .filter((suggestion) => !savedSuggestionIds.has(suggestion.id))
            .map((suggestion) => suggestion.id),
        ),
      );
      setConnectorStatus(
        `Saved ${savedEntriesById.size} memor${savedEntriesById.size === 1 ? 'y' : 'ies'} from connected apps.`,
      );
      if (savedEntriesById.size !== selectedConnectorSuggestions.length) {
        setConnectorError(
          `Saved ${savedEntriesById.size} of ${selectedConnectorSuggestions.length} selected memories. Please try the remaining items again.`,
        );
      }
    } catch (err) {
      setConnectorError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnectorSaving(false);
    }
  }, [reload, selectedConnectorSuggestions]);

  const onSave = useCallback(async () => {
    if (!editing) return;
    if (!editing.name.trim()) return;
    const wasNew = !editing.id;
    setBusy(true);
    try {
      const entry = await saveMemoryEntry(editing);
      if (entry) {
        await reload();
        setEditing(null);
        fireFlash(wasNew ? 'created' : 'saved');
      }
    } finally {
      setBusy(false);
    }
  }, [editing, reload, fireFlash]);

  const onDelete = useCallback(
    async (id: string) => {
      const ok = await deleteMemoryEntry(id);
      if (ok) {
        await reload();
        fireFlash('deleted');
      }
    },
    [reload, fireFlash],
  );

  const onToggleEnabled = useCallback(async (next: boolean) => {
    setEnabled(next);
    await setMemoryEnabled(next);
  }, []);

  const onToggleChatExtraction = useCallback(async (next: boolean) => {
    setChatExtractionEnabled(next);
    const ok = await setMemoryChatExtractionEnabled(next);
    if (!ok) setChatExtractionEnabled((current) => !current);
  }, []);

  const onSaveIndex = useCallback(async () => {
    if (indexDraft === null) return;
    setBusy(true);
    try {
      const ok = await saveMemoryIndex(indexDraft);
      if (ok) {
        setIndex(indexDraft);
        setIndexDraft(null);
        fireFlash('indexSaved');
      }
    } finally {
      setBusy(false);
    }
  }, [indexDraft, fireFlash]);

  const onDeleteExtraction = useCallback(async (id: string) => {
    // Optimistic removal: drop the row immediately so the click feels
    // instant. The SSE 'deleted' event will arrive moments later and is
    // a no-op against an already-removed id; if the request fails we
    // re-fetch to put the row back instead of silently lying.
    setExtractions((prev) => prev.filter((r) => r.id !== id));
    const ok = await deleteExtraction(id);
    if (!ok) {
      void reloadExtractions();
    }
  }, [reloadExtractions]);

  const onClearExtractions = useCallback(async () => {
    if (!window.confirm(t('settings.memoryExtractionsClearConfirm'))) return;
    setExtractions([]);
    const ok = await clearExtractionHistory();
    if (!ok) {
      void reloadExtractions();
    }
  }, [reloadExtractions, t]);

	  const memoryTabs: ReadonlyArray<{
	    id: MemoryTab;
	    label: string;
	    caption: string;
	    icon: IconName;
	  }> = [
	    {
	      id: 'manual',
	      label: 'Add manually',
	      caption: 'Write a fact or preference',
	      icon: 'edit',
	    },
	    {
	      id: 'chat',
	      label: 'Learn from chats',
	      caption: 'Capture useful context',
	      icon: 'history',
	    },
	    {
	      id: 'connected',
	      label: 'Import from apps',
	      caption: 'Scan connected tools',
	      icon: 'link',
	    },
	  ];

	  const renderMemoryEntry = (entry: MemoryEntrySummary) => (
	    <div key={entry.id} className="library-card">
	      <div className="library-card-info">
	        <div className="library-card-title-row">
	          <span className="library-card-name">{entry.name}</span>
	          <span className="library-card-badge">{entry.id}</span>
	        </div>
	        <div className="library-card-desc">
	          {entry.description || '—'}
	        </div>
	      </div>
	      <div className="memory-card-actions">
	        <button
	          type="button"
	          className="library-card-expand"
	          onClick={() => openPreview(entry.id)}
	          title={t('settings.memoryPreview')}
	        >
	          <Icon
	            name={previewId === entry.id ? 'chevron-down' : 'chevron-right'}
	            size={14}
	          />
	        </button>
	        <button
	          type="button"
	          className="ghost library-card-action"
	          onClick={() => startEdit(entry.id)}
	          title={t('settings.memoryEdit')}
	        >
	          <Icon name="edit" size={14} />
	        </button>
	        <button
	          type="button"
	          className="ghost library-card-action"
	          onClick={() => onDelete(entry.id)}
	          title={t('settings.memoryDelete')}
	        >
	          <Icon name="close" size={14} />
	        </button>
	      </div>
	      {previewId === entry.id && (
	        <div className="library-preview" style={{ width: '100%' }}>
	          {previewBody === null ? (
	            <p>{t('common.loading')}</p>
	          ) : previewBody ? (
	            <div className="library-preview-body">
	              {renderMarkdown(previewBody)}
	            </div>
	          ) : (
	            <p className="hint">—</p>
	          )}
	        </div>
	      )}
	    </div>
	  );

	  const renderExtractionCard = (record: MemoryExtractionRecord) => {
    const desc = describeRecord(record, t);
    const title = extractionCardTitle(record, t);
    const meta = extractionCardMeta(record, nowClock, t);
    return (
      <div
        key={record.id}
        className={`library-card memory-extraction-card is-${desc.tone}`}
      >
        <div className="library-card-info">
          <div className="library-card-title-row">
            <span className="library-card-name">
              {title}
            </span>
            <span className={`memory-extraction-pill is-${desc.tone}`}>
              {desc.phaseLabel}
            </span>
            <span className="library-card-badge">
              {desc.kindLabel}
            </span>
          </div>
          <div className="library-card-desc">
            {meta}
          </div>
          {desc.reasonLabel ? (
            <div className="memory-extraction-reason">
              {desc.reasonLabel}
            </div>
          ) : null}
          {record.phase === 'failed' && record.error ? (
            <div className="memory-extraction-failure">
              {(() => {
                const failure = describeExtractionFailure(record);
                if (!failure) return null;
                return (
                  <>
                    <strong>{failure.title}</strong>
                    <span>{failure.detail}</span>
                    {failure.action ? <span>{failure.action}</span> : null}
                  </>
                );
              })()}
            </div>
          ) : null}
          {Array.isArray(record.writtenIds) &&
          record.writtenIds.length > 0 ? (
            <div className="memory-extraction-counts">
              <span>
                {t('settings.memoryExtractionWritten')}
              </span>
              <span className="memory-extraction-ids">
                {record.writtenIds.map((id: string) => (
                  <button
                    key={id}
                    type="button"
                    className="filter-pill"
                    onClick={() => openPreview(id)}
                    title={id}
                  >
                    {id}
                  </button>
                ))}
              </span>
            </div>
          ) : null}
        </div>
        <div className="memory-card-actions">
          <button
            type="button"
            className="ghost library-card-action"
            onClick={() => void onDeleteExtraction(record.id)}
            title={t('settings.memoryExtractionDelete')}
            aria-label={t('settings.memoryExtractionDelete')}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <section
        className={`settings-section settings-section-card memory-create-section${enabled ? '' : ' is-disabled'}`}
      >
      <div className="section-head">
        <div>
          <h3 className="memory-title-row">
            <span>{t('settings.memory')}</span>
            {/*
              Storage path used to render as a permanently-visible
              <code>/Users/.../.od/memory</code> line in the body. Most
              users only need this once (to peek at the markdown files)
              and then never again, so the line was pure noise after the
              first glance. We tucked it behind an info button next to
              the title: native tooltip on hover reveals the full path,
              and a click copies it to clipboard with a "Path copied"
              flash. Inline English for the aria-label; PR-time
              translation sweep can lift it later.
            */}
            {rootDir ? (
              <span className="memory-info-wrap">
                <button
                  type="button"
                  className="memory-info-btn"
                  onClick={() => void onCopyPath()}
                  title={rootDir}
                  aria-label="Memory storage path — click to copy"
                >
                  <Icon name="info" size={13} />
                </button>
                {flash?.kind === 'pathCopied' ? (
                  <span key={flash.key} className="memory-path-copied-badge">
                    {flashLabel.pathCopied}
                  </span>
                ) : null}
              </span>
            ) : null}
          </h3>
          <p className="hint">{t('settings.memoryDescription')}</p>
        </div>
        <label
          className="toggle-switch"
          title={t('settings.memoryEnableLabel')}
          aria-label={t('settings.memoryEnableLabel')}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
          />
          <span className="toggle-slider" />
        </label>
      </div>

      {!enabled ? (
        <div role="status" className="memory-disabled-banner">
          <strong>{t('settings.memoryDisabled')}</strong> —{' '}
          {t('settings.memoryDisabledBanner')}
        </div>
      ) : null}

      {enabled && showNoProviderBanner ? (
        <div role="status" className="memory-noprovider-banner">
          <strong>{t('settings.memoryNoProviderBannerTitle')}</strong> —{' '}
          {t('settings.memoryNoProviderBannerBody')}
        </div>
      ) : null}

      <div
        className="memory-source-tabs"
        role="tablist"
        aria-label="Memory areas"
      >
        {memoryTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-label={tab.label}
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="memory-source-tab-icon">
              <Icon name={tab.icon} size={14} />
            </span>
            <span className="memory-source-tab-copy">
              <span>{tab.label}</span>
              <small aria-hidden="true">{tab.caption}</small>
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'manual' ? (
        <div className="memory-tab-panel memory-manual-panel">
          <div className="memory-source-summary">
            <span className="memory-block-icon">
              <Icon name="edit" size={15} />
            </span>
            <div>
              <h4>Add manually</h4>
              <p className="hint">
                Add facts, preferences, or project context yourself. Fixed assistant
                behavior lives in Instructions / Rules.
              </p>
            </div>
            <button
              type="button"
              className="primary memory-source-action"
              onClick={startNew}
              disabled={editing !== null}
            >
              <Icon name="plus" size={14} />
              <span>{t('settings.memoryNew')}</span>
            </button>
          </div>

          {flash && flash.kind !== 'pathCopied' ? (
            <div
              key={flash.key}
              role="status"
              aria-live="polite"
              className="memory-flash-pill"
            >
              {flashLabel[flash.kind]}
            </div>
          ) : null}

          {editing ? (
            <div
              ref={editorRef}
              className="library-card"
              style={{
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 14,
                padding: 14,
                background: 'var(--surface-subtle, rgba(0,0,0,0.02))',
                border: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
                borderRadius: 10,
              }}
            >
              {!editing.id ? (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 6,
                    paddingBottom: 10,
                    borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
                  }}
                >
                  <span
                    style={{
                      ...FIELD_LABEL_STYLE,
                      display: 'inline-block',
                      marginRight: 4,
                      marginBottom: 0,
                    }}
                  >
                    {t('settings.memoryStartersLabel')}
                  </span>
                  {STARTERS.map((starter) => (
                    <button
                      key={starter.nameKey}
                      type="button"
                      className="filter-pill"
                      onClick={() =>
                        setEditing({
                          id: editing.id,
                          type: starter.type,
                          name: t(starter.nameKey),
                          description: t(starter.descKey),
                          body: t(starter.bodyKey),
                        })
                      }
                      title={t(starter.descKey)}
                      style={{ display: 'inline-flex', alignItems: 'center' }}
                    >
                      {t(starter.nameKey)}
                    </button>
                  ))}
                </div>
              ) : null}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={FIELD_LABEL_STYLE}>
                      {t('settings.memoryNameLabel')}
                    </label>
                    <input
                      ref={editorNameRef}
                      type="text"
                      placeholder={t('settings.memoryName')}
                      value={editing.name}
                      onChange={(e) =>
                        setEditing({ ...editing, name: e.target.value })
                      }
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: '0 0 auto', minWidth: 120 }}>
                    <label style={FIELD_LABEL_STYLE}>
                      {t('settings.memoryTypeLabel')}
                    </label>
                    <select
                      value={editing.type}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          type: e.target.value as MemoryType,
                        })
                      }
                      style={{ width: '100%' }}
                    >
                      {TYPES.map((tt) => (
                        <option key={tt} value={tt}>
                          {TYPE_LABEL[tt]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={FIELD_LABEL_STYLE}>
                    {t('settings.memoryDescLabel')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('settings.memoryDesc')}
                    value={editing.description}
                    onChange={(e) =>
                      setEditing({ ...editing, description: e.target.value })
                    }
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={FIELD_LABEL_STYLE}>
                    {t('settings.memoryBodyLabel')}
                  </label>
                  <textarea
                    placeholder={t('settings.memoryBody')}
                    value={editing.body}
                    onChange={(e) =>
                      setEditing({ ...editing, body: e.target.value })
                    }
                    rows={7}
                    style={{
                      width: '100%',
                      fontFamily: 'monospace',
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  />
                  <p className="hint" style={{ fontSize: 11, marginTop: 4 }}>
                    {t('settings.memoryBodyHint')}
                  </p>
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                }}
              >
                <span
                  className="hint"
                  style={{
                    fontSize: 11,
                    margin: 0,
                    color: 'var(--text-muted, #888)',
                  }}
                >
                  {t('settings.memorySaveHint')}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="ghost" onClick={cancelEdit}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={onSave}
                    disabled={busy || !editing.name.trim()}
                  >
                    {editing.id ? t('common.save') : t('common.create')}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

        </div>
      ) : null}

      {activeTab === 'chat' ? (
        <div className="memory-tab-panel">
          <div className="memory-source-summary">
            <span className="memory-block-icon">
              <Icon name="history" size={15} />
            </span>
            <div>
              <h4>Learn from chats</h4>
              <p className="hint">
                OpenDesign can learn preferences and project facts from future
                chat turns.
              </p>
            </div>
            <label
              className="memory-source-toggle memory-chat-learning-toggle"
              title="Learn from chat conversations"
            >
              <span>{chatExtractionEnabled ? 'On' : 'Off'}</span>
              <span className="toggle-switch toggle-switch-sm">
                <input
                  type="checkbox"
                  aria-label="Learn from chat conversations"
                  checked={chatExtractionEnabled}
                  onChange={(e) => onToggleChatExtraction(e.target.checked)}
                  disabled={!enabled}
                />
                <span className="toggle-slider" />
              </span>
            </label>
          </div>
        </div>
      ) : null}

      {activeTab === 'connected' ? (
        <div className="memory-tab-panel memory-connected-panel">
          <div className="memory-source-summary memory-connected-summary">
            <span className="memory-block-icon">
              <Icon name="link" size={15} />
            </span>
            <div>
              <h4>Import from apps</h4>
              <p className="hint">
                Choose apps to scan for design preferences, project context,
                and visual references. Nothing is scanned until you select an app.
              </p>
            </div>
            <span className="memory-source-badge">
              {connectorsLoading ? 'Loading' : `${connectedCount} connected`}
            </span>
            <button
              type="button"
              className="ghost memory-source-action"
              onClick={onOpenConnectors}
              disabled={!onOpenConnectors}
            >
              Manage
            </button>
          </div>
          <div className="memory-connector-workbench">
            <div className="memory-connector-picker-head">
              <div>
                <h4>Choose sources</h4>
                <p className="hint">
                  Select connected apps first. OpenDesign only scans the apps you choose.
                </p>
              </div>
              <span className="memory-source-badge">
                {selectedConnectedConnectorIds.length} selected
              </span>
            </div>
            <div className="memory-connector-list" aria-label="Connected memory apps">
              {memoryConnectors.map((connector) => {
                const connected = connector.status === 'connected';
                const selected = selectedConnectorIds.has(connector.id) && connected;
                const connecting = connectingConnectorIds.has(connector.id);
                const authorizationPending = pendingConnectorAuthIds.has(connector.id);
                const connectError = connectorConnectErrors[connector.id];
                const statusResolved =
                  connectorIdsWithDetails.has(connector.id)
                  || connectorStatuses[connector.id] !== undefined;
                const checkingStatus =
                  connectorsLoading
                  && !statusResolved
                  && !connected
                  && !authorizationPending
                  && !connectError
                  && !connecting;
                const connectorLastError = connector.lastError?.trim();
                const reconnecting = connector.status === 'error';
                const connectorHint = connected
                  ? connector.accountLabel || `${connector.tools.length} read tools`
                  : checkingStatus
                    ? 'Checking connection status…'
                    : authorizationPending
                    ? 'Finish authorization in your browser, then return here'
                    : connectorLastError || connectError || 'Connect this app before extraction';
                return (
                  <label
                    key={connector.id}
                    className={`memory-connector-row${connected ? '' : ' is-disabled'}${selected ? ' is-selected' : ''}`}
                    data-memory-connector-id={connector.id}
                  >
                    <input
                      className="memory-connector-input"
                      type="checkbox"
                      checked={selected}
                      disabled={!connected}
                      aria-label={`Use ${connector.name} for memory extraction`}
                      onChange={() => toggleConnectorSelection(connector.id)}
                    />
                    <span className={`memory-connector-brand${selected ? ' is-selected' : ''}`}>
                      <ConnectorLogo connector={connector} theme={logoTheme} size="sm" />
                      <span className="memory-connector-selected-mark" aria-hidden="true">
                        {selected ? <Icon name="check" size={13} /> : null}
                      </span>
                    </span>
                    <span className="memory-connector-copy">
                      <strong>{connector.name}</strong>
                      <small>{connectorHint}</small>
                    </span>
                    {connected ? (
                      <span className={`memory-connector-picker${selected ? ' is-selected' : ''}`}>
                        <span className="memory-connector-picker-box" aria-hidden="true">
                          {selected ? <Icon name="check" size={12} /> : null}
                        </span>
                        <span>{selected ? 'Selected' : 'Select'}</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={`memory-connector-connect-button${connecting || authorizationPending || checkingStatus ? ' is-loading' : ''}`}
                        disabled={connecting || authorizationPending || checkingStatus}
                        aria-busy={connecting || authorizationPending || checkingStatus || undefined}
                        aria-label={`${reconnecting ? 'Reconnect' : 'Connect'} ${connector.name}`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void onConnectMemoryConnector(connector.id);
                        }}
                      >
                        <Icon
                          name={connecting || authorizationPending || checkingStatus ? 'refresh' : 'plus'}
                          size={12}
                          className={connecting || authorizationPending || checkingStatus ? 'icon-spin' : ''}
                        />
                        <span>
                          {checkingStatus ? 'Checking' : authorizationPending ? 'Waiting' : connecting ? 'Connecting' : reconnecting ? 'Reconnect' : 'Connect'}
                        </span>
                      </button>
                    )}
                  </label>
                );
              })}
            </div>
            <div className="memory-connector-actions memory-connector-runbar">
              <span className="hint">
                Selected {selectedConnectedConnectorIds.length} of {connectedCount} connected app{connectedCount === 1 ? '' : 's'}.
              </span>
              <button
                type="button"
                className="primary memory-source-action"
                onClick={() => void onSuggestConnectorMemory()}
                disabled={
                  !enabled
                  || connectorExtracting
                  || connectorSaving
                  || selectedConnectedConnectorIds.length === 0
                }
              >
                <Icon
                  name={connectorExtracting ? 'refresh' : 'sparkles'}
                  size={14}
                  className={connectorExtracting ? 'icon-spin' : ''}
                />
                <span>{connectorScanLabel}</span>
              </button>
            </div>
          </div>
          {connectorSuggestions.length > 0 ? (
            <div className="memory-suggestion-panel">
              <div className="memory-subsection-head">
                <div>
                  <h4>Suggested memories</h4>
                  <p className="hint">
                    Review design-related memories before saving them.
                  </p>
                </div>
                <span className="memory-source-badge">
                  {selectedConnectorSuggestions.length} selected
                </span>
              </div>
              <div className="memory-suggestion-list">
                {connectorSuggestions.map((suggestion) => {
                  const selected = selectedSuggestionIds.has(suggestion.id);
                  const sourceLabel =
                    suggestion.source?.connectorName
                    || suggestion.source?.toolTitle
                    || 'Connected apps';
                  return (
                    <label
                      key={suggestion.id}
                      className={`memory-suggestion-card${selected ? ' is-selected' : ''}`}
                    >
                      <span className="memory-connector-check">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleConnectorSuggestion(suggestion.id)}
                        />
                        <span aria-hidden="true">
                          {selected ? <Icon name="check" size={13} /> : null}
                        </span>
                      </span>
                      <span className="memory-suggestion-copy">
                        <span className="memory-suggestion-title">
                          <strong>{suggestion.name}</strong>
                          <span className="memory-type-badge">
                            {TYPE_LABEL[suggestion.type]}
                          </span>
                        </span>
                        {suggestion.description ? (
                          <small>{suggestion.description}</small>
                        ) : null}
                        <span className="memory-suggestion-body">{suggestion.body}</span>
                      </span>
                      <span className="memory-connector-state is-connected">
                        {sourceLabel}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="memory-connector-actions">
                <button
                  type="button"
                  className="primary memory-source-action"
                  onClick={() => void onSaveConnectorSuggestions()}
                  disabled={connectorSaving || selectedConnectorSuggestions.length === 0}
                >
                  <Icon
                    name={connectorSaving ? 'refresh' : 'check'}
                    size={14}
                    className={connectorSaving ? 'icon-spin' : ''}
                  />
                  <span>{connectorSaving ? 'Saving' : 'Save selected'}</span>
                </button>
                <button
                  type="button"
                  className="ghost memory-source-action"
                  onClick={onDiscardConnectorSuggestions}
                  disabled={connectorSaving}
                >
                  Discard
                </button>
              </div>
            </div>
          ) : null}
          {connectorStatus ? (
            <div role="status" className="memory-connector-result is-success">
              {connectorStatus}
            </div>
          ) : null}
          {connectorError ? (
            <div role="alert" className="memory-connector-result is-error">
              {connectorError}
            </div>
          ) : null}
          {connectorAttempts.length > 0 ? (
            <div className="memory-connector-diagnostics" aria-label="Connected app read status">
              <div className="memory-connector-diagnostics-head">
                <strong>Last scan</strong>
                <span>{formatConnectorContextBytes(connectorContextBytes)} read</span>
              </div>
              <div className="memory-connector-diagnostics-list">
                {connectorAttempts.map((attempt) => (
                  <div
                    key={`${attempt.connectorId}-${attempt.status}-${attempt.toolName ?? 'none'}`}
                    className={`memory-connector-diagnostic-row is-${attempt.status}`}
                  >
                    <span className="memory-connector-diagnostic-dot" aria-hidden="true" />
                    <span className="memory-connector-diagnostic-copy">
                      <strong>{connectorAttemptTitle(attempt)}</strong>
                      <small>{connectorAttemptDetail(attempt)}</small>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {connectorExtractions.length > 0 ? (
            <details className="memory-scan-history">
              <summary>
                <span>Recent scans</span>
                <span>{connectorExtractions.length}</span>
              </summary>
              <div
                className="memory-connector-run-history"
                aria-label="Connected app memory run status"
              >
                {connectorExtractions.slice(0, 4).map(renderExtractionCard)}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      </section>

      <section className="settings-section settings-section-card memory-records-section">
        <div className="memory-management-panel">
          <div className="memory-subsection-head">
            <div>
              <h4>Saved memory</h4>
              <p className="hint">
                Saved facts, preferences, and project context available to future chats.
              </p>
            </div>
            <div className="memory-management-counts">
              <span className="memory-source-badge">
                {entries.length} saved
              </span>
              {visibleExtractions.length > 0 ? (
                <span className="memory-source-badge">
                  {visibleExtractions.length} extraction{visibleExtractions.length === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
          </div>

          <div className="library-toolbar is-row">
            <div className="library-filters">
              <button
                type="button"
                className={`filter-pill${filter === 'all' ? ' active' : ''}`}
                onClick={() => setFilter('all')}
              >
                {t('settings.memoryAll')}
                <span className="filter-pill-count">
                  {entries.length + visibleExtractions.length}
                </span>
              </button>
              {TYPES.map((type) => {
                const count = entries.filter((e) => e.type === type).length;
                if (count === 0 && filter !== type) return null;
                return (
                  <button
                    key={type}
                    type="button"
                    className={`filter-pill${filter === type ? ' active' : ''}`}
                    onClick={() => setFilter(type)}
                  >
                    {TYPE_LABEL[type]}
                    <span className="filter-pill-count">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="memory-management-actions">
              {visibleExtractions.length > 0 ? (
                <button
                  type="button"
                  className="ghost memory-clear-extractions"
                  onClick={() => void onClearExtractions()}
                  title={t('settings.memoryExtractionsClearTitle')}
                >
                  <Icon name="close" size={12} />
                  <span>{t('settings.memoryExtractionsClear')}</span>
                </button>
              ) : null}
              {visibleExtractions.length > 0 ? (
                <button
                  type="button"
                  className="ghost memory-refresh-extractions"
                  onClick={() => void reloadExtractions()}
                  disabled={isRefreshing}
                  title={t('settings.memoryExtractionsRefresh')}
                >
                  <Icon
                    name="refresh"
                    size={12}
                    className={isRefreshing ? 'icon-spin' : ''}
                  />
                  <span>
                    {isRefreshing
                      ? t('settings.memoryExtractionsRefreshing')
                      : t('settings.memoryExtractionsRefresh')}
                  </span>
                </button>
              ) : null}
            </div>
          </div>

          {treeFolders.length > 0 ? (
            <details className="library-group memory-collapsible-card" open>
              <summary className="memory-details-summary">
                <span className="memory-details-title">Memory tree</span>
                <span className="filter-pill-count">{memoryTree.length}</span>
              </summary>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                {treeFolders.map((folder) => {
                  const children = treeChildren.get(folder.id) ?? [];
                  return (
                    <div
                      key={folder.id}
                      className="library-card"
                      style={{ alignItems: 'stretch' }}
                    >
                      <div className="library-card-info" style={{ width: '100%' }}>
                        <div className="library-card-title-row">
                          <span className="library-card-name">{folder.name}</span>
                          <span className="library-card-badge">{folder.path}</span>
                        </div>
                        <div className="library-card-desc">
                          {children.length} {children.length === 1 ? 'node' : 'nodes'}
                        </div>
                        {children.length > 0 ? (
                          <ul
                            style={{
                              display: 'grid',
                              gap: 6,
                              margin: '8px 0 0',
                              padding: 0,
                              listStyle: 'none',
                            }}
                          >
                            {children.map((child) => (
                              <li
                                key={child.id}
                                className="memory-tree-child-row"
                              >
                                <span style={{ minWidth: 0 }}>
                                  <span className="library-card-name">{child.name}</span>{' '}
                                  <span className="library-card-badge">{child.id}</span>
                                  {child.description ? (
                                    <span
                                      className="library-card-desc"
                                      style={{ display: 'block' }}
                                    >
                                      {child.description}
                                    </span>
                                  ) : null}
                                </span>
                                <div className="memory-card-actions">
                                  <button
                                    type="button"
                                    className="ghost library-card-action"
                                    onClick={() => startEdit(child.id)}
                                    title={t('settings.memoryEdit')}
                                  >
                                    <Icon name="edit" size={14} />
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}

          <div className="library-content memory-unified-list">
            {unifiedMemoryCount === 0 ? (
              /*
                Empty state — the previous one inlined two side-by-side
                <code> snippets ("记住：用户偏好深色主题 / I prefer dark
                mode") which read like duelling locales and made the user
                wonder if the chips were tap-to-prefill or just decorative.
                We now show one clear "no rows yet" line and a one-sentence
                primer that explains the mechanism (talk in chat, fact gets
                extracted) with a single example. Inline English; PR-time
                translation sweep can lift this into the dictionary.
              */
              <div className="library-empty">
                <p className="library-empty-title">
                  {t('settings.memoryEmpty')}
                </p>
                <p className="library-empty-hint">
                  Tell the assistant a fact in chat — e.g.{' '}
                  <code>I prefer dark mode</code> — and it will be saved
                  here automatically.
                </p>
              </div>
	            ) : (
	              <>
	                {filtered.map(renderMemoryEntry)}
	                {visibleExtractions.map(renderExtractionCard)}
	              </>
	            )}
          </div>
        </div>
      </section>

      <section className="settings-section settings-section-card memory-advanced-section">
        <details className="memory-advanced">
          <summary className="memory-details-summary">
            <span className="memory-details-title">Advanced</span>
          </summary>
          <p className="memory-advanced-hint">
            Inspect or edit the underlying memory index.
          </p>
          <div className="memory-advanced-stack">
            <details className="library-group memory-advanced-card">
              <summary className="memory-details-summary">
                <span className="memory-details-title">
                  {t('settings.memoryIndex')}
                </span>
              </summary>
              <textarea
                value={indexDraft ?? index}
                onChange={(e) => setIndexDraft(e.target.value)}
                rows={8}
                style={{
                  width: '100%',
                  marginTop: 8,
                  fontFamily: 'monospace',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 6,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  className="hint"
                  style={{
                    fontSize: 11,
                    margin: 0,
                    color:
                      indexDraft !== null
                        ? 'var(--text-warning, #b06a00)'
                        : 'var(--text-muted, #888)',
                    fontWeight: indexDraft !== null ? 600 : 400,
                  }}
                >
                  {indexDraft !== null
                    ? `● ${t('settings.memoryIndexUnsaved')} — ${t('settings.memoryIndexSaveHint')}`
                    : t('settings.memoryIndexSaveHint')}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setIndexDraft(null)}
                    disabled={indexDraft === null}
                  >
                    {t('settings.memoryIndexReset')}
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={onSaveIndex}
                    disabled={busy || indexDraft === null}
                  >
                    {t('settings.memoryIndexSave')}
                  </button>
                </div>
              </div>
            </details>
          </div>
        </details>
      </section>
    </>
  );
}
