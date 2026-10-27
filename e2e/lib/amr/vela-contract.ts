import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RuntimeScenario } from '../../resources/amr-continuation-frames.ts';

export interface RpcFrame {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: Record<string, unknown> };
}
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** Real Vela, synthetic OpenCode SSE. No provider credentials or model calls. */
export async function runVelaContract(options: { binary: string; directory: string; scenario: RuntimeScenario; cancel?: boolean; loadSessionId?: string; continuation?: Record<string, unknown> }) {
  if (process.platform === 'win32') throw new Error('the synthetic OpenCode launcher currently requires POSIX');
  const directory = resolve(options.directory);
  await mkdir(directory, { recursive: true });
  const amrHome = join(directory, 'amr');
  await mkdir(amrHome, { recursive: true });
  const apiRequests: string[] = [];
  const api = createServer((req, res) => {
    apiRequests.push(`${req.method} ${req.url}`);
    if (req.url?.startsWith('/v1/models')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: [{ id: 'contract-model', context_budget: 128_000 }, { id: 'opencode-auxiliary', context_budget: 128_000 }] }));
    } else { res.writeHead(404).end('unsupported synthetic API request'); }
  });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  try {
    const address = api.address();
    if (!address || typeof address === 'string') throw new Error('missing mock API address');
    const origin = `http://127.0.0.1:${address.port}`;
    await writeFile(join(amrHome, 'config.json'), JSON.stringify({ profiles: { local: { runtimeKey: 'synthetic-runtime-key', apiUrl: origin, linkUrl: origin, user: { id: 'contract-user', email: 'contract@example.invalid' } } } }));
    await chmod(join(amrHome, 'config.json'), 0o600);
    const wrapper = join(directory, 'opencode-fixture');
    const fixture = fileURLToPath(new URL('../../resources/amr-opencode-server.ts', import.meta.url));
    await writeFile(wrapper, `#!/bin/sh\nexec ${quote(process.execPath)} --experimental-strip-types ${quote(fixture)} "$@"\n`, { mode: 0o755 });
    const ledgerPath = join(directory, 'requests.jsonl');
    await writeFile(ledgerPath, '');
    const received: RpcFrame[] = [];
    const sent: RpcFrame[] = [];
    const receivedAtNs = new Map<RpcFrame, string>();
    let stderr = '';
    let buffer = '';
    const child = spawn(resolve(options.binary), ['agent', 'run'], {
      cwd: directory,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, AMR_HOME: amrHome, VELA_PROFILE: 'local', VELA_API_URL: origin, VELA_LINK_URL: origin,
        VELA_OPENCODE_BIN: wrapper, OD_CONTRACT_SCENARIO: options.scenario, OD_CONTRACT_LEDGER: ledgerPath,
        OTEL_SDK_DISABLED: 'true' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const closed = new Promise<void>((done) => child.once('close', () => done()));
    let processError: Error | undefined;
    child.on('error', error => { processError = error; });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.stdout.on('data', chunk => {
      buffer += chunk.toString();
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (line.trim()) {
          try {
            const frame = JSON.parse(line) as RpcFrame;
            received.push(frame); receivedAtNs.set(frame, process.hrtime.bigint().toString());
          }
          catch { processError = new Error('Vela emitted a non-JSON protocol frame'); }
        }
      }
    });
    const send = (frame: RpcFrame) => { sent.push(frame); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...frame })}\n`); };
    async function waitFor(predicate: (frame: RpcFrame) => boolean): Promise<RpcFrame> {
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        const match = received.find(predicate);
        if (match) return match;
        if (processError || child.exitCode !== null || child.signalCode !== null) throw new Error(`Vela exited before contract response: ${processError?.message ?? stderr}`);
        await new Promise(done => setTimeout(done, 10));
      }
      throw new Error(`Vela contract response timed out: ${JSON.stringify(received)}\n${stderr}`);
    }
    try {
      send({ id: 1, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: 'open-design-contract', version: '1' } } });
      const initialize = await waitFor(frame => frame.id === 1);
      if (initialize.error) throw new Error(initialize.error.message);
      send({ id: 2, method: options.loadSessionId ? 'session/load' : 'session/new', params: { cwd: directory, mcpServers: [], ...(options.loadSessionId ? { sessionId: options.loadSessionId } : {}) } });
      const session = await waitFor(frame => frame.id === 2);
      if (session.error) throw new Error(`session/new: ${session.error.message}\n${stderr}`);
      const sessionId = session.result?.sessionId;
      send({ id: 3, method: 'session/set_model', params: { sessionId, modelId: 'contract-model' } });
      const model = await waitFor(frame => frame.id === 3);
      if (model.error) throw new Error(model.error.message);
      send({ id: 4, method: options.continuation ? '_session/continue' : 'session/prompt', params: { sessionId, ...(options.continuation ? { continuation: options.continuation } : { prompt: [{ type: 'text', text: 'Run synthetic compaction contract.' }] }) } });
      if (options.cancel) {
        await waitFor(frame => frame.method === 'session/update' && JSON.stringify(frame).includes('write-once'));
        send({ method: 'session/cancel', params: { sessionId } });
      }
      const terminal = await waitFor(frame => frame.id === 4);
      const openCodeEvents = (await readFile(ledgerPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as { atNs: string; phase: string; method: string; path: string; body: unknown });
      return { terminalReceivedAtNs: receivedAtNs.get(terminal)!, openCodeEvents, scope: 'real-vela-synthetic-opencode', initialize, session, terminal, sent, received, apiRequests,
        openCodeRequests: openCodeEvents.filter(event => event.phase === 'request'), stderr };
    } finally {
      child.stdin.end();
      const timer = setTimeout(() => child.kill('SIGTERM'), 3_000);
      const force = setTimeout(() => child.kill('SIGKILL'), 6_000);
      try { await closed; } finally {
        clearTimeout(timer); clearTimeout(force);
      }
    }
  } finally {
    api.closeAllConnections();
    await new Promise<void>(done => api.close(() => done()));
  }
}
