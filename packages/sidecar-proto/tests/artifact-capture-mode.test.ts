import { describe, expect, it } from "vitest";

import {
  DESKTOP_ARTIFACT_CAPTURE_ERROR_CODES,
  DESKTOP_ARTIFACT_CAPTURE_MODES,
  normalizeDesktopSidecarMessage,
  SIDECAR_MESSAGES,
} from "../src/index.js";

const baseInput = {
  deck: false,
  format: "image" as const,
  html: "<p>x</p>",
  title: "Cover",
};

describe("desktop artifact capture mode", () => {
  it("names the two capture intents explicitly instead of inferring them from `deck`", () => {
    // The chat card's static cover and the `od export` long-image are two
    // different products of the same renderer. Before this enum the only way
    // to ask for "fixed viewport, do not grow to scrollHeight" was to lie and
    // claim the page was a deck.
    expect(DESKTOP_ARTIFACT_CAPTURE_MODES).toEqual({
      FIRST_VIEWPORT_THUMBNAIL: "first_viewport_thumbnail",
      FULL_PAGE_EXPORT: "full_page_export",
    });
  });

  it("carries a first-viewport thumbnail request through the IPC boundary", () => {
    const input = {
      ...baseInput,
      captureMode: DESKTOP_ARTIFACT_CAPTURE_MODES.FIRST_VIEWPORT_THUMBNAIL,
    };
    expect(
      normalizeDesktopSidecarMessage({ input, type: SIDECAR_MESSAGES.EXPORT_ARTIFACT }),
    ).toEqual({ input, type: "export-artifact" });
  });

  it("leaves the field absent when the caller does not ask for a mode", () => {
    // Additive field: an older daemon that never sets it must keep producing
    // byte-identical full-page exports, so the normalizer must not stamp a
    // default into the wire message.
    const normalized = normalizeDesktopSidecarMessage({
      input: baseInput,
      type: SIDECAR_MESSAGES.EXPORT_ARTIFACT,
    }) as { input: Record<string, unknown> };
    expect(normalized.input).toEqual(baseInput);
    expect(Object.keys(normalized.input)).not.toContain("captureMode");
  });

  it("rejects an unknown capture mode up front", () => {
    expect(() =>
      normalizeDesktopSidecarMessage({
        input: { ...baseInput, captureMode: "above_the_fold" },
        type: SIDECAR_MESSAGES.EXPORT_ARTIFACT,
      }),
    ).toThrow(/unsupported artifact capture mode/);
  });

  it("rejects a first-viewport thumbnail asked for as a PDF", () => {
    // A thumbnail is a raster cover for a chat card. `printToPDF` paginates the
    // whole document and has no first-viewport meaning at all, so accepting the
    // pair would silently hand back a multi-page PDF the card cannot draw.
    expect(() =>
      normalizeDesktopSidecarMessage({
        input: {
          ...baseInput,
          captureMode: DESKTOP_ARTIFACT_CAPTURE_MODES.FIRST_VIEWPORT_THUMBNAIL,
          format: "pdf",
        },
        type: SIDECAR_MESSAGES.EXPORT_ARTIFACT,
      }),
    ).toThrow(/first_viewport_thumbnail/);
  });

  it("publishes machine-readable failure codes so a caller can tell a miss from a crash", () => {
    // The web card falls back to a live iframe when there is no snapshot. It
    // needs to distinguish "we rendered and it came back blank" from "the
    // desktop renderer is not there at all", and a free-text `error` cannot
    // carry that.
    expect(DESKTOP_ARTIFACT_CAPTURE_ERROR_CODES).toEqual({
      BLANK_CAPTURE: "capture_blank",
      RENDER_TIMEOUT: "render_timeout",
      UNSUPPORTED_CAPTURE_MODE: "unsupported_capture_mode",
    });
  });
});
