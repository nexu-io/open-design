import fs from 'node:fs';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { x as extractTar } from 'tar';
import { parseFrontmatter } from '../design-systems/frontmatter.js';
import { resolveGithubRepositoryUrl } from '../github-install-source.js';
import { safeExternalFetch } from '../plugins/plugin-asset-cache.js';
import { findSkillById, listSkills, slugifySkillName } from '../skills.js';

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const MAX_SKILL_SCAN_DEPTH = 6;
const MAX_SKILL_SCAN_ENTRIES = 10_000;
const GITHUB_SKILL_SOURCE_RE =
  /^github:([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)$/;
const GITHUB_SKILL_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);

export type SkillInstallErrorCode =
  | 'BAD_REQUEST'
  | 'FETCH_FAILED'
  | 'INVALID_ARCHIVE'
  | 'INVALID_MANIFEST'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export type SkillRemoteInstallResult =
  | { ok: true; id: string; dir: string }
  | { ok: false; code: SkillInstallErrorCode; error: string };

export type SkillArchiveFetcher = (url: string) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  body: Readable | null;
}>;

export interface SkillRemoteInstallOptions {
  fetcher?: SkillArchiveFetcher;
  maxBytes?: number;
  /** Called after the archive identity is verified but before any bytes are
   * committed under the user's skills root. */
  allowInstallIdentity?: (identity: { id: string; slug: string }) => boolean | Promise<boolean>;
}

interface SkillSourceCandidate {
  fetchUrl: string;
  preferredSkillDirectory?: string;
  preferredSkillPath?: string;
}

interface ResolvedSkillSource {
  candidates: SkillSourceCandidate[];
}

function error(
  code: SkillInstallErrorCode,
  message: string,
): Extract<SkillRemoteInstallResult, { ok: false }> {
  return { ok: false, code, error: message };
}

/**
 * Resolve the browser URL users copy for one skill inside a multi-skill GitHub
 * repository. GitHub does not delimit a slash-containing ref from the folder
 * path, so return each safe split from shortest to longest ref. Installation
 * tries them in order until an archive contains the explicitly selected skill.
 */
function resolveGithubSkillTreeUrl(
  rawSource: string,
): ResolvedSkillSource | SkillRemoteInstallResult | null {
  const source = rawSource.trim();
  // URL parsing normalizes literal `..` segments before exposing pathname, so
  // reject them from the original text instead of accidentally turning a
  // traversal-looking selection into a different valid folder.
  if (/\/(?:\.\.|%2e%2e)(?:\/|$)/i.test(source)) {
    return error('BAD_REQUEST', 'GitHub skill tree URL contains an unsafe folder path');
  }
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }
  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) return null;
  if (
    url.protocol !== 'https:'
    || url.port
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    return error('BAD_REQUEST', 'GitHub skill URLs must be public HTTPS URLs without query parameters');
  }
  const match = /^\/([^/]+)\/([^/]+)\/tree\/(.+?)\/?$/.exec(url.pathname);
  if (!match) return null;
  try {
    const owner = decodeURIComponent(match[1]!);
    const repo = decodeURIComponent(match[2]!).replace(/\.git$/i, '');
    const treeParts = match[3]!
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
    if (
      !GITHUB_SKILL_SEGMENT_RE.test(owner)
      || !GITHUB_SKILL_SEGMENT_RE.test(repo)
      || treeParts.length < 2
      || treeParts.some((segment) => !GITHUB_SKILL_SEGMENT_RE.test(segment))
    ) {
      return error('BAD_REQUEST', 'GitHub skill tree URL contains an unsupported ref or folder path');
    }
    return {
      candidates: treeParts.slice(0, -1).map((_, index) => {
        const refParts = treeParts.slice(0, index + 1);
        return {
          fetchUrl: `https://codeload.github.com/${owner}/${repo}/tar.gz/${refParts.map(encodeURIComponent).join('/')}`,
          preferredSkillDirectory: repo,
          preferredSkillPath: treeParts.slice(index + 1).join('/'),
        };
      }),
    };
  } catch {
    return error('BAD_REQUEST', 'GitHub skill tree URL contains invalid encoding');
  }
}

