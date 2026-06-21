import type { Express } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';

export interface StaticSpaFallbackRequestLike {
  method: string;
  path: string;
  get?: (name: string) => string | undefined;
}

export function isStaticSpaFallbackRequest(req: StaticSpaFallbackRequestLike): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (req.path === '/api' || req.path.startsWith('/api/')) return false;
  if (req.path === '/artifacts' || req.path.startsWith('/artifacts/')) return false;
  if (req.path === '/frames' || req.path.startsWith('/frames/')) return false;
  if (req.path === '/_next' || req.path.startsWith('/_next/')) return false;

  const accept = req.get?.('accept') ?? '';
  return accept.length === 0 || accept.includes('text/html') || accept.includes('*/*');
}

export function resolveStaticSpaFallbackPath(req: StaticSpaFallbackRequestLike, staticDir: string): string | null {
  const indexPath = path.join(staticDir, 'index.html');
  if (!fs.existsSync(indexPath) || !isStaticSpaFallbackRequest(req)) return null;
  return indexPath;
}

function injectMetaToken(html: string, token: string): string {
  // Escape the token value for safe HTML attribute embedding.
  const escaped = token.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const meta = `<meta name="od-api-token" content="${escaped}">`;
  const idx = html.indexOf('</head>');
  if (idx === -1) return html;
  return html.slice(0, idx) + meta + html.slice(idx);
}

function htmlFileToken(html: string, apiToken: string | null): string {
  // Check if the token is already embedded (prevents double-injection
  // when the cached file already has a meta tag from a prior config).
  if (apiToken && html.includes('<meta name="od-api-token"')) return html;
  return apiToken ? injectMetaToken(html, apiToken) : html;
}

export function prepareCachedIndexHtml(staticDir: string, apiToken: string | null): string | null {
  const indexPath = path.join(staticDir, 'index.html');
  if (!fs.existsSync(indexPath)) return null;
  const raw = fs.readFileSync(indexPath, 'utf-8');
  return htmlFileToken(raw, apiToken);
}

export function registerStaticSpaFallback(app: Express, staticDir: string, cachedIndexHtml: string | null): void {
  if (cachedIndexHtml) {
    app.get('/*splat', (req, res, next) => {
      if (!isStaticSpaFallbackRequest(req)) return next();
      res.type('html').send(cachedIndexHtml);
    });
  } else {
    app.get('/*splat', (req, res, next) => {
      const indexPath = resolveStaticSpaFallbackPath(req, staticDir);
      if (indexPath == null) return next();
      res.sendFile(indexPath);
    });
  }
}
