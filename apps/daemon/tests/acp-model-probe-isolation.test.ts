import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'vitest';
import { acpProbeCwd, clearAcpModelCache, detectAcpModels } from '../src/agent-protocol/index.js';

// A fake ACP agent that records every `session/new` it receives — the request
// `cwd`, and the cwd the probe subprocess itself was spawned in — so a test can
// assert both how often a session was opened and where it was rooted.
function writeRecordingProbe(): { dir: string; bin: string; log: string } {
  const dir = mkdtempSync(join(tmpdir(), 'od-acp-probe-'));
  const bin = join(dir, 'recording-acp-probe.mjs');
  const log = join(dir, 'sessions.jsonl');
  writeFileSync(
    bin,
    [
      'import { appendFileSync } from "node:fs";',
      `const log = ${JSON.stringify(log)};`,
      'process.stdin.setEncoding("utf8");',
      'let buffer = "";',
      'process.stdin.on("data", (chunk) => {',
      '  buffer += chunk;',
      '  for (;;) {',
      '    const idx = buffer.indexOf("\\n");',
      '    if (idx === -1) break;',
      '    const line = buffer.slice(0, idx).trim();',
      '    buffer = buffer.slice(idx + 1);',
      '    if (!line) continue;',
      '    const message = JSON.parse(line);',
      '    if (message.method === "session/new") {',
      '      appendFileSync(log, JSON.stringify({ requestedCwd: message.params.cwd, spawnCwd: process.cwd() }) + "\\n");',
      '      process.stdout.write(JSON.stringify({ id: message.id, result: { sessionId: "s1", configOptions: [{ type: "select", id: "model", category: "model", currentValue: "m1", options: [{ value: "m1", name: "Model One" }] }] } }) + "\\n");',
      '      continue;',
      '    }',
      '    process.stdout.write(JSON.stringify({ id: message.id, result: {} }) + "\\n");',
      '  }',
      '});',
      'process.stdin.resume();',
    ].join('\n'),
    'utf8',
  );
  chmodSync(bin, 0o755);
  return { dir, bin, log };
}

function readSessions(log: string): { requestedCwd: string; spawnCwd: string }[] {
  try {
    return readFileSync(log, 'utf8')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

beforeEach(() => {
  clearAcpModelCache();
});

test('ACP model detection does not open its session in the daemon cwd', async () => {
  const { dir, bin, log } = writeRecordingProbe();
  try {
    const models = await detectAcpModels({ bin: process.execPath, args: [bin] });
    assert.deepEqual(models, [
      { id: 'default', label: 'Default (CLI config)' },
      { id: 'm1', label: 'Model One (m1) • current' },
    ]);

    const [session, ...rest] = readSessions(log);
    assert.ok(session);
    assert.equal(rest.length, 0);
    // The desktop app launches the daemon with cwd `/`; a probe session rooted
    // there registers a workspace spanning the whole filesystem in agents that
    // persist their session index.
    assert.notEqual(session.requestedCwd, process.cwd());
    assert.notEqual(session.requestedCwd, '/');
    assert.equal(session.requestedCwd, acpProbeCwd());
    // macOS resolves the temp dir's /var -> /private/var symlink in the child.
    assert.equal(realpathSync(session.spawnCwd), realpathSync(acpProbeCwd()));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ACP model detection reuses a cached list instead of opening another session', async () => {
  const { dir, bin, log } = writeRecordingProbe();
  try {
    const first = await detectAcpModels({ bin: process.execPath, args: [bin] });
    const second = await detectAcpModels({ bin: process.execPath, args: [bin] });

    assert.deepEqual(second, first);
    assert.equal(readSessions(log).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('concurrent ACP model detection shares a single probe session', async () => {
  const { dir, bin, log } = writeRecordingProbe();
  try {
    const results = await Promise.all([
      detectAcpModels({ bin: process.execPath, args: [bin] }),
      detectAcpModels({ bin: process.execPath, args: [bin] }),
      detectAcpModels({ bin: process.execPath, args: [bin] }),
    ]);

    assert.deepEqual(results[1], results[0]);
    assert.deepEqual(results[2], results[0]);
    assert.equal(readSessions(log).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ACP model detection re-probes when the caller forces a refresh', async () => {
  const { dir, bin, log } = writeRecordingProbe();
  try {
    await detectAcpModels({ bin: process.execPath, args: [bin] });
    await detectAcpModels({ bin: process.execPath, args: [bin], forceRefresh: true });

    assert.equal(readSessions(log).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ACP model detection still honours an explicit probe cwd', async () => {
  const { dir, bin, log } = writeRecordingProbe();
  const projectDir = mkdtempSync(join(tmpdir(), 'od-acp-project-'));
  try {
    await detectAcpModels({ bin: process.execPath, args: [bin], cwd: projectDir });

    const [session, ...rest] = readSessions(log);
    assert.ok(session);
    assert.equal(rest.length, 0);
    assert.equal(session.requestedCwd, projectDir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  }
});
