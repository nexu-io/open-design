import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const liveTimeoutMs = Number(process.env.OD_RUNTIME_LIVE_TIMEOUT_MS || 180_000);
const requestedRuntimeIds = parseRuntimeIds(process.env.OD_E2E_RUNTIMES);
const maxRuntimeCount = 8;
const marker = 'OD_RUNTIME_ADAPTER_LIVE_OK';

let baseUrl;
let server;
let startServer;
let closeDatabase;
let detectedAgents;
let dataDir;

test.before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-runtime-adapter-live-'));
  process.env.OD_DATA_DIR = dataDir;
  ({ startServer } = await import('../../apps/daemon/server.js'));
  ({ closeDatabase } = await import('../../apps/daemon/db.js'));
  const started = await startServer({ port: 0, returnServer: true });
  baseUrl = started.url;
  server = started.server;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
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
  const body = await res.json();
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
      assert.ok(agent.path.length > 0);
    }
  }
});

test('runtime adapter live run flow streams a successful response for every available runtime', { timeout: liveTimeoutMs * maxRuntimeCount + 30_000 }, async () => {
  if (!detectedAgents) {
    log('run', 'detection cache empty; fetching /api/agents before run flow');
    const res = await fetch(`${baseUrl}/api/agents`);
    detectedAgents = (await res.json()).agents;
  }

  const requestedSet = requestedRuntimeIds ? new Set(requestedRuntimeIds) : null;
  const availableAgents = detectedAgents.filter(
    (agent) => agent.available && (!requestedSet || requestedSet.has(agent.id)),
  );

  if (requestedSet) {
    log('run', `runtime filter=${requestedRuntimeIds.join(',')}`);
    for (const id of requestedSet) {
      assert.ok(
        detectedAgents.some((agent) => agent.id === id),
        `Requested runtime ${id} was not returned by /api/agents.`,
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
      ? `No requested runtime is available: ${requestedRuntimeIds.join(',')}.`
      : 'No available runtime returned by /api/agents.',
  );

  for (const agent of availableAgents) {
    await runRuntime(agent);
  }
});

async function runRuntime(agent) {
  const startedAt = Date.now();
  log('run', `${agent.id}: starting /api/chat live run`);

  const projectId = `runtime-adapter-live-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const events = [];
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
  log('run', `${agent.id}: start event cwd=${start.data.cwd}`);

  const end = events.find((event) => event.event === 'end');
  assert.ok(end, 'SSE stream should include an end event.');
  assert.equal(end.data.code, 0, renderEvents(events));
  log('run', `${agent.id}: end event code=${end.data.code} signal=${end.data.signal ?? 'none'}`);

  const text = events
    .map((event) => {
      if (event.event === 'stdout') return event.data.chunk || '';
      if (event.event === 'agent') return event.data.text || event.data.delta || '';
      return '';
    })
    .join('');
  assert.match(text, new RegExp(marker), renderEvents(events));
  log('run', `${agent.id}: passed in ${Date.now() - startedAt}ms`);
}

async function collectSseEvents(res, events, agentId) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const seen = new Set();

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

function parseSseEvent(chunk) {
  const lines = chunk.split('\n');
  if (lines.every((line) => line === '' || line.startsWith(':'))) return null;

  const eventLine = lines.find((line) => line.startsWith('event: '));
  const dataLine = lines.find((line) => line.startsWith('data: '));
  if (!eventLine || !dataLine) return null;
  return {
    event: eventLine.slice('event: '.length),
    data: JSON.parse(dataLine.slice('data: '.length)),
  };
}

function renderEvents(events) {
  return JSON.stringify(events, null, 2).slice(0, 8000);
}

function parseRuntimeIds(value) {
  if (!value) return null;
  const ids = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : null;
}

function log(stage, message) {
  console.log(`[runtime-adapter:e2e:${stage}] ${message}`);
}

function logSseProgress(agentId, event, seen) {
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
  if (event.event === 'agent' && !seen.has(`agent:${event.data.type || 'event'}`)) {
    seen.add(`agent:${event.data.type || 'event'}`);
    log('run', `${agentId}: received agent event type=${event.data.type || 'unknown'}`);
    return;
  }
  if (event.event === 'stderr' && !seen.has('stderr')) {
    seen.add('stderr');
    log('run', `${agentId}: received stderr stream`);
    return;
  }
  if (event.event === 'error') {
    log('run', `${agentId}: received error event ${event.data.message || ''}`.trim());
    return;
  }
  if (event.event === 'end' && !seen.has('end')) {
    seen.add('end');
    log('run', `${agentId}: received end event`);
  }
}
