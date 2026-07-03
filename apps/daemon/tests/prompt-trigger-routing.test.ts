import type http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

let server: http.Server;
let baseUrl: string;
const tempDirs: string[] = [];

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
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
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

  it('(RED→GREEN) external-location create with no metadata keeps the prototype kind fallback', async () => {
    // 앞 테스트(③)가 설정한 defaultRouterPluginId 누수 차단 — 이 케이스는 라우터 미설정이 전제
    await putAppConfig({ defaultRouterPluginId: null });
    const extDir = mkdtempSync(path.join(tmpdir(), 'od-route-ext-'));
    tempDirs.push(extDir);
    const locResp = await fetch(`${baseUrl}/api/project-locations`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locations: [{ id: 'route-ext', name: 'Route External', path: extDir }] }),
    });
    expect(locResp.ok).toBe(true);

    // 회귀 케이스: metadata·pendingPrompt 없이 projectLocationId만 — projectMetadata 빌드가
    // kind 'prototype'을 주입하므로 example-web-prototype이 pin돼야 한다 (free-form 아님).
    const { project } = await createProject({
      id: `proj-route-ext-${Date.now()}`,
      name: 'route external',
      projectLocationId: 'route-ext',
    });
    expect(project.appliedPluginSnapshotId).toBeTruthy();
    const snapResp = await fetch(
      `${baseUrl}/api/applied-plugins/${project.appliedPluginSnapshotId}`,
    );
    expect(snapResp.ok).toBe(true);
    const snap = (await snapResp.json()) as { pluginId?: string };
    expect(snap.pluginId).toBe('example-web-prototype');
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

describe('router re-match handoff at run-start (스펙 §4.2)', () => {
  it('(RED→GREEN) form answer re-pins the conversation to the chosen vertical', async () => {
    await putAppConfig({ defaultRouterPluginId: 'example-bodoc-router' });
    const projectId = `proj-rematch-${Date.now()}`;
    const created = await createProject({
      id: projectId,
      name: 'rematch',
      pendingPrompt: '뭔가 콘텐츠 하나 만들어보자',
      metadata: { kind: 'other' },
      conversationMode: 'design',
    });
    const routerSnapshotId = created.project.appliedPluginSnapshotId;
    expect(routerSnapshotId).toBeTruthy();

    // 존재하지 않는 agentId를 지정 — 스냅샷 resolve(+re-pin, :11303)는 agent 해석(:11355)
    // 전에 실행되므로 run 자체가 실패해도 pin 전환은 관측된다 (토큰/모의 CLI 불필요).
    // 주의: 필드명은 agentId (meta = {...requestBody}, server.ts:11325 — `agent`는 무시되어
    // firstAvailable 폴백으로 실제 agent가 스폰될 수 있음. 독립리뷰 A2 caveat 정정).
    await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        agentId: 'definitely-not-installed-agent',
        currentPrompt:
          '[form answers — bodoc-route]\n- 무엇을 만들까요?: 네이버 블로그 글 [value: naver-blog]',
        message:
          '[form answers — bodoc-route]\n- 무엇을 만들까요?: 네이버 블로그 글 [value: naver-blog]',
      }),
    }).catch(() => {});

    const detail = await fetch(`${baseUrl}/api/projects/${projectId}`);
    expect(detail.ok).toBe(true);
    const { project } = (await detail.json()) as {
      project: { appliedPluginSnapshotId?: string };
    };
    expect(project.appliedPluginSnapshotId).toBeTruthy();
    expect(project.appliedPluginSnapshotId).not.toBe(routerSnapshotId);
  });

  it('non-router pin is left untouched by vertical keywords mid-conversation', async () => {
    const projectId = `proj-norematch-${Date.now()}`;
    const created = await createProject({
      id: projectId,
      name: 'no rematch',
      pendingPrompt: '네이버 블로그 게시물 작성하자',
      metadata: { kind: 'other' },
      conversationMode: 'design',
    });
    const pinned = created.project.appliedPluginSnapshotId;
    await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        agentId: 'definitely-not-installed-agent',
        currentPrompt: 'braze 인앱 메시지 얘기도 참고로 넣어줘',
        message: 'braze 인앱 메시지 얘기도 참고로 넣어줘',
      }),
    }).catch(() => {});
    const detail = await fetch(`${baseUrl}/api/projects/${projectId}`);
    const { project } = (await detail.json()) as { project: { appliedPluginSnapshotId?: string } };
    expect(project.appliedPluginSnapshotId).toBe(pinned);
  });
});
