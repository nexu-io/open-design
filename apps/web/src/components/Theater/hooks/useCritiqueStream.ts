import { useEffect, useReducer, useRef } from 'react';
import type { Dispatch } from 'react';

import {
  initialState,
  reduce,
  type CritiqueAction,
  type CritiqueState,
} from '../state/reducer';
import {
  createCritiqueEventsConnection,
  type CritiqueEventsConnection,
  type CritiqueEventsConnectionOptions,
} from '../state/sse';

export interface UseCritiqueStreamOptions extends CritiqueEventsConnectionOptions {
  /**
   * Test seam: substitute the connection factory. Lets tests drive the
   * reducer without spinning up a real EventSource. Defaults to
   * `createCritiqueEventsConnection`.
   */
  connectionFactory?: (
    projectId: string,
    onEvent: (action: CritiqueAction) => void,
    opts: CritiqueEventsConnectionOptions,
  ) => CritiqueEventsConnection;
}

export interface UseCritiqueStreamResult {
  state: CritiqueState;
  dispatch: Dispatch<CritiqueAction>;
}

/**
 * Subscribe a Critique Theater reducer to the project-scoped SSE bus. The
 * hook owns the reducer (`useReducer`) and a single live connection while
 * `enabled` is true and `projectId` is non-null. Tear-down (project change,
 * disable, unmount) closes the connection cleanly.
 *
 * The returned `dispatch` lets local UI synthesise actions (e.g. a confirm
 * button that fires a synthetic `interrupted` while a kill request is in
 * flight); production traffic comes from the SSE stream.
 */
export function useCritiqueStream(
  projectId: string | null | undefined,
  enabled: boolean,
  options: UseCritiqueStreamOptions = {},
): UseCritiqueStreamResult {
  const [state, dispatch] = useReducer(reduce, initialState);
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  const factory = options.connectionFactory ?? createCritiqueEventsConnection;

  useEffect(() => {
    // Clear any state from the previous project / enabled session
    // before we decide whether to open a new connection. Without this,
    // a workspace that switches from project A (which already streamed
    // a critique) to project B would keep rendering project A's
    // Theater state until B's run_started arrived, and a flip from
    // enabled=true to enabled=false would leave the in-flight run
    // visible after the connection had been torn down (lefarcen +
    // Siri-Ray + codex P2 on PR #1314). The reducer's reset handler
    // is a no-op when state is already idle, so this is cheap on
    // the common path.
    dispatchRef.current({ type: '__reset__' });
    if (!enabled || !projectId) return;
    if (typeof window === 'undefined' && !options.EventSourceCtor) return;
    const conn = factory(
      projectId,
      (action) => dispatchRef.current(action),
      {
        EventSourceCtor: options.EventSourceCtor,
        initialBackoffMs: options.initialBackoffMs,
        maxBackoffMs: options.maxBackoffMs,
        setTimeoutFn: options.setTimeoutFn,
        clearTimeoutFn: options.clearTimeoutFn,
      },
    );
    return () => conn.close();
    // factory identity is intentionally captured at mount; rest are the
    // configurable knobs a parent might tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, enabled, options.EventSourceCtor, options.initialBackoffMs, options.maxBackoffMs]);

  return { state, dispatch };
}
