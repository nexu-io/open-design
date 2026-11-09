import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('project skill Design Jury integration', () => {
  let server: http.Server;
  let baseUrl: string;
  let fakeBinDir: string;
  const originalPath = process.env.PATH;
  const originalCritiqueEnabled = process.env.OD_CRITIQUE_ENABLED;

  beforeAll(async () => {
    process.env.OD_CRITIQUE_ENABLED = '1';
    fakeBinDir = await mkdtemp(join(tmpdir(), 'od-project-skill-critique-'));
    const fakeQwenPath = join(fakeBinDir, 'qwen');
    await writeFile(
      fakeQwenPath,
      `#!/usr/bin/env node
process.stdin.resume();
process.stdout.write(\`<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
  <ROUND n="1">
    <PANELIST role="designer">
      <NOTES>fixture</NOTES>
      <ARTIFACT mime="text/html"><![CDATA[<html></html>]]></ARTIFACT>
    </PANELIST>
    <PANELIST role="critic" score="9.0"><DIM name="h" score="9">ok</DIM></PANELIST>
    <PANELIST role="brand" score="9.0"><DIM name="v" score="9">ok</DIM></PANELIST>
    <PANELIST role="a11y" score="9.0"><DIM name="c" score="9">ok</DIM></PANELIST>
    <PANELIST role="copy" score="9.0"><DIM name="cl" score="9">ok</DIM></PANELIST>
    <ROUND_END n="1" composite="9.0" must_fix="0" decision="ship">
      <REASON>Ship fixture.</REASON>
    </ROUND_END>
  </ROUND>
  <SHIP round="1" composite="9.0" status="shipped">
    <ARTIFACT mime="text/html"><![CDATA[<html></html>]]></ARTIFACT>
    <SUMMARY>Shipped.</SUMMARY>
  </SHIP>
</CRITIQUE_RUN>
\`);
setTimeout(() => process.exit(0), 250);
`,
      { mode: 0o755 },
    );
    process.env.PATH = `${fakeBinDir}${delimiter}${originalPath ?? ''}`;

    const { startServer } = await import('../src/server.js');
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
    // 冷启动(技能目录 + 设计体系全量扫盘)在这台机器上稳定超过默认的 10s
    // hookTimeout。跑全量时前面的文件已经把这些缓存暖过,单跑这个文件时没有,
    // 于是同一个文件「全量里过、单跑必挂」—— 挂在 hook 上还看不到真正的断言。
  }, 60_000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await rm(fakeBinDir, { recursive: true, force: true });
    if (originalPath == null) delete process.env.PATH;
    else process.env.PATH = originalPath;
    if (originalCritiqueEnabled == null) delete process.env.OD_CRITIQUE_ENABLED;
    else process.env.OD_CRITIQUE_ENABLED = originalCritiqueEnabled;
  });

  it('starts the default-enabled Jury, preserves canonical skill metrics, and hides jury markup from chat', async () => {
    const projectId = `project-skill-label-${randomUUID()}`;
    const createResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Project skill critique label fixture',
        skillId: 'open-design-landing-deck',
        designSystemId: 'sleek',
        metadata: {},
      }),
    });
    expect(createResponse.ok).toBe(true);

    // Simulate a legacy project row that predates skill-id canonicalization.
    // The chat request intentionally carries no request-level skillId.
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for this fixture');
    const { openDatabase } = await import('../src/db.js');
    const db = openDatabase(process.cwd(), { dataDir });
    db.prepare('UPDATE projects SET skill_id = ? WHERE id = ?')
      .run('editorial-collage-deck', projectId);

    const { __resetCritiqueMetricsForTests } = await import('../src/metrics/index.js');
    __resetCritiqueMetricsForTests();

    const chatResponse = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'qwen',
        projectId,
        designSystemId: 'sleek',
        message: 'Create the landing page.',
      }),
    });
    expect(chatResponse.ok).toBe(true);
    const chatBody = await chatResponse.text();

    expect(chatBody).toContain('event: critique.run_started');
    expect(chatBody).toContain('event: end');

    // 2) 兜底剥离:假 CLI 吐的剧场语法一个标记都不许进正文。
    //    这里写死标签名而不是复用 `CRITIQUE_GRAMMAR_TAGS` —— 复用等于拿实现
    //    验实现,实现漏一个标签,断言会跟着一起漏。
    expect(chatBody).not.toMatch(
      /<\/?(?:CRITIQUE_RUN|ROUND|ROUND_END|PANELIST|SHIP|MUST_FIX|RESOLVED)(?=[\s/>])/u,
    );
    // 但标记之间的人话要原样留着 —— 剥壳不吞字。
    expect(chatBody).toContain('Ship fixture.');

    const metricsResponse = await fetch(`${baseUrl}/api/metrics`);
    const metrics = await metricsResponse.text();
    expect(metrics).toContain('skill="open-design-landing-deck"');
    expect(metrics).not.toContain('skill="unknown"');
    expect(metrics).not.toContain('skill="editorial-collage-deck"');
  });

  it('honors an explicit project opt-out', async () => {
    const projectId = `project-skill-label-${randomUUID()}`;
    const createResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId, name: 'Jury opt-out fixture', skillId: 'open-design-landing-deck',
        designSystemId: 'sleek', metadata: { critiqueTheaterEnabled: false },
      }),
    });
    expect(createResponse.ok).toBe(true);
    const chatResponse = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'qwen', projectId, designSystemId: 'sleek', message: 'Create the landing page.' }),
    });
    expect(chatResponse.ok).toBe(true);
    const chatBody = await chatResponse.text();
    expect(chatBody).not.toContain('event: critique.run_started');
    expect(chatBody).toContain('event: critique.skipped');
    expect(chatBody).toContain('disabled for this project');
  });
});
