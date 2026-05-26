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
   * URL / method and resolve with a synthetic Response. The UI only
   * terminalizes on a 2xx response: a rejection or non-2xx (404
   * endpoint not wired, 409 run already terminal) clears the pending
   * flag so the user can retry and the real SSE terminal event still
   * wins. A warning surfaces in development; production stays silent.
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

    // Snapshot at click time. The fetch is async; by the time it resolves
    // a fresh run could have started and `state.runId` could refer to a
    // different run. The dispatch must carry the runId / round / composite
    // the user actually saw when they clicked, not whatever the SSE feed
    // advanced to in the meantime.
    const runId = state.runId;
    const { round: bestRound, composite } = bestRoundAndComposite(state);

    setInterruptPending(true);

    // Siri-Ray + lefarcen P1 on PR #1316: the prior revision dispatched
    // `interrupted` synchronously alongside the fetch, so a daemon that
    // returned 404 / 409 (endpoint not wired, run already terminal) still
    // moved the UI to the sticky `interrupted` phase and ignored every
    // real terminal event the daemon emitted later. The new flow waits
    // for the daemon ack: only on a successful response (HTTP 2xx) do we
    // mark the run interrupted locally. On rejection or non-2xx we clear
    // `interruptPending` so the user can retry, and the real SSE
    // terminal event the daemon emits later still wins.
    const fetcher = fetchInterrupt ?? ((url, init) => fetch(url, init));
    const url = `/api/projects/${encodeURIComponent(projectId)}/critique/${encodeURIComponent(runId)}/interrupt`;
    fetcher(url, { method: 'POST' }).then((res) => {
      if (res.ok) {
        dispatch({ type: 'interrupted', runId, bestRound, composite });
        return;
      }
      setInterruptPending(false);
      if (
        typeof process !== 'undefined'
        && process.env?.NODE_ENV === 'development'
      ) {
        // eslint-disable-next-line no-console
        console.warn(
          `[critique-theater] interrupt rejected by daemon (HTTP ${res.status})`,
        );
      }
    }).catch((err) => {
      setInterruptPending(false);
      if (
        typeof process !== 'undefined'
        && process.env?.NODE_ENV === 'development'
      ) {
        // eslint-disable-next-line no-console
        console.warn('[critique-theater] interrupt request failed', err);
      }
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
 * Single-pass helper returning the round number paired to the highest
 * composite seen so far. The earlier split (`bestRoundOf` walked rounds
 * top-down and stamped the round of the LAST closed entry; `bestCompositeOf`
 * found the MAX composite) could disagree on non-monotonic runs: round 1
 * at 8.5 followed by round 2 at 6.0 shipped `bestRound: 2, composite: 8.5`,
 * a pair that never existed (PerishCode P3 on PR #1315). Falls back to
 * `(activeRound, 0)` when no round has closed with a numeric composite,
 * which is the typical state when the user interrupts before the first
 * `round_end` event.
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
  if (bestRound === 0) return { round: state.activeRound, composite: 0 };
  return { round: bestRound, composite: bestComposite };
}
