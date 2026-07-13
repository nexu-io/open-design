import { describe, expect, it } from 'vitest';
import type {
  ConnectorDetail,
  MemoryExtractionRecord,
  MemorySuggestion,
} from '@open-design/contracts';

import {
  enabledPatch,
  singleFlagPatch,
  visibleExtractionsFor,
  memoryEntryIdForConnectorSuggestion,
  mergeMemoryConnector,
  upsertMemoryConnector,
  applyMemoryConnectorStatus,
  applyMemoryConnectorStatuses,
  connectorWithPendingAuthorization,
  connectorStatusesChanged,
  type MemoryConfigFlagKey,
} from '../../../src/features/memory/rules';

function record(
  id: string,
  over: Partial<MemoryExtractionRecord> = {},
): MemoryExtractionRecord {
  return { id, startedAt: 1_000, phase: 'success', userMessagePreview: '', ...over };
}

function connector(id: string, over: Partial<ConnectorDetail> = {}): ConnectorDetail {
  return { id, name: id, provider: 'composio', category: 'Memory source', status: 'available', tools: [], ...over };
}

function suggestion(id: string, over: Partial<MemorySuggestion> = {}): MemorySuggestion {
  return { id, name: `n-${id}`, description: '', type: 'project', body: 'b', ...over };
}

// Pure rules: a UI toggle maps to the exact `/api/memory/config` PATCH body.
// These characterize the wire shape the daemon merge parser expects, so a
// refactor that changes the body fails here rather than silently at runtime.
describe('memory config rules', () => {
  it('enabledPatch sends only the master switch', () => {
    expect(enabledPatch(true)).toEqual({ enabled: true });
    expect(enabledPatch(false)).toEqual({ enabled: false });
  });

  it('singleFlagPatch sends only the one toggled flag', () => {
    expect(singleFlagPatch('profileEnabled', false)).toEqual({
      profileEnabled: false,
    });
    expect(singleFlagPatch('verifyEnabled', true)).toEqual({
      verifyEnabled: true,
    });
  });

  it('covers every per-hook flag key', () => {
    const keys: MemoryConfigFlagKey[] = [
      'chatExtractionEnabled',
      'profileEnabled',
      'rewriteEnabled',
      'verifyEnabled',
    ];
    for (const key of keys) {
      expect(singleFlagPatch(key, true)).toEqual({ [key]: true });
    }
  });
});

describe('visibleExtractionsFor', () => {
  const rows = [
    record('llm-a', { kind: 'llm' }),
    record('conn-b', { kind: 'connector' }),
    record('plain-c'),
  ];

  it("drops connector-kind records under the 'all' filter", () => {
    expect(visibleExtractionsFor(rows, 'all').map((r) => r.id)).toEqual([
      'llm-a',
      'plain-c',
    ]);
  });

  it('shows nothing under any per-type filter (extractions are all-only)', () => {
    expect(visibleExtractionsFor(rows, 'project')).toEqual([]);
    expect(visibleExtractionsFor(rows, 'user')).toEqual([]);
  });

  it('is empty when there are no extractions', () => {
    expect(visibleExtractionsFor([], 'all')).toEqual([]);
  });
});

describe('connector rules', () => {
  it('memoryEntryIdForConnectorSuggestion accepts safe ids and rejects others', () => {
    expect(memoryEntryIdForConnectorSuggestion(suggestion('good_id1'))).toBe('good_id1');
    expect(memoryEntryIdForConnectorSuggestion(suggestion('Bad-Id!'))).toBeUndefined();
  });

  it('mergeMemoryConnector keeps existing tool metadata when the update omits it', () => {
    const current = connector('a', {
      tools: [{ name: 'x' } as never],
      toolCount: 3,
      toolsNextCursor: 'c',
      toolsHasMore: true,
    });
    const next = connector('a', { name: 'A', tools: [] });
    const merged = mergeMemoryConnector(current, next);
    expect(merged.name).toBe('A');
    expect(merged.tools).toHaveLength(1);
    expect(merged.toolCount).toBe(3);
    expect(merged.toolsNextCursor).toBe('c');
    expect(merged.toolsHasMore).toBe(true);

    // When the update carries its own tools, they win.
    expect(mergeMemoryConnector(current, connector('a', { tools: [{ name: 'y' } as never] })).tools).toHaveLength(1);
  });

  it('upsertMemoryConnector inserts, merges, and no-ops on null', () => {
    const list = [connector('a'), connector('b')];
    expect(upsertMemoryConnector(list, null)).toBe(list);
    expect(upsertMemoryConnector(list, connector('c')).map((c) => c.id)).toEqual(['a', 'b', 'c']);
    const merged = upsertMemoryConnector(list, connector('b', { name: 'B2' }));
    expect(merged.find((c) => c.id === 'b')?.name).toBe('B2');
    expect(merged).toHaveLength(2);
  });

  it('applyMemoryConnectorStatus drops stale account/error fields before applying', () => {
    const stale = connector('a', { accountLabel: 'old', lastError: 'boom', status: 'error' });
    const applied = applyMemoryConnectorStatus(stale, { status: 'connected' } as never);
    expect(applied.status).toBe('connected');
    expect(applied.accountLabel).toBeUndefined();
    expect(applied.lastError).toBeUndefined();
  });

  it('applyMemoryConnectorStatuses no-ops on an empty map and skips unlisted connectors', () => {
    const list = [connector('a'), connector('b')];
    expect(applyMemoryConnectorStatuses(list, {})).toBe(list);
    const out = applyMemoryConnectorStatuses(list, { a: { status: 'connected' } as never });
    expect(out.find((c) => c.id === 'a')?.status).toBe('connected');
    expect(out.find((c) => c.id === 'b')?.status).toBe('available');
  });

  it('connectorWithPendingAuthorization keeps disabled but otherwise marks available', () => {
    expect(connectorWithPendingAuthorization(connector('a', { status: 'available' })).status).toBe('available');
    expect(connectorWithPendingAuthorization(connector('a', { status: 'error' })).status).toBe('available');
    expect(connectorWithPendingAuthorization(connector('a', { status: 'disabled' })).status).toBe('disabled');
  });

  it('connectorStatusesChanged detects status/account/error drift and ignores matches', () => {
    const list = [connector('a', { status: 'available' })];
    expect(connectorStatusesChanged(list, {})).toBe(true); // current present, next absent
    expect(connectorStatusesChanged(list, { a: { status: 'connected' } as never })).toBe(true);
    expect(connectorStatusesChanged(list, { a: { status: 'available' } as never })).toBe(false);
    expect(connectorStatusesChanged([], {})).toBe(false);
  });
});
