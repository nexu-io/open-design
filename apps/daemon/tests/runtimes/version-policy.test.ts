import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectAgent } from '../../src/runtimes/detection.js';
import {
  buildCompatibilityDiagnostic,
  buildVersionDiagnostic,
} from '../../src/runtimes/diagnostics.js';
import type { RuntimeAgentDef } from '../../src/runtimes/types.js';
import { parseDeepSeekHarnessVersion } from '../../src/runtimes/defs/deepseek-harness.js';

const versionedDef: RuntimeAgentDef = {
  id: 'deepseek-harness',
  name: 'DeepSeek Harness',
  bin: 'dsh',
  versionArgs: ['--version'],
  versionPolicy: {
    requireVersion: true,
    supportedVersions: ['0.1.0-rc.5', '0.1.0-rc.6'],
    parse: parseDeepSeekHarnessVersion,
  },
  fallbackModels: [{ id: 'default', label: 'Default' }],
  buildArgs: () => [],
  streamFormat: 'dsh-profile-jsonl',
};

function writeVersionBin(dir: string, version: string): string {
  const bin = path.join(dir, process.platform === 'win32' ? 'dsh.cmd' : 'dsh');
  if (process.platform === 'win32') {
    writeFileSync(bin, `@echo off\r\necho ${version}\r\n`);
  } else {
    writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' '${version}'\n`);
    chmodSync(bin, 0o755);
  }
  return bin;
}

function writeProfileBin(dir: string, compatible: boolean): string {
  const bin = path.join(dir, process.platform === 'win32' ? 'dsh.cmd' : 'dsh');
  const probe = JSON.stringify({
    v: 1,
    type: 'probe',
    runtime: 'open-design',
    protocol_version: 1,
    plugin_version: '0.1.0',
    capabilities: {
      session_resume: true,
      session_cancel: true,
      structured_events: true,
    },
  });

  if (process.platform === 'win32') {
    writeFileSync(bin, compatible
      ? `@echo off\r\nif "%1"=="--version" (echo 0.1.0-rc.6) else (echo ${probe})\r\n`
      : '@echo off\r\nif "%1"=="--version" (echo 0.1.0-rc.6) else (exit /b 1)\r\n');
  } else {
    writeFileSync(bin, compatible
      ? `#!/bin/sh\nif [ "$1" = "--version" ]; then printf '%s\\n' '0.1.0-rc.6'; else printf '%s\\n' '${probe}'; fi\n`
      : '#!/bin/sh\nif [ "$1" = "--version" ]; then printf \'%s\\n\' \'0.1.0-rc.6\'; else exit 1; fi\n');
    chmodSync(bin, 0o755);
  }
  return bin;
}

describe('runtime version policy', () => {
  it.each([
    ['0.1.0-rc.6', true, undefined],
    ['0.1.0-rc.7', true, 'untested-version'],
  ] as const)('detects %s with available=%s', async (version, available, reason) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'od-runtime-version-'));
    try {
      const detected = await detectAgent(versionedDef, {
        DSH_BIN: writeVersionBin(dir, version),
      });
      expect(detected.available).toBe(available);
      expect(detected.version).toBe(version);
      expect(detected.diagnostics?.[0]?.reason).toBe(reason);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(['not-a-version', 'DeepSeek Harness preview'])('rejects unparseable version output %s', async (version) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'od-runtime-version-'));
    try {
      const detected = await detectAgent(versionedDef, {
        DSH_BIN: writeVersionBin(dir, version),
      });
      expect(detected.available).toBe(false);
      expect(detected.diagnostics?.[0]?.reason).toBe('version-probe-failed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports an actionable failure when no version can be verified', () => {
    expect(buildVersionDiagnostic(versionedDef, null)).toMatchObject({
      reason: 'version-probe-failed',
      severity: 'error',
      detail: 'Expected 0.1.0-rc.5, 0.1.0-rc.6.',
    });
  });

  it.each([
    [true, true, undefined],
    [false, false, 'runtime-profile-incompatible'],
  ] as const)('gates availability on the external profile handshake', async (compatible, available, reason) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'od-runtime-profile-'));
    try {
      const def: RuntimeAgentDef = {
        ...versionedDef,
        compatibilityProbe: {
          args: ['--profile', 'open-design', '--probe'],
          preflight: () => compatible,
          parse: (stdout) => {
            const value = JSON.parse(stdout) as { plugin_version?: unknown };
            if (typeof value.plugin_version !== 'string') throw new Error('incompatible');
            return value.plugin_version;
          },
        },
      };
      const detected = await detectAgent(def, { DSH_BIN: writeProfileBin(dir, true) });
      expect(detected.available).toBe(available);
      expect(detected.diagnostics?.[0]?.reason).toBe(reason);
      if (!compatible) {
        expect(detected.path).toBe(path.join(dir, process.platform === 'win32' ? 'dsh.cmd' : 'dsh'));
        expect(detected.version).toBe('0.1.0-rc.6');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('provides actionable profile installation guidance', () => {
    expect(buildCompatibilityDiagnostic(versionedDef)).toMatchObject({
      reason: 'runtime-profile-incompatible',
      severity: 'error',
    });
  });
});
