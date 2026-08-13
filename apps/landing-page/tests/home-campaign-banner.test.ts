import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LANDING_LOCALES } from '../app/i18n.ts';
import {
  getHomeCampaignContent,
  HOME_CAMPAIGN_CONTENT_BY_LOCALE,
} from '../app/_lib/home-campaign-content.ts';

const source = readFileSync(
  new URL('../app/pages/index.astro', import.meta.url),
  'utf8',
);

test('home campaign banner keeps only the arrow visible while preserving an accessible link label', () => {
  assert.doesNotMatch(source, /限时抢购/);
  assert.match(source, /linkLabel: campaignContent\.linkLabel/);
  assert.match(source, /badge: campaignContent\.windowLabel/);
  assert.match(source, /home-campaign-banner__badge/);
  assert.match(source, /data-home-campaign-countdown/);
  assert.match(source, /活动剩余/);
  assert.match(source, /previewEndAt = Date\.now\(\) \+ 14 \* 24 \* 60 \* 60 \* 1000/);
  assert.doesNotMatch(source, /距开始/);
  assert.match(source, /background:\s*#68f22e/);
  assert.match(source, /home-campaign-banner__cta/);
  assert.match(source, /<span class="home-campaign-banner__cta" aria-hidden="true">→<\/span>/);
  assert.doesNotMatch(source, /\{campaignCopy\.cta\}/);
});

test('home campaign banner can be dismissed without nesting a button in its link', () => {
  assert.match(source, /data-home-campaign-close/);
  assert.match(source, /aria-label=\{campaignCopy\.closeLabel\}/);
  assert.match(source, /\.home-campaign-banner__close\s*\{[\s\S]*right:\s*14px;/);
  assert.match(source, /home-campaign-banner-dismissed/);
  assert.match(source, /window\.__odTrack\('surface_view'/);
  assert.match(source, /area:\s*'campaign_banner'/);
  assert.match(source, /window\.__odRecordCampaignEntry\?\.\('landing_home_banner', 'deepseek_v4_pro'\)/);
  assert.match(source, /window\.__odAttributedUrl/);
  assert.match(source, /localStorage\.setItem\(dismissKey, '1'\)/);
  assert.match(source, /<div class="home-campaign-banner"/);
  assert.doesNotMatch(source, /<a class="home-campaign-banner"/);
});

test('home campaign banner uses the fixed two-week activity window', () => {
  assert.match(source, /DEEPSEEK_V4_PRO_CAMPAIGN\.startAt/);
  assert.match(source, /DEEPSEEK_V4_PRO_CAMPAIGN\.endAtExclusive/);
  assert.match(source, /now >= startAt && now < endAt/);
  assert.match(source, /data-campaign-review-param/);
  assert.match(source, /data-home-campaign-banner[^>]*hidden/);
  assert.match(source, /home-campaign-banner-active/);
  assert.match(source, /getHomeCampaignContent\(locale\)/);
  assert.match(source, /title: homeCampaignContent\.title/);
  assert.match(source, /detail: homeCampaignContent\.detail/);
  assert.doesNotMatch(source, /DeepSeek V4 Flash/);
  assert.doesNotMatch(source, /deepseek_v4_flash/);
  assert.doesNotMatch(source, /deepseek-v4-flash/);
  assert.doesNotMatch(source, /home-campaign-banner__disclaimer/);
  assert.doesNotMatch(source, /套餐内的<strong>无限制模型额度<\/strong>与<strong>免费生成次数<\/strong>/);
  assert.doesNotMatch(source, /2026-08-22T00:00:00\+08:00/);
});

test('home campaign banner uses the approved top-intelligence message in every active locale', () => {
  const zh = getHomeCampaignContent('zh');
  assert.equal(zh.title, '这次，顶级智能放开用。');
  assert.equal(zh.detail, 'DeepSeek V4 Pro 与 V4 Flash · 两周免费用');
  for (const content of Object.values(HOME_CAMPAIGN_CONTENT_BY_LOCALE)) {
    assert.ok(content.detail.indexOf('V4 Pro') < content.detail.indexOf('V4 Flash'));
  }

  const english = getHomeCampaignContent('en');
  for (const locale of LANDING_LOCALES) {
    const copy = getHomeCampaignContent(locale.code);
    assert.notEqual(copy.title.trim(), '', `missing home campaign title for ${locale.code}`);
    assert.match(copy.detail, /V4 Flash/, `missing Flash model name in home campaign detail for ${locale.code}`);
    assert.match(copy.detail, /V4 Pro/, `missing Pro model name in home campaign detail for ${locale.code}`);
    if (locale.code !== 'en') {
      assert.notEqual(copy.title, english.title, `home campaign title fell back to English for ${locale.code}`);
      assert.notEqual(copy.detail, english.detail, `home campaign detail fell back to English for ${locale.code}`);
    }
  }
});
