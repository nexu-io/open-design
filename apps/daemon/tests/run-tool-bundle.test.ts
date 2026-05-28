import { describe, expect, it } from 'vitest';

import {
  normalizeRunToolBundleForRun,
  resolveExternalMcpServersForRun,
  summarizeRunToolBundle,
} from '../src/run-tool-bundle.js';

describe('run-scoped tool bundles', () => {
  it('sanitizes MCP servers onto the run and redacts spawn-only details in summaries', () => {
    const bundle = normalizeRunToolBundleForRun({
      mcpServers: [
        {
          id: 'local-tools',
          label: 'Local tools',
          transport: 'stdio',
          command: 'node',
          args: ['server.js', '--token=secret'],
          env: { API_TOKEN: 'secret' },
        },
        {
          id: 'remote-tools',
          transport: 'http',
          url: 'https://example.test/mcp',
          headers: { Authorization: 'Bearer secret' },
        },
        {
          id: '../bad',
          transport: 'stdio',
          command: 'node',
        },
      ],
    });

    expect(bundle.mcpServers).toHaveLength(2);
    expect(bundle.mcpServers[0]).toMatchObject({
      id: 'local-tools',
      command: 'node',
      env: { API_TOKEN: 'secret' },
    });

    const summary = summarizeRunToolBundle(bundle);
    expect(summary).toEqual({
      mcpServers: [
        {
          id: 'local-tools',
          label: 'Local tools',
          transport: 'stdio',
          enabled: true,
        },
        {
          id: 'remote-tools',
          transport: 'http',
          enabled: true,
          authMode: 'oauth',
        },
      ],
    });
    expect(JSON.stringify(summary)).not.toContain('secret');
    expect(JSON.stringify(summary)).not.toContain('server.js');
  });

  it('uses only run-scoped MCP servers in sandbox mode', () => {
    const persistedServers = normalizeRunToolBundleForRun({
      mcpServers: [
        {
          id: 'persisted',
          transport: 'http',
          url: 'https://persisted.example.test/mcp',
        },
      ],
    }).mcpServers;
    const runScopedServers = normalizeRunToolBundleForRun({
      mcpServers: [
        {
          id: 'run-only',
          transport: 'stdio',
          command: 'node',
          args: ['run-tool.js'],
        },
      ],
    }).mcpServers;

    const selection = resolveExternalMcpServersForRun({
      persistedServers,
      runScopedServers,
      sandboxMode: true,
    });

    expect(selection.enabledServers.map((server) => server.id)).toEqual(['run-only']);
    expect([...selection.persistedTokenServerIds]).toEqual([]);
  });

  it('lets a run-scoped server override persisted config without inheriting persisted tokens', () => {
    const persistedServers = normalizeRunToolBundleForRun({
      mcpServers: [
        {
          id: 'shared',
          transport: 'http',
          url: 'https://persisted.example.test/mcp',
        },
        {
          id: 'persisted-only',
          transport: 'http',
          url: 'https://persisted-only.example.test/mcp',
        },
      ],
    }).mcpServers;
    const runScopedServers = normalizeRunToolBundleForRun({
      mcpServers: [
        {
          id: 'shared',
          transport: 'http',
          url: 'https://run.example.test/mcp',
          headers: { Authorization: 'Bearer run-token' },
        },
      ],
    }).mcpServers;

    const selection = resolveExternalMcpServersForRun({
      persistedServers,
      runScopedServers,
      sandboxMode: false,
    });

    expect(selection.enabledServers).toHaveLength(2);
    expect(selection.enabledServers.find((server) => server.id === 'shared')).toMatchObject({
      url: 'https://run.example.test/mcp',
    });
    expect([...selection.persistedTokenServerIds]).toEqual(['persisted-only']);
  });
});
