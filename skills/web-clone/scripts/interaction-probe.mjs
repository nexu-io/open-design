#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadPlaywright, launchChromium } from "./lib/playwright-loader.mjs";

function usage() {
  console.log(`Usage:
  node scripts/interaction-probe.mjs --url <url> --out RECON/interactions [--label original] [--max-clicks 12] [--max-hovers 8] [--wait 800] [--width 1440]

Exercises scroll, hover, safe clicks, and canvas drag gestures, then saves screenshots plus state/network evidence.
`);
}

function parseArgs(argv) {
  const out = {
    url: "",
    outDir: "RECON/interactions",
    label: "site",
    maxClicks: 12,
    maxHovers: 8,
    waitMs: 800,
    width: 1440,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--url") out.url = argv[++i] || "";
    else if (arg === "--out") out.outDir = argv[++i] || "RECON/interactions";
    else if (arg === "--label") out.label = argv[++i] || "site";
    else if (arg === "--max-clicks") out.maxClicks = Number(argv[++i] || "12");
    else if (arg === "--max-hovers") out.maxHovers = Number(argv[++i] || "8");
    else if (arg === "--wait") out.waitMs = Number(argv[++i] || "800");
    else if (arg === "--width") out.width = Number(argv[++i] || "1440");
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return out;
}

function shortHash(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 10);
}

function safeFileName(label) {
  return label.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "step";
}

function markdown(result) {
  const lines = [
    `# ${result.label} interaction probe`,
    "",
    `- URL: ${result.url}`,
    `- Actions: ${result.actions.length}`,
    `- Console errors: ${result.consoleErrors.length}`,
    `- Network events: ${result.network.length}`,
    "",
    "## Actions",
    "| # | Type | Target | Changed | URL after | Screenshot |",
    "|---:|---|---|---:|---|---|",
  ];
  result.actions.forEach((action, index) => {
    lines.push(`| ${index + 1} | ${action.type} | ${String(action.target || "").replaceAll("|", "\\|")} | ${action.changed ? "yes" : "no"} | ${action.after.url.replaceAll("|", "\\|")} | ${action.screenshot || ""} |`);
  });
  if (result.findings.length) {
    lines.push("");
    lines.push("## Findings");
    for (const finding of result.findings) lines.push(`- ${finding}`);
  }
  return `${lines.join("\n")}\n`;
}

async function snapshot(page) {
  return page.evaluate(() => {
    const text = (node) => (node?.textContent || "").trim().replace(/\s+/g, " ");
    const visible = (selector) => Array.from(document.querySelectorAll(selector)).filter((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    }).length;
    const bodyText = document.body?.innerText || "";
    const html = document.documentElement.outerHTML;
    return {
      url: location.href,
      title: document.title || "",
      activeElement: document.activeElement?.tagName?.toLowerCase() || "",
      scrollY: Math.round(window.scrollY),
      bodyTextChars: bodyText.length,
      bodyTextStart: bodyText.trim().replace(/\s+/g, " ").slice(0, 500),
      counts: {
        dialogs: visible("dialog,[role='dialog'],[aria-modal='true']"),
        popovers: visible("[popover],.popover,.modal,.drawer,.menu,[role='menu']"),
        canvases: document.querySelectorAll("canvas").length,
        videos: document.querySelectorAll("video").length,
        buttons: document.querySelectorAll("button,[role='button']").length,
        forms: document.forms.length,
      },
      htmlHash: "__HASH_PLACEHOLDER__",
      htmlLength: html.length,
    };
  });
}

async function hashSnapshot(page, state) {
  const htmlHash = await page.evaluate(() => {
    const html = document.documentElement.outerHTML;
    let hash = 0;
    for (let i = 0; i < html.length; i += 1) {
      hash = ((hash << 5) - hash + html.charCodeAt(i)) | 0;
    }
    return String(hash);
  });
  return { ...state, htmlHash };
}

async function candidates(page) {
  return page.evaluate(() => {
    function selectorFor(node) {
      if (node.id && !/\s/.test(node.id)) return `#${CSS.escape(node.id)}`;
      const parts = [];
      let current = node;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 6) {
        const tag = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (!parent) {
          parts.unshift(tag);
          break;
        }
        const sameTag = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
        const index = sameTag.indexOf(current) + 1;
        parts.unshift(`${tag}:nth-of-type(${index})`);
        current = parent;
      }
      return parts.join(" > ");
    }
    const text = (node) => (node.innerText || node.textContent || node.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width >= 8 && rect.height >= 8 && style.visibility !== "hidden" && style.display !== "none";
    };
    const interactive = Array.from(document.querySelectorAll("button,a[href],summary,input,textarea,select,[role='button'],[tabindex]"))
      .filter(visible)
      .slice(0, 80)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const tag = node.tagName.toLowerCase();
        const href = node.href || node.getAttribute("href") || "";
        const safeClick = tag === "button" || tag === "summary" || node.getAttribute("role") === "button" || href.startsWith("#") || href.startsWith(location.origin);
        return {
          selector: selectorFor(node),
          tag,
          type: node.getAttribute("type") || "",
          role: node.getAttribute("role") || "",
          href,
          text: text(node).slice(0, 120),
          ariaLabel: node.getAttribute("aria-label") || "",
          safeClick,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        };
      });
    const canvases = Array.from(document.querySelectorAll("canvas")).filter(visible).slice(0, 4).map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        selector: selectorFor(node),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      };
    });
    return { interactive, canvases };
  });
}

