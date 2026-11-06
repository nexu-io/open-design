// @vitest-environment happy-dom

import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetOverlayFrameLoopForTests } from "./overlayFrameLoop";
import {
  usePreviewCompositionRect,
  type PreviewCompositionRect,
} from "./usePreviewCompositionRect";
import { usePlayerStore } from "../../player/store/playerStore";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  resetOverlayFrameLoopForTests();
  document.body.innerHTML = "";
});

function boxed<T extends HTMLElement>(el: T, box: [number, number, number, number]): T {
  const [left, top, width, height] = box;
  el.getBoundingClientRect = () => new DOMRect(left, top, width, height);
  return el;
}

function mountProbe() {
  let rect: PreviewCompositionRect | undefined;
  let setIframe: (iframe: HTMLIFrameElement | null) => void = () => {};
  function Probe() {
    const ref = useRef<HTMLDivElement>(null);
    const [iframe, updateIframe] = useState<HTMLIFrameElement | null>(null);
    setIframe = updateIframe;
    rect = usePreviewCompositionRect(ref, iframe);
    return (
      <div
        ref={(el) => {
          ref.current = el;
          if (el) boxed(el, [10, 20, 1000, 600]);
        }}
      />
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<Probe />));
  return { read: () => rect, setIframe, unmount: () => act(() => root.unmount()) };
}

function compositionFrame(box: [number, number, number, number], width: number, height: number) {
  const iframe = boxed(document.createElement("iframe"), box);
  document.body.append(iframe);
  const root = iframe.contentDocument?.createElement("div");
  root?.setAttribute("data-composition-id", "main");
  root?.setAttribute("data-width", String(width));
  root?.setAttribute("data-height", String(height));
  if (root) iframe.contentDocument?.body.append(root);
  return iframe;
}

const settle = () => new Promise((r) => setTimeout(r, 400));

beforeEach(() => {
  usePlayerStore.setState({ previewBooted: true });
});

describe("usePreviewCompositionRect", () => {
  it("reports the live preview iframe's box relative to the overlay, scaled to the composition", async () => {
    const probe = mountProbe();
    const iframe = compositionFrame([110, 70, 960, 540], 1920, 1080);
    await act(async () => {
      probe.setIframe(iframe);
      await settle();
    });
    expect(probe.read()).toEqual({
      left: 100,
      top: 50,
      width: 960,
      height: 540,
      scaleX: 0.5,
      scaleY: 0.5,
    });
    probe.unmount();
  });

  it("follows the iframe when a reload replaces it", async () => {
    const probe = mountProbe();
    await act(async () => {
      probe.setIframe(compositionFrame([110, 70, 960, 540], 1920, 1080));
      await settle();
    });
    await act(async () => {
      probe.setIframe(compositionFrame([60, 40, 500, 500], 1000, 1000));
      await settle();
    });
    expect(probe.read()).toEqual({
      left: 50,
      top: 20,
      width: 500,
      height: 500,
      scaleX: 0.5,
      scaleY: 0.5,
    });
    probe.unmount();
  });
});
