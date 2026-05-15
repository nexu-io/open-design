// Plugin installer. Spec §7.2:
//
//   - `./folder` / `/abs/path`     — local-copy backend (Phase 1).
//   - `github:owner/repo[@ref][/subpath]` — fetched from
//     codeload.github.com as a tar.gz, extracted into a temp dir, then
//     copied into the daemon data-root-derived plugin registry via the local
//     backend.
//   - `https://…tar.gz` / `…tgz`   — same extraction path, no path-rewrite.
//
// Hard install constraints (spec §7.2 / plan §3.A6):
//   - Reject path-traversal segments inside the source folder when copying.
//   - Reject symlinks (we do not stage non-local pointers).
//   - Cap copied tree size at 50 MiB by default.
//   - Refuse to overwrite a different plugin id at the destination.
//   - Tarball extraction inherits the same caps via tar's strict mode.

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { x as tarExtract } from 'tar';
import {
  defaultRegistryRoots,
  deleteInstalledPlugin,
  resolvePluginFolder,
  upsertInstalledPlugin,
  type ResolveOptions,
  type RegistryRoots,
} from './registry.js';
import type {
  InstalledPluginRecord,
  MarketplaceTrust,
  PluginSourceKind,
  TrustTier,
} from '@open-design/contracts';
import type Database from 'better-sqlite3';
import { recordPluginEvent } from './events.js';
import { upsertPluginLockfileEntry } from './lockfile.js';

type SqliteDb = Database.Database;

export interface InstallProgressEvent {
  kind: 'progress';
  phase: 'resolving' | 'copying' | 'parsing' | 'persisting';
  message: string;
}

export interface InstallSuccessEvent {
  kind: 'success';
  plugin: InstalledPluginRecord;
  warnings: string[];
}

export interface InstallErrorEvent {
  kind: 'error';
  message: string;
  warnings: string[];
}

export type InstallEvent = InstallProgressEvent | InstallSuccessEvent | InstallErrorEvent;

export interface InstallOptions {
  source: string;
  // Forwarded from daemon runtime context; defaults to defaultRegistryRoots()
  // so daemon tests can point at a sandboxed data root.
  roots?: RegistryRoots;
  // 50 MiB default mirrors spec §7.2; tests pin a tighter cap.
  maxBytes?: number;
  // When true (the default), an existing install with the same id is
  // replaced. Set false from CLI flows that want to surface a confirm step.
  overwriteExisting?: boolean;
  // Pluggable network fetcher for tests. Production injects globalThis.fetch.
  // The contract: returns a ReadableStream of the gzipped tar bytes.
  fetcher?: ArchiveFetcher;
  // Plan §3.JJ1 — emit 'plugin.installed' (default) or
  // 'plugin.upgraded' from the producer hook. The upgrade route
  // sets this to 'upgraded' so consumers can distinguish the two
  // operations in the live event stream.
  eventKind?: 'installed' | 'upgraded';
  sourceMarketplaceId?: string;
  sourceMarketplaceEntryName?: string;
  sourceMarketplaceEntryVersion?: string;
  marketplaceTrust?: MarketplaceTrust;
  resolvedSource?: string;
  resolvedRef?: string;
  manifestDigest?: string;
  archiveIntegrity?: string;
  // Optional runtime-data lockfile path. Daemon routes pass
  // `<OD_DATA_DIR>/od-plugin-lock.json`; tests can point at temp dirs.
  lockfilePath?: string;
}

export type ArchiveFetcher = (url: string) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  body: Readable | null;
}>;

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

