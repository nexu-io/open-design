import { describe, expect, it } from 'vitest';
import {
  eventsEndedWithUnfinishedWork,
  isTodoWriteToolName,
  todoSnapshotHasUnfinishedWork,
  todoStatusIsUnfinished,
} from '../src/api/run-completeness';

// Canonical "unfinished declared work" predicate shared by the daemon run
// classifier and the web chat footer (#1247 / #1060). These tests pin the exact
// boundary so the two surfaces can never drift.

describe('todoStatusIsUnfinished', () => {
  it('treats only `completed` as finished', () => {
    expect(todoStatusIsUnfinished('completed')).toBe(false);
    expect(todoStatusIsUnfinished('pending')).toBe(true);
    expect(todoStatusIsUnfinished('in_progress')).toBe(true);
    // `stopped` (a task the agent marked failed/canceled) counts as unfinished,
    // matching the web footer. Narrowing to pending/in_progress only would
    // reintroduce the divergence this predicate exists to kill.
    expect(todoStatusIsUnfinished('stopped')).toBe(true);
    expect(todoStatusIsUnfinished(undefined)).toBe(true);
  });
});

describe('todoSnapshotHasUnfinishedWork', () => {
  it('is true when any task is not completed', () => {
    expect(
      todoSnapshotHasUnfinishedWork([
        { content: 'a', status: 'completed' },
        { content: 'b', status: 'pending' },
      ]),
    ).toBe(true);
    expect(
      todoSnapshotHasUnfinishedWork([{ content: 'a', status: 'stopped' }]),
    ).toBe(true);
  });

  it('is false for an all-completed snapshot', () => {
    expect(
      todoSnapshotHasUnfinishedWork([
        { content: 'a', status: 'completed' },
        { content: 'b', status: 'completed' },
      ]),
    ).toBe(false);
  });

  it('is false when no plan was emitted (absence is not unfinished work)', () => {
    expect(todoSnapshotHasUnfinishedWork(undefined)).toBe(false);
    expect(todoSnapshotHasUnfinishedWork(null)).toBe(false);
    expect(todoSnapshotHasUnfinishedWork([])).toBe(false);
  });
});

describe('isTodoWriteToolName', () => {
  it('accepts the known TodoWrite aliases', () => {
    for (const name of ['TodoWrite', 'todowrite', 'todo_write', 'update_plan']) {
      expect(isTodoWriteToolName(name)).toBe(true);
    }
    expect(isTodoWriteToolName('Write')).toBe(false);
    expect(isTodoWriteToolName(undefined)).toBe(false);
  });
});

describe('eventsEndedWithUnfinishedWork', () => {
  it('reads the LAST TodoWrite snapshot from persisted events', () => {
    const events = [
      { kind: 'tool_use', id: '1', name: 'TodoWrite', input: { todos: [{ content: 'a', status: 'pending' }] } },
      { kind: 'text', text: 'working' },
      { kind: 'tool_use', id: '2', name: 'TodoWrite', input: { todos: [{ content: 'a', status: 'completed' }] } },
    ];
    // Latest snapshot is all-completed → finished.
    expect(eventsEndedWithUnfinishedWork(events)).toBe(false);
  });

  it('is true when the last TodoWrite left a pending/in_progress/stopped task', () => {
    expect(
      eventsEndedWithUnfinishedWork([
        { kind: 'tool_use', id: '1', name: 'TodoWrite', input: { todos: [{ content: 'a', status: 'in_progress' }] } },
      ]),
    ).toBe(true);
    // update_plan carries its tasks under `plan`; the predicate reads both shapes
    // (mirrors parseTodoWriteInput) so plan-style agents are not silently missed.
    expect(
      eventsEndedWithUnfinishedWork([
        { kind: 'tool_use', id: '1', name: 'update_plan', input: { plan: [{ step: 'a', status: 'stopped' }] } },
      ]),
    ).toBe(true);
  });

  it('is false for a text-only answer with no TodoWrite', () => {
    expect(eventsEndedWithUnfinishedWork([{ kind: 'text', text: 'done' }])).toBe(false);
    expect(eventsEndedWithUnfinishedWork(undefined)).toBe(false);
  });
});
