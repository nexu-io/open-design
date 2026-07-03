#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadPlaywright, launchChromium } from "./lib/playwright-loader.mjs";

function usage() {
  console.log(`Usage:
  node scripts/network-capture.mjs --url <url> --out RECON/network [--label original] [--wait 5000] [--max-bytes 1000000]

Captures browser requests and saves JSON/text XHR/fetch responses as fixtures.
`);
}

function parseArgs(argv) {
  const out = { url: "", outDir: "RECON/network", label: "site", waitMs: 5000, maxBytes: 1_000_000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--url") out.url = argv[++i] || "";
    else if (arg === "--out") out.outDir = argv[++i] || "RECON/network";
    else if (arg === "--label") out.label = argv[++i] || "site";
    else if (arg === "--wait") out.waitMs = Number(argv[++i] || "5000");
    else if (arg === "--max-bytes") out.maxBytes = Number(argv[++i] || "1000000");
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return out;
}

function safeFixtureName(url, contentType) {
  const parsed = new URL(url);
  const cleanPath = parsed.pathname.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "response";
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 10);
  const ext = contentType.includes("json") ? ".json" : ".txt";
  return `${cleanPath}-${hash}${ext}`;
}

function shouldSave(resourceType, contentType) {
  if (!["xhr", "fetch"].includes(resourceType)) return false;
  return /json|text|graphql|javascript/i.test(contentType || "");
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.url) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const outDir = path.resolve(args.outDir);
  const fixturesDir = path.join(outDir, "fixtures");
  fs.mkdirSync(fixturesDir, { recursive: true });

  const { chromium } = loadPlaywright();
  const browser = await launchChromium(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const requests = [];
  const responses = [];

  page.on("request", (request) => {
    requests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      headers: request.headers(),
      postData: request.postData() || "",
    });
  });

  page.on("response", async (response) => {
    const request = response.request();
    const headers = response.headers();
    const contentType = headers["content-type"] || "";
    const entry = {
      url: response.url(),
      status: response.status(),
      ok: response.ok(),
      method: request.method(),
      resourceType: request.resourceType(),
      contentType,
      fixture: "",
      error: "",
    };

    if (shouldSave(request.resourceType(), contentType)) {
      try {
        const body = await response.body();
        if (body.length <= args.maxBytes) {
          const file = path.join(fixturesDir, safeFixtureName(response.url(), contentType));
          fs.writeFileSync(file, body);
          entry.fixture = path.relative(outDir, file);
          entry.bytes = body.length;
        } else {
          entry.error = `body too large: ${body.length}`;
        }
      } catch (error) {
        entry.error = error.message;
      }
    }

    responses.push(entry);
  });

  await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: args.waitMs }).catch(() => {});
  if (args.waitMs > 0) await page.waitForTimeout(args.waitMs);
  await browser.close();

  const manifest = {
    label: args.label,
    url: args.url,
    capturedAt: new Date().toISOString(),
    requestCount: requests.length,
    responseCount: responses.length,
    fixtureCount: responses.filter((response) => response.fixture).length,
    requests,
    responses,
  };

  const manifestFile = path.join(outDir, `${args.label}-network.json`);
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(manifestFile);
} catch (error) {
  console.error(`network-capture failed: ${error.message}`);
  process.exit(1);
}
