// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { gsap } from "gsap";
import {
  createTimelineElementFromManifestClip,
  parseTimelineFromDOM,
  mergeTimelineElementsPreservingDowngrades,
} from "./timelineDOM";
import { isTimelineIgnoredElement } from "./timelineElementHelpers";
import { clipTimingStart, resolveClipTimingBasis } from "../../hooks/gsapShared";
import { toAuthoredStart } from "../store/timelineElement";
import { computeResizePreview } from "../components/timelineClipDragPreview";
import type { TimelineElement } from "../store/playerStore";
import {
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  readMediaOffsetSeconds,
} from "@hyperframes/parsers/media-duration";

function el(id: string, extra: Partial<TimelineElement> = {}): TimelineElement {
  return { id, tag: "img", start: 0, duration: 5, track: 0, ...extra };
}

function makeDoc(html: string): Document {
  const d = document.implementation.createHTMLDocument();
  d.body.innerHTML = html;
  return d;
}

describe("parseTimelineFromDOM — nested master time", () => {
  it("adds every enclosing host's start to a clip inside a sub-composition", () => {
    const doc = makeDoc(`
      <div data-composition-id="main" data-start="0" data-duration="20">
        <div id="intro" data-composition-id="intro" data-start="2" data-duration="10">
          <div data-composition-id="intro">
            <div id="logo" data-composition-id="logo" data-start="3" data-duration="5">
              <div data-composition-id="logo">
                <div id="badge" class="clip" data-start="1" data-duration="2"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `);
    const starts = parseTimelineFromDOM(doc, 20).map((e) => [
      e.domId,
      e.start,
      e.parentCompositionStart,
    ]);
    expect(starts).toEqual([
      ["intro", 2, 0],
      ["logo", 5, 2],
      ["badge", 6, 5],
    ]);
  });

  it("places a clip inside a referenced scene after the scene's authored length", () => {
    const doc = makeDoc(`
      <div data-composition-id="main" data-start="0" data-duration="20">
        <div id="s1" data-composition-id="s1" data-start="0" data-hf-authored-duration="8"></div>
        <div id="s2" data-composition-id="s2" data-start="s1 + 1" data-duration="6">
          <div data-composition-id="s2">
            <div id="c" class="clip" data-start="1" data-duration="2"></div>
          </div>
        </div>
      </div>
    `);
    const timelines = { s1: { duration: () => 6 } } as never;
    const c = parseTimelineFromDOM(doc, 20, timelines).find((e) => e.domId === "c");
    expect(c?.start).toBe(10);
  });
});

describe("parseTimelineFromDOM — repeated sections", () => {
  it("names each instance by its authored id and keeps them apart", () => {
    const doc = makeDoc(`
      <div data-composition-id="main" data-start="0" data-duration="20">
        <div data-composition-id="card__hf1" data-hf-original-composition-id="card" data-start="0" data-duration="4"></div>
        <div data-composition-id="card__hf2" data-hf-original-composition-id="card" data-start="4" data-duration="4"></div>
      </div>
    `);
    const rows = parseTimelineFromDOM(doc, 20);
    expect(rows.map((e) => e.label)).toEqual(["card", "card"]);
    expect(new Set(rows.map((e) => e.id)).size).toBe(2);
  });
});

describe("parseTimelineFromDOM — nested rows' keyframe basis", () => {
  const doc = () =>
    makeDoc(`
      <div data-composition-id="main" data-start="0" data-duration="20">
        <div id="intro" data-composition-id="intro" data-start="2" data-duration="10">
          <div data-composition-id="intro">
            <video id="vo" data-start="7" data-duration="2" data-hf-media-start-basis="global"></video>
            <div id="logo" data-composition-id="logo" data-start="3" data-duration="5">
              <div data-composition-id="logo">
                <div id="badge" class="clip" data-start="1" data-duration="2"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `);

  it("measures diamonds and keyframe percentages against the local tween clock", () => {
    const rows = parseTimelineFromDOM(doc(), 20);
    const basis = (id: string) => resolveClipTimingBasis(id, "index.html", rows, []).elStart;
    const at = (id: string) => rows.find((e) => e.domId === id)!;
    expect([clipTimingStart(at("logo")), basis("logo")]).toEqual([3, 3]);
    expect([clipTimingStart(at("badge")), basis("badge")]).toEqual([1, 1]);
  });

  it("keys a legacy root-time video on its host's clock but writes its start as master time", () => {
    const vo = parseTimelineFromDOM(doc(), 20).find((e) => e.domId === "vo")!;
    expect(vo.start).toBe(7);
    expect(clipTimingStart(vo)).toBe(5);
    expect(toAuthoredStart(vo, 8)).toBe(8);
  });
});

