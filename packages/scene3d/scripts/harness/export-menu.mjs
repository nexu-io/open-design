/**
 * Photograph the real Export menu for a compiled 3D asset.
 *
 * The menu is web-app chrome, not part of the generated page, so none of the
 * kit harnesses can see it. This drives the actual app: open the project,
 * open the compiled artifact, open Export, and shoot what a user would see.
 *
 * Usage: node scripts/harness/export-menu.mjs --web <url> --project <id>
 *                                             [--file kit.html]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const args = process.argv.slice(2);
const arg = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const web = arg("--web", "");
const project = arg("--project", "");
const fileName = arg("--file", "kit.html");
if (!web || !project) {
  console.error("need --web <url> and --project <id>");
  process.exit(2);
}
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

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: Number(arg("--width", "1440")), height: 900 },
  deviceScaleFactor: 3,
  colorScheme: "light",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

/* The app is a statically exported SPA behind a catch-all route, so there is
   no deep link to a project — navigation happens by clicking, and so does
   this. */
const projectName = arg("--project-name", "scene3d crate demo");
await page.goto(web, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(shots, "menu-0-home.png") });

const card = page.getByText(projectName, { exact: false }).first();
try {
  await card.click({ timeout: 8000 });
} catch {
  console.log(`could not find a project card named "${projectName}"`);
}
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(shots, "menu-0-project.png") });
console.log("project open");

// Open the compiled artifact from the file rail.
const opened = await (async () => {
  for (const name of [fileName, "kit.html"]) {
    const row = page.getByText(name, { exact: false }).first();
    try {
      if (await row.isVisible({ timeout: 2000 })) {
        await row.click();
        await page.waitForTimeout(3000);
        return name;
      }
    } catch {
      /* try the next candidate */
    }
  }
  return null;
})();
console.log("opened file:", opened);
await page.screenshot({ path: path.join(shots, "menu-1-artifact.png") });

// Find the Export / download control in the viewer toolbar.
const exportBtn = await (async () => {
  for (const sel of [
    '[data-testid="share-export-button"]',
    'button[aria-label*="Export" i]',
    'button[title*="Export" i]',
    'button[aria-label*="Download" i]',
    'button[title*="Download" i]',
  ]) {
    const el = page.locator(sel).first();
    try {
      if (await el.isVisible({ timeout: 1200 })) return { sel, el };
    } catch {
      /* next */
    }
  }
  return null;
})();

