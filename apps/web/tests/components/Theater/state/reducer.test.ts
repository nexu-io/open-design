/**
 * Pure-state coverage for the Critique Theater reducer (Phase 7, Task 7.1).
 *
 * The reducer is driven by `PanelEvent` (the contracts-level event shape) so
 * both the live SSE stream and the rerun replay land the same way. These
 * tests pin the lifecycle transitions documented in the spec and the
 * defensive behaviours (event for a different `runId` is ignored, terminal
 * phases are sticky except for late parser warnings).
 */

import { describe, expect, it } from 'vitest';
import type { PanelEvent, PanelistRole } from '@open-design/contracts/critique';

import {
  initialState,
  reduce,
  type CritiqueRound,
  type CritiqueState,
} from '../../../../src/components/Theater/state/reducer';

const RUN_ID = 'run_abc';

function start(
  runId = RUN_ID,
  overrides: Partial<Extract<PanelEvent, { type: 'run_started' }>> = {},
): Extract<PanelEvent, { type: 'run_started' }> {
  return {
    type: 'run_started',
    runId,
    protocolVersion: 1,
    cast: ['designer', 'critic', 'brand', 'a11y', 'copy'],
    maxRounds: 3,
    threshold: 8,
    scale: 10,
    ...overrides,
  };
}

function runningState(): Extract<CritiqueState, { phase: 'running' }> {
  const next = reduce(initialState, start());
  if (next.phase !== 'running') throw new Error('expected running phase');
  return next;
}

function close(role: PanelistRole, round = 1, score = 7.5): Extract<PanelEvent, { type: 'panelist_close' }> {
  return { type: 'panelist_close', runId: RUN_ID, round, role, score };
}

