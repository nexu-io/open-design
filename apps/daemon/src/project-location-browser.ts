import { lstat, readdir, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface ProjectLocationFolderBrowserEntry {
  name: string;
  path: string;
}

export interface ProjectLocationFolderBrowserResponse {
  path: string;
  parentPath: string | null;
  entries: ProjectLocationFolderBrowserEntry[];
}

export interface ProjectLocationFolderBrowserOptions {
  rootPath?: string;
}

function isInsideOrSame(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function requestedTarget(requestedPath: string | null | undefined, rootPath: string): string {
  const trimmed = typeof requestedPath === 'string' ? requestedPath.trim() : '';
  if (!trimmed) return rootPath;
  return path.isAbsolute(trimmed) ? trimmed : path.join(rootPath, trimmed);
}

async function canonicalDirectory(dirPath: string): Promise<string> {
  const info = await lstat(dirPath);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('path must be a real directory');
  }
  return realpath(dirPath);
}

async function childDirectories(rootPath: string, currentPath: string): Promise<ProjectLocationFolderBrowserEntry[]> {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const directories: ProjectLocationFolderBrowserEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const childPath = path.join(currentPath, entry.name);
    try {
      const canonical = await canonicalDirectory(childPath);
      if (isInsideOrSame(rootPath, canonical)) directories.push({ name: entry.name, path: canonical });
    } catch {
      continue;
    }
  }
  return directories.sort((a, b) => {
    const aHidden = a.name.startsWith('.');
    const bHidden = b.name.startsWith('.');
    if (aHidden !== bHidden) return aHidden ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Lists navigable server-side directories for the project location chooser.
 */
export async function browseProjectLocationFolders(
  requestedPath?: string | null,
  options: ProjectLocationFolderBrowserOptions = {},
): Promise<ProjectLocationFolderBrowserResponse> {
  const rootPath = await canonicalDirectory(options.rootPath ?? os.homedir());
  const targetPath = await canonicalDirectory(requestedTarget(requestedPath, rootPath));
  if (!isInsideOrSame(rootPath, targetPath)) {
    throw new Error('folder is outside the browsing root');
  }
  const parent = targetPath === rootPath ? null : path.dirname(targetPath);
  const parentPath = parent && isInsideOrSame(rootPath, parent) ? parent : null;
  return {
    path: targetPath,
    parentPath,
    entries: await childDirectories(rootPath, targetPath),
  };
}
