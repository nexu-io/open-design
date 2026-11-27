import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { c as tarCreate } from 'tar';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { installPlugin, type ArchiveFetcher, type InstallEvent } from '../src/plugins/installer.js';
import { migratePlugins } from '../src/plugins/persistence.js';
import { getInstalledPlugin } from '../src/plugins/registry.js';

const source = 'github:vendor/repository@main/plugins/sample';
const contentsUrl = 'https://api.github.com/repos/vendor/repository/contents/plugins/sample?ref=main';
const archiveUrl = 'https://codeload.github.com/vendor/repository/tar.gz/main';
const fixtureDir = fileURLToPath(new URL('./fixtures/plugin-fixtures/sample-plugin', import.meta.url));

describe('GitHub subpath archive integrity', () => {
  let tmp: string;
  let pluginsRoot: string;
  let db: Database.Database;
  let tarball: Buffer;
  let urls: string[];
  let fetcher: ArchiveFetcher;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'od-plugin-integrity-'));
    pluginsRoot = path.join(tmp, 'installed');
    const wrapper = path.join(tmp, 'repository-main');
    const pluginRoot = path.join(wrapper, 'plugins', 'sample');
    await mkdir(path.dirname(pluginRoot), { recursive: true });
    await cp(fixtureDir, pluginRoot, { recursive: true });
    const stream = tarCreate({ cwd: tmp, gzip: true }, ['repository-main']) as unknown as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
    tarball = Buffer.concat(chunks);
    db = new Database(':memory:');
    db.exec('CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT); CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT);');
    migratePlugins(db);
    urls = [];

    const files = new Map<string, Buffer>();
    for (const name of await readdir(fixtureDir)) {
      let bytes = await readFile(path.join(fixtureDir, name));
      if (name === 'open-design.json') {
        const manifest = JSON.parse(bytes.toString('utf8'));
        bytes = Buffer.from(JSON.stringify({ ...manifest, version: '9.9.9' }));
      }
      files.set(name, bytes);
    }
    const entries = [...files.keys()].map((name) => ({
      type: 'file', name, path: `plugins/sample/${name}`,
      download_url: `https://raw.example.test/${name}`,
    }));
    fetcher = async (url) => {
      urls.push(url);
      let body: Buffer | undefined;
      if (url === contentsUrl) body = Buffer.from(JSON.stringify(entries));
      else if (url === archiveUrl) body = tarball;
      else if (url.startsWith('https://raw.example.test/')) body = files.get(url.slice('https://raw.example.test/'.length));
      return {
        ok: body !== undefined,
        status: body === undefined ? 404 : 200,
        statusText: body === undefined ? 'Not Found' : 'OK',
        body: Readable.from([body ?? Buffer.from('not found')]),
      };
    };
  });

  afterEach(async () => {
    db.close();
    await rm(tmp, { recursive: true, force: true });
  });

  async function install(archiveIntegrity?: string): Promise<InstallEvent[]> {
    const events: InstallEvent[] = [];
    for await (const event of installPlugin(db, {
      source, roots: { userPluginsRoot: pluginsRoot }, fetcher,
      ...(archiveIntegrity ? { archiveIntegrity } : {}),
    })) events.push(event);
    return events;
  }

  it('rejects a mismatched archive digest before replacing an installed plugin', async () => {
    for await (const event of installPlugin(db, {
      source: fixtureDir, roots: { userPluginsRoot: pluginsRoot },
    })) {
      if (event.kind === 'error') throw new Error(event.message);
    }
    const installed = path.join(pluginsRoot, 'sample-plugin', 'open-design.json');
    const before = await readFile(installed, 'utf8');

    const events = await install('sha256:' + '0'.repeat(64));

    assert.equal(events.some((event) => event.kind === 'success'), false);
    const error = events.find((event) => event.kind === 'error');
    assert.match(error?.message ?? '', /integrity mismatch/);
    assert.equal(await readFile(installed, 'utf8'), before);
    assert.equal(getInstalledPlugin(db, 'sample-plugin')?.version, '1.0.0');
    assert.deepEqual(urls, [archiveUrl]);
  });

  for (const format of ['hex', 'sri'] as const) {
    it(`installs the verified archive rather than different contents API bytes (${format})`, async () => {
      const hash = createHash('sha256').update(tarball);
      const integrity = format === 'hex' ? `sha256:${hash.digest('hex')}` : `sha256-${hash.digest('base64')}`;

      const events = await install(integrity);

      const success = events.find((event) => event.kind === 'success');
      assert.ok(success, JSON.stringify(events));
      assert.equal(success.plugin.version, '1.0.0');
      assert.equal(success.plugin.archiveIntegrity, integrity);
      assert.deepEqual(urls, [archiveUrl]);
    });
  }

  it('retains contents API installs when no archive digest is pinned', async () => {
    const events = await install();
    const success = events.find((event) => event.kind === 'success');
    assert.ok(success, JSON.stringify(events));
    assert.equal(success.plugin.version, '9.9.9');
    assert.equal(urls[0], contentsUrl);
    assert.equal(urls.includes(archiveUrl), false);
  });
});
