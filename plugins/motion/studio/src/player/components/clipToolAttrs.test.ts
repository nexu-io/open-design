import { describe, expect, it } from "vitest";
import { parseAudioFxChain, serializeAudioFxChain } from "@hyperframes/core/audio-fx";
import { normalizeHfColorGrading } from "@hyperframes/core/color-grading";
import {
  activeLook,
  activeVoicePreset,
  chainWithVoicePreset,
  clipSpeedSuffix,
  hasCrop,
  isDucked,
  clipVolumeBadge,
  lookAttrValue,
  readClipEffects,
  type ClipToolState,
} from "./clipToolAttrs";

const presetsIn = (raw: string | null) =>
  raw ? [...new Set(parseAudioFxChain(raw).nodes.map((n) => n.fromPreset ?? n.type))] : [];

const handNode = serializeAudioFxChain({
  version: 1,
  nodes: [{ id: "n1", type: "highpass", enabled: true, params: { frequency: 80 } }],
});

describe("voice presets", () => {
  it("writes the chosen preset's nodes and reads it back", () => {
    const raw = chainWithVoicePreset(null, "voice-clean");
    expect(presetsIn(raw)).toEqual(["voice-clean"]);
    expect(activeVoicePreset(raw)).toBe("voice-clean");
  });

  it("is single-choice: picking another menu preset replaces the first", () => {
    const raw = chainWithVoicePreset(chainWithVoicePreset(null, "voice-clean"), "telephone");
    expect(presetsIn(raw)).toEqual(["telephone"]);
  });

  it("None drops the attribute when the chain held only the preset", () => {
    expect(chainWithVoicePreset(chainWithVoicePreset(null, "voice-warm"), null)).toBeNull();
  });

  it("None keeps nodes that are not from a menu preset", () => {
    const withPreset = chainWithVoicePreset(handNode, "voice-broadcast");
    expect(presetsIn(withPreset)).toEqual(["highpass", "voice-broadcast"]);
    expect(chainWithVoicePreset(withPreset, null)).toBe(handNode);
  });

  it("re-applying the same preset keeps one copy", () => {
    const once = chainWithVoicePreset(null, "megaphone");
    const twice = chainWithVoicePreset(once, "megaphone");
    expect(parseAudioFxChain(twice ?? "").nodes).toHaveLength(
      parseAudioFxChain(once ?? "").nodes.length,
    );
  });
});

describe("looks", () => {
  it("writes the minimal preset form the runtime resolves", () => {
    const raw = lookAttrValue("warm-daylight");
    expect(raw).toBe('{"preset":"warm-daylight","intensity":1}');
    expect(normalizeHfColorGrading(JSON.parse(raw ?? ""))?.preset).toBe("warm-daylight");
    expect(activeLook(raw)).toBe("warm-daylight");
  });

  it("None removes the attribute", () => {
    expect(lookAttrValue(null)).toBeNull();
  });

  it("reads a full inspector-written grading and ignores garbage", () => {
    expect(activeLook('{"preset":"mono-clean","intensity":0.4,"adjust":{"contrast":0.2}}')).toBe(
      "mono-clean",
    );
    expect(activeLook("{nope")).toBeNull();
    expect(activeLook('{"preset":"mono-clean","enabled":false}')).toBeNull();
  });
});

describe("small readers", () => {
  it("treats an inset of zero or none as no crop", () => {
    expect(hasCrop("inset(10px 0px 10px 0px)")).toBe(true);
    expect(hasCrop("inset(0px)")).toBe(false);
    expect(hasCrop("none")).toBe(false);
    expect(hasCrop(null)).toBe(false);
  });

  it("reads a carve as ducked unless it is switched off", () => {
    expect(isDucked('{"sources":["vo"]}')).toBe(true);
    expect(isDucked('{"enabled":false,"sources":["vo"]}')).toBe(false);
    expect(isDucked(null)).toBe(false);
  });
});

const baseState: ClipToolState = {
  tag: "video",
  hasSound: true,
  volume: null,
  muted: false,
  fxChain: null,
  automation: null,
  colorGrading: null,
  clipPath: null,
  carve: null,
};

const rampAutomation = JSON.stringify({
  version: 1,
  lanes: [
    {
      target: "rate",
      points: [
        { t: 0, v: 0.5 },
        { t: 2, v: 1 },
      ],
    },
  ],
});

describe("readClipEffects", () => {
  it("lists nothing for a plain clip, so the fx badge stays grey", () => {
    expect(readClipEffects(baseState)).toEqual([]);
    expect(readClipEffects({ ...baseState, automation: rampAutomation, volume: 1.8 })).toEqual([]);
  });

  it("lists every applied effect in the tooltip's order", () => {
    expect(
      readClipEffects({
        ...baseState,
        fxChain: chainWithVoicePreset(null, "voice-clean"),
        colorGrading: lookAttrValue("warm-daylight"),
        clipPath: "inset(0px 20px)",
        carve: "{}",
      }),
    ).toEqual(["Look: Warm daylight", "Voice: Clean", "Crop", "Ducked"]);
  });

  it("names a hand-added effect and skips disabled and carve-generated nodes", () => {
    const chain = serializeAudioFxChain({
      version: 1,
      nodes: [
        { id: "a", type: "highpass", enabled: true, params: { frequency: 80 } },
        { id: "b", type: "gain", enabled: false, params: {} },
        { id: "c", type: "gain", enabled: true, fromCarve: true, params: {} },
      ],
    });
    const effects = readClipEffects({ ...baseState, fxChain: chain });
    expect(effects).toHaveLength(1);
    expect(effects[0]).not.toBe("highpass");
  });

  it("reads a hand-made grading without a menu preset as a Look", () => {
    expect(readClipEffects({ ...baseState, colorGrading: '{"adjust":{"contrast":0.2}}' })).toEqual([
      "Look",
    ]);
  });
});

describe("clipVolumeBadge", () => {
  it("shows volume off 100% and Muted only on a clip with sound", () => {
    expect(clipVolumeBadge({ ...baseState, volume: 1.8 })).toBe("180%");
    expect(clipVolumeBadge(baseState)).toBeNull();
    expect(clipVolumeBadge({ ...baseState, tag: "audio", muted: true })).toBe("Muted");
    expect(clipVolumeBadge({ ...baseState, hasSound: false, muted: true })).toBeNull();
  });
});

describe("clipSpeedSuffix", () => {
  it("shows a constant speed as a percentage and hides 100%", () => {
    expect(clipSpeedSuffix(1.5, null)).toBe(" [150%]");
    expect(clipSpeedSuffix(0.35, null)).toBe(" [35%]");
    expect(clipSpeedSuffix(1, null)).toBe("");
    expect(clipSpeedSuffix(undefined, null)).toBe("");
  });

  it("shows a rate lane as a ramp, whatever the base rate", () => {
    expect(clipSpeedSuffix(2, rampAutomation)).toBe(" [ramp]");
    expect(clipSpeedSuffix(1, rampAutomation)).toBe(" [ramp]");
  });
});
