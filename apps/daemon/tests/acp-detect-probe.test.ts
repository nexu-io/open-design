import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { detectAcpModels } from '../src/agent-protocol/index.js';

// A probe that completes the initialize + session/new handshake and records
// its process cwd into PROBE_CWD_OUT when session/new arrives.
function writeCwdRecordingProbe(): { dir: string; bin: string } {
  const dir = mkdtempSync(join(tmpdir(), 'od-acp-cwd-'));
  const bin = join(dir, 'cwd-acp-probe.mjs');
  writeFileSync(
    bin,
    [
      'import { writeFileSync } from "node:fs";',
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
      '      writeFileSync(process.env.PROBE_CWD_OUT, process.cwd());',
      '      process.stdout.write(JSON.stringify({ id: message.id, result: { models: [] } }) + "\\n");',
      '    } else {',
      '      process.stdout.write(JSON.stringify({ id: message.id, result: {} }) + "\\n");',
      '    }',
      '  }',
      '});',
      'process.stdin.resume();',
    ].join('\n'),
    'utf8',
  );
  chmodSync(bin, 0o755);
  return { dir, bin };
}

// A probe that reports its pid via PROBE_PID_OUT and then traps SIGTERM
// forever — the orphan-leak scenario the SIGKILL escalation covers.
function writeSigtermTrappingProbe(): { dir: string; bin: string } {
  const dir = mkdtempSync(join(tmpdir(), 'od-acp-trap-'));
  const bin = join(dir, 'trap-acp-probe.mjs');
  writeFileSync(
    bin,
    [
      'import { writeFileSync } from "node:fs";',
      'writeFileSync(process.env.PROBE_PID_OUT, String(process.pid));',
      'process.on("SIGTERM", () => {});',
      'process.stdin.resume();',
      'setTimeout(() => {}, 60_000);',
    ].join('\n'),
    'utf8',
  );
  chmodSync(bin, 0o755);
  return { dir, bin };
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('detectAcpModels probes run in a neutral cwd, not the daemon process cwd', async () => {
  const { dir, bin } = writeCwdRecordingProbe();
  const cwdOut = join(dir, 'cwd.txt');
  try {
    const models = await detectAcpModels({
      bin: process.execPath,
      args: [bin],
      env: { ...process.env, PROBE_CWD_OUT: cwdOut },
      timeoutMs: 10_000,
    });
    assert.ok(Array.isArray(models));
    assert.ok(existsSync(cwdOut), 'probe did not record its cwd');
    const recorded = realpathSync(readFileSync(cwdOut, 'utf8'));
    assert.equal(recorded, realpathSync(tmpdir()));
    assert.notEqual(recorded, realpathSync(process.cwd()));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('detectAcpModels escalates a SIGTERM-trapping probe to SIGKILL', async () => {
  const { dir, bin } = writeSigtermTrappingProbe();
  const pidOut = join(dir, 'pid.txt');
  const started = Date.now();
  try {
    await assert.rejects(
      detectAcpModels({
        bin: process.execPath,
        args: [bin],
        env: { ...process.env, PROBE_PID_OUT: pidOut },
        timeoutMs: 300,
      }),
      /timed out/,
    );
    const pid = Number(readFileSync(pidOut, 'utf8'));
    assert.ok(Number.isInteger(pid) && pid > 0);
    // SIGTERM is trapped, so only the SIGKILL escalation can reap the child.
    // The escalation fires 2s after termination; give it generous headroom.
    const deadline = Date.now() + 8_000;
    while (processAlive(pid) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(!processAlive(pid), `probe pid ${pid} still alive after SIGKILL grace`);
    assert.ok(Date.now() - started < 12_000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