describe("parseTimelineFromDOM — media in-point", () => {
  it("reads a negative in-point as 0, as the runtime does, so a head trim keeps the clip", () => {
    const doc = makeDoc(`
      <div data-composition-id="root">
        <video id="v" class="clip" data-start="2" data-duration="1" data-media-start="-1"></video>
      </div>
    `);
    const element = parseTimelineFromDOM(doc, 10).find((e) => e.domId === "v")!;
    expect(element.playbackStart).toBe(0);

    const preview = computeResizePreview(
      {
        element,
        edge: "start",
        originClientX: 0,
        previewStart: 2,
        previewDuration: 1,
        started: true,
      },
      10,
      { scroll: null, pps: 100, buildSnapTargets: () => [] },
    );
    expect(preview.previewDuration).toBe(0.9);
  });
});

describe("parseTimelineFromDOM — in-point read as playback reads it", () => {
  it.each([
    ['data-playback-start="-1" data-media-start="2"', 2, "playback-start"],
    ['data-playback-start="abc" data-media-start="2"', 2, "playback-start"],
    ['data-media-start="junk"', 0, "media-start"],
    ['data-media-start="1.5s"', 0, "media-start"],
  ])("%s", (inPoint, playbackStart, playbackStartAttr) => {
    const doc = makeDoc(
      `<div data-composition-id="root"><video id="v" class="clip" data-start="0" data-duration="4" ${inPoint}></video></div>`,
    );
    const element = parseTimelineFromDOM(doc, 10).find((e) => e.domId === "v")!;
    const video = doc.getElementById("v")!;
    expect(element.playbackStart).toBe(readMediaOffsetSeconds((n) => video.getAttribute(n)));
    expect([element.playbackStart, element.playbackStartAttr]).toEqual([
      playbackStart,
      playbackStartAttr,
    ]);
  });
});

