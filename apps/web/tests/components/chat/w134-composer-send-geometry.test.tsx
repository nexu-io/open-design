// @vitest-environment jsdom
/**
 * W134 —— 发送键的**盒子几何**(PR #7170 稿子基线 `729fa43ce7`)。
 *
 * ## 稿子怎么写的
 *
 * `729fa43ce7:docs/design/chat-panel/src/components.css:3105-3125`:
 *
 *   .composer .bar button {
 *     display: grid; place-items: center; width: 28px; height: 28px;
 *     border-radius: var(--radius-sm); color: var(--text-strong);
 *   }
 *   .composer .bar button svg { width: 16px; height: 16px; }
 *   .composer .bar .send {
 *     width: 28px; height: 28px; background: var(--text-strong); color: var(--bg);
 *     border-radius: var(--radius-pill);
 *   }
 *
 * 发送键和底栏其它按钮(+、模型名旁的图标)**同一个盒子尺寸** —— 稿子只用
 * 底色 + 圆角把它从"幽灵按钮"提成"实心按钮",没有另起一个更大的层级,
 * 没有描边,没有阴影。稿子的全局 `button` 复位是
 * `border: none; background: none`(见 `components.css:170` 附近的复位块,
 * `icon-stroke-weight.test.tsx` 已经引过一次),发送键也不例外。
 *
 * ## 产品现在是什么
 *
 * `src/styles/chat.css` 的 `.composer-send` 是 36×36,外加
 * `border: var(--stroke-thin) solid var(--text-strong)` 和
 * `box-shadow: var(--shadow-xs)`;图标是 `ChatSendArrowIcon size={18}`
 * (`src/components/chat/primitives/icons.tsx:308`)。
 *
 * `icons.tsx` 那段注释自己承认了这件事:「发送键 18……都是产品当前的值,
 * 这一轮一个都不动(稿子那边发送键是 16、盒子 28,连着描边和 `--shadow-xs`
 * 一起属于另一件事,见 W126 报告)」—— W126 有意把这一格推迟给"另一件事"。
 * 这份文件就是那件"另一件事":36/18/描边/阴影这组数字不追认在 composer
 * 行内**没有任何东西**撑着 —— composer 行其它四颗控件(+、工作目录、
 * agent 头像、Design 模式切换)已经被专门统一到 28px("one control system"
 * 那段注释,`chat.css:1965-1975`),发送键被那条注释点名列入却唯独没被收进
 * 统一选择器,是这次重排里漏掉的一颗,不是刻意分层。
 *
 * jsdom 不解析层叠但会读字面像素值,这里把真实 `chat.css` 塞进文档再问
 * `getComputedStyle`,和 `queue-action-icon-size.test.tsx` 同一个套路。
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ChatComposer } from '../../../src/components/ChatComposer';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src');
const CHAT_CSS = readFileSync(resolve(SRC, 'styles/chat.css'), 'utf-8');

/**
 * ⚠️ **必须把 `routines.css` 一起装进去,顺序照 `index.css`。**
 *
 * 第一版这个文件只塞了 `chat.css`,于是把 36px 改成 28px 之后测试就绿了 ——
 * **而真浏览器上一动没动**。原因是同一颗按钮被两个文件规定着,而赢的是没改的那个:
 *
 *   styles/chat.css            `.composer-send`                  (0,1,0)  28px
 *   styles/viewer/routines.css `.app .composer-send`             (0,2,0)  36px  ← 赢
 *
 * `index.css` 里 `chat.css` 排第 13、`routines.css` 排第 31,后者又更具体,两条都
 * 站在它那边。只装一个文件去量,等于**在量之前就把缺陷排除在外**——那不是通过,
 * 是没看见。真机实测:`.composer-send` 的 `getBoundingClientRect()` 是 36×36。
 *
 * 所以这里按 `index.css` 的顺序装两份;jsdom 会照真实层叠算出胜者。
 */
const ROUTINES_CSS = readFileSync(resolve(SRC, 'styles/viewer/routines.css'), 'utf-8');

beforeAll(() => {
  for (const css of [CHAT_CSS, ROUTINES_CSS]) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }
  // 产线上这颗按钮永远活在 `.app` 里(`routines.css` 那几条就是靠它命中的)。
  document.body.classList.add('app');
});

