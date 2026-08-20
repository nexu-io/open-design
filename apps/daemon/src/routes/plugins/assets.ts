import type { Express, Request, Response } from 'express';
import type * as BetterSqlite3 from 'better-sqlite3';
import path from 'node:path';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import {
  resolveOptionalLocalWorkspaceRequestAuthority,
  type VerifyWorkspaceRequestAuthority,
} from '../../collab/workspace-resource-mutation.js';

export interface RegisterPluginAssetRoutesDeps {
  db: PluginDbLike;
  verifyWorkspaceRequestAuthority?: VerifyWorkspaceRequestAuthority;
  getWorkspacePlugin?: (
    db: PluginDbLike,
    id: string,
    workspaceId: string | null,
    workspaceMemberId?: string | null,
  ) => InstalledPluginLike | null | Promise<InstalledPluginLike | null>;
  pluginAssetCache: { get(url: string): Promise<{ buf: Buffer; contentType: string }> };
  AssetCacheError: new (...args: unknown[]) => Error & { status: number };
  assetCacheRewriteUrl: (url: string) => string;
  isCacheableExternalUrl: (url: string) => boolean;
  assembleExample: (templateHtml: string, slidesHtml: string, title: string) => string;
}

type PluginDbLike = BetterSqlite3.Database;

interface PluginExampleOutput {
  path?: string;
  title?: string;
}

interface PluginManifestLike {
  title?: string;
  od?: {
    preview?: { entry?: string };
    context?: { assets?: unknown[] };
    useCase?: { exampleOutputs?: PluginExampleOutput[] };
  };
  [key: string]: unknown;
}

interface InstalledPluginLike {
  fsPath: string;
  title?: string;
  manifest?: PluginManifestLike;
  [key: string]: unknown;
}

