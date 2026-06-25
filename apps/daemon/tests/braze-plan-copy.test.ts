// Role: BrazePlan variant 카피(heading/body) 계약·왕복 회귀 테스트.
// Key Features: 타입드 BrazePlan 구성으로 heading/body 필드 존재를 컴파일 타임 강제 +
//   PUT /plan → GET 메시지 왕복으로 카피가 plan_json에 영속·반환되는지 검증.
// Dependencies: vitest, express, better-sqlite3, db.ts, braze persistence, braze-routes.ts, @marketing-ax/contracts.
// Notes: 의도적으로 @ts-nocheck 미사용 — 카피 필드가 사라지면 타입체크가 먼저 깨진다.

import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { BrazePlan } from '@marketing-ax/contracts';
import { openDatabase, closeDatabase, insertProject, insertConversation } from '../src/db.js';
import { insertBrazeMessage } from '../src/braze/persistence.js';
import { registerBrazeRoutes } from '../src/braze-routes.js';

const tempDirs: string[] = [];
const openServers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
  closeDatabase();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeTempDir(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function makeHarness() {
  const dbDir = makeTempDir('braze-plan-db-');
  const db = openDatabase(dbDir, { dataDir: path.join(dbDir, '.od') });
  const projectsDir = makeTempDir('braze-plan-projects-');

  const app = express();
  app.use(express.json());

  const http_ = {
    sendApiError: (res: any, status: number, code: string, msg: string) =>
      res.status(status).json({ error: { code, message: msg } }),
  } as any;

  registerBrazeRoutes(app, { db, http: http_, paths: { PROJECTS_DIR: projectsDir } as any } as any);

  // 인터뷰 단계 메시지 시드 (plan PUT 전 메시지만 존재하면 됨)
  insertProject(db, { id: 'p1', name: 'p1', createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: 'p1-conv', projectId: 'p1', title: null, createdAt: 1, updatedAt: 1 });
  insertBrazeMessage(db, { id: 'm1', projectId: 'p1', conversationId: 'p1-conv', title: 't', now: 1 });

  return { app, db };
}

async function call(app: express.Express, method: string, urlPath: string, body?: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    openServers.push(server);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      const data = body !== undefined ? JSON.stringify(body) : undefined;
      const req = http.request(
        { hostname: '127.0.0.1', port, path: urlPath, method, headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } },
        (res) => {
          let raw = '';
          res.on('data', (c: string) => { raw += c; });
          res.on('end', () => {
            try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }); }
            catch { resolve({ status: res.statusCode ?? 0, body: raw }); }
          });
        },
      );
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  });
}

describe('BrazePlanVariant 카피(heading/body)', () => {
  it('PUT /plan → GET 왕복에서 variant별 헤딩·본문 카피가 보존된다', async () => {
    const { app } = makeHarness();

    // 타입드 plan — heading/body가 BrazePlanVariant에서 사라지면 이 리터럴이 컴파일 실패한다.
    const plan: BrazePlan = {
      version: 'braze_plan_v1',
      summary: '신규 가입 온보딩 후킹 IAM',
      iamFormat: 'modal',
      tone: '친근',
      emphasis: ['30초 간편가입'],
      variants: [
        { label: 'A', angle: '혜택 강조', heading: '아직 가입 전이시네요', body: '회원가입하면 흩어진 내 보험을 한눈에 진단해요. 카카오로 30초면 끝나요.' },
        { label: 'B', angle: '긴급성 강조', heading: '오늘만 무료 진단', body: '지금 가입하면 보험 진단을 무료로 받아볼 수 있어요.' },
      ],
      targeting: { triggerEvent: 'session_start', deliveryModel: 'action_based' },
      cta: [{ label: '내 보험 진단 시작하기' }],
      rejections: [],
    };

    const put = await call(app, 'PUT', '/api/braze/messages/m1/plan', { plan });
    expect(put.status).toBe(200);

    const got = await call(app, 'GET', '/api/braze/messages/m1');
    expect(got.status).toBe(200);
    const variants = got.body.message.plan.variants;
    expect(variants[0].heading).toBe('아직 가입 전이시네요');
    expect(variants[0].body).toContain('30초');
    expect(variants[1].heading).toBe('오늘만 무료 진단');
    expect(variants[1].body).toContain('무료');
  });
});
