import { describe, expect, it } from "vitest";

import {
  decodeSlideRenderFrame,
  encodeSlideRenderFrame,
  SLIDE_RENDERER_FRAME_MAGIC,
  SLIDE_RENDERER_HTTP_PROTOCOL_VERSION,
  SlideRenderFrameError,
} from "../src/slide-renderer-http.js";

// This codec is the published contract for an out-of-process slide renderer, so
// the properties worth pinning are the ones an independent implementer would
// rely on: that the layout round-trips exactly, and that every way a frame can
// be wrong is refused rather than half-accepted.

const bytes = (text: string) => new TextEncoder().encode(text);

describe("slide render frame codec", () => {
  it("round-trips a result and its payloads in order", () => {
    const frame = encodeSlideRenderFrame(
      { ok: true, mode: "deck", width: 1920, height: 1080 },
      [
        { body: bytes("first"), name: "slide-1.png" },
        { body: bytes("second-longer"), name: "slide-2.png" },
      ],
    );

    const decoded = decodeSlideRenderFrame(frame);

    // `parts` is transport framing and must not leak into the result the
    // daemon's routes read.
    expect(decoded.result).toEqual({ ok: true, mode: "deck", width: 1920, height: 1080 });
    expect(decoded.parts.map((part) => part.name)).toEqual(["slide-1.png", "slide-2.png"]);
    expect(new TextDecoder().decode(decoded.parts[0]!.body)).toBe("first");
    expect(new TextDecoder().decode(decoded.parts[1]!.body)).toBe("second-longer");
  });

  it("carries binary payloads unchanged", () => {
    // Deliberately not text: PNG bytes include 0x00 and 0xFF runs, and a codec
    // that quietly went through a string would corrupt them.
    const body = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x0d, 0x0a, 0x1a, 0x0a]);

    const decoded = decodeSlideRenderFrame(
      encodeSlideRenderFrame({ ok: true }, [{ body, name: "a.png" }]),
    );

    expect(Array.from(decoded.parts[0]!.body)).toEqual(Array.from(body));
  });

  it("keeps multi-byte names and result strings intact", () => {
    const decoded = decodeSlideRenderFrame(
      encodeSlideRenderFrame({ ok: true, mode: "page" }, [{ body: bytes("x"), name: "封面.png" }]),
    );

    expect(decoded.parts[0]!.name).toBe("封面.png");
  });

  it("encodes a frame with no payloads", () => {
    const decoded = decodeSlideRenderFrame(encodeSlideRenderFrame({ ok: true }, []));

    expect(decoded.parts).toEqual([]);
    expect(decoded.result).toEqual({ ok: true });
  });

  it("writes the magic for the version it speaks", () => {
    const frame = encodeSlideRenderFrame({ ok: true }, []);

    expect(String.fromCharCode(...frame.subarray(0, SLIDE_RENDERER_FRAME_MAGIC.length))).toBe(
      SLIDE_RENDERER_FRAME_MAGIC,
    );
    expect(SLIDE_RENDERER_FRAME_MAGIC.endsWith(String(SLIDE_RENDERER_HTTP_PROTOCOL_VERSION))).toBe(
      true,
    );
  });

  it("refuses a payload that is not a frame", () => {
    expect(() => decodeSlideRenderFrame(bytes("not a frame at all"))).toThrow(
      SlideRenderFrameError,
    );
    expect(() => decodeSlideRenderFrame(bytes("tiny"))).toThrow("unrecognised frame");
  });

  it("names an unsupported version instead of calling it garbage", () => {
    // An operator running a renderer newer than their daemon needs to be told
    // exactly that; "unrecognised frame" would send them looking for corruption.
    const frame = encodeSlideRenderFrame({ ok: true }, []);
    frame[SLIDE_RENDERER_FRAME_MAGIC.length - 1] = "7".charCodeAt(0);

    expect(() => decodeSlideRenderFrame(frame)).toThrow("version 7 is not supported");
  });

  it("refuses a frame cut short", () => {
    const frame = encodeSlideRenderFrame({ ok: true }, [{ body: bytes("12345"), name: "a.png" }]);

    expect(() => decodeSlideRenderFrame(frame.subarray(0, frame.byteLength - 2))).toThrow(
      "length mismatch",
    );
  });

  it("refuses a frame carrying more than it declares", () => {
    const frame = encodeSlideRenderFrame({ ok: true }, [{ body: bytes("12345"), name: "a.png" }]);
    const padded = new Uint8Array(frame.byteLength + 3);
    padded.set(frame, 0);

    expect(() => decodeSlideRenderFrame(padded)).toThrow("length mismatch");
  });

  it("refuses a truncated header", () => {
    const frame = encodeSlideRenderFrame({ ok: true }, []);
    // Claim a header far longer than the frame can hold.
    new DataView(frame.buffer).setUint32(SLIDE_RENDERER_FRAME_MAGIC.length, 9_999, false);

    expect(() => decodeSlideRenderFrame(frame)).toThrow("header is truncated");
  });

  it("refuses a header that is not JSON", () => {
    const frame = encodeSlideRenderFrame({ ok: true }, []);
    // Overwrite the first header byte, keeping every length intact.
    frame[SLIDE_RENDERER_FRAME_MAGIC.length + 4] = "!".charCodeAt(0);

    expect(() => decodeSlideRenderFrame(frame)).toThrow("not valid JSON");
  });

  /** Builds a frame carrying `header` verbatim, with no payloads after it. */
  const frameWithHeader = (header: unknown): Uint8Array => {
    const encoded = new TextEncoder().encode(JSON.stringify(header));
    const frame = new Uint8Array(SLIDE_RENDERER_FRAME_MAGIC.length + 4 + encoded.byteLength);
    for (let i = 0; i < SLIDE_RENDERER_FRAME_MAGIC.length; i++) {
      frame[i] = SLIDE_RENDERER_FRAME_MAGIC.charCodeAt(i);
    }
    new DataView(frame.buffer).setUint32(
      SLIDE_RENDERER_FRAME_MAGIC.length,
      encoded.byteLength,
      false,
    );
    frame.set(encoded, SLIDE_RENDERER_FRAME_MAGIC.length + 4);
    return frame;
  };

  it("refuses a part declaration that is not a length and a name", () => {
    expect(() =>
      decodeSlideRenderFrame(frameWithHeader({ ok: true, parts: [{ bytes: "lots", name: "a.png" }] })),
    ).toThrow("malformed part");
  });

  // A renderer is a separate program that can send anything, and the header's
  // TypeScript type is erased at runtime. Without these checks a `null` header
  // or an object-valued `parts` escapes as a raw TypeError from somewhere
  // further down, and a truthy non-boolean `ok` flows back as a success.
  it.each([
    ["null", null],
    ["a number", 7],
    ["a string", "ok"],
    ["an array", [{ ok: true }]],
  ])("refuses a header that is %s", (_label, header) => {
    expect(() => decodeSlideRenderFrame(frameWithHeader(header))).toThrow("not an object");
  });

  it.each([
    ["absent", {}],
    ["false", { ok: false }],
    ["a truthy string", { ok: "yes" }],
    ["a truthy number", { ok: 1 }],
  ])("refuses a success frame whose ok is %s", (_label, header) => {
    expect(() => decodeSlideRenderFrame(frameWithHeader(header))).toThrow("must declare ok: true");
  });

  it.each([
    ["an object", { ok: true, parts: {} }],
    ["a string", { ok: true, parts: "two" }],
    ["a number", { ok: true, parts: 2 }],
  ])("refuses a frame whose parts is %s", (_label, header) => {
    expect(() => decodeSlideRenderFrame(frameWithHeader(header))).toThrow("parts must be an array");
  });

  it.each([
    ["width", { ok: true, width: "1920" }],
    ["height", { ok: true, height: null }],
    ["mode", { ok: true, mode: 3 }],
    ["pptxFile", { ok: true, pptxFile: true }],
  ])("refuses a frame whose %s has the wrong type", (field, header) => {
    expect(() => decodeSlideRenderFrame(frameWithHeader(header))).toThrow(`\`${field}\` must be a`);
  });

  it("accepts a header carrying only what it needs", () => {
    expect(decodeSlideRenderFrame(frameWithHeader({ ok: true })).result).toEqual({ ok: true });
  });
});
