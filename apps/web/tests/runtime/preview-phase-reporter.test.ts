import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportSafetyEvent = vi.fn();
vi.mock('../../src/analytics/error-tracking', () => ({
  reportSafetyEvent: (...args: unknown[]) => reportSafetyEvent(...args),
}));

import {
  PREVIEW_PHASE_EVENT_NAME,
} from '@open-design/contracts/runtime/preview-phase-events';
import type { PreviewPhaseSink } from '../../src/runtime/preview-phase-reporter';
import {
  beginPreviewAttach,
  endPreviewAttach,
  previewPhaseDescriptor,
  recordPreviewPhase,
  registerPreviewPoolKey,
  reportPreviewPoolReclaim,
  resetPreviewPhaseTelemetry,
  setPreviewPhaseSink,
  unregisterPreviewPoolKey,
} from '../../src/runtime/preview-phase-reporter';
import type { PreviewSessionNavigation } from '../../src/runtime/preview-session-navigation';

function navigation(
  overrides: Partial<PreviewSessionNavigation> = {},
): PreviewSessionNavigation {
  return {
    sessionId: 'scope-0001',
    documentVersion: 'v1',
    url: 'http://n-scope-0001.localhost:17456/index.html',
    runtimeProtocol: 'universal',
    sandboxProfile: 'normal',
    deck: false,
    ...overrides,
  };
}

let sink: ReturnType<typeof vi.fn<PreviewPhaseSink>>;

beforeEach(() => {
  resetPreviewPhaseTelemetry();
  reportSafetyEvent.mockClear();
  sink = vi.fn<PreviewPhaseSink>();
  setPreviewPhaseSink(sink);
});

afterEach(() => {
  setPreviewPhaseSink(null);
  resetPreviewPhaseTelemetry();
});

function events(): Array<Record<string, unknown>> {
  return sink.mock.calls.map(([, properties]) => properties);
}

function phases(): string[] {
  return events().map((payload) => String(payload.phase));
}

describe('preview phase reporting channel', () => {
  it('emits through the consented analytics sink, never the safety bypass', () => {
    const nav = navigation();
    beginPreviewAttach(
      previewPhaseDescriptor(nav, { surface: 'file_viewer', openKind: 'cold' }),
      { trigger: 'initial_open', did_navigate: true },
    );
    recordPreviewPhase(nav, 'bootstrap_handshake', { outcome: 'acknowledged' });

    expect(sink).toHaveBeenCalledTimes(2);
    expect(sink.mock.calls[0]?.[0]).toBe(PREVIEW_PHASE_EVENT_NAME);
    // Phase durations of a healthy preview are operational data about a normal
    // session, not a stability incident. They must not ride the consent bypass
    // that exists for crash-class events.
    expect(reportSafetyEvent).not.toHaveBeenCalled();
  });

  it('drops records when no sink is installed instead of buffering them', () => {
    setPreviewPhaseSink(null);
    const nav = navigation();
    expect(() => {
      beginPreviewAttach(
        previewPhaseDescriptor(nav, { surface: 'file_viewer', openKind: 'cold' }),
        { trigger: 'initial_open', did_navigate: true },
      );
      recordPreviewPhase(nav, 'bootstrap_handshake', { outcome: 'acknowledged' });
    }).not.toThrow();

    setPreviewPhaseSink(sink);
    recordPreviewPhase(nav, 'first_visible_paint', { paint_observed: true });
    // Only the post-install record arrives; nothing captured before the sink
    // existed is replayed into it.
    expect(phases()).toEqual(['first_visible_paint']);
  });
});

