import { describe, expect, it } from 'vitest';
import { diffStat } from '../../../src/runtime/chat/format';

/*
 * W101 — the codex file row showed elapsed time where Claude's showed `+N −M`.
 *
 * The counts exist: codex's app-server wire sends the patch next to the path,
 * and the daemon now counts it and drops the patch. What reaches the web is the
 * pair of numbers under `od_diff_stat`. `diffStat` has to read it, and has to
 * keep counting Claude's inputs exactly as it does today.
 */
describe('W101 — diffStat reads counts an agent already provided', () => {
  const CODEX_WRITE = {
    file_path: '/WORK/note.md',
    od_diff_stat: { added: 6, removed: 0 },
  };
  const CODEX_EDIT = {
    file_path: '/WORK/note.md',
    od_diff_stat: { added: 2, removed: 2 },
  };

  it('returns the counts a codex Write row carries', () => {
    expect(diffStat('Write', CODEX_WRITE)).toEqual({ added: 6, removed: 0 });
  });

  it('returns the counts a codex Edit row carries', () => {
    expect(diffStat('Edit', CODEX_EDIT)).toEqual({ added: 2, removed: 2 });
  });

  it('returns a removal-only stat rather than treating +0 as nothing to show', () => {
    expect(
      diffStat('Edit', { file_path: '/WORK/note.md', od_diff_stat: { added: 0, removed: 3 } }),
    ).toEqual({ added: 0, removed: 3 });
  });

  /*
   * REVERSE CONTROL — Claude's path is untouched. Both branches are asserted
   * with the same numbers they produce today, so a change to the counting rule
   * shows up here rather than as a silently different row.
   */
  it('still counts a Claude Write from its content', () => {
    expect(diffStat('Write', { file_path: '/WORK/note.md', content: 'a\nb\nc' })).toEqual({
      added: 3,
      removed: 0,
    });
    expect(diffStat('write_file', { content: 'alpha\nbeta\ngamma\ndelta\nepsilon\n' })).toEqual({
      added: 6,
      removed: 0,
    });
  });

  it('still counts a Claude Edit from old_string / new_string', () => {
    expect(diffStat('Edit', { old_string: 'a\nb', new_string: 'x\ny\nz' })).toEqual({
      added: 3,
      removed: 2,
    });
  });

  /*
   * REVERSE CONTROL — a row with neither content nor counts still returns null,
   * which is what makes the row fall back to elapsed time instead of `+0 −0`.
   */
  it('still returns null when nothing carries a count', () => {
    expect(diffStat('Edit', { file_path: '/WORK/note.md' })).toBeNull();
    expect(diffStat('Write', { file_path: '/WORK/note.md' })).toBeNull();
    expect(diffStat('Bash', { command: 'ls' })).toBeNull();
    expect(diffStat('Write', null)).toBeNull();
  });

  /*
   * REVERSE CONTROL — a malformed stat is not a stat. Anything that would put a
   * `NaN` or an `undefined` into the row is rejected back to null.
   */
  it('rejects a malformed stat instead of rendering a broken row', () => {
    for (const od_diff_stat of [
      { added: 3 },
      { added: '3', removed: 1 },
      { added: Number.NaN, removed: 0 },
      { added: -1, removed: 0 },
      'nope',
      null,
    ]) {
      expect(
        diffStat('Write', { file_path: '/WORK/note.md', od_diff_stat }),
        JSON.stringify(od_diff_stat),
      ).toBeNull();
    }
  });

  /*
   * A carried stat wins over reconstructing from content: when both are present
   * the agent that produced the change knows better than a line count over a
   * possibly-truncated payload.
   */
  it('prefers the carried stat over recounting content', () => {
    expect(
      diffStat('Write', { content: 'a\nb\nc', od_diff_stat: { added: 42, removed: 7 } }),
    ).toEqual({ added: 42, removed: 7 });
  });
});
