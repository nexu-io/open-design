#!/usr/bin/env node
// On a clip narrower than two fade hit boxes, each tab must still lay out at 4 x 15.
// Flex shrinking only happens in real layout, so this measures it in Chrome.
import { launchStudioChrome } from "./chrome-executable.mjs";

const STUDIO_URL = process.env.STUDIO_URL;
const TAB_PX = { width: 4, height: 15 };
const NARROW_CLIP_MAX_PX = 20;

if (!STUDIO_URL) {
  console.error("STUDIO_URL is required and must point at the fade-handles fixture");
  process.exit(2);
}
const { browser } = await launchStudioChrome();
const failures = [];
let evidence = {};
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(STUDIO_URL, { waitUntil: "domcontentloaded" });
  const clipSelector = '.timeline-clip[data-el-id$="narrow-tone"]';
  await page.waitForSelector(clipSelector, { timeout: 60_000 });
  const clip = await page.$(clipSelector);
  const box = await clip.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('[data-testid="clip-fade-handle-out"]', { timeout: 10_000 });
  evidence = await page.$eval(clipSelector, (el) => {
    const rect = (node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      clip: rect(el),
      handles: ["in", "out"].map((edge) => {
        const handle = el.querySelector(`[data-testid="clip-fade-handle-${edge}"]`);
        return { edge, hit: rect(handle), tab: rect(handle.firstElementChild) };
      }),
    };
  });
  if (evidence.clip.width >= NARROW_CLIP_MAX_PX) {
    failures.push(
      `fixture clip is ${evidence.clip.width}px wide, not under ${NARROW_CLIP_MAX_PX}px`,
    );
  }
  for (const { edge, tab } of evidence.handles) {
    if (tab.width !== TAB_PX.width || tab.height !== TAB_PX.height) {
      failures.push(
        `fade-${edge} tab is ${tab.width}x${tab.height}, expected ${TAB_PX.width}x${TAB_PX.height}`,
      );
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ evidence, failures }, null, 2));
if (failures.length > 0) process.exit(1);
