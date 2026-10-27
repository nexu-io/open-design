import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect, test } from 'vitest';
import { T } from '@/timeouts';
import { createToolsDevSuite } from '@/tools-dev/runtime';
import { AMR_TEST_WORKSPACE_HEADERS } from '@/vitest/amr';
import { createAmrToolProvider } from '@/vitest/amr-tool-provider';
import { requestJson } from '@/vitest/http';
import { createSmokeSuite } from '@/vitest/suite';

const vela = process.env.OD_E2E_VELA_BIN;
const opencode = process.env.OD_E2E_OPENCODE_BIN;

test.skipIf(!vela || !opencode)('[P2] real AMR previews incomplete long patches and resumes the same session', async () => {
  const versions = {
    vela: execFileSync(vela!, ['--version'], { encoding: 'utf8' }).trim(),
    opencode: execFileSync(opencode!, ['--version'], { encoding: 'utf8' }).trim(),
  };
  const suite = await createSmokeSuite('amr-tool-preview');
  const runtime = createToolsDevSuite(suite);
  const provider = await createAmrToolProvider();
  const env = {
    VELA_BIN: vela!, VELA_OPENCODE_BIN: opencode!,
    VELA_RUNTIME_KEY: 'local-fixture-only', VELA_LINK_URL: provider.baseUrl,
    VELA_API_URL: provider.baseUrl, AMR_HOME: path.join(suite.scratchDir, 'amr'),
    OPEN_DESIGN_AMR_PROFILE: 'local', VELA_PROFILE: 'local',
    XDG_CONFIG_HOME: path.join(suite.scratchDir, 'config'),
    XDG_DATA_HOME: path.join(suite.scratchDir, 'data'),
    XDG_CACHE_HOME: path.join(suite.scratchDir, 'cache'),
    XDG_STATE_HOME: path.join(suite.scratchDir, 'state'),
    OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_DISABLE_MODELS_FETCH: 'true',
    OPENCODE_DISABLE_DEFAULT_PLUGINS: 'true', OD_NEXT_STRATEGY_ROLLOUT: 'off',
  };
  const headers = { ...AMR_TEST_WORKSPACE_HEADERS };
  const results: unknown[] = [];
  let success = false;
  let failure: unknown;
  try {
    await runtime.startWeb(env);
    await requestJson(runtime.url.daemon(), '/api/app-config', { method: 'PUT', body: {
      agentId: 'amr', agentCliEnv: { amr: env },
      agentModels: { amr: { model: 'gpt-5.4-mini', reasoning: 'default' } },
      designSystemId: null, skillId: null, onboardingCompleted: true,
      privacyDecisionAt: Date.now(), telemetry: { metrics: false, content: false, artifactManifest: false },
    } });
    const project = await requestJson<{ project: { id: string }; conversationId: string }>(runtime.url.daemon(), '/api/projects', {
      headers, body: { id: randomUUID(), name: 'AMR long patch preview', skipDiscoveryBrief: true },
    });
    let firstSessionHash: string | undefined;
    for (const round of [0, 1]) {
      const fileName = `amr-long-${round}.txt`;
      const content = Array.from({ length: 800 }, (_, i) => `round ${round} line ${i}: ${'long file content '.repeat(8)}\n`).join('');
      const gate = provider.prepareWrite(fileName, content);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const { runId } = await requestJson<{ runId: string }>(runtime.url.daemon(), '/api/runs', { headers, body: {
          projectId: project.project.id, conversationId: project.conversationId, agentId: 'amr', model: 'gpt-5.4-mini',
          assistantMessageId: randomUUID(), clientRequestId: randomUUID(),
          message: `Write ${fileName}.`, currentPrompt: `Write ${fileName}.`, reasoning: 'default',
        } });
        // A missing preview must fail the early assertion, not deadlock the real CLI.
        void gate.started.then(() => { timer = setTimeout(gate.releaseArguments, T.medium); });
        const events: Array<Record<string, unknown>> = [];
        let firstToolAt: number | undefined;
        let early = false;
        const response = await fetch(runtime.url.daemon(`/api/runs/${runId}/events`), { headers, signal: AbortSignal.timeout(T.xlong) });
        if (!response.ok || !response.body) throw new Error(`Run SSE failed: ${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end: number;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const data = frame.split('\n').find(line => line.startsWith('data: '));
            if (!data) continue;
            const event = JSON.parse(data.slice(6));
            events.push(event);
            if (firstToolAt === undefined && event.type === 'tool_in_flight' && event.name === 'Apply_patch') {
              firstToolAt = Date.now();
              early = gate.timing.argumentsStartedAt > 0 && gate.timing.argumentsDoneAt === 0;
              clearTimeout(timer);
              gate.releaseArguments();
            }
          }
        }
        const run = await requestJson<{ status: string }>(runtime.url.daemon(), `/api/runs/${runId}`, { headers });
        const file = await fetch(runtime.url.daemon(`/api/projects/${project.project.id}/raw/${fileName}`), { headers });
        const fileCorrect = file.ok && await file.text() === content;
        const uses = events.filter(event => event.type === 'tool_use');
        const recovery = events.filter(event => event.type === 'native_session_recovery').at(-1)?.nativeSessionRecovery as { state: string; handle: { sha256?: string } } | undefined;
        const sessionHash = recovery?.handle.sha256;
        results.push({ round, runId, status: run.status, early, firstToolAt, ...gate.timing, fileCorrect, bytes: Buffer.byteLength(content), sessionHash, recovery });
        await suite.report.json(`events-${round}.json`, events);
        await suite.report.json('acceptance.json', { versions, results, requests: provider.requests });
        expect(run.status).toBe('succeeded');
        expect(fileCorrect).toBe(true);
        expect(early, 'AMR must announce the tool before the provider releases complete arguments').toBe(true);
        expect(uses).toHaveLength(1);
        expect(uses[0]!.input).toMatchObject(JSON.parse(gate.arguments));
        const toolResults = events.filter(event => event.type === 'tool_result' && event.toolUseId === uses[0]!.id);
        expect(toolResults).toHaveLength(1);
        expect(toolResults[0]!.isError).toBe(false);
        const preview = events.find(event => event.type === 'tool_in_flight' && event.name === 'Apply_patch');
        expect(preview?.id).toBe(uses[0]!.id);
        expect(preview?.input, 'upstream has announced only the tool type at this point').not.toHaveProperty('patchText');
        expect(sessionHash, 'AMR must capture a durable native session').toBeTruthy();
        if (round === 0) firstSessionHash = sessionHash;
        else {
          expect(sessionHash, 'continuation must reuse the original native handle').toBe(firstSessionHash);
          expect(recovery?.state).toBe('resumed');
        }
      } finally {
        clearTimeout(timer);
        gate.releaseArguments();
      }
    }
    success = true;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    await runtime.stopWeb(env);
    await provider.close();
    console.log(await suite.finalize({ success, error: failure }));
  }
}, 240_000);
