import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  detectAgents,
  detectAgent,
  ensureDetectedRuntimeVersions,
  getDetectedRuntimeVersions,
} from '../../src/runtimes/detection.js';
import { AGENT_DEFS } from '../../src/runtimes/registry.js';

const roots: string[] = [];
const originalPath = process.env.PATH;

afterEach(() => {
  vi.useRealTimers();
  process.env.PATH = originalPath;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function executable(name: string, version: string): string {
  const root = mkdtempSync(join(tmpdir(), 'od-runtime-version-'));
  roots.push(root);
  const bin = join(root, name);
  writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(version)}\n`, 'utf8');
  chmodSync(bin, 0o755);
  process.env.PATH = `${root}:${originalPath ?? ''}`;
  return bin;
}

describe('runtime version provenance', () => {
  it.runIf(process.platform !== 'win32').each(['selected', 'picker'] as const)(
    'recovers a missing version cached by %s detection without a manual rescan', async (source) => {
      // Only Date is virtual: child-process completion remains real I/O.
      vi.useFakeTimers({ toFake: ['Date'] });
      const start = new Date('2026-09-15T00:00:00Z');
      vi.setSystemTime(start);
      const bin = executable('opencode', '');
      const root = join(bin, '..');
      const count = join(root, 'probes');
      const version = join(root, 'version');
      writeFileSync(version, '');
      writeFileSync(bin, `#!/bin/sh\nif [ "$1" = "--version" ]; then\n  printf x >> '${count}'\n  cat '${version}'\nfi\n`);
      const env = { OPENCODE_BIN: bin };
      if (source === 'picker') await detectAgent(AGENT_DEFS.find(def => def.id === 'opencode')!, env);
      else await ensureDetectedRuntimeVersions('opencode', env);
      expect(getDetectedRuntimeVersions('opencode')).toEqual({ invocable: true });
      writeFileSync(version, '1.18.18\n');
      vi.setSystemTime(start.getTime() + 4_999);
      await expect(ensureDetectedRuntimeVersions('opencode', env)).resolves.toEqual({ invocable: true });
      expect(readFileSync(count, 'utf8')).toBe('x');
      vi.setSystemTime(start.getTime() + 5_000);
      const results = await Promise.all(Array.from({ length: 4 }, () => ensureDetectedRuntimeVersions('opencode', env)));
      expect(results).toEqual(Array.from({ length: 4 }, () => ({ invocable: true, agentCliVersion: '1.18.18' })));
      expect(readFileSync(count, 'utf8')).toBe('xx');
      vi.setSystemTime(start.getTime() + 60_000);
      await ensureDetectedRuntimeVersions('opencode', env);
      expect(readFileSync(count, 'utf8')).toBe('xx');
    },
  );

  it.runIf(process.platform !== 'win32')('bounds repeated missing-version probes and keeps the CLI invocable', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    const bin = executable('opencode', '');
    const count = join(bin, '..', 'probes');
    writeFileSync(bin, `#!/bin/sh\nprintf x >> '${count}'\nexit 2\n`);
    const env = { OPENCODE_BIN: bin };
    for (const now of [0, 4_999, 5_000, 9_999, 10_000]) {
      vi.setSystemTime(now);
      await expect(ensureDetectedRuntimeVersions('opencode', env)).resolves.toEqual({ invocable: true });
      expect(readFileSync(count, 'utf8').length).toBe(Math.floor(now / 5_000) + 1);
    }
  });

  it('remembers the exact detected CLI version for later run telemetry', async () => {
    executable('claude', 'claude 9.8.7');

    const agents = await detectAgents();

    expect(agents.find((agent) => agent.id === 'claude')?.version).toBe('claude 9.8.7');
    expect(getDetectedRuntimeVersions('claude')).toEqual({
      invocable: true,
      agentCliVersion: 'claude 9.8.7',
    });
  });

  it('re-probes when the configured executable changes instead of reusing another binary scope', async () => {
    const first = executable('claude-first', 'claude 1.0.0');
    const second = executable('claude-second', 'claude 2.0.0');

    await expect(ensureDetectedRuntimeVersions('claude', { CLAUDE_BIN: first }))
      .resolves.toEqual({ invocable: true, agentCliVersion: 'claude 1.0.0' });
    await expect(ensureDetectedRuntimeVersions('claude', { CLAUDE_BIN: second }))
      .resolves.toEqual({ invocable: true, agentCliVersion: 'claude 2.0.0' });
  });

  it('retains invocability when version output is unavailable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'od-runtime-version-null-'));
    roots.push(root);
    const spawned = join(root, 'claude-spawned');
    writeFileSync(spawned, '#!/bin/sh\nexit 2\n', 'utf8');
    chmodSync(spawned, 0o755);

    await expect(ensureDetectedRuntimeVersions('claude', { CLAUDE_BIN: spawned }))
      .resolves.toEqual({ invocable: true });
  });

  it.runIf(process.platform !== 'win32')(
    'records the Vela CLI and its OpenCode companion as separate versions',
    async () => {
      const vela = executable('vela', 'vela 0.0.26');
      const opencode = executable('opencode', 'opencode 1.2.3');

      await detectAgents({
        amr: {
          VELA_BIN: vela,
          VELA_OPENCODE_BIN: opencode,
        },
      });

      expect(getDetectedRuntimeVersions('amr')).toEqual({
        invocable: true,
        agentCliVersion: 'vela 0.0.26',
        runtimeCompanionName: 'opencode',
        runtimeCompanionVersion: 'opencode 1.2.3',
      });
    },
  );
});
