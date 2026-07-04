import { assertObject, assertKnownKeys, normalizeNonEmptyString, normalizeBoolean, normalizeOptionalPositiveNumber } from "./validation.js";

/**
 * @module desktop-control
 *
 * Desktop remote-control IPC payloads (eval, screenshot, console, click,
 * show, PDF export, slide render, artifact export) and their input
 * normalizers. The normalizers are internal — consumed by the message layer,
 * not re-exported by the root barrel.
 */

export type DesktopEvalInput = {
  expression: string;
};

export type DesktopEvalResult = {
  error?: string;
  ok: boolean;
  value?: unknown;
};

export type DesktopScreenshotInput = {
  path: string;
};

export type DesktopScreenshotResult = {
  path: string;
};

export type DesktopConsoleEntry = {
  level: string;
  text: string;
  timestamp: string;
};

export type DesktopConsoleResult = {
  entries: DesktopConsoleEntry[];
};

export type DesktopClickInput = {
  selector: string;
};

export type DesktopClickResult = {
  clicked: boolean;
  found: boolean;
};

export type DesktopExportPdfInput = {
  baseHref?: string;
  deck: boolean;
  defaultFilename: string;
  html: string;
  title: string;
};

export type DesktopExportPdfResult = {
  canceled?: boolean;
  error?: string;
  ok: boolean;
  path?: string;
};

// Renders an HTML deck (every `<section class="slide">`) to one pixel-perfect
// PNG per slide using the desktop's Electron Chromium, so screenshot-based
// PPTX/PDF export reuses the already-bundled browser instead of shipping a
// second headless engine. `slides` are `data:image/png;base64,...` URLs in
// slide order; `width`/`height` are the captured pixel dimensions.
export type DesktopRenderSlidesInput = {
  baseHref?: string;
  html: string;
  // Explicit page-vs-deck signal from the caller (the web side knows whether the
  // artifact is a deck). `true` forces deck slide capture, `false` forces a
  // single full-page capture even if the page happens to contain `.slide`
  // elements (carousels, testimonials). When omitted, the renderer falls back to
  // the `.slide`-count heuristic.
  deck?: boolean;
  // When true, produce an editable .pptx (native PowerPoint shapes/text via the
  // vendored dom-to-pptx engine) instead of screenshot images. Writes one .pptx
  // into `outputDir` and returns `pptxFile`.
  editable?: boolean;
  // When set, render only the slide at this index (deck mode) — used by image
  // export to capture the single slide the user is viewing.
  index?: number;
  // Encoding for the full-document `page` mode: `jpeg` (small, for PDF) or `png`
  // (lossless source, for image export). Deck slides are always PNG. Default png.
  pageImageFormat?: "png" | "jpeg";
  // Deck only: render every slide and stitch them top-to-bottom into a single
  // tall image (used by image export of a deck). Ignored for ordinary pages.
  stitch?: boolean;
  // Page mode only: split an ordinary (non-deck) page into one image PER
  // VIEWPORT, top to bottom, instead of a single full-page capture — used by
  // the PDF path so a long scrolling page becomes a multi-page PDF (one screen
  // per page). Ignored in deck mode (decks already paginate per slide).
  paginate?: boolean;
  // Optional requested render viewport/stage size in CSS px. Omitted dimensions
  // fall back to renderer defaults.
  width?: number;
  height?: number;
  // When set, the renderer writes each rendered image to a file inside this
  // directory and returns the file paths in `slideFiles` instead of base64
  // data URLs in `slides`. The daemon (which owns the data root) creates and
  // owns this directory and reads/deletes the files afterwards — this avoids
  // pushing tens of MB of base64 through the JSON IPC channel for large images.
  // desktop only writes to the absolute path it is given; it never derives it.
  outputDir?: string;
};

// `mode` reports what the renderer found: `deck` = one PNG per 1920x1080 slide;
// `page` = a single full-document PNG at natural size (the artifact has no
// `.slide` sections, e.g. an ordinary website).
// When the request set `outputDir`, the images are returned as absolute file
// paths in `slideFiles` (binary on disk, no base64); otherwise as base64 data
// URLs in `slides`.
export type DesktopRenderSlidesErrorCode =
  | "NO_SLIDES"
  | "PAGE_TOO_TALL"
  | "RENDER_FAILED"
  | "SLIDE_INDEX_OUT_OF_RANGE";

