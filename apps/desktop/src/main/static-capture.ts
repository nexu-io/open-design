import type { BrowserWindow } from "electron";

// Everything needed to turn a live, animating page into ONE reproducible
// frame. Shared by the long-image export (which freezes motion before it
// scroll-stitches) and by the first-viewport thumbnail (which additionally
// hides the caret/cursor and pins the page to the top).
//
// Deliberately NOT shared with deck-capture's `preparePageForCapture`: that
// helper scrolls the whole document one viewport at a time to prewarm lazy
// content, which is exactly the cost a thumbnail must not pay — it would make
// a chat card's render time scale with the length of the page it is covering.

/**
 * Zero out declarative motion. Every capture path wants this: a transition
 * caught mid-flight renders a half-faded element, and `scroll-behavior:smooth`
 * turns a programmatic `scrollTo` into an animation the capture races.
 *
 * Injected as `!important` on `*` (plus both pseudo-elements) because author
 * stylesheets routinely set these on `*` themselves.
 */
export const FROZEN_MOTION_CSS =
  "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important}";

/**
 * Thumbnail-only additions on top of {@link FROZEN_MOTION_CSS}.
 *
 * A cover is a still: a blinking text caret or a hovering cursor artefact is
 * the kind of difference that makes two captures of the same document disagree
 * byte-for-byte, which in turn makes "did this turn change anything?" unanswerable.
 */
export const STATIC_CAPTURE_CSS =
  `${FROZEN_MOTION_CSS}*{cursor:none!important;caret-color:transparent!important}`;

/** Marks the style element this module injects, so a page can be inspected. */
export const STATIC_CAPTURE_STYLE_ATTRIBUTE = "data-od-static-capture";

export type StaticCaptureFreezeSummary = {
  /** Animations that accepted `finish()` — they are parked on their end frame. */
  finished: number;
  /** Animations that refused it (infinite iteration count) and were paused. */
  paused: number;
};

export type StaticCaptureFreeze = StaticCaptureFreezeSummary & {
  /** True when Chromium was actually told the viewer prefers reduced motion. */
  reducedMotionEmulated: boolean;
  /**
   * Drops the CDP media emulation. Must run before the window is reused for
   * anything else; a destroyed window releases it anyway, so this is a
   * best-effort cleanup rather than a correctness requirement.
   */
  release: () => void;
};

/**
 * The script injected into the page. Kept dependency-free and expression-shaped
 * (an IIFE) so `executeJavaScript` can return its summary — and so a test can
 * run it against a stub page instead of asserting on substrings.
 */
export function staticCaptureFreezeScript(css: string = STATIC_CAPTURE_CSS): string {
  return `(function(){
  try {
    var style = document.createElement('style');
    style.setAttribute(${JSON.stringify(STATIC_CAPTURE_STYLE_ATTRIBUTE)}, '1');
    style.textContent = ${JSON.stringify(css)};
    (document.head || document.documentElement).appendChild(style);
  } catch (e) {}
  var finished = 0;
  var paused = 0;
  try {
    var animations = typeof document.getAnimations === 'function' ? document.getAnimations() : [];
    for (var i = 0; i < animations.length; i += 1) {
      // finish() parks the animation on its end frame, which is the frame the
      // author designed. It throws for an infinite iteration count, and there
      // pausing wherever it happens to be is the only frame available.
      try {
        animations[i].finish();
        finished += 1;
      } catch (e) {
        try {
          animations[i].pause();
          paused += 1;
        } catch (e2) {}
      }
    }
  } catch (e) {}
  try { window.scrollTo({ left: 0, top: 0, behavior: 'instant' }); } catch (e) {
    try { window.scrollTo(0, 0); } catch (e2) {}
  }
  // Belt and braces: a page whose scroll container is <html> or <body> (rather
  // than the viewport) does not always answer window.scrollTo.
  try {
    document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  } catch (e) {}
  return { finished: finished, paused: paused };
})()`;
}

/**
 * Chromium-level `prefers-reduced-motion: reduce`.
 *
 * The CSS freeze above only reaches declarative animation. A hand-rolled
 * `requestAnimationFrame` loop reads the media query instead, and a well-behaved
 * one stops when it says `reduce` — which is the difference between capturing
 * the page's designed first frame and capturing whatever frame the shot landed on.
 *
 * The override lives for as long as the debugger stays attached, so this returns
 * the detach rather than doing it here.
 */
async function emulateReducedMotion(
  window: BrowserWindow,
): Promise<{ emulated: boolean; release: () => void }> {
  const noop = { emulated: false, release: () => {} };
  const target = window.webContents.debugger;
  if (!target || typeof target.attach !== "function") return noop;
  let attachedHere = false;
  try {
    const alreadyAttached = typeof target.isAttached === "function" && target.isAttached();
    if (!alreadyAttached) {
      target.attach("1.3");
      attachedHere = true;
    }
    // Awaited: the override has to be live before the freeze script runs, or a
    // rAF loop that polls the media query gets one more unfrozen frame in.
    await target.sendCommand("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    return {
      emulated: true,
      release: () => {
        if (!attachedHere) return;
        try {
          target.detach();
        } catch {
          // Already detached, or the window is being torn down.
        }
      },
    };
  } catch {
    // No debugger available (another client owns it, or the surface is a stub).
    // The CSS freeze still covers every declarative animation, so a capture is
    // still worth taking — just without the media-query signal.
    if (attachedHere) {
      try {
        target.detach();
      } catch {
        // Nothing to undo.
      }
    }
    return noop;
  }
}

/**
 * Pins the page to a single reproducible frame: reduced-motion emulation, the
 * static-capture stylesheet, every running animation finished or paused, and
 * the viewport scrolled back to the origin.
 */
export async function freezePageForStaticCapture(
  window: BrowserWindow,
  css: string = STATIC_CAPTURE_CSS,
): Promise<StaticCaptureFreeze> {
  const motion = await emulateReducedMotion(window);
  let summary: StaticCaptureFreezeSummary = { finished: 0, paused: 0 };
  try {
    const raw = (await window.webContents.executeJavaScript(
      staticCaptureFreezeScript(css),
      true,
    )) as Partial<StaticCaptureFreezeSummary> | null;
    summary = {
      finished: Number.isFinite(raw?.finished) ? Number(raw?.finished) : 0,
      paused: Number.isFinite(raw?.paused) ? Number(raw?.paused) : 0,
    };
  } catch {
    // Best-effort — a page that refuses the injection still gets captured, and
    // the blank-frame guard downstream is what decides whether it is usable.
  }
  return { ...summary, reducedMotionEmulated: motion.emulated, release: motion.release };
}

/**
 * True when a captured BGRA frame contains any non-transparent pixel.
 *
 * Chromium occasionally hands back a fully transparent frame when the
 * compositor has not produced one yet; that is the only "blank" this can see
 * (a genuinely white page still has alpha 255 everywhere, so it reads as
 * painted, correctly).
 */
export function bgraBitmapHasPaint(bitmap: Buffer): boolean {
  if (bitmap.length < 4) return false;
  for (let offset = 3; offset < bitmap.length; offset += 4) {
    if (bitmap[offset] > 0) return true;
  }
  return false;
}
