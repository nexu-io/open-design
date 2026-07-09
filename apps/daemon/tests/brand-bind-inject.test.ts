// Role: 브랜드 레일 E2E 불변식 — 시나리오 플러그인 create→stamp(persist)→run 주입을 HTTP 경계에서 고정.
// Key Features: (1) 플러그인 create 시 brandId/brandDeliverable 스탬프 + GET 라운드트립 persist,
//               (2) 실제 /api/runs 스폰 경로에서 fake claude가 stdin으로 받은 composed prompt에
//                   Active brand/Brand deliverable 블록이 실리는지 캡처 검증 (DS 레일
//                   naver-blog-design-system-bind.test.ts 의 브랜드 레일 대칭).
// Dependencies: startServer, mocks 없이 PATH-shim fake claude (mcp-spawn.test.ts 패턴 미러)
// Notes: claude 런타임은 promptInputFormat 'stream-json' — composed prompt가 stdin의 첫
//        JSONL user 메시지로 전달된다(server.ts). shim은 첫 줄 수신 즉시 캡처 파일에 쓰고
//        result 프레임을 내보내 run을 succeeded로 종료시킨다. 브랜드 없는 프로젝트의
//        네거티브 케이스가 "마커가 브랜드 레일에서만 유래"함을 함께 고정한다.

import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

let server: http.Server;
let baseUrl: string;
const projectsToClean: string[] = [];

beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as {
    url: string;
    server: http.Server;
  };
  baseUrl = started.url;
  server = started.server;
});

