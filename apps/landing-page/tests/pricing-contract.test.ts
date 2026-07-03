import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  PLANS_JSON_URL,
  PRICING_SNAPSHOT,
  type PricingContract,
} from "../app/_lib/pricing.ts";

const CONTRACT_PATH = new URL("../public/pricing/plans.json", import.meta.url);
const HEADERS_PATH = new URL("../public/_headers", import.meta.url);

function assertPlanContract(value: unknown): asserts value is PricingContract {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);

  const contract = value as PricingContract;
  assert.equal(contract.version, 1);
  assert.equal(contract.currency, "USD");
  assert.equal(typeof contract.overageDeployPriceUsd, "number");
  assert.equal(Array.isArray(contract.tiers), true);
  assert.deepEqual(
    contract.tiers.map((tier) => tier.tier),
    ["plus", "pro", "max"],
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
}

describe("pricing contract", () => {
  it("points the public pricing URL at the landing-page JSON contract", () => {
    assert.equal(PLANS_JSON_URL, "/pricing/plans.json");
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
});
