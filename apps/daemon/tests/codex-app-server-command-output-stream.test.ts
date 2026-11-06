import { describe, expect, it } from 'vitest';
import { createCodexAppServerNormalizer } from '../src/agent-protocol/codex-app-server/normalize.js';

/**
 * A codex command row must fill in while the command runs, not only when it
 * exits.
 *
 * Recorded against codex-cli 0.153.4 on 2026-09-08 (`codex app-server`,
 * `for i in $(seq 1 8); do echo "line $i"; sleep 1; done`): the wire delivers
 *
 *   item/started                       (commandExecution, status inProgress)
 *   item/commandExecution/outputDelta  x7, one per second, delta "line N\n"
 *   item/completed                     (commandExecution, aggregatedOutput)
 *
 * Before this behaviour existed the seven middle frames were counted as
 * `unknownNotifications` and dropped, so a command that printed for eight
 * seconds showed an empty terminal for eight seconds.
 *
 * The invariant this pins is deliberately about WHICH FORM the row takes while
 * it runs, not merely that some event was emitted. The client retires an early
 * `tool_in_flight` into the settled `tool_use` that shares its id
 * (`dropSupersededInFlightToolUses`), and it does so by DROPPING every
 * in-flight row whose id already has a settled row. So a settled `tool_use` at
 * `item/started` — which is what the `exec --json` branch emits, and what this
 * transport used to forward — makes every later in-flight update invisible on
 * screen. Emitting the events is not the same as showing them; the assertions
 * below therefore require the settled row to be ABSENT until the command ends.
 */

type Ev = Record<string, unknown>;

/**
 * The real wire spaces these frames a second apart; a test drives them inside
 * one millisecond. Advancing a fake clock past the publication throttle is what
 * keeps this suite measuring accumulation rather than measuring the throttle —
 * with a real clock every assertion below would read the FIRST chunk and pass
 * even if later chunks were dropped on the floor.
 */
function drive(frames: Array<{ method: string; params?: unknown }>) {
  const events: Ev[] = [];
  let clock = STARTED_AT;
  const normalizer = createCodexAppServerNormalizer(
    (ev) => events.push(ev),
    () => clock,
  );
  for (const frame of frames) {
    normalizer.handleNotification(frame.method, frame.params ?? {});
    clock += 1_000;
  }
  return { events, stats: normalizer.stats() };
}

const THREAD = { threadId: 't1', turnId: 'turn1' };
const CMD_ID = 'exec-9db7fe16-4e52-4cf0-9b1f-0a1b2c3d4e5f';
const COMMAND = '/bin/zsh -lc \'for i in $(seq 1 3); do echo "line $i"; sleep 1; done\'';
const STARTED_AT = 1_700_000_000_000;

const startedFrame = {
  method: 'item/started',
  params: {
    ...THREAD,
    startedAtMs: STARTED_AT,
    item: {
      type: 'commandExecution',
      id: CMD_ID,
      command: COMMAND,
      cwd: '/w',
      commandActions: [],
      status: 'inProgress',
      aggregatedOutput: null,
      exitCode: null,
    },
  },
};

const deltaFrame = (delta: string) => ({
  method: 'item/commandExecution/outputDelta',
  params: { ...THREAD, itemId: CMD_ID, delta },
});

const completedFrame = {
  method: 'item/completed',
  params: {
    ...THREAD,
    completedAtMs: STARTED_AT + 3_000,
    item: {
      type: 'commandExecution',
      id: CMD_ID,
      command: COMMAND,
      cwd: '/w',
      commandActions: [],
      status: 'completed',
      aggregatedOutput: 'line 1\nline 2\nline 3\n',
      exitCode: 0,
    },
  },
};

const RUNNING_TURN = [startedFrame, deltaFrame('line 1\n'), deltaFrame('line 2\n')];

