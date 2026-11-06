#!/usr/bin/env node
// Trimming a clip's edge must leave the playhead where it was paused, and a dragged clip must
// land on a ruler line when no other snap target is near. Needs real pointer events and layout.
import { launchStudioChrome } from "./chrome-executable.mjs";

const STUDIO_URL = process.env.STUDIO_URL;
const OUT_DIR = process.env.OUT_DIR;
const PLAYHEAD_TOLERANCE_PX = 1.5;
// Studio saves clip times to the centisecond, so a line between two centiseconds saves beside it.
const SAVED_TIME_STEP_S = 0.01;
const DROP_PAST_LINE_PX = 6;

if (!STUDIO_URL) {
  console.error("STUDIO_URL is required and must point at the timeline-trim-snap fixture");
  process.exit(2);
}
const clipSelector = (id) => `.timeline-clip[data-el-id$="${id}"]`;
const { browser } = await launchStudioChrome();
const failures = [];
const evidence = {};
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(STUDIO_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(clipSelector("card-b"), { timeout: 60_000 });
  await page.waitForSelector("[data-timeline-playhead-layer] > *", { timeout: 30_000 });

  const frames = () =>
    page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const box = (selector) =>
    page.$eval(selector, (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
  const playheadX = () =>
    page.$eval("[data-timeline-playhead-layer] > *", (el) => {
      const r = el.getBoundingClientRect();
      return r.x + r.width / 2;
    });
  const clipTimes = (id) =>
    page.$eval(clipSelector(id), (el) => ({
      start: Number(el.dataset.clipStart),
      end: Number(el.dataset.clipEnd),
    }));
  // Screen x of every ruler line (beat lines excluded).
  const rulerLines = () =>
    page.$$eval('[data-timeline-grid-cell="major"], [data-timeline-grid-cell="minor"]', (cells) =>
      cells.map((c) => c.getBoundingClientRect().x + 0.5).sort((a, b) => a - b),
    );
  // Seconds-to-pixels map from the two clips' left edges (a clip's width carries its own inset).
  const timeMap = async () => {
    const [a, b] = [await clipTimes("card-a"), await clipTimes("card-b")];
    const [ax, bx] = [(await box(clipSelector("card-a"))).x, (await box(clipSelector("card-b"))).x];
    const pps = (bx - ax) / (b.start - a.start);
    return { pps, originX: ax - a.start * pps };
  };
  const a0 = await clipTimes("card-a");
  const aBox = await box(clipSelector("card-a"));
  const { pps, originX } = await timeMap();

  // Pause the playhead at 1.2 s with a ruler click.
  const ruler = await box("[data-timeline-grid-cell]");
  await page.mouse.click(originX + 1.2 * pps, ruler.y + 6);
  await frames();
  const restX = await playheadX();
  evidence.playheadRestS = (restX - originX) / pps;

  // Trim a's end edge 70 px right; the handle mounts on hover.
  const edgeX = aBox.x + aBox.width - 3;
  const midY = aBox.y + aBox.height / 2;
  await page.mouse.move(edgeX - 20, midY);
  await page.mouse.move(edgeX, midY);
  await page.waitForFunction(
    (sel) =>
      [...document.querySelectorAll(`${sel} div`)].some((d) => d.style.cursor === "col-resize"),
    { timeout: 10_000 },
    clipSelector("card-a"),
  );
  await page.mouse.down();
  for (const dx of [10, 30, 50, 70]) {
    await page.mouse.move(edgeX + dx, midY);
    await frames();
  }
  const duringX = await playheadX();
  if (OUT_DIR) await page.screenshot({ path: `${OUT_DIR}/during-trim.png` });
  await page.mouse.up();
  await page.waitForFunction(
    (sel, end) => Number(document.querySelector(sel)?.dataset.clipEnd) !== end,
    { timeout: 10_000 },
    clipSelector("card-a"),
    a0.end,
  );
  await frames();
  const after = await timeMap();
  const afterS = ((await playheadX()) - after.originX) / after.pps;
  evidence.trim = {
    endBefore: a0.end,
    endAfter: (await clipTimes("card-a")).end,
    playheadDuringS: (duringX - originX) / pps,
    playheadAfterS: afterS,
    ppsBefore: pps,
    ppsAfter: after.pps,
  };
  if (Math.abs(duringX - restX) > PLAYHEAD_TOLERANCE_PX) {
    failures.push(`playhead moved ${(duringX - restX).toFixed(1)}px during the trim`);
  }
  if (Math.abs(afterS - evidence.playheadRestS) * after.pps > PLAYHEAD_TOLERANCE_PX) {
    failures.push(`playhead moved from ${evidence.playheadRestS}s to ${afterS}s after the trim`);
  }

  // Drag b so its start sits 6 px past the ruler line nearest 4.6 s, clear of every other target.
  const b0 = await clipTimes("card-b");
  const bBox = await box(clipSelector("card-b"));
  const nearest = (lines, x) =>
    lines.reduce((best, l) => (Math.abs(l - x) < Math.abs(best - x) ? l : best));
  const line = nearest(await rulerLines(), after.originX + 4.6 * after.pps);
  const grabX = bBox.x + bBox.width / 2;
  const grabY = bBox.y + bBox.height / 2;
  const dropDx = line + DROP_PAST_LINE_PX - bBox.x;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  for (const part of [0.25, 0.5, 0.75, 1]) {
    await page.mouse.move(grabX + dropDx * part, grabY);
    await frames();
  }
  await page.mouse.up();
  await page.waitForFunction(
    (sel, start) => Number(document.querySelector(sel)?.dataset.clipStart) !== start,
    { timeout: 10_000 },
    clipSelector("card-b"),
    b0.start,
  );
  await frames();
  // Re-read both in the settled layout: a save can re-fit the timeline's zoom.
  const settled = await timeMap();
  const bx = (await box(clipSelector("card-b"))).x;
  const offLinePx = bx - nearest(await rulerLines(), bx);
  const allowedPx = PLAYHEAD_TOLERANCE_PX + (SAVED_TIME_STEP_S / 2) * settled.pps;
  evidence.grid = {
    startBefore: b0.start,
    startAfter: (await clipTimes("card-b")).start,
    droppedPastLinePx: DROP_PAST_LINE_PX,
    landedOffLinePx: offLinePx,
    allowedPx,
  };
  if (OUT_DIR) await page.screenshot({ path: `${OUT_DIR}/after-grid-drag.png` });
  if (Math.abs(offLinePx) > allowedPx) {
    failures.push(`clip b landed ${offLinePx.toFixed(1)}px off the nearest ruler line`);
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ evidence, failures }, null, 2));
if (failures.length > 0) process.exit(1);
