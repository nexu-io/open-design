import assert from "node:assert/strict";
import { glob, readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CLOUD_CONSOLE_BASE_PARAM,
  DEFAULT_CLOUD_CONSOLE_BASE_URL,
  CLOUD_CONSOLE_URL,
  PLANS_JSON_URL,
  PRICING_SNAPSHOT,
  cloudSubscribeUrl,
  cloudTeamSubscribeUrl,
  formatUsd,
  resolveCloudConsoleBase,
  scopedBillingPlanUrl,
  teamIntroTotalUsd,
  type PricingContract,
} from "../app/_lib/pricing.ts";
import {
  PRICING_LOCALES,
  TEAM_PRICING_CONTENT_BY_LOCALE,
} from "../app/_lib/pricing-team-content.ts";
import {
  PREMIUM_MODELS,
  getCurrentPlanLabel,
  getPricingPlanActionLabels,
  getPricingContent,
} from "../app/_lib/pricing-content.ts";
import {
  isPersonalPlanAtOrBelow,
  loadCurrentPersonalPlanTier,
  personalPlanRelation,
} from "../app/_lib/pricing-current-plan.ts";
import { LANDING_LOCALES } from "../app/i18n.ts";
import { DEEPSEEK_V4_PRO_CAMPAIGN } from "../app/_lib/deepseek-v4-pro-campaign.ts";

const CONTRACT_PATH = new URL("../public/pricing/plans.json", import.meta.url);
const HEADERS_PATH = new URL("../public/_headers", import.meta.url);
const PRICING_MD_PATH = new URL("../public/pricing.md", import.meta.url);
const PRICING_PAGE_PATH = new URL(
  "../app/pages/pricing/index.astro",
  import.meta.url,
);
const PRICING_INDIVIDUAL_PATH = new URL(
  "../app/_components/pricing-individual-plans.astro",
  import.meta.url,
);
const PRICING_CONTENT_PATH = new URL(
  "../app/_lib/pricing-content.ts",
  import.meta.url,
);
const MIMO_LOGO_PATH = new URL(
  "../public/pricing-e-final/assets/mimo-logo-user-CWOWEwG5.png",
  import.meta.url,
);
const ZHIPU_LOGO_PATH = new URL(
  "../public/pricing-e-final/assets/zai-logo-official-Byn-xbrp.png",
  import.meta.url,
);
const FIRST_PARTY_MODEL_ICON_PATHS = [
  "../public/agents/deepseek.svg",
  "../public/agents/openai.svg",
  "../public/model-icons/claude.svg",
  "../public/model-icons/grok.svg",
  "../public/model-icons/jimeng.svg",
  "../public/model-icons/kimi.svg",
  "../public/model-icons/minimax.svg",
  "../public/model-icons/nanobanana.svg",
].map((path) => new URL(path, import.meta.url));
const CAMPAIGN_PATH = new URL(
  "../app/_lib/pricing-campaign-content.ts",
  import.meta.url,
);
const TEAM_CONTENT_PATH = new URL(
  "../app/_lib/pricing-team-content.ts",
  import.meta.url,
);
const MAX_LOGO_PATH = new URL(
  "../public/pricing/plan-max.svg",
  import.meta.url,
);

function assertPlanContract(value: unknown): asserts value is PricingContract {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);

  const contract = value as PricingContract;
  assert.equal(contract.version, 2);
  assert.equal(contract.currency, "USD");
  assert.equal(typeof contract.overageDeployPriceUsd, "number");
  assert.equal(Array.isArray(contract.tiers), true);
  assert.deepEqual(
    contract.tiers.map((tier) => tier.tier),
    ["plus", "pro", "max"],
  );
  assert.deepEqual(
    contract.teamTiers.map((tier) => tier.tier),
    ["team_basic", "team_plus", "team_pro", "team_max"],
  );

  for (const tier of contract.tiers) {
    assert.equal(typeof tier.rank, "number");
    assert.equal(typeof tier.recommended, "boolean");
    assert.equal(typeof tier.deployLimit, "number");
    assert.equal(typeof tier.monthly.priceUsd, "number");
    assert.equal(typeof tier.monthly.introPriceUsd, "number");
    assert.equal(typeof tier.monthly.grantUsd, "number");
    assert.equal(typeof tier.yearly.priceUsd, "number");
    assert.equal(typeof tier.yearly.discountPct, "number");
    assert.equal(typeof tier.yearly.grantUsd, "number");
  }

  for (const tier of contract.teamTiers) {
    assert.equal(typeof tier.rank, "number");
    assert.equal(typeof tier.recommended, "boolean");
    assert.equal(typeof tier.minSeats, "number");
    assert.equal(typeof tier.monthlyCreditsPerSeatUsd, "number");
    assert.equal(typeof tier.monthly.priceUsd, "number");
    assert.equal(typeof tier.monthly.introPriceUsd, "number");
    assert.equal(typeof tier.yearly.priceUsd, "number");
    assert.equal(typeof tier.yearly.introPriceUsd, "number");
    assert.equal(typeof tier.yearly.discountPct, "number");
  }
}

