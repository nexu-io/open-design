/**
 * Read the viewer's live DOM after a scripted interaction.
 *
 * Screenshots show that something is wrong; this says what. Same server and
 * browser setup as shoot.mjs, but instead of a PNG it dumps the state of the
 * pieces of chrome that are hard to judge by eye — whether a line is empty
 * versus merely faint, what the measurement box actually holds, where the
 * card was placed and why.
 *
 * Usage: node scripts/harness/probe.mjs [--fixture full] [--dir <path>]
 */
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const args = process.argv.slice(2);
const arg = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;

const dirArg = arg("--dir", null);
const fixtures = dirArg ? path.resolve(dirArg) : path.join(here, ".out");
const fixture = arg("--fixture", "full");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".usda": "text/plain",
  ".obj": "text/plain",
  ".mtl": "text/plain",
};

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\/+/, "");
  const file = path.join(fixtures, rel);
  if (!file.startsWith(fixtures) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  res.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

// Same resolution walk as shoot.mjs: Playwright is declared by `e2e`, and
// pnpm's node_modules will not resolve it from here.
async function loadPlaywright() {
  const bases = [
    path.join(repoRoot, "e2e", "package.json"),
    path.join(repoRoot, "package.json"),
    path.join(here, "..", "..", "package.json"),
  ];
  for (const b of bases) {
    if (!fs.existsSync(b)) continue;
    const require = createRequire(b);
    for (const id of ["playwright-core", "playwright", "@playwright/test"]) {
      try {
        const mod = await import(pathToFileURL(require.resolve(id)).href);
        const api = mod.chromium ? mod : mod.default;
        if (api && api.chromium) return api;
      } catch {
        /* next candidate */
      }
    }
  }
  throw new Error("no Playwright install found — run `pnpm install`");
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 780, height: 720 },
  deviceScaleFactor: 2,
  colorScheme: "light",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${base}/${fixture}.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);

/** Everything worth knowing about the card and the readout, in one shape. */
const snapshot = () =>
  page.evaluate(() => {
    const read = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const st = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        text: (el.textContent || "").trim(),
        hidden: el.hidden || st.display === "none" || st.visibility === "hidden",
        opacity: Number(st.opacity),
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      };
    };
    const leader = document.querySelector(".tlead, .leader, .tip-leader");
    return {
      ident: read("#ident"),
      tip: read(".tip"),
      tipClasses: document.querySelector(".tip") ? document.querySelector(".tip").className : null,
      title: read(".tip .ttitle"),
      err: read(".tip .terr"),
      dim: read(".tip .tdim"),
      near: read(".tip .tnear"),
      edit: read(".tip .tedit"),
      leader: leader ? { tag: leader.tagName, hidden: leader.hidden } : null,
      measure: read(".measure, .meas, #measure"),
      axes: [...document.querySelectorAll(".gizmo .axis")].map((a) => a.getAttribute("data-axis") || a.className.baseVal || a.className),
    };
  });

console.log("--- after load, no selection ---");
console.log(JSON.stringify(await snapshot(), null, 2));

await page.mouse.click(390, 360);
await page.waitForTimeout(450);
console.log("\n--- after clicking a part ---");
console.log(JSON.stringify(await snapshot(), null, 2));

const at = await page.evaluate(() => {
  const axis = document.querySelectorAll(".gizmo .axis")[1];
  const g = axis && axis.querySelector(".grab");
  if (!g) return null;
  const n = (a) => parseFloat(g.getAttribute(a));
  return { x: (n("x1") + n("x2")) / 2, y: (n("y1") + n("y2")) / 2, axis: axis.getAttribute("data-axis") };
});
console.log("\n--- grabbing", JSON.stringify(at), "---");
if (at) {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x, at.y - 45, { steps: 8 });
  await page.waitForTimeout(300);
  console.log(JSON.stringify(await snapshot(), null, 2));
  await page.mouse.up();
  await page.waitForTimeout(300);
  console.log("\n--- after release ---");
  console.log(JSON.stringify(await snapshot(), null, 2));
}

if (errors.length) console.log("\npage errors:", errors);
await browser.close();
server.close();
