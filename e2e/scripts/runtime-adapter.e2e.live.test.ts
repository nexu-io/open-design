import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

interface AgentInfo {
  id: string;
  name: string;
  bin: string;
  available: boolean;
  path?: string;
  version?: string | null;
  models?: Array<{ id: string; label?: string }>;
  streamFormat?: string;
}

interface AgentsResponse {
  agents: AgentInfo[];
}

interface StartServerResult {
  url: string;
  server: { close: (callback: (err?: Error) => void) => void };
}

interface ParsedSseEvent {
  event: string;
  data: Record<string, unknown>;
}

type StartServer = (options: { port: number; returnServer: true }) => Promise<StartServerResult>;
type CloseDatabase = () => void;

const liveTimeoutMs = Number(process.env.OD_RUNTIME_LIVE_TIMEOUT_MS || 180_000);
const requestedRuntimeIds = parseRuntimeIds(process.env.OD_E2E_RUNTIMES);
const maxRuntimeCount = 8;
const marker = 'OD_RUNTIME_ADAPTER_LIVE_OK';

let baseUrl: string;
let server: StartServerResult['server'] | undefined;
let startServer: StartServer;
let closeDatabase: CloseDatabase | undefined;
let detectedAgents: AgentInfo[] | undefined;
let dataDir: string;

test.before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-runtime-adapter-live-'));
  process.env.OD_DATA_DIR = dataDir;
  ({ startServer } = await import('../../apps/daemon/dist/server.js') as { startServer: StartServer });
  ({ closeDatabase } = await import('../../apps/daemon/dist/db.js') as { closeDatabase: CloseDatabase });
  const started = await startServer({ port: 0, returnServer: true });
  baseUrl = started.url;
  server = started.server;
});

