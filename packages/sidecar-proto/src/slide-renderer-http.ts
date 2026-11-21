// HTTP slide-renderer wire protocol.
//
// The daemon renders slides through `desktopSlideRenderer`. The desktop build
// injects an Electron-backed one; a deployment with no sidecar may instead
// point `OD_SLIDE_RENDERER_URL` at an HTTP service, which is what this module
// specifies. It is the whole contract: an operator implementing a renderer
// should not have to read the daemon to know what to send back.
//
// ── Request ────────────────────────────────────────────────────────────────
// POST <base>/render-slides
//   content-type: application/json
//   body: DesktopRenderSlidesInput
//
// `outputDir` is an absolute path **in the daemon's filesystem**, not the
// renderer's. A renderer must not try to write there; it returns bytes and the
// daemon does the writing. It is present because the same input type is used
// for the co-located Electron renderer, which does write to it directly.
//
// `baseHref` is where relative assets (images, fonts, stylesheets) resolve
// from, and the renderer is expected to fetch them. The daemon builds it from
// its own address, which for a container binding 0.0.0.0 is a loopback URL that
// means nothing in a different container — so a split deployment must set
// `OD_SLIDE_RENDERER_DAEMON_URL` to the origin the renderer uses to reach the
// daemon, and the daemon rewrites the origin before sending. Getting this wrong
// does not error: the deck renders with its inline content and silently loses
// every external asset.
//
// ── Response: render failed ────────────────────────────────────────────────
// HTTP 200, content-type: application/json
//   body: DesktopRenderSlidesResult with `ok: false`
//
// For outcomes the caller is expected to act on — no slides found, page too
// tall. The daemon maps these exactly as it maps the Electron renderer's.
//
// ── Response: renderer failed ──────────────────────────────────────────────
// Any non-2xx. Optionally a JSON body with an `error` string, which the daemon
// surfaces verbatim.
//
// A broken renderer and an unrenderable document are different things and need
// different actions from whoever reads the failure, so they must not share a
// representation. Do not report an internal error as `{ ok: false }`.
//
// ── Response: render succeeded ─────────────────────────────────────────────
// HTTP 200, any content-type other than application/json, body is one frame:
//
//   ┌──────────────┬──────────────┬─────────────┬────────┬────────┬─────┐
//   │ magic (9B)   │ headerLen(4B)│ header JSON │ part 0 │ part 1 │ ... │
//   └──────────────┴──────────────┴─────────────┴────────┴────────┴─────┘
//
//   magic      "ODRENDER" + one ASCII version digit. This module writes and
//              accepts version 1; a decoder rejects any other digit rather
//              than guessing at a layout it does not know.
//   headerLen  uint32, big-endian, byte length of the header JSON.
//   header     UTF-8 JSON: a DesktopRenderSlidesResult plus a `parts` array of
//              `{ name, bytes }` describing the payloads that follow, in the
//              order they appear. `ok` must be true.
//   parts      the raw payloads, concatenated, no padding or separators. The
//              declared lengths must account for the rest of the frame exactly;
//              a mismatch means truncation and the daemon rejects the whole
//              response rather than writing files it cannot vouch for.
//
// Why bytes and not paths: `DesktopRenderSlidesResult` carries `pptxFile` /
// `slideFiles` as absolute paths, which only works when the renderer shares a
// filesystem with the daemon. Across a network it cannot, and base64 in JSON
// would inflate a tens-of-megabytes deck export by a third.
//
// `name` is advisory, and the daemon means it: output files are named from the
// REQUEST and the payload's position in the frame, never from what the renderer
// called them. A renderer therefore cannot decide where a file lands, what it
// is taken to be, or collide two payloads onto one path. The only thing read
// from `name` is a file extension, and only when it is one of png/jpg/jpeg —
// otherwise the encoding the request asked for wins.
//
// Which result shape comes back is likewise decided by the request:
// `editable: true` means exactly one payload and yields `pptxFile`; anything
// else yields `slideFiles` in frame order. A frame whose payload count
// contradicts the request is rejected rather than reinterpreted.