describe('codex app-server: streaming command output', () => {
  it('shows the command row in its early form while the command is still running', () => {
    const { events } = drive(RUNNING_TURN);

    const inFlight = events.filter((e) => e.type === 'tool_in_flight');
    expect(inFlight.length).toBeGreaterThan(0);

    const last = inFlight.at(-1) as Ev;
    expect(last.id).toBe(CMD_ID);
    expect(last.name).toBe('Bash');
    expect(last.input).toMatchObject({ command: COMMAND });
    expect(last.output).toBe('line 1\nline 2\n');
  });

  it('starts the row clock at the item start, not at the first delta', () => {
    const { events } = drive(RUNNING_TURN);
    const inFlight = events.filter((e) => e.type === 'tool_in_flight');
    for (const ev of inFlight) expect(ev.startedAt).toBe(STARTED_AT);
  });

  it('keeps the settled row out until the command ends, so the early row survives', () => {
    const { events } = drive(RUNNING_TURN);
    const settled = events.filter((e) => e.type === 'tool_use' && e.id === CMD_ID);
    expect(settled).toEqual([]);
  });

  it('emits exactly one settled pair when the command ends', () => {
    const { events } = drive([...RUNNING_TURN, deltaFrame('line 3\n'), completedFrame]);

    const settled = events.filter((e) => e.type === 'tool_use' && e.id === CMD_ID);
    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({ name: 'Bash', input: { command: COMMAND } });

    const results = events.filter((e) => e.type === 'tool_result' && e.toolUseId === CMD_ID);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ content: 'line 1\nline 2\nline 3\n', isError: false });

    // ordering: every early row precedes the settled one
    const settledAt = events.findIndex((e) => e.type === 'tool_use' && e.id === CMD_ID);
    const lastInFlightAt = events.map((e) => e.type).lastIndexOf('tool_in_flight');
    expect(lastInFlightAt).toBeLessThan(settledAt);
  });

  it('bounds the carried output instead of forwarding an unbounded stream', () => {
    const { events } = drive([startedFrame, deltaFrame('x'.repeat(50_000))]);
    const last = events.filter((e) => e.type === 'tool_in_flight').at(-1) as Ev;
    expect(typeof last.output).toBe('string');
    expect((last.output as string).length).toBeLessThanOrEqual(2_000);
  });

  it('no longer counts the delta frames as unknown notifications', () => {
    const { stats } = drive(RUNNING_TURN);
    expect(stats.unknownNotifications).toBe(0);
  });

  /**
   * The app-server protocol ships no version negotiation, so a delta frame from
   * an older or newer codex that omits a field must degrade to "one row less",
   * never to a crash or a bogus row. See the module docstring in normalize.ts.
   */
  it('ignores a delta that names no item, and one for an unknown item', () => {
    const orphan = drive([
      { method: 'item/commandExecution/outputDelta', params: { ...THREAD, delta: 'x' } },
      { method: 'item/commandExecution/outputDelta', params: { ...THREAD, itemId: 'nope', delta: 'y' } },
    ]);
    expect(orphan.events.filter((e) => e.type === 'tool_in_flight')).toEqual([]);
  });

  it('ignores a delta whose payload carries no string', () => {
    const { events } = drive([
      startedFrame,
      { method: 'item/commandExecution/outputDelta', params: { ...THREAD, itemId: CMD_ID } },
    ]);
    // The started frame's own row is expected; the malformed delta must not add
    // a second one, and must not put anything on the first.
    const inFlight = events.filter((e) => e.type === 'tool_in_flight');
    expect(inFlight).toHaveLength(1);
    expect((inFlight[0] as Ev).output).toBeUndefined();
  });

  /**
   * The cap bounds one event, the interval bounds how many. A command that
   * writes continuously must not turn one call into a frame-rate event stream.
   */
  it('rate-limits updates from a command that writes continuously', () => {
    const events: Ev[] = [];
    let clock = STARTED_AT;
    const normalizer = createCodexAppServerNormalizer(
      (ev) => events.push(ev),
      () => clock,
    );
    normalizer.handleNotification(startedFrame.method, startedFrame.params);
    // 100 writes, 10ms apart => 1s of wall clock at 100 frames/s
    for (let i = 0; i < 100; i += 1) {
      clock += 10;
      const f = deltaFrame(`chunk ${i}\n`);
      normalizer.handleNotification(f.method, f.params);
    }
    const inFlight = events.filter((e) => e.type === 'tool_in_flight');
    // 1s at a 250ms floor: the started row plus at most four updates.
    expect(inFlight.length).toBeLessThanOrEqual(5);
    expect(inFlight.length).toBeGreaterThan(1);
  });

  /**
   * A command that never prints must still get a row the moment it starts —
   * that row carries the stopwatch, which is the whole answer to "where is it
   * stuck". Output is what is unknown, not the call.
   */
  it('shows a silent command as soon as it starts', () => {
    const { events } = drive([startedFrame]);
    const inFlight = events.filter((e) => e.type === 'tool_in_flight');
    expect(inFlight).toHaveLength(1);
    expect(inFlight[0]).toMatchObject({ id: CMD_ID, name: 'Bash', startedAt: STARTED_AT });
    expect((inFlight[0] as Ev).output).toBeUndefined();
  });
});
