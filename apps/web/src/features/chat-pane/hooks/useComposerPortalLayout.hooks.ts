import { useEffect, useLayoutEffect, useState, type MutableRefObject } from 'react';
import { chatPaneDomPort } from '../dependencies';
import type { ChatPaneDomPort } from '../ports';

export function useComposerPortalLayout(
  composerSlotRef: MutableRefObject<HTMLDivElement | null>,
  composerLayerRef: MutableRefObject<HTMLDivElement | null>,
  tab: string,
  port: ChatPaneDomPort = chatPaneDomPort,
) {
  const [composerPortalTarget, setComposerPortalTarget] = useState<HTMLElement | null>(null);
  const [composerPortalRect, setComposerPortalRect] = useState<{
    left: number;
    width: number;
    bottom: number;
  } | null>(null);
  const [composerSlotHeight, setComposerSlotHeight] = useState(0);

  useEffect(() => {
    setComposerPortalTarget(port.getDocumentBody());
  }, [port]);

  useLayoutEffect(() => {
    if (tab !== 'chat') {
      setComposerPortalRect(null);
      return;
    }
    const slot = composerSlotRef.current;
    if (!slot) return;
    return port.subscribeComposerPortalRect(slot, (next) => {
      setComposerPortalRect((prev) => {
        if (
          prev
          && prev.left === next.left
          && prev.width === next.width
          && prev.bottom === next.bottom
        ) {
          return prev;
        }
        return next;
      });
    });
  }, [composerSlotRef, port, tab]);

  useLayoutEffect(() => {
    if (tab !== 'chat' || !composerPortalTarget || !composerPortalRect) return;
    const layer = composerLayerRef.current;
    if (!layer) return;
    return port.subscribeComposerLayerHeight(layer, (nextHeight) => {
      setComposerSlotHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    });
  }, [composerLayerRef, composerPortalRect, composerPortalTarget, port, tab]);

  return { composerPortalTarget, composerPortalRect, composerSlotHeight };
}