function resolveSkillSource(rawSource: string): ResolvedSkillSource | SkillRemoteInstallResult {
  const browserTree = resolveGithubSkillTreeUrl(rawSource);
  if (browserTree) return browserTree;
  const browserGithub = resolveGithubRepositoryUrl(rawSource);
  if (browserGithub.kind === 'invalid') {
    return error('BAD_REQUEST', browserGithub.error);
  }
  const source = browserGithub.kind === 'repository'
    ? browserGithub.source
    : rawSource.trim();
  const github = GITHUB_SKILL_SOURCE_RE.exec(source);
  if (github) {
    const owner = github[1]!;
    const repo = github[2]!;
    if (owner === '.' || owner === '..' || repo === '.' || repo === '..') {
      return error('BAD_REQUEST', 'Malformed GitHub source; expected github:owner/repo');
    }
    return {
      candidates: [{
        fetchUrl: `https://codeload.github.com/${owner}/${repo}/tar.gz/HEAD`,
        preferredSkillDirectory: repo,
      }],
    };
  }
  if (source.startsWith('github:')) {
    return error('BAD_REQUEST', 'Malformed GitHub source; expected github:owner/repo');
  }

  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return error(
      'BAD_REQUEST',
      'Unsupported skill source; expected github:owner/repo or an HTTPS .tar.gz/.tgz URL',
    );
  }
  if (url.protocol !== 'https:') {
    return error('BAD_REQUEST', 'Skill archive URLs must use HTTPS');
  }
  if (url.username || url.password) {
    return error('BAD_REQUEST', 'Skill archive URLs must not contain credentials');
  }
  if (!/\.(?:tar\.gz|tgz)$/i.test(url.pathname)) {
    return error('BAD_REQUEST', 'Only HTTPS .tar.gz or .tgz skill archives are supported');
  }
  return { candidates: [{ fetchUrl: url.toString() }] };
}

/**
 * Archive entry invariant shared by extraction and tests. Treat backslashes as
 * separators too so a Windows traversal payload cannot become safe merely
 * because extraction is running on POSIX.
 */
export function isSafeSkillArchivePath(rawPath: string): boolean {
  if (!rawPath || rawPath.includes('\0')) return false;
  const normalized = rawPath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return false;
  return !normalized.split('/').some((segment) => segment === '..');
}

async function defaultFetcher(
  url: string,
): Promise<Awaited<ReturnType<SkillArchiveFetcher>>> {
  const response = await safeExternalFetch(url);
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: response.body ? Readable.fromWeb(response.body as never) : null,
  };
}

async function writeBoundedArchive(
  body: Readable,
  archivePath: string,
  maxBytes: number,
): Promise<void> {
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        callback(new Error(`downloaded archive exceeds ${maxBytes} bytes`));
        return;
      }
      callback(null, chunk);
    },
  });
  await pipeline(body, limiter, fs.createWriteStream(archivePath));
}

async function measureSafeTree(root: string, maxBytes: number): Promise<number> {
  let total = 0;
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(dir, entry.name);
      const stats = await lstat(target);
      if (stats.isSymbolicLink()) {
        throw new Error('archive contains a symbolic link');
      }
      if (stats.isDirectory()) {
        await walk(target);
        continue;
      }
      if (!stats.isFile()) {
        throw new Error(`archive contains unsupported entry type: ${entry.name}`);
      }
      total += stats.size;
      if (total > maxBytes) {
        throw new Error(`extracted archive exceeds ${maxBytes} bytes`);
      }
    }
  }
  await walk(root);
  return total;
}

