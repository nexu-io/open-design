import { describe, expect, it } from 'vitest';

import {
  normalizeRunToolBundleForRun,
  parseRunToolBundleForRequest,
  resolveExternalMcpServersForRun,
  summarizeRunToolBundle,
  validateRunToolBundleForAgent,
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

  it('rejects malformed run-scoped MCP server entries for request payloads', () => {
    expect(parseRunToolBundleForRequest('bad')).toEqual({
      ok: false,
      message: 'toolBundle must be an object',
    });
    expect(parseRunToolBundleForRequest({ mcpServers: 'bad' })).toEqual({
      ok: false,
      message: 'toolBundle.mcpServers must be an array',
    });
    expect(parseRunToolBundleForRequest({
      mcpServers: [
        {
          id: 'missing-command',
          transport: 'stdio',
        },
      ],
    })).toEqual({
      ok: false,
      message: 'toolBundle.mcpServers[0] is invalid',
    });
    expect(parseRunToolBundleForRequest({
      mcpServers: [
        {
          id: 'dup',
          transport: 'stdio',
          command: 'node',
        },
        {
          id: 'dup',
          transport: 'http',
          url: 'https://example.test/mcp',
        },
      ],
    })).toEqual({
      ok: false,
      message: 'toolBundle.mcpServers[1] duplicates server id "dup"',
    });
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

  it('rejects bundles for runtimes that cannot receive the requested servers', () => {
    const stdioOnly = normalizeRunToolBundleForRun({
      mcpServers: [
        {
          id: 'local',
          transport: 'stdio',
          command: 'node',
        },
      ],
    });
    const remote = normalizeRunToolBundleForRun({
      mcpServers: [
        {
          id: 'remote',
          transport: 'http',
          url: 'https://example.test/mcp',
        },
      ],
    });

    expect(validateRunToolBundleForAgent(stdioOnly, {
      id: 'codex',
      name: 'Codex CLI',
    })).toEqual({
      ok: false,
      message: 'Codex CLI (codex) does not support run-scoped MCP tool bundles',
    });

    expect(validateRunToolBundleForAgent(remote, {
      id: 'hermes',
      name: 'Hermes',
      externalMcpInjection: 'acp-merge',
    })).toEqual({
      ok: false,
      message:
        'toolBundle.mcpServers[0] uses http transport, but Hermes (hermes) only supports stdio run-scoped MCP servers',
    });

    expect(validateRunToolBundleForAgent(remote, {
      id: 'claude',
      name: 'Claude Code',
      externalMcpInjection: 'claude-mcp-json',
    })).toEqual({ ok: true });

    expect(validateRunToolBundleForAgent(remote, {
      id: 'claude',
      name: 'Claude Code',
      externalMcpInjection: 'claude-mcp-json',
    }, {
      deliveryTarget: 'external-project',
    })).toEqual({
      ok: false,
      message:
        'Claude Code (claude) receives run-scoped MCP tool bundles through project .mcp.json, ' +
        'so toolBundle requires a daemon-managed project',
    });
  });
});
