import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useCritiqueStream } from './hooks/useCritiqueStream';
import { TheaterStage } from './TheaterStage';
import type { CritiqueState } from './state/reducer';

interface Props {
  projectId: string | null;
  enabled: boolean;
  /**
   * Test seam: swap the connection factory so RTL tests can drive
   * the reducer through synthetic SSE actions without spinning up a
   * real EventSource. Production callers pass nothing.
   */
  connectionFactory?: Parameters<typeof useCritiqueStream>[2] extends infer T
    ? T extends { connectionFactory?: infer F }
      ? F
      : never
    : never;
  /**
   * Test seam for the kill request. Production callers pass nothing
   * and we use platform `fetch`; tests inject a stub to capture the
   * URL / method and resolve with a synthetic Response. Returning a
   * rejected promise simulates a daemon that has not landed the
   * endpoint yet — the optimistic local dispatch still fires so the
   * UI moves to `interrupted`, and the warning surfaces on the
   * developer console rather than tearing the React tree.
   */
  fetchInterrupt?: (url: string, init: RequestInit) => Promise<Response>;
}

/**
 * Self-contained mount point the surrounding project view can drop next
 * to the artifact iframe. Owns the SSE subscription (via
 * `useCritiqueStream`), the kill-request handshake, and the swap from
 * the live `<TheaterStage>` to its terminal-phase variants once the run
 * settles. Idle returns `null` so projects without a live run stay
 * visually unchanged.
 *
 * The `enabled` prop is the M1 settings toggle: when false the hook
 * tears down its connection and the mount renders nothing, regardless
 * of any in-flight runs the user opened previously.
 */
export function CritiqueTheaterMount({
  projectId,
  enabled,
  connectionFactory,
  fetchInterrupt,
}: Props) {
  const options = useMemo(
    () => (connectionFactory ? { connectionFactory } : {}),
    [connectionFactory],
  );
  const { state, dispatch } = useCritiqueStream(projectId, enabled, options);
  const [interruptPending, setInterruptPending] = useState(false);

  // Reset `interruptPending` whenever the runId changes so a fresh
  // run after a prior interrupt does not inherit a stuck button.
  // Codex P2 on PR #1315: the previous revision left `interruptPending`
  // true forever once clicked.
  const lastRunIdRef = useRef<string | null>(null);
  const currentRunId = state.phase === 'idle' ? null : state.runId;
  useEffect(() => {
    if (lastRunIdRef.current !== currentRunId) {
      lastRunIdRef.current = currentRunId;
      setInterruptPending(false);
    }
  }, [currentRunId]);

  const onInterrupt = useCallback(() => {
    if (interruptPending) return;
    if (state.phase !== 'running') return;
    if (!projectId) return;
    setInterruptPending(true);

    // Lefarcen + codex P1 on PR #1315: the previous revision did the
    // optimistic local dispatch only, so the daemon-side run kept
    // executing while the UI ignored the real terminal event. Fire
    // the daemon kill request alongside the optimistic dispatch.
    // Daemon contract: `POST /api/projects/:id/critique/:runId/interrupt`
    // returns 204 on success, 404 if the endpoint has not been wired
    // up yet (Phase 15). Either response is treated as a best-effort
    // signal: the UI moves to `interrupted` because the user asked
    // for it; any real outcome the daemon emits later is dropped
    // because terminal phases are sticky in the reducer.
    const fetcher = fetchInterrupt ?? ((url, init) => fetch(url, init));
    const url = `/api/projects/${encodeURIComponent(projectId)}/critique/${encodeURIComponent(state.runId)}/interrupt`;
    fetcher(url, { method: 'POST' }).catch((err) => {
      if (
        typeof process !== 'undefined'
        && process.env?.NODE_ENV === 'development'
      ) {
        // eslint-disable-next-line no-console
        console.warn('[critique-theater] interrupt request failed', err);
      }
    });

    const { round: bestRound, composite: bestComposite } = bestRoundAndComposite(state);
    dispatch({
      type: 'interrupted',
      runId: state.runId,
      bestRound,
      composite: bestComposite,
    });
  }, [interruptPending, state, dispatch, projectId, fetchInterrupt]);

  if (!enabled) return null;
  if (state.phase === 'idle') return null;

  return (
    <TheaterStage
      state={state}
      onInterrupt={onInterrupt}
      interruptPending={interruptPending}
    />
  );
}

/**
 * Single-pass helper that returns the round number AND composite of the
 * best-scoring round seen so far. The two values are sourced together so
 * the optimistic `interrupted` dispatch cannot pair a `bestRound` from one
 * round with a `composite` from another. The previous split helpers had a
 * subtle bug where `bestRoundOf` returned the last round with any composite
 * (regardless of value) while `bestCompositeOf` correctly returned the
 * max; a run that closed round 1 at 8.5 and round 2 at 6.0 would dispatch
 * `bestRound: 2, composite: 8.5`. PerishCode P2 on PR #1338.
 *
 * Falls back to `state.activeRound` and composite 0 when no round has
 * closed with a numeric composite yet (typical when the user interrupts
 * before the first `round_end` event arrives).
 */
function bestRoundAndComposite(
  state: Extract<CritiqueState, { phase: 'running' }>,
): { round: number; composite: number } {
  let bestRound = 0;
  let bestComposite = -Infinity;
  for (const r of state.rounds) {
    if (typeof r.composite === 'number' && r.composite > bestComposite) {
      bestComposite = r.composite;
      bestRound = r.n;
    }
  }
  if (bestRound === 0) {
    return { round: state.activeRound, composite: 0 };
  }
  return { round: bestRound, composite: bestComposite };
}
