/**
 * 稿子那一侧的陈列页 —— 从**交付稿原件**抽出九十个实体,按镜像页的编号重排一遍。
 *
 * 逐格比对要的是「同一个编号的两格并排」。交付稿原件不能直接拿来比:
 *  · 它的组件顺序是 1, 2, 20, 21, 22, 23, 3, 4 …(按叙事分节),不是 1..90;
 *  · 每个实体外面还套着卡头、状态标题、说明段,那些是陈列而不是组件;
 *  · 它自己那套陈列样式会漏进格子里(见下面 `.ent-b .nm` 那段)。
 *
 * 所以这里把每一态的 `.st-b` 摘出来、按 {@link ORDER} 重排、外面统一套一层
 * **和镜像页 `.stage` 同尺寸**的载体。产物直接喂给 `diff-cells.mjs`。
 *
 * ## 为什么要有这个文件
 *
 * 在此之前稿子那一侧是**一次性本地产物**(某台机器上的 `matrix-82.html`),
 * 全历史零命中。也就是说:两页里有一页没有可复现的出处 —— 谁想重跑一次逐格比对,
 * 都得先去找那份没人再造得出来的 HTML。编号(`ORDER`)这么重要的东西也只活在那份产物里。
 *
 * ## 用法
 *
 * ```bash
 * # 默认就从 git 里按 DRAFT_COMMIT 取稿(连它的外链样式一起铺出来):
 * node docs/design/chat-mirror/build-matrix.mjs --out /tmp/od-serve/chat-matrix/matrix.html
 *
 * # 要比另一版稿子就显式给 sha —— 不许给「本机某个端口」或「某台机器上的某份拷贝」
 * node docs/design/chat-mirror/build-matrix.mjs --commit <sha> --out …
 * ```
 *
 * 产物**自带外链**(交付稿把一部分样式放在 `chat-panel/src/*.css` 里),脚本会把那一份
 * 也铺到产物旁边。再起一个静态服,让镜像页和它同级:
 *
 * ```bash
 * cd /tmp/od-serve && python3 -m http.server 17699 --bind 127.0.0.1 &
 * node docs/design/chat-mirror/diff-cells.mjs 1 90 > diff.json
 * ```
 *
 * ## 版本只有一个出处
 *
 * 稿子那一侧长期是「某台机器上起的某个端口」——谁起的、跑的哪一版,没有任何东西记着。
 * 已经因此出过事:两个端口上分别是 `361b78253e` 和 `729fa43ce7`,差着
 * `visual-fan.css` 20 行、`components.css` 51 行,拿旧的那一份量出来的读数整批作废。
 * 所以这里**把 sha 写死**,并且每次都打印出来 —— 换版本必须改这一行(或显式 `--commit`),
 * 不许靠「我起的那个服务是新的」。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

/** 交付稿当前基线。改它 = 换一版稿子重量,请连同这条注释一起说明为什么换。 */
const DRAFT_COMMIT = '729fa43ce717a28058a22bbe9f03ee5bb47e6fe1';
/** 稿子正文,以及它 `<link>` 出去的那一份样式所在的目录。 */
const DRAFT_HTML = 'docs/design/chat-panel-next.html';
const DRAFT_ASSETS = 'docs/design/chat-panel';

/**
 * **两边编号的唯一出处。**
 *
 * 第 N 项 = 第 N 格,值是交付稿里的「组件号 - 状态号」。镜像页
 * (`apps/web/tests/components/chat/mirror-gallery.test.tsx`)的 `CELLS` 必须逐格同序;
 * 那边每一格的 `sub` 就是这里的值,改一边不改另一边 = 两页对不上号。
 *
 * 末六项是交付稿 361b78253e 那一版新增的六态。**它们排在后面而不是插回各自家族**:
 * `diff-cells.mjs` 按下标配 gid,插回中间会让后面每一格整体错位。
 */