async function findSkillRoot(
  extractRoot: string,
  preferredSkillDirectory?: string,
  preferredSkillPath?: string,
): Promise<string | SkillRemoteInstallResult> {
  const rootManifest = path.join(extractRoot, 'SKILL.md');
  if (
    !preferredSkillPath
    && await lstat(rootManifest).then((stats) => stats.isFile()).catch(() => false)
  ) {
    return extractRoot;
  }
  const candidates: string[] = [];
  let scannedEntries = 0;
  async function scan(dir: string, depth: number): Promise<void> {
    if (depth > MAX_SKILL_SCAN_DEPTH) return;
    const entries = await readdir(dir, { withFileTypes: true });
    scannedEntries += entries.length;
    if (scannedEntries > MAX_SKILL_SCAN_ENTRIES) {
      throw new Error(
        `Skill archive contains more than ${MAX_SKILL_SCAN_ENTRIES} entries while locating SKILL.md`,
      );
    }
    const hasManifest = entries.some((entry) => entry.isFile() && entry.name === 'SKILL.md');
    if (hasManifest) {
      candidates.push(dir);
      if (!preferredSkillPath) return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) await scan(path.join(dir, entry.name), depth + 1);
    }
  }
  try {
    await scan(extractRoot, 0);
  } catch (cause) {
    return error(
      'INVALID_MANIFEST',
      cause instanceof Error ? cause.message : String(cause),
    );
  }
  if (candidates.length === 0) {
    return error(
      'INVALID_MANIFEST',
      preferredSkillPath
        ? `Skill repository does not contain SKILL.md at ${preferredSkillPath}`
        : 'Skill archive does not contain a SKILL.md file',
    );
  }
  if (preferredSkillPath) {
    const preferred = candidates.filter((candidate) => {
      const archiveRelativeParts = path.relative(extractRoot, candidate).split(path.sep);
      // GitHub codeload archives have exactly one repository wrapper directory
      // (`repo-ref/`). The browser URL path is relative to the repository root,
      // so discard only that wrapper and preserve GitHub's case-sensitive path.
      const repositoryRelative = archiveRelativeParts.slice(1).join('/');
      return repositoryRelative === preferredSkillPath;
    });
    if (preferred.length === 1) return preferred[0]!;
    if (preferred.length === 0) {
      return error(
        'INVALID_MANIFEST',
        `Skill repository does not contain SKILL.md at ${preferredSkillPath}`,
      );
    }
    return error(
      'INVALID_MANIFEST',
      `Skill repository contains multiple matches for ${preferredSkillPath}`,
    );
  }
  if (preferredSkillDirectory) {
    const expectedSuffix = `/skills/${preferredSkillDirectory.toLowerCase()}`;
    const preferred = candidates.filter((candidate) => {
      const relative = path.relative(extractRoot, candidate).split(path.sep).join('/').toLowerCase();
      return relative === expectedSuffix.slice(1) || relative.endsWith(expectedSuffix);
    });
    if (preferred.length === 1) return preferred[0]!;
  }
  if (candidates.length > 1) {
    const examples = candidates
      .slice(0, 5)
      .map((candidate) => path.relative(extractRoot, candidate).split(path.sep).join('/'))
      .join(', ');
    return error(
      'INVALID_MANIFEST',
      `Skill repository contains multiple SKILL.md files (${examples}) and has no unique `
      + `skills/${preferredSkillDirectory ?? '<repo-name>'}/SKILL.md default; `
      + 'upload an archive containing exactly one skill',
    );
  }
  return candidates[0]!;
}

