// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "../store/playerStore";
import { usePreviewQualityForwarding } from "./usePreviewQualityForwarding";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  usePlayerStore.getState().setPreviewQuality(1);
});

function mount(frame: { postMessage: (message: unknown) => void } | null) {
  const iframeRef = {
    current: frame ? ({ contentWindow: frame } as unknown as HTMLIFrameElement) : null,
  };
  function Probe() {
    usePreviewQualityForwarding(iframeRef);
    return null;
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(React.createElement(Probe)));
  return root;
}

const actions = (postMessage: ReturnType<typeof vi.fn>) =>
  postMessage.mock.calls.map(([message]) => (message as { action: string }).action);

describe("usePreviewQualityForwarding", () => {
  it("sends the level when it changes, and each retry, to the preview", () => {
    const postMessage = vi.fn();
    mount({ postMessage });

    act(() => usePlayerStore.getState().setPreviewQuality(0.5));
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "set-preview-quality", level: 0.5 }),
      "*",
    );

    const before = postMessage.mock.calls.length;
    act(() => usePlayerStore.getState().retryPreviewCopies());
    expect(actions(postMessage).slice(before)).toEqual(["retry-preview-copies"]);
  });

  it("asks the preview for its facts each time they are requested", () => {
    const postMessage = vi.fn();
    mount({ postMessage });
    const before = postMessage.mock.calls.length;

    act(() => usePlayerStore.getState().requestPreviewFacts());
    expect(actions(postMessage).slice(before)).toEqual(["request-preview-facts"]);
  });

  it("does nothing while there is no preview", () => {
    mount(null);
    expect(() => act(() => usePlayerStore.getState().setPreviewQuality(0.25))).not.toThrow();
  });
});
