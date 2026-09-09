import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { expect, it } from 'vitest';
import { AMR_RUNTIMES, type AmrRuntime } from '@open-design/contracts';

type Json = Record<string, any>;
type ReplayConfig = {
  velaBin: string;
  outputDir: string;
  runtimes: Partial<Record<AmrRuntime, { bin?: string; profile?: string }>>;
};

const configPath = process.env.OD_AMR_EVIDENCE_CONFIG;
const configuredReplay: ReplayConfig | null = configPath ? JSON.parse(readFileSync(configPath, 'utf8')) : null;
const model = 'gpt-5.4';
const firstMarker = 'FIRST-AMR-HARNESS-TURN';
const artifact = '<!doctype html><html><body>AMR direct model artifact</body></html>';

/** Real fixed CLI processes. The only simulated component is the local model provider. */
for (const runtime of AMR_RUNTIMES) {
  it.skipIf(!configuredReplay?.runtimes[runtime])(`records real AMR ${runtime} simple-mode evidence without native child claims`, async () => {
    const config = configuredReplay!;
    const entry = config.runtimes[runtime]!;
    if (runtime !== 'none' && !entry.bin) throw new Error(`Missing fixed ${runtime} executable`);
    const root = await mkdtemp(path.join(tmpdir(), `od-${runtime}-replay-`));
    const velaVersion = execFileSync(config.velaBin, ['--version'], { encoding: 'utf8' }).trim();
    const companionVersion = entry.bin
      ? execFileSync(/\.(?:m?js)$/.test(entry.bin) ? process.execPath : entry.bin,
        /\.(?:m?js)$/.test(entry.bin) ? [entry.bin, '--version'] : ['--version'], { encoding: 'utf8' }).trim()
      : null;
    const proofPath = path.join(root, 'proof.txt');
    const proof = `${runtime}-tool-evidence`;
    const backendModel = runtime === 'opencode' ? model : `provider/${model}`;
    let stage: 'initial' | 'resume' | 'cancel' | 'timeout' = 'initial';
    let toolSent = false;
    let resumedWithHistory = false;
    let resumedWithTool = false;
    let calls = 0;
    let completedPrimaryCalls = 0;
    let stalled: (() => void) | undefined;
    let providerClosed: (() => void) | undefined;
    const failures: string[] = [];
    const observations: Array<{ channel: string; stage: string; digest: string }> = [];
    const record = (channel: string, payload: string) => observations.push({
      channel, stage, digest: `sha256:${createHash('sha256').update(payload).digest('hex')}`,
    });
    const headers = { 'content-type': 'text/event-stream' };
    const sendChat = (res: ServerResponse, id: string, delta: unknown, finish: string | null) => {
      res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: backendModel,
        choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
    };
    const server = createServer(async (req, res) => {
      try {
        if (req.headers.authorization !== 'Bearer local-replay-key') throw new Error('Unexpected AMR credential');
        const pathname = new URL(req.url!, 'http://localhost').pathname;
        if (pathname === '/v1/models') {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ data: [{ id: model, architecture: { input_modalities: ['text'], output_modalities: ['text'] },
            metadata: { context_budget: 128000 } }] }));
          return;
        }
        if (pathname !== '/v1/chat/completions' && pathname !== '/v1/responses') throw new Error(`Unexpected endpoint ${pathname}`);
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body: Json = JSON.parse(raw);
        record('http_request', raw);
        if (body.model !== model) throw new Error(`Model changed to ${body.model}`);
        if (runtime === 'none' && (body.tools !== undefined || body.tool_choice !== undefined)) throw new Error('Direct-model request exposed native tools');
        // OpenCode may use its primary provider for a tool-free title request.
        // Answer it without advancing the replay; the main path must still write proof.
        const auxiliary = req.headers['x-amr-request-role'] === 'auxiliary'
          || (runtime === 'opencode' && !(body.tools ?? []).length);
        const id = `replay-${++calls}`;
        res.writeHead(200, headers);
        if (!auxiliary && stage === 'resume') {
          resumedWithHistory ||= raw.includes(firstMarker);
          resumedWithTool ||= raw.includes('function_call_output') || (body.messages ?? []).some((message: Json) => message.role === 'tool');
        }
        if (!auxiliary && (stage === 'cancel' || stage === 'timeout')) {
          if (pathname.endsWith('/responses')) res.write(`event: response.created\ndata: ${JSON.stringify({
            type: 'response.created', response: { id, model: backendModel, status: 'in_progress', output: [] },
          })}\n\n`);
          else sendChat(res, id, { role: 'assistant' }, null);
          res.once('close', () => providerClosed?.());
          stalled?.();
          return;
        }
        if (!auxiliary) completedPrimaryCalls += 1;
        const wantsTool = !auxiliary && stage === 'initial' && runtime !== 'none' && !toolSent;
        const tools: Json[] = body.tools ?? [];
        if (pathname.endsWith('/responses')) {
          const send = (type: string, data: Json) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
          send('response.created', { response: { id, model: backendModel, status: 'in_progress', output: [] } });
          let item: Json;
          if (wantsTool) {
            const tool = tools.find((value) => value.name === 'exec_command' || value.name === 'shell_command');
            if (!tool) throw new Error('CLI did not advertise a command tool');
            const args = JSON.stringify({ [tool.name === 'exec_command' ? 'cmd' : 'command']: `printf ${proof} > proof.txt`, yield_time_ms: 1000, max_output_tokens: 100 });
            item = { id: `fc_${calls}`, type: 'function_call', name: tool.name, call_id: `call_${calls}`, arguments: args, status: 'completed' };
            send('response.output_item.added', { output_index: 0, item: { ...item, arguments: '' } });
            send('response.function_call_arguments.delta', { item_id: item.id, output_index: 0, delta: args });
            toolSent = true;
          } else {
            item = { id: `msg_${calls}`, type: 'message', role: 'assistant', status: 'completed',
              content: [{ type: 'output_text', text: 'Completed.', annotations: [] }] };
            send('response.output_item.added', { output_index: 0, item: { ...item, content: [] } });
            send('response.output_text.delta', { item_id: item.id, output_index: 0, content_index: 0, delta: 'Completed.' });
          }
          send('response.output_item.done', { output_index: 0, item });
          send('response.completed', { response: { id, model: backendModel, status: 'completed', output: [item],
            usage: { input_tokens: 30, output_tokens: 6, total_tokens: 36, input_tokens_details: { cached_tokens: 4 } } } });
          res.end();
          return;
        }
        if (wantsTool) {
          const declaredTools = tools.map((value) => value.function ?? value);
          const tool = declaredTools.find((value) => value.name?.toLowerCase() === (runtime === 'claude' || runtime === 'opencode' ? 'bash' : 'write'));
          if (!tool) throw new Error(`CLI did not advertise expected tool: ${declaredTools.map((value) => value.name).join(',')}`);
          const properties = tool.parameters?.properties ?? {};
          const fileKey = ['file_path', 'filePath', 'path'].find((key) => key in properties);
          if (runtime !== 'claude' && runtime !== 'opencode' && !fileKey) throw new Error('Write tool has no known file-path parameter');
          const args = runtime === 'claude' || runtime === 'opencode'
            ? { command: `printf ${proof} > proof.txt`, description: 'Write local fixture proof' }
            : { [fileKey!]: proofPath, content: proof };
          sendChat(res, id, { role: 'assistant', tool_calls: [{ index: 0, id: `write_${calls}`, type: 'function',
            function: { name: tool.name, arguments: JSON.stringify(args) } }] }, null);
          sendChat(res, id, {}, 'tool_calls');
          toolSent = true;
        } else {
          sendChat(res, id, { role: 'assistant', content: runtime === 'none' ? `<artifact identifier="index" type="text/html">${artifact}</artifact>` : 'Completed.' }, null);
          sendChat(res, id, {}, 'stop');
        }
        res.end(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: backendModel, choices: [],
          usage: { prompt_tokens: 30, completion_tokens: 6, total_tokens: 36 } })}\n\ndata: [DONE]\n\n`);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
        if (!res.headersSent) res.writeHead(500);
        res.end();
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing loopback address');
    let child: ChildProcessWithoutNullStreams | undefined;
    const launch = async () => {
      const companionEnv = runtime === 'none' ? {} : { [`VELA_${runtime.toUpperCase()}_BIN`]: entry.bin };
      child = spawn(config.velaBin, ['agent', 'run', '--runtime', runtime], {
        cwd: root, stdio: 'pipe', env: {
          PATH: process.env.PATH, HOME: root, AMR_HOME: root, VELA_LINK_URL: `http://127.0.0.1:${address.port}`,
          VELA_RUNTIME_KEY: 'local-replay-key', ...companionEnv,
          ...(entry.profile ? { VELA_DSH_PROFILE: entry.profile } : {}),
          OPEN_DESIGN_RUN_ID: `${runtime}-replay-run`, OPEN_DESIGN_SESSION_ID: `${runtime}-replay-conversation`,
        },
      });
      const activeChild = child;
      let next = 0;
      let stderr = '';
      const pending = new Map<number, { resolve: (value: Json) => void; reject: (reason: Error) => void }>();
      const events: Json[] = [];
      activeChild.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-5000); });
      createInterface({ input: activeChild.stdout }).on('line', (line) => {
        try {
          const value: Json = JSON.parse(line);
          record(value.id !== undefined ? 'acp_response' : 'acp_update', line);
          if (value.id !== undefined) { pending.get(value.id)?.resolve(value); pending.delete(value.id); }
          else events.push(value);
        } catch { failures.push('Non-JSON Vela stdout'); }
      });
      activeChild.on('exit', () => {
        for (const request of pending.values()) request.reject(new Error(`Vela exited: ${stderr}`));
        pending.clear();
      });
      const notify = (method: string, params: Json) => activeChild.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
      const request = (method: string, params: Json) => new Promise<Json>((resolve, reject) => {
        const id = ++next;
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`ACP ${method} deadline exceeded: ${stderr}; ${failures.join('; ')}`)); }, 30_000);
        pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
        activeChild.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
      const initialized = await request('initialize', { protocolVersion: 1, clientCapabilities: {} });
      expect(initialized.result?.agentCapabilities?.loadSession).toBe(true);
      return { request, notify, events };
    };
    const stop = async () => {
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      const activeChild = child;
      const exited = once(activeChild, 'exit');
      const terminate = setTimeout(() => activeChild.kill('SIGKILL'), 5000);
      activeChild.stdin.end();
      await exited;
      clearTimeout(terminate);
    };
    try {
      let host = await launch();
      const created = await host.request('session/new', { cwd: root, mcpServers: [] });
      expect(created.error, JSON.stringify(created.error)).toBeUndefined();
      const durable = created.result.durableSessionId ?? created.result.openCodeSessionId;
      expect(typeof durable).toBe('string');
      let sessionId = created.result.sessionId;
      const setModel = async () => expect((await host.request('session/set_model', { sessionId, modelId: model })).error).toBeUndefined();
      await setModel();
      const prompt = (text: string) => host.request('session/prompt', { sessionId, prompt: [{ type: 'text', text }] });
      const first = await prompt(`${firstMarker}. ${runtime === 'none' ? 'Produce index.html as a complete artifact envelope.' : 'Write proof.txt and finish.'}`);
      expect(first.error, JSON.stringify({ error: first.error, failures })).toBeUndefined();
      expect(first.result.stopReason).toBe('end_turn');
      expect(first.result.runtime).toBe(runtime);
      expect(first.result.modelId?.replace(/^amr\//, '')).toBe(model);
      if (runtime !== 'opencode') {
        expect(first.result.modelResponses.length).toBe(completedPrimaryCalls);
        for (const response of first.result.modelResponses) {
          expect(response).toMatchObject({ requestedModelId: model, responseModelId: backendModel });
          expect(response.responseId).toBeTruthy();
        }
      }
      expect(first.result.usage).toMatchObject({
        inputTokens: completedPrimaryCalls * 30, outputTokens: completedPrimaryCalls * 6, totalTokens: completedPrimaryCalls * 36,
      });
      if (runtime === 'none') {
        expect(JSON.stringify(host.events)).toContain(artifact);
        expect(await readFile(path.join(root, 'index.html'), 'utf8')).toBe(artifact);
        expect(JSON.stringify(host.events)).not.toContain('tool_call');
      } else {
        expect(await readFile(proofPath, 'utf8')).toBe(proof);
        expect(JSON.stringify(host.events)).toContain('tool_call');
      }
      await stop();
      stage = 'resume';
      host = await launch();
      const loaded = await host.request('session/load', { cwd: root, sessionId: durable, mcpServers: [] });
      expect(loaded.error, JSON.stringify(loaded.error)).toBeUndefined();
      expect(loaded.result.durableSessionId ?? loaded.result.openCodeSessionId).toBe(durable);
      sessionId = loaded.result.sessionId;
      await setModel();
      const beforeResumeCalls = completedPrimaryCalls;
      const resumed = await prompt('Continue the task from the previous turn.');
      expect(resumed.error, JSON.stringify(resumed.error)).toBeUndefined();
      expect(resumed.result.stopReason).toBe('end_turn');
      expect(resumed.result.runtime).toBe(runtime);
      expect(resumed.result.modelId?.replace(/^amr\//, '')).toBe(model);
      expect(resumed.result.usage).toMatchObject({
        inputTokens: (completedPrimaryCalls - beforeResumeCalls) * 30,
        outputTokens: (completedPrimaryCalls - beforeResumeCalls) * 6,
        totalTokens: (completedPrimaryCalls - beforeResumeCalls) * 36,
      });
      expect(resumedWithHistory).toBe(true);
      if (runtime !== 'none') expect(resumedWithTool).toBe(true);
      for (const mode of ['cancel', 'timeout'] as const) {
        stage = mode;
        const started = new Promise<void>((resolve) => { stalled = resolve; });
        const closed = new Promise<void>((resolve) => { providerClosed = resolve; });
        const response = prompt('Wait for the provider.');
        await Promise.race([started, response.then((value) => { throw new Error(`Prompt ended before provider stall: ${JSON.stringify(value)}`); })]);
        if (mode === 'timeout') await new Promise((resolve) => setTimeout(resolve, 100));
        host.notify('session/cancel', { sessionId });
        const cancelled = await response;
        if (runtime === 'none') {
          expect(cancelled.error?.message, JSON.stringify(cancelled)).toMatch(/cancel/i);
        } else expect(cancelled.result?.stopReason, JSON.stringify(cancelled)).toBe('cancelled');
        let abortDeadline: ReturnType<typeof setTimeout>;
        try {
          await Promise.race([closed, new Promise<never>((_, reject) => {
            abortDeadline = setTimeout(() => reject(new Error('Cancelled provider request stayed connected')), 3000);
          })]);
        } finally { clearTimeout(abortDeadline!); }
      }
      expect(failures).toEqual([]);
      const cases = [
        { caseId: 'main_run', outcome: 'passed', evidence: `real_${runtime}_acp_end_turn` },
        { caseId: 'tool', outcome: runtime === 'none' ? 'unavailable' : 'passed', evidence: runtime === 'none' ? 'text_artifact_only_no_native_tool_loop' : `real_${runtime}_tool_and_file_bytes` },
        { caseId: 'child_success', outcome: 'unavailable', evidence: 'no_child_lifecycle_claim' },
        { caseId: 'child_failure_parent_recovers', outcome: 'unavailable', evidence: 'no_child_lifecycle_claim' },
        { caseId: 'cancel', outcome: 'passed', evidence: `real_${runtime}_session_cancel` },
        { caseId: 'timeout', outcome: 'passed', evidence: 'host_deadline_session_cancel' },
        { caseId: 'resume', outcome: 'passed', evidence: runtime === 'none' ? 'new_vela_process_loads_amr_model_history' : `new_vela_process_loads_${runtime}_tool_history` },
      ];
      const recordingDigest = `sha256:${createHash('sha256').update(JSON.stringify(observations)).digest('hex')}`;
      await mkdir(config.outputDir, { recursive: true });
      await writeFile(path.join(config.outputDir, `vela-${runtime}.json`), `${JSON.stringify({
        fixtureKind: 'sanitized_real_best_effort', runtime: `vela-${runtime}`, velaVersion, companionVersion,
        modelEndpoint: 'loopback_fixture', executionSemantics: runtime === 'none' ? 'amr_model_text_artifact' : 'agent_cli', recordingDigest, observations, cases,
      }, null, 2)}\n`);
    } finally {
      await stop();
      server.closeAllConnections();
      server.close();
      await rm(root, { recursive: true, force: true });
    }
  }, 180_000);
}
