#!/usr/bin/env node
// At the deepest zoom a snap the saved clip would miss must not move the clip, or it jumps on
// release: card-c (31/30 s) is moved until its end is 4.8 px past card-d's start.
import { launchStudioChrome } from "./chrome-executable.mjs";

const STUDIO_URL = process.env.STUDIO_URL;
const OUT_DIR = process.env.OUT_DIR;
const JUMP_TOLERANCE_PX = 1;
const C_START_S = 0.1;
const D_START_S = 1.35;
const MOVE_TO_START_S = 0.32;

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
  await page.waitForSelector(clipSelector("card-d"), { timeout: 60_000 });

  const frames = () =>
    page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // A view shot plus the close-up box at card-d's start (card-c's row above, card-d's below).
  const closeUp = async (name, d) => {
    if (!OUT_DIR) return;
    await page.screenshot({ path: `${OUT_DIR}/${name}.png` });
    evidence[name] = { x: d.x - 80, y: d.y - 56, width: 160, height: 104 };
  };
  const box = (selector) =>
    page.$eval(selector, (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });

  evidence.step = "zoom";
  // Deepest zoom, then card-d's start three quarters across, so the drag stays clear of the edges.
  await page.$eval('input[aria-label="Timeline zoom"]', (input) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setValue.call(input, "100");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.getBoundingClientRect().width > 1500,
    { timeout: 10_000 },
    clipSelector("card-a"),
  );
  // The scroll width grows as the view moves, so re-aim each frame until card-d is drawn in place.
  const scrollToD = () =>
    page.waitForFunction(
      (aSel, dSel, dStart) => {
        const viewport = document.querySelector("[data-timeline-scroll-viewport]");
        const view = viewport.getBoundingClientRect();
        const d = document.querySelector(dSel)?.getBoundingClientRect();
        if (d && d.x > view.x + view.width * 0.7 && d.x < view.x + view.width * 0.8) return true;
        const a = document.querySelector(aSel);
        const r = a.getBoundingClientRect();
        const pps = r.width / (Number(a.dataset.clipEnd) - Number(a.dataset.clipStart));
        const dStartX = r.x + (dStart - Number(a.dataset.clipStart)) * pps;
        viewport.scrollLeft += dStartX - (view.x + view.width * 0.75);
        return false;
      },
      { timeout: 10_000, polling: "raf" },
      clipSelector("card-a"),
      clipSelector("card-d"),
      D_START_S,
    );
  await scrollToD();
  // Selecting a clip scrolls its start into view, so select card-c first, then aim at card-d again.
  const cTail = await box(clipSelector("card-c"));
  await page.mouse.click(cTail.x + cTail.width - 100, cTail.y + cTail.height / 2);
  await page.waitForSelector(`${clipSelector("card-c")}[aria-pressed="true"]`, { timeout: 10_000 });
  await frames();
  await scrollToD();
  await frames();

  evidence.step = "drag";
  const d0 = await box(clipSelector("card-d"));
  const c0 = await box(clipSelector("card-c"));
  const pps = d0.width / 0.5;
  const scrollLeft = () => page.$eval("[data-timeline-scroll-viewport]", (v) => v.scrollLeft);
  const scroll0 = await scrollLeft();
  // Grab near c's tail, mid-view: a pointer near the edge would scroll the timeline.
  const grabX = c0.x + c0.width - 100;
  const grabY = c0.y + c0.height / 2;
  const dx = (MOVE_TO_START_S - C_START_S) * pps;
  evidence.step = "press";
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  for (const part of [0.25, 0.5, 0.75, 1]) {
    await page.mouse.move(grabX + dx * part, grabY);
    await frames();
  }
  const landing = await box('[data-testid="timeline-drag-landing"]');
  // card-d does not move, so its place mid-drag is its place at the press less any scroll since.
  const dDuring = { ...d0, x: d0.x - ((await scrollLeft()) - scroll0) };
  if (OUT_DIR) await page.screenshot({ path: `${OUT_DIR}/during-move.png` });
  // The dragged clip covers its landing slot; hide it for the close-up only.
  const actorSel = '[data-timeline-gesture-actor$="card-c"]';
  await page.$eval(actorSel, (el) => (el.style.visibility = "hidden"));
  await closeUp("landing-during", dDuring);
  await page.$eval(actorSel, (el) => (el.style.visibility = ""));
  evidence.step = "release";
  await page.mouse.up();
  // Release first shows the drag's own start; the saved one is always a whole centisecond.
  await page.waitForFunction(
    (sel, start) => {
      const saved = Number(document.querySelector(sel)?.dataset.clipStart);
      return saved !== start && Math.abs(saved * 100 - Math.round(saved * 100)) < 1e-6;
    },
    { timeout: 10_000 },
    clipSelector("card-c"),
    C_START_S,
  );
  // The save re-fits the zoom and resets the view.
  await scrollToD();
  await frames();
  const [c1, d1] = await page.evaluate(
    (...sels) =>
      sels.map((sel) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    clipSelector("card-c"),
    clipSelector("card-d"),
  );
  if (OUT_DIR) await page.screenshot({ path: `${OUT_DIR}/after-move.png` });
  await closeUp("landing-after", d1);

  // Where the drag shows card-c landing, then where it saved, both relative to card-d.
  const duringPx = (landing.x - dDuring.x) * (d1.width / dDuring.width);
  const afterPx = c1.x - d1.x;
  evidence.move = {
    pps,
    savedStart: Number(await page.$eval(clipSelector("card-c"), (el) => el.dataset.clipStart)),
    startToDDuringPx: duringPx,
    startToDAfterPx: afterPx,
    jumpPx: afterPx - duringPx,
  };
  if (Math.abs(afterPx - duringPx) > JUMP_TOLERANCE_PX) {
    failures.push(`card-c jumped ${(afterPx - duringPx).toFixed(1)}px on release`);
  }
} catch (error) {
  failures.push(`walk stopped at "${evidence.step}": ${error.message}`);
  if (OUT_DIR) await (await browser.pages()).at(-1)?.screenshot({ path: `${OUT_DIR}/failed.png` });
} finally {
  await browser.close();
}
console.log(JSON.stringify({ evidence, failures }, null, 2));
if (failures.length > 0) process.exit(1);
