/**
 * **量数之前的前置闸**:确认你手上这份陈列页已经上过字体。
 *
 * 仓库里那份 `mirror-exec.html` **是不带字体的**(同一份字节 `apps/web/public/fonts/`
 * 里已经有了,再复制一份进 HTML 要 +423KB 并撑破 CI 的单文件 1MB 闸)。
 * 字体由 `inline-fonts.mjs` 在**本地**注入,注入结果不提交。
 * 所以在一份刚 clone 或刚重新生成的页面上,这条闸**本来就应该红** —— 它红是在提醒你
 * 「还没跑 inliner,现在量出来的数不作数」,不是仓库坏了。
 *
 * 正确的顺序:
 *
 * ```bash
 * node docs/design/chat-mirror/inline-fonts.mjs   # 上字体(本地)
 * node docs/design/chat-mirror/check-fonts.mjs    # 退出码 0 才能开始量
 * DIFF_BASE=… node docs/design/chat-mirror/diff-cells.mjs 1 90 > diff.json
 * ```
 *
 * ## 它钉的是哪次事故
 *
 * `mirror-exec.html` 长期一条 `@font-face` 都没有,却声明着
 * `--sans: "Albert Sans", "PingFang SC", …`。页面照常渲染、照常好看、
 * 逐格比对照常出数 —— 只是那些数全是 **PingFang SC** 量出来的。
 * 而稿子那一侧(`build-matrix.mjs`)自带 base64 内联的 Albert Sans。
 * 于是「稿子 vs 我们」实际上是「Albert Sans vs PingFang SC」,
 * 行高、文本宽度、折行位置、卡片高度**整批带偏**,方向单一、不会自己抵消。
 *
 * 这种坏法没有任何视觉症状:中文照常显示,英文换成了另一套字形,
 * 除非有人专门去量,否则永远发现不了。所以它必须有一条会自己变红的守卫。
 *
 * ## 判据为什么不是 `document.fonts.check()` 一句了事
 *
 * `document.fonts.check('13px "Albert Sans"')` 在**一条 `@font-face` 都没有**时
 * 返回的是 `true` —— 规范说 check() 只看 FontFaceSet 里匹配得上的那些面,
 * 一个都匹配不上就「全都加载好了」,真空成立。正好是这次要抓的那种坏法。
 * 拿它当判据 = 一条永远绿的线。
 *
 * 所以真正的判据是**差分**:同一段文本,用 `"Albert Sans", <哨兵>` 和只用
 * `<哨兵>` 各量一次宽度,**必须不相等**。字体没进来时两边都落到哨兵上、宽度相同,
 * 当场红。再配一个**反向对照**:一个确定不存在的字族,它的差分必须是 0 ——
 * 这一条是给判据自己洗清的,差分量法要是坏了(比如把哨兵也弄丢了),
 * 反向对照会跟着变绿,于是整趟报错,而不是给出一个自信的绿。
 *
 * ## 还顺带钉了「描述符和 base.css 逐字一致」
 *
 * 页面里的 `@font-face` 是从 `base.css` 搬来的(`inline-fonts.mjs`)。
 * 本守卫每次都重新从 `base.css` 推一遍期望描述符,和页面里实际那份逐条比。
 * 尤其是 `JiduMono Pro` 的 `font-weight: 500` —— 那个字体只有一份静态 Regular
 * 字节,描述符停在 400 的话面板里就是「请求 500、可用面只有 400」,
 * 各浏览器折算行为不一致。两处只改一半就是坏的,这里会红。
 *
 * ## 用法
 *
 * ```bash
 * node docs/design/chat-mirror/check-fonts.mjs                 # 默认查 mirror-exec.html
 * node docs/design/chat-mirror/check-fonts.mjs --page <路径>
 * CHECK_FONTS_PORT=19487 node docs/design/chat-mirror/check-fonts.mjs
 * ```
 *
 * 退出码 0 = 绿,1 = 红(红的时候把每一条不合格的判据都打出来)。
 *
 * **红证据怎么造**(改完守卫必须走一遍,没见过红的绿读数不是证据):
 *
 * 最省事的红就是**仓库里那份原样的页面** —— 它本来就不带字体:
 *
 * ```bash
 * git stash list  # (别用 stash,栈是仓库级共享的)
 * node docs/design/chat-mirror/inline-fonts.mjs --strip   # 摘回仓库形态
 * node docs/design/chat-mirror/check-fonts.mjs            # 必须红,退出码 1
 * node docs/design/chat-mirror/inline-fonts.mjs           # 上字体
 * node docs/design/chat-mirror/check-fonts.mjs            # 必须绿,退出码 0
 * node docs/design/chat-mirror/inline-fonts.mjs --strip   # 量完还原,别提交带字体的版本
 * ```
 *
 * 描述符那一条单独造红:把注入块里 `JiduMono Pro` 的 `font-weight: 500` 改成 400,
 * 守卫会报「描述符和 base.css 对不上」+「多出一条 base.css 没有的 @font-face」。
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOCK_ID, FONT_SOURCE, MISSING_MARK, descriptorsOf, extractFontFaces, repoRoot } from './inline-fonts.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const PAGE = argv.includes('--page')
  ? resolve(argv[argv.indexOf('--page') + 1])
  : join(HERE, 'mirror-exec.html');
const PORT = Number(process.env.CHECK_FONTS_PORT ?? 19487);
const CHROME = process.env.CHECK_FONTS_CHROME
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** 差分探针用的文本。刻意全是拉丁字母 —— 中文字形在 Albert Sans 里根本没有,
 *  一样会落到 PingFang SC,拿中文当探针的话装没装字体都量不出差。 */
