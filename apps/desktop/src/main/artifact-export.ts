import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { BrowserWindow } from "electron";
import {
  DESKTOP_ARTIFACT_CAPTURE_ERROR_CODES,
  DESKTOP_ARTIFACT_CAPTURE_MODES,
  type DesktopArtifactCaptureMode,
  type DesktopExportArtifactInput,
  type DesktopExportArtifactResult,
} from "@open-design/sidecar-proto";

import { DECK_PAGE_SIZE, DECK_PRINT_CSS, inferPageSize, waitForPrintableContent } from "./pdf-export.js";
import { bgraBitmapHasPaint, freezePageForStaticCapture, type StaticCaptureFreeze } from "./static-capture.js";
import { findRealElementRange, findRealTagEnd, findRealTagOffset, HTML_TAG_PATTERNS } from '@open-design/contracts/runtime/html-injection-points';

// Headless programmatic exporter for the `od export` CLI (PDF / image).
// The on-screen web Download menu rasterizes client-side; this is the daemon →
// Electron path so the CLI gets the desktop's bundled Chromium for pixel-perfect
// output without a print dialog. Renders into an off-screen BrowserWindow, writes
// the result to a temp file, and returns its path; the daemon streams those bytes
// to the HTTP caller and removes the temp file.
//
// The same renderer also produces the chat card's static cover — see
// `first_viewport_thumbnail` below, which is the SAME Electron shell with the
// page-growing step removed.

const MAX_IMAGE_EXPORT_HEIGHT_PX = 20_000;

/**
 * Logical viewport a first-viewport thumbnail is rendered at when the caller
 * does not name one. A desktop-shaped 16:10 frame: wide enough that a page
 * authored for a laptop lays out the way its author saw it, and short enough
 * that the cover is genuinely "the first screen".
 */
export const THUMBNAIL_VIEWPORT = Object.freeze({ height: 900, width: 1440 });

/**
 * Resource budget for a thumbnail. A cover is worth a few seconds, never the
 * 15s an explicit export gets — the user is waiting on a chat turn, not on a
 * download they asked for.
 */
export const THUMBNAIL_RESOURCE_BUDGET_MS = 5_000;

/**
 * Wall-clock ceiling for the whole thumbnail render (resource wait, freeze,
 * capture, blank retries). Whatever is on screen when this expires is what gets
 * captured; if nothing is, the caller is told so rather than handed a blank.
 */
export const THUMBNAIL_RENDER_BUDGET_MS = 8_000;

/**
 * Chromium occasionally returns a fully transparent frame before the compositor
 * has produced one. Two retries is what the deck path settled on; a third has
 * never been observed to help and only spends budget.
 */
export const THUMBNAIL_BLANK_RETRY_LIMIT = 2;

function captureModeOf(input: DesktopExportArtifactInput): DesktopArtifactCaptureMode {
  return input.captureMode ?? DESKTOP_ARTIFACT_CAPTURE_MODES.FULL_PAGE_EXPORT;
}

