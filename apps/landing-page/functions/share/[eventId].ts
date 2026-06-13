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
  SHARE_CLICK_EVENTS?: KVNamespace;
  SHARE_CLICK_SALT?: string;
}

type ShareClickRecord = {
  eventId: string;
  clickedAt: string;
  destination: string;
  referer: string | null;
  userAgentHash: string;
  country?: string;
  region?: string;
};

const REPO_URL = "https://github.com/nexu-io/open-design";

function normalizeEventId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 120);
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function githubDestination(eventId: string): string {
  const url = new URL(REPO_URL);
  url.searchParams.set("utm_source", "x");
  url.searchParams.set("utm_medium", "contributor_card");
  url.searchParams.set("utm_campaign", "oss_recognition");
  url.searchParams.set("utm_content", eventId);
  return url.toString();
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const rawEventId = Array.isArray(context.params.eventId)
    ? context.params.eventId[0]
    : context.params.eventId;
  const eventId = normalizeEventId(rawEventId || "");
  if (!eventId) return new Response("Missing share event id", { status: 400 });

  const destination = githubDestination(eventId);
  const request = context.request;
  const userAgent = request.headers.get("user-agent") || "";
  const ip = request.headers.get("cf-connecting-ip") || "";
  const salt = context.env.SHARE_CLICK_SALT || "open-design-share";
  const clickedAt = new Date().toISOString();
  const userAgentHash = await sha256Hex(`${salt}:${ip}:${userAgent}`);
  const cf = request.cf || {};
  const record: ShareClickRecord = {
    eventId,
    clickedAt,
    destination,
    referer: request.headers.get("referer"),
    userAgentHash,
    country: typeof cf.country === "string" ? cf.country : undefined,
    region: typeof cf.region === "string" ? cf.region : undefined,
  };

  if (context.env.SHARE_CLICK_EVENTS) {
    const key = `click:${eventId}:${clickedAt}:${crypto.randomUUID()}`;
    context.waitUntil(context.env.SHARE_CLICK_EVENTS.put(key, JSON.stringify(record)));
  } else {
    console.log("share_click", JSON.stringify(record));
  }

  return Response.redirect(destination, 302);
};