describe("parseTimelineFromDOM — hfId from data-hf-id", () => {
  it("bridges a real GSAP transition marker onto both named clips", () => {
    document.body.innerHTML = `
      <div data-composition-id="root">
        <img data-hf-id="outgoing" data-start="0" data-duration="2.5" data-track-index="0" />
        <img data-hf-id="incoming" data-start="2" data-duration="2.5" data-track-index="0" />
      </div>
    `;
    const timeline = gsap.timeline({ paused: true });
    timeline.addLabel("hf:transition:outgoing:incoming:crossfade", 2);
    const runtimeWindow = window as Window & {
      __timelines?: Record<string, typeof timeline>;
    };
    runtimeWindow.__timelines = { main: timeline };

    try {
      const elements = parseTimelineFromDOM(document, 5);
      expect(elements.map((element) => element.transitionLabel)).toEqual([
        "hf:transition:outgoing:incoming:crossfade",
        "hf:transition:outgoing:incoming:crossfade",
      ]);
    } finally {
      delete runtimeWindow.__timelines;
      timeline.kill();
      document.body.innerHTML = "";
    }
  });

  it("harvests hfId from a data-start element that has data-hf-id", () => {
    const doc = makeDoc(`
      <div data-composition-id="root">
        <div id="hero" class="clip" data-start="0" data-duration="5" data-hf-id="hf-abc123"></div>
      </div>
    `);

    const elements = parseTimelineFromDOM(doc, 10);
    const hero = elements.find((el) => el.domId === "hero");

    expect(hero).toBeDefined();
    expect(hero?.hfId).toBe("hf-abc123");
  });

  it("leaves hfId undefined when element has no data-hf-id", () => {
    const doc = makeDoc(`
      <div data-composition-id="root">
        <div id="plain" class="clip" data-start="0" data-duration="5"></div>
      </div>
    `);

    const elements = parseTimelineFromDOM(doc, 10);
    const plain = elements.find((el) => el.domId === "plain");

    expect(plain).toBeDefined();
    expect(plain?.hfId).toBeUndefined();
  });

  it("ignores runtime-owned color grading canvases with timing attributes", () => {
    const doc = makeDoc(`
      <div data-composition-id="root">
        <img id="photo" class="clip" data-start="0" data-duration="5" />
        <canvas
          class="__hf_color_grading_canvas__"
          data-hf-color-grading-canvas="true"
          data-hyperframes-ignore
          data-start="0"
          data-duration="5"
        ></canvas>
      </div>
    `);

    const elements = parseTimelineFromDOM(doc, 10);

    expect(elements.map((el) => el.tag)).toEqual(["img"]);
  });

  it("marks parsed timeline elements hidden when data-hidden is present", () => {
    const doc = makeDoc(`
      <div data-composition-id="root">
        <div id="hero" class="clip" data-start="0" data-duration="5" data-hidden></div>
      </div>
    `);

    const elements = parseTimelineFromDOM(doc, 10);
    const hero = elements.find((el) => el.domId === "hero");

    expect(hero?.hidden).toBe(true);
  });

  it("marks manifest timeline elements hidden when the host has data-hidden", () => {
    const doc = makeDoc(`
      <div data-composition-id="root">
        <div id="hero" class="clip" data-start="0" data-duration="5" data-hidden></div>
      </div>
    `);
    const hostEl = doc.getElementById("hero");

    const element = createTimelineElementFromManifestClip({
      clip: {
        id: "hero",
        label: "Hero",
        kind: "element",
        tagName: "div",
        start: 0,
        duration: 5,
        track: 0,
        compositionId: null,
        parentCompositionId: null,
        compositionSrc: null,
        assetUrl: null,
      },
      fallbackIndex: 0,
      doc,
      hostEl,
    });

    expect(element.hidden).toBe(true);
  });

  it("reads data-link and data-sync-origin on both the DOM and manifest paths", () => {
    const doc = makeDoc(`
      <div data-composition-id="root">
        <video id="talk" class="clip" src="t.mp4" muted data-link="lk-1" data-sync-origin="lk-1" data-start="0" data-duration="5"></video>
      </div>
    `);
    const fromDom = parseTimelineFromDOM(doc, 10).find((el) => el.domId === "talk");
    expect(fromDom?.link).toBe("lk-1");
    expect(fromDom?.syncOrigin).toBe("lk-1");
    const element = createTimelineElementFromManifestClip({
      clip: {
        id: "talk",
        label: "Talk",
        kind: "element",
        tagName: "video",
        start: 0,
        duration: 5,
        track: 0,
        compositionId: null,
        parentCompositionId: null,
        compositionSrc: null,
        assetUrl: null,
      },
      fallbackIndex: 0,
      doc,
      hostEl: doc.getElementById("talk"),
    });
    expect(element.link).toBe("lk-1");
    expect(element.syncOrigin).toBe("lk-1");
  });
});

describe("group info cache", () => {
  const parseMember = (doc: Document) =>
    createTimelineElementFromManifestClip({
      clip: {
        id: "voice-1",
        label: "voice-1",
        kind: "element",
        tagName: "audio",
        start: 0,
        duration: 5,
        track: 0,
        compositionId: null,
        parentCompositionId: null,
        compositionSrc: null,
        assetUrl: null,
      },
      fallbackIndex: 0,
      doc,
      hostEl: doc.getElementById("voice-1"),
    });

  // Group edits are applied as LIVE patches so the preview iframe never
  // reloads, which means the document identity this cache is keyed on never
  // changes either. Without an explicit drop, a muted group could never be
  // unmuted: the header kept reading the cached `hidden: false` and re-wrote
  // `data-hidden` forever.
  it("re-reads group state written earlier in the same task", () => {
    const doc = makeDoc(`
      <div data-composition-id="root">
        <audio id="voice-1" data-start="0" data-duration="5" data-audio-group="voiceover"></audio>
        <hf-audio-group id="voiceover" data-label="Voices"></hf-audio-group>
      </div>
    `);

    expect(parseMember(doc).audioGroupHidden).toBe(false);
    // No await: the observer has not delivered either write when the next read runs.
    doc.getElementById("voiceover")?.setAttribute("data-hidden", "");
    expect(parseMember(doc).audioGroupHidden).toBe(true);
    doc.getElementById("voiceover")?.removeAttribute("data-hidden");
    expect(parseMember(doc).audioGroupHidden).toBe(false);
  });

  // The explicit invalidator is a convenience, not the contract. A cache whose
  // only defence is "every writer must remember to call this" rots the first
  // time a writer does not know it exists — which is precisely what happened
  // with the FX rack, whose group writes go through the DOM editor rather than
  // the timeline's own writers. The scan carries the DOM revision it was taken
  // at, so a forgotten call costs a re-scan rather than a wrong answer.
  it("expires itself on a group edit nobody announced", async () => {
    const doc = makeDoc(`
      <div data-composition-id="root">
        <audio id="voice-1" data-start="0" data-duration="5" data-audio-group="voiceover"></audio>
        <hf-audio-group id="voiceover" data-label="Voices"></hf-audio-group>
      </div>
    `);

    expect(parseMember(doc).audioGroupHidden).toBe(false);

    // No invalidateGroupInfoCache call anywhere in this test.
    doc.getElementById("voiceover")?.setAttribute("data-hidden", "");
    await new Promise((resolve) => setTimeout(resolve, 0)); // observer microtask

    expect(parseMember(doc).audioGroupHidden).toBe(true);
  });

  it("notices a member joining the group, not just an attribute edit", async () => {
    const doc = makeDoc(`
      <div data-composition-id="root">
        <audio id="voice-1" data-start="0" data-duration="5" data-audio-group="voiceover"></audio>
        <hf-audio-group id="voiceover" data-label="Voices"></hf-audio-group>
      </div>
    `);
    expect(parseMember(doc).audioGroupLabel).toBe("Voices");

    doc.getElementById("voiceover")?.setAttribute("data-label", "Narration");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(parseMember(doc).audioGroupLabel).toBe("Narration");
  });
});

