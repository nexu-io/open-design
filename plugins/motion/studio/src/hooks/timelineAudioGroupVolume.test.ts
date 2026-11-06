// @vitest-environment jsdom

/**
 * A group write has to reach the STORE, not just the file and the live DOM.
 *
 * The timeline derives a group row's label, fader, mute and chain from the
 * `audioGroup*` fields mirrored onto its members — so a write that lands
 * everywhere except there leaves the header rendering whatever it parsed at
 * load. Observed in the studio: muting a group wrote `data-hidden` to disk and
 * to the preview, and the button stayed "Mute group Voiceover", re-writing the
 * same attribute on every click with no way to unmute.
 *
 * Invalidating the parse cache is necessary but not sufficient — it only makes
 * the NEXT parse honest, and a live attribute patch never triggers one.
 */

import { afterEach, describe, expect, it } from "vitest";
import { usePlayerStore, type TimelineElement } from "../player";
import { resolveGroupSourceFile, useSetAudioGroupAttribute } from "./timelineAudioGroupVolume";

afterEach(() => {
  usePlayerStore.getState().reset();
});

function member(domId: string, track: number): TimelineElement {
  return {
    id: domId,
    key: `index.html#${domId}`,
    domId,
    tag: "audio",
    start: 0,
    duration: 5,
    track,
    audioGroup: "voiceover",
    audioGroupHidden: false,
    audioGroupVolume: 1,
  };
}

/** The hook without React — it only closes over refs and callbacks. */
function makeSetter() {
  const input = {
    projectIdRef: { current: "project-1" },
    activeCompPath: "index.html",
    showToast: () => {},
    writeProjectFile: async () => {},
    recordEdit: async () => {},
    pendingTimelineEditPathRef: { current: new Set<string>() },
    previewIframeRef: { current: null },
  };
  // `setLive` takes no async path and touches only the preview DOM + store, so
  // it can be exercised directly; `setQuiet` additionally persists, which this
  // test deliberately does not cover (that is timelineTrackVisibility's job).
  let setter: ReturnType<typeof useSetAudioGroupAttribute> | null = null;
  const Probe = () => {
    setter = useSetAudioGroupAttribute(input as never);
    return null;
  };
  // Minimal hook harness: call the component function directly. It uses only
  // useCallback, which React allows outside a renderer when the result is used
  // immediately and never re-rendered.
  return { Probe, get: () => setter };
}

describe("group attribute writes reach the store", () => {
  it("mirrors data-hidden onto every member so the header can flip", async () => {
    const react = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const harness = makeSetter();
    renderToStaticMarkup(react.createElement(harness.Probe));
    const setter = harness.get();
    expect(setter).not.toBeNull();

    usePlayerStore.getState().setElements([member("voice-1", 0), member("voice-2", 1)]);

    setter?.setLive("voiceover", "data-hidden", "");
    expect(usePlayerStore.getState().elements.every((el) => el.audioGroupHidden === true)).toBe(
      true,
    );

    setter?.setLive("voiceover", "data-hidden", null);
    expect(usePlayerStore.getState().elements.every((el) => el.audioGroupHidden === false)).toBe(
      true,
    );
  });

  // `Number(null)` and `Number("")` are both 0 AND finite, so the obvious
  // isFinite check mirrored "silent" for a removed attribute while core's
  // `readAudioGroupVolume` reads the same absence as unity — a parse divergence
  // inside the mirror whose entire job is to prevent one.
  it("reads a removed data-volume as unity, the way core does", async () => {
    const react = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const harness = makeSetter();
    renderToStaticMarkup(react.createElement(harness.Probe));
    const setter = harness.get();

    usePlayerStore.getState().setElements([member("voice-1", 0)]);

    setter?.setLive("voiceover", "data-volume", "0.3");
    expect(usePlayerStore.getState().elements[0]?.audioGroupVolume).toBeCloseTo(0.3, 6);

    setter?.setLive("voiceover", "data-volume", null);
    expect(usePlayerStore.getState().elements[0]?.audioGroupVolume).toBe(1);

    setter?.setLive("voiceover", "data-volume", "");
    expect(usePlayerStore.getState().elements[0]?.audioGroupVolume).toBe(1);

    setter?.setLive("voiceover", "data-volume", "nonsense");
    expect(usePlayerStore.getState().elements[0]?.audioGroupVolume).toBe(1);
  });

  it("mirrors data-volume, and leaves other groups alone", async () => {
    const react = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const harness = makeSetter();
    renderToStaticMarkup(react.createElement(harness.Probe));
    const setter = harness.get();

    const other: TimelineElement = { ...member("sfx", 2), audioGroup: "effects" };
    usePlayerStore.getState().setElements([member("voice-1", 0), other]);

    setter?.setLive("voiceover", "data-volume", "0.4");

    const byId = new Map(usePlayerStore.getState().elements.map((el) => [el.id, el]));
    expect(byId.get("voice-1")?.audioGroupVolume).toBeCloseTo(0.4, 6);
    expect(byId.get("sfx")?.audioGroupVolume).toBe(1);
  });
});

