/**
 * Drive real gestures against a real viewer and read back what moved.
 *
 * The screenshot harness proves how the editor LOOKS; this proves how it
 * BEHAVES. Both of the bugs it was written for were invisible in a still:
 * a rotate drag that snaps back a full turn only shows up if you actually
 * go round, and a pointer-to-world scale that is pinned to one canvas
 * height only shows up if you drive the same drag at two viewport sizes
 * and compare.
 *
 * Usage: node scripts/harness/gesture.mjs [--fixture full]
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
const fixtures = path.join(here, ".out");
const fixture = arg("--fixture", "full");

const MIME = { ".html": "text/html; charset=utf-8", ".glb": "model/gltf-binary" };
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
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

async function loadPlaywright() {
  for (const b of [
    path.join(repoRoot, "e2e", "package.json"),
    path.join(repoRoot, "package.json"),
  ]) {
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

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

/** Open the fixture at a given size and select the part under the centre. */
async function open(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: "light" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/${fixture}.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.mouse.click(width / 2, height / 2);
  await page.waitForTimeout(350);
  return { context, page, errors };
}

/** Screen centre of the gizmo hub, which rides on the selected part. */
const hubCentre = (page) =>
  page.evaluate(() => {
    const el = document.querySelector(".gizmo .hub-arc");
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });

/** Whatever the measurements box currently reads. */
const measureText = (page) =>
  page.evaluate(() => {
    const el = document.getElementById("measure");
    return el ? (el.textContent || "").trim().replace(/\s+/g, " ") : null;
  });

console.log("=== rotate: one continuous drag right round the ring ===");
{
  const { context, page, errors } = await open(900, 900);
  // Grab a rotation ring, then walk the pointer around the hub in a full
  // circle. A correct implementation reports a monotonically growing angle;
  // the broken one snaps back 360 degrees as atan2 crosses its seam.
  /* `.ring` is the free-move hit circle sitting on the hub; the rotation
     rings are `.ring-grab`. Grabbing the former drives a translate, which
     is how this probe first reported "Moved 9mm" for a rotate test. */
  const grabbed = await page.evaluate(() => {
    const hub = document.querySelector(".gizmo .hub-arc");
    const grabs = [...document.querySelectorAll(".gizmo .ring-grab")];
    if (!hub || grabs.length === 0) return null;
    const h = hub.getBoundingClientRect();
    // Widest ring, so the grab point is far from the hub and the sweep is
    // well conditioned.
    const box = grabs
      .map((g) => g.getBoundingClientRect())
      .reduce((a, b) => (b.width > a.width ? b : a));
    return {
      cx: h.left + h.width / 2,
      cy: h.top + h.height / 2,
      r: box.width / 2,
      // A point guaranteed to sit on the stroke: the ellipse's own extreme.
      grabX: box.left + 2,
      grabY: box.top + box.height / 2,
    };
  });
  if (!grabbed) console.log("  no ring found");
  else {
    // Press on the ring's stroke, then sweep a full circle about the hub.
    await page.mouse.move(grabbed.grabX, grabbed.grabY);
    await page.mouse.down();
    const startAngle = Math.atan2(grabbed.grabY - grabbed.cy, grabbed.grabX - grabbed.cx);
    const radius = Math.hypot(grabbed.grabX - grabbed.cx, grabbed.grabY - grabbed.cy);
    const readings = [];
    for (let i = 1; i <= 24; i++) {
      const a = startAngle + (i / 24) * Math.PI * 2;
      await page.mouse.move(
        grabbed.cx + Math.cos(a) * radius,
        grabbed.cy + Math.sin(a) * radius,
      );
      readings.push(await measureText(page));
    }
    await page.mouse.up();
    const degrees = readings
      .map((t) => (t && t.match(/(-?\d+(?:\.\d+)?)\s*°/) ? Number(RegExp.$1) : null))
      .filter((n) => n !== null);
    console.log("  readings:", degrees.join(" "));
    let backwards = 0;
    for (let i = 1; i < degrees.length; i++) if (degrees[i] < degrees[i - 1] - 90) backwards++;
    console.log(
      `  span ${degrees.length ? (degrees[degrees.length - 1] - degrees[0]).toFixed(1) : "n/a"}°,` +
        ` backward jumps > 90°: ${backwards} (expect 0)`,
    );
  }
  if (errors.length) console.log("  page errors:", errors[0]);
  await context.close();
}

