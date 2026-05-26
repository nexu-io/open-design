import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createAgentRuntimeEnv, createAgentRuntimeToolPrompt } from '../src/server.js';
import { applyAgentLaunchEnv } from '../src/runtimes/launch.js';

describe('agent runtime tool environment', () => {
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

  it('pins the daemon runtime data dir into agent sessions', () => {
    const env = createAgentRuntimeEnv(
      { PATH: '/bin' },
      'http://127.0.0.1:7456',
      null,
      '/opt/open-design/bin/node',
    );

    expect(env.OD_DATA_DIR).toBe(process.env.OD_DATA_DIR);
  });

  it('describes daemon URL and token availability without exposing the token', () => {
    const prompt = createAgentRuntimeToolPrompt('http://127.0.0.1:7456', {
      token: 'secret-run-token',
    });

    expect(prompt).toContain('Daemon URL: `http://127.0.0.1:7456`');
    expect(prompt).toContain('`OD_DAEMON_URL`');
    expect(prompt).toContain('`OD_NODE_BIN`');
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
    const result = applyAgentLaunchEnv(base, { childPathPrepend: [] }, '');
    expect(result).toBe(base);
  });

  it('prepends childPathPrepend entries to PATH when key is uppercase', () => {
    const base = { PATH: '/usr/bin' };
    const result = applyAgentLaunchEnv(base, { childPathPrepend: ['/opt/copilot'] }, '');
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
    const result = applyAgentLaunchEnv(base, { childPathPrepend: ['/opt/agent/bin'] }, '');

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
    const result = applyAgentLaunchEnv(base, { childPathPrepend: ['/opt/bin'] }, '');
    expect(result.Path).toBe(existing);
  });
});
