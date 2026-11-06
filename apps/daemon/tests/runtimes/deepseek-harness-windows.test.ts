import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path, { delimiter } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  deepseekHarnessAgentDef,
  parseDeepSeekHarnessVersion,
} from '../../src/runtimes/defs/deepseek-harness.js';
import { detectAgent, getDetectedRuntimeVersions } from '../../src/runtimes/detection.js';
import { resolveAgentExecutable } from '../../src/runtimes/executables.js';
import { testAgentConnection } from '../../src/connectionTest.js';
import {
  classifyAgentAuthFailure,
  deepseekHarnessAuthGuidance,
  normalizeDeepSeekHarnessFailure,
} from '../../src/runtimes/auth.js';
import { minimalAgentDef } from './helpers/test-helpers.js';
import {
  collectProcessTreePids,
  createCommandInvocation,
  listProcessSnapshots,
  stopProcesses,
} from '@open-design/platform';

const require = createRequire(import.meta.url);

function writeFakeDshCarrier(dir: string): string {
  const fixture = path.resolve('tests/fixtures/dsh-profile/fake-dsh.ts');
  const tsxLoader = pathToFileURL(require.resolve('tsx')).href;
  if (process.platform === 'win32') {
    const carrier = path.join(dir, 'dsh.cmd');
    writeFileSync(
      carrier,
      `@echo off\r\n"${process.execPath}" --import "${tsxLoader}" "${fixture}" %*\r\n`,
    );
    return carrier;
  }
  const carrier = path.join(dir, 'dsh');
  writeFileSync(
    carrier,
    `#!/bin/sh\nexec "${process.execPath}" --import "${tsxLoader}" "${fixture}" "$@"\n`,
  );
  chmodSync(carrier, 0o755);
  return carrier;
}

function createProfileHome(dir: string): string {
  const home = path.join(dir, 'dsh-home');
  const profile = path.join(home, 'profiles', 'open-design');
  mkdirSync(profile, { recursive: true });
  writeFileSync(path.join(profile, 'package.json'), '{}\n');
  return home;
}

