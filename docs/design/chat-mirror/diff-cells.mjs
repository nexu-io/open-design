/**
 * 逐格 × 逐元素 × 逐属性 对比交付稿与我们的实现。
 *
 * 为什么不是「看图」也不是「diff CSS 文本」:
 *  · 看图要人眼盯 84 格,而且颜色差一档、字号差 1px 根本看不出来;
 *  · diff 规则文本会漏掉**层叠**——2026-08-25 撞过:两边声明一模一样,
 *    我少写了一个祖先,特异性从 (0,3,0) 掉到 (0,2,0),壳内失败行铺出整行红底。
 * 只有把两边**渲染出来**、按元素配对、再逐条比 `getComputedStyle` 才作数。
 *
 * 配对办法:两边按**文档顺序**取「带自己的文字的元素」,用文字内容对齐。
 * 陈列页的夹具文案就是从稿子抄的,所以同一格两边的文字序列基本一致;
 * 对不上的元素单独列出来(那本身就是结构差异,同样要看)。
 *
 * 用法(docs/design 下要有静态服):
 *   node docs/design/chat-mirror/diff-cells.mjs 15 27 > /tmp/diff.json
 */
import { spawn } from 'node:child_process';

const [fromArg, toArg] = process.argv.slice(2);
const FROM = Number(fromArg ?? 1);
const TO = Number(toArg ?? 90);
const BASE = process.env.DIFF_BASE ?? 'http://127.0.0.1:17699';
const PORT = 9571;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 比这些属性。刻意不比 width/height —— 两边容器宽度不同,那是陈列页的事,不是实现的事 */
/*
 * 比哪些属性。
 *
 * 2026-08-26 重写:原来这张表只有十几条,**间距只量了四个 padding 和上下 margin** ——
 * 于是「秒数贴着文字 vs 甩到行尾」(靠 `margin-left: auto`)、「缩略图条缩进多了一截」
 * (靠 `padding-inline-start`)、「格子多宽」(靠 `width` / `flex`)这几类
 * 一眼就能看出来的差异,84 格量下来一条都没报,还给了绿章。用户当场指出两次。
 *
 * 现在按**完整盒模型**摊开:四边内距、四边外距、四边描边、四角圆角、
 * 尺寸与伸缩、定位与偏移、以及 flex/grid 的排布量。
 * 仍然只比**稿子亲自写过**的那些(见下面 authored 的算法)——
 * 所以摊开属性表不会把继承值也拖进来。
 */
const PROPS = [
  // 字
  'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'letterSpacing', 'fontStyle',
  'textAlign', 'textIndent', 'textTransform', 'whiteSpace', 'verticalAlign',
  // 色
  'color', 'backgroundColor', 'opacity',
  // 四边内距
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  // 四边外距 —— 横向那两条是「推到最右」的实现方式,漏不得
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  // 四边描边 + 四角圆角
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
  // 尺寸与伸缩
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'flexGrow', 'flexShrink', 'flexBasis', 'aspectRatio', 'boxSizing',
  // 排布
  'display', 'flexDirection', 'flexWrap', 'alignItems', 'alignSelf', 'alignContent',
  'justifyContent', 'justifyItems', 'justifySelf', 'placeItems',
  'rowGap', 'columnGap', 'gridTemplateColumns', 'gridTemplateAreas', 'order',
  // 定位与偏移
  'position', 'top', 'right', 'bottom', 'left', 'zIndex',
  'overflowX', 'overflowY',
];

