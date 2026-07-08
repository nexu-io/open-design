#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function usage() {
  console.log(`Usage:
  node scripts/init-clone.mjs <site-name-or-slug> [--url <url>] [--mode <mode>] [--level <L1-L6>]

Creates:
  ./website-clones/<normalized-slug>-clone/
  ./website-clones/<normalized-slug>-clone/NOTES.md
  ./website-clones/<normalized-slug>-clone/RECON/screenshots/

Set WEB_CLONE_ROOT=/absolute/path to write projects somewhere else.
Non-ASCII names fall back to the --url hostname, then a stable short hash.
`);
}

function parseArgs(argv) {
  const out = { slug: null, url: "", mode: "", level: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--url") out.url = argv[++i] || "";
    else if (arg === "--mode") out.mode = argv[++i] || "";
    else if (arg === "--level") out.level = argv[++i] || "";
    else if (!out.slug) out.slug = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return out;
}

function cleanSlug(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugFromUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return cleanSlug(parsed.hostname.replace(/^www\./i, ""));
  } catch {
    return "";
  }
}

function fallbackSlug(input, url) {
  const direct = cleanSlug(input);
  if (direct) return direct;

  const fromUrl = slugFromUrl(url);
  if (fromUrl) return fromUrl;

  const hash = crypto.createHash("sha1").update(`${input}\n${url}`).digest("hex").slice(0, 8);
  return `site-${hash}`;
}

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function notesTemplate({ name, url, mode, level, projectPath }) {
  return `# ${name} · 克隆笔记

## 源信息
- 原站 URL: ${url}
- 源码仓库:
- 原作者:
- 许可证:
- 致谢要求:

## 技术栈
- 框架 / 关键库 / Node 版本:

## 复刻前预判
- 复杂度等级: ${level}
- 推荐模式: ${mode}
- 可高保真的部分:
- 需要近似或替代的部分:
- 不克隆的部分:
- 主要风险:

## 跑起来
\`\`\`bash
cd ${shellQuote(projectPath)}
python3 -m http.server 8123
\`\`\`

## 改了什么（对照原版）
-

## 原站 vs 克隆站
| 模块 | 原站表现 | 克隆实现 | 差异 / 取舍 | 证据 |
|---|---|---|---|---|
| 首屏 |  |  |  |  |
| 导航 |  |  |  |  |
| 核心动效 |  |  |  |  |
| 内容区块 |  |  |  |  |
| 移动端 |  |  |  |  |

## 复刻评分
- 源证据: /5
- 结构保真: /5
- 视觉保真: /5
- 动效/交互: /5
- 响应式: /5
- 功能完整: /5
- 内容替换: /5
- 法务/部署风险: /5
- 总评:

## 替换地图（要换什么改哪）
- 文字 -> 文件 行
- 图片/媒体 -> 目录
- 配色 -> CSS 变量 / theme
- 3D 模型 / 字体 ->

## 验证
- [ ] 本地跑通、console 0 error
- [ ] 截图对照原站（RECON/screenshots/）
- 验证不了的点（如实记，别伪造）:
`;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.slug) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const slug = fallbackSlug(args.slug, args.url);
  const name = slug.endsWith("-clone") ? slug : `${slug}-clone`;
  const root = process.env.WEB_CLONE_ROOT
    ? path.resolve(process.env.WEB_CLONE_ROOT)
    : path.join(process.cwd(), "website-clones");
  const project = path.join(root, name);

  if (fs.existsSync(project)) {
    throw new Error(`Project already exists: ${project}`);
  }

  fs.mkdirSync(path.join(project, "RECON", "screenshots"), { recursive: true });
  fs.writeFileSync(
    path.join(project, "NOTES.md"),
    notesTemplate({
      name,
      url: args.url,
      mode: args.mode,
      level: args.level,
      projectPath: project,
    })
  );
  fs.writeFileSync(path.join(project, ".gitignore"), "node_modules/\n.DS_Store\n");

  console.log(project);
} catch (error) {
  console.error(`init-clone failed: ${error.message}`);
  process.exit(1);
}
