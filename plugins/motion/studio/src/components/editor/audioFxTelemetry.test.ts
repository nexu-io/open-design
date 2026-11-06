// @vitest-environment happy-dom

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { HfAudioFxChain } from "@hyperframes/core/audio-fx";

const trackStudioEvent = vi.fn();
vi.mock("../../utils/studioTelemetry", () => ({
  trackStudioEvent: (...args: unknown[]) => trackStudioEvent(...args),
}));

const { chainShape, nodeOrigin, trackChainObserved, trackParamCommitted, trackPresetApplied } =
  await import("./audioFxTelemetry");

beforeEach(() => trackStudioEvent.mockReset());

const chainOf = (nodes: HfAudioFxChain["nodes"]): HfAudioFxChain => ({ version: 1, nodes });

describe("what the rack reports", () => {
  it("namespaces every event so the feature can be found as one thing", () => {
    trackPresetApplied("voice-clean", "voice", 5, "append", { trackKind: "voice" });
    expect(trackStudioEvent).toHaveBeenCalledWith("audio_fx_preset_applied", expect.anything());
  });

  it("carries what the track is, so a preset's use can be read per material", () => {
    trackPresetApplied("telephone", "character", 7, "append", { trackKind: "music" });
    expect(trackStudioEvent.mock.calls[0]?.[1]).toMatchObject({
      preset: "telephone",
      family: "character",
      track_kind: "music",
    });
  });

  it("says 'unknown' rather than nothing when the track is unclassified", () => {
    // Absent and "unclassified" are different facts; encoding them the same way
    // is what makes a breakdown read as a gap that is not there.
    trackPresetApplied("hall", "space", 1, "append", {});
    expect(trackStudioEvent.mock.calls[0]?.[1]).toMatchObject({ track_kind: "unknown" });
  });

  it("separates the two surfaces a parameter can be set from", () => {
    // The whole one-knob design rests on which of these people use.
    trackParamCommitted("compressor", "ratio", 4, "details", {});
    expect(trackStudioEvent.mock.calls[0]?.[1]).toMatchObject({
      effect: "compressor",
      param: "ratio",
      value: 4,
      surface: "details",
    });
  });
});

describe("a chain reduced to counts", () => {
  it("names where each node came from", () => {
    expect(nodeOrigin({ type: "peaking", fromPreset: "voice-clean" })).toBe("preset");
    expect(nodeOrigin({ type: "peaking", fromCarve: true })).toBe("carve");
    expect(nodeOrigin({ type: "gain", fromLeveller: true })).toBe("leveller");
    expect(nodeOrigin({ type: "highpass" })).toBe("hand");
  });

  it("counts by origin, which is what separates hand-built from generated", () => {
    const shape = chainShape(
      chainOf([
        { type: "highpass", fromPreset: "voice-clean" },
        { type: "peaking", fromPreset: "voice-clean" },
        { type: "peaking", fromCarve: true },
        { type: "lowpass" },
      ]),
    );
    expect(shape).toMatchObject({
      node_count: 4,
      nodes_from_preset: 2,
      nodes_from_carve: 1,
      nodes_by_hand: 1,
      preset_count: 1,
    });
  });

  it("counts distinct presets, not preset nodes — stacking is the question", () => {
    const shape = chainShape(
      chainOf([
        { type: "highpass", fromPreset: "voice-clean" },
        { type: "lowpass", fromPreset: "telephone" },
        { type: "peaking", fromPreset: "telephone" },
      ]),
    );
    expect(shape.preset_count).toBe(2);
  });

  it("survives an empty or absent chain", () => {
    expect(chainShape(null)).toMatchObject({ node_count: 0, preset_count: 0 });
  });

  it("ships no chain contents — only counts and flags", () => {
    // The standing rule: nothing user-authored leaves the browser. A parameter
    // value or an element id in here would be the author's own data.
    const shape = chainShape(chainOf([{ type: "peaking", id: "n1", params: { frequency: 3000 } }]));
    const serialized = JSON.stringify(shape);
    expect(serialized).not.toContain("3000");
    expect(serialized).not.toContain("n1");
  });
});

describe("effects this session did not apply", () => {
  it("calls a chain with no panel edits behind it authored outside", () => {
    // This is the agent signal. An agent edits the composition and the panel
    // simply finds the work done — none of its own events ever fire.
    trackChainObserved(
      chainOf([{ type: "highpass", fromPreset: "voice-clean" }]),
      { firstSight: true, panelEdits: 0, hasCarve: false, hasAutomation: false },
      { trackKind: "voice" },
    );
    expect(trackStudioEvent).toHaveBeenCalledWith(
      "audio_fx_chain_observed",
      expect.objectContaining({ authored_outside: true, first_sight: true }),
    );
  });

  it("does not, when this session's own edits explain it", () => {
    trackChainObserved(
      chainOf([{ type: "highpass" }]),
      { firstSight: false, panelEdits: 3, hasCarve: false, hasAutomation: false },
      {},
    );
    expect(trackStudioEvent.mock.calls[0]?.[1]).toMatchObject({
      authored_outside: false,
      panel_edits: 3,
    });
  });
});
