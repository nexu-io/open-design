/*
 * /contact-sales — Workspace-for-Teams lead intake.
 *
 * The /enterprise/ page POSTs a lead here; we validate it, fan it out to a
 * Feishu (Lark) custom-bot webhook so the team gets a real-time card, and keep
 * a KV backup so a Feishu outage never silently drops a lead. Mirrors the
 * shape and safety posture of `subscribe.ts` (CORS allowlist, no PII in
 * provider logs, idempotent KV key, delivery on `waitUntil`).
 *
 * Config (Cloudflare Pages env):
 * - FEISHU_CONTACT_WEBHOOK  custom-bot incoming webhook URL (required to notify)
 * - FEISHU_CONTACT_SECRET   optional bot signing secret (set if the bot enforces
 *                           signature verification)
 * - CONTACT_LEADS           optional KV namespace for the durable backup
 */
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
  CONTACT_LEADS?: KVNamespace;
  FEISHU_CONTACT_WEBHOOK?: string;
  FEISHU_CONTACT_SECRET?: string;
}

type ContactLead = {
  name: string;
  email: string;
  company: string;
  teamSize: string;
  budget: string;
  useCases: string[];
  role: string;
  /** User-entered country / region (distinct from the Cloudflare geo below). */
  location: string;
  /** Expected seat count (free text, e.g. "20"). */
  seats: string;
  message: string;
  source: string;
  locale: string;
  pageUrl: string;
  submittedAt: string;
  referer: string | null;
  country?: string;
  region?: string;
};

const ALLOWED_ORIGINS = [
  "https://open-design.ai",
  "https://www.open-design.ai",
  "https://staging.open-design.ai",
  "od://app",
  "tauri://localhost",
  "http://localhost",
  "http://127.0.0.1",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_SHORT = 200;
const MAX_MESSAGE = 4000;
// `enterprise` = the /enterprise page (full lead form, strict contract).
// `pricing_team` = the lightweight /pricing "Request Team" modal (name + email
// required, everything else optional). `client` = in-app.
const ALLOWED_SOURCES = new Set(["enterprise", "pricing_team", "client"]);
const ALLOWED_TEAM_SIZES = new Set(["1-10", "11-50", "51-200", "200+"]);
const ALLOWED_BUDGETS = new Set([
  "lt_50",
  "usd_50_200",
  "usd_200_1k",
  "usd_1k_5k",
  "usd_5k_plus",
  "unsure",
]);
// Both the /enterprise page and the pricing modal submit canonical budget enum
// codes (different buckets); the card maps a known code to a readable label and
// otherwise shows the raw value.
const BUDGET_LABELS: Record<string, string> = {
  // /enterprise buckets
  lt_50: "每月 $50 以下",
  usd_50_200: "每月 $50 – $200",
  usd_200_1k: "每月 $200 – $1,000",
  usd_1k_5k: "每月 $1,000 – $5,000",
  usd_5k_plus: "每月 $5,000 以上",
  // pricing "Request Team" buckets
  lt_1k: "每月 $1,000 以下",
  usd_5k_20k: "每月 $5,000 – $20,000",
  usd_20k_plus: "每月 $20,000 以上",
  unsure: "还不确定",
};
// Canonical team-size enum → readable label (shared by both surfaces).
const TEAM_SIZE_LABELS: Record<string, string> = {
  "1-10": "1–10 人",
  "11-50": "11–50 人",
  "51-200": "51–200 人",
  "200+": "200 人以上",
};
const ALLOWED_USE_CASES = new Set([
  "product_design",
  "design_system",
  "prototype",
  "marketing",
  "deck",
  "dashboards",
  "other",
]);
const USE_CASE_LABELS: Record<string, string> = {
  product_design: "产品与应用设计",
  design_system: "设计系统",
  prototype: "原型 / 应用 UI",
  marketing: "营销与落地页",
  deck: "演示文稿 / Deck",
  dashboards: "仪表盘 / 内部工具",
  other: "其他",
};

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

function json(body: unknown, status: number, origin: string | null): Response {
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function readString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Accept a multi-select use-case array; keep only known, de-duplicated values.
function readUseCases(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && ALLOWED_USE_CASES.has(item) && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

// Feishu custom-bot signature: base64(HmacSHA256(key = `${timestamp}\n${secret}`, data = "")).
async function feishuSignature(secret: string, timestamp: number): Promise<string> {
  const keyBytes = new TextEncoder().encode(`${timestamp}\n${secret}`);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new Uint8Array(0));
  return bytesToBase64(new Uint8Array(sig));
}

function buildFeishuCard(lead: ContactLead): Record<string, unknown> {
  const fieldRow = (label: string, value: string) => ({
    is_short: true,
    text: { tag: "lark_md", content: `**${label}**\n${value || "—"}` },
  });
  const geo = [lead.country, lead.region].filter(Boolean).join(" / ");
  return {
    config: { wide_screen_mode: true },
    header: {
      template: "green",
      title: { tag: "plain_text", content: "🚀 新的「团队版」留资线索" },
    },
    elements: [
      {
        tag: "div",
        fields: [
          fieldRow("姓名", lead.name),
          fieldRow("企业邮箱", lead.email),
          fieldRow("公司", lead.company),
          fieldRow("团队规模", TEAM_SIZE_LABELS[lead.teamSize] ?? lead.teamSize),
          fieldRow("国家 / 地区", lead.location),
          fieldRow("预计席位数", lead.seats),
          fieldRow("预算", BUDGET_LABELS[lead.budget] ?? lead.budget),
          fieldRow("使用场景", lead.useCases.map((v) => USE_CASE_LABELS[v] ?? v).join("、")),
          fieldRow("职位", lead.role),
          fieldRow("语言", lead.locale),
        ],
      },
      ...(lead.message
        ? [
            { tag: "hr" },
            {
              tag: "div",
              text: { tag: "lark_md", content: `**留言**\n${lead.message}` },
            },
          ]
        : []),
      { tag: "hr" },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: `来源：${lead.source}${geo ? ` · ${geo}` : ""} · ${lead.submittedAt}`,
          },
        ],
      },
    ],
  };
}

