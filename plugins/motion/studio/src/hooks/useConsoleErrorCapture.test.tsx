// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { STUDIO_PREVIEW_ERRORS } from "@hyperframes/core/studio-preview-mark";
import { announcePreviewDocumentLoaded } from "../player/sceneSwap";
import { useConsoleErrorCapture } from "./useConsoleErrorCapture";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let capture: ReturnType<typeof useConsoleErrorCapture>;
function Harness({ iframe }: { iframe: HTMLIFrameElement }) {
  capture = useConsoleErrorCapture(iframe);
  return null;
}

function previewFrame() {
  const previewWindow = Object.assign(new EventTarget(), { console: { error: () => undefined } });
  const iframe = document.createElement("iframe");
  Object.defineProperty(iframe, "contentWindow", { get: () => previewWindow });
  return { iframe, previewWindow };
}

const shown = () => capture.consoleErrors?.map((finding) => finding.message);

let root: Root | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
});

it("shows the errors a preview raised before its load, once each", async () => {
  const raisedBeforeLoad = "Uncaught Error: GSAP could not load from a or b";
  const { iframe, previewWindow } = previewFrame();

  root = createRoot(document.createElement("div"));
  await act(async () => root?.render(React.createElement(Harness, { iframe })));
  Object.assign(previewWindow, { [STUDIO_PREVIEW_ERRORS]: [raisedBeforeLoad] });
  await act(async () => announcePreviewDocumentLoaded(iframe));

  expect(shown()).toEqual([raisedBeforeLoad]);
});

it("shows a loaded preview's errors once when the capture attaches to it twice", async () => {
  const raised = "Uncaught Error: GSAP could not load from a or b";
  const { iframe, previewWindow } = previewFrame();
  Object.assign(previewWindow, { [STUDIO_PREVIEW_ERRORS]: [raised] });

  root = createRoot(document.createElement("div"));
  const harness = React.createElement(Harness, { iframe });
  await act(async () => root?.render(React.createElement(React.StrictMode, null, harness)));

  expect(shown()).toEqual([raised]);
});

it("keeps listening after reading a preview's very long error list", async () => {
  const { iframe, previewWindow } = previewFrame();
  const raised = Array.from({ length: 200_000 }, (_, i) => `Uncaught Error: ${i}`);
  Object.assign(previewWindow, { [STUDIO_PREVIEW_ERRORS]: raised });

  root = createRoot(document.createElement("div"));
  await act(async () => root?.render(React.createElement(Harness, { iframe })));
  const live = new ErrorEvent("error", { message: "Uncaught Error: raised after attach" });
  await act(async () => previewWindow.dispatchEvent(live));

  expect(shown()?.length).toBe(raised.length + 1);
  expect(shown()?.at(-1)).toBe("Uncaught Error: raised after attach");
});

it("clears a document's errors when its load replaces it, and when the preview goes away", async () => {
  const { iframe, previewWindow } = previewFrame();
  const NullableHarness = ({ frame }: { frame: HTMLIFrameElement | null }) => {
    capture = useConsoleErrorCapture(frame);
    return null;
  };
  root = createRoot(document.createElement("div"));
  await act(async () => root?.render(React.createElement(NullableHarness, { frame: iframe })));
  await act(async () =>
    previewWindow.dispatchEvent(new ErrorEvent("error", { message: "Uncaught Error: old" })),
  );
  Object.assign(previewWindow, { [STUDIO_PREVIEW_ERRORS]: ["Uncaught Error: new"] });
  await act(async () => announcePreviewDocumentLoaded(iframe));
  expect(shown()).toEqual(["Uncaught Error: new"]);

  await act(async () => root?.render(React.createElement(NullableHarness, { frame: null })));
  expect(capture.consoleErrors).toBeNull();
  await act(async () => announcePreviewDocumentLoaded(iframe));
  expect(capture.consoleErrors).toBeNull();
});

it("keeps a page's errors through its own late load, and clears them for the next announced page", async () => {
  const { iframe, previewWindow } = previewFrame();
  root = createRoot(document.createElement("div"));
  await act(async () => root?.render(React.createElement(Harness, { iframe })));
  await act(async () =>
    previewWindow.dispatchEvent(new ErrorEvent("error", { message: "Uncaught Error: kept" })),
  );

  await act(async () => iframe.dispatchEvent(new Event("load")));
  expect(shown()).toEqual(["Uncaught Error: kept"]);

  Object.assign(previewWindow, { [STUDIO_PREVIEW_ERRORS]: ["Uncaught Error: new page"] });
  await act(async () => announcePreviewDocumentLoaded(iframe));
  expect(shown()).toEqual(["Uncaught Error: new page"]);
});
