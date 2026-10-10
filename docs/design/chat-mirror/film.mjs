/**
 * 流式过程连拍 —— 自测录屏的替代物(OPEND-2205)。
 *
 * 为什么不是 GIF:仓库里没有编码器,而且一串带编号的 PNG 在代码评审里比 GIF 好用
 * (能逐帧引用、能 diff、不用播放器)。
 *
 * 它做的事:开真实页面 → 在输入框里打字 → 点发送 → 每隔一段时间拍一张,直到这一轮结束。
 * 驱动 Lexical 的顺序是有讲究的(先 focus 再把选区折到末尾,否则 React 认为输入框是空的),
 * 见 `specs/current/chat-panel-next.md` 里记的配方。
 *
 * 用法:
 *   node docs/design/chat-mirror/film.mjs
 * 环境:
 *   FILM_URL      会话页地址
 *   FILM_PROMPT   要发的内容
 *   FILM_FRAMES   拍几帧(默认 12)
 *   FILM_EVERY    每帧间隔毫秒(默认 1500)
 *
 * 拍之前先挑好 agent:回放同一份录音,不同 agent 落下来的事件粒度差很远
 * (claude 五十来个事件、有 thinking 有工具调用;grok 只有一整段文本),
 * 而要看的恰恰是流式形态。agent 取的是 app-config 里的默认值,所以先改它:
 *   curl -X PUT $DAEMON/api/app-config -H 'content-type: application/json' -d '{"agentId":"claude"}'
 * 不要改成走 `POST /api/runs` 起这一轮 —— 试过,页面不认:网页客户端只跟自己发起的 run,
 * 旁路起的 run 在这一页上根本不出现,拍到的全是空帧。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 9540;
const URL_ = process.env.FILM_URL ?? 'http://127.0.0.1:17611/';
const PROMPT = process.env.FILM_PROMPT ?? '把导出按钮做大一点,配色换暖一档';
const FRAMES = Number(process.env.FILM_FRAMES ?? '12');
const EVERY = Number(process.env.FILM_EVERY ?? '1500');
const OUT = path.join(import.meta.dirname, 'shots-film');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/od-film-${PORT}`,
  '--force-color-profile=srgb', '--window-size=900,1000', 'about:blank'], { stdio: 'ignore' });

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
/** 页面报的错、以及打回来的非 2xx —— 卡住的时候光看截图看不出来,所以一律打到终端 */
function trace(msg) {
  if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
    console.error('[页面]', msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    console.error('[异常]', msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  }
  if (msg.method === 'Network.responseReceived') {
    const { url, status } = msg.params.response;
    if (url.includes('/api/') && status >= 400) console.error('[接口]', status, url);
  }
  if (msg.method === 'Network.loadingFailed') {
    console.error('[断流]', msg.params.errorText, msg.params.type);
  }
}

sock.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (!msg.id) { trace(msg); return; }
  const slot = pending.get(msg.id);
  if (!slot) return;
  pending.delete(msg.id);
  msg.error ? slot.rej(new Error(msg.error.message)) : slot.res(msg.result);
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, { res, rej });
  sock.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { returnByValue: true, expression })).result.value;

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1000, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: URL_ });
await sleep(14000);

const bail = (why) => { console.error(why); sock.close(); chrome.kill('SIGKILL'); process.exit(1); };

// Lexical 只认真正的输入:先聚焦、把选区折到末尾,再插字。少这一步 React 会一直以为是空的。
const focused = await evaluate(`(() => {
  const el = document.querySelector('.composer-editable');
  if (!el) return false;
  el.focus();
  const sel = getSelection(), r = document.createRange();
  r.selectNodeContents(el); r.collapse(false);
  sel.removeAllRanges(); sel.addRange(r);
  return document.activeElement === el;
})()`);
if (!focused) bail('找不到输入框(页面没加载完?)');
await send('Input.insertText', { text: PROMPT });
await sleep(400);

fs.mkdirSync(OUT, { recursive: true });
const shoot = async (name) => {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(shot.data, 'base64'));
  console.log(name);
};
await shoot('00-typed.png');

const sent = await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || x.title || '') === '发送');
  if (!b || b.disabled) return false;
  b.click();
  return true;
})()`);
if (!sent) bail('发送键不可用 —— 输入没被 React 认到');

for (let i = 1; i <= FRAMES; i++) {
  await sleep(EVERY);
  await shoot(`${String(i).padStart(2, '0')}-run.png`);
  const state = await evaluate(`(() => {
    const last = [...document.querySelectorAll('[data-role="assistant"]')].pop();
    const shell = last?.querySelector('[class*="record"] summary')?.textContent ?? '';
    const status = last?.querySelector('[class*="turn-status"], [class*="runStatus"]')?.textContent ?? '';
    return JSON.stringify({ streaming: !!document.querySelector('[data-streaming="true"]'), shell: shell.trim(), status: status.trim() });
  })()`);
  console.log('   ', state);
  const done = await evaluate(`!document.querySelector('[data-streaming="true"]')`);
  if (done && i > 2) { console.log('这一轮结束了'); break; }
}
await shoot('99-final.png');
sock.close();
chrome.kill('SIGKILL');
