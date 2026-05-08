// @ts-nocheck
// Project files registry. Each project is a folder under
// <projectRoot>/.od/projects/<projectId>/. The frontend's project list
// (localStorage) carries metadata; this module is the single owner of the
// on-disk content (HTML artifacts, sketches, uploaded images, pasted text).
//
// All paths flowing in from HTTP handlers are validated against the project
// directory to prevent path traversal — see resolveSafe().

import { lstat, mkdir, readdir, readFile, realpath, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import {
  inferLegacyManifest,
  parsePersistedManifest,
  validateArtifactManifestInput,
} from './artifact-manifest.js';

const FORBIDDEN_SEGMENT = /^$|^\.\.?$/;
const RESERVED_PROJECT_FILE_SEGMENTS = new Set(['.live-artifacts']);

export function projectDir(projectsRoot, projectId) {
  if (!isSafeId(projectId)) throw new Error('invalid project id');
  return path.join(projectsRoot, projectId);
}

// Returns the folder a project's files live in. For git-linked projects
// (metadata.baseDir set), this is the user's own folder. Otherwise falls
// back to the standard computed path under projectsRoot.
export function resolveProjectDir(projectsRoot, projectId, metadata?) {
  if (typeof metadata?.baseDir === 'string') {
    const p = path.normalize(metadata.baseDir);
    if (path.isAbsolute(p)) return p;
  }
  if (!isSafeId(projectId)) throw new Error('invalid project id');
  return path.join(projectsRoot, projectId);
}

export async function ensureProject(projectsRoot, projectId, metadata?) {
  const dir = resolveProjectDir(projectsRoot, projectId, metadata);
  // Git-linked folders already exist; skip mkdir to avoid side-effects.
  if (typeof metadata?.baseDir !== 'string') {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

export async function listFiles(projectsRoot, projectId, opts = {}) {
  const metadata = opts?.metadata;
  const dir = resolveProjectDir(projectsRoot, projectId, metadata);
  const out = [];
  // Skip build/install dirs for linked folders so node_modules doesn't stall
  // the walk on large repos.
  const skipDirs = metadata?.baseDir ? SKIP_DIRS : undefined;
  await collectFiles(dir, '', out, skipDirs);
  // Newest first — matches the visual order users expect after generating.
  out.sort((a, b) => b.mtime - a.mtime);
  const since = Number(opts.since);
  if (Number.isFinite(since) && since > 0) {
    return out.filter((f) => Number(f.mtime) > since);
  }
  return out;
}

// Build/install dirs that should be hidden from the file panel when a
// project is rooted at metadata.baseDir (the user's own folder). Without
// this, the listing would be dominated by node_modules, lockfiles, and
// build output that have no design value.
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.turbo',
  '.cache', '.output', 'out', 'coverage', '__pycache__', '.venv',
  'vendor', 'target', '.od', '.tmp',
]);

// Best-effort entry-file detector — looks for index.html at the root,
// then any *.html file. Returns null if nothing obvious is found, in
// which case the project simply opens to the file panel with no
// auto-selected tab.
export async function detectEntryFile(dir: string): Promise<string | null> {
  try {
    await stat(path.join(dir, 'index.html'));
    return 'index.html';
  } catch { /* not found */ }
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const htmlFile = entries.find((e) => e.isFile() && /\.html?$/i.test(e.name));
    if (htmlFile) return htmlFile.name;
  } catch { /* ignore */ }
  return null;
}

async function collectFiles(dir, relDir, out, skipDirs?: Set<string>) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw err;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const rel = relDir ? `${relDir}/${e.name}` : e.name;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (skipDirs && skipDirs.has(e.name)) continue;
      await collectFiles(full, rel, out, skipDirs);
      continue;
    }
    if (!e.isFile()) continue;
    if (e.name.endsWith('.artifact.json')) continue;
    const st = await stat(full);
    const manifest = await readManifestForPath(dir, rel);
    out.push({
      name: rel,
      path: rel,
      type: 'file',
      size: st.size,
      mtime: st.mtimeMs,
      kind: kindFor(rel),
      mime: mimeFor(rel),
      artifactKind: manifest?.kind,
      artifactManifest: manifest,
    });
  }
}

