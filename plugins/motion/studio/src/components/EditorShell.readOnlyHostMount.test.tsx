// @vitest-environment happy-dom

// A host that mounts EditorShell directly — no StudioApp, no App.tsx — must
// still get its descendants gated purely from the readOnlyPreview prop.

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import "./EditorShellTestMocks";
import { EditorShell } from "./EditorShell";
import { usePreviewBlockDrop } from "./nle/usePreviewBlockDrop";
import { TIMELINE_BLOCK_MIME } from "../utils/timelineAssetDrop";

vi.mock("../hooks/useTimelineSelectionPreviewSync", () => ({
  useTimelineSelectionPreviewSync: vi.fn(),
}));
vi.mock("./nle/PreviewOverlays", () => ({ PreviewOverlays: () => null }));

// The real hook — this is the actual Tier-1 consumer a host relies on to gate
// a drop onto the preview. Only PreviewPane's own DOM/player chrome is mocked.
const stage = document.createElement("div");
stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
const dropHandlers: { current: ReturnType<typeof usePreviewBlockDrop> | null } = { current: null };
vi.mock("./nle/PreviewPane", () => ({
  PreviewPane: (props: { onPreviewBlockDrop?: (name: string, pos: unknown) => void }) => {
    dropHandlers.current = usePreviewBlockDrop({
      stageRef: { current: stage },
      compositionSize: { width: 1000, height: 1000 },
      onBlockDrop: props.onPreviewBlockDrop,
    });
    return null;
  },
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = "";
});

function mountShellAlone(
  readOnlyPreview: boolean,
  onPreviewBlockDrop: (...args: unknown[]) => void,
) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
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
        handlePreviewBlockDrop={onPreviewBlockDrop}
        readOnlyPreview={readOnlyPreview}
      />,
    ),
  );
  return { host, root };
}

function dropEvent() {
  return {
    clientX: 50,
    clientY: 50,
    preventDefault: vi.fn(),
    dataTransfer: {
      types: [TIMELINE_BLOCK_MIME],
      getData: () => JSON.stringify({ name: "lower-third" }),
    },
  };
}

describe("a host mounting EditorShell alone (no StudioApp, no App.tsx)", () => {
  it("gates a Tier-1 descendant's drop handling purely from the prop", () => {
    const onBlockDrop = vi.fn();
    mountShellAlone(true, onBlockDrop);
    const event = dropEvent();
    act(() => dropHandlers.current!.handleDrop(event as never));
    expect(onBlockDrop).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("control: with the flag off, the same descendant still places a drop", () => {
    const onBlockDrop = vi.fn();
    mountShellAlone(false, onBlockDrop);
    const event = dropEvent();
    act(() => dropHandlers.current!.handleDrop(event as never));
    expect(onBlockDrop).toHaveBeenCalledWith("lower-third", { left: 500, top: 500 });
  });
});
