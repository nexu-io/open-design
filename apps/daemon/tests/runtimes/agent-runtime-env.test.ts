import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { SIDECAR_ENV } from '@open-design/sidecar-proto';

import {
  createAgentRuntimeEnv,
  createAgentRuntimeToolPrompt,
  createDaemonDataDirConfiguredAgentEnv,
  createOpenDesignToolEnv,
  resolveOpenDesignNodeBin,
} from '../../src/server.js';
import { applyAgentLaunchEnv } from '../../src/runtimes/launch.js';
import { spawnEnvForAgent } from '../../src/runtimes/env.js';
import { withPlatform } from './helpers/test-helpers.js';

describe('agent runtime tool environment', () => {
  it('prefers explicit OD_NODE_BIN over the process executable', () => {
    expect(resolveOpenDesignNodeBin({
      env: { OD_NODE_BIN: 'C:\\Open Design\\resources\\open-design\\bin\\node.exe' },
      execPath: 'C:\\Users\\Ada\\AppData\\Roaming\\Open Design\\en\\hash\\Open Design.exe',
      platform: 'win32',
      resourceRoot: null,
    })).toBe('C:\\Open Design\\resources\\open-design\\bin\\node.exe');
  });

  it('resolves the bundled resource node before falling back to process.execPath', () => {
    expect(resolveOpenDesignNodeBin({
      env: {},
      execPath: 'C:\\Users\\Ada\\AppData\\Roaming\\Open Design\\en\\hash\\Open Design.exe',
      platform: 'win32',
      resourceRoot: 'C:\\Users\\Ada\\AppData\\Local\\Programs\\Open Design\\resources\\open-design',
      exists: (candidate) => candidate.endsWith('\\resources\\open-design\\bin\\node.exe'),
    })).toBe('C:\\Users\\Ada\\AppData\\Local\\Programs\\Open Design\\resources\\open-design\\bin\\node.exe');
  });

  it('injects daemon URL and run-scoped tool token into agent sessions', () => {
    const env = createAgentRuntimeEnv(
      { PATH: '/bin', OD_TOOL_TOKEN: 'stale-token' },
      'http://127.0.0.1:7456',
      { token: 'fresh-token' },
      '/opt/open-design/bin/node',
    );

    expect(env).toMatchObject({
      PATH: `/opt/open-design/bin${path.delimiter}/bin`,
      OD_DAEMON_URL: 'http://127.0.0.1:7456',
      OD_NODE_BIN: '/opt/open-design/bin/node',
      OD_TOOL_TOKEN: 'fresh-token',
    });
  });

  it('prepends node binary directory to PATH when not already present', () => {
    const env = createAgentRuntimeEnv(
      { PATH: '/bin' },
      'http://127.0.0.1:7456',
      null,
      '/opt/node/node',
    );

    expect(env.PATH).toBe(`/opt/node${path.delimiter}/bin`);
  });

  it('does not duplicate node binary directory when already present in PATH', () => {
    const env = createAgentRuntimeEnv(
      { PATH: `/opt/node${path.delimiter}/bin` },
      'http://127.0.0.1:7456',
      null,
      '/opt/node/node',
    );

    expect(env.PATH).toBe(`/opt/node${path.delimiter}/bin`);
  });

  it('updates the existing path key in place when the base env uses Windows-style Path casing', () => {
    // Windows GUI launches commonly spread process.env where the search path is
    // stored under 'Path' rather than 'PATH'. The function must read and update
    // that same key so child_process.spawn (which de-duplicates env keys
    // case-insensitively on Windows) does not discard the inherited directories.
    const env = createAgentRuntimeEnv(
      { Path: `/usr/local/bin` },
      'http://127.0.0.1:7456',
      null,
      '/opt/node/node',
    );

    // The original 'Path' key must be updated with the prepended node dir.
    expect(env.Path).toBe(`/opt/node${path.delimiter}/usr/local/bin`);
    // A competing uppercase 'PATH' key must NOT be created alongside it.
    expect(env.PATH).toBeUndefined();
  });

  it('does not leak stale inherited tool tokens when no run token was minted', () => {
    const env = createAgentRuntimeEnv(
      { PATH: '/bin', OD_TOOL_TOKEN: 'stale-token' },
      'http://127.0.0.1:7456',
      null,
      '/opt/open-design/bin/node',
    );

    expect(env.OD_DAEMON_URL).toBe('http://127.0.0.1:7456');
    expect(env.OD_NODE_BIN).toBe('/opt/open-design/bin/node');
    expect(env.OD_TOOL_TOKEN).toBeUndefined();
  });

  it('does not expose the broad daemon API token to run-scoped agent sessions', () => {
    const env = createAgentRuntimeEnv(
      {
        PATH: '/bin',
        OD_API_TOKEN: 'broad-daemon-token',
        Od_Api_Token: 'windows-cased-broad-token',
      },
      'http://100.64.0.10:7456',
      { token: 'run-scoped-token' },
      '/opt/open-design/bin/node',
    );

    expect(env.OD_TOOL_TOKEN).toBe('run-scoped-token');
    expect(Object.keys(env).some((key) => key.toUpperCase() === 'OD_API_TOKEN')).toBe(false);
  });

  it('normalizes a narrowed Windows PATHEXT so executable lookup still finds .EXE entries', () => {
    // A GUI-launched daemon can inherit a broken PATHEXT such as `.CPL` (issue
    // #6934). Without normalization, nested native commands lose stdout/stderr
    // or fail with ERROR_NO_DATA. The runtime must recover a usable extension
    // list so `.EXE` entries resolve again.
    const env = withPlatform('win32', () =>
      createAgentRuntimeEnv(
        { PATH: '/bin', PATHEXT: '.CPL' },
        'http://127.0.0.1:7456',
        null,
        '/opt/open-design/bin/node',
      ),
    );

    expect(env.PATHEXT).toMatch(/\.exe/i);
  });

  it('preserves a valid Windows PATHEXT that already contains .EXE', () => {
    const env = withPlatform('win32', () =>
      createAgentRuntimeEnv(
        { PATH: '/bin', PATHEXT: '.CUSTOM;.EXE;.CMD' },
        'http://127.0.0.1:7456',
        null,
        '/opt/open-design/bin/node',
      ),
    );

    expect(env.PATHEXT).toBe('.CUSTOM;.EXE;.CMD');
  });

  it('normalizes PATHEXT in place when the inherited env uses Windows-style lowercase casing', () => {
    // Node de-duplicates env keys case-insensitively on Windows, so writing a
    // fresh 'PATHEXT' alongside an existing 'pathext' would be ignored. The
    // existing differently-cased key must be updated instead.
    const env = withPlatform('win32', () =>
      createAgentRuntimeEnv(
        { PATH: '/bin', pathext: '.CPL' },
        'http://127.0.0.1:7456',
        null,
        '/opt/open-design/bin/node',
      ),
    );

    expect(env.pathext).toMatch(/\.exe/i);
    expect(env.PATHEXT).toBeUndefined();
  });

  it('leaves PATHEXT untouched on non-Windows platforms', () => {
    const env = withPlatform('linux', () =>
      createAgentRuntimeEnv(
        { PATH: '/bin', PATHEXT: '.CPL' },
        'http://127.0.0.1:7456',
        null,
        '/opt/open-design/bin/node',
      ),
    );

    expect(env.PATHEXT).toBe('.CPL');
  });

  it('pins the daemon runtime data dir into agent sessions', () => {
    const env = createAgentRuntimeEnv(
      { PATH: '/bin' },
      'http://127.0.0.1:7456',
      null,
      '/opt/open-design/bin/node',
    );

    expect(env.OD_DATA_DIR).toBe(process.env.OD_DATA_DIR);
  });

  it('keeps wrapper media commands on the daemon data dir even when configured agent env is stale', () => {
    const base = createAgentRuntimeEnv(
      { PATH: '/bin', OD_DATA_DIR: '/stale/process/data' },
      'http://127.0.0.1:7456',
      null,
      '/opt/open-design/bin/node',
    );
    const configuredAgentEnv = createDaemonDataDirConfiguredAgentEnv({
      OD_DATA_DIR: '/stale/configured/data',
    });

    const env = {
      ...spawnEnvForAgent(
        'amr',
        base,
        configuredAgentEnv,
      ),
      ...createOpenDesignToolEnv({
        daemonUrl: 'http://127.0.0.1:7456',
        hyperFramesBin: '/opt/open-design/hyperframes/bin/hyperframes.mjs',
        projectDir: '/tmp/project',
        projectId: 'project-1',
      }),
    };

    expect(env.OD_DATA_DIR).toBe(process.env.OD_DATA_DIR);
    expect(env.OPENCODE_TEST_HOME).toBe(
      path.join(process.env.OD_DATA_DIR ?? '', 'amr', 'opencode-home'),
    );
    expect(env.OD_PROJECT_ID).toBe('project-1');
    expect(env.OD_PROJECT_DIR).toBe('/tmp/project');
    expect(env.OD_HYPERFRAMES_BIN).toBe('/opt/open-design/hyperframes/bin/hyperframes.mjs');
  });

  it('names the codex rollout root so a complex Run can observe its native Children', () => {
    // `collectCodexChildEvidence` reads
    // `<CODEX_HOME>/sessions/YYYY/MM/DD/rollout-*.jsonl` and deliberately
    // refuses a homedir fallback, so it can never attribute one install's
    // sessions to another. That leaves the caller owing it an explicit root,
    // and nothing supplied one: the collector's `CODEX_HOME` guard was false on
    // every default install, so a complex Run's native Children went
    // unobserved and certification failed for evidence never looked for.
    const env = spawnEnvForAgent('codex', { PATH: '/bin' });
    expect(env.CODEX_HOME).toBe(path.join(os.homedir(), '.codex'));
  });

  it('leaves an explicitly configured codex rollout root alone', () => {
    const env = spawnEnvForAgent('codex', { PATH: '/bin', CODEX_HOME: '/custom/codex' });
    expect(env.CODEX_HOME).toBe('/custom/codex');
  });

  it('keeps non-sandbox NO_PROXY behavior unchanged', () => {
    const env = createAgentRuntimeEnv(
      { PATH: '/bin', HTTP_PROXY: 'http://127.0.0.1:9', NO_PROXY: '' },
      'http://127.0.0.1:7456',
      { token: 'fresh-token' },
      '/opt/open-design/bin/node',
    );

    expect(env.HTTP_PROXY).toBe('http://127.0.0.1:9');
    expect(env.NO_PROXY).toBe('');
    expect(env.no_proxy).toBeUndefined();
  });

  it('passes the daemon sidecar IPC path from the explicit base env into agent wrapper sessions', () => {
    const env = createAgentRuntimeEnv(
      { PATH: '/bin', [SIDECAR_ENV.IPC_PATH]: '/tmp/open-design/ipc/daemon.sock' },
      'http://127.0.0.1:7456',
      null,
      '/opt/open-design/bin/node',
    );

    expect(env[SIDECAR_ENV.IPC_PATH]).toBe('/tmp/open-design/ipc/daemon.sock');
  });

  it('does not pull the daemon sidecar IPC path from ambient process state', () => {
    vi.stubEnv(SIDECAR_ENV.IPC_PATH, '/tmp/open-design/ipc/stale.sock');
    try {
      const env = createAgentRuntimeEnv(
        { PATH: '/bin' },
        'http://127.0.0.1:7456',
        null,
        '/opt/open-design/bin/node',
      );

      expect(env[SIDECAR_ENV.IPC_PATH]).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('describes daemon URL and token availability without exposing the token', () => {
    const prompt = createAgentRuntimeToolPrompt('http://127.0.0.1:7456', {
      token: 'secret-run-token',
    });

    expect(prompt).toContain('Daemon URL: `http://127.0.0.1:7456`');
    expect(prompt).toContain('`OD_DAEMON_URL`');
    expect(prompt).toContain('`OD_NODE_BIN`');
    expect(prompt).toContain('`OD_HYPERFRAMES_BIN`');
    expect(prompt).toContain('`"$OD_NODE_BIN" "$OD_BIN" tools ...`');
    expect(prompt).toContain('& $env:OD_NODE_BIN $env:OD_BIN tools ...');
    expect(prompt).toContain('`OD_TOOL_TOKEN` is available');
    expect(prompt).toContain('do not print, persist, or override it');
    expect(prompt).not.toContain('secret-run-token');
  });

  it('describes missing token availability without exposing stale internals', () => {
    const prompt = createAgentRuntimeToolPrompt('http://127.0.0.1:7456', null);

    expect(prompt).toContain('Daemon URL: `http://127.0.0.1:7456`');
    expect(prompt).toContain('`OD_TOOL_TOKEN` is not available');
    expect(prompt).not.toContain('Bearer');
  });
});

describe('applyAgentLaunchEnv', () => {
  it('returns env unchanged when childPathPrepend is empty and no node dir is provided', () => {
    const base = { Path: ['/usr/local/bin', '/usr/bin'].join(path.delimiter), OTHER: 'val' };
    const result = applyAgentLaunchEnv(base, { childPathPrepend: [] }, '', []);
    expect(result).toBe(base);
  });

  it('prepends childPathPrepend entries to PATH when key is uppercase', () => {
    const base = { PATH: '/usr/bin' };
    const result = applyAgentLaunchEnv(base, { childPathPrepend: ['/opt/copilot'] }, '', []);
    expect(result.PATH).toBe(`/opt/copilot${path.delimiter}/usr/bin`);
    expect(result.Path).toBeUndefined();
  });

  it('uses the existing Windows-style Path key instead of adding a competing PATH key', () => {
    // This is the Windows GUI regression: env.PATH is undefined when the actual
    // key is 'Path'.  The old code created a fresh PATH = just childPathPrepend,
    // discarding the system paths and the node directory prepended by
    // createAgentRuntimeEnv, which caused '"node" is not recognized' errors.
    // Pure POSIX paths + path.delimiter keep the assertion correct on all platforms;
    // the real Windows C:\...;... shape is covered by winTest in launch.test.ts.
    const base = { Path: ['/opt/nodejs', '/usr/bin'].join(path.delimiter) };
    const result = applyAgentLaunchEnv(base, { childPathPrepend: ['/opt/agent/bin'] }, '', []);

    // The existing 'Path' key must be updated in place.
    expect(result.Path).toBe(
      ['/opt/agent/bin', '/opt/nodejs', '/usr/bin'].join(path.delimiter),
    );
    // A competing uppercase 'PATH' key must NOT be created.
    expect(result.PATH).toBeUndefined();
  });

  it('deduplicates entries already present in Path', () => {
    const existing = ['/opt/bin', '/usr/bin'].join(path.delimiter);
    const base = { Path: existing };
    const result = applyAgentLaunchEnv(base, { childPathPrepend: ['/opt/bin'] }, '', []);
    expect(result.Path).toBe(existing);
  });
});
