/**
 * 从**真实运行时**逐格截图,给逐格对照页补上第三列。
 *
 * 为什么非要这一列(2026-08-25 的教训):
 * 陈列页是 `renderToStaticMarkup` 出来的静态 HTML,而且它给每一格**自己包了一层 `.root`**
 * —— 也就是接缝。所以那天应用里 `ChatRoot` 根本没挂、壳头「进行中」那句字是透明的,
 * 陈列页那一格却从头到尾都是好的。只对陈列页做验收,验的是「组件在理想宿主里长什么样」,
 * 不等于用户看到的样子。
 *
 * 做法:把陈列页每一格的**同一份夹具事件**种进 daemon(`PUT …/messages/:mid`),
 * 开真页面、等渲染完、只截那条 assistant 消息。种的是数据,走的是产品自己的整条渲染链路。
 *
 * 只覆盖「自带事件」那些格子;直接挂组件的(输入框、附件托盘、报错卡…)种不进去,
 * 由 `build-compare.mjs` 如实标「真运行时未覆盖」,不糊弄。
 *
 * 用法:
 *   LIVE_DAEMON=http://127.0.0.1:17610 LIVE_WEB=http://127.0.0.1:17611 \
 *   node docs/design/chat-mirror/shoot-live.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DIR = import.meta.dirname;
const DAEMON = process.env.LIVE_DAEMON ?? 'http://127.0.0.1:17610';
const WEB = process.env.LIVE_WEB ?? 'http://127.0.0.1:17611';
const PROJECT = process.env.LIVE_PROJECT ?? 'chat-verify';
const OUT = path.join(DIR, 'shots-live-cells');
const PORT = 9561;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cells = JSON.parse(fs.readFileSync(path.join(DIR, 'cells.json'), 'utf-8'))
  .filter((c) => c.kind === 'events' && Array.isArray(c.events) && c.events.length > 0);
console.log(`能种的格子:${cells.length}`);

async function api(method, url, body) {
  const r = await fetch(`${DAEMON}${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status} ${await r.text()}`);
  return r.json();
}

/** 每格一个会话,标题带编号,方便人回头在真客户端里自己点开看 */
async function seed(cell) {
  const { conversation } = await api('POST', `/api/projects/${PROJECT}/conversations`, {
    title: `#${cell.gid} ${cell.cmp} · ${cell.state}`.slice(0, 60),
  });
  const cid = conversation.id;
  const base = Date.now();
  await api('PUT', `/api/projects/${PROJECT}/conversations/${cid}/messages/u-${cell.gid}`, {
    role: 'user', content: `（第 ${cell.gid} 格夹具）`, createdAt: base,
  });
  await api('PUT', `/api/projects/${PROJECT}/conversations/${cid}/messages/a-${cell.gid}`, {
    role: 'assistant',
    content: '',
    events: cell.events,
    runStatus: cell.run ?? 'succeeded',
    agentId: 'claude',
    createdAt: base + 1,
    startedAt: base + 1,
    endedAt: base + 31_000,
  });
  return cid;
}

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/od-live-cells-${PORT}`,
  '--force-color-profile=srgb', '--window-size=900,1400', 'about:blank'], { stdio: 'ignore' });

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
const evaluate = async (expr) =>
  (await send('Runtime.evaluate', { returnByValue: true, expression: expr })).result.value;

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1400, deviceScaleFactor: 2, mobile: false });

fs.mkdirSync(OUT, { recursive: true });
const report = [];
for (const cell of cells) {
  let note = '';
  try {
    const cid = await seed(cell);
    await send('Page.navigate', { url: `${WEB}/projects/${PROJECT}/conversations/${cid}` });
    await sleep(Number(process.env.LIVE_WAIT ?? '9000'));
    // 把折叠的执行记录摊开:陈列页那边是摊开拍的,收着拍没法比
    await evaluate(`(() => {
      const last = [...document.querySelectorAll('[data-assistant-message-id]')].pop();
      for (const d of last?.querySelectorAll('details') ?? []) d.open = true;
      return true;
    })()`);
    await sleep(500);
    const box = JSON.parse(await evaluate(`(() => {
      const last = [...document.querySelectorAll('[data-assistant-message-id]')].pop();
      if (!last) return 'null';
      const r = last.getBoundingClientRect();
      return JSON.stringify({ x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height });
    })()`) ?? 'null');
    if (!box || !box.w) throw new Error('页面上找不到那条 assistant 消息');
    const shot = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: box.x - 6, y: box.y - 6, width: box.w + 12, height: Math.min(box.h + 12, 1400), scale: 2 },
    });
    const file = path.join(OUT, `cell-${String(cell.gid).padStart(2, '0')}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    note = `${Math.round(box.w)}×${Math.round(box.h)}`;
  } catch (err) {
    note = `失败:${String(err).slice(0, 80)}`;
  }
  report.push({ gid: cell.gid, note });
  console.log(`  #${String(cell.gid).padStart(2)} ${cell.cmp} — ${note}`);
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));

sock.close();
chrome.kill('SIGKILL');
