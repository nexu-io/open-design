#!/usr/bin/env node
// asset-harvest.mjs — 把目标页真实用到的图片/字体/媒体"想尽一切办法"全部拔到本地。
//
// 为什么用真浏览器而不是裸 fetch:
//   1. 大站的图片/字体几乎都在第三方 CDN(static.nike.com / use.typekit.net /
//      fonts.gstatic.com …)，带防盗链(referer/UA/cookie 校验)。裸 fetch + 机器人
//      UA 会被 403；复用浏览器网络栈(同一 UA/cookie/协议)则和真实用户无差别。
//   2. 懒加载图(loading=lazy / data-src / IntersectionObserver)只有真滚动才发请求。
//   3. CSS background-image、@font-face、srcset/picture 变体只在渲染时按需请求，
//      静态解析 HTML 抓不全；监听 network response 才是"页面真实用到的资产"全集。
//
// 用法(首选, --url 直接捕获):
//   node scripts/asset-harvest.mjs --url <URL> --out assets [--recon RECON/original-recon.json]
//     [--types image,font,media,stylesheet] [--max-bytes 26214400] [--scroll-step 700] [--settle 2500]
// 兼容旧用法(--recon-only, 无浏览器捕获, 仅按 recon JSON 里的 URL 裸下载):
//   node scripts/asset-harvest.mjs --recon original-recon.json --out assets/original --recon-only
//
// 产物:
//   <out>/images/<host>/<name>   全部图片(含第三方 CDN、srcset 变体、CSS 背景图)
//   <out>/fonts/<host>/<name>    全部字体二进制(woff2/woff/ttf/otf)
//   <out>/fonts/fonts.css        自托管 @font-face(从 webfont CSS + @font-face 规则改写为本地路径)
//   <out>/media/<host>/<name>    音视频(受 --max-bytes 限制)
//   <out>/asset-manifest.json    originalUrl → localPath 全映射 + 每项状态
//     构建复刻页时照 manifest 机械替换引用，禁止凭记忆写外链。

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadPlaywright, launchChromium } from "./lib/playwright-loader.mjs";

function usage() {
  console.log(`asset-harvest.mjs — 抓取页面真实用到的图片/字体/媒体(含第三方 CDN)并生成本地映射

  node scripts/asset-harvest.mjs --url <URL> --out assets [--recon RECON/original-recon.json]
    [--types image,font,media,stylesheet] [--max-bytes 26214400] [--scroll-step 700] [--settle 2500]

产物: <out>/{images,fonts,media}/<host>/<name> + <out>/fonts/fonts.css(自托管 @font-face)
      + <out>/asset-manifest.json(originalUrl → localPath, 构建时照此机械替换)`);
}

