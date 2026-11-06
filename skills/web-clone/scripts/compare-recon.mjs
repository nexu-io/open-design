#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log(`Usage:
  node scripts/compare-recon.mjs --original <original-recon.json> --clone <clone-recon.json> [--visual-diff visual-diff.json] [--original-routes route-map.json] [--clone-routes route-map.json] [--original-interactions interactions.json] [--clone-interactions interactions.json] [--out CLONE_REPORT.md]
`);
}

function parseArgs(argv) {
  const out = {
    original: "",
    clone: "",
    visualDiff: "",
    originalRoutes: "",
    cloneRoutes: "",
    originalInteractions: "",
    cloneInteractions: "",
    out: "CLONE_REPORT.md",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--original") out.original = argv[++i] || "";
    else if (arg === "--clone") out.clone = argv[++i] || "";
    else if (arg === "--visual-diff") out.visualDiff = argv[++i] || "";
    else if (arg === "--original-routes") out.originalRoutes = argv[++i] || "";
    else if (arg === "--clone-routes") out.cloneRoutes = argv[++i] || "";
    else if (arg === "--original-interactions") out.originalInteractions = argv[++i] || "";
    else if (arg === "--clone-interactions") out.cloneInteractions = argv[++i] || "";
    else if (arg === "--out") out.out = argv[++i] || "CLONE_REPORT.md";
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function firstSignals(recon) {
  return recon.captures?.[0]?.signals || {};
}

function boolList(flags = {}) {
  return Object.entries(flags).filter(([, value]) => value).map(([key]) => key);
}

function ratioScore(a, b) {
  if (a === 0 && b === 0) return 5;
  if (a === 0 || b === 0) return 1;
  const ratio = Math.min(a, b) / Math.max(a, b);
  if (ratio > 0.9) return 5;
  if (ratio > 0.75) return 4;
  if (ratio > 0.55) return 3;
  if (ratio > 0.3) return 2;
  return 1;
}

function sequenceSimilarity(a, b) {
  const left = a.map((item) => `${item.tag}:${item.text}`).filter(Boolean);
  const right = b.map((item) => `${item.tag}:${item.text}`).filter(Boolean);
  if (!left.length && !right.length) return 1;
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  const hits = left.filter((item) => rightSet.has(item)).length;
  return hits / Math.max(left.length, right.length);
}

function inferComplexity(signals) {
  const frameworks = boolList(signals.frameworks);
  const counts = signals.counts || {};
  if ((counts.forms || 0) > 2 && (counts.inputs || 0) > 10) return "L6";
  if ((counts.canvas || 0) > 0 || signals.frameworks?.three) return "L5";
  if (signals.frameworks?.gsap || signals.frameworks?.lenis || (counts.video || 0) > 2) return "L4";
  if (frameworks.some((name) => ["react", "next", "vue", "nuxt", "svelte", "astro"].includes(name))) return "L3";
  if ((counts.links || 0) > 80 || (counts.images || 0) > 40) return "L2";
  return "L1";
}

function score(original, clone, visualDiff) {
  const o = firstSignals(original);
  const c = firstSignals(clone);
  const structureSimilarity = sequenceSimilarity(o.headings || [], c.headings || []);
  const structure = Math.max(1, Math.round(structureSimilarity * 5));
  const responsive = original.captures?.length === clone.captures?.length ? 4 : 2;
  const functionCounts = ["links", "forms", "buttons", "inputs"].map((key) => ratioScore(o.counts?.[key] || 0, c.counts?.[key] || 0));
  const functional = Math.round(functionCounts.reduce((sum, value) => sum + value, 0) / functionCounts.length);
  const motionCounts = ["canvas", "video"].map((key) => ratioScore(o.counts?.[key] || 0, c.counts?.[key] || 0));
  const interaction = Math.round(motionCounts.reduce((sum, value) => sum + value, 0) / motionCounts.length);
  return {
    sourceEvidence: 3,
    structure,
    visual: visualDiff ? `${visualDiff.visualScore}/5` : "需人工看截图或传 --visual-diff",
    interaction,
    responsive,
    functional,
    contentReplacement: "需人工看文案残留",
    legalRisk: "需人工核查 license / 素材",
  };
}

function line(value) {
  if (Array.isArray(value)) return value.join(", ") || "none";
  return value ?? "";
}

function routePath(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

function routesSection(files, evidence) {
  if (!evidence.originalRoutes || !evidence.cloneRoutes) {
    return `## 路由覆盖
- 未提供 route-crawl 结果。多页面站需要传 --original-routes / --clone-routes。
`;
  }
  const originalSet = new Set((evidence.originalRoutes.routes || []).map((route) => routePath(route.url)));
  const cloneSet = new Set((evidence.cloneRoutes.routes || []).map((route) => routePath(route.url)));
  const matched = Array.from(originalSet).filter((item) => cloneSet.has(item));
  const missing = Array.from(originalSet).filter((item) => !cloneSet.has(item));
  const extra = Array.from(cloneSet).filter((item) => !originalSet.has(item));
  const coverage = originalSet.size ? Math.round((matched.length / originalSet.size) * 100) : 100;
  return `## 路由覆盖
- 原站路由: ${originalSet.size}
- 克隆路由: ${cloneSet.size}
- 覆盖率: ${coverage}%
- 原站 route map: ${files.originalRoutes}
- 克隆 route map: ${files.cloneRoutes}
- 缺失路由: ${missing.join(", ") || "无"}
- 额外路由: ${extra.join(", ") || "无"}
`;
}

function changedActionCount(interactions) {
  return (interactions?.actions || []).filter((action) => action.changed).length;
}

function interactionSection(files, evidence) {
  if (!evidence.originalInteractions || !evidence.cloneInteractions) {
    return `## 交互覆盖
