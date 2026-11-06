#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function usage() {
  console.log(`Usage:
  node scripts/sourcemap-hunt.mjs --recon original-recon.json --out RECON/sourcemaps [--all-external]

Finds sourceMappingURL hints in discovered JavaScript bundles and tries to download source maps.
`);
}

function parseArgs(argv) {
  const out = { recon: "", outDir: "RECON/sourcemaps", allExternal: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--recon") out.recon = argv[++i] || "";
    else if (arg === "--out") out.outDir = argv[++i] || "RECON/sourcemaps";
    else if (arg === "--all-external") out.allExternal = true;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return out;
}

function collectScripts(recon) {
  const scripts = new Set();
  for (const capture of recon.captures || []) {
    for (const script of capture.signals?.scripts || []) {
      if (/^https?:\/\//i.test(script)) scripts.add(script);
    }
  }
  return Array.from(scripts);
}

function fileNameFor(url, suffix = "") {
  const parsed = new URL(url);
  const base = path.basename(parsed.pathname).replace(/[^a-z0-9._-]+/gi, "-").slice(0, 90) || "bundle.js";
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 10);
  return `${base}-${hash}${suffix}`;
}

function resolveMapUrl(scriptUrl, mapHint) {
  if (!mapHint) return `${scriptUrl}.map`;
  if (mapHint.startsWith("data:")) return "";
  return new URL(mapHint, scriptUrl).toString();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "web-clone-skill/1.0 sourcemap-hunt",
      "accept": "*/*",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.recon) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const recon = JSON.parse(fs.readFileSync(args.recon, "utf8"));
  const originHost = recon.url ? new URL(recon.url).hostname : "";
  const scripts = collectScripts(recon).filter((script) => args.allExternal || new URL(script).hostname === originHost);
  const outDir = path.resolve(args.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const results = [];
  for (const scriptUrl of scripts) {
    const entry = { scriptUrl, status: "unknown", mapUrl: "", mapFile: "", error: "" };
    try {
      const js = await fetchText(scriptUrl);
      const hint = js.match(/[#@]\s*sourceMappingURL=([^\s*]+)/)?.[1] || "";
      entry.mapUrl = resolveMapUrl(scriptUrl, hint);
      if (!entry.mapUrl) {
        entry.status = "inline-or-data-map";
        results.push(entry);
        continue;
      }
      const mapText = await fetchText(entry.mapUrl);
      const mapFile = path.join(outDir, fileNameFor(entry.mapUrl, ".map"));
      fs.writeFileSync(mapFile, mapText);
      entry.mapFile = mapFile;
      entry.status = "ok";
    } catch (error) {
      entry.status = "error";
      entry.error = error.message;
    }
    results.push(entry);
  }

  const manifest = {
    source: args.recon,
    url: recon.url,
    allExternal: args.allExternal,
    scriptCount: scripts.length,
    mapCount: results.filter((item) => item.status === "ok").length,
    results,
  };
  const manifestFile = path.join(outDir, "sourcemap-manifest.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(manifestFile);
} catch (error) {
  console.error(`sourcemap-hunt failed: ${error.message}`);
  process.exit(1);
}
