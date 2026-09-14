import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * 2026-08-26 产品裁决(B46,`specs/current/chat-panel-feedback.md`,落在 52131c2cf6):
 * 评审剧场(Critique Theater)**已下线**。`isCritiqueEnabled` 在总闸上恒返回 false
 * (`apps/daemon/src/critique/rollout.ts` 的 `CRITIQUE_THEATER_RETIRED`),skill /
 * project / env / phase 四层一起失效 —— 提示词不再注入,编排器不再启动。
 *
 * 这个文件**原来**断言的是另一件事:请求没带 skillId 时,评审指标要用项目的
 * **规范** skill id 打标。项目行里存着老 id `editorial-collage-deck`,
 * `resolveSkillId`(`apps/daemon/src/skills.ts` 的 `SKILL_ID_ALIASES`)把它归一成
 * `open-design-landing-deck`,于是 `/api/metrics` 上出现:
 *
 *   open_design_critique_runs_total{status="shipped",adapter="qwen",skill="open-design-landing-deck"} 1
 *
 * 那条归一逻辑**没坏、也没改名**。把 `CRITIQUE_THEATER_RETIRED` 翻成 false,
 * 下面这套 fixture 原封不动,老的三条断言(SSE 上出现 `critique.run_started`、
 * 指标带规范 skill、不带 `skill="unknown"` / `skill="editorial-collage-deck"`)
 * 会全部通过 —— 实测过。坏掉的只是「跑不跑」这一层。
 *
 * 所以 fixture 一行不删,只把期望改成裁决后的样子;哪天要把剧场放回来,照上面
 * 那三条恢复断言即可,不用重建现场。
 *
 * 顺带守住裁决的另一半:这个假 CLI 会把整套 `<CRITIQUE_RUN>` 语法原样打到
 * stdout —— 正是用户在真实客户端里连撞四次的那个形状。编排器不再接管 stdout
 * 之后,这些字节直接走可见文本路径,所以兜底剥离
 * (`apps/daemon/src/panel-grammar-strip.ts`)必须把标记全吃掉、把标记之间的
 * 人话原样留下。这是本仓唯一一条把这套语法推过真实 /api/chat 的用例。
 */
describe('project skill critique label —— 评审剧场已下线', () => {
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

  it('keeps the theater retired for a project that opted in, and lets no panel grammar reach the chat body', async () => {
    const projectId = `project-skill-label-${randomUUID()}`;
    const createResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Project skill critique label fixture',
        skillId: 'open-design-landing-deck',
        designSystemId: 'sleek',
        // 项目级开关打开 —— 裁决前这是优先级最高的「开」信号之一。
        metadata: { critiqueTheaterEnabled: true },
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

    // 1) 总闸关死:项目开关 true + `OD_CRITIQUE_ENABLED=1` 也打不开编排器。
    expect(chatBody).not.toContain('critique.run_started');
    // 这一轮照常走完 legacy 单轮生成 —— 「不跑评审」不等于「这一轮没跑」。
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
    // 3) 编排器没启动 => 一条评审计数都不该落。既然没有序列,也就不存在
    //    把 skill 误标成 `unknown` / `editorial-collage-deck` 的机会。
    expect(metrics).not.toContain('open_design_critique_runs_total{');
  });
});
