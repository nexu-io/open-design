// Role: Daemon HTTP 테스트 — 시나리오 플러그인의 pinned design system이 프로젝트 생성 시 자동 바인딩되는 불변을 검증.
// Key Features: bodoc 자동 바인딩(RED→GREEN), explicit override 우선, no-ref 플러그인 null 유지
// Dependencies: startServer, resolveStampDesignSystemId, vitest
// Notes: port:0으로 dev 런타임과 포트 충돌 없음.

import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

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

describe('design system binding at project create', () => {
  it('(RED→GREEN) pins bodoc from naver-blog manifest when no explicit designSystemId given', async () => {
    // body.designSystemId 없이 pluginId만 넘기면 → manifest의 od.context.designSystem.ref("bodoc")가
    // 자동으로 project.designSystemId에 채워져야 한다. 수정 전에는 null → RED.
    const id = `proj-ds-bind-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name: 'Naver Blog DS Bind', pluginId: 'example-naver-blog' }),
    });
    expect(resp.ok).toBe(true);
    const { project } = (await resp.json()) as { project: { designSystemId?: string | null } };
    // 핵심 불변: 플러그인이 bodoc을 pinning하므로 결과도 bodoc이어야 함.
    expect(project.designSystemId).toBe('bodoc');
  });

  it('explicit body.designSystemId overrides the plugin-pinned one', async () => {
    // 사용자가 명시적으로 다른 design system을 선택한 경우 — 그 값이 우선해야 함.
    // 'apple'은 design-systems/ 디렉터리에 존재 확인됨.
    const id = `proj-ds-override-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
        name: 'Naver Blog DS Override',
        pluginId: 'example-naver-blog',
        designSystemId: 'apple',
      }),
    });
    expect(resp.ok).toBe(true);
    const { project } = (await resp.json()) as { project: { designSystemId?: string | null } };
    // 명시 지정이 플러그인 pin보다 우선해야 함.
    expect(project.designSystemId).toBe('apple');
  });

  it('no-ref plugin (web-prototype) leaves designSystemId null when none given', async () => {
    // web-prototype의 manifest.od.context.designSystem에는 ref 없이 primary:true만 있음.
    // 이 경우 fallback으로 null이 유지되어야 함.
    const id = `proj-ds-noref-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
        name: 'Web Prototype No DS',
        pluginId: 'example-web-prototype',
      }),
    });
    expect(resp.ok).toBe(true);
    const { project } = (await resp.json()) as { project: { designSystemId?: string | null } };
    expect(project.designSystemId).toBeNull();
  });
});
