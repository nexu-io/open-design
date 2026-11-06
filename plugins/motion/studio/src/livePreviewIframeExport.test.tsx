// @vitest-environment happy-dom
// Reads the preview on screen the way a host app does: by package name.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, expectTypeOf, it } from "vitest";
import { useLivePreviewIframe, type PreviewPromotion } from "@hyperframes/studio";
import {
  makePreview,
  mountPlayerWithPreview,
  paintShadow,
} from "./player/hooks/timelinePlayerTestHarness";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("gives a host the preview on screen after a real shadow reload is promoted", async () => {
  expectTypeOf<PreviewPromotion>().toHaveProperty("live");
  const host = makePreview("<h1>Title</h1>");
  const player = mountPlayerWithPreview(host);
  let live: HTMLIFrameElement | null = null;
  function Probe() {
    live = useLivePreviewIframe(host);
    return null;
  }
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() => root.render(<Probe />));
  act(() => player.getApi().refreshPlayer());
  const shadow = makePreview("<h1>Title</h1>", "?_t=1");
  await paintShadow(player.getApi, shadow);
  expect(player.getApi().iframeRef.current).toBe(shadow);
  expect(live).toBe(shadow);
  act(() => root.unmount());
  act(() => player.root.unmount());
});
