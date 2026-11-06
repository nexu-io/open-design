// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import "./EditorShellTestMocks";
import { EditorShell } from "./EditorShell";
import { usePreviewReadOnly } from "./editor/previewReadOnlyContext";

const hookMocks = vi.hoisted(() => ({
  useTimelineSelectionPreviewSync: vi.fn(),
}));
const previewOverlaysProbe = vi.hoisted(() => ({ readOnly: null as boolean | null }));

vi.mock("../hooks/useTimelineSelectionPreviewSync", () => hookMocks);
vi.mock("./nle/PreviewPane", () => ({
  // Renders its previewOverlay prop for real, so the mocked PreviewOverlays
  // below (which reads the read-only context) actually mounts.
  PreviewPane: (props: { previewOverlay?: React.ReactNode }) => props.previewOverlay ?? null,
}));
vi.mock("./nle/PreviewOverlays", () => ({
  PreviewOverlays: () => {
    previewOverlaysProbe.readOnly = usePreviewReadOnly();
    return null;
  },
}));

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

afterEach(() => {
  document.body.innerHTML = "";
  hookMocks.useTimelineSelectionPreviewSync.mockClear();
});

const shell = (readOnlyPreview?: boolean) => (
  <EditorShell
    panels={null}
    timelineToolbar={null}
    renderClipContent={() => null}
    handleTimelineElementDelete={vi.fn()}
    handleTimelineAssetDrop={vi.fn()}
    handleTimelineFileDrop={vi.fn()}
    handleTimelineElementMove={vi.fn()}
    handleTimelineElementsMove={vi.fn()}
    handleTimelineElementResize={vi.fn()}
    handleTimelineGroupResize={vi.fn()}
    handleToggleTrackHidden={vi.fn()}
    setAudioGroupAttribute={{ setLive: vi.fn(), setQuiet: vi.fn() }}
    handleBlockedTimelineEdit={vi.fn()}
    handleTimelineElementSplit={vi.fn()}
    handleRazorSplit={vi.fn()}
    handleRazorSplitAll={vi.fn()}
    onCopyClip={vi.fn(() => false)}
    onPasteClip={vi.fn(async () => {})}
    onDuplicateClip={vi.fn(async () => false)}
    canPasteClip={vi.fn(() => false)}
    setCompIdToSrc={vi.fn()}
    setCompositionLoading={vi.fn()}
    shouldShowMotionPath={false}
    shouldShowSelectedDomBounds={false}
    readOnlyPreview={readOnlyPreview}
  />
);

describe("EditorShell timeline selection sync", () => {
  it("keeps the timeline store mirrored into the preview selection", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(shell());
    });

    expect(hookMocks.useTimelineSelectionPreviewSync).toHaveBeenCalledOnce();
    expect(hookMocks.useTimelineSelectionPreviewSync).toHaveBeenCalledWith(
      expect.objectContaining({
        activeCompPath: "index.html",
        timelineElements: [],
        domEditSelection: null,
        domEditGroupSelections: [],
      }),
    );

    act(() => root.unmount());
  });

  it("threads the read-only prop into descendants via context, and follows it across renders", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => root.render(shell(true)));
    expect(previewOverlaysProbe.readOnly).toBe(true);
    act(() => root.render(shell(false)));
    expect(previewOverlaysProbe.readOnly).toBe(false);
    act(() => root.render(shell(true)));
    expect(previewOverlaysProbe.readOnly).toBe(true);
    act(() => root.unmount());
  });
});
