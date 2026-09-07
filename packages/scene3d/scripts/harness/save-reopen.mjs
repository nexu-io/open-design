/**
 * Where does a saved part actually appear when you reopen the page?
 *
 * Saving writes an offset to `tweaks.json`, and Blender bakes that offset
 * into the GLB on the NEXT compile. Between those two moments the file says
 * the part has moved and the mesh the browser downloads says it has not —
 * so the question this answers is what the viewer shows in that window, and
 * whether it is honest about it.
 *
 * Usage: node scripts/harness/save-reopen.mjs --daemon <url> --project <id>
 *        [--scene scenes/crate]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const args = process.argv.slice(2);
const arg = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const daemon = arg("--daemon", "");
const project = arg("--project", "");
const scene = arg("--scene", "scenes/crate");
if (!daemon || !project) {
  console.error("need --daemon and --project");
  process.exit(2);
}
const api = `${daemon}/api/projects/${encodeURIComponent(project)}`;
const shots = path.join(here, ".shots");
fs.mkdirSync(shots, { recursive: true });

async function loadPlaywright() {
  for (const b of [path.join(repoRoot, "e2e", "package.json"), path.join(repoRoot, "package.json")]) {
    if (!fs.existsSync(b)) continue;
    const require = createRequire(b);
    for (const id of ["playwright-core", "playwright", "@playwright/test"]) {
      try {
        const mod = await import(pathToFileURL(require.resolve(id)).href);
        const p = mod.chromium ? mod : mod.default;
        if (p && p.chromium) return p;
      } catch {
        /* next */
      }
    }
  }
  throw new Error("no Playwright install found");
}

const tweaks = async () =>
  (await fetch(`${api}/scene3d/tweaks?scenePath=${encodeURIComponent(scene)}`)).json();

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1100, height: 780 }, colorScheme: "light" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

/**
 * Where the selected part's own centre sits on screen.
 *
 * The gizmo rides on the selection, so its hub is the part's projected
 * origin — a direct, pixel-level answer to "did the thing move", which no
 * amount of reading the edit record can give.
 */
const hubY = () =>
  page.evaluate(() => {
    const el = document.querySelector(".gizmo .hub-arc");
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return Math.round(b.top + b.height / 2);
  });

const state = () =>
  page.evaluate(() => ({
    save: document.getElementById("save")?.hidden === false,
    reset: document.getElementById("reset")?.hidden === false,
    note: (document.querySelector(".tip .tedit")?.textContent || "").trim() || null,
  }));

const open = async () => {
  await page.goto(`${api}/files/kit.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.mouse.click(550, 420);
  await page.waitForTimeout(450);
};

console.log("tweaks at start:", JSON.stringify(await tweaks()));
await open();
const original = await hubY();
console.log("part origin on screen, fresh open:", original);
await page.screenshot({ path: path.join(shots, "reopen-1-fresh.png") });

// Move it a long way up the vertical handle, then save.
const handle = await page.evaluate(() => {
  for (const axis of document.querySelectorAll(".gizmo .axis")) {
    const g = axis.querySelector(".grab");
    if (!g) continue;
    const n = (a) => parseFloat(g.getAttribute(a));
    const dx = n("x2") - n("x1");
    const dy = n("y2") - n("y1");
    if (Math.abs(dy) > Math.abs(dx)) return { x: n("x1") + dx * 0.9, y: n("y1") + dy * 0.9 };
  }
  return null;
});
await page.mouse.move(handle.x, handle.y);
await page.mouse.down();
await page.mouse.move(handle.x, handle.y - 90, { steps: 16 });
await page.mouse.up();
await page.waitForTimeout(300);
const moved = await hubY();
console.log("after drag:", moved, `(moved ${original - moved}px up)`);
await page.screenshot({ path: path.join(shots, "reopen-2-moved.png") });

await page.click("#save");
await page.waitForTimeout(1200);
console.log("saved. tweaks now:", JSON.stringify(await tweaks()));
console.log("ui after save:", JSON.stringify(await state()));

console.log("\n--- reopen WITHOUT recompiling ---");
await open();
const reopened = await hubY();
console.log("part origin on screen:", reopened);
console.log("  fresh was", original, "| moved to", moved, "| now", reopened);
console.log(
  reopened !== null && Math.abs(reopened - moved) <= 4
    ? "  -> shows the SAVED position"
    : reopened !== null && Math.abs(reopened - original) <= 4
      ? "  -> shows the ORIGINAL position (the saved move is invisible)"
      : "  -> shows neither",
);
console.log("ui:", JSON.stringify(await state()));
await page.screenshot({ path: path.join(shots, "reopen-3-reopened.png") });

if (errors.length) console.log("\npage errors:", errors.slice(0, 3));
await browser.close();
