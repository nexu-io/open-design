// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { duckVoiceSources, isDuckableBed, readBedCarve, setDuckUnderVoice } from "./clipMenuDuck";

function compose(body: string): Document {
  const doc = document.implementation.createHTMLDocument("c");
  doc.body.innerHTML = body;
  return doc;
}

const BED = `<audio id="music" src="music.mp3" data-start="0" data-duration="10"></audio>`;

describe("duckVoiceSources", () => {
  it("offers an overlapping video with sound and a voiceover, never the bed or silent video", () => {
    const doc = compose(`${BED}
      <video id="talk" src="talk.mp4" data-start="0" data-duration="6" data-has-audio="true"></video>
      <video id="b-roll" src="b.mp4" data-start="0" data-duration="6" muted></video>
      <audio id="voiceover" src="vo.wav" data-start="2" data-duration="3"></audio>
      <audio id="late-vo" src="vo2.wav" data-start="20" data-duration="3"></audio>`);
    const bed = doc.getElementById("music");
    expect(bed && duckVoiceSources(doc, bed)).toEqual(["talk", "voiceover"]);
  });
});

describe("isDuckableBed", () => {
  it("allows a music clip and refuses a voice clip", () => {
    const doc = compose(`${BED}<audio id="voiceover" src="voiceover.wav"></audio>`);
    expect(isDuckableBed(doc.getElementById("music"))).toBe(true);
    expect(isDuckableBed(doc.getElementById("voiceover"))).toBe(false);
  });

  it("refuses a clip another bed is already carving against", () => {
    const doc = compose(
      `<audio id="music" src="music.mp3" data-fx-carve='{"enabled":true,"sources":["sting"],"strength":0.25}'></audio><audio id="sting" src="sting-bed.mp3"></audio>`,
    );
    expect(isDuckableBed(doc.getElementById("sting"))).toBe(false);
  });
});

describe("setDuckUnderVoice", () => {
  it("writes a carve at core's default strength naming the one voice", async () => {
    const doc = compose(
      `${BED}<audio id="voiceover" src="vo.wav" data-start="1" data-duration="3"></audio>`,
    );
    const bed = doc.getElementById("music");
    if (!bed) throw new Error("fixture");
    const write = vi.fn(async (attr: string, value: string | null) => {
      if (value === null) bed.removeAttribute(attr);
      else bed.setAttribute(attr, value);
    });
    await expect(setDuckUnderVoice(doc, bed, true, write)).resolves.toBe("ducked");
    expect(readBedCarve(bed)).toEqual({ enabled: true, sources: ["voiceover"], strength: 0.25 });
  });

  it("groups several voices first so the carve names one group", async () => {
    const doc = compose(`${BED}
      <audio id="voiceover" src="vo.wav" data-start="1" data-duration="3"></audio>
      <audio id="narration" src="n.wav" data-start="5" data-duration="3"></audio>`);
    const bed = doc.getElementById("music");
    if (!bed) throw new Error("fixture");
    const write = vi.fn(async (attr: string, value: string | null) => {
      if (value !== null) bed.setAttribute(attr, value);
    });
    const group = vi.fn(async () => {});
    await setDuckUnderVoice(doc, bed, true, write, group);
    expect(group).toHaveBeenCalledWith(["voiceover", "narration"], "voiceover-2");
    expect(readBedCarve(bed)?.sources).toEqual(["voiceover-2"]);
  });

  it("reports no voice instead of writing an empty carve", async () => {
    const doc = compose(BED);
    const bed = doc.getElementById("music");
    if (!bed) throw new Error("fixture");
    const write = vi.fn(async () => {});
    await expect(setDuckUnderVoice(doc, bed, true, write)).resolves.toBe("no-voice");
    expect(write).not.toHaveBeenCalled();
  });

  it("turning it off disables the carve and drops the generated nodes and lanes", async () => {
    const chain = {
      version: 1,
      nodes: [
        { id: "c1", type: "peaking", enabled: true, fromCarve: true, params: {} },
        { id: "eq", type: "highpass", enabled: true, params: {} },
      ],
    };
    const automation = {
      version: 1,
      lanes: [
        {
          target: "fx.c1.gain",
          points: [
            { t: 0, v: 0 },
            { t: 1, v: -3 },
          ],
        },
      ],
    };
    const doc = compose(BED);
    const bed = doc.getElementById("music");
    if (!bed) throw new Error("fixture");
    bed.setAttribute(
      "data-fx-carve",
      JSON.stringify({ enabled: true, sources: ["vo"], strength: 0.25 }),
    );
    bed.setAttribute("data-fx-chain", JSON.stringify(chain));
    bed.setAttribute("data-automation", JSON.stringify(automation));
    const writes: Array<[string, string | null]> = [];
    await setDuckUnderVoice(doc, bed, false, async (attr, value) => {
      writes.push([attr, value]);
    });
    const byAttr = new Map(writes);
    expect(JSON.parse(byAttr.get("data-fx-carve") ?? "{}").enabled).toBe(false);
    expect(byAttr.get("data-automation")).toBeNull();
    expect(byAttr.get("data-fx-chain")).not.toContain("c1");
  });
});
