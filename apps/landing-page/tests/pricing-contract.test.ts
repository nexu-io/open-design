import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  CLOUD_CONSOLE_URL,
  PLANS_JSON_URL,
  PRICING_SNAPSHOT,
  cloudSubscribeUrl,
  formatUsd,
  scopedBillingPlanUrl,
  teamIntroTotalUsd,
  type PricingContract,
} from "../app/_lib/pricing.ts";
import {
  PRICING_LOCALES,
  TEAM_PRICING_CONTENT_BY_LOCALE,
} from "../app/_lib/pricing-team-content.ts";
import { PREMIUM_MODELS } from "../app/_lib/pricing-content.ts";
import { LANDING_LOCALES } from "../app/i18n.ts";

const CONTRACT_PATH = new URL("../public/pricing/plans.json", import.meta.url);
const HEADERS_PATH = new URL("../public/_headers", import.meta.url);
const PRICING_MD_PATH = new URL("../public/pricing.md", import.meta.url);
const PRICING_PAGE_PATH = new URL(
  "../app/pages/pricing/index.astro",
  import.meta.url,
);
const TEAM_CONTENT_PATH = new URL(
  "../app/_lib/pricing-team-content.ts",
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
  it("keeps the existing Free entry card while the Go proposal remains isolated", async () => {
    const page = await readFile(PRICING_PAGE_PATH, "utf8");

    assert.match(page, /data-tier="free"/);
    assert.match(page, /<span class="pr-tier-name">Free<\/span>/);
    assert.doesNotMatch(page, /data-tier="go"/);
    assert.doesNotMatch(page, /const goPlan/);
  });

  it("renders the final DeepSeek campaign promise on personal and team pricing", async () => {
    const page = await readFile(PRICING_PAGE_PATH, "utf8");

    assert.match(page, /DeepSeek V4 Flash 无限使用/);
    assert.match(page, /badge: '无限使用'/);
    assert.match(page, /windowLabel: '活动倒计时'/);
    assert.match(page, /windowValue: '7天 00:00:00'/);
    assert.match(page, /data-pricing-campaign-countdown/);
    assert.doesNotMatch(page, /距开始/);
    assert.match(page, /FREE all week/);
    assert.match(page, /body: '8月6日—8月13日，一周免费用'/);
    assert.match(page, /body: 'FREE all week, Aug 6—Aug 13'/);
    assert.doesNotMatch(page, /body: ['\"][^'\"]*20:00/);
    assert.match(page, /paidBenefitNote: '8月6日—8月13日 · 一周免费用'/);
    assert.match(page, /teamBenefitNote: '8月6日—8月13日 · 一周免费用'/);
    assert.match(page, /DEEPSEEK_V4_FLASH_CAMPAIGN\.startAt/);
    assert.match(page, /DEEPSEEK_V4_FLASH_CAMPAIGN\.endAtExclusive/);
    assert.match(page, /now >= campaignStartAt && now < campaignEndAt/);
    assert.match(page, /data-pricing-campaign-surface/);
    assert.match(page, /class="pr-campaign-disclaimer"/);
    assert.match(page, /套餐内的无限制模型额度与免费生成次数，仅可通过Open Design使用；无法在MCP\/CLI\/API及其他场景使用。解释权归官方所有。/);
    assert.match(page, /<p class="pr-foot" set:html=\{footnoteHtml\} \/>\s*<p class="pr-campaign-disclaimer" data-pricing-campaign-surface hidden>\{deepSeekCampaign\.disclaimer\}<\/p>/);
    assert.doesNotMatch(page, /套餐内的<strong>无限制模型额度<\/strong>与<strong>免费生成次数<\/strong>/);
    assert.match(page, /\.pr-campaign-disclaimer\s*\{[\s\S]*font-size:\s*\.82rem;/);
    assert.match(page, /track\('surface_view',\s*\{\s*area:\s*'campaign_banner'/);
    assert.match(page, /element:\s*'deepseek_v4_flash_benefit'/);
    assert.match(page, /window\.__odRecordCampaignEntry\?\./);
    assert.match(page, /'landing_pricing_team_plan'\s*:\s*'landing_pricing_personal_plan'/);
    assert.match(page, /'deepseek_v4_flash'/);
    // First-touch envelope + device id survive Pricing → Cloud. Campaign id is
    // re-decided by campaignActive and written only via __odAttributedUrl.
    assert.match(page, /'od_conversion_source',\s*'od_device_id'/);
    assert.match(page, /od_campaign_id is intentionally NOT forwarded/);
    assert.match(page, /window\.__odTrack\('ui_click', props\)/);
    assert.doesNotMatch(page, /pricing_subscribe_click/);
    const disclaimerRule = page.match(
      /\.pr-campaign-disclaimer\s*\{([^}]*)\}/,
    )?.[1];
    assert.ok(disclaimerRule);
    assert.doesNotMatch(disclaimerRule, /border-top:/);
    assert.doesNotMatch(disclaimerRule, /font-weight:/);
    assert.match(disclaimerRule, /width:\s*100%;/);
    assert.match(disclaimerRule, /max-width:\s*none;/);
    assert.match(disclaimerRule, /margin:\s*0 0 36px;/);
    assert.match(disclaimerRule, /padding:\s*0;/);
    assert.match(disclaimerRule, /text-align:\s*center;/);
    assert.doesNotMatch(page, /权益生效后连续 7 天/);
    assert.doesNotMatch(page, /2026-08-22T00:00:00\+08:00/);
    assert.doesNotMatch(page, /限时抢购/);
  });

  it("decides campaign visibility by the real window with no URL preview backdoor", async () => {
    // Product decision: the former ?campaign= preview fixture is fully
    // removed. The pricing surfaces toggle on the fixed activity window only;
    // pre-launch review happens by temporarily overriding startAt.
    const page = await readFile(PRICING_PAGE_PATH, "utf8");

    assert.match(page, /campaignActive = now >= campaignStartAt && now < campaignEndAt/);
    assert.doesNotMatch(page, /data-campaign-revie[w]/);
    assert.doesNotMatch(page, /campaignPrevie[w]|campaignReviewPara[m]|campaignReviewAllowe[d]/);
    assert.doesNotMatch(page, /get\('campaign'\)/);
  });

  it("stamps campaign attribution on subscribe CTAs only inside the activity window", async () => {
    // Clicks outside the fixed window must not count toward the campaign:
    // the CTA keeps recording od_entry_* attribution, but the minted entry
    // and the ui_click props carry the campaign id only while campaignActive
    // is true.
    const page = await readFile(PRICING_PAGE_PATH, "utf8");

    assert.match(
      page,
      /__odRecordCampaignEntry\?\.\(\s*audience === 'team' \? 'landing_pricing_team_plan' : 'landing_pricing_personal_plan',\s*campaignActive \? 'deepseek_v4_flash' : undefined,\s*\)/,
    );
    assert.match(page, /\.\.\.\(campaignActive \? \{ campaign_id: 'deepseek_v4_flash' \} : \{\}\)/);
    assert.doesNotMatch(
      page,
      /element: 'subscribe',[\s\S]{0,300}?\n\s*campaign_id: 'deepseek_v4_flash',/,
    );
  });

  it("aligns the highlighted campaign checkmark with the benefit list below", async () => {
    const page = await readFile(PRICING_PAGE_PATH, "utf8");

    assert.match(page, /\.pr-campaign-model-benefit::before\s*\{\s*left:\s*8px;\s*\}/);
    assert.match(
      page,
      /\.pr-feat\.pr-campaign-model-benefit::before\s*\{[\s\S]*left:\s*8px;[\s\S]*top:\s*18px;[\s\S]*transform:\s*translateY\(-50%\);/,
      "the personal campaign checkmark must share the benefit x-axis and align with the title line",
    );
    assert.match(
      page,
      /\.pr-team-feature-list li\.pr-campaign-model-benefit::before\s*\{[\s\S]*left:\s*8px;[\s\S]*top:\s*18px;[\s\S]*transform:\s*translateY\(-50%\);/,
      "the team campaign checkmark must override the later base list rule",
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
      "https://open-design.ai/cloud/dashboard?billing=plan",
    );
    assert.equal(
      scopedBillingPlanUrl("workspace-a"),
      "https://open-design.ai/cloud/dashboard?billing=plan&workspaceId=workspace-a",
    );
    assert.equal(scopedBillingPlanUrl("  "), CLOUD_CONSOLE_URL);
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
          monthly: 20,
          monthlyIntro: 16,
          yearly: 240,
          yearlyIntro: 168,
          credits: 0,
          minSeats: 3,
        },
        {
          tier: "team_plus",
          monthly: 40,
          monthlyIntro: 32,
          yearly: 480,
          yearlyIntro: 336,
          credits: 20,
          minSeats: 3,
        },
        {
          tier: "team_pro",
          monthly: 120,
          monthlyIntro: 84,
          yearly: 1440,
          yearlyIntro: 864,
          credits: 100,
          minSeats: 3,
        },
        {
          tier: "team_max",
          monthly: 220,
          monthlyIntro: 132,
          yearly: 2640,
          yearlyIntro: 1296,
          credits: 200,
          minSeats: 3,
        },
      ],
    );
  });

  it("renders all 16 introductory Team totals for interval, tier, and seat changes", () => {
    const expected = {
      team_basic: {
        monthly: { 3: "First month only $48", 4: "First month only $64" },
        yearly: { 3: "First year only $504", 4: "First year only $672" },
      },
      team_plus: {
        monthly: { 3: "First month only $96", 4: "First month only $128" },
        yearly: {
          3: "First year only $1,008",
          4: "First year only $1,344",
        },
      },
      team_pro: {
        monthly: { 3: "First month only $252", 4: "First month only $336" },
        yearly: {
          3: "First year only $2,592",
          4: "First year only $3,456",
        },
      },
      team_max: {
        monthly: { 3: "First month only $396", 4: "First month only $528" },
        yearly: {
          3: "First year only $3,888",
          4: "First year only $5,184",
        },
      },
    } as const;
    const english = TEAM_PRICING_CONTENT_BY_LOCALE.en;

    for (const tier of PRICING_SNAPSHOT.teamTiers) {
      for (const interval of ["monthly", "yearly"] as const) {
        for (const seats of [3, 4] as const) {
          const template =
            interval === "monthly"
              ? english.monthlyTotal
              : english.yearlyTotal;
          const rendered = template.replace(
            "{amount}",
            formatUsd(teamIntroTotalUsd(tier, interval, seats)),
          );
          assert.equal(
            rendered,
            expected[tier.tier][interval][seats],
            `${tier.tier} ${interval} ${seats} seats`,
          );
        }
      }
    }
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
    const page = await readFile(PRICING_PAGE_PATH, "utf8");

    // Pricing grids are nested inside audience panels, so the generic global
    // `section { padding: 130px 0 }` rule must be cancelled on the grid itself.
    assert.match(page, /\.pr-grid\s*\{[^}]*padding:\s*0;/s);

    // Creator/Team uses the wide underline tabs from the Vela pricing dialog,
    // while billing interval remains its own compact control.
    assert.match(page, /class="pr-audience-toggle"[^>]*role="tablist"/);
    assert.match(page, /\.pr-audience-toggle\s*\{[^}]*border-bottom:/s);
    assert.match(page, /\.pr-audience-btn\.is-active::after/);

    // The visible Team tier control must never open the OS-native select popup.
    assert.doesNotMatch(page, /<select[^>]*data-team-tier/);
    assert.match(page, /data-team-tier[^>]*role="combobox"/);
    assert.match(page, /data-team-tier-options[^>]*role="listbox"/);
    assert.match(page, /data-team-tier-option[^>]*role="option"/);

    // QA explicitly removed the redundant grey total strip.
    assert.doesNotMatch(page, /class="pr-team-total"/);
    assert.doesNotMatch(page, /data-team-total/);
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
      assert.doesNotMatch(copy.monthlyTotal, /\{count\}|\{savings\}/);
      assert.doesNotMatch(copy.yearlyTotal, /\{count\}|\{savings\}/);
      assert.equal("yearlySummary" in copy, false);
    }

    assert.equal(
      TEAM_PRICING_CONTENT_BY_LOCALE.zh.monthlyTotal,
      "首月仅需 {amount}",
    );
    assert.equal(
      TEAM_PRICING_CONTENT_BY_LOCALE.zh.yearlyTotal,
      "首年仅需 {amount}",
    );
    assert.equal(
      TEAM_PRICING_CONTENT_BY_LOCALE.en.monthlyTotal,
      "First month only {amount}",
    );
    assert.equal(
      TEAM_PRICING_CONTENT_BY_LOCALE.en.yearlyTotal,
      "First year only {amount}",
    );
  });

  it("updates the Team intro-period total for period, tier, and seat controls", async () => {
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
      /fillTemplate\(teamContent\.yearlyTotal,\s*\{\s*amount:\s*initialTeamView\.intervalTotal,\s*\}\)/s,
    );
    assert.match(
      updateTeamPlan,
      /interval === 'yearly'\s*\?\s*teamCopy\.yearlyTotal\s*:\s*teamCopy\.monthlyTotal/,
    );
    assert.match(
      updateTeamPlan,
      /const intervalTotal = selected\.introPriceUsd \* teamSeats/,
    );
    assert.match(page, /const activateInterval = \(interval, via\) => \{[\s\S]*?updateTeamPlan\(\)/);
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
        md.includes(`$${tier.monthly.introPriceUsd.toLocaleString("en-US")} / seat / month`),
        `pricing.md missing ${label} monthly intro price`,
      );
      assert.ok(
        md.includes(`$${tier.yearly.introPriceUsd.toLocaleString("en-US")} / seat / year`),
        `pricing.md missing ${label} yearly intro price`,
      );
    }

    assert.ok(
      md.includes(`${usd(PRICING_SNAPSHOT.overageDeployPriceUsd)} each`),
      `pricing.md missing overage price ${usd(PRICING_SNAPSHOT.overageDeployPriceUsd)} each`,
    );
  });
});