export async function exportArtifact(
  input: DesktopExportArtifactInput,
): Promise<DesktopExportArtifactResult> {
  const captureMode = captureModeOf(input);
  const thumbnail = captureMode === DESKTOP_ARTIFACT_CAPTURE_MODES.FIRST_VIEWPORT_THUMBNAIL;
  if (thumbnail && input.format !== "image") {
    // Refused before a window is opened: there is no first viewport in a
    // paginated PDF, so there is nothing to render.
    return {
      code: DESKTOP_ARTIFACT_CAPTURE_ERROR_CODES.UNSUPPORTED_CAPTURE_MODE,
      error: `${DESKTOP_ARTIFACT_CAPTURE_MODES.FIRST_VIEWPORT_THUMBNAIL} requires format "image", not "${input.format}"`,
      ok: false,
    };
  }

  const width = input.width ?? (thumbnail ? THUMBNAIL_VIEWPORT.width : input.deck ? 1920 : 1440);
  const height = input.height ?? (thumbnail ? THUMBNAIL_VIEWPORT.height : input.deck ? 1080 : 900);

  const window = new BrowserWindow({
    height,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    width,
  });

  try {
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildDocument(input))}`);

    if (thumbnail) return await renderFirstViewportThumbnail(window, input, { height, width });

    await waitForPrintableContent(window);
    if (input.format === "pdf") return await renderPdf(window, input);
    return await renderImage(window, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

type Viewport = { height: number; width: number };

/**
 * The chat card's static cover.
 *
 * Deliberately the SHORT path: no `scrollHeight` probe, no `setContentSize` to
 * the document height, no per-viewport prewarm scroll, no stitching. Cost is a
 * function of how long the first screen takes to settle, not of how long the
 * document is — which is the whole reason this mode exists as its own branch
 * rather than as a flag threaded through {@link renderImage}.
 */
async function renderFirstViewportThumbnail(
  window: BrowserWindow,
  input: DesktopExportArtifactInput,
  viewport: Viewport,
): Promise<DesktopExportArtifactResult> {
  const startedAt = Date.now();
  const remainingMs = () => Math.max(0, THUMBNAIL_RENDER_BUDGET_MS - (Date.now() - startedAt));
  let freeze: StaticCaptureFreeze | null = null;
  let attempts = 0;
  try {
    // Fixed, not derived: pinning the content box makes the capture rect below
    // mean the same thing on every platform, where the constructor's
    // width/height include the window frame.
    window.setContentSize(viewport.width, viewport.height);

    await waitForPrintableContent(window, {
      budgetMs: Math.max(1, Math.min(THUMBNAIL_RESOURCE_BUDGET_MS, remainingMs())),
      // Only the first screen is in the shot, and nothing below the fold is
      // even fetched (the page is never scrolled), so waiting on it would only
      // burn the budget.
      firstViewportOnly: true,
    });
    freeze = await freezePageForStaticCapture(window);

    const rect = { height: viewport.height, width: viewport.width, x: 0, y: 0 };
    for (let attempt = 0; attempt <= THUMBNAIL_BLANK_RETRY_LIMIT; attempt += 1) {
      attempts = attempt + 1;
      const image = await window.webContents.capturePage(rect);
      if (bgraBitmapHasPaint(image.toBitmap())) {
        return logThumbnail(await encodeCapture(image, input), {
          attempts,
          freeze,
          startedAt,
          viewport,
        });
      }
      if (attempt === THUMBNAIL_BLANK_RETRY_LIMIT) break;
      if (remainingMs() <= 0) {
        return logThumbnail(
          {
            code: DESKTOP_ARTIFACT_CAPTURE_ERROR_CODES.RENDER_TIMEOUT,
            error: `first-viewport thumbnail ran out of its ${THUMBNAIL_RENDER_BUDGET_MS}ms render budget with nothing painted`,
            ok: false,
          },
          { attempts, freeze, startedAt, viewport },
        );
      }
      await settleFrame(window);
    }

    // Honest miss. The web card falls back to a live iframe when there is no
    // snapshot, so reporting the failure is strictly better than shipping a
    // transparent PNG that would look like a broken artifact forever.
    return logThumbnail(
      {
        code: DESKTOP_ARTIFACT_CAPTURE_ERROR_CODES.BLANK_CAPTURE,
        error: `first-viewport thumbnail came back transparent after ${THUMBNAIL_BLANK_RETRY_LIMIT + 1} attempts`,
        ok: false,
      },
      { attempts, freeze, startedAt, viewport },
    );
  } finally {
    freeze?.release();
  }
}

/** One paint cycle, bounded, so a wedged renderer cannot stall a retry. */
async function settleFrame(window: BrowserWindow): Promise<void> {
  try {
    await window.webContents.executeJavaScript(
      `new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(function(){resolve(true)})})})`,
      true,
    );
  } catch {
    // A renderer that will not schedule a frame is exactly the case the blank
    // guard above is there to catch; nothing to do here.
  }
}

/**
 * One line per cover, mirroring the `[od-export] render` line the deck path
 * emits. This is how the "does a synchronous capture cost the chat turn
 * anything?" question stays answerable from a real desktop log instead of
 * needing new instrumentation later.
 */
function logThumbnail(
  result: DesktopExportArtifactResult,
  context: { attempts: number; freeze: StaticCaptureFreeze | null; startedAt: number; viewport: Viewport },
): DesktopExportArtifactResult {
  // eslint-disable-next-line no-console
  console.info("[od-export] thumbnail", {
    attempts: context.attempts,
    bytes: result.bytes ?? 0,
    code: result.code ?? null,
    finishedAnimations: context.freeze?.finished ?? 0,
    ok: result.ok,
    pausedAnimations: context.freeze?.paused ?? 0,
    reducedMotion: context.freeze?.reducedMotionEmulated ?? false,
    totalMs: Date.now() - context.startedAt,
    viewport: `${context.viewport.width}x${context.viewport.height}`,
  });
  return result;
}

async function renderPdf(
  window: BrowserWindow,
  input: DesktopExportArtifactInput,
): Promise<DesktopExportArtifactResult> {
  const pageSize = input.deck ? DECK_PAGE_SIZE : await inferPageSize(window);
  const pdf = await window.webContents.printToPDF({
    margins: { bottom: 0, left: 0, right: 0, top: 0 },
    pageSize,
    preferCSSPageSize: true,
    printBackground: true,
  });
  const filePath = await writeTemp("pdf", Buffer.from(pdf));
  return { bytes: pdf.length, mime: "application/pdf", ok: true, path: filePath };
}

async function renderImage(
  window: BrowserWindow,
  input: DesktopExportArtifactInput,
): Promise<DesktopExportArtifactResult> {
  // For a non-deck page, grow the window to the content height so capturePage
  // grabs the full scrollable page rather than just the first viewport.
  if (!input.deck) {
    const contentHeight = (await window.webContents.executeJavaScript(
      `Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)`,
      true,
    )) as number;
    if (Number.isFinite(contentHeight) && contentHeight > 0) {
      if (contentHeight > MAX_IMAGE_EXPORT_HEIGHT_PX) {
        throw new Error(
          `Image export height exceeds supported image export limit (${Math.ceil(contentHeight)}px > ${MAX_IMAGE_EXPORT_HEIGHT_PX}px).`,
        );
      }
      const [w] = window.getContentSize();
      window.setContentSize(w, Math.ceil(contentHeight));
      await waitForPrintableContent(window);
    }
  }
  return await encodeCapture(await window.webContents.capturePage(), input);
}

type CapturedImage = { toJPEG: (quality: number) => Buffer; toPNG: () => Buffer };

async function encodeCapture(
  image: CapturedImage,
  input: DesktopExportArtifactInput,
): Promise<DesktopExportArtifactResult> {
  // Only PNG and JPEG reach this point: the export contract and the sidecar
  // proto validator both reject any other image format (notably WebP) up front,
  // because Electron's nativeImage encoder supports only these two. Never
  // silently downgrade an unsupported format to PNG here.
  if (input.imageFormat === "jpeg") {
    const buf = image.toJPEG(92);
    return { bytes: buf.length, mime: "image/jpeg", ok: true, path: await writeTemp("jpg", buf) };
  }
  const buf = image.toPNG();
  return { bytes: buf.length, mime: "image/png", ok: true, path: await writeTemp("png", buf) };
}

function buildDocument(input: DesktopExportArtifactInput): string {
  let doc = injectBaseHref(input.html, input.baseHref);
  doc = injectTitle(doc, input.title);
  if (input.deck && input.format === "pdf") doc = injectStyle(doc, DECK_PRINT_CSS);
  return doc;
}

function injectBaseHref(doc: string, baseHref: string | undefined): string {
  if (!baseHref) return doc;
  const tag = `<base href="${escapeAttr(baseHref)}">`;
  // Structural lookup: a `<head>` an author wrote into a script string or an
  // attribute is not this document's head (nexu-io/open-design#7410).
  const headEnd = findRealTagEnd(doc, HTML_TAG_PATTERNS.headOpen);
  if (headEnd >= 0) return doc.slice(0, headEnd) + tag + doc.slice(headEnd);
  const htmlEnd = findRealTagEnd(doc, HTML_TAG_PATTERNS.htmlOpen);
  if (htmlEnd >= 0) return `${doc.slice(0, htmlEnd)}<head>${tag}</head>${doc.slice(htmlEnd)}`;
  return `<!doctype html><html><head>${tag}</head><body>${doc}</body></html>`;
}

function injectTitle(doc: string, title: string): string {
  const tag = `<title>${escapeText(title)}</title>`;
  // Function replacement: a string replacement would expand `$$`, `$&`, `$``,
  // and `$'` inside the (user-derived) title via String.prototype.replace's
  // GetSubstitution, corrupting titles that contain them (#6795).
  // The document's own <title>, not one an author stored in a script string:
  // replacing that would rewrite their content (nexu-io/open-design#7410).
  const existing = findRealElementRange(doc, HTML_TAG_PATTERNS.titleOpen, 'title');
  if (existing) return doc.slice(0, existing.start) + tag + doc.slice(existing.end);
  const headEnd2 = findRealTagEnd(doc, HTML_TAG_PATTERNS.headOpen);
  if (headEnd2 >= 0) return doc.slice(0, headEnd2) + tag + doc.slice(headEnd2);
  return doc;
}

function injectStyle(doc: string, css: string): string {
  const tag = `<style data-od-artifact-export>${css}</style>`;
  const headClose = findRealTagOffset(doc, HTML_TAG_PATTERNS.headClose);
  if (headClose >= 0) return doc.slice(0, headClose) + tag + doc.slice(headClose);
  const headEnd = findRealTagEnd(doc, HTML_TAG_PATTERNS.headOpen);
  if (headEnd >= 0) return doc.slice(0, headEnd) + tag + doc.slice(headEnd);
  return `${tag}${doc}`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function writeTemp(extension: string, data: Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "od-export-"));
  const filePath = path.join(dir, `artifact.${extension}`);
  await writeFile(filePath, data);
  return filePath;
}
