import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  CLOUD_CONSOLE_URL,
  PLANS_JSON_URL,
  PRICING_SNAPSHOT,
  cloudSubscribeUrl,
  scopedBillingPlanUrl,
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
  it("points the public pricing URL at the landing-page JSON contract", () => {
    assert.equal(PLANS_JSON_URL, "/pricing/plans.json");
  });

  it("uses Vela's stable billing-plan deep link instead of wallet-era aliases", () => {
    assert.equal(
      CLOUD_CONSOLE_URL,
      "https://vela.powerformer.net/dashboard?billing=plan",
    );
    assert.equal(
      cloudSubscribeUrl("pro", "yearly"),
      "https://vela.powerformer.net/dashboard?billing=plan",
    );
    assert.equal(
      scopedBillingPlanUrl("workspace-a"),
      "https://vela.powerformer.net/dashboard?billing=plan&workspaceId=workspace-a",
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
    }
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