/**
 * The ancestor shape here is COPIED FROM A LIVE PREVIEW, not imagined.
 *
 * The first attempt at this fix used `getTimelineElementSourceFile` and a
 * fixture in which the sub-composition root carried `data-composition-file`.
 * The test passed; the studio still threw "Unable to patch element in
 * index.html", because the runtime inlines a sub-comp as its own root element
 * that carries only the composition ID — the FILE is on the host above it.
 */
describe("the mirror reaches sub-composition members", () => {
  /**
   * A group declared inside a sub-composition has no FLAT member to mirror onto
   * — `childGroupState` keeps those members out of `elements` — so mirroring
   * only `elements` made this whole function a no-op for it: the header kept the
   * pre-write chain and `laneCount` stayed 0, so the lane disclosure never
   * appeared for automation that now existed.
   */
  it("mirrors a group write onto DomClipChild members as well as flat ones", async () => {
    const react = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const harness = makeSetter();
    renderToStaticMarkup(react.createElement(harness.Probe));
    const setter = harness.get();
    usePlayerStore.getState().setElements([member("flat-1", 0)]);
    usePlayerStore.getState().setDomClipChildren([
      { id: "sub-1", parentId: "host", hostId: "host", label: "Sub 1", audioGroup: "voiceover" },
      { id: "other", parentId: "host", hostId: "host", label: "Other", audioGroup: "sfx" },
    ]);

    setter?.setLive("voiceover", "data-label", "Voices");

    const children = usePlayerStore.getState().domClipChildren;
    expect(children.find((c) => c.id === "sub-1")?.audioGroupLabel).toBe("Voices");
    // A member of another group is untouched.
    expect(children.find((c) => c.id === "other")?.audioGroupLabel).toBeUndefined();
  });
});

describe("resolveGroupSourceFile", () => {
  function livePreviewShape(): Document {
    const doc = document.implementation.createHTMLDocument("preview");
    doc.body.setAttribute("data-composition-id", "subcomp-group-qa");
    doc.body.innerHTML = `
      <div id="voices-host" data-composition-id="voices-host" data-composition-file="compositions/voices.html">
        <section id="voices-root" data-composition-id="voices">
          <hf-audio-group id="voiceover"></hf-audio-group>
        </section>
      </div>
      <hf-audio-group id="root-group"></hf-audio-group>
    `;
    return doc;
  }

  it("climbs past the sub-comp root to the host that names the file", () => {
    const doc = livePreviewShape();
    expect(resolveGroupSourceFile(doc.getElementById("voiceover"))).toBe(
      "compositions/voices.html",
    );
  });

  // A group in the root composition: body names an id but no file, so the
  // caller falls back to activeCompPath. Returning body's id here would route
  // every root-composition group write at a path that does not exist.
  it("returns undefined for a group in the root composition", () => {
    const doc = livePreviewShape();
    expect(resolveGroupSourceFile(doc.getElementById("root-group"))).toBeUndefined();
  });

  it("is safe on a detached or missing element", () => {
    expect(resolveGroupSourceFile(null)).toBeUndefined();
    expect(resolveGroupSourceFile(document.createElement("hf-audio-group"))).toBeUndefined();
  });
});
