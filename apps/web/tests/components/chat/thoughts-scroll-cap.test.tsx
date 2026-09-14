// @vitest-environment jsdom
/**
 * 「思考过程」展开之后要限高 + 自己滚(用户 2026-08-27)。
 *
 * 用户原话:「thought 展开应该有个最高高度, 可以滚动」
 * 配图是**思考已结束**那一档:点开之后十几段推理一路铺到屏外,底下还压着「跳到最新」。
 *
 * ── 2026-09-02 产品裁决:**限高两态都要**,本文件据此更新 ──────────────
 *
 * 用户原话(记在 `specs/current/chat-stream-scroll-research.md:28`,源头是同日
 * `specs/current/chat-panel-dispatch-2026-09-02.md` §产品裁决 1 那条线):
 *   「但我记得 thinking 下面文本不是有最大高度吗?**就跟那个 thinking 完成后的
 *     展示那样,有最大高度**」
 * 被推翻的一直只有「**定高 + 慢速分步滚 + 上下渐隐遮罩**」那一套
 * (`useThinkingStream.ts`,已于 `1626b893df` 删除),**限高不在被推翻之列**。
 * 三个维度分开记在 `record.module.css` `.stream` 那条注释里:
 *   高度 ✓`max-height`(短内容完全不限高) / 滚动 ✓贴底跟随、一次到底 / 遮罩 ✗一律没有
 *
 * 实现随裁决翻在 `819c8aefac`(2026-09-02 11:56,feat(chat): follow a live thinking
 * stream…):`ThoughtsRow` 的 `scroll={!live}` 改成裸 `scroll`,两态共用同一条限高。
 * 本文件上一次改动是 `a70ec0c35f`(2026-08-29),**比那次翻转早 4 天**,所以它一直
 * 拿旧口径断言「思考中不挂 `scroll`」,自 `819c8aefac` 起就是红的 —— 是测试没跟上,
 * 不是实现回退。
 *
 * 两态今天的区别是**灰底容器**,不是限高:
 *   思考中   `.stream` + `.scroll` —— 灰底 / 圆角 / 内距归 `.stream`,限高归 `.scroll`,
 *            贴底跟随归 `useThinkingFollow`(不归 CSS)
 *   思考完   `.stack`  + `.scroll` —— 同一条限高;用户是**专程点开来读**的,不跟随
 *
 * 高度不是我挑的:交付稿 `docs/design/chat-panel-next.html`(md5 `28ea4c65…`)第 1252 行
 *   `.fold .body.mod-scroll { max-height: 96px; overflow-y: auto; }`
 * 而 3674 行那条注释把这个数说死了:「96px ≈ 5 行,和折叠块里 .mod-scroll 用的是
 * 同一个高度,这一屏里所有『够看但不占屏』的窗口都是这一档」。
 *
 * ⚠️ jsdom **没有布局**:`max-height` 到底截没截住、有没有滚动条,这一层量不出来。
 * 这个文件只钉「限高这件事接上了没有、接在哪一档上」;真实几何在无头 Chrome 里量,
 * 记录见 `specs/current/chat-panel-feedback.md` §F-17。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import type { ExecutionShell as Shell, ShellItem } from '../../../src/runtime/chat/contract';

afterEach(cleanup);

const think = (text: string): ShellItem => ({ kind: 'text', text, thinking: true });
function shellOf(items: ShellItem[], over: Partial<Shell> = {}): Shell {
  return {
    kind: 'shell', seq: 0, status: 'done', items, segments: [],
    thinking: false, stopped: false, elapsedMs: null, quietMs: null, ...over,
  } as Shell;
}
const show = (shell: Shell): ReactElement => (
  <I18nProvider initial="zh-CN"><ExecutionShell shell={shell} /></I18nProvider>
);
/** 思考那一格自己的 body */
const thoughtsBody = (root: HTMLElement): HTMLElement | null =>
  root.querySelector('details[class*="thoughts"] > div[class*="body"]');
const openCompletedShell = (root: HTMLElement): void => {
  const summary = root.querySelector('details[class*="flat"] > summary');
  if (summary) fireEvent.click(summary);
};
const openThoughts = (root: HTMLElement): void => {
  const summary = root.querySelector('details[class*="thoughts"] > summary');
  if (summary) fireEvent.click(summary);
};

const LONG = Array.from({ length: 14 }, (_, i) => `第 ${i + 1} 段推理,说的是这一步为什么这么做。`).join('\n\n');

describe('思考过程展开后限高', () => {
  it('想完了的那一格,body 带滚动限高这一档', () => {
    const { container } = render(show(shellOf([think(LONG)], { status: 'done' })));
    openCompletedShell(container);
    openThoughts(container);
    const body = thoughtsBody(container);
    /* 正向对照:这一格真的渲染了、推理真的在里面 —— 少了它,组件没渲染时下面也会「通过」 */
    expect(body?.textContent).toContain('第 14 段推理');
    expect(body?.className).toMatch(/scroll/);
  });

  /**
   * 还在想的那一格:灰底换成 `.stream`,**限高照旧**(2026-09-02 裁决,见文件头)。
   *
   * 这条曾经断言 `not.toMatch(/scroll/)` —— 那是把「限高」和被推翻的
   * 「定高 + 慢速分步滚 + 渐隐」混成了一件事。两态共用同一条 `.body.scroll`。
   *
   * ⚠️ **防真空**:两态都断言 `scroll` 之后,「`scroll` 是不是随便谁都有」这个问题
   * 由下面第三条守着 —— 普通工具行的抽屉**不**挂 `scroll`,它是绿的。
   */
  it('还在想的那一格走 `.stream` 灰底,但限高这一档照样挂着', () => {
    const { container } = render(show(shellOf([think(LONG)], { status: 'running', thinking: true })));
    const body = thoughtsBody(container);
    expect(body?.textContent).toContain('第 14 段推理');
    expect(body?.className).toMatch(/stream/);
    expect(body?.className, '思考中丢了限高 —— 长推理会把执行记录一路撑到屏外').toMatch(/scroll/);
  });

  it('反向对照:普通工具行的抽屉不挂滚动限高(限高只属于思考那一格)', () => {
    const { container } = render(show(shellOf(
      [{
        kind: 'tool', id: 't1', tool: 'bash', title: '跑一条命令', name: 'Bash', rawTitle: false,
        file: null, delta: null, hits: null, pattern: null, elapsedMs: 400,
        failed: false, failReason: null, command: 'ls', terminal: 'a\nb\nc',
      } as unknown as ShellItem],
      { status: 'done' },
    )));
    openCompletedShell(container);
    const toolSummary = container.querySelector('details:not([class*="flat"]) > summary');
    if (toolSummary) fireEvent.click(toolSummary);
    const tool = container.querySelector('details:not([class*="thoughts"]):not([class*="flat"]) > div[class*="body"]');
    expect(container.textContent).toContain('跑一条命令');
    expect(tool?.className ?? '').not.toMatch(/scroll/);
  });
});
