import { describe, expect, it } from 'vitest';
import {
  advanceAuthenticatedDoneCapture,
  eventsHaveAuthenticatedDoneConclusion,
  eventsEndedWithUnfinishedWork,
  isTodoWriteToolName,
  todoSnapshotHasUnfinishedWork,
  todoStatusIsUnfinished,
} from '../src/api/run-completeness';
import { renderDoneMarker } from '../src/api/done-marker';

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
  it('lets an authenticated done conclusion outrank a stale Todo snapshot', () => {
    const key = 'a7f3c91ed2b40561';
    const events = [
      { kind: 'done_key', key },
      { kind: 'tool_use', id: '1', name: 'TodoWrite', input: { todos: [{ content: '简短总结新图', status: 'in_progress' }] } },
      { kind: 'text', text: '图片已经生成。' },
      { kind: 'text', text: `<od-done key="${key}"/>新图已经生成并保存到项目。` },
    ];
    expect(eventsHaveAuthenticatedDoneConclusion(events)).toBe(true);
    expect(eventsEndedWithUnfinishedWork(events)).toBe(false);
  });

  it('keeps max_tokens truncation unfinished even after an authenticated conclusion', () => {
    const key = 'a7f3c91ed2b40561';
    const events = [
      { kind: 'done_key', key },
      { kind: 'tool_use', id: '1', name: 'TodoWrite', input: { todos: [{ content: 'ship it', status: 'in_progress' }] } },
      { kind: 'text', text: `<od-done key="${key}"/>交付完成。` },
      { kind: 'usage', stopReason: 'max_tokens' },
    ];
    expect(eventsHaveAuthenticatedDoneConclusion(events)).toBe(true);
    expect(eventsEndedWithUnfinishedWork(events)).toBe(true);
  });

  it('does not trust mismatched, legacy, implicit, fenced, or empty done markers', () => {
    const key = 'a7f3c91ed2b40561';
    const todo = { kind: 'tool_use', id: '1', name: 'TodoWrite', input: { todos: [{ content: 'ship it', status: 'in_progress' }] } };
    const cases = [
      [{ kind: 'done_key', key }, todo, { kind: 'text', text: '<od-done key="other-key"/>总结' }],
      [todo, { kind: 'text', text: '<done/>总结' }],
      [{ kind: 'done_key', key }, todo, { kind: 'text', text: '<question-form>version: 1</question-form>' }],
      [{ kind: 'done_key', key }, todo, { kind: 'text', text: '<artifact name="result.html"/>' }],
      [{ kind: 'done_key', key }, todo, { kind: 'text', text: `<od-done key="${key}"/>   ` }],
      [{ kind: 'done_key', key }, todo, { kind: 'text', text: `\`<od-done key="${key}"/>\` 总结` }],
      [{ kind: 'done_key', key }, todo, { kind: 'text', text: `\`\`\`html\n<od-done key="${key}"/>\n\`\`\`\n总结` }],
    ];
    for (const events of cases) {
      expect(eventsHaveAuthenticatedDoneConclusion(events)).toBe(false);
      expect(eventsEndedWithUnfinishedWork(events)).toBe(true);
    }
  });

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

describe('advanceAuthenticatedDoneCapture', () => {
  it('recognizes a split marker without retaining or rescanning the full reply', () => {
    const key = 'a7f3c91ed2b40561';
    const prefix = '很长的过程叙述'.repeat(10_000);
    let fullVisibleText = `${prefix}<od-do`;
    let state = advanceAuthenticatedDoneCapture({
      fullVisibleText,
      delta: `${prefix}<od-do`,
      key,
    });
    expect(state.authenticatedConclusion).toBe(false);

    const markerTail = `ne key="${key}"/>`;
    fullVisibleText += markerTail;
    state = advanceAuthenticatedDoneCapture({
      fullVisibleText,
      delta: markerTail,
      key,
      state,
    });
    expect(state.awaitingConclusion).toBe(true);
    expect(state.authenticatedConclusion).toBe(false);

    fullVisibleText += '   ';
    state = advanceAuthenticatedDoneCapture({
      fullVisibleText,
      delta: '   ',
      key,
      state,
    });
    expect(state.awaitingConclusion).toBe(true);

    fullVisibleText += '交付完成。';
    state = advanceAuthenticatedDoneCapture({
      fullVisibleText,
      delta: '交付完成。',
      key,
      state,
    });
    expect(state.authenticatedConclusion).toBe(true);
    expect(state.markerTail.length).toBeLessThan(renderDoneMarker(key).length);
  });

  it('does not authenticate a marker inside fenced code', () => {
    const key = 'a7f3c91ed2b40561';
    const text = `\`\`\`html\n<od-done key="${key}"/>\n\`\`\`\n这只是说明。`;
    const state = advanceAuthenticatedDoneCapture({
      fullVisibleText: text,
      delta: text,
      key,
    });
    expect(state.authenticatedConclusion).toBe(false);
    expect(state.awaitingConclusion).toBe(false);
  });
});
