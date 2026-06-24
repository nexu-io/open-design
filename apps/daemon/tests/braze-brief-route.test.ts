// @ts-nocheck
// Role: Route-level test harness for POST /api/braze/messages/:id/brief.
// Key Features: in-memory SQLite + Express + node:http fetch helper, no supertest.
// Dependencies: vitest, express, better-sqlite3, openDatabase/insertProject/insertConversation from db.ts, braze persistence, braze-routes.ts.
// Notes: openDatabase는 ':memory:' 경로를 허용하지 않으므로 임시 디렉토리를 사용한다.

import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { openDatabase, closeDatabase, insertProject, insertConversation } from '../src/db.js';
import { insertBrazeMessage, updateBrazeMessage } from '../src/braze/persistence.js';
import { registerBrazeRoutes } from '../src/braze-routes.js';

// --- 임시 디렉토리/서버 정리 ---
const tempDirs: string[] = [];
const openServers: http.Server[] = [];

afterEach(async () => {
  // 서버 종료
  await Promise.all(openServers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
  // DB 닫기
  closeDatabase();
  // 임시 디렉토리 정리
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- 하네스 생성 ---
function makeTempDir(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function makeHarness() {
  // openDatabase는 파일 기반 SQLite + 전체 migrate (braze 포함) 수행
  const dbDir = makeTempDir('braze-brief-db-');
  const db = openDatabase(dbDir, { dataDir: path.join(dbDir, '.od') });
  const projectsDir = makeTempDir('braze-brief-projects-');

  const app = express();
  app.use(express.json());

  // PathDeps 최소 stub — 테스트에 필요한 것은 PROJECTS_DIR뿐
  const pathDeps = {
    ARTIFACTS_DIR: '',
    BUNDLED_PETS_DIR: '',
    DESIGN_SYSTEMS_DIR: '',
    DESIGN_TEMPLATES_DIR: '',
    OD_BIN: '',
    PROJECT_ROOT: '',
    PROJECTS_DIR: projectsDir,
    PROMPT_TEMPLATES_DIR: '',
    RUNTIME_DATA_DIR: '',
    RUNTIME_DATA_DIR_CANONICAL: '',
    SKILLS_DIR: '',
    USER_DESIGN_SYSTEMS_DIR: '',
    USER_DESIGN_TEMPLATES_DIR: '',
    USER_SKILLS_DIR: '',
  } as any;

  const http_ = {
    sendApiError: (res: any, status: number, code: string, msg: string) =>
      res.status(status).json({ error: { code, message: msg } }),
  } as any;

  registerBrazeRoutes(app, { db, http: http_, paths: pathDeps } as any);

  return { app, db, projectsDir };
}

// HTTP 요청 헬퍼 — Express app을 임시 포트에서 기동
async function call(
  app: express.Express,
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    openServers.push(server);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      const data = body !== undefined ? JSON.stringify(body) : undefined;
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      };
      const req = http.request(options, (res) => {
        let raw = '';
        res.on('data', (chunk: string) => { raw += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: raw });
          }
        });
      });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  });
}

// plan_confirmed 메시지를 DB에 시드. project와 conversation도 함께 생성.
function seedConfirmedMessage(
  db: any,
  opts: {
    messageId: string;
    projectId: string;
    title?: string;
    status?: string;
    hasPlan?: boolean;
    projectMetadata?: Record<string, unknown>;
  },
) {
  const { messageId, projectId, title = 'Test Message', status = 'plan_confirmed', hasPlan = true } = opts;
  const convId = `${projectId}-conv`;

  insertProject(db, {
    id: projectId,
    name: projectId,
    createdAt: 1,
    updatedAt: 1,
    metadata: opts.projectMetadata,
  });
  insertConversation(db, { id: convId, projectId, title: null, createdAt: 1, updatedAt: 1 });
  insertBrazeMessage(db, {
    id: messageId,
    projectId,
    conversationId: convId,
    title,
    now: 1,
  });
  // status + plan 업데이트
  const patch: any = { status };
  if (hasPlan) {
    patch.plan = { version: 'braze_plan_v1', summary: 'test', variants: [], rejections: [] };
  }
  updateBrazeMessage(db, messageId, patch, 2);
}

// -----------------------------------------------------------------------

