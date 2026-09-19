import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

/**
 * Preview transports disagree about whether an artifact may load external
 * resources, and the disagreement is invisible to the user.
 *
 * The same HTML file is served by three routes with three different policies:
 *
 *   - `/api/projects/:id/preview/:scope/*` (legacy fallback transport) stamps
 *     a restrictive CSP: `script-src 'self'`, `style-src 'self'`,
 *     `font-src 'self' data:`, `connect-src 'none'`.
 *   - `n-<scope>.localhost:<port>/*` (scoped-origin transport, the one the web
 *     client selects whenever the daemon returns `scopedOrigin`) stamps no CSP
 *     at all.
 *   - `p-<scope>.localhost:<port>/*` (powered transport) also stamps no CSP and
 *     adds cross-origin isolation headers.
 *
 * The CSP is a deliberate security boundary for untrusted AI-authored HTML and
 * these tests do not argue with it. What they pin down is the *consequence*:
 * on the legacy transport a CDN script, a Google Fonts stylesheet, a webfont
 * file and a startup `fetch()` are all refused, the document is served
 * unchanged, and nothing anywhere tells the user why the artifact came out
 * half-rendered. These assertions are written against the external URLs a real
 * generated artifact uses, not against the header text, so they still fail if
 * the header is reworded but keeps blocking the same resources.
 */

/** External URLs taken verbatim from the probe artifacts below. */
const CDN_SCRIPT_URL = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
const GOOGLE_FONTS_STYLESHEET_URL =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap';
const GOOGLE_FONTS_FILE_URL = 'https://fonts.gstatic.com/s/playfairdisplay/v37/font.woff2';
const EXTERNAL_API_URL = 'https://jsonplaceholder.typicode.com/posts?_limit=5';

const CDN_CHART_HTML = `<!doctype html>
<html><head><title>Quarterly Revenue</title>
<script src="${CDN_SCRIPT_URL}"></script></head>
<body><h1>Quarterly Revenue</h1><canvas id="c"></canvas>
<script>new Chart(document.getElementById('c'), { type: 'bar', data: {} });</script>
</body></html>`;

const GOOGLE_FONTS_HTML = `<!doctype html>
<html><head><title>Typography Specimen</title>
<link href="${GOOGLE_FONTS_STYLESHEET_URL}" rel="stylesheet">
<style>h1 { font-family: 'Playfair Display', serif; }</style></head>
<body><h1>Elegance in every letterform</h1></body></html>`;

const FETCH_LIST_HTML = `<!doctype html>
<html><head><title>Live Posts</title></head>
<body><div id="state">Loading&hellip;</div><div id="list"></div>
<script>fetch('${EXTERNAL_API_URL}').then(r => r.json()).then(rows => {
  document.getElementById('state').textContent = '';
});</script></body></html>`;

interface RawResponse {
  status: number;
  header: (name: string) => string | null;
  body: string;
}

/**
 * `fetch` refuses to send a caller-supplied `Host` header, and the
 * scoped-origin transports read the preview scope out of exactly that header,
 * so those routes have to be driven over `node:http`.
 */
function httpGet(url: string, headers: Record<string, string> = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const request = http.request(
      {
        host: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            header: (name) => {
              const value = response.headers[name.toLowerCase()];
              return Array.isArray(value) ? value.join(', ') : (value ?? null);
            },
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    request.on('error', reject);
    request.end();
  });
}

type CspDirectives = Map<string, string[]>;

function parseCsp(header: string | null): CspDirectives | null {
  if (!header) return null;
  const directives: CspDirectives = new Map();
  for (const part of header.split(';')) {
    const tokens = part.trim().split(/\s+/u).filter(Boolean);
    const name = tokens.shift();
    if (!name) continue;
    directives.set(name.toLowerCase(), tokens);
  }
  return directives;
}