describe('Critique Theater reducer (Phase 7)', () => {
  it('boots from idle to running on run_started', () => {
    const next = reduce(initialState, start());
    expect(next.phase).toBe('running');
    if (next.phase !== 'running') return;
    expect(next.runId).toBe(RUN_ID);
    expect(next.config.cast).toEqual(['designer', 'critic', 'brand', 'a11y', 'copy']);
    expect(next.config.maxRounds).toBe(3);
    expect(next.config.threshold).toBe(8);
    expect(next.config.scale).toBe(10);
    expect(next.activeRound).toBe(1);
    expect(next.activePanelist).toBeNull();
    expect(next.rounds).toEqual([]);
    expect(next.warnings).toEqual([]);
  });

  it('discards a fresh state copy on a new run_started even mid-run (consecutive runs)', () => {
    const s1 = runningState();
    const s2 = reduce(s1, {
      type: 'panelist_must_fix',
      runId: RUN_ID,
      round: 1,
      role: 'critic',
      text: 'contrast too low',
    });
    expect(s2.phase).toBe('running');
    if (s2.phase !== 'running') return;
    expect(s2.rounds[0]?.mustFix).toBe(1);

    const s3 = reduce(s2, start('run_xyz'));
    expect(s3.phase).toBe('running');
    if (s3.phase !== 'running') return;
    expect(s3.runId).toBe('run_xyz');
    expect(s3.rounds).toEqual([]);
  });

  it('ignores events whose runId does not match the active run', () => {
    const s1 = runningState();
    const s2 = reduce(s1, {
      type: 'panelist_must_fix',
      runId: 'wrong_run',
      round: 1,
      role: 'critic',
      text: 'should not land',
    });
    // State reference must be identical (no allocation).
    expect(s2).toBe(s1);
  });

  it('tracks panelist_open updates to activePanelist and activeRound', () => {
    const s1 = runningState();
    const s2 = reduce(s1, { type: 'panelist_open', runId: RUN_ID, round: 1, role: 'designer' });
    expect(s2.phase).toBe('running');
    if (s2.phase !== 'running') return;
    expect(s2.activePanelist).toBe('designer');
    expect(s2.activeRound).toBe(1);
  });

  it('accumulates panelist_dim entries grouped by role + round', () => {
    let s: CritiqueState = runningState();
    s = reduce(s, { type: 'panelist_open', runId: RUN_ID, round: 1, role: 'critic' });
    s = reduce(s, {
      type: 'panelist_dim', runId: RUN_ID, round: 1, role: 'critic',
      dimName: 'hierarchy', dimScore: 8, dimNote: 'clear',
    });
    s = reduce(s, {
      type: 'panelist_dim', runId: RUN_ID, round: 1, role: 'critic',
      dimName: 'contrast', dimScore: 6, dimNote: 'borderline',
    });
    expect(s.phase).toBe('running');
    if (s.phase !== 'running') return;
    const critic = s.rounds[0]?.panelists.critic;
    expect(critic?.dims).toHaveLength(2);
    expect(critic?.dims[0]).toEqual({ name: 'hierarchy', score: 8, note: 'clear' });
    expect(critic?.dims[1]).toEqual({ name: 'contrast', score: 6, note: 'borderline' });
  });

  it('counts must-fix entries cumulatively per round', () => {
    let s: CritiqueState = runningState();
    s = reduce(s, {
      type: 'panelist_must_fix', runId: RUN_ID, round: 1, role: 'a11y',
      text: 'missing alt on hero image',
    });
    s = reduce(s, {
      type: 'panelist_must_fix', runId: RUN_ID, round: 1, role: 'a11y',
      text: 'focus ring missing on primary button',
    });
    expect(s.phase).toBe('running');
    if (s.phase !== 'running') return;
    expect(s.rounds[0]?.mustFix).toBe(2);
    expect(s.rounds[0]?.panelists.a11y?.mustFixes).toEqual([
      'missing alt on hero image',
      'focus ring missing on primary button',
    ]);
  });

  it('records panelist_close score and clears activePanelist', () => {
    let s: CritiqueState = runningState();
    s = reduce(s, { type: 'panelist_open', runId: RUN_ID, round: 1, role: 'brand' });
    s = reduce(s, close('brand', 1, 8.2));
    expect(s.phase).toBe('running');
    if (s.phase !== 'running') return;
    expect(s.rounds[0]?.panelists.brand?.score).toBe(8.2);
    expect(s.activePanelist).toBeNull();
  });

  it('round_end with decision=continue advances activeRound by one', () => {
    let s: CritiqueState = runningState();
    s = reduce(s, close('critic', 1, 7));
    s = reduce(s, {
      type: 'round_end', runId: RUN_ID, round: 1,
      composite: 7.4, mustFix: 2, decision: 'continue', reason: 'below threshold',
    });
    expect(s.phase).toBe('running');
    if (s.phase !== 'running') return;
    expect(s.activeRound).toBe(2);
    expect(s.rounds[0]?.composite).toBe(7.4);
    expect(s.rounds[0]?.decision).toBe('continue');
    expect(s.rounds[0]?.decisionReason).toBe('below threshold');
  });

  it('round_end with decision=ship keeps activeRound pointing at the shipped round', () => {
    let s: CritiqueState = runningState();
    s = reduce(s, {
      type: 'round_end', runId: RUN_ID, round: 1,
      composite: 8.6, mustFix: 0, decision: 'ship', reason: 'threshold met',
    });
    expect(s.phase).toBe('running');
    if (s.phase !== 'running') return;
    expect(s.activeRound).toBe(1);
    expect(s.rounds[0]?.decision).toBe('ship');
  });

  it('transitions running -> shipped on ship with final composite + artifact ref', () => {
    let s: CritiqueState = runningState();
    s = reduce(s, {
      type: 'round_end', runId: RUN_ID, round: 1,
      composite: 8.6, mustFix: 0, decision: 'ship', reason: 'threshold met',
    });
    s = reduce(s, {
      type: 'ship', runId: RUN_ID, round: 1, composite: 8.6, status: 'shipped',
      artifactRef: { projectId: 'p1', artifactId: 'a1' }, summary: 'looks good',
    });
    expect(s.phase).toBe('shipped');
    if (s.phase !== 'shipped') return;
    expect(s.final.composite).toBe(8.6);
    expect(s.final.round).toBe(1);
    expect(s.final.status).toBe('shipped');
    expect(s.final.artifactRef).toEqual({ projectId: 'p1', artifactId: 'a1' });
    expect(s.final.summary).toBe('looks good');
    expect(s.rounds[0]?.composite).toBe(8.6);
  });

  it('transitions running -> degraded with reason + adapter', () => {
    const s1 = runningState();
    const s2 = reduce(s1, {
      type: 'degraded', runId: RUN_ID, reason: 'malformed_block', adapter: 'pi-rpc',
    });
    expect(s2.phase).toBe('degraded');
    if (s2.phase !== 'degraded') return;
    expect(s2.degraded.reason).toBe('malformed_block');
    expect(s2.degraded.adapter).toBe('pi-rpc');
  });

  it('transitions running -> interrupted carrying rounds + bestRound + composite', () => {
    let s: CritiqueState = runningState();
    s = reduce(s, {
      type: 'round_end', runId: RUN_ID, round: 1,
      composite: 7.9, mustFix: 1, decision: 'continue', reason: 'below threshold',
    });
    s = reduce(s, {
      type: 'interrupted', runId: RUN_ID, bestRound: 1, composite: 7.9,
    });
    expect(s.phase).toBe('interrupted');
    if (s.phase !== 'interrupted') return;
    expect(s.rounds).toHaveLength(1);
    expect(s.bestRound).toBe(1);
    expect(s.composite).toBe(7.9);
  });

  it('transitions running -> failed with cause and preserves rounds for inspection', () => {
    let s: CritiqueState = runningState();
    s = reduce(s, {
      type: 'round_end', runId: RUN_ID, round: 1,
      composite: 7.2, mustFix: 3, decision: 'continue', reason: 'below threshold',
    });
    s = reduce(s, { type: 'failed', runId: RUN_ID, cause: 'cli_exit_nonzero' });
    expect(s.phase).toBe('failed');
    if (s.phase !== 'failed') return;
    expect(s.cause).toBe('cli_exit_nonzero');
    expect(s.rounds).toHaveLength(1);
  });

  it('records parser_warning events in a side channel without changing phase', () => {
    let s: CritiqueState = runningState();
    s = reduce(s, {
      type: 'parser_warning', runId: RUN_ID, kind: 'weak_debate', position: 412,
    });
    expect(s.phase).toBe('running');
    if (s.phase !== 'running') return;
    expect(s.warnings).toEqual([{ kind: 'weak_debate', position: 412 }]);
  });

  it('accepts late parser_warning even after a terminal transition (shipped)', () => {
    let s: CritiqueState = runningState();
    s = reduce(s, {
      type: 'round_end', runId: RUN_ID, round: 1,
      composite: 8.6, mustFix: 0, decision: 'ship', reason: 'threshold met',
    });
    s = reduce(s, {
      type: 'ship', runId: RUN_ID, round: 1, composite: 8.6, status: 'shipped',
      artifactRef: { projectId: 'p1', artifactId: 'a1' }, summary: 'ok',
    });
    s = reduce(s, {
      type: 'parser_warning', runId: RUN_ID, kind: 'composite_mismatch', position: 9001,
    });
    expect(s.phase).toBe('shipped');
    if (s.phase !== 'shipped') return;
    expect(s.warnings).toEqual([{ kind: 'composite_mismatch', position: 9001 }]);
  });

  it('terminal phases are sticky against non-warning events (no double-shipping)', () => {
    let s: CritiqueState = runningState();
    s = reduce(s, {
      type: 'ship', runId: RUN_ID, round: 1, composite: 8.6, status: 'shipped',
      artifactRef: { projectId: 'p1', artifactId: 'a1' }, summary: 'ok',
    });
    const shipped = s;
    s = reduce(s, { type: 'failed', runId: RUN_ID, cause: 'orchestrator_internal' });
    expect(s).toBe(shipped);
    s = reduce(s, { type: 'degraded', runId: RUN_ID, reason: 'missing_artifact', adapter: 'pi-rpc' });
    expect(s).toBe(shipped);
  });

  it('places out-of-order panelist_dim events into the right round (round 2 lands before round 1 closes)', () => {
    // Defends against a stray late event from round 1 corrupting round 2's
    // bucket. The reducer keys rounds by number, not by "always the last".
    let s: CritiqueState = runningState();
    s = reduce(s, {
      type: 'panelist_dim', runId: RUN_ID, round: 2, role: 'copy',
      dimName: 'voice', dimScore: 9, dimNote: 'on brand',
    });
    s = reduce(s, {
      type: 'panelist_dim', runId: RUN_ID, round: 1, role: 'critic',
      dimName: 'contrast', dimScore: 7, dimNote: 'ok',
    });
    expect(s.phase).toBe('running');
    if (s.phase !== 'running') return;
    const round1 = s.rounds.find((r: CritiqueRound) => r.n === 1);
    const round2 = s.rounds.find((r: CritiqueRound) => r.n === 2);
    expect(round1?.panelists.critic?.dims).toHaveLength(1);
    expect(round1?.panelists.copy).toBeUndefined();
    expect(round2?.panelists.copy?.dims).toHaveLength(1);
    expect(round2?.panelists.critic).toBeUndefined();
  });

  it('returns identical state reference for events that have no effect (no allocation churn)', () => {
    // The hook will dispatch into useReducer; stable identity for inert
    // events keeps React from re-rendering subscribers unnecessarily.
    const s1 = runningState();
    const s2 = reduce(s1, {
      type: 'panelist_must_fix', runId: 'wrong', round: 1, role: 'critic', text: 'x',
    });
    expect(s2).toBe(s1);
  });

  it('__reset__ lifts a running state back to idle (PR #1314 review)', () => {
    // Project / transcript context changes dispatch this synthetic
    // action so the next mount cannot see a stale prior run.
    let s: CritiqueState = runningState();
    s = reduce(s, {
      type: 'panelist_must_fix', runId: RUN_ID, round: 1, role: 'critic', text: 'low contrast',
    });
    expect(s.phase).toBe('running');
    s = reduce(s, { type: '__reset__' });
    expect(s.phase).toBe('idle');
  });

  it('__reset__ lifts a terminal state back to idle too', () => {
    let s: CritiqueState = runningState();
    s = reduce(s, {
      type: 'ship', runId: RUN_ID, round: 1, composite: 8.6, status: 'shipped',
      artifactRef: { projectId: 'p1', artifactId: 'a1' }, summary: 'ok',
    });
    expect(s.phase).toBe('shipped');
    s = reduce(s, { type: '__reset__' });
    expect(s.phase).toBe('idle');
  });

  it('__reset__ on idle state returns the same reference (no allocation churn)', () => {
    const next = reduce(initialState, { type: '__reset__' });
    expect(next).toBe(initialState);
  });

  it('panelist_open materializes the round + empty panelist view (PR #1314 review)', () => {
    // Before this fix, the reducer set activePanelist/activeRound but
    // left `rounds = []`, so TheaterStage had no in-progress round
    // cell to highlight until a later dim/must-fix/close event
    // arrived. The protocol treats panelist_open as the tag-open
    // event, so the UI must become visible at that point.
    let s: CritiqueState = runningState();
    s = reduce(s, { type: 'panelist_open', runId: RUN_ID, round: 1, role: 'critic' });
    expect(s.phase).toBe('running');
    if (s.phase !== 'running') return;
    expect(s.rounds).toHaveLength(1);
    expect(s.rounds[0]?.n).toBe(1);
    expect(s.rounds[0]?.panelists.critic).toEqual({ dims: [], mustFixes: [] });
    expect(s.activePanelist).toBe('critic');
    expect(s.activeRound).toBe(1);
  });

  it('panelist_open does not stomp an existing round with prior panelist data', () => {
    let s: CritiqueState = runningState();
    s = reduce(s, {
      type: 'panelist_dim', runId: RUN_ID, round: 1, role: 'designer',
      dimName: 'composition', dimScore: 8, dimNote: 'tight',
    });
    s = reduce(s, { type: 'panelist_open', runId: RUN_ID, round: 1, role: 'critic' });
    expect(s.phase).toBe('running');
    if (s.phase !== 'running') return;
    expect(s.rounds[0]?.panelists.designer?.dims).toHaveLength(1);
    expect(s.rounds[0]?.panelists.critic).toEqual({ dims: [], mustFixes: [] });
  });
});
