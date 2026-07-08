import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { onRequest } from "../functions/contact-sales.ts";

// Drive the Pages Function directly with a mock context. No env bindings are
// provided, so persistLead() takes its unbound path (warns, no network) and the
// handler still resolves to its JSON response.
async function call(
  payload: unknown,
  origin = "https://open-design.ai",
): Promise<{ status: number; body: { ok: boolean; error?: string } }> {
  const waited: Promise<unknown>[] = [];
  const request = new Request("https://open-design.ai/contact-sales", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(payload),
  });
  const res = await onRequest({
    request,
    env: {},
    waitUntil: (p: Promise<unknown>) => waited.push(p),
    // deno-lint-ignore no-explicit-any
  } as unknown as Parameters<typeof onRequest>[0]);
  await Promise.allSettled(waited);
  return { status: res.status, body: (await res.json()) as { ok: boolean; error?: string } };
}

const ENTERPRISE_OK = {
  email: "ada@acme.com",
  source: "enterprise",
  company: "Acme",
  teamSize: "11-50",
  seats: "20-50",
  budget: "usd_50_200",
  useCases: ["design_system"],
  industry: "internet_software",
  location: "中国 (CN)",
};

// The /pricing "Request team access" modal renders the same shared lead form,
// so it submits the identical contract — only `source` differs.
const PRICING_TEAM_OK = { ...ENTERPRISE_OK, source: "pricing_team" };

describe("contact-sales validation", () => {
  it("rejects a missing or invalid email on every source", async () => {
    assert.equal((await call({ ...ENTERPRISE_OK, email: "" })).body.error, "invalid_email");
    assert.equal((await call({ ...ENTERPRISE_OK, email: "not-an-email" })).body.error, "invalid_email");
    assert.equal((await call({ name: "Ada", source: "pricing_team" })).body.error, "invalid_email");
  });

  it("does not require a name on the shared lead-form sources; the in-app `client` source still does", async () => {
    // Neither web surface collects a name (email is the contact handle).
    assert.equal((await call(ENTERPRISE_OK)).status, 200);
    assert.equal((await call(PRICING_TEAM_OK)).status, 200);
    const { status, body } = await call({ ...ENTERPRISE_OK, source: "client" });
    assert.equal(status, 400);
    assert.equal(body.error, "missing_fields");
  });

  it("rejects an unrecognized or missing source (no silent relaxed write)", async () => {
    assert.equal((await call({ name: "Ada", email: "ada@acme.com", source: "bogus" })).body.error, "invalid_source");
    assert.equal((await call({ name: "Ada", email: "ada@acme.com" })).body.error, "invalid_source");
    // An unknown source must not sneak through the name+email-only path.
    const typo = await call({ name: "Ada", email: "ada@acme.com", source: "enterprisee" });
    assert.equal(typo.status, 400);
    assert.equal(typo.body.error, "invalid_source");
  });

  it("keeps the in-app `client` source strict (name + full enums)", async () => {
    assert.equal((await call({ name: "Ada", email: "ada@acme.com", source: "client" })).body.error, "missing_fields");
    // With a name and the full enum contract, client is accepted; industry and
    // location predate the field there and stay optional.
    const { industry: _industry, location: _location, ...clientContract } = ENTERPRISE_OK;
    assert.equal((await call({ ...clientContract, name: "Ada", source: "client" })).status, 200);
  });

  it("keeps the shared contract: known team-size/seat-range/budget enums + a use case are required", async () => {
    assert.equal((await call({ ...ENTERPRISE_OK, teamSize: "nonsense" })).body.error, "missing_fields");
    assert.equal((await call({ ...ENTERPRISE_OK, seats: "" })).body.error, "missing_fields");
    assert.equal((await call({ ...ENTERPRISE_OK, seats: "nonsense" })).body.error, "missing_fields");
    assert.equal((await call({ ...ENTERPRISE_OK, budget: "nonsense" })).body.error, "missing_fields");
    assert.equal((await call({ ...ENTERPRISE_OK, useCases: [] })).body.error, "missing_fields");
    // Company became optional when the form slimmed down.
    assert.equal((await call({ ...ENTERPRISE_OK, company: "" })).status, 200);
  });

  it("requires a known industry on both shared lead-form sources", async () => {
    assert.equal((await call({ ...ENTERPRISE_OK, industry: "" })).body.error, "missing_fields");
    assert.equal((await call({ ...ENTERPRISE_OK, industry: "nonsense" })).body.error, "missing_fields");
    assert.equal((await call({ ...PRICING_TEAM_OK, industry: "" })).body.error, "missing_fields");
    assert.equal((await call({ ...PRICING_TEAM_OK, industry: "nonsense" })).body.error, "missing_fields");
    assert.equal((await call({ ...ENTERPRISE_OK, industry: "gaming" })).status, 200);
  });

  it("requires location on both shared lead-form sources", async () => {
    assert.equal((await call({ ...ENTERPRISE_OK, location: "" })).body.error, "missing_fields");
    assert.equal((await call({ ...PRICING_TEAM_OK, location: "" })).body.error, "missing_fields");
  });

  it("accepts a complete enterprise submission", async () => {
    const { status, body } = await call(ENTERPRISE_OK);
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    // The expanded use-case vocabulary is accepted.
    assert.equal((await call({ ...ENTERPRISE_OK, useCases: ["video_motion"] })).status, 200);
  });

  it("holds pricing_team to the same full contract (the old relaxed name+email path is gone)", async () => {
    // The full shared contract is accepted.
    const { status, body } = await call(PRICING_TEAM_OK);
    assert.equal(status, 200);
    assert.equal(body.ok, true);

    // Each relaxation the retired lightweight pricing modal relied on now fails
    // on its own — mutate exactly one rule per assertion from the otherwise
    // valid PRICING_TEAM_OK so no single check leans on another field also
    // being wrong.
    // Free-form numeric seats (the old modal sent e.g. "20", not a range code):
    assert.equal((await call({ ...PRICING_TEAM_OK, seats: "20" })).body.error, "missing_fields");
    // Legacy pricing-only budget buckets that are no longer in the enum:
    assert.equal((await call({ ...PRICING_TEAM_OK, budget: "lt_1k" })).body.error, "missing_fields");
    assert.equal((await call({ ...PRICING_TEAM_OK, budget: "usd_20k_plus" })).body.error, "missing_fields");
    // The old modal collected neither a use case nor an industry:
    assert.equal((await call({ ...PRICING_TEAM_OK, useCases: [] })).body.error, "missing_fields");
    assert.equal((await call({ ...PRICING_TEAM_OK, industry: "" })).body.error, "missing_fields");
  });
});
