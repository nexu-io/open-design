// @vitest-environment jsdom
/**
 * 轮次边界 vs 轮次内部的间距**层级**。
 *
 * ── 用户在真机上指的是什么 ────────────────────────────────────────────
 * 一轮结束、下一轮开头的那一屏:
 *
 *     🅞 OpenDesign
 *     Done  1m 43s  ⌄            ← 执行记录壳(轮次内的第一块)
 *     ↕                          ← 用户说「这里大」
 *     已确认 / 三行问答            ← 同一轮里的正文块
 *     ↕                          ← 用户说「这里小」,而**这里才是两轮的分界**
 *     🅞 OpenDesign
 *     Working  45s  ⌃
 *
 * 几何上两处**完全相同**(真机 CDP 量到都是 14px)。所以「一大一小」本身是错觉:
 * 上面那 14px 挨着的是带 1.75 行高留白的正文,下面那 14px 挨着的是紧贴顶边的头像图标。
 * 但用户的判断是对的 —— **层级被压平了**:轮次边界和轮次内部用了同一个数,
 * 边界因此淹没在内容里。
 *
 * ── 稿子怎么说 ────────────────────────────────────────────────────
 * 权威稿 `docs/design/chat-panel-next.html`(修订 `1bbdce0b06`,
 * md5 `28ea4c6558d6158e88976e11283e269e`)的源件 `src/scene-shell.css` 写得很直白:
 *
 *     .flow { … gap: 12px; }
 *     /* 24 只留给「换人说话」,同一个人连着说的几块之间是 12。
 *        原来一律 24,结果 Thinking / 开场白 / 已确认 / 计划 / 记忆 / 步骤 这一串
 *        明明是同一轮里连着出来的,却被拆成六件互不相干的事。 *\/
 *     .flow > .msg-me:not(:first-child) { margin-top: 12px; }   /* 12 + 12 = 24 *\/
 *     .flow > .msg-me + *               { margin-top: 12px; }   /* 12 + 12 = 24 *\/
 *
 * 也就是:**轮次之间 24,轮次内部 12**。我们两处都做成了 14 —— 实现漏了这一层。
 *
 * ── 为什么必须在真 Chrome 里量 ──────────────────────────────────────
 * 这个接缝踩过的坑都不是 CSS 文本能照出来的:
 *  · 字节完全相同、特异性也相同的两条声明,胜负纯粹由 `index.css` 的 import 顺序定;
 *  · 元素换一层嵌套之后,后代选择器整条不再匹配,而 CSS 文本一个字没改。
 * 所以这一份把 `index.css` 的 34 张表**按导入顺序**全量内联,拿**真实组件渲染出来的
 * markup** 塞进去,在无头 Chrome 里量 `getBoundingClientRect` 的差值。
 *
 * ── 反向对照 ──────────────────────────────────────────────────────
 * 只断言「轮次间距是 24」是**假绿**:把所有间距一起改成 24 也能过,而那正是现在这个 bug
 * 的另一种形态。所以每条几何断言都成对出现:轮次间 X、轮次内 Y,且 X ≠ Y。
 */
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ChatMessage, PersistedAgentEvent } from '@open-design/contracts';

import { I18nProvider } from '../../../src/i18n';
import { AssistantMessage } from '../../../src/components/AssistantMessage';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../..');

/* ── 真实组件的 markup ──────────────────────────────────────────── */

function msg(id: string, events: PersistedAgentEvent[]): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: '',
    createdAt: 1_756_000_000_000,
    runStatus: 'succeeded',
    events,
  } as ChatMessage;
}

/**
 * 一轮里有**两块**:执行记录壳(done 之前的过程)+ 壳外的结论正文。
 * 这正是用户截图里「壳 → 已确认」那一档轮次内间距。
 */
const TURN: PersistedAgentEvent[] = [
  { kind: 'thinking', text: '先看一眼规格。' },
  { kind: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'tokens.css' }, startedAt: 0 },
  { kind: 'tool_result', toolUseId: 't1', content: 'ok', isError: false, completedAt: 400 },
  { kind: 'text', text: '<done/>栅格对得上,可以直接复刻。' },
];

function markupOf(node: ReactElement): string {
  const { container, unmount } = render(<I18nProvider initial="zh-CN">{node}</I18nProvider>);
  const html = container.innerHTML;
  unmount();
  return html;
}

/* ── 探针页 ─────────────────────────────────────────────────────── */