export type DesktopRenderSlidesResult = {
  error?: string;
  errorCode?: DesktopRenderSlidesErrorCode;
  height?: number;
  mode?: "deck" | "page";
  ok: boolean;
  // Absolute path to the written editable .pptx (set when the request was
  // `editable` with an `outputDir`).
  pptxFile?: string;
  slideFiles?: string[];
  slides?: string[];
  width?: number;
};

export type DesktopExportArtifactFormat = "pdf" | "image";
// Electron's `nativeImage` (the off-screen renderer the programmatic exporter
// uses) can only encode PNG and JPEG. WebP is deliberately excluded so a caller
// asking for it gets a clear validation error instead of a silent PNG downgrade.
// (The in-app web Download menu encodes WebP client-side via canvas.toBlob and
// is unaffected by this list.)
export type DesktopExportArtifactImageFormat = "png" | "jpeg";

// Generic programmatic export (PDF / image). The desktop renderer writes
// the result to a temporary file and returns its path; the daemon streams those
// bytes to the HTTP caller (the `od export` CLI), then removes the temp file.
export type DesktopExportArtifactInput = {
  baseHref?: string;
  deck: boolean;
  format: DesktopExportArtifactFormat;
  html: string;
  imageFormat?: DesktopExportArtifactImageFormat;
  title: string;
  width?: number;
  height?: number;
};

export type DesktopExportArtifactResult = {
  bytes?: number;
  error?: string;
  mime?: string;
  ok: boolean;
  path?: string;
};

/** @internal Validate a desktop `eval` request payload. */
export function normalizeDesktopEvalInput(input: unknown): DesktopEvalInput {
  const value = assertObject(input, "desktop eval input");
  assertKnownKeys(value, ["expression"], "desktop eval input");
  return { expression: normalizeNonEmptyString(value.expression, "desktop eval expression") };
}

/** @internal Validate a desktop `screenshot` request payload. */
export function normalizeDesktopScreenshotInput(input: unknown): DesktopScreenshotInput {
  const value = assertObject(input, "desktop screenshot input");
  assertKnownKeys(value, ["path"], "desktop screenshot input");
  return { path: normalizeNonEmptyString(value.path, "desktop screenshot path") };
}

/** @internal Validate a desktop `click` request payload. */
export function normalizeDesktopClickInput(input: unknown): DesktopClickInput {
  const value = assertObject(input, "desktop click input");
  assertKnownKeys(value, ["selector"], "desktop click input");
  return { selector: normalizeNonEmptyString(value.selector, "desktop click selector") };
}

/** @internal Validate a desktop PDF-export request payload. */
export function normalizeDesktopExportPdfInput(input: unknown): DesktopExportPdfInput {
  const value = assertObject(input, "desktop PDF export input");
  assertKnownKeys(value, ["baseHref", "deck", "defaultFilename", "html", "title"], "desktop PDF export input");
  return {
    ...(value.baseHref == null ? {} : { baseHref: normalizeNonEmptyString(value.baseHref, "desktop PDF export baseHref") }),
    deck: normalizeBoolean(value.deck, "desktop PDF export deck"),
    defaultFilename: normalizeNonEmptyString(value.defaultFilename, "desktop PDF export defaultFilename"),
    html: normalizeNonEmptyString(value.html, "desktop PDF export html"),
    title: normalizeNonEmptyString(value.title, "desktop PDF export title"),
  };
}

