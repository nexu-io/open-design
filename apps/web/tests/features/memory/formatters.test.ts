// Pure presentation helpers: provider/error labelling, extraction descriptions,
// connector read diagnostics, and time/size formatting. All are `t`-injected or
// argument-only, so they test with a key-echo fake `t` and zero React/transport.
import { describe, expect, it } from 'vitest';
import type {
  ConnectorMemoryExtractionResult,
  ConnectorMemorySuggestionResponse,
  MemoryExtractionRecord,
} from '@open-design/contracts';

import {
  describeConnectorReadIssue,
  providerDisplayName,
  parseProviderError,
  describeExtractionFailure,
  formatConnectorContextBytes,
  connectorAttemptName,
  connectorAttemptTitle,
  connectorAttemptDetail,
  describeRecord,
  formatRelativeTime,
  formatAbsoluteTime,
  formatDuration,
  formatRelativeTimeAgo,
  memoryCountLabel,
  extractionCardTitle,
  extractionCardMeta,
  memoryTypeLabels,
  memoryFlashLabels,
  memorySourceTabs,
} from '../../../src/features/memory/formatters';
import type { useT } from '../../../src/i18n';

// The formatters that localize take `t`; a key-echo fake keeps assertions on the
// branch logic (which key is chosen), not on the English copy.
const t = ((key: string) => key) as unknown as ReturnType<typeof useT>;

function record(over: Partial<MemoryExtractionRecord> = {}): MemoryExtractionRecord {
  return { id: 'r', startedAt: 1_000, phase: 'success', userMessagePreview: '', ...over };
}

function attempt(
  over: Partial<ConnectorMemoryExtractionResult> = {},
): ConnectorMemoryExtractionResult {
  return { connectorId: 'figma', connectorName: 'Figma', status: 'succeeded', summary: '', ...over };
}

function suggestionResponse(
  connectors: ConnectorMemoryExtractionResult[],
): ConnectorMemorySuggestionResponse {
  return { suggestions: [], attemptedLLM: false, connectors, contextBytes: 0 };
}

describe('describeConnectorReadIssue', () => {
  it('returns null when no connector failed or was skipped', () => {
    expect(describeConnectorReadIssue(suggestionResponse([attempt({ status: 'succeeded' })]))).toBeNull();
  });

  it('describes a failed connector with its error reason', () => {
    const out = describeConnectorReadIssue(
      suggestionResponse([attempt({ status: 'failed', error: 'boom' })]),
    );
    expect(out).toBe("Couldn't read Figma. boom");
  });

  it('falls back to the app label / id when the name is blank, and omits an empty reason', () => {
    const out = describeConnectorReadIssue(
      suggestionResponse([
        attempt({ connectorId: 'unknown-app', connectorName: '', status: 'failed', summary: '' }),
      ]),
    );
    expect(out).toBe("Couldn't read unknown-app.");
  });

  it('describes a skipped-only run with the summary as the reason', () => {
    const out = describeConnectorReadIssue(
      suggestionResponse([attempt({ status: 'skipped', summary: 'nothing new' })]),
    );
    expect(out).toBe('No readable content from Figma. nothing new');
  });
});

describe('providerDisplayName', () => {
  it('maps chat-cli anthropic to Claude Code and other chat-cli to Local CLI', () => {
    expect(providerDisplayName({ kind: 'anthropic', credentialSource: 'chat-cli' } as never)).toBe('Claude Code');
    expect(providerDisplayName({ kind: 'openai', credentialSource: 'chat-cli' } as never)).toBe('Local CLI');
  });

  it('maps each provider kind and falls back to Memory model', () => {
    expect(providerDisplayName({ kind: 'anthropic' } as never)).toBe('Anthropic');
    expect(providerDisplayName({ kind: 'azure' } as never)).toBe('Azure OpenAI');
    expect(providerDisplayName({ kind: 'google' } as never)).toBe('Google Gemini');
    expect(providerDisplayName({ kind: 'ollama' } as never)).toBe('Ollama');
    expect(providerDisplayName({ kind: 'openai' } as never)).toBe('OpenAI');
    expect(providerDisplayName(undefined)).toBe('Memory model');
    expect(providerDisplayName({ kind: 'mystery' } as never)).toBe('Memory model');
  });
});

