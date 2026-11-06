#!/usr/bin/env node
// Each Renders Select must take a real mouse click on its last option: the open list has to sit above
// the sibling fields and the Export button. Hit-testing only happens in real layout, so this runs in Chrome.
import { launchStudioChrome } from "./chrome-executable.mjs";

const STUDIO_URL = process.env.STUDIO_URL;
const LABELS = ["Format", "Resolution", "Frame rate", "Quality"];
const SHOT_DIR = process.env.RENDER_SELECTS_SHOT_DIR;

if (!STUDIO_URL) {
  console.error("STUDIO_URL is required and must point at a Studio project with ?tab=renders");
  process.exit(2);
}
const trigger = (label) => `[role="combobox"][aria-label="${label}"]`;
const { browser } = await launchStudioChrome();
const failures = [];
const evidence = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(STUDIO_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(trigger("Format"), { visible: true, timeout: 60_000 });
  // Format's last option is WebM, which keeps Quality on screen for the last pass.
  for (const label of LABELS) {
    if (!(await page.$(trigger(label)))) {
      failures.push(`${label}: no Select on the Renders panel`);
      continue;
    }
    // A click before Studio settles is dropped, so press until the list says it is open.
    const open = `${trigger(label)}[aria-expanded="true"]`;
    for (let tries = 0; tries < 10 && !(await page.$(open)); tries += 1) {
      await page.click(trigger(label));
      await page.waitForSelector(open, { timeout: 1_000 }).catch(() => null);
    }
    if (!(await page.$(open))) {
      failures.push(`${label}: the list never opened`);
      continue;
    }
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[role="option"]')].some((el) => el.checkVisibility()),
    );
    // Let the open motion finish so the hit test sees the resting layout.
    await new Promise((resolve) => setTimeout(resolve, 300));
    // A closing list can linger in the DOM, so only options that are drawn count.
    const { text: want, ...point } = await page.evaluate(() => {
      const drawn = [...document.querySelectorAll('[role="option"]')].filter(
        (el) => el.checkVisibility() && !el.hasAttribute("data-disabled"),
      );
      const el = drawn.at(-1);
      const r = el.getBoundingClientRect();
      return { text: el.textContent.trim(), x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const hit = await page.evaluate(({ x, y }) => {
      const top = document.elementFromPoint(x, y);
      return {
        onOption: Boolean(top?.closest('[role="option"]')),
        top: top?.outerHTML.slice(0, 120),
      };
    }, point);
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${label.replace(" ", "-")}.png` });
    if (!hit.onOption) {
      // Clicking through would press whatever covers the option, Export included.
      failures.push(`${label}: "${want}" is covered by ${hit.top}`);
      await page.keyboard.press("Escape");
      continue;
    }
    await page.mouse.click(point.x, point.y);
    await page.waitForSelector(`${trigger(label)}[aria-expanded="false"]`, { timeout: 5_000 });
    const got = await page.$eval(trigger(label), (el) => el.textContent.trim());
    evidence.push({ label, want, got });
    if (got !== want) failures.push(`${label}: clicked "${want}", the field shows "${got}"`);
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ evidence, failures }, null, 2));
if (failures.length > 0) process.exit(1);