function parseArgs(argv) {
  const out = {
    url: "",
    recon: "",
    outDir: "assets",
    manifest: "",
    types: ["image", "font", "media", "stylesheet"],
    maxBytes: 25 * 1024 * 1024,
    scrollStep: 700,
    settle: 2500,
    reconOnly: false,
    allExternal: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--url") out.url = argv[++i] || "";
    else if (arg === "--recon") out.recon = argv[++i] || "";
    else if (arg === "--out") out.outDir = argv[++i] || "assets";
    else if (arg === "--manifest") out.manifest = argv[++i] || "";
    else if (arg === "--types") out.types = (argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--max-bytes") out.maxBytes = Number(argv[++i] || out.maxBytes);
    else if (arg === "--scroll-step") out.scrollStep = Number(argv[++i] || "700");
    else if (arg === "--settle") out.settle = Number(argv[++i] || "2500");
    else if (arg === "--recon-only") out.reconOnly = true;
    else if (arg === "--all-external") out.allExternal = true;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return out;
}

const FONT_EXT = /\.(woff2?|ttf|otf|eot)(?:$|[?#])/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)(?:$|[?#])/i;
const MEDIA_EXT = /\.(mp4|webm|m4v|mov|mp3|ogg|wav)(?:$|[?#])/i;
const WEBFONT_CSS = /use\.typekit\.net\/[a-z0-9]+\.css|fonts\.googleapis\.com\/css/i;

function classify(url, resourceType, contentType) {
  const ct = (contentType || "").toLowerCase();
  if (ct.startsWith("font/") || ct.includes("font-woff") || FONT_EXT.test(url)) return "font";
  if (ct.startsWith("image/") || resourceType === "image" || IMAGE_EXT.test(url)) return "image";
  if (ct.startsWith("video/") || ct.startsWith("audio/") || resourceType === "media" || MEDIA_EXT.test(url)) return "media";
  if (ct.includes("text/css") || resourceType === "stylesheet") return "stylesheet";
  return null;
}

function safeName(url) {
  const parsed = new URL(url);
  const ext = path.extname(parsed.pathname).slice(0, 12);
  const base = path.basename(parsed.pathname, ext).replace(/[^a-z0-9._-]+/gi, "-").slice(0, 80) || "asset";
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 10);
  return `${base}-${hash}${ext || ".bin"}`;
}

function localPathFor(kind, url) {
  const host = new URL(url).hostname.replace(/[^a-z0-9.-]+/gi, "-");
  const dir = kind === "image" ? "images" : kind === "font" ? "fonts" : kind === "media" ? "media" : "css";
  return path.join(dir, host, safeName(url));
}

// recon JSON 里能静态看出来的 URL(img src/srcset、@font-face src、stylesheet)——
// 补充给 network 捕获兜底(比如首屏截图后才出现的资源)。
function urlsFromRecon(recon) {
  const urls = new Map(); // url -> hinted kind
  const add = (raw, kind, base) => {
    if (!raw) return;
    try {
      const abs = new URL(raw, base || recon.url).href;
      if (/^https?:/i.test(abs) && !urls.has(abs)) urls.set(abs, kind);
    } catch {}
  };
  for (const capture of recon.captures || []) {
    const signals = capture.signals || {};
    for (const image of signals.images || []) {
      add(image.src, "image");
      for (const candidate of String(image.srcset || "").split(",")) {
        add(candidate.trim().split(/\s+/)[0], "image");
      }
    }
    for (const face of signals.fontFaces || []) {
      for (const src of face.srcUrls || []) add(src, "font", face.sheetHref);
    }
    for (const href of signals.stylesheets || []) add(href, "stylesheet");
    for (const url of signals.resources?.images || []) add(url, "image");
    for (const url of signals.resources?.fonts || []) add(url, "font");
    for (const url of signals.resources?.media || []) add(url, "media");
  }
  return urls;
}

// 把 webfont CSS / @font-face 源 CSS 里的 url(...) 改写为本地字体路径，
// 汇总成一份可直接 <link> 的 fonts.css。
function rewriteFontCss(cssText, cssUrl, urlToLocal) {
  return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, ref) => {
    try {
      const abs = new URL(ref, cssUrl).href;
      const local = urlToLocal.get(abs);
      if (!local) return match;
      // fonts.css 落在 <out>/fonts/ 下，字体在 <out>/fonts/<host>/,
      // 所以相对引用去掉前导 "fonts/"。
      const rel = path.relative("fonts", local).split(path.sep).join("/");
      return `url(${quote}${rel}${quote})`;
    } catch {
      return match;
    }
  });
}

async function downloadAll(entries, ctx, args, refererUrl) {
  const results = [];
  const outDir = path.resolve(args.outDir);
  for (const entry of entries) {
    const rel = localPathFor(entry.kind, entry.url);
    const dest = path.join(outDir, rel);
    try {
      const resp = ctx
        ? await ctx.request.get(entry.url, { headers: { referer: refererUrl }, maxRedirects: 5 })
        : await fetch(entry.url, { headers: { referer: refererUrl, accept: "*/*" } });
      const ok = ctx ? resp.ok() : resp.ok;
      const status = ctx ? resp.status() : resp.status;
      if (!ok) throw new Error(`HTTP ${status}`);
      const buffer = ctx ? await resp.body() : Buffer.from(await resp.arrayBuffer());
      if (buffer.length > args.maxBytes) throw new Error(`exceeds --max-bytes (${buffer.length})`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buffer);
      results.push({ ...entry, status: "ok", bytes: buffer.length, localPath: rel.split(path.sep).join("/") });
    } catch (error) {
      results.push({ ...entry, status: "error", error: error.message });
    }
  }
  return results;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.url && !args.recon)) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const recon = args.recon ? JSON.parse(fs.readFileSync(args.recon, "utf8")) : null;
  const pageUrl = args.url || recon?.url || "";
  if (!pageUrl) throw new Error("need --url or a recon JSON with a url");

  // 候选资产: network 捕获(权威) + recon 静态清单(兜底)。
  const candidates = new Map(); // url -> {kind, via}
  const addCandidate = (url, kind, via) => {
    if (!kind || !args.types.includes(kind)) return;
    if (!candidates.has(url)) candidates.set(url, { url, kind, via });
  };

  let ctx = null;
  let browser = null;
  if (!args.reconOnly) {
    const pw = loadPlaywright();
    browser = await launchChromium(pw.chromium);
    ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on("response", (resp) => {
      try {
        const kind = classify(resp.url(), resp.request().resourceType(), resp.headers()["content-type"]);
        if (kind) addCandidate(resp.url(), kind, "network");
      } catch {}
    });
    console.log(`▸ 加载 + 全程滚动捕获资产请求: ${pageUrl}`);
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 90000 }).catch((e) => console.warn("  goto:", e.message));
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= total; y += args.scrollStep) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(180);
    }
    await page.waitForTimeout(args.settle);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
    await page.close();
  }

  if (recon) {
    for (const [url, kind] of urlsFromRecon(recon)) addCandidate(url, kind, "recon");
  }

  const entries = Array.from(candidates.values());
  const fontCount = entries.filter((e) => e.kind === "font").length;
  const imageCount = entries.filter((e) => e.kind === "image").length;
  console.log(`▸ 候选资产 ${entries.length} 个(图片 ${imageCount} / 字体 ${fontCount})，开始下载…`);

  const results = await downloadAll(entries, ctx, args, pageUrl);

  // 自托管 @font-face: 抓 webfont CSS(typekit/google fonts) + recon 里的 @font-face
  // 规则，把 url() 改写成本地字体路径，汇成一份 fonts.css。
  const urlToLocal = new Map(
    results.filter((r) => r.status === "ok").map((r) => [r.url, r.localPath]),
  );
  const fontCssBlocks = [];
  const webfontCssUrls = results.filter((r) => r.kind === "stylesheet" && WEBFONT_CSS.test(r.url));
  for (const cssAsset of webfontCssUrls) {
    try {
      const cssText = fs.readFileSync(path.join(path.resolve(args.outDir), cssAsset.localPath), "utf8");
      fontCssBlocks.push(`/* self-hosted from ${cssAsset.url} */\n${rewriteFontCss(cssText, cssAsset.url, urlToLocal)}`);
    } catch {}
  }
  for (const capture of recon?.captures || []) {
    for (const face of capture.signals?.fontFaces || []) {
      if (!face.cssText) continue;
      fontCssBlocks.push(rewriteFontCss(face.cssText, face.sheetHref || pageUrl, urlToLocal));
    }
  }
  if (fontCssBlocks.length) {
    const fontsDir = path.join(path.resolve(args.outDir), "fonts");
    fs.mkdirSync(fontsDir, { recursive: true });
    fs.writeFileSync(path.join(fontsDir, "fonts.css"), `${Array.from(new Set(fontCssBlocks)).join("\n\n")}\n`);
  }

  const manifestFile = path.resolve(args.manifest || path.join(args.outDir, "asset-manifest.json"));
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  const okCount = results.filter((r) => r.status === "ok").length;
  const errCount = results.length - okCount;
  fs.writeFileSync(manifestFile, `${JSON.stringify({
    url: pageUrl,
    capturedVia: args.reconOnly ? "recon-only" : "browser-network+recon",
    total: results.length,
    ok: okCount,
    error: errCount,
    fontsCss: fontCssBlocks.length ? "fonts/fonts.css" : null,
    assets: results,
  }, null, 2)}\n`);

  if (browser) await browser.close();
  console.log(`✅ 下载 ${okCount} 成功 / ${errCount} 失败 → ${path.resolve(args.outDir)}`);
  if (fontCssBlocks.length) console.log(`▸ 自托管字体样式: ${path.join(args.outDir, "fonts/fonts.css")} (页面 <link> 引入即可)`);
  const failedFonts = results.filter((r) => r.kind === "font" && r.status === "error");
  if (failedFonts.length) console.log(`⚠️ ${failedFonts.length} 个字体下载失败——不许用系统字体糊弄，逐个排查:\n   ${failedFonts.map((f) => `${f.error} ${f.url}`).slice(0, 10).join("\n   ")}`);
  console.log(manifestFile);
} catch (error) {
  console.error(`asset-harvest failed: ${error.message}`);
  process.exit(1);
}