/**
 * 交付稿**自己那份**样式表里出现过的选择器。
 *
 * 为什么需要它:量的是陈列矩阵页,那张页面除了把交付稿的样式整份带进来,还有
 * **它自己的陈列用样式**(载体宽度、行距、编号那一列……)。旧矩阵页里有一条
 *   `.nm { text-align:left!important; font-weight:600; color:var(--text-strong); width:150px }`
 * —— 本意是给左边那列组件名用的,却顺手命中了格子里组件的 `span.nm`。
 * 于是「稿子规定了 font-weight:600」这句话根本不成立,而我们每一格都被它记一条假差异
 * (量到过 69 条)。所以 authored 只认**交付稿原文里出现过的选择器**。
 *
 * ## 从**正在量的那张页面**上取,不去另外找一份稿子
 *
 * 矩阵页本身就是交付稿(`build-matrix.mjs` 只往它末尾追加了载体样式与重排脚本),
 * 所以选择器直接从它身上扫,把注入的那一块 `#od-matrix-style` 剔掉就行。
 * 原来是另外去 fetch 一份 `${BASE}/chat-panel-next.html`:那份**可能根本不在服务上**
 * (404 时 `fetch` 不抛错,拿回一段 404 页面),也可能和矩阵页不是同一版。
 * 踩过一次:换了一个只放矩阵页的服务目录,那条 fetch 静默 404,`fromDesign` 空掉,
 * authored 滤网于是把**所有**属性都跳过 —— 属性差从 207 掉到 153,看起来像是修好了。
 */
const designSelectors = await (async () => {
  const url = `${BASE}${process.env.DIFF_MATRIX ?? '/chat-matrix/matrix.html'}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`取不到矩阵页 ${url}(HTTP ${res.status})—— 先把它铺到服务上`);
  const html = await res.text();
  const set = new Set();
  const blocks = [...html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)]
    // 载体样式是**这张陈列页自己的**,不是稿子写的 —— 收进来就等于把载体差异算成设计规定
    .filter((m) => !m[1].includes('od-matrix-style'))
    .map((m) => m[2]);
  /*
   * **外链的样式表也要跟进去。**
   *
   * 交付稿现在把一大块样式放在 `<link>` 出去的 `chat-panel/src/*.css` 里
   * (visual-samples.css 一份就 452KB)。只扫内联 `<style>` 的话,那一整份会被判成
   * 「稿子没写过」—— authored 滤网于是把那一族的每一条属性都跳过,视觉方向那几格
   * **整族变成盲区**:报出来是干干净净的零差异,而它其实一条都没量。
   */
  for (const link of html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*>/g)) {
    const href = /href=["']([^"']+)["']/.exec(link[0])?.[1];
    if (!href) continue;
    const at = new URL(href, url).href;
    const sheet = await fetch(at);
    // 取不到就**当场停**:静默跳过等于把那一整份判成「稿子没写过」,
    // 而报告上看不出这是缺料 —— 那正是上面这段注释说的盲区。
    if (!sheet.ok) throw new Error(`矩阵页的外链样式取不到:${at}(HTTP ${sheet.status})`);
    blocks.push(await sheet.text());
  }
  for (const block of blocks) {
    const css = block.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      for (const part of rule[1].split(',')) {
        const s = part.trim().replace(/\s+/g, ' ');
        if (s && !s.startsWith('@')) set.add(s);
      }
    }
  }
  /*
   * 下限守卫:选择器少得不像话,说明上面某一步悄悄空了(取错页、样式没铺、正则没命中)。
   * 这条判据不精确,但它拦的是**整族盲区**那一类失效 —— 那种失效在报告上长得像
   * 「差异变少了」,不拦住就会被当成好消息。
   */
  if (set.size < 500) {
    throw new Error(`只从 ${url} 扫出 ${set.size} 条选择器,太少了 —— 稿子的样式没被完整读到,`
      + '这一趟量出来的属性差会**整体偏小**(authored 滤网会把没读到的那些全部跳过)。先修这里。');
  }
  console.error(`稿子选择器 ${set.size} 条(来自 ${url} 及其外链)`);
  return [...set];
})();

