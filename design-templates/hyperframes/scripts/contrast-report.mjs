#!/usr/bin/env node
// contrast-report.mjs — HyperFrames contrast audit
//
// Reads a composition, seeks to N sample timestamps, walks the DOM for text
// elements, measures the WCAG 2.1 contrast ratio between each element's
// declared foreground color and the pixels behind it, and emits:
//
//   - contrast-report.json  (machine-readable, one entry per text element × sample)
//   - contrast-overlay.png  (sprite grid; magenta=fail AA, yellow=pass AA only, green=AAA)
//
// Usage:
//   node skills/hyperframes/scripts/contrast-report.mjs <composition-dir> \
//     [--samples N] [--out <dir>] [--width W] [--height H] [--fps N]
//
// The composition directory must contain an index.html. Raw authoring HTML
// works — the producer's file server auto-injects the runtime at serve time.
// Exits 1 if any text element fails WCAG AA.

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { hyperframesPackageSpec, importPackagesOrBootstrap } from "./package-loader.mjs";

// Use the producer's file server — it auto-injects the HyperFrames runtime
// and render-seek bridge, so raw authoring HTML works without a build step.
const packages = await importPackagesOrBootstrap(["@hyperframes/producer", "sharp"], {
  npmPackages: [hyperframesPackageSpec("@hyperframes/producer"), "sharp@0.34.5"],
});
const sharp = packages.sharp.default;
const {
  createFileServer,
  createCaptureSession,
  initializeSession,
  closeCaptureSession,
  captureFrameToBuffer,
  getCompositionDuration,
} = packages["@hyperframes/producer"];

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));
if (!args.composition) die("missing <composition-dir>");

const SAMPLES = Number(args.samples ?? 10);
const OUT_DIR = resolve(args.out ?? ".hyperframes/contrast");
const WIDTH = Number(args.width ?? 1920);
const HEIGHT = Number(args.height ?? 1080);
const FPS = Number(args.fps ?? 30);
const COMP_DIR = resolve(args.composition);

// ─── Main ────────────────────────────────────────────────────────────────────

await mkdir(OUT_DIR, { recursive: true });

const server = await createFileServer({ projectDir: COMP_DIR, port: 0 });
const session = await createCaptureSession(
  server.url,
  OUT_DIR,
  { width: WIDTH, height: HEIGHT, fps: FPS, format: "png" },
  null,
);
await initializeSession(session);

try {
  const duration = await getCompositionDuration(session);
  const times = Array.from(
    { length: SAMPLES },
    (_, i) => +(((i + 0.5) / SAMPLES) * duration).toFixed(3),
  );

  const allEntries = [];
  const overlayFrames = [];

  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const { buffer: pngBuf } = await captureFrameToBuffer(session, i, t);
    const elements = await probeTextElements(session, t);
    const annotated = await annotateFrame(pngBuf, elements);
    overlayFrames.push({ t, png: annotated });
    for (const el of elements) allEntries.push({ time: t, ...el });
  }

  const report = {
    composition: COMP_DIR,
    width: WIDTH,
    height: HEIGHT,
    duration,
    samples: times,
    entries: allEntries,
    summary: summarize(allEntries),
  };

  await writeFile(resolve(OUT_DIR, "contrast-report.json"), JSON.stringify(report, null, 2));
  await writeOverlaySprite(overlayFrames, resolve(OUT_DIR, "contrast-overlay.png"));

  printSummary(report);
  process.exitCode = report.summary.failAA > 0 ? 1 : 0;
} finally {
  await closeCaptureSession(session).catch(() => {});
  server.close();
}

// ─── DOM probe (runs in the page) ────────────────────────────────────────────

async function probeTextElements(session, _t) {
  // `session.page` is the Puppeteer Page owned by the capture session.
  // We pass a pure function to `evaluate`: it walks the DOM and returns
  // enough info for us to compute a ratio in Node using the frame buffer.
  return await session.page.evaluate(() => {
    /** @type {Array<{selector: string, text: string, fg: [number,number,number,number], fontSize: number, fontWeight: number, bbox: {x:number,y:number,w:number,h:number}}>} */
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    const parseColor = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 1];
      const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
      return [parts[0], parts[1], parts[2], parts[3] ?? 1];
    };
    const selectorOf = (el) => {
      if (el.id) return `#${el.id}`;
      const cls = [...el.classList].slice(0, 2).join(".");
      return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
    };
    let el;
    while ((el = walker.nextNode())) {
      // must have direct text
      const direct = [...el.childNodes].some(
        (n) => n.nodeType === 3 && n.textContent.trim().length,
      );
      if (!direct) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      if (parseFloat(cs.opacity) <= 0.01) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      out.push({
        selector: selectorOf(el),
        text: el.textContent.trim().slice(0, 60),
        fg: parseColor(cs.color),
        fontSize: parseFloat(cs.fontSize),
        fontWeight: Number(cs.fontWeight) || 400,
        bbox: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      });
    }
    return out;
  });
}

// ─── Pixel sampling + WCAG math ──────────────────────────────────────────────