const PROBE_TEXT = 'Handgloves 0123456789 illegible';
/** 一个**确定不存在**的字族,给差分量法做反向对照。 */
const SENTINEL_FAMILY = 'OD No Such Face 9f3c';

const fails = [];
const notes = [];
const ok = (msg) => notes.push(`  ✓ ${msg}`);
const bad = (msg) => fails.push(msg);

// ── ① 静态:页面里那份 @font-face 和 base.css 逐字对得上吗 ────────────────
if (!existsSync(PAGE)) {
  console.error(`页面不在:${PAGE}`);
  process.exit(1);
}
const html = readFileSync(PAGE, 'utf8');
const root = repoRoot();
const expected = extractFontFaces(readFileSync(join(root, FONT_SOURCE), 'utf8')).map(descriptorsOf);
if (expected.length === 0) bad(`${FONT_SOURCE} 里一条 @font-face 都没有 —— 先修那边`);

const blockMatch = new RegExp(`<style id="${BLOCK_ID}"[^>]*>([\\s\\S]*?)</style>`).exec(html);
if (!blockMatch) {
  bad(
    '这份页面**还没上字体**(找不到 <style id="' + BLOCK_ID + '">)。\n'
    + '     仓库里那份本来就不带字体:同一份字节 apps/web/public/fonts/ 里已经有了,再复制一份\n'
    + '     进 HTML 要 +423KB,并撑破 CI 的单文件 1048576 字节上限。字体由 inline-fonts.mjs\n'
    + '     在本地注入,注入结果不提交。\n'
    + '     现在量出来的行高 / 文本宽度 / 折行位置 / 卡片高度都是回退面 PingFang SC 的,\n'
    + '     而稿子那一侧自带内联字体 —— 比出来的差异会整批带偏。\n'
    + '     跑这条:node docs/design/chat-mirror/inline-fonts.mjs',
  );
} else {
  const actual = extractFontFaces(blockMatch[1]).map(descriptorsOf);
  const key = (d) => `${d.family}|${d.style}|${d.weight}|${d.display}|${d.format}`;
  const actualKeys = new Set(actual.map(key));
  for (const e of expected) {
    if (actualKeys.has(key(e))) ok(`描述符对上 ${FONT_SOURCE}:${key(e)}`);
    else bad(`描述符和 ${FONT_SOURCE} 对不上,页面里缺这一条:${key(e)}\n     页面现有:${[...actualKeys].join('\n              ') || '(空)'}`);
  }
  for (const a of actual) {
    if (!expected.some((e) => key(e) === key(a))) bad(`页面里多出一条 base.css 没有的 @font-face:${key(a)}`);
  }
  if (!/url\(\s*"data:font\//.test(blockMatch[1])) {
    bad('注入块里的 src 不是 data: URI —— 页面就不再自包含了,file:// 和裸静态服都拿不到字体');
  } else ok('字体是 data: URI 内联的(页面仍然自包含、可离线打开)');
}

// ── ② 运行时:浏览器里真的用上了吗 ────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/od-check-fonts-${PORT}`,
  '--force-color-profile=srgb', '--window-size=980,1200', 'about:blank',
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((x) => x.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error(`chrome 没起来(调试端口 ${PORT})`);
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

/**
 * 页面里跑的那段。回来的是一份纯数据,判定全部留在 node 这边 ——
 * 判据写在页面里的话,页面坏掉时判据会跟着一起坏。
 */
const IN_PAGE = (families, probeText, sentinelFamily, missingMark) => `(async () => {
  await document.fonts.ready;
  const want = ${JSON.stringify(families)};
  // 显式 load 一遍:font-display: swap 下,页面上没人用到的那一档可能压根没开始下载。
  for (const f of want) {
    try { await document.fonts.load(f.style + ' ' + f.weightForLoad + ' 13px "' + f.family + '"', ${JSON.stringify(probeText)}); } catch {}
  }
  const span = document.createElement('span');
  span.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:pre;font-size:100px;line-height:1';
  span.textContent = ${JSON.stringify(probeText)};
  document.body.appendChild(span);
  const widthWith = (stack, weight, style) => {
    span.style.fontFamily = stack;
    span.style.fontWeight = weight;
    span.style.fontStyle = style;
    return span.getBoundingClientRect().width;
  };
  // 两个哨兵:真字体正好和其中一个等宽的概率不为零,但同时等于两个的概率可以忽略。
  const differential = (family, weight, style) => ['monospace', 'serif'].map((s) => {
    const a = widthWith('"' + family + '", ' + s, weight, style);
    const b = widthWith(s, weight, style);
    return { sentinel: s, withFont: a, fallbackOnly: b, delta: Math.abs(a - b) };
  });
  const out = { faces: [], probes: [], control: null, resolvedFirstSans: null, pageSample: null };
  for (const f of [...document.fonts]) {
    out.faces.push({ family: f.family.replace(/["']/g, ''), style: f.style, weight: f.weight, display: f.display, status: f.status });
  }
  for (const f of want) {
    out.probes.push({ family: f.family, style: f.style, weight: f.weightForLoad, deltas: differential(f.family, f.weightForLoad, f.style) });
  }
  out.control = { family: ${JSON.stringify(sentinelFamily)}, deltas: differential(${JSON.stringify(sentinelFamily)}, '400', 'normal') };
  const rootCs = getComputedStyle(document.documentElement);
  out.resolvedFirstSans = (rootCs.getPropertyValue('--sans') || '').split(',')[0].trim().replace(/["']/g, '');
  out.resolvedFirstMono = (rootCs.getPropertyValue('--mono') || '').split(',')[0].trim().replace(/["']/g, '');
  // 生成器在页顶留的「还没上字体」横幅:上了字体它就该被注入块藏掉。
  // 「有字体」和「横幅不见了」必须是同一件事的两种表现,否则两边会各说各话。
  const banner = document.getElementById(${JSON.stringify(missingMark)});
  out.banner = banner ? { present: true, display: getComputedStyle(banner).display } : { present: false };
  // 页面上真有元素在用它吗 —— 拿第一格里的一段正文当样本。
  const sample = document.querySelector('.cell .stage');
  if (sample) {
    const cs = getComputedStyle(sample);
    out.pageSample = { fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight };
  }
  span.remove();
  return JSON.stringify(out);
})()`;

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 980, height: 1200, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: `file://${PAGE}` });
await sleep(Number(process.env.CHECK_FONTS_WAIT ?? '3500'));

