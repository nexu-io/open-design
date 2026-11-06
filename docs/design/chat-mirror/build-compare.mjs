/**
 * 逐格对照页:左边交付稿的组件实体,右边我们的实现,90 格全覆盖。
 *
 * 给产品 / 设计走一轮验收用 —— 他们不读代码,只逐格看两张图一不一样。
 * 每格的编号、组件名、状态名都从镜像陈列页的表头原样取,和 `build-matrix.mjs` 出的那一页同号。
 *
 * 前置:两边的截图已经拍好(`shots-design/` 与 `shots-ours/`,各 90 张)
 *   MIRROR_URL=…/chat-matrix/matrix.html     MIRROR_PICK=.ent-b  MIRROR_OUT=shots-design  node shoot.mjs
 *   MIRROR_URL=…/chat-mirror/mirror-exec.html MIRROR_PICK=.cell  MIRROR_OUT=shots-ours   node shoot.mjs
 *
 * 用法:node docs/design/chat-mirror/build-compare.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = import.meta.dirname;
const mirror = fs.readFileSync(path.join(DIR, 'mirror-exec.html'), 'utf-8');

/** 从陈列页表头取每格的元信息 —— 编号 / 组件内序号 / 组件名 / 状态名 */
const cells = [...mirror.matchAll(
  /<header>\s*<span class="no">#(\d+)<\/span><span class="sub">([^<]*)<\/span>\s*<span class="cmp">([^<]*)<\/span><span class="st">([^<]*)<\/span>/g,
)].map((m) => ({ no: Number(m[1]), sub: m[2], cmp: m[3], st: m[4] }));

/*
 * 格数**从镜像页自己数出来**,不写死。
 * 这里原来钉着 84;交付稿长到 90 格之后,那个 84 一边挡着重新生成、一边还在文案里
 * 印着「84 格全覆盖」—— 数量是派生量,派生量不许有第二个出处。
 * 仍然要有下限:解不出格子说明表头结构变了(那才是这条守卫真正要拦的)。
 */
if (cells.length < 1) {
  console.error('表头一格都没解出来 —— 陈列页的结构变了,先修这里再生成');
  process.exit(1);
}
const TOTAL = cells.length;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pad = (n) => String(n).padStart(2, '0');
const has = (rel) => fs.existsSync(path.join(DIR, rel));

/*
 * 逐属性比对的结果(`node diff-cells.mjs 1 90 > diff.json`)。
 * 有它就在每格头上打一枚状态章:对齐的绿章、还差几处的黄章 ——
 * 验收的人一眼能看出哪几格要看,而不是九十格从头翻。
 * 还差的那几格,原因写在 `specs/current/chat-panel-next.md` §12.0 的表里。
 */
const diffPath = path.join(DIR, 'diff.json');
const diffRows = fs.existsSync(diffPath) ? JSON.parse(fs.readFileSync(diffPath, 'utf-8')) : [];
const diffs = new Map(diffRows.map((r) => [r.gid, r.diffs.length]));
/*
 * 位置/尺寸对不上的元素数。
 *
 * 和「逐属性」是两件事:属性比的是**规则一样不一样**,几何比的是**落点一样不一样**。
 * 两边可以每条属性都相同而元素落在不同的 y 上 —— 中间任何一层没被收进来的包裹层、
 * 任何一条没进量程的属性,都会把位置整体推走。「间距看着不对」只有量位置才看得见。
 */
const geoms = new Map(diffRows.map((r) => [r.gid, (r.geom ?? []).length]));
/** 还差的那几格,各自卡在谁身上(与 §12.0 同一张表) */
const BLOCKED = {
  3: 'T39:一步的清单要不要出计划卡',
  9: '稿子那格状态在数据模型里出不来',
  11: '事件流缺「哪一张砸了」',
  51: '盘点 §4-B:用户消息没有失败态,缺一枚常驻重试',
  60: '盘点 §5-7:预览准入名单',
};
const stamp = (no) => {
  const n = diffs.get(no);
  if (n === undefined) return '';
  const g = geoms.get(no) ?? 0;
  const why = BLOCKED[no] ? ` · ${BLOCKED[no]}` : '';
  if (n === 0 && g === 0) return '<span class="ok">逐属性 + 逐位置对齐</span>';
  const parts = [];
  if (n > 0) parts.push(`属性 ${n} 处`);
  if (g > 0) parts.push(`位置 ${g} 处`);
  return `<span class="todo">还差 ${parts.join(' · ')}${why}</span>`;
};