/** `index.css` 是纯导入表 —— 按它的**顺序**把 34 张表拼起来,层叠关系才和产线一致。 */
function inlineCascade(): string {
  const index = readFileSync(resolve(WEB, 'src/index.css'), 'utf-8');
  const parts: string[] = [];
  for (const m of index.matchAll(/@import\s+'([^']+)'/g)) {
    const file = resolve(WEB, 'src', m[1]!);
    parts.push(`/* ===== ${m[1]} ===== */\n${readFileSync(file, 'utf-8')}`);
  }
  expect(parts.length, 'index.css 里一条 @import 都没解析出来').toBeGreaterThan(20);
  return parts.join('\n');
}

const USER_MSG = '<div class="msg user"><div class="msg-stack"><div class="user-text">照这两张图复刻。</div></div></div>';

function probePage(css: string, cases: Record<string, string>): string {
  const sections = Object.entries(cases)
    .map(([name, inner]) => {
      // 「balanced:」前缀 = 这一格的流水打上配平态的类(内容不满一屏时整段贴底)
      const balanced = name.startsWith('balanced:');
      const cls = `chat-log${balanced ? ' is-balanced-transcript' : ''}`;
      const log = `<div class="${cls}" data-testid="chat-log">${inner}</div>`;
      // 「no-skin:」前缀 = 不套 `.app` 那层皮肤祖先,量的是**基底**那一档取值
      const skinned = name.startsWith('no-skin:') ? `<div class="app-less">${log}</div>` : `<div class="app">${log}</div>`;
      return `<section data-case="${name}">${skinned}</section>`;
    })
    .join('\n');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
${css}
/* 探针自己的壳:每一格给固定宽高,量的是**纵向差值**,溢出与否无关 */
section { width: 520px; height: 900px; display: flex; }
section .app, section .app-less { flex: 1; display: flex; flex-direction: column; min-height: 0; }
/* .msg 自带 200ms 的入场动画(translateY(6px) → 0)。带着 transform 量 rect
   会把动画的中间帧读成间距。这里只关动画,不动任何间距声明。 */
*, *::before, *::after { animation: none !important; transition: none !important; }
</style></head><body>${sections}</body></html>`;
}

/* ── 无头 Chrome(CDP)────────────────────────────────────────────
 * 本仓库不装 playwright(AGENTS.md / 本机磁盘约束),所以直接开系统 Chrome 的
 * remote debugging,用法照 `docs/design/chat-mirror/measure.mjs`。
 *
 * ⚠️ CDP 那一截**必须**跑在子进程的纯 node 里,不能留在这一份的 jsdom 里:
 * jsdom 给的 `WebSocket` 连不上 devtools 的 ws 端点,`open` 事件永远不来
 * (实测挂满 90s 的 hook 超时)。而 markup 又只能在 jsdom 里由真实组件渲染出来。
 * 两边各用各的运行时,中间用一个临时 html 文件和一行 JSON 交接。
 */
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p)) ?? null;

const MEASURE_IN_CHROME = `
import { spawn } from 'node:child_process';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = Number(process.env.GAP_PORT);
const chrome = spawn(process.env.GAP_CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-color-profile=srgb', '--window-size=1200,1000',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + process.env.GAP_PROFILE, 'about:blank',
], { stdio: 'ignore' });
let url = null;
for (let i = 0; i < 80 && !url; i += 1) {
  try {
    const list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
    url = list.find((x) => x.type === 'page')?.webSocketDebuggerUrl ?? null;
  } catch {}
  if (!url) await sleep(250);
}
if (!url) { chrome.kill('SIGKILL'); throw new Error('headless chrome did not come up'); }
const sock = new WebSocket(url);
await new Promise((r) => sock.addEventListener('open', r));
let seq = 0;
const pending = new Map();
let loaded = null;
sock.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Page.loadEventFired' && loaded) { loaded(); loaded = null; }
  const slot = m.id != null ? pending.get(m.id) : undefined;
  if (!slot) return;
  pending.delete(m.id);
  m.error ? slot.rej(new Error(m.error.message)) : slot.res(m.result);
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, { res, rej });
  sock.send(JSON.stringify({ id, method, params }));
});
await send('Page.enable');
await send('Runtime.enable');
const onLoad = new Promise((r) => { loaded = r; });
await send('Page.navigate', { url: 'file://' + process.env.GAP_FILE });
await onLoad;
await sleep(150);
const out = await send('Runtime.evaluate', { expression: process.env.GAP_EXPR, returnByValue: true });
sock.close();
chrome.kill('SIGKILL');
if (out.exceptionDetails) { process.stderr.write(JSON.stringify(out.exceptionDetails)); process.exit(3); }
process.stdout.write('GAP_JSON:' + out.result.value);
`;

function measureInChrome(file: string, expression: string): Record<string, CaseGeometry> {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', MEASURE_IN_CHROME], {
    encoding: 'utf-8',
    timeout: 120_000,
    env: {
      ...process.env,
      GAP_CHROME: CHROME!,
      GAP_FILE: file,
      GAP_EXPR: expression,
      GAP_PORT: String(9550 + (process.pid % 90)),
      GAP_PROFILE: mkdtempSync(join(tmpdir(), 'gap-chrome-')),
    },
  });
  const marker = (run.stdout ?? '').indexOf('GAP_JSON:');
  if (marker === -1) {
    throw new Error(`Chrome 量不到几何:\nstdout=${run.stdout}\nstderr=${run.stderr}`);
  }
  return JSON.parse(run.stdout.slice(marker + 'GAP_JSON:'.length));
}

/* ── 探针表达式 ─────────────────────────────────────────────────── */

/**
 * 两个相邻块之间的**净间距** = 后者的 top − 前者的 bottom。
 * 用 rect 而不是读 `gap` 的计算值:`gap` 只说容器怎么发缝,说不清 margin、
 * 绝对定位的虚拟行、以及「这条规则到底有没有被别人压掉」。
 */
const PROBE = `(() => {
  /*
   * 「墨迹」而不是「盒子」。
   *
   * 用户说「上面那边大、下面那边小」时两处盒距完全相同(都是 14px),差别全在
   * **盒子里第一 / 最后一块被画出来的东西离盒边多远**:
   *  · 正文那一侧带 1.75 行高,首行字形上面白白多出半个行距;
   *  · 头像那一侧图标紧贴顶边,一点都不多。
   * 所以同样的 14px,一处读起来近 20、一处就是 14。
   * 这一段把那半个行距算进去,量的是**看得见的**距离。
   */
  const half = (el) => {
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize);
    const fs = parseFloat(cs.fontSize);
    return Math.max(0, (lh - fs) / 2);
  };
  const edge = (el, wantTop) => {
    const box = el.getBoundingClientRect();
    // 墨迹永远在自己的盒子里。收起的 <details> 里那截 body 仍旧会报出一个
    // 盒子(Chrome 用 content-visibility 藏它,rect 不归零),不夹一下就会把
    // 「壳的底边」读成几百像素以下 —— 实测量出过 -506.7 的负间距。
    const clamp = (v) => Math.min(Math.max(v, box.top), box.bottom);
    const kids = [...el.childNodes].filter((n) =>
      (n.nodeType === 3 && n.textContent.trim()) ||
      (n.nodeType === 1 && n.getBoundingClientRect().height > 0));
    const pick = wantTop ? kids[0] : kids[kids.length - 1];
    if (!pick) return wantTop ? box.top : box.bottom;
    if (pick.nodeType === 3) return clamp(wantTop ? box.top + half(el) : box.bottom - half(el));
    return clamp(edge(pick, wantTop));
  };
  const inkBetween = (a, b) => {
    if (!a || !b) return null;
    return Math.round((edge(b, true) - edge(a, false)) * 10) / 10;
  };
  const q = (sel) => document.querySelector(sel);
  const between = (a, b) => {
    if (!a || !b) return null;
    return Math.round((b.getBoundingClientRect().top - a.getBoundingClientRect().bottom) * 100) / 100;
  };
  const out = {};
  for (const section of document.querySelectorAll('section[data-case]')) {
    const name = section.getAttribute('data-case');
    const msgs = [...section.querySelectorAll(':scope .chat-log > .msg, :scope .chat-virtual-row > .msg')];
    const log = section.querySelector('.chat-log');
    const flow = section.querySelector('.assistant-flow');
    const flowKids = flow ? [...flow.children] : [];
    out[name] = {
      fromLogTop: (log && msgs[0])
        ? Math.round((msgs[0].getBoundingClientRect().top - log.getBoundingClientRect().top) * 100) / 100
        : null,
      betweenMessages: between(msgs[0], msgs[1]),
      withinTurn: between(flowKids[0], flowKids[1]),
      inkBetweenMessages: inkBetween(msgs[0], msgs[1]),
      inkWithinTurn: inkBetween(flowKids[0], flowKids[1]),
      messageCount: msgs.length,
      flowKidCount: flowKids.length,
      /* 光学补偿那一半的原始数据:块与块之间的**墨迹**距离(第一行文字的
         实际字形顶,而不是行盒顶),头像那一侧图标紧贴顶边所以两者相等。 */
      flowDisplay: flow ? getComputedStyle(flow).display : null,
    };
  }
  return JSON.stringify(out);
})()`;

interface CaseGeometry {
  fromLogTop: number | null;
  betweenMessages: number | null;
  withinTurn: number | null;
  inkBetweenMessages: number | null;
  inkWithinTurn: number | null;
  messageCount: number;
  flowKidCount: number;
  flowDisplay: string | null;
}

let geometry: Record<string, CaseGeometry>;

const canRun = CHROME !== null;
if (!canRun && process.env.OD_REQUIRE_CHROME === '1') {
  throw new Error(`OD_REQUIRE_CHROME=1 但找不到 Chrome:${CHROME_CANDIDATES.join(' / ')}`);
}

describe.skipIf(!canRun)('轮次边界 · 真 Chrome 几何', () => {
  beforeAll(() => {
    const css = inlineCascade();

    // 一轮 = 壳 + 壳外结论;两轮各自带头像行(`showRole` 默认 true)
    const turnA = markupOf(<AssistantMessage message={msg('m1', TURN)} streaming={false} />);
    const turnB = markupOf(<AssistantMessage message={msg('m2', TURN)} streaming={false} />);
    // 接上一条、不再报名字的续写块 —— 同一个人在说话,不是新的一轮
    const cont = markupOf(<AssistantMessage message={msg('m3', TURN)} streaming={false} showRole={false} />);

    expect(turnA, '真实组件没吐出头像行').toContain('data-testid="assistant-role"');
    expect(cont, '续写块没打上 assistant-continuation').toContain('assistant-continuation');
    expect(turnA, '真实组件没吐出 assistant-flow').toContain('data-testid="assistant-flow"');

    const page = probePage(css, {
      // ① 用户截图里那一处:agent 说完一轮 → 下一轮开头(中间那条表单答案消息
      //    被 `buildChatRenderItems` 收走了,所以 DOM 里是 assistant 紧挨 assistant)
      'assistant-to-assistant': turnA + turnB,
      // ② 换人说话的另一半:用户气泡 → agent 开口
      'user-to-assistant': USER_MSG + turnA,
      // ③ 同一个人连着说 —— 这一档**不该**被撑成轮次边界
      'assistant-continuation': turnA + cont,
      // ④ 虚拟化那条路(> 80 条消息):行是绝对定位的,flex gap 完全不生效,
      //    行距只由 `.chat-virtual-row` 自己的 padding 给。两条路必须算出同一个数。
      // ⑤ / ⑥ 配平态:内容不满一屏时整段贴底,靠首条消息的 margin-top:auto。
      //    轮次边界那条规则的特异性压得过它,所以必须有一格钉住「auto 还在」。
      'balanced:short': turnA,
      // ⑦ 基底那一档:`.assistant-flow` 的 gap 在 `code.css` 里也必须是 12。
      //    皮肤层(`.app …`)现在压着它,所以只有把皮肤祖先摘掉才照得出这个取值 ——
      //    两处写不一样的话,哪天皮肤那条被删掉就会静悄悄退回 14。
      'no-skin:base': turnA,
      'unbalanced:short': turnA,
      'virtualized': `<div class="chat-virtual-spacer"><div class="chat-virtual-row" style="position:relative">${turnA}</div><div class="chat-virtual-row" style="position:relative">${turnB}</div></div>`,
    });

    const file = join(mkdtempSync(join(tmpdir(), 'gap-probe-')), 'probe.html');
    writeFileSync(file, page, 'utf-8');
    geometry = measureInChrome(file, PROBE);
  }, 150_000);

  afterEach(() => cleanup());

  it('探针自己站得住:每格都量到了该量的东西', () => {
    for (const [name, g] of Object.entries(geometry)) {
      expect(g.flowDisplay, `${name}:.assistant-flow 不是 flex,层叠被谁压掉了`).toBe('flex');
      expect(g.flowKidCount, `${name}:一轮里没有两块可比`).toBeGreaterThanOrEqual(2);
      // 配平那两格刻意只放一条消息(要量的是「首条离顶多远」),其余每格都得有两条
      if (name === 'no-skin:base') {
        expect(g.withinTurn, 'no-skin:base:没量到轮次内部那一档').not.toBeNull();
        continue;
      }
      if (name.endsWith(':short')) {
        expect(g.fromLogTop, `${name}:没量到首条相对流水顶的位置`).not.toBeNull();
        continue;
      }
      expect(g.betweenMessages, `${name}:没量到相邻两条消息`).not.toBeNull();
    }
  });

  it('轮次内部 = 12px(稿子 `.flow` 的 gap)', () => {
    expect(geometry['assistant-to-assistant']!.withinTurn).toBe(12);
  });

  it('轮次之间 = 24px,且**严格大于**轮次内部', () => {
    const g = geometry['assistant-to-assistant']!;
    expect(g.betweenMessages, 'agent 说完一轮到下一轮开头').toBe(24);
    // 反向对照:少了这一条,「全都改成 24」也能绿 —— 那正是现在这个 bug 的镜像
    expect(g.betweenMessages!, '层级被压平了:边界和轮次内部一样大').toBeGreaterThan(g.withinTurn!);
    expect(g.betweenMessages).toBe(g.withinTurn! * 2);
  });

  it('换人说话的另一半:用户气泡 → agent 也是 24px', () => {
    const g = geometry['user-to-assistant']!;
    expect(g.betweenMessages).toBe(24);
    expect(g.betweenMessages!).toBeGreaterThan(g.withinTurn!);
  });

  it('同一个人连着说 = 12px —— 续写块不该被撑成轮次边界', () => {
    const g = geometry['assistant-continuation']!;
    expect(g.betweenMessages, '续写被当成了新的一轮').toBe(12);
    expect(g.betweenMessages).toBe(g.withinTurn);
    // 反向对照:和真正的轮次边界必须不同
    expect(g.betweenMessages!).toBeLessThan(geometry['assistant-to-assistant']!.betweenMessages!);
  });

  it('看得见的距离也分得开 —— 光学上轮次边界仍旧比轮次内部宽', () => {
    const g = geometry['assistant-to-assistant']!;
    /*
     * 这一条才是用户真正在看的东西。盒距对了不代表读起来对:
     * 头像那一侧图标紧贴顶边、正文那一侧带半个行距,同一个数会被读成一大一小。
     * 断言的是**墨迹到墨迹**的距离,不是 gap 的取值 —— 少了它,
     * 「数值改对了、看起来还是平的」照样能全绿。
     */
    /*
     * 真 Chrome 实测(本文件的 assistant-to-assistant 那一格):
     *   修复前 12/24 还没分档时   轮次内 18.5px   轮次间 18.5px   ← 完全一样
     *   修复后                   轮次内 16.5px   轮次间 28.6px   ← 1.73 倍
     * 也就是说 12/24 这一刀本身就把光学差距拉开了,**不需要**再给头像那一侧
     * 单独补一档「光学补偿」—— 那会是偏离稿子的自创数值。
     */
    expect(g.inkBetweenMessages!, '光学上边界仍旧不比轮次内部宽,层级读不出来')
      .toBeGreaterThan(g.inkWithinTurn!);
  });

  it('基底那一档也是 12 —— 摘掉 `.app` 皮肤祖先照出 `code.css` 里的取值', () => {
    expect(geometry['no-skin:base']!.withinTurn).toBe(12);
  });

  it('配平态没被轮次边界那条规则压掉 —— 内容不满一屏时整段仍旧贴底', () => {
    const balanced = geometry['balanced:short']!;
    const plain = geometry['unbalanced:short']!;
    // 反向对照:同样的内容,不配平时首条贴着流水顶(只隔着 padding),
    // 配平时被 margin-top:auto 推到底 —— 两者必须差出一大截。
    expect(plain.fromLogTop, '不配平时首条应当贴顶').toBeLessThan(30);
    expect(balanced.fromLogTop!, '配平态失效:首条没有被推到底').toBeGreaterThan(
      plain.fromLogTop! + 200,
    );
  });

  it('虚拟化那条路算出同一个 24 —— 行是绝对定位的,gap 在那儿不生效', () => {
    const g = geometry['virtualized']!;
    expect(g.betweenMessages, '虚拟行之间的距离和非虚拟化那条路对不上').toBe(24);
    expect(g.betweenMessages!).toBeGreaterThan(g.withinTurn!);
  });
});
