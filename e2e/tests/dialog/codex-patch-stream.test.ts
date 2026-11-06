import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from 'vitest';
import { T } from '@/timeouts';
import { createToolsDevSuite } from '@/tools-dev/runtime';
import { createCodexPatchProvider } from '@/vitest/codex-patch-provider';
import { requestJson } from '@/vitest/http';
import { readRunEvents } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/suite';

const cli = process.env.OD_E2E_CODEX_BIN;
// Red-line acceptance: actual Codex, local model fixture, no real provider account.
// The gate holds incomplete ARGUMENTS; delaying the executed command's stdout
// would test a different capability and would incorrectly pass this regression.
test.skipIf(!cli)('shows an official Codex file preview before patch arguments finish', async () => {
  const version = execFileSync(cli!, ['--version'], { encoding: 'utf8' }).trim().replace('codex-cli ', '');
  const suite = await createSmokeSuite('codex-patch-stream');
  const runtime = createToolsDevSuite(suite);
  const content = Array.from({ length: 800 }, (_, i) => `line ${i}: ${'long file content '.repeat(8)}\n`).join('');
  const input = `*** Begin Patch\n*** Add File: codex-long-command.txt\n${content.slice(0, -1).split('\n').map((line) => `+${line}`).join('\n')}\n*** End Patch\n`;
  const provider = await createCodexPatchProvider(input);
  const env = {
    CODEX_BIN: cli!,
    OD_CODEX_TRANSPORT: 'app-server', OD_CODEX_DISABLE_PLUGINS: '1', OD_CODEX_SANDBOX: 'workspace-write',
  };
  let success = false;
  let failure: unknown;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await mkdir(suite.codexHomeDir, { recursive: true });
    await writeFile(path.join(suite.codexHomeDir, 'config.toml'), `model = "gpt-5.4"
model_provider = "fixture"
[model_providers.fixture]
name = "Local tool-stream acceptance"
base_url = ${JSON.stringify(provider.baseUrl)}
wire_api = "responses"
requires_openai_auth = false
`);
    await runtime.startWeb(env);
    await requestJson(runtime.url.daemon(), '/api/app-config', { method: 'PUT', body: {
      agentId: 'codex', agentCliEnv: { codex: { CODEX_BIN: cli!, CODEX_HOME: suite.codexHomeDir } },
      onboardingCompleted: true, privacyDecisionAt: Date.now(),
      telemetry: { metrics: false, content: false, artifactManifest: false },
    } });
    const project = await requestJson<{ project: { id: string }; conversationId: string }>(runtime.url.daemon(), '/api/projects', {
      body: { id: randomUUID(), name: 'Official patch streaming acceptance', skipDiscoveryBrief: true },
    });
    const { runId } = await requestJson<{ runId: string }>(runtime.url.daemon(), '/api/runs', { body: {
      projectId: project.project.id, conversationId: project.conversationId,
      agentId: 'codex', assistantMessageId: randomUUID(), clientRequestId: randomUUID(),
      message: 'Write the long file with apply_patch.', currentPrompt: 'Write the long file with apply_patch.',
    } });
    const observed: Array<{ at: number; frame: string }> = [];
    const agentEvents: Array<Record<string, any>> = [];
    let firstToolAt: number | null = null;
    let earlyTool = false;
    // A real binary and network stream cannot use Vitest's virtual clock. This
    // is a maximum observation window, released immediately on the expected event.
    const releaseOnDeadline = provider.started.then(() => {
      releaseTimer = setTimeout(provider.releaseArguments, T.short);
    });
    const response = await fetch(runtime.url.daemon(`/api/runs/${runId}/events`));
    if (!response.ok) throw new Error(`Run event stream returned HTTP ${response.status}: ${await response.text()}`);
    const decoder = new TextDecoder();
    const reader = response.body!.getReader();
    let buffer = '';
    for (;;) {
      const { value: chunk, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(chunk, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        observed.push({ at: Date.now(), frame });
        const data = frame.split('\n').find((line) => line.startsWith('data: '));
        const event = data ? JSON.parse(data.slice(6)) as { type?: string; name?: string; input?: { file_path?: string } } : null;
        if (event) agentEvents.push(event);
        const toolPreview = event?.type === 'tool_in_flight'
          && event.name === 'Write' && event.input?.file_path?.endsWith('codex-long-command.txt');
        if (firstToolAt === null && toolPreview) {
          firstToolAt = Date.now();
          earlyTool = provider.timing.argumentsDoneAt === 0;
          clearTimeout(releaseTimer);
          provider.releaseArguments();
        }
      }
    }
    await releaseOnDeadline;
    await suite.report.json('timing.json', { ...provider.timing, firstToolAt, earlyTool });
    await suite.report.json('events.json', observed);
    const run = await requestJson<{ status: string }>(runtime.url.daemon(), `/api/runs/${runId}`);
    expect(run.status).toBe('succeeded');
    expect(provider.userAgents.length).toBeGreaterThan(0);
    expect(provider.userAgents.every(agent => agent.startsWith(`open-design/${version} `))).toBe(true);
    const file = await fetch(runtime.url.daemon(`/api/projects/${project.project.id}/raw/codex-long-command.txt`));
    expect(file.ok).toBe(true);
    expect(await file.text()).toBe(content);
    expect(earlyTool, 'No tool row event arrived while arguments were incomplete; execution streaming does not satisfy this red line').toBe(true);
    const preview = agentEvents.find(event => event.type === 'tool_in_flight' && event.name === 'Write');
    expect(agentEvents.filter(event => event.type === 'tool_use' && event.id === preview?.id)).toHaveLength(1);
    expect(agentEvents.filter(event => event.type === 'tool_result' && event.toolUseId === preview?.id)).toHaveLength(1);
    const sessionId = agentEvents.find(event => typeof event.sessionId === 'string')?.sessionId;
    expect(sessionId).toBeTruthy();
    const followup = await requestJson<{ runId: string }>(runtime.url.daemon(), '/api/runs', { body: {
      projectId: project.project.id, conversationId: project.conversationId,
      agentId: 'codex', assistantMessageId: randomUUID(), clientRequestId: randomUUID(),
      message: 'Confirm the previous write.', currentPrompt: 'Confirm the previous write.',
    } });
    const followupEvents = await readRunEvents(runtime.url.daemon(), followup.runId);
    expect(followupEvents).toContain(sessionId);
    expect(followupEvents).toContain('LONG_WRITE_DONE');
    const followupRun = await requestJson<{ status: string }>(runtime.url.daemon(), `/api/runs/${followup.runId}`);
    expect(followupRun.status).toBe('succeeded');
    await suite.report.json('resume.json', { version, sessionId, runId: followup.runId, status: followupRun.status });
    success = true;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    clearTimeout(releaseTimer);
    provider.releaseArguments();
    await runtime.stopWeb(env);
    await provider.close();
    console.log(await suite.finalize({ success, error: failure }));
  }
}, 180_000);