describe('POST /api/braze/messages/:id/brief', () => {
  it('200: writes brief.md under the project and records briefPath', async () => {
    const { app, db, projectsDir } = makeHarness();
    seedConfirmedMessage(db, { messageId: 'm1', projectId: 'p1', title: 'My Campaign' });

    const res = await call(app, 'POST', '/api/braze/messages/m1/brief', { markdown: '# Brief\n\n내용' });

    expect(res.status).toBe(200);
    expect(res.body.path).toMatch(/^braze\/m1-.*\/brief\.md$/);
    expect(res.body.message.briefPath).toBe(res.body.path);

    // 실제 파일이 디스크에 기록됐는지 확인
    const diskPath = path.join(projectsDir, 'p1', res.body.path);
    expect(fs.readFileSync(diskPath, 'utf8')).toContain('# Brief');
  });

  it('400: rejects empty markdown', async () => {
    const { app, db } = makeHarness();
    seedConfirmedMessage(db, { messageId: 'm2', projectId: 'p2' });

    const res = await call(app, 'POST', '/api/braze/messages/m2/brief', { markdown: '   ' });

    expect(res.status).toBe(400);
  });

  it('409: rejects status plan_draft (not in allowlist)', async () => {
    const { app, db } = makeHarness();
    seedConfirmedMessage(db, { messageId: 'm3', projectId: 'p3', status: 'plan_draft' });

    const res = await call(app, 'POST', '/api/braze/messages/m3/brief', { markdown: '# X' });

    expect(res.status).toBe(409);
  });

  it('409: rejects when plan is null', async () => {
    const { app, db } = makeHarness();
    seedConfirmedMessage(db, { messageId: 'm4', projectId: 'p4', hasPlan: false });

    const res = await call(app, 'POST', '/api/braze/messages/m4/brief', { markdown: '# X' });

    expect(res.status).toBe(409);
  });

  it('404: returns 404 for unknown message', async () => {
    const { app } = makeHarness();

    const res = await call(app, 'POST', '/api/braze/messages/nope/brief', { markdown: '# X' });

    expect(res.status).toBe(404);
  });

  it('404: returns 404 when project row is missing', async () => {
    const { app, db } = makeHarness();
    const convId = 'p5-conv';
    // FK 끄고 프로젝트 없이 메시지 직접 삽입
    db.pragma('foreign_keys = OFF');
    db.prepare('INSERT INTO conversations (id, project_id, title, session_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('p5-conv', 'p5', null, 'design', 1, 1);
    insertBrazeMessage(db, { id: 'm5', projectId: 'p5', conversationId: convId, title: 't', now: 1 });
    updateBrazeMessage(db, 'm5', {
      status: 'plan_confirmed',
      plan: { version: 'braze_plan_v1', summary: 's', variants: [], rejections: [] },
    }, 2);
    db.pragma('foreign_keys = ON');

    const res = await call(app, 'POST', '/api/braze/messages/m5/brief', { markdown: '# X' });

    expect(res.status).toBe(404);
  });

  it('same-title: two messages with same title do not overwrite each other', async () => {
    const { app, db, projectsDir } = makeHarness();
    // ma를 시드 (project pa 생성)
    seedConfirmedMessage(db, { messageId: 'ma', projectId: 'pa', title: 'shared' });
    // mb는 같은 project pa에 추가 (project는 이미 존재)
    const convId = 'pa-conv';
    insertBrazeMessage(db, {
      id: 'mb', projectId: 'pa', conversationId: convId, title: 'shared', now: 1,
    });
    updateBrazeMessage(db, 'mb', {
      status: 'plan_confirmed',
      plan: { version: 'braze_plan_v1', summary: 's', variants: [], rejections: [] },
    }, 2);

    const resA = await call(app, 'POST', '/api/braze/messages/ma/brief', { markdown: '# A' });
    const resB = await call(app, 'POST', '/api/braze/messages/mb/brief', { markdown: '# B' });

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    // 폴더가 달라야 함 (messageId가 다르므로)
    expect(resA.body.path).not.toBe(resB.body.path);
    // 두 파일 모두 디스크에 존재
    expect(fs.existsSync(path.join(projectsDir, 'pa', resA.body.path))).toBe(true);
    expect(fs.existsSync(path.join(projectsDir, 'pa', resB.body.path))).toBe(true);
    // 내용도 각자
    expect(fs.readFileSync(path.join(projectsDir, 'pa', resA.body.path), 'utf8')).toContain('# A');
    expect(fs.readFileSync(path.join(projectsDir, 'pa', resB.body.path), 'utf8')).toContain('# B');
  });

  it('imported-folder: writes under metadata.baseDir for imported-folder projects', async () => {
    const { app, db } = makeHarness();
    const externalDir = makeTempDir('braze-brief-ext-');
    seedConfirmedMessage(db, {
      messageId: 'm6',
      projectId: 'p6',
      title: 'imported',
      projectMetadata: { baseDir: externalDir },
    });

    const res = await call(app, 'POST', '/api/braze/messages/m6/brief', { markdown: '# Imported' });

    expect(res.status).toBe(200);
    // 실제 파일이 externalDir 하위에 기록됨
    const diskPath = path.join(externalDir, res.body.path);
    expect(fs.readFileSync(diskPath, 'utf8')).toContain('# Imported');
  });

  it('GET includes briefPath after save', async () => {
    const { app, db } = makeHarness();
    seedConfirmedMessage(db, { messageId: 'm7', projectId: 'p7', title: 'brief-get' });

    await call(app, 'POST', '/api/braze/messages/m7/brief', { markdown: '# G' });
    const getRes = await call(app, 'GET', '/api/braze/messages/m7');

    expect(getRes.status).toBe(200);
    expect(getRes.body.message.briefPath).toMatch(/^braze\/m7-.*\/brief\.md$/);
  });
});
