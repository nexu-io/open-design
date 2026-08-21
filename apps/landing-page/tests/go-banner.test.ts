import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getPricingContent } from '../app/_lib/pricing-content';
import { getGoBannerCopy } from '../app/go-banner-i18n';
import type { LandingLocaleCode } from '../app/i18n';

const home = readFileSync(
  new URL('../app/pages/index.astro', import.meta.url),
  'utf8',
);
const banner = readFileSync(
  new URL('../app/_components/go-banner.astro', import.meta.url),
  'utf8',
);
const expectedGoBannerDetails = {
  en: '$5 first month · 8 popular models · ample allowance',
  zh: '首月 $5 · 8 个热门模型 · 充裕额度',
  'zh-tw': '首月 $5 · 8 個熱門模型 · 充裕額度',
  ja: '初月 $5 · 人気モデル 8 種 · たっぷり使える',
  ko: '첫 달 $5 · 인기 모델 8개 · 넉넉한 한도',
  de: '5 $ im ersten Monat · 8 beliebte Modelle · großzügiges Kontingent',
  fr: '5 $ le premier mois · 8 modèles populaires · quota généreux',
  ru: '$5 за первый месяц · 8 популярных моделей · большой лимит',
  es: '$5 el primer mes · 8 modelos populares · capacidad amplia',
  'pt-br': '$5 no primeiro mês · 8 modelos populares · franquia ampla',
  it: '$5 il primo mese · 8 modelli popolari · quota generosa',
  tr: 'İlk ay $5 · 8 popüler model · yüksek kullanım kotası',
} satisfies Partial<Record<LandingLocaleCode, string>>;

const localizedPricingLocales = [
  'en',
  'zh',
  'zh-tw',
  'ja',
  'ko',
  'de',
  'fr',
  'ru',
  'es',
  'pt-br',
] as const satisfies readonly LandingLocaleCode[];

test('homepage mounts Go ahead of the existing paid-user DeepSeek banner', () => {
  assert.match(home, /import GoBanner from ['"]\.\.\/_components\/go-banner\.astro['"]/);
  assert.match(home, /<GoBanner locale=\{locale\} \/>[\s\S]*data-home-campaign-banner/);
  assert.match(banner, /html\.go-banner-active \.home-campaign-banner/);
  assert.match(banner, /\.go-banner\s*\{[^}]*background:\s*#d8ffb5;/s);
});

test('Go banner keeps its sticky height in flow without double-offsetting the mobile hero', () => {
  assert.match(banner, /\.go-banner\s*\{[^}]*position:\s*sticky;/s);
  assert.match(
    banner,
    /html\.go-banner-active\),\s*:global\(html\.go-banner-pending\)\s*\{\s*--home-campaign-banner-height:\s*0px !important;/,
  );
  assert.match(
    banner,
    /html\.go-banner-active \.site-chrome\),\s*:global\(html\.go-banner-pending \.site-chrome\)\s*\{\s*top:\s*48px;/,
  );
  assert.doesNotMatch(banner, /html\.go-banner-active \.hero[^}]*padding-top/);
  assert.match(home, /\.hero\s*\{\s*padding-top:\s*calc\(92px \+ var\(--home-campaign-banner-height\)\);/);
});

test('Go banner classifies signed-out and unpaid visitors during the fixed window', () => {
  assert.match(banner, /2026-08-20T17:00:00\+08:00/);
  assert.match(banner, /2026-09-03T20:00:00\+08:00/);
  assert.match(banner, /\/api\/auth\/get-session/);
  assert.match(banner, /if \(!session\?\.user\) \{\s*show\(\)/);
  assert.match(banner, /\/api\/v1\/billing\/summary/);
  assert.match(banner, /tier === 'free' \|\| tier === 'none'/);
  assert.doesNotMatch(banner, /data-campaign-review-param|campaignPreview|previewEndAt/);
  assert.match(banner, /A failed entitlement probe cannot safely classify a signed-in visitor/);
});

test('Go banner suppresses DeepSeek while audience classification is pending', () => {
  assert.match(banner, /document\.documentElement\.classList\.add\('go-banner-pending'\)/);
  assert.match(banner, /html\.go-banner-pending \.home-campaign-banner/);
  assert.match(banner, /html\.go-banner-pending \.site-chrome/);
  assert.match(
    banner,
    /\.finally\(\(\) => document\.documentElement\.classList\.remove\('go-banner-pending'\)\)/,
  );
});

test('DeepSeek visibility and impressions follow Go banner ownership changes', () => {
  assert.match(
    home,
    /const goOwns =\s*document\.documentElement\.classList\.contains\('go-banner-active'\) \|\|\s*document\.documentElement\.classList\.contains\('go-banner-pending'\);/,
  );
  assert.match(home, /const visible = active && !dismissed && !goOwns;/);
  assert.match(
    home,
    /window\.addEventListener\('go-banner:state-change', updateCampaignVisibility\);/,
  );
  assert.match(banner, /new Event\('go-banner:state-change'\)/);
});

test('Go banner uses the confirmed short copy and links to localized Pricing', () => {
  for (const locale of Object.keys(expectedGoBannerDetails) as Array<
    keyof typeof expectedGoBannerDetails
  >) {
    const copy = getGoBannerCopy(locale);
    assert.ok(
      copy.headline.endsWith(expectedGoBannerDetails[locale]),
      locale,
    );
    assert.doesNotMatch(`${copy.headline} ${copy.ariaLabel}`, /unlimited|无限|無限|무제한|unbegrenzt|illimité|безлимит|ilimitado|illimitato|sınırsız/i);
  }
  for (const locale of localizedPricingLocales) {
    assert.ok(
      getGoBannerCopy(locale).headline.endsWith(getPricingContent(locale).go.allowance),
      locale,
    );
  }
  assert.match(banner, /\{copy\.headline\}/);
  assert.doesNotMatch(banner, /copy\.detail/);
  assert.match(banner, /localizedHref\('\/pricing\/', locale\)/);
  assert.match(banner, /data-go-banner-cta/);
});
