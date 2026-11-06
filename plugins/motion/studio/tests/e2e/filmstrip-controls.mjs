#!/usr/bin/env node
// Disposable project: zero-fade audio and a 2 s video with a collapsed opacity keyframe at 1 s.
import assert from "node:assert/strict";
import { launchStudioChrome } from "./chrome-executable.mjs";

const STUDIO_URL = process.env.STUDIO_URL;
assert(STUDIO_URL, "STUDIO_URL must point at the disposable filmstrip fixture");
const { browser } = await launchStudioChrome();
const evidence = [];
try {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60_000);
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(STUDIO_URL, { waitUntil: "domcontentloaded" });
  for (const kind of ["video", "audio"]) {
    const selector =
      kind === "audio"
        ? '.timeline-clip.is-audio:has([data-badge="fx"])'
        : '.timeline-clip:not(.is-audio):has([data-badge="volume"])';
    await page.waitForSelector(selector, { timeout: 60_000 });
    const clip = await page.$(selector);
    await clip.hover();
    const fx = await clip.$('[data-badge="fx"]');
    const handle = await clip.$('[data-testid="clip-fade-handle-out"]');
    assert(fx && handle, `${kind} must expose FX and an editable fade-out handle`);
    assert.equal(await handle.evaluate((node) => node.getAttribute("aria-valuenow")), "0");
    const geometry = await clip.evaluate((node) => {
      const fx = node.querySelector('[data-badge="fx"]');
      const fade = node.querySelector('[data-testid="clip-fade-handle-out"]');
      const f = fx.getBoundingClientRect();
      const h = fade.getBoundingClientRect();
      const c = node.getBoundingClientRect();
      const trims = [...node.querySelectorAll(".timeline-clip__handle-bar")]
        .map((bar) => bar.parentElement.getBoundingClientRect())
        .sort((a, b) => a.left - b.left);
      const fxReached = [2, f.width / 2, f.width - 2].every((x) => {
        const hit = document.elementFromPoint(f.left + x, f.top + f.height / 2);
        return fx.contains(hit);
      });
      return {
        fxReached,
        fadeClearFx: h.right <= f.left || h.top >= f.bottom,
        fadeInsideClip: h.bottom <= c.bottom,
        trimClear: trims.length === 2 && h.left >= trims[0].right && h.right <= trims[1].left,
        fadeHitHeight: h.height,
      };
    });
    assert(geometry.fxReached, `${kind} FX must receive the pointer across its full width`);
    assert(geometry.fadeClearFx, `${kind} fade target must clear FX`);
    assert(geometry.fadeInsideClip, `${kind} fade target must stay inside its clip`);
    assert(geometry.trimClear, `${kind} fade target must clear trim grips`);
    assert(geometry.fadeHitHeight >= 15, `${kind} fade target must fit its visible tab`);
    const fxBox = await fx.boundingBox();
    await page.mouse.click(fxBox.x + fxBox.width / 2, fxBox.y + fxBox.height / 2);
    await page.waitForSelector('[role="menu"][aria-label="Clip actions"]', { timeout: 10_000 });
    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="menu"][aria-label="Clip actions"]', { hidden: true });
    await clip.hover();
    const dragHandle = await page.waitForSelector(
      `${selector} [data-testid="clip-fade-handle-out"]`,
    );
    const fadeBox = await dragHandle.boundingBox();
    assert(fadeBox, `${kind} fade must expose its fresh target after closing FX`);
    const x = fadeBox.x + fadeBox.width / 2;
    const y = fadeBox.y + fadeBox.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 40, y, { steps: 8 });
    const preview = Number(await dragHandle.evaluate((node) => node.getAttribute("aria-valuenow")));
    assert(preview > 0, `${kind} fade must preview during a pointer drag`);
    await page.mouse.up();
    const saveStatus = await page.evaluate(async () => {
      const moduleUrl = new URL("/src/utils/studioPendingEdits.ts", window.location.href);
      const { flushStudioPendingEdits } = await import(moduleUrl.href);
      return (await flushStudioPendingEdits()).status;
    });
    assert.equal(saveStatus, "clean", `${kind} fade save must settle successfully`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(selector, { timeout: 60_000 });
    await (await page.$(selector)).hover();
    await page.waitForFunction(
      (selector, value) =>
        Number(document.querySelector(selector)?.getAttribute("aria-valuenow")) === value,
      { timeout: 10_000 },
      `${selector} [data-testid="clip-fade-handle-out"]`,
      preview,
    );
    if (kind === "video") {
      const currentClip = await page.$(selector);
      const disclosureSelector = "button[aria-controls][aria-expanded]";
      await page.waitForFunction(
        (selector, disclosureSelector) =>
          document
            .querySelector(selector)
            ?.closest("[data-timeline-row]")
            ?.querySelector(disclosureSelector),
        { timeout: 10_000 },
        selector,
        disclosureSelector,
      );
      const disclosureHandle = await currentClip.evaluateHandle(
        (node, disclosureSelector) =>
          node.closest("[data-timeline-row]").querySelector(disclosureSelector),
        disclosureSelector,
      );
      const disclosure = disclosureHandle.asElement();
      assert(disclosure, "video must expose its keyframe lane disclosure");
      if ((await disclosure.evaluate((node) => node.getAttribute("aria-expanded"))) === "true") {
        await disclosure.click();
      }
      await page.waitForFunction(
        (selector, disclosureSelector) =>
          document
            .querySelector(selector)
            ?.closest("[data-timeline-row]")
            ?.querySelector(disclosureSelector)
            ?.getAttribute("aria-expanded") === "false",
        {},
        selector,
        disclosureSelector,
      );
      await currentClip.hover();
      const fadeIn = await currentClip.$('[data-testid="clip-fade-handle-in"]');
      await fadeIn.focus();
      for (let step = 0; step < 10; step++) await page.keyboard.press("ArrowRight");
      await page.waitForFunction(
        (selector) => Number(document.querySelector(selector)?.getAttribute("aria-valuenow")) === 1,
        {},
        `${selector} [data-testid="clip-fade-handle-in"]`,
      );
      const separated = await currentClip.evaluate((node) => {
        const fade = node.querySelector('[data-testid="clip-fade-handle-in"]');
        const f = fade.getBoundingClientRect();
        const clip = node.getBoundingClientRect();
        const diamond = [...document.querySelectorAll('button[aria-label*="keyframe at"]')].find(
          (d) => {
            const r = d.getBoundingClientRect();
            return (
              Math.abs(r.left + r.width / 2 - (clip.left + clip.width / 2)) < 1 &&
              r.top >= clip.top &&
              r.bottom <= clip.bottom
            );
          },
        );
        const fadeHit = document.elementFromPoint(f.left + f.width / 2, f.top + f.height / 2);
        const result = {
          diamondExists: Boolean(diamond),
          fadeReached: fade.contains(fadeHit),
          diamondReached: false,
        };
        if (diamond) {
          const d = diamond.getBoundingClientRect();
          const diamondHit = document.elementFromPoint(d.left + d.width / 2, d.top + d.height / 2);
          result.diamondReached = diamond.contains(diamondHit);
        }
        return result;
      });
      assert.deepEqual(
        separated,
        { diamondExists: true, fadeReached: true, diamondReached: true },
        "middle fade and collapsed keyframe must each receive their own centre pointer",
      );
    }
    evidence.push({
      kind,
      ...geometry,
      menuOpened: true,
      fadePreview: preview,
      fadeCommitted: true,
    });
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ evidence }, null, 2));