const ORDER = [
  // 执行记录 1–11
  [7, 1], [7, 2], [7, 3], [9, 1], [10, 1], [11, 1], [11, 2], [11, 3], [12, 1], [12, 2], [12, 3],
  // 理解段 12–27
  [3, 1], [3, 2], [3, 3], [4, 1],
  [5, 1], [5, 3], [5, 4], [5, 5], [5, 6], [5, 9], [5, 10], [5, 11], [5, 12], [5, 13],
  [8, 1], [8, 2],
  // 产出收尾 28–44
  [13, 1], [13, 2], [14, 1], [14, 2], [14, 3], [14, 4],
  [15, 1], [15, 2], [15, 3], [15, 4], [15, 5], [15, 6], [15, 7],
  [16, 1], [16, 2], [24, 1], [24, 2],
  // 输入 45–69
  [1, 1], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8],
  [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6], [2, 7], [2, 8],
  [21, 1], [21, 2], [21, 3], [21, 4], [21, 5],
  [23, 1], [23, 2], [23, 3], [23, 4], [23, 5],
  // 边界 70–84
  [6, 1], [6, 2], [17, 1], [17, 2], [17, 3], [18, 1], [18, 2], [18, 3],
  [19, 1], [19, 2], [19, 3], [20, 1], [22, 1], [22, 2], [22, 3],
  // 稿子新增 85–90
  [1, 2], [5, 2], [5, 7], [5, 8], [5, 14], [5, 15],
];

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};
const COMMIT = flag('--commit', DRAFT_COMMIT);
const OUT = flag('--out', 'docs/design/chat-matrix/matrix.html');
/** 只在**明确要比一份没进 git 的稿子**时用;默认走 git,来源才有出处 */
const SRC = flag('--src', null);

const git = (...args) => execFileSync('git', args, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });

let html;
if (SRC) {
  console.warn(`⚠️ 用的是本地文件 ${SRC} —— 它没有版本出处,读数不要当基线。`);
  html = readFileSync(SRC, 'utf-8');
} else {
  html = git('show', `${COMMIT}:${DRAFT_HTML}`);
  console.log(`稿子:${COMMIT.slice(0, 10)}:${DRAFT_HTML}`);
}

/**
 * 载体的宽度与内距**照抄镜像页的 `.stage`**(width 440 / padding 14 / 无边框)。
 *
 * 这不是审美选择:两边载体差 2px,格子里每个元素的相对坐标就整体偏 2px,
 * 几何比对会刷出上千条假差异,真正的错位淹在里面。
 * 镜像页那一侧的出处是 `mirror-gallery.test.tsx` 的 `PAGE_CSS`:
 * `.stage{padding:14px;background:var(--bg);width:440px;max-width:100%}`。
 */
const STYLE = `
<style id="od-matrix-style">
html, body { margin:0 !important; padding:0 !important; background:var(--bg); }
#od-matrix { padding: 24px; }
.od-row { margin: 0 0 20px; }
.od-cap { font: 12px/1.5 ui-monospace, monospace; color:#888; margin: 0 0 4px; }
.ent-b { width:440px; padding:14px; border:0 !important; border-radius:0 !important;
         background:var(--bg); }
</style>
`;

/*
 * 重排脚本。**跑在浏览器里**(而不是在这儿用正则切 HTML):交付稿的实体里嵌着
 * 自己的脚本与 `<template>`,按字符串切早晚会切坏一处而没人发现;
 * 用 DOM 搬节点,搬过去的还是同一批节点。
 */
