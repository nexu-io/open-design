// @vitest-environment jsdom
/**
 * OPEND-2643:思考过程持续输出时,右侧滚动条画在正文上,最右边几个字读不出来。
 *
 * ── 这块到底是什么 ──────────────────────────────────────────────────
 * 思考那一格是 `ExecutionShell` 的 `ThoughtsRow`,两态都传 `scroll`,限高走
 * `record.module.css` 的 `.fold .body.scroll`(`max-height: 96px; overflow-y: auto`)。
 * 注意它**不是** `.chat-log` 那一档 —— `.chat-log` 是 `scrollbar-width: none`
 * 把滚动条整个藏起来;这里的滚动条是要露出来的(用户 2026-08-27:
 * 「thought 展开应该有个最高高度, 可以滚动」),所以只能给它让位,不能藏。
 *
 * ── 根因:让位那句话从来没生效过 ────────────────────────────────────
 * `.fold .body.scroll` 里写着 `padding-inline-end: 4px`,注释说「越界的字贴着
 * 滚动条,留一点气口」。但那条规则是 (0,3,0),而灰底容器那两条
 *   `.fold[open] > summary + .body.stream`            (0,4,0)
 *   `.fold.thoughts[open] > summary + .body.stack`    (0,5,0)
 * 写的是 `padding: var(--stream-pad)` —— **简写,四边全给**。逻辑长手和物理简写
 * 按同一份层叠算,于是 4px 那句整条落空,右边留的是容器自己那 8px。
 * 本文件第一节把这件事量出来钉住(它是「现状」,不是「预期」)。
 *
 * ── 8px 为什么还是不够 ──────────────────────────────────────────────
 * Chromium 在 macOS 默认是**覆盖式(overlay)滚动条**:它不占布局,直接画在
 * padding box 的右缘上,悬停 / 拖动时还会变宽。正文的右边缘就在那 8px 之内,
 * 于是「滚动条盖住正文」——工单截的正是这一帧。
 * 而 `scrollbar-gutter: stable` 对覆盖式滚动条**是空转的**(规范:覆盖式滚动条
 * 宽度为 0,gutter 也就是 0)。所以两件事要一起做:
 *   1. `::-webkit-scrollbar` 声明一个显式宽度 —— Chromium 一旦看到它,这只盒子
 *      就退出覆盖式,滚动条变成占布局的经典滚动条,再也压不到字上;
 *   2. `scrollbar-gutter: stable` —— 车道**一直**留着,内容持续追加、滚动条中途
 *      冒出来时正文不会横跳一下(工单里「内容持续追加」那半)。
 * 这一对是仓库既有的写法(`styles/home/entry-layout.css` 的
 * `.onboarding-view__select-options`),不是新拍的。
 *
 * ── 这份用例能证明什么、不能证明什么 ────────────────────────────────
 * **能**:哪条规则在这只盒子上赢了(量的是层叠,不是布局)——`padding-right`
 * 的实际胜出值、`scrollbar-gutter` 的实际胜出值、以及 `::-webkit-scrollbar`
 * 那条规则确实指着 DOM 上真实存在的那个类。
 * **不能**:jsdom 不做布局(`scrollHeight` / `clientHeight` 恒 0),更没有滚动条
 * 实体。「字和滚动条不再重叠」这件事**只有真机(打包版 / 真 Chrome)能确认**,
 * 而且要分别看 macOS 覆盖式和「始终显示滚动条」两种系统设置。
 *
 * 量尺是共享的 `tests/helpers/chat-mirror-cascade.ts`(只读)。
 */
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import type { ExecutionShell as Shell, ShellItem } from '../../../src/runtime/chat/contract';
import recordStyles from '../../../src/components/chat/primitives/record.module.css';
import chatRootStyles from '../../../src/components/chat/ChatRoot.module.css';
import thinkingStyles from '../../../src/components/chat/ThinkingMarkdown.module.css';
import { createResolver, hashed, parseRules, stripComments } from '../../helpers/chat-mirror-cascade';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../../src');
const read = (p: string): string => readFileSync(resolve(SRC, p), 'utf-8');

