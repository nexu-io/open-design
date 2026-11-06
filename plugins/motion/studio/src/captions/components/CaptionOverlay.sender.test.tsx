// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CaptionOverlay } from "./CaptionOverlay";
import { useCaptionStore } from "../store";
import { usePreviewIframeStore } from "../../player/store/previewIframeStore";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

it("only schedules caption layout for messages from its preview", () => {
  const host = document.createElement("div");
  const preview = document.createElement("iframe");
  const foreign = document.createElement("iframe");
  document.body.append(host, preview, foreign);
  const root = createRoot(host);
  const schedule = vi.fn(() => 1);
  vi.stubGlobal("requestAnimationFrame", schedule);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  useCaptionStore.getState().setEditMode(true);
  const send = (source: MessageEventSource | null) =>
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { source, data: { source: "hf-preview" } }));
    });
  try {
    act(() => root.render(<CaptionOverlay iframeRef={{ current: preview }} />));
    schedule.mockClear();
    send(foreign.contentWindow);
    send(null);
    expect(schedule).not.toHaveBeenCalled();
    send(preview.contentWindow);
    expect(schedule).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    useCaptionStore.getState().reset();
    host.remove();
    preview.remove();
    foreign.remove();
    vi.unstubAllGlobals();
  }
});

it("observes and accepts messages from the promoted iframe, not the old one", () => {
  const host = document.createElement("div");
  const a = document.createElement("iframe");
  const b = document.createElement("iframe");
  document.body.append(host, a, b);
  const ref = { current: a };
  const root = createRoot(host);
  const schedule = vi.fn(() => 1);
  const observed: Element[] = [];
  vi.stubGlobal("requestAnimationFrame", schedule);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(el: Element) {
        observed.push(el);
      }
      disconnect() {}
    },
  );
  useCaptionStore.getState().setEditMode(true);
  const send = (source: MessageEventSource | null) =>
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { source, data: { source: "hf-preview" } }));
    });
  try {
    act(() => usePreviewIframeStore.getState().setIframe(a));
    act(() => root.render(<CaptionOverlay iframeRef={ref} />));
    expect(observed).toContain(a);
    expect(observed).not.toContain(b);
    act(() => {
      ref.current = b;
      usePreviewIframeStore.getState().setIframe(b);
    });
    expect(observed).toContain(b);
    schedule.mockClear();
    send(a.contentWindow);
    expect(schedule).not.toHaveBeenCalled();
    send(b.contentWindow);
    expect(schedule).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    usePreviewIframeStore.setState({ iframe: null });
    useCaptionStore.getState().reset();
    host.remove();
    a.remove();
    b.remove();
    vi.unstubAllGlobals();
  }
});
