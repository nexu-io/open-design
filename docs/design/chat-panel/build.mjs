// 从单一源生成两份预览页。
//
//   src/tokens.css      设计 token + 内嵌字体
//   src/components.css  组件样式  ← 核心，改这里（取自「组件全集 · 浅色」）
//   src/scene-shell.css 场景稿的面板外壳  ← 只有场景页用
//   src/thinking-orb.css / .js  Thinking 行首那颗球（内联的 thinking-orbs 引擎）
//   src/plan-todo.css / .js     Plan 卡的四态步骤图标与进度演示
//   src/thinking-stream.css / .js  Thinking 的推理流（固定高 + 自动滚 + 上下渐隐）
//   src/visual-samples.css        视觉方向那四张预览图（临时占位，内联 base64）
//   src/visual-fan.css / .js       视觉方向的叠放 / 网格两种排布
//   src/pixel-liquid.css / .js     生图占位格:还没生成出来时那格像素液体
//   src/audio-wave.css / .js       音频产物那一条:波形 + 播放
//   src/interactions.js         点击才看得出来的交互（重试图标转一圈）
//
// 核心取自浅色组件全集。剔掉两边各自独有的部分后，它与场景稿的共享
// 组件 CSS 都是 417 行、只差一条 —— 场景稿的 `.say .caret,.think .caret`
// 比浅色的多包一个选择器，已并进核心，所以浅色现在是严格超集。
// 场景页会多带 15 条它用不到的规则(支持弹窗/渠道图标，约 3KB)，无害。
//
// 浅色 / 场景两份都用同一份 components.css。改一次 components.css，
// 跑一次本脚本，两份一起变。
//
// 【暗色那份已经不出了】（2026-08-19）。它原来只是把同一份 body 的
// data-theme 换成 dark，靠 tokens.css 里那组 [data-theme="dark"] 覆盖
// 出色。停掉的是【产出】，不是能力：src 里的暗色 CSS 一条没删，
// 把下面 PAGES 里那一行加回来就又有了。
//
//   node build.mjs
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

const tokens = read('src/tokens.css');
const components = read('src/components.css') + '\n' + read('src/thinking-orb.css') + '\n' + read('src/plan-todo.css') + '\n' + read('src/thinking-stream.css') + '\n' + read('src/visual-fan.css') + '\n' + read('src/pixel-liquid.css') + '\n' + read('src/audio-wave.css');
const orbJs = read('src/thinking-orb.js');
const interactionsJs = read('src/interactions.js');
const planJs = read('src/plan-todo.js');
const streamJs = read('src/thinking-stream.js');
const fanJs = read('src/visual-fan.js');
const revealJs = read('src/text-reveal.js');
const revealImgJs = read('src/pixel-liquid.js');
const audioJs = read('src/audio-wave.js');
const sceneShell = read('src/scene-shell.css');
const bodyComponents = read('src/body-components.html');
const bodyScene = read('src/body-scene.html');

// 产出【就地覆盖仓库里那两份已提交的页面】—— 跑一次 `node build.mjs`,
// docs/design/ 下的两份 HTML 就是最新的,不需要再手工搬运。
const PAGES = [
  { out: '../chat-panel-next.html',     title: '对话面板组件全集',      theme: 'light', css: [tokens, components],             body: bodyComponents },
  { out: '../chat-panel-scene.html',    title: '对话面板场景稿',        theme: 'light', css: [tokens, components, sceneShell], body: bodyScene },
];

for (const page of PAGES) {
  const css = page.css.join('\n');

  // 页面自己的 body 规则镜像到包裹层：artifact 查看器的主题只作用在
  // 真正的 body 上，稿子的底色必须跟着包裹层走，否则暗色页四周会露白。
  const bodyRules = [...css.matchAll(/(?:^|\n)\s*body\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const mirrored = bodyRules.map((d) => `.od-preview-root {${d}}`).join('\n');

  const doc = [
    // artifact 查看器自己会注入 charset，但双击本地文件、或用不发 charset 的
    // 静态服务打开时，浏览器会退回按 GBK 猜，整页中文变乱码。补一行就好。
    '<meta charset="utf-8">',
    // 主题钉在 <html> 上，而不是只钉在下面那个包裹层。
    // ------------------------------------------------------------
    // tokens.css 的自动暗色段作用域是 `html:not([data-theme])`，它认的是
    // <html> 这一个元素。而这份文件只产出 <html> 里面的片段 —— 包裹层上那个
    // data-theme="light" 落在一个 div 上，压根不参与那条选择器的判定。
    // 结果是：评审者的系统设成暗色时，暗色 token 照样从 <html> 灌下来，
    // 而稿子里几处按浅底定死的色号（--select-ink 的选中字、--anim-ink 的动效墨）
    // 不跟着翻 —— 深灰字压在深灰底上，选中的那几行直接看不见。
    // 半暗不亮的一版比任何一版都糟，所以这里把 light 真正钉上去。
    // 要放暗色进来的话：删掉这一行，并给上面那两个色号补暗色镜像。
    `<script>document.documentElement.setAttribute('data-theme','${page.theme}')</script>`,
    `<title>${page.title}</title>`,
    '<!-- 本文件由 build.mjs 生成，不要直接改；改 src/components.css 后重新跑。 -->',
    '<link rel="stylesheet" href="chat-panel/src/visual-samples.css">',
    `<style>${css}</style>`,
    '<style>',
    'body { margin: 0; }',
    mirrored,
    '.od-preview-root { min-height: 100vh; }',
    '</style>',
    `<div class="od-preview-root" data-theme="${page.theme}">`,
    page.body,
    '</div>',
    // 模块脚本天然 defer，放在末尾时 [data-orb] 已经在 DOM 里，挂载不用等事件。
    `<script type="module">${orbJs}</script>`,
    `<script type="module">${interactionsJs}</script>`,
    `<script type="module">${planJs}</script>`,
    `<script type="module">${streamJs}</script>`,
    `<script type="module">${fanJs}</script>`,
    `<script type="module">${revealJs}</script>`,
    `<script type="module">${revealImgJs}</script>`,
    `<script type="module">${audioJs}</script>`,
  ].join('\n') + '\n';

  writeFileSync(join(root, page.out), doc);
  console.log(`${page.out.padEnd(30)} ${String(Buffer.byteLength(doc)).padStart(9)} bytes  theme=${page.theme}  body规则=${bodyRules.length}`);
}
