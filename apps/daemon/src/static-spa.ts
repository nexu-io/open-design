import type { Express } from 'express';
import fs from 'node:fs';
import path from 'node:path';

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

/**
 * Returns the `<script>` snippet that exposes the daemon's OD_API_TOKEN to the
 * bundled SPA. When a token is configured, the front end must include it as
 * `Authorization: Bearer <token>` on daemon `/api/*` calls (the daemon enforces
 * this for non-loopback deployments). Because the SPA is a static export, the
 * token cannot be read from `process.env` at runtime — the daemon injects it
 * into the served HTML instead. When no token is set (loopback / desktop dev),
 * the snippet is omitted entirely and the front end falls back to its current
 * token-less behaviour.
 */
export function buildApiTokenInjectionScript(apiToken: string): string {
  if (!apiToken) return '';
  // JSON.stringify guarantees a safe JS string literal (escaping quotes,
  // backslashes, control characters, and U+2028/U+2029), so the token can be
  // interpolated into a <script> body without risking a premature close.
  const literal = JSON.stringify(apiToken);
  return `<script>window.__OD_API_TOKEN=${literal};</script>`;
}

export function registerStaticSpaFallback(
  app: Express,
  staticDir: string,
  options?: { apiToken?: string },
): void {
  const tokenScript = buildApiTokenInjectionScript(options?.apiToken ?? '');
  app.get('/*splat', (req, res, next) => {
    const indexPath = resolveStaticSpaFallbackPath(req, staticDir);
    if (indexPath == null) return next();
    if (!tokenScript) {
      res.sendFile(indexPath);
      return;
    }
    // Read the file and inject the token script just before </head> so the
    // variable is available before the app bundle hydrates. If the file can't
    // be read (race with a rebuild), fall back to sendFile so the SPA still
    // loads without the token rather than erroring out.
    fs.readFile(indexPath, 'utf8', (err, html) => {
      if (err || !html.includes('</head>')) {
        res.sendFile(indexPath);
        return;
      }
      const injected = html.replace('</head>', `${tokenScript}</head>`);
      res.send(injected);
    });
  });
}