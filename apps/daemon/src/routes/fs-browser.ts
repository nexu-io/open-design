import type { Express, Request, Response } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  FsBrowserEntry,
  FsBrowserErrorCode,
  FsBrowserListResponse,
  FsBrowserMkdirResponse,
  FsBrowserRoot,
  FsBrowserRootKind,
  FsBrowserRootsResponse,
} from '@open-design/contracts';

const MAX_ENTRIES = 500;
const SENSITIVE_DESCENDANTS = [
  ['.ssh'],
  ['.gnupg'],
  ['.aws'],
  ['.azure'],
  ['.docker'],
  ['.kube'],
  ['.password-store'],
  ['.local', 'share', 'keyrings'],
  ['.config', 'gcloud'],
  ['.config', 'gh'],
  ['.config', 'op'],
];

interface FsBrowserHttpDeps {
  isLocalSameOrigin: (req: Request, resolvedPort: number) => boolean;
  resolvedPortRef?: { current: number };
  getResolvedPort?: () => number;
  sendApiError?: (
    res: Response,
    status: number,
    code: string,
    message: string,
    init?: Record<string, unknown>,
  ) => unknown;
}

export interface RegisterFsBrowserRoutesDeps {
  roots?: readonly string[] | undefined;
  getRoots?: (() => Promise<readonly string[]>) | undefined;
  http: FsBrowserHttpDeps;
}

interface RootCandidate {
  path: string;
  kind: FsBrowserRootKind;
}

interface AllowedRoot extends FsBrowserRoot {
  realPath: string;
}

