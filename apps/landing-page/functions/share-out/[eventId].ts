type KVNamespace = {
  put(key: string, value: string): Promise<void>;
};

type PagesFunctionContext<Env> = {
  request: Request & { cf?: Record<string, unknown> };
  params: Record<string, string | string[]>;
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
};

type PagesFunction<Env> = (context: PagesFunctionContext<Env>) => Response | Promise<Response>;

interface Env {
  SHARE_OUT_CLICK_EVENTS?: KVNamespace;
  SHARE_CLICK_SALT?: string;
}

type ShareOutClickRecord = {
  eventId: string;
  lang: string;
  clickedAt: string;
  destination: string;
  destinationHost: string;
  referer: string | null;
  userAgentHash: string;
  country?: string;
  region?: string;
};

const ALLOWED_DESTINATION_HOSTS = new Set([
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
  "x.com",
  "www.x.com",
  "mobile.x.com",
]);

const DEFAULT_DESTINATION = "https://x.com/";

function normalizeEventId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 120);
}

function normalizeLang(value: string | null): string {
  if (!value) return "en";
  const v = value.toLowerCase().slice(0, 8);
  return /^[a-z0-9-]+$/.test(v) ? v : "en";
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeDestination(rawTo: string | null): string {
  if (!rawTo) return DEFAULT_DESTINATION;
  try {
    const parsed = new URL(rawTo);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return DEFAULT_DESTINATION;
    if (!ALLOWED_DESTINATION_HOSTS.has(parsed.hostname.toLowerCase())) return DEFAULT_DESTINATION;
    return parsed.toString();
  } catch {
    return DEFAULT_DESTINATION;
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const rawEventId = Array.isArray(context.params.eventId)
    ? context.params.eventId[0]
    : context.params.eventId;
  const eventId = normalizeEventId(rawEventId || "");
  if (!eventId) return new Response("Missing share event id", { status: 400 });

  const request = context.request;
  const url = new URL(request.url);
  const destination = safeDestination(url.searchParams.get("to"));
  const lang = normalizeLang(url.searchParams.get("lang"));

  const userAgent = request.headers.get("user-agent") || "";
  const ip = request.headers.get("cf-connecting-ip") || "";
  const salt = context.env.SHARE_CLICK_SALT || "open-design-share";
  const clickedAt = new Date().toISOString();
  const userAgentHash = await sha256Hex(`${salt}:${ip}:${userAgent}`);
  const cf = request.cf || {};
  const destinationHost = (() => {
    try {
      return new URL(destination).hostname;
    } catch {
      return "unknown";
    }
  })();

  const record: ShareOutClickRecord = {
    eventId,
    lang,
    clickedAt,
    destination,
    destinationHost,
    referer: request.headers.get("referer"),
    userAgentHash,
    country: typeof cf.country === "string" ? cf.country : undefined,
    region: typeof cf.region === "string" ? cf.region : undefined,
  };

  if (context.env.SHARE_OUT_CLICK_EVENTS) {
    const key = `share-out:${eventId}:${clickedAt}:${crypto.randomUUID()}`;
    context.waitUntil(
      context.env.SHARE_OUT_CLICK_EVENTS.put(key, JSON.stringify(record)),
    );
  } else {
    console.log("share_out_click", JSON.stringify(record));
  }

  return Response.redirect(destination, 302);
};
