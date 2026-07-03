#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadPlaywright, launchChromium } from "./lib/playwright-loader.mjs";

function usage() {
  console.log(`Usage:
  node scripts/visual-diff.mjs --original <png> --clone <png> --out visual-diff.json [--diff visual-diff.png] [--threshold 0.08]

Compares screenshots in a real browser canvas and outputs numeric visual-diff metrics.
`);
}

function parseArgs(argv) {
  const out = { original: "", clone: "", out: "visual-diff.json", diff: "", threshold: 0.08 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--original") out.original = argv[++i] || "";
    else if (arg === "--clone") out.clone = argv[++i] || "";
    else if (arg === "--out") out.out = argv[++i] || "visual-diff.json";
    else if (arg === "--diff") out.diff = argv[++i] || "";
    else if (arg === "--threshold") out.threshold = Number(argv[++i] || "0.08");
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return out;
}

function imageDataUrl(file) {
  const ext = path.extname(file).slice(1).toLowerCase() || "png";
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}

function scoreFromDiff(diffRatio, meanAbsDiff) {
  if (diffRatio <= 0.01 && meanAbsDiff <= 0.01) return 5;
  if (diffRatio <= 0.04 && meanAbsDiff <= 0.025) return 4.5;
  if (diffRatio <= 0.08 && meanAbsDiff <= 0.05) return 4;
  if (diffRatio <= 0.16 && meanAbsDiff <= 0.08) return 3;
  if (diffRatio <= 0.3 && meanAbsDiff <= 0.14) return 2;
  return 1;
}

async function compareInBrowser(page, original, clone, threshold) {
  return page.evaluate(async ({ original, clone, threshold }) => {
    const loadImage = (src) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 80)}`));
      image.src = src;
    });

    const [left, right] = await Promise.all([loadImage(original), loadImage(clone)]);
    const width = Math.max(left.naturalWidth, right.naturalWidth);
    const height = Math.max(left.naturalHeight, right.naturalHeight);

    const canvasA = document.createElement("canvas");
    const canvasB = document.createElement("canvas");
    const canvasD = document.createElement("canvas");
    for (const canvas of [canvasA, canvasB, canvasD]) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctxA = canvasA.getContext("2d");
    const ctxB = canvasB.getContext("2d");
    const ctxD = canvasD.getContext("2d");
    ctxA.fillStyle = "white";
    ctxB.fillStyle = "white";
    ctxA.fillRect(0, 0, width, height);
    ctxB.fillRect(0, 0, width, height);
    ctxA.drawImage(left, 0, 0);
    ctxB.drawImage(right, 0, 0);

    const a = ctxA.getImageData(0, 0, width, height);
    const b = ctxB.getImageData(0, 0, width, height);
    const d = ctxD.createImageData(width, height);
    let changed = 0;
    let sumAbs = 0;
    let sumSq = 0;

    for (let i = 0; i < a.data.length; i += 4) {
      const dr = Math.abs(a.data[i] - b.data[i]);
      const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
      const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
      const da = Math.abs(a.data[i + 3] - b.data[i + 3]);
      const delta = (dr + dg + db + da) / 1020;
      sumAbs += delta;
      sumSq += delta * delta;
      if (delta > threshold) changed += 1;

      if (delta > threshold) {
        d.data[i] = 255;
        d.data[i + 1] = Math.max(0, 80 - delta * 80);
        d.data[i + 2] = Math.max(0, 80 - delta * 80);
        d.data[i + 3] = 255;
      } else {
        d.data[i] = Math.round(a.data[i] * 0.25 + 245 * 0.75);
        d.data[i + 1] = Math.round(a.data[i + 1] * 0.25 + 245 * 0.75);
        d.data[i + 2] = Math.round(a.data[i + 2] * 0.25 + 245 * 0.75);
        d.data[i + 3] = 255;
      }
    }

    ctxD.putImageData(d, 0, 0);
    const pixels = width * height;
    const diffPixelRatio = changed / pixels;
    const meanAbsDiff = sumAbs / pixels;
    const rmse = Math.sqrt(sumSq / pixels);

    return {
      original: { width: left.naturalWidth, height: left.naturalHeight },
      clone: { width: right.naturalWidth, height: right.naturalHeight },
      comparedCanvas: { width, height },
      threshold,
      changedPixels: changed,
      totalPixels: pixels,
      diffPixelRatio,
      meanAbsDiff,
      rmse,
      diffPngDataUrl: canvasD.toDataURL("image/png"),
    };
  }, { original, clone, threshold });
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.original || !args.clone) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const { chromium } = loadPlaywright();
  const browser = await launchChromium(chromium);
  const page = await browser.newPage();
  const result = await compareInBrowser(page, imageDataUrl(args.original), imageDataUrl(args.clone), args.threshold);
  await browser.close();

  const diffDataUrl = result.diffPngDataUrl;
  delete result.diffPngDataUrl;
  result.visualScore = scoreFromDiff(result.diffPixelRatio, result.meanAbsDiff);
  result.files = {
    original: path.resolve(args.original),
    clone: path.resolve(args.clone),
    diff: args.diff ? path.resolve(args.diff) : "",
  };

  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`);

  if (args.diff) {
    const base64 = diffDataUrl.replace(/^data:image\/png;base64,/, "");
    fs.mkdirSync(path.dirname(path.resolve(args.diff)), { recursive: true });
    fs.writeFileSync(args.diff, Buffer.from(base64, "base64"));
  }

  console.log(path.resolve(args.out));
} catch (error) {
  console.error(`visual-diff failed: ${error.message}`);
  process.exit(1);
}
