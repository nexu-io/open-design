/*
 * Blog indexing — shared helpers.
 *
 * One-stop module for the post-deploy / cron indexing scripts. Keeps
 * the surface tiny so each task script (detect-changed-urls,
 * verify-readiness, submit-sitemap, inspect-urls, render-status,
 * scheduled-window) stays focused.
 *
 * Authoritative reference: ~/.codex/skills/blog-indexing-automation/SKILL.md.
 *
 *   - Treat URL Inspection as a monitoring API, not a submission API.
 *   - Treat Google Indexing API as out of scope for normal blog posts.
 *   - One sitemap submission per deploy, not one per URL.
 *
 * Auth supports two modes:
 *   1. OAuth user refresh token:
 *      `GSC_OAUTH_CLIENT_ID`, `GSC_OAUTH_CLIENT_SECRET`,
 *      `GSC_OAUTH_REFRESH_TOKEN`
 *   2. Service account JSON:
 *      `GSC_SERVICE_ACCOUNT_KEY`
 *
 * Prefer OAuth while Search Console has intermittent "service account
 * email not found" bugs in the Users and permissions UI.
 */
import { execSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE = 'https://open-design.ai';
export const GSC_SITE_URL = 'sc-domain:open-design.ai';
export const SITEMAP_URL = `${SITE}/sitemap-index.xml`;
export const SITEMAP_CHILD_URL = `${SITE}/sitemap-0.xml`;
export const INDEXNOW_KEY = '96b0928121e24fd7b4ef85ae0f8bf1d8';
export const INDEXNOW_KEY_LOCATION = `${SITE}/${INDEXNOW_KEY}.txt`;

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../../../..');
export const BLOG_DIR = path.join(
  REPO_ROOT,
  'apps/landing-page/app/content/blog',
);

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export interface InspectionVerdict {
  /** Pass-through verdict from URL Inspection API. */
  verdict: 'PASS' | 'PARTIAL' | 'FAIL' | 'NEUTRAL' | 'VERDICT_UNSPECIFIED';
  coverageState: string;
  pageFetchState?: string;
  indexingState?: string;
  lastCrawlTime?: string;
  googleCanonical?: string;
  userCanonical?: string;
  robotsTxtState?: string;
  /** True when Google has indexed the URL. */
  isIndexed: boolean;
}

export interface InspectionRecord {
  url: string;
  inspectedAt: string;
  result: InspectionVerdict | { error: string };
}

export interface ReadinessResult {
  url: string;
  ok: boolean;
  failures: string[];
  status?: number;
  canonical?: string;
}

export interface SearchAnalyticsRecord {
  url: string;
  queriedAt: string;
  windowDays: 7 | 28;
  startDate: string;
  endDate: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface BlogIndexingState {
  /** url -> latest URL Inspection record */
  latest: Record<string, InspectionRecord>;
  /** newest first, capped by renderer */
  history: InspectionRecord[];
  /** url -> window -> latest Search Analytics record */
  performance?: Record<string, Partial<Record<'7' | '28', SearchAnalyticsRecord>>>;
  /** url -> ISO timestamp first inspected by the indexing workflows */
  firstInspectedAt?: Record<string, string>;
  /** @deprecated Migrated to firstInspectedAt. Kept for pending status branch reads. */
  firstSeenAt?: Record<string, string>;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch wrapper with conservative retry/backoff for the flaky parts of
 * this automation (Google APIs, IndexNow, live sitemap polling).
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: { attempts?: number; baseDelayMs?: number } = {},
): Promise<Response> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1_000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || ![408, 429, 500, 502, 503, 504].includes(res.status)) {
        return res;
      }
      lastError = new Error(`${res.status} ${await res.text()}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < attempts) {
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/* ----------------------------- auth ----------------------------- */

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Returns a Google OAuth2 access token for the service account in
 * `GSC_SERVICE_ACCOUNT_KEY`. Caches in-process for ~50 minutes.
 *
 * Tokens are JWT-signed locally (RS256) and exchanged with Google's
 * OAuth2 endpoint. We avoid the full `googleapis` package to keep the
 * landing-page workspace dep-free for what is purely a CI surface.
 */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  const oauthToken = await getOAuthAccessToken();
  if (oauthToken) return oauthToken;
  return getServiceAccountAccessToken();
}

async function getOAuthAccessToken(): Promise<string | null> {
  const clientId = process.env.GSC_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GSC_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GSC_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetchWithRetry('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth token refresh failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as TokenResponse;
  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in - 600) * 1000,
  };
  return cachedToken.token;
}

async function getServiceAccountAccessToken(): Promise<string> {
  const raw = process.env.GSC_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      'No GSC auth configured. Set either GSC_OAUTH_CLIENT_ID/GSC_OAUTH_CLIENT_SECRET/GSC_OAUTH_REFRESH_TOKEN or GSC_SERVICE_ACCOUNT_KEY.',
    );
  }
  const key = JSON.parse(raw) as ServiceAccountKey;

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters',
    aud: key.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const header = { alg: 'RS256', typ: 'JWT' };

  const b64 = (s: string) =>
    Buffer.from(s)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const signingInput = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(claim))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer
    .sign(key.private_key)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const jwt = `${signingInput}.${signature}`;

  const res = await fetchWithRetry(claim.aud, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Token exchange failed: ${res.status} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as TokenResponse;
  cachedToken = {
    token: body.access_token,
    // Refresh 10 minutes before expiry.
    expiresAt: Date.now() + (body.expires_in - 600) * 1000,
  };
  return cachedToken.token;
}

/* ---------------------- GSC REST helpers ---------------------- */

/**
 * Submits (or re-submits) a sitemap to Google Search Console.
 * Idempotent — calling repeatedly is safe.
 */
export async function submitSitemap(feedpath = SITEMAP_URL): Promise<void> {
  const token = await getAccessToken();
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE_URL)}/sitemaps/${encodeURIComponent(feedpath)}`;
  const res = await fetchWithRetry(url, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Sitemap submit failed (${res.status}): ${await res.text()}`);
  }
}

/**
 * Calls URL Inspection API for one URL.
 * Treat the response as MONITORING data — not a submission for indexing.
 */
export async function inspectUrl(url: string): Promise<InspectionVerdict> {
  const token = await getAccessToken();
  const res = await fetchWithRetry(
    'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inspectionUrl: url,
        siteUrl: GSC_SITE_URL,
        languageCode: 'en-US',
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`URL Inspection failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as {
    inspectionResult?: {
      indexStatusResult?: {
        verdict?: InspectionVerdict['verdict'];
        coverageState?: string;
        pageFetchState?: string;
        indexingState?: string;
        lastCrawlTime?: string;
        googleCanonical?: string;
        userCanonical?: string;
        robotsTxtState?: string;
      };
    };
  };
  const isr = body.inspectionResult?.indexStatusResult ?? {};
  const verdict = isr.verdict ?? 'VERDICT_UNSPECIFIED';
  return {
    verdict,
    coverageState: isr.coverageState ?? 'UNKNOWN',
    pageFetchState: isr.pageFetchState,
    indexingState: isr.indexingState,
    lastCrawlTime: isr.lastCrawlTime,
    googleCanonical: isr.googleCanonical,
    userCanonical: isr.userCanonical,
    robotsTxtState: isr.robotsTxtState,
    isIndexed:
      verdict === 'PASS' &&
      /Submitted and indexed|Indexed/i.test(isr.coverageState ?? ''),
  };
}

/**
 * Pulls Search Console Performance data for one canonical URL. This is
 * the traffic half of the workflow: indexed pages can still earn zero
 * impressions, and that is a different problem than discovery.
 */
export async function querySearchAnalytics(
  url: string,
  windowDays: 7 | 28,
): Promise<SearchAnalyticsRecord> {
  const token = await getAccessToken();
  const end = new Date();
  // GSC Search Analytics data lags by ~2 days. Querying through
  // yesterday often returns partial data; use a stable 2-day offset.
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - windowDays + 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE_URL)}/searchAnalytics/query`;
  const res = await fetchWithRetry(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      startDate: fmt(start),
      endDate: fmt(end),
      dimensions: ['page'],
      rowLimit: 1,
      dimensionFilterGroups: [
        {
          filters: [
            {
              dimension: 'page',
              operator: 'equals',
              expression: url,
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Search Analytics failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as {
    rows?: Array<{
      clicks?: number;
      impressions?: number;
      ctr?: number;
      position?: number;
    }>;
  };
  const row = body.rows?.[0] ?? {};
  return {
    url,
    queriedAt: new Date().toISOString(),
    windowDays,
    startDate: fmt(start),
    endDate: fmt(end),
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  };
}

/* --------------------------- URLs ---------------------------- */

/**
 * Maps a blog markdown filename (sans extension) to its canonical URL.
 * Mirrors `apps/landing-page/app/pages/blog/[slug].astro`.
 */
export function blogSlugToUrl(slug: string): string {
  return `${SITE}/blog/${slug}/`;
}

/** Returns true for a blog post markdown file the loader will surface. */
export function isPostFile(file: string): boolean {
  const base = path.basename(file);
  return (
    file.startsWith('apps/landing-page/app/content/blog/') &&
    base.endsWith('.md') &&
    !base.startsWith('_')
  );
}

/** Strips the blog prefix and `.md` to derive the post slug. */
export function fileToSlug(file: string): string {
  return path.basename(file).replace(/\.md$/, '');
}

/* -------------------------- IO utils ------------------------- */

export function readJsonFile<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export function fileExists(file: string): boolean {
  return existsSync(file);
}

export function loadUrlInput(input: string): string[] {
  if (fileExists(input)) {
    const raw = JSON.parse(readFileSync(input, 'utf8'));
    if (Array.isArray(raw)) return raw as string[];
    if (Array.isArray(raw.urls)) return raw.urls as string[];
    return [...(raw.addedUrls ?? []), ...(raw.modifiedUrls ?? [])] as string[];
  }
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function slugFromUrl(url: string): string {
  return url.replace(/^https?:\/\/[^/]+\/blog\//, '').replace(/\/$/, '');
}

/**
 * Workflow-dispatch inputs can reach git diff/log commands. Keep them to
 * plain ref-ish values so shell metacharacters never become part of a command.
 */
export function assertSafeGitRef(value: string, label: string): string {
  if (!/^[A-Za-z0-9_./:-]+$/.test(value)) {
    throw new Error(`Unsafe git ref for ${label}: ${value}`);
  }
  return value;
}

/**
 * Runs `git <cmd>` from the repo root and returns trimmed stdout.
 * All blog-indexing scripts must use this rather than execing `git`
 * directly — the scripts are invoked from arbitrary cwds (locally, in
 * CI, from `pnpm --filter` which sets cwd to the package dir) and
 * relative paths in `git diff` / `git log` would otherwise resolve
 * against the wrong directory.
 */
export function git(cmd: string): string {
  return execSync(`git ${cmd}`, { encoding: 'utf8', cwd: REPO_ROOT }).trim();
}