// Build a ZIP of every file under the project directory (or under `root`,
// if it points at a subdirectory). Mirrors listFiles' filtering — dotfiles
// and `.artifact.json` sidecars are excluded — so the archive matches what
// the user sees in the file panel. Used by the "Download as .zip" share
// menu item, which exports the user's actual project tree (e.g. the
// uploaded `ui-design/` folder), not just the rendered HTML.
export async function buildProjectArchive(projectsRoot, projectId, root, metadata?) {
  const projectRoot = resolveProjectDir(projectsRoot, projectId, metadata);
  let archiveRoot = projectRoot;
  let archiveBaseName = '';
  if (typeof root === 'string' && root.trim().length > 0) {
    // Use the symlink-aware resolver so that an imported folder containing
    // e.g. `docs -> /Users/me/.ssh` cannot exfiltrate via
    // GET /api/projects/:id/archive?root=docs. resolveSafe()'s string
    // prefix check would let the literal path stay under projectRoot, then
    // collectArchiveEntries() / readFile() would follow the symlink at
    // open() time and zip files outside the project tree.
    archiveRoot = await resolveSafeReal(projectRoot, root);
    archiveBaseName = path.basename(archiveRoot);
  }

  // Stat the archive root up-front so a missing/non-directory target gives a
  // clear ENOENT/ENOTDIR error. Without this the recursive walk swallows
  // ENOENT and we'd report the directory as "empty" instead — confusing if
  // the project (or a subdir) was deleted concurrently with the download.
  let rootStat;
  try {
    rootStat = await stat(archiveRoot);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      const e = new Error('archive root does not exist');
      e.code = 'ENOENT';
      throw e;
    }
    throw err;
  }
  if (!rootStat.isDirectory()) {
    const err = new Error('archive root is not a directory');
    err.code = 'ENOTDIR';
    throw err;
  }

  const entries = [];
  await collectArchiveEntries(archiveRoot, '', entries);
  if (entries.length === 0) {
    const err = new Error('archive root is empty');
    err.code = 'ENOENT';
    throw err;
  }

  const zip = new JSZip();
  for (const entry of entries) {
    const buf = await readFile(entry.fullPath);
    zip.file(entry.relPath, buf, {
      date: new Date(entry.mtime),
      binary: true,
    });
  }
  // Level 6 is the zlib default — balances speed and ratio for typical
  // project trees (HTML/CSS/JS plus a handful of assets). Level 9 buys
  // <5% on already-compressed PNGs/fonts at 2-3× CPU; level 1 produces
  // noticeably larger archives. Revisit only if profiling says so.
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { buffer, baseName: archiveBaseName };
}

export async function buildBatchArchive(projectsRoot, projectId, fileNames, metadata?) {
  const projectRoot = resolveProjectDir(projectsRoot, projectId, metadata);
  const zip = new JSZip();
  let packed = 0;
  const rejected = [];

  for (const name of fileNames) {
    let filePath;
    try {
      filePath = resolveSafe(projectRoot, name);
    } catch (err) {
      rejected.push({ name, reason: `invalid path: ${err?.message || err}` });
      continue;
    }

    // Mirror the visible-file allowlist from collectFiles/collectArchiveEntries:
    // reject any hidden segment, .artifact.json sidecars, and symlinks at any
    // level of the path (not just the final basename).
    const relSegments = path.relative(projectRoot, filePath).split(path.sep);
    let hidden = false;
    for (const seg of relSegments) {
      if (seg.startsWith('.')) {
        hidden = true;
        break;
      }
    }
    if (hidden) {
      rejected.push({ name, reason: 'hidden segments are not eligible for archive' });
      continue;
    }
    if (path.basename(filePath).endsWith('.artifact.json')) {
      rejected.push({ name, reason: 'artifact sidecars are not eligible for archive' });
      continue;
    }

    // Walk each path segment from projectRoot to the target with lstat,
    // rejecting intermediate symlinks that could escape the project tree.
    let walk = projectRoot;
    let symlinkFound = false;
    for (const seg of relSegments) {
      walk = path.join(walk, seg);
      let segStat;
      try {
        segStat = await lstat(walk);
      } catch (err) {
        if (err && err.code === 'ENOENT') {
          rejected.push({ name, reason: `segment not found: ${seg}` });
          break;
        }
        throw err;
      }
      if (segStat.isSymbolicLink()) {
        symlinkFound = true;
        break;
      }
    }
    if (symlinkFound) {
      rejected.push({ name, reason: 'symlinks are not eligible for archive' });
      continue;
    }
    if (rejected.length > 0 && rejected[rejected.length - 1].name === name) continue;

    // Final stat on the resolved path (guards against TOCTOU between segment
    // walk and read, and catches non-regular files).
    let st;
    try {
      st = await lstat(filePath);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        rejected.push({ name, reason: 'file not found' });
        continue;
      }
      throw err;
    }

    if (st.isSymbolicLink()) {
      rejected.push({ name, reason: 'symlinks are not eligible for archive' });
      continue;
    }
    if (!st.isFile()) {
      rejected.push({ name, reason: 'not a regular file' });
      continue;
    }

    const buf = await readFile(filePath);
    zip.file(name, buf, {
      date: new Date(st.mtimeMs),
      binary: true,
    });
    packed += 1;
  }

  // Fail-fast: any rejected entry means the request is invalid — mirror the
  // strict rejection semantics of the panel and full archive.
  if (rejected.length > 0) {
    const err = new Error(
      `${rejected.length} file(s) ineligible for archive: ${rejected.map((r) => r.name).join(', ')}`,
    );
    err.code = 'BAD_REQUEST';
    err.rejected = rejected;
    throw err;
  }

  if (packed === 0) {
    const err = new Error('no files could be packed');
    err.code = 'ENOENT';
    throw err;
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { buffer, baseName: '' };
}

