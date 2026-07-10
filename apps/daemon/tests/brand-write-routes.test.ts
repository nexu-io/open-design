/**
 * Role: 브랜드 쓰기 HTTP 라우트 계약 테스트 (registerBrandWriteRoutes)
 * Key Features: 생성 201/409/400, manifest 패치 200/404, docs core·:key 저장(단일 핸들러 core 분기),
 *               deliverable add 201/409/400·remove 200/404, DELETE 바인딩 프로젝트 409 { projectCount }
 * Dependencies: express, node:fs, ../src/brand-routes.js, ../src/db.js
 * Notes: 하니스 격리 필수 — startServer 풀부팅 금지 (BRANDS_DIR가 실제 repo brands/로 폴백해
 *        working tree를 오염). design-system-tool-routes.test.ts의 mkdtempSync 루트 + 주입 db 패턴 준수.
 */
import express from 'express';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { registerBrandWriteRoutes } from '../src/brand-routes.js';
import { closeDatabase, insertProject, openDatabase } from '../src/db.js';

type JsonFetchResult = { status: number; body: Record<string, any> };

let server: http.Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve();
    server.close((error?: Error) => (error ? reject(error) : resolve()));
  });
  server = undefined;
  closeDatabase();
});

// 테스트별 신선한 tmp 루트 — repo brands/와 완전 격리
function freshDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

// 디스크 fixture 브랜드 — create 라우트를 우회해 나머지 라우트를 독립 검증
function writeBrandFixture(
  root: string,
  id: string,
  options: {
    deliverables?: Record<string, { file: string; label?: string; designSystem?: string }>;
  } = {},
): void {
  const dir = path.join(root, id);
  mkdirSync(dir, { recursive: true });
  const deliverables = options.deliverables ?? {};
  writeFileSync(
    path.join(dir, 'manifest.json'),
    `${JSON.stringify({ schemaVersion: 'od-brand/v1', id, title: `Brand ${id}`, deliverables }, null, 2)}\n`,
  );
  writeFileSync(path.join(dir, 'brand.md'), `# Brand ${id}\n\n## Palette\n\n| 이름 | 값 | 용도 |\n|---|---|---|\n`);
  for (const entry of Object.values(deliverables)) {
    mkdirSync(path.dirname(path.join(dir, entry.file)), { recursive: true });
    writeFileSync(path.join(dir, entry.file), `# ${entry.label ?? 'channel'}\n`);
  }
}

async function startHarness(): Promise<{ base: string; brandsDir: string; db: any }> {
  const brandsDir = freshDir('od-brand-write-routes-');
  const dataDir = freshDir('od-brand-write-db-');
  const db = openDatabase(dataDir, { dataDir });
  const app = express();
  app.use(express.json());
  registerBrandWriteRoutes(app, { brandsDir, db });
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('unexpected listen address');
  return { base: `http://127.0.0.1:${address.port}`, brandsDir, db };
}

async function jsonFetch(url: string, init?: RequestInit): Promise<JsonFetchResult> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  return { status: res.status, body };
}