describe('parseProviderError', () => {
  it('reads message/code/status from a nested error object', () => {
    const raw = 'prefix {"error":{"message":"nope","code":"bad","status":401}}';
    expect(parseProviderError(raw)).toEqual({ message: 'nope', code: 'bad', status: 401 });
  });

  it('reads message/code/status from a flat json object', () => {
    const raw = '{"message":"flat","code":"c","status":503}';
    expect(parseProviderError(raw)).toEqual({ message: 'flat', code: 'c', status: 503 });
  });

  it('falls back to regex status when json is malformed', () => {
    const out = parseProviderError('failed with 429 {oops not json');
    expect(out.status).toBe(429);
    expect(out.message).toBe('failed with 429 {oops not json');
  });

  it('leaves status null when there is no http code anywhere', () => {
    expect(parseProviderError('plain   text')).toEqual({ message: 'plain text', code: '', status: null });
  });
});

describe('describeExtractionFailure', () => {
  it('returns null unless the record failed with an error', () => {
    expect(describeExtractionFailure(record({ phase: 'success' }))).toBeNull();
    expect(describeExtractionFailure(record({ phase: 'failed' }))).toBeNull();
  });

  it('classifies an auth failure, with a CLI-specific action for chat-cli', () => {
    const cli = describeExtractionFailure(
      record({ phase: 'failed', error: 'unauthorized', provider: { kind: 'anthropic', credentialSource: 'chat-cli' } as never }),
    );
    expect(cli?.title).toContain('authentication expired');
    expect(cli?.action).toContain('Local CLI');

    const keyed = describeExtractionFailure(record({ phase: 'failed', error: '{"error":{"status":401}}' }));
    expect(keyed?.action).toContain('key');
  });

  it('classifies quota and network failures', () => {
    expect(describeExtractionFailure(record({ phase: 'failed', error: 'rate limit exceeded' }))?.title).toContain('quota');
    expect(describeExtractionFailure(record({ phase: 'failed', error: 'fetch failed: ETIMEDOUT' }))?.title).toContain('request failed');
  });

  it('falls back to a generic failure and varies the source line for connectors', () => {
    const generic = describeExtractionFailure(record({ phase: 'failed', error: 'weird' }));
    expect(generic?.title).toBe('Memory extraction failed');
    expect(generic?.detail).toBe('weird');
    // The connector-specific `source` line surfaces when a classified branch
    // uses it as the detail (here: the network branch).
    const connector = describeExtractionFailure(
      record({ phase: 'failed', kind: 'connector', error: 'fetch failed' }),
    );
    expect(connector?.detail).toContain('Connected apps');
  });
});

