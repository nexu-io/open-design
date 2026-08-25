import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

import { BrowserWindow, nativeImage } from "electron";
import type { DesktopRenderSlidesInput, DesktopRenderSlidesResult } from "@open-design/sidecar-proto";

import { waitForPrintableContent } from "./pdf-export.js";

// Vendored dom-to-pptx browser UMD (apps/desktop/vendor/dom-to-pptx). Loaded
// once and injected into the render window for editable PPTX export. The packaged
// app ships it via electron-builder `extraResources` next to the app under
// Resources/ (`process.resourcesPath`); dev resolves it from apps/desktop/vendor.
let cachedDomToPptxBundle: string | null = null;
const gunzipAsync = promisify(gunzip);

async function loadDomToPptxBundle(): Promise<string> {
  if (cachedDomToPptxBundle != null) return cachedDomToPptxBundle;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    ...(resourcesPath
      ? [
          path.join(resourcesPath, "dom-to-pptx.bundle.js.gz"),
          path.join(resourcesPath, "dom-to-pptx.bundle.js"),
        ]
      : []),
    path.resolve(here, "../../vendor/dom-to-pptx/dom-to-pptx.bundle.js.gz"),
    path.resolve(here, "../../vendor/dom-to-pptx/dom-to-pptx.bundle.js"),
    path.resolve(here, "../../../vendor/dom-to-pptx/dom-to-pptx.bundle.js.gz"),
    path.resolve(here, "../../../vendor/dom-to-pptx/dom-to-pptx.bundle.js"),
    path.resolve(here, "dom-to-pptx.bundle.js.gz"),
    path.resolve(here, "dom-to-pptx.bundle.js"),
  ];
  for (const candidate of candidates) {
    try {
      cachedDomToPptxBundle = await readDomToPptxBundleFile(candidate);
      return cachedDomToPptxBundle;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("dom-to-pptx vendor bundle not found");
}

export async function readDomToPptxBundleFile(candidate: string): Promise<string> {
  const bytes = await readFile(candidate);
  if (candidate.endsWith(".gz")) return (await gunzipAsync(bytes)).toString("utf8");
  return bytes.toString("utf8");
}

type FontStylesheetFetcher = (
  url: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const GOOGLE_FONT_STYLESHEET_TIMEOUT_MS = 10_000;

export async function fetchGoogleFontStylesheets(
  urls: string[],
  fetcher: FontStylesheetFetcher = fetch,
): Promise<Array<{ cssText: string; url: string }>> {
  const stylesheets: Array<{ cssText: string; url: string }> = [];
  for (const url of urls) {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (new URL(url).hostname !== "fonts.googleapis.com") continue;
      // A generic UA makes Google Fonts return complete TTF faces. Chromium's
      // WOFF2 subsets are less reliable in the vendored PowerPoint converter.
      const stylesheet = await Promise.race([
        (async () => {
          const response = await fetcher(url, {
            headers: { "user-agent": "Mozilla/5.0" },
            signal: controller.signal,
          });
          if (!response.ok) return null;
          return { cssText: await response.text(), url };
        })(),
        new Promise<null>((resolve) => {
          timeout = setTimeout(() => {
            controller.abort();
            resolve(null);
          }, GOOGLE_FONT_STYLESHEET_TIMEOUT_MS);
        }),
      ]);
      if (stylesheet) stylesheets.push(stylesheet);
    } catch {
      // The renderer-side fetch remains the fallback when prefetching fails.
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }
  return stylesheets;
}

// Returns the rendered images either as on-disk files (when the daemon provided
// an `outputDir`) or as base64 data URLs (legacy/fallback). Writing files keeps
// tens of MB of image bytes off the JSON IPC channel — the daemon, which owns
// and created the directory, reads the files back and deletes them. desktop only
// ever writes to the absolute path the daemon handed it.
async function emitImages(
  images: Array<{ buffer: Buffer; jpeg: boolean }>,
  outputDir: string | undefined,
): Promise<Pick<DesktopRenderSlidesResult, "slideFiles" | "slides">> {
  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
    const slideFiles: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i]!;
      const file = path.join(outputDir, `slide-${i}.${img.jpeg ? "jpeg" : "png"}`);
      await writeFile(file, img.buffer);
      slideFiles.push(file);
    }
    return { slideFiles };
  }
  return {
    slides: images.map(
      (img) => `data:image/${img.jpeg ? "jpeg" : "png"};base64,${img.buffer.toString("base64")}`,
    ),
  };
}

// Default deck slide stage when the authored size can't be measured: 1920x1080
// (16:9). We render at the logical size and let Electron's capturePage emit the
// display's native pixel scale (2x on retina => 3840x2160), so the PNGs are at
// least FHD and pixel-perfect to the browser. This reuses the bundled Electron
// Chromium — no second headless engine, so the packaged app does not grow.
const SLIDE_W = 1920;
const SLIDE_H = 1080;
// Bounds for a measured slide size; outside this we fall back to the default to
// avoid a pathological capture (a deck with a broken/zero/huge slide box).
const SLIDE_MIN_PX = 320;
const SLIDE_MAX_PX = 8192;

// Chrome the live deck adds (presenter overlays, the auto-managed progress bar,
// nav hints) must not bleed into a captured slide. Mirrors the print-hide list
// in design-templates/html-ppt/assets/runtime.js, but avoids bare `.notes` and
// `.overview`: those class names are generic enough to be authored content.
export const HIDE_CHROME_SELECTOR =
  ".progress-bar, .notes-overlay, aside.notes, .speaker-notes, .deck-nav, .deck-hint, .deck-counter";

// The slide-surface family, matching the print/export path in pdf-export.ts
// (`.slide, [data-screen-label], .deck-slide, .ppt-slide`) — decks ship under
// several conventions, not just `.slide` (e.g. zhangzara-creative-mode uses
// `<section data-screen-label=...>`). Decks also nest them differently
// (`.deck > .slide`, `.deck-viewport > .deck-stage > .slide`, etc.); presenter-
// mode clones (`.mini-slide .slide`, `.overview .slide`) are filtered out in the
// page rather than via a rigid direct-child selector, which missed nested decks.
const SLIDE_SELECTOR = ".slide, [data-screen-label], .deck-slide, .ppt-slide";
export const DECK_STAGE_SELECTOR = "deck-stage, #deck-stage, .deck-stage";
// JS expression (used inside executeJavaScript) returning the real slides.
const REAL_SLIDES_JS =
  "Array.prototype.slice.call(document.querySelectorAll('.slide, [data-screen-label], .deck-slide, .ppt-slide')).filter(function(el){return !el.closest('.mini-slide, .overview, .notes-overlay, .thumb')})";

/**
 * Renders an HTML deck to one PNG per slide using a hidden Electron window.
 * The window is shown fully transparent and inactive so the GPU compositor
 * paints it (capturePage needs a live frame) without any visible flash or
 * focus theft, then destroyed.
 */
/**
 * How long to wait for the artifact document itself before proceeding with
 * whatever has rendered.
 */
export const ARTIFACT_DOCUMENT_LOAD_TIMEOUT_MS = 15_000;

/**
 * Load the artifact into the offscreen window without letting a single stalled
 * subresource block the whole export.
 *
 * `loadURL()` resolves on `did-finish-load`, which Chromium only fires once
 * EVERY subresource has settled. An image or font URL that answers neither way
 * — the packaged `od://` failure mode — therefore leaves `loadURL()` pending
 * forever, and the export hung here long before reaching the (separately
 * bounded) `waitForPrintableContent` step. Production bore this out: 122 of
 * 142 `DESKTOP_RENDERER_UNAVAILABLE` failures sat at the daemon's 600s IPC
 * ceiling.
 *
 * `dom-ready` is the signal we actually need: the document is parsed and
 * scriptable, which is all the capture pipeline requires — waiting for
 * subresources is `waitForPrintableContent`'s job, and it bounds itself. The
 * listener is attached before `loadURL` so a fast `data:` URL cannot fire it
 * before we are listening.
 *
 * A real load failure still fails: `did-fail-load` reaching us before
 * dom-ready rethrows, so `renderDeckSlides` reports RENDER_FAILED exactly as
 * it did when this was a bare `await window.loadURL(...)`.
 */
type ArtifactLoadOutcome =
  | { readonly kind: "loaded" }
  | { readonly kind: "dom-ready" }
  | { readonly kind: "timeout" }
  | { readonly kind: "failed"; readonly error: unknown };

