// @vitest-environment jsdom
import { act, StrictMode, useCallback, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { useOwnPreviewIframe, usePreviewIframeStore } from "./previewIframeStore";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

// Mirrors NLEContext.tsx: a ref callback pushes the element on attach
// (~L126, onIframeLoad) and a separate mount/dep effect re-pushes the SAME
// ref value (~L304-306, deps include an unrelated counter like refreshKey).
function Child({ tick }: { tick: number }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const setIframe = usePreviewIframeStore((s) => s.setIframe);

  const handleRef = useCallback(
    (el: HTMLIFrameElement | null) => {
      iframeRef.current = el;
      setIframe(el);
    },
    [setIframe],
  );

  useEffect(() => {
    setIframe(iframeRef.current);
  }, [tick, setIframe]);

  return <iframe ref={handleRef} />;
}

function Owner({ tick }: { tick: number }) {
  useOwnPreviewIframe();
  return <Child tick={tick} />;
}

it("does not notify raw subscribers for a repeated setIframe(sameValue)", () => {
  let notifyCount = 0;
  const unsubscribe = usePreviewIframeStore.subscribe(() => {
    notifyCount += 1;
  });

  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => {
    root.render(
      <StrictMode>
        <Owner tick={0} />
      </StrictMode>,
    );
  });
  // A dep bump on the mount effect with the iframe DOM node unchanged -
  // the shape NLEContext hits every time refreshKey moves without a new
  // <iframe>.
  act(() => {
    root.render(
      <StrictMode>
        <Owner tick={1} />
      </StrictMode>,
    );
  });

  const iframe = usePreviewIframeStore.getState().iframe;
  expect(iframe).not.toBeNull();

  // 3 real Object.is-distinct transitions happen here: the ref-callback's
  // null -> element attach, then StrictMode's mount-effect replay drives
  // useOwnPreviewIframe's unmount cleanup (element -> null) and the
  // re-run mount effect (null -> element) once each. Measured on the
  // unfixed store: 7 (four of those are the SAME value re-pushed by the
  // ref callback's own redundant effect run and the tick-bump update).
  expect(notifyCount).toBe(3);

  act(() => root.unmount());
  unsubscribe();
});
