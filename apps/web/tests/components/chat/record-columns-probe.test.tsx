// @vitest-environment jsdom
/**
 * 执行记录壳的**量尺** —— 把真组件渲染成一张自包含 HTML,供真 Chrome 量
 * `getBoundingClientRect()` / `getComputedStyle`。
 *
 * 为什么必须有它:这一块的不变式全是**几何**(顶层 / 抽屉两套列、链的中轴、
 * 思考两态之间左缘不跳),而 jsdom 既不做层叠也不做布局 —— 只 diff CSS 文本
 * 照不出「少写一个祖先导致层叠反转」这类事故(`chat-panel-feedback.md` §F-15/§F-18
 * 里逐条记着,已经踩过五次)。
 *
 * 平时它当一条烟雾测试跑(四种场景真的渲染出了东西);要量的时候给它一个落点:
 *   OD_WRITE_RAIL=/abs/path/probe.html pnpm --filter @open-design/web exec \
 *     vitest run -c vitest.config.ts tests/components/chat/record-columns-probe.test.tsx
 * 然后用无头 Chrome 的 CDP 打开那张页面读坐标 —— 做法照
 * `docs/design/chat-mirror/measure.mjs`(本仓库不装 playwright)。
 *
 * 落点**由命令给,不写在这里**:合并闸的 web 车道会跑这个文件,而 `docs/` 是
 * certain-exempt 面,源码里出现那条路径会让一次纯文档改动影响一条本该跳过的车道。
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import type { ExecutionShell as Shell, ShellItem } from '../../../src/runtime/chat/contract';

const WEB = resolve(__dirname, '../../..');
const read = (p: string): string => readFileSync(resolve(WEB, p), 'utf-8');
const dehash = (html: string): string => html.replace(/\b_([A-Za-z0-9]+)_[a-z0-9]{5,8}\b/g, '$1');

const think = (text: string): ShellItem => ({ kind: 'text', text, thinking: true } as ShellItem);
const say = (text: string): ShellItem => ({ kind: 'text', text, thinking: false } as ShellItem);
const readRow = (id: string): ShellItem => ({
  kind: 'tool', id, tool: 'read', title: `读取 ${id}`, name: 'Read', rawTitle: false,
  file: { path: id, label: id }, delta: null, hits: null, pattern: null, elapsedMs: 400,
  failed: false, failReason: null, command: null, terminal: null,
} as unknown as ShellItem);
const cmdRow = (id: string, title: string): ShellItem => ({
  kind: 'tool', id, tool: 'bash', title, name: 'Bash', rawTitle: false,
  file: null, delta: null, hits: null, pattern: null, elapsedMs: 400,
  failed: false, failReason: null, command: 'ls -la /Users/x/.od/projects/y',
  terminal: 'total 0\ndrwxr-xr-x@ 3 elian staff 96 Aug 27 18:29 .',
} as unknown as ShellItem);

function shellOf(items: ShellItem[], over: Partial<Shell> = {}): Shell {
  return {
    kind: 'shell', seq: 0, status: 'succeeded', items, segments: [],
    thinking: false, stopped: false, elapsedMs: 130_000, quietMs: null, ...over,
  } as Shell;
}
const todoSeg = (content: string, status: string, items: ShellItem[]): ShellItem => ({
  kind: 'todo',
  segment: { content, status, recalled: false, abandoned: false, implicit: false, items, elapsedMs: null },
} as unknown as ShellItem);

/** 截图那一幕:开场白 → 思考 → 命令步骤 → 思考 → 命令步骤 → 工具行 → 夹心正文 → 工具行 */
const SCENE = shellOf([
  say('这一屏先摸清工作区结构。'),
  think('先看看目录里都有什么。'),
  cmdRow('c1', 'List project workspace'),
  think('计划(5 步):1) 锁定羊皮纸 token 与 Charter 字体栈;2) …'),
  cmdRow('c2', 'Write the parchment one-pager'),
  readRow('a.png'),
  say('夹在两条步骤中间的一句小结。'),
  readRow('b.png'),
]);

/** 有清单的壳:抽屉里也放一格思考 + 一条工具行 */
const NESTED = shellOf([
  say('开场白贴左。'),
  todoSeg('复刻商品列表页', 'in_progress', [
    readRow('c.png'),
    think('抽屉里的推理。'),
    cmdRow('c3', 'Nested command'),
  ]),
]);

/** 有清单的壳:两条抽屉夹一段顶层正文(裁决:有清单时顶层正文贴左、不接线) */
const TODO_SANDWICH = shellOf([
  say('开场白贴左。'),
  todoSeg('复刻商品列表页', 'completed', [readRow('f.png')]),
  say('夹在两条清单中间的一句。'),
  todoSeg('抽出商品卡', 'in_progress', [readRow('g.png')]),
]);

/** 思考中(live)那一态 */
const LIVE = shellOf([readRow('d.png'), think('还在想的推理。')], { status: 'running', thinking: true });
const LIVE_NESTED = shellOf(
  [todoSeg('复刻商品列表页', 'in_progress', [readRow('e.png'), think('抽屉里还在想。')])],
  { status: 'running', thinking: true },
);

const cell = (id: string, shell: Shell): string => `<section class="cell" id="${id}"><h3>${id}</h3><div class="app"><div class="root" data-chat-root="">${
  dehash(renderToStaticMarkup(<I18nProvider initial="zh-CN"><ExecutionShell shell={shell} /></I18nProvider>))
}</div></div></section>`;

describe('执行记录壳的量尺', () => {
  it('四种场景都渲染得出来(没有落点时只跑这一半)', () => {
    for (const shell of [SCENE, NESTED, TODO_SANDWICH, LIVE, LIVE_NESTED]) {
      const html = renderToStaticMarkup(
        <I18nProvider initial="zh-CN"><ExecutionShell shell={shell} /></I18nProvider>,
      );
      expect(html).toContain('flat');           // 壳渲染出来了
      expect(html.length).toBeGreaterThan(200);
    }
  });

  it('写页面(给了 OD_WRITE_RAIL 落点时)', () => {
    const out = process.env.OD_WRITE_RAIL;
    if (!out) { expect(true).toBe(true); return; }
    const baseVars = /:root\s*\{([\s\S]*?)\}/.exec(read('src/styles/base.css'))?.[1] ?? '';
    const page = `<!doctype html><html lang="zh-CN" data-theme="light"><head><meta charset="utf-8">
<style>${read('src/styles/tokens.css')}</style>
<style>:root{${baseVars}}</style>
<style>${dehash(read('src/components/chat/ChatRoot.module.css'))}</style>
<style>${dehash(read('src/components/chat/primitives/record.module.css'))}</style>
<style>body{margin:0;padding:16px;background:#fff;font:13px/1.7 -apple-system,system-ui,sans-serif}
.cell{width:760px;margin:0 0 32px;padding:12px;border:1px dashed #ddd}
h3{font:11px/1 monospace;color:#999;margin:0 0 8px}</style>
</head><body>
${cell('scene', SCENE)}
${cell('nested', NESTED)}
${cell('todo-sandwich', TODO_SANDWICH)}
${cell('live', LIVE)}
${cell('live-nested', LIVE_NESTED)}
</body></html>`;
    writeFileSync(out, page, 'utf-8');
    expect(page.length).toBeGreaterThan(1000);
  });
});
