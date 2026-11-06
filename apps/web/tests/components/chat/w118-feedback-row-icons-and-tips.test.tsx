// @vitest-environment jsdom
/**
 * 回合末尾那排动作按钮(赞 / 踩 / 复制 / 新开会话)的**图标字节**与 **tooltip 文案**。
 *
 * 判据来自交付稿 `729fa43ce7`(PR #7170,分支 `design/chat-cards-surface`):
 *   · `docs/design/chat-panel/src/body-components.html:1184-1196` —— 第 34 格
 *     「默认 · 回合状态 + 图标组 + 时间」那一行的四枚 `<button>`,
 *     每枚都带 `aria-label` + `data-tip`,内层是一枚
 *     `<svg viewBox="0 0 24 24" fill="currentColor">` 单 path、无 stroke。
 *   · `docs/design/chat-panel/src/components.css:2675-2711` —— `[data-tip]::after`
 *     那一段说明「纯图标按钮唯一的名字」,并解释为什么不用原生 `title`。
 *   · `docs/design/chat-panel/src/components.css:2795` —— `.fb button svg { width:13px; height:13px }`;
 *     `:2836` —— `.fork-note svg { width:12px; height:12px }`。
 *
 * ## 为什么断言的是属性字节,不是 `getComputedStyle`
 *
 * 这个仓库在样式测试上出过多次假绿:CSS Module 代理对任何 key 都返回类名,
 * jsdom 又不会自动加载样式表,于是 `expect(a).toBe(b)` 常常是两边都 `<unset>`
 * 的真空通过。`d` / `viewBox` / `data-tooltip` / `aria-label` 是**真 DOM 属性**,
 * 由 React 直接写出来,不经过任何样式管道 —— 读出来是什么就是什么。
 *
 * ## 稿子里的四条字面值(判据的锚,不从实现里读回来)
 *
 * 三枚图标(赞 / 踩 / 复制)与 remixicon@4.9.1 的 `thumb-up-line` /
 * `thumb-down-line` / `file-copy-line` **逐字节相同**,这里照样钉住 ——
 * 它们是「这一组本来就对齐」的证据,将来谁换了图标库能立刻照出来。
 *
 * 第四枚(新开会话)**不同**:稿子用的是 remix `git-branch-line` 沿 y=12
 * **上下镜像**之后的那一版 —— 三枚圆点落在 (6,6) / (6,18) / (18,18),
 * 支线朝**下**分出去;上游那一版落在 (6,6) / (6,18) / (18,6),支线朝上。
 * 稿子里第 34–39 格的按钮和 `.fork-note` 脚注**六处全用镜像版**,不是单点笔误;
 * 语义上也对得上说明文字「点完【原地】落一条分界……线以下就是新的一轮」——
 * 新会话在下面,支线就朝下走。
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { I18nProvider } from '../../../src/i18n';
import type { ChatMessage } from '../../../src/types';

/* ── 稿子的字面值 ──────────────────────────────────────────────────── */

/** `body-components.html:1187` 的 `aria-label="有帮助"` 那枚 svg 的 path */
const D_THUMB_UP =
  'M14.5998 8.00033H21C22.1046 8.00033 23 8.89576 23 10.0003V12.1047C23 12.3659 22.9488 12.6246 22.8494 12.8662L19.755 20.3811C19.6007 20.7558 19.2355 21.0003 18.8303 21.0003H2C1.44772 21.0003 1 20.5526 1 20.0003V10.0003C1 9.44804 1.44772 9.00033 2 9.00033H5.48184C5.80677 9.00033 6.11143 8.84246 6.29881 8.57701L11.7522 0.851355C11.8947 0.649486 12.1633 0.581978 12.3843 0.692483L14.1984 1.59951C15.25 2.12534 15.7931 3.31292 15.5031 4.45235L14.5998 8.00033ZM7 10.5878V19.0003H18.1606L21 12.1047V10.0003H14.5998C13.2951 10.0003 12.3398 8.77128 12.6616 7.50691L13.5649 3.95894C13.6229 3.73105 13.5143 3.49353 13.3039 3.38837L12.6428 3.0578L7.93275 9.73038C7.68285 10.0844 7.36341 10.3746 7 10.5878ZM5 11.0003H3V19.0003H5V11.0003Z';

/** `body-components.html:1188` 的 `aria-label="没帮助"` */
const D_THUMB_DOWN =
  'M9.40017 16H3C1.89543 16 1 15.1046 1 14V11.8957C1 11.6344 1.05118 11.3757 1.15064 11.1342L4.24501 3.61925C4.3993 3.24455 4.76447 3 5.16969 3H22C22.5523 3 23 3.44772 23 4V14C23 14.5523 22.5523 15 22 15H18.5182C18.1932 15 17.8886 15.1579 17.7012 15.4233L12.2478 23.149C12.1053 23.3508 11.8367 23.4184 11.6157 23.3078L9.80163 22.4008C8.74998 21.875 8.20687 20.6874 8.49694 19.548L9.40017 16ZM17 13.4125V5H5.83939L3 11.8957V14H9.40017C10.7049 14 11.6602 15.229 11.3384 16.4934L10.4351 20.0414C10.3771 20.2693 10.4857 20.5068 10.6961 20.612L11.3572 20.9425L16.0673 14.27C16.3172 13.9159 16.6366 13.6257 17 13.4125ZM19 13H21V5H19V13Z';