/**
 * Decide whether a policy would let the browser fetch `url` for `directive`,
 * using the same fallback-to-`default-src` rule browsers apply. Only the
 * source expressions this product's preview policy actually uses are modelled
 * (`'self'`, `'none'`, `data:`, `blob:`, and explicit origins); an unmodelled
 * expression is reported as a failure rather than silently treated as a deny,
 * so a future policy change cannot quietly turn this into a vacuous pass.
 */
function policyAllows(directives: CspDirectives, directive: string, url: string): boolean {
  const sources = directives.get(directive) ?? directives.get('default-src');
  if (!sources) return true; // no policy for this resource type at all
  if (sources.length === 0) return false;
  const target = new URL(url);
  return sources.some((source) => {
    const value = source.toLowerCase();
    if (value === "'none'") return false;
    // The preview document is served from the daemon origin, so 'self' never
    // matches a third-party host.
    if (value === "'self'") return false;
    if (value === "'unsafe-inline'" || value === "'unsafe-eval'") return false;
    if (value === 'data:' || value === 'blob:') return target.protocol === value;
    if (value === '*') return true;
    if (value.includes('.')) return target.host === value || target.host.endsWith(`.${value}`);
    throw new Error(`unmodelled CSP source expression: ${source}`);
  });
}

interface ExternalResourceVerdict {
  cdnScript: boolean;
  googleFontsStylesheet: boolean;
  webfontFile: boolean;
  startupFetch: boolean;
}

/** What the browser would actually be permitted to load under this response. */
function externalResourceVerdict(cspHeader: string | null): ExternalResourceVerdict {
  const directives = parseCsp(cspHeader);
  if (!directives) {
    return {
      cdnScript: true,
      googleFontsStylesheet: true,
      webfontFile: true,
      startupFetch: true,
    };
  }
  return {
    cdnScript: policyAllows(directives, 'script-src', CDN_SCRIPT_URL),
    googleFontsStylesheet: policyAllows(directives, 'style-src', GOOGLE_FONTS_STYLESHEET_URL),
    webfontFile: policyAllows(directives, 'font-src', GOOGLE_FONTS_FILE_URL),
    startupFetch: policyAllows(directives, 'connect-src', EXTERNAL_API_URL),
  };
}