const rows = cells.map((c) => {
  const d = `shots-design/cell-${pad(c.no)}.png`;
  const o = `shots-ours/cell-${pad(c.no)}.png`;
  const miss = [!has(d) && '设计稿截图缺失', !has(o) && '我们的截图缺失'].filter(Boolean).join(' · ');
  return `<section class="row" id="g${c.no}">
  <h3><a class="no" href="#g${c.no}">#${c.no}</a><span class="sub">${esc(c.sub)}</span><span class="cmp">${esc(c.cmp)}</span><span class="st">${esc(c.st)}</span>${stamp(c.no)}${miss ? `<span class="warn">${esc(miss)}</span>` : ''}</h3>
  <div class="pair">
    <figure><figcaption>交付稿</figcaption>${has(d) ? `<img loading="lazy" src="${d}" alt="设计稿 #${c.no}">` : '<div class="gap">没有截图</div>'}</figure>
    <figure><figcaption>我们的实现</figcaption>${has(o) ? `<img loading="lazy" src="${o}" alt="我们的 #${c.no}">` : '<div class="gap">没有截图</div>'}</figure>
  </div>
</section>`;
}).join('\n');

const page = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>逐格对照 · ${TOTAL} 格</title><style>
:root{color-scheme:light}
body{margin:0;padding:20px 24px 80px;background:#fff;color:#202020;font:13px/1.6 -apple-system,"PingFang SC",sans-serif}
h1{margin:0 0 4px;font-size:19px}
.lede{margin:0 0 18px;max-width:900px;color:#5c5c5c}
.lede b{color:#202020}
.row{max-width:1560px;margin:0 0 22px;scroll-margin-top:12px}
h3{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin:0 0 8px;font-size:14px}
.no{color:#059669;font-weight:700;font-family:ui-monospace,monospace;text-decoration:none}
.sub{color:#8a8a8a;font-family:ui-monospace,monospace;font-size:12px}
.cmp{font-weight:600}
.st{color:#6b6b6b;font-size:12px;font-weight:400}
.warn{color:#b45309;background:#fff7e6;border:1px solid #ffe2a8;border-radius:6px;padding:0 6px;font-size:12px}
.ok{color:#065f46;background:#ecfdf3;border:1px solid #b7f0cf;border-radius:6px;padding:0 6px;font-size:12px}
.todo{color:#9a3412;background:#fff1e8;border:1px solid #ffd0b0;border-radius:6px;padding:0 6px;font-size:12px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
figure{margin:0;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;background:#fafafa}
figcaption{padding:5px 10px;font-size:12px;color:#6b6b6b;border-bottom:1px solid #e5e5e5;background:#f2f2f2}
figure:first-child figcaption{color:#8a5a00;background:#fff7e6;border-bottom-color:#ffe2a8}
figure:last-child figcaption{color:#065f46;background:#ecfdf3;border-bottom-color:#b7f0cf}
img{display:block;width:100%;height:auto;background:#fff}
.gap{padding:24px;color:#a3a3a3;text-align:center}
nav{position:sticky;top:0;background:#fff;padding:8px 0 10px;border-bottom:1px solid #eee;margin-bottom:16px;z-index:2}
nav a{display:inline-block;margin:0 6px 4px 0;padding:1px 6px;border:1px solid #e5e5e5;border-radius:5px;color:#404040;text-decoration:none;font-family:ui-monospace,monospace;font-size:11px}
nav a:hover{background:#f5f5f5}
</style></head><body>
<h1>逐格对照 · ${TOTAL} 格</h1>
<p class="lede">左边是<b>交付稿里那一格的组件实体</b>(从 <code>chat-panel-next.html</code> 抽出、编号与 <code>matrix-82.html</code> 一致),右边是<b>我们真实渲染出来的同一格</b>。
两边都是无头 Chrome 按 2× 拍的,同一套字体、同一套 token。<br>
看法:只比<b>形状、间距、颜色、字号</b>;文案两边本来就不同(设计稿用的是示意文案),不必对文字内容。<br>
每格头上那枚章是<b>逐元素 × 逐属性</b>量出来的(<code>diff-cells.mjs</code>):绿章 = 这一格两边每个元素的每条属性都对上了;
橙章 = 还差几处,后面跟着卡在谁身上。<b>还差的那几格,原因和选项在 <code>specs/current/chat-panel-next.md</code> §12.0</b> —— 需要产品 / 设计拍板,不是样式没做。</p>
<nav>${cells.map((c) => `<a href="#g${c.no}">${c.no}</a>`).join('')}</nav>
${rows}
</body></html>`;

const out = path.join(DIR, 'compare.html');
fs.writeFileSync(out, page);
console.log(`写好 ${path.relative(process.cwd(), out)} —— ${cells.length} 格`);