/** @internal Validate a desktop render-slides request payload. */
export function normalizeDesktopRenderSlidesInput(input: unknown): DesktopRenderSlidesInput {
  const value = assertObject(input, "desktop render slides input");
  assertKnownKeys(value, ["baseHref", "deck", "editable", "height", "html", "index", "outputDir", "pageImageFormat", "stitch", "paginate", "width"], "desktop render slides input");
  if (value.deck != null && typeof value.deck !== "boolean") {
    throw new Error("desktop render slides deck must be a boolean");
  }
  if (value.editable != null && typeof value.editable !== "boolean") {
    throw new Error("desktop render slides editable must be a boolean");
  }
  if (value.index != null && (typeof value.index !== "number" || !Number.isInteger(value.index) || value.index < 0)) {
    throw new Error("desktop render slides index must be a non-negative integer");
  }
  if (value.pageImageFormat != null && value.pageImageFormat !== "png" && value.pageImageFormat !== "jpeg") {
    throw new Error("desktop render slides pageImageFormat must be 'png' or 'jpeg'");
  }
  if (value.stitch != null && typeof value.stitch !== "boolean") {
    throw new Error("desktop render slides stitch must be a boolean");
  }
  if (value.paginate != null && typeof value.paginate !== "boolean") {
    throw new Error("desktop render slides paginate must be a boolean");
  }
  if (value.outputDir != null) {
    const dir = normalizeNonEmptyString(value.outputDir, "desktop render slides outputDir");
    // outputDir is a daemon-owned absolute scratch path; reject relative values
    // so a malformed request can't make desktop main write outside it. Accepts
    // POSIX (`/…`), Windows drive (`C:\…` / `C:/…`), and UNC (`\\…`) absolutes.
    if (!/^(\/|[A-Za-z]:[\\/]|\\\\)/.test(dir)) {
      throw new Error("desktop render slides outputDir must be an absolute path");
    }
  }
  return {
    ...(value.baseHref == null ? {} : { baseHref: normalizeNonEmptyString(value.baseHref, "desktop render slides baseHref") }),
    ...(value.deck == null ? {} : { deck: value.deck }),
    ...(value.editable == null ? {} : { editable: value.editable }),
    html: normalizeNonEmptyString(value.html, "desktop render slides html"),
    ...(value.index == null ? {} : { index: value.index }),
    ...(value.outputDir == null ? {} : { outputDir: normalizeNonEmptyString(value.outputDir, "desktop render slides outputDir") }),
    ...(value.pageImageFormat == null ? {} : { pageImageFormat: value.pageImageFormat }),
    ...(value.stitch == null ? {} : { stitch: value.stitch }),
    ...(value.paginate == null ? {} : { paginate: value.paginate }),
    ...(value.width == null ? {} : { width: normalizeOptionalPositiveNumber(value.width, "desktop render slides width") }),
    ...(value.height == null ? {} : { height: normalizeOptionalPositiveNumber(value.height, "desktop render slides height") }),
  };
}

const DESKTOP_EXPORT_ARTIFACT_FORMATS: readonly DesktopExportArtifactFormat[] = ["pdf", "image"];
const DESKTOP_EXPORT_ARTIFACT_IMAGE_FORMATS: readonly DesktopExportArtifactImageFormat[] = ["png", "jpeg"];

/** @internal Validate a desktop generic artifact-export request payload. */
export function normalizeDesktopExportArtifactInput(input: unknown): DesktopExportArtifactInput {
  const value = assertObject(input, "desktop artifact export input");
  assertKnownKeys(value, ["baseHref", "deck", "format", "html", "imageFormat", "title", "width", "height"], "desktop artifact export input");
  if (!DESKTOP_EXPORT_ARTIFACT_FORMATS.includes(value.format as DesktopExportArtifactFormat)) {
    throw new Error(`unsupported artifact export format: ${String(value.format)}`);
  }
  if (value.imageFormat != null && !DESKTOP_EXPORT_ARTIFACT_IMAGE_FORMATS.includes(value.imageFormat as DesktopExportArtifactImageFormat)) {
    throw new Error(`unsupported artifact export image format: ${String(value.imageFormat)}`);
  }
  return {
    ...(value.baseHref == null ? {} : { baseHref: normalizeNonEmptyString(value.baseHref, "desktop artifact export baseHref") }),
    deck: normalizeBoolean(value.deck, "desktop artifact export deck"),
    format: value.format as DesktopExportArtifactFormat,
    html: normalizeNonEmptyString(value.html, "desktop artifact export html"),
    ...(value.imageFormat == null ? {} : { imageFormat: value.imageFormat as DesktopExportArtifactImageFormat }),
    title: normalizeNonEmptyString(value.title, "desktop artifact export title"),
    ...(value.width == null ? {} : { width: normalizeOptionalPositiveNumber(value.width, "desktop artifact export width")! }),
    ...(value.height == null ? {} : { height: normalizeOptionalPositiveNumber(value.height, "desktop artifact export height")! }),
  };
}