describe("parseTimelineFromDOM — canonical playback rate", () => {
  it.each([
    ["8", 8],
    ["10", MAX_PLAYBACK_RATE],
    ["50", MAX_PLAYBACK_RATE],
    ["0.01", MIN_PLAYBACK_RATE],
  ])(
    "clamps authored rate %s to %s, as playback does, for trim and split math",
    (authored, expected) => {
      const doc = makeDoc(`
      <div data-composition-id="root">
        <div id="nested" class="clip" data-composition-src="scene.html"
          data-start="0" data-duration="5" data-playback-rate="${authored}"></div>
      </div>
    `);

      const nested = parseTimelineFromDOM(doc, 10).find((entry) => entry.domId === "nested");

      expect(nested?.playbackRate).toBe(expected);
    },
  );
});

describe("parseTimelineFromDOM — head trim at an authored speed above 5x", () => {
  it("moves the in-point by the speed playback uses", () => {
    const doc = makeDoc(`
      <div data-composition-id="root">
        <video id="v" class="clip" data-start="2" data-duration="4" data-media-start="1"
          data-playback-rate="8"></video>
      </div>
    `);
    const element = parseTimelineFromDOM(doc, 10).find((e) => e.domId === "v")!;
    const preview = computeResizePreview(
      {
        element,
        edge: "start",
        originClientX: 0,
        previewStart: 2,
        previewDuration: 4,
        started: true,
      },
      100,
      { scroll: null, pps: 100, buildSnapTargets: () => [] },
    );
    expect([preview.previewStart, preview.previewPlaybackStart]).toEqual([3, 9]);
  });
});

