// Run with: node packages/studio/tests/e2e/motion-path-home.mjs
// Real Chromium and real GSAP: a layer's motion path home leaves its CSS translate alone (GSAP's
// transform parse folds it) and puts a created path's end on the click; happy-dom computes no translate.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { resolveChromeExecutable } from "./chrome-executable.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const output = mkdtempSync(join(tmpdir(), "motion-path-home-"));
const studio = createRequire(join(root, "packages/studio/package.json"));
const gsapSource = readFileSync(studio.resolve("gsap/dist/gsap.js"), "utf8");
let browser;
try {
  execFileSync(
    "bun",
    [
      "build",
      "packages/studio/src/components/editor/motionPathHome.ts",
      "--target",
      "browser",
      "--outdir",
      output,
    ],
    { cwd: root },
  );
  const homeUrl = `data:text/javascript;base64,${readFileSync(join(output, "motionPathHome.js")).toString("base64")}`;
  browser = await puppeteer.launch({
    executablePath: resolveChromeExecutable(),
    headless: true,
    pipe: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setContent(
    `<style>.centred{transform:translate(-50%,-50%)}</style><body style="margin:0"><div id="stage" style="position:relative;width:1920px;height:1080px"></div></body>`,
  );
  await page.addScriptTag({ content: gsapSource });
  await page.addScriptTag({
    content: readFileSync(studio.resolve("gsap/dist/MotionPathPlugin.js"), "utf8"),
  });
  const got = await page.evaluate(async (url) => {
    const { elementHome } = await import(url);
    window.gsap.registerPlugin(window.MotionPathPlugin);
    const layer = (css) => {
      const el = document.createElement("div");
      el.style.cssText = `position:absolute;left:10px;top:10px;width:240px;height:160px;${css}`;
      document.getElementById("stage").append(el);
      return el;
    };
    const centre = (el) => {
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    };
    // Create mode: a path to (click - home), as the overlay commits it, must end on the click.
    const create = (css, setup = () => {}) => {
      const el = layer(css);
      setup(el);
      const home = elementHome(el);
      const style = [el.style.translate, el.style.transform];
      const [cx, cy] = [700, 400];
      const path = [
        { x: 0, y: 0 },
        { x: cx - home.x, y: cy - home.y },
      ];
      window.gsap.timeline().to(el, { motionPath: { path }, duration: 1 }).progress(1);
      return { style, end: centre(el) };
    };
    // A drag's offset on a layer GSAP already moves composes with its transform.
    const dragged = layer("");
    window.gsap.set(dragged, { x: 20 });
    dragged.style.cssText += ";--hf-studio-offset-x:40px;--hf-studio-offset-y:30px";
    dragged.style.translate = "var(--hf-studio-offset-x) var(--hf-studio-offset-y)";
    const draggedHome = elementHome(dragged);
    const owned = layer("left: 50%; top: 50%");
    window.gsap.set(owned, { xPercent: -50, yPercent: -50 });
    return {
      plain: create("translate: 40px 30px"),
      centred: create("left: 50%; top: 50%; translate: -50% -50%"),
      halfPx: create("left: 50%; top: 50%; translate: -120px -80px"),
      none: create(""),
      transformed: create("left: 50%; top: 50%; transform: translate(-50%, -50%)"),
      classed: create("left: 50%; top: 50%", (el) => el.classList.add("centred")),
      mixed: create("left: 50%; top: 50%; transform: translate(-50%, -50%); translate: 10px 0"),
      // A fade's cache holds no transform yet: GSAP's next parse still folds the drag offset into x.
      faded: create(
        "--hf-studio-offset-x: 40px; --hf-studio-offset-y: 30px; translate: var(--hf-studio-offset-x) var(--hf-studio-offset-y)",
        (el) => window.gsap.set(el, { opacity: 0.9 }),
      ),
      dragged: { home: [draggedHome.x, draggedHome.y], centre: centre(dragged) },
      owned: elementHome(owned),
    };
  }, homeUrl);

  assert.deepEqual(got.plain.style, ["40px 30px", ""]);
  assert.deepEqual(got.centred.style, ["-50% -50%", ""]);
  for (const name of [
    "plain",
    "centred",
    "halfPx",
    "none",
    "transformed",
    "classed",
    "mixed",
    "faded",
  ]) {
    assert.deepEqual(got[name].end.map(Math.round), [700, 400], name);
  }
  assert.deepEqual(got.dragged.home, [got.dragged.centre[0] - 20, got.dragged.centre[1]]);
  const { x, y, ax, ay } = got.owned;
  assert.deepEqual([x, y, ax, ay], [960, 540, 0, 0]);
  console.log(
    "motion-path home: a created path ends on the click; translates kept; drag offsets count",
  );
} finally {
  await browser?.close();
  rmSync(output, { recursive: true, force: true });
}
