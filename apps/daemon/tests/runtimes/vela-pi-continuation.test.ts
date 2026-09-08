import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { expect, it } from 'vitest';

/** Real Vela + pinned Pi; only the model endpoint is a loopback fixture. */
it.skipIf(!process.env.OD_PI_EVIDENCE_VELA || !process.env.OD_PI_EVIDENCE_PI)(
  'records Pi tool, cold continuation, cancellation and host timeout without child claims',
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-pi-replay-'));
    const version = execFileSync(process.env.OD_PI_EVIDENCE_VELA!, ['--version'], { encoding: 'utf8' }).trim();
    const piVersion = execFileSync(process.execPath, [process.env.OD_PI_EVIDENCE_PI!, '--version'], { encoding: 'utf8' }).trim();
    let calls = 0;
    let resumedWithTool = false;
    let stalled: (() => void) | undefined;
    const server = createServer(async (req, res) => {
      if (req.headers.authorization !== 'Bearer local-replay-key') { res.writeHead(401).end(); return; }
      const pathname = new URL(req.url!, 'http://localhost').pathname;
      if (pathname === '/v1/models') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ data: [{ id: 'pi-replay', architecture: { input_modalities: ['text'], output_modalities: ['text'] }, metadata: { context_budget: 128000 } }] }));
        return;
      }
      if (pathname !== '/v1/chat/completions') { res.writeHead(404).end(); return; }
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      expect(body.model).toBe('pi-replay');
      calls++;
      if (calls === 3) resumedWithTool = body.messages.some((m: { role: string }) => m.role === 'tool');
      res.setHeader('content-type', 'text/event-stream');
      const send = (delta: unknown, finish: string | null) => res.write(`data: ${JSON.stringify({ id: 'replay', object: 'chat.completion.chunk', model: 'pi-replay', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
      if (calls >= 4) { send({ role: 'assistant' }, null); stalled?.(); return; }
      if (calls === 1) {
        send({ role: 'assistant', tool_calls: [{ index: 0, id: 'write-1', type: 'function', function: { name: 'write', arguments: JSON.stringify({ path: 'proof.txt', content: 'pi-tool-evidence' }) } }] }, null);
        send({}, 'tool_calls');
      } else { send({ role: 'assistant', content: 'Completed.' }, null); send({}, 'stop'); }
      res.end(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 } })}\n\ndata: [DONE]\n\n`);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing loopback address');
    let child: ChildProcessWithoutNullStreams | undefined;
    const launch = async () => {
      child = spawn(process.env.OD_PI_EVIDENCE_VELA!, ['agent', 'run', '--runtime', 'pi'], {
        cwd: root,
        env: { PATH: process.env.PATH, HOME: root, AMR_HOME: root, VELA_LINK_URL: `http://127.0.0.1:${address.port}`, VELA_RUNTIME_KEY: 'local-replay-key', VELA_PI_BIN: process.env.OD_PI_EVIDENCE_PI, OPEN_DESIGN_RUN_ID: 'pi-replay-run', OPEN_DESIGN_SESSION_ID: 'pi-replay-session' },
        stdio: 'pipe',
      });
      let next = 0;
      const pending = new Map<number, { resolve: (value: any) => void; reject: (reason: Error) => void }>();
      const events: any[] = [];
      let stderr = '';
      child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-3000); });
      const lines = createInterface({ input: child.stdout });
      lines.on('line', line => {
        const value = JSON.parse(line);
        if (value.id !== undefined) { pending.get(value.id)?.resolve(value); pending.delete(value.id); }
        else events.push(value);
      });
      child.on('exit', () => {
        for (const request of pending.values()) request.reject(new Error(`Vela exited: ${stderr}`));
        pending.clear();
      });
      const notify = (method: string, params: unknown) => child!.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
      const request = (method: string, params: unknown) => {
        const id = ++next;
        return new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`ACP ${method} deadline exceeded`)); }, 20_000);
          pending.set(id, { resolve: v => { clearTimeout(timeout); resolve(v); }, reject: e => { clearTimeout(timeout); reject(e); } });
          child!.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
        });
      };
      const init = await request('initialize', { protocolVersion: 1, clientCapabilities: {} });
      expect(init.result.agentCapabilities.loadSession).toBe(true);
      return { request, notify, events };
    };
    const stop = async () => {
      if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.stdin.end(); await exited; }
    };
    try {
      let host = await launch();
      const created = await host.request('session/new', { cwd: root, mcpServers: [] });
      expect(created.error).toBeUndefined();
      const sessionId = created.result.durableSessionId;
      expect(created.result).toMatchObject({ runtime: 'pi', runtimeVersion: '0.85.1', sessionId });
      await host.request('session/set_model', { sessionId, modelId: 'pi-replay' });
      const prompt = () => host.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'Continue the task.' }] });
      const first = await prompt();
      expect(first.error).toBeUndefined();
      expect(first.result).toMatchObject({ runtime: 'pi', stopReason: 'end_turn' });
      expect(await readFile(path.join(root, 'proof.txt'), 'utf8')).toBe('pi-tool-evidence');
      expect(JSON.stringify(host.events)).toContain('tool_call');
      await stop();
      host = await launch();
      const loaded = await host.request('session/load', { cwd: root, sessionId, mcpServers: [] });
      expect(loaded.error).toBeUndefined();
      expect(loaded.result.durableSessionId).toBe(sessionId);
      await host.request('session/set_model', { sessionId, modelId: 'pi-replay' });
      expect((await prompt()).result.stopReason).toBe('end_turn');
      expect(resumedWithTool).toBe(true);
      for (const timeout of [false, true]) {
        const started = new Promise<void>(resolve => { stalled = resolve; });
        const response = prompt();
        await started;
        if (timeout) await new Promise(resolve => setTimeout(resolve, 100));
        host.notify('session/cancel', { sessionId });
        expect((await response).result.stopReason).toBe('cancelled');
      }
      // No invented child calls or success: this adapter has no child evidence.
      const cases = [
        { caseId: 'main_run', outcome: 'passed', evidence: 'real_pi_acp_end_turn' },
        { caseId: 'tool', outcome: 'passed', evidence: 'real_pi_write_tool_and_file_bytes' },
        { caseId: 'child_success', outcome: 'unavailable', evidence: 'no_child_adapter' },
        { caseId: 'child_failure_parent_recovers', outcome: 'unavailable', evidence: 'no_child_adapter' },
        { caseId: 'cancel', outcome: 'passed', evidence: 'real_pi_session_cancel' },
        { caseId: 'timeout', outcome: 'passed', evidence: 'host_deadline_session_cancel' },
        { caseId: 'resume', outcome: 'passed', evidence: 'new_vela_process_loads_durable_pi_tool_history' },
      ];
      const recordingDigest = `sha256:${createHash('sha256').update(JSON.stringify(cases)).digest('hex')}`;
      if (process.env.OD_PI_EVIDENCE_OUTPUT) await writeFile(process.env.OD_PI_EVIDENCE_OUTPUT, `${JSON.stringify({ fixtureKind: 'sanitized_real_best_effort', runtime: 'vela-pi', velaVersion: version, piVersion, modelEndpoint: 'loopback_fixture', recordingDigest, cases }, null, 2)}\n`);
    } finally {
      await stop();
      server.closeAllConnections();
      server.close();
      await rm(root, { recursive: true, force: true });
    }
  }, 90_000,
);
