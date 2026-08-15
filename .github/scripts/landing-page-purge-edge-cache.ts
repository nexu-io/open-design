#!/usr/bin/env node

// Purge Cloudflare edge cache for the marketing host(s) by hostname.
//
// Used by `landing-page-production` after `pages deploy` so locale HTML
// (`/`, `/zh/pricing/`, …) does not keep serving pre-deploy objects when
// CF Pages' deploy invalidation is incomplete for the custom domain, and by
// `landing-edge-cache-purge` for manual incident recovery / token checks.
//
// Inputs (all via env):
//   CLOUDFLARE_API_TOKEN  (required) token with Zone → Cache Purge on the zone
//   CLOUDFLARE_ZONE_ID    (optional) defaults to the open-design.ai zone id
//   CLOUDFLARE_PURGE_HOSTS (optional) comma-separated hostnames, default
//                          `open-design.ai`
//
// Scope: hosts purge is intentional — one host, all paths/locales, without
// touching other hostnames on the same zone (e.g. download.open-design.ai).
//
// @see https://developers.cloudflare.com/api/resources/cache/methods/purge/
// @see https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-hostname/

type PurgeResponse = {
  success?: boolean;
  errors?: unknown;
  result?: unknown;
};

const DEFAULT_ZONE_ID = "84ed4658186179c7eba52659b6ef48ad";

const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim() || DEFAULT_ZONE_ID;
const hosts = (process.env.CLOUDFLARE_PURGE_HOSTS || "open-design.ai")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

if (!token) {
  console.error("CLOUDFLARE_API_TOKEN is required");
  process.exit(1);
}
if (hosts.length === 0) {
  console.error("CLOUDFLARE_PURGE_HOSTS resolved to an empty host list");
  process.exit(1);
}

const response = await fetch(
  `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ hosts }),
  },
);

const payload = (await response
  .json()
  .catch(() => null)) as PurgeResponse | null;
const ok = response.ok && payload?.success === true;

console.log(
  JSON.stringify(
    {
      httpStatus: response.status,
      zoneId,
      hosts,
      success: ok,
      errors: payload?.errors ?? null,
      result: payload?.result ?? null,
    },
    null,
    2,
  ),
);

if (!ok) {
  console.error(
    `Cloudflare host purge failed. Ensure CLOUDFLARE_API_TOKEN has Zone.Cache Purge on ${hosts.join(", ")}.`,
  );
  process.exit(1);
}
