import fs from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';
import type { AuthenticatedRequest, DaemonUser } from './auth-context.js';

const PROJECTS_SUBDIR = 'projects';
const ARTIFACTS_SUBDIR = 'artifacts';

const ensuredDirs = new Set<string>();

function ensureDir(dir: string): string {
  if (!ensuredDirs.has(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    ensuredDirs.add(dir);
  }
  return dir;
}

function requestUser(req: Request): DaemonUser {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    throw new Error('per-user paths require auth-context middleware to run first');
  }
  return user;
}

export function projectsDirForUser(user: DaemonUser): string {
  return ensureDir(path.join(user.dataDir, PROJECTS_SUBDIR));
}

export function artifactsDirForUser(user: DaemonUser): string {
  return ensureDir(path.join(user.dataDir, ARTIFACTS_SUBDIR));
}

export function runtimeDataDirForUser(user: DaemonUser): string {
  return ensureDir(user.dataDir);
}

export function projectsDirFor(req: Request): string {
  return projectsDirForUser(requestUser(req));
}

export function artifactsDirFor(req: Request): string {
  return artifactsDirForUser(requestUser(req));
}

export function runtimeDataDirFor(req: Request): string {
  return runtimeDataDirForUser(requestUser(req));
}

export function resetPerUserPathCacheForTests(): void {
  ensuredDirs.clear();
}
