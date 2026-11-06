// @vitest-environment happy-dom

import React, { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { NLEPreview } from "./NLEPreview";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

it("keeps a shadow reload whose runtime boots after 8 s, and its player comes ready", async () => {
  await import("@hyperframes/player");
  vi.useFakeTimers();
  const onShadowError = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(NLEPreview, {
        projectId: "p",
        iframeRef: createRef<HTMLIFrameElement>(),
        onIframeLoad: () => {},
        previewSlots: [
          { gen: 0, role: "live" },
          { gen: 1, role: "shadow", url: "/api/projects/p/preview?_t=1" },
        ],
        onShadowIframeLoad: () => {},
        onShadowReadyChange: () => {},
        onShadowError,
        setShadowIframeNode: () => {},
        resetPreviewSlots: () => {},
      }),
    );
  });

  const shadow = host.querySelectorAll<
    HTMLElement & { iframeElement: HTMLIFrameElement; ready: boolean }
  >("hyperframes-player")[1];
  const iframe = shadow.iframeElement;
  // This unit test supplies the runtime itself, without loading an HTTP page.
  iframe.srcdoc = "<!doctype html><html><body></body></html>";
  act(() => {
    iframe.dispatchEvent(new Event("load"));
  });
  act(() => {
    vi.advanceTimersByTime(10_000);
  });
  expect(onShadowError).not.toHaveBeenCalled();

  Object.assign(iframe.contentWindow!, { __player: { getDuration: () => 9 } });
  act(() => {
    vi.advanceTimersByTime(1_000);
  });
  expect(onShadowError).not.toHaveBeenCalled();
  expect(shadow.ready).toBe(true);
  // The live slot keeps the player's own 8 s deadline.
  expect(host.querySelector("hyperframes-player")?.hasAttribute("no-load-timeout")).toBe(false);
  act(() => root.unmount());
});
