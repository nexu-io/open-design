// Unit coverage for the ACP stdio-MCP guard's decision table.
//
// The wiring test (acp-stdio-mcp-wiring.test.ts) proves the guard is actually
// reached by a real `/api/runs` turn. This file pins the version boundary and
// the fail-safe direction, which the wiring test cannot enumerate cheaply.
//
// The version boundary below is not a guess: each row was checked against the
// published @moonshot-ai/kimi-code tarball by driving a manual ACP handshake
// (initialize → session/new carrying one stdio MCP server) at that version.

import { describe, expect, it } from 'vitest';
import {
  acpBuildAcceptsStdioMcp,
  isAcpStdioMcpServer,
  parseVersionCore,
  withholdStdioMcpServersForBuild,
} from '../src/agent-protocol/acp/stdio-mcp.js';
import { kimiAgentDef } from '../src/runtimes/defs/kimi.js';
import { hermesAgentDef } from '../src/runtimes/defs/hermes.js';
import { reasonixAgentDef } from '../src/runtimes/defs/reasonix.js';
import { traeCliAgentDef } from '../src/runtimes/defs/trae-cli.js';

const KIMI_REMOVED_IN = '0.37.0';

const liveArtifacts = {
  name: 'open-design-live-artifacts',
  type: 'stdio',
  command: 'od',
  args: ['mcp', 'live-artifacts'],
  env: [{ name: 'ELECTRON_RUN_AS_NODE', value: '1' }],
};
const httpServer = { name: 'remote', type: 'http', url: 'https://example.test/mcp' };

describe('parseVersionCore', () => {
  it('reads the major.minor.patch core', () => {
    expect(parseVersionCore('0.37.2')).toEqual({ major: 0, minor: 37, patch: 2 });
    expect(parseVersionCore('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('sorts a prerelease with its release, not below it', () => {
    // 0.37.0-beta carries the same session/new handler as 0.37.0.
    expect(parseVersionCore('0.37.0-beta.1')).toEqual({ major: 0, minor: 37, patch: 0 });
  });

  it('returns null for anything not X.Y.Z-shaped', () => {
    for (const bad of ['', 'unknown', 'kimi', '0.37', null, undefined]) {
      expect(parseVersionCore(bad as string | null | undefined)).toBeNull();
    }
  });
});

describe('acpBuildAcceptsStdioMcp — Kimi version boundary', () => {
  // Verified against the real published tarballs.
  it.each([
    ['0.35.0', true],
    ['0.36.0', true],
    ['0.36.1', true],
    ['0.37.0', false],
    ['0.37.1', false],
    ['0.37.2', false],
    ['0.38.0', false],
    ['1.0.0', false],
  ])('%s accepts stdio = %s', (version, accepts) => {
    expect(acpBuildAcceptsStdioMcp(version, KIMI_REMOVED_IN)).toBe(accepts);
  });

  it('fails safe to withholding when the reported version is unreadable', () => {
    // Sending stdio to a rejecting build costs the whole run; withholding it
    // from an accepting build costs one turn's live-artifact tooling.
    for (const unknown of [null, undefined, '', 'unknown']) {
      expect(acpBuildAcceptsStdioMcp(unknown, KIMI_REMOVED_IN)).toBe(false);
    }
  });

  it('accepts stdio at every version for a runtime that declares no removal', () => {
    for (const version of ['0.1.0', '0.38.0', '9.9.9', null, 'unknown']) {
      expect(acpBuildAcceptsStdioMcp(version, undefined)).toBe(true);
      expect(acpBuildAcceptsStdioMcp(version, null)).toBe(true);
    }
  });
});

describe('isAcpStdioMcpServer', () => {
  it('classifies both stdio spellings the same way', () => {
    // ACP treats a missing `type` as stdio, and Kimi 0.37+ rejects both.
    expect(isAcpStdioMcpServer({ name: 'a', command: 'od' })).toBe(true);
    expect(isAcpStdioMcpServer({ name: 'a', type: 'stdio', command: 'od' })).toBe(true);
    expect(isAcpStdioMcpServer({ name: 'a', type: null, command: 'od' })).toBe(true);
  });

  it('leaves the transports a rejecting build still accepts', () => {
    expect(isAcpStdioMcpServer(httpServer)).toBe(false);
    expect(isAcpStdioMcpServer({ name: 'a', type: 'sse', url: 'u' })).toBe(false);
  });
});

describe('withholdStdioMcpServersForBuild', () => {
  it('withholds stdio entries from a rejecting build and keeps http ones', () => {
    const result = withholdStdioMcpServersForBuild([liveArtifacts, httpServer], {
      reportedVersion: '0.38.0',
      removedInVersion: KIMI_REMOVED_IN,
    });
    expect(result.servers).toEqual([httpServer]);
    expect(result.withheldNames).toEqual(['open-design-live-artifacts']);
  });

  it('returns the input array by reference for an accepting build', () => {
    // No other agent's payload shape may move — identity is the strongest
    // available assertion that nothing was rebuilt.
    const servers = [liveArtifacts, httpServer];
    const result = withholdStdioMcpServersForBuild(servers, {
      reportedVersion: '0.36.1',
      removedInVersion: KIMI_REMOVED_IN,
    });
    expect(result.servers).toBe(servers);
    expect(result.withheldNames).toEqual([]);
  });

  it('returns the input array by reference when no removal version is declared', () => {
    const servers = [liveArtifacts];
    const result = withholdStdioMcpServersForBuild(servers, {
      reportedVersion: '0.38.0',
      removedInVersion: undefined,
    });
    expect(result.servers).toBe(servers);
    expect(result.withheldNames).toEqual([]);
  });

  it('names an unnamed withheld entry rather than dropping it silently', () => {
    const result = withholdStdioMcpServersForBuild([{ command: 'od' }], {
      reportedVersion: '0.38.0',
      removedInVersion: KIMI_REMOVED_IN,
    });
    expect(result.withheldNames).toEqual(['<unnamed>']);
  });
});

describe('runtime defs opting into the guard', () => {
  it('is declared for Kimi at the version its handler started throwing', () => {
    expect(kimiAgentDef.acpStdioMcpRemovedInVersion).toBe(KIMI_REMOVED_IN);
  });

  it('is not declared for the other mature-acp runtimes', () => {
    // hermes / trae-cli / reasonix still ingest stdio MCP servers. Declaring
    // nothing is what keeps their session/new payload byte-identical.
    for (const def of [hermesAgentDef, traeCliAgentDef, reasonixAgentDef]) {
      expect(def.mcpDiscovery).toBe('mature-acp');
      expect(
        (def as { acpStdioMcpRemovedInVersion?: string }).acpStdioMcpRemovedInVersion,
      ).toBeUndefined();
    }
  });

  it('leaves reasonix on its map env format, which is a separate axis', () => {
    // Guards against a future edit conflating "shape the env" with "withhold
    // the server" — reasonix needs the first and must not get the second.
    expect(reasonixAgentDef.acpMcpEnvFormat).toBe('map');
  });
});
