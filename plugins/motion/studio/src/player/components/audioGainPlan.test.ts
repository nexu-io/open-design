import { describe, expect, it } from "vitest";
import { audioGainToDb, MAX_AUDIO_GAIN } from "@hyperframes/core/audio-gain";
import { peakAmplitudeDb, planAudioGain, type AudioGainClip } from "./audioGainPlan";

const clip = (key: string, gain: number, sourcePeak: number | null): AudioGainClip => ({
  key,
  gain,
  sourcePeak,
});
const db = (gain: number | undefined) => audioGainToDb(gain ?? Number.NaN);
const gainOf = (plan: ReturnType<typeof planAudioGain>, key: string) =>
  plan.find((edit) => edit.key === key)?.gain;

describe("planAudioGain", () => {
  it("Set Gain to puts every clip at the same gain", () => {
    const plan = planAudioGain([clip("a", 2, 0.5), clip("b", 0.5, null)], { mode: "set", db: -6 });
    expect(db(gainOf(plan, "a"))).toBeCloseTo(-6, 6);
    expect(db(gainOf(plan, "b"))).toBeCloseTo(-6, 6);
  });

  it("Adjust Gain by moves each clip by the same dB from where it is", () => {
    const plan = planAudioGain([clip("a", 2, null), clip("b", 0.5, null)], {
      mode: "adjust",
      db: 3,
    });
    expect(db(gainOf(plan, "a"))).toBeCloseTo(db(2) + 3, 6);
    expect(db(gainOf(plan, "b"))).toBeCloseTo(db(0.5) + 3, 6);
  });

  it("Normalize Max Peak moves all clips together until the loudest peak hits the target", () => {
    const plan = planAudioGain([clip("loud", 1, 0.5), clip("quiet", 1, 0.25)], {
      mode: "normalize-max",
      db: -1,
    });
    expect(db(0.5 * (gainOf(plan, "loud") ?? 0))).toBeCloseTo(-1, 6);
    expect(db(gainOf(plan, "loud")) - db(gainOf(plan, "quiet"))).toBeCloseTo(0, 6);
  });

  it("Normalize Max Peak counts each clip's current gain", () => {
    const plan = planAudioGain([clip("a", 0.5, 0.8), clip("b", 2, 0.25)], {
      mode: "normalize-max",
      db: -3,
    });
    expect(db(0.25 * (gainOf(plan, "b") ?? 0))).toBeCloseTo(-3, 6);
  });

  it("Normalize All Peaks brings each clip's own peak to the target", () => {
    const plan = planAudioGain([clip("a", 1, 0.5), clip("b", 3, 0.25)], {
      mode: "normalize-all",
      db: -3,
    });
    expect(db(0.5 * (gainOf(plan, "a") ?? 0))).toBeCloseTo(-3, 6);
    expect(db(0.25 * (gainOf(plan, "b") ?? 0))).toBeCloseTo(-3, 6);
  });

  it("leaves clips it could not measure out of a normalize", () => {
    const plan = planAudioGain([clip("a", 1, 0.5), clip("b", 1, null), clip("c", 1, 0)], {
      mode: "normalize-all",
      db: -1,
    });
    expect(plan.map((edit) => edit.key)).toEqual(["a"]);
  });

  it("clamps to the +12 dB ceiling and to silence", () => {
    const loud = planAudioGain([clip("a", 1, 0.001)], { mode: "normalize-all", db: 0 });
    expect(gainOf(loud, "a")).toBe(MAX_AUDIO_GAIN);
    expect(gainOf(planAudioGain([clip("a", 1, null)], { mode: "set", db: 40 }), "a")).toBe(
      MAX_AUDIO_GAIN,
    );
    expect(gainOf(planAudioGain([clip("a", 0, null)], { mode: "adjust", db: 6 }), "a")).toBe(0);
  });
});

describe("peakAmplitudeDb", () => {
  it("is the loudest peak across the selection at each clip's gain", () => {
    expect(peakAmplitudeDb([clip("a", 1, 0.5), clip("b", 2, 0.5)])).toBeCloseTo(0, 6);
  });

  it("is null when nothing was measured", () => {
    expect(peakAmplitudeDb([clip("a", 1, null)])).toBeNull();
  });
});