- 未提供 interaction-probe 结果。交互站需要传 --original-interactions / --clone-interactions。
`;
  }
  const originalActions = evidence.originalInteractions.actions || [];
  const cloneActions = evidence.cloneInteractions.actions || [];
  const originalChanged = changedActionCount(evidence.originalInteractions);
  const cloneChanged = changedActionCount(evidence.cloneInteractions);
  const originalCanvas = evidence.originalInteractions.discovered?.canvases?.length || 0;
  const cloneCanvas = evidence.cloneInteractions.discovered?.canvases?.length || 0;
  const originalInteractive = evidence.originalInteractions.discovered?.interactive?.length || 0;
  const cloneInteractive = evidence.cloneInteractions.discovered?.interactive?.length || 0;
  return `## 交互覆盖
- 原站可见交互目标: ${originalInteractive}
- 克隆可见交互目标: ${cloneInteractive}
- 原站 canvas 目标: ${originalCanvas}
- 克隆 canvas 目标: ${cloneCanvas}
- 原站 changed actions: ${originalChanged}/${originalActions.length}
- 克隆 changed actions: ${cloneChanged}/${cloneActions.length}
- 原站 interaction probe: ${files.originalInteractions}
- 克隆 interaction probe: ${files.cloneInteractions}
- 判断: ${originalChanged === cloneChanged && originalCanvas === cloneCanvas ? "交互数量信号接近，仍需看截图确认状态质量。" : "交互数量信号不一致，需要检查缺失状态或过度实现。"}
`;
}

function report(files, original, clone, evidence) {
  const o = firstSignals(original);
  const c = firstSignals(clone);
  const scores = score(original, clone, evidence.visualDiff);
  const complexity = inferComplexity(o);
  const originalFlags = boolList(o.frameworks);
  const cloneFlags = boolList(c.frameworks);
  const counts = ["sections", "links", "images", "video", "canvas", "forms", "buttons", "inputs", "interactive", "scripts"];

  return `# ${original.label || "original"} vs ${clone.label || "clone"} · 克隆评估报告

## 结论
- 原站 URL: ${original.url}
- 克隆 URL: ${clone.url}
- 自动推断复杂度: ${complexity}
- 复刻模式建议: ${complexity === "L5" ? "技术拆解 / 忠实复刻优先" : complexity === "L6" ? "展示层视觉复刻" : "视觉复刻 / 内容爆改"}
- 自动报告边界: 结构、数量、框架、console 可自动比；传入 visual-diff 后可纳入像素差异分。内容残留和法务仍需审计。

## 技术信号
| 项目 | 原站 | 克隆站 |
|---|---|---|
| title | ${o.title || ""} | ${c.title || ""} |
| lang | ${o.lang || ""} | ${c.lang || ""} |
| frameworks | ${line(originalFlags)} | ${line(cloneFlags)} |
| scrollHeight | ${o.scrollHeight || 0} | ${c.scrollHeight || 0} |
| h1 | ${line(o.h1)} | ${line(c.h1)} |

## 数量对比
| 指标 | 原站 | 克隆站 | 自动评分 |
|---|---:|---:|---:|
${counts.map((key) => `| ${key} | ${o.counts?.[key] || 0} | ${c.counts?.[key] || 0} | ${ratioScore(o.counts?.[key] || 0, c.counts?.[key] || 0)}/5 |`).join("\n")}

## 复刻评分
- 源证据: ${scores.sourceEvidence}/5
- 结构保真: ${scores.structure}/5
- 视觉保真: ${scores.visual}
- 动效/交互: ${scores.interaction}/5
- 响应式: ${scores.responsive}/5
- 功能完整: ${scores.functional}/5
- 内容替换: ${scores.contentReplacement}
- 法务/部署风险: ${scores.legalRisk}

## Console
- 原站 console errors: ${original.console?.errors?.length || 0}
- 克隆 console errors: ${clone.console?.errors?.length || 0}
- 原站 page errors: ${original.console?.pageErrors?.length || 0}
- 克隆 page errors: ${clone.console?.pageErrors?.length || 0}

${routesSection(files, evidence)}

${interactionSection(files, evidence)}

## 截图证据
- 原站侦察: ${files.original}
- 克隆侦察: ${files.clone}
- 像素差异: ${files.visualDiff || "未提供"}
- 像素差异率: ${evidence.visualDiff ? evidence.visualDiff.diffPixelRatio : "未提供"}
- 原站截图: ${(original.captures || []).map((capture) => capture.screenshot).join(", ")}
- 克隆截图: ${(clone.captures || []).map((capture) => capture.screenshot).join(", ")}

## 已知缺口
- 未传入 visual-diff 时，视觉保真需要打开截图人工确认。
- 法务、素材授权、品牌替换完整度需要人工核查。
`;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.original || !args.clone) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const original = readJson(args.original);
  const clone = readJson(args.clone);
  const visualDiff = args.visualDiff ? readJson(args.visualDiff) : null;
  const originalRoutes = args.originalRoutes ? readJson(args.originalRoutes) : null;
  const cloneRoutes = args.cloneRoutes ? readJson(args.cloneRoutes) : null;
  const originalInteractions = args.originalInteractions ? readJson(args.originalInteractions) : null;
  const cloneInteractions = args.cloneInteractions ? readJson(args.cloneInteractions) : null;
  const output = path.resolve(args.out);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, report(args, original, clone, {
    visualDiff,
    originalRoutes,
    cloneRoutes,
    originalInteractions,
    cloneInteractions,
  }));
  console.log(output);
} catch (error) {
  console.error(`compare-recon failed: ${error.message}`);
  process.exit(1);
}