const PROBE = (selector, inner) => `JSON.stringify([...document.querySelectorAll(${JSON.stringify(selector)})].map((raw) => {
  const base = ${inner ? `raw.querySelector(${JSON.stringify(inner)}) ?? raw` : 'raw'};
  /*
   * 稿子那一格只画了整棵树里的一段时,格子上会带 data-crop 指出对应的那一段
   * (工具调用那几格:稿子画的是抽屉,我们挂的是整张执行记录壳)。
   * 页面上照旧展示整张壳,只有比对落在这一段上 —— 不然两边从第一个元素就错开一位。
   */
  const cropSel = raw.getAttribute ? raw.getAttribute('data-crop') : null;
  const root = cropSel ? (base.querySelector(cropSel) ?? base) : base;
  const props = ${JSON.stringify(PROPS)};
  /*
   * 只收「看得见的节点」。纯包裹层(没自己的文字、没底色、没边框、只是把孩子拢一拢)
   * 两边数量本来就不一样 —— React 组件多包几层是实现自由,不是设计差异。
   * 把它们收进来会让两边的序列长度对不上,后面按位置配对就整体串位,每格多报一堆假差异。
   */
  const out = [];
  const blank = new Set(['rgba(0, 0, 0, 0)', 'transparent']);
  const LEAF = new Set(['svg', 'img', 'input', 'textarea', 'video', 'canvas', 'br', 'hr']);
  /*
   * 结构性元素一律留下,不看它画不画东西。
   * 踩过:记忆卡的 details 因为「没底色没边框」被当成纯包裹层滤掉了 ——
   * 而没底色没边框**正是要修的那个 bug**。用「画不画」当去留判据,会把缺陷本身藏起来,
   * 还顺带让后面整体串位。
   */
  const KEEP = new Set(['details', 'summary', 'button', 'label', 'a', 'li', 'time']);
  /*
   * 第 0 个永远是**载体**(稿子那边的 .ent-b / 我们这边的 .stage),后面 pair() 会把它跳掉。
   * 用了 crop 的时候,被裁出来的那个根是**真元素**(抽屉的 details),不能被当成载体丢掉 ——
   * 丢掉的话我们这一侧整体前移一位,后面每一条都跟稿子错开。所以裁的时候把载体补回队首。
   */
  const scan = cropSel ? [raw, root, ...root.querySelectorAll('*')] : [root, ...root.querySelectorAll('*')];
  /*
   * 几何原点。属性比对只能证明「两边规则一样」,证明不了「两边落在同一个位置」——
   * 中间任何一层没被收进来的包裹层、任何一条没进量程的属性,都会让位置整体漂走。
   * 所以另存一份相对这一格根节点的坐标,专门比位置和尺寸。
   */
  const originBox = root.getBoundingClientRect();
  for (const el of scan) {
    const tag = el.tagName.toLowerCase();
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    const cs = getComputedStyle(el);
    /*
     * 「画不画东西」要把**背景图**也算上。
     * 踩过:回合状态行那枚完成勾是「只有 background-image」的空 span ——
     *      (这段在模板串里,所以不能带反引号)
     * 底色仍是透明,于是被当成空包裹层滤掉,整列从那里错开一位,
     * 后面每个按钮都和稿子的 svg 配到一起,报出一堆根本不存在的颜色差异。
     */
    const paints = !blank.has(cs.backgroundColor)
      || cs.backgroundImage !== 'none'
      || (cs.borderTopStyle !== 'none' && parseFloat(cs.borderTopWidth) > 0)
      || parseFloat(cs.borderTopLeftRadius) > 0;
    /*
     * 只给读屏的文字(sr-only)不算「看得见」。
     * 它被裁成 1x1 + overflow hidden 藏在角落,屏幕上一个像素都不占;
     * 但它有自己的文字,按上面那条判据会被当成可见节点收进来,
     * 于是我们这边平白多出一个元素,后面整列跟着错位
     * (踩到过:用户消息里那句只给读屏的「你」。这段在模板串里,不能带反引号。)
     */
    const box = el.getBoundingClientRect();
    // 判据要收紧到 sr-only 的那套写法(绝对定位 + 裁成 1x1 + overflow hidden):
    // 只用「盒子 0x0 + overflow hidden」会把 display:none 的普通元素也一起滤掉,
    // 两边滤掉的还不一样多,反而制造新的错位(第 21 / 22 格就这么从 0 变回 4)。
    const srOnly = cs.position === 'absolute'
      && box.width <= 1 && box.height <= 1 && cs.overflow === 'hidden';
    const visible = (!!own || LEAF.has(tag) || KEEP.has(tag) || paints) && !srOnly;
    if (el !== scan[0] && !visible) continue;
    const style = {};
    for (const p of props) style[p] = cs[p];
    /*
     * 这个元素被**亲自写过**哪些属性。
     *
     * 只比稿子规定过的东西 —— 没规定的那些是从承载页面继承来的:
     * 稿子那张页面 body 是 line-height 1.5,矩阵页的 .ent-b 又压了 12px;
     * 我们这张页面各有各的值。拿这些比,得到的全是「两张页面不一样」,
     * 不是「实现和设计不一样」。踩过:记忆卡明明已经改对了,还剩 5 条差异,
     * 全是这种继承值,差点让我去改一个没坏的地方。
     */
    const authored = new Set();
    /*
     * authoredAll = **这一侧自己**写过的属性,不按交付稿的选择器过滤。
     *
     * 为什么需要它:原来只比「稿子写过的」,于是**我们多写的**东西整个看不见 ——
     * 视觉方向卡是 <button>,被全局 button { align-items: center } 压住,
     * 预览块缩成 0 宽、整张卡塌成 2px 高;而稿子的 .vopt 不写 align-items,
     * 于是这条差异被「稿子没写过」跳过了,84 格量下来一条没报,还给了绿章。
     * 页面级的那几条(:root / html / body / *)仍然排除 —— 那才是承载页噪音。
     */
    const authoredAll = new Set();
    const PAGE_LEVEL = new Set([':root', 'html', 'body', '*', ':where(html)', ':where(body)']);
    const fromDesign = new Set(${JSON.stringify(designSelectors)});
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const r of rules) {
        if (!r.selectorText) continue;
        /*
         * 只认交付稿原文写过的那条选择器 —— 承载页自己的陈列样式(比如那条裸 .nm,
         *（这段在模板串里,不能带反引号）
         * 也会命中组件里的元素,把它算成「稿子规定过」就会凭空造出一堆假差异。
         * 逐个逗号段判断:命中元素**并且**这一段在交付稿里出现过,才算数。
         */
        const parts = r.selectorText.split(',').map((s) => s.trim().replace(/\s+/g, ' '));
        let hit = false;
        for (const part of parts) {
          if (!fromDesign.has(part)) continue;
          try { if (el.matches(part)) { hit = true; break; } } catch { /* 选择器不合法 */ }
        }
        let hitAny = false;
        for (const part of parts) {
          if (PAGE_LEVEL.has(part)) continue;
          try { if (el.matches(part)) { hitAny = true; break; } } catch { /* 选择器不合法 */ }
        }
        if (hitAny) for (const name of r.style) authoredAll.add(name);
        if (!hit) continue;
        for (const name of r.style) authored.add(name);
      }
    }
    /*
     * 「这个节点是一张图」。
     *
     * 稿子里的预览位是 span / i 加一张背景图(它是张静态稿,没有真文件可放);
     * 产品里同一个位置是真的 img。两者画的是同一样东西、占同一个位置,
     * 只是承载方式不同 —— 按标签配对会把它们判成结构差异,后面整列还要跟着错位。
     * 判据收紧到「自己没有文字、没有子元素、且确实在画一张图」,免得把普通容器也算进来。
     */
    const pic = tag === 'img'
      || (!own && el.children.length === 0 && cs.backgroundImage !== 'none');
    const r2 = (v) => Math.round(v * 2) / 2;
    const geom = {
      x: r2(box.x - originBox.x), y: r2(box.y - originBox.y),
      w: r2(box.width), h: r2(box.height),
    };
    out.push({ tag, pic, text: own.slice(0, 30), style, geom, authored: [...authored], authoredAll: [...authoredAll] });
  }
  return out;
}))`;

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/od-diffcells-${PORT}`,
  '--force-color-profile=srgb', '--window-size=980,1200', 'about:blank'], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((x) => x.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('chrome 没起来');
}

let seq = 0;
const pending = new Map();
const sock = new WebSocket(await target());
await new Promise((r) => sock.addEventListener('open', r));
sock.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  const slot = msg.id && pending.get(msg.id);
  if (!slot) return;
  pending.delete(msg.id);
  msg.error ? slot.rej(new Error(msg.error.message)) : slot.res(msg.result);
});
const send = (m, p = {}) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, { res, rej });
  sock.send(JSON.stringify({ id, method: m, params: p }));
});

/*
 * 量之前**把 CSS 动画冻掉**(`DIFF_FREEZE=0` 关掉)。
 *
 * 静态比对本来就照不出动画;而一边在动、一边不动的时候,读数会**每跑一次都不一样**。
 * 实测:音频那一格我们这边挂着 `data-playing`,`wave-pulse` 让 28 根竖条一直在起伏,
 * 同一份页面连跑两次量出 24.5 / 23、18 / 17 …… 位置差跟着在 16 / 17 之间跳;
 * 稿子那一侧因为演示格靠 IntersectionObserver 起播、而比对窗口从不滚动,反而是静止的。
 * 两边一起冻在「没有动画」那一帧,读数才是可复现的 —— 那也正是关掉动效的人看到的那一帧。
 */
const FREEZE = '*, *::before, *::after { animation: none !important; transition: none !important; }';

async function grab(url, selector, inner, neutralize) {
  await send('Page.navigate', { url });
  await sleep(Number(process.env.DIFF_WAIT ?? '3500'));
  if (process.env.DIFF_FREEZE !== '0') {
    await send('Runtime.evaluate', { expression:
      `(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(FREEZE)}; document.head.appendChild(s); })()` });
  }
  if (neutralize) {
    await send('Runtime.evaluate', { expression:
      `(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(neutralize)}; document.head.appendChild(s); })()` });
  }
  // DIFF_MEDIA=1:把两张页面各自实际生效的媒体条件打出来。
  // 上面那段 setEmulatedMedia 到底有没有吃进去,只有这样才看得见 —— 光看差异数会以为是实现的问题。
  if (process.env.DIFF_MEDIA === '1') {
    const probe = await send('Runtime.evaluate', { returnByValue: true,
      expression: `JSON.stringify({ hover: matchMedia('(hover: hover)').matches, fine: matchMedia('(pointer: fine)').matches })` });
    console.error('媒体条件', url, probe.result.value);
  }
  const r = await send('Runtime.evaluate', { returnByValue: true, expression: PROBE(selector, inner) });
  return JSON.parse(r.result.value);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 980, height: 1200, deviceScaleFactor: 1, mobile: false });
/*
 * 按**桌面鼠标**来测。
 *
 * 无头 Chrome 默认报 `hover: none` / `pointer: none`(它没有鼠标),于是所有
 * `@media (hover: none)` 的兜底规则都会打开 —— 我们给触屏补的「×」常驻就是这么一条,
 * 结果量出来「稿子 opacity:0 / 我们 opacity:1」,而实际在桌面上两边一模一样。
 * 交付稿画的是桌面形态,就按桌面形态比。
 */
await send('Emulation.setEmulatedMedia', {
  features: [
    { name: 'hover', value: 'hover' },
    { name: 'any-hover', value: 'hover' },
    { name: 'pointer', value: 'fine' },
    { name: 'any-pointer', value: 'fine' },
    { name: 'prefers-reduced-motion', value: 'no-preference' },
  ],
});

/*
 * 量陈列矩阵页(`build-matrix.mjs` 的产物)—— 不能改量交付稿原文那张:两张页面的
 * 组件**顺序不一样**(原文是 1,2,20,21,22,23,3,4…,矩阵页是重新编过号的 1..90),
 * 换过去 gid 全错位。
 *
 * ## 这里曾经有一条 `NEUTRALIZE`,已经撤掉
 *
 * 它注的是 `.ent-b .nm { font-weight: inherit; … }`,为的是压掉旧矩阵页那条裸
 * `.nm { font-weight:600; width:150px; text-align:left!important }`(本意给左边那列
 * 组件名,却顺手命中了格子里组件的 `span.nm`)。
 *
 * **撤掉的理由**:`build-matrix.mjs` 出的载体不带那条陈列样式,而注进去的这条
 * 反过来会盖掉稿子**真正写过**的 `.tool .nm { font-weight: 400 }` —— 同特异性、
 * 后来者赢。也就是说它现在只会凭空造差异。
 *
 * 需要时仍可用 `DIFF_NEUTRALIZE=<css>` 现给一段;默认不注。
 */
const neutralize = process.env.DIFF_NEUTRALIZE || undefined;
const MATRIX = process.env.DIFF_MATRIX ?? '/chat-matrix/matrix.html';
const design = await grab(`${BASE}${MATRIX}`, '.ent-b', undefined, neutralize);
const ours = await grab(`${BASE}/chat-mirror/mirror-exec.html`, '.cell', '.stage');

/**
 * **按位置配对,不按文字**。
 *
 * 一开始我按文字内容配,结果 30 格「对不上」——那是把两类文案混为一谈了:
 *  · 产品自己的字(按钮 / 状态词 / 标签)必须逐字对稿;
 *  · agent 产出的字(问题、选项、正文)本来就是变的,稿子用的也只是示例。
 * 而**要比的是样式**:字号、字重、颜色、底色、圆角、间距。这些跟文字内容无关,
 * 所以按两边的文档顺序对齐更实在;长度对不上的部分单独列出来,那本身就是结构差异。
 */
function pair(a, b) {
  /*
   * 按**标签序列的最长公共子序列**对齐,不再按下标硬配。
   *
   * 按下标配只在两棵树形状完全一致时才成立 —— 只要有一处多包了一层、或者一边的
   * 容器被可见性规则滤掉了(我们的卡头有底色所以留下,稿子的没有所以被滤),
   * 从那里往后就整体串位,后面每一条都会被报成差异,真差异淹在里面看不见。
   * LCS 对齐会把对得上的配起来,对不上的各自列进 onlyDesign / onlyOurs ——
   * 那本身就是「结构不一致」这条要看的信息。
   */
  const n = a.length;
  const m = b.length;
  /*
   * 配对判据 = 标签**加上**自己的文字。
   *
   * 只按标签配,两棵树只要错开一位,后面就会一路乱配:壳头那个「已完成」会去和
   * 稿子的「复刻商品列表页」配到一起,于是报出一堆两边都没错的颜色 / 字重差异。
   * 陈列页的夹具文案本来就是从稿子抄的,文字是很强的锚点;文字对不上的那些
   * 各自进 onlyDesign / onlyOurs —— 那本身就是要看的结构差异。
   * 两边都没有自己的文字时(纯容器 / 图标)仍然只按标签配。
   */
  /*
   * ## 配对时把数字串抹成通配(`DIFF_NUMWILD=0` 关掉)
   *
   * 镜像页的夹具不是逐字抄稿子的:同一枚耗时标签稿子写 `18.2s`、我们写 `2.5s`,
   * 计数写 `2/4` 对 `3/4`,时间写 `14:32` 对 `06:32`。「文字要一样」这条判据
   * 于是把**所有带数字的元素**都推进 onlyDesign / onlyOurs ——
   * 秒数、计数、时间这三族的样式一条都量不到,而报告里看不出这是盲区
   * (它长得就像「结构不一致」,和真正的结构差异混在一起)。
   * 抹掉数字之后 `18.2s` / `2.5s` 都成 `#s`,配得上;LCS 仍保证顺序,不会乱配。
   *
   * ## 它会不会把**真的**数字差异一起抹掉?
   *
   * 会,如果只做到这里 —— `2/4` 对 `3/4` 配上之后就再没人提这件事了。
   * 所以下面另开了一列 {@link texts}:凡是配上、但**原文**不一样的,逐条报出来。
   * 通配只影响「谁和谁配对」,不影响「配上之后报什么」。
   */
  const NUMWILD = process.env.DIFF_NUMWILD !== '0';
  const t = (v) => (NUMWILD ? String(v).replace(/[0-9]+/g, '#') : v);
  const same = (x, y) => (x.tag === y.tag || (x.pic && y.pic))
    && (t(x.text) === t(y.text) || (!x.text && !y.text));
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = same(a[i], b[j])
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs = [];
  const onlyDesign = [];
  const onlyOurs = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (same(a[i], b[j])) { pairs.push([a[i], b[j]]); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { onlyDesign.push({ tag: a[i].tag, text: a[i].text }); i += 1; }
    else { onlyOurs.push({ tag: b[j].tag, text: b[j].text }); j += 1; }
  }
  for (; i < n; i += 1) onlyDesign.push({ tag: a[i].tag, text: a[i].text });
  for (; j < m; j += 1) onlyOurs.push({ tag: b[j].tag, text: b[j].text });
  return { pairs, onlyDesign, onlyOurs };
}