/** `body-components.html:1189` 的 `aria-label="复制"` */
const D_COPY =
  'M6.9998 6V3C6.9998 2.44772 7.44752 2 7.9998 2H19.9998C20.5521 2 20.9998 2.44772 20.9998 3V17C20.9998 17.5523 20.5521 18 19.9998 18H16.9998V20.9991C16.9998 21.5519 16.5499 22 15.993 22H4.00666C3.45059 22 3 21.5554 3 20.9991L3.0026 7.00087C3.0027 6.44811 3.45264 6 4.00942 6H6.9998ZM5.00242 8L5.00019 20H14.9998V8H5.00242ZM8.9998 6H16.9998V16H18.9998V4H8.9998V6Z';

/**
 * `body-components.html:1190` 的 `aria-label="新开会话"`,以及 `:1246` 的 `.fork-note`
 * 脚注图标 —— 两处**同一条 path**。支线朝下,右侧节点落在 (18,18)。
 */
const D_FORK =
  'M7.10508 8.78991C7.45179 10.0635 8.61653 11 10 11H14C16.4703 11 18.5222 12.7915 18.9274 15.1461C20.1303 15.5367 21 16.6668 21 18C21 19.6569 19.6569 21 18 21C16.3431 21 15 19.6569 15 18C15 16.7334 15.7849 15.6501 16.8949 15.2101C16.5482 13.9365 15.3835 13 14 13H10C8.87439 13 7.83566 12.6281 7 12.0004V15.1707C8.16519 15.5825 9 16.6938 9 18C9 19.6569 7.65685 21 6 21C4.34315 21 3 19.6569 3 18C3 16.6938 3.83481 15.5825 5 15.1707V8.82929C3.83481 8.41746 3 7.30622 3 6C3 4.34315 4.34315 3 6 3C7.65685 3 9 4.34315 9 6C9 7.26661 8.21506 8.34988 7.10508 8.78991ZM6 7C6.55228 7 7 6.55228 7 6C7 5.44772 6.55228 5 6 5C5.44772 5 5 5.44772 5 6C5 6.55228 5.44772 7 6 7ZM6 19C6.55228 19 7 18.5523 7 18C7 17.4477 6.55228 17 6 17C5.44772 17 5 17.4477 5 18C5 18.5523 5.44772 19 6 19ZM18 19C18.5523 19 19 18.5523 19 18C19 17.4477 18.5523 17 18 17C17.4477 17 17 17.4477 17 18C17 18.5523 17.4477 19 18 19Z';

/** 稿子四条 tip 文案,`data-tip="…"` 与 `aria-label="…"` 同字 */
const TIP_UP = '有帮助';
const TIP_DOWN = '没帮助';
const TIP_COPY = '复制';
/**
 * 第四枚**有意不取稿子字面**。稿子 `body-components.html:1189` 写的是「新开会话」,
 * 而面板头那颗(`src/body-scene.html:8`)写的是「新会话」—— 稿子自己这两处就不一致。
 * 产品裁决 2026-09-03:**聊天面板内只说一句**,取「新会话」;依据同样在稿子里 ——
 * `src/body-components.html:1243` 那条 fork 分界线是 `aria-label="新会话从这里开始"`,
 * 稿子自己把这颗按钮产出的东西叫「新会话」。
 * 统一之后这颗按钮三个态是一族词:新会话 / 正在开始新会话… / 无法开始新会话。
 * 19 语的守卫在 `w129-new-session-single-entry.test.tsx`。
 */
const TIP_FORK = '新会话';

/* ── 夹具 ──────────────────────────────────────────────────────────── */

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
      setItem: (k: string, v: string) => store.set(k, v),
    },
  });
});

afterEach(cleanup);

function turn(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm-1',
    role: 'assistant',
    content: '列表页已经复刻好了。',
    startedAt: 1700000000,
    endedAt: 1700000042,
    createdAt: 1700000042,
    runStatus: 'succeeded',
    events: [] as ChatMessage['events'],
    producedFiles: [],
    ...over,
  } as ChatMessage;
}

/** 面板按 zh-CN 渲染 —— 稿子的四条文案是中文,英文档另有译文,不在这条判据里。 */
function renderTurn(message: ChatMessage = turn()): HTMLElement {
  const { container } = render(
    <I18nProvider initial="zh-CN">
      <AssistantMessage
        message={message}
        streaming={false}
        isLast
        projectId="p1"
        errorCardOwnerId={null}
        onFeedback={vi.fn()}
        onForkFromMessage={vi.fn()}
      />
    </I18nProvider>,
  );
  return container;
}

const btn = (root: HTMLElement, testid: string): HTMLElement => {
  const el = root.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
  if (!el) throw new Error(`missing [data-testid="${testid}"]`);
  return el;
};