const NUL = String.fromCharCode(0);

/** `:global(X)` 摘出来再填回去 —— 哈希过的 `:global(...)` jsdom 认不出来。 */
function scopeModule(css: string, mod: unknown): string {
  const globals: string[] = [];
  const stashed = css.replace(/:global\(([^()]*)\)/g, (_m, inner: string) => {
    globals.push(inner.trim());
    return `${NUL}${globals.length - 1}${NUL}`;
  });
  return hashed(stashed, mod as Record<string, string>)
    .replace(new RegExp(`${NUL}(\\d+)${NUL}`, 'g'), (_m, i: string) => globals[Number(i)] ?? '');
}

/** 产品 `index.css` 的导入顺序**就是**层叠顺序 —— 不能手抄。 */
function globalSheets(): string[] {
  const index = read('index.css');
  return [...index.matchAll(/@import\s+'([^']+)'/g)]
    .map((m) => resolve(SRC, m[1] ?? ''))
    .flatMap((file) => {
      try { return [readFileSync(file, 'utf-8')]; } catch { return []; }
    });
}

/** 从真文件里按「哪个块声明了这枚变量」抠出来包成 `:root`,不写死副本。 */
function varBlock(css: string, probe: string): string {
  const m = new RegExp(`\\{([^{}]*${probe}\\s*:[^{}]*)\\}`).exec(stripComments(css));
  if (!m?.[1]) throw new Error(`抠不到声明 \`${probe}\` 的那个块`);
  return `:root {${m[1]}}`;
}

const RECORD_CSS = read('components/chat/primitives/record.module.css');
const CHAT_ROOT_CSS = read('components/chat/ChatRoot.module.css');

const SHEETS = [
  ...globalSheets(),
  scopeModule(CHAT_ROOT_CSS, chatRootStyles),
  scopeModule(RECORD_CSS, recordStyles),
  scopeModule(read('components/chat/ThinkingMarkdown.module.css'), thinkingStyles),
];

const TOKEN_SHEETS = [
  read('styles/tokens.css'),
  read('styles/base.css'),
  varBlock(CHAT_ROOT_CSS, '--chat-bg-panel'),
  // 灰底容器那份内距(`--stream-pad`)不住在 `:root`,住在容器自己那条规则里
  varBlock(RECORD_CSS, '--stream-pad'),
];

const { resolved } = createResolver(SHEETS, TOKEN_SHEETS, [
  'padding-right',
  'padding-left',
  'scrollbar-gutter',
]);

const R = recordStyles as unknown as Record<string, string>;
const cls = (name: string): string => {
  const got = R[name];
  // CSS Module 没发这个类 = 样式表里压根没写它 —— 这个仓库真出过
  // (`.thoughts` 的注释记着同一个坑)。让它响,别读成「选择器没匹配上」。
  if (!got) throw new Error(`record.module.css 没有 \`${name}\` 这个类`);
  return got;
};

const think = (text: string, elapsedMs: number): ShellItem => ({
  kind: 'text', text, thinking: true, elapsedMs,
} as unknown as ShellItem);

const SHELL = {
  kind: 'shell', seq: 0, status: 'succeeded', segments: [],
  thinking: false, stopped: false, elapsedMs: 72_000, quietMs: null,
  items: [think('一段长到要滚动的推理。'.repeat(12), 2_500)],
} as unknown as Shell;

/** 壳挂在真的接缝下面,否则一半规则根本不参赛。 */
function mount(): HTMLElement {
  const { container } = render(
    <I18nProvider initial="zh-CN">
      <ExecutionShell shell={SHELL} deferCollapsedBodies={false} />
    </I18nProvider>,
  );
  const app = document.createElement('div');
  app.className = 'app';
  const seam = document.createElement('div');
  seam.className = (chatRootStyles as unknown as Record<string, string>).root as string;
  seam.setAttribute('data-chat-root', '');
  app.appendChild(seam);
  seam.appendChild(container);
  document.body.appendChild(app);
  return seam;
}