export async function loadArtifactDocument(window: BrowserWindow, url: string): Promise<void> {
  const domReady = new Promise<ArtifactLoadOutcome>((resolve) => {
    window.webContents.once("dom-ready", () => resolve({ kind: "dom-ready" }));
  });
  // Settle the load into a tagged outcome rather than catching it away. A
  // `did-fail-load` that beats dom-ready is a genuine main-document failure and
  // must still propagate — swallowing it would let the pipeline go on to
  // capture Chromium's error page and report a successful-but-wrong export,
  // which is worse than the hang this function exists to prevent. Attaching
  // handlers here (rather than leaving the promise bare) also means a rejection
  // arriving AFTER dom-ready has already won stays handled instead of surfacing
  // as an unhandled rejection.
  const finished = window.loadURL(url).then<ArtifactLoadOutcome, ArtifactLoadOutcome>(
    () => ({ kind: "loaded" }),
    (error: unknown) => ({ error, kind: "failed" }),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  let outcome: ArtifactLoadOutcome;
  try {
    outcome = await Promise.race([
      finished,
      domReady,
      new Promise<ArtifactLoadOutcome>((resolve) => {
        timer = setTimeout(() => resolve({ kind: "timeout" }), ARTIFACT_DOCUMENT_LOAD_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  if (outcome.kind === "failed") throw outcome.error;
}

export async function renderDeckSlides(
  input: DesktopRenderSlidesInput,
): Promise<DesktopRenderSlidesResult> {
  const window = new BrowserWindow({
    width: SLIDE_W,
    height: SLIDE_H,
    useContentSize: true,
    show: false,
    // The deck is 1920x1080. Without this, macOS clamps a window taller than
    // the work area (laptop displays), so the content viewport comes back
    // shorter than 1080 and slides capture at the wrong aspect ratio.
    enableLargerThanScreen: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());

  // Coarse per-phase timing so a slow export can be diagnosed from the desktop
  // log (load/fonts vs. render/encode) instead of guesswork. One line per export.
  const t0 = Date.now();
  let tLoad = t0;
  let tAssets = t0;
  let tPrepare = t0;
  const finish = (result: DesktopRenderSlidesResult): DesktopRenderSlidesResult => {
    const end = Date.now();
    // eslint-disable-next-line no-console
    console.info("[od-export] render", {
      mode: result.mode,
      slides: (result.slideFiles ?? result.slides ?? []).length,
      out: result.slideFiles ? "file" : "dataurl",
      loadMs: tLoad - t0,
      assetsMs: tAssets - tLoad,
      prepareMs: tPrepare - tAssets,
      renderMs: end - tPrepare,
      totalMs: end - t0,
    });
    return result;
  };

  try {
    const doc = injectBaseHref(input.html, input.baseHref);
    await loadArtifactDocument(window, `data:text/html;charset=utf-8,${encodeURIComponent(doc)}`);
    tLoad = Date.now();
    await waitForPrintableContent(window);
    tAssets = Date.now();
    const requestedStage = requestedRenderSize(input.width, input.height, SLIDE_W, SLIDE_H);
    const requestedPage = requestedRenderSize(input.width, input.height, PAGE_W, PAGE_VIEW_H);

    // Lay out at the default stage first so the slide box can be measured
    // against a stable viewport.
    window.setContentSize(requestedStage.w, requestedStage.h);

    // Paint invisibly: opacity 0 before showInactive => compositor renders the
    // page (so capturePage returns real pixels) with zero on-screen flash.
    window.setOpacity(0);
    window.showInactive();

    // Cheap, NON-mutating slide count first — the deck-only DOM mutations
    // (hiding chrome, freezing animations) must not touch the document until we
    // know this is a deck, or a page-mode export would render on a modified DOM
    // (e.g. content using generic `.notes`/`.overview` classes would vanish).
    const count = (await window.webContents.executeJavaScript(
      `(${countRealSlides.toString()})(${JSON.stringify(SLIDE_SELECTOR)})`,
      true,
    )) as number;
    tPrepare = Date.now();

    // Decide page vs deck. Prefer the caller's explicit `deck` signal: an
    // ordinary page can contain `.slide` markup (carousels, testimonials)
    // without being a deck, so we must NOT treat any `.slide` as proof of a deck.
    // `deck:false` forces full-page capture; otherwise require actual slides.
    const hasSlides = Number.isInteger(count) && count >= 1;
    // The caller explicitly asked for a deck but no slide surfaces were found —
    // fail fast with a clear error instead of silently downgrading to a single
    // full-page capture (which would be the wrong export for PPTX/deck).
    if (input.deck === true && !hasSlides) {
      return finish({
        ok: false,
        error: "no slide surfaces found in this deck",
        errorCode: "NO_SLIDES",
      });
    }
    const wantsDeck = shouldCaptureAsDeck(hasSlides, input.deck);
    if (!wantsDeck) {
      // Page mode: capture the original, unmodified document. `paginate` (set by
      // the PDF path) splits a long page into one image per viewport.
      const pageJpeg = shouldCapturePageAsJpeg(input.pageImageFormat, input.paginate);
      return finish(
        await capturePage(window, pageJpeg, input.outputDir, input.paginate === true, requestedPage),
      );
    }

    // Deck mode only: now apply the deck DOM prep (hide presenter chrome, freeze
    // animations) so each slide reaches its final state for capture.
    await window.webContents.executeJavaScript(
      `(${prepareDeckStage.toString()})(${JSON.stringify(HIDE_CHROME_SELECTOR)}, ${JSON.stringify(DECK_STAGE_SELECTOR)})`,
      true,
    );

    // Measure the deck's authored slide size instead of assuming 16:9 — decks
    // can be 4:3, square, portrait, or any custom canvas. The capture rect, the
    // pinned stage, and (downstream) the PPTX layout all follow this so a non-16:9
    // deck is not clipped or distorted. Falls back to 1920x1080 if unmeasurable.
    const stage = input.width != null || input.height != null
      ? requestedStage
      : await measureSlideStage(window);
    window.setContentSize(stage.w, stage.h);
    await nextFrames(window);

    // Pin the stage to the measured slide size.
    await window.webContents.executeJavaScript(
      `(${pinDeckStage.toString()})(${stage.w}, ${stage.h}, ${JSON.stringify(DECK_STAGE_SELECTOR)})`,
      true,
    );

    // Editable PPTX: hand the live, laid-out slides to the vendored dom-to-pptx
    // engine (native shapes/text) instead of capturing images.
    if (input.editable) {
      return finish(await renderEditablePptx(window, stage, input.outputDir));
    }

    // Deck slides default to PNG (crisp text, no JPEG artifacts). The CLI image
    // route can explicitly request JPEG via pageImageFormat; PPTX/PDF leave it
    // unset and keep PNG.
    const jpeg = input.pageImageFormat === "jpeg";

    // Capture each slide via CDP `Page.captureScreenshot` when the debugger can
    // attach. Unlike `capturePage()` (which grabs the last COMPOSITED frame and
    // can hand back the previous slide's frame when the new one hasn't composited
    // yet — the duplicate-page race), CDP renders the CURRENT DOM to a fresh
    // frame, so the captured pixels always match the slide we just showed. No
    // pixel-compare / retry needed. Animations + transitions are already frozen
    // (prepareDeckStage), so each slide is captured at its final state — never a
    // mid page-turn frame. Falls back to capturePage if the debugger is busy.
    const deckDbg = window.webContents.debugger;
    let deckDbgAttached = false;
    try {
      deckDbg.attach("1.3");
      deckDbgAttached = true;
      await deckDbg.sendCommand("Page.enable");
    } catch {
      // already attached / unavailable — captureDeckSlide falls back to capturePage
    }
    const dbg = deckDbgAttached ? deckDbg : null;
    try {
      // Image export of a deck wants every slide stitched top-to-bottom into one
      // tall image (the "whole deck as one picture").
      if (input.stitch) {
        return finish(await stitchDeckSlides(window, dbg, count, stage, jpeg, input.outputDir));
      }

      // Otherwise render every slide, or just the one requested by image export.
      // A specified-but-out-of-range index is a caller error — fail fast instead
      // of silently falling back to slide 0 (which the daemon would return with
      // 200 for image export).
      if (input.index != null && (input.index < 0 || input.index >= count)) {
        return finish({
          ok: false,
          error: `slide index ${input.index} is out of range (deck has ${count} slide(s))`,
          errorCode: "SLIDE_INDEX_OUT_OF_RANGE",
        });
      }
      const indices = input.index != null ? [input.index] : range(count);
      const images: Array<{ buffer: Buffer; jpeg: boolean }> = [];
      let width = stage.w;
      let height = stage.h;
      for (const i of indices) {
        const image = await captureDeckSlide(window, dbg, i, stage);
        const size = image.getSize();
        width = size.width;
        height = size.height;
        images.push({ buffer: jpeg ? image.toJPEG(82) : image.toPNG(), jpeg });
      }
      return finish({ ok: true, ...(await emitImages(images, input.outputDir)), width, height, mode: "deck" });
    } finally {
      if (deckDbgAttached) {
        try {
          deckDbg.detach();
        } catch {
          // ignore
        }
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: "RENDER_FAILED",
    };
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

// The measured (or fallback) logical slide stage in DIP.
interface Stage {
  w: number;
  h: number;
}

export function requestedRenderSize(
  width: number | undefined,
  height: number | undefined,
  fallbackW: number,
  fallbackH: number,
): Stage {
  return {
    w: width != null && Number.isFinite(width) && width > 0 ? Math.round(width) : fallbackW,
    h: height != null && Number.isFinite(height) && height > 0 ? Math.round(height) : fallbackH,
  };
}

// Measures the deck's authored slide box so the capture/PPTX follow the real
// aspect ratio instead of assuming 16:9. Prefers untransformed deck-stage and
// declared element dimensions, falling back to a rendered rect only when the
// authored box cannot be inferred. Clamps to a sane range and falls back to
// 1920x1080.
async function measureSlideStage(window: BrowserWindow): Promise<Stage> {
  try {
    const measured = (await window.webContents.executeJavaScript(
      `(${measureSlide.toString()})(${JSON.stringify(SLIDE_SELECTOR)}, ${JSON.stringify(DECK_STAGE_SELECTOR)})`,
      true,
    )) as { w: number; h: number } | null;
    if (
      measured &&
      Number.isFinite(measured.w) &&
      Number.isFinite(measured.h) &&
      measured.w >= SLIDE_MIN_PX &&
      measured.w <= SLIDE_MAX_PX &&
      measured.h >= SLIDE_MIN_PX &&
      measured.h <= SLIDE_MAX_PX
    ) {
      return { w: Math.round(measured.w), h: Math.round(measured.h) };
    }
  } catch {
    // fall through to the default stage
  }
  return { w: SLIDE_W, h: SLIDE_H };
}

// Shows exactly slide `i` and lets the style change settle for two frames. The
// style toggle AND the two-frame settle happen in ONE executeJavaScript round
// trip (showSlide returns the settle Promise, which executeJavaScript awaits) —
// halving the main<->renderer hops per slide vs. a separate settle call, which
// matters for long decks where the loop dominates.
async function showDeckSlide(window: BrowserWindow, i: number, stage: Stage): Promise<void> {
  const rect = (await window.webContents.executeJavaScript(
    `(() => { const restoreActiveSlideCapture = ${restoreActiveSlideCapture.toString()}; return (${showSlide.toString()})(${JSON.stringify(SLIDE_SELECTOR)}, ${i}); })()`,
    true,
  )) as { x: number; y: number; w: number; h: number } | null;
  // If the active slide did not land in the top-left capture viewport (a
  // translated carousel strip leaves it off-screen), restack it into place and
  // settle again before the caller captures.
  const onStage =
    rect != null &&
    Math.abs(rect.x) <= 2 &&
    Math.abs(rect.y) <= 2 &&
    rect.w >= stage.w * 0.5 &&
    rect.h >= stage.h * 0.5;
  if (!onStage) {
    await window.webContents.executeJavaScript(
      `(() => { const activeSlideCaptureOffsetTransform = ${activeSlideCaptureOffsetTransform.toString()}; const restoreActiveSlideCapture = ${restoreActiveSlideCapture.toString()}; return (${restackActiveSlide.toString()})(${JSON.stringify(SLIDE_SELECTOR)}, ${i}, ${stage.w}, ${stage.h}); })()`,
      true,
    );
    await nextFrames(window);
  }
}

// Editable PPTX: every real slide is laid out at once, then handed to the
// vendored dom-to-pptx engine, which walks each slide's DOM and emits native
// PowerPoint shapes/text (not images). Returns one .pptx written to outputDir.
async function renderEditablePptx(
  window: BrowserWindow,
  stage: Stage,
  outputDir: string | undefined,
): Promise<DesktopRenderSlidesResult> {
  // dom-to-pptx measures each element's live layout, so all slides must be
  // simultaneously laid out (decks normally show only the active one).
  await window.webContents.executeJavaScript(
    `(${showAllSlides.toString()})(${JSON.stringify(SLIDE_SELECTOR)})`,
    true,
  );
  await nextFrames(window);
  const importedStylesheetUrls = (await window.webContents.executeJavaScript(
    `(${collectImportedStylesheetUrls.toString()})()`,
    true,
  )) as string[];
  const importedStylesheetOverrides = await fetchGoogleFontStylesheets(importedStylesheetUrls);
  await window.webContents.executeJavaScript(await loadDomToPptxBundle(), true);
  const prepared = (await window.webContents.executeJavaScript(
    `(() => { const cjkPromotedFontFamily = ${cjkPromotedFontFamily.toString()}; return (${runDomToPptx.toString()})(${JSON.stringify(SLIDE_SELECTOR)}, {}, "prepare", ${JSON.stringify(importedStylesheetOverrides)}); })()`,
    true,
  )) as { error?: string; prepared?: boolean };
  if (!prepared?.prepared || prepared.error) {
    return {
      ok: false,
      error: prepared?.error || "editable PPTX export DOM normalization failed",
      errorCode: "RENDER_FAILED",
    };
  }
  await nextFrames(window);
  const layeredBackgrounds = await captureEditablePptxLayeredBackgrounds(window);
  // runDomToPptx calls cjkPromotedFontFamily by name; define it in the same scope
  // as the serialized body so the reference resolves inside the render window.
  const out = (await window.webContents.executeJavaScript(
    `(() => { const cjkPromotedFontFamily = ${cjkPromotedFontFamily.toString()}; return (${runDomToPptx.toString()})(${JSON.stringify(SLIDE_SELECTOR)}, ${JSON.stringify(layeredBackgrounds)}, "export-prepared", ${JSON.stringify(importedStylesheetOverrides)}); })()`,
    true,
  )) as { b64?: string; error?: string };
  if (!out || out.error || !out.b64) {
    return {
      ok: false,
      error: out?.error || "editable PPTX export produced no output",
      errorCode: "RENDER_FAILED",
    };
  }
  const buffer = Buffer.from(out.b64, "base64");
  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
    const file = path.join(outputDir, "deck.pptx");
    await writeFile(file, buffer);
    return { ok: true, pptxFile: file, width: stage.w, height: stage.h, mode: "deck" };
  }
  const mime = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return { ok: true, slides: [`data:${mime};base64,${out.b64}`], width: stage.w, height: stage.h, mode: "deck" };
}

export type LayeredPptxBackgroundCapture = {
  dataUrl: string;
  height: number;
  left: number;
  slideIndex: number;
  top: number;
  width: number;
};

type LayeredPptxBackgroundTarget = { id: string };
type LayeredPptxBackgroundGeometry = Omit<LayeredPptxBackgroundCapture, "dataUrl"> & {
  pageX: number;
  pageY: number;
};

export function collectLayeredPptxBackgroundTargets(slideSelector: string): LayeredPptxBackgroundTarget[] {
  function splitLayers(input: string): string[] {
    const layers: string[] = [];
    let current = "";
    let depth = 0;
    let quote = "";
    let escaped = false;
    for (const char of input) {
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }
      if (char === "\\") {
        current += char;
        escaped = true;
        continue;
      }
      if (quote) {
        current += char;
        if (char === quote) quote = "";
        continue;
      }
      if (char === '"' || char === "'") {
        current += char;
        quote = char;
        continue;
      }
      if (char === "(") depth += 1;
      else if (char === ")") depth = Math.max(0, depth - 1);
      if (char === "," && depth === 0) {
        if (current.trim()) layers.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    if (current.trim()) layers.push(current.trim());
    return layers;
  }

  function isSupportedLayeredGradient(input: string): boolean {
    const layers = splitLayers(input);
    if (layers.length < 2) return false;
    const supportedGradient =
      /^(?:(?:-(?:moz|ms|o|webkit)-)?(?:linear|radial)-gradient|-webkit-gradient)\(/i;
    return layers.every((layer) => supportedGradient.test(layer));
  }

  function hasTextClip(style: CSSStyleDeclaration): boolean {
    return [style.backgroundClip, style.webkitBackgroundClip]
      .flatMap((value) => splitLayers(value || ""))
      .some((value) => value.toLowerCase() === "text");
  }

  function hasNonNormalBlendMode(style: CSSStyleDeclaration): boolean {
    const mode = (style.mixBlendMode || "normal").trim().toLowerCase();
    return mode !== "" && mode !== "normal";
  }

  function hasBackdropFilter(style: CSSStyleDeclaration): boolean {
    const value = (
      style.backdropFilter ||
      style.getPropertyValue?.("backdrop-filter") ||
      style.getPropertyValue?.("-webkit-backdrop-filter") ||
      "none"
    ).trim().toLowerCase();
    return value !== "" && value !== "none";
  }

  function dependsOnBackdrop(style: CSSStyleDeclaration): boolean {
    return hasNonNormalBlendMode(style) || hasBackdropFilter(style);
  }

  function hasNonNormalBackgroundBlendMode(style: CSSStyleDeclaration): boolean {
    return (style.backgroundBlendMode || "normal")
      .split(",")
      .some((mode) => mode.trim().toLowerCase() !== "normal");
  }

  function hasCssMask(style: CSSStyleDeclaration): boolean {
    const images = [
      style.maskImage || style.getPropertyValue("mask-image"),
      style.webkitMaskImage || style.getPropertyValue("-webkit-mask-image"),
    ];
    return images.some((image) => image && image.trim().toLowerCase() !== "none");
  }

  function hasCssClipPath(style: CSSStyleDeclaration): boolean {
    const value = (
      style.clipPath ||
      style.getPropertyValue?.("clip-path") ||
      style.getPropertyValue?.("-webkit-clip-path") ||
      "none"
    ).trim().toLowerCase();
    return value !== "" && value !== "none";
  }

  function copyComputedMaskStyles(background: HTMLElement, style: CSSStyleDeclaration): void {
    for (let index = 0; index < style.length; index += 1) {
      const property = style.item(index);
      if (!property.startsWith("mask-") && !property.startsWith("-webkit-mask-")) continue;
      const value = style.getPropertyValue(property);
      if (value) background.style.setProperty(property, value, "important");
    }
  }

  function hasUnsupportedPseudoSelfEffect(style: CSSStyleDeclaration): boolean {
    const opacity = Number.parseFloat(style.opacity || "1");
    const hasOpacity = Number.isFinite(opacity) && opacity > 0 && opacity < 1;
    return hasOpacity || hasCssClipPath(style) || hasUnsupportedNativeAncestorEffect(style);
  }

  function materializeLayeredPseudoBackground(
    element: HTMLElement,
    pseudo: "::before" | "::after",
  ): HTMLElement | null {
    const style = getComputedStyle(element, pseudo);
    const rawContent = (style.content || "").trim();
    const content = rawContent.toLowerCase();
    const isGenerated = content !== "" && content !== "none" && content !== "normal" && style.display !== "none";
    const materializeEntirePseudo =
      hasTextClip(style) || hasCssMask(style) || hasUnsupportedPseudoSelfEffect(style);
    if (
      !isGenerated ||
      (style.position !== "absolute" && style.position !== "fixed") ||
      !isSupportedLayeredGradient(style.backgroundImage || "") ||
      (!materializeEntirePseudo && !hasNonNormalBackgroundBlendMode(style))
    ) {
      return null;
    }

    // Materialize pseudo backgrounds whose compositing is not faithfully
    // represented by the html2canvas fallback. Chromium retains internal
    // background blending, and backdrop-dependent pseudos additionally mark
    // the authored backdrop for flattening into the same PNG.
    const background = document.createElement("od-pptx-layered-background");
    background.setAttribute("data-od-pptx-materialized-pseudo", pseudo);
    if (materializeEntirePseudo) {
      background.setAttribute("data-od-pptx-materialized-entire-pseudo", "true");
      element.setAttribute(
        pseudo === "::before" ? "data-od-pptx-suppress-before" : "data-od-pptx-suppress-after",
        "true",
      );
    }
    if (dependsOnBackdrop(style)) {
      background.setAttribute("data-od-pptx-flatten-blend-backdrop", "true");
    }
    background.setAttribute("aria-hidden", "true");
    background.style.setProperty("position", style.position, "important");
    background.style.setProperty("top", style.top || "auto", "important");
    background.style.setProperty("right", style.right || "auto", "important");
    background.style.setProperty("bottom", style.bottom || "auto", "important");
    background.style.setProperty("left", style.left || "auto", "important");
    background.style.setProperty("width", style.width || "auto", "important");
    background.style.setProperty("height", style.height || "auto", "important");
    background.style.setProperty("box-sizing", "border-box", "important");
    background.style.setProperty(
      "padding",
      `${style.paddingTop || "0px"} ${style.paddingRight || "0px"} ${style.paddingBottom || "0px"} ${style.paddingLeft || "0px"}`,
      "important",
    );
    background.style.setProperty(
      "border-width",
      `${style.borderTopWidth || "0px"} ${style.borderRightWidth || "0px"} ${style.borderBottomWidth || "0px"} ${style.borderLeftWidth || "0px"}`,
      "important",
    );
    background.style.setProperty("border-style", "solid", "important");
    background.style.setProperty("border-color", "transparent", "important");
    background.style.setProperty("border-radius", style.borderRadius || "0px", "important");
    background.style.setProperty("box-shadow", style.boxShadow || "none", "important");
    background.style.setProperty("background-color", style.backgroundColor, "important");
    background.style.setProperty("background-image", style.backgroundImage, "important");
    background.style.setProperty("background-position", style.backgroundPosition, "important");
    background.style.setProperty("background-size", style.backgroundSize, "important");
    background.style.setProperty("background-repeat", style.backgroundRepeat, "important");
    background.style.setProperty("background-origin", style.backgroundOrigin, "important");
    background.style.setProperty("background-clip", style.backgroundClip, "important");
    background.style.setProperty("background-blend-mode", style.backgroundBlendMode || "normal", "important");
    background.style.setProperty("clip-path", style.clipPath || "none", "important");
    copyComputedMaskStyles(background, style);
    background.style.setProperty("filter", style.filter || "none", "important");
    const backdropFilter =
      style.backdropFilter ||
      style.getPropertyValue?.("backdrop-filter") ||
      style.getPropertyValue?.("-webkit-backdrop-filter") ||
      "none";
    background.style.setProperty("backdrop-filter", backdropFilter, "important");
    background.style.setProperty("-webkit-backdrop-filter", backdropFilter, "important");
    background.style.setProperty("opacity", style.opacity || "1", "important");
    background.style.setProperty("mix-blend-mode", style.mixBlendMode, "important");
    background.style.setProperty("transform", style.transform || "none", "important");
    background.style.setProperty("transform-origin", style.transformOrigin || "50% 50%", "important");
    background.style.setProperty("transform-box", style.transformBox || "view-box", "important");
    background.style.setProperty("translate", style.translate || "none", "important");
    background.style.setProperty("rotate", style.rotate || "none", "important");
    background.style.setProperty("scale", style.scale || "none", "important");
    background.style.setProperty("z-index", style.zIndex || "auto", "important");
    if (materializeEntirePseudo) {
      // Text clipping, masks, and non-serializable self effects apply to the
      // pseudo's complete painted output, including generated text and borders.
      // Copy the computed pseudo style so Chromium rasterizes it as one layer.
      for (let index = 0; index < style.length; index += 1) {
        const property = style.item(index);
        if (property === "content") continue;
        const value = style.getPropertyValue(property);
        if (value) background.style.setProperty(property, value, "important");
      }
      background.textContent = rawContent.replace(/^['"]|['"]$/g, "");
    }
    background.style.setProperty("pointer-events", "none", "important");
    if (pseudo === "::before") element.prepend(background);
    else element.append(background);
    return background;
  }

  function isRenderedInsideSlide(
    element: HTMLElement,
    slide: HTMLElement,
    style: CSSStyleDeclaration,
  ): boolean {
    for (let current: HTMLElement | null = element; current; current = current.parentElement) {
      const currentStyle = current === element ? style : getComputedStyle(current);
      const visibility = currentStyle.visibility.toLowerCase();
      if (
        currentStyle.display === "none" ||
        visibility === "hidden" ||
        visibility === "collapse" ||
        Number.parseFloat(currentStyle.opacity) === 0
      ) {
        return false;
      }
      if (current === slide) break;
    }

    const targetRect = element.getBoundingClientRect();
    if (targetRect.width < 1 || targetRect.height < 1) return false;
    const slideRect = slide.getBoundingClientRect();
    const hasVisualOverflow = style.filter && style.filter !== "none";
    const padding = hasVisualOverflow
      ? Math.min(192, Math.max(64, Math.ceil(Math.max(targetRect.width, targetRect.height) / 4)))
      : 0;
    const width = Math.min(slideRect.right, targetRect.right + padding)
      - Math.max(slideRect.left, targetRect.left - padding);
    const height = Math.min(slideRect.bottom, targetRect.bottom + padding)
      - Math.max(slideRect.top, targetRect.top - padding);
    return width >= 1 && height >= 1;
  }

  function establishesCompositingContext(style: CSSStyleDeclaration): boolean {
    const opacity = Number.parseFloat(style.opacity || "1");
    const hasOpacity = Number.isFinite(opacity) && opacity > 0 && opacity < 1;
    return hasOpacity || hasUnsupportedNativeAncestorEffect(style);
  }

  function hasUnsupportedNativeAncestorEffect(style: CSSStyleDeclaration): boolean {
    const hasFilter = Boolean(style.filter && style.filter !== "none");
    const hasTransform = [style.transform, style.translate, style.rotate, style.scale]
      .some((value) => Boolean(value && value !== "none"));
    return hasFilter || hasTransform || hasCssClipPath(style) || hasCssMask(style) || dependsOnBackdrop(style);
  }

  function compositingAncestors(element: HTMLElement, slide: HTMLElement): HTMLElement[] {
    const ancestors: HTMLElement[] = [];
    let compositingBoundary = 0;
    for (let ancestor = element.parentElement; ancestor && ancestor !== slide; ancestor = ancestor.parentElement) {
      ancestors.push(ancestor);
      if (establishesCompositingContext(getComputedStyle(ancestor))) {
        compositingBoundary = ancestors.length;
      }
    }
    if (element !== slide && hasUnsupportedNativeAncestorEffect(getComputedStyle(slide))) {
      ancestors.push(slide);
      compositingBoundary = ancestors.length;
    }
    // A painted wrapper between the layered target and the outer compositor
    // participates in the same group even when it establishes no compositor
    // of its own. Keep the complete chain through the outermost boundary so
    // its fill is captured and cannot be re-emitted above the replacement PNG.
    return ancestors.slice(0, compositingBoundary);
  }

  const slides = Array.prototype.slice
    .call(document.querySelectorAll(slideSelector))
    .filter((element) => !(element as HTMLElement).closest(".mini-slide, .overview, .notes-overlay, .thumb")) as HTMLElement[];
  const targets: LayeredPptxBackgroundTarget[] = [];
  let nextId = 0;
  for (const slide of slides) {
    const authoredElements = [slide, ...Array.from(slide.querySelectorAll<HTMLElement>("*"))];
    const materializedPseudos = authoredElements.flatMap((element) =>
      (["::before", "::after"] as const)
        .map((pseudo) => materializeLayeredPseudoBackground(element, pseudo))
        .filter((element): element is HTMLElement => element !== null),
    );
    const elements = [...authoredElements, ...materializedPseudos];
    const layeredElements = elements.filter((element) => {
      const style = getComputedStyle(element);
      const capturesLayer = (
        isSupportedLayeredGradient(style.backgroundImage || "") &&
        isRenderedInsideSlide(element, slide, style)
      );
      if (
        capturesLayer &&
        (hasTextClip(style) || hasCssMask(style) || establishesCompositingContext(style)) &&
        !element.hasAttribute("data-od-pptx-materialized-pseudo")
      ) {
        // The native converter cannot reapply text clipping, masks, or
        // compositor effects to a background raster and editable foreground as
        // one CSS paint group. Keep the complete element paint in one Chromium
        // capture instead.
        element.setAttribute("data-od-pptx-capture-entire-element", "true");
        element.setAttribute("data-od-pptx-suppress-before", "true");
        element.setAttribute("data-od-pptx-suppress-after", "true");
      }
      return capturesLayer;
    });
    const captureGroups = new Map<HTMLElement, HTMLElement[]>();
    for (const element of layeredElements) {
      // PPTX has no equivalent of a DOM ancestor compositing group here. When
      // an ancestor effect encloses layered descendants, capture that outermost
      // context once instead of baking the effect into each background image.
      // Every intermediate compositor participates in that same flattened paint
      // and must have its native background cleared after capture as well.
      const ancestors = compositingAncestors(element, slide);
      for (const ancestor of ancestors) {
        if (!hasUnsupportedNativeAncestorEffect(getComputedStyle(ancestor))) continue;
        // dom-to-pptx can inherit ancestor opacity, but it cannot serialize an
        // ancestor filter, transform, blend mode, or backdrop filter onto the
        // editable foreground. Capture and suppress that affected subtree so
        // Chromium applies the unsupported effect exactly once.
        ancestor.setAttribute("data-od-pptx-capture-entire-element", "true");
        ancestor.setAttribute("data-od-pptx-suppress-before", "true");
        ancestor.setAttribute("data-od-pptx-suppress-after", "true");
      }
      const root = ancestors.at(-1) ?? element;
      const members = captureGroups.get(root) ?? [];
      for (const member of [element, ...ancestors]) {
        if (!members.includes(member)) members.push(member);
      }
      captureGroups.set(root, members);
    }

    for (const [element, members] of captureGroups) {
      const style = getComputedStyle(element);
      if (!isRenderedInsideSlide(element, slide, style)) continue;
      const id = `od-pptx-layer-${nextId++}`;
      if (members.some((member) => member !== element)) {
        // The compositor root's own background participates in the same paint
        // group even when it is a solid fill rather than a layered gradient.
        // Capture and clear it with the layered descendants so its later
        // native fill cannot cover the flattened PNG.
        const compositingMembers = members.includes(element) ? members : [element, ...members];
        element.setAttribute("data-od-pptx-compositing-context", "true");
        for (const member of compositingMembers) {
          member.setAttribute("data-od-pptx-compositing-member", id);
        }
      }
      if (dependsOnBackdrop(style) || members.some((member) => dependsOnBackdrop(getComputedStyle(member)))) {
        element.setAttribute("data-od-pptx-flatten-blend-backdrop", "true");
      }
      element.setAttribute("data-od-pptx-layer-capture-id", id);
      targets.push({ id });
    }
  }
  return targets;
}

type LayeredPptxIsolationState = {
  inlineStyles: Array<{ cssText: string; element: HTMLElement }>;
  pseudoBackdropAttributes: Array<{
    after: string | null;
    before: string | null;
    element: HTMLElement;
  }>;
  pseudoStyle: HTMLStyleElement;
};

export function restoreLayeredPptxBackgroundIsolation(): void {
  const state = (window as unknown as { __odPptxLayerIsolation?: LayeredPptxIsolationState })
    .__odPptxLayerIsolation;
  if (!state) return;
  for (const { cssText, element } of state.inlineStyles) element.style.cssText = cssText;
  for (const { after, before, element } of state.pseudoBackdropAttributes) {
    if (before === null) element.removeAttribute("data-od-pptx-blend-backdrop-before");
    else element.setAttribute("data-od-pptx-blend-backdrop-before", before);
    if (after === null) element.removeAttribute("data-od-pptx-blend-backdrop-after");
    else element.setAttribute("data-od-pptx-blend-backdrop-after", after);
  }
  state.pseudoStyle.remove();
  delete (window as unknown as { __odPptxLayerIsolation?: LayeredPptxIsolationState }).__odPptxLayerIsolation;
}

export function isolateLayeredPptxBackground(
  slideSelector: string,
  id: string,
): LayeredPptxBackgroundGeometry | null {
  restoreLayeredPptxBackgroundIsolation();
  const target = document.querySelector<HTMLElement>(`[data-od-pptx-layer-capture-id="${id}"]`);
  if (!target) return null;
  const slides = Array.prototype.slice
    .call(document.querySelectorAll(slideSelector))
    .filter((element) => !(element as HTMLElement).closest(".mini-slide, .overview, .notes-overlay, .thumb")) as HTMLElement[];
  const slideIndex = slides.findIndex((slide) => slide === target || slide.contains(target));
  if (slideIndex < 0) return null;
  const slide = slides[slideIndex]!;
  const targetStyle = getComputedStyle(target);
  const flattenBackdrop = target.getAttribute("data-od-pptx-flatten-blend-backdrop") === "true";
  const flattenCompositingContext = target.getAttribute("data-od-pptx-compositing-context") === "true";
  const materializesEntirePseudo = target.getAttribute("data-od-pptx-materialized-entire-pseudo") === "true";
  const capturesEntireElement = target.getAttribute("data-od-pptx-capture-entire-element") === "true";
  const targetRect = target.getBoundingClientRect();
  const slideRect = slide.getBoundingClientRect();
  const hasVisualOverflow = targetStyle.filter && targetStyle.filter !== "none";
  const padding = hasVisualOverflow ? Math.min(192, Math.max(64, Math.ceil(Math.max(targetRect.width, targetRect.height) / 4))) : 0;
  const left = Math.max(slideRect.left, targetRect.left - padding);
  const top = Math.max(slideRect.top, targetRect.top - padding);
  const right = Math.min(slideRect.right, targetRect.right + padding);
  const bottom = Math.min(slideRect.bottom, targetRect.bottom + padding);
  if (right - left < 1 || bottom - top < 1) return null;

  const allElements = Array.from(document.querySelectorAll<HTMLElement>("*"));
  const inlineStyles = allElements.map((element) => ({ cssText: element.style.cssText, element }));
  const compositingMembers = new Set(
    flattenCompositingContext
      ? Array.from(document.querySelectorAll<HTMLElement>(`[data-od-pptx-compositing-member="${id}"]`))
      : [],
  );
  const backdropDependentMembers = Array.from(compositingMembers).filter((element) => {
    const style = getComputedStyle(element);
    const mixBlendMode = (style.mixBlendMode || "normal").trim().toLowerCase();
    const backdropFilter = (
      style.backdropFilter ||
      style.getPropertyValue?.("backdrop-filter") ||
      style.getPropertyValue?.("-webkit-backdrop-filter") ||
      "none"
    ).trim().toLowerCase();
    return (mixBlendMode !== "" && mixBlendMode !== "normal") ||
      (backdropFilter !== "" && backdropFilter !== "none");
  });
  const backdropPaintTargets = backdropDependentMembers.length > 0
    ? backdropDependentMembers
    : [target];
  const entirePaintRoots = new Set(
    flattenCompositingContext
      ? Array.from(compositingMembers).filter((element) =>
          element.hasAttribute("data-od-pptx-capture-entire-element") ||
          element.hasAttribute("data-od-pptx-materialized-entire-pseudo"),
        )
      : capturesEntireElement || materializesEntirePseudo
        ? [target]
        : [],
  );
  const entirePaintStyles = new Map<HTMLElement, {
    color: string;
    textFillColor: string;
    textShadow: string;
    visibility: string;
  }>();
  for (const root of entirePaintRoots) {
    for (const element of [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]) {
      const style = getComputedStyle(element);
      entirePaintStyles.set(element, {
        color: style.color,
        textFillColor: style.getPropertyValue("-webkit-text-fill-color") || style.color,
        textShadow: style.textShadow || "none",
        visibility: style.visibility,
      });
    }
  }
  const blendBackdropElements = new Set<HTMLElement>();
  const blendBackdropPseudos = new Map<HTMLElement, Set<"::before" | "::after">>();
  const addBlendBackdropElement = (element: HTMLElement): void => {
    blendBackdropElements.add(element);
    const pseudos = blendBackdropPseudos.get(element) ?? new Set<"::before" | "::after">();
    pseudos.add("::before");
    pseudos.add("::after");
    blendBackdropPseudos.set(element, pseudos);
  };
  const paintsBehindTarget = (element: HTMLElement): boolean => {
    const rect = element.getBoundingClientRect();
    const intersection = {
      bottom: Math.min(bottom, rect.bottom),
      left: Math.max(left, rect.left),
      right: Math.min(right, rect.right),
      top: Math.max(top, rect.top),
    };
    if (intersection.right - intersection.left < 1 || intersection.bottom - intersection.top < 1) {
      return false;
    }
    const insetX = Math.min(1, (intersection.right - intersection.left) / 4);
    const insetY = Math.min(1, (intersection.bottom - intersection.top) / 4);
    const points: Array<[number, number]> = [
      [(intersection.left + intersection.right) / 2, (intersection.top + intersection.bottom) / 2],
      [intersection.left + insetX, intersection.top + insetY],
      [intersection.right - insetX, intersection.top + insetY],
      [intersection.left + insetX, intersection.bottom - insetY],
      [intersection.right - insetX, intersection.bottom - insetY],
    ];
    let sampledTogether = false;
    const paintsBehindAt = (x: number, y: number): boolean => {
      const paintStack = document.elementsFromPoint(x, y);
      const elementIndex = paintStack.indexOf(element);
      if (elementIndex < 0) return false;
      return backdropPaintTargets.some((paintTarget) => {
        const targetIndex = paintStack.indexOf(paintTarget);
        if (targetIndex >= 0) sampledTogether = true;
        return targetIndex >= 0 && elementIndex > targetIndex;
      });
    };
    if (points.some(([x, y]) => paintsBehindAt(x, y))) return true;

    const paintClipState = (candidate: HTMLElement): { hasClipPath: boolean; hasMask: boolean } => {
      const style = getComputedStyle(candidate);
      const clipPath = (
        style.clipPath ||
        style.getPropertyValue?.("clip-path") ||
        style.getPropertyValue?.("-webkit-clip-path") ||
        "none"
      )
        .trim()
        .toLowerCase();
      const hasMask = [
        style.maskImage || style.getPropertyValue?.("mask-image"),
        style.webkitMaskImage || style.getPropertyValue?.("-webkit-mask-image"),
      ].some((value) => Boolean(value && value.trim().toLowerCase() !== "none"));
      return { hasClipPath: clipPath !== "" && clipPath !== "none", hasMask };
    };
    const hasPaintClip = (candidate: HTMLElement): boolean => {
      const state = paintClipState(candidate);
      return state.hasClipPath || state.hasMask;
    };
    const paintClipChain = (candidate: HTMLElement): HTMLElement[] => {
      const clips: HTMLElement[] = [];
      for (let current: HTMLElement | null = candidate; current; current = current.parentElement) {
        if (hasPaintClip(current)) clips.push(current);
        if (current === slide) break;
      }
      return clips;
    };
    const clippedPaintBoxes = [
      ...paintClipChain(element),
      ...backdropPaintTargets.flatMap((paintTarget) => paintClipChain(paintTarget)),
    ]
      .filter((candidate, index, candidates) => candidates.indexOf(candidate) === index);
    if (clippedPaintBoxes.length === 0) return false;

    // A clip path or mask on either box or one of its ancestors can confine
    // real paint to a narrow stripe or ring that misses every fixed sample.
    // Expand those clips for the paint-order probe without removing them:
    // clip-path and masks establish stacking contexts, so setting them to
    // `none` can reorder the boxes and invert the result we are trying to
    // measure. The authored styles are restored before capture, where the real
    // clip/mask still shapes the PNG.
    const paintClipStyles = clippedPaintBoxes.map((candidate) => ({
      candidate,
      cssText: candidate.style.cssText,
      ...paintClipState(candidate),
    }));
    try {
      for (const { candidate, hasClipPath, hasMask } of paintClipStyles) {
        if (hasClipPath) {
          candidate.style.setProperty("clip-path", "inset(0)", "important");
          candidate.style.setProperty("-webkit-clip-path", "inset(0)", "important");
        }
        if (hasMask) {
          for (const property of ["mask", "-webkit-mask"]) {
            candidate.style.setProperty(property, "linear-gradient(#000, #000)", "important");
          }
        }
      }
      sampledTogether = false;
      if (points.some(([x, y]) => paintsBehindAt(x, y))) return true;
      if (sampledTogether) return false;
      // Nested clipping can still keep the two boxes out of Chromium's sampled
      // stack. Preserve the possible backdrop rather than dropping authored
      // paint when coverage remains uncertain.
      return true;
    } finally {
      for (const { candidate, cssText } of paintClipStyles) {
        candidate.style.cssText = cssText;
      }
    }
  };
  if (flattenBackdrop) {
    // Hit testing is Chromium's public view of the effective paint stack. Make
    // pointer-events:none export shims participate temporarily, then use their
    // actual order rather than assuming that DOM order is paint order.
    for (const element of allElements) {
      element.style.setProperty("pointer-events", "auto", "important");
    }
    for (const element of [slide, ...Array.from(slide.querySelectorAll<HTMLElement>("*"))]) {
      const isCapturedDescendant = target.contains(element) && (
        !flattenCompositingContext || compositingMembers.has(element)
      );
      if (element === target || element.contains(target) || isCapturedDescendant) continue;
      if (paintsBehindTarget(element)) addBlendBackdropElement(element);
    }

    const materializedPseudo = target.getAttribute("data-od-pptx-materialized-pseudo");
    for (let branch: HTMLElement | null = target; branch && branch !== slide; branch = branch.parentElement) {
      const parent: HTMLElement | null = branch.parentElement;
      if (!parent) break;
      blendBackdropElements.add(parent);
      // An ancestor's ::before paints before its child content and is part of
      // that child's blend backdrop. For a materialized ::before target, the
      // immediate parent's pseudo is the source layer itself, not its backdrop.
      if (!(branch === target && materializedPseudo === "::before")) {
        const pseudos = blendBackdropPseudos.get(parent) ?? new Set<"::before" | "::after">();
        pseudos.add("::before");
        blendBackdropPseudos.set(parent, pseudos);
      }
    }
  }
  const pseudoBackdropAttributes = Array.from(blendBackdropPseudos, ([element, pseudos]) => ({
    after: element.getAttribute("data-od-pptx-blend-backdrop-after"),
    before: element.getAttribute("data-od-pptx-blend-backdrop-before"),
    element,
    pseudos,
  }));
  for (const { element, pseudos } of pseudoBackdropAttributes) {
    if (pseudos.has("::before")) element.setAttribute("data-od-pptx-blend-backdrop-before", id);
    if (pseudos.has("::after")) element.setAttribute("data-od-pptx-blend-backdrop-after", id);
  }
  const pseudoStyle = document.createElement("style");
  const entireElementPseudoScope = flattenCompositingContext
    ? `[data-od-pptx-compositing-member="${id}"][data-od-pptx-capture-entire-element="true"]`
    : `[data-od-pptx-layer-capture-id="${id}"][data-od-pptx-capture-entire-element="true"]`;
  pseudoStyle.textContent = `
    *::before,*::after{visibility:hidden!important}
    [data-od-pptx-blend-backdrop-before="${id}"]::before,
    [data-od-pptx-blend-backdrop-after="${id}"]::after{
      visibility:visible!important;
      color:transparent!important;
      text-shadow:none!important;
      -webkit-text-fill-color:transparent!important;
    }
    ${capturesEntireElement || Array.from(entirePaintRoots).some((element) => element.hasAttribute("data-od-pptx-capture-entire-element")) ? `
      ${entireElementPseudoScope}::before,
      ${entireElementPseudoScope}::after,
      ${entireElementPseudoScope} *::before,
      ${entireElementPseudoScope} *::after{
        visibility:visible!important;
      }
    ` : ""}
  `;
  document.head.append(pseudoStyle);
  (window as unknown as { __odPptxLayerIsolation?: LayeredPptxIsolationState }).__odPptxLayerIsolation = {
    inlineStyles,
    pseudoBackdropAttributes,
    pseudoStyle,
  };

  for (const element of allElements) element.style.setProperty("visibility", "hidden", "important");
  for (const element of blendBackdropElements) {
    element.style.setProperty("visibility", "visible", "important");
    element.style.setProperty("color", "transparent", "important");
    element.style.setProperty("outline", "none", "important");
    element.style.setProperty("text-shadow", "none", "important");
    element.style.setProperty("-webkit-text-fill-color", "transparent", "important");
  }
  for (let ancestor: HTMLElement | null = target; ancestor; ancestor = ancestor.parentElement) {
    ancestor.style.setProperty("visibility", "visible", "important");
    if (ancestor !== target) {
      if (!flattenBackdrop) {
        ancestor.style.setProperty("background", "transparent", "important");
        ancestor.style.setProperty("border-color", "transparent", "important");
        ancestor.style.setProperty("box-shadow", "none", "important");
      }
      ancestor.style.setProperty("color", "transparent", "important");
      ancestor.style.setProperty("outline", "none", "important");
      ancestor.style.setProperty("text-shadow", "none", "important");
    }
  }
  for (const descendant of Array.from(target.querySelectorAll<HTMLElement>("*"))) {
    const entirePaintRoot = Array.from(entirePaintRoots).find((root) => root === descendant || root.contains(descendant));
    if (entirePaintRoot) {
      descendant.style.setProperty(
        "visibility",
        entirePaintStyles.get(descendant)?.visibility || "visible",
        "important",
      );
      continue;
    }
    if (blendBackdropElements.has(descendant)) continue;
    if (!flattenCompositingContext) {
      descendant.style.setProperty("visibility", "hidden", "important");
      continue;
    }
    const carriesCapturedBackground = compositingMembers.has(descendant);
    const containsCapturedBackground = Array.from(compositingMembers).some((member) => descendant.contains(member));
    if (!carriesCapturedBackground && !containsCapturedBackground) {
      descendant.style.setProperty("visibility", "hidden", "important");
      continue;
    }
    descendant.style.setProperty("visibility", "visible", "important");
    if (!carriesCapturedBackground) {
      descendant.style.setProperty("background", "transparent", "important");
    }
    descendant.style.setProperty("border-color", "transparent", "important");
    descendant.style.setProperty("box-shadow", "none", "important");
    descendant.style.setProperty("color", "transparent", "important");
    descendant.style.setProperty("outline", "none", "important");
    descendant.style.setProperty("text-shadow", "none", "important");
    descendant.style.setProperty("-webkit-text-fill-color", "transparent", "important");
  }
  // Replaced content is painted by the target itself rather than a descendant.
  // Move that object outside its content box for this screenshot while leaving
  // the target's CSS background visible; restore replays the saved inline style.
  if (!capturesEntireElement && ["IMG", "CANVAS", "VIDEO"].includes(target.tagName)) {
    target.style.setProperty("object-position", "1000000px 1000000px", "important");
  }
  if (flattenCompositingContext && !entirePaintRoots.has(target)) {
    if (!compositingMembers.has(target)) {
      target.style.setProperty("background", "transparent", "important");
    }
    target.style.setProperty("border-color", "transparent", "important");
    target.style.setProperty("box-shadow", "none", "important");
    target.style.setProperty("color", "transparent", "important");
    target.style.setProperty("outline", "none", "important");
    target.style.setProperty("text-shadow", "none", "important");
    target.style.setProperty("-webkit-text-fill-color", "transparent", "important");
  } else if (!materializesEntirePseudo && !capturesEntireElement) {
    target.style.setProperty("border-color", "transparent", "important");
    target.style.setProperty("box-shadow", "none", "important");
    target.style.setProperty("color", "transparent", "important");
    target.style.setProperty("text-shadow", "none", "important");
    target.style.setProperty("-webkit-text-fill-color", "transparent", "important");
  }
  for (const [element, style] of entirePaintStyles) {
    element.style.setProperty("visibility", style.visibility, "important");
    element.style.setProperty("color", style.color, "important");
    element.style.setProperty("text-shadow", style.textShadow, "important");
    element.style.setProperty("-webkit-text-fill-color", style.textFillColor, "important");
  }
  for (const root of [document.documentElement, document.body]) {
    if (!root) continue;
    root.style.setProperty("visibility", "visible", "important");
    if (!flattenBackdrop) root.style.setProperty("background", "transparent", "important");
  }

  return {
    height: bottom - top,
    left: left - slideRect.left,
    pageX: left + window.scrollX,
    pageY: top + window.scrollY,
    slideIndex,
    top: top - slideRect.top,
    width: right - left,
  };
}

// Exported so the focused Electron fixture can exercise the real debugger,
// isolation, and screenshot orchestration under explicit device scale factors.
export async function captureEditablePptxLayeredBackgrounds(
  window: BrowserWindow,
): Promise<Record<string, LayeredPptxBackgroundCapture>> {
  const targets = (await window.webContents.executeJavaScript(
    `(${collectLayeredPptxBackgroundTargets.toString()})(${JSON.stringify(SLIDE_SELECTOR)})`,
    true,
  )) as LayeredPptxBackgroundTarget[];
  if (targets.length === 0) return {};

  // CDP multiplies clip.scale by the renderer's device scale factor. Keep the
  // exported layer at a stable 2 physical pixels per CSS pixel instead of
  // double-scaling Retina windows to 4x.
  const captureScale = Math.min(2, 2 / (await queryDevicePixelRatio(window)));

  const dbg = window.webContents.debugger;
  let attachedHere = false;
  try {
    if (!dbg.isAttached()) {
      dbg.attach("1.3");
      attachedHere = true;
    }
    await dbg.sendCommand("Page.enable");
    await dbg.sendCommand("Emulation.setDefaultBackgroundColorOverride", {
      color: { a: 0, b: 0, g: 0, r: 0 },
    });
    const captures: Record<string, LayeredPptxBackgroundCapture> = {};
    for (const target of targets) {
      const geometry = (await window.webContents.executeJavaScript(
        `(() => { const restoreLayeredPptxBackgroundIsolation = ${restoreLayeredPptxBackgroundIsolation.toString()}; return (${isolateLayeredPptxBackground.toString()})(${JSON.stringify(SLIDE_SELECTOR)}, ${JSON.stringify(target.id)}); })()`,
        true,
      )) as LayeredPptxBackgroundGeometry | null;
      if (!geometry) throw new Error(`could not isolate layered PPTX background ${target.id}`);
      await nextFrames(window);
      const screenshot = (await dbg.sendCommand("Page.captureScreenshot", {
        captureBeyondViewport: true,
        clip: {
          height: geometry.height,
          scale: captureScale,
          width: geometry.width,
          x: geometry.pageX,
          y: geometry.pageY,
        },
        format: "png",
        fromSurface: true,
      })) as { data?: string };
      if (!screenshot.data) throw new Error(`Chromium returned no layered PPTX capture for ${target.id}`);
      captures[target.id] = {
        dataUrl: `data:image/png;base64,${screenshot.data}`,
        height: geometry.height,
        left: geometry.left,
        slideIndex: geometry.slideIndex,
        top: geometry.top,
        width: geometry.width,
      };
      await window.webContents.executeJavaScript(
        `(${restoreLayeredPptxBackgroundIsolation.toString()})()`,
        true,
      );
    }
    return captures;
  } finally {
    try {
      await window.webContents.executeJavaScript(
        `(${restoreLayeredPptxBackgroundIsolation.toString()})()`,
        true,
      );
    } catch {
      // The render window may already be gone after a capture failure.
    }
    try {
      await dbg.sendCommand("Emulation.setDefaultBackgroundColorOverride");
    } catch {
      // Ignore debugger cleanup failures; the window is throwaway.
    }
    if (attachedHere && dbg.isAttached()) {
      try {
        dbg.detach();
      } catch {
        // Ignore debugger cleanup failures; the window is throwaway.
      }
    }
  }
}

// Shows slide `i` and captures the measured stage rect. Prefers CDP
// `Page.captureScreenshot` (renders the CURRENT DOM to a fresh frame, so it
// cannot return a stale composited frame of the previous slide — the
// duplicate-page race `capturePage` exhibits); falls back to `capturePage` when
// the debugger isn't attached. `scale: 1` because the window's device-pixel
// ratio already provides the pixel scale (avoids double-scaling). Exported so
// focused tests can exercise the real selection/restack/capture orchestration.
export async function captureDeckSlide(
  window: BrowserWindow,
  dbg: Electron.Debugger | null,
  i: number,
  stage: Stage,
): Promise<Electron.NativeImage> {
  await showDeckSlide(window, i, stage);
  if (dbg) {
    const shot = (await dbg.sendCommand("Page.captureScreenshot", {
      clip: { x: 0, y: 0, width: stage.w, height: stage.h, scale: 1 },
      format: "png",
    })) as { data: string };
    return nativeImage.createFromBuffer(Buffer.from(shot.data, "base64"));
  }
  return await window.webContents.capturePage({ x: 0, y: 0, width: stage.w, height: stage.h });
}

// Captures every deck slide and stacks them top-to-bottom into one tall image
// (deck image export). Stitches BGRA with a native memcpy per slide and encodes
// once natively, like the scroll-segment path. Bounds the output height: a deck
// taller than this is uniformly downscaled so EVERY slide is preserved — never
// silently truncated.
const DECK_STITCH_MAX_H = 30000;
// RAM budget for the stitched BGRA buffer, mirroring the page stitcher. The
// height cap alone is not enough: a wide / high-DPR stage can still blow past a
// gigabyte (e.g. 8192px stage @2x => W~16384, * 30000 * 4 ≈ 1.9 GiB).
const DECK_STITCH_MAX_BYTES = 320 * 1024 * 1024;
async function stitchDeckSlides(
  window: BrowserWindow,
  dbg: Electron.Debugger | null,
  count: number,
  stage: Stage,
  jpeg: boolean,
  outputDir: string | undefined,
): Promise<DesktopRenderSlidesResult> {
  // Capture slide 0 first to learn the native per-slide pixel size, then pick a
  // single uniform downscale so all `count` slides fit under BOTH the height cap
  // and the RAM byte budget. Scaling (instead of dropping trailing slides) keeps
  // the "whole deck as one picture" contract — long/large decks just get a
  // smaller per-slide size.
  const first = await captureDeckSlide(window, dbg, 0, stage);
  const nativeSize = first.getSize();
  const nativeW = Math.max(1, nativeSize.width);
  const nativeH = Math.max(1, nativeSize.height);
  const heightScale = DECK_STITCH_MAX_H / (nativeH * count);
  // total bytes = (nativeW*s) * (nativeH*count*s) * 4 <= MAX_BYTES  =>  s <= sqrt(...)
  const byteScale = Math.sqrt(DECK_STITCH_MAX_BYTES / (nativeW * nativeH * count * 4));
  const scale = Math.min(1, heightScale, byteScale);
  const W = Math.max(1, Math.round(nativeW * scale));
  const slideHpx = Math.max(1, Math.round(nativeSize.height * scale));
  const bgra = Buffer.alloc(W * slideHpx * count * 4);
  const place = (image: Electron.NativeImage, index: number): void => {
    const scaled = scale < 1 ? image.resize({ width: W, height: slideHpx }) : image;
    const bmp = scaled.toBitmap(); // BGRA, full-width rows
    bmp.copy(bgra, index * slideHpx * W * 4, 0, Math.min(bmp.length, slideHpx * W * 4));
  };
  place(first, 0);
  for (let i = 1; i < count; i++) {
    const image = await captureDeckSlide(window, dbg, i, stage);
    place(image, i);
  }
  const H = slideHpx * count;
  const img = nativeImage.createFromBitmap(bgra, { width: W, height: H });
  const bytes = jpeg ? img.toJPEG(82) : img.toPNG();
  return {
    ok: true,
    ...(await emitImages([{ buffer: bytes, jpeg }], outputDir)),
    width: W,
    height: H,
    mode: "deck",
  };
}

// Ordinary (non-deck) page: capture the WHOLE document as one long image at a
// fixed desktop width, viewport-independent.
const PAGE_W = 1440;
// Logical viewport height used for the scroll-segment fallback.
const PAGE_VIEW_H = 1000;
// RAM budget for the stitched output buffer (~RGBA). Bounds the worst-case
// output height regardless of how tall the page is.
const PAGE_RAM_BUDGET_BYTES = 320 * 1024 * 1024;
/**
 * Captures an ordinary page as one long, viewport-independent image.
 *
 * Image export (paginate=false) always SCROLL-SEGMENT STITCHES: it scrolls the
 * page one viewport at a time, captures each screen in the state it actually
 * paints at that scroll position, and stitches the frames by their real scroll
 * offset into a single tall image. This is faithful to scroll-driven / parallax
 * pages. It is RAM-bound, so a page taller than the single-image memory budget
 * refuses instead of truncating.
 *
 * PDF export (paginate=true) is handled earlier via paginatePageViewports (one
 * image per viewport, not stitched).
 */
async function capturePage(
  window: BrowserWindow,
  jpeg: boolean,
  outputDir: string | undefined,
  paginate = false,
  pageSize: Stage = { w: PAGE_W, h: PAGE_VIEW_H },
): Promise<DesktopRenderSlidesResult> {
  // Lay the document out at a desktop width first so width-dependent content
  // (responsive layouts) renders the way a desktop visitor sees it.
  window.setContentSize(pageSize.w, pageSize.h);
  await nextFrames(window);

  // Pre-pass: freeze animations and scroll the whole page once so reveal-on-
  // scroll content (IntersectionObserver / AOS / lazy images) is triggered and
  // settles before we capture.
  //
  // Both the PDF (per-viewport pages) and image (per-viewport stitch) paths
  // KEEP fixed/sticky positioning as authored and capture each viewport live at
  // its real scroll offset — identical capture logic, they only differ in how
  // the frames are assembled (separate PDF pages vs one tall stitched image).
  // We do NOT neutralize fixed/sticky: on parallax / scroll-pinned designs the
  // headline and foreground text are positioned by that very CSS, and flattening
  // it (fixed→absolute, sticky→static) dropped the text entirely from the
  // capture (the "exported image has no text" bug on reverie-style pages).
  await preparePageForCapture(window);

  // PDF of a long non-deck page: capture one image PER VIEWPORT, top to bottom,
  // so the daemon assembles a multi-page PDF (one screen per page) instead of a
  // single giant page. Done before the single-pass/stitch path selection below.
  if (paginate) {
    const measured = (await window.webContents.executeJavaScript(
      "Math.ceil(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0))",
      true,
    )) as number;
    const totalLogical = Math.max(pageSize.h, Number.isFinite(measured) ? measured : pageSize.h);
    return await paginatePageViewports(window, totalLogical, jpeg, outputDir, pageSize);
  }

  // The window's device-pixel-ratio already scales the capture (2 on retina),
  // exactly like the deck path's capturePage. Report real px via it.
  const dpr = await queryDevicePixelRatio(window);
  const outW = pageSize.w * dpr;
  const ramMaxOutH = Math.floor(PAGE_RAM_BUDGET_BYTES / (outW * 4));

  const dbg = window.webContents.debugger;
  let attached = false;
  try {
    dbg.attach("1.3");
    attached = true;
  } catch {
    // already attached or unavailable — scroll-segment fallback below
  }

  try {
    if (attached) {
      await dbg.sendCommand("Page.enable");
      // Measure the document height in CSS px directly (CDP contentSize is in
      // device px in this Electron, which would double-scale). Clip width to the
      // desktop viewport we laid out at — horizontal overflow is rare and a
      // desktop-width capture is what we want.
      const measuredH = (await window.webContents.executeJavaScript(
        "Math.ceil(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0))",
        true,
      )) as number;
      const docH = Math.max(1, Number.isFinite(measuredH) ? measuredH : pageSize.h);
      const outHpx = docH * dpr;

      // Image export always stitches the page from per-viewport captures (scroll
      // down one screen at a time, capture, stitch by real scroll offset). This
      // is faithful to scroll-driven / parallax pages — each screen is captured
      // in the state it actually paints at that scroll position — unlike a single
      // captureBeyondViewport pass, which renders the whole document at scroll 0
      // and gets parallax/reveal content wrong. Too-tall image exports refuse;
      // PDF pagination is keyed off the explicit `paginate` flag above, never the
      // image encoder choice.
      if (outHpx > ramMaxOutH) {
        return {
          ok: false,
          error: `page is too tall to export as one image (~${docH}px) — export as PDF instead`,
          errorCode: "PAGE_TOO_TALL",
        };
      }
      return await scrollSegmentStitch(window, docH, jpeg, outputDir, pageSize);
    }
  } catch {
    // Fall through to the capturePage-based scroll stitch path.
  } finally {
    if (attached) {
      try {
        dbg.detach();
      } catch {
        // ignore
      }
    }
  }

  // No debugger available: measure + scroll-segment.
  const measured = (await window.webContents.executeJavaScript(
    "Math.ceil(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0))",
    true,
  )) as number;
  const totalLogical = Math.max(pageSize.h, Number.isFinite(measured) ? measured : pageSize.h);
  // Same budget guard as the debugger path: refuse rather than truncate. The PDF
  // path uses paginatePageViewports before debugger attach, so reaching this
  // branch means the caller asked for a single image. The encoder (PNG/JPEG) must
  // not change that contract into a multi-page result.
  if (totalLogical * dpr > ramMaxOutH) {
    return {
      ok: false,
      error: `page is too tall to export as one image (~${totalLogical}px) — export as PDF instead`,
      errorCode: "PAGE_TOO_TALL",
    };
  }
  return await scrollSegmentStitch(window, totalLogical, jpeg, outputDir, pageSize);
}

// Freezes animations/transitions and scroll-prewarms the page so reveal-on-
// scroll content (IntersectionObserver, AOS, `loading=lazy`) is triggered and
// holds before capture — the standard technique full-page screenshot services
// use. Does NOT fix JS that recomputes transforms from scrollY every frame
// (continuous parallax): those have no single correct frame and still fall to
// scroll-segment via the blank-below-fold check.
async function preparePageForCapture(window: BrowserWindow): Promise<void> {
  try {
    // NOTE: fixed/sticky positioning is intentionally LEFT AS AUTHORED. We used
    // to flatten it (fixed→absolute, sticky→static) so a pinned hero wasn't
    // repeated down a stitched capture, but that dropped scroll-pinned headline/
    // foreground TEXT on parallax pages (the "exported image has no text" bug).
    // Capturing each viewport live at its real scroll offset is faithful to how
    // the page actually paints, so we keep the CSS and accept that a genuinely
    // fixed bar may appear in more than one viewport.
    await window.webContents.executeJavaScript(
      `(function(){try{var s=document.createElement('style');s.setAttribute('data-od-capture','1');s.textContent='*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important}';(document.head||document.documentElement).appendChild(s);}catch(e){}})()`,
      true,
    );
    await window.webContents.executeJavaScript(
      `(async function(){function instant(y){try{document.documentElement.style.scrollBehavior='auto';if(document.body)document.body.style.scrollBehavior='auto'}catch(e){}try{window.scrollTo({left:0,top:y,behavior:'instant'})}catch(e){window.scrollTo(0,y)}try{document.documentElement.scrollTop=y;if(document.body)document.body.scrollTop=y}catch(e){}}var vh=window.innerHeight||1000;var H=function(){return Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0)};for(var y=0;y<H();y+=vh){instant(y);await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})});await new Promise(function(r){setTimeout(r,120)});}instant(0);await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(function(){setTimeout(r,200)})})});return true;})()`,
      true,
    );
    // Wait for any fonts / images / CSS bg images that loaded during the prewarm.
    await waitForPrintableContent(window);
  } catch {
    // Best-effort — capture proceeds even if the pre-pass fails.
  }
}

// Window device-pixel-ratio (2 on retina). capturePage / captureScreenshot both
// scale the output by it, so we use it to compute real output pixel sizes.
async function queryDevicePixelRatio(window: BrowserWindow): Promise<number> {
  try {
    const v = (await window.webContents.executeJavaScript("window.devicePixelRatio || 1", true)) as number;
    return Number.isFinite(v) && v > 0 ? v : 1;
  } catch {
    return 1;
  }
}

// Scrolls the page one viewport at a time, captures each frame, and stitches
// them by real scroll offset into one tall BGRA buffer, then encodes once with
// Electron's native PNG encoder. Stitching is a single Buffer.copy per chunk
// (no per-pixel JS, no channel swap — capturePage already gives BGRA, which is
// what createFromBitmap wants) and the encode is native C++, so this is fast
// even for long pages. createFromBitmap is a CPU bitmap, so it is NOT bound by
// the GPU texture limit; height is bounded only by the caller's RAM cap.
// Full-page stitch geometry derived from the REAL captured device width. The
// capture's pixel ratio can be fractional (e.g. 1.25 on 125% display scaling),
// so we must NOT round it to an integer — that corrupts the output width and
// every row offset off macOS-retina (integer DPR) defaults. Exported for tests.
export function scrollStitchGeometry(
  deviceWidth: number,
  totalLogical: number,
  pageW: number,
): { width: number; height: number; dpr: number } {
  const dpr = deviceWidth > 0 && pageW > 0 ? deviceWidth / pageW : 1;
  return { width: Math.max(1, deviceWidth), height: Math.max(1, Math.round(totalLogical * dpr)), dpr };
}
// Device-pixel row offset for a chunk captured at logical scroll `actualY`.
export function scrollStitchRowOffset(actualY: number, dpr: number): number {
  return Math.round(actualY * dpr);
}

export type BgraColor = readonly [number, number, number, number];

export function solidBgraBuffer(width: number, height: number, color: BgraColor): Buffer {
  const size = Math.max(0, Math.floor(width) * Math.floor(height) * 4);
  const buffer = Buffer.allocUnsafe(size);
  if (size === 0) return buffer;
  const pixel = Buffer.from([
    clampByte(color[2]),
    clampByte(color[1]),
    clampByte(color[0]),
    clampByte(color[3]),
  ]);
  const seed = Math.min(size, 4096 * 4);
  for (let i = 0; i < seed; i += 4) pixel.copy(buffer, i);
  for (let filled = seed; filled < size; filled *= 2) {
    buffer.copy(buffer, filled, 0, Math.min(filled, size - filled));
  }
  return buffer;
}

async function scrollSegmentStitch(
  window: BrowserWindow,
  totalLogical: number,
  jpeg: boolean,
  outputDir: string | undefined,
  pageSize: Stage = { w: PAGE_W, h: PAGE_VIEW_H },
): Promise<DesktopRenderSlidesResult> {
  window.setContentSize(pageSize.w, pageSize.h);
  await nextFrames(window);
  const maxScroll = Math.max(0, totalLogical - pageSize.h);

  let W = 0;
  let H = 0;
  let dpr = 1;
  let bgra: Buffer | null = null;
  const background = await queryPageBackgroundColor(window);

  for (let y = 0; ; y += pageSize.h) {
    const target = Math.min(y, maxScroll);
    const actualY = await scrollToCaptureTarget(window, target);
    const image = await window.webContents.capturePage({ x: 0, y: 0, width: pageSize.w, height: pageSize.h });
    const bmp = image.toBitmap(); // BGRA
    const size = image.getSize();
    if (!bgra) {
      // Use the real captured pixel width (and its true, possibly fractional,
      // ratio) for the buffer + placement — never a rounded integer scale.
      const geo = scrollStitchGeometry(size.width, totalLogical, pageSize.w);
      W = geo.width;
      H = geo.height;
      dpr = geo.dpr;
      bgra = solidBgraBuffer(W, H, background);
    }
    const destRow = scrollStitchRowOffset(actualY, dpr);
    if (destRow < H) {
      const rows = Math.min(size.height, H - destRow);
      if (rows > 0) {
        if (size.width === W) {
          // Chunk rows are full-width and contiguous — one native memcpy.
          bmp.copy(bgra, destRow * W * 4, 0, rows * W * 4);
        } else {
          // Defensive width mismatch — copy the overlapping width row by row.
          const rowWidth = Math.min(size.width, W) * 4;
          for (let r = 0; r < rows; r++) {
            bmp.copy(bgra, (destRow + r) * W * 4, r * size.width * 4, r * size.width * 4 + rowWidth);
          }
        }
      }
    }
    if (target >= maxScroll) break;
  }

  const img = nativeImage.createFromBitmap(bgra ?? Buffer.alloc(4), { width: W || 1, height: H || 1 });
  const bytes = jpeg ? img.toJPEG(82) : img.toPNG();
  return {
    ok: true,
    ...(await emitImages([{ buffer: bytes, jpeg }], outputDir)),
    width: W,
    height: H,
    mode: "page",
  };
}

async function scrollToCaptureTarget(window: BrowserWindow, target: number): Promise<number> {
  return (await window.webContents.executeJavaScript(
    `(async function(){var target=${JSON.stringify(target)};function maxY(){return Math.max(0,Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0)-(window.innerHeight||1000))}function pos(){return window.scrollY||window.pageYOffset||document.documentElement.scrollTop||(document.body?document.body.scrollTop:0)||0}function instant(y){try{document.documentElement.style.scrollBehavior='auto';if(document.body)document.body.style.scrollBehavior='auto'}catch(e){}try{window.scrollTo({left:0,top:y,behavior:'instant'})}catch(e){window.scrollTo(0,y)}try{document.documentElement.scrollTop=y;if(document.body)document.body.scrollTop=y}catch(e){}}var desired=Math.max(0,Math.min(target,maxY()));for(var i=0;i<8;i++){instant(desired);await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})});await new Promise(function(r){setTimeout(r,i<2?80:40)});var y=pos();if(Math.abs(y-desired)<=1)return Math.round(y)}return Math.round(pos())})()`,
    true,
  )) as number;
}

async function queryPageBackgroundColor(window: BrowserWindow): Promise<BgraColor> {
  try {
    const value = (await window.webContents.executeJavaScript(
      `(function(){function parseColor(input){if(!input||input==='transparent')return null;var m=String(input).match(/^rgba?\\(([^)]+)\\)$/i);if(!m)return null;var parts=m[1].split(',').map(function(v){return v.trim()});var r=Number(parts[0]);var g=Number(parts[1]);var b=Number(parts[2]);var a=parts.length>3?Math.round(Number(parts[3])*255):255;if(!Number.isFinite(r)||!Number.isFinite(g)||!Number.isFinite(b)||!Number.isFinite(a)||a<=0)return null;return [Math.max(0,Math.min(255,Math.round(r))),Math.max(0,Math.min(255,Math.round(g))),Math.max(0,Math.min(255,Math.round(b))),Math.max(0,Math.min(255,a))]}var styles=[getComputedStyle(document.body||document.documentElement).backgroundColor,getComputedStyle(document.documentElement).backgroundColor];for(var i=0;i<styles.length;i++){var c=parseColor(styles[i]);if(c)return c}return [255,255,255,255]})()`,
      true,
    )) as BgraColor;
    if (Array.isArray(value) && value.length === 4) {
      return [clampByte(value[0]), clampByte(value[1]), clampByte(value[2]), clampByte(value[3])];
    }
  } catch {
    // Fall back below.
  }
  return [255, 255, 255, 255];
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
}

// Splits an ordinary (non-deck) page into one image PER VIEWPORT, top to
// bottom — the PDF path uses this so a long scrolling site becomes a multi-page
// PDF (one screen per page) instead of one giant page. Each page is a LIVE
// viewport capture at its scroll offset, so scroll-driven parallax renders
// correctly per screen (unlike a single off-screen capture). Pages don't
// overlap: every page but the last is a full viewport; the last captures only
// the remaining rows. Bounded by page count rather than RAM (each image is one
// small viewport), so arbitrarily long pages are safe. Exported helpers
// `paginateViewportPlan`/-`Geometry` keep the offset math unit-testable.
async function paginatePageViewports(
  window: BrowserWindow,
  totalLogical: number,
  jpeg: boolean,
  outputDir: string | undefined,
  pageSize: Stage = { w: PAGE_W, h: PAGE_VIEW_H },
): Promise<DesktopRenderSlidesResult> {
  window.setContentSize(pageSize.w, pageSize.h);
  await nextFrames(window);
  const maxScroll = Math.max(0, totalLogical - pageSize.h);
  const pageCount = Math.max(1, Math.ceil(totalLogical / pageSize.h));
  const images: Array<{ buffer: Buffer; jpeg: boolean }> = [];
  let width = pageSize.w;
  let height = pageSize.h;
  for (let p = 0; p < pageCount; p++) {
    const target = Math.min(p * pageSize.h, maxScroll);
    const actualY = await scrollToCaptureTarget(window, target);
    const band = paginateViewportBand(p, actualY, totalLogical, pageSize.h);
    const image = await window.webContents.capturePage({
      x: 0,
      y: band.top,
      width: pageSize.w,
      height: band.height,
    });
    const size = image.getSize();
    width = size.width;
    height = size.height;
    images.push({ buffer: jpeg ? image.toJPEG(82) : image.toPNG(), jpeg });
  }
  return {
    ok: true,
    ...(await emitImages(images, outputDir)),
    width,
    height,
    mode: "page",
  };
}

// The viewport sub-rectangle to capture for page `p` given the scroll position
// the browser actually landed at (`actualY`, which the final page clamps below
// the requested offset when the page can't scroll further). `top` is where this
// page's band begins inside the live viewport (>0 only on a clamped final page,
// so its rows don't overlap the previous page); `height` is the remaining rows,
// capped to the rest of the viewport. Exported for tests.
export function paginateViewportBand(
  p: number,
  actualY: number,
  totalLogical: number,
  viewportH: number = PAGE_VIEW_H,
): { top: number; height: number } {
  const desiredTop = p * viewportH;
  const top = Math.max(0, Math.round(desiredTop - actualY));
  const remaining = Math.ceil(totalLogical - desiredTop);
  const height = Math.max(1, Math.min(viewportH - top, remaining));
  return { top, height };
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

async function nextFrames(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(
    "new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(function(){r(true)})})})",
    true,
  );
}

function injectBaseHref(doc: string, baseHref: string | undefined): string {
  if (!baseHref) return doc;
  const tag = `<base href="${escapeHtmlAttribute(baseHref)}">`;
  if (/<head[^>]*>/i.test(doc)) return doc.replace(/<head[^>]*>/i, (match) => `${match}${tag}`);
  if (/<html[^>]*>/i.test(doc)) return doc.replace(/<html[^>]*>/i, (match) => `${match}<head>${tag}</head>`);
  return `<!doctype html><html><head>${tag}</head><body>${doc}</body></html>`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// --- Functions serialized into the page (kept dependency-free) ---

// Page-vs-deck decision (exported for tests). Deck capture requires real slide
// surfaces AND the caller not having explicitly said `deck: false`. So an
// ordinary page with carousel/testimonial `.slide` markup, exported with
// `deck: false`, is captured as a full page — never per-slide. When the caller
// omits the signal, the `.slide` count heuristic decides (CLI back-compat).
export function shouldCaptureAsDeck(hasSlides: boolean, deckSignal: boolean | undefined): boolean {
  return hasSlides && deckSignal !== false;
}

export function shouldCapturePageAsJpeg(
  pageImageFormat: "png" | "jpeg" | undefined,
  paginate: boolean | undefined,
): boolean {
  return pageImageFormat === "jpeg" || paginate === true;
}

export function activeSlideCaptureOffsetTransform(rect: { x: number; y: number }): string {
  return `translate(${-rect.x}px, ${-rect.y}px)`;
}

// Non-mutating: count the real slide surfaces (presenter clones excluded). Used
// to decide page-vs-deck BEFORE any deck-only DOM mutation, so page-mode exports
// keep the original document intact.
function countRealSlides(slideSelector: string): number {
  return Array.prototype.slice
    .call(document.querySelectorAll(slideSelector))
    .filter((el) => !(el as HTMLElement).closest(".mini-slide, .overview, .notes-overlay, .thumb")).length;
}

// Serialized into the page: lays out every real slide simultaneously (stacked at
// the origin, opacity 1) so dom-to-pptx can measure each one as its own slide.
// Decks normally render only the active slide, which would give the others no
// layout box.
function showAllSlides(slideSelector: string): number {
  const slides = Array.prototype.slice
    .call(document.querySelectorAll(slideSelector))
    .filter((el) => !(el as HTMLElement).closest(".mini-slide, .overview, .notes-overlay, .thumb"));
  for (const node of slides) {
    const el = node as HTMLElement;
    el.style.setProperty("opacity", "1", "important");
    el.style.setProperty("visibility", "visible", "important");
    el.style.setProperty("position", "absolute", "important");
    el.style.setProperty("left", "0", "important");
    el.style.setProperty("top", "0", "important");
    ["active", "visible", "is-active", "current"].forEach((c) => el.classList.add(c));
  }
  return slides.length;
}

function collectImportedStylesheetUrls(): string[] {
  const urls = new Set<string>();
  const pattern = /@import\s+(?:url\(\s*)?(?:(["'])([\s\S]*?)\1|([^"')\s;]+))\s*\)?[^;]*;/giu;
  document.querySelectorAll("style").forEach((style) => {
    for (const match of (style.textContent || "").matchAll(pattern)) {
      const raw = match[2] || match[3];
      if (!raw) continue;
      try {
        urls.add(new URL(raw, document.baseURI).href);
      } catch {
        // Ignore malformed author CSS and let the normal browser fallback apply.
      }
    }
  });
  return Array.from(urls);
}

// Picks the typeface the exported PPTX should name for a run of `text`, given its
// CSS `font-family` stack. dom-to-pptx names ONE typeface per run — the first
// family in the stack — and writes it to the PowerPoint `<a:latin>`, `<a:ea>`
// (East-Asian) and `<a:cs>` slots alike. Our deck templates lead every stack
// with a Latin-only webfont (e.g. `'Inter','Noto Sans SC',…`): the browser then
// renders CJK glyphs with the later CJK family via per-glyph fallback, but the
// export mislabels those runs with the Latin font — which has no CJK glyphs — so
// PowerPoint, WPS, and Keynote each substitute a DIFFERENT fallback and the
// Chinese/Japanese/Korean text renders wrong and inconsistently ("字体错乱").
//
// When `text` contains East-Asian characters and the stack carries a CJK-capable
// family further down, return the stack reordered so that family leads (the whole
// stack is preserved so the browser keeps its own per-glyph fallback). Returns
// `null` when nothing needs to change (Latin-only text, no CJK family in the
// stack, or a CJK family already leads) so callers can skip the element. Kept
// pure and self-contained so it can be both unit-tested and serialized into the
// export render window.
export function cjkPromotedFontFamily(fontFamily: string, text: string): string | null {
  // CJK symbols/punctuation, Hiragana, Katakana, CJK Unified Ideographs (+ Ext-A),
  // Yi, Hangul syllables, CJK compatibility ideographs, and half/fullwidth forms.
  const cjkText =
    /[\u2E80-\u2FDF\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/;
  // Family names that carry CJK glyph coverage: the Noto SC/TC/JP/KR webfonts the
  // html-ppt templates ship, plus common system CJK faces an authored deck may
  // name, so a promoted typeface resolves to a real CJK font across the office
  // suites instead of each app's arbitrary fallback.
  const cjkFamily =
    /noto\s*(sans|serif)\s*(sc|tc|hk|jp|kr|cjk)|source\s*han|pingfang|hiragino|heiti|songti|kaiti|fangsong|microsoft\s*(yahei|jhenghei)|yahei|simsun|simhei|mingliu|meiryo|ms\s*(gothic|mincho)|malgun|nanum|gulim|batang|dotum|思源|苹方|黑体|宋体|楷体|仿宋|微软雅黑|明體|明朝|ゴシック/i;
  if (!fontFamily || !cjkText.test(text || "")) return null;
  const families = fontFamily
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  if (families.length < 2) return null;
  const firstCjk = families.findIndex((f) => cjkFamily.test(f.replace(/^["']|["']$/g, "").trim()));
  // No CJK family to promote, or one already leads the stack.
  if (firstCjk <= 0) return null;
  return [families[firstCjk], ...families.filter((_, i) => i !== firstCjk)].join(", ");
}

// Serialized into the page: `prepare` applies every geometry-affecting export
// normalization before Chromium capture, while `export-prepared` consumes those
// measurements without moving the DOM again. Imported font faces are exposed in
// both phases so capture uses the authored fonts and export receives the same
// explicit font list. The default phase retains the single-call test/integration
// seam. Fonts are auto-detected + embedded; SVGs stay vector (editable in
// PowerPoint).
export async function runDomToPptx(
  slideSelector: string,
  layeredBackgrounds: Record<string, LayeredPptxBackgroundCapture> = {},
  phase: "export" | "prepare" | "export-prepared" = "export",
  importedStylesheetOverrides: Array<{ cssText: string; url: string }> = [],
): Promise<{ b64?: string; error?: string; prepared?: boolean }> {
  // dom-to-pptx fixes native ::before content at -1,000,000. Reserve the two
  // preceding slots for its raster background and the slide background below
  // it so a slide-root pseudo remains visible over an opaque slide fill.
  const slideBackgroundSortSlot = "-1000002";
  const pseudoBeforeBackgroundSortSlot = "-1000001";
  const pseudoAfterBackgroundSortSlot = "0";
  function importedStylesheetUrls(cssText: string, baseHref: string): string[] {
    const urls: string[] = [];
    const importPattern =
      /@import\s+(?:url\(\s*)?(?:(["'])([\s\S]*?)\1|([^"')\s;]+))\s*\)?[^;]*;/giu;
    for (const match of cssText.matchAll(importPattern)) {
      const raw = match[2] || match[3];
      if (!raw) continue;
      try {
        urls.push(new URL(raw, baseHref).href);
      } catch {
        // Ignore malformed author CSS and let the existing font fallback apply.
      }
    }
    return urls;
  }

  function importedFontFaceCss(cssText: string, baseHref: string): string {
    const faces = (cssText.match(/@font-face\s*\{[\s\S]*?\}/giu) || []).map((rule) => {
      const value = (property: string): string =>
        rule.match(new RegExp(`${property}\\s*:\\s*([^;]+)`, "iu"))?.[1]?.trim() || "";
      return {
        family: value("font-family").replace(/^['"]|['"]$/g, ""),
        rule,
        style: value("font-style").toLowerCase() || "normal",
        unicodeRange: value("unicode-range"),
        weight: value("font-weight").toLowerCase() || "400",
      };
    });
    const preferredFace = new Map<string, { rank: number; style: string; weight: string }>();
    for (const face of faces) {
      const rank = face.style === "normal" ? (face.weight === "400" || face.weight === "normal" ? 0 : 1) : 2;
      const current = preferredFace.get(face.family);
      if (!current || rank < current.rank) {
        preferredFace.set(face.family, { rank, style: face.style, weight: face.weight });
      }
    }

    const preferredRule = new Map<string, { rank: number; rule: string }>();
    for (const face of faces) {
      const preferred = preferredFace.get(face.family);
      if (preferred?.style !== face.style || preferred.weight !== face.weight) continue;
      // Google Fonts commonly returns one @font-face per unicode subset. The
      // vendored converter can fail while merging some families' subsets, so
      // prefer the complete face when present, then its Latin core subset.
      const rank = face.unicodeRange === "" ? 0 : /U\+0000-00FF/iu.test(face.unicodeRange) ? 1 : 2;
      const current = preferredRule.get(face.family);
      if (!current || rank < current.rank) preferredRule.set(face.family, { rank, rule: face.rule });
    }

    return faces
      .filter((face) => preferredRule.get(face.family)?.rule === face.rule)
      .map((rule) =>
        rule.rule.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/giu, (_match, _quote, raw: string) => {
          try {
            return `url("${new URL(raw.trim(), baseHref).href}")`;
          } catch {
            return `url("${raw.trim()}")`;
          }
        }),
      )
      .join("\n");
  }

  // dom-to-pptx's autoEmbedFonts scanner sees top-level CSSFontFaceRule entries,
  // but many OpenDesign decks load Google Fonts through an inline `@import`.
  // Expand those imports into a throwaway top-level style so the vendored engine
  // can discover and embed the actual font files instead of only writing their
  // family names into the PPTX. The render window is destroyed after export, so
  // this never mutates the authored HTML or the live preview.
  async function exposeImportedFontFaces(): Promise<Array<{ name: string; urls: string[] }>> {
    const importedUrls = new Set<string>();
    document.querySelectorAll("style").forEach((style) => {
      for (const url of importedStylesheetUrls(style.textContent || "", document.baseURI)) {
        importedUrls.add(url);
      }
    });
    if (importedUrls.size === 0) return [];

    const visited = new Set<string>();
    const fontFaceRules: string[] = [];
    const collect = async (url: string): Promise<void> => {
      if (visited.has(url)) return;
      visited.add(url);
      try {
        const override = importedStylesheetOverrides.find((entry) => entry.url === url);
        const response = override ? null : await fetch(url);
        if (response && !response.ok) throw new Error(`HTTP ${response.status}`);
        const cssText = override?.cssText ?? (await response!.text());
        for (const nested of importedStylesheetUrls(cssText, url)) await collect(nested);
        const fontCss = importedFontFaceCss(cssText, url);
        if (fontCss) fontFaceRules.push(fontCss);
      } catch (error) {
        console.warn("Cannot expose imported fonts for editable PPTX:", url, error);
      }
    };
    for (const url of importedUrls) await collect(url);
    if (fontFaceRules.length === 0) return [];

    const combinedCss = fontFaceRules.join("\n");
    const style = document.createElement("style");
    style.setAttribute("data-od-pptx-imported-font-faces", "true");
    style.textContent = combinedCss;
    document.head.appendChild(style);

    const fontsByFamily = new Map<string, Set<string>>();
    for (const rule of combinedCss.match(/@font-face\s*\{[\s\S]*?\}/giu) || []) {
      const family = rule
        .match(/font-family\s*:\s*([^;]+)/iu)?.[1]
        ?.trim()
        .replace(/^['"]|['"]$/g, "");
      if (!family) continue;
      const urls = fontsByFamily.get(family) || new Set<string>();
      for (const match of rule.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/giu)) {
        if (match[1]) urls.add(match[1]);
      }
      if (urls.size > 0) fontsByFamily.set(family, urls);
    }
    return Array.from(fontsByFamily, ([name, urls]) => ({ name, urls: Array.from(urls) }));
  }

  function isTransparentColor(input: string): boolean {
    const value = input.trim().toLowerCase();
    return value === "" || value === "transparent" || value === "rgba(0, 0, 0, 0)";
  }

  function firstCssColor(input: string): string | null {
    const rgb = input.match(/rgba?\([^)]*\)/i);
    if (rgb) return rgb[0];
    const hex = input.match(/#[0-9a-f]{3,8}\b/i);
    return hex ? hex[0] : null;
  }

  function effectiveBackgroundStyle(slide: HTMLElement): {
    color: string;
    image: string;
    position: string;
    size: string;
    repeat: string;
    origin: string;
    clip: string;
  } | null {
    const candidates: Element[] = [];
    for (let el: Element | null = slide; el; el = el.parentElement) candidates.push(el);
    if (document.body && !candidates.includes(document.body)) candidates.push(document.body);
    if (document.documentElement && !candidates.includes(document.documentElement)) {
      candidates.push(document.documentElement);
    }

    for (const el of candidates) {
      const style = getComputedStyle(el);
      const bgColor = style.backgroundColor;
      const bgImage = style.backgroundImage;
      const hasImage = bgImage && bgImage !== "none";
      const hasColor = bgColor && !isTransparentColor(bgColor);
      const fallbackColor = hasColor ? bgColor : firstCssColor(bgImage);
      if (!hasImage && !hasColor) continue;
      if (!fallbackColor) continue;
      return {
        color: fallbackColor,
        image: bgImage,
        position: style.backgroundPosition,
        size: style.backgroundSize,
        repeat: style.backgroundRepeat,
        origin: style.backgroundOrigin,
        clip: style.backgroundClip,
      };
    }
    return null;
  }

  function ensureExplicitSlideBackgrounds(slides: HTMLElement[]): void {
    for (const slide of slides) {
      slide.querySelectorAll(":scope > [data-od-pptx-bg]").forEach((el) => el.remove());
      // preserveLayeredGradientBackgrounds owns supported layered backgrounds
      // authored directly on a slide. Adding the usual fallback shim as well
      // would export the same semi-transparent texture twice.
      if (hasRasterizableLayeredGradientBackground(getComputedStyle(slide).backgroundImage || "")) {
        continue;
      }
      const background = effectiveBackgroundStyle(slide);
      if (!background) continue;

      const bg = document.createElement("div");
      bg.setAttribute("data-od-pptx-bg", "true");
      bg.setAttribute("aria-hidden", "true");
      bg.style.setProperty("position", "absolute", "important");
      bg.style.setProperty("inset", "0", "important");
      bg.style.setProperty("z-index", slideBackgroundSortSlot, "important");
      bg.style.setProperty("pointer-events", "none", "important");
      bg.style.setProperty("background-color", background.color, "important");
      bg.style.setProperty("background-image", background.image, "important");
      bg.style.setProperty("background-position", background.position, "important");
      bg.style.setProperty("background-size", background.size, "important");
      bg.style.setProperty("background-repeat", background.repeat, "important");
      bg.style.setProperty("background-origin", background.origin, "important");
      bg.style.setProperty("background-clip", background.clip, "important");

      const style = getComputedStyle(slide);
      if (style.position === "static") slide.style.setProperty("position", "relative", "important");
      if (style.overflow === "visible") slide.style.setProperty("overflow", "hidden", "important");
      slide.style.setProperty("background-color", background.color, "important");
      Array.from(slide.children).forEach((child) => {
        if (child.getAttribute("data-od-pptx-bg") === "true") return;
        const childStyle = getComputedStyle(child as Element);
        const element = child as HTMLElement;
        if (childStyle.position === "static") {
          element.style.setProperty("position", "relative", "important");
        }
        if (childStyle.zIndex === "auto") {
          element.style.setProperty("z-index", "1", "important");
        }
      });
      slide.prepend(bg);
    }
  }

  function splitCssBackgroundLayers(input: string): string[] {
    const layers: string[] = [];
    let current = "";
    let depth = 0;
    let quote = "";
    let escaped = false;
    for (const char of input) {
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }
      if (char === "\\") {
        current += char;
        escaped = true;
        continue;
      }
      if (quote) {
        current += char;
        if (char === quote) quote = "";
        continue;
      }
      if (char === '"' || char === "'") {
        current += char;
        quote = char;
        continue;
      }
      if (char === "(") depth += 1;
      else if (char === ")") depth = Math.max(0, depth - 1);
      if (char === "," && depth === 0) {
        if (current.trim()) layers.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    if (current.trim()) layers.push(current.trim());
    return layers;
  }

  function hasRasterizableLayeredGradientBackground(input: string): boolean {
    const layers = splitCssBackgroundLayers(input);
    if (layers.length < 2) return false;
    // Keep this allowlist aligned with html2canvas 1.4.1's
    // SUPPORTED_IMAGE_FUNCTIONS. In particular, repeating and conic gradients
    // are discarded by its clone parser and must remain on the authored node.
    const supportedGradient =
      /^(?:(?:-(?:moz|ms|o|webkit)-)?(?:linear|radial)-gradient|-webkit-gradient)\(/i;
    return layers.every((layer) => supportedGradient.test(layer));
  }

  function hasTextBackgroundClip(input: string): boolean {
    return splitCssBackgroundLayers(input).some((layer) => layer.toLowerCase() === "text");
  }

  function hasNonNormalBlendMode(input: string): boolean {
    const mode = (input || "normal").trim().toLowerCase();
    return mode !== "" && mode !== "normal";
  }

  function hasBackdropFilter(style: CSSStyleDeclaration): boolean {
    const value = (
      style.backdropFilter ||
      style.getPropertyValue?.("backdrop-filter") ||
      style.getPropertyValue?.("-webkit-backdrop-filter") ||
      "none"
    ).trim().toLowerCase();
    return value !== "" && value !== "none";
  }

  function hasCssMask(style: CSSStyleDeclaration): boolean {
    const maskImages = [
      style.maskImage || style.getPropertyValue("mask-image"),
      style.webkitMaskImage || style.getPropertyValue("-webkit-mask-image"),
    ];
    return maskImages.some((image) => image && image.trim().toLowerCase() !== "none");
  }

  function setCaptureBoxStyles(background: HTMLElement, style: CSSStyleDeclaration): void {
    background.style.setProperty("box-sizing", "border-box", "important");
    background.style.setProperty(
      "padding",
      `${style.paddingTop || "0px"} ${style.paddingRight || "0px"} ${style.paddingBottom || "0px"} ${style.paddingLeft || "0px"}`,
      "important",
    );
    background.style.setProperty(
      "border-width",
      `${style.borderTopWidth || "0px"} ${style.borderRightWidth || "0px"} ${style.borderBottomWidth || "0px"} ${style.borderLeftWidth || "0px"}`,
      "important",
    );
    background.style.setProperty("border-style", "solid", "important");
    background.style.setProperty("border-color", "transparent", "important");
    background.style.setProperty("border-radius", style.borderRadius || "0px", "important");
    background.style.setProperty("box-shadow", style.boxShadow || "none", "important");
    background.style.setProperty("background-color", style.backgroundColor, "important");
    background.style.setProperty("background-image", style.backgroundImage, "important");
    background.style.setProperty("background-position", style.backgroundPosition, "important");
    background.style.setProperty("background-size", style.backgroundSize, "important");
    background.style.setProperty("background-repeat", style.backgroundRepeat, "important");
    background.style.setProperty("background-origin", style.backgroundOrigin, "important");
    background.style.setProperty("background-clip", style.backgroundClip, "important");
    background.style.setProperty("background-blend-mode", style.backgroundBlendMode || "normal", "important");
    background.style.setProperty("clip-path", style.clipPath || "none", "important");
    background.style.setProperty("filter", style.filter || "none", "important");
    const backdropFilter =
      style.backdropFilter ||
      style.getPropertyValue?.("backdrop-filter") ||
      style.getPropertyValue?.("-webkit-backdrop-filter") ||
      "none";
    background.style.setProperty("backdrop-filter", backdropFilter, "important");
    background.style.setProperty("-webkit-backdrop-filter", backdropFilter, "important");
    background.style.setProperty("opacity", style.opacity || "1", "important");
    background.style.setProperty("mix-blend-mode", style.mixBlendMode || "normal", "important");
    background.style.setProperty("transform", style.transform || "none", "important");
    background.style.setProperty("transform-origin", style.transformOrigin || "50% 50%", "important");
    background.style.setProperty("transform-box", style.transformBox || "view-box", "important");
    background.style.setProperty("translate", style.translate || "none", "important");
    background.style.setProperty("rotate", style.rotate || "none", "important");
    background.style.setProperty("scale", style.scale || "none", "important");
  }

  function preserveLayeredPseudoGradientBackgrounds(elements: Set<HTMLElement>): void {
    let nativePseudoBackgroundStyle: HTMLStyleElement | null = null;
    const neutralizeNativePseudoBackground = (
      element: HTMLElement,
      pseudo: "::before" | "::after",
    ): void => {
      element.setAttribute(
        pseudo === "::before"
          ? "data-od-pptx-rasterized-before-background"
          : "data-od-pptx-rasterized-after-background",
        "true",
      );
      if (nativePseudoBackgroundStyle) return;
      nativePseudoBackgroundStyle = document.createElement("style");
      nativePseudoBackgroundStyle.textContent = `
        [data-od-pptx-rasterized-before-background="true"]::before,
        [data-od-pptx-rasterized-after-background="true"]::after{
          background-color:transparent!important;
        }
      `;
      document.head.append(nativePseudoBackgroundStyle);
    };
    for (const element of elements) {
      for (const pseudo of ["::before", "::after"] as const) {
        const style = getComputedStyle(element, pseudo);
        const content = (style.content || "").trim().toLowerCase();
        const isGenerated = content !== "" && content !== "none" && content !== "normal" && style.display !== "none";
        const hasMaterializedCapture = Array.from(element.children).some(
          (child) => child.getAttribute("data-od-pptx-materialized-pseudo") === pseudo,
        );
        if (hasMaterializedCapture) {
          // The Chromium helper already owns the computed fallback color. Keep
          // native pseudo text and borders, but prevent dom-to-pptx from
          // emitting that same color as an opaque fill above the captured PNG.
          neutralizeNativePseudoBackground(element, pseudo);
          continue;
        }
        if (
          !isGenerated ||
          (style.position !== "absolute" && style.position !== "fixed") ||
          !hasRasterizableLayeredGradientBackground(style.backgroundImage || "") ||
          // The html2canvas custom-element path has no blend-mode parser and
          // cannot reproduce this background without its authored backdrop.
          hasNonNormalBlendMode(style.mixBlendMode || "") ||
          hasBackdropFilter(style) ||
          hasTextBackgroundClip(style.backgroundClip || "") ||
          hasTextBackgroundClip(style.webkitBackgroundClip || "") ||
          hasCssMask(style)
        ) {
          continue;
        }

        // dom-to-pptx only reads pseudo-element content, color, and border. A
        // background-only custom element enters its existing html2canvas path,
        // preserving the layered image while the native pseudo handling keeps
        // any authored text or border editable.
        const background = document.createElement("od-pptx-layered-background");
        background.setAttribute("data-od-pptx-layered-bg", "true");
        background.setAttribute("data-od-pptx-pseudo", pseudo);
        background.setAttribute("aria-hidden", "true");
        background.style.setProperty("position", style.position, "important");
        background.style.setProperty("top", style.top || "auto", "important");
        background.style.setProperty("right", style.right || "auto", "important");
        background.style.setProperty("bottom", style.bottom || "auto", "important");
        background.style.setProperty("left", style.left || "auto", "important");
        background.style.setProperty("width", style.width || "auto", "important");
        background.style.setProperty("height", style.height || "auto", "important");
        // Keep the raster background immediately below the converter's fixed
        // native pseudo text/border slots. Native ::after always sorts at the
        // host's z=0 Infinity slot, regardless of its authored z-index.
        background.style.setProperty(
          "z-index",
          pseudo === "::before" ? pseudoBeforeBackgroundSortSlot : pseudoAfterBackgroundSortSlot,
          "important",
        );
        background.style.setProperty("pointer-events", "none", "important");
        setCaptureBoxStyles(background, style);

        // The converter keeps pseudo content and borders editable, but it also
        // emits a native solid fill from background-color while ignoring the
        // layered background-image. The raster helper already owns both, so
        // neutralize only that native fallback after copying its computed color.
        neutralizeNativePseudoBackground(element, pseudo);

        if (pseudo === "::before") element.prepend(background);
        else element.append(background);
      }
    }
  }

  function suppressCapturedSlidePaint(slide: HTMLElement, capture: HTMLElement): void {
    // dom-to-pptx needs the slide itself to remain measurable as the export
    // root. Keep only the replacement image visible inside it and neutralize
    // effects that Chromium already baked into that whole-paint capture.
    slide.querySelectorAll<HTMLElement>("*").forEach((descendant) => {
      if (descendant !== capture && !capture.contains(descendant)) {
        descendant.style.setProperty("display", "none", "important");
      }
    });
    slide.style.setProperty("background", "transparent", "important");
    slide.style.setProperty("border", "0", "important");
    slide.style.setProperty("box-shadow", "none", "important");
    slide.style.setProperty("clip-path", "none", "important");
    slide.style.setProperty("color", "transparent", "important");
    slide.style.setProperty("filter", "none", "important");
    slide.style.setProperty("backdrop-filter", "none", "important");
    slide.style.setProperty("-webkit-backdrop-filter", "none", "important");
    slide.style.setProperty("mask-image", "none", "important");
    slide.style.setProperty("-webkit-mask-image", "none", "important");
    slide.style.setProperty("mix-blend-mode", "normal", "important");
    slide.style.setProperty("opacity", "1", "important");
    slide.style.setProperty("outline", "none", "important");
    slide.style.setProperty("text-shadow", "none", "important");
    slide.style.setProperty("-webkit-text-fill-color", "transparent", "important");
    slide.style.setProperty("transform", "none", "important");
    slide.style.setProperty("translate", "none", "important");
    slide.style.setProperty("rotate", "none", "important");
    slide.style.setProperty("scale", "none", "important");
  }

  function preserveLayeredGradientBackgrounds(slides: HTMLElement[]): void {
    if (document.querySelectorAll("[data-od-pptx-suppress-before], [data-od-pptx-suppress-after]").length > 0) {
      const suppressedPseudoStyle = document.createElement("style");
      suppressedPseudoStyle.textContent = `
        [data-od-pptx-suppress-before="true"]::before,
        [data-od-pptx-suppress-after="true"]::after{
          content:none!important;
          display:none!important;
          border:0!important;
          background:none!important;
        }
      `;
      document.head.append(suppressedPseudoStyle);
    }
    const slideElements = new Set(slides);
    const elements = new Set<HTMLElement>();
    for (const slide of slides) {
      elements.add(slide);
      slide.querySelectorAll<HTMLElement>("*").forEach((el) => elements.add(el));
    }

    const capturedCompositingMembers = new Set<HTMLElement>();
    const capturedEntirePaintRoots = new Set<HTMLElement>();
    for (const element of elements) {
      if (element.getAttribute("data-od-pptx-compositing-context") !== "true") continue;
      const captureId = element.getAttribute("data-od-pptx-layer-capture-id") || "";
      const captured = layeredBackgrounds[captureId];
      if (!captured) continue;
      const slide = slides[captured.slideIndex];
      if (!slide) continue;

      const style = getComputedStyle(element);
      // Export the flattened context beside its source. Ordinary members lose
      // only the backgrounds already present in the PNG; members whose own
      // compositor effect required whole-paint capture are suppressed entirely.
      const image = document.createElement("img");
      image.setAttribute("data-od-pptx-layered-bg", "true");
      image.setAttribute("aria-hidden", "true");
      image.src = captured.dataUrl;
      image.style.setProperty("position", "absolute", "important");
      image.style.setProperty("left", `${captured.left}px`, "important");
      image.style.setProperty("top", `${captured.top}px`, "important");
      image.style.setProperty("width", `${captured.width}px`, "important");
      image.style.setProperty("height", `${captured.height}px`, "important");
      image.style.setProperty("display", "block", "important");
      image.style.setProperty("object-fit", "fill", "important");
      image.style.setProperty("pointer-events", "none", "important");
      image.style.setProperty("z-index", style.zIndex || "auto", "important");
      image.getBoundingClientRect = () => {
        const slideRect = slide.getBoundingClientRect();
        const left = slideRect.left + captured.left;
        const top = slideRect.top + captured.top;
        return {
          bottom: top + captured.height,
          height: captured.height,
          left,
          right: left + captured.width,
          top,
          width: captured.width,
          x: left,
          y: top,
          toJSON: () => ({}),
        } as DOMRect;
      };
      if (element === slide) slide.prepend(image);
      else element.parentElement?.insertBefore(image, element);
      document
        .querySelectorAll<HTMLElement>(`[data-od-pptx-compositing-member="${captureId}"]`)
        .forEach((member) => {
          if (
            member.hasAttribute("data-od-pptx-materialized-pseudo") ||
            member.hasAttribute("data-od-pptx-capture-entire-element")
          ) {
            if (member === slide) suppressCapturedSlidePaint(member, image);
            else member.style.setProperty("display", "none", "important");
            capturedEntirePaintRoots.add(member);
          } else {
            member.style.setProperty("background-image", "none", "important");
            member.style.setProperty("background-color", "transparent", "important");
          }
          capturedCompositingMembers.add(member);
        });
    }

    for (const element of elements) {
      if (capturedCompositingMembers.has(element)) continue;
      if (Array.from(capturedEntirePaintRoots).some((root) => root.contains(element))) continue;
      const style = getComputedStyle(element);
      const captureId = element.getAttribute("data-od-pptx-layer-capture-id") || "";
      const captured = layeredBackgrounds[captureId];
      if (
        !hasRasterizableLayeredGradientBackground(style.backgroundImage || "") ||
        (!captured && (
          hasTextBackgroundClip(style.backgroundClip || "") ||
          hasTextBackgroundClip(style.webkitBackgroundClip || "")
        )) ||
        // The custom-element fallback uses html2canvas, which cannot preserve
        // masks. Production exports provide a Chromium capture for these.
        (hasCssMask(style) && !captured)
      ) {
        continue;
      }
      const isStaticNestedElement = style.position === "static" && !slideElements.has(element);

      if (captured) {
        const slide = slides[captured.slideIndex];
        if (!slide) continue;
        const materializedPseudo = element.getAttribute("data-od-pptx-materialized-pseudo");
        const capturesEntireElement = element.getAttribute("data-od-pptx-capture-entire-element") === "true";
        const background = document.createElement("img");
        background.setAttribute("data-od-pptx-layered-bg", "true");
        if (materializedPseudo) background.setAttribute("data-od-pptx-pseudo", materializedPseudo);
        background.setAttribute("aria-hidden", "true");
        background.src = captured.dataUrl;
        background.style.setProperty("position", "absolute", "important");
        background.style.setProperty("left", `${captured.left}px`, "important");
        background.style.setProperty("top", `${captured.top}px`, "important");
        background.style.setProperty("width", `${captured.width}px`, "important");
        background.style.setProperty("height", `${captured.height}px`, "important");
        background.style.setProperty("display", "block", "important");
        background.style.setProperty("object-fit", "fill", "important");
        background.style.setProperty("pointer-events", "none", "important");
        background.style.setProperty(
          "z-index",
          element === slide
            ? slideBackgroundSortSlot
            : materializedPseudo === "::before"
              ? pseudoBeforeBackgroundSortSlot
              : materializedPseudo === "::after"
                ? pseudoAfterBackgroundSortSlot
                : style.zIndex || "auto",
          "important",
        );
        background.getBoundingClientRect = () => {
          const slideRect = slide.getBoundingClientRect();
          const left = slideRect.left + captured.left;
          const top = slideRect.top + captured.top;
          return {
            bottom: top + captured.height,
            height: captured.height,
            left,
            right: left + captured.width,
            top,
            width: captured.width,
            x: left,
            y: top,
            toJSON: () => ({}),
          } as DOMRect;
        };
        element.style.setProperty("background-image", "none", "important");
        element.style.setProperty("background-color", "transparent", "important");
        if (element === slide) slide.prepend(background);
        else element.parentElement?.insertBefore(background, element);
        if (materializedPseudo || capturesEntireElement) {
          // The helper exists only to give Chromium a real capture target. Its
          // raster image now owns that paint; leaving the custom element in the
          // converter walk would emit the same pseudo as a second media layer.
          if (element === slide) suppressCapturedSlidePaint(element, background);
          else element.style.setProperty("display", "none", "important");
          capturedEntirePaintRoots.add(element);
        }
        continue;
      }

      // dom-to-pptx's native gradient parser assumes one linear-gradient and
      // greedily merges layered gradients into one invalid SVG. In test-only
      // callers without the main-process capture seam, retain the existing
      // custom-element fallback for unmasked layers.
      const background = document.createElement("od-pptx-layered-background");
      background.setAttribute("data-od-pptx-layered-bg", "true");
      background.setAttribute("aria-hidden", "true");
      background.style.setProperty("position", "absolute", "important");
      background.style.setProperty("inset", "0", "important");
      background.style.setProperty(
        "z-index",
        slideElements.has(element) ? slideBackgroundSortSlot : "0",
        "important",
      );
      background.style.setProperty("pointer-events", "none", "important");
      setCaptureBoxStyles(background, style);

      if (isStaticNestedElement) {
        // A static panel and its absolutely positioned descendants share the
        // same outer containing block. Anchor only the capture child to the
        // panel's measured border box so the authored panel never becomes a
        // new containing block.
        background.style.setProperty("inset", "auto", "important");
        background.style.setProperty("left", `${element.offsetLeft}px`, "important");
        background.style.setProperty("top", `${element.offsetTop}px`, "important");
        background.style.setProperty("width", `${element.offsetWidth}px`, "important");
        background.style.setProperty("height", `${element.offsetHeight}px`, "important");
      } else {
        // ensureExplicitSlideBackgrounds already establishes this containing-
        // block contract for slides; positioned authored elements already own
        // the absolutely positioned capture child.
        if (style.position === "static") element.style.setProperty("position", "relative", "important");
      }

      element.style.setProperty("background-image", "none", "important");
      element.style.setProperty("background-color", "transparent", "important");
      element.prepend(background);
    }

    preserveLayeredPseudoGradientBackgrounds(elements);
  }

  function stabilizeLargeSingleLineText(slides: HTMLElement[]): void {
    for (const slide of slides) {
      slide.querySelectorAll<HTMLElement>("*").forEach((el) => {
        const rawText = el.innerText || el.textContent || "";
        const text = rawText.replace(/\s+/g, " ").trim();
        if (!text || rawText.includes("\n")) return;

        const style = getComputedStyle(el);
        const fontSizePx = Number.parseFloat(style.fontSize);
        if (!Number.isFinite(fontSizePx) || fontSizePx < 96) return;

        const lineHeightPx = Number.parseFloat(style.lineHeight);
        if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0 || lineHeightPx > fontSizePx * 1.05) return;

        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) return;

        const justify =
          style.textAlign === "center" || style.textAlign === "-webkit-center"
            ? "center"
            : style.textAlign === "right" || style.textAlign === "end"
              ? "flex-end"
              : "flex-start";

        el.style.setProperty("display", "flex", "important");
        el.style.setProperty("align-items", "center", "important");
        el.style.setProperty("justify-content", justify, "important");
        el.style.setProperty("width", `${rect.width}px`, "important");
        el.style.setProperty("height", `${rect.height}px`, "important");
        el.style.setProperty("line-height", "normal", "important");
        el.style.setProperty("white-space", "nowrap", "important");
        el.style.setProperty("overflow", "visible", "important");
      });
    }
  }

  // An authored `<br>` is a deliberate line boundary. Prevent PowerPoint/WPS
  // from applying a second soft wrap inside either line when its font metrics
  // differ slightly from Chromium's. dom-to-pptx maps `white-space: nowrap` to
  // `wrap: false` while retaining explicit breakLine runs.
  function stabilizeAuthoredHeadingLines(slides: HTMLElement[]): void {
    for (const slide of slides) {
      slide.querySelectorAll<HTMLElement>("h1, h2, h3").forEach((heading) => {
        if (heading.querySelector("br")) {
          heading.style.setProperty("white-space", "nowrap", "important");
        }
      });
    }
  }

  // Reorder each text run's font-family so CJK runs name their CJK typeface (not
  // the Latin webfont that leads our template stacks) before dom-to-pptx reads it,
  // so PowerPoint/WPS/Keynote all resolve the same real font. See
  // cjkPromotedFontFamily for the why. Keyed on the element that directly owns the
  // text so a container that only holds Latin markup is never rewritten. Decide on
  // the element's COMBINED direct text: bilingual markup often splits one element
  // across text nodes (`Product Launch<br>产品发布`, `Welcome <strong>…</strong> 欢迎`),
  // so a later CJK chunk must still win even when a Latin chunk comes first.
  function promoteCjkTypefaces(slides: HTMLElement[]): void {
    const touched = new Set<HTMLElement>();
    for (const slide of slides) {
      const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement;
        if (!el || touched.has(el)) continue;
        touched.add(el);
        let combined = "";
        for (const child of el.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) combined += child.nodeValue || "";
        }
        if (!combined.trim()) continue;
        const promoted = cjkPromotedFontFamily(getComputedStyle(el).fontFamily, combined);
        if (promoted) el.style.setProperty("font-family", promoted, "important");
      }
    }
  }

  try {
    const w = window as unknown as {
      domToPptx?: { exportToPptx: (target: unknown, options: unknown) => Promise<Blob> };
    };
    if (!w.domToPptx || typeof w.domToPptx.exportToPptx !== "function") {
      return { error: "dom-to-pptx engine did not load" };
    }
    const slides = Array.prototype.slice
      .call(document.querySelectorAll(slideSelector))
      .filter((el) => !(el as HTMLElement).closest(".mini-slide, .overview, .notes-overlay, .thumb"));
    if (slides.length === 0) return { error: "no slides to export" };
    const importedFonts = await exposeImportedFontFaces();
    await document.fonts?.ready;
    if (phase !== "export-prepared") {
      ensureExplicitSlideBackgrounds(slides as HTMLElement[]);
      stabilizeLargeSingleLineText(slides as HTMLElement[]);
      stabilizeAuthoredHeadingLines(slides as HTMLElement[]);
      promoteCjkTypefaces(slides as HTMLElement[]);
      // dom-to-pptx assumes `node.className` is a string, but SVG elements expose
      // an SVGAnimatedString, so its DOM walk throws on decks containing inline SVG.
      // Normalize those to a plain string in this throwaway render window.
      document.querySelectorAll("*").forEach((el) => {
        const cn = (el as { className?: unknown }).className;
        if (cn != null && typeof cn !== "string") {
          try {
            Object.defineProperty(el, "className", {
              value: (cn as { baseVal?: string }).baseVal ?? "",
              configurable: true,
              writable: true,
            });
          } catch {
            // Leave it; dom-to-pptx may still handle this node.
          }
        }
      });
    }
    if (phase === "prepare") return { prepared: true };
    preserveLayeredGradientBackgrounds(slides as HTMLElement[]);
    const blob = await w.domToPptx.exportToPptx(slides, {
      fileName: "deck.pptx",
      skipDownload: true,
      autoEmbedFonts: true,
      ...(importedFonts.length > 0 ? { fonts: importedFonts } : {}),
      svgAsVector: true,
    });
    if (!blob || typeof (blob as Blob).arrayBuffer !== "function") {
      return { error: "dom-to-pptx returned no blob" };
    }
    const bytes = new Uint8Array(await (blob as Blob).arrayBuffer());
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
    }
    return { b64: btoa(binary) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

// Deck-only DOM prep (run only once we've decided this is a deck): hide presenter
// chrome, switch any <deck-stage> runtime to authored (1:1) size, and freeze
// animations/transitions so each slide (and its reveal-on-show inner elements,
// e.g. `.slide.visible .reveal`) reaches its final state.
export function prepareDeckStage(hideSelector: string, stageSelector: string): void {
  document.querySelectorAll(hideSelector).forEach((el) => {
    (el as HTMLElement).style.setProperty("display", "none", "important");
  });
  // The repo's <deck-stage> runtime fits its canvas to the viewport with
  // `transform: scale(...)` by default and documents that export must set the
  // `noscale` attribute so the DOM is captured at the authored slide size. Set
  // it here (no-op for plain `.slide` decks that have no <deck-stage>), or a
  // deck whose authored canvas differs from the 1920x1080 capture viewport would
  // be measured + captured at the preview-scaled size instead of 1:1.
  document.querySelectorAll(stageSelector).forEach((el) => {
    el.setAttribute("noscale", "");
    const style = (el as HTMLElement).style;
    style.setProperty("transform", "none", "important");
    style.setProperty("transform-origin", "top left", "important");
  });
  const s = document.createElement("style");
  s.textContent =
    "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}";
  (document.head || document.documentElement).appendChild(s);
}

// Deck-only: pin to the measured WxH stage so each slide captures
// deterministically. NOT applied in page mode — an ordinary page must keep its
// natural width/height.
function pinDeckStage(w: number, h: number, stageSelector: string): void {
  const style = document.createElement("style");
  style.textContent =
    `html,body{margin:0!important;padding:0!important;width:${w}px!important;height:${h}px!important;overflow:hidden!important}` +
    `.deck,${stageSelector}{width:${w}px!important;height:${h}px!important}`;
  document.head.appendChild(style);
}

// Serialized into the page: measures the authored slide box. Prefers a slide
// that already has a non-zero layout rect (covers decks that hide inactive
// slides via opacity/visibility); if every slide is display:none, force-measures
// the first one off-screen. Returns the authored DIP size or null.
function measureSlide(slideSelector: string, stageSelector: string): { w: number; h: number } | null {
  function positiveCssNumber(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) && value > 1 ? value : null;
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    const match = /^(\d+(?:\.\d+)?)(?:px)?$/i.exec(trimmed);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isFinite(n) && n > 1 ? n : null;
  }
  function sizePair(w: unknown, h: unknown): { w: number; h: number } | null {
    const width = positiveCssNumber(w);
    const height = positiveCssNumber(h);
    return width != null && height != null ? { w: width, h: height } : null;
  }
  function deckStageAuthoredSize(stage: HTMLElement): { w: number; h: number } | null {
    const byProp = sizePair(
      (stage as unknown as { designWidth?: unknown }).designWidth,
      (stage as unknown as { designHeight?: unknown }).designHeight,
    );
    if (byProp) return byProp;
    const byAttr = sizePair(stage.getAttribute("width"), stage.getAttribute("height"));
    if (byAttr) return byAttr;
    const byStyle = sizePair(stage.style?.width, stage.style?.height);
    if (byStyle) return byStyle;
    const computed = window.getComputedStyle?.(stage);
    const byComputed = computed ? sizePair(computed.width, computed.height) : null;
    if (byComputed) return byComputed;
    return sizePair(stage.offsetWidth, stage.offsetHeight);
  }
  function measureAuthored(el: HTMLElement): { w: number; h: number } | null {
    const stage = el.closest(stageSelector) as HTMLElement | null;
    const stageSize = stage ? deckStageAuthoredSize(stage) : null;
    if (stageSize) return stageSize;
    const attrSize = sizePair(el.getAttribute("width"), el.getAttribute("height"));
    if (attrSize) return attrSize;
    const styleSize = sizePair(el.style?.width, el.style?.height);
    if (styleSize) return styleSize;
    const computed = window.getComputedStyle?.(el);
    const computedSize = computed ? sizePair(computed.width, computed.height) : null;
    if (computedSize) return computedSize;
    const offsetSize = sizePair(el.offsetWidth, el.offsetHeight);
    if (offsetSize) return offsetSize;
    return null;
  }

  const slides = Array.prototype.slice
    .call(document.querySelectorAll(slideSelector))
    .filter((el) => !(el as HTMLElement).closest(".mini-slide, .overview, .notes-overlay, .thumb"));
  if (slides.length === 0) return null;
  for (const node of slides) {
    const authored = measureAuthored(node as HTMLElement);
    if (authored) return authored;
    const r = (node as HTMLElement).getBoundingClientRect();
    if (r.width > 1 && r.height > 1) return { w: r.width, h: r.height };
  }
  const el = slides[0] as HTMLElement;
  const prev = el.style.cssText;
  el.style.setProperty("display", "block", "important");
  el.style.setProperty("visibility", "hidden", "important");
  const authored = measureAuthored(el);
  if (authored) {
    el.style.cssText = prev;
    return authored;
  }
  const rect = el.getBoundingClientRect();
  el.style.cssText = prev;
  return rect.width > 1 && rect.height > 1 ? { w: rect.width, h: rect.height } : null;
}

// Exported for focused tests. Reads the authored, untransformed slide box: first
// from a wrapping <deck-stage> design canvas, then from declared element sizes,
// then from layout dimensions that transforms do not affect. getBoundingClientRect
// is intentionally left to the caller as a last resort because it includes
// fit-to-viewport transforms.
export function measureAuthoredSlideBox(el: HTMLElement): { w: number; h: number } | null {
  const stage = el.closest(DECK_STAGE_SELECTOR) as HTMLElement | null;
  const stageSize = stage ? deckStageAuthoredSize(stage) : null;
  if (stageSize) return stageSize;

  const attrSize = sizePair(el.getAttribute("width"), el.getAttribute("height"));
  if (attrSize) return attrSize;

  const styleSize = sizePair(el.style?.width, el.style?.height);
  if (styleSize) return styleSize;

  const view = el.ownerDocument?.defaultView;
  const computed = view?.getComputedStyle?.(el);
  const computedSize = computed ? sizePair(computed.width, computed.height) : null;
  if (computedSize) return computedSize;

  const offsetSize = sizePair(el.offsetWidth, el.offsetHeight);
  if (offsetSize) return offsetSize;

  return null;
}

function deckStageAuthoredSize(stage: HTMLElement): { w: number; h: number } | null {
  const byProp = sizePair(
    (stage as unknown as { designWidth?: unknown }).designWidth,
    (stage as unknown as { designHeight?: unknown }).designHeight,
  );
  if (byProp) return byProp;
  const byAttr = sizePair(stage.getAttribute("width"), stage.getAttribute("height"));
  if (byAttr) return byAttr;
  const byStyle = sizePair(stage.style?.width, stage.style?.height);
  if (byStyle) return byStyle;
  const view = stage.ownerDocument?.defaultView;
  const computed = view?.getComputedStyle?.(stage);
  const byComputed = computed ? sizePair(computed.width, computed.height) : null;
  if (byComputed) return byComputed;
  return sizePair(stage.offsetWidth, stage.offsetHeight);
}

function sizePair(w: unknown, h: unknown): { w: number; h: number } | null {
  const width = positiveCssNumber(w);
  const height = positiveCssNumber(h);
  return width != null && height != null ? { w: width, h: height } : null;
}

function positiveCssNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 1 ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^(\d+(?:\.\d+)?)(?:px)?$/i.exec(trimmed);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 1 ? n : null;
}

// Restores the live slide moved into the capture layer before the next slide is
// selected. The temporary style overrides are capture-only and must not leak
// into later selector/index passes.
export function restoreActiveSlideCapture(): void {
  const layer = document.getElementById("__od_export_active_slide_capture") as
    | (HTMLElement & {
        __odSourceStyles?: Array<{ name: string; priority: string; value: string }>;
      })
    | null;
  if (!layer) return;
  const placeholder = document.getElementById("__od_export_active_slide_placeholder");
  const liveSlide = layer.firstElementChild?.firstElementChild as HTMLElement | null;
  if (placeholder?.parentNode && liveSlide) {
    placeholder.parentNode.moveBefore(liveSlide, placeholder);
    placeholder.remove();
    for (const { name, priority, value } of layer.__odSourceStyles ?? []) {
      if (value) liveSlide.style.setProperty(name, value, priority);
      else liveSlide.style.removeProperty(name);
    }
  }
  layer.remove();
}

// Returns a Promise that resolves after the style change has settled for two
// animation frames, so the caller can show + wait in a single round trip.
// Exported so focused tests can drive the real per-slide selection.
export function showSlide(slideSelector: string, index: number): Promise<{ x: number; y: number; w: number; h: number } | null> {
  restoreActiveSlideCapture();
  const slides = Array.prototype.slice
    .call(document.querySelectorAll(slideSelector))
    .filter((el) => !(el as HTMLElement).closest(".mini-slide, .overview, .notes-overlay, .thumb"));
  // Cover the common deck "active slide" conventions so the deck's own CSS shows
  // the slide (incl. visibility:hidden->visible and reveal animations), plus
  // inline overrides as a backstop for decks that hide via opacity/visibility.
  const activeClasses = ["active", "visible", "is-active", "current"];
  // The injected <deck-stage> fallback (packages/contracts/src/runtime/
  // deck-stage-fallback.ts) hides slotted slides with an `!important` shadow rule
  // and reveals ONLY the one carrying `data-od-deck-active`. We toggle exactly that
  // attribute. We do NOT also set the real deck-stage.js runtime's
  // `data-deck-active`: it is unnecessary for reveal (mechanism 1 below already
  // reveals that runtime's slides), and skipping it keeps the export from depending
  // on the prepareDeckStage() animation freeze to neutralize any authored
  // `[data-deck-active]`-keyed entrance motion.
  const activeAttributes = ["data-od-deck-active"];
  slides.forEach((node, k) => {
    const el = node as HTMLElement;
    const on = k === index;
    // Reveal the captured slide through the two mechanisms real decks actually use:
    //   1. Inline `!important` styles beat a deck's own NON-important hide rules —
    //      the real <deck-stage> runtime's `::slotted(*){visibility:hidden}` and
    //      class-based `.slide` decks — because importance wins outright there.
    //   2. The `data-od-deck-active` attribute is the ONLY thing that reveals the
    //      fallback, whose hide rule is `::slotted(*){visibility:hidden!important}`
    //      in its shadow root: a shadow-tree `!important` declaration beats an outer
    //      inline `!important` one (for `!important`, the inner context wins), so
    //      inline styles alone cannot reveal a fallback slide — the attribute can.
    el.style.setProperty("transition", "none", "important");
    el.style.setProperty("animation", "none", "important");
    el.style.setProperty("opacity", on ? "1" : "0", "important");
    el.style.setProperty("visibility", on ? "visible" : "hidden", "important");
    el.style.setProperty("pointer-events", on ? "auto" : "none", "important");
    el.style.setProperty("z-index", on ? "999" : "0", "important");
    activeClasses.forEach((c) => el.classList.toggle(c, on));
    activeAttributes.forEach((a) => el.toggleAttribute(a, on));
  });
  // Report where the active slide actually landed after two frames, so the
  // capturer can detect a slide that the deck keeps off-screen (e.g. a
  // horizontal carousel that paginates by translating a flex strip rather than
  // stacking slides in place) and restack it before capturing.
  return new Promise((resolve) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = slides[index] as HTMLElement | undefined;
        if (!el) return resolve(null);
        const r = el.getBoundingClientRect();
        resolve({ x: r.x, y: r.y, w: r.width, h: r.height });
      }),
    );
  });
}

// Serialized into the page: temporarily moves the live active slide into a
// capture-only layer for decks that position it outside the viewport (translated
// carousel strip). A state-preserving DOM move rather than cloning keeps
// canvas/WebGL bitmaps, media frames, iframe browsing state, and other runtime
// content continuously connected in the only paintable subtree. Align from its
// live rect after insertion: moving outside a translated parent drops that
// parent's transform, so reusing the source rect would apply the lost offset a
// second time.
export function restackActiveSlide(slideSelector: string, index: number, w: number, h: number): void {
  restoreActiveSlideCapture();
  const slides = Array.prototype.slice
    .call(document.querySelectorAll(slideSelector))
    .filter((el) => !(el as HTMLElement).closest(".mini-slide, .overview, .notes-overlay, .thumb"));
  const el = slides[index] as HTMLElement | undefined;
  if (!el) return;
  const layer = document.createElement("div");
  layer.id = "__od_export_active_slide_capture";
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    `width:${w}px`,
    `height:${h}px`,
    "margin:0",
    "padding:0",
    "overflow:hidden",
    "z-index:2147483647",
    "pointer-events:none",
  ].join("!important;") + "!important";

  const offset = document.createElement("div");
  offset.style.cssText = [
    "position:absolute",
    "left:0",
    "top:0",
    `width:${w}px`,
    `height:${h}px`,
    "transform-origin:top left",
  ].join("!important;") + "!important";

  const sourceStyleNames = ["opacity", "visibility", "pointer-events", "z-index"];
  (layer as typeof layer & {
    __odSourceStyles: Array<{ name: string; priority: string; value: string }>;
  }).__odSourceStyles = sourceStyleNames.map((name) => ({
    name,
    priority: el.style.getPropertyPriority(name),
    value: el.style.getPropertyValue(name),
  }));
  const placeholder = document.createElement("template");
  placeholder.id = "__od_export_active_slide_placeholder";
  el.before(placeholder);
  layer.appendChild(offset);
  document.body.appendChild(layer);
  el.style.setProperty("opacity", "1", "important");
  el.style.setProperty("visibility", "visible", "important");
  el.style.setProperty("pointer-events", "none", "important");
  el.style.setProperty("z-index", "2147483647", "important");
  offset.moveBefore(el, null);
  const liveRect = el.getBoundingClientRect();
  offset.style.setProperty("transform", activeSlideCaptureOffsetTransform(liveRect), "important");
}
