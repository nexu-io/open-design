// @vitest-environment happy-dom
// Imports the clip-content thumbnail primitives the way a host app does: by package name.
// Desktop's timeline lane draws audio waveforms and image thumbnails without a deep import.
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installReactActEnvironment, mountReactHarness } from "./hooks/domSelectionTestHarness";

const { leaseSpy } = vi.hoisted(() => ({
  leaseSpy: vi.fn((_request: unknown) => ({ status: "loading" as const })),
}));

vi.mock("./hooks/useThumbnailLease", () => ({
  useThumbnailLease: leaseSpy,
}));

import { AudioWaveform, ImageThumbnail, useRenderClipContent } from "@hyperframes/studio";

installReactActEnvironment();

afterEach(() => {
  leaseSpy.mockClear();
  document.body.innerHTML = "";
});

describe("clip content package exports", () => {
  it("mounts AudioWaveform and leases waveform decoding", async () => {
    const root = mountReactHarness(
      <AudioWaveform
        audioUrl="/media/voice.wav"
        label=""
        labelColor="#fff"
        projectId="project-a"
        sessionEpoch={9}
        priority="interaction"
      />,
    );

    expect(leaseSpy).toHaveBeenCalledWith(expect.objectContaining({ kind: "waveform" }));
    await act(async () => root.unmount());
  });

  it("mounts ImageThumbnail and leases the still frame", async () => {
    const root = mountReactHarness(
      <ImageThumbnail imageSrc="/media/frame.png" label="" labelColor="#fff" />,
    );

    expect(leaseSpy).toHaveBeenCalledWith(expect.objectContaining({ kind: "image" }));
    await act(async () => root.unmount());
  });

  it("exposes useRenderClipContent as a hook a host can call", () => {
    expect(typeof useRenderClipContent).toBe("function");
  });
});
