// Plan §3.A6 / spec §7.2 — github + https tarball install backend.
//
// We don't reach the network in tests; an in-memory `fetcher` returns the
// gzipped bytes we just wrote with `tar.create()`. The test validates:
//   1. github:owner/repo source resolves to the codeload URL pattern and
//      extracts cleanly into the registry under the manifest's id.
//   2. https://…tar.gz source extracts identically and records
//      sourceKind='url'.
//   3. Size cap rejection blocks a tarball that exceeds maxBytes.
//   4. Symlink entries inside an archive are rejected.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { mkdtemp, rm, writeFile, mkdir, symlink, readdir, readFile } from 'node:fs/promises';
import Database from 'better-sqlite3';
import { c as tarCreate } from 'tar';
import { migratePlugins } from '../src/plugins/persistence.js';
import { installPlugin, type ArchiveFetcher } from '../src/plugins/installer.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

let db: Database.Database;
let tmpRoot: string;
let pluginsRoot: string;

async function buildFixtureTarball(args: {
  rootPrefix: string;
  pluginSubpath?: string;
  withSymlink?: boolean;
  bigPaddingBytes?: number;
}): Promise<Buffer> {
  // Write the fixture into a temp folder that mirrors the tar layout
  // codeload uses: `<repo>-<sha>/<files>`.
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'od-fixture-'));
  const wrapper = path.join(tmp, args.rootPrefix);
  const pluginRoot = args.pluginSubpath
    ? path.join(wrapper, args.pluginSubpath)
    : wrapper;
  await mkdir(pluginRoot, { recursive: true });
  const fixtureSrc = path.join(__dirname, 'fixtures', 'plugin-fixtures', 'sample-plugin');
  for (const entry of await readdir(fixtureSrc)) {
    const data = await fs.promises.readFile(path.join(fixtureSrc, entry));
    await writeFile(path.join(pluginRoot, entry), data);
  }
  if (args.withSymlink) {
    await symlink('SKILL.md', path.join(pluginRoot, 'symlink-here'));
  }
  if (args.bigPaddingBytes) {
    const buf = Buffer.alloc(args.bigPaddingBytes, 0);
    await writeFile(path.join(pluginRoot, 'huge.bin'), buf);
  }
  const stream = tarCreate(
    { cwd: tmp, gzip: true },
    [args.rootPrefix],
  ) as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  await rm(tmp, { recursive: true, force: true });
  return Buffer.concat(chunks);
}

function makeFetcher(buf: Buffer): ArchiveFetcher {
  return async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    body: Readable.from([buf]),
  });
}

function makeResponse(body: Buffer | string, status = 200, statusText = 'OK'): Awaited<ReturnType<ArchiveFetcher>> {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    body: Readable.from([Buffer.isBuffer(body) ? body : Buffer.from(body)]),
  };
}

/** Read a request header off the `init` an installer fetch received. */
function acceptHeader(init: Pick<RequestInit, 'headers'> | undefined): string | null {
  return new Headers(init?.headers).get('accept');
}

