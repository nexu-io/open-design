#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadPlaywright, launchChromium } from "./lib/playwright-loader.mjs";

function usage() {
  console.log(`Usage:
  node scripts/route-crawl.mjs --url <url> --out RECON/routes [--label original] [--max-pages 25] [--max-depth 2] [--width 1440] [--wait 800] [--allow-subdomains]

Crawls same-site internal links, captures a screenshot per route, and writes a route map.
`);
}

function parseArgs(argv) {
  const out = {
    url: "",
    outDir: "RECON/routes",
    label: "site",
    maxPages: 25,
    maxDepth: 2,
    width: 1440,
    waitMs: 800,
    allowSubdomains: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--url") out.url = argv[++i] || "";
    else if (arg === "--out") out.outDir = argv[++i] || "RECON/routes";
    else if (arg === "--label") out.label = argv[++i] || "site";
    else if (arg === "--max-pages") out.maxPages = Number(argv[++i] || "25");
    else if (arg === "--max-depth") out.maxDepth = Number(argv[++i] || "2");
    else if (arg === "--width") out.width = Number(argv[++i] || "1440");
    else if (arg === "--wait") out.waitMs = Number(argv[++i] || "800");
    else if (arg === "--allow-subdomains") out.allowSubdomains = true;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return out;
}

function normalizeUrl(rawUrl, baseUrl) {
  try {
    const url = new URL(rawUrl, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function sameSite(candidate, origin, allowSubdomains) {
  const url = new URL(candidate);
  const root = new URL(origin);
  if (url.origin === root.origin) return true;
  return allowSubdomains && url.hostname.endsWith(`.${root.hostname}`);
}

function routeFileName(url) {
  const parsed = new URL(url);
  const clean = `${parsed.hostname}${parsed.pathname}`.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "route";
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 8);
  return `${clean}-${hash}.png`;
}

function summarizeMarkdown(result) {
  const lines = [
    `# ${result.label} route map`,
    "",
    `- URL: ${result.url}`,
    `- Captured routes: ${result.routes.length}`,
    `- Max depth: ${result.maxDepth}`,
    `- Max pages: ${result.maxPages}`,
    "",
    "## Routes",
    "| Depth | Status | Path | Title | H1 | Links | Screenshot |",
    "|---:|---:|---|---|---|---:|---|",
  ];
  for (const route of result.routes) {
    const url = new URL(route.url);
    const pathLabel = `${url.pathname}${url.search}`;
    lines.push(`| ${route.depth} | ${route.status || ""} | ${pathLabel || "/"} | ${route.title.replaceAll("|", "\\|")} | ${route.h1.join(" / ").replaceAll("|", "\\|")} | ${route.linkCount} | ${route.screenshot} |`);
  }
  if (result.skipped.length) {
    lines.push("");
    lines.push("## Skipped / Failed");
    for (const item of result.skipped.slice(0, 80)) {
      lines.push(`- ${item.url} · ${item.reason}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function collectPage(page) {
  return page.evaluate(() => {
    const text = (node) => (node?.textContent || "").trim().replace(/\s+/g, " ");
    const links = Array.from(document.querySelectorAll("a[href]")).map((a) => ({
      href: a.href,
      text: text(a).slice(0, 120),
    }));
    const headings = Array.from(document.querySelectorAll("h1,h2,h3")).slice(0, 40).map((node) => ({
      tag: node.tagName.toLowerCase(),
      text: text(node).slice(0, 160),
    }));
    return {
      href: location.href,
      title: document.title || "",
      lang: document.documentElement.lang || "",
      metaDescription: document.querySelector("meta[name='description']")?.content || "",
      h1: Array.from(document.querySelectorAll("h1")).map((node) => text(node)).filter(Boolean).slice(0, 8),
      headings,
      scrollHeight: document.documentElement.scrollHeight,
      counts: {
        links: links.length,
        images: document.images.length,
        canvas: document.querySelectorAll("canvas").length,
        forms: document.forms.length,
        buttons: document.querySelectorAll("button,[role='button']").length,
      },
      links,
    };
  });
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.url) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const startUrl = normalizeUrl(args.url, args.url);
  if (!startUrl) throw new Error(`Invalid URL: ${args.url}`);

  const outDir = path.resolve(args.outDir);
  const screenshotsDir = path.join(outDir, "screenshots");
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const { chromium } = loadPlaywright();
  const browser = await launchChromium(chromium);
  const page = await browser.newPage({ viewport: { width: args.width, height: 900 }, deviceScaleFactor: 1 });

  const queue = [{ url: startUrl, depth: 0, from: "" }];
  const seen = new Set();
  const routes = [];
  const skipped = [];

  while (queue.length && routes.length < args.maxPages) {
    const current = queue.shift();
    if (!current || seen.has(current.url)) continue;
    seen.add(current.url);

    if (current.depth > args.maxDepth) {
      skipped.push({ url: current.url, reason: `depth>${args.maxDepth}` });
      continue;
    }
    if (!sameSite(current.url, startUrl, args.allowSubdomains)) {
      skipped.push({ url: current.url, reason: "external" });
      continue;
    }

    const consoleErrors = [];
    const onConsole = (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    };
    page.on("console", onConsole);

    try {
      const response = await page.goto(current.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
      if (args.waitMs > 0) await page.waitForTimeout(args.waitMs);
      const data = await collectPage(page);
      const screenshotName = routeFileName(current.url);
      const screenshotPath = path.join(screenshotsDir, screenshotName);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      routes.push({
        url: current.url,
        from: current.from,
        depth: current.depth,
        status: response?.status() || 0,
        title: data.title,
        lang: data.lang,
        metaDescription: data.metaDescription,
        h1: data.h1,
        headings: data.headings,
        counts: data.counts,
        linkCount: data.links.length,
        screenshot: path.relative(outDir, screenshotPath),
        consoleErrors,
      });

      for (const link of data.links) {
        const nextUrl = normalizeUrl(link.href, current.url);
        if (!nextUrl || seen.has(nextUrl)) continue;
        if (!sameSite(nextUrl, startUrl, args.allowSubdomains)) continue;
        queue.push({ url: nextUrl, depth: current.depth + 1, from: current.url });
      }
    } catch (error) {
      skipped.push({ url: current.url, reason: error.message });
    } finally {
      page.off("console", onConsole);
    }
  }

  await browser.close();

  const result = {
    label: args.label,
    url: startUrl,
    capturedAt: new Date().toISOString(),
    maxPages: args.maxPages,
    maxDepth: args.maxDepth,
    allowSubdomains: args.allowSubdomains,
    routes,
    skipped,
  };
  const jsonFile = path.join(outDir, `${args.label}-route-map.json`);
  const mdFile = path.join(outDir, `${args.label}-route-map.md`);
  fs.writeFileSync(jsonFile, `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(mdFile, summarizeMarkdown(result));
  console.log(jsonFile);
} catch (error) {
  console.error(`route-crawl failed: ${error.message}`);
  process.exit(1);
}
