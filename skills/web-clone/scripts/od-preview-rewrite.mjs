#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log(`Usage:
  node scripts/od-preview-rewrite.mjs [--project <clone-dir>]

Rewrites project-root asset URLs in HTML/CSS/SVG files so Open Design's
file preview and exported zip can render the clone from nested entry files.
`);
}

function parseArgs(argv) {
  const out = { project: process.cwd(), help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--project") out.project = argv[++i] || process.cwd();
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return out;
}

const includeExt = new Set([".html", ".htm", ".css", ".svg"]);
const skipDirs = new Set([
  ".git",
  ".next",
  ".nuxt",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "RECON",
]);

const projectAssetPrefixes = new Set([
  "_next",
  "asset",
  "assets",
  "assets-cdn",
  "audio",
  "css",
  "favicon",
  "file",
  "files",
  "flower",
  "flowers",
  "font",
  "fonts",
  "icon",
  "icons",
  "image",
  "images",
  "img",
  "install-screenshots",
  "js",
  "media",
  "public",
  "reference-assets",
  "script",
  "scripts",
  "static",
  "video",
  "videos",
]);

const hostRootPrefixes = new Set(["api", "artifacts", "frames"]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) walk(path.join(dir, entry.name), files);
      continue;
    }
    if (includeExt.has(path.extname(entry.name).toLowerCase())) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function rootAssetPath(projectRoot, value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  const pathOnly = trimmed.split(/[?#]/, 1)[0]?.replace(/^\/+/, "").replace(/\\/g, "/") ?? "";
  if (!pathOnly) return null;

  let decodedPath = pathOnly;
  try {
    decodedPath = decodeURIComponent(pathOnly);
  } catch {
    // Use the encoded path below.
  }

  const parts = decodedPath.split("/");
  if (parts.some((part) => part.trim() === "..")) return null;
  const first = parts[0]?.toLowerCase();
  if (!first || hostRootPrefixes.has(first)) return null;
  const basename = parts.at(-1) ?? "";
  const looksLikeAsset = projectAssetPrefixes.has(first) || /\.[a-z0-9][a-z0-9_-]{0,15}$/i.test(basename);
  if (!looksLikeAsset) return null;
  if (!fs.existsSync(path.join(projectRoot, decodedPath))) return null;
  return decodedPath;
}

function suffixFor(value) {
  return value.match(/^[^?#]*([?#][\s\S]*)$/)?.[1] ?? "";
}

function relativeRef(projectRoot, ownerFile, targetPath, suffix = "") {
  const fromDir = path.dirname(ownerFile);
  const target = path.join(projectRoot, targetPath);
  let rel = path.relative(fromDir, target).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return `${rel}${suffix}`;
}

function rewriteRootRef(projectRoot, ownerFile, value) {
  const target = rootAssetPath(projectRoot, value);
  if (!target) return value;
  return relativeRef(projectRoot, ownerFile, target, suffixFor(value));
}

function rewriteSrcset(projectRoot, ownerFile, srcset) {
  return srcset
    .split(",")
    .map((candidate) => {
      const leading = candidate.match(/^\s*/)?.[0] ?? "";
      const trailing = candidate.match(/\s*$/)?.[0] ?? "";
      const body = candidate.trim();
      if (!body) return candidate;
      const [url, ...descriptors] = body.split(/\s+/);
      return `${leading}${[rewriteRootRef(projectRoot, ownerFile, url ?? ""), ...descriptors].join(" ")}${trailing}`;
    })
    .join(",");
}

function rewriteCssUrls(projectRoot, ownerFile, text) {
  return text.replace(
    /url\(\s*(['"]?)(\/(?!\/)[^'")]+)\1\s*\)/gi,
    (match, quote, value) => {
      const rewritten = rewriteRootRef(projectRoot, ownerFile, value);
      if (rewritten === value) return match;
      const q = quote || "";
      return `url(${q}${rewritten}${q})`;
    },
  );
}

function rewriteHtmlAttrs(projectRoot, ownerFile, text) {
  let next = text.replace(
    /(\s)(src|href|poster|data-src|data-tool-chip-src)\s*=\s*(['"])([\s\S]*?)\3/gi,
    (match, space, name, quote, value) => {
      const rewritten = rewriteRootRef(projectRoot, ownerFile, value);
      if (rewritten === value) return match;
      return `${space}${name}=${quote}${rewritten}${quote}`;
    },
  );
  next = next.replace(
    /(\s)srcset\s*=\s*(['"])([\s\S]*?)\2/gi,
    (match, space, quote, value) => {
      const rewritten = rewriteSrcset(projectRoot, ownerFile, value);
      if (rewritten === value) return match;
      return `${space}srcset=${quote}${rewritten}${quote}`;
    },
  );
  return next;
}

function rewriteFile(projectRoot, file) {
  const before = fs.readFileSync(file, "utf8");
  const ext = path.extname(file).toLowerCase();
  let after = rewriteCssUrls(projectRoot, file, before);
  if (ext === ".html" || ext === ".htm" || ext === ".svg") {
    after = rewriteHtmlAttrs(projectRoot, file, after);
  }
  if (after === before) return false;
  fs.writeFileSync(file, after);
  return true;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const projectRoot = path.resolve(args.project);
  const files = walk(projectRoot);
  const changed = files.filter((file) => rewriteFile(projectRoot, file));
  for (const file of changed) {
    console.log(path.relative(projectRoot, file).split(path.sep).join("/"));
  }
  console.log(`od-preview-rewrite: ${changed.length} file(s) updated`);
} catch (error) {
  console.error(`od-preview-rewrite failed: ${error.message}`);
  process.exit(1);
}
