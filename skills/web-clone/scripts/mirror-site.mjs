#!/usr/bin/env node
// mirror-site.mjs — 把"静态构建站"(Astro / Vite SSG / Hugo 等)的部署资产整套镜像下来，做 1:1 忠实复刻。
// 原理: 这类站的"真源码"不在 GitHub，但部署出来的静态资产(HTML + bundle + CSS + 运行时 fetch 的
//       .sog/.buf/.wasm/.riv/字体/图)就是真相。用真浏览器全程滚动一遍捕获每一个真实请求，按路径镜像同源资产。
// 用法:
//   node scripts/mirror-site.mjs --url <URL> --out <dir> [--scroll-step 700] [--settle 2500] [--max-ms 90000]
// 产物:
//   <dir>/site/...                镜像的同源资产(保留路径；目录 URL 存为 index.html)
//   <dir>/mirror-manifest.json    全部请求(同源+第三方) + 每项状态
//   <dir>/own-asset-urls.txt      同源资产路径清单
//   <dir>/third-party.json        第三方 host + 需自托管的 webfont CSS(typekit/google) 提示
// 纪律: 只搬"真实请求到的"资产，不臆造路径。第三方 CDN(字体/wasm/视频)不自动改写——按 third-party.json 人工处理。
//       后续手工: 自托管锁域名字体(典型 Typekit @import) → 改写 CSS @import 为本地 → 删追踪 → 从 site/ 作 web 根服务。
//       完整配方见 references/static-mirror.md。

import { loadPlaywright, launchChromium } from "./lib/playwright-loader.mjs";
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const o = { url: "", out: "", scrollStep: 700, settle: 2500, maxMs: 90000, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--url") o.url = argv[++i] || "";
    else if (a === "--out") o.out = argv[++i] || "";
    else if (a === "--scroll-step") o.scrollStep = parseInt(argv[++i] || "700", 10);
    else if (a === "--settle") o.settle = parseInt(argv[++i] || "2500", 10);
    else if (a === "--max-ms") o.maxMs = parseInt(argv[++i] || "90000", 10);
  }
  return o;
}

function usage() {
  console.log(`mirror-site.mjs — 静态构建站全量资产镜像(1:1 忠实复刻)

  node scripts/mirror-site.mjs --url <URL> --out <dir> [--scroll-step 700] [--settle 2500] [--max-ms 90000]

适用: Astro / Vite SSG / Hugo / 任何把客户端运行时输出成可下载静态资产的站(含 WebGL/Canvas 重前端)。
不适用: 真·服务端渲染/数据驱动 SPA(需 network-capture.mjs 做 API 替身)。
配方与后续改写步骤(自托管字体/删追踪/服务) → references/static-mirror.md`);
}

// 同源资产 URL → 本地相对路径(去 query；目录结尾存 index.html)
function urlToLocalPath(u, origin) {
  let p = u.slice(origin.length);
  const q = p.indexOf("?");
  if (q >= 0) p = p.slice(0, q);
  if (p === "" || p.endsWith("/")) p += "index.html";
  return p.replace(/^\/+/, "");
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.url || !args.out) {
  usage();
  process.exit(args.help ? 0 : 1);
}

const origin = new URL(args.url).origin;
const siteDir = path.join(path.resolve(args.out), "site");
fs.mkdirSync(siteDir, { recursive: true });

const responses = new Map(); // url -> {status, type, ct}
const pw = loadPlaywright();
const browser = await launchChromium(pw.chromium);
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("response", (resp) => {
  try {
    const h = resp.headers();
    responses.set(resp.url(), { status: resp.status(), type: resp.request().resourceType(), ct: h["content-type"] || "" });
  } catch {}
});

console.log(`▸ 加载 + 全程滚动捕获: ${args.url}`);
await page.goto(args.url, { waitUntil: "networkidle", timeout: args.maxMs }).catch((e) => console.warn("  goto:", e.message));
const total = await page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y <= total; y += args.scrollStep) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(180);
}
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await page.waitForTimeout(args.settle);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1200);

const all = [...responses.entries()].map(([url, m]) => ({ url, ...m }));
const ownUrls = all.filter((r) => r.url.startsWith(origin + "/") || r.url === origin || r.url === origin + "/");

console.log(`▸ 捕获请求 ${all.length} 个；同源 ${ownUrls.length} 个，开始下载…`);
let ok = 0, fail = 0;
const failed = [];
for (const r of ownUrls) {
  const rel = urlToLocalPath(r.url, origin);
  const dest = path.join(siteDir, rel);
  try {
    const resp = await ctx.request.get(r.url); // 复用浏览器网络栈(cookie/TUN/代理一致)
    if (!resp.ok()) { fail++; failed.push(`HTTP${resp.status()} ${rel}`); continue; }
    const buf = await resp.body();
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    ok++;
  } catch (e) {
    fail++; failed.push(`${e.message} ${rel}`);
  }
}

// 第三方 + webfont 提示
const thirdHosts = [...new Set(all.filter((r) => !r.url.startsWith(origin)).map((r) => { try { return new URL(r.url).host; } catch { return r.url; } }))];
const webfontCss = all.map((r) => r.url).filter((u) => /use\.typekit\.net\/[a-z0-9]+\.css|fonts\.googleapis\.com\/css/i.test(u));
const outRoot = path.resolve(args.out);
fs.writeFileSync(path.join(outRoot, "mirror-manifest.json"), JSON.stringify(all, null, 2));
fs.writeFileSync(path.join(outRoot, "own-asset-urls.txt"), ownUrls.map((r) => urlToLocalPath(r.url, origin)).sort().join("\n") + "\n");
fs.writeFileSync(path.join(outRoot, "third-party.json"), JSON.stringify({ hosts: thirdHosts, webfont_css_to_selfhost: webfontCss }, null, 2));

console.log(`✅ 镜像完成: ${ok} 成功 / ${fail} 失败 → ${siteDir}`);
if (failed.length) console.log("  ⚠️ 失败:\n   " + failed.slice(0, 20).join("\n   "));
console.log(`▸ 第三方 host: ${thirdHosts.join(", ") || "(无)"}`);
if (webfontCss.length) console.log(`▸ 需自托管的 webfont CSS(锁域名,见 static-mirror.md): \n   ${webfontCss.join("\n   ")}`);
console.log(`▸ 下一步: 自托管字体 + 改写 CSS @import + 删追踪 → cd ${siteDir} && python3 -m http.server 8124`);
await browser.close();
