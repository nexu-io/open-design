import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(
  new URL('../app/pages/index.astro', import.meta.url),
  'utf8',
);

test('home campaign banner keeps only the arrow visible while preserving an accessible link label', () => {
  assert.doesNotMatch(source, /限时抢购/);
  assert.match(source, /linkLabel: '查看活动权益'/);
  assert.match(source, /badge: '活动倒计时'/);
  assert.match(source, /home-campaign-banner__badge/);
  assert.match(source, /data-home-campaign-countdown/);
  assert.match(source, /活动剩余/);
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
  assert.match(source, /window\.__odRecordCampaignEntry\?\.\('landing_home_banner', 'deepseek_v4_flash'\)/);
  assert.match(source, /window\.__odAttributedUrl/);
  assert.match(source, /localStorage\.setItem\(dismissKey, '1'\)/);
  assert.match(source, /<div class="home-campaign-banner"/);
  assert.doesNotMatch(source, /<a class="home-campaign-banner"/);
});

test('home campaign banner has no URL preview backdoor left', () => {
  // Product decision: the former ?campaign= preview fixture is fully removed.
  // Banner visibility is decided by the real activity window only; pre-launch
  // review happens by temporarily overriding the startAt constant.
  assert.doesNotMatch(source, /data-campaign-revie[w]/);
  assert.doesNotMatch(source, /reviewPara[m]|reviewAllowe[d]|previewEndA[t]/);
  assert.doesNotMatch(source, /get\('campaign'\)/);
});

test('home campaign banner uses the fixed seven-day activity window', () => {
  assert.match(source, /DEEPSEEK_V4_FLASH_CAMPAIGN\.startAt/);
  assert.match(source, /DEEPSEEK_V4_FLASH_CAMPAIGN\.endAtExclusive/);
  assert.match(source, /now >= startAt && now < endAt/);
  assert.match(source, /data-home-campaign-banner[^>]*hidden/);
  assert.match(source, /home-campaign-banner-active/);
  assert.match(source, /8 月 6 日—8 月 13 日，一周免费用/);
  assert.match(source, /FREE all week/);
  assert.doesNotMatch(source, /home-campaign-banner__disclaimer/);
  assert.doesNotMatch(source, /套餐内的<strong>无限制模型额度<\/strong>与<strong>免费生成次数<\/strong>/);
  assert.doesNotMatch(source, /2026-08-22T00:00:00\+08:00/);
});
