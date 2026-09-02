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
const PRICING_PAGE_PATH = new URL('../app/pages/pricing/index.astro', import.meta.url);

describe('refund policy page', () => {
  it('publishes the regional policy in the selected language', async () => {
    assert.ok(existsSync(PAGE_PATH), 'missing canonical /refund-policy/ page');
    assert.ok(
      existsSync(LOCALIZED_PAGE_PATH),
      'missing localized /:locale/refund-policy/ wrapper',
    );

    const [
      { getRefundPolicyContent },
      { getMoreFaqLabel },
      { getHeaderLocaleSwitcher, LANDING_LOCALES },
      page,
      localizedPage,
      layout,
      pricingPage,
    ] = await Promise.all([
      import('../app/_lib/refund-policy-content.ts'),
      import('../app/_lib/pricing-extras-content.ts'),
      import('../app/i18n.ts'),
      readFile(PAGE_PATH, 'utf8'),
      readFile(LOCALIZED_PAGE_PATH, 'utf8'),
      readFile(LAYOUT_PATH, 'utf8'),
      readFile(PRICING_PAGE_PATH, 'utf8'),
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
    assert.match(zhPolicy, /欧盟、英国或土耳其.*14 天内/);
    assert.match(zhPolicy, /韩国.*7 天内/);
    assert.match(zhPolicy, /所有其他客户.*48 小时内/);
    assert.match(enPolicy, /EU, UK, or Turkey.*14 days/);
    assert.match(enPolicy, /South Korea.*7 days/);
    assert.match(enPolicy, /All other customers.*48 hours/);
    assert.match(zh.sections[0].intro ?? '', /第一次退款请求获批后.*第二次退款请求/);
    assert.match(zh.sections[0].closing ?? '', /过度使用.*拒绝/);
    assert.match(en.sections[0].intro ?? '', /first refund request.*second refund request/);
    assert.match(en.sections[0].closing ?? '', /excessive use.*declined/);
    assert.doesNotMatch(zhPolicy, /一旦使用，则不支持退款/);
    const activeLocaleCodes = LANDING_LOCALES.map((locale) => locale.code);
    assert.deepEqual(activeLocaleCodes, [
      'en',
      'zh',
      'ja',
      'ko',
      'de',
      'fr',
      'ru',
      'es',
      'pt-br',
      'it',
      'tr',
    ]);
    for (const locale of activeLocaleCodes) {
      const policy = getRefundPolicyContent(locale);
      const policyText = [
        ...policy.preamble,
        ...policy.sections.flatMap((section) => [
          section.title,
          section.intro ?? '',
          section.closing ?? '',
          ...section.items.flatMap((item) => [item.lead, item.detail ?? '']),
        ]),
      ].join(' ');
      assert.equal(policy.locale, locale, `${locale}: fell back to another locale`);
      assert.equal(policy.sections.length, 4, `${locale}: incomplete policy`);
      assert.equal(
        policy.sections[0]?.inlineItemCount,
        2,
        `${locale}: regional rules must render as prose before the remaining-customer list`,
      );
      assert.equal(
        policy.sections[0]?.items.slice(policy.sections[0].inlineItemCount).length,
        1,
        `${locale}: only the all-other-customers rule should remain in the list`,
      );
      assert.match(policyText, /support@open-design\.ai/, `${locale}: missing support email`);
      assert.match(policyText, /14/, `${locale}: missing EU/UK/Turkey deadline`);
      assert.match(policyText, /7/, `${locale}: missing South Korea deadline`);
      assert.match(policyText, /48/, `${locale}: missing all-other-customers deadline`);
      assert.match(policyText, /10/, `${locale}: missing processing deadline`);

      assert.ok(
        getMoreFaqLabel(locale).length > 0,
        `${locale}: missing localized pricing refund-policy entry`,
      );
    }
    assert.match(zhPolicy, /10 个工作日内.*发起退款/);
    assert.match(zhPolicy, /后台记录/);
    assert.equal('faq' in zh, false);
    assert.equal('timing' in zh, false);
    assert.equal('applySteps' in zh, false);

    assert.match(page, /getRefundPolicyContent/);
    assert.match(page, /availableLocaleCodes=\{LANDING_LOCALES\.map/);
    assert.match(page, /suppressLocaleAutoRedirect/);
    assert.match(page, /section\.items\.slice\(0, section\.inlineItemCount\)/);
    assert.match(page, /section\.items\.slice\(section\.inlineItemCount \?\? 0\)/);
    assert.match(
      pricingPage,
      /<a class="pr-faq-more" href=\{refundPolicyHref\}>\{moreFaqLabel\}<\/a>/,
    );
    assert.deepEqual(
      getHeaderLocaleSwitcher('en', '/refund-policy/', {
        availableLocaleCodes: activeLocaleCodes,
      }).options.map((option) => option.code),
      activeLocaleCodes,
    );
    assert.match(layout, /availableAltEntries\.filter\(\(entry\) => entry\.locale\.code !== locale\)/);
    assert.match(localizedPage, /LANDING_LOCALES/);
    assert.match(localizedPage, /locale\.code !== 'en'/);
    assert.match(localizedPage, /<RefundPolicyPage\s*\/>/);
    assert.match(pricingPage, /const refundPolicyHref = href\('\/refund-policy\/'\)/);
  });

  it('omits the duplicate footer contact block', async () => {
    const page = await readFile(PAGE_PATH, 'utf8');

    assert.doesNotMatch(page, /class="refund-footer"/);
    assert.doesNotMatch(page, /data-refund-support-link/);
    assert.doesNotMatch(page, /\.refund-footer/);
    assert.doesNotMatch(page, /element:\s*'support_email'/);
  });

  it('links billing terms to the localized refund policy', async () => {
    const terms = await readFile(TERMS_PAGE_PATH, 'utf8');

    assert.match(terms, /localizedHref/);
    assert.match(terms, /href=\{refundPolicyHref\}/);
  });
});
