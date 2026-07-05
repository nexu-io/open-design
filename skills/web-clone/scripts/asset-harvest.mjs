#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function usage() {
  console.log(`Usage:
  node scripts/asset-harvest.mjs --recon original-recon.json --out assets/original [--manifest asset-manifest.json] [--all-external]

Reads recon JSON, downloads discovered images/scripts/stylesheets, and writes a manifest.
`);
}

function parseArgs(argv) {
  const out = { recon: "", outDir: "assets/original", manifest: "", allExternal: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--recon") out.recon = argv[++i] || "";
    else if (arg === "--out") out.outDir = argv[++i] || "assets/original";
    else if (arg === "--manifest") out.manifest = argv[++i] || "";
    else if (arg === "--all-external") out.allExternal = true;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return out;
}

function safeName(url) {
  const parsed = new URL(url);
  const ext = path.extname(parsed.pathname).slice(0, 12);
  const base = path.basename(parsed.pathname, ext).replace(/[^a-z0-9._-]+/gi, "-").slice(0, 80) || "asset";
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 10);
  return `${base}-${hash}${ext || ".bin"}`;
}

function collectAssets(recon) {
  const assets = new Map();
  for (const capture of recon.captures || []) {
    const signals = capture.signals || {};
    for (const src of signals.scripts || []) assets.set(src, { type: "script", url: src });
    for (const href of signals.stylesheets || []) assets.set(href, { type: "stylesheet", url: href });
    for (const image of signals.images || []) {
      if (image.src) assets.set(image.src, { type: "image", url: image.src, alt: image.alt, width: image.width, height: image.height });
    }
  }
  return Array.from(assets.values()).filter((asset) => /^https?:\/\//i.test(asset.url));
}

async function download(asset, outDir) {
  const response = await fetch(asset.url, {
    headers: {
      "user-agent": "web-clone-skill/1.0 asset-harvest",
      "accept": "*/*",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const hostDir = path.join(outDir, new URL(asset.url).hostname);
  fs.mkdirSync(hostDir, { recursive: true });
  const file = path.join(hostDir, safeName(asset.url));
  fs.writeFileSync(file, buffer);
  return { ...asset, status: "ok", bytes: buffer.length, file };
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.recon) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const recon = JSON.parse(fs.readFileSync(args.recon, "utf8"));
  const outDir = path.resolve(args.outDir);
  const manifestFile = path.resolve(args.manifest || path.join(outDir, "asset-manifest.json"));
  const originHost = recon.url ? new URL(recon.url).hostname : "";
  const assets = collectAssets(recon).filter((asset) => args.allExternal || new URL(asset.url).hostname === originHost);
  const results = [];

  for (const asset of assets) {
    try {
      results.push(await download(asset, outDir));
    } catch (error) {
      results.push({ ...asset, status: "error", error: error.message });
    }
  }

  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  fs.writeFileSync(manifestFile, `${JSON.stringify({
    source: args.recon,
    url: recon.url,
    allExternal: args.allExternal,
    total: results.length,
    ok: results.filter((item) => item.status === "ok").length,
    error: results.filter((item) => item.status === "error").length,
    assets: results,
  }, null, 2)}\n`);
  console.log(manifestFile);
} catch (error) {
  console.error(`asset-harvest failed: ${error.message}`);
  process.exit(1);
}