export function registerPluginAssetRoutes(app: Express, deps: RegisterPluginAssetRoutesDeps): void {
  const { db, pluginAssetCache, AssetCacheError, assetCacheRewriteUrl, isCacheableExternalUrl, assembleExample } = deps;
  const routeParam = (value: string | string[] | undefined): string => Array.isArray(value) ? value[0] ?? '' : value ?? '';
  const requestWithNavigationScope = (req: Request): Request | 'conflict' => {
    const workspaceId = typeof req.query.workspaceId === 'string'
      ? req.query.workspaceId.trim()
      : '';
    const workspaceMemberId = typeof req.query.workspaceMemberId === 'string'
      ? req.query.workspaceMemberId.trim()
      : '';
    if (!workspaceId && !workspaceMemberId) return req;
    const headerWorkspaceId = req.get('x-od-workspace-id')?.trim() ?? '';
    const headerWorkspaceMemberId =
      req.get('x-od-workspace-member-id')?.trim() ?? '';
    if (
      (headerWorkspaceId || headerWorkspaceMemberId)
      && (
        headerWorkspaceId !== workspaceId
        || headerWorkspaceMemberId !== workspaceMemberId
      )
    ) {
      return 'conflict';
    }
    return {
      get(name: string) {
        const normalized = name.toLowerCase();
        if (normalized === 'x-od-workspace-id') return workspaceId || undefined;
        if (normalized === 'x-od-workspace-member-id') {
          return workspaceMemberId || undefined;
        }
        return req.get(name);
      },
    } as Request;
  };
  const resolveWorkspaceAuthority = async (
    req: Request,
    res: Response,
  ): Promise<WorkspaceCollabContext | null | undefined> => {
    const scopedRequest = requestWithNavigationScope(req);
    if (scopedRequest === 'conflict') {
      res.status(400).json({
        error: 'WORKSPACE_CONTEXT_CONFLICT',
        message: 'workspace header and navigation scope must match',
      });
      return undefined;
    }
    const authority = resolveOptionalLocalWorkspaceRequestAuthority(scopedRequest);
    if (!authority.ok) {
      res.status(authority.status).json({
        error: authority.code,
        message: authority.message,
        ...(authority.retryable ? { retryable: true } : {}),
      });
      return undefined;
    }
    return authority.context;
  };
  const resolvePlugin = async (
    id: string,
    authority: WorkspaceCollabContext | null,
  ): Promise<InstalledPluginLike | null> => {
    if (deps.getWorkspacePlugin) {
      return deps.getWorkspacePlugin(
        db,
        id,
        authority?.workspaceId ?? null,
        authority?.workspaceMemberId ?? null,
      );
    }
    const { getInstalledPlugin } = await import('../../plugins/index.js');
    return getInstalledPlugin(db, id) as InstalledPluginLike | null;
  };
  const navigationScopeQuery = (
    authority: WorkspaceCollabContext | null,
  ): string => authority
    ? `?workspaceId=${encodeURIComponent(authority.workspaceId)}&workspaceMemberId=${encodeURIComponent(authority.workspaceMemberId)}`
    : '';

  async function servePluginSandboxedHtml(req: Request, res: Response, pickCandidates: (plugin: InstalledPluginLike) => Promise<string[]> | string[]) {
    try {
      const authority = await resolveWorkspaceAuthority(req, res);
      if (authority === undefined) return;
      const plugin = await resolvePlugin(routeParam(req.params.id), authority);
      if (!plugin) return res.status(404).json({ error: 'plugin not found' });
      const candidates = (await pickCandidates(plugin)).filter((p): p is string => typeof p === 'string' && p.length > 0);
      const fsp = await import('node:fs/promises');
      const root = path.resolve(plugin.fsPath) + path.sep;
      let resolved: string | null = null;
      let resolvedRel: string | null = null;
      for (const rel of candidates) {
        if (rel.includes('..') || rel.startsWith('/') || rel.includes('\0')) continue;
        const full = path.resolve(plugin.fsPath, rel);
        if (!(full + path.sep).startsWith(root) && full !== path.resolve(plugin.fsPath)) continue;
        try {
          const st = await fsp.stat(full);
          const lst = await fsp.lstat(full);
          if (lst.isSymbolicLink() || !st.isFile()) continue;
          if (st.size > 5 * 1024 * 1024) return res.status(413).json({ error: 'preview asset too large' });
          resolved = full;
          resolvedRel = rel;
          break;
        } catch {}
      }
      if (!resolved) return res.status(404).json({ error: 'preview not found' });
      let contentPath = resolved;
      let contentRel = resolvedRel;
      let buf = await fsp.readFile(resolved);
      if (resolvedRel && /\.html?$/i.test(resolvedRel)) {
        const shellTarget = iframeOnlyHtmlShellTarget(buf.toString('utf8'));
        if (shellTarget) {
          const targetFull = path.resolve(path.dirname(resolved), shellTarget);
          const rootDir = path.resolve(plugin.fsPath);
          const insideRoot = (targetFull + path.sep).startsWith(root) || targetFull === rootDir;
          if (insideRoot) {
            try {
              const st = await fsp.stat(targetFull);
              const lst = await fsp.lstat(targetFull);
              if (!lst.isSymbolicLink() && st.isFile() && st.size <= 5 * 1024 * 1024) {
                buf = await fsp.readFile(targetFull);
                contentPath = targetFull;
                contentRel = path.relative(plugin.fsPath, targetFull).split(path.sep).join('/');
              }
            } catch {}
          }
        }
      }
      if (resolvedRel && /(^|\/)example-slides\.html$/i.test(resolvedRel)) {
        const templateRel = resolvedRel.replace(/(^|\/)example-slides\.html$/i, '$1template.html');
        const templateFull = path.resolve(plugin.fsPath, templateRel);
        const templateInside = (templateFull + path.sep).startsWith(root) || templateFull === path.resolve(plugin.fsPath);
        if (templateInside) {
          try {
            const st = await fsp.stat(templateFull);
            const lst = await fsp.lstat(templateFull);
            if (!lst.isSymbolicLink() && st.isFile() && st.size <= 5 * 1024 * 1024) {
              const title = typeof plugin.title === 'string' ? plugin.title : typeof plugin.manifest?.title === 'string' ? plugin.manifest.title : routeParam(req.params.id);
              const tplHtml = await fsp.readFile(templateFull, 'utf8');
              const slidesHtml = buf.toString('utf8');
              buf = Buffer.from(assembleExample(tplHtml, slidesHtml, title), 'utf8');
              contentPath = templateFull;
              contentRel = templateRel;
            }
          } catch {}
        }
      }
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data: blob:; media-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'none'; frame-ancestors 'self'");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const ext = path.extname(contentPath).toLowerCase();
      const ct = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'application/javascript; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : ext === '.json' ? 'application/json; charset=utf-8' : ext === '.md' || ext === '.markdown' ? 'text/markdown; charset=utf-8' : ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
      res.setHeader('Content-Type', ct);
      if (ext === '.html' && typeof contentRel === 'string') {
        buf = Buffer.from(
          rewritePluginAssetUrls(
            buf.toString('utf8'),
            routeParam(req.params.id),
            path.posix.dirname(contentRel.replace(/\\/g, '/')),
            navigationScopeQuery(authority),
          ),
          'utf8',
        );
      }
      res.send(buf);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  }

  function iframeOnlyHtmlShellTarget(html: string): string | null {
    if (!html) return null;
    const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
    if (!bodyMatch) return null;
    const body = (bodyMatch[1] ?? '').replace(/<!--[\s\S]*?-->/g, '').trim();
    const iframeMatch = /^<iframe\b[^>]*\bsrc\s*=\s*(['"])([^'"]+)\1[^>]*>\s*(?:<\/iframe>)?\s*$/i.exec(body);
    if (!iframeMatch) return null;
    const src = (iframeMatch[2] ?? '').trim();
    if (!src || src.startsWith('/') || src.startsWith('//') || src.includes('\0') || /^[a-z][a-z0-9+.-]*:/i.test(src)) return null;
    const pathOnly = src.split(/[?#]/)[0] ?? '';
    return /\.html?$/i.test(pathOnly) ? pathOnly : null;
  }

  function rewritePluginAssetUrls(
    html: string,
    pluginId: string,
    baseDir: string,
    workspaceQuery = '',
  ): string {
    if (!html) return html;
    const scopeAssetSuffix = (suffix: string): string => {
      if (!workspaceQuery) return suffix;
      const scope = workspaceQuery.slice(1);
      if (!suffix) return workspaceQuery;
      if (suffix.startsWith('#')) return `${workspaceQuery}${suffix}`;
      const hashAt = suffix.indexOf('#');
      return hashAt === -1
        ? `${suffix}&${scope}`
        : `${suffix.slice(0, hashAt)}&${scope}${suffix.slice(hashAt)}`;
    };
    const safeBase = baseDir === '.' ? '' : baseDir;
    const withAttrs = html.replace(/(\s(?:src|href|poster)\s*=\s*)(['"])([^'"]+)(\2)/gi, (match, attr, quote, rawValue, closeQuote) => {
      const value = String(rawValue).trim();
      if (/^https?:\/\//i.test(value) && !/\bhref\b/i.test(String(attr)) && isCacheableExternalUrl(value)) {
        return `${attr}${quote}${assetCacheRewriteUrl(value)}${closeQuote}`;
      }
      if (!value || value.startsWith('#') || value.startsWith('/') || value.startsWith('//') || value.includes('\0') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return match;
      const splitAt = value.search(/[?#]/);
      const rel = splitAt === -1 ? value : value.slice(0, splitAt);
      const suffix = splitAt === -1 ? '' : value.slice(splitAt);
      const normalized = path.posix.normalize(path.posix.join(safeBase, rel));
      if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return match;
      return `${attr}${quote}/api/plugins/${encodeURIComponent(pluginId)}/asset/${normalized}${scopeAssetSuffix(suffix)}${closeQuote}`;
    });
    const withQuoted = withAttrs.replace(/(['"])(https?:\/\/[^'"]+)\1/g, (match, quote, rawValue) => {
      const value = String(rawValue).trim();
      return isCacheableExternalUrl(value) ? `${quote}${assetCacheRewriteUrl(value)}${quote}` : match;
    });
    return withQuoted.replace(/url\(\s*(https?:\/\/[^)'"\s]+)\s*\)/gi, (match, rawValue) => {
      const value = String(rawValue).trim();
      return isCacheableExternalUrl(value) ? `url(${assetCacheRewriteUrl(value)})` : match;
    });
  }

  function collectPluginPreviewCandidates(plugin: InstalledPluginLike): string[] {
    const candidates: string[] = [];
    const seen = new Set<string>();
    const push = (rel: unknown) => {
      if (typeof rel !== 'string') return;
      const trimmed = rel.replace(/^\.\//, '');
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      candidates.push(trimmed);
    };
    const manifest = plugin.manifest ?? {};
    const od = manifest.od ?? {};
    const preview = od.preview ?? {};
    push(preview.entry);
    const assets = Array.isArray(od.context?.assets) ? od.context.assets : [];
    for (const a of assets) if (typeof a === 'string' && /\.html?$/i.test(a)) push(a);
    const exampleOutputs = Array.isArray(od.useCase?.exampleOutputs) ? od.useCase.exampleOutputs : [];
    for (const ex of exampleOutputs) if (typeof ex?.path === 'string' && /\.html?$/i.test(ex.path)) push(ex.path);
    for (const rel of ['preview/index.html', 'index.html', 'examples/index.html', 'assets/index.html', 'assets/preview.html', 'assets/example.html', 'assets/example-slides.html', 'assets/template.html', 'public/index.html', 'dist/index.html']) push(rel);
    return candidates;
  }

  async function discoverPluginHtmlAssets(pluginFsPath: string): Promise<string[]> {
    const fsp = await import('node:fs/promises');
    const dirs = ['', 'assets', 'public', 'dist', 'examples', 'preview', 'templates'];
    const found: string[] = [];
    for (const dir of dirs) {
      const abs = path.resolve(pluginFsPath, dir);
      try {
        const entries = await fsp.readdir(abs, { withFileTypes: true });
        for (const ent of entries) if (ent.isFile() && /\.html?$/i.test(ent.name)) found.push(dir ? `${dir}/${ent.name}` : ent.name);
      } catch {}
    }
    return found;
  }

  app.get('/api/plugins/:id/preview', async (req, res) => {
    await servePluginSandboxedHtml(req, res, async (plugin) => {
      const curated = collectPluginPreviewCandidates(plugin);
      if (typeof plugin.fsPath !== 'string') return curated;
      const discovered = await discoverPluginHtmlAssets(plugin.fsPath);
      const seen = new Set(curated);
      for (const rel of discovered) if (!seen.has(rel)) curated.push(rel);
      return curated;
    });
  });
  app.get('/api/plugins/:id/example/:name', async (req, res) => {
    const name = String(req.params.name ?? '');
    if (!name || /[\\/\0]|\.\./.test(name)) return res.status(400).json({ error: 'invalid example name' });
    await servePluginSandboxedHtml(req, res, async (plugin) => {
      const examples = plugin.manifest?.od?.useCase?.exampleOutputs ?? [];
      const match = examples.find((e: PluginExampleOutput) => {
        if (typeof e?.path !== 'string') return false;
        const segments = e.path.split(/[\\/]/).filter(Boolean);
        const base = segments[segments.length - 1] ?? '';
        const baseStem = base.replace(/\.[^.]+$/, '');
        const parent = segments.length >= 2 ? segments[segments.length - 2] : null;
        const candidates = [base, baseStem, parent].filter(Boolean);
        if (typeof e.title === 'string') candidates.push(e.title);
        return candidates.includes(name);
      });
      if (typeof match?.path === 'string') return [match.path];
      return [`examples/${name}/index.html`, `examples/${name}.html`];
    });
  });
  app.get('/api/plugins/:id/asset/*splat', async (req, res) => {
    try {
      const authority = await resolveWorkspaceAuthority(req, res);
      if (authority === undefined) return;
      const plugin = await resolvePlugin(routeParam(req.params.id), authority);
      if (!plugin) return res.status(404).json({ error: 'plugin not found' });
      const splatParam = req.params.splat;
      const relpath = Array.isArray(splatParam) ? splatParam.join('/') : String(splatParam ?? '');
      if (!relpath || relpath.includes('..') || relpath.startsWith('/') || relpath.includes('\0')) return res.status(400).json({ error: 'invalid asset path' });
      const fsp = await import('node:fs/promises');
      const resolved = path.resolve(plugin.fsPath, relpath);
      const root = path.resolve(plugin.fsPath);
      const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
      if (!(resolved + path.sep).startsWith(rootWithSep) && resolved !== root) return res.status(400).json({ error: 'asset escape rejected' });
      const relativeSegments = path.relative(root, resolved).split(path.sep).filter(Boolean);
      let current = root;
      try {
        const rootStat = await fsp.lstat(current);
        if (rootStat.isSymbolicLink()) return res.status(404).json({ error: 'asset not found' });
        for (const segment of relativeSegments) {
          current = path.join(current, segment);
          const stat = await fsp.lstat(current);
          if (stat.isSymbolicLink()) return res.status(404).json({ error: 'asset not found' });
        }
      } catch {
        return res.status(404).json({ error: 'asset not found' });
      }
      try {
        const rootReal = await fsp.realpath(plugin.fsPath);
        const resolvedReal = await fsp.realpath(resolved);
        const rootRealWithSep = rootReal.endsWith(path.sep) ? rootReal : `${rootReal}${path.sep}`;
        if (resolvedReal !== rootReal && !resolvedReal.startsWith(rootRealWithSep)) return res.status(400).json({ error: 'asset escape rejected' });
      } catch {
        return res.status(404).json({ error: 'asset not found' });
      }
      let buf;
      try { buf = await fsp.readFile(resolved); } catch { return res.status(404).json({ error: 'asset not found' }); }
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data: blob:; media-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'none'; frame-ancestors 'self'");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const ext = path.extname(resolved).toLowerCase();
      const ct = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'application/javascript; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : ext === '.json' ? 'application/json; charset=utf-8' : ext === '.md' || ext === '.markdown' ? 'text/markdown; charset=utf-8' : ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
      res.setHeader('Content-Type', ct);
      res.send(buf);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
  app.get('/api/asset-cache', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : Array.isArray(req.query.url) && typeof req.query.url[0] === 'string' ? req.query.url[0] : '';
    if (!rawUrl) return res.status(400).json({ error: 'missing url query parameter' });
    try {
      const { buf, contentType } = await pluginAssetCache.get(rawUrl);
      res.setHeader('Content-Type', contentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'");
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.send(buf);
    } catch (err) {
      const status = err instanceof AssetCacheError ? err.status : 502;
      return res.status(status).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
