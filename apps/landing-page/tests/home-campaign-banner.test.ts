import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(
  new URL('../app/pages/index.astro', import.meta.url),
  'utf8',
);
const campaign = readFileSync(
  new URL('../app/_lib/pricing-campaign-content.ts', import.meta.url),
  'utf8',
);
const homeCampaign = readFileSync(
  new URL('../app/_lib/home-campaign-content.ts', import.meta.url),
  'utf8',
);
const campaignConfig = readFileSync(
  new URL('../app/_lib/deepseek-v4-pro-campaign.ts', import.meta.url),
  'utf8',
);

test('home campaign banner keeps only the arrow visible while preserving an accessible link label', () => {
  assert.doesNotMatch(source, /限时抢购/);
  assert.match(campaign, /linkLabel: '查看活动权益'/);
  assert.match(campaign, /windowLabel: '活动倒计时'/);
  assert.match(source, /home-campaign-banner__badge/);
  assert.match(source, /data-home-campaign-countdown/);
  assert.match(source, /data-campaign-window-label/);
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
  assert.match(source, /const eligible = Date\.now\(\) >= startAt && Date\.now\(\) < endAt/);
  assert.match(source, /\.\.\.\(eligible \? \{ campaign_id: 'deepseek_v4_pro' \} : \{\}\)/);
  assert.match(source, /window\.__odAttributedUrl/);
  assert.match(source, /localStorage\.setItem\(dismissKey, '1'\)/);
  assert.match(source, /<div class="home-campaign-banner"/);
  assert.doesNotMatch(source, /<a class="home-campaign-banner"/);
});

test('home campaign banner has no review preview backdoor', () => {
  assert.doesNotMatch(source, /data-campaign-review-param/);
  assert.doesNotMatch(source, /reviewParam|campaignPreview|previewEndAt/);
  assert.doesNotMatch(campaignConfig, /reviewParam/);
});

test('home campaign banner uses the fixed two-week activity window', () => {
  assert.match(source, /DEEPSEEK_V4_PRO_CAMPAIGN\.startAt/);
  assert.match(source, /DEEPSEEK_V4_PRO_CAMPAIGN\.endAtExclusive/);
  assert.match(source, /now >= startAt && now < endAt/);
  assert.match(source, /data-home-campaign-banner[^>]*hidden/);
  assert.match(source, /home-campaign-banner-active/);
  assert.match(homeCampaign, /这次，顶级智能放开用。/);
  assert.match(homeCampaign, /這次，頂級智能放開用。/);
  assert.match(homeCampaign, /DeepSeek V4 Pro 与 V4 Flash · 两周免费用/);
  assert.match(homeCampaign, /最高峰の知性/);
  assert.match(campaign, /DeepSeek V4 Pro and V4 Flash · FREE for two weeks/);
  for (const locale of ['en', 'zh', 'ja', 'ko', 'de', 'fr', 'ru', 'es', 'pt-br', 'it', 'tr']) {
    assert.match(campaign, new RegExp(`^  ['"]?${locale.replace('-', '\\-')}['"]?: \\{`, 'm'));
  }
  assert.match(campaignConfig, /endAtExclusive: '2026-08-27T20:00:00\+08:00'/);
  assert.doesNotMatch(source, /home-campaign-banner__disclaimer/);
  assert.doesNotMatch(source, /套餐内的<strong>无限制模型额度<\/strong>与<strong>免费生成次数<\/strong>/);
  assert.doesNotMatch(source, /2026-08-22T00:00:00\+08:00/);
});
