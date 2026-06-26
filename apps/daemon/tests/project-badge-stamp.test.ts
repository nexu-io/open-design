// Role: Daemon HTTP + unit tests for badge stamp at project create and PATCH preservation.
// Key Features: badge pre-insert stamp, badge PATCH immutability, resolveStampBadge unit test
// Dependencies: startServer from server.ts, better-sqlite3, registerBundledPlugins, vitest
// Notes: braze-iam plugin auto-registered at boot via registerBundledPlugins (server.ts)

import type http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { registerBundledPlugins } from '../src/plugins/bundled.js';
import { startServer } from '../src/server.js';
import { resolveStampBadge } from '../src/project-routes.js';

// ── HTTP 통합 테스트 하네스 ──────────────────────────────────────────────────

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as {
    url: string;
    server: http.Server;
  };
  baseUrl = started.url;
  server = started.server;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

// ── resolveStampBadge 순수 헬퍼 단위 테스트 ─────────────────────────────────
// badge는 플러그인 매니페스트에서 파생되며 snapshot resolve와 구조적으로 독립됨.
// 서버 DB 싱글턴을 건드리지 않기 위해 better-sqlite3를 직접 사용.

describe('resolveStampBadge unit', () => {
  let unitDb: InstanceType<typeof Database> | null = null;
  const tempFiles: string[] = [];

  beforeAll(async () => {
    // 서버 DB 싱글턴을 건드리지 않기 위해 파일 경로를 지정한 독립 DB 사용.
    const dbPath = path.join(os.tmpdir(), `badge-unit-${Date.now()}.sqlite`);
    tempFiles.push(dbPath);
    unitDb = new Database(dbPath);
    unitDb.pragma('journal_mode = WAL');
    unitDb.pragma('foreign_keys = ON');

    // resolveStampBadge는 installed_plugins 테이블만 읽는다 — 최소 스키마 직접 생성.
    // migratePlugins는 projects/conversations 테이블을 전제하므로 사용 불가.
    unitDb.exec(`
      CREATE TABLE IF NOT EXISTS installed_plugins (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, version TEXT NOT NULL,
        source_kind TEXT NOT NULL, source TEXT NOT NULL, pinned_ref TEXT,
        source_digest TEXT, source_marketplace_id TEXT,
        source_marketplace_entry_name TEXT, source_marketplace_entry_version TEXT,
        marketplace_trust TEXT, resolved_source TEXT, resolved_ref TEXT,
        manifest_digest TEXT, archive_integrity TEXT,
        trust TEXT NOT NULL, capabilities_granted TEXT NOT NULL,
        manifest_json TEXT NOT NULL, fs_path TEXT NOT NULL,
        installed_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_installed_plugins_source_kind
        ON installed_plugins(source_kind);
    `);

    // 리포 루트 계산: __dirname = apps/daemon/tests → ../../.. = 리포 루트.
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const bundledRoot = path.join(repoRoot, 'plugins', '_official');
    await registerBundledPlugins({ db: unitDb, bundledRoot });
  });

  afterAll(() => {
    try { unitDb?.close(); } catch { /* 무시 */ }
    unitDb = null;
    for (const f of tempFiles) {
      try { fs.unlinkSync(f); } catch { /* 무시 */ }
    }
  });

  it('returns badge from manifest for example-braze-iam', () => {
    const badge = resolveStampBadge(unitDb!, 'example-braze-iam');
    expect(badge).toEqual({ label: 'In-App Message', tone: 'pink' });
  });

  it('returns undefined for null pluginId', () => {
    expect(resolveStampBadge(unitDb!, null)).toBeUndefined();
  });

  it('returns undefined for unknown pluginId', () => {
    expect(resolveStampBadge(unitDb!, 'nonexistent-plugin-xyz')).toBeUndefined();
  });
});

// ── badge create 스탬프 HTTP 통합 테스트 ─────────────────────────────────────
// badge는 프로젝트 create 시 플러그인 매니페스트에서 스탬프됨 (snapshot resolve와 독립).

describe('badge stamp at create', () => {
  it('stamps metadata.badge from the braze manifest', async () => {
    const id = `proj-braze-badge-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
        name: 'Braze IAM',
        pluginId: 'example-braze-iam',
        inputs: { audience: 'test users' },
      }),
    });
    expect(resp.ok).toBe(true);
    const { project } = await resp.json() as { project: { metadata?: { badge?: unknown } } };
    expect(project.metadata?.badge).toEqual({ label: 'In-App Message', tone: 'pink' });
  });

  it('leaves badge undefined for a plain project with no plugin', async () => {
    const id = `proj-plain-badge-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name: 'Plain' }),
    });
    expect(resp.ok).toBe(true);
    const { project } = await resp.json() as { project: { metadata?: { badge?: unknown } } };
    expect(project.metadata?.badge).toBeUndefined();
  });

  it('persists badge in DB row before resolve runs — confirmed via GET /api/projects/:id', async () => {
    // badge는 pre-insert 스탬프됨. resolve 결과와 무관하게 GET 응답에 존재한다.
    const id = `proj-badge-preinsert-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name: 'Badge Preinsert', pluginId: 'example-braze-iam' }),
    });
    expect(resp.ok).toBe(true);
    // GET /api/projects/:id는 DB 행을 직접 읽음 — resolve 결과가 아니다.
    const detail = await fetch(`${baseUrl}/api/projects/${id}`).then((r) => r.json()) as {
      project: { metadata?: { badge?: unknown } };
    };
    expect(detail.project.metadata?.badge).toEqual({ label: 'In-App Message', tone: 'pink' });
  });
});

// ── badge PATCH 보존 HTTP 통합 테스트 ───────────────────────────────────────

describe('badge preservation across PATCH', () => {
  it('preserves badge across a metadata PATCH that omits it', async () => {
    const id = `proj-patch-badge-${Date.now()}`;
    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name: 'B2', pluginId: 'example-braze-iam' }),
    }).then((r) => r.json()) as { project: { id: string } };
    // PATCH omits badge — badge must be preserved.
    await fetch(`${baseUrl}/api/projects/${created.project.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ metadata: { kind: 'prototype' } }),
    });
    const after = await fetch(`${baseUrl}/api/projects/${created.project.id}`).then((r) => r.json()) as {
      project: { metadata?: { badge?: unknown } };
    };
    expect(after.project.metadata?.badge).toEqual({ label: 'In-App Message', tone: 'pink' });
  });

  it('rejects client-supplied badge override in PATCH — server value always wins', async () => {
    // Finding 1 red-green test: badge는 서버 소유. 클라이언트가 badge를 포함해 PATCH해도 거부됨.
    const id = `proj-patch-badge-override-${Date.now()}`;
    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name: 'Badge Override', pluginId: 'example-braze-iam' }),
    }).then((r) => r.json()) as { project: { id: string } };
    // 클라이언트가 badge를 의도적으로 조작하려는 PATCH.
    await fetch(`${baseUrl}/api/projects/${created.project.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        metadata: { kind: 'prototype', badge: { label: 'EVIL', tone: 'neutral' } },
      }),
    });
    const after = await fetch(`${baseUrl}/api/projects/${created.project.id}`).then((r) => r.json()) as {
      project: { metadata?: { badge?: unknown } };
    };
    // 클라이언트 badge 조작은 무시되고 서버 스탬프 값이 유지되어야 함.
    expect(after.project.metadata?.badge).toEqual({ label: 'In-App Message', tone: 'pink' });
  });
});