describe("createTimelineElementFromManifestClip — source-scoped selector identity", () => {
  it("preserves composition kind and source timing on first translation", () => {
    const doc = makeDoc(`
      <div data-composition-id="root" data-composition-file="index.html">
        <div id="host" data-composition-id="scene" data-composition-src="scene.html"
          data-playback-start="1.5" data-playback-rate="2"></div>
      </div>
    `);
    const host = doc.getElementById("host");

    const element = createTimelineElementFromManifestClip({
      clip: {
        id: "host",
        label: "Scene",
        kind: "composition",
        tagName: "div",
        start: 2,
        duration: 4,
        track: 0,
        compositionId: "scene",
        parentCompositionId: "root",
        compositionSrc: "scene.html",
        playbackStart: 1.5,
        playbackRate: 2,
        assetUrl: null,
      },
      fallbackIndex: 0,
      doc,
      hostEl: host,
    });

    expect(element).toMatchObject({
      kind: "composition",
      compositionSrc: "scene.html",
      playbackStart: 1.5,
      playbackStartAttr: "playback-start",
      playbackRate: 2,
      domId: "host",
    });
  });

  it("keeps the host it was given when a sub-composition is mounted twice", () => {
    const doc = makeDoc(`
      <div data-composition-id="root" data-composition-file="index.html">
        <div id="a" data-hf-id="hf-a" data-composition-id="card" data-composition-src="card.html"></div>
        <div id="b" data-hf-id="hf-b" data-composition-id="card" data-composition-src="card.html"></div>
      </div>
    `);
    const element = createTimelineElementFromManifestClip({
      clip: {
        id: "b",
        label: "Card",
        kind: "composition",
        tagName: "div",
        start: 4,
        duration: 4,
        track: 0,
        compositionId: "card",
        parentCompositionId: "root",
        compositionSrc: null,
        assetUrl: null,
      },
      fallbackIndex: 1,
      doc,
      hostEl: doc.getElementById("b"),
    });
    expect(element).toMatchObject({ domId: "b", hfId: "hf-b", compositionSrc: "card.html" });
  });

  it("ignores an index.html duplicate when indexing a scene.html selector", () => {
    const doc = makeDoc(`
      <div data-composition-id="root" data-composition-file="index.html">
        <div class="sub"></div>
        <div data-composition-id="scene" data-composition-file="scene.html">
          <div class="sub"></div>
          <div class="sub" data-target></div>
        </div>
      </div>
    `);
    const target = doc.querySelector("[data-target]");
    if (!target) throw new Error("missing target");

    const element = createTimelineElementFromManifestClip({
      clip: {
        id: null,
        label: "Sub",
        kind: "element",
        tagName: "div",
        start: 0,
        duration: 5,
        track: 0,
        compositionId: null,
        parentCompositionId: null,
        compositionSrc: null,
        assetUrl: null,
      },
      fallbackIndex: 0,
      doc,
      hostEl: target,
    });

    expect(element.sourceFile).toBe("scene.html");
    expect(element.selectorIndex).toBe(1);
    expect(element.key).toBe("scene.html:.sub:1");
  });
});

// Caught by looking at the studio, not by reading: a grouped composition drew
// "Voiceover • 0.0s – 12.0s" as a full-duration clip row directly above its own
// group header. `<hf-audio-group>` is a mixer bus — no timing, drawn as a group
// row by the group derivation — but it is still a body child with an id, so the
// implicit-layer fallback happily gave it a track. Draggable and trimmable, and
// writing timing onto a bus means nothing.
describe("<hf-audio-group> is not a timeline layer", () => {
  it("is excluded by the shared ignore predicate", () => {
    const doc = makeDoc(`<hf-audio-group id="vo"></hf-audio-group><div id="panel"></div>`);
    expect(isTimelineIgnoredElement(doc.getElementById("vo") as Element)).toBe(true);
    expect(isTimelineIgnoredElement(doc.getElementById("panel") as Element)).toBe(false);
  });
});

describe("mergeTimelineElementsPreservingDowngrades — genuine removal vs transient downgrade", () => {
  it("drops a removed TOP-LEVEL element (undo of a split) instead of ghosting it", () => {
    const current = [el("a"), el("a-split")]; // post-split store: original + clone
    const next = [el("a")]; // fresh scan of the reverted file: clone gone
    const merged = mergeTimelineElementsPreservingDowngrades(current, next, 30, 30);
    expect(merged.map((e) => e.id)).toEqual(["a"]);
  });

  it("still preserves an enriched sub-composition child a bare re-scan drops", () => {
    const current = [el("a"), el("sub-child", { compositionSrc: "sub.html" })];
    const next = [el("a")]; // bare DOM scan misses the enriched sub-comp child
    const merged = mergeTimelineElementsPreservingDowngrades(current, next, 30, 30);
    expect(merged.map((e) => e.id).sort()).toEqual(["a", "sub-child"]);
  });

  it("drops a section whose host left the preview (undo of an agent's build)", () => {
    const current = [
      el("a"),
      el("benefit-fresh", { compositionSrc: "compositions/benefit-fresh.html" }),
    ];
    const next = [el("a")]; // the reverted film's manifest: the built section is gone
    const inPreview = (element: { id: string }) => element.id !== "benefit-fresh";
    const merged = mergeTimelineElementsPreservingDowngrades(current, next, 30, 30, inPreview);
    expect(merged.map((e) => e.id)).toEqual(["a"]);
  });

  it("trusts the fresh scan fully when it is not shorter", () => {
    const current = [el("a"), el("b", { compositionSrc: "sub.html" })];
    const next = [el("a"), el("c")];
    expect(
      mergeTimelineElementsPreservingDowngrades(current, next, 30, 30).map((e) => e.id),
    ).toEqual(["a", "c"]);
  });
});

