// @vitest-environment jsdom
/**
 * 记忆卡(组件 8,交付稿 #26 收起 / #27 展开)按稿子的结构走。
 *
 * 稿子的实体是这样的:
 *   <details class="fold">
 *     <summary><svg class="memo-ic" fill="currentColor">书签</svg><span>已记住 3 条偏好</span><span class="chev">…</span></summary>
 *     <div class="body"> · 商品卡做成可复用的共享组件<br> · 卡片圆角统一 12px<br> · 不要暖色背景 </div>
 *   </details>
 *
 * 三处我们原来都不同,这条把它们钉住:
 *  ① **底座**复用通用折叠行(和执行记录同一套),不是自建卡
 *  ② **图标是书签**、实心填充,不是 sparkles 星星;颜色走产品指定的那支绿
 *  ③ 展开的每条前缀是**纯「·」**,没有彩色类型点 —— 类型色点是产品原有实现,
 *     稿子里没有;大前提是「一切按新设计稿对齐」,所以按稿子去掉
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { I18nProvider } from '../../../src/i18n';
import { OdCardView } from '../../../src/components/OdCard';

const odCardStylesheet = readFileSync(
  resolve(process.cwd(), 'src/components/OdCard.module.css'),
  'utf8',
);

afterEach(() => { cleanup(); });

const card = {
  kind: 'memory-applied' as const,
  summary: '已记住 3 条偏好',
  used: [
    { id: 'm1', type: 'project' as const, name: '商品卡做成可复用的共享组件' },
    { id: 'm2', type: 'feedback' as const, name: '卡片圆角统一 12px' },
    { id: 'm3', type: 'user' as const, name: '不要暖色背景' },
  ],
};

const show = () => render(
  <I18nProvider initial="zh-CN"><OdCardView card={card} /></I18nProvider>,
);

describe('记忆卡', () => {
  it('展开的条目前缀是纯「·」,没有彩色类型点', () => {
    const { container } = show();
    expect(container.querySelector('[class*=refDot], [class*=dotProject], [class*=dotUser]')).toBeNull();
    const body = container.querySelector('details > div');
    expect(body?.textContent).toContain('· 商品卡做成可复用的共享组件');
    expect(body?.textContent).toContain('· 不要暖色背景');
  });

  it('图标是实心书签,不是 sparkles', () => {
    const { container } = show();
    const svg = container.querySelector('summary svg');
    expect(svg?.getAttribute('fill')).toBe('currentColor');
    // 稿子那条书签路径的起手式;换成别的图标这里立刻红
    expect(container.querySelector('summary svg path')?.getAttribute('d')).toContain('M6.5 3h11');
  });

  it('收起和展开保持最新稿的 16px 外壳与标题轮廓', () => {
    const { container } = show();
    const details = container.querySelector('details');
    const summary = container.querySelector('summary');
    expect(details).not.toBeNull();
    expect(summary).not.toBeNull();

    expect(odCardStylesheet).toMatch(
      /\.appliedCard\s*\{[^}]*border-radius:\s*var\(--radius-2xl\)/s,
    );
    expect(odCardStylesheet).toMatch(
      /\.appliedCard\s*>\s*summary\s*\{[^}]*border-radius:\s*var\(--radius-2xl\)/s,
    );

    fireEvent.click(summary!);
    expect(details?.open).toBe(true);
  });
});
