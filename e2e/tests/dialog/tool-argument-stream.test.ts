import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from 'vitest';
import { T } from '@/timeouts';
import { createToolsDevSuite } from '@/tools-dev/runtime';
import { createAnthropicToolProvider } from '@/vitest/anthropic-tool-provider';
import { requestJson } from '@/vitest/http';
import { createSmokeSuite } from '@/vitest/suite';

for (const [agent, offline] of [['claude', false], ['opencode', false], ['opencode', true]] as const) {
  const installedCli = process.env[`OD_E2E_${agent.toUpperCase()}_BIN`];
  test.skipIf(!installedCli || (offline && process.platform !== 'darwin'))(`[P1] ${agent}${offline ? ' with cold cache and external network denied' : ''} exposes a tool row before long arguments finish`, async () => {
    let cli = installedCli!;
    const version = execFileSync(cli!, ['--version'], { encoding: 'utf8' }).trim();
    const suite = await createSmokeSuite(`${agent}-argument-stream`);
    const runtime = createToolsDevSuite(suite);
    const configDir = path.join(suite.scratchDir, `${agent}-config`);
    const content = Array.from({ length: 800 }, (_, i) => `line ${i}: ${'long file content '.repeat(8).trimEnd()}\n`).join('');
    const fileName = `${agent}-long-arguments.txt`;
    const provider = await createAnthropicToolProvider(agent === 'claude' ? 'Write' : 'write', {
      [agent === 'claude' ? 'file_path' : 'filePath']: fileName, content,
    });
    const env: Record<string, string> = {
      [`${agent.toUpperCase()}_BIN`]: cli!,
      CLAUDE_CONFIG_DIR: configDir,
      ANTHROPIC_BASE_URL: provider.baseUrl, ANTHROPIC_API_KEY: 'local-fixture-only', ANTHROPIC_AUTH_TOKEN: '',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      OPENCODE_CONFIG_DIR: configDir, OPENCODE_CONFIG: path.join(configDir, 'opencode.json'),
      OPENCODE_TEST_HOME: path.join(suite.scratchDir, 'opencode-home'),
      XDG_CONFIG_HOME: path.join(suite.scratchDir, 'xdg-config'),
      XDG_DATA_HOME: path.join(suite.scratchDir, 'xdg-data'),
      XDG_CACHE_HOME: path.join(suite.scratchDir, 'xdg-cache'),
      XDG_STATE_HOME: path.join(suite.scratchDir, 'xdg-state'),
      npm_config_cache: path.join(suite.scratchDir, 'npm-cache'),
      OPENCODE_DISABLE_PROJECT_CONFIG: 'true', OPENCODE_DISABLE_DEFAULT_PLUGINS: 'true',
      OPENCODE_DISABLE_MODELS_FETCH: 'true', OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_PURE: 'false',
    };
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    let success = false;
    let failure: unknown;
    try {
      await mkdir(configDir, { recursive: true });
      if (offline) {
        const profile = path.join(suite.scratchDir, 'offline.sb');
        await writeFile(profile, '(version 1)\n(allow default)\n(deny network*)\n(allow network* (local ip "localhost:*") (remote ip "localhost:*"))\n');
        const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
        cli = path.join(suite.scratchDir, 'offline-opencode');
        await writeFile(cli, `#!/bin/sh\nexec /usr/bin/sandbox-exec -f ${quote(profile)} ${quote(installedCli!)} "$@"\n`, { mode: 0o700 });
        env.OPENCODE_BIN = cli;
      }
      if (agent === 'opencode') await writeFile(env.OPENCODE_CONFIG!, JSON.stringify({
        model: 'anthropic/claude-sonnet-4-5', small_model: 'anthropic/claude-sonnet-4-5',
        enabled_providers: ['anthropic'], permission: 'allow',
        provider: { anthropic: { options: { baseURL: `${provider.baseUrl}/v1`, apiKey: 'local-fixture-only' } } },
      }));
      await runtime.startWeb(env);
      const cliEnv = agent === 'claude'
        ? { CLAUDE_BIN: cli!, CLAUDE_CONFIG_DIR: configDir, ANTHROPIC_BASE_URL: provider.baseUrl, ANTHROPIC_API_KEY: 'local-fixture-only' }
        : { OPENCODE_BIN: cli! };
      await requestJson(runtime.url.daemon(), '/api/app-config', { method: 'PUT', body: {
        agentId: agent, agentCliEnv: { [agent]: cliEnv }, onboardingCompleted: true,
        privacyDecisionAt: Date.now(), telemetry: { metrics: false, content: false, artifactManifest: false },
      } });
      // Populate advertised capabilities through the same detection endpoint the UI uses.
      await requestJson(runtime.url.daemon(), '/api/agents');
      const project = await requestJson<{ project: { id: string }; conversationId: string }>(runtime.url.daemon(), '/api/projects', {
        body: { id: randomUUID(), name: `${agent} long argument acceptance`, skipDiscoveryBrief: true },
      });
      const { runId } = await requestJson<{ runId: string }>(runtime.url.daemon(), '/api/runs', { body: {
        projectId: project.project.id, conversationId: project.conversationId, agentId: agent,
        assistantMessageId: randomUUID(), clientRequestId: randomUUID(),
        message: `Write ${fileName}.`, currentPrompt: `Write ${fileName}.`,
      } });
      const events: Array<{ at: number; event: Record<string, unknown> }> = [];
      let firstToolAt: number | null = null;
      let earlyTool = false;
      // A local real CLI cannot use a virtual clock. Release on observation;
      // the deadline only lets an unsupported CLI finish and expose its late event.
      void provider.started.then(() => { releaseTimer = setTimeout(provider.releaseArguments, T.medium); });
      const response = await fetch(runtime.url.daemon(`/api/runs/${runId}/events`));
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
          const event = JSON.parse(data.slice(6)) as Record<string, unknown>;
          events.push({ at: Date.now(), event });
          const fileTool = ['tool_input_target', 'tool_in_flight', 'tool_use'].includes(String(event.type))
            && ['Write', 'write'].includes(String(event.name))
            && (agent === 'opencode' || JSON.stringify(event).includes(fileName));
          if (firstToolAt === null && fileTool) {
            firstToolAt = Date.now();
            earlyTool = provider.timing.argumentsStartedAt > 0 && provider.timing.argumentsDoneAt === 0;
            clearTimeout(releaseTimer);
            provider.releaseArguments();
          }
        }
      }
      const run = await requestJson<{ status: string }>(runtime.url.daemon(), `/api/runs/${runId}`);
      const file = await fetch(runtime.url.daemon(`/api/projects/${project.project.id}/raw/${fileName}`));
      const fileCorrect = file.ok && await file.text() === content;
      await suite.report.json('acceptance.json', {
        agent, version, offline, runId, ...provider.timing, firstToolAt, earlyTool, status: run.status,
        fileCorrect, bytes: Buffer.byteLength(content), requests: provider.requests,
      });
      await suite.report.json('events.json', events);
      expect(provider.timing.argumentsStartedAt, 'The actual CLI never requested the fixture tool').toBeGreaterThan(0);
      expect(run.status).toBe('succeeded');
      expect(fileCorrect, 'The real CLI must execute the write, not just echo a mock event').toBe(true);
      expect(earlyTool, 'No tool row arrived before tool arguments finished; late execution events do not satisfy the red line').toBe(true);
      const uses = events.filter(({ event }) => event.type === 'tool_use' && ['Write', 'write'].includes(String(event.name)));
      expect(uses).toHaveLength(1);
      expect(events.filter(({ event }) => event.type === 'tool_result' && event.toolUseId === uses[0]!.event.id)).toHaveLength(1);
      if (agent === 'opencode') {
        const preview = events.find(({ event }) => event.type === 'tool_in_flight')!.event;
        expect(preview.id).toBe(uses[0]!.event.id);
        expect(preview.input).toEqual({}); // Upstream drops argument deltas; never invent a filename.
      }
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
}
