import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

let server: http.Server;
let baseUrl: string;

async function createProject(body: Record<string, unknown>) {
  const resp = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(resp.ok).toBe(true);
  return (await resp.json()) as {
    project: {
      designSystemId?: string | null;
      appliedPluginSnapshotId?: string;
      metadata?: { badge?: { label?: string } };
    };
  };
}

async function putAppConfig(patch: Record<string, unknown>) {
  const resp = await fetch(`${baseUrl}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(resp.ok).toBe(true);
}

beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as {
    url: string; server: http.Server;
  };
  baseUrl = started.url;
  server = started.server;
});

afterAll(async () => {
  // 다른 스위트로 새지 않게 라우터 설정 원복 (fileParallelism: false — 순차 실행)
  await putAppConfig({ defaultRouterPluginId: null });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('free-form prompt trigger routing at project create (스펙 §4.1)', () => {
  it('(RED→GREEN) ② routes 네이버 블로그 prompt straight to example-naver-blog with bodoc DS + badge', async () => {
    const { project } = await createProject({
      id: `proj-route-naver-${Date.now()}`,
      name: 'route naver',
      pendingPrompt: '네이버 블로그 게시물 작성하자',
      metadata: { kind: 'other' },
      conversationMode: 'design',
    });
    expect(project.designSystemId).toBe('bodoc');
    expect(project.metadata?.badge?.label).toBe('네이버 블로그');
    expect(project.appliedPluginSnapshotId).toBeTruthy();
  });

  it('(RED→GREEN) ③ ambiguous prompt binds the configured default router', async () => {
    await putAppConfig({ defaultRouterPluginId: 'example-bodoc-router' });
    const { project } = await createProject({
      id: `proj-route-ambig-${Date.now()}`,
      name: 'route ambiguous',
      pendingPrompt: '네이버 블로그 글이랑 braze 인앱 메시지 둘 다 고민',
      metadata: { kind: 'other' },
      conversationMode: 'design',
    });
    // bodoc-router 매니페스트가 designSystem.ref bodoc → DS 스탬핑으로 라우터 바인딩을 관측
    expect(project.designSystemId).toBe('bodoc');
    expect(project.appliedPluginSnapshotId).toBeTruthy();
    expect(project.metadata?.badge?.label).toBeUndefined();
  });

  it('(RED→GREEN) M1 gate: explicit deck kind is never hijacked by a vertical keyword', async () => {
    const { project } = await createProject({
      id: `proj-route-deck-${Date.now()}`,
      name: 'route deck',
      pendingPrompt: '네이버 블로그 성과를 요약하는 deck',
      metadata: { kind: 'deck' },
      conversationMode: 'design',
    });
    expect(project.designSystemId ?? null).not.toBe('bodoc');
  });

  it('explicit pluginId still wins (① 현행 유지)', async () => {
    const { project } = await createProject({
      id: `proj-route-explicit-${Date.now()}`,
      name: 'route explicit',
      pluginId: 'example-braze-iam',
      pendingPrompt: '네이버 블로그 게시물 작성하자',
      metadata: { kind: 'other' },
      conversationMode: 'design',
    });
    expect(project.metadata?.badge?.label).toBe('In-App Message');
  });
});
