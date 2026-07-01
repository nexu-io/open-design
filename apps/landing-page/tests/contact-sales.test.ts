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
  name: "Ada",
  email: "ada@acme.com",
  source: "enterprise",
  company: "Acme",
  teamSize: "11-50",
  budget: "usd_50_200",
  useCases: ["design_system"],
};

describe("contact-sales validation", () => {
  it("rejects a missing or invalid email on every source", async () => {
    assert.equal((await call({ ...ENTERPRISE_OK, email: "" })).body.error, "invalid_email");
    assert.equal((await call({ ...ENTERPRISE_OK, email: "not-an-email" })).body.error, "invalid_email");
    assert.equal((await call({ name: "Ada", source: "pricing_team" })).body.error, "invalid_email");
  });

  it("rejects a missing name on every source", async () => {
    const { status, body } = await call({ email: "ada@acme.com", source: "pricing_team" });
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

  it("keeps the in-app `client` source strict too (only pricing_team is relaxed)", async () => {
    assert.equal((await call({ name: "Ada", email: "ada@acme.com", source: "client" })).body.error, "missing_fields");
  });

  it("keeps the enterprise contract: company + known team-size/budget + a use case are required", async () => {
    assert.equal((await call({ ...ENTERPRISE_OK, company: "" })).body.error, "missing_fields");
    assert.equal((await call({ ...ENTERPRISE_OK, teamSize: "nonsense" })).body.error, "missing_fields");
    assert.equal((await call({ ...ENTERPRISE_OK, budget: "nonsense" })).body.error, "missing_fields");
    assert.equal((await call({ ...ENTERPRISE_OK, useCases: [] })).body.error, "missing_fields");
  });

  it("accepts a complete enterprise submission", async () => {
    const { status, body } = await call(ENTERPRISE_OK);
    assert.equal(status, 200);
    assert.equal(body.ok, true);
  });

  it("accepts a pricing_team lead with only name + email (canonical team-size/budget enums)", async () => {
    const { status, body } = await call({
      name: "Ada",
      email: "ada@acme.com",
      source: "pricing_team",
      teamSize: "11-50",
      budget: "usd_1k_5k",
      location: "中国大陆",
      seats: "20",
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
  });
});
