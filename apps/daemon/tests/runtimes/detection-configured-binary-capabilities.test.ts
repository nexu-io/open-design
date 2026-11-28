import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const execAgentFileMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/runtimes/invocation.js', () => ({
  execAgentFile: execAgentFileMock,
}));

import { agentCapabilities } from '../../src/runtimes/capabilities.js';
import { ensureDetectedRuntimeCapabilities } from '../../src/runtimes/detection.js';

// The capability cache is scoped per RESOLVED BINARY (agentId + selectedPath +
// launchPath hash), so a configured `OPENCODE_BIN` pointing at a different
// CLI generation must be probed — and cached — separately from whatever PATH
// resolves. Regression for the memory extractor: it launches
// `configuredAgentEnv` (which carries OPENCODE_BIN) but used to warm the
// capability cache from the default environment, so a configured 2.x binary
// received 1.x argv and every background extraction died on
// "Unrecognized flag: --dir".
describe('ensureDetectedRuntimeCapabilities scopes per configured binary', () => {
  const HELP_AUTO = [
    'FLAGS',
    '  --auto                    Auto-approve permissions that are not explicitly denied',
    '  --format choice           Output format (choices: default, json)',
  ].join('\n');
  const HELP_LEGACY = [
    'FLAGS',
    '  --dangerously-skip-permissions  Skip permission prompts',
    '  --format choice           Output format (choices: default, json)',
  ].join('\n');

  let tempDir: string;
  let binA: string;
  let binB: string;

  beforeEach(() => {
    execAgentFileMock.mockReset();
    tempDir = mkdtempSync(path.join(tmpdir(), 'od-cap-probe-'));
    // Two fake CLI files whose --help advertises different permission-bypass
    // spellings. resolveAgentLaunch only stats them (PATHEXT check); the
    // mocked execAgentFile decides which help text a probe returns.
    binA = path.join(tempDir, 'opencode-a.cmd');
    binB = path.join(tempDir, 'opencode-b.cmd');
    writeFileSync(binA, '@echo off\r\n');
    writeFileSync(binB, '@echo off\r\n');
    execAgentFileMock.mockImplementation((command: string) => ({
      stdout: '',
      stderr: command === binA ? HELP_AUTO : HELP_LEGACY,
    }));
    agentCapabilities.delete('opencode');
  });

  afterEach(() => {
    delete process.env.OPENCODE_BIN;
    agentCapabilities.delete('opencode');
  });

  it('probes the global OPENCODE_BIN when no per-agent override is configured', async () => {
    process.env.OPENCODE_BIN = binA;

    const caps = await ensureDetectedRuntimeCapabilities('opencode', {});

    expect(execAgentFileMock.mock.calls[0]![0]).toBe(binA);
    expect(caps?.skipPermissions).toBe('--auto');
  });

  it('re-probes (and re-scopes) when the configured env names a different binary', async () => {
    process.env.OPENCODE_BIN = binA;
    await ensureDetectedRuntimeCapabilities('opencode', {});

    const caps = await ensureDetectedRuntimeCapabilities('opencode', {
      OPENCODE_BIN: binB,
    });

    const probedPaths = execAgentFileMock.mock.calls.map((call) => call[0]);
    expect(probedPaths).toContain(binB);
    expect(execAgentFileMock.mock.calls[execAgentFileMock.mock.calls.length - 1]![0]).toBe(binB);
    // The configured binary's own help decided the dialect, not the global
    // OPENCODE_BIN's cached scan.
    expect(caps?.skipPermissions).toBe('--dangerously-skip-permissions');
  });
});