/** 一枚纯图标按钮里那条 path 的 `d`。取不到就抛,不返回 undefined ——
 *  `undefined === undefined` 是这类测试最常见的真空通过。 */
const pathOf = (el: HTMLElement): string => {
  const p = el.querySelector('svg path');
  if (!p) throw new Error('no <svg><path> inside the button');
  const d = p.getAttribute('d');
  if (!d) throw new Error('<path> has no d attribute');
  return d;
};

/* ── 一、图标字节 ──────────────────────────────────────────────────── */

describe('回合末尾动作行 · 图标 SVG 字节对齐交付稿 729fa43ce7', () => {
  it('赞 / 踩 / 复制 三枚与稿子逐字节相同', () => {
    const root = renderTurn();
    expect(pathOf(btn(root, 'assistant-feedback-positive'))).toBe(D_THUMB_UP);
    expect(pathOf(btn(root, 'assistant-feedback-negative'))).toBe(D_THUMB_DOWN);
    expect(pathOf(btn(root, 'assistant-copy-markdown'))).toBe(D_COPY);
  });

  it('新开会话那枚用稿子的**支线朝下**版本', () => {
    const root = renderTurn();
    expect(pathOf(btn(root, 'assistant-fork-button'))).toBe(D_FORK);
  });

  it('分界脚注 `.fork-note` 用的是同一条 path', () => {
    const root = renderTurn(
      turn({ forkedInto: { title: '商城原型', conversationId: 'c-2' } }),
    );
    expect(pathOf(btn(root, 'assistant-fork-note'))).toBe(D_FORK);
  });

  it('四枚都是 viewBox="0 0 24 24" 的单 path 实心图标,不描边', () => {
    const root = renderTurn();
    for (const id of [
      'assistant-feedback-positive',
      'assistant-feedback-negative',
      'assistant-copy-markdown',
      'assistant-fork-button',
    ]) {
      const svg = btn(root, id).querySelector('svg');
      expect(svg, id).not.toBeNull();
      expect(svg!.getAttribute('viewBox'), id).toBe('0 0 24 24');
      expect(svg!.getAttribute('fill'), id).toBe('currentColor');
      expect(svg!.getAttribute('stroke'), id).toBeNull();
      expect(svg!.getAttribute('stroke-width'), id).toBeNull();
      expect(svg!.querySelectorAll('path').length, id).toBe(1);
    }
  });

  it('按钮里的图标 13px,分界脚注那枚 12px(稿 `.fb button svg` / `.fork-note svg`)', () => {
    const root = renderTurn(
      turn({ forkedInto: { title: '商城原型', conversationId: 'c-2' } }),
    );
    for (const id of [
      'assistant-feedback-positive',
      'assistant-feedback-negative',
      'assistant-copy-markdown',
      'assistant-fork-button',
    ]) {
      const svg = btn(root, id).querySelector('svg')!;
      expect(svg.getAttribute('width'), id).toBe('13');
      expect(svg.getAttribute('height'), id).toBe('13');
    }
    const note = btn(root, 'assistant-fork-note').querySelector('svg')!;
    expect(note.getAttribute('width')).toBe('12');
    expect(note.getAttribute('height')).toBe('12');
  });
});

/* ── 二、tooltip 文案 ──────────────────────────────────────────────── */

describe('回合末尾动作行 · tooltip 把图标翻译成一句话', () => {
  /* 四条**一次比完**,不逐条 `expect` —— 逐条写的话第一条一挂后面三条就不再执行,
     一次只照得出一个差异,得来回跑四趟才看得全。整张表比,失败输出里四条同时在。 */
  const tipTable = (root: HTMLElement, attr: 'data-tooltip' | 'aria-label') => ({
    赞: btn(root, 'assistant-feedback-positive').getAttribute(attr),
    踩: btn(root, 'assistant-feedback-negative').getAttribute(attr),
    复制: btn(root, 'assistant-copy-markdown').getAttribute(attr),
    Fork: btn(root, 'assistant-fork-button').getAttribute(attr),
  });

  const EXPECTED = { 赞: TIP_UP, 踩: TIP_DOWN, 复制: TIP_COPY, Fork: TIP_FORK };

  it('四枚的 data-tooltip 逐字对上稿子', () => {
    expect(tipTable(renderTurn(), 'data-tooltip')).toEqual(EXPECTED);
  });

  it('读屏念的和眼睛看的是同一句(稿子 aria-label 与 data-tip 同字)', () => {
    expect(tipTable(renderTurn(), 'aria-label')).toEqual(EXPECTED);
  });

  it('气泡出在按钮上方(稿 `[data-tip]::after { bottom: calc(100% + 6px) }`)', () => {
    const root = renderTurn();
    for (const id of [
      'assistant-feedback-positive',
      'assistant-feedback-negative',
      'assistant-copy-markdown',
      'assistant-fork-button',
    ]) {
      expect(btn(root, id).getAttribute('data-tooltip-placement'), id).toBe('top');
    }
  });
});
