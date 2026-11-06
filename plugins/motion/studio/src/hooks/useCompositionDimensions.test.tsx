// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { useCompositionDimensions } from "./useCompositionDimensions";
import { usePreviewIframeStore } from "../player/store/previewIframeStore";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

it("accepts only the current preview frame and rejects foreign or missing senders", () => {
  const host = document.createElement("div");
  const preview = document.createElement("iframe");
  const foreign = document.createElement("iframe");
  document.body.append(host, preview, foreign);
  const ref = { current: preview };
  const root = createRoot(host);
  function Harness() {
    return JSON.stringify(useCompositionDimensions(ref));
  }
  const send = (source: MessageEventSource | null, width: number) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          source,
          origin: window.location.origin,
          data: { source: "hf-preview", type: "stage-size", width, height: 100 },
        }),
      );
    });
  try {
    act(() => root.render(<Harness />));
    send(foreign.contentWindow, 300);
    send(null, 400);
    expect(host.textContent).toBe("null");
    send(preview.contentWindow, 200);
    expect(host.textContent).toBe('{"width":200,"height":100}');
    ref.current = foreign;
    send(preview.contentWindow, 500);
    expect(host.textContent).toBe('{"width":200,"height":100}');
    send(foreign.contentWindow, 600);
    expect(host.textContent).toBe('{"width":600,"height":100}');
  } finally {
    act(() => root.unmount());
    host.remove();
    preview.remove();
    foreign.remove();
  }
});

it("re-reads the size from the promoted iframe's document", () => {
  const host = document.createElement("div");
  const a = document.createElement("iframe");
  const b = document.createElement("iframe");
  document.body.append(host, a, b);
  const ref = { current: a };
  const root = createRoot(host);
  const setRoot = (frame: HTMLIFrameElement, width: number, height: number) => {
    const el = frame.contentDocument!.createElement("div");
    el.setAttribute("data-composition-id", "main");
    el.setAttribute("data-width", String(width));
    el.setAttribute("data-height", String(height));
    frame.contentDocument!.body.append(el);
  };
  setRoot(a, 1920, 1080);
  setRoot(b, 1080, 1920);
  function Harness() {
    return JSON.stringify(useCompositionDimensions(ref));
  }
  try {
    act(() => usePreviewIframeStore.getState().setIframe(a));
    act(() => root.render(<Harness />));
    expect(host.textContent).toBe('{"width":1920,"height":1080}');
    act(() => {
      usePreviewIframeStore.getState().setIframe(b);
    });
    expect(host.textContent).toBe('{"width":1080,"height":1920}');
  } finally {
    act(() => root.unmount());
    usePreviewIframeStore.setState({ iframe: null });
    host.remove();
    a.remove();
    b.remove();
  }
});