describe('attach ownership', () => {
  it('emits nothing for a phase recorded before the attach was opened', () => {
    recordPreviewPhase(navigation(), 'version_promoted', {
      outcome: 'promoted',
      gate_runtime_identity: true,
      gate_capabilities: true,
      gate_dom_ready: true,
      gate_presentation_state: true,
    });
    expect(sink).not.toHaveBeenCalled();
  });

  it('takes framing from the attach owner, not from the phase call site', () => {
    const nav = navigation();
    beginPreviewAttach(
      previewPhaseDescriptor(nav, { surface: 'deck_viewer', openKind: 'warm' }),
      { trigger: 'file_tab_change', did_navigate: false },
    );
    // A downstream component knows the document identity but has no business
    // deciding the surface or whether this was a cold open.
    recordPreviewPhase(nav, 'bootstrap_handshake', { outcome: 'acknowledged' });

    const payload = events()[1]!;
    expect(payload.surface).toBe('deck_viewer');
    expect(payload.open_kind).toBe('warm');
    expect(payload.attach_trigger).toBe('file_tab_change');
    expect(payload.did_navigate).toBe(false);
  });

  it('carries the runtime protocol so legacy documents can be split out', () => {
    const nav = navigation({ runtimeProtocol: 'legacy-url', documentVersion: 'legacy:index.html' });
    beginPreviewAttach(
      previewPhaseDescriptor(nav, { surface: 'file_viewer', openKind: 'cold' }),
      { trigger: 'initial_open', did_navigate: true },
    );
    expect(events()[0]?.runtime_protocol).toBe('legacy-url');
  });

  it('stops emitting after the attach ends', () => {
    const nav = navigation();
    beginPreviewAttach(
      previewPhaseDescriptor(nav, { surface: 'file_viewer', openKind: 'cold' }),
      { trigger: 'initial_open', did_navigate: true },
    );
    endPreviewAttach(nav);
    recordPreviewPhase(nav, 'bootstrap_handshake', { outcome: 'acknowledged' });
    expect(phases()).toEqual(['navigation_start']);
  });
});

describe('keep-alive pool bridge', () => {
  it('ignores reclaim for a pool key that was never registered as a preview', () => {
    reportPreviewPoolReclaim({
      cacheKey: 'some-other-widget',
      reason: 'lru_budget',
      retainedMs: 1_000,
      reuseCount: 0,
      retainedEntryCount: 2,
      evictedEntryCount: 1,
    });
    expect(sink).not.toHaveBeenCalled();
  });

  it('emits cache_reclaimed for a registered preview pool key', () => {
    const nav = navigation();
    beginPreviewAttach(
      previewPhaseDescriptor(nav, { surface: 'file_viewer', openKind: 'cold' }),
      { trigger: 'initial_open', did_navigate: true },
    );
    registerPreviewPoolKey('pool-key-1', nav);

    reportPreviewPoolReclaim({
      cacheKey: 'pool-key-1',
      reason: 'lru_budget',
      retainedMs: 45_000,
      reuseCount: 3,
      retainedEntryCount: 4,
      evictedEntryCount: 1,
    });

    const payload = events().at(-1)!;
    expect(payload.phase).toBe('cache_reclaimed');
    expect(payload.reason).toBe('lru_budget');
    expect(payload.retained_ms).toBe(45_000);
    expect(payload.reuse_count).toBe(3);
    expect(payload.retained_session_count).toBe(4);
    expect(payload.evicted_session_count).toBe(1);
  });

  it('attributes a reclaim to the document that key holds, not the newest one', () => {
    const first = navigation({ documentVersion: 'v1' });
    const second = navigation({ documentVersion: 'v2' });
    for (const nav of [first, second]) {
      beginPreviewAttach(
        previewPhaseDescriptor(nav, { surface: 'file_viewer', openKind: 'cold' }),
        { trigger: 'initial_open', did_navigate: true },
      );
    }
    registerPreviewPoolKey('pool-key-v1', first);
    registerPreviewPoolKey('pool-key-v2', second);

    reportPreviewPoolReclaim({
      cacheKey: 'pool-key-v1',
      reason: 'lru_budget',
      retainedMs: 10,
      reuseCount: 0,
      retainedEntryCount: 1,
      evictedEntryCount: 1,
    });

    const [firstStart, secondStart] = events();
    const reclaimed = events().at(-1)!;
    expect(reclaimed.phase).toBe('cache_reclaimed');
    // The registry, not recency, decides whose eviction this was. Getting this
    // wrong charges one file's reclaim to another file's attach and quietly
    // corrupts the retention and reuse panels.
    expect(reclaimed.document_key).toBe(firstStart?.document_key);
    expect(reclaimed.document_key).not.toBe(secondStart?.document_key);
  });

  it('forgets a pool key once it is unregistered', () => {
    const nav = navigation();
    beginPreviewAttach(
      previewPhaseDescriptor(nav, { surface: 'file_viewer', openKind: 'cold' }),
      { trigger: 'initial_open', did_navigate: true },
    );
    registerPreviewPoolKey('pool-key-1', nav);
    unregisterPreviewPoolKey('pool-key-1');
    reportPreviewPoolReclaim({
      cacheKey: 'pool-key-1',
      reason: 'lru_budget',
      retainedMs: 1,
      reuseCount: 0,
      retainedEntryCount: 0,
      evictedEntryCount: 1,
    });
    expect(phases()).toEqual(['navigation_start']);
  });
});