async function collectArchiveEntries(dir, relDir, out) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw err;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (!e.isDirectory() && !e.isFile()) continue;
    const rel = relDir ? `${relDir}/${e.name}` : e.name;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await collectArchiveEntries(full, rel, out);
      continue;
    }
    if (e.name.endsWith('.artifact.json')) continue;
    const st = await stat(full);
    out.push({ relPath: rel, fullPath: full, mtime: st.mtimeMs });
  }
}

export async function readProjectFile(projectsRoot, projectId, name, metadata?) {
  const dir = resolveProjectDir(projectsRoot, projectId, metadata);
  const file = await resolveSafeReal(dir, name);
  const buf = await readFile(file);
  const st = await stat(file);
  const rel = toProjectPath(path.relative(dir, file));
  const manifest = await readManifestForPath(dir, rel);
  return {
    buffer: buf,
    name: rel,
    path: rel,
    size: st.size,
    mtime: st.mtimeMs,
    mime: mimeFor(rel),
    kind: kindFor(rel),
    artifactKind: manifest?.kind,
    artifactManifest: manifest,
  };
}

export async function writeProjectFile(
  projectsRoot,
  projectId,
  name,
  body,
  { overwrite = true, artifactManifest = null } = {},
  metadata?,
) {
  const dir = await ensureProject(projectsRoot, projectId, metadata);
  const safeName = sanitizePath(name);
  const target = await resolveSafeReal(dir, safeName);
  if (!overwrite) {
    try {
      await stat(target);
      throw new Error('file already exists');
    } catch (err) {
      if (!err || err.code !== 'ENOENT') throw err;
    }
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
  if (artifactManifest && typeof artifactManifest === 'object') {
    const manifestFileName = artifactManifestNameFor(safeName);
    const manifestTarget = await resolveSafeReal(dir, manifestFileName);
    const validated = validateArtifactManifestInput(artifactManifest, safeName);
    if (validated.ok && validated.value) {
      const nextManifest = validated.value;
      await writeFile(manifestTarget, JSON.stringify(nextManifest, null, 2));
    }
  }
  const st = await stat(target);
  const persistedManifest = await readManifestForPath(dir, safeName);
  return {
    name: safeName,
    path: safeName,
    size: st.size,
    mtime: st.mtimeMs,
    kind: kindFor(safeName),
    mime: mimeFor(safeName),
    artifactKind: persistedManifest?.kind,
    artifactManifest: persistedManifest,
  };
}

function artifactManifestNameFor(name) {
  return `${name}.artifact.json`;
}

async function readManifestForPath(projectDirPath, relPath) {
  const manifestPath = path.join(projectDirPath, artifactManifestNameFor(relPath));
  try {
    const raw = await readFile(manifestPath, 'utf8');
    const parsed = parseManifest(raw);
    if (parsed) return parsed;
  } catch (err) {
    if (!err || err.code !== 'ENOENT') {
      // ignore malformed/invalid manifests and fallback to inference
    }
  }
  return inferLegacyManifest(relPath);
}

function parseManifest(raw) {
  return parsePersistedManifest(raw, '');
}

export async function deleteProjectFile(projectsRoot, projectId, name, metadata?) {
  const dir = resolveProjectDir(projectsRoot, projectId, metadata);
  const file = await resolveSafeReal(dir, name);
  await unlink(file);
}

export async function removeProjectDir(projectsRoot, projectId) {
  const dir = projectDir(projectsRoot, projectId);
  await rm(dir, { recursive: true, force: true });
}

function resolveSafe(dir, name) {
  const safePath = validateProjectPath(name);
  const target = path.resolve(dir, safePath);
  if (!target.startsWith(dir + path.sep) && target !== dir) {
    throw new Error('path escapes project dir');
  }
  return target;
}

// Symlink-aware variant of resolveSafe. resolveSafe only does string-prefix
// validation, which is fooled by symlinks *inside* the project tree
// (a `assets/` symlink pointing at `/Users/me/.ssh` passes the prefix
// check because the literal path stays under dir, but the OS follows
// the link at open() time). This helper realpath()s the resolved
// candidate (or its existing prefix, for writes that haven't created
// the file yet) and re-validates against the realpath of dir, so
// descendant symlinks can't reach outside the project.
async function resolveSafeReal(dir, name) {
  const candidate = resolveSafe(dir, name);
  const rootReal = await realpath(dir).catch(() => dir);
  let real;
  try {
    real = await realpath(candidate);
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
    // Write case: path doesn't exist yet. Realpath the longest existing
    // prefix and re-append the missing tail.
    real = await resolveExistingPrefix(candidate);
  }
  if (!real.startsWith(rootReal + path.sep) && real !== rootReal) {
    const e = new Error('path escapes project dir via symlink');
    e.code = 'EPATHESCAPE';
    throw e;
  }
  return real;
}

async function resolveExistingPrefix(p) {
  const parts = p.split(path.sep);
  for (let i = parts.length; i > 0; i--) {
    const prefix = parts.slice(0, i).join(path.sep) || path.sep;
    try {
      const real = await realpath(prefix);
      const rest = parts.slice(i).join(path.sep);
      return rest ? path.join(real, rest) : real;
    } catch (err) {
      if (!err || err.code !== 'ENOENT') throw err;
    }
  }
  return p;
}

export function sanitizePath(raw) {
  const normalized = validateProjectPath(raw);
  return normalized.split('/').map(sanitizeName).join('/');
}

export function validateProjectPath(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('invalid file name');
  }
  const normalized = raw.replace(/\\/g, '/');
  if (raw.includes('\0') || /^[A-Za-z]:/.test(normalized) || normalized.startsWith('/')) {
    throw new Error('invalid file name');
  }
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((p) => FORBIDDEN_SEGMENT.test(p))) {
    throw new Error('invalid file name');
  }
  if (parts.some((part) => RESERVED_PROJECT_FILE_SEGMENTS.has(part))) {
    throw new Error('reserved project path');
  }
  return parts.join('/');
}