/**
 * 思考那一格的限高滚动盒 —— 就是长内容会出滚动条的那只。
 *
 * **必须先展开**:灰底容器那两条 `padding: var(--stream-pad)` 都带 `[open]`
 * (`.fold[open] > summary + .body.stream` / `.fold.thoughts[open] > summary + .body.stack`),
 * 收着量出来的是另一套层叠 —— 而工单的复现步骤第 3 步原话就是「展开思考过程」。
 */
function thinkingScrollBox(): HTMLElement {
  const root = mount();
  const fold = root.querySelector<HTMLDetailsElement>(`details.${cls('thoughts')}`);
  if (!fold) throw new Error('夹具里没有思考那一格 —— 先修夹具,别改断言');
  fold.open = true;
  const box = fold.querySelector<HTMLElement>(`.${cls('body')}.${cls('scroll')}`);
  if (!box) throw new Error('夹具里没有思考那一格的限高滚动盒 —— 先修夹具,别改断言');
  return box;
}

describe('OPEND-2643 思考过程的限高滚动盒', () => {
  it('事实基线:它就是限高 96px、`overflow-y: auto` 的那只盒子', () => {
    const block = /\.fold \.body\.scroll\s*\{([^}]*)\}/.exec(stripComments(RECORD_CSS))?.[1] ?? '';
    expect(block, '`.fold .body.scroll` 这条规则不见了 —— 夹具跟着改').not.toBe('');
    expect(block).toContain('max-height: 96px');
    expect(block).toContain('overflow-y: auto');
    // 真的挂在 DOM 上(CSS Module 发了这个类,选择器不是空转的)
    expect(thinkingScrollBox().className).toContain(cls('scroll'));
  });

  it('事实基线:右侧留的是容器那 8px,不是那句 4px「气口」—— 它被简写盖掉了', () => {
    const style = resolved(thinkingScrollBox());
    expect(style['padding-right']).toBe('8px');
    // 左右对称,说明赢的确实是四边全给的 `padding: var(--stream-pad)`
    expect(style['padding-left']).toBe('8px');
  });

  it('给滚动条留一条自己的车道,而且这条车道 padding 简写抢不走', () => {
    expect(
      resolved(thinkingScrollBox())['scrollbar-gutter'],
      '滚动盒没有为滚动条预留稳定空间(OPEND-2643)',
    ).toBe('stable');
  });

  it('滚动条退出覆盖式 —— 显式宽度,否则 gutter 在 macOS 上是空转的', () => {
    const scoped = scopeModule(RECORD_CSS, recordStyles);
    const selector = `.${cls('scroll')}::-webkit-scrollbar`;
    const block = new RegExp(
      `[^{}]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
    ).exec(stripComments(scoped))?.[1];
    expect(block, '滚动盒没有钉住滚动条宽度,Chromium 会继续用覆盖式滚动条画在正文上').toBeTruthy();
    expect(block).toMatch(/width:\s*\d+px/);
  });

  it('没人给这只盒子写 `scrollbar-width` / `scrollbar-color` —— 写了会把上一条静默撤销', () => {
    /*
     * Chromium 121 起,这两个标准属性只要给了非 `auto` 的值,
     * `::-webkit-scrollbar` 那一套对该元素整体失效 —— 于是盒子退回系统的
     * 覆盖式滚动条,OPEND-2643 原样回来,而且样式表看上去「更标准了」。
     * 这条守的就是那次好心的改动。
     */
    const box = thinkingScrollBox();
    const scoped = scopeModule(RECORD_CSS, recordStyles);
    const offenders = parseRules(scoped, 0).rules.filter((rule) => {
      const hits = rule.selector
        .split(/,(?![^()]*\))/)
        .some((branch) => {
          const plain = branch.trim();
          if (!plain || plain.includes('::')) return false;
          try { return box.matches(plain); } catch { return false; }
        });
      return hits && /(^|;|\s)scrollbar-(width|color)\s*:/.test(rule.body);
    });
    expect(offenders.map((rule) => rule.selector)).toEqual([]);
  });
});
