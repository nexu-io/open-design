// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useCaptionDetection } from "./useCaptionDetection";
import { usePreviewIframeStore } from "../player/store/previewIframeStore";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

it("does not let a foreign window trigger caption activation", () => {
  const host = document.createElement("div");
  const preview = document.createElement("iframe");
  const foreign = document.createElement("iframe");
  document.body.append(host, preview, foreign);
  const root = createRoot(host);
  const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetchMock);
  const params = {
    projectId: "demo",
    activeCompPath: "captions.html",
    compIdToSrc: new Map<string, string>(),
    captionEditMode: false,
    captionHasSelection: false,
    previewIframeRef: { current: preview },
    captionSync: { save: vi.fn(), loadOverrides: vi.fn(async () => {}) },
    setRightCollapsed: vi.fn(),
  };
  function Harness() {
    useCaptionDetection(params);
    return null;
  }
  const send = (source: MessageEventSource | null) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", { source, data: { source: "hf-preview", type: "state" } }),
      );
    });
  try {
    act(() => root.render(<Harness />));
    const group = preview.contentDocument!.createElement("div");
    group.className = "caption-group";
    preview.contentDocument!.body.append(group);
    send(foreign.contentWindow);
    send(null);
    expect(fetchMock).not.toHaveBeenCalled();
    send(preview.contentWindow);
    expect(fetchMock).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
    preview.remove();
    foreign.remove();
    vi.unstubAllGlobals();
  }
});

it("re-runs caption activation on the promoted iframe's document", () => {
  const host = document.createElement("div");
  const a = document.createElement("iframe");
  const b = document.createElement("iframe");
  document.body.append(host, a, b);
  const ref = { current: a };
  const root = createRoot(host);
  const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetchMock);
  const params = {
    projectId: "demo",
    activeCompPath: "captions.html",
    compIdToSrc: new Map<string, string>(),
    captionEditMode: false,
    captionHasSelection: false,
    previewIframeRef: ref,
    captionSync: { save: vi.fn(), loadOverrides: vi.fn(async () => {}) },
    setRightCollapsed: vi.fn(),
  };
  function Harness() {
    useCaptionDetection(params);
    return null;
  }
  try {
    act(() => usePreviewIframeStore.getState().setIframe(a));
    act(() => root.render(<Harness />));
    const group = b.contentDocument!.createElement("div");
    group.className = "caption-group";
    b.contentDocument!.body.append(group);
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => {
      ref.current = b;
      usePreviewIframeStore.getState().setIframe(b);
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    usePreviewIframeStore.setState({ iframe: null });
    host.remove();
    a.remove();
    b.remove();
    vi.unstubAllGlobals();
  }
});
