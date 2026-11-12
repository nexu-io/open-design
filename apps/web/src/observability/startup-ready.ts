import { useLayoutEffect } from 'react';
import { getOpenDesignHost } from '@open-design/host';

/** A committed content surface, then a foreground frame with usable inputs/data.
 * Hidden Electron windows wait for reveal; DOM mount alone never means Ready. */
export function useStartupReady(input: { visible: boolean; interactive: boolean }): void {
  useLayoutEffect(() => {
    const bridge = getOpenDesignHost()?.startup;
    if (!bridge || !input.visible) return;
    let cancelled = false;
    let frame: number | null = null;
    const check = () => {
      if (cancelled || frame !== null || document.visibilityState === 'hidden') return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (cancelled || document.visibilityState === 'hidden') return;
        void (async () => {
          const context = await bridge.context();
          if (!context || cancelled) return;
          await bridge.signal({ ...context, readiness_point: 'first_visible' });
          if (input.interactive && !cancelled) await bridge.signal({ ...context,
            readiness_point: 'interactive_ready', required_data_ready: true, actions_ready: true });
        })().catch(() => undefined);
      });
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => {
      cancelled = true;
      if (frame !== null) cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', check);
    };
  }, [input.visible, input.interactive]);
}
