/**
 * 逐格量「计算样式指纹」,给对照页附上一条**不靠眼看**的差异摘要。
 *
 * 为什么要它:2026-08-25 撞过一次 —— 交付稿和我们的 CSS **规则文本一模一样**,
 * 但少写了一个祖先,特异性从 (0,3,0) 掉到 (0,2,0),层叠反转,壳内失败行铺出整行红底。
 * 光贴图要人眼盯,光 diff CSS 文本完全照不出来。只有把两边**渲染出来**再量
 * `getComputedStyle` 才露馅。
 *
 * 指纹刻意不含文案(两边文案本来就不同,比了全是噪音),只留三样能判「长得一不一样」的:
 *   · 底色    非透明、非纯白的背景色集合
 *   · 边框    非 none 的边框集合
 *   · 字      字号 / 字重 / 颜色 的组合集合
 *
 * 用法(docs/design 下要有静态服):
 *   node docs/design/chat-mirror/measure.mjs > docs/design/chat-mirror/measure.json
 */
import { spawn } from 'node:child_process';

const PORT = 9551;
const BASE = process.env.MEASURE_BASE ?? 'http://127.0.0.1:17699';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/od-measure-${PORT}`,
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

/**
 * `inner` 是「格子里哪一层才是纯组件」。我们的陈列页每格是
 * `.cell > header + .stage > 组件` —— 不剥掉外框就会把陈列页自己的虚线边、
 * 灰标签、卡底一起量进去,84 格全都「有差异」,全是噪音。
 */
const PROBE = (selector, inner) => `JSON.stringify([...document.querySelectorAll(${JSON.stringify(selector)})].map((raw) => {
  const cell = ${inner ? `raw.querySelector(${JSON.stringify(inner)}) ?? raw` : 'raw'};
  const bg = new Set(), bd = new Set(), tx = new Set();
  const blank = new Set(['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)', 'transparent']);
  for (const el of [cell, ...cell.querySelectorAll('*')]) {
    const cs = getComputedStyle(el);
    if (!blank.has(cs.backgroundColor)) bg.add(cs.backgroundColor + ' r' + parseFloat(cs.borderTopLeftRadius));
    if (cs.borderTopStyle !== 'none' && parseFloat(cs.borderTopWidth) > 0) {
      bd.add(cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor);
    }
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own) tx.add(Math.round(parseFloat(cs.fontSize)) + '/' + cs.fontWeight + '/' + cs.color);
  }
  return { bg: [...bg].sort(), bd: [...bd].sort(), tx: [...tx].sort() };
}))`;

async function measure(url, selector, inner) {
  await send('Page.navigate', { url });
  await sleep(Number(process.env.MEASURE_WAIT ?? '3000'));
  const out = await send('Runtime.evaluate', { returnByValue: true, expression: PROBE(selector, inner) });
  return JSON.parse(out.result.value);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 980, height: 1200, deviceScaleFactor: 2, mobile: false });

const design = await measure(`${BASE}/chat-matrix/matrix-82.html`, '.ent-b');
const ours = await measure(`${BASE}/chat-mirror/mirror-exec.html`, '.cell', '.stage');

const diff = (a = [], b = []) => ({
  onlyDesign: a.filter((x) => !b.includes(x)),
  onlyOurs: b.filter((x) => !a.includes(x)),
});

const rows = [];
for (let i = 0; i < Math.max(design.length, ours.length); i += 1) {
  const d = design[i] ?? { bg: [], bd: [], tx: [] };
  const o = ours[i] ?? { bg: [], bd: [], tx: [] };
  rows.push({ no: i + 1, bg: diff(d.bg, o.bg), bd: diff(d.bd, o.bd), tx: diff(d.tx, o.tx) });
}
console.log(JSON.stringify({ designCells: design.length, ourCells: ours.length, rows }, null, 1));

sock.close();
chrome.kill('SIGKILL');