const SAFE_BASENAME = /^[a-z0-9][a-z0-9._-]*$/;
const GITHUB_SOURCE_RE = /^github:([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)(.*)$/;
const HTTPS_SOURCE_RE = /^https:\/\//i;
const GITHUB_REF_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

interface GithubArchiveCandidate {
  ref: string;
  subpath?: string;
}

interface ParsedGithubSource {
  owner: string;
  repo: string;
  candidates: GithubArchiveCandidate[];
}

interface GithubContentsEntry {
  type?: string;
  name?: string;
  path?: string;
  download_url?: string | null;
}

interface GithubContentsBudget {
  bytes: number;
  hash: ReturnType<typeof createHash>;
  maxBytes: number;
}

// Top-level dispatcher. Picks the backend off the source string and yields
// the same InstallEvent stream regardless of where the bytes came from.
export async function* installPlugin(
  db: SqliteDb,
  opts: InstallOptions,
): AsyncGenerator<InstallEvent, void, void> {
  if (opts.source.startsWith('github:')) {
    yield* installFromGithub(db, opts);
    return;
  }
  if (HTTPS_SOURCE_RE.test(opts.source)) {
    yield* installFromHttpsArchive(db, opts);
    return;
  }
  yield* installFromLocalFolder(db, opts);
}

// `github:owner/repo[@ref][/subpath]` → codeload tarball.
async function* installFromGithub(
  db: SqliteDb,
  opts: InstallOptions,
): AsyncGenerator<InstallEvent, void, void> {
  const parsed = parseGithubSource(opts.source);
  if (!parsed) {
    yield {
      kind: 'error',
      message: `Malformed github source ${opts.source}; expected github:owner/repo[@ref][/subpath]`,
      warnings: [],
    };
    return;
  }

  let lastError: string | undefined;
  const triedUrls: string[] = [];
  for (const candidate of parsed.candidates) {
    if (candidate.subpath) {
      const contentsUrl = githubContentsUrl(parsed.owner, parsed.repo, candidate.subpath, candidate.ref);
      triedUrls.push(contentsUrl);
      const buffered: InstallEvent[] = [];
      for await (const ev of installFromGithubContents(db, opts, parsed, candidate, contentsUrl)) {
        buffered.push(ev);
        if (ev.kind === 'error') {
          lastError = ev.message;
          break;
        }
        if (ev.kind === 'success') {
          for (const bufferedEvent of buffered) yield bufferedEvent;
          return;
        }
      }
      if (lastError && isRetryableGithubCandidateError(lastError)) continue;
      if (lastError) break;
    }

    const tarballUrl = githubTarballUrl(parsed.owner, parsed.repo, candidate.ref);
    triedUrls.push(tarballUrl);
    const buffered: InstallEvent[] = [];
    for await (const ev of installFromArchiveUrl(db, opts, tarballUrl, candidate.subpath)) {
      buffered.push(ev);
      if (ev.kind === 'error') {
        lastError = ev.message;
        break;
      }
      if (ev.kind === 'success') {
        for (const bufferedEvent of buffered) yield bufferedEvent;
        return;
      }
    }
    if (!lastError || !isRetryableGithubCandidateError(lastError)) break;
  }

  yield {
    kind: 'error',
    message: lastError
      ? `${lastError}. Tried GitHub archive URL(s): ${triedUrls.join(', ')}`
      : `GitHub source ${opts.source} did not produce an installable archive`,
    warnings: [],
  };
}

function parseGithubSource(source: string): ParsedGithubSource | null {
  const match = GITHUB_SOURCE_RE.exec(source);
  if (!match) return null;
  const [, owner, repo, rest = ''] = match;
  if (!owner || !repo) return null;

  if (rest.length === 0) {
    return { owner, repo, candidates: [{ ref: 'HEAD' }] };
  }

  if (rest.startsWith('/')) {
    const subpath = sanitizeRelativePath(rest.slice(1));
    return subpath ? { owner, repo, candidates: [{ ref: 'HEAD', subpath }] } : null;
  }

  if (!rest.startsWith('@')) return null;
  const refAndMaybeSubpath = rest.slice(1);
  const parts = refAndMaybeSubpath.split('/');
  if (parts.length === 0 || parts.some((part) => !GITHUB_REF_SEGMENT_RE.test(part))) {
    return null;
  }

  const candidates: GithubArchiveCandidate[] = [];
  const seen = new Set<string>();
  for (let refPartCount = 1; refPartCount <= parts.length; refPartCount += 1) {
    const ref = parts.slice(0, refPartCount).join('/');
    const subpathParts = parts.slice(refPartCount);
    const subpath = subpathParts.length > 0
      ? sanitizeRelativePath(subpathParts.join('/'))
      : undefined;
    const key = `${ref}\0${subpath ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push({ ref, ...(subpath ? { subpath } : {}) });
    }
  }
  return candidates.length > 0 ? { owner, repo, candidates } : null;
}

function githubTarballUrl(owner: string, repo: string, ref: string): string {
  const encodedRef = ref.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `https://codeload.github.com/${owner}/${repo}/tar.gz/${encodedRef}`;
}

function githubContentsUrl(owner: string, repo: string, subpath: string, ref: string): string {
  const encodedPath = sanitizeRelativePath(subpath)
    .split(path.sep)
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
}

function isRetryableGithubCandidateError(message: string): boolean {
  return /^Fetch failed: 404\b/.test(message) || /^Subpath .+ not found inside archive$/.test(message);
}

async function* installFromGithubContents(
  db: SqliteDb,
  opts: InstallOptions,
  parsed: ParsedGithubSource,
  candidate: GithubArchiveCandidate,
  contentsUrl: string,
): AsyncGenerator<InstallEvent, void, void> {
  if (!candidate.subpath) return;
  const fetcher = opts.fetcher ?? defaultFetcher;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-plugin-github-contents-'));
  const stagingFolder = path.join(tmpRoot, 'plugin');
  try {
    yield {
      kind: 'progress',
      phase: 'resolving',
      message: `Fetching GitHub contents ${contentsUrl}`,
    };
    await fsp.mkdir(stagingFolder, { recursive: true });
    const budget: GithubContentsBudget = {
      bytes: 0,
      hash: createHash('sha256'),
      maxBytes,
    };
    try {
      await copyGithubContentsPath(
        fetcher,
        parsed.owner,
        parsed.repo,
        candidate.ref,
        candidate.subpath,
        stagingFolder,
        budget,
      );
    } catch (err) {
      yield {
        kind: 'error',
        message: (err as Error).message,
        warnings: [],
      };
      return;
    }

    yield* installFromLocalFolder(db, {
      ...opts,
      archiveIntegrity: opts.archiveIntegrity ?? `sha256:${budget.hash.digest('hex')}`,
      source: opts.source,
      _stagedFolder: stagingFolder,
      _stagedSourceKind: 'github',
    } as InstallOptions & { _stagedFolder?: string; _stagedSourceKind?: PluginSourceKind });
  } finally {
    await fsp.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function copyGithubContentsPath(
  fetcher: ArchiveFetcher,
  owner: string,
  repo: string,
  ref: string,
  githubPath: string,
  destPath: string,
  budget: GithubContentsBudget,
): Promise<void> {
  const contentsUrl = githubContentsUrl(owner, repo, githubPath, ref);
  const payload = await fetchGithubJson(fetcher, contentsUrl);
  const entries = Array.isArray(payload) ? payload : [payload];
  if (entries.length === 0) {
    throw new Error(`Subpath ${githubPath} not found inside repository`);
  }
  for (const entry of entries) {
    const name = safeGithubEntryName(entry.name);
    const childDest = Array.isArray(payload) ? path.join(destPath, name) : destPath;
    if (entry.type === 'dir') {
      const childPath = entry.path ?? path.posix.join(githubPath, name);
      await fsp.mkdir(childDest, { recursive: true });
      await copyGithubContentsPath(fetcher, owner, repo, ref, childPath, childDest, budget);
      continue;
    }
    if (entry.type === 'file') {
      if (!entry.download_url) {
        throw new Error(`GitHub file ${entry.path ?? name} does not expose a download URL`);
      }
      await fsp.mkdir(path.dirname(childDest), { recursive: true });
      await copyGithubFile(fetcher, entry.download_url, childDest, budget);
      continue;
    }
    throw new Error(`GitHub entry ${entry.path ?? name} has unsupported type ${entry.type ?? 'unknown'}`);
  }
}

async function fetchGithubJson(fetcher: ArchiveFetcher, url: string): Promise<GithubContentsEntry[] | GithubContentsEntry> {
  const resp = await fetcher(url);
  if (!resp.ok || !resp.body) {
    throw new Error(`Fetch failed: ${resp.status} ${resp.statusText} for ${url}`);
  }
  const text = await readStreamText(resp.body, 1024 * 1024);
  try {
    return JSON.parse(text) as GithubContentsEntry[] | GithubContentsEntry;
  } catch (err) {
    throw new Error(`GitHub contents response was not valid JSON for ${url}: ${(err as Error).message}`);
  }
}

async function copyGithubFile(
  fetcher: ArchiveFetcher,
  url: string,
  destPath: string,
  budget: GithubContentsBudget,
): Promise<void> {
  const resp = await fetcher(url);
  if (!resp.ok || !resp.body) {
    throw new Error(`Fetch failed: ${resp.status} ${resp.statusText} for ${url}`);
  }
  const digestStream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      budget.bytes += chunk.length;
      if (budget.bytes > budget.maxBytes) {
        callback(new Error(`Downloaded GitHub contents exceed ${budget.maxBytes} bytes`));
        return;
      }
      budget.hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(resp.body as NodeJS.ReadableStream, digestStream, fs.createWriteStream(destPath));
}

async function readStreamText(body: Readable, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of body) {
    const buf = Buffer.from(chunk as Buffer);
    bytes += buf.length;
    if (bytes > maxBytes) {
      throw new Error(`Response body exceeds ${maxBytes} bytes`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function safeGithubEntryName(name: string | undefined): string {
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new Error(`Unsafe GitHub contents entry name: ${name ?? '(missing)'}`);
  }
  return name;
}

// Plain `https://…tar.gz` / `https://…tgz` source.
async function* installFromHttpsArchive(
  db: SqliteDb,
  opts: InstallOptions,
): AsyncGenerator<InstallEvent, void, void> {
  if (!/\.t(?:ar\.)?gz$/i.test(opts.source)) {
    yield {
      kind: 'error',
      message: `Only .tar.gz / .tgz archives are accepted from https sources (got ${opts.source})`,
      warnings: [],
    };
    return;
  }
  yield {
    kind: 'progress',
    phase: 'resolving',
    message: `Fetching ${opts.source}`,
  };
  yield* installFromArchiveUrl(db, opts, opts.source, undefined);
}

async function* installFromArchiveUrl(
  db: SqliteDb,
  opts: InstallOptions,
  url: string,
  subpath: string | undefined,
): AsyncGenerator<InstallEvent, void, void> {
  const fetcher = opts.fetcher ?? defaultFetcher;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-plugin-archive-'));
  try {
    const resp = await fetcher(url);
    if (!resp.ok || !resp.body) {
      yield {
        kind: 'error',
        message: `Fetch failed: ${resp.status} ${resp.statusText} for ${url}`,
        warnings: [],
      };
      return;
    }
    const archivePath = path.join(tmpRoot, 'archive.tgz');
    let computedIntegrity: string;
    try {
      computedIntegrity = await writeArchiveAndDigest(resp.body, archivePath, maxBytes);
    } catch (err) {
      yield {
        kind: 'error',
        message: `Archive download failed: ${(err as Error).message}`,
        warnings: [],
      };
      return;
    }
    if (opts.archiveIntegrity && !integrityMatches(opts.archiveIntegrity, computedIntegrity)) {
      yield {
        kind: 'error',
        message: `Archive integrity mismatch: expected ${opts.archiveIntegrity}, got ${computedIntegrity}`,
        warnings: [],
      };
      return;
    }
    yield { kind: 'progress', phase: 'copying', message: 'Extracting archive' };
    let symlinkSeen = false;
    let traversalSeen = false;
    try {
      // The tar package handles gzip decompression. We pass `strip: 1`
      // because codeload tarballs always wrap the repo in a single
      // `repo-<sha>/` folder, and we want the manifest to land at
      // tmpRoot/<files>. The filter rejects symlinks / hard links and
      // any path-traversal segment; we then surface those as a clean
      // install error instead of silently skipping unsafe entries.
      await pipeline(
        fs.createReadStream(archivePath),
        tarExtract({
          cwd: tmpRoot,
          strip: 1,
          filter: (filePath, entry) => {
            const entryType = (entry as { type?: string }).type;
            if (entryType === 'SymbolicLink' || entryType === 'Link') {
              symlinkSeen = true;
              return false;
            }
            if (filePath.includes('..')) {
              traversalSeen = true;
              return false;
            }
            return true;
          },
        }) as NodeJS.WritableStream,
      );
    } catch (err) {
      yield {
        kind: 'error',
        message: `Archive extraction failed: ${(err as Error).message}`,
        warnings: [],
      };
      return;
    }
    if (symlinkSeen) {
      yield {
        kind: 'error',
        message: 'Archive contains symbolic / hard links — refusing to stage non-local pointers',
        warnings: [],
      };
      return;
    }
    if (traversalSeen) {
      yield {
        kind: 'error',
        message: 'Archive contains path-traversal segments — refusing to stage',
        warnings: [],
      };
      return;
    }
    // Pre-flight size check inside the staging dir.
    const total = await measureTreeSize(tmpRoot);
    if (total > maxBytes) {
      yield {
        kind: 'error',
        message: `Extracted archive exceeds ${maxBytes} bytes (size=${total})`,
        warnings: [],
      };
      return;
    }
    const stagingFolder = subpath
      ? path.join(tmpRoot, sanitizeRelativePath(subpath))
      : tmpRoot;
    if (!fs.existsSync(stagingFolder)) {
      yield {
        kind: 'error',
        message: `Subpath ${subpath} not found inside archive`,
        warnings: [],
      };
      return;
    }
    // Hand off to the local-folder backend so the registry write is the
    // single canonical implementation. The `source` string is the
    // original (github:… or https://…) so installed_plugins records
    // provenance accurately.
    yield* installFromLocalFolder(db, {
      ...opts,
      archiveIntegrity: opts.archiveIntegrity ?? computedIntegrity,
      source: opts.source,
      // Drive the local backend through the staged folder; the
      // override on `_stagedFolder` is internal and lets us re-use the
      // copy / re-parse / persist phases without forking the function.
      _stagedFolder: stagingFolder,
      _stagedSourceKind: opts.source.startsWith('github:') ? 'github' : 'url',
    } as InstallOptions & { _stagedFolder?: string; _stagedSourceKind?: PluginSourceKind });
  } finally {
    await fsp.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function defaultFetcher(url: string): ReturnType<ArchiveFetcher> {
  const response = await fetch(url, { redirect: 'follow' });
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: response.body ? Readable.fromWeb(response.body as never) : null,
  };
}

async function writeArchiveAndDigest(
  body: Readable,
  archivePath: string,
  maxBytes: number,
): Promise<string> {
  const hash = createHash('sha256');
  let bytes = 0;
  const digestStream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        callback(new Error(`Downloaded archive exceeds ${maxBytes} bytes`));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(body as NodeJS.ReadableStream, digestStream, fs.createWriteStream(archivePath));
  return `sha256:${hash.digest('hex')}`;
}

function integrityMatches(expected: string, computed: string): boolean {
  const normalizedExpected = expected.trim();
  const normalizedComputed = computed.trim();
  if (normalizedExpected === normalizedComputed) return true;
  if (normalizedExpected.startsWith('sha256-')) {
    const hex = normalizedComputed.replace(/^sha256:/, '');
    const base64 = Buffer.from(hex, 'hex').toString('base64');
    return normalizedExpected === `sha256-${base64}`;
  }
  return false;
}

async function measureTreeSize(root: string): Promise<number> {
  let total = 0;
  const queue: string[] = [root];
  while (queue.length > 0) {
    const next = queue.pop()!;
    const stat = await fsp.lstat(next);
    if (stat.isDirectory()) {
      const entries = await fsp.readdir(next);
      for (const entry of entries) queue.push(path.join(next, entry));
    } else if (stat.isFile()) {
      total += stat.size;
    }
  }
  return total;
}

function sanitizeRelativePath(input: string): string {
  return input
    .replace(/^[\\/]+/, '')
    .split(/[\\/]+/)
    .filter((seg) => seg !== '..' && seg !== '.' && seg !== '')
    .join(path.sep);
}

export async function* installFromLocalFolder(
  db: SqliteDb,
  opts: InstallOptions & { _stagedFolder?: string; _stagedSourceKind?: PluginSourceKind },
): AsyncGenerator<InstallEvent, void, void> {
  const warnings: string[] = [];
  const roots = opts.roots ?? defaultRegistryRoots();
  // When called from the archive backend, the bytes are already on disk
  // under `_stagedFolder`; the public `source` field still records
  // provenance (github:owner/repo, https://example.com/foo.tgz, etc.).
  const sourceFolder = opts._stagedFolder ?? path.resolve(opts.source);
  const recordedSource = opts.source;
  const recordedSourceKind: PluginSourceKind = opts._stagedSourceKind ?? 'local';
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  yield { kind: 'progress', phase: 'resolving', message: `Resolving ${sourceFolder}` };

  let stats: fs.Stats;
  try {
    stats = await fsp.stat(sourceFolder);
  } catch (err) {
    yield { kind: 'error', message: `Source folder not found: ${sourceFolder} (${(err as Error).message})`, warnings };
    return;
  }
  if (!stats.isDirectory()) {
    yield { kind: 'error', message: `Source path is not a directory: ${sourceFolder}`, warnings };
    return;
  }

  // Probe the source manifest first so the destination folder name is
  // chosen by manifest id, not by directory name. This keeps registry
  // ids deterministic when authors rename the folder on disk between
  // installs.
  yield { kind: 'progress', phase: 'parsing', message: 'Parsing manifest' };
  const tentativeId = path.basename(sourceFolder).toLowerCase();
  const probeOptions = buildResolveOptions({
    folder: sourceFolder,
    folderId: SAFE_BASENAME.test(tentativeId) ? tentativeId : 'plugin',
    sourceKind: recordedSourceKind,
    source: recordedSource,
  }, opts);
  const probe = await resolvePluginFolder(probeOptions);
  if (!probe.ok) {
    yield { kind: 'error', message: probe.errors.join('; '), warnings: probe.warnings };
    return;
  }
  warnings.push(...probe.warnings);
  const pluginId = probe.record.id;
  if (!SAFE_BASENAME.test(pluginId)) {
    yield { kind: 'error', message: `Plugin id '${pluginId}' is not a safe folder name`, warnings };
    return;
  }
  const destFolder = path.join(roots.userPluginsRoot, pluginId);

  // Block overwriting a foreign plugin id. The destination folder may
  // contain a previous version of the same id, in which case we replace it.
  if (fs.existsSync(destFolder) && (opts.overwriteExisting ?? true) === false) {
    yield { kind: 'error', message: `Destination folder already exists: ${destFolder}. Pass overwriteExisting=true to replace.`, warnings };
    return;
  }

  yield { kind: 'progress', phase: 'copying', message: `Copying to ${destFolder}` };
  await fsp.mkdir(roots.userPluginsRoot, { recursive: true });
  if (fs.existsSync(destFolder)) {
    await fsp.rm(destFolder, { recursive: true, force: true });
  }
  try {
    await safeCopyTree(sourceFolder, destFolder, maxBytes);
  } catch (err) {
    yield { kind: 'error', message: `Copy failed: ${(err as Error).message}`, warnings };
    await fsp.rm(destFolder, { recursive: true, force: true }).catch(() => undefined);
    return;
  }

  yield { kind: 'progress', phase: 'parsing', message: 'Re-parsing destination' };
  const parsedOptions = buildResolveOptions({
    folder: destFolder,
    folderId: pluginId,
    sourceKind: recordedSourceKind,
    source: recordedSource,
  }, opts);
  const parsed = await resolvePluginFolder(parsedOptions);
  if (!parsed.ok) {
    await fsp.rm(destFolder, { recursive: true, force: true }).catch(() => undefined);
    yield { kind: 'error', message: parsed.errors.join('; '), warnings: [...warnings, ...parsed.warnings] };
    return;
  }
  warnings.push(...parsed.warnings);

  yield { kind: 'progress', phase: 'persisting', message: 'Writing installed_plugins row' };
  upsertInstalledPlugin(db, parsed.record);
  if (opts.lockfilePath) {
    await upsertPluginLockfileEntry(opts.lockfilePath, parsed.record);
  }

  // Plan §3.II1 / §3.JJ1 — emit 'plugin.installed' OR
  // 'plugin.upgraded' (per opts.eventKind) so ops dashboards +
  // `od plugin events tail` see the operation land in the in-
  // memory ring buffer. Best-effort; recordPluginEvent never
  // throws.
  recordPluginEvent({
    kind:     opts.eventKind === 'upgraded' ? 'plugin.upgraded' : 'plugin.installed',
    pluginId: parsed.record.id,
    details:  {
      version:    parsed.record.version,
      sourceKind: parsed.record.sourceKind,
      source:     parsed.record.source,
      sourceMarketplaceId: parsed.record.sourceMarketplaceId,
      sourceMarketplaceEntryName: parsed.record.sourceMarketplaceEntryName,
      sourceMarketplaceEntryVersion: parsed.record.sourceMarketplaceEntryVersion,
      marketplaceTrust: parsed.record.marketplaceTrust,
      trust:      parsed.record.trust,
      warnings:   warnings.length,
    },
  });

  yield { kind: 'success', plugin: parsed.record, warnings };
}

export interface UninstallResult {
  ok: boolean;
  removedFolder?: string;
  warning?: string;
}

export async function uninstallPlugin(
  db: SqliteDb,
  id: string,
  roots: RegistryRoots = defaultRegistryRoots(),
): Promise<UninstallResult> {
  const removed = deleteInstalledPlugin(db, id);
  const folder = path.join(roots.userPluginsRoot, id);
  let removedFolder: string | undefined;
  try {
    await fsp.rm(folder, { recursive: true, force: true });
    if (fs.existsSync(folder)) {
      // Some platforms refuse to remove read-only files; surface a hint
      // instead of silently leaving stale on-disk state.
      return { ok: removed, warning: `Folder ${folder} could not be removed` };
    }
    removedFolder = folder;
  } catch (err) {
    return { ok: removed, warning: `Folder ${folder} removal failed: ${(err as Error).message}` };
  }
  // Plan §3.II1 — emit a 'plugin.uninstalled' event when the
  // registry row was actually removed. We skip the event when
  // both removed=false AND folder didn't exist (no-op uninstall).
  if (removed || removedFolder !== undefined) {
    recordPluginEvent({
      kind:     'plugin.uninstalled',
      pluginId: id,
      details:  removedFolder ? { removedFolder } : {},
    });
  }
  return { ok: removed || removedFolder !== undefined, removedFolder };
}

// Recursive copy with budget tracking. Symlinks anywhere in the tree fail
// the copy outright; we never reach upstream paths through a clever link.
async function safeCopyTree(src: string, dest: string, maxBytes: number): Promise<void> {
  let bytesCopied = 0;
  const queue: Array<{ src: string; dest: string }> = [{ src, dest }];
  while (queue.length > 0) {
    const { src: from, dest: to } = queue.pop()!;
    const stat = await fsp.lstat(from);
    if (stat.isSymbolicLink()) {
      throw new Error(`Symbolic link rejected: ${from}`);
    }
    if (stat.isDirectory()) {
      await fsp.mkdir(to, { recursive: true });
      const entries = await fsp.readdir(from, { withFileTypes: true });
      for (const entry of entries) {
        if (!isSafeBasename(entry.name)) {
          throw new Error(`Unsafe path segment: ${entry.name}`);
        }
        queue.push({ src: path.join(from, entry.name), dest: path.join(to, entry.name) });
      }
      continue;
    }
    if (stat.isFile()) {
      bytesCopied += stat.size;
      if (bytesCopied > maxBytes) {
        throw new Error(`Plugin tree exceeds size cap of ${maxBytes} bytes`);
      }
      await fsp.copyFile(from, to);
      continue;
    }
    // Sockets / fifos / devices — refuse.
    throw new Error(`Unsupported file type at ${from}`);
  }
}

function isSafeBasename(name: string): boolean {
  if (name === '.' || name === '..') return false;
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) return false;
  return true;
}

function buildResolveOptions(
  base: Pick<ResolveOptions, 'folder' | 'folderId' | 'sourceKind' | 'source'>,
  opts: InstallOptions,
): ResolveOptions {
  const resolveOptions: ResolveOptions = { ...base };
  if (opts.sourceMarketplaceId) resolveOptions.sourceMarketplaceId = opts.sourceMarketplaceId;
  if (opts.sourceMarketplaceEntryName) resolveOptions.sourceMarketplaceEntryName = opts.sourceMarketplaceEntryName;
  if (opts.sourceMarketplaceEntryVersion) resolveOptions.sourceMarketplaceEntryVersion = opts.sourceMarketplaceEntryVersion;
  if (opts.marketplaceTrust) {
    resolveOptions.marketplaceTrust = opts.marketplaceTrust;
    resolveOptions.trust = installedTrustFromMarketplace(opts.marketplaceTrust);
  }
  if (opts.resolvedSource) resolveOptions.resolvedSource = opts.resolvedSource;
  if (opts.resolvedRef) resolveOptions.resolvedRef = opts.resolvedRef;
  if (opts.manifestDigest) resolveOptions.manifestDigest = opts.manifestDigest;
  if (opts.archiveIntegrity) resolveOptions.archiveIntegrity = opts.archiveIntegrity;
  return resolveOptions;
}

function installedTrustFromMarketplace(trust: MarketplaceTrust): TrustTier {
  return trust === 'restricted' ? 'restricted' : 'trusted';
}

export type { PluginSourceKind };