const rows = [];
for (let gid = FROM; gid <= TO; gid += 1) {
  const d = design[gid - 1] ?? [];
  const o = ours[gid - 1] ?? [];
  // 第 0 个是两张页面各自的外框(.ent-b / .stage),那是载体不是组件 —— 比它只会得到载体差异
  const { pairs, onlyDesign, onlyOurs } = pair(d.slice(1), o.slice(1));
  const diffs = [];
  /**
   * 不过 authored 滤网的「一眼能看出来」的那几条。
   *
   * authored 挡住的不只是承载页噪音 —— 稿子把字号写在祖先上、我们写在自己身上
   * (或反过来)时,这个元素两边都没被「亲自写过」,于是 13px vs 12px 一条都不报。
   * 第 4 格那句「复刻商品列表页」稿子 91px 宽、我们 84px 宽,属性表里干干净净,
   * 差的正是没人亲自写过的那个 font-size。漏进来的承载页噪音由人逐条判,
   * 好过整族看不见。
   */
  const rawDiffs = [];
  /**
   * 配上了、但**原文不一样**的那些(`DIFF_NUMWILD` 的配套)。
   *
   * 通配让 `2/4` 和 `3/4` 配得上,是为了量它们的样式;而「一个 2 一个 3」本身
   * 也可能是要修的差异。配对那一层放过去,这一层原样报出来 —— 两件事各归各。
   */
  const texts = [];
  /** 位置/尺寸对不上的元素(和 `diffs` 分开报:一个是「规则不同」,一个是「落点不同」) */
  const geom = [];
  /**
   * 归一掉「写法不同但渲染一样」的值,否则每个节点都会报一条假差异,
   * 真差异被淹在噪音里 —— 这正是我第一版指纹比对失败的原因。
   *  · text-align: LTR 下 `start` 就是 `left`
   *  · 颜色 / 字体族的空白与大小写
   */
  const norm = (prop, v) => {
    let out = String(v ?? '').trim();
    if (prop === 'textAlign') out = out === 'start' ? 'left' : out === 'end' ? 'right' : out;
    if (prop === 'fontFamily') out = out.replace(/["']/g, '').replace(/\s*,\s*/g, ',');
    return out.replace(/\s+/g, ' ');
  };

  pairs.forEach(([x, y], i) => {
    const bad = {};
    /*
     * 描边宽度为 0 时,`border-style` 与 `border-color` **一个像素都不画**。
     * 稿子写 `border: none`、我们写 `border: 1px solid transparent` 再把宽度归零,
     * 渲染结果完全一样,不该报成差异 —— 不归一的话每颗按钮都要挂两条假差异。
     */
    /** 某一边的描边宽度两边都是 0 时,这一边的 style / color 一个像素都不画 */
    const inertSide = (side) =>
      parseFloat(x.style['border' + side + 'Width']) === 0
      && parseFloat(y.style['border' + side + 'Width']) === 0;
    // 属性名从驼峰还原成 CSS 写法,好和 authored 里的名字对上
    const kebab = (p) => p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    // 稿子写过的 ∪ **我们自己写过的** —— 后者是上面那条盲区的补丁
    const spec = new Set([...(x.authored ?? []), ...(y.authoredAll ?? [])]);
    for (const p of PROPS) {
      const css = kebab(p);
      // 稿子亲自写过才比:写 padding 简写也算写过 padding-top
      const shorthand = css.replace(/-(top|right|bottom|left|width|style|color)$/, '');
      if (!spec.has(css) && !spec.has(shorthand)) continue;
      const inertMatch = /^border(Top|Right|Bottom|Left)(Style|Color)$/.exec(p);
      if (inertMatch && inertSide(inertMatch[1])) continue;
      const a = norm(p, x.style[p]);
      const b = norm(p, y.style[p]);
      if (a !== b) bad[p] = { 稿: a, 我: b };
    }
    if (Object.keys(bad).length) {
      diffs.push({ at: i, tag: `${x.tag}/${y.tag}`, 稿文: x.text, 我文: y.text, props: bad });
    }

    /*
     * 第二遍:**不看 authored**,只比这几条「一眼能看出来」的。见上面 rawDiffs 的说明。
     */
    const RAW = ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'fontFamily',
      'color', 'backgroundColor'];
    const rbad = {};
    for (const p of RAW) {
      const a = norm(p, x.style[p]);
      const b = norm(p, y.style[p]);
      if (a !== b) rbad[p] = { 稿: a, 我: b };
    }
    if (Object.keys(rbad).length) {
      rawDiffs.push({ at: i, tag: `${x.tag}/${y.tag}`, 稿文: x.text, 我文: y.text, props: rbad });
    }

    /*
     * 配上了但原文不一样 —— 数字通配放过去的那一批,在这儿原样报出来。
     * 夹具本来就不是逐字抄稿子的,所以这一列**多数是夹具差**不是实现差;
     * 但「我们显示 2/4、稿子显示 3/4」这种真差异也只有它照得到。
     */
    if (x.text && y.text && x.text !== y.text) {
      texts.push({ at: i, tag: `${x.tag}/${y.tag}`, 稿文: x.text, 我文: y.text });
    }

    /*
     * 几何比对 —— 属性比对证明不了的那一半。
     *
     * 两边可以每条属性都相同,元素照样落在不同的 y 上:中间任何一层没被收进来的
     * 包裹层、任何一条没进 PROPS 的属性,都会把位置整体推走。「间距看着不对」
     * 这类问题只有量**位置**才看得见。
     *
     * 坐标相对这一格的根节点,所以整格的偏移不算数;容差 1px,躲开亚像素与字体度量的抖动。
     */
    const GEOM_TOL = 1;
    /*
     * 整个被推到画布外的元素不参与几何比对(读屏文本、藏起来的提示气泡)。
     * 两边把它们推出去的距离本来就不一样(稿子 -513、我们 -29),屏幕上一个像素都不占,
     * 拿来比只会刷出上百条假差异,把真的错位淹掉。
     */
    const offscreen = (g) => g.x + g.w <= 0 || g.y + g.h <= 0;
    if (x.geom && y.geom && !offscreen(x.geom) && !offscreen(y.geom)) {
      const gbad = {};
      for (const k of ['x', 'y', 'w', 'h']) {
        if (Math.abs(x.geom[k] - y.geom[k]) > GEOM_TOL) {
          gbad[k] = { 稿: x.geom[k], 我: y.geom[k] };
        }
      }
      if (Object.keys(gbad).length) {
        geom.push({ at: i, tag: `${x.tag}/${y.tag}`, 稿文: x.text, 我文: y.text, box: gbad });
      }
    }
  });
  // DIFF_WALKS=1 时把两边完整的元素走法也带出来 —— LCS 串位时只有它能看出错在哪一步
  const walks = process.env.DIFF_WALKS === '1'
    ? { 稿: d.map((x) => `${x.tag}:${x.text}`), 我: o.map((x) => `${x.tag}:${x.text}`) }
    : undefined;
  rows.push({
    gid, designEls: d.length, ourEls: o.length, onlyDesign, onlyOurs,
    diffs, rawDiffs, texts, geom, ...(walks ? { walks } : {}),
  });
}
/* 报告里要写清楚这一趟是怎么配对的 —— 通配开着的时候,onlyDesign / onlyOurs
   里就**不该**再有「只是数字不同」的那一批,它们改在 texts 里念。 */
console.error(`配对判据:数字${process.env.DIFF_NUMWILD === '0' ? '**未**通配(带数字的元素会整批进 onlyDesign / onlyOurs)' : '已通配(原文差异改在 texts 一列里报)'}`);
console.log(JSON.stringify(rows, null, 1));

sock.close();
chrome.kill('SIGKILL');