describe('preview transports and externally-hosted artifact resources', () => {
  let server: http.Server;
  let baseUrl: string;
  let daemonPort: string;
  let projectId: string;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
    daemonPort = new URL(baseUrl).port;

    projectId = `preview-external-${randomUUID()}`;
    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Preview external resource policy' }),
    });
    expect(created.ok).toBe(true);

    for (const [name, content] of [
      ['cdn-chart.html', CDN_CHART_HTML],
      ['google-fonts.html', GOOGLE_FONTS_HTML],
      ['fetch-list.html', FETCH_LIST_HTML],
    ] as const) {
      const written = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, content }),
      });
      expect(written.ok).toBe(true);
    }
  });

  afterAll(async () => {
    await fetch(`${baseUrl}/api/projects/${projectId}`, { method: 'DELETE' }).catch(() => {});
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function previewUrls(file: string): Promise<{
    legacyUrl: string;
    normalUrl: string;
    poweredUrl: string;
  }> {
    const response = await fetch(
      `${baseUrl}/api/projects/${projectId}/preview-url?file=${encodeURIComponent(file)}`,
    );
    expect(response.ok).toBe(true);
    const body = (await response.json()) as {
      url: string;
      scopedOrigin?: { normalUrl: string; poweredUrl: string };
    };
    expect(body.scopedOrigin).toBeTruthy();
    return {
      legacyUrl: `${baseUrl}${body.url}`,
      normalUrl: body.scopedOrigin!.normalUrl,
      poweredUrl: body.scopedOrigin!.poweredUrl,
    };
  }

  /**
   * `*.localhost` hostnames are resolved by the browser, not by Node's
   * resolver, so drive the scoped-origin routes over the loopback address with
   * an explicit Host header — the daemon reads the scope out of that header.
   */
  function fetchScopedOrigin(scopedUrl: string): Promise<RawResponse> {
    const parsed = new URL(scopedUrl);
    return httpGet(`http://127.0.0.1:${daemonPort}${parsed.pathname}${parsed.search}`, {
      host: `${parsed.hostname}:${daemonPort}`,
    });
  }

  it('refuses every externally-hosted resource on the legacy preview transport', async () => {
    const { legacyUrl } = await previewUrls('cdn-chart.html');
    const response = await httpGet(legacyUrl);
    expect(response.status).toBe(200);

    const verdict = externalResourceVerdict(response.header('content-security-policy'));
    expect(verdict).toEqual({
      cdnScript: false,
      googleFontsStylesheet: false,
      webfontFile: false,
      startupFetch: false,
    });
  });

  it('permits every externally-hosted resource on the scoped-origin transport the client selects', async () => {
    const { normalUrl } = await previewUrls('cdn-chart.html');
    const response = await fetchScopedOrigin(normalUrl);
    expect(response.status).toBe(200);

    const verdict = externalResourceVerdict(response.header('content-security-policy'));
    expect(verdict).toEqual({
      cdnScript: true,
      googleFontsStylesheet: true,
      webfontFile: true,
      startupFetch: true,
    });
  });

  it('permits every externally-hosted resource on the powered transport', async () => {
    const { poweredUrl } = await previewUrls('cdn-chart.html');
    const response = await fetchScopedOrigin(poweredUrl);
    expect(response.status).toBe(200);
    expect(response.header('document-isolation-policy')).toBe('isolate-and-credentialless');

    const verdict = externalResourceVerdict(response.header('content-security-policy'));
    expect(verdict).toEqual({
      cdnScript: true,
      googleFontsStylesheet: true,
      webfontFile: true,
      startupFetch: true,
    });
  });

  it('serves the same file with opposite external-resource verdicts on its two transports', async () => {
    for (const file of ['cdn-chart.html', 'google-fonts.html', 'fetch-list.html']) {
      const { legacyUrl, normalUrl } = await previewUrls(file);
      const legacy = await httpGet(legacyUrl);
      const scoped = await fetchScopedOrigin(normalUrl);
      expect(legacy.status, file).toBe(200);
      expect(scoped.status, file).toBe(200);

      const legacyVerdict = externalResourceVerdict(legacy.header('content-security-policy'));
      const scopedVerdict = externalResourceVerdict(scoped.header('content-security-policy'));

      for (const key of Object.keys(legacyVerdict) as (keyof ExternalResourceVerdict)[]) {
        expect(
          legacyVerdict[key],
          `${file}: ${key} must differ between the legacy and scoped-origin transports`,
        ).not.toBe(scopedVerdict[key]);
      }
    }
  });

  it('says nothing to the user when the legacy transport will refuse the artifact’s resources', async () => {
    for (const file of ['cdn-chart.html', 'google-fonts.html', 'fetch-list.html']) {
      const { legacyUrl } = await previewUrls(file);
      const response = await httpGet(legacyUrl);
      expect(response.status, file).toBe(200);

      const verdict = externalResourceVerdict(response.header('content-security-policy'));
      const refusesSomething = Object.values(verdict).some((allowed) => !allowed);
      expect(refusesSomething, `${file} should be subject to the restrictive policy`).toBe(true);

      // The refusal never reaches the document: the external references are
      // served back verbatim and no notice is added alongside them.
      const html = response.body;
      expect(html, file).toContain('https://');
      for (const marker of [
        'preview-asset-warning',
        'previewAssetBlocked',
        'blocked',
        'Blocked',
        'could not be loaded',
      ]) {
        expect(html.includes(marker), `${file} unexpectedly explains the refusal via "${marker}"`)
          .toBe(false);
      }
    }
  });
});
