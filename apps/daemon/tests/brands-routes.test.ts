/**
 * Role: /api/brands 계열 HTTP 라우트(list/detail/asset) 부트 테스트
 * Key Features: bodoc 브랜드 실데이터 기준 목록/상세/deliverable/에셋 바이트/경로 traversal 가드 검증
 * Dependencies: 실제 startServer 부트(version-route.test.ts 패턴), brands/bodoc/ 실 콘텐츠
 * Notes: 에셋 traversal 케이스는 인코딩된 ..%2F 경로가 400/403/404 중 하나로 거부되는지만 확인
 */
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

let baseUrl = '';
let server: http.Server;
beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as {
    url: string;
    server: http.Server;
  };
  baseUrl = started.url;
  server = started.server;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('brands routes', () => {
  it('lists brands with bodoc present', async () => {
    const res = await fetch(`${baseUrl}/api/brands`);
    expect(res.ok).toBe(true);
    const json = (await res.json()) as { brands: Array<{ id: string; deliverables: string[] }> };
    const bodoc = json.brands.find((b) => b.id === 'bodoc');
    expect(bodoc?.deliverables.sort()).toEqual(['blog', 'cardnews', 'iam']);
  });
  it('returns brand detail with core body and optional deliverable body', async () => {
    const res = await fetch(`${baseUrl}/api/brands/bodoc?deliverable=cardnews`);
    expect(res.ok).toBe(true);
    const json = (await res.json()) as {
      id: string; body: string; deliverable?: { key: string; body: string };
    };
    expect(json.body).toContain('#1E86FA');
    expect(json.deliverable?.key).toBe('cardnews');
    expect(json.deliverable?.body).toContain('character-sheet');
  });
  it('404s on unknown brand and unknown deliverable', async () => {
    expect((await fetch(`${baseUrl}/api/brands/ghost`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/brands/bodoc?deliverable=nope`)).status).toBe(404);
  });
  it('serves brand asset bytes with traversal guard', async () => {
    const ok = await fetch(`${baseUrl}/api/brands/bodoc/assets/character-sheet.png`);
    expect(ok.ok).toBe(true);
    expect(ok.headers.get('content-type')).toContain('image/png');
    const evil = await fetch(`${baseUrl}/api/brands/bodoc/assets/..%2F..%2Fbodoc-iam%2FDESIGN.md`);
    expect([400, 403, 404]).toContain(evil.status);
  });
});
