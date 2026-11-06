// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { useOwnPreviewIframe, usePreviewIframeStore } from "./previewIframeStore";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

it("clears the store on owner unmount so a remount starts from null", () => {
  const seen: Array<HTMLIFrameElement | null> = [];
  const Owner = () => {
    seen.push(useOwnPreviewIframe());
    return null;
  };
  const iframe = document.createElement("iframe");
  const first = createRoot(document.createElement("div"));
  act(() => first.render(<Owner />));
  act(() => usePreviewIframeStore.getState().setIframe(iframe));
  expect(seen.at(-1)).toBe(iframe);

  act(() => first.unmount());
  expect(usePreviewIframeStore.getState().iframe).toBeNull();

  seen.length = 0;
  const second = createRoot(document.createElement("div"));
  act(() => second.render(<Owner />));
  expect(seen).toEqual([null]);
  act(() => second.unmount());
});
