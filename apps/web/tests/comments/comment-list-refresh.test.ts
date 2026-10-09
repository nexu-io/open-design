import { describe, expect, it } from 'vitest';
import {
  createSingleflightRunner,
  reconcileAttachedComments,
  reconcilePreviewComments,
} from '../../src/comments/comment-list-refresh';
import type { PreviewComment } from '../../src/types';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => { resolve = next; });
  return { promise, resolve };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const comment = (id: string, patch: Partial<PreviewComment> = {}): PreviewComment => ({
  id,
  projectId: 'p1',
  conversationId: 'c1',
  filePath: 'index.html',
  elementId: 'hero',
  selector: '#hero',
  label: 'Hero',
  text: 'Hero',
  position: { x: 0, y: 0, width: 10, height: 10 },
  htmlHint: '<h1>',
  note: `note ${id}`,
  status: 'open',
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});

describe('createSingleflightRunner', () => {
  it('turns any number of calls during a run into exactly one trailing run with the latest task', async () => {
    const run = createSingleflightRunner();
    const gates: Array<ReturnType<typeof deferred>> = [];
    const started: string[] = [];
    const task = (label: string) => () => {
      started.push(label);
      const gate = deferred();
      gates.push(gate);
      return gate.promise;
    };

    const first = run('k', task('t0'));
    const joined = Array.from({ length: 9 }, (_, index) => run('k', task(`t${index + 1}`)));
    expect(started).toEqual(['t0']);
    gates[0]!.resolve();
    await flush();
    expect(started).toEqual(['t0', 't9']);
    gates[1]!.resolve();
    await Promise.all([first, ...joined]);
    expect(started).toEqual(['t0', 't9']);

    // Once settled, the next call starts a fresh run.
    const later = run('k', task('t10'));
    gates[2]!.resolve();
    await later;
    expect(started).toEqual(['t0', 't9', 't10']);
  });

  it('keeps running after a failed task and settles every caller', async () => {
    const run = createSingleflightRunner();
    let calls = 0;
    const gate = deferred();
    const failing = () => { calls += 1; return gate.promise.then(() => { throw new Error('offline'); }); };
    const throwing = () => { calls += 1; throw new Error('sync'); };
    const a = run('k', failing);
    const b = run('k', throwing);
    gate.resolve();
    await expect(Promise.all([a, b])).resolves.toEqual([undefined, undefined]);
    expect(calls).toBe(2);
  });

  it('does not queue a new scope behind the old scope\'s read, and drops the old trailing run', async () => {
    const run = createSingleflightRunner();
    const oldGate = deferred();
    const started: string[] = [];
    void run('conv-a', () => { started.push('a'); return oldGate.promise; });
    void run('conv-a', () => { started.push('a-rerun'); return Promise.resolve(); });
    const b = run('conv-b', () => { started.push('b'); return Promise.resolve(); });
    await b;
    expect(started).toEqual(['a', 'b']);
    oldGate.resolve();
    await flush();
    expect(started).toEqual(['a', 'b']);
  });
});

describe('reconcilePreviewComments', () => {
  it('returns the current array when a fresh read is structurally equal', () => {
    const current = [comment('a'), comment('b')];
    const fresh = JSON.parse(JSON.stringify(current)) as PreviewComment[];
    expect(reconcilePreviewComments(current, fresh)).toBe(current);
  });

  it('keeps unchanged comment objects and takes changed or new ones', () => {
    const current = [comment('a'), comment('b')];
    const edited = comment('b', { note: 'edited', updatedAt: 2 });
    const added = comment('c');
    const next = reconcilePreviewComments(current, [comment('a'), edited, added]);
    expect(next).toEqual([comment('a'), edited, added]);
    expect(next[0]).toBe(current[0]);
    expect(next[1]).toBe(edited);
  });

  it('treats a removal or a reorder as a change', () => {
    const current = [comment('a'), comment('b')];
    const removed = reconcilePreviewComments(current, [comment('a')]);
    expect(removed).not.toBe(current);
    expect(removed[0]).toBe(current[0]);
    const reordered = reconcilePreviewComments(current, [comment('b'), comment('a')]);
    expect(reordered).not.toBe(current);
    expect(reordered).toEqual([current[1], current[0]]);
  });

  it('ignores keys that are only undefined on one side', () => {
    const current = [{ ...comment('a'), authorKey: undefined } as PreviewComment];
    expect(reconcilePreviewComments(current, [comment('a')])).toBe(current);
  });
});

describe('reconcileAttachedComments', () => {
  it('keeps the attached array when nothing changed and follows edits and removals', () => {
    const attached = [comment('a'), comment('b')];
    expect(reconcileAttachedComments(attached, [comment('a'), comment('b'), comment('c')])).toBe(attached);
    const edited = comment('a', { note: 'edited' });
    const next = reconcileAttachedComments(attached, [edited]);
    expect(next).toEqual([edited]);
  });
});