class FsBrowserRouteError extends Error {
  constructor(
    readonly status: number,
    readonly code: FsBrowserErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function getResolvedPort(http: FsBrowserHttpDeps): number {
  if (http.getResolvedPort) return http.getResolvedPort();
  return http.resolvedPortRef?.current ?? 0;
}

function requireLocalOrigin(req: Request, res: Response, http: FsBrowserHttpDeps): boolean {
  if (http.isLocalSameOrigin(req, getResolvedPort(http))) return true;
  res.status(403).json({ error: 'cross-origin request rejected' });
  return false;
}

function sendFsBrowserError(res: Response, err: FsBrowserRouteError) {
  return res.status(err.status).json({ error: err.code, message: err.message });
}

function displayLabelForRoot(rootPath: string): string {
  return path.basename(rootPath) || rootPath;
}

async function rootCandidates(deps: RegisterFsBrowserRoutesDeps): Promise<RootCandidate[]> {
  const dynamicRoots = deps.getRoots ? await deps.getRoots() : [];
  return [...(deps.roots ?? []), ...dynamicRoots].map((rootPath) => ({
    path: rootPath,
    kind: 'configured' as const,
  }));
}

async function resolveAllowedRoots(deps: RegisterFsBrowserRoutesDeps): Promise<AllowedRoot[]> {
  const seen = new Set<string>();
  const roots: AllowedRoot[] = [];
  for (const candidate of await rootCandidates(deps)) {
    try {
      const realPath = await fs.realpath(candidate.path);
      const stat = await fs.stat(realPath);
      if (!stat.isDirectory()) continue;
      if (path.dirname(realPath) === realPath) continue;
      if (seen.has(realPath)) continue;
      seen.add(realPath);
      roots.push({
        label: displayLabelForRoot(realPath),
        path: realPath,
        kind: candidate.kind,
        realPath,
      });
    } catch {
      // Missing or inaccessible configured roots are ignored so one stale
      // daemon-owned root cannot disable the picker.
    }
  }
  return roots;
}

function isInsideRoot(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function findContainingRoot(target: string, roots: readonly AllowedRoot[]): AllowedRoot | null {
  return roots.find((root) => isInsideRoot(target, root.realPath)) ?? null;
}

function isSensitiveDescendant(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false;
  const segments = relative.split(path.sep).filter(Boolean);
  return SENSITIVE_DESCENDANTS.some((sensitive) =>
    sensitive.every((segment, index) => segments[index] === segment),
  );
}

function ensureAllowedPath(target: string, roots: readonly AllowedRoot[]): AllowedRoot {
  const root = findContainingRoot(target, roots);
  if (!root) {
    throw new FsBrowserRouteError(
      403,
      'PATH_OUTSIDE_ALLOWED_ROOTS',
      'path is outside the allowed filesystem roots',
    );
  }
  if (isSensitiveDescendant(target, root.realPath)) {
    throw new FsBrowserRouteError(
      403,
      'PATH_ACCESS_DENIED',
      'path is inside a sensitive filesystem directory',
    );
  }
  return root;
}

async function realpathForRequest(requestedPath: string): Promise<string> {
  try {
    return await fs.realpath(requestedPath);
  } catch {
    throw new FsBrowserRouteError(404, 'PATH_NOT_FOUND', 'path was not found');
  }
}

async function resolveListPath(req: Request, roots: readonly AllowedRoot[]): Promise<string> {
  const requestedPath = typeof req.query.path === 'string' ? req.query.path : '';
  if (!requestedPath) {
    throw new FsBrowserRouteError(400, 'PATH_REQUIRED', 'path query parameter is required');
  }
  if (!path.isAbsolute(requestedPath)) {
    throw new FsBrowserRouteError(400, 'PATH_MUST_BE_ABSOLUTE', 'path must be absolute');
  }

  const realPath = await realpathForRequest(requestedPath);
  ensureAllowedPath(realPath, roots);
  const stat = await fs.stat(realPath);
  if (!stat.isDirectory()) {
    throw new FsBrowserRouteError(400, 'PATH_NOT_DIRECTORY', 'path is not a directory');
  }
  return realPath;
}

function requestBodyRecord(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
}

function mkdirNameForRequest(req: Request): string {
  const body = requestBodyRecord(req);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    throw new FsBrowserRouteError(400, 'NAME_REQUIRED', 'directory name is required');
  }
  if (
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\\') ||
    path.basename(name) !== name
  ) {
    throw new FsBrowserRouteError(400, 'NAME_INVALID', 'directory name must be a single path segment');
  }
  return name;
}

async function resolveParentPathForRequest(req: Request, roots: readonly AllowedRoot[]): Promise<string> {
  const body = requestBodyRecord(req);
  const requestedPath = typeof body.parentPath === 'string' ? body.parentPath : '';
  if (!requestedPath) {
    throw new FsBrowserRouteError(400, 'PATH_REQUIRED', 'parentPath is required');
  }
  if (!path.isAbsolute(requestedPath)) {
    throw new FsBrowserRouteError(400, 'PATH_MUST_BE_ABSOLUTE', 'parentPath must be absolute');
  }

  const realPath = await realpathForRequest(requestedPath);
  ensureAllowedPath(realPath, roots);
  const stat = await fs.stat(realPath);
  if (!stat.isDirectory()) {
    throw new FsBrowserRouteError(400, 'PATH_NOT_DIRECTORY', 'parentPath is not a directory');
  }
  return realPath;
}

async function resolveEntry(
  dirPath: string,
  name: string,
  roots: readonly AllowedRoot[],
): Promise<FsBrowserEntry | null> {
  const childPath = path.join(dirPath, name);
  let realPath: string;
  let stat;
  try {
    realPath = await fs.realpath(childPath);
    stat = await fs.stat(realPath);
  } catch {
    return null;
  }
  if (!stat.isDirectory()) return null;
  const containingRoot = findContainingRoot(realPath, roots);
  if (!containingRoot) return null;
  if (isSensitiveDescendant(realPath, containingRoot.realPath)) return null;

  return {
    name,
    path: realPath,
    type: 'directory',
    hidden: name.startsWith('.'),
  };
}

async function listDirectory(
  dirPath: string,
  roots: readonly AllowedRoot[],
): Promise<Pick<FsBrowserListResponse, 'entries' | 'truncated'>> {
  let dirents;
  try {
    dirents = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    throw new FsBrowserRouteError(403, 'PATH_ACCESS_DENIED', 'directory cannot be read');
  }

  const entries = (
    await Promise.all(dirents.map((dirent) => resolveEntry(dirPath, dirent.name, roots)))
  )
    .filter((entry): entry is FsBrowserEntry => entry !== null)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return {
    entries: entries.slice(0, MAX_ENTRIES),
    truncated: entries.length > MAX_ENTRIES,
  };
}

function parentForPath(dirPath: string, roots: readonly AllowedRoot[]): string | null {
  const parent = path.dirname(dirPath);
  if (parent === dirPath) return null;
  return findContainingRoot(parent, roots) ? parent : null;
}

export function registerFsBrowserRoutes(app: Express, deps: RegisterFsBrowserRoutesDeps): void {
  app.get('/api/fs-browser/roots', async (req, res) => {
    if (!requireLocalOrigin(req, res, deps.http)) return;
    const roots = await resolveAllowedRoots(deps);
    const response: FsBrowserRootsResponse = {
      roots: roots.map(({ realPath: _realPath, ...root }) => root),
    };
    res.json(response);
  });

  app.get('/api/fs-browser/list', async (req, res) => {
    if (!requireLocalOrigin(req, res, deps.http)) return;
    try {
      const roots = await resolveAllowedRoots(deps);
      const dirPath = await resolveListPath(req, roots);
      const listing = await listDirectory(dirPath, roots);
      const response: FsBrowserListResponse = {
        path: dirPath,
        parent: parentForPath(dirPath, roots),
        ...listing,
      };
      res.json(response);
    } catch (err) {
      if (err instanceof FsBrowserRouteError) {
        sendFsBrowserError(res, err);
        return;
      }
      res.status(500).json({
        error: 'PATH_ACCESS_DENIED' satisfies FsBrowserErrorCode,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/api/fs-browser/mkdir', async (req, res) => {
    if (!requireLocalOrigin(req, res, deps.http)) return;
    try {
      const roots = await resolveAllowedRoots(deps);
      const parentPath = await resolveParentPathForRequest(req, roots);
      const name = mkdirNameForRequest(req);
      const targetPath = path.join(parentPath, name);
      ensureAllowedPath(targetPath, roots);
      try {
        await fs.mkdir(targetPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new FsBrowserRouteError(409, 'PATH_ALREADY_EXISTS', 'directory already exists');
        }
        throw err;
      }
      const response: FsBrowserMkdirResponse = { path: await fs.realpath(targetPath) };
      res.json(response);
    } catch (err) {
      if (err instanceof FsBrowserRouteError) {
        sendFsBrowserError(res, err);
        return;
      }
      res.status(500).json({
        error: 'PATH_ACCESS_DENIED' satisfies FsBrowserErrorCode,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