export function isReservedProjectFilePath(raw) {
  try {
    const normalized = String(raw ?? '').replace(/\\/g, '/');
    return normalized.split('/').filter(Boolean).some((part) => RESERVED_PROJECT_FILE_SEGMENTS.has(part));
  } catch {
    return false;
  }
}

// Keep Unicode letters/digits as-is; replace path separators, control
// characters, and reserved punctuation with underscore. Spaces collapse
// to dashes (matches the kebab-case style used by the agent's slugs).
// The previous ASCII-only filter collapsed every non-ASCII character to
// '_', so a Chinese filename like '测试文档.docx' became '____.docx'
// (issue #144).
export function sanitizeName(raw) {
  const cleaned = String(raw ?? '')
    .replace(/[\\/]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}._-]/gu, '_')
    .replace(/^\.+/, '_')
    .trim();
  return cleaned || `file-${Date.now()}`;
}

// multer@1 decodes multipart filenames as latin1, which mangles any
// UTF-8 bytes (Chinese, Japanese, Cyrillic, ...) the user uploads. Re-
// decode as UTF-8 when the result round-trips back to the original
// bytes; otherwise the source was genuine latin1 and we leave it alone.
export function decodeMultipartFilename(name) {
  if (!name || typeof name !== 'string') return name ?? '';
  // If any code point exceeds 0xFF the source is already a properly
  // decoded Unicode string — for example, multer received an RFC 5987
  // `filename*` parameter and decoded it as UTF-8. Re-running latin1
  // -> utf8 here would corrupt those names, so exit early.
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) > 0xff) return name;
  }
  const buf = Buffer.from(name, 'latin1');
  const utf8 = buf.toString('utf8');
  return Buffer.from(utf8, 'utf8').equals(buf) ? utf8 : name;
}

