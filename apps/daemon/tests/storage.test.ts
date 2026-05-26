// Phase 5 / spec §15.6 — ProjectStorage + DaemonDb adapter tests.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  LocalProjectStorage,
  S3ProjectStorage,
  StorageError,
  resolveProjectStorage,
} from '../src/storage/project-storage.js';
import {
  DaemonDbConfigError,
  resolveDaemonDbConfig,
} from '../src/storage/daemon-db.js';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'od-storage-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('LocalProjectStorage', () => {
  it('writes, lists, reads, stats, and deletes a file', async () => {
    const storage = new LocalProjectStorage(tmp);
    const meta = await storage.writeFile('p1', 'hello.txt', Buffer.from('hi'));
    expect(meta.path).toBe('hello.txt');
    expect(meta.size).toBe(2);

    const list = await storage.listFiles('p1');
    expect(list.map((f) => f.path).sort()).toEqual(['hello.txt']);

    const buf = await storage.readFile('p1', 'hello.txt');
    expect(buf.toString('utf8')).toBe('hi');

    const stat = await storage.statFile('p1', 'hello.txt');
    expect(stat?.size).toBe(2);

    await storage.deleteFile('p1', 'hello.txt');
    expect(await storage.statFile('p1', 'hello.txt')).toBeNull();
  });

  it('walks nested directories on list', async () => {
    const projectRoot = path.join(tmp, 'p2');
    await mkdir(path.join(projectRoot, 'a', 'b'), { recursive: true });
    await writeFile(path.join(projectRoot, 'a', 'b', 'deep.txt'), 'x');
    const storage = new LocalProjectStorage(tmp);
    const list = await storage.listFiles('p2');
    expect(list.map((f) => f.path)).toEqual(['a/b/deep.txt']);
  });

  it('rejects path-traversal and unsafe ids', async () => {
    const storage = new LocalProjectStorage(tmp);
    await expect(storage.readFile('p1', '../escape')).rejects.toBeInstanceOf(StorageError);
    await expect(storage.readFile('../bad', 'x.txt')).rejects.toBeInstanceOf(StorageError);
    await expect(storage.readFile('p1', '')).rejects.toBeInstanceOf(StorageError);
  });

  it('returns NOT_FOUND on a missing file', async () => {
    const storage = new LocalProjectStorage(tmp);
    await expect(storage.readFile('p1', 'no-such.txt')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('S3ProjectStorage', () => {
  const fixedNow = () => new Date('2026-05-09T12:00:00.000Z');
  const credentials = { accessKeyId: 'AKIA-FIXTURE', secretAccessKey: 'shhh' };

  it('builds a canonical key with the configured prefix', () => {
    const storage = new S3ProjectStorage({
      bucket: 'od-bucket',
      region: 'us-east-1',
      prefix: 'tenant-a/',
      credentials,
      fetchFn: (async () => new Response('')) as unknown as typeof fetch,
    });
    expect(storage.keyFor('p1', 'a/b/c.txt')).toBe('tenant-a/p1/a/b/c.txt');
  });

  it('refuses to instantiate without bucket / region / credentials', () => {
    expect(() => new S3ProjectStorage({ bucket: '', region: 'r', credentials, fetchFn: globalThis.fetch })).toThrow(StorageError);
    expect(() => new S3ProjectStorage({ bucket: 'b', region: '', credentials, fetchFn: globalThis.fetch })).toThrow(StorageError);
    expect(() => new S3ProjectStorage({ bucket: 'b', region: 'r', credentials: { accessKeyId: '', secretAccessKey: 's' }, fetchFn: globalThis.fetch })).toThrow(StorageError);
    expect(() => new S3ProjectStorage({ bucket: 'b', region: 'r', credentials: { accessKeyId: 'a', secretAccessKey: '' }, fetchFn: globalThis.fetch })).toThrow(StorageError);
  });

  it('PUT signs the request + reports back ProjectFileMeta on success', async () => {
    const seen: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen.push({
        url,
        method: init.method ?? 'GET',
        headers: Object.fromEntries(Object.entries(init.headers ?? {}) as Array<[string, string]>),
      });
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;
    const storage = new S3ProjectStorage({
      bucket: 'od-bucket', region: 'us-east-1', credentials,
      fetchFn, now: fixedNow,
    });
    const meta = await storage.writeFile('p1', 'hello.txt', Buffer.from('hi'));
    expect(meta.path).toBe('hello.txt');
    expect(meta.size).toBe(2);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe('PUT');
    expect(seen[0]?.url).toBe('https://od-bucket.s3.us-east-1.amazonaws.com/p1/hello.txt');
    expect(seen[0]?.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIA-FIXTURE\/20260509\/us-east-1\/s3\/aws4_request/);
    expect(seen[0]?.headers['x-amz-date']).toBe('20260509T120000Z');
    // The body sha256 lands on the header so an upstream proxy /
    // bucket-policy can verify integrity.
    expect(seen[0]?.headers['x-amz-content-sha256']).toMatch(/^[a-f0-9]{64}$/);
  });

  it('GET returns the body bytes as a Buffer', async () => {
    const fetchFn = (async () => new Response('hello world', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    })) as unknown as typeof fetch;
    const storage = new S3ProjectStorage({
      bucket: 'od-bucket', region: 'us-east-1', credentials, fetchFn, now: fixedNow,
    });
    const buf = await storage.readFile('p1', 'hello.txt');
    expect(buf.toString('utf8')).toBe('hello world');
  });

  it('GET 404 surfaces StorageError with code=NOT_FOUND', async () => {
    const fetchFn = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    const storage = new S3ProjectStorage({
      bucket: 'od-bucket', region: 'us-east-1', credentials, fetchFn,
    });
    await expect(storage.readFile('p1', 'no.txt')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('HEAD returns null on 404 + parses content-length / last-modified on 200', async () => {
    let respond: (() => Response) = () => new Response('', { status: 404 });
    const fetchFn = (async () => respond()) as unknown as typeof fetch;
    const storage = new S3ProjectStorage({
      bucket: 'od-bucket', region: 'us-east-1', credentials, fetchFn,
    });
    expect(await storage.statFile('p1', 'x')).toBeNull();
    respond = () => new Response('', {
      status: 200,
      headers: {
        'content-length': '17',
        'last-modified':  'Sat, 09 May 2026 11:59:00 GMT',
      },
    });
    const stat = await storage.statFile('p1', 'x');
    expect(stat?.size).toBe(17);
    expect(stat?.mtimeMs).toBe(Date.parse('Sat, 09 May 2026 11:59:00 GMT'));
  });

  it('DELETE swallows 404 (idempotent) and rejects on 500', async () => {
    let status = 204;
    const fetchFn = (async () => {
      // 204 forbids a body in the WHATWG fetch spec; use null.
      return status === 204 ? new Response(null, { status }) : new Response('', { status });
    }) as unknown as typeof fetch;
    const storage = new S3ProjectStorage({
      bucket: 'od-bucket', region: 'us-east-1', credentials, fetchFn,
    });
    await storage.deleteFile('p1', 'x');
    status = 404;
    await storage.deleteFile('p1', 'gone');
    status = 500;
    await expect(storage.deleteFile('p1', 'broken')).rejects.toBeInstanceOf(StorageError);
  });

  it('LIST parses ListBucketV2 XML and walks continuation tokens', async () => {
    const pages = [
      `<?xml version="1.0"?><ListBucketResult>
        <Contents><Key>p1/a.txt</Key><Size>3</Size><LastModified>2026-05-09T11:00:00Z</LastModified></Contents>
        <Contents><Key>p1/sub/b.txt</Key><Size>5</Size><LastModified>2026-05-09T11:01:00Z</LastModified></Contents>
        <IsTruncated>true</IsTruncated>
        <NextContinuationToken>tok-2</NextContinuationToken>
      </ListBucketResult>`,
      `<?xml version="1.0"?><ListBucketResult>
        <Contents><Key>p1/sub/c.txt</Key><Size>7</Size><LastModified>2026-05-09T11:02:00Z</LastModified></Contents>
        <IsTruncated>false</IsTruncated>
      </ListBucketResult>`,
    ];
    let page = 0;
    const seenUrls: string[] = [];
    const fetchFn = (async (url: string) => {
      seenUrls.push(url);
      const body = pages[page] ?? '<ListBucketResult/>';
      page++;
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const storage = new S3ProjectStorage({
      bucket: 'od-bucket', region: 'us-east-1', credentials, fetchFn,
    });
    const list = await storage.listFiles('p1');
    expect(list.map((f) => f.path).sort()).toEqual(['a.txt', 'sub/b.txt', 'sub/c.txt']);
    expect(list[0]?.size).toBe(3);
    // Second call carries the continuation-token query.
    expect(seenUrls[1]).toContain('continuation-token=tok-2');
  });

  it('endpoint override switches to path-style + reuses the host', async () => {
    const seen: string[] = [];
    const fetchFn = (async (url: string) => {
      seen.push(url);
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;
    const storage = new S3ProjectStorage({
      bucket: 'od-bucket', region: 'us-east-1',
      endpoint: 'https://oss.aliyuncs.com',
      credentials, fetchFn, now: fixedNow,
    });
    await storage.writeFile('p1', 'a.txt', Buffer.from('x'));
    expect(seen[0]).toBe('https://oss.aliyuncs.com/od-bucket/p1/a.txt');
  });
});

describe('resolveProjectStorage', () => {
  it('defaults to LocalProjectStorage', () => {
    const storage = resolveProjectStorage({ projectsRoot: tmp, env: {} });
    expect(storage).toBeInstanceOf(LocalProjectStorage);
  });

  it('returns S3ProjectStorage when OD_PROJECT_STORAGE=s3', () => {
    const storage = resolveProjectStorage({
      projectsRoot: tmp,
      env: {
        OD_PROJECT_STORAGE:        's3',
        OD_S3_BUCKET:              'my-bucket',
        OD_S3_REGION:              'us-east-1',
        OD_S3_PREFIX:              'tenant',
        OD_S3_ENDPOINT:            'https://oss.aliyuncs.com',
        OD_S3_ACCESS_KEY_ID:       'AKIA-FIXTURE',
        OD_S3_SECRET_ACCESS_KEY:   'shhh',
      },
    });
    expect(storage).toBeInstanceOf(S3ProjectStorage);
    expect((storage as S3ProjectStorage).options).toMatchObject({
      bucket:   'my-bucket',
      region:   'us-east-1',
      prefix:   'tenant',
      endpoint: 'https://oss.aliyuncs.com',
    });
  });

  it('falls back to AWS_ACCESS_KEY_ID / AWS_REGION when the OD_-specific knobs are unset', () => {
    const storage = resolveProjectStorage({
      projectsRoot: tmp,
      env: {
        OD_PROJECT_STORAGE:    's3',
        OD_S3_BUCKET:          'my-bucket',
        AWS_REGION:            'us-east-2',
        AWS_ACCESS_KEY_ID:     'AKIA-AWS',
        AWS_SECRET_ACCESS_KEY: 'aws-secret',
      },
    });
    expect(storage).toBeInstanceOf(S3ProjectStorage);
    expect((storage as S3ProjectStorage).options).toMatchObject({
      region: 'us-east-2',
    });
    expect((storage as S3ProjectStorage).options.credentials.accessKeyId).toBe('AKIA-AWS');
  });
});

describe('resolveDaemonDbConfig', () => {
  it('defaults to sqlite', () => {
    expect(resolveDaemonDbConfig({})).toEqual({ kind: 'sqlite' });
  });

  it('parses postgres env vars when OD_DAEMON_DB=postgres', () => {
    const cfg = resolveDaemonDbConfig({
      OD_DAEMON_DB: 'postgres',
      OD_PG_HOST:   'pg.local',
      OD_PG_PORT:   '6543',
      OD_PG_DATABASE: 'open_design',
      OD_PG_USER:   'od',
      OD_PG_SSL_MODE: 'disable',
    });
    expect(cfg.kind).toBe('postgres');
    expect(cfg.postgres).toEqual({
      host:     'pg.local',
      port:     6543,
      database: 'open_design',
      user:     'od',
      sslMode:  'disable',
    });
  });

  it('throws when postgres env vars are incomplete', () => {
    expect(() =>
      resolveDaemonDbConfig({ OD_DAEMON_DB: 'postgres', OD_PG_HOST: 'pg.local' }),
    ).toThrow(DaemonDbConfigError);
  });

  it('throws on an unknown OD_DAEMON_DB value', () => {
    expect(() => resolveDaemonDbConfig({ OD_DAEMON_DB: 'mongo' })).toThrow(DaemonDbConfigError);
  });
});