describe("audio FX attributes on parsed elements", () => {
  const CHAIN = '{"version":1,"nodes":[{"type":"lowpass","id":"n1","params":{}}]}';
  const LANE = '{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":1}]}]}';

  it("carries data-fx-chain and data-automation off the element", () => {
    // The timeline row is what reserves automation height and draws the lanes;
    // parsed straight from the DOM it used to arrive without either attribute,
    // so the panel showed a chain the timeline could not.
    const doc = new DOMParser().parseFromString(
      `<div data-composition-id="main" data-start="0" data-duration="10">
         <audio id="bgm" data-start="0" data-duration="10" data-fx-chain='${CHAIN}'
           data-automation='${LANE}'></audio>
       </div>`,
      "text/html",
    );
    const [bgm] = parseTimelineFromDOM(doc, 10).filter((e) => e.domId === "bgm");
    expect(bgm?.fxChain).toBe(CHAIN);
    expect(bgm?.automation).toBe(LANE);
  });

  it("leaves them unset on a track that carries neither", () => {
    const doc = new DOMParser().parseFromString(
      `<div data-composition-id="main" data-start="0" data-duration="10">
         <audio id="bgm" data-start="0" data-duration="10"></audio>
       </div>`,
      "text/html",
    );
    const [bgm] = parseTimelineFromDOM(doc, 10).filter((e) => e.domId === "bgm");
    expect(bgm?.fxChain).toBeUndefined();
    expect(bgm?.automation).toBeUndefined();
  });
});

describe("the master chain on parsed elements", () => {
  const CHAIN = '{"version":1,"nodes":[{"type":"truepeak","id":"m1","params":{}}]}';
  const parseVideo = (rootAttrs: string, inner = ""): TimelineElement | undefined => {
    const doc = new DOMParser().parseFromString(
      `<div data-composition-id="main" data-start="0" data-duration="10" ${rootAttrs}>
         <video id="talk" data-start="0" data-duration="10" data-has-audio="true"></video>${inner}
       </div>`,
      "text/html",
    );
    return parseTimelineFromDOM(doc, 10).find((e) => e.domId === "talk");
  };

  it("copies the root's data-fx-chain onto an element that has none of its own", () => {
    const talk = parseVideo(`data-fx-chain='${CHAIN}'`);
    expect(talk?.masterChain).toBe(CHAIN);
    expect(talk?.fxChain).toBeUndefined();
  });

  it("leaves it unset when the root carries none", () => {
    expect(parseVideo("")?.masterChain).toBeUndefined();
  });

  it("ignores a sub-composition root's chain", () => {
    const inner = `<div data-composition-id="inner" data-fx-chain='${CHAIN}'></div>`;
    expect(parseVideo("", inner)?.masterChain).toBeUndefined();
  });

  it("carries it on the manifest path too", () => {
    const doc = makeDoc(`
      <div data-composition-id="main" data-fx-chain='${CHAIN}'>
        <video id="talk" data-has-audio="true"></video>
      </div>
    `);
    const element = createTimelineElementFromManifestClip({
      clip: {
        id: "talk",
        label: "Talk",
        kind: "video",
        tagName: "video",
        start: 0,
        duration: 10,
        track: 0,
        compositionId: null,
        parentCompositionId: "main",
        compositionSrc: null,
        assetUrl: null,
      },
      fallbackIndex: 0,
      doc,
      hostEl: doc.getElementById("talk"),
    });
    expect(element.masterChain).toBe(CHAIN);
  });
});

