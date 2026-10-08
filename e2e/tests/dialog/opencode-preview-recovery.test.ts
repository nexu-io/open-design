import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from 'vitest';
import { T } from '@/timeouts';
import { createToolsDevSuite } from '@/tools-dev/runtime';
import { createAnthropicToolProvider } from '@/vitest/anthropic-tool-provider';
import { requestJson } from '@/vitest/http';
import { createSmokeSuite } from '@/vitest/suite';

const installedCli = process.env.OD_E2E_OPENCODE_BIN;

test.skipIf(!installedCli || process.platform === 'win32')('[P2] OpenCode previews recover on the next turn after a temporary version timeout', async () => {
  const version = execFileSync(installedCli!, ['--version'], { encoding: 'utf8' }).trim();
  const suite = await createSmokeSuite('opencode-preview-recovery');
  const runtime = createToolsDevSuite(suite);
  const configDir = path.join(suite.scratchDir, 'config');
  const cli = path.join(suite.scratchDir, 'opencode-probe-wrapper.ts');
  const unavailable = path.join(suite.scratchDir, 'version-unavailable');
  const callsFile = path.join(suite.scratchDir, 'cli-calls.jsonl');
  const env: Record<string, string> = {
    OPENCODE_BIN: cli, OPENCODE_CONFIG_DIR: configDir,
    OPENCODE_CONFIG: path.join(configDir, 'opencode.json'),
    OPENCODE_TEST_HOME: path.join(suite.scratchDir, 'home'),
    XDG_CONFIG_HOME: path.join(suite.scratchDir, 'xdg-config'),
    XDG_DATA_HOME: path.join(suite.scratchDir, 'xdg-data'),
    XDG_CACHE_HOME: path.join(suite.scratchDir, 'xdg-cache'),
    XDG_STATE_HOME: path.join(suite.scratchDir, 'xdg-state'),
    npm_config_cache: path.join(suite.scratchDir, 'npm-cache'),
    OPENCODE_DISABLE_PROJECT_CONFIG: 'true', OPENCODE_DISABLE_DEFAULT_PLUGINS: 'true',
    OPENCODE_DISABLE_MODELS_FETCH: 'true', OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_PURE: 'false',
  };
  const results: unknown[] = [];
  let success = false;
  let failure: unknown;
  try {
    await mkdir(configDir, { recursive: true });
    await writeFile(unavailable, '');
    // The real CLI handles every run. Only --version is delayed beyond the
    // daemon's existing probe deadline while the marker is present.
    await writeFile(cli, `#!${process.execPath}
import { appendFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify(args) + '\\n');
if (args[0] === '--version' && existsSync(${JSON.stringify(unavailable)})) {
  setTimeout(() => process.exit(2), 4000);
} else {
  const child = spawn(${JSON.stringify(installedCli)}, args, { stdio: 'inherit', env: process.env });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  child.on('error', () => process.exit(1));
  child.on('exit', code => process.exit(code ?? 1));
}
`, { mode: 0o700 });
    await runtime.startWeb(env);
    await requestJson(runtime.url.daemon(), '/api/app-config', { method: 'PUT', body: {
      agentId: 'opencode', agentCliEnv: { opencode: { OPENCODE_BIN: cli } }, onboardingCompleted: true,
      privacyDecisionAt: Date.now(), telemetry: { metrics: false, content: false, artifactManifest: false },
    } });
    const project = await requestJson<{ project: { id: string }; conversationId: string }>(runtime.url.daemon(), '/api/projects', {
      body: { id: randomUUID(), name: 'OpenCode preview recovery', skipDiscoveryBrief: true },
    });
    let firstSessionId: string | undefined;
    for (const round of [0, 1]) {
      const fileName = `recovery-${round}.txt`;
      const content = Array.from({ length: 800 }, (_, i) => `round ${round} line ${i}: ${'long file content '.repeat(8)}\n`).join('');
      const provider = await createAnthropicToolProvider('write', { filePath: fileName, content });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await writeFile(env.OPENCODE_CONFIG!, JSON.stringify({
          model: 'anthropic/claude-sonnet-4-5', small_model: 'anthropic/claude-sonnet-4-5',
          enabled_providers: ['anthropic'], permission: 'allow',
          provider: { anthropic: { options: { baseURL: `${provider.baseUrl}/v1`, apiKey: 'local-fixture-only' } } },
        }));
        // No /api/agents request, window-focus rescan, config API update or
        // daemon restart between rounds; only the injected failure is removed.
        if (round === 1) await rm(unavailable);
        const { runId } = await requestJson<{ runId: string }>(runtime.url.daemon(), '/api/runs', { body: {
          projectId: project.project.id, conversationId: project.conversationId, agentId: 'opencode',
          assistantMessageId: randomUUID(), clientRequestId: randomUUID(),
          message: `Write ${fileName}.`, currentPrompt: `Write ${fileName}.`,
        } });
        void provider.started.then(() => {
          // Real CLI argument generation cannot use a virtual clock. The
          // first fallback turn must span the cache TTL before continuation.
          timer = setTimeout(provider.releaseArguments, T.medium);
        });
        const events: Array<Record<string, unknown>> = [];
        let firstToolAt: number | undefined;
        let early = false;
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
            const event = JSON.parse(data.slice(6));
            events.push(event);
            if (firstToolAt === undefined && event.name === 'write' && ['tool_in_flight', 'tool_use'].includes(event.type)) {
              firstToolAt = Date.now();
              early = provider.timing.argumentsStartedAt > 0 && provider.timing.argumentsDoneAt === 0;
              clearTimeout(timer);
              provider.releaseArguments();
            }
          }
        }
        const run = await requestJson<{ status: string }>(runtime.url.daemon(), `/api/runs/${runId}`);
        const file = await fetch(runtime.url.daemon(`/api/projects/${project.project.id}/raw/${fileName}`));
        const fileCorrect = file.ok && await file.text() === content;
        const uses = events.filter(event => event.type === 'tool_use' && event.name === 'write');
        const calls = (await readFile(callsFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string[]);
        const runs = calls.filter(args => args[0] === 'run');
        const nativeIds = JSON.stringify(events).match(/ses_[a-zA-Z0-9]+/g) ?? [];
        if (round === 0) firstSessionId = nativeIds[0];
        results.push({ round, runId, status: run.status, early, firstToolAt, ...provider.timing, fileCorrect, bytes: Buffer.byteLength(content), calls, nativeIds });
        await suite.report.json(`events-${round}.json`, events);
        await suite.report.json('acceptance.json', { version, results });
        expect(run.status).toBe('succeeded');
        expect(fileCorrect).toBe(true);
        expect(uses).toHaveLength(1);
        expect(events.filter(event => event.type === 'tool_result' && event.toolUseId === uses[0]!.id)).toHaveLength(1);
        expect(early, `round ${round}: first turn must degrade; next turn must recover before arguments finish`).toBe(round === 1);
        if (round === 1) {
          expect(firstSessionId, 'first turn must expose its native session').toBeTruthy();
          expect(runs.at(-1)).toEqual(expect.arrayContaining(['-s', firstSessionId]));
          const preview = events.find(event => event.type === 'tool_in_flight' && event.name === 'write');
          expect(preview?.id).toBe(uses[0]!.id);
        }
      } finally {
        clearTimeout(timer);
        await provider.close();
      }
    }
    success = true;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    await runtime.stopWeb(env);
    console.log(await suite.finalize({ success, error: failure }));
  }
}, 240_000);
