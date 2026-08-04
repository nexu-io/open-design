import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import {
  detectAgents,
  getDetectedRuntimeVersions,
} from '../../src/runtimes/detection.js';

const roots: string[] = [];
const originalPath = process.env.PATH;

afterEach(() => {
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
  it('remembers the exact detected CLI version for later run telemetry', async () => {
    executable('claude', 'claude 9.8.7');

    const agents = await detectAgents();

    expect(agents.find((agent) => agent.id === 'claude')?.version).toBe('claude 9.8.7');
    expect(getDetectedRuntimeVersions('claude')).toEqual({
      agentCliVersion: 'claude 9.8.7',
    });
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
        agentCliVersion: 'vela 0.0.26',
        runtimeCompanionName: 'opencode',
        runtimeCompanionVersion: 'opencode 1.2.3',
      });
    },
  );
});