if (!exportBtn) {
  console.log("could not find the Export control");
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .map((b) => b.getAttribute("aria-label") || b.getAttribute("title") || b.textContent?.trim())
      .filter(Boolean)
      .slice(0, 40),
  );
  console.log("visible buttons:", JSON.stringify(buttons, null, 1));
} else {
  console.log("export control:", exportBtn.sel);
  await exportBtn.el.click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(shots, "menu-2-export-open.png") });
  /* A closeup of just the menu, at 3x. Judging chip proportions from a
     full-page 1x screenshot is judging them at a third of the size a person
     sees them, which is how "roughly aligned" passes for "right". */
  const panel = page.locator(".share-menu-model-row").first().locator("xpath=..");
  try {
    const box = await panel.boundingBox();
    if (box) {
      await page.screenshot({
        path: path.join(shots, "menu-3-chips-closeup.png"),
        clip: {
          x: Math.max(0, box.x - 12),
          y: Math.max(0, box.y - 30),
          width: Math.min(1440 - box.x + 12, box.width + 24),
          height: box.height + 60,
        },
        scale: "css",
      });
    }
  } catch { /* closeup is diagnostic only */ }
  const chipMetrics = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll(".share-menu-model-row .share-menu-model-format")) {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out.push({
        text: el.textContent,
        tag: el.tagName,
        w: +b.width.toFixed(1),
        h: +b.height.toFixed(1),
        pad: cs.padding,
        font: cs.fontSize + "/" + cs.lineHeight,
        minW: cs.minWidth,
        minH: cs.minHeight,
        box: cs.boxSizing,
        align: getComputedStyle(el.parentElement).alignItems,
      });
      if (out.length >= 7) break;
    }
    return out;
  });
  const chain = await page.evaluate(() => {
    const row = document.querySelector(".share-menu-model-row");
    const out = [];
    let el = row;
    for (let i = 0; el && i < 7; i++) {
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      out.push({
        tag: el.tagName,
        cls: (el.getAttribute("class") || "").slice(0, 44),
        w: +b.width.toFixed(1),
        bg: cs.backgroundColor,
        radius: cs.borderRadius,
        shadow: cs.boxShadow === "none" ? "none" : "yes",
        overflow: cs.overflow,
        minW: cs.minWidth,
      });
      el = el.parentElement;
    }
    return out;
  });
  console.log("ancestry (row -> up):");
  for (const c of chain) console.log("  ", JSON.stringify(c));

  /*
   * Does anything inside the menu stick out of it?
   *
   * A cropped screenshot cannot answer this — the crop is taken from the
   * content's own bounding box, so content that has escaped its container is
   * exactly what ends up filling the picture. Comparing each row's right
   * edge against the panel's is the check that a picture cannot fake.
   */
  const overflow = await page.evaluate(() => {
    const panel = document.querySelector(".chrome-unified-panel");
    if (!panel) return null;
    const box = panel.getBoundingClientRect();
    const worst = [];
    for (const el of panel.querySelectorAll(".share-menu-model-row, .share-menu-model-formats, .share-menu-model-format")) {
      const b = el.getBoundingClientRect();
      const spill = Math.max(0, +(b.right - box.right).toFixed(1));
      if (spill > 0.5) {
        worst.push({ cls: (el.getAttribute("class") || "").split(" ")[0], spill });
      }
    }
    return { panelWidth: +box.width.toFixed(1), panelRight: +box.right.toFixed(1), spills: worst };
  });
  console.log("overflow check:", JSON.stringify(overflow));

  const layout = await page.evaluate(() => {
    const row = document.querySelector(".share-menu-model-row--all");
    const name = row?.querySelector(".share-menu-model-name");
    const chips = row?.querySelector(".share-menu-model-formats");
    const panel = row?.closest(".chrome-unified-panel") || row?.parentElement;
    const w = (el) => (el ? +el.getBoundingClientRect().width.toFixed(1) : null);
    return {
      panel: w(panel),
      row: w(row),
      label: w(name),
      labelNeeds: name ? name.scrollWidth : null,
      chips: w(chips),
    };
  });
  console.log("layout:", JSON.stringify(layout));
  console.log("chip metrics:");
  for (const m of chipMetrics) console.log("  ", JSON.stringify(m));
  const items = await page.evaluate(() =>
    [...document.querySelectorAll('[role="menuitem"], .share-menu-item, .share-menu-model-row')]
      .map((el) => el.textContent?.trim().replace(/\s+/g, " "))
      .filter(Boolean),
  );
  console.log("menu contents:");
  for (const item of items) console.log("  -", item);
}

/* Click it and read the archive. A menu entry that looks right and produces
   a corrupt or partial file is exactly the failure this exists to rule out. */
/* Click the gathered row's GLB chip: the bulk case, where the answer has to
   be an archive because N scenes cannot arrive as one mesh. */
const which = arg("--click", "bulk-glb");
const row =
  which.startsWith("bulk")
    ? page.locator(".share-menu-model-row").last()
    : page.locator(".share-menu-model-row").first();
const chip = which.endsWith("zip") ? /^ZIP$/ : /^GLB$/;
const all = row.locator(".share-menu-model-format", { hasText: chip }).first();
try {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    all.click(),
  ]);
  const out = path.join(shots, "download-all.zip");
  await download.saveAs(out);
  const bytes = fs.readFileSync(out);
  console.log("");
  console.log("archive: " + download.suggestedFilename() + " - " + bytes.length + " bytes");
  console.log("  signature:", bytes[0] === 0x50 && bytes[1] === 0x4b ? "PK (valid zip)" : "NOT a zip");
  /* Walk the OUTER archive's central directory, located from the end-of-
     central-directory record — not by scanning the whole file for header
     signatures. A `.usdz` is itself a zip, so a naive scan finds the nested
     archive's directory entries too and reports members this archive does
     not have. */
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  const names = [];
  if (eocd < 0) console.log("  (no end-of-central-directory record)");
  else {
    const count = bytes.readUInt16LE(eocd + 10);
    let at = bytes.readUInt32LE(eocd + 16);
    for (let n = 0; n < count; n++) {
      const size = bytes.readUInt32LE(at + 24);
      const nameLen = bytes.readUInt16LE(at + 28);
      const extraLen = bytes.readUInt16LE(at + 30);
      const commentLen = bytes.readUInt16LE(at + 32);
      names.push(bytes.slice(at + 46, at + 46 + nameLen).toString("utf8") + " (" + size + " bytes)");
      at += 46 + nameLen + extraLen + commentLen;
    }
  }
  console.log("  members:");
  for (const n of names) console.log("   -", n);
} catch (err) {
  console.log("");
  console.log("download failed:", String(err).split(String.fromCharCode(10))[0]);
}

if (errors.length) console.log("page errors:", errors.slice(0, 3));
await browser.close();
