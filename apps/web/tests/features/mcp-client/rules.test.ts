// Pure-rule characterization for the MCP client slice. No doubles: every
// function here takes plain data and returns plain data. Pins auth-mode
// inference, the draft-row <-> wire mapping (incl. the underscore-field strip),
// template instantiation, validation, dirty-signature, id suggestion, picker
// grouping and agent-support partitioning.
import { describe, expect, it } from 'vitest';
import type { McpServerConfig, McpTemplate } from '@open-design/contracts';
import type { AgentInfo } from '../../../src/types';
import {
  authModeAfterUrlChange,
  buildMcpPickerGroups,
  effectiveMcpAuthMode,
  genLocalId,
  inferMcpAuthMode,
  isLoopbackMcpUrl,
  mapToText,
  partitionMcpAgentSupport,
  rowFromBlank,
  rowFromTemplate,
  rowsFromServers,
  rowsToServers,
  signature,
  suggestMcpServerId,
  templateMatchesQuery,
  textToMap,
  validateRow,
} from '../../../src/features/mcp-client/rules';
import type { DraftRow } from '../../../src/features/mcp-client/types';

function draft(over: Partial<DraftRow> = {}): DraftRow {
  return { id: 'srv', transport: 'stdio', enabled: true, _localId: 'x', ...over };
}
function template(over: Partial<McpTemplate> = {}): McpTemplate {
  return {
    id: 'tpl',
    label: 'Tpl',
    description: 'd',
    transport: 'stdio',
    category: 'utilities',
    ...over,
  };
}
function agent(over: Partial<AgentInfo> = {}): AgentInfo {
  return { id: 'claude', name: 'Claude', bin: 'claude', available: true, ...over };
}

describe('isLoopbackMcpUrl', () => {
  it('recognises localhost, ::1 and 127.x loopback', () => {
    expect(isLoopbackMcpUrl('http://localhost:1/x')).toBe(true);
    expect(isLoopbackMcpUrl('http://127.0.0.1/x')).toBe(true);
    expect(isLoopbackMcpUrl('http://[::1]/x')).toBe(true);
    // The WHATWG URL parser normalizes a bracketed IPv4-mapped IPv6 host to its
    // hex form (`::ffff:7f00:1`), so the dotted `::ffff:127.x` guard never sees
    // a dotted host — this input resolves to false. Preserved verbatim from the
    // pre-refactor helper.
    expect(isLoopbackMcpUrl('http://[::ffff:127.0.0.1]/x')).toBe(false);
  });
  it('rejects public hosts, empty and malformed urls', () => {
    expect(isLoopbackMcpUrl('https://mcp.example.com/x')).toBe(false);
    expect(isLoopbackMcpUrl(undefined)).toBe(false);
    expect(isLoopbackMcpUrl('not a url')).toBe(false);
  });
});

describe('auth-mode inference', () => {
  it('infers none for loopback and oauth for public', () => {
    expect(inferMcpAuthMode('http://localhost/x')).toBe('none');
    expect(inferMcpAuthMode('https://public/x')).toBe('oauth');
  });
  it('effectiveMcpAuthMode is none for stdio regardless of url', () => {
    expect(effectiveMcpAuthMode({ transport: 'stdio', url: 'https://p/x' })).toBe('none');
  });
  it('effectiveMcpAuthMode honours an explicit authMode, else infers', () => {
    expect(effectiveMcpAuthMode({ transport: 'http', authMode: 'none', url: 'https://p' })).toBe('none');
    expect(effectiveMcpAuthMode({ transport: 'http', url: 'https://p' })).toBe('oauth');
  });
  it('authModeAfterUrlChange re-infers only when the user has not overridden', () => {
    // No explicit mode -> follows the new url.
    expect(authModeAfterUrlChange({ url: 'https://p' }, 'http://localhost/x')).toBe('none');
    // Explicit mode equal to the previously-inferred one -> still tracks the url.
    expect(authModeAfterUrlChange({ url: 'https://p', authMode: 'oauth' }, 'http://localhost/x')).toBe('none');
    // Explicit mode that diverged from inference -> preserved across the change.
    expect(authModeAfterUrlChange({ url: 'https://p', authMode: 'none' }, 'https://other')).toBe('none');
  });
});

describe('KEY=VALUE map <-> text', () => {
  it('round-trips a map to text', () => {
    expect(mapToText({ A: '1', B: '2' })).toBe('A=1\nB=2');
  });
  it('parses text, skipping blanks/comments/keyless lines', () => {
    expect(textToMap('A=1\n\n# c\nB = 2\n=nope\nC=')).toEqual({ A: '1', B: '2', C: '' });
  });
  it('returns undefined for empty or all-skipped text', () => {
    expect(textToMap(undefined)).toBeUndefined();
    expect(textToMap('# only a comment')).toBeUndefined();
  });
});

describe('rowsFromServers / rowsToServers', () => {
  it('hydrates http rows with an effective authMode and env/header text', () => {
    const rows = rowsFromServers([
      { id: 'a', transport: 'http', enabled: true, url: 'https://p', headers: { H: 'v' } },
      { id: 'b', transport: 'stdio', enabled: true, env: { E: 'v' } },
    ]);
    expect(rows[0]!.authMode).toBe('oauth');
    expect(rows[0]!._headersText).toBe('H=v');
    expect(rows[1]!._envText).toBe('E=v');
    expect(rows[0]!._localId).toBeTruthy();
  });
  it('strips underscore scratch fields and drops empty maps/args on the way out', () => {
    const out = rowsToServers([
      draft({ id: 'a', transport: 'stdio', command: 'npx', args: [], _envText: '', label: 'L', templateId: 't' }),
      draft({ id: 'b', transport: 'http', url: 'https://p', _headersText: 'H=v' }),
    ]);
    expect(out[0]).toEqual({ id: 'a', transport: 'stdio', enabled: true, label: 'L', templateId: 't', command: 'npx' });
    expect(out[1]).toEqual({ id: 'b', transport: 'http', enabled: true, authMode: 'oauth', url: 'https://p', headers: { H: 'v' } });
  });
});

