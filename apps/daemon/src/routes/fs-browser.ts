import type { Express, Request, Response } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FsBrowserEntry, FsBrowserErrorCode, FsBrowserListResponse, FsBrowserRoot } from '@open-design/contracts';

const MAX_ENTRIES = 500;
const MAX_SCANNED_ENTRIES = 2000;
const SENSITIVE_DESCENDANTS = [['.ssh'], ['.gnupg'], ['.aws'], ['.azure'], ['.docker'], ['.kube'], ['.password-store'], ['.local', 'share', 'keyrings'], ['.config', 'gcloud'], ['.config', 'gh'], ['.config', 'op']];
export interface RegisterFsBrowserRoutesDeps {
  roots?: readonly string[];
  getRoots?: () => Promise<readonly string[]>;
  http: { isLocalSameOrigin: (req: Request, port: number) => boolean; resolvedPortRef: { current: number } };
}
type AllowedRoot = FsBrowserRoot & { realPath: string };
class RouteError extends Error { constructor(readonly status: number, readonly code: FsBrowserErrorCode, message: string) { super(message); } }
function inside(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function sensitive(target: string) {
  const segments = path.resolve(target).split(path.sep).filter(Boolean).map((value) => value.toLowerCase());
  return SENSITIVE_DESCENDANTS.some((sequence) => {
    for (let start = 0; start <= segments.length - sequence.length; start += 1) {
      if (sequence.every((part, offset) => segments[start + offset] === part)) return true;
    }
    return false;
  });
}
async function allowedRoots(deps: RegisterFsBrowserRoutesDeps): Promise<AllowedRoot[]> {
  const candidates = [...(deps.roots ?? []), ...(deps.getRoots ? await deps.getRoots() : [])];
  const seen = new Set<string>();
  const roots: AllowedRoot[] = [];
  for (const candidate of candidates) {
    try {
      const realPath = await fs.realpath(candidate);
      if (!(await fs.stat(realPath)).isDirectory() || path.dirname(realPath) === realPath || sensitive(realPath) || seen.has(realPath)) continue;
      seen.add(realPath);
      roots.push({ label: path.basename(realPath) || realPath, path: realPath, kind: 'configured', realPath });
    } catch {
      // Stale grants do not disable remaining roots.
    }
  }
  return roots;
}
function allowed(target: string, roots: readonly AllowedRoot[]): void {
  if (!roots.some((root) => inside(target, root.realPath))) {
    throw new RouteError(403, 'PATH_OUTSIDE_ALLOWED_ROOTS', 'path is outside the allowed filesystem roots');
  }
  if (sensitive(target)) {
    throw new RouteError(403, 'PATH_ACCESS_DENIED', 'path is inside a sensitive filesystem directory');
  }
}
async function canonical(requested: string, roots: readonly AllowedRoot[]): Promise<string> {
  if (!requested) throw new RouteError(400, 'PATH_REQUIRED', 'path query parameter is required');
  if (!path.isAbsolute(requested)) throw new RouteError(400, 'PATH_MUST_BE_ABSOLUTE', 'path must be absolute');
  let realPath: string;
  try {
    realPath = await fs.realpath(requested);
  } catch {
    throw new RouteError(404, 'PATH_NOT_FOUND', 'path was not found');
  }
  allowed(realPath, roots);
  if (!(await fs.stat(realPath)).isDirectory()) throw new RouteError(400, 'PATH_NOT_DIRECTORY', 'path is not a directory');
  return realPath;
}
async function entry(dir: string, name: string, roots: readonly AllowedRoot[]): Promise<FsBrowserEntry | null> {
  try {
    const realPath = await fs.realpath(path.join(dir, name));
    if (!(await fs.stat(realPath)).isDirectory() || sensitive(realPath) || !roots.some((root) => inside(realPath, root.realPath))) return null;
    return { name, path: realPath, type: 'directory', hidden: name.startsWith('.') };
  } catch {
    return null;
  }
}
function error(res: Response, err: unknown): Response {
  if (err instanceof RouteError) return res.status(err.status).json({ error: err.code, message: err.message });
  return res.status(500).json({ error: 'PATH_ACCESS_DENIED', message: 'filesystem request failed' });
}
export function registerFsBrowserRoutes(app: Express, deps: RegisterFsBrowserRoutesDeps): void {
  const origin = (req: Request, res: Response) => deps.http.isLocalSameOrigin(req, deps.http.resolvedPortRef.current) || (res.status(403).json({ error: 'cross-origin request rejected' }), false);
  app.get('/api/fs-browser/roots', async (req, res) => {
    if (!origin(req, res)) return;
    try {
      const roots = await allowedRoots(deps);
      res.json({ roots: roots.map(({ realPath: _realPath, ...root }) => root) });
    } catch (err) {
      error(res, err);
    }
  });
  app.get('/api/fs-browser/list', async (req, res) => {
    if (!origin(req, res)) return;
    try {
      const roots = await allowedRoots(deps);
      const dir = await canonical(typeof req.query.path === 'string' ? req.query.path : '', roots);
      const entries: FsBrowserEntry[] = [];
      let scanned = 0;
      let truncated = false;
      // Bound filesystem work as well as response size, even for file-heavy roots.
      for await (const child of await fs.opendir(dir)) {
        if (scanned >= MAX_SCANNED_ENTRIES) {
          truncated = true;
          break;
        }
        scanned += 1;
        if (!child.isDirectory() && !child.isSymbolicLink()) continue;
        const resolved = await entry(dir, child.name, roots);
        if (!resolved) continue;
        if (entries.length === MAX_ENTRIES) {
          truncated = true;
          break;
        }
        entries.push(resolved);
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      const parent = path.dirname(dir);
      const response: FsBrowserListResponse = {
        path: dir,
        parent: roots.some((root) => inside(parent, root.realPath)) ? parent : null,
        entries,
        truncated,
      };
      res.json(response);
    } catch (err) {
      error(res, err);
    }
  });
}