afterAll(async () => {
  for (const id of projectsToClean.splice(0)) {
    await fetch(`${baseUrl}/api/projects/${id}`, { method: 'DELETE' }).catch(() => {});
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

type ProjectShape = {
  brandId?: string | null;
  brandDeliverable?: string | null;
};

async function createProject(body: Record<string, unknown>): Promise<ProjectShape> {
  const resp = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(resp.ok).toBe(true);
  projectsToClean.push(body.id as string);
  const { project } = (await resp.json()) as { project: ProjectShape };
  return project;
}

async function getProjectOverHttp(id: string): Promise<ProjectShape> {
  const resp = await fetch(`${baseUrl}/api/projects/${id}`);
  expect(resp.ok).toBe(true);
  const { project } = (await resp.json()) as { project: ProjectShape };
  return project;
}

// fake `claude` — stdin의 첫 JSONL 라인(= composed prompt를 담은 user 메시지)을
// 캡처 파일에 쓴 뒤 성공 result 프레임을 내보내고 종료한다. stdin이 4초 내
// 안 오면 빈 캡처라도 남기고 종료해 테스트가 단언 단계에서 시끄럽게 죽게 한다.
async function withCapturingClaude<T>(
  run: (captureFile: string) => Promise<T>,
): Promise<T> {
  const dir = await fsp.mkdtemp(join(tmpdir(), 'od-brand-inject-bin-'));
  const captureFile = join(dir, 'prompt-capture.jsonl');
  const oldPath = process.env.PATH;
  const oldClaudeBin = process.env.CLAUDE_BIN;
  const oldAgentHome = process.env.MAX_AGENT_HOME;
  const script = `
const fs = require('node:fs');
let acc = '';
let done = false;
const finish = () => {
  if (done) return;
  done = true;
  fs.writeFileSync(${JSON.stringify(captureFile)}, acc);
  const out = {
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 1,
    total_cost_usd: 0,
    usage: { input_tokens: 1, output_tokens: 1 },
    result: 'ok',
  };
  console.log(JSON.stringify(out));
  process.exit(0);
};
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  acc += c;
  if (acc.includes('\\n')) finish();
});
process.stdin.on('end', finish);
setTimeout(finish, 4000);
`;
  try {
    if (process.platform === 'win32') {
      const runner = join(dir, 'claude-test-runner.cjs');
      await fsp.writeFile(runner, script);
      await fsp.writeFile(
        join(dir, 'claude.cmd'),
        `@echo off\r\nnode "${runner}" %*\r\n`,
      );
    } else {
      const bin = join(dir, 'claude');
      await fsp.writeFile(bin, `#!/usr/bin/env node\n${script}`);
      await fsp.chmod(bin, 0o755);
    }
    process.env.PATH = `${dir}${delimiter}${oldPath ?? ''}`;
    delete process.env.CLAUDE_BIN;
    process.env.MAX_AGENT_HOME = dir;
    return await run(captureFile);
  } finally {
    process.env.PATH = oldPath;
    if (oldClaudeBin === undefined) delete process.env.CLAUDE_BIN;
    else process.env.CLAUDE_BIN = oldClaudeBin;
    if (oldAgentHome === undefined) delete process.env.MAX_AGENT_HOME;
    else process.env.MAX_AGENT_HOME = oldAgentHome;
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function waitForRunStatus(runId: string): Promise<{ status: string }> {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const r = await fetch(`${baseUrl}/api/runs/${runId}`);
    const body = (await r.json()) as { status: string };
    if (body.status !== 'queued' && body.status !== 'running') return body;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('run did not finish within 12s of polling');
}

// 캡처된 첫 JSONL user 메시지에서 composed prompt 텍스트를 꺼낸다.
async function capturedPromptText(captureFile: string): Promise<string> {
  const raw = await fsp.readFile(captureFile, 'utf8');
  const firstLine = raw.split('\n').find((l) => l.trim().length > 0);
  expect(firstLine, 'fake claude가 stdin으로 프롬프트를 받지 못함').toBeTruthy();
  const msg = JSON.parse(firstLine!) as {
    message: { content: Array<{ type: string; text: string }> };
  };
  const text = msg.message.content.find((c) => c.type === 'text')?.text;
  expect(text).toBeTruthy();
  return text!;
}

async function runChatAndCapture(projectId: string, captureFile: string): Promise<string> {
  const chatRes = await fetch(`${baseUrl}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agentId: 'claude', projectId, message: 'hello brand rail' }),
  });
  expect(chatRes.status).toBe(202);
  const { runId } = (await chatRes.json()) as { runId: string };
  const status = await waitForRunStatus(runId);
  expect(status.status).toBe('succeeded');
  return capturedPromptText(captureFile);
}

describe('brand binding at project create (HTTP persist)', () => {
  it('cardnews-instagram plugin stamps brandId + deliverable and persists through GET', async () => {
    const id = `proj-brand-bind-${randomUUID()}`;
    const created = await createProject({
      id,
      name: 'Brand Bind Cardnews',
      pluginId: 'example-cardnews-instagram',
    });
    expect(created.brandId).toBe('bodoc');
    expect(created.brandDeliverable).toBe('cardnews');

    // create 응답이 아닌 재조회로 실제 DB persist를 단언한다.
    const fetched = await getProjectOverHttp(id);
    expect(fetched.brandId).toBe('bodoc');
    expect(fetched.brandDeliverable).toBe('cardnews');
  });

  it('naver-blog plugin stamps the blog deliverable', async () => {
    const id = `proj-brand-bind-${randomUUID()}`;
    const created = await createProject({
      id,
      name: 'Brand Bind Blog',
      pluginId: 'example-naver-blog',
    });
    expect(created.brandId).toBe('bodoc');
    expect(created.brandDeliverable).toBe('blog');
  });

  it('plugin without od.context.brand leaves brand fields unset', async () => {
    const id = `proj-brand-bind-${randomUUID()}`;
    const created = await createProject({
      id,
      name: 'Brand Bind None',
      pluginId: 'example-web-prototype',
    });
    // rowToProject가 미보유 브랜드를 undefined로 정규화 → JSON 직렬화에서 필드 자체가 빠진다.
    expect(created.brandId ?? null).toBeNull();
    expect(created.brandDeliverable ?? null).toBeNull();
  });
});

describe('brand injection at run spawn (HTTP, fake claude stdin capture)', () => {
  it('composed prompt carries Active brand core + deliverable blocks for a bound project', async () => {
    await withCapturingClaude(async (captureFile) => {
      const id = `proj-brand-inject-${randomUUID()}`;
      await createProject({
        id,
        name: 'Brand Inject Cardnews',
        pluginId: 'example-cardnews-instagram',
      });
      const prompt = await runChatAndCapture(id, captureFile);
      // 블록 헤더 = composeSystemPrompt 브랜드 게이트 통과 증거 (brandCoreMd 로드 시에만 출력).
      expect(prompt).toContain('## Active brand — 보닥');
      expect(prompt).toContain('## Brand deliverable context — cardnews');
      // 팔레트 정본 마커 — brand.md 본문이 실제로 실렸는지 (헤더만 스텁 주입되는 회귀 방지).
      expect(prompt).toContain('#1E86FA');
    });
  }, 30_000);

  it('project without brand binding gets no brand blocks', async () => {
    await withCapturingClaude(async (captureFile) => {
      const id = `proj-brand-inject-${randomUUID()}`;
      await createProject({ id, name: 'Brand Inject None' });
      const prompt = await runChatAndCapture(id, captureFile);
      // 네거티브 컨트롤 — 마커가 베이스라인 프롬프트가 아닌 브랜드 레일에서만 유래함을 고정.
      expect(prompt).not.toContain('## Active brand');
      expect(prompt).not.toContain('## Brand deliverable context');
    });
  }, 30_000);
});
