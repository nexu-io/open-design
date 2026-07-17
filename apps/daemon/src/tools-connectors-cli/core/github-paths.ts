/** @module core/github-paths
 * GitHub repository parsing and snapshot/output path derivation, including build-asset target resolution.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ParsedGitHubRepo } from './types.js';

/**
 * Parses a `--repo` argument (SSH URL, HTTPS URL, or `owner/repo` shorthand) into a `ParsedGitHubRepo`.
 * @param input — The raw `--repo` argument string.
 * @returns The parsed owner, repo name, and original source string.
 */
export function parseGithubRepo(input: string): ParsedGitHubRepo {
  const raw = input.trim();
  const sshMatch = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/iu.exec(raw);
  if (sshMatch?.[1] && sshMatch[2]) {
    return { owner: sshMatch[1], repo: stripGitSuffix(sshMatch[2]), source: raw };
  }

  if (/^https?:\/\//iu.test(raw)) {
    const url = new URL(raw);
    if (url.hostname.toLowerCase() !== 'github.com') {
      throw new Error('--repo must point to github.com');
    }
    const [owner, repo] = url.pathname.replace(/^\/+|\/+$/gu, '').split('/');
    if (!owner || !repo) throw new Error('--repo URL must include owner and repository');
    return { owner, repo: stripGitSuffix(repo), source: raw };
  }

  const [owner, repo] = raw.replace(/^\/+|\/+$/gu, '').split('/');
  if (!owner || !repo) {
    throw new Error('--repo must be owner/repo or a GitHub repository URL');
  }
  return { owner, repo: stripGitSuffix(repo), source: raw };
}

/** Removes a trailing `.git` suffix from a repository name. @internal */
function stripGitSuffix(value: string): string {
  return value.replace(/\.git$/iu, '');
}

/** Combines owner and repo into a URL-safe dash-joined slug for use in output paths. @internal */
function repoSlug(repo: ParsedGitHubRepo): string {
  return `${safePathSegment(repo.owner)}-${safePathSegment(repo.repo)}`;
}

/** Sanitizes a single path segment, replacing non-alphanumeric characters and trimming leading/trailing dashes. @internal */
function safePathSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-z0-9._-]+/giu, '-').replace(/^-+|-+$/gu, '');
  return normalized || 'repo';
}

/**
 * Converts a repo-relative path into a filesystem-safe relative path by sanitizing each segment.
 * @param repoPath — A forward-slash-separated path from the repository root.
 */
export function safeRepoRelativePath(repoPath: string): string {
  return repoPath
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map(safePathSegment)
    .join('/');
}

/**
 * Returns the default output markdown path for a `github-design-context` run when `--output` is not specified.
 * @param repo — The parsed GitHub repository.
 */
export function defaultGithubContextOutputPath(repo: ParsedGitHubRepo): string {
  return path.join('context', 'github', `${repoSlug(repo)}.md`);
}

/**
 * Derives the snapshot files root directory from the context output path and the repository identity.
 * @param outputPath — The resolved path to the markdown evidence file.
 * @param repo — The parsed GitHub repository, used to name the snapshot subdirectory.
 */
export function githubSnapshotRoot(outputPath: string, repo: ParsedGitHubRepo): string {
  const dir = path.dirname(outputPath);
  return path.join(dir, repoSlug(repo), 'files');
}

/**
 * Returns a filesystem-safe name derived from the basename of a local source path.
 * @param sourcePath — Absolute or relative path to a local folder.
 */
export function localSourceName(sourcePath: string): string {
  return safePathSegment(path.basename(path.resolve(sourcePath)) || 'local-source');
}

/**
 * Returns the default output markdown path for a `local-design-context` run when `--output` is not specified.
 * @param sourcePath — The `--path` argument supplied by the caller.
 */
export function defaultLocalContextOutputPath(sourcePath: string): string {
  return path.join('context', 'local-code', `${localSourceName(sourcePath)}.md`);
}

/**
 * Derives the snapshot files root directory for local evidence from the output path and source path.
 * @param outputPath — The resolved path to the markdown evidence file.
 * @param sourcePath — The local source folder path used to name the snapshot subdirectory.
 */
export function localSnapshotRoot(outputPath: string, sourcePath: string): string {
  const dir = path.dirname(outputPath);
  return path.join(dir, localSourceName(sourcePath), 'files');
}

/**
 * Ensures the parent directory of `filePath` exists, creating it recursively if needed.
 * @param filePath — The file whose parent directory should be created.
 */
export async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

/**
 * Returns true if `error` is a Node.js file-not-found error (`ENOENT`).
 * @param error — Any caught value.
 */
export function isAbsenceError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

/**
 * Derives the `build/` relative target path for a logo/icon repo asset that qualifies as a package build asset.
 * Returns `undefined` when the file is not a qualifying image or does not sit under a recognized asset root.
 * @param repoPath — Repo-relative path of the candidate asset.
 * @returns The normalized target path under `build/`, or `undefined` if the file does not qualify.
 */
export function packageBuildAssetTarget(repoPath: string): string | undefined {
  const safeRelativePath = safeRepoRelativePath(repoPath);
  if (!safeRelativePath) return undefined;
  if (!/\.(svg|png|jpe?g|webp|ico)$/iu.test(safeRelativePath)) return undefined;
  if (!/(^|\/)[^/]*(logo|icon|tray|wordmark|mark)[^/]*\.(svg|png|jpe?g|webp|ico)$/iu.test(safeRelativePath)) return undefined;
  const parts = safeRelativePath.split('/');
  const buildIndex = parts.findIndex((part) => /^build$/iu.test(part));
  const assetRootIndex = buildIndex === -1
    ? parts.findIndex((part) => /^(resources|public-resources)$/iu.test(part))
    : buildIndex;
  if (assetRootIndex === -1 || assetRootIndex === parts.length - 1) return undefined;
  return path.join('build', ...parts.slice(assetRootIndex + 1)).split(path.sep).join('/');
}