async function readSkillIdentity(
  skillRoot: string,
): Promise<{ id: string; slug: string } | SkillRemoteInstallResult> {
  try {
    const raw = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');
    const parsed = parseFrontmatter(raw) as {
      data?: { name?: unknown };
      body?: string;
    };
    const id = typeof parsed.data?.name === 'string' ? parsed.data.name.trim() : '';
    if (!id) {
      return error('INVALID_MANIFEST', 'SKILL.md frontmatter must contain a non-empty name');
    }
    if (typeof parsed.body !== 'string' || !parsed.body.trim()) {
      return error('INVALID_MANIFEST', 'SKILL.md must contain workflow instructions');
    }
    const slug = slugifySkillName(id);
    if (!slug) {
      return error('INVALID_MANIFEST', 'SKILL.md name must produce a valid skill slug');
    }
    return { id, slug };
  } catch (cause) {
    return error(
      'INVALID_MANIFEST',
      `Could not read SKILL.md: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

/**
 * Install one public remote skill as a self-contained user skill.
 *
 * The accepted source grammar intentionally matches Plugin URL import:
 * `github:owner/repo` or a public HTTPS `.tar.gz`/`.tgz` archive. Downloads
 * reuse the plugin subsystem's SSRF-safe fetcher, while extraction rejects
 * traversal and links and enforces the same 50 MiB default cap. Installation
 * is an atomic, fail-closed rename and never overwrites an existing skill.
 */
async function installSkillSourceCandidate(
  userSkillsRoot: string,
  resolved: SkillSourceCandidate,
  options: SkillRemoteInstallOptions = {},
): Promise<SkillRemoteInstallResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const fetcher = options.fetcher ?? defaultFetcher;
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'od-skill-archive-'));
  const archivePath = path.join(tempRoot, 'archive.tgz');
  const extractRoot = path.join(tempRoot, 'extract');
  let installStageRoot: string | undefined;
  try {
    let response: Awaited<ReturnType<SkillArchiveFetcher>>;
    try {
      response = await fetcher(resolved.fetchUrl);
    } catch (cause) {
      return error(
        'FETCH_FAILED',
        `Skill download failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
    if (!response.ok || !response.body) {
      return error(
        'FETCH_FAILED',
        `Skill download failed: ${response.status} ${response.statusText}`.trim(),
      );
    }
    try {
      await writeBoundedArchive(response.body, archivePath, maxBytes);
    } catch (cause) {
      return error(
        'INVALID_ARCHIVE',
        `Skill archive download failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }

    await mkdir(extractRoot, { recursive: true });
    let unsafeEntry: string | undefined;
    try {
      await pipeline(
        fs.createReadStream(archivePath),
        extractTar({
          cwd: extractRoot,
          strict: true,
          filter: (entryPath, entry) => {
            if (!isSafeSkillArchivePath(entryPath)) {
              unsafeEntry = 'path traversal';
              return false;
            }
            const type = (entry as { type?: string }).type;
            if (type === 'SymbolicLink' || type === 'Link') {
              unsafeEntry = 'symbolic or hard link';
              return false;
            }
            if (type && !['File', 'OldFile', 'Directory', 'GNUDumpDir'].includes(type)) {
              unsafeEntry = `unsupported entry type "${type}"`;
              return false;
            }
            return true;
          },
        }) as NodeJS.WritableStream,
      );
    } catch (cause) {
      return error(
        'INVALID_ARCHIVE',
        `Skill archive extraction failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
    if (unsafeEntry) {
      return error('INVALID_ARCHIVE', `Skill archive contains an unsafe ${unsafeEntry}`);
    }
    try {
      await measureSafeTree(extractRoot, maxBytes);
    } catch (cause) {
      return error(
        'INVALID_ARCHIVE',
        cause instanceof Error ? cause.message : String(cause),
      );
    }

    const skillRoot = await findSkillRoot(
      extractRoot,
      resolved.preferredSkillDirectory,
      resolved.preferredSkillPath,
    );
    if (typeof skillRoot !== 'string') return skillRoot;
    const identity = await readSkillIdentity(skillRoot);
    if ('ok' in identity) return identity;
    if (options.allowInstallIdentity && !await options.allowInstallIdentity(identity)) {
      return error('CONFLICT', `A skill named "${identity.id}" belongs to another workspace member`);
    }

    await mkdir(userSkillsRoot, { recursive: true });
    const installedSkills = await listSkills(userSkillsRoot);
    if (findSkillById(installedSkills, identity.id)) {
      return error('CONFLICT', `A skill named "${identity.id}" is already installed`);
    }
    const destination = path.join(userSkillsRoot, identity.slug);
    if (await lstat(destination).then(() => true).catch(() => false)) {
      return error('CONFLICT', `A skill named "${identity.id}" is already installed`);
    }

    installStageRoot = await mkdtemp(
      path.join(path.dirname(userSkillsRoot), '.od-skill-install-'),
    );
    const stagedSkill = path.join(installStageRoot, 'skill');
    await cp(skillRoot, stagedSkill, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    try {
      await rename(stagedSkill, destination);
    } catch (cause) {
      const code =
        cause && typeof cause === 'object' && 'code' in cause
          ? String((cause as NodeJS.ErrnoException).code)
          : '';
      if (code === 'EEXIST' || code === 'ENOTEMPTY') {
        return error('CONFLICT', `A skill named "${identity.id}" is already installed`);
      }
      throw cause;
    }
    return { ok: true, id: identity.id, dir: destination };
  } catch (cause) {
    return error(
      'INTERNAL_ERROR',
      `Skill install failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
    if (installStageRoot) {
      await rm(installStageRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function canTryNextSkillSourceCandidate(result: SkillRemoteInstallResult): boolean {
  if (result.ok) return false;
  return (
    result.code === 'FETCH_FAILED' && /failed:\s*404(?:\s|$)/i.test(result.error)
  ) || (
    result.code === 'INVALID_MANIFEST'
    && /does not contain SKILL\.md at/i.test(result.error)
  );
}

export async function installSkillFromRemoteSource(
  userSkillsRoot: string,
  rawSource: string,
  options: SkillRemoteInstallOptions = {},
): Promise<SkillRemoteInstallResult> {
  if (typeof rawSource !== 'string' || !rawSource.trim()) {
    return error('BAD_REQUEST', 'skill source is required');
  }
  const resolved = resolveSkillSource(rawSource);
  if ('ok' in resolved) return resolved;

  let result: SkillRemoteInstallResult = error('BAD_REQUEST', 'skill source did not resolve');
  for (let index = 0; index < resolved.candidates.length; index += 1) {
    result = await installSkillSourceCandidate(userSkillsRoot, resolved.candidates[index]!, options);
    if (result.ok || index === resolved.candidates.length - 1) return result;
    if (!canTryNextSkillSourceCandidate(result)) return result;
  }
  return result;
}
