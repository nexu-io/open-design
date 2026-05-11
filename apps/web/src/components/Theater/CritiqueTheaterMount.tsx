import { useCallback, useMemo, useState } from 'react';

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
}

/**
 * Self-contained mount point the surrounding project view can drop next
 * to the artifact iframe. Owns the SSE subscription (via
 * `useCritiqueStream`), the kill-request handshake, and the swap from
 * the live `<TheaterStage>` to its terminal-phase variants once the run
 * settles. Idle returns `null` so projects without a live run stay
 * visually unchanged.
 *
 * The `enabled` prop is the M1 settings toggle — when false the hook
 * tears down its connection and the mount renders nothing, regardless
 * of any in-flight runs the user opened previously.
 */
export function CritiqueTheaterMount({ projectId, enabled, connectionFactory }: Props) {
  const options = useMemo(
    () => (connectionFactory ? { connectionFactory } : {}),
    [connectionFactory],
  );
  const { state, dispatch } = useCritiqueStream(projectId, enabled, options);
  const [interruptPending, setInterruptPending] = useState(false);

  const onInterrupt = useCallback(() => {
    if (interruptPending) return;
    if (state.phase !== 'running') return;
    setInterruptPending(true);
    // Synthesize an interrupted action locally so the UI reflects the
    // user's intent immediately. The real kill request to the daemon
    // lands in Phase 15's rollout wiring; for now the optimistic
    // dispatch keeps the surface honest about user intent.
    dispatch({
      type: 'interrupted',
      runId: state.runId,
      bestRound: bestRoundOf(state),
      composite: bestCompositeOf(state),
    });
  }, [interruptPending, state, dispatch]);

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
