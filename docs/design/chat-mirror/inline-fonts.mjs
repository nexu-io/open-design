/**
 * 把产品真实字体**内联**进 `mirror-exec.html`。
 *
 * ## 为什么要有这个文件
 *
 * 陈列页原来一条 `@font-face` 都没有(全文零声明、零 `<link>`、零 `@import`),
 * 却照着产品声明了 `--sans: "Albert Sans", "PingFang SC", …`。
 * 于是页面上每一个几何读数 —— 行高、文本宽度、折行位置、卡片高度 —— 量的都是
 * **回退字体 PingFang SC**,不是产品真实的 Albert Sans。
 *
 * 而稿子那一侧(`build-matrix.mjs` 从 `chat-panel-next.html` 抽出来的矩阵页)
 * **自带 base64 内联的 Albert Sans / JiduMono Pro**。也就是说逐格比对长期是
 * 「Albert Sans 的稿子」对「PingFang SC 的我们」——所有 `geom` / `texts` 读数
 * 都带着一层系统性的字体偏差,方向单一、不会自己抵消。
 *
 * 页面必须**自包含、双击可离线打开**(这是它作为验收物的全部价值),
 * 所以只能内联成 `data:` URI:file:// 下浏览器会按跨源拦掉 `url()` 字体,
 * 外链必然加载不出来;而量测用的裸静态服务器(`measure.mjs` 的 `MEASURE_BASE`)
 * 也够不到 `apps/web/public/fonts/` —— 稿子那一侧当初就是因为同样的原因选了内联。
 *
 * ## 但内联的结果**不进仓库**
 *
 * 三个字体文件本来就在这个仓库里(`apps/web/public/fonts/`)。把同一份字节再 base64
 * 复制一份进 HTML,换不来任何新能力,却要 +423KB,并且直接撑破 CI 的
 * `Static gate` → `Check changed tracked file sizes`(每个变更文件 1048576 字节)。
 *
 * 所以分工是:**页面提交版本不含字体,工具进仓库**。任何人 clone 下来跑一条命令
 * 就能在本地得到带字体的正确页面,字节不进 git。跑完 `git status` 会看到
 * `mirror-exec.html` 变脏 —— 那是预期的,**别提交它**。要还原:
 * `node inline-fonts.mjs --strip`,或者重新生成一遍陈列页。
 *
 * ## 描述符为什么不手抄
 *
 * 本脚本**不写死任何描述符**,而是从 `apps/web/src/styles/base.css` 里把
 * `@font-face` 块整段原样搬过来,只把 `url("/fonts/…")` 换成同一份字节的
 * `data:` URI。`font-family` / `font-style` / `font-weight` / `font-display` /
 * `format()` 一律不碰 —— 「和 base.css 逐字一致」由构造保证,不靠人眼核对。
 *
 * 这一条尤其重要的是 `JiduMono Pro` 的 `font-weight: 500`:那个字体只有一份
 * 静态 Regular 字节,稿子把描述符写成 500,因为聊天面板的排版基线是 500
 * (见 `base.css` 里那段长注释与 `ChatRoot.module.css` 的接缝层)。描述符停在
 * 400 的话,走 mono 的位置(耗时 / 文件路径 / Hex / 改动量)就是「请求 500、
 * 可用面只有 400」,各浏览器折算行为不一致。两处只改一半就是坏的。
 *
 * ## 什么时候要重跑
 *
 * `mirror-exec.html` 是 `apps/web/tests/components/chat/mirror-gallery.test.tsx`
 * 的 `buildPage()` **生成**的,而 `buildPage()` 只从 base.css 抠 `:root` 变量块
 * (`baseVars()`),不带 `@font-face`。所以**每次重新生成陈列页之后都要再跑一遍
 * 本脚本**,否则字体又会掉回 PingFang SC。
 * `check-fonts.mjs` 就是钉这件事的守卫 —— 忘了跑它会当场变红。
 *
 * ## 用法
 *
 * ```bash
 * node docs/design/chat-mirror/inline-fonts.mjs          # 注入 / 更新
 * node docs/design/chat-mirror/inline-fonts.mjs --strip  # 摘掉(给守卫做红证据用)
 * node docs/design/chat-mirror/inline-fonts.mjs --out /tmp/x.html
 * ```
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 注入块的身份。`check-fonts.mjs` 和本脚本靠它互相认。 */
export const BLOCK_ID = 'od-mirror-fonts';
/** 生成器留在页面顶部那条「还没上字体」横幅的 id(见 `mirror-gallery.test.tsx`)。 */
export const MISSING_MARK = 'od-fonts-missing';
/** 描述符的唯一出处 —— 改这一行等于换一份真相,请说明为什么。 */
export const FONT_SOURCE = 'apps/web/src/styles/base.css';

