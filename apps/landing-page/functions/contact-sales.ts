/*
 * /contact-sales — canonical Workspace-for-Teams lead intake.
 *
 * The /enterprise and /pricing forms submit here from the same origin. Vela
 * relays Team-plan leads server-to-server with an HMAC signature over the raw
 * request body. After validation, this function performs exactly one write to
 * CONTACT_LEADS using lead:<sha256(normalized email)>; a newer submission from
 * the same email intentionally replaces the previous value. Downstream systems
 * poll that KV namespace, so this boundary has no outbound notification or
 * delivery-outbox responsibility.
 *
 * Cloudflare Pages configuration:
 * - CONTACT_LEADS is a required KV binding. Production and staging use the
 *   distinct namespace IDs declared in their respective Wrangler files.
 * - CONTACT_SALES_SERVICE_SECRET is an encrypted secret shared only with Vela.
 *   Configure it independently on both Pages projects; never commit its value.
 */
type KVNamespace = {
  put(key: string, value: string): Promise<void>;
};

type PagesFunctionContext<Env> = {
  request: Request & { cf?: Record<string, unknown> };
  env: Env;
  /** Test seam; Cloudflare does not provide this field. */
  now?: () => number;
};

type PagesFunction<Env> = (
  context: PagesFunctionContext<Env>,
) => Response | Promise<Response>;

interface Env {
  CONTACT_SALES_SERVICE_SECRET?: string;
  CONTACT_LEADS?: KVNamespace;
}

type ContactSource = "enterprise" | "pricing_team" | "vela_team_plan";

type ContactLead = {
  name: string;
  email: string;
  company: string;
  teamSize: string;
  budget: string;
  useCases: string[];
  /** Canonical industry enum code (see ALLOWED_INDUSTRIES). */
  industry: string;
  role: string;
  /** User-entered country / region (distinct from the Cloudflare geo below). */
  location: string;
  seats: string;
  message: string;
  source: ContactSource;
  locale: string;
  pageUrl: string;
  submittedAt: string;
  referer: string | null;
  /** Stable Vela event identifier, present only for server-relayed leads. */
  eventId?: string;
  billingInterval?: "monthly" | "yearly";
  country?: string;
  region?: string;
};

// Strict shape, not the loose "no whitespace, one @, a dot" check: the 07-11
// SQLi scan submitted payloads like `testing@example.com'||dbms_pipe...` that
// the loose regex accepted into KV and which then broke the downstream Bitable
// sync (its email column rejects them, and the batch insert is atomic).
// Local part: common atom charset incl. apostrophe (o'brien@…). Domain:
// hyphenated alphanumeric labels with a letters-only TLD — no quotes, pipes,
// parens, or `&`/`=` can survive this.
const EMAIL_RE =
  /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_SHORT = 200;
const MAX_MESSAGE = 4000;
const VELA_TEAM_PLAN_SOURCE = "vela_team_plan";
const ALLOWED_SOURCES = new Set<ContactSource>([
  "enterprise",
  "pricing_team",
  VELA_TEAM_PLAN_SOURCE,
]);
const SERVICE_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;
const ALLOWED_TEAM_SIZES = new Set(["1-10", "11-50", "51-200", "200+"]);
const ALLOWED_BUDGETS = new Set([
  "lt_50",
  "usd_50_200",
  "usd_200_1k",
  "usd_1k_5k",
  "usd_5k_plus",
  "unsure",
]);
const ALLOWED_SEATS = new Set([
  "1-5",
  "5-10",
  "10-20",
  "20-50",
  "50-100",
  "100-200",
  "200-500",
  "500+",
]);
const ALLOWED_USE_CASES = new Set([
  "product_design",
  "design_system",
  "prototype",
  "marketing",
  "brand",
  "social_media",
  "poster_print",
  "deck",
  "video_motion",
  "illustration",
  "dashboards",
  "education",
  "game_assets",
  "other",
]);
// Keep in lockstep with `industryOptions` in
// app/_lib/enterprise-lead-copy.ts.
const ALLOWED_INDUSTRIES = new Set([
  "internet_software",
  "ecommerce_retail",
  "advertising_marketing",
  "finance",
  "education",
  "gaming",
  "media_entertainment",
  "manufacturing",
  "healthcare",
  "government_nonprofit",
  "other",
]);

function requestIsSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function corsHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (requestIsSameOrigin(request)) {
    headers["Access-Control-Allow-Origin"] =
      request.headers.get("origin") as string;
  }
  return headers;
}

function json(body: unknown, status: number, request: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request),
    },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  try {
    return Uint8Array.from(atob(padded), (character) =>
      character.charCodeAt(0),
    );
  } catch {
    return null;
  }
}

async function verifyServiceSignature(options: {
  eventId: string;
  nowMs: number;
  rawBody: string;
  request: Request;
  secret: string;
}): Promise<
  | "service_auth_expired"
  | "service_auth_invalid"
  | "service_auth_required"
  | null
> {
  const timestampValue = options.request.headers.get(
    "x-od-service-timestamp",
  );
  const headerEventId = options.request.headers.get("x-od-service-event-id");
  const signatureValue = options.request.headers.get("x-od-service-signature");
  if (!timestampValue || !headerEventId || !signatureValue) {
    return "service_auth_required";
  }
  if (
    headerEventId !== options.eventId ||
    !/^[A-Za-z0-9._:-]{1,200}$/u.test(headerEventId) ||
    !/^\d{13}$/u.test(timestampValue)
  ) {
    return "service_auth_invalid";
  }

  const timestamp = Number(timestampValue);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(options.nowMs - timestamp) > SERVICE_SIGNATURE_MAX_AGE_MS
  ) {
    return "service_auth_expired";
  }

  const signature = base64UrlToBytes(signatureValue);
  if (!signature) return "service_auth_invalid";
  const bodyDigest = await sha256Hex(options.rawBody);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(options.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    new Uint8Array(signature).buffer,
    new TextEncoder().encode(
      `${timestampValue}\n${headerEventId}\n${bodyDigest}`,
    ),
  );
  return valid ? null : "service_auth_invalid";
}

function readString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function readUseCases(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (
      typeof item === "string" &&
      ALLOWED_USE_CASES.has(item) &&
      !result.includes(item)
    ) {
      result.push(item);
    }
  }
  return result;
}

class ContactSalesPersistenceError extends Error {
  readonly code: "lead_storage_failed" | "lead_storage_unavailable";

  constructor(code: "lead_storage_failed" | "lead_storage_unavailable") {
    super(code);
    this.name = "ContactSalesPersistenceError";
    this.code = code;
  }
}

