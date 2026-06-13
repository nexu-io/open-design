import { describe, expect, it } from 'vitest';

import { countFileOps, deriveFileOps } from '../../src/runtime/file-ops';
import type { AgentEvent } from '../../src/types';

type ToolUse = Extract<AgentEvent, { kind: 'tool_use' }>;
type ToolResult = Extract<AgentEvent, { kind: 'tool_result' }>;

function use(name: string, input: unknown, id: string): ToolUse {
  return { kind: 'tool_use', id, name, input };
}

function ok(id: string, content = ''): ToolResult {
  return { kind: 'tool_result', toolUseId: id, content, isError: false };
}

function fail(id: string, content = 'boom'): ToolResult {
  return { kind: 'tool_result', toolUseId: id, content, isError: true };
}

describe('deriveFileOps', () => {
  it('returns an empty list for an empty event stream', () => {
    expect(deriveFileOps(undefined)).toEqual([]);
    expect(deriveFileOps([])).toEqual([]);
  });

  it('skips tool_use events that are not file CRUD families', () => {
    const events: AgentEvent[] = [
      use('Bash', { command: 'ls' }, 't1'),
      use('TodoWrite', { todos: [] }, 't2'),
      use('WebSearch', { query: 'foo' }, 't3'),
    ];
    expect(deriveFileOps(events)).toEqual([]);
  });

  it('aggregates Read/Write/Edit by full path with basename + ops list', () => {
    const events: AgentEvent[] = [
      use('Read', { file_path: '/repo/a.ts' }, 't1'),
      ok('t1'),
      use('Write', { file_path: '/repo/b.ts', content: 'hi' }, 't2'),
      ok('t2'),
      use('Edit', { file_path: '/repo/a.ts', old_string: 'x', new_string: 'y' }, 't3'),
      ok('t3'),
    ];
    const rows = deriveFileOps(events);
    expect(rows).toHaveLength(2);
    const a = rows.find((row) => row.fullPath === '/repo/a.ts');
    expect(a).toMatchObject({
      path: 'a.ts',
      fullPath: '/repo/a.ts',
      ops: ['read', 'edit'],
      total: 2,
      status: 'done',
    });
    const b = rows.find((row) => row.fullPath === '/repo/b.ts');
    expect(b).toMatchObject({
      path: 'b.ts',
      ops: ['write'],
      total: 1,
      status: 'done',
    });
  });

  it('treats a missing tool_result as running and an isError result as error', () => {
    const events: AgentEvent[] = [
      use('Read', { file_path: '/repo/a.ts' }, 't1'),
      use('Edit', { file_path: '/repo/b.ts' }, 't2'),
      fail('t2'),
    ];
    const rows = deriveFileOps(events);
    expect(rows.find((row) => row.path === 'a.ts')?.status).toBe('running');
    expect(rows.find((row) => row.path === 'b.ts')?.status).toBe('error');
  });

  it('worst status wins when one file gets multiple results', () => {
    const events: AgentEvent[] = [
      use('Read', { file_path: '/repo/a.ts' }, 't1'),
      ok('t1'),
      use('Edit', { file_path: '/repo/a.ts' }, 't2'),
      fail('t2'),
    ];
    const [row] = deriveFileOps(events);
    expect(row?.status).toBe('error');
  });

  it('accepts the legacy `path` argument and the snake_case tool aliases', () => {
    const events: AgentEvent[] = [
      use('read_file', { path: '/repo/a.ts' }, 't1'),
      ok('t1'),
      use('create_file', { path: '/repo/b.ts' }, 't2'),
      ok('t2'),
      use('str_replace_edit', { path: '/repo/a.ts' }, 't3'),
      ok('t3'),
    ];
    const rows = deriveFileOps(events);
    expect(rows.map((row) => row.path).sort()).toEqual(['a.ts', 'b.ts']);
    expect(rows.find((row) => row.path === 'a.ts')?.ops).toEqual(['read', 'edit']);
  });

  it('drops events whose path is missing or "(unnamed)"', () => {
    const events: AgentEvent[] = [
      use('Write', { file_path: '' }, 't1'),
      use('Read', { file_path: '(unnamed)' }, 't2'),
      use('Edit', {}, 't3'),
    ];
    expect(deriveFileOps(events)).toEqual([]);
  });

  it('treats Windows-style paths and trailing slashes the same as POSIX', () => {
    const events: AgentEvent[] = [
      use('Read', { file_path: 'C:\\repo\\sub\\file.ts' }, 't1'),
      ok('t1'),
    ];
    const [row] = deriveFileOps(events);
    expect(row?.path).toBe('file.ts');
  });
});

describe('countFileOps', () => {
  it('totals tool_use counts by op family across all entries', () => {
    const events: AgentEvent[] = [
      use('Read', { file_path: '/a.ts' }, 't1'),
      ok('t1'),
      use('Read', { file_path: '/a.ts' }, 't2'),
      ok('t2'),
      use('Write', { file_path: '/b.ts' }, 't3'),
      ok('t3'),
      use('Edit', { file_path: '/a.ts' }, 't4'),
      ok('t4'),
    ];
    const rows = deriveFileOps(events);
    const counts = countFileOps(rows);
    expect(counts.read).toBe(2);
    expect(counts.write).toBe(1);
    expect(counts.edit).toBe(1);
  });

  it('returns zeros when there are no entries', () => {
    expect(countFileOps([])).toEqual({ read: 0, write: 0, edit: 0 });
  });
});
