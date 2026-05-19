// Install/uninstall logic for user-managed skills and design systems.
// Installed items live under ~/.open-design/skills/ and
// ~/.open-design/design-systems/ respectively.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isBlocked } from './linked-dirs.js';
import { listSkills } from './skills.js';
import { listDesignSystems } from './design-systems.js';

type InstallTarget =
  | { source: 'github'; url: string }
  | { source: 'local'; path: string };

type InstallResult =
  | { ok: true; dir: string }
  | { ok: false; error: string };

type UninstallResult =
  | { ok: true }
  | { ok: false; error: string; status?: number };

type ItemKind = 'skill' | 'design-system';

const GITHUB_URL_RE = /^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/?$/;
const SAFE_NAME_RE = /^[a-zA-Z0-9_.-]+$/;

export function sanitizeRepoName(url: string): string {
  const trimmed = url.replace(/\/+$/, '');
  const segments = trimmed.split('/');
  const raw = segments[segments.length - 1] || 'unnamed';
  // Strip .git suffix
  const name = raw.replace(/\.git$/, '');
  // Allow only safe characters, truncate to 64 chars
  if (!SAFE_NAME_RE.test(name)) return 'skill-' + Date.now();
  return name.slice(0, 64);
}

export async function installFromTarget(
  target: InstallTarget,
  userDir: string,
  kind: ItemKind,
): Promise<InstallResult> {
  const manifest = kind === 'skill' ? 'SKILL.md' : 'DESIGN.md';

  if (target.source === 'github') {
    return installFromGithub(target.url, userDir, manifest);
  }
  if (target.source === 'local') {
    return installFromLocal(target.path, userDir, manifest);
  }
  return { ok: false, error: 'Invalid install source' };
}

async function installFromGithub(
  url: string,
  userDir: string,
  manifest: string,
): Promise<InstallResult> {
  if (!GITHUB_URL_RE.test(url)) {
    return { ok: false, error: 'Invalid GitHub URL. Expected https://github.com/<owner>/<repo>' };
  }

  const dirName = sanitizeRepoName(url);
  const dest = path.join(userDir, dirName);

  // Check collision
  try {
    const stat = fs.statSync(dest);
    if (stat.isDirectory()) {
      return { ok: false, error: `A ${manifest === 'SKILL.md' ? 'skill' : 'design system'} named "${dirName}" is already installed` };
    }
  } catch {
    // Doesn't exist — good.
  }

  // Shallow clone
  try {
    await new Promise<void>((resolve, reject) => {
      const cp = execFile('git', ['clone', '--depth', '1', url, dest], {
        timeout: 60_000,
      }, (err, _stdout, stderr) => {
        if (err) {
          // Clean up partial clone
          try { fs.rmSync(dest, { recursive: true, force: true }); } catch {}
          reject(new Error(stderr || err.message));
        } else {
          resolve(undefined);
        }
      });
    });
  } catch (err) {
    return { ok: false, error: `git clone failed: ${String(err).split('\n')[0]}` };
  }

  // Verify manifest exists
  if (!fs.existsSync(path.join(dest, manifest))) {
    try { fs.rmSync(dest, { recursive: true, force: true }); } catch {}
    return {
      ok: false,
      error: `Repository does not contain a ${manifest} file`,
    };
  }

  return { ok: true, dir: dest };
}

async function installFromLocal(
  localPath: string,
  userDir: string,
  manifest: string,
): Promise<InstallResult> {
  if (!path.isAbsolute(localPath)) {
    return { ok: false, error: 'Path must be absolute' };
  }

  let realPath: string;
  try {
    realPath = fs.realpathSync.native(localPath);
  } catch {
    return { ok: false, error: 'Directory does not exist or is not accessible' };
  }

  try {
    const stat = fs.statSync(realPath);
    if (!stat.isDirectory()) {
      return { ok: false, error: 'Not a directory' };
    }
  } catch {
    return { ok: false, error: 'Directory does not exist or is not accessible' };
  }

  if (isBlocked(realPath)) {
    return { ok: false, error: 'System directory not allowed' };
  }

  if (!fs.existsSync(path.join(realPath, manifest))) {
    return { ok: false, error: `Directory does not contain a ${manifest} file` };
  }

  const dirName = path.basename(realPath);
  const linkPath = path.join(userDir, dirName);

  // Check collision
  try {
    fs.statSync(linkPath);
    return { ok: false, error: `A ${manifest === 'SKILL.md' ? 'skill' : 'design system'} named "${dirName}" is already installed` };
  } catch {
    // Doesn't exist — good.
  }

  // Create symlink
  try {
    fs.symlinkSync(realPath, linkPath, 'junction');
  } catch (err) {
    return { ok: false, error: `Failed to create symlink: ${(err as NodeJS.ErrnoException).message}` };
  }

  return { ok: true, dir: linkPath };
}

export async function uninstallById(
  id: string,
  userDir: string,
  builtInDir: string,
  kind: ItemKind,
): Promise<UninstallResult> {
  const listFn = kind === 'skill' ? listSkills : listDesignSystems;

  // Check if it's a built-in item
  const builtIn = await listFn(builtInDir);
  if (builtIn.some((s) => s.id === id)) {
    return { ok: false, error: 'Cannot uninstall built-in items', status: 403 };
  }

  // Find in user directory
  const installed = await listFn(userDir);
  const item = installed.find((s) => s.id === id);
  if (!item) {
    return { ok: false, error: 'Not found in user-installed items', status: 404 };
  }

  // item.dir points to the filesystem directory
  const target = item.dir;
  try {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(target);
    } else if (stat.isDirectory()) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  } catch (err) {
    return { ok: false, error: `Failed to remove: ${(err as NodeJS.ErrnoException).message}` };
  }

  return { ok: true };
}