describe("pricing contract", () => {
  it("keeps the reviewed individual-plan visuals aligned with the demo", async () => {
    const [plans, mimoLogo, zhipuLogo] = await Promise.all([
      readFile(PRICING_INDIVIDUAL_PATH, "utf8"),
      readFile(MIMO_LOGO_PATH),
      readFile(ZHIPU_LOGO_PATH),
    ]);

    assert.ok(mimoLogo.byteLength > 0);
    assert.ok(zhipuLogo.byteLength > 0);
    assert.match(plans, /mimo-logo-user-CWOWEwG5\.png/);
    assert.match(plans, /zai-logo-official-Byn-xbrp\.png/);
    assert.match(plans, /model-logo-(?:mimo|zhipu|nanobanana)/);
    assert.match(
      plans,
      /\.discount-corner-badge\s*\{[^}]*border:\s*0;/s,
    );
    assert.match(plans, /<div class="plan-model-modules">/);
    assert.match(
      plans,
      /\.plan-max \.plan-model-module li\.model-with-status em\.unlimited,[\s\S]*?background:\s*rgba\(120, 234, 87, 0\.14\);/,
    );
    assert.match(plans, /'long-model-name': model\.name\.length > 24/);
    assert.match(
      plans,
      /\.plan-model-module li > span\.long-model-name\s*\{[^}]*font-size:\s*10\.5px;/s,
    );
    assert.doesNotMatch(plans, /data-benefits-expanded|data-benefits-toggle/);
    assert.doesNotMatch(plans, /<section class="individual-usage-module"|<section class="all-models-comparison"/);
  });

  it("matches the demo's individual taglines and compact billing copy", async () => {
    const content = getPricingContent("en");
    const zhContent = getPricingContent("zh");
    const zhTwContent = getPricingContent("zh-tw");
    const individualPlans = await readFile(PRICING_INDIVIDUAL_PATH, "utf8");

    assert.deepEqual(
      [
        content.go.tagline,
        content.plans.plus.tagline,
        content.plans.pro.tagline,
        content.plans.max.tagline,
      ],
      [
        "Light needs · Easy delivery",
        "Everyday design · Continuous delivery",
        "Complex projects · Efficient production",
        "High-volume creation · Consistent output",
      ],
    );
    for (const localizedContent of [zhContent, zhTwContent]) {
      assert.deepEqual(
        [
          localizedContent.go.tagline,
          localizedContent.plans.plus.tagline,
          localizedContent.plans.pro.tagline,
          localizedContent.plans.max.tagline,
        ].some((tagline) => tagline.includes("零配置即用")),
        false,
      );
    }
    assert.equal(content.labels.monthlyRenewal, "First-month price");
    assert.equal(content.labels.yearlySubline, "Billed {totalUsd}/year");
    assert.deepEqual(
      [
        content.go.ctaLabel,
        content.plans.plus.ctaLabel,
        content.plans.pro.ctaLabel,
        content.plans.max.ctaLabel,
      ],
      ["Unavailable", "Subscribe", "Subscribe", "Subscribe"],
    );
    assert.match(
      individualPlans,
      /<span>\{tierCopy\[tier\]\.ctaLabel\}<\/span>/,
    );
    assert.doesNotMatch(individualPlans, /ctaLabel\} · \{L\.(?:monthly|yearly)\}/);
    assert.match(
      individualPlans,
      /const compactSavings = \(amountUsd: number, interval: 'monthly' \| 'yearly'\)/,
    );
    assert.match(individualPlans, /const amount = formatUsd\(amountUsd\);/);
    assert.match(
      individualPlans,
      /locale === 'en' && interval === 'monthly' \? `\$\{amount\}\/mo` : amount/,
    );
    assert.match(
      individualPlans,
      /const compactBillingTotal = \(amountUsd: number\) =>\s*locale === 'en'/,
    );
    const compactSavingsBlock = individualPlans.match(
      /const compactSavings = \(amountUsd: number, interval: 'monthly' \| 'yearly'\) => \{([\s\S]*?)\n\};/,
    )?.[1];
    assert.ok(compactSavingsBlock);
    assert.doesNotMatch(compactSavingsBlock, /replace\('\$', ''\)/);
  });

  it("keeps the domain and third-party API key copy unambiguous", async () => {
    const content = getPricingContent("en");
    const zhContent = getPricingContent("zh");
    const zhTwContent = getPricingContent("zh-tw");
    const individualPlans = await readFile(PRICING_INDIVIDUAL_PATH, "utf8");

    assert.equal(content.personal.customDomains, "{count} domains");
    assert.equal(content.personal.unlimitedCustomDomains, "Unlimited domains");
    assert.equal(content.personal.bringYourOwnApiKey, "Supports third-party API keys");
    assert.equal(
      content.personal.bringYourOwnApiKeyHelp,
      "Connect API keys from other model providers and use their models in Open Design. This plan does not provide public API access.",
    );
    assert.equal(zhContent.personal.customDomains, "支持 {count} 个域名");
    assert.equal(zhContent.personal.unlimitedCustomDomains, "域名无限量");
    assert.equal(zhContent.personal.bringYourOwnApiKey, "支持接入第三方 API Key");
    assert.equal(
      zhContent.personal.bringYourOwnApiKeyHelp,
      "可绑定其他模型服务商的 API Key，在 Open Design 中调用对应模型；本套餐不提供对外 API 服务。",
    );
    assert.equal(zhTwContent.personal.customDomains, "支援 {count} 個網域");
    assert.equal(zhTwContent.personal.unlimitedCustomDomains, "網域無限量");
    assert.equal(zhTwContent.personal.bringYourOwnApiKey, "支援接入第三方 API Key");
    assert.equal(
      getPricingContent("ja").personal.bringYourOwnApiKeyHelp,
      "他のモデル提供元の API キーを紐づけ、Open Design 内でそのモデルを利用できます。このプランは外部向け API サービスを提供しません。",
    );
    assert.match(individualPlans, /P\.bringYourOwnApiKeyHelp/);
    assert.doesNotMatch(individualPlans, /const apiKeyHelp = locale === 'zh'/);
    assert.match(individualPlans, /class="benefit-help-trigger"/);
    assert.match(individualPlans, /class="benefit-help-tooltip"/);
    assert.match(individualPlans, /role="tooltip"/);
    assert.match(
      individualPlans,
      /\.pricing-card:has\(\.benefit-help:hover\),\s*\.pricing-card:has\(\.benefit-help:focus-within\)/,
    );
  });

  it("animates billing-price changes and compact-card View all reveals", async () => {
    const individualPlans = await readFile(PRICING_INDIVIDUAL_PATH, "utf8");

    assert.match(
      individualPlans,
      /\.rolling-price-number\s*\{[^}]*animation:\s*pricing-number-roll-in 0\.38s cubic-bezier\(0\.22, 0\.72, 0\.24, 1\);/s,
    );
    assert.match(
      individualPlans,
      /@keyframes pricing-number-roll-in\s*\{[^}]*translateY\(72%\)[\s\S]*?translateY\(0\)/,
    );
    assert.match(
      individualPlans,
      /\.plan-model-module\.is-expanded li:nth-child\(n \+ 4\)\s*\{[^}]*animation:\s*model-item-reveal 0\.22s ease-out forwards;/s,
    );
    assert.match(individualPlans, /animation-delay:\s*125ms;/);
    assert.match(
      individualPlans,
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.rolling-price-number,[\s\S]*?\.plan-model-module\.is-expanded li:nth-child\(n \+ 4\)\s*\{[^}]*animation:\s*none;/,
    );
  });

  it("keeps recommendation ribbons legible, animated, and motion-safe", async () => {
    const individualPlans = await readFile(PRICING_INDIVIDUAL_PATH, "utf8");

    assert.match(
      individualPlans,
      /\.new-plan-ribbon\s*\{[^}]*font-size:\s*11px;/s,
    );
    assert.match(
      individualPlans,
      /\.new-plan-ribbon\s*\{[^}]*background:\s*var\(--pricing-accent\);/s,
    );
    assert.match(
      individualPlans,
      /\.new-plan-ribbon span\s*\{[^}]*background:\s*linear-gradient\(110deg,[^}]*animation:\s*pricing-ribbon-text-shimmer 4\.2s linear infinite;/s,
    );
    assert.match(
      individualPlans,
      /\.new-plan-ribbon span\s*\{[^}]*-webkit-text-fill-color:\s*transparent;[^}]*background-clip:\s*text;/s,
    );
    assert.doesNotMatch(individualPlans, /\.new-plan-ribbon::after/);
    assert.match(
      individualPlans,
      /@keyframes pricing-ribbon-text-shimmer\s*\{[^}]*background-position:\s*100% 0;[^}]*\}[^}]*background-position:\s*-100% 0;/s,
    );
    assert.match(
      individualPlans,
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.new-plan-ribbon span\s*\{[^}]*-webkit-text-fill-color:\s*#173111;[^}]*animation:\s*none;/,
    );
  });

  it("lets localized plan and billing copy wrap inside each pricing card", async () => {
    const individualPlans = await readFile(PRICING_INDIVIDUAL_PATH, "utf8");

    assert.match(
      individualPlans,
      /\.plan-top\s*\{[^}]*min-height:\s*78px;/s,
    );
    assert.match(
      individualPlans,
      /\.plan-top p\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s,
    );
    assert.match(
      individualPlans,
      /\.compact-price-detail\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\);[^}]*align-items:\s*center;[^}]*min-height:\s*46px;/s,
    );
    assert.match(
      individualPlans,
      /\.compact-price-detail > small\s*\{[^}]*min-width:\s*0;[^}]*text-align:\s*right;[^}]*white-space:\s*nowrap;/s,
    );
  });

  it("serves the model comparison icons from first-party assets", async () => {
    const [individualPlans, ...icons] = await Promise.all([
      readFile(PRICING_INDIVIDUAL_PATH, "utf8"),
      ...FIRST_PARTY_MODEL_ICON_PATHS.map((path) => readFile(path)),
    ]);

    for (const icon of icons) assert.ok(icon.byteLength > 0);
    assert.doesNotMatch(individualPlans, /unpkg\.com|@latest/);
    for (const asset of [
      "/agents/deepseek.svg",
      "/agents/openai.svg",
      "/model-icons/claude.svg",
      "/model-icons/grok.svg",
      "/model-icons/jimeng.svg",
      "/model-icons/kimi.svg",
      "/model-icons/minimax.svg",
      "/model-icons/nanobanana.svg",
    ]) {
      assert.ok(individualPlans.includes(asset), asset);
    }
    for (const superseded of [
      "/agents/anthropic.svg",
      "/agents/gemini.svg",
      "/agents/minimax.svg",
      "/agents/moonshot.svg",
      "/agents/xai.svg",
      "/model-icons/bytedance.svg",
    ]) {
      assert.equal(individualPlans.includes(superseded), false, superseded);
    }
  });

  it("keeps the sold-out Go card instead of a Free entry card", async () => {
    const [page, individualPlans] = await Promise.all([
      readFile(PRICING_PAGE_PATH, "utf8"),
      readFile(PRICING_INDIVIDUAL_PATH, "utf8"),
    ]);

    assert.match(page, /<PricingIndividualPlans \/>/);
    assert.doesNotMatch(page, /\{false && \(/);
    assert.doesNotMatch(page, /<section class="pr-grid"/);
    assert.match(individualPlans, /tier:\s*'go' as const/);
    assert.match(individualPlans, /data-pricing-cta\s+data-tier=\{tier\}/);
    assert.match(individualPlans, /go:\s*content\.go/);
    assert.match(individualPlans, /GO_PLAN_SOLD_OUT/);
    assert.match(individualPlans, /`plan-\$\{tier\}`/);
    assert.match(
      individualPlans,
      /\.plan-model-module\.unavailable-model-module\s*\{[^}]*background:\s*#f1f2ee;/,
    );
    assert.doesNotMatch(
      individualPlans,
      /\.plan-(?:go|free) \.plan-model-module\.unavailable-model-module/,
    );
    assert.doesNotMatch(individualPlans, /\.plan-free /);
    assert.match(
      individualPlans,
      /tier !== 'go' && <em class="multimodal-status">\{fillTemplate\(P\.upToResolution/,
    );
    assert.match(page, /name:\s*'OpenDesign Go'/);
    assert.match(page, /price:\s*String\(GO_PLAN\.monthly\.priceUsd\)/);
    assert.match(individualPlans, /DeepSeek V4 Flash/);
    assert.match(individualPlans, /GLM-5\.1/);
  });

  it("renders the live Personal comparison from localized pricing content", async () => {
    const individualPlans = await readFile(PRICING_INDIVIDUAL_PATH, "utf8");

    assert.equal(getPricingContent("zh").go.ctaLabel, "已停售");
    assert.equal(getPricingContent("zh-tw").go.ctaLabel, "已停售");
    assert.equal(getPricingContent("ja").plans.pro.ctaLabel, "Pro にアップグレード");
    assert.equal(getPricingContent("de").personal.upToResolution, "Bis zu {resolution}");
    assert.equal(getPricingContent("fr").personal.viewMoreBenefits, "Voir plus d’avantages");
    assert.equal(getPricingContent("en").personal.publishAndShare, "Publish artifacts online and share them");
    assert.equal(getPricingContent("zh").personal.publishAndShare, "支持产物发布线上与分享");
    assert.equal(getPricingContent("ja").personal.publishAndShare, "成果物をオンラインで公開して共有");
    assert.equal(getPricingContent("en").plans.plus.features[2], "{systemsCount}+ Design Systems");
    assert.equal(getPricingContent("zh").plans.plus.features[2], "{systemsCount}+ 设计系统");
    assert.equal(getPricingContent("ja").plans.plus.features[2], "{systemsCount}+ デザインシステム");
    assert.equal(getPricingContent("de").plans.plus.features[2], "{systemsCount}+ Designsysteme");
    assert.match(individualPlans, /const P = content\.personal;/);
    assert.match(individualPlans, /ctaLabel/);
    assert.match(individualPlans, /P\.upToResolution/);
    assert.doesNotMatch(individualPlans, /const isZh\s*=/);
    assert.doesNotMatch(individualPlans, />Subscribe<\/a>/);
    assert.doesNotMatch(individualPlans, />UP TO \{imageResolution\}<\/em>/);
  });

  it("removes the popular-model allowance wording and help control", async () => {
    const individualPlans = await readFile(PRICING_INDIVIDUAL_PATH, "utf8");

    assert.match(individualPlans, /<h4>\{P\.popularModels\}<\/h4>/);
    assert.doesNotMatch(
      individualPlans,
      /<details class="model-group-help"|\{P\.usageAllowanceNote\}/,
    );
  });

  it("removes model-entitlement question marks from plan cards", async () => {
    const individualPlans = await readFile(PRICING_INDIVIDUAL_PATH, "utf8");
    assert.doesNotMatch(individualPlans, /<details class="plan-model-help"/);
    assert.doesNotMatch(individualPlans, /P\.modelEntitlementActivationNote/);
  });

  it("keeps the Max wordmark readable on its dark card", async () => {
    const [individualPlans, logo] = await Promise.all([
      readFile(PRICING_INDIVIDUAL_PATH, "utf8"),
      readFile(MAX_LOGO_PATH, "utf8"),
    ]);

    assert.match(logo, /stroke="#202020"/);
    assert.match(
      individualPlans,
      /\.plan-max \.plan-wordmark-image\s*\{[^}]*filter:\s*invert\(1\) brightness\(1\.08\);/s,
    );
  });

  it("shows simple popular-model lists without allowance status text", async () => {
    const individualPlans = await readFile(PRICING_INDIVIDUAL_PATH, "utf8");

    assert.match(individualPlans, /const cardPopularModels = \[/);
    assert.doesNotMatch(individualPlans, /popularAccessStatus|unlimitedByTier|class="model-access-status"/);
  });

  it("uses the reviewed popular-model order", async () => {
    const individualPlans = await readFile(PRICING_INDIVIDUAL_PATH, "utf8");
    const displayOrderBlock = individualPlans.match(
      /const cardPopularModels = \[([\s\S]*?)\]\.map/,
    )?.[1];

    assert.ok(displayOrderBlock);
    const reviewedOrder = [
      "DeepSeek V4 Flash Vision Exp",
      "DeepSeek V4 Flash",
      "DeepSeek V4 Pro",
      "GLM-5.2",
      "Kimi K2.7 Code",
      "MiMo V2.5 Pro",
      "MiniMax M2.7",
      "Kimi K2.6",
      "GLM-5.1",
    ];
    assert.deepEqual(
      Array.from(displayOrderBlock.matchAll(/'([^']+)'/g), (match) => match[1]),
      reviewedOrder,
    );
    assert.doesNotMatch(individualPlans, /orderedPopularModels|comparisonPopular/);
  });

  it("removes the popular-model usage estimate module", async () => {
    const individualPlans = await readFile(PRICING_INDIVIDUAL_PATH, "utf8");

    assert.doesNotMatch(individualPlans, /data-usage-module/);
    assert.doesNotMatch(individualPlans, /const usageRows/);
  });

  it("makes only the English legal footnote 2pt larger than the model allowance note", async () => {
    const [page, individualPlans] = await Promise.all([
      readFile(PRICING_PAGE_PATH, "utf8"),
      readFile(PRICING_INDIVIDUAL_PATH, "utf8"),
    ]);

    assert.match(individualPlans, /\.individual-usage-note p\s*\{[^}]*font-size:\s*10\.5px;/s);
    assert.match(page, /\.pr-foot\s*\{[^}]*font-size:\s*10\.5px;/s);
    assert.match(page, /data-pricing-locale=\{locale\}/);
    assert.match(
      page,
      /\.pr-page\[data-pricing-locale='en'\] \.pr-foot\s*\{[^}]*font-size:\s*calc\(10\.5px \+ 2pt\);/s,
    );
  });

  it("renders paid flagship headings as one localized phrase", async () => {
    const individualPlans = await readFile(PRICING_INDIVIDUAL_PATH, "utf8");

    for (const locale of PRICING_LOCALES) {
      assert.match(
        getPricingContent(locale).personal.flagshipModelCount,
        /\{count\}/,
        `${locale} must localize the complete flagship count heading`,
      );
    }
    assert.equal(
      getPricingContent("en").personal.flagshipModelCount,
      "{count}+ flagship models",
    );
    assert.match(
      individualPlans,
      /\{tier === 'go' \? P\.flagshipModels : fillTemplate\(P\.flagshipModelCount, \{ count: String\(flagship\.length\) \}\)\}/,
    );
    assert.doesNotMatch(individualPlans, /\} · \$\{P\.flagshipModels\}/);
  });

  it("derives live Personal benefit totals from the catalog", async () => {
    const individualPlans = await readFile(PRICING_INDIVIDUAL_PATH, "utf8");

    assert.match(individualPlans, /import \{ getCatalogCounts \} from '\.\.\/_lib\/catalog';/);
    assert.match(individualPlans, /const catalogCounts = await getCatalogCounts\(locale\);/);
    assert.match(individualPlans, /const skillsCount = catalogCounts\.skills\.toLocaleString\('en-US'\);/);
    assert.match(individualPlans, /const systemsCount = catalogCounts\.systems\.toLocaleString\('en-US'\);/);
    assert.match(
      individualPlans,
      /const renderCatalogLabel = \(label: string\) => fillTemplate\(label, \{\s*skillsCount,\s*systemsCount,/s,
    );
    assert.match(individualPlans, /\]\.map\(renderCatalogLabel\)/);
    assert.doesNotMatch(individualPlans, /162\+ Skills|151\+ Design Systems/);
  });

  it("keeps three real benefits visible when paid tiers show a bonus badge", async () => {
    const individualPlans = await readFile(PRICING_INDIVIDUAL_PATH, "utf8");

    assert.match(
      individualPlans,
      /<li>\s*<b>✓<\/b>\s*<span>\s*\{benefit\}\s*\{bonusPct != null && index === 0 && \(\s*<span class="bonus-benefit">/s,
    );
    assert.doesNotMatch(individualPlans, /<li class="bonus-benefit">/);
    assert.match(individualPlans, /P\.publishAndShare/);
    assert.doesNotMatch(individualPlans, /data-benefits-expanded=/);
  });

  it("omits the DeepSeek peak-pricing estimate note from Personal usage", async () => {
    const individualPlans = await readFile(PRICING_INDIVIDUAL_PATH, "utf8");
    const pricingContent = await readFile(PRICING_CONTENT_PATH, "utf8");

    assert.doesNotMatch(individualPlans, /usagePeakNote/);
    assert.doesNotMatch(pricingContent, /usagePeakNote/);
    assert.doesNotMatch(pricingContent, /DeepSeek V4 Flash \/ Pro estimates use off-peak pricing/);
  });

  it("keeps only the top Pricing campaign banner", async () => {
    const [page, banner] = await Promise.all([
      readFile(PRICING_PAGE_PATH, "utf8"),
      readFile(new URL("../app/_components/pricing-campaign-banner.astro", import.meta.url), "utf8"),
    ]);
    const campaign = await readFile(CAMPAIGN_PATH, "utf8");

    assert.match(campaign, /DeepSeek V4 Pro 与 V4 Flash · 两周免费用/);
    assert.match(campaign, /badge: '无限使用'/);
    assert.match(campaign, /windowLabel: '活动倒计时'/);
    assert.match(campaign, /dayUnit: '天'/);
    assert.doesNotMatch(page, /data-pricing-campaign-countdown/);
    assert.match(page, /<PricingCampaignBanner locale=\{locale\} \/>/);
    assert.match(banner, /class="pricing-campaign-banner"/);
    assert.match(banner, /data-pricing-top-countdown/);
    assert.doesNotMatch(page, /<aside class="pr-campaign"/);
    assert.doesNotMatch(page, /距开始/);
    assert.match(campaign, /FREE for two weeks/);
    assert.match(campaign, /body: 'DeepSeek V4 Pro 与 V4 Flash · 两周免费用'/);
    assert.match(campaign, /body: 'DeepSeek V4 Pro and V4 Flash · FREE for two weeks'/);
    assert.match(campaign, /body: 'DeepSeek V4 Pro 與 V4 Flash · 兩週免費用'/);
    for (const locale of ['en', 'zh', 'zh-tw', 'ja', 'ko', 'de', 'fr', 'ru', 'es', 'pt-br', 'it', 'tr']) {
      const key = locale.includes('-') ? `'${locale}'` : locale;
      const start = campaign.indexOf(`  ${key}: {`);
      const end = campaign.indexOf('\n  },', start);
      const block = start >= 0 && end >= 0 ? campaign.slice(start, end) : undefined;
      assert.ok(block, `missing campaign copy for ${locale}`);
      assert.match(block, /DeepSeek V4 Pro/);
      assert.match(block, /DeepSeek V4 Flash/);
      assert.match(block, /headline:/);
      assert.match(block, /body:/);
    }
    assert.doesNotMatch(campaign, /body: ['\"][^'\"]*20:00/);
    assert.match(campaign, /paidBenefitNote: '8月13日—8月27日 · 两周免费用'/);
    assert.match(campaign, /teamBenefitNote: '8月13日—8月27日 · 两周免费用'/);
    assert.match(page, /DEEPSEEK_V4_PRO_CAMPAIGN\.startAt/);
    assert.match(page, /DEEPSEEK_V4_PRO_CAMPAIGN\.endAtExclusive/);
    assert.match(page, /now >= campaignStartAt && now < campaignEndAt/);
    assert.doesNotMatch(page, /data-pricing-campaign-surface/);
    assert.doesNotMatch(page, /class="pr-campaign-disclaimer"/);
    assert.match(campaign, /套餐内的无限制模型额度与免费生成次数，仅可通过OpenDesign使用/);
    assert.match(page, /<p class="pr-foot" set:html=\{footnoteHtml\} \/>/);
    assert.doesNotMatch(page, /套餐内的<strong>无限制模型额度<\/strong>与<strong>免费生成次数<\/strong>/);
    assert.doesNotMatch(page, /area:\s*'campaign_banner'/);
    assert.match(page, /element:\s*'deepseek_v4_pro_benefit'/);
    assert.match(page, /window\.__odRecordCampaignEntry\?\./);
    assert.match(page, /'landing_pricing_team_plan'\s*:\s*'landing_pricing_personal_plan'/);
    assert.match(page, /'deepseek_v4_pro'/);
    // First-touch envelope + device id survive Pricing → Cloud. Campaign id is
    // re-decided by campaignEligible and written only via __odAttributedUrl.
    assert.match(page, /'od_conversion_source',\s*'od_device_id'/);
    assert.match(page, /od_campaign_id is intentionally NOT forwarded/);
    assert.match(page, /window\.__odTrack\('ui_click', props\)/);
    assert.doesNotMatch(page, /pricing_subscribe_click/);
    assert.doesNotMatch(page, /\.pr-campaign-disclaimer\s*\{/);
    assert.doesNotMatch(page, /权益生效后连续 7 天/);
    assert.doesNotMatch(page, /2026-08-22T00:00:00\+08:00/);
    assert.doesNotMatch(page, /限时抢购/);
  });

  it("does not expose a campaign review preview backdoor", async () => {
    const page = await readFile(PRICING_PAGE_PATH, "utf8");

    assert.match(page, /campaignEligible = now >= campaignStartAt && now < campaignEndAt/);
    assert.match(page, /campaignVisible = campaignEligible/);
    assert.match(page, /campaignVisible = campaignEligible/);
    assert.doesNotMatch(page, /data-campaign-review-param|campaignPreview|previewEndAt/);
  });

  it("stamps campaign attribution on subscribe CTAs only inside the activity window", async () => {
    // Clicks outside the fixed window must not count toward the campaign:
    // the CTA keeps recording od_entry_* attribution, but the minted entry
    // and the ui_click props carry the campaign id only while campaignEligible
    // is true.
    const page = await readFile(PRICING_PAGE_PATH, "utf8");

    assert.match(
      page,
      /__odRecordCampaignEntry\?\.\(\s*audience === 'team' \? 'landing_pricing_team_plan' : 'landing_pricing_personal_plan',\s*campaignEligible \? 'deepseek_v4_pro' : undefined,\s*\)/,
    );
    assert.match(page, /\.\.\.\(campaignEligible \? \{ campaign_id: 'deepseek_v4_pro' \} : \{\}\)/);
    assert.doesNotMatch(
      page,
      /element: 'subscribe',[\s\S]{0,300}?\n\s*campaign_id: 'deepseek_v4_pro',/,
    );
  });

  it("removes card-level and Team campaign offer blocks", async () => {
    const [page, campaign] = await Promise.all([
      readFile(PRICING_PAGE_PATH, "utf8"),
      readFile(CAMPAIGN_PATH, "utf8"),
    ]);
    const teamPanel = page.slice(
      page.indexOf('id="pr-team-panel"'),
      page.indexOf('<p class="pr-foot"'),
    );

    assert.match(campaign, /teamOfferTitle: 'Unlimited model access'/);
    assert.doesNotMatch(teamPanel, /data-pricing-campaign-surface/);
    assert.doesNotMatch(teamPanel, /class="pr-team-model-offer"/);
    assert.doesNotMatch(teamPanel, /data-team-campaign-countdown/);
    assert.match(page, /campaignEligible = now >= campaignStartAt && now < campaignEndAt/);
    assert.doesNotMatch(page, /\.pr-team-model-offer\s*\{/);
  });

  it("keeps the multimodal coming-soon note above the video label", async () => {
    const page = await readFile(PRICING_PAGE_PATH, "utf8");

    assert.match(
      page,
      /<span class="pr-mode-copy">\s*<small>\{comingSoonLabel\}<\/small>\s*<strong>\{L\.videoGeneration\}<\/strong>/,
    );
    assert.match(
      page,
      /<span class="pr-mode-copy">\s*<small aria-hidden="true"><\/small>\s*<strong>\{L\.imageGeneration\}<\/strong>/,
      "image and video labels must share the same copy grid",
    );
    assert.match(
      page,
      /<span class="pr-mode-copy">\s*<small aria-hidden="true"><\/small>\s*<strong>\{L\.designAgent\}<\/strong>/,
      "design and video labels must share the same reserved note row",
    );
    assert.match(
      page,
      /\.pr-mode-copy\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-rows:\s*0\.82rem auto;[\s\S]*gap:\s*4px;/,
    );
    assert.match(page, /\.pr-mode-copy strong\s*\{\s*grid-row:\s*2;/);
    assert.match(page, /\.pr-mode-copy small:empty\s*\{\s*visibility:\s*hidden;/);
    assert.doesNotMatch(page, /\{L\.videoGeneration\}<span class="pr-soon-tag">/);
  });

  it("renders exactly one OpenDesign Cloud capability section", async () => {
    const page = await readFile(PRICING_PAGE_PATH, "utf8");

    assert.doesNotMatch(
      page,
      /data-pricing-cloud-capability/,
      "the superseded duplicate capability block must stay removed",
    );
    assert.equal(
      page.match(/<section class="pr-multimodal"/g)?.length,
      1,
      "the retained Cloud capability section must render exactly once",
    );
    assert.match(
      page,
      /\.pr-multimodal\s*\{[\s\S]*?left:\s*50%;[\s\S]*?width:\s*min\(1200px, 96vw\);[\s\S]*?max-width:\s*none;[\s\S]*?transform:\s*translateX\(-50%\);/,
      "the Cloud capability card must share the comparison table width",
    );
  });

  it("points the public pricing URL at the landing-page JSON contract", () => {
    assert.equal(PLANS_JSON_URL, "/pricing/plans.json");
  });

  it("uses Vela's stable billing-plan deep link instead of wallet-era aliases", () => {
    assert.equal(
      CLOUD_CONSOLE_URL,
      "https://open-design.ai/cloud/dashboard?billing=plan",
    );
    assert.equal(
      cloudSubscribeUrl("pro", "yearly"),
      "https://open-design.ai/cloud/dashboard?billing=plan&plan=pro&interval=yearly&checkout=auto",
    );
    assert.equal(
      cloudTeamSubscribeUrl("team_pro", "yearly", 4),
      "https://open-design.ai/cloud/dashboard?billing=plan&plan=team_pro&interval=yearly&checkout=auto&seats=4",
    );
    assert.throws(
      () => cloudTeamSubscribeUrl("team_pro", "yearly", 0),
      /positive integer/,
    );
    assert.equal(
      scopedBillingPlanUrl("workspace-a"),
      "https://open-design.ai/cloud/dashboard?billing=plan&workspaceId=workspace-a",
    );
    assert.equal(scopedBillingPlanUrl("  "), CLOUD_CONSOLE_URL);
  });

  it("returns Pricing selections to an allowlisted Cloud Console environment", async () => {
    assert.equal(CLOUD_CONSOLE_BASE_PARAM, "cloud_console_base");
    assert.equal(
      resolveCloudConsoleBase(null),
      DEFAULT_CLOUD_CONSOLE_BASE_URL,
    );
    assert.equal(
      resolveCloudConsoleBase("https://vela.powerformer.net/"),
      "https://vela.powerformer.net/",
    );
    assert.equal(
      resolveCloudConsoleBase("https://amr-feature.powerformer.net/"),
      "https://amr-feature.powerformer.net/",
    );
    assert.equal(
      resolveCloudConsoleBase("https://preview-42.open-design.ai/cloud/"),
      "https://preview-42.open-design.ai/cloud/",
    );
    assert.equal(
      resolveCloudConsoleBase("https://powerformer.net/vela/"),
      "https://powerformer.net/vela/",
    );
    assert.equal(
      resolveCloudConsoleBase("http://127.0.0.1:5179/"),
      "http://127.0.0.1:5179/",
    );

    for (const invalid of [
      "https://evil.example/",
      "https://open-design.ai.evil.example/",
      "https://evilpowerformer.net/",
      "https://user:password@vela.powerformer.net/",
      "http://vela.powerformer.net/",
      "http://localhost:5173/dashboard",
      "javascript:alert(1)",
    ]) {
      assert.throws(() => resolveCloudConsoleBase(invalid), /Cloud Console base/);
    }

    const [page, individualPlans] = await Promise.all([
      readFile(PRICING_PAGE_PATH, "utf8"),
      readFile(PRICING_INDIVIDUAL_PATH, "utf8"),
    ]);
    assert.match(page, /inboundParams\.get\(cloudConsoleBaseParam\)/);
    assert.match(page, /hostedCloudConsoleDomains\.some/);
    assert.match(
      page,
      /candidate\.hostname\.endsWith\(`\.\$\{domain\}`\)/,
    );
    assert.match(page, /data-cloud-console-handoff-error/);
    assert.match(page, /data-cloud-console-environment/);
    assert.match(page, /data-cloud-console-link/);
    for (const locale of PRICING_LOCALES) {
      assert.match(
        getPricingContent(locale).labels.footnote,
        /\{console\}/,
        locale,
      );
    }
    assert.match(
      page,
      /consoleLink\.setAttribute\('href', cloudConsoleDashboardUrl\)/,
    );
    assert.match(page, /cta\.setAttribute\('aria-disabled', 'true'\)/);
    assert.match(
      page,
      /data-cloud-console-environment'\) === 'production'/,
    );
    assert.doesNotMatch(
      individualPlans,
      /href=\{cloudSubscribeUrl\([^)]*\)\}[^>]*data-pricing-cta/,
    );
    assert.doesNotMatch(
      page,
      /href=\{CLOUD_CONSOLE_URL\}[^>]*data-pricing-cta/,
    );
  });

  it("recognizes only the signed-in account's current personal plan for CTA copy", async () => {
    const requests: string[] = [];
    const requestOptions: Array<RequestInit | undefined> = [];
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push(url);
      requestOptions.push(init);
      if (url.endsWith("/api/auth/get-session")) {
        return Response.json({ user: { id: "user-1" } });
      }
      return Response.json({
        membershipTier: "Pro",
        billingInterval: "monthly",
        subscriptionStatus: "active",
        subscriptionEntitlementStatus: "active",
      });
    };

    assert.equal(
      await loadCurrentPersonalPlanTier("https://amr-api.open-design.ai/", fetcher),
      "pro",
    );
    assert.deepEqual(requests, [
      "https://amr-api.open-design.ai/api/auth/get-session",
      "https://amr-api.open-design.ai/api/v1/billing/summary",
    ]);
    assert.deepEqual(
      requestOptions.map((options) => options?.credentials),
      ["include", "include"],
    );
    assert.equal(getCurrentPlanLabel("en"), "Current plan");
    assert.equal(getCurrentPlanLabel("zh"), "当前套餐");
    assert.equal(getPricingPlanActionLabels("en").downgrade, "Downgrade to {plan}");
    assert.equal(getPricingPlanActionLabels("en").upgrade, "Upgrade to {plan}");
    assert.equal(
      getPricingPlanActionLabels("en").switchBackToInterval,
      "Switch back to {interval} before upgrading",
    );
  });

  it("disables the current personal plan and every downgrade target", () => {
    assert.deepEqual(
      ["go", "plus", "pro", "max"].filter((tier) =>
        isPersonalPlanAtOrBelow(tier, "pro"),
      ),
      ["go", "plus", "pro"],
    );
    assert.equal(isPersonalPlanAtOrBelow("team", "pro"), false);
    assert.equal(isPersonalPlanAtOrBelow("max", "pro"), false);
    assert.equal(personalPlanRelation("go", "pro"), "lower");
    assert.equal(personalPlanRelation("pro", "pro"), "current");
    assert.equal(personalPlanRelation("max", "pro"), "higher");
    assert.equal(personalPlanRelation("team", "pro"), null);
  });

  it("keeps CTA copy unchanged when subscription identity is unavailable or non-personal", async () => {
    const signedOut = async () => Response.json(null);
    const teamPlan = async (input: string | URL | Request) =>
      Response.json(
        String(input).endsWith("/api/auth/get-session")
          ? { user: { id: "user-1" } }
          : { membershipTier: "team_pro" },
      );
    const failed = async () => new Response(null, { status: 503 });

    assert.equal(
      await loadCurrentPersonalPlanTier("https://amr-api.open-design.ai", signedOut),
      null,
    );
    assert.equal(
      await loadCurrentPersonalPlanTier("https://amr-api.open-design.ai", teamPlan),
      null,
    );
    assert.equal(
      await loadCurrentPersonalPlanTier("https://amr-api.open-design.ai", failed),
      null,
    );
  });

  it("renders personal CTA state from the full billing context", async () => {
    const [page, individualPlans] = await Promise.all([
      readFile(PRICING_PAGE_PATH, "utf8"),
      readFile(PRICING_INDIVIDUAL_PATH, "utf8"),
    ]);

    assert.match(page, /data-billing-api-origin=\{apiOrigin\}/);
    assert.match(page, /data-current-plan-label=\{planActionLabels\.current\}/);
    assert.match(page, /data-downgrade-plan-label=\{planActionLabels\.downgrade\}/);
    assert.match(page, /data-upgrade-plan-label=\{planActionLabels\.upgrade\}/);
    assert.match(page, /loadPersonalPricingContext\(apiOrigin\)/);
    assert.match(page, /pricing:personal-context-resolved/);
    assert.match(page, /resolvePricingBridgeSource/);
    assert.match(page, /authenticated:\s*true/);
    assert.match(page, /if \(!context\) return/);
    assert.doesNotMatch(page, /liveContext \?\?/);
    assert.doesNotMatch(page, /demo_plan/);
    assert.doesNotMatch(page, /demoContext/);
    assert.doesNotMatch(page, /pricingCompatibilityAttribution/);
    assert.doesNotMatch(page, /tiers:\s*PRICING_SNAPSHOT\.tiers/);
    assert.match(page, /resolvePersonalPlanAction\(pricingContext/);
    assert.match(page, /action\.kind === 'dual_change'/);
    assert.doesNotMatch(page, /action\.kind === 'manage_billing'/);
    assert.match(page, /action\.kind === 'scheduled'/);
    assert.match(page, /pricing:set-interval/);
    assert.match(page, /data-first-month-intro-eligible/);
    assert.match(page, /cta\.setAttribute\('aria-disabled', 'true'\)/);
    assert.match(page, /cta\.setAttribute\('tabindex', '-1'\)/);
    assert.match(page, /cta\.removeAttribute\('href'\)/);
    assert.match(page, /cta\.hasAttribute\('data-subscription-disabled'\)/);
    assert.equal(
      getPricingPlanActionLabels("zh").intervalDowngradeUnavailable,
      "取消订阅后可变更套餐",
    );
    assert.match(
      individualPlans,
      /\.pricing-card-cta\[aria-disabled='true'\][\s\S]*?cursor:\s*not-allowed;/,
    );
    assert.match(individualPlans, /data-pricing-cta\s+data-tier=\{tier\}/);
    assert.match(individualPlans, /\.pricing-card-cta\s*\{[^}]*border:\s*0;/s);
  });

  it("records Pricing Enterprise submit intent before shared-form validation", async () => {
    const [page, form] = await Promise.all([
      readFile(PRICING_PAGE_PATH, "utf8"),
      readFile(
        new URL("../app/_components/enterprise-lead-form.astro", import.meta.url),
        "utf8",
      ),
    ]);
    const submitHandler = form.slice(
      form.indexOf("form.addEventListener('submit'"),
      form.indexOf("const data = new FormData(form)"),
    );
    assert.match(
      submitHandler,
      /pricing:enterprise-submit[\s\S]*?\['email', 'team-size'/,
    );
    assert.doesNotMatch(
      page.slice(
        page.indexOf("modal.addEventListener('od:lead-success'"),
        page.indexOf("});", page.indexOf("modal.addEventListener('od:lead-success'")) + 3,
      ),
      /pricing:enterprise-submit/,
    );
  });

  it("restores account actions only on Pricing", async () => {
    const layout = await readFile(
      new URL("../app/_components/sub-page-layout.astro", import.meta.url),
      "utf8",
    );
    const pagesRoot = new URL("../app/pages/", import.meta.url);
    const pricingPage = await readFile(new URL("pricing/index.astro", pagesRoot), "utf8");
    const pageFiles = (
      await Array.fromAsync(glob("**/*.astro", { cwd: fileURLToPath(pagesRoot) }))
    ).sort();
    const accountOptIns = [];
    for (const pageFile of pageFiles) {
      const source = await readFile(new URL(pageFile, pagesRoot), "utf8");
      if (/showHeaderAccount/u.test(source)) accountOptIns.push(pageFile);
    }

    assert.match(layout, /showHeaderAccount = false/u);
    assert.match(layout, /showAccount: showHeaderAccount/u);
    assert.match(pricingPage, /<Layout[^>]*showHeaderAccount/u);
    assert.deepEqual(accountOptIns, ["pricing/index.astro"]);
  });

  it("preserves only an explicit inbound workspace without inferring local state", async () => {
    const page = await readFile(PRICING_PAGE_PATH, "utf8");
    const scoped = new URL(scopedBillingPlanUrl("workspace & team"));

    assert.equal(scoped.searchParams.get("billing"), "plan");
    assert.equal(scoped.searchParams.get("workspaceId"), "workspace & team");
    assert.doesNotMatch(page, /localStorage|sessionStorage|activeWorkspace/);
    assert.match(page, /new URLSearchParams\(window\.location\.search\)/);
  });

  it("publishes parseable JSON with the expected contract shape", async () => {
    const file = await readFile(CONTRACT_PATH, "utf8");
    const contract = JSON.parse(file) as unknown;

    assertPlanContract(contract);
  });

  it("declares JSON response headers for the public contract", async () => {
    const headers = await readFile(HEADERS_PATH, "utf8");

    assert.match(headers, /^\/pricing\/plans\.json$/m);
    assert.match(headers, /^  Content-Type: application\/json; charset=utf-8$/m);
  });

  it("keeps HTML edge TTL short so locale pages cannot drift for an hour after deploy", async () => {
    // 2026-08 campaign rollout: s-maxage=3600 + stale-while-revalidate=86400 left
    // /zh/pricing/ (and other paths) on stale edge objects while /pricing/ was
    // fresh. HTML must stay short-TTL; production also host-purges after deploy.
    const headers = await readFile(HEADERS_PATH, "utf8");
    const htmlRule = headers.match(
      /^\/\n  Cache-Control: (.+)$/m,
    )?.[1];
    assert.ok(htmlRule, "expected Cache-Control for `/` HTML");
    assert.match(htmlRule, /s-maxage=60\b/);
    assert.doesNotMatch(htmlRule, /s-maxage=3600\b/);
    assert.doesNotMatch(htmlRule, /stale-while-revalidate=86400\b/);
    assert.match(
      headers,
      /^\/pricing\/plans\.json$\n(?:  .+\n)*?  Cache-Control: public, max-age=0, s-maxage=60, must-revalidate$/m,
    );
  });

  it("keeps the public contract in sync with the build-time snapshot", async () => {
    const file = await readFile(CONTRACT_PATH, "utf8");
    const contract = JSON.parse(file) as unknown;

    assert.deepEqual(contract, PRICING_SNAPSHOT);
  });

  it("mirrors Vela's current Personal credit grants", () => {
    const byTier = Object.fromEntries(
      PRICING_SNAPSHOT.tiers.map((tier) => [tier.tier, tier]),
    );

    assert.equal(byTier.plus?.monthly.grantUsd, 20);
    assert.equal(byTier.pro?.monthly.grantUsd, 120);
    assert.equal(byTier.max?.monthly.grantUsd, 300);
    assert.equal(byTier.plus?.yearly.grantUsd, 240);
    assert.equal(byTier.pro?.yearly.grantUsd, 1440);
    assert.equal(byTier.max?.yearly.grantUsd, 3600);
  });

  it("does not apply the advertised Personal credit bonus twice", async () => {
    const page = await readFile(PRICING_PAGE_PATH, "utf8");

    assert.doesNotMatch(page, /grantUsd\s*\*\s*\(\s*1\s*\+/);
    assert.doesNotMatch(page, /grantUsd\s*\*\s*1\.(?:2|5)/);
  });

  it("includes Vela's current GPT-5.6 premium model family", () => {
    assert.ok(
      PREMIUM_MODELS.some((model) => model.name === "GPT-5.6 (Sol/Terra/Luna)"),
    );
  });

  it("publishes the four static Team tiers shown by Vela pricing", () => {
    assert.deepEqual(
      PRICING_SNAPSHOT.teamTiers.map((tier) => ({
        tier: tier.tier,
        monthly: tier.monthly.priceUsd,
        monthlyIntro: tier.monthly.introPriceUsd,
        yearly: tier.yearly.priceUsd,
        yearlyIntro: tier.yearly.introPriceUsd,
        credits: tier.monthlyCreditsPerSeatUsd,
        minSeats: tier.minSeats,
      })),
      [
        {
          tier: "team_basic",
          monthly: 5,
          monthlyIntro: 4,
          yearly: 60,
          yearlyIntro: 42,
          credits: 0,
          minSeats: 3,
        },
        {
          tier: "team_plus",
          monthly: 25,
          monthlyIntro: 20,
          yearly: 300,
          yearlyIntro: 210,
          credits: 20,
          minSeats: 3,
        },
        {
          tier: "team_pro",
          monthly: 105,
          monthlyIntro: 73.5,
          yearly: 1260,
          yearlyIntro: 756,
          credits: 100,
          minSeats: 3,
        },
        {
          tier: "team_max",
          monthly: 205,
          monthlyIntro: 123,
          yearly: 2460,
          yearlyIntro: 1207.61,
          credits: 200,
          minSeats: 3,
        },
      ],
    );
  });

  it("renders interval-specific Team totals and checkout labels", async () => {
    const page = await readFile(PRICING_PAGE_PATH, "utf8");
    const english = TEAM_PRICING_CONTENT_BY_LOCALE.en;

    for (const tier of PRICING_SNAPSHOT.teamTiers) {
      for (const seats of [3, 4] as const) {
        const annualTotal = teamIntroTotalUsd(tier, "yearly", seats);
        const firstMonthTotal = teamIntroTotalUsd(tier, "monthly", seats);
        const monthlyTotal = annualTotal / 12;
        const amount = (value: number) => formatUsd(value).replace(/^\$/, "");

        assert.equal(
          english.monthlyTotal.replace("{amount}", amount(monthlyTotal)),
          `${amount(monthlyTotal)} / month for your team`,
        );
        assert.equal(
          english.yearlyTotal.replace("{amount}", amount(annualTotal)),
          `${amount(annualTotal)} billed for the first year`,
        );
        assert.equal(
          english.monthlyCheckout.replace("{amount}", amount(firstMonthTotal)),
          `Upgrade team · ${amount(firstMonthTotal)}/month`,
        );
        assert.equal(
          english.yearlyCheckout.replace("{amount}", amount(annualTotal)),
          `Upgrade team · ${amount(annualTotal)}/year`,
        );
      }
    }

    assert.match(page, /data-team-monthly-summary/);
    assert.match(page, /data-team-yearly-summary/);
    assert.match(page, /data-team-checkout-total/);
    assert.match(
      page,
      /const interval = root\.getAttribute\('data-interval'\) === 'monthly' \? 'monthly' : 'yearly';/,
    );
  });

  it("removes the obsolete Team-coming-soon banner", async () => {
    const page = await readFile(PRICING_PAGE_PATH, "utf8");

    assert.doesNotMatch(page, /<section class="pr-team"/);
    assert.doesNotMatch(page, /enterprise\.badge/);
    assert.match(page, /data-audience-btn="creator"/);
    assert.match(page, /data-audience-btn="team"/);
    assert.match(page, /data-audience-panel="creator"/);
    assert.match(page, /data-audience-panel="team"/);
  });

  it("keeps the pricing controls on the Vela-aligned custom UI", async () => {
    const [page, individualPlans] = await Promise.all([
      readFile(PRICING_PAGE_PATH, "utf8"),
      readFile(PRICING_INDIVIDUAL_PATH, "utf8"),
    ]);

    // The live Personal surface is nested inside an audience panel, so the
    // generic global section padding must be cancelled on the component root.
    assert.match(individualPlans, /\.demo-individual-pricing\s*\{[^}]*padding:\s*0 !important;/s);

    // Billing is the centered segmented control shared by Individual and Team.
    // The audience switch stays as the plain right-aligned slash control.
    assert.match(page, /class="pr-audience-toggle"[^>]*role="tablist"/);
    assert.match(page, /\.pr-controls-row\s*\{[^}]*grid-template-columns:\s*1fr auto 1fr;/s);
    assert.match(page, /\.pr-toggle\s*\{[^}]*grid-column:\s*2;[^}]*justify-self:\s*center;[^}]*background:\s*#e8e9e3;[^}]*border-radius:\s*999px;/s);
    assert.match(
      page,
      /\.pr-toggle-btn\s*\{[^}]*min-height:\s*40px;[^}]*border-radius:\s*999px;[^}]*font-size:\s*14px;[^}]*font-weight:\s*600;/s,
    );
    assert.match(
      page,
      /\.pr-audience-toggle\s*\{[^}]*grid-column:\s*3;[^}]*justify-self:\s*end;[^}]*margin-right:\s*24px;/s,
    );
    assert.match(page, /<span class="pr-audience-separator" aria-hidden="true">\/<\/span>/);
    assert.match(page, /<h1 class="pr-hero-heading">\{L\.heroTitle\}<\/h1>/);
    assert.match(page, /\{teamContent\.creatorTab\}/);
    assert.match(page, /\{teamContent\.teamTab\}/);
    assert.doesNotMatch(page, /const isZh = /);
    assert.match(page, /data-interval="yearly"/);
    assert.match(page, /data-interval-btn="yearly"[^>]*aria-selected="true"/);
    assert.match(page, /<span class="pr-toggle-save">\{L\.yearlySave\}<\/span>/);
    assert.doesNotMatch(page, /class="pr-toggle-separator"/);
    assert.doesNotMatch(page, /billingToggle\.hidden = audience === 'team'/);

    // The visible Team tier control must never open the OS-native select popup.
    assert.doesNotMatch(page, /<select[^>]*data-team-tier/);
    assert.match(page, /data-team-tier[^>]*role="combobox"/);
    assert.match(page, /data-team-tier-options[^>]*role="listbox"/);
    assert.match(page, /data-team-tier-option[^>]*role="option"/);

    // QA explicitly removed the redundant grey total strip.
    assert.doesNotMatch(page, /class="pr-team-total"/);
    assert.doesNotMatch(page, /data-team-total/);
  });

  it("matches the approved Team card geometry and decoration artwork", async () => {
    const page = await readFile(PRICING_PAGE_PATH, "utf8");

    assert.match(
      page,
      /\.pr-team-panel\s*\{[^}]*width:\s*min\(1200px,\s*100%\);[^}]*max-width:\s*none;/s,
    );
    assert.match(page, /\.pr-team-grid\s*\{[^}]*gap:\s*12px;/s);
    assert.match(
      page,
      /\.pr-team-card\s*\{[^}]*min-height:\s*590px;[^}]*padding:\s*24px 20px 22px;[^}]*border:\s*0;[^}]*border-radius:\s*12px;[^}]*background:\s*#fff;/s,
    );
    assert.match(
      page,
      /\.pr-team-decoration\s*\{[^}]*top:\s*20px;[^}]*right:\s*20px;[^}]*width:\s*60px;[^}]*height:\s*60px;[^}]*color:\s*#55c94a;[^}]*opacity:\s*\.2;/s,
    );
    assert.match(
      page,
      /<circle cx="9" cy="8" r="3"\s*\/>[\s\S]*?<path d="M3\.5 19c\.35-3\.45 2\.1-5\.2 5\.5-5\.2s5\.15 1\.75 5\.5 5\.2"\s*\/>/,
    );
    assert.match(
      page,
      /<path d="M5 21V6\.5L12 3v18"\s*\/>[\s\S]*?<path d="M12 8h7v13"\s*\/>[\s\S]*?<path d="M3 21h18"\s*\/>/,
    );
    assert.match(
      page,
      /\.pr-team-stepper button:first-child\s*\{\s*justify-self:\s*start;\s*\}/,
    );
    assert.match(
      page,
      /\.pr-team-stepper button:last-child\s*\{\s*justify-self:\s*end;\s*\}/,
    );
  });

  it("reveals the Team cards with the demo's staggered entrance motion", async () => {
    const page = await readFile(PRICING_PAGE_PATH, "utf8");

    assert.match(
      page,
      /\.pr-team-card\s*\{[^}]*animation:\s*pr-team-card-enter 0\.65s cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\) both;/s,
    );
    assert.match(
      page,
      /\.pr-team-card:nth-child\(2\)\s*\{\s*animation-delay:\s*0\.09s;\s*\}/,
    );
    assert.match(
      page,
      /@keyframes pr-team-card-enter\s*\{\s*from\s*\{\s*opacity:\s*0;\s*transform:\s*translateY\(12px\);\s*\}\s*to\s*\{\s*opacity:\s*1;\s*transform:\s*translateY\(0\);\s*\}\s*\}/,
    );
    assert.match(
      page,
      /@media \(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.pr-team-card\s*\{[^}]*animation:\s*none;[^}]*transform:\s*none;/,
    );
  });

  it("localizes the flagship Pricing structure for every active locale", () => {
    const activeLocales = LANDING_LOCALES.map((locale) => locale.code);

    assert.deepEqual(activeLocales, [...PRICING_LOCALES]);
    assert.deepEqual(
      Object.keys(TEAM_PRICING_CONTENT_BY_LOCALE).sort(),
      [...PRICING_LOCALES].sort(),
    );
    for (const locale of PRICING_LOCALES) {
      const copy = TEAM_PRICING_CONTENT_BY_LOCALE[locale];
      assert.ok(copy, `missing Team pricing copy for ${locale}`);
      assert.notEqual(
        locale === "en" ? copy.metaTitle : copy.metaDescription,
        TEAM_PRICING_CONTENT_BY_LOCALE.en?.metaDescription,
        `${locale} silently reused the English metadata`,
      );
      assert.match(copy.monthlyTotal, /\{amount\}/);
      assert.match(copy.yearlyTotal, /\{amount\}/);
      assert.match(copy.monthlyCheckout, /\{amount\}/);
      assert.match(copy.yearlyCheckout, /\{amount\}/);
      assert.doesNotMatch(copy.monthlyTotal, /\{count\}|\{savings\}/);
      assert.doesNotMatch(copy.yearlyTotal, /\{count\}|\{savings\}/);
      assert.equal("yearlySummary" in copy, false);
    }

    assert.equal(
      TEAM_PRICING_CONTENT_BY_LOCALE.zh.monthlyTotal,
      "团队合计 {amount} / 月",
    );
    assert.equal(
      TEAM_PRICING_CONTENT_BY_LOCALE.zh.yearlyTotal,
      "首年应付 {amount}",
    );
    assert.equal(
      TEAM_PRICING_CONTENT_BY_LOCALE.en.monthlyTotal,
      "{amount} / month for your team",
    );
    assert.equal(
      TEAM_PRICING_CONTENT_BY_LOCALE.en.yearlyTotal,
      "{amount} billed for the first year",
    );
    assert.equal(
      TEAM_PRICING_CONTENT_BY_LOCALE.en.monthlyCheckout,
      "Upgrade team · {amount}/month",
    );
  });

  it("updates the Team quote for the selected billing interval, tier, and seats", async () => {
    const page = await readFile(PRICING_PAGE_PATH, "utf8");
    const updateStart = page.indexOf("const updateTeamPlan = () =>");
    const updateEnd = page.indexOf(
      "teamTierTrigger?.addEventListener",
      updateStart,
    );
    assert.notEqual(updateStart, -1);
    assert.notEqual(updateEnd, -1);
    const updateTeamPlan = page.slice(updateStart, updateEnd);

    assert.match(
      page,
      /fillTemplate\(teamContent\.monthlyTotal,\s*\{\s*amount:\s*initialTeamView\.monthlyTeamTotal,\s*\}\)/s,
    );
    assert.match(
      updateTeamPlan,
      /const interval = root\.getAttribute\('data-interval'\) === 'monthly' \? 'monthly' : 'yearly';/,
    );
    assert.match(
      updateTeamPlan,
      /const intervalTotal = selected\.introPriceUsd \* teamSeats/,
    );
    assert.match(updateTeamPlan, /fillTeam\(teamCopy\.monthlyTotal, \{ amount: monthlyTotal \}\)/);
    assert.match(updateTeamPlan, /fillTeam\(teamCopy\.yearlyTotal, \{ amount: total \}\)/);
    assert.match(
      updateTeamPlan,
      /interval === 'yearly' \? teamCopy\.yearlyCheckout : teamCopy\.monthlyCheckout/,
    );
    assert.match(page, /data-team-yearly-summary data-when="yearly"/);
    assert.match(page, /const selectTeamTier = \(option\) => \{[\s\S]*?updateTeamPlan\(\)/);
    assert.match(
      page,
      /teamSeatsDec\?\.addEventListener\('click',[\s\S]*?updateTeamPlan\(\)/,
    );
    assert.match(
      page,
      /teamSeatsInc\?\.addEventListener\('click',[\s\S]*?updateTeamPlan\(\)/,
    );
    assert.doesNotMatch(updateTeamPlan, /teamCopy\.yearlySummary/);
    assert.doesNotMatch(updateTeamPlan, /labels\.monthlyRenewal/);
    assert.doesNotMatch(updateTeamPlan, /savings|regularTotal/);
    assert.match(updateTeamPlan, /syncCtas\(\)/);
  });

  it("hands the exact Team selection to Vela checkout", async () => {
    const page = await readFile(PRICING_PAGE_PATH, "utf8");
    const syncStart = page.indexOf("const syncCtas = () =>");
    const syncEnd = page.indexOf("syncCtas();", syncStart);
    assert.notEqual(syncStart, -1);
    assert.notEqual(syncEnd, -1);
    const syncCtas = page.slice(syncStart, syncEnd);

    assert.match(syncCtas, /target\.searchParams\.set\('plan', selectedTier\.tier\)/);
    assert.match(syncCtas, /target\.searchParams\.set\('interval', interval\)/);
    assert.doesNotMatch(syncCtas, /target\.searchParams\.set\('interval', 'yearly'\)/);
    assert.match(syncCtas, /'seats',[\s\S]*String\(Math\.max\(selectedTier\.minSeats, selectedSeats\)\)/);
    assert.match(syncCtas, /target\.searchParams\.set\('checkout', 'auto'\)/);
  });

  it("removes the superseded Team total and annual-savings copy", async () => {
    const content = await readFile(TEAM_CONTENT_PATH, "utf8");

    assert.doesNotMatch(content, /yearlySummary/);
    assert.doesNotMatch(content, /\{count\} seats · \{amount\}\/month/);
    assert.doesNotMatch(content, /\{count\} seats · \{amount\}\/year/);
    assert.doesNotMatch(content, /Billed annually · \{amount\}\/year \(save \{savings\}\)/);
  });

  it("keeps the Enterprise CTA on the shared production contact-sales form", async () => {
    const page = await readFile(PRICING_PAGE_PATH, "utf8");
    const form = await readFile(
      new URL(
        "../app/_components/enterprise-lead-form.astro",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(page, /data-open-lead-modal/);
    assert.match(
      page,
      /<EnterpriseLeadForm locale=\{locale\} source="pricing_team" pageName="pricing" \/>/,
    );
    assert.match(form, /fetch\('\/contact-sales'/);
  });

  // The machine-readable /pricing.md is quoted verbatim by AI agents, so its
  // numbers must not silently drift from the plans.json contract. This asserts
  // every tier's monthly + yearly price, annual discount, deploy limit, and the
  // overage price appear in the markdown. A pricing edit that forgets to update
  // pricing.md fails here instead of shipping a stale AI-facing surface.
  it("keeps public/pricing.md in sync with the pricing contract", async () => {
    const md = await readFile(PRICING_MD_PATH, "utf8");
    const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

    for (const tier of PRICING_SNAPSHOT.tiers) {
      const t = tier.tier;
      assert.ok(
        md.includes(`${usd(tier.monthly.priceUsd)} / month`),
        `pricing.md missing ${t} monthly price ${usd(tier.monthly.priceUsd)} / month`,
      );
      assert.ok(
        md.includes(`${usd(tier.yearly.priceUsd)} / year`),
        `pricing.md missing ${t} yearly price ${usd(tier.yearly.priceUsd)} / year`,
      );
      assert.ok(
        md.includes(`${tier.yearly.discountPct}% off`),
        `pricing.md missing ${t} annual discount ${tier.yearly.discountPct}% off`,
      );
      assert.ok(
        md.includes(`up to ${tier.deployLimit} / month`),
        `pricing.md missing ${t} deploy limit up to ${tier.deployLimit} / month`,
      );
      assert.ok(
        md.includes(`$${tier.monthly.grantUsd.toLocaleString("en-US")} / month`),
        `pricing.md missing ${t} monthly credit grant`,
      );
    }

    for (const tier of PRICING_SNAPSHOT.teamTiers) {
      const label = tier.tier
        .replace("team_", "Team ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
      assert.ok(md.includes(`## ${label}`), `pricing.md missing ${label}`);
      assert.ok(
        md.includes(`${formatUsd(tier.monthly.introPriceUsd)} / seat / month`),
        `pricing.md missing ${label} monthly intro price`,
      );
      assert.ok(
        md.includes(`${formatUsd(tier.yearly.introPriceUsd)} / seat / year`),
        `pricing.md missing ${label} yearly intro price`,
      );
    }

    assert.ok(
      md.includes(`${usd(PRICING_SNAPSHOT.overageDeployPriceUsd)} each`),
      `pricing.md missing overage price ${usd(PRICING_SNAPSHOT.overageDeployPriceUsd)} each`,
    );
  });
});