/**
 * jsdom 的 CSSOM 解析不了 `border: var(--stroke-thin) solid var(--text-strong)`
 * 这种混了字面量和 `var()` 的简写值 —— 整条声明直接判无效,`getComputedStyle`
 * 落回初始值 `none`,**不管源码里写没写描边都读 `none`**,是个真空判据。
 * `box-shadow: var(--shadow-xs)` 同理。改问源码文本里 `.composer-send` 那条
 * 规则的声明体,和 `error-card-radius.test.ts` 同一个套路。
 */
function composerSendRuleBody(): string {
  const withoutComments = CHAT_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = withoutComments.split('}');
  for (const block of blocks) {
    const [head, body] = block.split('{');
    if (body === undefined) continue;
    const selectors = (head ?? '').split(',').map((s) => s.replace(/\s+/g, ' ').trim());
    if (selectors.some((s) => s === '.composer-send')) return body;
  }
  throw new Error('chat.css 里找不到裸的 `.composer-send { … }` 规则');
}

afterEach(cleanup);

function renderComposer() {
  render(
    <ChatComposer
      projectId="project-1"
      projectFiles={[]}
      streaming={false}
      onEnsureProject={async () => 'project-1'}
      onSend={() => {}}
      onStop={() => {}}
    />,
  );
}

/*
 * ⚠️ 2026-09-05 合并 main 时,这一节的数字**整体翻过面**。
 *
 * 原来钉的是交付稿 `729fa43ce7` 的「盒子 28 / 图标 16」,理由写在文件头那大段里
 * (composer 行另外四颗控件已统一到 28px 的 "one control system")。
 *
 * 产品拍板取 main 的 #7635 / OPEND-2553:那份设计 09-04 07:23 已经上线,且其
 * commit 正文明确写着覆盖「the project composer」,不是只改首页。两份设计撞在
 * 同一颗控件上,取已上线的那份 —— 在一次合并里悄悄撤销别人已上线的工作,不该由
 * 做合并的人代劳。产品是看过一份两版并排的真实尺寸对照之后才拍的。
 *
 * **这个文件真正的价值不在那个数字**,而在下面那件事:2026-09-03 有一轮只改了
 * `chat.css` 那半边,测试绿了而真浏览器一动没动(实测仍是 36×36)—— 因为
 * `viewer/routines.css` 的 `.app .composer-send` 特异性更高、又排在后面。所以本
 * 文件按 `index.css` 的顺序把两份样式表都装进来再问 `getComputedStyle`。
 * 那套机制原样保留,只是钉的数字换成了 main 那一版。
 */
describe('发送键盒子几何 —— main 的 32×32(2026-09-05 裁决)', () => {
  /*
   * 是 32,不是 36。`viewer/routines.css` 里 `.app .composer-send` 先声明了
   * 36px,但同一个文件更后面的规则把它压到 32 —— **只读源码会读成 36**,把两份
   * 样式表按 index.css 顺序装进来量,才是 32。这正是本文件存在的理由。
   * 32 也和 main 自己的注释对得上:运行态「共用每一行,底.svg 就是这个盒子把
   * 箭头拿掉」,两态是同一个 32 方框。
   */
  it('盒子是 32×32 —— 两份样式表一起装才照得出真实值', () => {
    renderComposer();
    const button = screen.getByTestId('chat-send');
    const style = getComputedStyle(button);
    expect(`${style.width} × ${style.height}`).toBe('32px × 32px');
  });

  it('没有可见描边 —— 稿子的全局 button 复位是 border: none', () => {
    const body = composerSendRuleBody();
    const borderDecl = /\bborder\s*:\s*([^;]+);/.exec(body)?.[1]?.trim();
    expect(borderDecl, `.composer-send 的 border 声明是 "${borderDecl}"`).toBe('none');
  });

  it('源码里没有 box-shadow 声明 —— 稿子从没给发送键挂过阴影', () => {
    const body = composerSendRuleBody();
    expect(body, `.composer-send 的声明体里还有 box-shadow:\n${body}`).not.toMatch(/\bbox-shadow\s*:/);
  });

  it('图标是 32px —— main 那枚实心箭头填满自己的盒子', () => {
    renderComposer();
    const button = screen.getByTestId('chat-send');
    const svg = button.querySelector('svg');
    if (!svg) throw new Error('发送键里没有 svg');
    expect(svg.getAttribute('width')).toBe('32');
    expect(svg.getAttribute('height')).toBe('32');
  });
});