async function annotateFrame(pngBuf, elements) {
  const img = sharp(pngBuf);
  const meta = await img.metadata();
  const { width, height } = meta;
  const raw = await img.ensureAlpha().raw().toBuffer();
  const channels = 4;

  const measured = [];
  for (const el of elements) {
    const bg = sampleRingMedian(raw, width, height, channels, el.bbox);
    const fg = compositeOver(el.fg, bg); // flatten any alpha against measured bg
    const ratio = wcagRatio(fg, bg);
    const large = isLargeText(el.fontSize, el.fontWeight);
    el.bg = bg;
    el.ratio = +ratio.toFixed(2);
    el.wcagAA = large ? ratio >= 3 : ratio >= 4.5;
    el.wcagAALarge = ratio >= 3;
    el.wcagAAA = large ? ratio >= 4.5 : ratio >= 7;
    measured.push(el);
  }

  // Draw boxes + ratio labels as an SVG overlay (sharp composite).
  const svg = buildOverlaySVG(measured, width, height);
  return await sharp(pngBuf)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

function sampleRingMedian(raw, width, height, channels, bbox) {
  // 4-px ring immediately outside the element bbox. Median of each channel.
  const r = [],
    g = [],
    b = [];
  const x0 = Math.max(0, Math.floor(bbox.x) - 4);
  const x1 = Math.min(width - 1, Math.ceil(bbox.x + bbox.w) + 4);
  const y0 = Math.max(0, Math.floor(bbox.y) - 4);
  const y1 = Math.min(height - 1, Math.ceil(bbox.y + bbox.h) + 4);
  const pushPixel = (x, y) => {
    const i = (y * width + x) * channels;
    r.push(raw[i]);
    g.push(raw[i + 1]);
    b.push(raw[i + 2]);
  };
  for (let x = x0; x <= x1; x++) {
    pushPixel(x, y0);
    pushPixel(x, y1);
  }
  for (let y = y0; y <= y1; y++) {
    pushPixel(x0, y);
    pushPixel(x1, y);
  }
  return [median(r), median(g), median(b), 1];
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function compositeOver([fr, fg, fb, fa], [br, bg, bb]) {
  return [
    Math.round(fr * fa + br * (1 - fa)),
    Math.round(fg * fa + bg * (1 - fa)),
    Math.round(fb * fa + bb * (1 - fa)),
    1,
  ];
}

function relLum([r, g, b]) {
  const ch = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function wcagRatio(a, b) {
  const la = relLum(a);
  const lb = relLum(b);
  const [L1, L2] = la > lb ? [la, lb] : [lb, la];
  return (L1 + 0.05) / (L2 + 0.05);
}

function isLargeText(fontSize, fontWeight) {
  return fontSize >= 24 || (fontSize >= 19 && fontWeight >= 700);
}

// ─── Overlay rendering ───────────────────────────────────────────────────────

function buildOverlaySVG(elements, w, h) {
  const rects = elements
    .map((el) => {
      const color = !el.wcagAA ? "#ff00aa" : !el.wcagAAA ? "#ffcc00" : "#00e08a";
      const { x, y, w: bw, h: bh } = el.bbox;
      return `
        <rect x="${x}" y="${y}" width="${bw}" height="${bh}"
              fill="none" stroke="${color}" stroke-width="3"/>
        <rect x="${x}" y="${y - 18}" width="${48}" height="16" fill="${color}"/>
        <text x="${x + 4}" y="${y - 5}" font-family="monospace" font-size="12" fill="#000">
          ${el.ratio.toFixed(1)}:1
        </text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${rects}</svg>`;
}

async function writeOverlaySprite(frames, outPath) {
  if (!frames.length) return;
  const cols = Math.min(frames.length, 5);
  const rows = Math.ceil(frames.length / cols);
  const { width, height } = await sharp(frames[0].png).metadata();
  const scale = 0.25;
  const cellW = Math.round(width * scale);
  const cellH = Math.round(height * scale);

  const cells = await Promise.all(
    frames.map(async (f) => ({
      input: await sharp(f.png).resize(cellW, cellH).png().toBuffer(),
      time: f.t,
    })),
  );

  const composites = cells.map((c, i) => ({
    input: c.input,
    top: Math.floor(i / cols) * cellH,
    left: (i % cols) * cellW,
  }));

  await sharp({
    create: {
      width: cols * cellW,
      height: rows * cellH,
      channels: 3,
      background: { r: 16, g: 16, b: 20 },
    },
  })
    .composite(composites)
    .png()
    .toFile(outPath);
}

// ─── Summary ────────────────────────────────────────────────────────────────

function summarize(entries) {
  const total = entries.length;
  const failAA = entries.filter((e) => !e.wcagAA).length;
  const passAAonly = entries.filter((e) => e.wcagAA && !e.wcagAAA).length;
  const passAAA = entries.filter((e) => e.wcagAAA).length;
  return { total, failAA, passAAonly, passAAA };
}

function printSummary({ summary, entries }) {
  const { total, failAA, passAAonly, passAAA } = summary;
  console.log(`\nContrast report: ${total} text-element samples`);
  console.log(`  fail WCAG AA:     ${failAA}`);
  console.log(`  pass AA, not AAA: ${passAAonly}`);
  console.log(`  pass AAA:         ${passAAA}`);
  if (failAA) {
    console.log("\nFailures:");
    for (const e of entries.filter((x) => !x.wcagAA)) {
      console.log(`  t=${e.time}s  ${e.selector.padEnd(24)}  ${e.ratio.toFixed(2)}:1  "${e.text}"`);
    }
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {};
  let positional = 0;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1]?.startsWith("--") ? true : argv[++i];
      out[k] = v;
    } else if (positional === 0) {
      out.composition = a;
      positional++;
    }
  }
  return out;
}

function die(msg) {
  console.error(`contrast-report: ${msg}`);
  process.exit(2);
}
