/**
 * OPEND-2765 — 红测:`locale` 从 `/api/chat` 一路带到「下一步引导」那段提示词里。
 *
 * 单子上的现象是 zh-CN 环境下三条动态建议全是英文。这三条不是 i18n 文件里的固定
 * 文案,是模型按 `<od-next …>` 协议现写的(`packages/contracts/src/api/next-step-marker.ts`),
 * 所以判据不能落在「模型是否真的写了中文」—— 那不可控。判据落在**我们控制的那一段**:
 * 客户端选的 locale 有没有出现在那段协议提示词里。
 *
 * 为什么必须在 daemon 这一层再钉一遍(contracts 那边已经钉了渲染函数):
 * `# UI locale override` 只在**稳定前缀**里,而 `server.ts` 为了保住上游 prompt cache,
 * resume 轮会整段丢掉它(`includeStableForPayload ? daemonSystemPrompt : ''`);
 * 带 nonce 的「下一步引导」那段却是**每轮都重发**。也就是说这两段的生命周期不一样,
 * 只有在真实组装出来的 prompt 上取证,才能证明 locale 真的跟着到了那一段。
 *
 * 取证方式:假 agent 把 stdin 收到的完整 prompt 落盘,再从里面把
 * `Follow-up suggestions:` 这一段单独切出来断言 —— 不能拿整份 prompt 断言,
 * 因为首轮里稳定前缀自己就带着 `Simplified Chinese`,那样断言永远绿。
 */
import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * 只取「下一步引导」那一段。
 *
 * 三段 host protocol 在 `renderChatTurnHostProtocolInstructions` 里用
 * `\n\n---\n\n` 串起来,所以从 `Follow-up suggestions:` 切到下一个分隔线,
 * 拿到的就是这条协议自己的正文。
 */
function followUpSuggestionsBlock(prompt: string): string {
  const start = prompt.indexOf('Follow-up suggestions:');
  if (start < 0) return '';
  const end = prompt.indexOf('\n---\n', start);
  return end < 0 ? prompt.slice(start) : prompt.slice(start, end);
}

describe('OPEND-2765 下一步引导跟随运行 locale', () => {
  let server: http.Server;
  let baseUrl: string;
  let binDir: string;
  let capturePath: string;
  const originalPath = process.env.PATH;
  const originalCapture = process.env.OD_CAPTURE_PROMPT_PATH;

  beforeAll(async () => {
    binDir = await mkdtemp(join(tmpdir(), 'od-opend2765-'));
    capturePath = join(binDir, 'prompt.txt');
    process.env.OD_CAPTURE_PROMPT_PATH = capturePath;
    const bin = join(binDir, 'opencode');
    await writeFile(
      bin,
      `#!/usr/bin/env node
const fs = require('node:fs');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  fs.writeFileSync(process.env.OD_CAPTURE_PROMPT_PATH, input, 'utf8');
  console.log(JSON.stringify({ type: 'text', part: { text: '好了。' } }));
});
`,
      'utf8',
    );
    await chmod(bin, 0o755);
    process.env.PATH = `${binDir}${delimiter}${originalPath ?? ''}`;

    const { startServer } = await import('../src/server.js');
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
    // 冷启动要扫技能目录 + 设计体系,单跑这个文件时没有别的用例帮忙暖缓存。
  }, 60_000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(binDir, { recursive: true, force: true });
    if (originalPath == null) delete process.env.PATH;
    else process.env.PATH = originalPath;
    if (originalCapture == null) delete process.env.OD_CAPTURE_PROMPT_PATH;
    else process.env.OD_CAPTURE_PROMPT_PATH = originalCapture;
  });

  async function capturePromptForLocale(locale: string | undefined): Promise<string> {
    await rm(capturePath, { force: true });
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'opencode',
        conversationId: `opend2765-${randomUUID()}`,
        message: '做一个 SaaS 落地页。',
        ...(locale === undefined ? {} : { locale }),
      }),
    });
    expect(response.ok).toBe(true);
    // SSE 读到底,确保子进程的 stdin 已经关掉、prompt 已经落盘。
    await response.text();
    return readFile(capturePath, 'utf8');
  }

  it('zh-CN 运行:那段协议提示词自己就带上语言要求', async () => {
    const prompt = await capturePromptForLocale('zh-CN');
    const block = followUpSuggestionsBlock(prompt);

    // 先证明取证器没取空 —— 空串对任何 toContain 都会红,但对 not.toContain 会假绿,
    // 下面那条反向锚点依赖这个前提。
    expect(block).toContain('<od-next key=');
    expect(block).toContain('Simplified Chinese');
    expect(block).toContain('zh-CN');
  }, 60_000);

  it('反向锚点:不带 locale 的运行,这段提示词一个字都不变', async () => {
    const prompt = await capturePromptForLocale(undefined);
    const block = followUpSuggestionsBlock(prompt);

    expect(block).toContain('<od-next key=');
    expect(block).toContain(
      'Write them in the language the user is speaking, and keep each under 120 characters.',
    );
    expect(block).not.toContain('Simplified Chinese');
  }, 60_000);
});
