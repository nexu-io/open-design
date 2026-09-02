import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const PAGE_PATH = new URL('../app/pages/refund-policy/index.astro', import.meta.url);
const LOCALIZED_PAGE_PATH = new URL(
  '../app/pages/[locale]/refund-policy/index.astro',
  import.meta.url,
);
const TERMS_PAGE_PATH = new URL('../app/pages/terms/index.astro', import.meta.url);
const LAYOUT_PATH = new URL('../app/_components/sub-page-layout.astro', import.meta.url);

describe('refund policy page', () => {
  it('publishes a localized policy with the seven-day zero-use rule', async () => {
    assert.ok(existsSync(PAGE_PATH), 'missing canonical /refund-policy/ page');
    assert.ok(
      existsSync(LOCALIZED_PAGE_PATH),
      'missing localized /:locale/refund-policy/ wrapper',
    );

    const [{ getRefundPolicyContent }, { getHeaderLocaleSwitcher }, page, localizedPage, layout] = await Promise.all([
      import('../app/_lib/refund-policy-content.ts'),
      import('../app/i18n.ts'),
      readFile(PAGE_PATH, 'utf8'),
      readFile(LOCALIZED_PAGE_PATH, 'utf8'),
      readFile(LAYOUT_PATH, 'utf8'),
    ]);
    const zh = getRefundPolicyContent('zh');
    const en = getRefundPolicyContent('en');
    const zhPolicy = zh.sections
      .flatMap((section) => section.items.map((item) => `${item.lead} ${item.detail ?? ''}`))
      .join(' ');
    const enPolicy = en.sections
      .flatMap((section) => section.items.map((item) => `${item.lead} ${item.detail ?? ''}`))
      .join(' ');

    assert.equal(zh.sections.length, 4);
    assert.equal(en.sections.length, 4);
    assert.match(zhPolicy, /付款成功后 7 个自然日内/);
    assert.match(zhPolicy, /付费权益.*未使用/);
    assert.match(zhPolicy, /全额退款/);
    assert.match(enPolicy, /7 calendar days/i);
    assert.match(zhPolicy, /10 个工作日内.*发起退款/);
    assert.match(zhPolicy, /后台记录/);
    assert.equal('faq' in zh, false);
    assert.equal('timing' in zh, false);
    assert.equal('applySteps' in zh, false);

    assert.match(page, /support@open-design\.ai/);
    assert.match(page, /getRefundPolicyContent/);
    assert.match(page, /availableLocaleCodes=\{\['en', 'zh'\]\}/);
    assert.match(page, /suppressLocaleAutoRedirect/);
    assert.deepEqual(
      getHeaderLocaleSwitcher('en', '/refund-policy/', {
        availableLocaleCodes: ['en', 'zh'],
      }).options.map((option) => option.code),
      ['en', 'zh'],
    );
    assert.match(layout, /availableAltEntries\.filter\(\(entry\) => entry\.locale\.code !== locale\)/);
    assert.match(localizedPage, /LANDING_LOCALES/);
    assert.match(localizedPage, /locale\.code === 'zh'/);
    assert.match(localizedPage, /<RefundPolicyPage\s*\/>/);
  });

  it('tracks the support email click with the refund policy context', async () => {
    const page = await readFile(PAGE_PATH, 'utf8');

    assert.match(page, /data-refund-support-link/);
    assert.match(page, /window\.__odTrack\?\.\('ui_click'/);
    assert.match(page, /page_name:\s*'refund_policy'/);
    assert.match(page, /area:\s*'footer'/);
    assert.match(page, /element:\s*'support_email'/);
  });

  it('links billing terms to the localized refund policy', async () => {
    const terms = await readFile(TERMS_PAGE_PATH, 'utf8');

    assert.match(terms, /localizedHref/);
    assert.match(terms, /href=\{refundPolicyHref\}/);
  });
});
