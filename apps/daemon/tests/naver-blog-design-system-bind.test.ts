// Role: Daemon HTTP 테스트 — 시나리오 플러그인의 pinned design system이 프로젝트 생성 시 자동 바인딩되는 불변을 검증.
// Key Features: explicit override 우선, no-ref 플러그인 null 유지, naver-blog는 브랜드 레일
//               이관 후 designSystem pin이 없음(브랜드 사실은 od.context.brand 소관)을 확인.
// Dependencies: startServer, resolveStampDesignSystemId, vitest
// Notes: port:0으로 dev 런타임과 포트 충돌 없음. bodoc 자동 바인딩 pin은 브랜드/디자인시스템
//        분리(브랜드 레일 도입) 트랙에서 naver-blog 매니페스트가 designSystem.ref를 제거하며
//        폐기됨 — 이 파일의 첫 it는 그 폐기를 계약으로 고정한다.

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
  it('naver-blog manifest no longer pins a design system (brand rail owns brand facts now)', async () => {
    // naver-blog의 od.context.designSystem.ref("bodoc")는 브랜드 레일 이관(od.context.brand)으로
    // 삭제되었다 — 보험 등 브랜드 사실은 이제 brands/bodoc/에서 로드되고, 이 플러그인은 더 이상
    // 디자인시스템을 pin하지 않는다. 따라서 designSystemId는 명시 지정 없이는 null로 남아야 한다.
    const id = `proj-ds-bind-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name: 'Naver Blog DS Bind', pluginId: 'example-naver-blog' }),
    });
    expect(resp.ok).toBe(true);
    const { project } = (await resp.json()) as { project: { designSystemId?: string | null } };
    expect(project.designSystemId).toBeNull();
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
