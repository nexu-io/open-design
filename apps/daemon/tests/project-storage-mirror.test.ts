import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { writeProjectFile } from '../src/projects.js';
import { startServer } from '../src/server.js';
import {
  createProjectStorageMirror,
  type ProjectStorageMirror,
} from '../src/storage/project-storage-mirror.js';
import { StorageError, type ProjectStorage } from '../src/storage/project-storage.js';

class FakeStorage implements ProjectStorage {
  map = new Map<string, Buffer>();
  calls: string[] = [];
  delayMs = 0;
  private async maybeDelay() {
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
  }
  async readFile(projectId: string, relpath: string): Promise<Buffer> {
    const key = projectId + '/' + relpath;
    const body = this.map.get(key);
    if (!body) throw new StorageError('NOT_FOUND', key);
    return body;
  }
  async writeFile(projectId: string, relpath: string, body: Buffer) {
    await this.maybeDelay();
    this.map.set(projectId + '/' + relpath, Buffer.from(body));
    this.calls.push('put:' + projectId + '/' + relpath);
    return { path: relpath, size: body.length, mtimeMs: Date.now() };
  }
  async listFiles(projectId: string) {
    const prefix = projectId + '/';
    return [...this.map.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((k) => ({ path: k.slice(prefix.length), size: 0, mtimeMs: 0 }));
  }
  async deleteFile(projectId: string, relpath: string): Promise<void> {
    await this.maybeDelay();
    this.map.delete(projectId + '/' + relpath);
    this.calls.push('del:' + projectId + '/' + relpath);
  }
  async statFile() { return null; }
}

describe('project storage mirror (#7043)', () => {
  describe('unit: mirror operations against an adapter', () => {
    let dir: string;
    let fake: FakeStorage;
    let mirror: ProjectStorageMirror;

    beforeEach(() => {
      dir = mkdtempSync(path.join(tmpdir(), 'od-mirror-'));
      fake = new FakeStorage();
      mirror = createProjectStorageMirror(fake, dir);
    });

    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('uploadFile pushes one file', async () => {
      const projectDir = path.join(dir, 'p1');
      await mkdir(projectDir, { recursive: true });
      await writeFile(path.join(projectDir, 'index.html'), '<h1>hi</h1>');
      await mirror.uploadFile('p1', 'index.html');
      expect(fake.calls).toEqual(['put:p1/index.html']);
      expect(fake.map.get('p1/index.html')?.toString()).toContain('<h1>hi</h1>');
    });

    it('uploadProject walks the whole tree', async () => {
      const projectDir = path.join(dir, 'p1');
      await mkdir(path.join(projectDir, 'assets'), { recursive: true });
      await writeFile(path.join(projectDir, 'index.html'), 'a');
      await writeFile(path.join(projectDir, 'assets/logo.svg'), 'b');
      await mirror.uploadProject('p1');
      expect(fake.calls).toEqual(['put:p1/index.html', 'put:p1/assets/logo.svg']);
    });

    it('deleteProject removes every stored key', async () => {
      fake.map.set('p1/index.html', Buffer.from('a'));
      fake.map.set('p1/assets/logo.svg', Buffer.from('b'));
      await mirror.deleteProject('p1');
      expect(fake.map.size).toBe(0);
      expect(fake.calls).toEqual(['del:p1/index.html', 'del:p1/assets/logo.svg']);
    });

    it('restoreIfEmpty materializes a fresh local tree', async () => {
      fake.map.set('p1/index.html', Buffer.from('<h1>restored</h1>'));
      fake.map.set('p1/assets/logo.svg', Buffer.from('svg'));
      const projectDir = path.join(dir, 'p1');
      await mkdir(projectDir, { recursive: true });
      await mirror.restoreIfEmpty('p1', projectDir);
      expect((await readFile(path.join(projectDir, 'index.html'))).toString()).toContain('restored');
      expect((await readFile(path.join(projectDir, 'assets/logo.svg'))).toString()).toBe('svg');
    });

    it('restoreIfEmpty leaves a non-empty tree alone', async () => {
      fake.map.set('p1/index.html', Buffer.from('remote'));
      const projectDir = path.join(dir, 'p1');
      await mkdir(projectDir, { recursive: true });
      await writeFile(path.join(projectDir, 'index.html'), 'local');
      await mirror.restoreIfEmpty('p1', projectDir);
      expect((await readFile(path.join(projectDir, 'index.html'))).toString()).toBe('local');
    });
    it('uploadProject reconciles stale remote objects authoritatively', async () => {
      fake.map.set('p1/index.html', Buffer.from('remote'));
      fake.map.set('p1/stale.html', Buffer.from('stale'));
      const projectDir = path.join(dir, 'p1');
      await mkdir(projectDir, { recursive: true });
      await writeFile(path.join(projectDir, 'index.html'), 'local');
      await mirror.uploadProject('p1');
      expect(fake.map.has('p1/stale.html')).toBe(false);
      expect(fake.calls).toEqual([
        'del:p1/stale.html',
        'put:p1/index.html',
      ]);
    });

    it('serializes mirror mutations per project', async () => {
      fake.delayMs = 25;
      const projectDir = path.join(dir, 'p1');
      await mkdir(projectDir, { recursive: true });
      await writeFile(path.join(projectDir, 'a.html'), 'a');
      // Fire the sync without awaiting, then immediately queue a delete.
      const sync = mirror.uploadProject('p1');
      const del = mirror.deleteFile('p1', 'a.html');
      await Promise.all([sync, del]);
      // The delete must land after the sync's write, in submission order.
      const putIdx = fake.calls.indexOf('put:p1/a.html');
      const delIdx = fake.calls.indexOf('del:p1/a.html');
      expect(putIdx).toBeGreaterThanOrEqual(0);
      expect(delIdx).toBeGreaterThan(putIdx);
    });

    it('rename mirrors the artifact manifest sidecar too', async () => {
      const projectDir = path.join(dir, 'p1');
      await mkdir(projectDir, { recursive: true });
      await writeFile(path.join(projectDir, 'index.html'), '<h1>old</h1>');
      await writeFile(path.join(projectDir, 'index.html.artifact.json'), '{"kind":"html"}');
      // Seed the old remote state: the rename's authoritative full-tree sync
      // must reconcile away the old file and old manifest, then re-upload
      // the renamed file and its manifest.
      fake.map.set('p1/index.html', Buffer.from('old-remote'));
      fake.map.set('p1/index.html.artifact.json', Buffer.from('old-manifest-remote'));
      const { renameProjectFile, setProjectStorageMirror } = await import('../src/projects.js');
      const prev = setProjectStorageMirror(mirror);
      try {
        await renameProjectFile(dir, 'p1', 'index.html', 'home.html');
      } finally {
        setProjectStorageMirror(prev);
      }
      expect(fake.calls).toEqual([
        'del:p1/index.html',
        'del:p1/index.html.artifact.json',
        'put:p1/home.html',
        'put:p1/home.html.artifact.json',
      ]);
    });

    it('restoreIfEmpty refuses to materialize unsafe remote paths', async () => {
      fake.map.set('p1/../escape.html', Buffer.from('evil'));
      fake.map.set('p1/ok.html', Buffer.from('ok'));
      const projectDir = path.join(dir, 'p1');
      await mkdir(projectDir, { recursive: true });
      await mirror.restoreIfEmpty('p1', projectDir);
      expect((await readFile(path.join(projectDir, 'ok.html'))).toString()).toBe('ok');
      expect(await import('node:fs').then((fs) => fs.existsSync(path.join(dir, 'escape.html')))).toBe(false);
    });
    it('folder delete reconciles hidden files and sidecars authoritatively', async () => {
      // Remote state: the folder's visible file, a hidden file, and a sidecar.
      fake.map.set('p1/sub/page.html', Buffer.from('page'));
      fake.map.set('p1/sub/.hidden.html', Buffer.from('hidden'));
      fake.map.set('p1/sub/page.html.artifact.json', Buffer.from('sidecar'));
      fake.map.set('p1/keep.html', Buffer.from('keep'));
      const projectDir = path.join(dir, 'p1');
      await mkdir(path.join(projectDir, 'sub'), { recursive: true });
      await writeFile(path.join(projectDir, 'sub', 'page.html'), 'page');
      await writeFile(path.join(projectDir, 'keep.html'), 'keep');
      const { deleteProjectFolder, setProjectStorageMirror } = await import('../src/projects.js');
      const prev = setProjectStorageMirror(mirror);
      try {
        await deleteProjectFolder(dir, 'p1', 'sub');
      } finally {
        setProjectStorageMirror(prev);
      }
      // The authoritative sync removes all remote keys the local tree no
      // longer has — visible, hidden, and sidecar — and re-uploads keep.html.
      expect(fake.map.has('p1/sub/page.html')).toBe(false);
      expect(fake.map.has('p1/sub/.hidden.html')).toBe(false);
      expect(fake.map.has('p1/sub/page.html.artifact.json')).toBe(false);
      expect(fake.map.get('p1/keep.html')?.toString()).toBe('keep');
    });
  });

  describe('integration: daemon write-through + delete against a mock S3', () => {
    let server: http.Server;
    let baseUrl: string;
    let mockS3: http.Server;
    let mockPort = 0;
    const records: Array<{ method: string; path: string; body?: string }> = [];
    const savedEnv: Record<string, string | undefined> = {};

    beforeAll(async () => {
      // In-memory S3: PUT/GET/DELETE/HEAD on /<bucket>/<key...>;
      // GET /<bucket>?list-type=2&prefix=... returns ListObjectsV2 XML.
      mockS3 = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        const parts = url.pathname.split('/').filter(Boolean);
        const bucket = parts[0] ?? 'od-test-bucket';
        if (url.searchParams.get('list-type') === '2') {
          const prefix = url.searchParams.get('prefix') ?? '';
          const keys = records
            .filter((r) => r.method === 'PUT' && r.path.startsWith('/' + bucket + '/' + prefix))
            .map((r) => r.path.slice(('/' + bucket + '/').length));
          const xml = '<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated>'
            + keys.map((k) => '<Contents><Key>' + k + '</Key><Size>1</Size><LastModified>2026-01-01T00:00:00Z</LastModified></Contents>').join('')
            + '</ListBucketResult>';
          res.writeHead(200, { 'content-type': 'application/xml' });
          res.end(xml);
          return;
        }
        const existing = records.find((r) => r.method === 'PUT' && r.path === url.pathname);
        if (req.method === 'PUT') {
          const chunks: Buffer[] = [];
          req.on('data', (c) => chunks.push(c));
          req.on('end', () => {
            records.push({ method: 'PUT', path: url.pathname, body: Buffer.concat(chunks).toString() });
            res.writeHead(200);
            res.end();
          });
          return;
        }
        if (req.method === 'DELETE') {
          records.push({ method: 'DELETE', path: url.pathname });
          res.writeHead(204);
          res.end();
          return;
        }
        if (req.method === 'GET') {
          if (!existing) { res.writeHead(404); res.end(); return; }
          res.writeHead(200);
          res.end(existing.body ?? '');
          return;
        }
        if (req.method === 'HEAD') {
          res.writeHead(existing ? 200 : 404);
          res.end();
          return;
        }
        res.writeHead(405);
        res.end();
      });
      await new Promise<void>((resolve) => mockS3.listen(0, '127.0.0.1', resolve));
      const addr = mockS3.address();
      mockPort = typeof addr === 'object' && addr ? addr.port : 0;

      const envKeys = ['OD_PROJECT_STORAGE', 'OD_S3_ENDPOINT', 'OD_S3_BUCKET', 'OD_S3_REGION', 'OD_S3_ACCESS_KEY_ID', 'OD_S3_SECRET_ACCESS_KEY'];
      for (const k of envKeys) { savedEnv[k] = process.env[k]; }
      process.env.OD_PROJECT_STORAGE = 's3';
      process.env.OD_S3_ENDPOINT = 'http://127.0.0.1:' + mockPort;
      process.env.OD_S3_BUCKET = 'od-test-bucket';
      process.env.OD_S3_REGION = 'us-east-1';
      process.env.OD_S3_ACCESS_KEY_ID = 'test-key';
      process.env.OD_S3_SECRET_ACCESS_KEY = 'test-secret';

      const started = (await startServer({ port: 0, returnServer: true })) as {
        url: string;
        server: http.Server;
      };
      baseUrl = started.url;
      server = started.server;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await new Promise<void>((resolve) => mockS3.close(() => resolve()));
      for (const k of Object.keys(savedEnv)) {
        if (savedEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedEnv[k];
      }
    });

    it('write-through: file write lands in the bucket', async () => {
      const id = 's3-int-' + Date.now();
      const create = await fetch(baseUrl + '/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: 'S3 Integration' }),
      });
      expect(create.status).toBe(200);

      const projectsRoot = path.join(process.env.OD_DATA_DIR as string, 'projects');
      const result = await writeProjectFile(projectsRoot, id, 'index.html', Buffer.from('<h1>s3</h1>'));
      expect(result.name).toBe('index.html');
      const put = records.find((r) => r.method === 'PUT' && r.path === '/od-test-bucket/' + id + '/index.html');
      expect(put).toBeTruthy();
      expect(put?.body).toContain('<h1>s3</h1>');
    });

    it('project delete mirrors to the bucket', async () => {
      const id = 's3-del-' + Date.now();
      await fetch(baseUrl + '/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: 'S3 Delete' }),
      });
      const projectsRoot = path.join(process.env.OD_DATA_DIR as string, 'projects');
      await writeProjectFile(projectsRoot, id, 'index.html', Buffer.from('<h1>bye</h1>'));
      const del = await fetch(baseUrl + '/api/projects/' + id, { method: 'DELETE' });
      expect(del.status).toBe(200);
      await new Promise((r) => setTimeout(r, 300));
      expect(records.some((r) => r.method === 'DELETE' && r.path === '/od-test-bucket/' + id + '/index.html')).toBe(true);
    });
  });
});
