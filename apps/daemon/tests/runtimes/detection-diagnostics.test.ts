import { test } from 'vitest';
import {
  assert,
  chmodSync,
  detectAgents,
  join,
  mkdtempSync,
  rmSync,
  tmpdir,
  withEnvSnapshot,
  writeFileSync,
} from './helpers/test-helpers.js';
import { detectAgentsStream } from '../../src/runtimes/detection.js';
import { buildAuthDiagnostic } from '../../src/runtimes/diagnostics.js';

const posixTest = process.platform === 'win32' ? test.skip : test;

function writeCursorAgent(dir: string, statusOutput: string): void {
  const bin = join(dir, 'cursor-agent');
  writeFileSync(
    bin,
    `#!/bin/sh\n` +
      `if [ "$1" = "--version" ]; then echo "2026.05.07-test"; exit 0; fi\n` +
      `if [ "$1" = "models" ]; then echo "auto"; exit 0; fi\n` +
      `if [ "$1" = "status" ]; then echo "${statusOutput}"; exit 0; fi\n` +
      `exit 0\n`,
  );
  chmodSync(bin, 0o755);
}

function writeOpenCode(dir: string): string {
  const bin = join(dir, 'opencode');
  writeFileSync(
    bin,
    `#!/bin/sh\n` +
      `if [ "$1" = "--version" ]; then echo "opencode 1.17.3"; exit 0; fi\n` +
      `if [ "$1" = "models" ]; then echo "openai/gpt-5"; exit 0; fi\n` +
      `exit 0\n`,
  );
  chmodSync(bin, 0o755);
  return bin;
}

function writeNonExecutableCursorAgent(dir: string): string {
  const bin = join(dir, 'cursor-agent');
  writeFileSync(
    bin,
    `#!/bin/sh\n` +
      `if [ "$1" = "--version" ]; then echo "2026.05.07-test"; exit 0; fi\n` +
      `exit 0\n`,
  );
  chmodSync(bin, 0o644);
  return bin;
}

posixTest('detectAgents emits a not-on-path diagnostic with searched dirs + fix intents', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-diag-notpath-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], async () => {
      // Only cursor-agent is on PATH; everything else is unavailable.
      writeCursorAgent(dir, 'Authenticated');
      process.env.PATH = dir;
      process.env.OD_AGENT_HOME = dir;

      const agents = await detectAgents();
      const qwen = agents.find((agent) => agent.id === 'qwen');

      assert.equal(qwen?.available, false);
      const diagnostic = qwen?.diagnostics?.[0];
      assert.ok(diagnostic, 'expected a diagnostic on the unavailable agent');
      assert.equal(diagnostic?.reason, 'not-on-path');
      assert.equal(diagnostic?.severity, 'error');
      assert.ok(
        (diagnostic?.searchedDirs ?? []).length > 0,
        'expected searchedDirs to be populated',
      );
      const intents = (diagnostic?.fixActions ?? []).map((a) => a.kind);
      assert.ok(intents.includes('openInstall'), 'expected openInstall fix intent');
      assert.ok(intents.includes('rescan'), 'expected rescan fix intent');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

posixTest('detectAgents finds OpenCode when npm exposes only the opencode binary', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-opencode-npm-bin-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], async () => {
      const bin = writeOpenCode(dir);
      process.env.PATH = dir;
      process.env.OD_AGENT_HOME = dir;

      const agents = await detectAgents();
      const opencode = agents.find((agent) => agent.id === 'opencode');

      assert.equal(opencode?.available, true);
      assert.equal(opencode?.bin, 'opencode-cli');
      assert.equal(opencode?.path, bin);
      assert.equal(opencode?.version, 'opencode 1.17.3');
      assert.equal(opencode?.diagnostics, undefined);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

posixTest('detectAgents emits a not-executable diagnostic for a PATH match without execute permission', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-diag-notexec-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], async () => {
      const bin = writeNonExecutableCursorAgent(dir);
      process.env.PATH = dir;
      process.env.OD_AGENT_HOME = dir;

      const agents = await detectAgents();
      const cursor = agents.find((agent) => agent.id === 'cursor-agent');

      assert.equal(cursor?.available, false);
      const diagnostic = cursor?.diagnostics?.[0];
      assert.ok(diagnostic, 'expected a diagnostic on the unavailable agent');
      assert.equal(diagnostic?.reason, 'not-executable');
      assert.equal(diagnostic?.severity, 'error');
      assert.equal(diagnostic?.detail, bin);
      assert.match(diagnostic?.message ?? '', /not executable/i);
      const intents = (diagnostic?.fixActions ?? []).map((a) => a.kind);
      assert.ok(intents.includes('rescan'), 'expected rescan fix intent');
      assert.equal(
        intents.includes('openDocs'),
        false,
        'permission diagnostics should not use shim repair advice',
      );
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

posixTest('detectAgents emits an auth-missing diagnostic when the auth probe reports not authenticated', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-diag-auth-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], async () => {
      writeCursorAgent(dir, 'Not authenticated');
      process.env.PATH = dir;
      process.env.OD_AGENT_HOME = dir;

      const agents = await detectAgents();
      const cursor = agents.find((agent) => agent.id === 'cursor-agent');

      assert.equal(cursor?.available, true);
      assert.equal(cursor?.authStatus, 'missing');
      const diagnostic = cursor?.diagnostics?.[0];
      assert.ok(diagnostic, 'expected an auth diagnostic');
      assert.equal(diagnostic?.reason, 'auth-missing');
      const intents = (diagnostic?.fixActions ?? []).map((a) => a.kind);
      // cursor-agent has no daemon-driven OAuth, so it points at docs + rescan.
      assert.ok(intents.includes('openDocs'), 'expected openDocs fix intent');
      assert.ok(intents.includes('rescan'), 'expected rescan fix intent');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('auth diagnostics do not offer daemon OAuth without an active producer', () => {
  const diagnostic = buildAuthDiagnostic(
    { id: 'antigravity', name: 'Antigravity' },
    {
      status: 'missing',
      message: 'Antigravity is installed but not authenticated.',
    },
  );

  const intents = (diagnostic?.fixActions ?? []).map((a) => a.kind);
  assert.deepEqual(intents, ['openDocs', 'rescan']);
});

posixTest('detectAgentsStream yields the same agent set as detectAgents', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-diag-stream-'));
  try {
    await withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], async () => {
      writeCursorAgent(dir, 'Authenticated');
      process.env.PATH = dir;
      process.env.OD_AGENT_HOME = dir;

      const batch = await detectAgents();
      const streamed: string[] = [];
      for await (const agent of detectAgentsStream()) {
        streamed.push(agent.id);
      }

      assert.equal(
        streamed.length,
        batch.length,
        'stream should yield one event per agent',
      );
      assert.deepEqual(
        [...streamed].sort(),
        batch.map((agent) => agent.id).sort(),
        'stream should cover exactly the same agent ids',
      );
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