import type { DesktopRenderSlidesResult } from "./index.js";

/**
 * Wire-format version this module speaks. Bump only for a breaking layout
 * change, and keep the magic's trailing digit in step.
 */
export const SLIDE_RENDERER_HTTP_PROTOCOL_VERSION = 1;

/** Path the daemon POSTs to, appended to `OD_SLIDE_RENDERER_URL`. */
export const SLIDE_RENDERER_HTTP_PATH = "/render-slides";

const FRAME_MAGIC_PREFIX = "ODRENDER";
const FRAME_MAGIC_LENGTH = FRAME_MAGIC_PREFIX.length + 1;
const FRAME_HEADER_LENGTH_BYTES = 4;

/** Magic bytes for the current version, as written into a success frame. */
export const SLIDE_RENDERER_FRAME_MAGIC = `${FRAME_MAGIC_PREFIX}${SLIDE_RENDERER_HTTP_PROTOCOL_VERSION}`;

/** One payload in a success frame, as declared in its header. */
export type SlideRenderFramePart = {
  /** Byte length of this payload. */
  bytes: number;
  /**
   * Advisory file name. The daemon keeps only the basename and places the file
   * in a directory it owns.
   */
  name: string;
};

/** Header of a success frame: the result, plus what follows it. */
export type SlideRenderFrameHeader = DesktopRenderSlidesResult & {
  parts?: SlideRenderFramePart[];
};

/**
 * Result fields a success frame may carry, and what they must be. Checked at
 * runtime because a renderer is a separate program that can send anything;
 * fields absent here (`error`, `errorCode`) belong to a failed render, which
 * travels as JSON rather than as a frame.
 */
const SLIDE_RENDER_RESULT_FIELD_TYPES: ReadonlyArray<[string, "number" | "string"]> = [
  ["height", "number"],
  ["mode", "string"],
  ["pptxFile", "string"],
  ["width", "number"],
];

/** A decoded success frame. */
export type DecodedSlideRenderFrame = {
  /** The result as declared, with the transport-only `parts` removed. */
  result: DesktopRenderSlidesResult;
  parts: Array<{ body: Uint8Array; name: string }>;
};

/**
 * Thrown for any frame this module refuses to interpret. Callers should treat
 * it as a renderer fault, not as a render result.
 */
export class SlideRenderFrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlideRenderFrameError";
  }
}

function asBytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

/**
 * Builds a success frame. Used by renderers, and by the daemon's own tests so
 * the producer and the decoder cannot drift apart.
 */
