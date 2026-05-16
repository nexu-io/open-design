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
