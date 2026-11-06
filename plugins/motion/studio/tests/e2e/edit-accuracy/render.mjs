/** Render drift: the target's box in a frame the producer captures, found by its flat colour. */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
// Source import, as scripts/preview-capture.ts does: bun runs the producer's TypeScript directly.
import {
  captureFrameToBuffer,
  closeCaptureSession,
  createCaptureSession,
  createFileServer,
  initializeSession,
} from "../../../../producer/src/index.js";
import { serveFixtureAssetsLocally } from "./case.mjs";
import { BACKGROUND, COMPOSITION, PLAYHEAD, TARGET } from "./grid.mjs";

const FPS = { num: 30, den: 1 };

// Sub-pixel box from luminance coverage between the two fixture colours (JPEG keeps full-res luminance).
// Area moments give the centre and sides, so rotated and cropped rectangles measure the same way.
function pixelBox(b64, bgY, fgY) {
  // fallow-ignore-next-line complexity
  return (async () => {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${b64}`;
    await img.decode();
    const [w, h] = [img.width, img.height];
    const g = new OffscreenCanvas(w, h).getContext("2d");
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;
    let [a, sx, sy, sxx, syy, sxy] = [0, 0, 0, 0, 0, 0];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let k = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] - bgY) / (fgY - bgY);
        if (k < 0.02) continue;
        k = k > 0.98 ? 1 : k;
        const [px, py] = [x + 0.5, y + 0.5];
        a += k;
        sx += k * px;
        sy += k * py;
        sxx += k * px * px;
        syy += k * py * py;
        sxy += k * px * py;
      }
    if (a === 0) return null;
    const [mx, my] = [sx / a, sy / a];
    // Pixel coverage is the shape blurred by a 1 px box, which adds 1/12 px² of variance per axis.
    const cxx = sxx / a - mx * mx - 1 / 12;
    const cyy = syy / a - my * my - 1 / 12;
    const cxy = sxy / a - mx * my;
    const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    const spread = Math.hypot((cxx - cyy) / 2, cxy);
    const side1 = Math.sqrt(12 * ((cxx + cyy) / 2 + spread));
    const side2 = Math.sqrt(12 * Math.max(0, (cxx + cyy) / 2 - spread));
    const [c, s] = [Math.abs(Math.cos(theta)), Math.abs(Math.sin(theta))];
    const hx = (side1 * c + side2 * s) / 2;
    const hy = (side1 * s + side2 * c) / 2;
    return { left: mx - hx, right: mx + hx, top: my - hy, bottom: my + hy, area: a };
  })();
}

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

/** A saved project with no GSAP timeline; a keyframe added in Studio writes one, so the files decide, not the spec. */
const noTimeline = (dir) =>
  !["index.html", "compositions/sub.html"].some(
    (f) => existsSync(join(dir, f)) && readFileSync(join(dir, f), "utf8").includes("__timelines"),
  );

/** Runs in the producer's page: marks every composition host `data-no-timeline`, the engine's opt-out of the wait. */
function markNoTimeline() {
  const mark = (e) => e.matches("[data-composition-id]") && e.setAttribute("data-no-timeline", "");
  new MutationObserver((records) => {
    for (const r of records)
      for (const n of r.addedNodes)
        if (n.nodeType === 1) [n, ...n.querySelectorAll("[data-composition-id]")].forEach(mark);
  }).observe(document, { childList: true, subtree: true });
}

const CAPTURE = {
  width: COMPOSITION.width,
  height: COMPOSITION.height,
  fps: FPS,
  format: "jpeg",
  quality: 100,
};
// A composition with no GSAP never registers a timeline; the default 45 s wait for one changes no pixel.
// Static-frame dedup opens a second page that would fetch GSAP from the CDN; one frame needs none.
const CAPTURE_CONFIG = { playerReadyTimeout: 10_000, staticFrameDedup: false };

/** A capture session with the renders' launch configuration and its page closed: only its browser lease is left. */
async function openHold(framesDir) {
  // requiresWebGpu as the renders find it from the fixtures, so the launch configuration matches theirs.
  const session = await createCaptureSession(
    "about:blank",
    framesDir,
    { ...CAPTURE, requiresWebGpu: false },
    null,
    CAPTURE_CONFIG,
  );
  await session.page.close();
  // closeCaptureSession then only releases the browser lease.
  session.pageReleased = true;
  return session;
}

let hold = null;

/**
 * Keeps the producer's Chrome open between renders. The engine pools a browser per launch configuration and
 * closes it when its last session closes; this session holds a lease with the same configuration and no page,
 * so each render opens a page in that browser instead of launching one. Call the result to let it close.
 */
export async function holdProducerBrowser(framesDir) {
  const current = { framesDir, session: openHold(framesDir) };
  hold = current;
  // A hold that fails here is taken again by the next render.
  await current.session.catch(() => undefined);
  return async () => {
    if (hold === current) hold = null;
    const session = await current.session.catch(() => null);
    if (session) await closeCaptureSession(session);
  };
}

/** The held browser; a hold that failed or whose Chrome died is dropped and taken again, never reused. */
// fallow-ignore-next-line complexity
export async function heldBrowser() {
  if (!hold) return null;
  const taken = hold.session;
  const session = await taken.catch(() => null);
  if (session?.browser.connected) return session.browser;
  if (hold.session === taken) {
    hold.session = openHold(hold.framesDir);
    if (session) void closeCaptureSession(session).catch(() => undefined);
  }
  return (await hold.session.catch(() => null))?.browser ?? null;
}

let warnedNotHeld = false;
function warnUnlessHeld(held, browser) {
  if (!held || browser === held || warnedNotHeld) return;
  warnedNotHeld = true;
  console.warn("edit bench: the render did not reuse the held producer browser");
}

/** Renders `dir` at `time` and measures the target's box in the frame. */
export async function renderBox(dir, decoder, time = PLAYHEAD) {
  const framesDir = join(dir, ".bench-frames");
  mkdirSync(framesDir, { recursive: true });
  const server = await createFileServer({ projectDir: dir, port: 0, fps: FPS });
  let session;
  try {
    const held = await heldBrowser();
    session = await createCaptureSession(server.url, framesDir, CAPTURE, null, CAPTURE_CONFIG);
    warnUnlessHeld(held, session.browser);
    // A fresh page in a reused browser: nothing an earlier case's render cached may serve this one.
    const cdp = await session.page.createCDPSession();
    await cdp.send("Network.clearBrowserCache");
    await cdp.detach();
    // The producer's own browser would fetch GSAP from the CDN; a stalled fetch renders the 0 s frame.
    await serveFixtureAssetsLocally(session.page);
    // Without the opt-out, a project with no timeline waits out playerReadyTimeout on every render.
    if (noTimeline(dir)) await session.page.evaluateOnNewDocument(markNoTimeline);
    await initializeSession(session);
    const { buffer } = await captureFrameToBuffer(session, 0, time);
    // Diagnostic only: a DOM rect ignores clip-path, so it cannot score a crop.
    const domRect = await session.page.evaluate(() => {
      const r = document.querySelector("#target")?.getBoundingClientRect();
      return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
    });
    const box = await decoder.evaluate(
      pixelBox,
      buffer.toString("base64"),
      luminance(BACKGROUND),
      luminance(TARGET.color),
    );
    if (!box) throw new Error("target colour not found in the producer frame");
    return { box, domRect, jpeg: buffer };
  } finally {
    server.close();
    if (session) await closeCaptureSession(session).catch(() => undefined);
  }
}