export function encodeSlideRenderFrame(
  result: DesktopRenderSlidesResult,
  parts: Array<{ body: ArrayBuffer | Uint8Array; name: string }>,
): Uint8Array {
  const bodies = parts.map((part) => asBytes(part.body));
  const header: SlideRenderFrameHeader = {
    ...result,
    parts: parts.map((part, index) => ({ bytes: bodies[index]!.byteLength, name: part.name })),
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const payloadLength = bodies.reduce((total, body) => total + body.byteLength, 0);
  const frame = new Uint8Array(
    FRAME_MAGIC_LENGTH + FRAME_HEADER_LENGTH_BYTES + headerBytes.byteLength + payloadLength,
  );

  for (let i = 0; i < FRAME_MAGIC_LENGTH; i++) {
    frame[i] = SLIDE_RENDERER_FRAME_MAGIC.charCodeAt(i);
  }
  new DataView(frame.buffer).setUint32(FRAME_MAGIC_LENGTH, headerBytes.byteLength, false);
  frame.set(headerBytes, FRAME_MAGIC_LENGTH + FRAME_HEADER_LENGTH_BYTES);

  let offset = FRAME_MAGIC_LENGTH + FRAME_HEADER_LENGTH_BYTES + headerBytes.byteLength;
  for (const body of bodies) {
    frame.set(body, offset);
    offset += body.byteLength;
  }
  return frame;
}

/**
 * Parses a success frame, or throws {@link SlideRenderFrameError}.
 *
 * Every rejection here means the response cannot be trusted as a whole — a
 * partially valid frame is not partially usable, because the daemon would be
 * writing files whose provenance it cannot state.
 */
export function decodeSlideRenderFrame(frame: ArrayBuffer | Uint8Array): DecodedSlideRenderFrame {
  const bytes = asBytes(frame);
  if (bytes.byteLength < FRAME_MAGIC_LENGTH + FRAME_HEADER_LENGTH_BYTES) {
    throw new SlideRenderFrameError("slide renderer returned an unrecognised frame");
  }
  const magic = String.fromCharCode(...bytes.subarray(0, FRAME_MAGIC_LENGTH));
  if (!magic.startsWith(FRAME_MAGIC_PREFIX)) {
    throw new SlideRenderFrameError("slide renderer returned an unrecognised frame");
  }
  // A recognisable frame in a version we do not speak is a distinct failure
  // from noise: the operator needs to know their renderer is newer, not that it
  // sent garbage.
  const version = Number(magic.slice(FRAME_MAGIC_PREFIX.length));
  if (version !== SLIDE_RENDERER_HTTP_PROTOCOL_VERSION) {
    throw new SlideRenderFrameError(
      `slide renderer frame version ${magic.slice(FRAME_MAGIC_PREFIX.length)} is not supported ` +
        `(this build speaks ${SLIDE_RENDERER_HTTP_PROTOCOL_VERSION})`,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = view.getUint32(FRAME_MAGIC_LENGTH, false);
  const headerStart = FRAME_MAGIC_LENGTH + FRAME_HEADER_LENGTH_BYTES;
  const headerEnd = headerStart + headerLength;
  if (headerEnd > bytes.byteLength) {
    throw new SlideRenderFrameError("slide renderer frame header is truncated");
  }

  // Parsed as `unknown` and checked, not cast. This is an external wire
  // boundary, so the TypeScript annotation buys the daemon nothing at runtime:
  // a header of `null`, or one whose `parts` is an object, would otherwise
  // escape as a raw TypeError from somewhere further down, and a truthy
  // non-boolean `ok` would flow back as a successful result.
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes.subarray(headerStart, headerEnd)));
  } catch {
    throw new SlideRenderFrameError("slide renderer frame header is not valid JSON");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SlideRenderFrameError("slide renderer frame header is not an object");
  }
  const header = raw as Record<string, unknown>;
  // A success frame carries a successful result by definition; a failed render
  // is the JSON response, not this.
  if (header.ok !== true) {
    throw new SlideRenderFrameError("slide renderer success frame must declare ok: true");
  }
  if (header.parts !== undefined && !Array.isArray(header.parts)) {
    throw new SlideRenderFrameError("slide renderer frame parts must be an array");
  }
  for (const [field, expected] of SLIDE_RENDER_RESULT_FIELD_TYPES) {
    const value = header[field];
    if (value !== undefined && typeof value !== expected) {
      throw new SlideRenderFrameError(
        `slide renderer frame field \`${field}\` must be a ${expected}`,
      );
    }
  }

  const declared = (header.parts ?? []) as SlideRenderFramePart[];
  const parts: Array<{ body: Uint8Array; name: string }> = [];
  let offset = headerEnd;
  for (const part of declared) {
    if (!Number.isInteger(part?.bytes) || part.bytes < 0 || typeof part?.name !== "string") {
      throw new SlideRenderFrameError("slide renderer frame declares a malformed part");
    }
    if (offset + part.bytes > bytes.byteLength) {
      throw new SlideRenderFrameError("slide renderer frame length mismatch");
    }
    parts.push({ body: bytes.subarray(offset, offset + part.bytes), name: part.name });
    offset += part.bytes;
  }
  // Trailing bytes are as suspect as missing ones: the frame does not describe
  // what it actually carries.
  if (offset !== bytes.byteLength) {
    throw new SlideRenderFrameError("slide renderer frame length mismatch");
  }

  const result = { ...header } as DesktopRenderSlidesResult;
  delete (result as { parts?: unknown }).parts;
  return { parts, result };
}
