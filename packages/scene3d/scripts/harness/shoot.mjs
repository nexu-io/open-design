/**
 * Screenshot every harness fixture at the viewport sizes the viewer is
 * actually used at, so viewer design can be iterated by looking rather
 * than by guessing.
 *
 * Serves the fixture directory over HTTP because the page fetches its GLB;
 * a `file://` origin would block that and every shot would show the error
 * state instead of the design.
 *
 * Usage: node scripts/harness/shoot.mjs [--browser chromium|firefox]
 */
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
/*
 * `--dir <path>` points the harness at a REAL generated kit — a compiled
 * project's `kit.html` and its actual GLBs — instead of the synthetic
 * fixtures. Reviewing the design only against a hand-built six-box crate is
 * how details that only appear on real assets (long part names, real issue
 * codes, dense neighbourhoods) go unseen.
 */
const dirArg = process.argv.includes("--dir")
  ? process.argv[process.argv.indexOf("--dir") + 1]
  : null;
const fixtures = dirArg ? path.resolve(dirArg) : path.join(here, ".out");
const shots = path.join(here, ".shots");
fs.mkdirSync(shots, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".usda": "text/plain",
  ".obj": "text/plain",
  ".mtl": "text/plain",
};

/** Panel-sized (the app's right pane) and full-window. */
const SIZES = [
  { id: "panel", width: 780, height: 720 },
  { id: "wide", width: 1280, height: 800 },
  { id: "narrow", width: 560, height: 760 },
];

const args = process.argv.slice(2);
const browserName = args.includes("--browser") ? args[args.indexOf("--browser") + 1] : "chromium";
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

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
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

/*
 * Playwright lives in the e2e package, not here — the harness is a dev tool
 * for this package, not a dependency of it.
 *
 * Resolved through Node's own resolver rather than by reaching into a
 * hardcoded `.pnpm/playwright-core@<version>/…` path. That path embeds the
 * exact installed version, so it silently broke on every upgrade and fell
 * back to a bare specifier that cannot resolve from here either — the
 * harness would simply stop working with no explanation. `createRequire`
 * walks the real resolution chain from the workspace root and finds
 * whatever version is installed.
 */
async function loadPlaywright() {
  /* pnpm's node_modules is strict: a package can only resolve its own
     declared dependencies. Playwright is declared by `e2e`, not by the root
     or by scene3d, so resolution has to start from the package that owns
     it. Each base is tried in turn rather than assuming one layout. */
  const bases = [
    path.join(repoRoot, "e2e", "package.json"),
    path.join(repoRoot, "package.json"),
    path.join(here, "..", "..", "package.json"),
  ];
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    const require = createRequire(base);
    for (const id of ["playwright-core", "playwright", "@playwright/test"]) {
      try {
        const mod = await import(pathToFileURL(require.resolve(id)).href);
        // Some entrypoints resolve but export a test runner rather than the
        // browser launchers, and others put them on `default`. Only accept a
        // module that can actually launch a browser, or the failure surfaces
        // later as an unexplained "cannot read launch of undefined".
        const api = mod.chromium ? mod : mod.default;
        if (api && api.chromium) return api;
      } catch {
        /* try the next candidate */
      }
    }
  }
  throw new Error(
    "no Playwright install found in this workspace — run `pnpm install`, or " +
      "`pnpm --filter @open-design/e2e exec playwright install chromium`",
  );
}
const { chromium, firefox } = await loadPlaywright();
const engine = browserName === "firefox" ? firefox : chromium;
// Headless Chromium's default GL path drops the WebGL context under load
// here, which reads as "the model vanished" in a screenshot. Pin it to
// SwiftShader through ANGLE so shots are of the design, not of a dead
// context.
const browser = await engine.launch({
  args: browserName === "firefox" ? [] : [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});

const pages = fs
  .readdirSync(fixtures)
  .filter((f) => f.endsWith(".html"))
  .filter((f) => !only || f === `${only}.html`);

for (const file of pages) {
  const name = path.basename(file, ".html");
  for (const size of SIZES) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 2,
      colorScheme: "light",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${base}/${file}`, { waitUntil: "networkidle" });
    // Let the mesh load and the first frame paint.
    await page.waitForTimeout(600);
    // Select a part on one variant so the gizmo and in-world label are in
    // frame — they are most of the editor and would otherwise never be
    // reviewed.
    /* Select a part on the panel-sized shot of EVERY fixture, not just one.
       The selection card, gizmo and leader are most of this UI, and gating
       them behind a single hardcoded fixture name meant they were never
       reviewed against any other asset — including real compiled ones. */
    if (size.id === "panel") {
      await page.mouse.click(size.width / 2, size.height / 2);
      await page.waitForTimeout(400);
      // Drag the Y arrow a little so the measurements box is in frame with
      // a real value in it. A readout that is only ever screenshotted at
      // rest is a readout nobody has actually reviewed.
      // Grab the Y shaft at its midpoint. boundingBox() is degenerate for a
      // vertical line (zero width), so read the endpoints and interpolate.
      const at = await page.evaluate(() => {
        // Index among .axis elements, not among the gizmo's children: the
        // overlay also holds a <defs> and the hub, so nth-child silently
        // selects a different axis whenever that structure changes.
        const axis = document.querySelectorAll(".gizmo .axis")[1];
        const g = axis && axis.querySelector(".grab");
        if (!g) return null;
        const n = (a) => parseFloat(g.getAttribute(a));
        return { x: (n("x1") + n("x2")) / 2, y: (n("y1") + n("y2")) / 2 };
      });
      if (at) {
        await page.mouse.move(at.x, at.y);
        await page.mouse.down();
        await page.mouse.move(at.x, at.y - 45, { steps: 8 });
        await page.waitForTimeout(250);
      }
    }
    const out = path.join(shots, `${name}-${size.id}.png`);
    await page.screenshot({ path: out });
    if (errors.length) console.log(`  ! ${name}-${size.id}: ${errors[0]}`);
    await context.close();
  }
  console.log(`shot ${name}`);
}

await browser.close();
server.close();
console.log(`\n${pages.length * SIZES.length} screenshots in ${shots}`);
