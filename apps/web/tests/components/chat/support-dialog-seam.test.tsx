// @vitest-environment jsdom
/**
 * 联系支持弹窗必须**自带 `--chat-*` 接缝**。
 *
 * 真机复现(2026-08-27):弹窗整个是透明的,和背后的页面糊在一起 ——
 * 量到 `modalBg: rgba(0,0,0,0)`、`modalShadow: none`、遮罩也是全透明,
 * 而 `--chat-bg` 解析出来是**空串**。样式表本身没问题(13 条 SupportDialog
 * 规则在 `document.styleSheets` 里),问题是**变量作用域**。
 *
 * 机制:这个弹窗走 portal 挂到 `<body>` 下(真机量到祖先链是
 * `div.SupportDialog_ → body → html`),而自定义属性按 **DOM 树**继承 ——
 * 于是它落在整页唯一那个接缝之外,`background` / `box-shadow` /
 * 遮罩的 `color-mix(… var(--chat-text-strong) …)` 全部解析失败。
 *
 * `ChatRoot.tsx` 的文件注释逐字预言过这件事:
 * 「脱离它,`--chat-*` 变量全部落空,组件会退化成无色无字号的裸结构 ——
 *   **而且不报错**」。所以判据不能靠「看起来对不对」,得钉在接缝标记上。
 *
 * 判据用 `data-chat-root` —— 和 `theme-seam.test.tsx` 同一个出口,
 * 不查具体类名(CSS Module 的类名带哈希,查它等于查编译产物)。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../../src/i18n';
import { SupportDialog } from '../../../src/components/chat/SupportDialog';

afterEach(cleanup);

const channels = [
  { id: 'feishu', name: '飞书社群', icon: null, href: 'https://example.invalid/feishu' },
  { id: 'discord', name: 'Discord', icon: null, href: 'https://example.invalid/discord' },
] as unknown as Parameters<typeof SupportDialog>[0]['channels'];

function show(inline: boolean): HTMLElement {
  render(
    <I18nProvider initial="zh-CN">
      <SupportDialog channels={channels} onClose={() => {}} inline={inline} />
    </I18nProvider>,
  );
  return screen.getByTestId('chat-support-dialog');
}

describe('联系支持弹窗的主题接缝', () => {
  it('浮层形态自带接缝 —— 它挂在 body 下,拿不到外面那层', () => {
    const overlay = show(false);
    expect(overlay.hasAttribute('data-chat-root')).toBe(true);
  });

  it('接缝要带上变量类名,不能只有那个属性', () => {
    const overlay = show(false);
    // 类名带哈希,只断言「除了 overlay 自己的类之外还多了一个」
    expect(overlay.className.trim().split(/\s+/).length).toBeGreaterThan(1);
  });

  it('就地形态照旧渲染,没被这条改坏', () => {
    const overlay = show(true);
    expect(overlay).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
