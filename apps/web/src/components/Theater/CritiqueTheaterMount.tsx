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

    // Snapshot the state values at click time. The fetch is async; by the
    // time it resolves a fresh run could have started and `state.runId`
    // could refer to a different run. The dispatch must carry the runId
    // the user clicked on, not the latest one.
    const runId = state.runId;
    const bestRound = bestRoundOf(state);
    const composite = bestCompositeOf(state);

    setInterruptPending(true);

    // Siri-Ray + lefarcen P1 on PR #1316: the prior revision dispatched
    // `interrupted` synchronously alongside the fetch, so a daemon that
    // returned 404 / 409 (endpoint not wired, run already finished)
    // still moved the UI to the sticky `interrupted` terminal phase and
    // ignored every real terminal event the daemon emitted later. The
    // new flow waits for the daemon ack: only on a successful response
    // (HTTP 2xx) do we mark the run interrupted locally. On rejection,
    // we clear `interruptPending` so the user can retry, and the real
    // SSE terminal event the daemon emits later still wins.
    const fetcher = fetchInterrupt ?? ((url, init) => fetch(url, init));
    const url = `/api/projects/${encodeURIComponent(projectId)}/critique/${encodeURIComponent(runId)}/interrupt`;
    fetcher(url, { method: 'POST' }).then((res) => {
      if (res.ok) {
        dispatch({ type: 'interrupted', runId, bestRound, composite });
        return;
      }
      // Daemon rejected the request (e.g. 404 endpoint not wired,
      // 409 run already terminal). Surface the error in dev and let
      // the user retry; do NOT terminalize the UI.
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

function bestRoundOf(state: Extract<CritiqueState, { phase: 'running' }>): number {
  let best = 0;
  for (const r of state.rounds) {
    if (typeof r.composite === 'number') best = r.n;
  }
  return best || state.activeRound;
}

function bestCompositeOf(state: Extract<CritiqueState, { phase: 'running' }>): number {
  let best = 0;
  for (const r of state.rounds) {
    if (typeof r.composite === 'number' && r.composite > best) best = r.composite;
  }
  return best;
}
