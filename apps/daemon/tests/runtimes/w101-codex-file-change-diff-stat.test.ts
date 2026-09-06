import { describe, expect, it } from 'vitest';
import { createJsonEventStreamHandler } from '../../src/runtimes/json-event-stream.js';
import { createCodexAppServerNormalizer } from '../../src/agent-protocol/codex-app-server/normalize.js';

/*
 * Codex file rows showed elapsed time where Claude's showed `+N −M`, because
 * `codexFileChanges()` read only `path` and `kind` out of a change and dropped
 * the `diff` that sits right next to them.
 *
 * Every `changes` array below is COPIED VERBATIM out of a live
 * `codex app-server` probe against codex-cli 0.151.0 (`w101-probe.mjs`,
 * `initialize` argv byte-identical to `buildCodexAppServerArgs`). The three
 * shapes are the three the wire actually produces:
 *
 *   add          `kind:{type:"add"}`     `diff` = the file's whole text, no
 *                                        `+` prefixes at all
 *   update       `kind:{type:"update"}`  `diff` = a unified diff, `@@` hunk
 *                                        headers, no `---`/`+++` file headers
 *   delete-only  `kind:{type:"update"}`  a unified diff whose every non-context
 *                                        line is a removal
 *
 * Do not "tidy" these: the earlier attempt at this fix guessed that `add`
 * carried a unified diff too, which would have counted `+0` for every new file.
 */

/** MODE=add — `alpha…epsilon`, five lines plus the trailing newline. */
const WIRE_ADD = [
  {
    path: '/var/folders/0h/T/w101-add-sW1OhR/note.md',
    kind: { type: 'add' },
    diff: 'alpha\nbeta\ngamma\ndelta\nepsilon\n',
  },
];

/** MODE=update — `gamma` becomes two lines, `eta` goes away. `+2 −2`. */
const WIRE_UPDATE = [
  {
    path: '/var/folders/0h/T/w101-update-7jcSUd/note.md',
    kind: { type: 'update', move_path: null },
    diff: '@@ -2,3 +2,4 @@\n beta\n-gamma\n+GAMMA-1\n+GAMMA-2\n delta\n@@ -6,3 +7,2 @@\n zeta\n-eta\n theta\n',
  },
];

/** MODE=deleteonly — three lines removed, nothing added. `+0 −3`. */
const WIRE_DELETE_ONLY = [
  {
    path: '/var/folders/0h/T/w101-deleteonly-2KM4Yr/note.md',
    kind: { type: 'update', move_path: null },
    diff: '@@ -2,7 +2,4 @@\n beta\n-gamma\n-delta\n epsilon\n zeta\n-eta\n theta\n',
  },
];

/**
 * `codex exec --json` on the SAME cli build (0.151.0) carries no `diff` at all
 * — verbatim from a probe run of the legacy transport, which
 * `OD_CODEX_TRANSPORT=exec-json` still selects. This is the rollback shape the
 * fix has to keep working.
 */
const EXEC_JSON_NO_DIFF_LINE = JSON.stringify({
  type: 'item.completed',
  item: {
    id: 'item_0',
    type: 'file_change',
    changes: [{ path: '/tmp/w101-exec-MT1L/note.md', kind: 'update' }],
    status: 'completed',
  },
});

type Ev = Record<string, unknown>;

function appServerFileChangeEvents(changes: unknown, status = 'completed'): Ev[] {
  const events: Ev[] = [];
  const normalizer = createCodexAppServerNormalizer((event) => events.push(event));
  normalizer.handleNotification('item/completed', {
    threadId: 'th-1',
    turnId: 'tu-1',
    item: { type: 'fileChange', id: 'call_w101', changes, status },
  });
  return events;
}

function execJsonEvents(lines: string[]): Ev[] {
  const events: Ev[] = [];
  const handler = createJsonEventStreamHandler('codex', (event) => events.push(event));
  for (const line of lines) handler.feed(`${line}\n`);
  handler.flush();
  return events;
}

const toolUseInput = (events: Ev[]): Record<string, unknown> => {
  const use = events.find((event) => event.type === 'tool_use');
  expect(use, 'expected a tool_use event').toBeTruthy();
  return (use as { input: Record<string, unknown> }).input;
};

