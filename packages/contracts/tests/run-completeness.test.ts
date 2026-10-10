import { describe, expect, it } from 'vitest';
import {
  advanceAuthenticatedDoneCapture,
  eventsHaveAuthenticatedDoneConclusion,
  eventsEndedByAskingUser,
  eventsEndedWithUnfinishedWork,
  isTodoWriteToolName,
  turnEndedByAskingUser,
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

/*
 * 「问完就交棒」的那一档。
 *
 * 真机 run `441ff961-bd66-4c4a-91e7-812f1d489668`(打包版 beta 0.21.1-beta.7):
 * status `succeeded` / exitCode 0 / signal null / error 全 null,末段正文以
 * `</question-form>` 收尾,最后一个 TodoWrite 快照是 1 条 in_progress + 3 条
 * pending。没有任何东西停过它 —— 用户答完表单后的下一轮做完了 34 个产物。
 *
 * 光看快照的判据于是替这一轮断言了一个**没发生过的终止原因**:页脚说「已停止,
 * 仍有未完成任务」,项目卡走 `projectDisplayStatusForRunRow` 变成 `incomplete`。
 */
describe('turnEndedByAskingUser', () => {
  const RENDERABLE = [
    '开始之前先确认几件事。',
    '<question-form id="brand-brief" title="Brand brief">',
    '{"questions":[{"id":"brand_name","label":"Brand name","type":"text"}]}',
    '</question-form>',
  ].join('\n');

  it('is true for a closed, renderable form', () => {
    expect(turnEndedByAskingUser(RENDERABLE)).toBe(true);
  });

  it('accepts the <ask-question> alias models drift to', () => {
    expect(
      turnEndedByAskingUser(
        '<ask-question id="x">{"questions":[{"id":"a","label":"A?"}]}</ask-question>',
      ),
    ).toBe(true);
  });

  // 这是这个谓词**必须**借用 `emittedRenderableQuestionForm` 而不是自己写个
  // 开标签正则的原因:产物 HTML / 代码示例里出现这段文本的回合,完成度判定不能
  // 因此被静音。
  it('is false for a bare open tag with no renderable body', () => {
    expect(turnEndedByAskingUser('这里演示一下 <question-form> 这个标记怎么用。')).toBe(false);
    expect(
      turnEndedByAskingUser('<question-form id="x">无需提出——直接开工。</question-form>'),
    ).toBe(false);
  });

  it('is false for silence', () => {
    expect(turnEndedByAskingUser('')).toBe(false);
    expect(turnEndedByAskingUser(undefined)).toBe(false);
    expect(turnEndedByAskingUser(null)).toBe(false);
  });

  it('reassembles the turn text from persisted `text` events', () => {
    expect(
      eventsEndedByAskingUser([
        { kind: 'tool_use', name: 'TodoWrite', input: { todos: [] } },
        { kind: 'text', text: '开始之前先确认几件事。\n<question-form id="b">' },
        { kind: 'text', text: '{"questions":[{"id":"n","label":"Name"}]}</question-form>' },
      ]),
    ).toBe(true);
  });
});

describe('eventsEndedWithUnfinishedWork vs a turn that ended by asking', () => {
  /** 真机那一轮的形状:清单全是没做完的,正文以一个可渲染的表单收尾。 */
  const askedEvents = [
    {
      kind: 'tool_use',
      name: 'TodoWrite',
      input: {
        todos: [
          { content: 'Collect the brand brief', status: 'in_progress' },
          { content: 'Decide the imagery strategy', status: 'pending' },
          { content: 'Fill inputs.json', status: 'pending' },
          { content: 'Render the landing page', status: 'pending' },
        ],
      },
    },
    {
      kind: 'text',
      text:
        '<question-form id="brand-brief">'
        + '{"questions":[{"id":"brand_name","label":"Brand name"}]}'
        + '</question-form>',
    },
  ];

  it('does not call a clarification turn unfinished', () => {
    expect(eventsEndedWithUnfinishedWork(askedEvents)).toBe(false);
  });

  // 量法能看见缺陷:同一份清单,把表单换成不可渲染的正文就必须重新变红。
  it('still calls the same plan unfinished when nothing renderable was asked', () => {
    const notAsked = [
      askedEvents[0],
      { kind: 'text', text: '<question-form id="brand-brief">无需提出。</question-form>' },
    ];
    expect(eventsEndedWithUnfinishedWork(notAsked)).toBe(true);
  });

  // 被 max_tokens 砍断的一轮,即使正文里已经有个完整表单,也仍然是被砍断的。
  it('keeps a max_tokens truncation unfinished even under a rendered form', () => {
    expect(
      eventsEndedWithUnfinishedWork([
        ...askedEvents,
        { kind: 'usage', stopReason: 'max_tokens' },
      ]),
    ).toBe(true);
  });
});