beforeEach(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'od-installer-archive-'));
  pluginsRoot = path.join(tmpRoot, 'plugins');
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT);
  `);
  migratePlugins(db);
});

afterEach(async () => {
  db.close();
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('archive installer', () => {
  it('extracts a github:owner/repo source via the codeload tarball URL', async () => {
    const tarball = await buildFixtureTarball({ rootPrefix: 'sample-plugin-abc123' });
    let urlSeen = '';
    const fetcher: ArchiveFetcher = async (u) => {
      urlSeen = u;
      return makeFetcher(tarball)('');
    };
    let success = false;
    let error: string | undefined;
    for await (const ev of installPlugin(db, {
      source: 'github:open-design/sample-plugin',
      roots: { userPluginsRoot: pluginsRoot },
      fetcher,
    })) {
      if (ev.kind === 'success') success = true;
      if (ev.kind === 'error') error = ev.message;
    }
    if (!success) {
      throw new Error(`install failed: ${error}`);
    }
    expect(success).toBe(true);
    expect(urlSeen).toBe('https://codeload.github.com/open-design/sample-plugin/tar.gz/HEAD');
    const row = db.prepare(`SELECT source_kind, source FROM installed_plugins WHERE id = 'sample-plugin'`).get();
    expect(row).toEqual({ source_kind: 'github', source: 'github:open-design/sample-plugin' });
  });

  it('normalizes a browser GitHub repository URL through the GitHub installer', async () => {
    const tarball = await buildFixtureTarball({ rootPrefix: 'sample-plugin-abc123' });
    let urlSeen = '';
    const fetcher: ArchiveFetcher = async (u) => {
      urlSeen = u;
      return makeFetcher(tarball)('');
    };
    let success = false;
    let error: string | undefined;
    for await (const ev of installPlugin(db, {
      source: 'https://github.com/open-design/sample-plugin/',
      roots: { userPluginsRoot: pluginsRoot },
      fetcher,
    })) {
      if (ev.kind === 'success') success = true;
      if (ev.kind === 'error') error = ev.message;
    }
    if (!success) {
      throw new Error(`install failed: ${error}`);
    }

    expect(urlSeen).toBe('https://codeload.github.com/open-design/sample-plugin/tar.gz/HEAD');
    const row = db.prepare(
      `SELECT source_kind, source FROM installed_plugins WHERE id = 'sample-plugin'`,
    ).get();
    expect(row).toEqual({
      source_kind: 'github',
      source: 'github:open-design/sample-plugin',
    });
  });

  it.each([
    'https://github.com/open-design/sample-plugin/issues',
    'https://github.com/open-design/sample-plugin/tree/main',
    'https://github.com/open-design/sample-plugin?tab=readme',
  ])('rejects a non-root GitHub browser URL before fetching it: %s', async (source) => {
    let fetched = false;
    let error: string | undefined;
    for await (const ev of installPlugin(db, {
      source,
      roots: { userPluginsRoot: pluginsRoot },
      fetcher: async () => {
        fetched = true;
        return makeResponse('should not fetch');
      },
    })) {
      if (ev.kind === 'error') error = ev.message;
    }

    expect(fetched).toBe(false);
    expect(error).toContain('repository root only');
  });

  it('extracts a github source with a ref and plugin subpath', async () => {
    const fixtureSrc = path.join(__dirname, 'fixtures', 'plugin-fixtures', 'sample-plugin');
    const fixtureFiles = await readdir(fixtureSrc);
    const urlsSeen: string[] = [];
    const apiUrl =
      'https://api.github.com/repos/nexu-io/open-design/contents/plugins/community/registry-starter?ref=garnet-hemisphere';
    const downloadBase = 'https://raw.example.test/plugins/community/registry-starter';
    const entries = fixtureFiles.map((name) => ({
      type: 'file',
      name,
      path: `plugins/community/registry-starter/${name}`,
      download_url: `${downloadBase}/${name}`,
    }));
    const fileBodies = new Map<string, Buffer>();
    for (const name of fixtureFiles) {
      fileBodies.set(`${downloadBase}/${name}`, await readFile(path.join(fixtureSrc, name)));
    }
    const fetcher: ArchiveFetcher = async (u) => {
      urlsSeen.push(u);
      if (u === apiUrl) return makeResponse(JSON.stringify(entries));
      const body = fileBodies.get(u);
      if (body) return makeResponse(body);
      return makeResponse('not found', 404, 'Not Found');
    };
    let success = false;
    let error: string | undefined;
    const source = 'github:nexu-io/open-design@garnet-hemisphere/plugins/community/registry-starter';
    for await (const ev of installPlugin(db, {
      source,
      roots: { userPluginsRoot: pluginsRoot },
      fetcher,
    })) {
      if (ev.kind === 'success') success = true;
      if (ev.kind === 'error') error = ev.message;
    }
    if (!success) {
      throw new Error(`install failed: ${error}`);
    }
    expect(urlsSeen).toContain(apiUrl);
    expect(urlsSeen).not.toContain('https://codeload.github.com/nexu-io/open-design/tar.gz/garnet-hemisphere');
    const row = db.prepare(`SELECT source_kind, source FROM installed_plugins WHERE id = 'sample-plugin'`).get();
    expect(row).toEqual({ source_kind: 'github', source });
  });

  // raw.githubusercontent.com (the host GitHub advertises as `download_url`)
  // is unreachable on some networks: DNS resolves it to 0.0.0.0 or the TLS
  // handshake is reset. The api.github.com listing that produced the entry
  // just succeeded, so the same host must be able to serve the file bytes.
  it('falls back to the api.github.com raw endpoint when the download_url host is unreachable', async () => {
    const fixtureSrc = path.join(__dirname, 'fixtures', 'plugin-fixtures', 'sample-plugin');
    const fixtureFiles = await readdir(fixtureSrc);
    const urlsSeen: string[] = [];
    const acceptsSeen = new Map<string, string | null>();
    const subpath = 'plugins/community/registry-starter';
    const apiUrl = `https://api.github.com/repos/nexu-io/open-design/contents/${subpath}?ref=main`;
    const fileApiUrl = (name: string): string =>
      `https://api.github.com/repos/nexu-io/open-design/contents/${subpath}/${name}?ref=main`;
    const downloadBase = `https://raw.githubusercontent.com/nexu-io/open-design/main/${subpath}`;
    const entries = fixtureFiles.map((name) => ({
      type: 'file',
      name,
      path: `${subpath}/${name}`,
      download_url: `${downloadBase}/${name}`,
    }));
    const fileBodies = new Map<string, Buffer>();
    for (const name of fixtureFiles) {
      fileBodies.set(name, await readFile(path.join(fixtureSrc, name)));
    }
    const fetcher: ArchiveFetcher = async (u, init) => {
      urlsSeen.push(u);
      acceptsSeen.set(u, acceptHeader(init));
      if (u === apiUrl) return makeResponse(JSON.stringify(entries));
      if (u.startsWith(downloadBase)) {
        // What the reported network produces: undici fails before any socket
        // is opened, and the real reason only rides on `cause`.
        throw new TypeError('fetch failed', {
          cause: new Error('host resolves to a private address'),
        });
      }
      const name = fixtureFiles.find((candidate) => u === fileApiUrl(candidate));
      if (name) return makeResponse(fileBodies.get(name) as Buffer);
      return makeResponse('not found', 404, 'Not Found');
    };

    let success = false;
    let error: string | undefined;
    const source = `github:nexu-io/open-design@main/${subpath}`;
    for await (const ev of installPlugin(db, {
      source,
      roots: { userPluginsRoot: pluginsRoot },
      fetcher,
    })) {
      if (ev.kind === 'success') success = true;
      if (ev.kind === 'error') error = ev.message;
    }
    if (!success) {
      throw new Error(`install failed: ${error}`);
    }

    expect(urlsSeen).toContain(`${downloadBase}/SKILL.md`);
    expect(urlsSeen).toContain(fileApiUrl('SKILL.md'));
    // Raw media type: the fallback must ask for the file's bytes, not for the
    // base64 JSON envelope the contents API returns by default.
    expect(acceptsSeen.get(fileApiUrl('SKILL.md'))).toBe('application/vnd.github.raw');
    const row = db.prepare(`SELECT source_kind, source FROM installed_plugins WHERE id = 'sample-plugin'`).get();
    expect(row).toEqual({ source_kind: 'github', source });
  });

  it('reports the cause and both file URLs when the download_url host and the raw endpoint both fail', async () => {
    const fixtureSrc = path.join(__dirname, 'fixtures', 'plugin-fixtures', 'sample-plugin');
    const fixtureFiles = await readdir(fixtureSrc);
    const urlsSeen: string[] = [];
    const subpath = 'plugins/community/registry-starter';
    const apiUrl = `https://api.github.com/repos/nexu-io/open-design/contents/${subpath}?ref=main`;
    const fileApiUrl = (name: string): string =>
      `https://api.github.com/repos/nexu-io/open-design/contents/${subpath}/${name}?ref=main`;
    const downloadBase = `https://raw.githubusercontent.com/nexu-io/open-design/main/${subpath}`;
    const tarballUrl = 'https://codeload.github.com/nexu-io/open-design/tar.gz/main';
    const entries = fixtureFiles.map((name) => ({
      type: 'file',
      name,
      path: `${subpath}/${name}`,
      download_url: `${downloadBase}/${name}`,
    }));
    const fetcher: ArchiveFetcher = async (u) => {
      urlsSeen.push(u);
      if (u === apiUrl) return makeResponse(JSON.stringify(entries));
      if (u.startsWith(downloadBase)) {
        throw new TypeError('fetch failed', {
          cause: new Error('host resolves to a private address'),
        });
      }
      if (fixtureFiles.some((name) => u === fileApiUrl(name))) {
        return makeResponse('rate limited', 403, 'Forbidden');
      }
      return makeResponse('not found', 404, 'Not Found');
    };

    let error: string | undefined;
    const source = `github:nexu-io/open-design@main/${subpath}`;
    for await (const ev of installPlugin(db, {
      source,
      roots: { userPluginsRoot: pluginsRoot },
      fetcher,
    })) {
      if (ev.kind === 'error') error = ev.message;
    }

    expect(error).toContain('host resolves to a private address');
    expect(error).toContain(`${downloadBase}/SKILL.md`);
    expect(error).toContain(fileApiUrl('SKILL.md'));
    // A file-level failure is not a "try the next ref" signal, so the 3.3 GB
    // codeload tarball must never be attempted.
    expect(urlsSeen).not.toContain(tarballUrl);
  });

  it.each([
    [403, 'Forbidden', '{"message":"API rate limit exceeded for 127.0.0.1"}'],
    [429, 'Too Many Requests', 'too many requests'],
  ])('falls back to codeload when GitHub contents returns %i for a plugin subpath', async (status, statusText, body) => {
    const tarball = await buildFixtureTarball({
      rootPrefix: 'open-design-main',
      pluginSubpath: 'plugins/community/import-smoke-test',
    });
    const urlsSeen: string[] = [];
    const contentsUrl =
      'https://api.github.com/repos/nexu-io/open-design/contents/plugins/community/import-smoke-test?ref=main';
    const tarballUrl = 'https://codeload.github.com/nexu-io/open-design/tar.gz/main';
    const fetcher: ArchiveFetcher = async (u) => {
      urlsSeen.push(u);
      if (u === contentsUrl) {
        return makeResponse(body, status, statusText);
      }
      if (u === tarballUrl) return makeResponse(tarball);
      return makeResponse('not found', 404, 'Not Found');
    };

    let success = false;
    let error: string | undefined;
    const source = 'github:nexu-io/open-design@main/plugins/community/import-smoke-test';
    for await (const ev of installPlugin(db, {
      source,
      roots: { userPluginsRoot: pluginsRoot },
      fetcher,
    })) {
      if (ev.kind === 'success') success = true;
      if (ev.kind === 'error') error = ev.message;
    }

    if (!success) {
      throw new Error(`install failed: ${error}`);
    }
    expect(urlsSeen).toEqual([contentsUrl, tarballUrl]);
    const row = db.prepare(`SELECT source_kind, source FROM installed_plugins WHERE id = 'sample-plugin'`).get();
    expect(row).toEqual({ source_kind: 'github', source });
  });

  it('reports both GitHub contents and codeload URLs when subpath fallback fails', async () => {
    const urlsSeen: string[] = [];
    const contentsUrl =
      'https://api.github.com/repos/nexu-io/open-design/contents/plugins/community/import-smoke-test?ref=main';
    const tarballUrl = 'https://codeload.github.com/nexu-io/open-design/tar.gz/main';
    const fetcher: ArchiveFetcher = async (u) => {
      urlsSeen.push(u);
      if (u === contentsUrl) {
        return makeResponse('too many requests', 429, 'Too Many Requests');
      }
      if (u === tarballUrl) return makeResponse('server unavailable', 503, 'Service Unavailable');
      return makeResponse('not found', 404, 'Not Found');
    };

    let error: string | undefined;
    const source = 'github:nexu-io/open-design@main/plugins/community/import-smoke-test';
    for await (const ev of installPlugin(db, {
      source,
      roots: { userPluginsRoot: pluginsRoot },
      fetcher,
    })) {
      if (ev.kind === 'error') error = ev.message;
    }

    expect(urlsSeen).toEqual([contentsUrl, tarballUrl]);
    expect(error).toContain('GitHub install failed');
    expect(error).toContain('Fetch failed: 503 Service Unavailable');
    expect(error).toContain(`Tried GitHub fetch URL(s): ${contentsUrl}, ${tarballUrl}`);
  });

  it('extracts a https://*.tgz source (records source_kind=url)', async () => {
    const tarball = await buildFixtureTarball({ rootPrefix: 'sample-plugin-1.0.0' });
    let success = false;
    for await (const ev of installPlugin(db, {
      source: 'https://example.com/sample-plugin-1.0.0.tgz',
      roots: { userPluginsRoot: pluginsRoot },
      fetcher: makeFetcher(tarball),
    })) {
      if (ev.kind === 'success') success = true;
    }
    expect(success).toBe(true);
    const row = db.prepare(`SELECT source_kind, source, archive_integrity FROM installed_plugins WHERE id = 'sample-plugin'`).get() as {
      source_kind: string;
      source: string;
      archive_integrity: string;
    };
    expect(row).toEqual({
      source_kind: 'url',
      source: 'https://example.com/sample-plugin-1.0.0.tgz',
      archive_integrity: `sha256:${createHash('sha256').update(tarball).digest('hex')}`,
    });
  });

  it('rejects archive downloads when marketplace integrity does not match', async () => {
    const tarball = await buildFixtureTarball({ rootPrefix: 'sample-plugin-1.0.0' });
    let success = false;
    let error: string | undefined;
    for await (const ev of installPlugin(db, {
      source: 'https://example.com/sample-plugin-1.0.0.tgz',
      roots: { userPluginsRoot: pluginsRoot },
      fetcher: makeFetcher(tarball),
      archiveIntegrity: 'sha256:deadbeef',
    })) {
      if (ev.kind === 'success') success = true;
      if (ev.kind === 'error') error = ev.message;
    }
    expect(success).toBe(false);
    expect(error).toMatch(/integrity mismatch/);
  });

  it('rejects archives that exceed the size cap', async () => {
    const tarball = await buildFixtureTarball({
      rootPrefix: 'sample-plugin-fat',
      // 2 MiB padding → comfortably above the 64 KiB cap below.
      bigPaddingBytes: 2 * 1024 * 1024,
    });
    let error: string | undefined;
    let success = false;
    for await (const ev of installPlugin(db, {
      source: 'https://example.com/sample.tgz',
      roots: { userPluginsRoot: pluginsRoot },
      fetcher: makeFetcher(tarball),
      maxBytes: 64 * 1024,
    })) {
      if (ev.kind === 'success') success = true;
      if (ev.kind === 'error') error = ev.message;
    }
    expect(success).toBe(false);
    expect(error).toMatch(/exceeds/);
  });

  it('rejects archives containing symlinks', async () => {
    const tarball = await buildFixtureTarball({
      rootPrefix: 'sample-plugin-sym',
      withSymlink: true,
    });
    let success = false;
    let error: string | undefined;
    for await (const ev of installPlugin(db, {
      source: 'https://example.com/sample.tgz',
      roots: { userPluginsRoot: pluginsRoot },
      fetcher: makeFetcher(tarball),
    })) {
      if (ev.kind === 'success') success = true;
      if (ev.kind === 'error') error = ev.message;
    }
    expect(success).toBe(false);
    // tar's strict mode rejects with a clear message; the exact phrasing is
    // less important than the fact that the install never completed.
    expect(error).toBeDefined();
  });

  it('refuses non-tar.gz https sources up-front', async () => {
    let error: string | undefined;
    for await (const ev of installPlugin(db, {
      source: 'https://example.com/sample.zip',
      roots: { userPluginsRoot: pluginsRoot },
      fetcher: makeFetcher(Buffer.alloc(0)),
    })) {
      if (ev.kind === 'error') error = ev.message;
    }
    expect(error).toMatch(/tar\.gz/);
  });
});