describe('formatConnectorContextBytes', () => {
  it('covers the no-data, B, KB (both precisions), and MB thresholds', () => {
    expect(formatConnectorContextBytes(0)).toBe('No data');
    expect(formatConnectorContextBytes(-5)).toBe('No data');
    expect(formatConnectorContextBytes(NaN)).toBe('No data');
    expect(formatConnectorContextBytes(512)).toBe('512 B');
    expect(formatConnectorContextBytes(2048)).toBe('2.0 KB');
    expect(formatConnectorContextBytes(200 * 1024)).toBe('200 KB');
    expect(formatConnectorContextBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('connector attempt helpers', () => {
  it('names by connectorName, then label, then id', () => {
    expect(connectorAttemptName(attempt({ connectorName: 'Figma' }))).toBe('Figma');
    expect(connectorAttemptName(attempt({ connectorId: 'unknown', connectorName: '' }))).toBe('unknown');
  });

  it('titles by status', () => {
    expect(connectorAttemptTitle(attempt({ status: 'succeeded' }))).toBe('Read Figma');
    expect(connectorAttemptTitle(attempt({ status: 'failed' }))).toBe('Could not read Figma');
    expect(connectorAttemptTitle(attempt({ status: 'skipped' }))).toBe('Skipped Figma');
  });

  it('joins present detail parts and shows the error only on failure', () => {
    expect(
      connectorAttemptDetail(attempt({ status: 'failed', toolTitle: 'Files', error: 'x', summary: 's' })),
    ).toBe('Files · x · s');
    expect(connectorAttemptDetail(attempt({ status: 'succeeded', toolName: 'get', error: 'ignored', summary: '' }))).toBe('get');
    expect(connectorAttemptDetail(attempt({ toolTitle: '', toolName: '', summary: '' }))).toBe('');
  });
});

describe('describeRecord', () => {
  it('maps each phase to its tone + label, defaulting unknown phases to skipped', () => {
    expect(describeRecord(record({ phase: 'running' }), t).tone).toBe('running');
    expect(describeRecord(record({ phase: 'success' }), t).tone).toBe('success');
    expect(describeRecord(record({ phase: 'failed' }), t).tone).toBe('failed');
    const skipped = describeRecord(record({ phase: 'skipped' }), t);
    expect(skipped.tone).toBe('skipped');
    const weird = describeRecord(record({ phase: 'deleted' as never }), t);
    expect(weird.tone).toBe('skipped');
    expect(weird.phaseLabel).toBe('deleted');
  });

  it('maps each skip reason, and null for non-skipped or unknown reason', () => {
    const reason = (r: string) => describeRecord(record({ phase: 'skipped', reason: r as never }), t).reasonLabel;
    expect(reason('no-provider')).toBe('settings.memoryExtractionSkipNoProvider');
    expect(reason('memory-disabled')).toBe('settings.memoryExtractionSkipDisabled');
    expect(reason('chat-disabled')).toBe('Chat conversation learning is off.');
    expect(reason('empty-message')).toBe('settings.memoryExtractionSkipEmpty');
    expect(reason('no-match')).toBe('settings.memoryExtractionSkipNoMatch');
    expect(reason('mystery')).toBeNull();
    expect(describeRecord(record({ phase: 'success' }), t).reasonLabel).toBeNull();
  });

  it('labels each kind, defaulting a missing kind to llm', () => {
    expect(describeRecord(record({ kind: 'heuristic' }), t).kindLabel).toBe('settings.memoryExtractionKindHeuristic');
    expect(describeRecord(record({ kind: 'connector' }), t).kindLabel).toBe('Connected apps');
    expect(describeRecord(record({ kind: 'llm' }), t).kindLabel).toBe('settings.memoryExtractionKindLlm');
    expect(describeRecord(record({ kind: undefined }), t).kindLabel).toBe('settings.memoryExtractionKindLlm');
  });
});

describe('time + duration formatting', () => {
  it('formats relative ages across the s/m/h/d thresholds and clamps negatives', () => {
    expect(formatRelativeTime(1_000, 1_000)).toBe('0s');
    expect(formatRelativeTime(0, 30_000)).toBe('30s');
    expect(formatRelativeTime(0, 120_000)).toBe('2m');
    expect(formatRelativeTime(0, 7_200_000)).toBe('2h');
    expect(formatRelativeTime(0, 2 * 86_400_000)).toBe('2d');
    expect(formatRelativeTime(5_000, 1_000)).toBe('0s');
  });

  it('formatAbsoluteTime omits the date same-day and includes it otherwise', () => {
    const base = new Date(2026, 5, 6, 12, 0, 0).getTime();
    expect(formatAbsoluteTime(base, base)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    const older = new Date(2026, 5, 4, 9, 0, 0).getTime();
    expect(formatAbsoluteTime(older, base)).toMatch(/\w+ \d+ \d{2}:\d{2}:\d{2}/);
  });

  it('formatDuration handles missing finish, ms, sub-minute, and minute+ ranges', () => {
    expect(formatDuration(record({ finishedAt: undefined }))).toBeNull();
    expect(formatDuration(record({ startedAt: 0, finishedAt: 500 }))).toBe('500ms');
    expect(formatDuration(record({ startedAt: 0, finishedAt: 4_500 }))).toBe('4.5s');
    expect(formatDuration(record({ startedAt: 0, finishedAt: 90_000 }))).toBe('90s');
  });

  it('formatRelativeTimeAgo says "just now" at zero and appends "ago" otherwise', () => {
    expect(formatRelativeTimeAgo(1_000, 1_000)).toBe('just now');
    expect(formatRelativeTimeAgo(0, 30_000)).toBe('30s ago');
  });

  it('memoryCountLabel is singular only for one', () => {
    expect(memoryCountLabel(1)).toBe('memory');
    expect(memoryCountLabel(0)).toBe('memories');
    expect(memoryCountLabel(3)).toBe('memories');
  });
});

describe('extractionCardTitle', () => {
  it('uses the message preview (or fallback key) for non-connector records', () => {
    expect(extractionCardTitle(record({ kind: 'llm', userMessagePreview: 'hi' }), t)).toBe('hi');
    expect(extractionCardTitle(record({ kind: 'llm', userMessagePreview: '' }), t)).toBe('settings.memoryExtractions');
  });

  it('covers every connector phase, including success with and without writes', () => {
    expect(extractionCardTitle(record({ kind: 'connector', phase: 'running' }), t)).toBe('Scanning connected apps');
    expect(extractionCardTitle(record({ kind: 'connector', phase: 'failed' }), t)).toBe('Connected app scan failed');
    expect(extractionCardTitle(record({ kind: 'connector', phase: 'skipped' }), t)).toBe('Connected app scan skipped');
    expect(extractionCardTitle(record({ kind: 'connector', phase: 'success', writtenCount: 2 }), t)).toBe('Saved 2 memories');
    expect(extractionCardTitle(record({ kind: 'connector', phase: 'success', writtenCount: 0 }), t)).toBe('No new memories found');
    expect(extractionCardTitle(record({ kind: 'connector', phase: 'deleted' as never }), t)).toBe('Connected app scan');
  });
});

describe('extractionCardMeta', () => {
  it('covers every connector phase branch', () => {
    const meta = (over: Partial<MemoryExtractionRecord>) =>
      extractionCardMeta(record({ kind: 'connector', startedAt: 0, ...over }), 1_000, t);
    expect(meta({ phase: 'running' })).toBe('Checking selected apps');
    expect(meta({ phase: 'failed' })).toContain('Needs attention');
    expect(meta({ phase: 'skipped' })).toContain('Skipped');
    expect(meta({ phase: 'success', writtenCount: 3 })).toContain('From connected apps');
    expect(meta({ phase: 'success', writtenCount: 0 })).toContain('Checked selected apps');
    expect(meta({ phase: 'deleted' as never })).toContain('Connected apps');
  });

  it('joins timestamp, age, duration, and written count for llm records', () => {
    const out = extractionCardMeta(
      record({ kind: 'llm', startedAt: 0, finishedAt: 2_000, phase: 'success', writtenCount: 4 }),
      3_000,
      t,
    );
    expect(out).toContain('settings.memoryExtractionDuration');
    expect(out).toContain('settings.memoryExtractionWritten');
    const noExtras = extractionCardMeta(record({ kind: 'llm', startedAt: 0, phase: 'running' }), 1_000, t);
    expect(noExtras).not.toContain('settings.memoryExtractionWritten');
  });
});

describe('label + tab builders', () => {
  it('builds the full type-label map', () => {
    expect(Object.keys(memoryTypeLabels(t))).toEqual(['profile', 'user', 'feedback', 'project', 'reference', 'rule']);
  });

  it('builds the full flash-label map', () => {
    expect(Object.keys(memoryFlashLabels(t))).toEqual(['created', 'saved', 'deleted', 'indexSaved', 'pathCopied']);
  });

  it('builds the three source tabs in order', () => {
    expect(memorySourceTabs(t).map((tab) => tab.id)).toEqual(['profile', 'manual', 'connected']);
  });
});

describe('formatter branch gaps', () => {
  it('parseProviderError leaves status null when neither top-level nor error carries one', () => {
    // Valid JSON, message present, but no numeric status anywhere and no 4xx/5xx
    // in the raw string → the else-if falls through and status stays null.
    expect(parseProviderError('{"error":{"message":"hmm"}}')).toEqual({
      message: 'hmm', code: '', status: null,
    });
  });

  it('describeExtractionFailure gives Local CLI guidance for a network error on a chat-cli provider', () => {
    const cli = describeExtractionFailure(record({
      phase: 'failed',
      error: 'fetch failed: ECONNRESET',
      provider: { kind: 'anthropic', credentialSource: 'chat-cli' } as never,
    }));
    expect(cli?.action).toContain('Local CLI');
  });

  it('describeExtractionFailure falls back to the generic source when the message is blank', () => {
    // A whitespace-only error is truthy (so we proceed) but parses to an empty
    // message → the `message || source` fallback returns the source line.
    const blank = describeExtractionFailure(record({ phase: 'failed', error: '   ' }));
    expect(blank?.detail).toMatch(/could not run memory extraction/i);
  });

  it('describeExtractionFailure gives Local CLI guidance on the generic fallback for a chat-cli provider', () => {
    const generic = describeExtractionFailure(record({
      phase: 'failed',
      error: 'weird unclassified error',
      provider: { kind: 'openai', credentialSource: 'chat-cli' } as never,
    }));
    expect(generic?.action).toContain('Local CLI');
  });

  it('summarizes a connector success with and without a written count', () => {
    // No writtenCount → the `: null` branch → "no new memories" copy.
    expect(extractionCardTitle(record({ kind: 'connector', phase: 'success' }), t))
      .toBe('No new memories found');
    expect(extractionCardMeta(record({ kind: 'connector', phase: 'success', startedAt: 0 }), 1_000, t))
      .toContain('Checked selected apps');
    // With a positive writtenCount → the numeric branch.
    expect(extractionCardTitle(record({ kind: 'connector', phase: 'success', writtenCount: 3 }), t))
      .toContain('Saved 3');
    expect(extractionCardMeta(record({ kind: 'connector', phase: 'success', writtenCount: 3, startedAt: 0 }), 1_000, t))
      .toContain('From connected apps');
  });
});
