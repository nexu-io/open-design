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

    dispatch({
      type: 'interrupted',
      runId: state.runId,
      bestRound: bestRoundOf(state),
      composite: bestCompositeOf(state),
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
