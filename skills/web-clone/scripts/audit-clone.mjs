#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log(`Usage:
  node scripts/audit-clone.mjs --project <clone-dir> [--brand "KOKUYO,Original Brand"] [--out CLONE_AUDIT.md]

Scans clone source files for tracking scripts, original-brand residue, Japanese residue, TODOs, and risky external dependencies.
`);
}

function parseArgs(argv) {
  const out = { project: process.cwd(), brand: [], out: "CLONE_AUDIT.md" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--project") out.project = argv[++i] || process.cwd();
    else if (arg === "--brand") out.brand = (argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--out") out.out = argv[++i] || "CLONE_AUDIT.md";
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return out;
}

const includeExt = new Set([".html", ".css", ".js", ".jsx", ".ts", ".tsx", ".json", ".md", ".txt", ".svg"]);
const skipDirs = new Set([".git", "node_modules", "dist", "build", ".next", ".nuxt", "coverage", "RECON"]);
const skipFiles = new Set(["NOTES.md", "TEARDOWN.md", "CLONE_REPORT.md", "CLONE_AUDIT.md", "REPLACE_GUIDE.md"]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "screenshots") continue;
      walk(full, files);
    } else if (!skipFiles.has(entry.name) && includeExt.has(path.extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function collectMatches(file, text, checks) {
  const findings = [];
  for (const check of checks) {
    const regex = new RegExp(check.pattern, check.flags || "gi");
    for (const match of text.matchAll(regex)) {
      const matchedText = String(match[0]);
      if (check.type === "external" && /^https?:\/\/(www\.)?w3\.org\//i.test(matchedText)) continue;
      findings.push({
        type: check.type,
        label: check.label,
        file,
        line: lineNumber(text, match.index || 0),
        match: matchedText.slice(0, 160),
      });
    }
  }
  return findings;
}

function markdown(findings, project, scannedFiles) {
  const byType = new Map();
  for (const finding of findings) {
    if (!byType.has(finding.type)) byType.set(finding.type, []);
    byType.get(finding.type).push(finding);
  }
  const types = [
    ["tracking", "追踪脚本 / 统计像素"],
    ["brand", "原站品牌残留"],
    ["japanese", "日文残留"],
    ["todo", "TODO / 占位内容"],
    ["external", "外部依赖 / 外链风险"],
  ];
  const lines = [
    `# Clone Audit`,
    "",
    `- Project: ${project}`,
    `- Scanned files: ${scannedFiles}`,
    `- Findings: ${findings.length}`,
    "",
  ];

  for (const [type, title] of types) {
    const items = byType.get(type) || [];
    lines.push(`## ${title}`);
    if (!items.length) {
      lines.push("- 未发现");
      lines.push("");
      continue;
    }
    for (const item of items.slice(0, 200)) {
      lines.push(`- ${path.relative(project, item.file)}:${item.line} · ${item.label} · \`${item.match.replaceAll("`", "'")}\``);
    }
    if (items.length > 200) lines.push(`- 还有 ${items.length - 200} 条未展开`);
    lines.push("");
  }

  lines.push("## 结论");
  lines.push(findings.length ? "- 需要处理上面的残留项后再声明可部署。" : "- 未发现明显残留项；仍需人工核查素材授权和视觉截图。");
  return `${lines.join("\n")}\n`;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const project = path.resolve(args.project);
  if (!fs.existsSync(project)) throw new Error(`Project not found: ${project}`);

  const brandPatterns = args.brand.map((brand) => ({
    type: "brand",
    label: `brand residue: ${brand}`,
    pattern: brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    flags: "gi",
  }));

  const checks = [
    { type: "tracking", label: "Google Tag Manager", pattern: "googletagmanager|GTM-[A-Z0-9]+", flags: "gi" },
    { type: "tracking", label: "Google Analytics / gtag", pattern: "google-analytics|gtag\\s*\\(|ga\\s*\\(", flags: "gi" },
    { type: "tracking", label: "Meta Pixel / fbq", pattern: "connect\\.facebook\\.net|fbq\\s*\\(", flags: "gi" },
    { type: "tracking", label: "Hotjar / Clarity", pattern: "hotjar|clarity\\.ms|hj\\s*\\(", flags: "gi" },
    { type: "japanese", label: "Japanese kana residue", pattern: "[\\u3040-\\u30ff]{2,}", flags: "g" },
    { type: "todo", label: "TODO / placeholder content", pattern: "TODO|FIXME|lorem ipsum|待补|这里填写", flags: "gi" },
    { type: "external", label: "external URL", pattern: "https?://[^\\s\"')<>]+", flags: "gi" },
    ...brandPatterns,
  ];

  const files = walk(project);
  const findings = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    findings.push(...collectMatches(file, text, checks));
  }

  const output = path.resolve(args.out);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, markdown(findings, project, files.length));
  console.log(output);
} catch (error) {
  console.error(`audit-clone failed: ${error.message}`);
  process.exit(1);
}
