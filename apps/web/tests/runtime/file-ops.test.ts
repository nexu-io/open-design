import { describe, expect, it } from 'vitest';

import {
  countArtifactFileOps,
  countFileOps,
  deriveFileOps,
  hasFileMutationToolUse,
} from '../../src/runtime/file-ops';
import type { AgentEvent } from '../../src/types';

type ToolUse = Extract<AgentEvent, { kind: 'tool_use' }>;
type ToolResult = Extract<AgentEvent, { kind: 'tool_result' }>;

function use(name: string, input: unknown, id: string): ToolUse {
  return { kind: 'tool_use', id, name, input };
}

function ok(id: string, content = ''): ToolResult {
  return { kind: 'tool_result', toolUseId: id, content, isError: false };
}

describe('hasFileMutationToolUse project scope', () => {
  const scope = { resolvedDir: '/Users/test/projects/prototype' };

  it.each(['Edit', 'Write', 'Delete', 'str_replace_edit', 'create_file'])('excludes a project-external %s', (name) => {
    expect(hasFileMutationToolUse([use(name, { filePath: '/tmp/od-probe/cdp.mjs' }, 'probe')], scope)).toBe(false);
  });

  it.each([
    '/Users/test/projects/prototype/index.html',
    'index.html',
    './assets/app.js',
  ])('retains project mutation attempts at %s', (file_path) => {
    expect(hasFileMutationToolUse([use('Edit', { file_path }, 'edit')], scope)).toBe(true);
  });

  it('keeps external non-temp paths conservative because they may alias the project', () => {
    // A symlinked project root, or an external symlink into the project, has
    // no traversal segment; only the daemon could canonicalize either path.
    expect(hasFileMutationToolUse([use('Edit', { path: '/Volumes/data/prototype/index.html' }, 'alias')], scope)).toBe(true);
    expect(hasFileMutationToolUse([use('Edit', { path: '/Users/test/projects/prototype-backup/index.html' }, 'sibling')], scope)).toBe(true);
  });

  it.each([
    '/private/tmp/od-probe/cdp.mjs',
    '/var/tmp/probe.js',
    '/var/folders/xy/T/od-probe/cdp.mjs',
    '/private/var/folders/xy/T/od-probe/cdp.mjs',
  ])('excludes the temp scratch path %s', (filePath) => {
    expect(hasFileMutationToolUse([use('Edit', { filePath }, 'probe')], scope)).toBe(false);
  });

  it('keeps temp edits conservative when the project itself lives in a temp directory', () => {
    const tempScope = { resolvedDir: '/tmp/od-projects/prototype' };
    expect(hasFileMutationToolUse([use('Edit', { filePath: '/private/tmp/od-projects/prototype/index.html' }, 'alias')], tempScope)).toBe(true);
    expect(hasFileMutationToolUse([use('Edit', { filePath: '/tmp/od-probe/cdp.mjs' }, 'probe')], tempScope)).toBe(true);
  });

  it.each([
    ['/tmp', '/private/tmp/prototype/index.html'],
    ['/private/tmp', '/tmp/prototype/index.html'],
    ['/var/tmp', '/tmp/prototype/index.html'],
    ['/var/folders', '/tmp/prototype/index.html'],
    ['/private/var/folders', '/tmp/prototype/index.html'],
    ['C:\\Temp', 'C:\\Windows\\Temp\\prototype\\index.html'],
    ['C:\\Windows\\Temp', 'C:\\Temp\\prototype\\index.html'],
    ['C:\\Users\\Test\\AppData\\Local\\Temp', 'C:\\Temp\\prototype\\index.html'],
  ])('keeps edits conservative for an exact temp project root %s', (resolvedDir, filePath) => {
    expect(hasFileMutationToolUse([use('Edit', { filePath }, 'alias')], { resolvedDir })).toBe(true);
  });

  it('does not treat a temp root prefix as a temp directory', () => {
    expect(hasFileMutationToolUse([use('Edit', { filePath: '/tmp-backup/probe.js' }, 'edit')], scope)).toBe(true);
    expect(hasFileMutationToolUse([use('Edit', { filePath: '/tmp/probe.js' }, 'edit')], { resolvedDir: '/tmp-project' })).toBe(false);
  });

  it('keeps unknown scope, missing paths and traversal paths conservative', () => {
    expect(hasFileMutationToolUse([use('Edit', { filePath: '/tmp/od-probe/cdp.mjs' }, 'edit')])).toBe(true);
    expect(hasFileMutationToolUse([use('Edit', {}, 'edit')], scope)).toBe(true);
    expect(hasFileMutationToolUse([use('Edit', { path: '../index.html' }, 'edit')], scope)).toBe(true);
    expect(hasFileMutationToolUse([use('Edit', { path: '/tmp/../Users/test/projects/prototype/index.html' }, 'edit')], scope)).toBe(true);
  });

  it('applies project scope to each Bash deletion path', () => {
    expect(hasFileMutationToolUse([use('Bash', { command: 'rm /tmp/probe.png' }, 'rm')], scope)).toBe(false);
    expect(hasFileMutationToolUse([use('Bash', { command: 'rm /tmp/probe.png index.html' }, 'rm')], scope)).toBe(true);
  });

  it('keeps a project mutation even when another event edits a temporary script', () => {
    expect(hasFileMutationToolUse([
      use('Edit', { file_path: '/tmp/od-probe/cdp.mjs' }, 'probe'),
      use('Edit', { file_path: 'index.html' }, 'project'),
    ], scope)).toBe(true);
  });

  it('handles Windows project paths without a case-sensitive prefix check', () => {
    const windowsScope = { resolvedDir: 'C:\\Users\\Test\\project' };
    expect(hasFileMutationToolUse([use('Edit', { filePath: 'c:\\users\\test\\PROJECT\\index.html' }, 'inside')], windowsScope)).toBe(true);
    expect(hasFileMutationToolUse([use('Edit', { filePath: 'C:\\Temp\\probe.js' }, 'outside')], windowsScope)).toBe(false);
    expect(hasFileMutationToolUse([use('Edit', { filePath: 'C:\\Users\\Test\\AppData\\Local\\Temp\\od-probe\\cdp.mjs' }, 'temp')], windowsScope)).toBe(false);
    expect(hasFileMutationToolUse([use('Edit', { filePath: 'C:\\Users\\Test\\project-backup\\index.html' }, 'sibling')], windowsScope)).toBe(true);
    expect(hasFileMutationToolUse([use('Edit', { filePath: 'D:\\Work\\project\\index.html' }, 'alias')], windowsScope)).toBe(true);
  });
});

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

  it('aggregates Read/Write/Edit/Delete by full path with basename + ops list', () => {
    const events: AgentEvent[] = [
      use('Read', { file_path: '/repo/a.ts' }, 't1'),
      ok('t1'),
      use('Write', { file_path: '/repo/b.ts', content: 'hi' }, 't2'),
      ok('t2'),
      use('Edit', { file_path: '/repo/a.ts', old_string: 'x', new_string: 'y' }, 't3'),
      ok('t3'),
      use('delete_file', { file_path: '/repo/c.ts' }, 't4'),
      ok('t4'),
    ];
    const rows = deriveFileOps(events);
    expect(rows).toHaveLength(3);
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
    const c = rows.find((row) => row.fullPath === '/repo/c.ts');
    expect(c).toMatchObject({
      path: 'c.ts',
      ops: ['delete'],
      total: 1,
      status: 'done',
    });
  });

  it('deduplicates repeated tool_use events that share an id', () => {
    const events: AgentEvent[] = [
      use('Write', { file_path: '/repo/index.html', content: '<main />' }, 't1'),
      use('Write', { file_path: '/repo/index.html', content: '<main />' }, 't1'),
      ok('t1'),
    ];
    const rows = deriveFileOps(events);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      path: 'index.html',
      ops: ['write'],
      total: 1,
    });
    expect(countFileOps(rows).write).toBe(1);
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
      use('remove_file', { target_path: '/repo/c.ts' }, 't4'),
      ok('t4'),
    ];
    const rows = deriveFileOps(events);
    expect(rows.map((row) => row.path).sort()).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(rows.find((row) => row.path === 'a.ts')?.ops).toEqual(['read', 'edit']);
    expect(rows.find((row) => row.path === 'c.ts')?.ops).toEqual(['delete']);
  });

  it('preserves ranges for separate reads of the same file', () => {
    const events: AgentEvent[] = [
      use('Read', { file_path: '/repo/example.html', offset: 1, limit: 300 }, 'read-1'),
      ok('read-1'),
      use('Read', { file_path: '/repo/example.html', offset: 550, limit: 300 }, 'read-2'),
      ok('read-2'),
    ];

    const [row] = deriveFileOps(events);
    expect(row).toBeDefined();
    // The ChatPanel must be able to distinguish these two valid reads. The
    // current implementation merges by path and drops offset/limit entirely.
    expect((row as unknown as { readRanges: Array<{ offset: number; limit: number }> }).readRanges)
      .toEqual([
        { offset: 1, limit: 300 },
        { offset: 550, limit: 300 },
      ]);
  });

  it('infers simple Bash rm/unlink targets as delete operations', () => {
    const events: AgentEvent[] = [
      use(
        'Bash',
        { command: 'rm -f ./stale.txt "old file.md" *.log && unlink loose.tmp; echo done' },
        't1',
      ),
      ok('t1'),
    ];

    const rows = deriveFileOps(events);
    expect(rows.map((row) => row.fullPath).sort()).toEqual([
      './stale.txt',
      'loose.tmp',
      'old file.md',
    ]);
    expect(rows.map((row) => row.ops)).toEqual([['delete'], ['delete'], ['delete']]);
  });

  it('stops Bash rm target inference at pipes and redirections', () => {
    const events: AgentEvent[] = [
      use('Bash', { command: 'rm old.txt | cat deletion.log' }, 't1'),
      ok('t1'),
      use('Bash', { command: 'rm stale.txt > deletion.log 2> errors.log' }, 't2'),
      ok('t2'),
      use('Bash', { command: 'rm ./queued.tmp& echo done' }, 't3'),
      ok('t3'),
    ];

    const rows = deriveFileOps(events);
    expect(rows.map((row) => row.fullPath).sort()).toEqual([
      './queued.tmp',
      'old.txt',
      'stale.txt',
    ]);
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
      use('Delete', { path: '/gone.ts' }, 't5'),
      ok('t5'),
    ];
    const rows = deriveFileOps(events);
    const counts = countFileOps(rows);
    expect(counts.read).toBe(2);
    expect(counts.write).toBe(1);
    expect(counts.edit).toBe(1);
    expect(counts.delete).toBe(1);
  });

  it('returns zeros when there are no entries', () => {
    expect(countFileOps([])).toEqual({ read: 0, write: 0, edit: 0, delete: 0 });
  });
});

