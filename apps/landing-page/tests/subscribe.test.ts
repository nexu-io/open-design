import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { __newsletterSubscribeTest } from "../functions/subscribe.ts";

type TestKv = {
  put(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
};

type FetchCall = {
  url: string;
  init: RequestInit;
};

const BASE_RECORD = {
  email: "user@example.com",
  subscribedAt: "2026-06-05T00:00:00.000Z",
  source: "landing",
  referer: "https://open-design.ai/",
  userAgentHash: "agent-hash",
};

class MemoryKv implements TestKv {
  readonly values = new Map<string, string>();

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
}

function createFetchRecorder(emailResponseStatus = 200): {
  calls: FetchCall[];
  fetcher: typeof fetch;
} {
  const calls: FetchCall[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });

    if (url === "https://api.resend.com/emails") {
      return new Response(JSON.stringify({ id: "welcome-email-id" }), {
        status: emailResponseStatus,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ id: "contact-id" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  return { calls, fetcher };
}

function createEnv(kv: TestKv) {
  return {
    NEWSLETTER_SUBSCRIBERS: kv,
    RESEND_API_KEY: "re_test",
    RESEND_NEWSLETTER_SEGMENT_ID: "segment-id",
  };
}

describe("newsletter subscribe welcome email", () => {
  it("allows packaged desktop app requests from the od protocol", () => {
    const headers = __newsletterSubscribeTest.corsHeaders("od://app");

    assert.equal(headers["Access-Control-Allow-Origin"], "od://app");
  });

  it("allows localhost web runtime requests", () => {
    const headers = __newsletterSubscribeTest.corsHeaders("http://127.0.0.1:58100");

    assert.equal(headers["Access-Control-Allow-Origin"], "http://127.0.0.1:58100");
  });

  it("sends and records a welcome email for a new subscriber", async () => {
    const kv = new MemoryKv();
    const { calls, fetcher } = createFetchRecorder();

    await __newsletterSubscribeTest.persistNewsletterSubscription(
      createEnv(kv),
      "sub:abc",
      BASE_RECORD,
      fetcher,
    );

    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.url, "https://api.resend.com/contacts");
    assert.equal(calls[1]?.url, "https://api.resend.com/emails");
    assert.equal(calls[1]?.init.headers?.["Idempotency-Key" as keyof HeadersInit], "newsletter-welcome-sub:abc");

    const emailBody = JSON.parse(String(calls[1]?.init.body));
    assert.equal(emailBody.from, "Open Design <updates@open-design.ai>");
    assert.equal(emailBody.reply_to, "updates@open-design.ai");
    assert.equal(emailBody.to, "user@example.com");
    assert.equal(emailBody.subject, "Welcome to OpenDesign — you're in 🎉");
    assert.match(emailBody.text, /Thanks for subscribing to the OpenDesign newsletter/);
    assert.match(emailBody.html, /Welcome to OpenDesign/);

    const stored = JSON.parse(kv.values.get("sub:abc") ?? "{}");
    assert.equal(stored.welcomeEmailId, "welcome-email-id");
    assert.equal(typeof stored.welcomeEmailAttemptedAt, "string");
    assert.equal(typeof stored.welcomeEmailSentAt, "string");
  });

  it("does not backfill welcome email for legacy subscribers without a welcome attempt", async () => {
    const kv = new MemoryKv();
    await kv.put("sub:abc", JSON.stringify(BASE_RECORD));
    const { calls, fetcher } = createFetchRecorder();

    await __newsletterSubscribeTest.persistNewsletterSubscription(
      createEnv(kv),
      "sub:abc",
      { ...BASE_RECORD, subscribedAt: "2026-06-05T01:00:00.000Z" },
      fetcher,
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://api.resend.com/contacts");

    const stored = JSON.parse(kv.values.get("sub:abc") ?? "{}");
    assert.equal(stored.welcomeEmailAttemptedAt, undefined);
    assert.equal(stored.welcomeEmailSentAt, undefined);
    assert.equal(stored.subscribedAt, "2026-06-05T01:00:00.000Z");
  });

  it("retries welcome email when a previous first-subscribe attempt did not send", async () => {
    const kv = new MemoryKv();
    await kv.put(
      "sub:abc",
      JSON.stringify({
        ...BASE_RECORD,
        welcomeEmailAttemptedAt: "2026-06-05T00:01:00.000Z",
      }),
    );
    const { calls, fetcher } = createFetchRecorder();

    await __newsletterSubscribeTest.persistNewsletterSubscription(
      createEnv(kv),
      "sub:abc",
      { ...BASE_RECORD, subscribedAt: "2026-06-05T02:00:00.000Z" },
      fetcher,
    );

    assert.equal(calls.length, 2);
    assert.equal(calls[1]?.url, "https://api.resend.com/emails");

    const stored = JSON.parse(kv.values.get("sub:abc") ?? "{}");
    assert.equal(stored.welcomeEmailId, "welcome-email-id");
    assert.equal(typeof stored.welcomeEmailSentAt, "string");
  });
});