describe('DeepSeek Harness Windows carrier', () => {
  it('resolves DSH_BIN and probes the profile through the platform command wrapper', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'od-dsh-carrier-'));
    try {
      const carrier = writeFakeDshCarrier(dir);
      const def = minimalAgentDef({ id: 'deepseek-harness', bin: 'dsh' });
      expect(resolveAgentExecutable(def, { DSH_BIN: carrier })).toBe(carrier);

      const detected = await detectAgent(deepseekHarnessAgentDef, {
        DSH_BIN: carrier,
        DSH_HOME: createProfileHome(dir),
      });
      expect(detected.available).toBe(true);
      expect(detected.version).toBe('0.1.0-rc.6');
      expect(getDetectedRuntimeVersions('deepseek-harness')).toMatchObject({
        runtimeCompanionName: '@open-design/dsh-runtime',
        runtimeCompanionVersion: 'fixture-1',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('marks an incompatible profile unavailable without exposing runtime output', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'od-dsh-carrier-'));
    try {
      const carrier = writeFakeDshCarrier(dir);
      const detected = await detectAgent(deepseekHarnessAgentDef, {
        DSH_BIN: carrier,
        DSH_HOME: createProfileHome(dir),
        OD_DSH_FAKE_MODE: 'bad-identity',
      });
      expect(detected.available).toBe(false);
      expect(detected.path).toBe(carrier);
      expect(detected.version).toBe('0.1.0-rc.6');
      expect(detected.diagnostics).toEqual([
        expect.objectContaining({ reason: 'runtime-profile-incompatible', severity: 'error' }),
      ]);
      expect(JSON.stringify(detected.diagnostics)).not.toContain('another-runtime');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ['0.1.0-rc.6', '0.1.0-rc.6'],
    ['v0.1.0-rc.6', '0.1.0-rc.6'],
    ['dsh 0.1.0-rc.6', null],
    ['preview', null],
  ])('normalizes version output %s', (raw, expected) => {
    expect(parseDeepSeekHarnessVersion(raw)).toBe(expected);
  });

  it('classifies a missing provider credential with actionable Harness guidance', () => {
    expect(classifyAgentAuthFailure(
      'deepseek-harness',
      'MISSING_CREDENTIAL: no API key for provider route "deepseek-official"; export DEEPSEEK_API_KEY',
    )).toEqual({
      status: 'missing',
      message: deepseekHarnessAuthGuidance(),
    });
    expect(deepseekHarnessAuthGuidance()).toMatch(/dsh web/);
    expect(deepseekHarnessAuthGuidance()).toMatch(/Settings.*Models/);
    expect(deepseekHarnessAuthGuidance()).toMatch(/DEEPSEEK_API_KEY/);
  });

  it('turns structured missing-credential payloads into safe configuration guidance', () => {
    const failure = normalizeDeepSeekHarnessFailure({
      message: {
        code: 'MISSING_CREDENTIAL',
        message: 'No API key for the selected provider.',
      },
    });

    expect(failure).toEqual({
      code: 'MISSING_CREDENTIAL',
      message: deepseekHarnessAuthGuidance(),
      authRequired: true,
    });
    expect(failure.message).not.toContain('[object Object]');
  });

  it('preserves plain provider failures and never stringifies unknown objects', () => {
    expect(normalizeDeepSeekHarnessFailure({
      error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Provider unavailable.' },
    })).toEqual({
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Provider unavailable.',
      authRequired: false,
    });
    expect(normalizeDeepSeekHarnessFailure({ message: { private: true } })).toEqual({
      code: 'AGENT_EXECUTION_FAILED',
      message: 'DeepSeek Harness profile error.',
      authRequired: false,
    });
  });

  it('returns configuration guidance from the full connection-test path', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'od-dsh-auth-'));
    const previous = {
      PATH: process.env.PATH,
      DSH_HOME: process.env.DSH_HOME,
      OD_DSH_FAKE_MODE: process.env.OD_DSH_FAKE_MODE,
      OD_DSH_FAKE_SESSION_ROOT: process.env.OD_DSH_FAKE_SESSION_ROOT,
    };
    try {
      writeFakeDshCarrier(dir);
      process.env.PATH = `${dir}${delimiter}${previous.PATH ?? ''}`;
      process.env.DSH_HOME = createProfileHome(dir);
      process.env.OD_DSH_FAKE_MODE = 'missing-credential';
      process.env.OD_DSH_FAKE_SESSION_ROOT = dir;

      const result = await testAgentConnection({ agentId: 'deepseek-harness' });

      expect(result).toMatchObject({
        ok: false,
        kind: 'agent_auth_required',
        agentName: 'DeepSeek Harness',
        detail: deepseekHarnessAuthGuidance(),
      });
      expect(result.detail).not.toContain('[object Object]');
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === 'win32')(
    'reaps the cmd shim and its carrier child as one bounded process tree',
    async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'od-dsh-tree-'));
      let child: ReturnType<typeof spawn> | undefined;
      try {
        const carrier = writeFakeDshCarrier(dir);
        const env = { ...process.env, OD_DSH_FAKE_SESSION_ROOT: dir };
        const invocation = createCommandInvocation({
          command: carrier,
          args: ['--profile', 'open-design', '--stdio'],
          env,
        });
        child = spawn(invocation.command, invocation.args, {
          cwd: dir,
          env,
          windowsHide: true,
          windowsVerbatimArguments: invocation.windowsVerbatimArguments,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
        await waitFor(() => stdout.includes('"type":"ready"'));

        const before = await listProcessSnapshots();
        const tree = collectProcessTreePids(before, [child.pid ?? -1]);
        expect(tree).toContain(child.pid);
        expect(tree.length).toBeGreaterThanOrEqual(2);

        await stopProcesses(tree, { termGraceMs: 1_000, killGraceMs: 1_500 });
        await waitForClose(child);
        const live = new Set((await listProcessSnapshots()).map(({ pid }) => pid));
        expect(tree.filter((pid) => live.has(pid))).toEqual([]);
      } finally {
        if (child && child.exitCode === null) child.kill();
        rmSync(dir, { recursive: true, force: true });
      }
    },
    15_000,
  );
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for the DeepSeek Harness carrier.');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function waitForClose(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    child.once('close', () => resolve());
    child.once('error', reject);
  });
}