describe('countArtifactFileOps', () => {
  it('counts each unique file once by its primary artifact op, not per write operation', () => {
    const events: AgentEvent[] = [
      // a.ts written three times + read once → one write.
      use('Write', { file_path: '/a.ts' }, 't1'),
      ok('t1'),
      use('Write', { file_path: '/a.ts' }, 't2'),
      ok('t2'),
      use('Write', { file_path: '/a.ts' }, 't3'),
      ok('t3'),
      use('Read', { file_path: '/a.ts' }, 't4'),
      ok('t4'),
      // b.ts written THEN edited (the #5909 repro path: create + edit the same
      // file) → one edit (edit beats write).
      use('Write', { file_path: '/b.ts' }, 't5'),
      ok('t5'),
      use('Edit', { file_path: '/b.ts' }, 't6'),
      ok('t6'),
      // c.ts edited three times → still one edit.
      use('Edit', { file_path: '/c.ts' }, 't7'),
      ok('t7'),
      use('Edit', { file_path: '/c.ts' }, 't8'),
      ok('t8'),
      use('Edit', { file_path: '/c.ts' }, 't9'),
      ok('t9'),
      // d.ts only read → not an artifact file, not counted.
      use('Read', { file_path: '/d.ts' }, 't10'),
      ok('t10'),
    ];
    const rows = deriveFileOps(events);
    expect(countArtifactFileOps(rows)).toEqual({ write: 1, edit: 2 });
    // The op-level counter is unchanged: a.ts (3) + b.ts (1) writes.
    expect(countFileOps(rows).write).toBe(4);
    expect(countFileOps(rows).edit).toBe(4);
  });
});