const HERE = dirname(fileURLToPath(import.meta.url));

/** 从脚本位置往上找 `pnpm-workspace.yaml`,不靠 cwd(脚本经常从别处调)。 */
export function repoRoot(from = HERE) {
  let dir = resolve(from);
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error('找不到仓库根(pnpm-workspace.yaml)');
}

const MIME = {
  '.ttf': ['font/ttf', 'truetype'],
  '.otf': ['font/otf', 'opentype'],
  '.woff': ['font/woff', 'woff'],
  '.woff2': ['font/woff2', 'woff2'],
};

/**
 * 从一段 CSS 里原样切出每一个 `@font-face { … }`。
 *
 * 刻意用花括号计数而不是正则一把梭:base.css 里 `@font-face` 前面挂着一段很长的
 * 注释(讲 JiduMono 那个 500 的),正则很容易连注释一起吞掉或者在注释里的花括号上翻车。
 * `@font-face` 体内不允许嵌套块,所以计数到 0 就是块尾。
 */
export function extractFontFaces(css) {
  const out = [];
  const re = /@font-face\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
      i += 1;
    }
    if (depth !== 0) throw new Error(`${FONT_SOURCE}: @font-face 花括号没闭合`);
    out.push(css.slice(m.index, i));
    re.lastIndex = i;
  }
  return out;
}

