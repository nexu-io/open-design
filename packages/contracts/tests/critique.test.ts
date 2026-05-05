import { describe, expect, it } from 'vitest';
import {
  panelEventToSse,
  CRITIQUE_SSE_EVENT_NAMES,
  type PanelEvent,
} from '../src/critique';

describe('CritiqueSseEvent', () => {
  it('panelEventToSse maps PanelEvent.type "run_started" to event "critique.run_started"', () => {
    const e: PanelEvent = {
      type: 'run_started', runId: 'r1', protocolVersion: 1,
      cast: ['designer','critic','brand','a11y','copy'],
      maxRounds: 3, threshold: 8, scale: 10,
    };
    const sse = panelEventToSse(e);
    expect(sse.event).toBe('critique.run_started');
    expect(sse.data).toMatchObject({
      runId: 'r1', protocolVersion: 1, maxRounds: 3, threshold: 8, scale: 10,
    });
    // No 'type' field on the SSE payload.
    expect((sse.data as Record<string, unknown>).type).toBeUndefined();
  });

  it('panelEventToSse round-trips every PanelEvent type', () => {
    const samples: PanelEvent[] = [
      { type: 'run_started', runId: 'r', protocolVersion: 1, cast: ['critic'], maxRounds: 3, threshold: 8, scale: 10 },
      { type: 'panelist_open', runId: 'r', round: 1, role: 'designer' },
      { type: 'panelist_dim', runId: 'r', round: 1, role: 'critic', dimName: 'contrast', dimScore: 4, dimNote: '' },
      { type: 'panelist_must_fix', runId: 'r', round: 1, role: 'a11y', text: '' },
      { type: 'panelist_close', runId: 'r', round: 1, role: 'critic', score: 6 },
      { type: 'round_end', runId: 'r', round: 1, composite: 6, mustFix: 7, decision: 'continue', reason: '' },
      { type: 'ship', runId: 'r', round: 3, composite: 8.6, status: 'shipped', artifactRef: { projectId: 'p', artifactId: 'a' }, summary: '' },
      { type: 'degraded', runId: 'r', reason: 'malformed_block', adapter: 'pi-rpc' },
      { type: 'interrupted', runId: 'r', bestRound: 2, composite: 7.86 },
      { type: 'failed', runId: 'r', cause: 'cli_exit_nonzero' },
      { type: 'parser_warning', runId: 'r', kind: 'weak_debate', position: 0 },
    ];
    for (const e of samples) {
      const sse = panelEventToSse(e);
      expect(sse.event).toBe(`critique.${e.type}`);
    }
  });

  it('CRITIQUE_SSE_EVENT_NAMES contains all 11 critique.* names', () => {
    expect(CRITIQUE_SSE_EVENT_NAMES).toContain('critique.run_started');
    expect(CRITIQUE_SSE_EVENT_NAMES).toContain('critique.parser_warning');
    expect(CRITIQUE_SSE_EVENT_NAMES.length).toBe(11);
    // Each name has the 'critique.' prefix.
    for (const name of CRITIQUE_SSE_EVENT_NAMES) {
      expect(name.startsWith('critique.')).toBe(true);
    }
  });
});
