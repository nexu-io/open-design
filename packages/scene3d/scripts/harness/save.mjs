/**
 * Exercise the whole save path against a REAL daemon.
 *
 * Saving is the one feature the fixture harness cannot test at all: the
 * fixtures are served by a static file server, so there is no API to save
 * to and the button can only ever fail. Every part of this therefore points
 * at a live daemon and a real project, and checks the file on disk rather
 * than the button's own opinion of how it went.
 *
 * Usage:
 *   node scripts/harness/save.mjs --daemon http://127.0.0.1:PORT --project <id>
 *                                 [--scene scenes/crate] [--shots <dir>]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const args = process.argv.slice(2);
const arg = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;

const daemon = arg("--daemon", process.env.OD_DAEMON_URL || "");
const project = arg("--project", process.env.OD_PROJECT_ID || "");
const scene = arg("--scene", "scenes/crate");
const shotDir = arg("--shots", path.join(here, ".shots"));
if (!daemon || !project) {
  console.error("need --daemon <url> and --project <id>");
  process.exit(2);
}
fs.mkdirSync(shotDir, { recursive: true });

const api = `${daemon}/api/projects/${encodeURIComponent(project)}`;
const kitUrl = `${api}/files/kit.html`;

async function loadPlaywright() {
  for (const b of [path.join(repoRoot, "e2e", "package.json"), path.join(repoRoot, "package.json")]) {
    if (!fs.existsSync(b)) continue;
    const require = createRequire(b);
    for (const id of ["playwright-core", "playwright", "@playwright/test"]) {
      try {
        const mod = await import(pathToFileURL(require.resolve(id)).href);
        const api = mod.chromium ? mod : mod.default;
        if (api && api.chromium) return api;
      } catch {
        /* next */
      }
    }
  }
  throw new Error("no Playwright install found — run `pnpm install`");
}

const tweaksOnDisk = async () => {
  const res = await fetch(`${api}/scene3d/tweaks?scenePath=${encodeURIComponent(scene)}`);
  if (!res.ok) return { error: res.status };
  return res.json();
};

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1100, height: 780 },
  colorScheme: "light",
});
const page = await context.newPage();

const errors = [];
const failedRequests = [];
const apiCalls = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});
page.on("requestfailed", (r) => failedRequests.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`));
page.on("response", (r) => {
  if (r.url().includes("/scene3d/tweaks")) {
    apiCalls.push(`${r.request().method()} ${r.status()} ${r.url().replace(daemon, "")}`);
  }
});

const shot = async (name) => {
  const file = path.join(shotDir, `save-${name}.png`);
  await page.screenshot({ path: file });
  return file;
};

/** Read the viewer's own view of what is dirty and what the buttons say. */
const uiState = () =>
  page.evaluate(() => {
    const btn = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      return {
        hidden: el.hidden,
        text: (el.textContent || "").trim(),
        disabled: el.disabled === true,
      };
    };
    return {
      save: btn("save"),
      reset: btn("reset"),
      undo: btn("undo"),
      edit: (document.querySelector(".tip .tedit")?.textContent || "").trim() || null,
      editHidden: document.querySelector(".tip .tedit")?.hidden ?? null,
    };
  });

console.log(`kit: ${kitUrl}`);
await page.goto(kitUrl, { waitUntil: "networkidle" });
await page.waitForTimeout(900);

console.log("\n=== 1. before any edit ===");
console.log("  tweaks on disk:", JSON.stringify(await tweaksOnDisk()));
console.log("  ui:", JSON.stringify(await uiState()));
console.log("  shot:", await shot("1-loaded"));

// Select a part by clicking the middle of the viewport, then confirm.
await page.mouse.click(550, 420);
await page.waitForTimeout(400);
const selected = await page.evaluate(() => {
  const el = document.querySelector(".tip .tname");
  return el ? el.textContent : null;
});
console.log("\n=== 2. selected ===");
console.log("  part:", selected);
console.log("  shot:", await shot("2-selected"));

// Drag the vertical arrow so the part actually moves.
/* Where along the shaft to press. The midpoint is deliberately reachable:
   it is where the rotation rings cross the arrows, which is the case that
   used to offer Save for a gesture that changed nothing. */
const grabAt = Number(process.env.OD_GRAB_AT || "0.85");
const handle = await page.evaluate((at) => {
  const axes = [...document.querySelectorAll(".gizmo .axis")];
  for (const axis of axes) {
    const g = axis.querySelector(".grab");
    if (!g) continue;
    const n = (a) => parseFloat(g.getAttribute(a));
    const dx = n("x2") - n("x1");
    const dy = n("y2") - n("y1");
    // The most vertical handle on screen, so the drag is unambiguous.
    if (Math.abs(dy) > Math.abs(dx)) {
      return { x: n("x1") + dx * at, y: n("y1") + dy * at };
    }
  }
  return null;
}, grabAt);

if (!handle) {
  console.log("\n  !! no axis handle found — cannot drag");
} else {
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x, handle.y - 70, { steps: 14 });
  await page.waitForTimeout(200);
  const measuring = await page.evaluate(() => {
    const el = document.getElementById("measure");
    return el ? (el.textContent || "").trim().replace(/\s+/g, " ") : null;
  });
  await page.mouse.up();
  await page.waitForTimeout(300);
  console.log("\n=== 3. dragged ===");
  console.log("  measurement read:", measuring);
  console.log("  ui:", JSON.stringify(await uiState()));
  console.log("  shot:", await shot("3-dragged"));
}

console.log("\n=== 4. save ===");
const before = await tweaksOnDisk();
/* A hidden Save is a RESULT, not a failure to click. A gesture that changed
   nothing must not offer to save nothing, so the run reports that and moves
   on rather than timing out on a button it should not find. */
const offered = await page.evaluate(() => !document.getElementById("save")?.hidden);
console.log("  save offered:", offered);
if (offered) {
  await page.click("#save");
  await page.waitForTimeout(1200);
}
console.log("  button says:", JSON.stringify((await uiState()).save));
console.log("  api calls:", JSON.stringify(apiCalls));
const after = await tweaksOnDisk();
console.log("  disk before:", JSON.stringify(before));
console.log("  disk after :", JSON.stringify(after));
console.log("  shot:", await shot("4-saved"));

console.log("\n=== 5. reload — does the edit survive? ===");
await page.goto(kitUrl, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await page.mouse.click(550, 420);
await page.waitForTimeout(400);
console.log("  ui:", JSON.stringify(await uiState()));
console.log("  tweaks on disk:", JSON.stringify(await tweaksOnDisk()));
console.log("  shot:", await shot("5-reloaded"));

if (errors.length) console.log("\npage errors:", errors.slice(0, 4));
if (failedRequests.length) console.log("failed requests:", failedRequests.slice(0, 4));

await browser.close();
