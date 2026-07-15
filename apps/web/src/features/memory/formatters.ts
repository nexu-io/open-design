// Pure presentation helpers for the memory slice: provider/error labelling,
// extraction-record descriptions, and time/size formatting. All functions are
// side-effect-free (some take the i18n `t` so callers stay localized) and are
// unit-tested without React or transport.
import type {
  ConnectorMemorySuggestionResponse,
  MemoryExtractionRecord,
  MemoryExtractionSkipReason,
  MemoryType,
} from '@open-design/contracts';
import { useT } from '../../i18n';
import { connectorAppLabel } from './constants';
import type {
  ConnectorMemoryAttempt,
  FlashKind,
  FriendlyExtractionFailure,
  MemorySourceTab,
} from './types';

type Translate = ReturnType<typeof useT>;

export function describeConnectorReadIssue(
  result: ConnectorMemorySuggestionResponse,
): string | null {
  const failed = result.connectors.filter((connector) => connector.status === 'failed');
  const skipped = result.connectors.filter((connector) => connector.status === 'skipped');
  const firstIssue = failed[0] ?? skipped[0];
  if (!firstIssue) return null;

  const connectorName =
    firstIssue.connectorName
    || connectorAppLabel(firstIssue.connectorId)
    || firstIssue.connectorId;
  const reason = (firstIssue.error || firstIssue.summary || '').trim();
  const suffix = reason ? ` ${reason}` : '';

  if (failed.length > 0) {
    return `Couldn't read ${connectorName}.${suffix}`;
  }
  return `No readable content from ${connectorName}.${suffix}`;
}

export function providerDisplayName(provider: MemoryExtractionRecord['provider'] | undefined): string {
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

export function parseProviderError(raw: string): { message: string; code: string; status: number | null } {
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

export function describeExtractionFailure(record: MemoryExtractionRecord): FriendlyExtractionFailure | null {
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

export function formatConnectorContextBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'No data';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function connectorAttemptName(attempt: ConnectorMemoryAttempt): string {
  return attempt.connectorName
    || connectorAppLabel(attempt.connectorId)
    || attempt.connectorId;
}

export function connectorAttemptTitle(attempt: ConnectorMemoryAttempt): string {
  const connectorName = connectorAttemptName(attempt);
  if (attempt.status === 'succeeded') return `Read ${connectorName}`;
  if (attempt.status === 'failed') return `Could not read ${connectorName}`;
  return `Skipped ${connectorName}`;
}

export function connectorAttemptDetail(attempt: ConnectorMemoryAttempt): string {
  const parts = [
    attempt.toolTitle || attempt.toolName,
    attempt.status === 'failed' ? attempt.error : null,
    attempt.summary,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.join(' · ');
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
export function describeRecord(
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

export function formatRelativeTime(at: number, now: number): string {
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
export function formatAbsoluteTime(at: number, now: number): string {
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

export function formatDuration(record: MemoryExtractionRecord): string | null {
  if (!record.finishedAt) return null;
  const ms = Math.max(0, record.finishedAt - record.startedAt);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}

export function formatRelativeTimeAgo(at: number, now: number): string {
  const relative = formatRelativeTime(at, now);
  return relative === '0s' ? 'just now' : `${relative} ago`;
}

export function memoryCountLabel(count: number): string {
  return count === 1 ? 'memory' : 'memories';
}

export function extractionCardTitle(record: MemoryExtractionRecord, t: Translate): string {
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

export function extractionCardMeta(
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

/** Localized labels for each memory type badge. `t`-only, so callers memoize on
 *  `t` at the call site instead of drilling the map through props. */
export function memoryTypeLabels(t: Translate): Record<MemoryType, string> {
  return {
    profile: t('settings.memoryTypeProfile'),
    user: t('settings.memoryTypeUser'),
    feedback: t('settings.memoryTypeFeedback'),
    project: t('settings.memoryTypeProject'),
    reference: t('settings.memoryTypeReference'),
    rule: t('settings.memoryTypeRule'),
  };
}

/** Localized labels for the transient action-confirmation pills. `t`-only. */
export function memoryFlashLabels(t: Translate): Record<FlashKind, string> {
  return {
    created: t('settings.memoryFlashCreated'),
    saved: t('settings.memoryFlashSaved'),
    deleted: t('settings.memoryFlashDeleted'),
    indexSaved: t('settings.memoryFlashIndexSaved'),
    pathCopied: t('settings.memoryFlashPathCopied'),
  };
}

/** The add-modal source-tab bar config (profile / manual / connected). `t`-only;
 *  the two inline English captions await the PR-time translation sweep. */
export function memorySourceTabs(t: Translate): readonly MemorySourceTab[] {
  return [
    {
      id: 'profile',
      label: t('settings.memoryProfileTab'),
      caption: t('settings.memoryProfileTabCaption'),
      icon: 'home',
    },
    {
      id: 'manual',
      label: 'Add manually',
      caption: 'Write a fact or preference',
      icon: 'edit',
    },
    {
      id: 'connected',
      label: 'Import from apps',
      caption: 'Scan connected tools',
      icon: 'link',
    },
  ];
}
