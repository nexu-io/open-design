import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { detectAcpModels } from '../src/agent-protocol/index.js';

// An ACP agent that answers `initialize` and `session/new`, the second with
// two available models, launched through the kind of shim `npm i -g` creates:
// a `.cmd` file on Windows, an executable shell script elsewhere.
function writeShimmedProbe(): { dir: string; bin: string } {
  const dir = mkdtempSync(join(tmpdir(), 'od-acp-shim-'));
  const script = join(dir, 'acp-probe.mjs');
  writeFileSync(
    script,
    [
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
      '    const result = message.method === "session/new"',
      '      ? { sessionId: "s1", models: { currentModelId: "k2", availableModels: [',
      '          { modelId: "k2", name: "K2" }, { modelId: "k2-turbo", name: "K2 Turbo" }] } }',
      '      : {};',
      '    process.stdout.write(JSON.stringify({ id: message.id, result }) + "\\n");',
      '  }',
      '});',
      'process.stdin.on("end", () => process.exit(0));',
      'process.stdin.resume();',
    ].join('\n'),
    'utf8',
  );
  if (process.platform === 'win32') {
    const bin = join(dir, 'acp-agent.cmd');
    writeFileSync(bin, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`, 'utf8');
    return { dir, bin };
  }
  const bin = join(dir, 'acp-agent');
  writeFileSync(
    bin,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`,
    'utf8',
  );
  chmodSync(bin, 0o755);
  return { dir, bin };
}

test('detectAcpModels lists the models of an agent installed as an npm shim', async () => {
  const { dir, bin } = writeShimmedProbe();
  try {
    const models = await detectAcpModels({ bin, args: ['acp'], timeoutMs: 15_000 });
    assert.deepEqual(
      models.map((model) => model.id),
      ['default', 'k2', 'k2-turbo'],
    );
  } finally {
    // On Windows the shim's node child can still be exiting when the probe settles.
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