// A composition clip trimmed by 30 px collapsed to its first nested video's 1.77 s: that length capped the trim.
describe("a composition clip's source length", () => {
  const scene = `
    <div data-composition-id="root">
      <div id="host" data-composition-id="scene" data-composition-src="scene.html"
        data-start="0" data-duration="18" data-track-index="1">
        <div data-composition-id="scene">
          <video id="bg" src="bg.mp4" data-source-duration="1.77" data-start="2" data-duration="1.75"></video>
        </div>
      </div>
      <div id="wrapper" class="clip" data-start="0" data-duration="3" data-track-index="2">
        <video src="talk.mp4" data-source-duration="4"></video>
      </div>
    </div>
  `;

  it("is not taken from media inside the composition, parsed from the DOM", () => {
    const parsed = parseTimelineFromDOM(makeDoc(scene), 18);
    const host = parsed.find((entry) => entry.domId === "host");
    expect(host?.sourceDuration).toBeUndefined();
    expect(host?.tag).not.toBe("video");
    expect(parsed.find((entry) => entry.domId === "wrapper")?.sourceDuration).toBe(4);
  });

  it("does not cap trimming the composition's end at that media's length", () => {
    const host = parseTimelineFromDOM(makeDoc(scene), 18).find((entry) => entry.domId === "host");
    const trimmed = computeResizePreview(
      {
        element: host!,
        edge: "end",
        originClientX: 360,
        previewStart: 0,
        previewDuration: 18,
        started: true,
      },
      330,
      { scroll: null, pps: 20, buildSnapTargets: () => [] },
    );
    expect(trimmed.previewDuration).toBeCloseTo(16.5, 3);
  });

  it("is not taken from media inside the composition, from the runtime manifest", () => {
    const doc = makeDoc(scene);
    const element = createTimelineElementFromManifestClip({
      clip: {
        id: "host",
        label: "Scene",
        kind: "composition",
        tagName: "div",
        start: 0,
        duration: 18,
        track: 1,
        compositionId: "scene",
        parentCompositionId: "root",
        compositionSrc: "scene.html",
        playbackStart: null,
        playbackRate: null,
        assetUrl: null,
      },
      fallbackIndex: 0,
      doc,
      hostEl: doc.getElementById("host"),
    });
    expect(element.sourceDuration).toBeUndefined();
    expect(element.src).toBeUndefined();
  });

  it("still shows an inline composition's image as its thumbnail", () => {
    const parsed = parseTimelineFromDOM(
      makeDoc(`
        <div data-composition-id="root">
          <div id="card" data-composition-id="card" data-start="0" data-duration="5" data-track-index="1">
            <img src="card.png" />
          </div>
        </div>
      `),
      5,
    );
    const card = parsed.find((entry) => entry.domId === "card");
    expect(card?.tag).toBe("img");
    expect(card?.src).toBe("card.png");
    expect(card?.sourceDuration).toBeUndefined();
  });
});

describe("what the live clip list says a clip plays", () => {
  function manifestVideo(attrs: string): TimelineElement {
    const doc = makeDoc(
      `<div data-composition-id="root"><video id="v" src="a.mp4" data-start="0" data-duration="4" ${attrs}></video></div>`,
    );
    return createTimelineElementFromManifestClip({
      clip: {
        id: "v",
        label: "v",
        kind: "video",
        tagName: "video",
        start: 0,
        duration: 4,
        track: 0,
        assetUrl: null,
      },
      fallbackIndex: 0,
      doc,
      hostEl: doc.getElementById("v"),
    });
  }

  it("carries data-volume and muted from the element", () => {
    expect(manifestVideo('data-volume="0" muted')).toMatchObject({ volume: 0, muted: true });
    const plain = manifestVideo("");
    expect(plain.volume).toBeUndefined();
    expect(plain.muted).toBeUndefined();
  });

  it("carries the clip-edge fades, and drops a zero one", () => {
    const faded = manifestVideo('data-fade-in="1.5" data-fade-out="0"');
    expect(faded.fadeIn).toBe(1.5);
    expect(faded.fadeOut).toBeUndefined();
  });

  it("gives a video with neither muted nor data-has-audio sound, as the compiler does", () => {
    expect(manifestVideo("").hasAudio).toBe(true);
    expect(manifestVideo("muted").hasAudio).toBeUndefined();
    expect(manifestVideo('data-has-audio="false"').hasAudio).toBeUndefined();
    expect(manifestVideo('muted data-has-audio="true"')).toMatchObject({
      hasAudio: true,
      muted: true,
    });
  });

  it.each(["", ' data-has-audio="true"'])(
    "does not give a timed wrapper the sound of an untimed video%s inside it",
    (videoAttrs) => {
      const doc = makeDoc(
        `<div data-composition-id="root"><div id="w" data-start="0" data-duration="4"><video src="a.mp4"${videoAttrs}></video></div></div>`,
      );
      const wrapper = createTimelineElementFromManifestClip({
        clip: {
          id: "w",
          label: "w",
          kind: "element",
          tagName: "div",
          start: 0,
          duration: 4,
          track: 0,
          assetUrl: null,
        },
        fallbackIndex: 0,
        doc,
        hostEl: doc.getElementById("w"),
      });
      expect(wrapper.hasAudio).toBeUndefined();
    },
  );
});