async function notifyFeishu(env: Env, lead: ContactLead): Promise<void> {
  const webhook = env.FEISHU_CONTACT_WEBHOOK?.trim();
  if (!webhook) {
    console.warn("contact_sales_feishu_unset: FEISHU_CONTACT_WEBHOOK missing; KV only");
    return;
  }

  const body: Record<string, unknown> = {
    msg_type: "interactive",
    card: buildFeishuCard(lead),
  };

  const secret = env.FEISHU_CONTACT_SECRET?.trim();
  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000);
    body.timestamp = String(timestamp);
    body.sign = await feishuSignature(secret, timestamp);
  }

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn("contact_sales_feishu_failed", JSON.stringify({ status: res.status }));
      return;
    }
    // Feishu returns 200 with a JSON body even on logical failure (e.g. bad sign).
    const data = (await res.json().catch(() => ({}))) as { code?: unknown };
    if (typeof data.code === "number" && data.code !== 0) {
      console.warn("contact_sales_feishu_rejected", JSON.stringify({ code: data.code }));
    }
  } catch {
    console.warn("contact_sales_feishu_request_failed");
  }
}

async function persistLead(env: Env, lead: ContactLead): Promise<void> {
  if (env.CONTACT_LEADS) {
    // Latest submission per email wins; keeps the namespace from growing
    // unbounded on repeat submits while preserving the freshest details.
    const key = `lead:${await sha256Hex(lead.email)}`;
    try {
      await env.CONTACT_LEADS.put(key, JSON.stringify(lead));
    } catch {
      console.warn("contact_sales_kv_write_failed");
    }
  } else {
    console.warn(
      "contact_sales_kv_unbound: CONTACT_LEADS binding missing; lead not persisted",
      JSON.stringify({ source: lead.source, country: lead.country }),
    );
  }

  await notifyFeishu(env, lead);
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

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400, origin);
  }

  const email = readString(payload.email, MAX_EMAIL_LENGTH).toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return json({ ok: false, error: "invalid_email" }, 400, origin);
  }

  const name = readString(payload.name, MAX_SHORT);
  if (!name) {
    return json({ ok: false, error: "missing_fields" }, 400, origin);
  }

  // Reject unrecognized sources up front. This is a public write endpoint, so a
  // typoed/unknown source must return 400 rather than silently falling through
  // to the relaxed path and persisting arbitrary leads.
  const source =
    typeof payload.source === "string" && ALLOWED_SOURCES.has(payload.source)
      ? payload.source
      : null;
  if (!source) {
    return json({ ok: false, error: "invalid_source" }, 400, origin);
  }

  const company = readString(payload.company, MAX_SHORT);
  const teamSize = readString(payload.teamSize, MAX_SHORT);
  const budget = readString(payload.budget, MAX_SHORT);
  const useCases = readUseCases(payload.useCases);

  // `pricing_team` (the lightweight /pricing modal) is the only relaxed caller —
  // name + email only, with team size/budget as free display strings. Every
  // other allowlisted source keeps the full contact-form contract: company + a
  // known team-size/budget enum + at least one use case.
  if (
    source !== "pricing_team" &&
    (!company ||
      !ALLOWED_TEAM_SIZES.has(teamSize) ||
      !ALLOWED_BUDGETS.has(budget) ||
      useCases.length === 0)
  ) {
    return json({ ok: false, error: "missing_fields" }, 400, origin);
  }

  const cf = request.cf || {};
  const lead: ContactLead = {
    name,
    email,
    company,
    teamSize,
    budget,
    useCases,
    role: readString(payload.role, MAX_SHORT),
    location: readString(payload.location, MAX_SHORT),
    seats: readString(payload.seats, MAX_SHORT),
    message: readString(payload.message, MAX_MESSAGE),
    source,
    locale: readString(payload.locale, 16) || "en",
    pageUrl: readString(payload.pageUrl, 512),
    submittedAt: new Date().toISOString(),
    referer: request.headers.get("referer"),
    country: typeof cf.country === "string" ? cf.country : undefined,
    region: typeof cf.region === "string" ? cf.region : undefined,
  };

  context.waitUntil(persistLead(context.env, lead));

  return json({ ok: true }, 200, origin);
};

export const __contactSalesTest = {
  corsHeaders,
  buildFeishuCard,
  feishuSignature,
};
