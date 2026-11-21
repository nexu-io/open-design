'use strict';

// Next.js incremental cache handler for standalone web output (issue #7284).
//
// Next loads `cacheHandler` as raw runtime JavaScript next to the standalone
// server, outside its bundler, so this file stays CommonJS (allowlisted in
// scripts/guard.ts). A static `require` also lets Next's file tracing copy
// the FileSystemCache dependency into the standalone tree.
//
// Invariant: when OD_WEB_CACHE_DIR is set, every cache write lands under
// `<OD_WEB_CACHE_DIR>/<BUILD_ID>/` and nothing is written next to the
// server build. Packaged desktop builds ship that build inside a signed,
// read-only app bundle, so the default (writing ISR entries into
// `.next/server/app`) mutates the bundle and breaks its code signature.
// Prerendered pages shipped with the build are still read from the build
// directory as a read-only seed. Without OD_WEB_CACHE_DIR the handler
// behaves exactly like Next's default file system cache.

const { readdirSync, readFileSync, rmSync } = require('node:fs');
const path = require('node:path');
const FileSystemCache = require('next/dist/server/lib/incremental-cache/file-system-cache').default;

// `turbopackIgnore` keeps Next's build tracer from treating these runtime
// paths as globs over apps/web (which would copy sources into standalone).
const CACHE_DIR_ENV = 'OD_WEB_CACHE_DIR';
const prunedCacheRoots = new Set();

function readBuildId(serverDistDir) {
  try {
    const buildId = readFileSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ serverDistDir, '..', 'BUILD_ID'), 'utf8').trim();
    return /^[\w.-]+$/.test(buildId) ? buildId : null;
  } catch {
    return null;
  }
}

// Entries from previous builds reference chunk hashes that no longer exist,
// so drop them instead of letting the cache grow with every app update.
function pruneOtherBuilds(cacheRoot, buildId) {
  if (prunedCacheRoots.has(cacheRoot)) return;
  prunedCacheRoots.add(cacheRoot);
  let entries;
  try {
    entries = readdirSync(/* turbopackIgnore: true */ cacheRoot);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === buildId) continue;
    try {
      rmSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ cacheRoot, entry), { force: true, recursive: true });
    } catch {
      // Best effort: a stale entry only costs disk space.
    }
  }
}

function resolveWritableServerDistDir(serverDistDir, env = process.env) {
  const configured = env[CACHE_DIR_ENV];
  if (configured == null || configured.trim().length === 0 || serverDistDir == null) return null;
  const cacheRoot = path.resolve(/* turbopackIgnore: true */ configured.trim());
  const buildId = readBuildId(serverDistDir) ?? 'unknown-build';
  pruneOtherBuilds(cacheRoot, buildId);
  // FileSystemCache derives every path from serverDistDir (`app/`, `pages/`
  // and `../cache/fetch-cache`), so a mirrored `server` directory keeps the
  // whole layout inside the build-scoped cache root.
  return path.join(/* turbopackIgnore: true */ cacheRoot, buildId, 'server');
}

class OpenDesignCacheHandler {
  constructor(ctx) {
    const writableServerDistDir = resolveWritableServerDistDir(ctx.serverDistDir);
    if (writableServerDistDir == null) {
      this.writable = new FileSystemCache(ctx);
      this.seed = null;
      return;
    }
    this.writable = new FileSystemCache({ ...ctx, serverDistDir: writableServerDistDir });
    this.seed = new FileSystemCache({ ...ctx, flushToDisk: false });
  }

  async get(...args) {
    const entry = await this.writable.get(...args);
    if (entry != null || this.seed == null) return entry;
    return await this.seed.get(...args);
  }

  async set(...args) {
    return await this.writable.set(...args);
  }

  async revalidateTag(...args) {
    return await this.writable.revalidateTag(...args);
  }

  resetRequestCache() {
    this.writable.resetRequestCache();
  }
}

module.exports = OpenDesignCacheHandler;
module.exports.CACHE_DIR_ENV = CACHE_DIR_ENV;
module.exports.resolveWritableServerDistDir = resolveWritableServerDistDir;