describe('rowFromTemplate / rowFromBlank', () => {
  it('builds a draft from a template, seeding env/header fields and a unique id', () => {
    const row = rowFromTemplate(
      template({ id: 'figma', transport: 'http', url: 'https://p', headerFields: [{ key: 'Authorization' }] }),
      new Set(['figma']),
    );
    expect(row.id).toBe('figma-2');
    expect(row._isNew).toBe(true);
    expect(row._headersText).toBe('Authorization=');
    expect(row.authMode).toBe('oauth');
  });
  it('builds a blank stdio draft', () => {
    const row = rowFromBlank(new Set());
    expect(row).toMatchObject({ id: 'custom', transport: 'stdio', enabled: true, _isNew: true });
  });
});

describe('templateMatchesQuery', () => {
  it('matches on label, id, description or example, case-insensitively', () => {
    const tpl = template({ label: 'Figma', id: 'figma-use', description: 'design', example: 'draw' });
    expect(templateMatchesQuery(tpl, '')).toBe(true);
    expect(templateMatchesQuery(tpl, 'FIG')).toBe(true);
    expect(templateMatchesQuery(tpl, 'design')).toBe(true);
    expect(templateMatchesQuery(tpl, 'draw')).toBe(true);
    expect(templateMatchesQuery(tpl, 'nope')).toBe(false);
  });
});

describe('validateRow', () => {
  it('rejects a bad id', () => {
    expect(validateRow(draft({ id: '-bad' }))).toMatch(/ID must start/);
  });
  it('requires a command for stdio', () => {
    expect(validateRow(draft({ id: 'a', transport: 'stdio', command: '  ' }))).toMatch(/Command is required/);
    expect(validateRow(draft({ id: 'a', transport: 'stdio', command: 'npx' }))).toBeNull();
  });
  it('requires a valid http/https url for sse/http', () => {
    expect(validateRow(draft({ id: 'a', transport: 'http' }))).toMatch(/URL is required/);
    expect(validateRow(draft({ id: 'a', transport: 'http', url: 'ftp://x' }))).toMatch(/http:\/\//);
    expect(validateRow(draft({ id: 'a', transport: 'http', url: 'not a url' }))).toMatch(/malformed/);
    expect(validateRow(draft({ id: 'a', transport: 'http', url: 'https://p' }))).toBeNull();
  });
});

describe('signature', () => {
  it('is stable across underscore-only differences and changes on real edits', () => {
    const a = draft({ id: 'a', transport: 'stdio', command: 'npx', _envText: 'X=1' });
    const b = draft({ id: 'a', transport: 'stdio', command: 'npx', _envText: 'X=1\n# ignored map same', _localId: 'other' });
    expect(signature([a])).toBe(signature([b]));
    expect(signature([a])).not.toBe(signature([draft({ id: 'a', transport: 'stdio', command: 'node' })]));
  });
});

describe('suggestMcpServerId', () => {
  it('slugs, falls back to mcp-server, and disambiguates against taken ids', () => {
    expect(suggestMcpServerId('My Server!', new Set())).toBe('my-server');
    expect(suggestMcpServerId('', new Set())).toBe('mcp-server');
    expect(suggestMcpServerId('dup', new Set(['dup', 'dup-2']))).toBe('dup-3');
  });
});

describe('genLocalId', () => {
  it('produces monotonically distinct ids', () => {
    expect(genLocalId()).not.toBe(genLocalId());
  });
});

describe('buildMcpPickerGroups', () => {
  const templates = [
    template({ id: 'gen', category: 'image-generation', label: 'Gen' }),
    template({ id: 'util', category: 'utilities', label: 'Util' }),
  ];
  it('orders groups, defaults the visual-pipeline ones open, and hides empty groups', () => {
    const { groups, visibleTotal } = buildMcpPickerGroups(templates, '');
    expect(groups.map((g) => g.id)).toEqual(['image-generation', 'utilities']);
    expect(groups.find((g) => g.id === 'image-generation')!.defaultOpen).toBe(true);
    expect(groups.find((g) => g.id === 'utilities')!.defaultOpen).toBe(false);
    expect(visibleTotal).toBe(2);
  });
  it('with a query, drops non-matching groups and forces the survivors open', () => {
    const { groups, visibleTotal } = buildMcpPickerGroups(templates, 'util');
    expect(groups.map((g) => g.id)).toEqual(['utilities']);
    expect(groups[0]!.defaultOpen).toBe(true);
    expect(visibleTotal).toBe(1);
  });
});

describe('partitionMcpAgentSupport', () => {
  it('scopes to installed visible CLIs and splits by injection support', () => {
    const result = partitionMcpAgentSupport([
      agent({ id: 'claude', externalMcpInjection: 'claude-mcp-json' }),
      agent({ id: 'hermes', externalMcpInjection: 'acp-merge' }),
      agent({ id: 'opencode', externalMcpInjection: undefined }),
      agent({ id: 'offline', available: false, externalMcpInjection: 'claude-mcp-json' }),
      agent({ id: 'byok-opencode', externalMcpInjection: 'claude-mcp-json' }), // hidden
    ]);
    expect(result.supported.map((a) => a.id)).toEqual(['claude', 'hermes']);
    expect(result.unsupported.map((a) => a.id)).toEqual(['opencode']);
    expect(result.hasAcpSupported).toBe(true);
  });
});