function toProjectPath(raw) {
  return raw.split(path.sep).join('/');
}

// Validates an id string for use as a path segment under a daemon-managed
// directory (`.od/projects/<id>`, `design-systems/<id>`, etc.). The character
// class allows dots so ids like `my-project.v2` work, but pure-dot ids
// (`.`, `..`, `...`) MUST be rejected — they pass the char-class check but
// resolve to the parent directory when fed into `path.join`. Without the
// pure-dot guard, an attacker could create a project row with id `..` (or
// reach this code via a percent-encoded URL like `/api/projects/%2e%2e/...`
// which Express decodes before the route handler sees it) and steer
// finalize / write operations outside `.od/projects/`.
export function isSafeId(id) {
  if (typeof id !== 'string') return false;
  if (id.length === 0 || id.length > 128) return false;
  if (/^\.+$/.test(id)) return false; // reject `.`, `..`, `...`, etc.
  return /^[A-Za-z0-9._-]+$/.test(id);
}

const EXT_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
  '.ts': 'text/typescript; charset=utf-8',
  // `.tsx` previously served as `text/typescript`, which browser module
  // loaders and strict CSPs do not accept as a JavaScript MIME. Multi-file
  // React prototypes that load `.tsx` via Babel-standalone (`<script
  // type="text/babel" src="…">`) need a JS-family Content-Type for the
  // browser fetch to succeed. Upstream of issue #336.
  '.tsx': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
};

export function mimeFor(name) {
  const ext = path.extname(name).toLowerCase();
  return EXT_MIME[ext] || 'application/octet-stream';
}

export async function searchProjectFiles(projectsRoot, projectId, query, opts = {}) {
  const max = Math.min(Number(opts.max) || 200, 1000);
  const pattern = opts.pattern || null;
  const metadata = opts.metadata;
  const items = await listFiles(projectsRoot, projectId, { metadata });
  const dir = resolveProjectDir(projectsRoot, projectId, metadata);
  const escaped = String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'i');
  const matches = [];
  for (const f of items) {
    if (!isTextualMime(f.mime)) continue;
    if (pattern && !globMatch(f.name, pattern)) continue;
    let content;
    try {
      content = await readFile(path.join(dir, f.name), 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        const snippet = lines[i].length > 220 ? lines[i].slice(0, 220) + '…' : lines[i];
        matches.push({ file: f.name, line: i + 1, snippet });
        if (matches.length >= max) return matches;
      }
    }
  }
  return matches;
}

function isTextualMime(mime) {
  if (!mime) return false;
  return (
    /^text\//i.test(mime) ||
    /^application\/(json|javascript|typescript|xml|x-(?:yaml|toml|httpd-php|sh))\b/i.test(mime) ||
    /\+(?:json|xml)\b/i.test(mime) ||
    /^image\/svg\+xml/i.test(mime)
  );
}

function globMatch(name, glob) {
  const re = new RegExp(
    '^' +
      glob
        .split('*')
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      '$',
  );
  return re.test(name);
}

// Coarse kind buckets the frontend uses to pick a viewer.
export function kindFor(name) {
  // Editable sketches use a compound extension so they slot into the
  // "sketch" bucket while still being valid JSON on disk.
  if (name.endsWith('.sketch.json')) return 'sketch';
  const ext = path.extname(name).toLowerCase();
  if (ext === '.html' || ext === '.htm') return 'html';
  if (ext === '.svg') return 'sketch';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'].includes(ext)) {
    if (name.startsWith('sketch-')) return 'sketch';
    return 'image';
  }
  if (['.mp4', '.mov', '.webm'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.m4a'].includes(ext)) return 'audio';
  if (['.md', '.txt'].includes(ext)) return 'text';
  if (['.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.css', '.py'].includes(ext)) {
    return 'code';
  }
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'document';
  if (ext === '.pptx') return 'presentation';
  if (ext === '.xlsx') return 'spreadsheet';
  return 'binary';
}
