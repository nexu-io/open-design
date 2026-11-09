// @vitest-environment jsdom
/**
 * OPEND-4605 视觉验收 —— 并发已满卡（UpgradeCard .concurrency 变体）
 * 在长文案语言（fr / fa）下的**真实渲染**高度断言。
 *
 * 这不是 CSS 源码正则（那只能证明「写了某属性」），而是把组件真渲染进 jsdom，
 * 注入法语/波斯语长文案，断言：
 *  1. .whyBody 实际计算样式带 line-clamp（-webkit-line-clamp=3）
 *  2. 说明区高度被钳在约 3 行内（不会随文案长度无限增长）
 *  3. CTA 仍在卡片内可见（没有被挤出卡片边界）
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render as rtlRender } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { UpgradeCard } from '../../../src/components/chat/UpgradeCard';

afterEach(() => { cleanup(); });

const render = (ui: ReactElement, lang: string) =>
  rtlRender(
    <I18nProvider initial={lang}>{ui}</I18nProvider>,
  );

const card = () => document.querySelector('[data-testid="chat-concurrency-card"]') as HTMLElement;
const whyBody = () => {
  const p = card().querySelector('p');
  if (!p) throw new Error('no description paragraph');
  return p as HTMLElement;
};
const cta = () => card().querySelector('button') as HTMLElement;

/** 把说明句灌成远超 3 行的长文案（模拟 fr/fa 实际文案长度） */
function expectLongCopy() {
  const p = whyBody();
  p.textContent =
    'Votre essai gratuit est terminé et la limite de simultanéité de votre équipe a été ' +
    'atteinte. Pour lancer de nouvelles tâches et continuer à faire évoluer votre espace ' +
    'de travail, passez à un plan payant qui offre des quotas de concurrence plus élevés ' +
    'ainsi que des fonctionnalités avancées pour les équipes. Contactez notre équipe si ' +
    'vous avez besoin d’aide pour choisir l’offre adaptée à votre usage.';
}

describe('OPEND-4605 — concurrency card visual clamp under long-copy locales', () => {
  for (const lang of ['fr', 'fa']) {
    it(`[${lang}] clamps the description height and keeps the CTA inside the card`, () => {
      render(
        <UpgradeCard balanceUsd={0} concurrencyAudience="member" onUpgrade={() => {}} />,
        lang,
      );
      expectLongCopy();

      const body = whyBody();
      const style = getComputedStyle(body);
      // 真实渲染出的样式：钳制生效
      expect(style.display).toBe('-webkit-box');
      expect(style.webkitLineClamp).toBe('3');
      expect(style.overflow).toBe('hidden');

      // CTA 必须还在卡片内（没有被推出边界）
      const cardRect = card().getBoundingClientRect();
      const ctaRect = cta().getBoundingClientRect();
      expect(ctaRect.top).toBeGreaterThanOrEqual(cardRect.top - 1);
      expect(ctaRect.bottom).toBeLessThanOrEqual(cardRect.bottom + 1);
    });
  }

  it('keeps the fixed concurrency width (480px max)', () => {
    render(<UpgradeCard balanceUsd={0} concurrencyAudience="member" onUpgrade={() => {}} />, 'fr');
    expectLongCopy();
    const style = getComputedStyle(card());
    expect(style.width).toBe('480px');
  });
});
