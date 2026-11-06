// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import {
  applyMediaMetadataFromElement,
  getTimelineElementSelector,
  isVideoAudible,
  resolveMediaElement,
} from "./timelineElementHelpers";
import { readTimelineText, sameTimelineText } from "./timelineText";

describe("isVideoAudible — the compiler's data-has-audio rule", () => {
  it("explicit data-has-audio wins", () => {
    expect(isVideoAudible({ tag: "video", hasAudioAttr: "true", muted: false })).toBe(true);
    expect(isVideoAudible({ tag: "video", hasAudioAttr: "false", muted: false })).toBe(false);
  });
  it("no attribute: an unmuted video is audible, a muted one is not", () => {
    expect(isVideoAudible({ tag: "video", hasAudioAttr: null, muted: false })).toBe(true);
    expect(isVideoAudible({ tag: "video", hasAudioAttr: undefined, muted: true })).toBe(false);
  });
  it("never true for non-video without the attribute", () => {
    expect(isVideoAudible({ tag: "img", hasAudioAttr: null, muted: false })).toBe(false);
  });
});

describe("preview nodes built in another realm", () => {
  // The Studio preview's body carries the editor window's prototypes, so its
  // nodes fail `instanceof` against their own window's HTMLElement.
  function foreignNode(html: string): Element {
    const holder = document.createElement("div");
    holder.innerHTML = html;
    const node = holder.firstElementChild!;
    document.body.appendChild(node);
    Object.setPrototypeOf(node, Object.create(Element.prototype));
    expect(node instanceof HTMLElement).toBe(false);
    return node;
  }

  it("gives a row with an id its id selector", () => {
    const el = foreignNode(`<div id="layer-00" class="clip layer"></div>`);
    expect(getTimelineElementSelector(el)).toBe("#layer-00");
  });

  it("reads media metadata off a foreign <video>", () => {
    const el = foreignNode(`<video src="a.mp4" data-source-duration="12"></video>`);
    expect(resolveMediaElement(el)).toBe(el);
    const entry = { id: "v", tag: "div", start: 0, duration: 4, track: 0 } as TimelineElement;
    applyMediaMetadataFromElement(entry, el);
    expect(entry.sourceDuration).toBe(12);
  });
});

describe("readTimelineText", () => {
  function layer(html: string): Element {
    document.body.innerHTML = html;
    return document.body.firstElementChild!;
  }

  it("reads a text layer's words, collapsed to one line, with its font and colour", () => {
    const text = readTimelineText(
      layer(`<h1 style="font-family: Georgia; font-weight: 700; color: rgb(255, 0, 0)">
        Ship <span>it</span>
      </h1>`),
    );
    expect(text).toMatchObject({ value: "Ship it", fontWeight: "700", color: "rgb(255, 0, 0)" });
    expect(text?.fontFamily).toContain("Georgia");
  });

  it("leaves a layer that holds anything but text, or no words, to its picture", () => {
    expect(
      readTimelineText(layer(`<div><div>Title</div><div><i></i></div></div>`)),
    ).toBeUndefined();
    expect(readTimelineText(layer(`<div class="glyph"></div>`))).toBeUndefined();
    expect(readTimelineText(layer(`<section>Words</section>`))).toBeUndefined();
  });

  it("keeps a layer that paints an image as a picture, and carries a flat background colour", () => {
    expect(
      readTimelineText(
        layer(`<div style="background-image: linear-gradient(red, blue)">L01</div>`),
      ),
    ).toBeUndefined();
    expect(
      readTimelineText(layer(`<div style="background-color: rgb(230, 57, 70)">Go</div>`)),
    ).toMatchObject({
      value: "Go",
      background: "rgb(230, 57, 70)",
    });
    expect(readTimelineText(layer(`<div>Go</div>`))?.background).toBeUndefined();
    expect(
      readTimelineText(layer(`<div style="background-color: rgba(255, 255, 255, 0.01)">Go</div>`))
        ?.background,
    ).toBeUndefined();
  });

  it("tells a text change apart from an identical re-read", () => {
    const text = { value: "Old", color: "rgb(0, 0, 0)" };
    expect(sameTimelineText(text, { ...text })).toBe(true);
    expect(sameTimelineText(text, { ...text, value: "New" })).toBe(false);
    expect(sameTimelineText(text, undefined)).toBe(false);
  });
});