console.log("\n=== free move: the part must track the cursor 1:1 at any canvas height ===");
{
  /*
   * The property worth asserting is not "the two numbers differ" but "the
   * part stays under the pointer". Metres-per-pixel scales as
   * 1/canvasHeight, so a conversion pinned to one height moves the part too
   * far on a taller viewport and not far enough on a shorter one.
   * Measuring the gizmo hub, which rides on the part, turns that into a
   * direct pixel comparison: a 100px drag must move the hub 100px,
   * whatever the canvas.
   */
  for (const height of [520, 1040]) {
    const { context, page, errors } = await open(900, height);
    const before = await hubCentre(page);
    if (!before) {
      console.log(`  h=${height}: no gizmo hub on screen`);
      await context.close();
      continue;
    }
    await page.mouse.move(before.x, before.y);
    await page.mouse.down();
    await page.mouse.move(before.x + 100, before.y, { steps: 12 });
    await page.waitForTimeout(150);
    const during = await hubCentre(page);
    await page.mouse.up();
    const moved = during ? during.x - before.x : null;
    console.log(
      `  h=${height}: dragged 100px -> hub moved ${moved === null ? "n/a" : moved.toFixed(1)}px` +
        (moved === null ? "" : ` (error ${(moved - 100).toFixed(1)}px)`),
    );
    if (errors.length) console.log("    page errors:", errors[0]);
    await context.close();
  }
}

console.log("");
console.log("=== summon reveal + held-modifier cues ===");
{
  const { context, page, errors } = await open(900, 720);
  const dash = () =>
    page.evaluate(() => {
      const shaft = document.querySelector(".gizmo .axis .shaft");
      const ring = document.querySelector(".gizmo .axis .ring-arc");
      const cls = document.querySelector(".gizmo").getAttribute("class");
      return {
        cls,
        shaft: shaft ? shaft.style.strokeDasharray || "(none)" : null,
        ring: ring ? ring.style.strokeDasharray || "(none)" : null,
      };
    });

  console.log("  at rest:      ", JSON.stringify(await dash()));
  await page.keyboard.down("Control");
  await page.mouse.move(450, 360);
  await page.waitForTimeout(200);
  console.log("  ctrl held:    ", JSON.stringify(await dash()));
  await page.keyboard.up("Control");
  await page.keyboard.down("Shift");
  await page.mouse.move(451, 361);
  await page.waitForTimeout(200);
  console.log("  shift held:   ", JSON.stringify(await dash()));
  await page.keyboard.up("Shift");
  await page.mouse.move(452, 362);
  await page.waitForTimeout(200);
  console.log("  released:     ", JSON.stringify(await dash()));
  console.log("  hint reads:   ", await page.evaluate(() => document.getElementById("hint").textContent));
  if (errors.length) console.log("  page errors:", errors[0]);
  await context.close();
}

console.log("");
console.log("=== card controls: hide handles / collapse card ===");
{
  const { context, page, errors } = await open(900, 720);
  const state = () =>
    page.evaluate(() => {
      const tip = document.querySelector(".tip");
      const g = document.querySelector(".gizmo");
      const near = document.querySelector(".tip .tnear");
      return {
        gizmoOff: g.classList.contains("off"),
        folded: tip.classList.contains("folded"),
        cardHeight: Math.round(tip.getBoundingClientRect().height),
        mapVisible: near ? getComputedStyle(near).display !== "none" && !near.hidden : null,
        nameVisible: !!document.querySelector(".tip .tname").textContent,
      };
    });

  console.log("  selected:        ", JSON.stringify(await state()));
  await page.click("#tipGizmo");
  await page.waitForTimeout(200);
  console.log("  handles hidden:  ", JSON.stringify(await state()));
  await page.click("#tipFold");
  await page.waitForTimeout(250);
  console.log("  card collapsed:  ", JSON.stringify(await state()));
  await page.click("#tipFold");
  await page.click("#tipGizmo");
  await page.waitForTimeout(250);
  console.log("  both restored:   ", JSON.stringify(await state()));

  // The G shortcut, and persistence across a new selection.
  await page.keyboard.press("g");
  await page.waitForTimeout(150);
  const afterKey = await state();
  await page.mouse.click(450, 500);
  await page.waitForTimeout(300);
  const afterReselect = await state();
  console.log("  G pressed:       ", JSON.stringify(afterKey));
  console.log("  after reselect:  ", JSON.stringify(afterReselect));
  if (errors.length) console.log("  page errors:", errors[0]);
  await context.close();
}

console.log("");
console.log("=== selection broadcast: what the host receives ===");
{
  const { context, page, errors } = await open(900, 720);
  // Capture the message exactly as a host would: from the page's own
  // dispatch, which carries the same object as the postMessage.
  await page.evaluate(() => {
    window.__caught = [];
    document.addEventListener("od:scene3d-select", (e) => window.__caught.push(e.detail));
  });
  await page.mouse.click(450, 500);
  await page.waitForTimeout(300);
  const caught = await page.evaluate(() => window.__caught);
  const last = caught[caught.length - 1];
  if (!last) console.log("  nothing broadcast");
  else {
    console.log("  asset:", last.asset, "| scenePath:", last.scenePath);
    console.log("  selected:", JSON.stringify(last.partIds));
    console.log("  inventory:", last.parts.length, "parts");
    console.log("  sample:", JSON.stringify(last.parts.slice(0, 3)));
  }
  if (errors.length) console.log("  page errors:", errors[0]);
  await context.close();
}

await browser.close();
server.close();