/** 一个描述符指纹,只留语义字段;给 check-fonts.mjs 做两侧比对用。 */
export function descriptorsOf(block) {
  const grab = (name) => {
    const m = new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;}]+)`, 'i').exec(block);
    return m ? m[1].trim().replace(/\s+/g, ' ') : null;
  };
  return {
    family: (grab('font-family') ?? '').replace(/["']/g, ''),
    style: grab('font-style') ?? 'normal',
    weight: grab('font-weight') ?? 'normal',
    display: grab('font-display') ?? 'auto',
    format: /format\(\s*["']?([a-z0-9-]+)/i.exec(block)?.[1] ?? null,
  };
}

/**
 * 把块里的 `url("/fonts/X")` 换成同一份字节的 `data:` URI,别的一个字都不动。
 *
 * 只认 `/fonts/` 开头的绝对路径 —— 那是产品的公共资源约定
 * (`apps/web/public/fonts/`)。出现别的形状就当场报错,不猜。
 */
export function inlineOne(block, root) {
  const m = /url\(\s*(["']?)(\/fonts\/[^"')]+)\1\s*\)/.exec(block);
  if (!m) throw new Error(`@font-face 里没找到 /fonts/ 的 url():\n${block}`);
  const rel = m[2];
  const file = join(root, 'apps/web/public', rel);
  if (!existsSync(file)) throw new Error(`字体文件不在:${file}`);
  const ext = rel.slice(rel.lastIndexOf('.')).toLowerCase();
  const known = MIME[ext];
  if (!known) throw new Error(`不认识的字体扩展名 ${ext}(${rel})`);
  const bytes = readFileSync(file);
  const declaredFormat = /format\(\s*["']?([a-z0-9-]+)/i.exec(block)?.[1];
  if (declaredFormat && declaredFormat !== known[1]) {
    throw new Error(`${rel}: base.css 写的是 format("${declaredFormat}"),按扩展名应是 "${known[1]}"`);
  }
  const uri = `data:${known[0]};base64,${bytes.toString('base64')}`;
  return {
    css: block.slice(0, m.index) + `url("${uri}")` + block.slice(m.index + m[0].length),
    rel,
    bytes: bytes.length,
    base64: uri.length,
  };
}

/** 组出要注进页面的那一整个 `<style>`。 */
export function buildFontStyle(root = repoRoot()) {
  const css = readFileSync(join(root, FONT_SOURCE), 'utf8');
  const blocks = extractFontFaces(css);
  if (blocks.length === 0) throw new Error(`${FONT_SOURCE} 里一条 @font-face 都没有 —— 先修这里`);
  const faces = blocks.map((b) => ({ ...inlineOne(b, root), descriptors: descriptorsOf(b) }));
  const head = [
    '/* 产品真实字体 —— 由 docs/design/chat-mirror/inline-fonts.mjs 从',
    ` * ${FONT_SOURCE} 原样搬来,只把 url("/fonts/…") 换成同一份字节的 data: URI。`,
    ' * 描述符(font-family / font-style / font-weight / font-display / format)一字未改。',
    ' * 这一块**不进仓库**:同一份字节 apps/web/public/fonts/ 里已经有了,再复制一份',
    ' * 要 +423KB 并撑破 CI 的单文件 1MB 闸。陈列页每次重新生成之后重跑本脚本即可。',
    ' */',
  ].join('\n');
  // 字体上了,页面顶部那条「还没上字体」的横幅就该消失 ——「有字体」和「横幅不见了」
  // 必须是同一件事的两种表现,否则两边会各说各话。用 !important 是因为它要盖住
  // 生成器写在后面的 .fontwarn 规则。
  const hideBanner = `\n#${MISSING_MARK}{display:none!important}`;
  const body = `${head}\n${faces.map((f) => f.css).join('\n')}${hideBanner}`;
  return { style: `<style id="${BLOCK_ID}" data-source="${FONT_SOURCE}">\n${body}\n</style>`, faces };
}

const OPEN = new RegExp(`<style id="${BLOCK_ID}"[\\s\\S]*?</style>\\n?`);

/** 去掉页面里已有的注入块(重复注入 / `--strip` 都走它)。 */
export function stripFontStyle(html) {
  return html.replace(OPEN, '');
}

/** 注在 `</title>` 之后 —— 必须早于任何 `<style>`,不然 `font-display: swap` 的首帧会用回退面量。 */
export function injectFontStyle(html, style) {
  const clean = stripFontStyle(html);
  const at = clean.indexOf('</title>');
  if (at < 0) throw new Error('页面里没有 </title>,不知道该注在哪');
  const cut = at + '</title>'.length;
  return `${clean.slice(0, cut)}\n${style}${clean.slice(cut)}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const root = repoRoot();
  const page = argv.includes('--page')
    ? resolve(argv[argv.indexOf('--page') + 1])
    : join(HERE, 'mirror-exec.html');
  const out = argv.includes('--out') ? resolve(argv[argv.indexOf('--out') + 1]) : page;
  const before = readFileSync(page, 'utf8');

  if (argv.includes('--strip')) {
    const next = stripFontStyle(before);
    writeFileSync(out, next);
    console.log(`摘掉字体块 → ${out}(${before.length} → ${next.length} 字节)`);
    process.exit(0);
  }

  const { style, faces } = buildFontStyle(root);
  const next = injectFontStyle(before, style);
  writeFileSync(out, next);
  console.log(`字体来源:${FONT_SOURCE}`);
  for (const f of faces) {
    const d = f.descriptors;
    console.log(
      `  · ${d.family} / ${d.style} / weight ${d.weight} / display ${d.display}`
      + ` / format ${d.format ?? '(未写)'} ← ${f.rel}`
      + ` (${f.bytes} 字节 → base64 ${f.base64})`,
    );
  }
  console.log(`写出 → ${out}(${before.length} → ${next.length} 字节)`);
}