async function persistLead(env: Env, lead: ContactLead): Promise<void> {
  const kv = env.CONTACT_LEADS;
  if (!kv) {
    console.warn(
      "contact_sales_kv_unbound: CONTACT_LEADS binding missing; lead not persisted",
      JSON.stringify({ source: lead.source }),
    );
    throw new ContactSalesPersistenceError("lead_storage_unavailable");
  }

  try {
    const leadKey = `lead:${await sha256Hex(lead.email)}`;
    await kv.put(leadKey, JSON.stringify(lead));
  } catch {
    console.warn("contact_sales_kv_write_failed");
    throw new ContactSalesPersistenceError("lead_storage_failed");
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const request = context.request;
  const origin = request.headers.get("origin");
  const nowMs = context.now?.() ?? Date.now();

  if (request.method === "OPTIONS") {
    if (!requestIsSameOrigin(request)) {
      return json({ ok: false, error: "origin_not_allowed" }, 403, request);
    }
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405, request);
  }

  // Browser fetches always carry Origin. Requiring it to match the endpoint URL
  // keeps the relative /contact-sales forms portable across production,
  // staging, and preview domains without enabling a cross-origin write API.
  // Trusted Vela server calls omit Origin and authenticate below instead.
  if (origin && !requestIsSameOrigin(request)) {
    return json({ ok: false, error: "origin_not_allowed" }, 403, request);
  }

  let rawBody: string;
  let payload: Record<string, unknown>;
  try {
    rawBody = await request.text();
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid JSON object");
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400, request);
  }

  const email = readString(payload.email, MAX_EMAIL_LENGTH).toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return json({ ok: false, error: "invalid_email" }, 400, request);
  }

  const source =
    typeof payload.source === "string" &&
    ALLOWED_SOURCES.has(payload.source as ContactSource)
      ? (payload.source as ContactSource)
      : null;
  if (!source) {
    return json({ ok: false, error: "invalid_source" }, 400, request);
  }

  let serviceEventId: string | null = null;
  if (source === VELA_TEAM_PLAN_SOURCE) {
    serviceEventId = readString(payload.eventId, MAX_SHORT);
    const serviceSecret = context.env.CONTACT_SALES_SERVICE_SECRET?.trim();
    if (!serviceSecret) {
      console.warn(
        "contact_sales_service_auth_unconfigured: CONTACT_SALES_SERVICE_SECRET missing",
      );
      return json(
        { ok: false, error: "service_auth_unavailable" },
        503,
        request,
      );
    }
    const authError = await verifyServiceSignature({
      eventId: serviceEventId,
      nowMs,
      rawBody,
      request,
      secret: serviceSecret,
    });
    if (authError) {
      return json({ ok: false, error: authError }, 401, request);
    }
  } else if (!origin) {
    // Public form sources are browser-only. Server relays must use the signed
    // Vela source instead of bypassing the same-origin browser boundary.
    return json({ ok: false, error: "origin_required" }, 403, request);
  }

  const company = readString(payload.company, MAX_SHORT);
  const teamSize = readString(payload.teamSize, MAX_SHORT);
  const budget = readString(payload.budget, MAX_SHORT);
  const seats = readString(payload.seats, MAX_SHORT);
  const location =
    readString(payload.location, MAX_SHORT) ||
    (source === VELA_TEAM_PLAN_SOURCE
      ? readString(payload.country, MAX_SHORT)
      : "");
  const useCases =
    source === VELA_TEAM_PLAN_SOURCE
      ? readUseCases([payload.useCase])
      : readUseCases(payload.useCases);
  const industryRaw = readString(payload.industry, MAX_SHORT);
  const industry = ALLOWED_INDUSTRIES.has(industryRaw) ? industryRaw : "";

  if (
    !ALLOWED_TEAM_SIZES.has(teamSize) ||
    !ALLOWED_SEATS.has(seats) ||
    !ALLOWED_BUDGETS.has(budget) ||
    !location ||
    !industry ||
    useCases.length === 0
  ) {
    return json({ ok: false, error: "missing_fields" }, 400, request);
  }

  const cf = request.cf || {};
  const billingInterval =
    payload.billingInterval === "monthly" ||
    payload.billingInterval === "yearly"
      ? payload.billingInterval
      : undefined;
  const lead: ContactLead = {
    name: readString(payload.name, MAX_SHORT),
    email,
    company,
    teamSize,
    budget,
    useCases,
    industry,
    role: readString(payload.role, MAX_SHORT),
    location,
    seats,
    message: readString(payload.message, MAX_MESSAGE),
    source,
    locale: readString(payload.locale, 16) || "en",
    pageUrl: readString(payload.pageUrl, 512),
    submittedAt: new Date(nowMs).toISOString(),
    referer: request.headers.get("referer"),
    ...(serviceEventId ? { eventId: serviceEventId } : {}),
    billingInterval,
    country: typeof cf.country === "string" ? cf.country : undefined,
    region: typeof cf.region === "string" ? cf.region : undefined,
  };

  try {
    await persistLead(context.env, lead);
  } catch (error) {
    const code =
      error instanceof ContactSalesPersistenceError
        ? error.code
        : "lead_storage_failed";
    return json({ ok: false, error: code }, 503, request);
  }

  return json({ ok: true }, 200, request);
};

export const __contactSalesTest = {
  corsHeaders,
  requestIsSameOrigin,
  verifyServiceSignature,
};
