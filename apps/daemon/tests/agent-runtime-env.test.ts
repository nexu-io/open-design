import { describe, expect, it } from 'vitest';

import { createAgentRuntimeEnv, createAgentRuntimeToolPrompt } from '../src/server.js';

describe('agent runtime tool environment', () => {
  it('injects daemon URL and run-scoped tool token into agent sessions', () => {
    const env = createAgentRuntimeEnv(
      { PATH: '/bin', OD_TOOL_TOKEN: 'stale-token' },
      'http://127.0.0.1:7456',
      { token: 'fresh-token' },
      '/opt/open-design/bin/node',
    );

    expect(env).toMatchObject({
      PATH: '/bin',
      OD_DAEMON_URL: 'http://127.0.0.1:7456',
      OD_NODE_BIN: '/opt/open-design/bin/node',
      OD_TOOL_TOKEN: 'fresh-token',
    });
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