const SCRIPT = `
<script id="od-matrix-script">
(function () {
  var ORDER = __ORDER__;
  /* 工具调用那四个组件的格子要连**几何原点**一起裁,见下面那段。
     按组件号写死而不是按 gid 区间:ORDER 一旦重排,gid 区间就指错了。 */
  var TOOL_ROW_COMPONENTS = new Set([9, 10, 11, 12]);
  var byNo = {};
  Array.prototype.forEach.call(document.querySelectorAll('article.cmp'), function (a) {
    var no = a.querySelector('.cmp-h .no');
    if (no) byNo[no.textContent.trim()] = a;
  });
  /* 交付稿是一份**没有 <head> / <body> 标签**的裸文档,注进去的东西全落在 body 里。
     下面 document.body.textContent = '' 会把陈列样式一起清掉,所以先把它挪进 head。 */
  var styleEl = document.getElementById('od-matrix-style');
  if (styleEl) document.head.appendChild(styleEl);
  var wrap = document.createElement('div');
  wrap.id = 'od-matrix';
  var missing = [];
  ORDER.forEach(function (pair, i) {
    var gid = i + 1;
    var art = byNo[String(pair[0])];
    var row = document.createElement('div');
    row.className = 'od-row';
    row.setAttribute('data-gid', String(gid));
    var cap = document.createElement('p');
    cap.className = 'od-cap';
    cap.textContent = '#' + gid + '  ' + pair[0] + '-' + pair[1];
    row.appendChild(cap);
    var body = null;
    if (art) {
      var sts = art.querySelectorAll(':scope > .cmp-b > .st');
      var st = sts[pair[1] - 1];
      if (st) body = st.querySelector(':scope > .st-b');
    }
    if (!body) {
      // 抽不到就留一个空载体 —— 少一格会让后面全部错位,那比空着糟得多
      missing.push(gid + ':' + pair[0] + '-' + pair[1]);
      body = document.createElement('div');
      body.className = 'st-b';
    }
    body.classList.add('ent-b');
    /* 工具调用那几格(组件 9 / 10 / 11 / 12):镜像页挂的是**整张执行记录壳**,
       所以那边的格子带 data-crop 指向抽屉;稿子这边画的就是抽屉,但外面还裹了
       一层 .fold.mod-flat 壳。两层壳都「没有自己的文字」,配对时会被当成纯包裹层滤掉
       —— 可是**几何原点**取的是 root,不是配对后的第一个元素。
       不把稿子这边的原点也裁到抽屉上,我们从 (0,0) 起算、稿子从 .ent-b 起算,
       每个元素平白差 (7,14),整格的位置差全是这么来的。 */
    if (TOOL_ROW_COMPONENTS.has(pair[0])) {
      body.setAttribute('data-crop', '.fold.mod-flat > .body.mod-stack > details');
    }
    row.appendChild(body);
    wrap.appendChild(row);
  });
  /* 演示用的自走动画会让同一格每次量到不同的值 —— 关掉,只留静态形态。
     音频那一格(data-play)不动:它的自动播由 IntersectionObserver 驱动,
     而比对用的无头窗口只有 980x1200、从不滚动,深处的格子永远不进视口,
     所以那一格停在 data-at 声明的那一刻,本来就是确定的。 */
  Array.prototype.forEach.call(wrap.querySelectorAll('[data-plan-demo]'), function (el) {
    el.removeAttribute('data-plan-demo');
  });
  document.body.textContent = '';
  document.body.appendChild(wrap);
  window.__odMatrixMissing = missing;
  if (missing.length) console.warn('抽不到的格子:', missing.join(', '));
})();
</script>
`;

/*
 * 判据是「里面有没有那批实体」,不是「有没有 </body>」——
 * 交付稿是 `build.mjs` 拼出来的**裸文档**,连 `<html>` / `<head>` / `<body>` 标签都没有。
 * 所以样式和脚本一律**追加在末尾**(浏览器会把它们放进 body,脚本自己再把样式挪回 head)。
 */
if (!html.includes('<article class="cmp')) {
  console.error(`${SRC} 不像交付稿原件(里面找不到 <article class="cmp">)`);
  process.exit(1);
}
const script = SCRIPT.replace('__ORDER__', JSON.stringify(ORDER));
const out = `${html}\n${STYLE}${script}`;
const outDir = dirname(OUT);
mkdirSync(outDir, { recursive: true });
writeFileSync(OUT, out, 'utf-8');
/*
 * 把稿子 `<link>` 出去的那份样式铺到产物旁边(`chat-panel/src/*.css`,一份就 452KB)。
 * 少了它,`visual-samples.css` 那一整族在浏览器里根本没加载 —— 视觉方向那几格量到的
 * 是没上妆的裸标记,而报告上看不出这是缺料。
 */
if (!SRC) {
  /* 走 `git archive | tar`,**不碰暂存区**。
     别用 `git checkout <ref> -- <path>`:它会顺手把那批文件放进 index,
     在一个多人/多 agent 共用的工作区里,那等于悄悄改了别人的待提交内容。 */
  const tarball = execFileSync('git', ['archive', '--format=tar', COMMIT, DRAFT_ASSETS],
    { maxBuffer: 256 * 1024 * 1024 });
  execFileSync('tar', ['-x', '-C', outDir, '--strip-components', '2'], { input: tarball });
  console.log(`外链样式:${resolve(outDir, 'chat-panel')}`);
}
console.log(`写出 ${OUT}(${ORDER.length} 格,${out.length} 字节)`);