function jsonInit(method: string, payload: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

describe('POST /api/brands', () => {
  it('creates a brand from a Latin title (slug id) and scaffolds manifest + brand.md', async () => {
    const { base, brandsDir } = await startHarness();
    const { status, body } = await jsonFetch(`${base}/api/brands`, jsonInit('POST', { title: 'Acme Brand' }));
    expect(status).toBe(201);
    expect(body.id).toBe('acme-brand');
    expect(body.title).toBe('Acme Brand');
    expect(body.deliverables).toEqual([]);
    expect(typeof body.body).toBe('string');
    expect(body.body).toContain('# Acme Brand');
    const manifest = JSON.parse(readFileSync(path.join(brandsDir, 'acme-brand', 'manifest.json'), 'utf8'));
    expect(manifest.id).toBe('acme-brand');
    expect(existsSync(path.join(brandsDir, 'acme-brand', 'brand.md'))).toBe(true);
  });

  it('rejects a duplicate explicit id with 409', async () => {
    const { base, brandsDir } = await startHarness();
    writeBrandFixture(brandsDir, 'acme');
    const { status, body } = await jsonFetch(`${base}/api/brands`, jsonInit('POST', { id: 'acme', title: 'Acme Again' }));
    expect(status).toBe(409);
    expect(String(body.error ?? '')).toBeTruthy();
  });

  it('rejects a non-Latin title without id with 400 (no fallback slug)', async () => {
    const { base } = await startHarness();
    const { status } = await jsonFetch(`${base}/api/brands`, jsonInit('POST', { title: '보독' }));
    expect(status).toBe(400);
  });

  it('rejects a traversal id with 400', async () => {
    const { base } = await startHarness();
    const { status } = await jsonFetch(`${base}/api/brands`, jsonInit('POST', { id: '..', title: 'Evil' }));
    expect(status).toBe(400);
  });
});

describe('PUT /api/brands/:id', () => {
  it('patches title/presentation and preserves deliverables', async () => {
    const { base, brandsDir } = await startHarness();
    writeBrandFixture(brandsDir, 'acme', {
      deliverables: { blog: { file: 'deliverables/blog.md', label: 'Blog' } },
    });
    const { status, body } = await jsonFetch(
      `${base}/api/brands/acme`,
      jsonInit('PUT', { title: 'Acme v2', presentation: { tagline: 'Fresh' } }),
    );
    expect(status).toBe(200);
    expect(body.brand?.title).toBe('Acme v2');
    expect(body.brand?.presentation?.tagline).toBe('Fresh');
    const manifest = JSON.parse(readFileSync(path.join(brandsDir, 'acme', 'manifest.json'), 'utf8'));
    expect(manifest.title).toBe('Acme v2');
    expect(manifest.deliverables?.blog?.file).toBe('deliverables/blog.md');
  });

  it('returns 404 for an unknown brand', async () => {
    const { base } = await startHarness();
    const { status } = await jsonFetch(`${base}/api/brands/nope`, jsonInit('PUT', { title: 'X' }));
    expect(status).toBe(404);
  });
});

describe('PUT /api/brands/:id/docs/:key', () => {
  it("saves brand.md through the 'core' special-case branch (core is not a deliverable key)", async () => {
    const { base, brandsDir } = await startHarness();
    writeBrandFixture(brandsDir, 'acme'); // deliverables 비어 있음 — core가 deliverable 조회로 새면 404 red
    const { status } = await jsonFetch(
      `${base}/api/brands/acme/docs/core`,
      jsonInit('PUT', { body: '# Rewritten core\n' }),
    );
    expect(status).toBe(200);
    expect(readFileSync(path.join(brandsDir, 'acme', 'brand.md'), 'utf8')).toBe('# Rewritten core\n');
  });

  it('saves a registered deliverable doc body', async () => {
    const { base, brandsDir } = await startHarness();
    writeBrandFixture(brandsDir, 'acme', {
      deliverables: { blog: { file: 'deliverables/blog.md' } },
    });
    const { status } = await jsonFetch(
      `${base}/api/brands/acme/docs/blog`,
      jsonInit('PUT', { body: '# New blog doc\n' }),
    );
    expect(status).toBe(200);
    expect(readFileSync(path.join(brandsDir, 'acme', 'deliverables', 'blog.md'), 'utf8')).toBe('# New blog doc\n');
  });

  it('returns 404 for an unregistered deliverable key', async () => {
    const { base, brandsDir } = await startHarness();
    writeBrandFixture(brandsDir, 'acme');
    const { status } = await jsonFetch(
      `${base}/api/brands/acme/docs/ghost`,
      jsonInit('PUT', { body: 'x' }),
    );
    expect(status).toBe(404);
  });

  it('returns 404 for an unknown brand', async () => {
    const { base } = await startHarness();
    const { status } = await jsonFetch(`${base}/api/brands/nope/docs/core`, jsonInit('PUT', { body: 'x' }));
    expect(status).toBe(404);
  });

  it('returns 400 when body is missing', async () => {
    const { base, brandsDir } = await startHarness();
    writeBrandFixture(brandsDir, 'acme');
    const { status } = await jsonFetch(`${base}/api/brands/acme/docs/core`, jsonInit('PUT', {}));
    expect(status).toBe(400);
  });
});

describe('POST /api/brands/:id/deliverables', () => {
  it('adds a channel (manifest entry + scaffold file) with 201', async () => {
    const { base, brandsDir } = await startHarness();
    writeBrandFixture(brandsDir, 'acme');
    const { status, body } = await jsonFetch(
      `${base}/api/brands/acme/deliverables`,
      jsonInit('POST', { key: 'cardnews', label: 'Card News' }),
    );
    expect(status).toBe(201);
    expect(body.brand?.deliverables?.cardnews?.file).toBe('deliverables/cardnews.md');
    expect(readFileSync(path.join(brandsDir, 'acme', 'deliverables', 'cardnews.md'), 'utf8')).toContain('Card News');
  });

  it('rejects a duplicate key with 409', async () => {
    const { base, brandsDir } = await startHarness();
    writeBrandFixture(brandsDir, 'acme', {
      deliverables: { blog: { file: 'deliverables/blog.md' } },
    });
    const { status } = await jsonFetch(
      `${base}/api/brands/acme/deliverables`,
      jsonInit('POST', { key: 'blog' }),
    );
    expect(status).toBe(409);
  });

  it('rejects an invalid key with 400', async () => {
    const { base, brandsDir } = await startHarness();
    writeBrandFixture(brandsDir, 'acme');
    const { status } = await jsonFetch(
      `${base}/api/brands/acme/deliverables`,
      jsonInit('POST', { key: 'Bad Key!' }),
    );
    expect(status).toBe(400);
  });

  it('rejects a missing key with 400', async () => {
    const { base, brandsDir } = await startHarness();
    writeBrandFixture(brandsDir, 'acme');
    const { status } = await jsonFetch(`${base}/api/brands/acme/deliverables`, jsonInit('POST', {}));
    expect(status).toBe(400);
  });

  it('returns 404 for an unknown brand', async () => {
    const { base } = await startHarness();
    const { status } = await jsonFetch(
      `${base}/api/brands/nope/deliverables`,
      jsonInit('POST', { key: 'blog' }),
    );
    expect(status).toBe(404);
  });
});

describe('DELETE /api/brands/:id/deliverables/:key', () => {
  it('removes the manifest entry and the doc file', async () => {
    const { base, brandsDir } = await startHarness();
    writeBrandFixture(brandsDir, 'acme', {
      deliverables: { blog: { file: 'deliverables/blog.md' } },
    });
    const { status, body } = await jsonFetch(`${base}/api/brands/acme/deliverables/blog`, { method: 'DELETE' });
    expect(status).toBe(200);
    expect(body.brand?.deliverables?.blog).toBeUndefined();
    expect(existsSync(path.join(brandsDir, 'acme', 'deliverables', 'blog.md'))).toBe(false);
  });

  it('returns 404 for an unregistered key', async () => {
    const { base, brandsDir } = await startHarness();
    writeBrandFixture(brandsDir, 'acme');
    const { status } = await jsonFetch(`${base}/api/brands/acme/deliverables/ghost`, { method: 'DELETE' });
    expect(status).toBe(404);
  });
});

describe('DELETE /api/brands/:id', () => {
  it('blocks deletion with 409 { projectCount } when projects are bound', async () => {
    const { base, brandsDir, db } = await startHarness();
    writeBrandFixture(brandsDir, 'acme');
    const now = Date.now();
    insertProject(db, {
      id: `project_${randomUUID()}`,
      name: 'Bound project',
      brandId: 'acme',
      createdAt: now,
      updatedAt: now,
    });
    const { status, body } = await jsonFetch(`${base}/api/brands/acme`, { method: 'DELETE' });
    expect(status).toBe(409);
    expect(body.projectCount).toBe(1);
    expect(existsSync(path.join(brandsDir, 'acme'))).toBe(true); // 디렉토리 보존
  });

  it('deletes an unbound brand directory', async () => {
    const { base, brandsDir } = await startHarness();
    writeBrandFixture(brandsDir, 'acme');
    const { status } = await jsonFetch(`${base}/api/brands/acme`, { method: 'DELETE' });
    expect(status).toBe(200);
    expect(existsSync(path.join(brandsDir, 'acme'))).toBe(false);
  });

  it('returns 404 for an unknown brand', async () => {
    const { base } = await startHarness();
    const { status } = await jsonFetch(`${base}/api/brands/nope`, { method: 'DELETE' });
    expect(status).toBe(404);
  });
});
