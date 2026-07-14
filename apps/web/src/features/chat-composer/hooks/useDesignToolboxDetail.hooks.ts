// Feature-local hook for the design-toolbox hover-detail panel: one shared
// portaled panel swapped as the cursor sweeps the resource list (a per-row
// panel ghosted — the close delay left several stacked on screen at once).
//
// `useDesignToolboxDetail(port)` is the real hook; its viewport read is
// INJECTED as the slice port so it holds no import to a provider and
// unit-tests against a hand-written fake `ViewportPort`.
// `useWiredDesignToolboxDetail()` (bottom of file) binds the real provider
// port and is the default the orchestrator/panel injects.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ViewportPort } from '../ports';
import { viewportPort } from '../dependencies';
import { computeToolboxDetailPosition } from '../rules';
import {
  DESIGN_TOOLBOX_DETAIL_CLOSE_DELAY_MS,
  DESIGN_TOOLBOX_DETAIL_OPTIONS,
} from '../constants';

export interface DesignToolboxDetailState {
  key: string;
  left: number;
  top: number;
  node: ReactNode;
}

export interface DesignToolboxDetailController {
  toolboxDetail: DesignToolboxDetailState | null;
  /** Cancel any pending close and show the detail panel for `key`. */
  showToolboxDetail: (key: string, rect: DOMRect, node: ReactNode) => void;
  /** Cancel any pending close (e.g. the pointer re-enters the panel itself). */
  cancelDetailClose: () => void;
  /** Schedule `key`'s panel to close after a short grace period. */
  scheduleToolboxDetailClose: (key: string) => void;
}

export function useDesignToolboxDetail(port: ViewportPort): DesignToolboxDetailController {
  const [toolboxDetail, setToolboxDetail] = useState<DesignToolboxDetailState | null>(null);
  const detailCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelDetailClose = useCallback(() => {
    if (detailCloseTimer.current) {
      clearTimeout(detailCloseTimer.current);
      detailCloseTimer.current = null;
    }
  }, []);

  const showToolboxDetail = useCallback(
    (key: string, rect: DOMRect, node: ReactNode) => {
      cancelDetailClose();
      // Plugin rows render a tall visual preview; the helper clamps both axes
      // into the viewport so the fixed panel never lands off-screen on a
      // narrow pane (see computeToolboxDetailPosition).
      const { left, top } = computeToolboxDetailPosition(
        rect,
        port.getViewportSize(),
        DESIGN_TOOLBOX_DETAIL_OPTIONS,
      );
      setToolboxDetail({ key, left, top, node });
    },
    [cancelDetailClose, port],
  );

  const scheduleToolboxDetailClose = useCallback(
    (key: string) => {
      cancelDetailClose();
      detailCloseTimer.current = setTimeout(() => {
        setToolboxDetail((cur) => (cur?.key === key ? null : cur));
        detailCloseTimer.current = null;
      }, DESIGN_TOOLBOX_DETAIL_CLOSE_DELAY_MS);
    },
    [cancelDetailClose],
  );

  useEffect(() => () => cancelDetailClose(), [cancelDetailClose]);

  return { toolboxDetail, showToolboxDetail, cancelDetailClose, scheduleToolboxDetailClose };
}

/**
 * Wirer: binds the real viewport port and returns a ready-to-call hook. This
 * is the default the panel injects; swap it via the component prop in tests.
 */
export function useWiredDesignToolboxDetail(): DesignToolboxDetailController {
  return useDesignToolboxDetail(viewportPort);
}
