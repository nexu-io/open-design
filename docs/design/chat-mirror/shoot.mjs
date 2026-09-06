/**
 * 给镜像陈列页逐格拍照,供设计逐格比对。
 *
 * 用法(先起个静态服:`python3 -m http.server 8791 --bind 127.0.0.1` 在 docs/design 下):
 *   node docs/design/chat-mirror/shoot.mjs
 * 产出:docs/design/chat-mirror/shots/cell-01.png … cell-11.png 与 full.png
 *
 * 走无头 Chrome 的 CDP,和 chat-panel-diagrams/shoot.mjs 同一套做法;
 * 不装 playwright(本机装过一次把磁盘写穿)。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 9512;
const PAGE = process.env.MIRROR_URL ?? 'http://127.0.0.1:8791/chat-mirror/mirror-exec.html';
/** 拍哪些元素。默认拍我们自己的格子;拍设计稿那边时传 `#c1 .ent-b, #c2 .ent-b …` 那种选择器 */
const PICK = process.env.MIRROR_PICK ?? '.cell';
const OUT = path.join(import.meta.dirname, process.env.MIRROR_OUT ?? 'shots');
/** 只拍前 N 个(设计稿那页有 84 格,我们只对前 27 格) */
const LIMIT = Number(process.env.MIRROR_LIMIT ?? '0');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/od-mirror-shot-${PORT}`,
  '--force-color-profile=srgb', '--window-size=980,1200', 'about:blank'], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((x) => x.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* chrome 还没起来 */ }
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
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, { res, rej });
  sock.send(JSON.stringify({ id, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');
// 关缓存:user-data-dir 是常驻的,不关的话重新生成过的页面拍出来还是上一版
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 980, height: 1200, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: PAGE });
await sleep(Number(process.env.MIRROR_WAIT ?? '1500'));

const boxes = JSON.parse((await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `JSON.stringify([...document.querySelectorAll(${JSON.stringify(PICK)})]${LIMIT ? `.slice(0, ${LIMIT})` : ''}.map((el, i) => {
    const r = el.getBoundingClientRect();
    return { i: i + 1, x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height };
  }))`,
})).result.value);

/*
 * 逐格拍照的取景方式。
 *
 * 踩过两次:
 *  1. `captureBeyondViewport: true` 去够视口外的内容 —— headless 会把没光栅化的
 *     合成层原样吐出来,拍出来是一大块灰盖住半个格子(第 2 格中过)。
 *  2. 把视口一次撑到整页高(几万像素)—— 表面太大直接爆掉,整格全灰。
 * 现在的做法:**每格单独把视口调到这一格的高度,把它滚进视口,再按普通截屏拍**。
 * 每一格都在视口内,不依赖 captureBeyondViewport,也不会有超大表面。
 */
fs.mkdirSync(OUT, { recursive: true });
for (const box of boxes) {
  const viewH = Math.min(Math.ceil(box.h) + 40, 4000);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 980, height: Math.max(viewH, 200), deviceScaleFactor: 2, mobile: false,
  });
  // 视口一变,布局会跟着重排,所以滚动之后**重新量**一次这一格的位置
  const rect = JSON.parse((await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `JSON.stringify((() => {
      const el = document.querySelectorAll(${JSON.stringify(PICK)})[${box.i - 1}];
      el.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -20);
      const r = el.getBoundingClientRect();
      // clip 用的是**页面坐标**(从文档原点算),不是视口坐标 —— 少加 scroll 就会拍到空白
      return { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height };
    })())`,
  })).result.value);
  await sleep(80);
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: rect.x - 6, y: rect.y - 6, width: rect.w + 12, height: rect.h + 12, scale: 2 },
  });
  const file = path.join(OUT, `cell-${String(box.i).padStart(2, '0')}.png`);
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(path.basename(file), `${Math.round(box.w)}×${Math.round(box.h)}`);
}
if (!process.env.MIRROR_NO_FULL) {
  const full = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(OUT, 'full.png'), Buffer.from(full.data, 'base64'));
  console.log('full.png');
}

sock.close();
chrome.kill('SIGKILL');
