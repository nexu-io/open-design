#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadPlaywright, launchChromium } from "./lib/playwright-loader.mjs";

function usage() {
  console.log(`Usage:
  node scripts/recon-site.mjs --url <url> --out <RECON dir> [--label original|clone] [--widths 1440,768,390] [--wait 1200]

Outputs:
  <out>/<label>-recon.json
  <out>/<label>-summary.md
  <out>/screenshots/<label>-<width>.png
`);
}

function parseArgs(argv) {
  const out = {
    url: "",
    outDir: "RECON",
    label: "site",
    widths: [1440, 768, 390],
    waitMs: 1200,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--url") out.url = argv[++i] || "";
    else if (arg === "--out") out.outDir = argv[++i] || "";
    else if (arg === "--label") out.label = argv[++i] || "site";
    else if (arg === "--widths") out.widths = (argv[++i] || "").split(",").map((n) => Number(n.trim())).filter(Boolean);
    else if (arg === "--wait") out.waitMs = Number(argv[++i] || "1200");
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return out;
}

function summarizeFlags(signals) {
  return Object.entries(signals.frameworks || {})
    .filter(([, value]) => value)
    .map(([key]) => key);
}

function writeSummary(file, data) {
  const first = data.captures[0]?.signals || {};
  const lines = [
    `# ${data.label} recon`,
    "",
    `- URL: ${data.url}`,
    `- Title: ${first.title || ""}`,
    `- Lang: ${first.lang || ""}`,
    `- Viewports: ${data.captures.map((c) => c.viewport.width).join(", ")}`,
    `- Framework signals: ${summarizeFlags(first).join(", ") || "none"}`,
    `- Canvas count: ${first.counts?.canvas ?? 0}`,
    `- Video count: ${first.counts?.video ?? 0}`,
    `- Image count: ${first.counts?.images ?? 0}`,
    `- Link count: ${first.counts?.links ?? 0}`,
    `- Console errors: ${data.console.errors.length}`,
    `- Page errors: ${data.console.pageErrors.length}`,
    "",
    "## Screenshots",
    ...data.captures.map((c) => `- ${c.viewport.width}: ${c.screenshot}`),
    "",
  ];
  fs.writeFileSync(file, lines.join("\n"));
}

async function collectSignals(page) {
  return page.evaluate(() => {
    const bySelector = (selector) => Array.from(document.querySelectorAll(selector));
    const text = (node) => (node?.textContent || "").trim().replace(/\s+/g, " ");
    const win = window;
    const scripts = bySelector("script[src]").map((s) => s.src);
    const stylesheets = bySelector("link[rel='stylesheet']").map((s) => s.href);
    const headings = bySelector("h1,h2,h3").slice(0, 60).map((h) => ({
      tag: h.tagName.toLowerCase(),
      text: text(h).slice(0, 160),
    }));
    const sections = bySelector("header,nav,main,section,article,aside,footer").slice(0, 80).map((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        tag: node.tagName.toLowerCase(),
        id: node.id || "",
        className: String(node.className || "").slice(0, 160),
        text: text(node).slice(0, 240),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        style: {
          display: style.display,
          position: style.position,
          backgroundColor: style.backgroundColor,
          color: style.color,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
        },
      };
    });
    const cssVariables = Array.from(document.styleSheets).flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules || []);
      } catch {
        return [];
      }
    }).flatMap((rule) => {
      const style = rule.style;
      if (!style) return [];
      return Array.from(style)
        .filter((name) => name.startsWith("--"))
        .map((name) => [name, style.getPropertyValue(name).trim()]);
    }).slice(0, 200);
    const images = bySelector("img").slice(0, 80).map((img) => ({
      src: img.currentSrc || img.src,
      alt: img.alt || "",
      width: img.naturalWidth || img.width || 0,
      height: img.naturalHeight || img.height || 0,
    }));
    const canvases = bySelector("canvas").map((canvas) => ({
      width: canvas.width,
      height: canvas.height,
      cssWidth: canvas.getBoundingClientRect().width,
      cssHeight: canvas.getBoundingClientRect().height,
    }));
    return {
      href: location.href,
      title: document.title,
      lang: document.documentElement.lang || "",
      bodyTextChars: (document.body?.innerText || "").length,
      scrollHeight: document.documentElement.scrollHeight,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      h1: bySelector("h1").map((h) => text(h)).filter(Boolean).slice(0, 10),
      headings,
      metaDescription: document.querySelector("meta[name='description']")?.content || "",
      counts: {
        links: bySelector("a[href]").length,
        images: bySelector("img").length,
        video: bySelector("video").length,
        canvas: bySelector("canvas").length,
        sections: sections.length,
        forms: bySelector("form").length,
        buttons: bySelector("button").length,
        inputs: bySelector("input,textarea,select").length,
        interactive: bySelector("a[href],button,input,textarea,select,summary,[role='button'],[tabindex]").length,
        scripts: scripts.length,
        stylesheets: stylesheets.length,
      },
      frameworks: {
        react: Boolean(win.__REACT_DEVTOOLS_GLOBAL_HOOK__) || Boolean(document.querySelector("#__next,[data-reactroot],[data-reactid]")),
        next: Boolean(document.querySelector("#__next")) || scripts.some((src) => src.includes("/_next/")),
        vue: Boolean(win.__VUE__) || Boolean(document.querySelector("[data-v-app]")),
        nuxt: Boolean(win.__NUXT__) || scripts.some((src) => src.includes("/_nuxt/")),
        svelte: Boolean(document.querySelector("[data-svelte-h]")),
        astro: Boolean(document.querySelector("[data-astro-cid]")) || scripts.some((src) => src.includes("astro")),
        three: Boolean(win.THREE) || scripts.some((src) => /three(\.module)?(\.min)?\.js/i.test(src)),
        gsap: Boolean(win.gsap) || scripts.some((src) => src.toLowerCase().includes("gsap")),
        lenis: Boolean(win.Lenis) || scripts.some((src) => src.toLowerCase().includes("lenis")),
      },
      scripts: scripts.slice(0, 120),
      stylesheets: stylesheets.slice(0, 80),
      sections,
      cssVariables,
      fonts: Array.from(document.fonts || []).map((font) => font.family).filter(Boolean).slice(0, 40),
      images,
      canvases,
    };
  });
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.url) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const { chromium } = loadPlaywright();
  const outDir = path.resolve(args.outDir);
  const screenshotsDir = path.join(outDir, "screenshots");
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const consoleState = { errors: [], warnings: [], pageErrors: [] };
  const browser = await launchChromium(chromium);
  const captures = [];

  for (const width of args.widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    page.on("console", (message) => {
      const entry = { type: message.type(), text: message.text(), viewport: width };
      if (message.type() === "error") consoleState.errors.push(entry);
      if (message.type() === "warning") consoleState.warnings.push(entry);
    });
    page.on("pageerror", (error) => {
      consoleState.pageErrors.push({ message: error.message, viewport: width });
    });

    await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    if (args.waitMs > 0) await page.waitForTimeout(args.waitMs);

    const signals = await collectSignals(page);
    const screenshotName = `${args.label}-${width}.png`;
    const screenshotPath = path.join(screenshotsDir, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    captures.push({
      viewport: { width, height: 900 },
      screenshot: path.relative(outDir, screenshotPath),
      signals,
    });
    await page.close();
  }

  await browser.close();

  const result = {
    label: args.label,
    url: args.url,
    capturedAt: new Date().toISOString(),
    console: consoleState,
    captures,
  };
  const jsonFile = path.join(outDir, `${args.label}-recon.json`);
  fs.writeFileSync(jsonFile, `${JSON.stringify(result, null, 2)}\n`);
  writeSummary(path.join(outDir, `${args.label}-summary.md`), result);
  console.log(jsonFile);
} catch (error) {
  console.error(`recon-site failed: ${error.message}`);
  process.exit(1);
}