describe('W101 — codex file rows carry the line counts the wire already sent', () => {
  /*
   * ANTI-VACUUM. Before the fix this assertion fails with `undefined`, which is
   * exactly the missing value the web reads: `diffStat()` finds nothing to
   * count and returns null, so the row falls back to elapsed time. If this test
   * ever passes for a reason other than the counts being present, the assertion
   * on `undefined` below is the tell.
   */
  it('reports +2 -2 for the recorded update patch', () => {
    const input = toolUseInput(appServerFileChangeEvents(WIRE_UPDATE));
    expect(input.od_diff_stat).toEqual({ added: 2, removed: 2 });
  });

  /*
   * `add` counts the way Claude's `Write` branch counts: `content.split('\n')
   * .length` on the whole file text. Five lines with a trailing newline is 6 on
   * BOTH agents — matching Claude beats being independently "right".
   */
  it('counts an added file the same way Claude counts a Write', () => {
    const input = toolUseInput(appServerFileChangeEvents(WIRE_ADD));
    expect(input.od_diff_stat).toEqual({ added: 6, removed: 0 });
    expect('alpha\nbeta\ngamma\ndelta\nepsilon\n'.split('\n').length).toBe(6);
  });

  it('reports +0 -3 for a patch that only removes lines', () => {
    const input = toolUseInput(appServerFileChangeEvents(WIRE_DELETE_ONLY));
    expect(input.od_diff_stat).toEqual({ added: 0, removed: 3 });
  });

  /*
   * REVERSE CONTROL 1 — the legacy transport sends no `diff`. The row must keep
   * today's behaviour (a file row with just a path, rendered with elapsed time)
   * rather than throwing or inventing `+0 −0`.
   */
  it('falls back to today behaviour when the wire carries no diff', () => {
    const events = execJsonEvents([EXEC_JSON_NO_DIFF_LINE]);
    expect(events).toEqual([
      {
        type: 'tool_use',
        id: 'item_0#0',
        name: 'Edit',
        input: { file_path: '/tmp/w101-exec-MT1L/note.md' },
      },
      { type: 'tool_result', toolUseId: 'item_0#0', content: '', isError: false },
    ]);
    expect(toolUseInput(events).od_diff_stat).toBeUndefined();
  });

  it('survives a change whose diff is not a string', () => {
    for (const diff of [null, 42, { hunks: [] }, []]) {
      const events = appServerFileChangeEvents([
        { path: '/WORK/notes.md', kind: { type: 'update', move_path: null }, diff },
      ]);
      expect(toolUseInput(events).od_diff_stat, `diff=${JSON.stringify(diff)}`).toBeUndefined();
    }
  });

  /*
   * REVERSE CONTROL 2 — no bloat. The big recorded patch was 20k+ characters;
   * the whole reason to count in the daemon is that the counts, not the patch,
   * are what reaches the event stream and the message store. Every emitted
   * event is checked, not just the input.
   */
  it('never lets the raw patch text into the emitted events', () => {
    const bigDiff = `@@ -1,2 +1,2 @@\n-old\n${'+padding line that is quite long\n'.repeat(700)}`;
    expect(bigDiff.length).toBeGreaterThan(20_000);

    const events = appServerFileChangeEvents([
      { path: '/WORK/big.html', kind: { type: 'update', move_path: null }, diff: bigDiff },
    ]);

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('padding line that is quite long');
    expect(serialized).not.toContain('@@');
    expect(serialized.length).toBeLessThan(400);
    expect(toolUseInput(events).od_diff_stat).toEqual({ added: 700, removed: 1 });
  });

  /*
   * REVERSE CONTROL 3 — the counts ride on the FIRST event of the row.
   * `item/started` is where `tool-timing.ts` stamps the row, and the web builds
   * `delta` from the `tool_use` input; a stat that only arrived at
   * `item/completed` would leave the row showing elapsed time while it streams.
   */
  it('carries the counts on the item/started tool_use, not only at completion', () => {
    const events: Ev[] = [];
    const normalizer = createCodexAppServerNormalizer((event) => events.push(event));
    normalizer.handleNotification('item/started', {
      threadId: 'th-1',
      turnId: 'tu-1',
      item: { type: 'fileChange', id: 'call_w101', changes: WIRE_UPDATE, status: 'inProgress' },
    });
    expect(events.filter((e) => e.type === 'tool_result')).toEqual([]);
    expect(toolUseInput(events).od_diff_stat).toEqual({ added: 2, removed: 2 });
  });

  /*
   * REVERSE CONTROL 4 — one item, several files. Each row keeps its own counts;
   * a shared or last-wins stat would label both files with one file's numbers.
   */
  it('gives each file in a multi-change item its own counts', () => {
    const events = appServerFileChangeEvents([
      { path: '/WORK/a.html', kind: { type: 'add' }, diff: 'one\ntwo\n' },
      ...WIRE_DELETE_ONLY,
    ]);
    const inputs = events
      .filter((event) => event.type === 'tool_use')
      .map((event) => (event as { input: Record<string, unknown> }).input.od_diff_stat);
    expect(inputs).toEqual([
      { added: 3, removed: 0 },
      { added: 0, removed: 3 },
    ]);
  });

  /*
   * REVERSE CONTROL 5 — a `delete` kind still has no honest verb in the record,
   * so the whole item stays `raw`. Reading the diff must not have quietly
   * promoted it into a row.
   */
  it('still leaves a delete-kind change as raw', () => {
    const events = appServerFileChangeEvents([
      { path: '/WORK/gone.md', kind: { type: 'delete' }, diff: 'alpha\nbeta\n' },
    ]);
    expect(events.filter((event) => event.type === 'tool_use')).toEqual([]);
  });
});
