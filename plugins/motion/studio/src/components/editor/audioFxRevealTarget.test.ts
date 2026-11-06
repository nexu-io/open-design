import { describe, expect, it } from "vitest";
import { audioFxRevealTarget } from "./audioFxRevealTarget";
import type { HfAudioFxChain } from "@hyperframes/core/audio-fx";

const chain = (nodes: HfAudioFxChain["nodes"]): HfAudioFxChain => ({ version: 1, nodes });

describe("audioFxRevealTarget", () => {
  it("points a hand-built effect's lane at its own row, by chain index", () => {
    const c = chain([
      { type: "highpass", id: "n1", params: {} },
      { type: "peaking", id: "n2", params: {} },
    ]);
    expect(audioFxRevealTarget("fx.n2.gain", c)).toEqual({ kind: "node", index: 1, nodeId: "n2" });
  });

  // The case that made this a resolver rather than an index lookup: a carve's
  // bands are filtered out of the rack's node list, so opening `openNode` on
  // one opens nothing. The carve module is what renders them.
  it("points a carve band's lane at the carve module", () => {
    const c = chain([{ type: "peaking", id: "n1", fromCarve: true, params: {} }]);
    expect(audioFxRevealTarget("fx.n1.gain", c)).toEqual({ kind: "carve" });
  });

  it("points an EQ band's lane at its EQ module", () => {
    const c = chain([{ type: "peaking", id: "n1", fromEq: "eq1", params: {} }]);
    expect(audioFxRevealTarget("fx.n1.gain", c)).toEqual({ kind: "eq", eqId: "eq1" });
  });

  it("points a preset node's lane at its run, keyed like collapsedRuns", () => {
    const c = chain([
      { type: "highpass", id: "n1", params: {} },
      { type: "peaking", id: "n2", fromPreset: "clean-voice", params: {} },
      { type: "gain", id: "n3", fromPreset: "clean-voice", params: {} },
    ]);
    // Keyed by the run's FIRST node, not the automated one.
    expect(audioFxRevealTarget("fx.n3.gain", c)).toEqual({
      kind: "preset",
      runKey: "clean-voice-1",
    });
  });

  it("resolves a preset-level lane through the preset it names", () => {
    const c = chain([{ type: "peaking", id: "n1", fromPreset: "clean-voice", params: {} }]);
    expect(audioFxRevealTarget("fx.preset.clean-voice", c)).toEqual({
      kind: "preset",
      runKey: "clean-voice-0",
    });
  });

  it("treats the track's own volume as the rack itself", () => {
    expect(audioFxRevealTarget("volume", chain([]))).toEqual({ kind: "volume" });
  });

  it("resolves nothing for a lane whose effect is gone, or an unparseable target", () => {
    expect(audioFxRevealTarget("fx.gone.gain", chain([]))).toBeNull();
    expect(audioFxRevealTarget("nonsense", chain([]))).toBeNull();
    expect(audioFxRevealTarget("fx.n1.gain", null)).toBeNull();
  });
});