// `weightForLoad` 是 CSS 请求侧的字重,不是描述符里的范围。可变字重那条描述符写的是
// `100 900`(一个范围),不能原样塞进 `font: … 13px …` 的简写里。
const wanted = expected.map((d) => ({
  family: d.family,
  style: d.style,
  weightForLoad: /^\d+\s+\d+$/.test(d.weight) ? '500' : d.weight,
}));

const raw = await send('Runtime.evaluate', {
  returnByValue: true,
  awaitPromise: true,
  expression: IN_PAGE(wanted, PROBE_TEXT, SENTINEL_FAMILY, MISSING_MARK),
});
sock.close();
chrome.kill('SIGKILL');

if (raw.exceptionDetails) {
  bad(`页面里的探针抛了:${raw.exceptionDetails.text ?? JSON.stringify(raw.exceptionDetails)}`);
}
const data = raw.result?.value ? JSON.parse(raw.result.value) : null;

if (!data) {
  bad('探针没拿到数据');
} else {
  // 反向对照先过 —— 它红就说明量法本身坏了,这一趟的所有绿读数都不算数。
  const controlMax = Math.max(...data.control.deltas.map((d) => d.delta));
  if (controlMax > 0.5) {
    bad(
      `反向对照失效:一个不存在的字族「${data.control.family}」也量出了 ${controlMax.toFixed(2)}px 差分。`
      + '差分量法本身是坏的,这一趟别的读数一律不可信。',
    );
  } else ok(`反向对照成立:不存在的字族差分 ${controlMax.toFixed(2)}px(应为 0)`);

  for (const p of data.probes) {
    const minDelta = Math.min(...p.deltas.map((d) => d.delta));
    const detail = p.deltas.map((d) => `${d.sentinel} ${d.withFont.toFixed(1)} vs ${d.fallbackOnly.toFixed(1)}`).join(' / ');
    if (minDelta <= 0.5) {
      bad(
        `「${p.family}」(${p.style} ${p.weight})没生效:同一段文本带上它和不带它一样宽`
        + `(${detail})。页面是在拿回退面量读数。`,
      );
    } else ok(`「${p.family}」(${p.style} ${p.weight})生效,差分 ${minDelta.toFixed(1)}px(${detail})`);
  }

  for (const w of wanted) {
    const hit = data.faces.find((f) => f.family === w.family && f.style === w.style);
    if (!hit) bad(`FontFaceSet 里没有「${w.family}」(${w.style}) —— @font-face 根本没进页面`);
    else if (hit.status !== 'loaded') bad(`「${w.family}」(${w.style})状态是 ${hit.status},不是 loaded`);
    else ok(`FontFaceSet:「${w.family}」(${w.style} / ${hit.weight} / ${hit.display})已 loaded`);
  }

  const firstSans = expected.find((d) => d.style === 'normal' && d.family !== 'JiduMono Pro')?.family;
  if (firstSans && data.resolvedFirstSans !== firstSans) {
    bad(`--sans 的第一顺位是「${data.resolvedFirstSans}」,不是「${firstSans}」—— 声明和字体对不上`);
  } else ok(`--sans 第一顺位 = ${data.resolvedFirstSans},--mono 第一顺位 = ${data.resolvedFirstMono}`);

  // 横幅和字体必须口径一致:横幅还看得见 = 页面在告诉读者「我没上字体」。
  if (data.banner?.present && data.banner.display !== 'none') {
    bad(
      `页面顶部那条「还没上字体」的横幅还看得见(#${MISSING_MARK} display: ${data.banner.display})。`
      + '\n     页面自己在说没上字体 —— 先跑 node docs/design/chat-mirror/inline-fonts.mjs',
    );
  } else if (data.banner?.present) {
    ok(`「还没上字体」横幅已被注入块藏掉(#${MISSING_MARK} display: none)`);
  } else {
    notes.push(`  · 页面里没有 #${MISSING_MARK} 横幅(旧版陈列页,重新生成一次就会带上)`);
  }

  if (data.pageSample) ok(`页面样本 .cell .stage:${data.pageSample.fontSize} / ${data.pageSample.fontWeight} / lh ${data.pageSample.lineHeight} / ${data.pageSample.fontFamily}`);
}

console.log(`守卫:${PAGE}`);
console.log(notes.join('\n'));
if (fails.length) {
  console.error(`\n红 —— ${fails.length} 条判据没过:`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  console.error(
    '\n修法:node docs/design/chat-mirror/inline-fonts.mjs'
    + '\n(仓库里的陈列页**故意**不带字体;每次重新生成之后都要再跑一次这条,'
    + '\n 跑完 mirror-exec.html 会变脏 —— 那是本地产物,别提交)',
  );
  process.exit(1);
}
console.log('\n绿 —— 陈列页的读数是用产品真实字体量出来的。');
