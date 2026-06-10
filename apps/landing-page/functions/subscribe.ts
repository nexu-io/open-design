type KVNamespace = {
  put(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
};

type PagesFunctionContext<Env> = {
  request: Request & { cf?: Record<string, unknown> };
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
};

type PagesFunction<Env> = (context: PagesFunctionContext<Env>) => Response | Promise<Response>;

interface Env {
  NEWSLETTER_SUBSCRIBERS?: KVNamespace;
  NEWSLETTER_SALT?: string;
  RESEND_API_KEY?: string;
  RESEND_NEWSLETTER_SEGMENT_ID?: string;
  RESEND_WELCOME_EMAIL_ENABLED?: string;
  RESEND_WELCOME_EMAIL_FROM?: string;
  RESEND_WELCOME_EMAIL_REPLY_TO?: string;
}

type SubscribeRecord = {
  email: string;
  subscribedAt: string;
  source: string;
  referer: string | null;
  userAgentHash: string;
  country?: string;
  region?: string;
  welcomeEmailAttemptedAt?: string;
  welcomeEmailSentAt?: string;
  welcomeEmailId?: string;
};

// Origins allowed to POST here: the marketing site and the desktop client.
// The desktop client (apps/web) is served from a localhost daemon and Electron
// shell, so its Origin differs from the landing domain — list those too.
const ALLOWED_ORIGINS = [
  "https://open-design.ai",
  "https://www.open-design.ai",
  "od://app",
  "tauri://localhost",
  "http://localhost",
  "http://127.0.0.1",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const ALLOWED_SOURCES = new Set(["landing", "client"]);
const RESEND_CONTACTS_URL = "https://api.resend.com/contacts";
const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const DEFAULT_WELCOME_EMAIL_FROM = "Open Design <updates@open-design.ai>";
const DEFAULT_WELCOME_EMAIL_REPLY_TO = "updates@open-design.ai";
const WELCOME_EMAIL_SUBJECT = "Welcome to OpenDesign — you're in 🎉";
const WELCOME_EMAIL_TEXT = `Hi there,

Thanks for subscribing to the OpenDesign newsletter — you're officially on the list.

Here's what to expect from us:

- Product updates — new features, releases, and what we're building next
- Design system insights — practical lessons on building design systems that scale
- Behind the scenes — how we think about turning design into living, self-evolving systems.

We send thoughtfully, not often. No spam, no filler — just things we think are genuinely worth your time.

If you ever have feedback, ideas, or just want to say hi, simply reply to this email. We read every one.

Talk soon,
The OpenDesign Team

---
You're receiving this because you subscribed at open-design.ai.`;
const WELCOME_EMAIL_HTML = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f7f2e7;color:#171511;font-family:Inter,Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:40px 24px;">
      <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.15;color:#171511;">Welcome to OpenDesign</h1>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Hi there,</p>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Thanks for subscribing to the OpenDesign newsletter — you're officially on the list.</p>
      <p style="margin:0 0 12px;font-size:16px;line-height:1.6;">Here's what to expect from us:</p>
      <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.6;">
        <li><strong>Product updates</strong> — new features, releases, and what we're building next</li>
        <li><strong>Design system insights</strong> — practical lessons on building design systems that scale</li>
        <li><strong>Behind the scenes</strong> — how we think about turning design into living, self-evolving systems.</li>
      </ul>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">We send thoughtfully, not often. No spam, no filler — just things we think are genuinely worth your time.</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">If you ever have feedback, ideas, or just want to say hi, simply reply to this email. We read every one.</p>
      <p style="margin:0 0 28px;font-size:16px;line-height:1.6;">Talk soon,<br>The OpenDesign Team</p>
      <p style="margin:0;padding-top:20px;border-top:1px solid #d8cfbd;color:#6b6559;font-size:13px;line-height:1.5;">You're receiving this because you subscribed at open-design.ai.</p>
    </div>
  </body>
</html>`;

type Fetcher = typeof fetch;

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin &&
    ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(`${o}:`))
      ? origin
      : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(
  body: unknown,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function writeNewsletterKv(
  namespace: KVNamespace | undefined,
  key: string,
  record: SubscribeRecord,
): Promise<void> {
  if (namespace) {
    await namespace.put(key, JSON.stringify(record));
    return;
  }

  // The KV binding is missing — collection is silently broken. Surface this
  // loudly for operators, but never write the raw email/referer to provider
  // logs: log only non-PII metadata (hashed key, source, country).
  console.warn(
    "newsletter_subscribe_kv_unbound: NEWSLETTER_SUBSCRIBERS binding missing; subscription dropped",
    JSON.stringify({ key, source: record.source, country: record.country }),
  );
}

async function readNewsletterKv(
  namespace: KVNamespace | undefined,
  key: string,
): Promise<SubscribeRecord | null> {
  if (!namespace) return null;

  const value = await namespace.get(key);
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<SubscribeRecord>;
    if (typeof parsed.email !== "string" || typeof parsed.subscribedAt !== "string") return null;
    return parsed as SubscribeRecord;
  } catch {
    console.warn("newsletter_subscribe_kv_invalid_record", JSON.stringify({ key }));
    return null;
  }
}

function isExistingContactStatus(status: number): boolean {
  // Resend may return a validation/client error for an existing global contact
  // depending on API version. Treat those as a signal to ensure segment
  // membership without changing the contact's global unsubscribe state.
  return status === 409 || status === 422;
}

async function createResendContact(
  apiKey: string,
  email: string,
  segmentId: string | null,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  const body: {
    email: string;
    unsubscribed: false;
    segments?: Array<{ id: string }>;
  } = {
    email,
    unsubscribed: false,
  };
  if (segmentId) {
    body.segments = [{ id: segmentId }];
  }

  return fetcher(RESEND_CONTACTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function addResendContactToSegment(
  apiKey: string,
  email: string,
  segmentId: string,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  return fetcher(`${RESEND_CONTACTS_URL}/${encodeURIComponent(email)}/segments/${
    encodeURIComponent(segmentId)
  }`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
}

async function syncResendNewsletterContact(
  apiKey: string | undefined,
  segmentId: string | undefined,
  email: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  if (!apiKey) {
    console.warn("newsletter_resend_unset: RESEND_API_KEY missing; skipped Resend, KV only");
    return;
  }

  const normalizedSegmentId = segmentId?.trim() || null;
  if (!normalizedSegmentId) {
    console.warn(
      "newsletter_resend_segment_unset: RESEND_NEWSLETTER_SEGMENT_ID missing; contact will not be grouped",
    );
  }

  try {
    const createRes = await createResendContact(apiKey, email, normalizedSegmentId, fetcher);
    if (createRes.ok) return;

    if (isExistingContactStatus(createRes.status)) {
      if (!normalizedSegmentId) return;

      const segmentRes = await addResendContactToSegment(apiKey, email, normalizedSegmentId, fetcher);
      if (segmentRes.ok || isExistingContactStatus(segmentRes.status)) return;
      console.warn("newsletter_resend_segment_failed", JSON.stringify({ status: segmentRes.status }));
      return;
    }

    console.warn("newsletter_resend_contact_failed", JSON.stringify({ status: createRes.status }));
  } catch {
    console.warn("newsletter_resend_request_failed");
  }
}

function isWelcomeEmailEnabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized !== "0" && normalized !== "false" && normalized !== "off" && normalized !== "no";
}

function shouldAttemptWelcomeEmail(existingRecord: SubscribeRecord | null): boolean {
  if (existingRecord?.welcomeEmailSentAt) return false;
  if (!existingRecord) return true;
  return Boolean(existingRecord.welcomeEmailAttemptedAt);
}

async function sendResendWelcomeEmail(
  env: Env,
  email: string,
  idempotencyKey: string,
  fetcher: Fetcher = fetch,
): Promise<{ id?: string; sentAt: string } | null> {
  if (!isWelcomeEmailEnabled(env.RESEND_WELCOME_EMAIL_ENABLED)) return null;

  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("newsletter_welcome_resend_unset: RESEND_API_KEY missing; skipped welcome email");
    return null;
  }

  const from = env.RESEND_WELCOME_EMAIL_FROM?.trim() || DEFAULT_WELCOME_EMAIL_FROM;
  const replyTo = env.RESEND_WELCOME_EMAIL_REPLY_TO?.trim() || DEFAULT_WELCOME_EMAIL_REPLY_TO;

  try {
    const response = await fetcher(RESEND_EMAILS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: email,
        reply_to: replyTo,
        subject: WELCOME_EMAIL_SUBJECT,
        html: WELCOME_EMAIL_HTML,
        text: WELCOME_EMAIL_TEXT,
        tags: [
          { name: "type", value: "newsletter_welcome" },
          { name: "surface", value: "landing_subscribe" },
        ],
      }),
    });

    if (!response.ok) {
      console.warn("newsletter_welcome_send_failed", JSON.stringify({ status: response.status }));
      return null;
    }

    const data = (await response.json().catch(() => ({}))) as { id?: unknown };
    return {
      id: typeof data.id === "string" ? data.id : undefined,
      sentAt: new Date().toISOString(),
    };
  } catch {
    console.warn("newsletter_welcome_request_failed");
    return null;
  }
}

async function persistNewsletterSubscription(
  env: Env,
  key: string,
  record: SubscribeRecord,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const existingRecord = await readNewsletterKv(env.NEWSLETTER_SUBSCRIBERS, key);
  const canDeduplicateWelcome = Boolean(env.NEWSLETTER_SUBSCRIBERS);
  const attemptWelcome = canDeduplicateWelcome && shouldAttemptWelcomeEmail(existingRecord);
  const welcomeAttemptedAt = attemptWelcome ? new Date().toISOString() : undefined;
  const nextRecord: SubscribeRecord = {
    ...existingRecord,
    ...record,
    welcomeEmailAttemptedAt: welcomeAttemptedAt ?? existingRecord?.welcomeEmailAttemptedAt,
    welcomeEmailSentAt: existingRecord?.welcomeEmailSentAt,
    welcomeEmailId: existingRecord?.welcomeEmailId,
  };

  await writeNewsletterKv(env.NEWSLETTER_SUBSCRIBERS, key, nextRecord);

  await syncResendNewsletterContact(
    env.RESEND_API_KEY,
    env.RESEND_NEWSLETTER_SEGMENT_ID,
    record.email,
    fetcher,
  );

  if (!attemptWelcome) return;

  const welcomeResult = await sendResendWelcomeEmail(env, record.email, `newsletter-welcome-${key}`, fetcher);
  if (!welcomeResult) return;

  await writeNewsletterKv(env.NEWSLETTER_SUBSCRIBERS, key, {
    ...nextRecord,
    welcomeEmailSentAt: welcomeResult.sentAt,
    welcomeEmailId: welcomeResult.id,
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const request = context.request;
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405, origin);
  }

  let payload: { email?: unknown; source?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400, origin);
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    return json({ ok: false, error: "invalid_email" }, 400, origin);
  }

  const source =
    typeof payload.source === "string" && ALLOWED_SOURCES.has(payload.source)
      ? payload.source
      : "unknown";

  const ip = request.headers.get("cf-connecting-ip") || "";
  const userAgent = request.headers.get("user-agent") || "";
  const salt = context.env.NEWSLETTER_SALT || "open-design-newsletter";
  const cf = request.cf || {};
  const record: SubscribeRecord = {
    email,
    subscribedAt: new Date().toISOString(),
    source,
    referer: request.headers.get("referer"),
    userAgentHash: await sha256Hex(`${salt}:${ip}:${userAgent}`),
    country: typeof cf.country === "string" ? cf.country : undefined,
    region: typeof cf.region === "string" ? cf.region : undefined,
  };

  // sha256(email) as the key makes the write idempotent: a repeated signup
  // overwrites the same record instead of growing the namespace unbounded.
  const key = `sub:${await sha256Hex(email)}`;

  context.waitUntil(persistNewsletterSubscription(context.env, key, record));

  return json({ ok: true }, 200, origin);
};

export const __newsletterSubscribeTest = {
  corsHeaders,
  persistNewsletterSubscription,
  shouldAttemptWelcomeEmail,
};