function hasChanged(before, after) {
  if (before.url !== after.url) return true;
  if (before.htmlHash !== after.htmlHash) return true;
  if (before.scrollY !== after.scrollY) return true;
  return JSON.stringify(before.counts) !== JSON.stringify(after.counts);
}

async function freshPage(browser, args, network, consoleErrors) {
  const page = await browser.newPage({ viewport: { width: args.width, height: 900 }, deviceScaleFactor: 1 });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    const request = response.request();
    if (["xhr", "fetch"].includes(request.resourceType())) {
      network.push({ url: response.url(), status: response.status(), method: request.method(), resourceType: request.resourceType() });
    }
  });
  await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
  if (args.waitMs > 0) await page.waitForTimeout(args.waitMs);
  return page;
}

async function captureAction(page, outDir, index, action, before) {
  if (action.type === "scroll") {
    await page.evaluate((ratio) => window.scrollTo({ top: Math.round((document.documentElement.scrollHeight - window.innerHeight) * ratio), behavior: "instant" }), action.ratio);
  } else if (action.type === "hover") {
    await page.locator(action.selector).first().hover({ timeout: 3000 });
  } else if (action.type === "click") {
    await page.locator(action.selector).first().click({ timeout: 4000 });
  } else if (action.type === "canvas-drag") {
    const rect = action.rect;
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + Math.min(180, rect.width * 0.25), y + Math.min(120, rect.height * 0.2), { steps: 8 });
    await page.mouse.up();
  }
  await page.waitForTimeout(450);
  const after = await hashSnapshot(page, await snapshot(page));
  const screenshotName = `${String(index + 1).padStart(2, "0")}-${safeFileName(`${action.type}-${action.target || action.selector || "page"}`)}-${shortHash(JSON.stringify(action))}.png`;
  const screenshotPath = path.join(outDir, "screenshots", screenshotName);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return {
    ...action,
    before,
    after,
    changed: hasChanged(before, after),
    screenshot: path.relative(outDir, screenshotPath),
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.url) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const outDir = path.resolve(args.outDir);
  fs.mkdirSync(path.join(outDir, "screenshots"), { recursive: true });

  const { chromium } = loadPlaywright();
  const browser = await launchChromium(chromium);
  const network = [];
  const consoleErrors = [];

  const seedPage = await freshPage(browser, args, network, consoleErrors);
  const initial = await hashSnapshot(seedPage, await snapshot(seedPage));
  const discovered = await candidates(seedPage);
  await seedPage.screenshot({ path: path.join(outDir, "screenshots", "00-initial.png"), fullPage: true });
  await seedPage.close();

  const actions = [
    { type: "scroll", target: "middle", ratio: 0.5 },
    { type: "scroll", target: "bottom", ratio: 1 },
    ...discovered.interactive.slice(0, args.maxHovers).map((item) => ({ type: "hover", target: item.text || item.ariaLabel || item.selector, selector: item.selector, meta: item })),
    ...discovered.interactive.filter((item) => item.safeClick).slice(0, args.maxClicks).map((item) => ({ type: "click", target: item.text || item.ariaLabel || item.selector, selector: item.selector, meta: item })),
    ...discovered.canvases.map((item) => ({ type: "canvas-drag", target: item.selector, selector: item.selector, rect: item.rect })),
  ];

  const results = [];
  for (let index = 0; index < actions.length; index += 1) {
    const page = await freshPage(browser, args, network, consoleErrors);
    const before = await hashSnapshot(page, await snapshot(page));
    try {
      results.push(await captureAction(page, outDir, index, actions[index], before));
    } catch (error) {
      results.push({
        ...actions[index],
        before,
        after: before,
        changed: false,
        screenshot: "",
        error: error.message,
      });
    } finally {
      await page.close();
    }
  }

  await browser.close();

  const changedCount = results.filter((action) => action.changed).length;
  const findings = [
    `${discovered.interactive.length} visible interactive candidates discovered`,
    `${discovered.canvases.length} visible canvas targets discovered`,
    `${changedCount}/${results.length} actions changed DOM, URL, scroll, or visible overlay counts`,
  ];
  if (discovered.canvases.length) findings.push("Canvas drag evidence exists; inspect screenshots before simplifying WebGL/Canvas behavior.");

  const result = {
    label: args.label,
    url: args.url,
    capturedAt: new Date().toISOString(),
    initial,
    discovered,
    actions: results,
    network,
    consoleErrors,
    findings,
  };
  const jsonFile = path.join(outDir, `${args.label}-interactions.json`);
  const mdFile = path.join(outDir, `${args.label}-interactions.md`);
  fs.writeFileSync(jsonFile, `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(mdFile, markdown(result));
  console.log(jsonFile);
} catch (error) {
  console.error(`interaction-probe failed: ${error.message}`);
  process.exit(1);
}