test.after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => (err ? reject(err) : resolve()));
    });
  }
  closeDatabase?.();
  if (dataDir) {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test('runtime adapter live detection flow exposes installed runtimes', async () => {
  log('detect', 'starting runtime detection via /api/agents');
  const res = await fetch(`${baseUrl}/api/agents`);
  assert.equal(res.status, 200);
  const body = await readAgentsResponse(res);
  assert.ok(Array.isArray(body.agents));
  assert.ok(body.agents.length > 0);

  detectedAgents = body.agents;
  const available = body.agents.filter((agent) => agent.available);

  for (const agent of body.agents) {
    const status = agent.available ? 'available' : 'unavailable';
    const version = agent.version ? ` version=${agent.version}` : '';
    const resolvedPath = agent.path ? ` path=${agent.path}` : '';
    log(
      'detect',
      `${agent.id}: ${status}${version}${resolvedPath} models=${agent.models?.length ?? 0} stream=${agent.streamFormat}`,
    );
  }

  assert.ok(
    available.length > 0,
    'Install at least one supported runtime CLI on PATH: claude, codex, gemini, opencode, hermes, kimi, cursor-agent, or qwen.',
  );

  for (const agent of body.agents) {
    assert.equal(typeof agent.id, 'string');
    assert.equal(typeof agent.name, 'string');
    assert.equal(typeof agent.bin, 'string');
    assert.equal(typeof agent.available, 'boolean');
    assert.ok(Array.isArray(agent.models));
    assert.ok(agent.models.some((model) => model.id === 'default'));
    assert.equal(typeof agent.streamFormat, 'string');
    if (agent.available) {
      assert.equal(typeof agent.path, 'string');
      const resolvedPath = agent.path;
      assert.ok(resolvedPath && resolvedPath.length > 0);
    }
  }
});

test('runtime adapter live run flow streams a successful response for every available runtime', { timeout: liveTimeoutMs * maxRuntimeCount + 30_000 }, async () => {
  if (!detectedAgents) {
    log('run', 'detection cache empty; fetching /api/agents before run flow');
    const res = await fetch(`${baseUrl}/api/agents`);
    detectedAgents = (await readAgentsResponse(res)).agents;
  }

  const requestedSet = requestedRuntimeIds ? new Set(requestedRuntimeIds) : null;
  const availableAgents = detectedAgents.filter(
    (agent) => agent.available && (!requestedSet || requestedSet.has(agent.id)),
  );

  if (requestedSet) {
    log('run', `runtime filter=${requestedRuntimeIds?.join(',')}`);
    for (const id of requestedSet) {
      assert.ok(
        detectedAgents.some((agent) => agent.id === id),
        `Requested runtime ${id} is missing from /api/agents.`,
      );
    }
  }

  for (const agent of detectedAgents) {
    if (agent.available) {
      if (!requestedSet || requestedSet.has(agent.id)) {
        log('run', `${agent.id}: queued`);
      } else {
        log('run', `${agent.id}: skipped by runtime filter`);
      }
    } else {
      log('run', `${agent.id}: skipped because runtime is unavailable`);
    }
  }
  assert.ok(
    availableAgents.length > 0,
    requestedSet
      ? `Requested runtimes unavailable: ${requestedRuntimeIds?.join(',')}.`
      : 'Available runtime required from /api/agents.',
  );

  for (const agent of availableAgents) {
    await runRuntime(agent);
  }
});

async function runRuntime(agent: AgentInfo): Promise<void> {
  const startedAt = Date.now();
  log('run', `${agent.id}: starting /api/chat live run`);

  const projectId = `runtime-adapter-live-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const events: ParsedSseEvent[] = [];
  const abort = AbortSignal.timeout(liveTimeoutMs);
  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: abort,
      body: JSON.stringify({
        agentId: agent.id,
        projectId,
        model: 'default',
        message: `Reply with exactly this token and nothing else: ${marker}`,
        systemPrompt: [
          'You are running a local runtime-adapter live smoke test.',
          'Produce a minimal text-only response.',
          'Do not create, edit, delete, or inspect files.',
        ].join('\n'),
      }),
    });

    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
    assert.ok(res.body, 'SSE response should include a readable body.');

    await collectSseEvents(res, events, agent.id);
  } finally {
    await fs.rm(path.join(dataDir, 'projects', projectId), {
      recursive: true,
      force: true,
    });
  }

  const start = events.find((event) => event.event === 'start');
  assert.ok(start, 'SSE stream should include a start event.');
  assert.equal(start.data.agentId, agent.id);
  assert.equal(start.data.projectId, projectId);
  log('run', `${agent.id}: start event cwd=${String(start.data.cwd ?? '')}`);

  const end = events.find((event) => event.event === 'end');
  assert.ok(end, 'SSE stream should include an end event.');
  assert.equal(end.data.code, 0, renderEvents(events));
  log('run', `${agent.id}: end event code=${String(end.data.code)} signal=${String(end.data.signal ?? 'none')}`);

  const text = events
    .map((event) => {
      if (event.event === 'stdout') return stringData(event.data.chunk);
      if (event.event === 'agent') return stringData(event.data.text) || stringData(event.data.delta);
      return '';
    })
    .join('');
  assert.match(text, new RegExp(marker), renderEvents(events));
  log('run', `${agent.id}: passed in ${Date.now() - startedAt}ms`);
}

async function collectSseEvents(res: Response, events: ParsedSseEvent[], agentId: string): Promise<void> {
  const reader = res.body?.getReader();
  assert.ok(reader, 'SSE response should include a readable body.');
  const decoder = new TextDecoder();
  let buffer = '';
  const seen = new Set<string>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';
    for (const chunk of chunks) {
      const parsed = parseSseEvent(chunk);
      if (parsed) {
        events.push(parsed);
        logSseProgress(agentId, parsed, seen);
      }
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const parsed = parseSseEvent(buffer);
    if (parsed) {
      events.push(parsed);
      logSseProgress(agentId, parsed, seen);
    }
  }
}

function parseSseEvent(chunk: string): ParsedSseEvent | null {
  const lines = chunk.split('\n');
  if (lines.every((line) => line === '' || line.startsWith(':'))) return null;

  const eventLine = lines.find((line) => line.startsWith('event: '));
  const dataLine = lines.find((line) => line.startsWith('data: '));
  if (!eventLine || !dataLine) return null;
  return {
    event: eventLine.slice('event: '.length),
    data: JSON.parse(dataLine.slice('data: '.length)) as Record<string, unknown>,
  };
}

function renderEvents(events: ParsedSseEvent[]): string {
  return JSON.stringify(events, null, 2).slice(0, 8000);
}

function parseRuntimeIds(value: string | undefined): string[] | null {
  if (!value) return null;
  const ids = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : null;
}

function log(stage: string, message: string): void {
  console.log(`[runtime-adapter:e2e:${stage}] ${message}`);
}

function logSseProgress(agentId: string, event: ParsedSseEvent, seen: Set<string>): void {
  if (event.event === 'start' && !seen.has('start')) {
    seen.add('start');
    log('run', `${agentId}: received start event`);
    return;
  }
  if (event.event === 'stdout' && !seen.has('stdout')) {
    seen.add('stdout');
    log('run', `${agentId}: received stdout stream`);
    return;
  }
  const type = stringData(event.data.type) || 'event';
  if (event.event === 'agent' && !seen.has(`agent:${type}`)) {
    seen.add(`agent:${type}`);
    log('run', `${agentId}: received agent event type=${type || 'unknown'}`);
    return;
  }
  if (event.event === 'stderr' && !seen.has('stderr')) {
    seen.add('stderr');
    log('run', `${agentId}: received stderr stream`);
    return;
  }
  if (event.event === 'error') {
    log('run', `${agentId}: received error event ${stringData(event.data.message)}`.trim());
    return;
  }
  if (event.event === 'end' && !seen.has('end')) {
    seen.add('end');
    log('run', `${agentId}: received end event`);
  }
}

async function readAgentsResponse(res: Response): Promise<AgentsResponse> {
  const body = await res.json() as Partial<AgentsResponse>;
  return { agents: Array.isArray(body.agents) ? body.agents : [] };
}

function stringData(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
