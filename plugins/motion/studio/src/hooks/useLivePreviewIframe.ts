import { useEffect, useRef, useState } from "react";
import { onPreviewPromoted } from "../player/sceneSwap";

/** The one source for which preview is on screen: the host's iframe, then each reload promoted in its place. */
export function useLivePreviewIframe(host: HTMLIFrameElement | null): HTMLIFrameElement | null {
  const [promoted, setPromoted] = useState<{ host: HTMLIFrameElement; live: HTMLIFrameElement }>();
  const live = host && promoted?.host === host ? promoted.live : host;
  const liveRef = useRef(live);
  liveRef.current = live;
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    if (!host) return;
    return onPreviewPromoted(host.ownerDocument, ({ retired, live: next }) => {
      if (retired === liveRef.current) setPromoted({ host, live: next });
    });
  }, [host]);
  return live;
}
