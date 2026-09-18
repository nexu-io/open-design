import { describe, expect, it } from 'vitest';
import {
  continuableUnfinishedTodos,
  todosDeclaredByLatestTurn,
  latestTodosFromEvents,
  latestTodoWriteInputForPinnedCard,
  parseTodoWriteInput,
  unfinishedTodosFromEvents,
} from '../../src/runtime/todos';
import type { AgentEvent, ChatMessage } from '../../src/types';

const firstTodoInput = {
  todos: [
    { content: 'Draft layout', status: 'completed' },
    { content: 'Build components', status: 'in_progress', activeForm: 'Building components' },
    { content: 'Run QA', status: 'pending' },
    { content: '', status: 'pending' },
    { content: 'Unknown status defaults pending', status: 'blocked' },
    null,
  ],
};

describe('todo event helpers', () => {
  it('normalizes TodoWrite input and ignores malformed items', () => {
    expect(parseTodoWriteInput(firstTodoInput)).toEqual([
      { content: 'Draft layout', status: 'completed', activeForm: undefined },
      {
        content: 'Build components',
        status: 'in_progress',
        activeForm: 'Building components',
      },
      { content: 'Run QA', status: 'pending', activeForm: undefined },
      {
        content: 'Unknown status defaults pending',
        status: 'pending',
        activeForm: undefined,
      },
    ]);
  });

  it('uses the latest TodoWrite event as the current todo truth', () => {
    const events: AgentEvent[] = [
      { kind: 'tool_use', id: 'todo-1', name: 'TodoWrite', input: firstTodoInput },
      { kind: 'text', text: 'Working...' },
      { kind: 'tool_use', id: 'todo-empty', name: 'TodoWrite', input: { todos: [] } },
      {
        kind: 'tool_use',
        id: 'todo-2',
        name: 'TodoWrite',
        input: { todos: [{ content: 'Final polish', status: 'pending' }] },
      },
    ];

    expect(latestTodosFromEvents(events)).toEqual([
      { content: 'Final polish', status: 'pending', activeForm: undefined },
    ]);
  });

  it('recognizes lowercase OpenCode todowrite events', () => {
    const events: AgentEvent[] = [
      {
        kind: 'tool_use',
        id: 'todo-1',
        name: 'todowrite',
        input: {
          todos: [
            { content: 'Self-check template', status: 'completed' },
            { content: 'Emit single artifact', status: 'pending' },
          ],
        },
      },
    ];

    expect(unfinishedTodosFromEvents(events)).toEqual([
      { content: 'Emit single artifact', status: 'pending', activeForm: undefined },
    ]);
  });

  it('normalizes Codex update_plan input as the current task queue', () => {
    const events: AgentEvent[] = [
      {
        kind: 'tool_use',
        id: 'plan-1',
        name: 'update_plan',
        input: {
          plan: [
            { step: 'Inspect chat rendering', status: 'completed' },
            { step: 'Add annotation card', status: 'in_progress' },
            { step: 'Run focused tests', status: 'pending' },
          ],
        },
      },
    ];

    expect(latestTodosFromEvents(events)).toEqual([
      { content: 'Inspect chat rendering', status: 'completed', activeForm: undefined },
      { content: 'Add annotation card', status: 'in_progress', activeForm: undefined },
      { content: 'Run focused tests', status: 'pending', activeForm: undefined },
    ]);
    expect(unfinishedTodosFromEvents(events)).toEqual([
      { content: 'Add annotation card', status: 'in_progress', activeForm: undefined },
      { content: 'Run focused tests', status: 'pending', activeForm: undefined },
    ]);
  });

  it('recognizes snake_case todo_write events', () => {
    const input = latestTodoWriteInputForPinnedCard([
      {
        runStatus: 'running',
        events: [
          {
            kind: 'tool_use',
            id: 'todo-1',
            name: 'todo_write',
            input: { todos: [{ content: 'Port task queue card', status: 'pending' }] },
          },
        ],
      },
    ]);

    expect(parseTodoWriteInput(input)).toEqual([
      { content: 'Port task queue card', status: 'pending', activeForm: undefined },
    ]);
  });

  it('accepts native task item text aliases used by different agents', () => {
    expect(parseTodoWriteInput({
      todos: [
        { description: 'Inspect plan mode output', status: 'completed' },
        { label: 'Render todo card', status: 'in_progress' },
        { text: 'Run focused tests', status: 'pending' },
      ],
    })).toEqual([
      { content: 'Inspect plan mode output', status: 'completed', activeForm: undefined },
      { content: 'Render todo card', status: 'in_progress', activeForm: undefined },
      { content: 'Run focused tests', status: 'pending', activeForm: undefined },
    ]);
  });

  it('uses lowercase todowrite as the latest todo truth over older TodoWrite events', () => {
    const events: AgentEvent[] = [
      { kind: 'tool_use', id: 'todo-1', name: 'TodoWrite', input: firstTodoInput },
      {
        kind: 'tool_use',
        id: 'todo-2',
        name: 'todowrite',
        input: { todos: [{ content: 'Emit single artifact', status: 'pending' }] },
      },
    ];

    expect(latestTodosFromEvents(events)).toEqual([
      { content: 'Emit single artifact', status: 'pending', activeForm: undefined },
    ]);
  });

  it('treats an empty latest TodoWrite event as authoritative', () => {
    const events: AgentEvent[] = [
      { kind: 'tool_use', id: 'todo-1', name: 'TodoWrite', input: firstTodoInput },
      { kind: 'text', text: 'All done.' },
      { kind: 'tool_use', id: 'todo-empty', name: 'TodoWrite', input: { todos: [] } },
    ];

    expect(latestTodosFromEvents(events)).toEqual([]);
    expect(unfinishedTodosFromEvents(events)).toEqual([]);
  });

  it('returns only pending and in-progress todos as unfinished', () => {
    expect(unfinishedTodosFromEvents([
      { kind: 'tool_use', id: 'todo-1', name: 'TodoWrite', input: firstTodoInput },
    ])).toEqual([
      {
        content: 'Build components',
        status: 'in_progress',
        activeForm: 'Building components',
      },
      { content: 'Run QA', status: 'pending', activeForm: undefined },
      {
        content: 'Unknown status defaults pending',
        status: 'pending',
        activeForm: undefined,
      },
    ]);
  });

  // #1247 / #1060 — locks the canonical predicate: `stopped` counts as unfinished
  // (status !== 'completed'), so the footer and the daemon's endedWithUnfinishedWork
  // flag agree. Narrowing to "pending/in_progress only" would reintroduce the drift.
  it('counts a stopped task as unfinished, matching the daemon predicate', () => {
    const events: AgentEvent[] = [
      {
        kind: 'tool_use',
        id: 'todo-1',
        name: 'TodoWrite',
        input: {
          todos: [
            { content: 'Draft layout', status: 'completed' },
            { content: 'Build components', status: 'stopped' },
          ],
        },
      },
    ];
    expect(unfinishedTodosFromEvents(events)).toEqual([
      { content: 'Build components', status: 'stopped', activeForm: undefined },
    ]);
  });

  it('treats an all-completed TodoWrite as finished (no unfinished work)', () => {
    const events: AgentEvent[] = [
      {
        kind: 'tool_use',
        id: 'todo-1',
        name: 'TodoWrite',
        input: {
          todos: [
            { content: 'Draft layout', status: 'completed' },
            { content: 'Build components', status: 'completed' },
          ],
        },
      },
    ];
    expect(unfinishedTodosFromEvents(events)).toEqual([]);
  });

  it('marks the active todo as stopped when a failed run ended without a final TodoWrite', () => {
    const input = latestTodoWriteInputForPinnedCard([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        runStatus: 'failed',
        events: [
          {
            kind: 'tool_use',
            id: 'todo-1',
            name: 'TodoWrite',
            input: {
              todos: [
                { content: 'Draft layout', status: 'completed' },
                { content: 'Build components', status: 'in_progress', activeForm: 'Building components' },
                { content: 'Run QA', status: 'pending' },
              ],
            },
          },
        ],
      },
    ]);

    expect(parseTodoWriteInput(input)).toEqual([
      { content: 'Draft layout', status: 'completed', activeForm: undefined },
      { content: 'Build components', status: 'stopped', activeForm: 'Building components' },
      { content: 'Run QA', status: 'pending', activeForm: undefined },
    ]);
  });

  it('marks the active todo as stopped when a nominally successful run ended with stale progress', () => {
    const input = latestTodoWriteInputForPinnedCard([
      {
        runStatus: 'succeeded',
        endedAt: 3_000,
        events: [
          {
            kind: 'tool_use',
            id: 'todo-1',
            name: 'TodoWrite',
            input: {
              todos: [
                { content: 'Generate HTML', status: 'in_progress' },
                { content: 'Self-check', status: 'pending' },
              ],
            },
          },
        ],
      },
    ]);

    expect(parseTodoWriteInput(input)).toEqual([
      { content: 'Generate HTML', status: 'stopped', activeForm: undefined },
      { content: 'Self-check', status: 'pending', activeForm: undefined },
    ]);
  });

  it('marks update_plan items as stopped when a terminal run ends with stale progress', () => {
    const input = latestTodoWriteInputForPinnedCard([
      {
        runStatus: 'succeeded',
        endedAt: 3_000,
        events: [
          {
            kind: 'tool_use',
            id: 'plan-1',
            name: 'update_plan',
            input: {
              plan: [
                { step: 'Inspect chat rendering', status: 'completed' },
                { step: 'Add annotation card', status: 'in_progress' },
                { step: 'Run focused tests', status: 'pending' },
              ],
            },
          },
        ],
      },
    ]);

    expect(parseTodoWriteInput(input)).toEqual([
      { content: 'Inspect chat rendering', status: 'completed', activeForm: undefined },
      { content: 'Add annotation card', status: 'stopped', activeForm: undefined },
      { content: 'Run focused tests', status: 'pending', activeForm: undefined },
    ]);
  });
});

describe('continuableUnfinishedTodos', () => {
  const staleSnapshot: AgentEvent[] = [
    {
      kind: 'tool_use',
      id: 'todo-1',
      name: 'TodoWrite',
      input: {
        todos: [
          { content: '生成品牌视觉资产', status: 'completed' },
          { content: '写入响应式交互原型', status: 'pending' },
          { content: '交付根目录运行入口', status: 'pending' },
        ],
      },
    },
  ] as AgentEvent[];

  it('offers nothing to continue once the strategy task delivered its work', () => {
    // The agent wrote index.html plus its assets and OD Next settled the task
    // `completed`, but its last TodoWrite still carried two pending items.
    // Offering "continue" there sends the user into a second task that has
    // nothing left to write and can only block.
    expect(
      continuableUnfinishedTodos({
        events: staleSnapshot,
        strategyTaskDelivered: true,
      }),
    ).toEqual([]);
  });

  it('still offers the unfinished items when the task did not deliver', () => {
    expect(
      continuableUnfinishedTodos({ events: staleSnapshot }).map((todo) => todo.content),
    ).toEqual(['写入响应式交互原型', '交付根目录运行入口']);
  });

  it('returns nothing for a missing message', () => {
    expect(continuableUnfinishedTodos(undefined)).toEqual([]);
  });

  /*
   * 「问完就交棒」那一档。
   *
   * 真机 run `441ff961-bd66-4c4a-91e7-812f1d489668`:清单刚写下(1 条 in_progress
   * + 3 条 pending),正文以一个可渲染的 `<question-form>` 收尾,进程 exit 0。
   * 这一轮**没有停**,它在等答案 —— 而页脚不读 daemon 的 `endedWithUnfinishedWork`,
   * 它自己从这一层重算,所以判据必须落在这里。
   */
  const askedSnapshot: AgentEvent[] = [
    {
      kind: 'tool_use',
      id: 'todo-1',
      name: 'TodoWrite',
      input: {
        todos: [
          { content: 'Collect the brand brief', status: 'in_progress' },
          { content: 'Render the landing page', status: 'pending' },
        ],
      },
    },
  ] as AgentEvent[];

  const RENDERABLE_FORM = [
    '开始之前先确认几件事。',
    '<question-form id="brand-brief" title="Brand brief">',
    '{"questions":[{"id":"brand_name","label":"Brand name","type":"text"}]}',
    '</question-form>',
  ].join('\n');

  it('offers nothing to continue when the turn ended by asking the user', () => {
    expect(
      continuableUnfinishedTodos({
        events: askedSnapshot,
        content: RENDERABLE_FORM,
        runStatus: 'succeeded',
      }),
    ).toEqual([]);
  });

  it('reads the form off the turn events when no content is supplied', () => {
    expect(
      continuableUnfinishedTodos({
        events: [...askedSnapshot, { kind: 'text', text: RENDERABLE_FORM }] as AgentEvent[],
        runStatus: 'succeeded',
      }),
    ).toEqual([]);
  });

  // 量法能看见缺陷:同一份清单,把表单换成不可渲染的正文就必须重新给出条目。
  it('still offers the items when the markup was only quoted, never rendered', () => {
    expect(
      continuableUnfinishedTodos({
        events: askedSnapshot,
        content: '演示一下 <question-form> 这个标记怎么写。',
        runStatus: 'succeeded',
      }).map((todo) => todo.content),
    ).toEqual(['Collect the brand brief', 'Render the landing page']);
  });

  // 用户按了停,那一轮就是被停掉的 —— 它路过时问了什么不改变这件事,
  // 剩下的活仍然要能接着做。
  it('keeps the items continuable when the user stopped the turn', () => {
    expect(
      continuableUnfinishedTodos({
        events: askedSnapshot,
        content: RENDERABLE_FORM,
        runStatus: 'canceled',
      }).map((todo) => todo.content),
    ).toEqual(['Collect the brand brief', 'Render the landing page']);
  });
});


// OPEND-2944: exercise the exported plan lookup, not the private classifier.
// Existing tests above remain unchanged apart from the added imports.
describe('current turn plan ownership around host memory', () => {
  const memory = '<od-card type="memory-applied">{"summary":"Remembered a preference","used":[]}</od-card>';
  const older: ChatMessage = {
    id: 'older-plan', role: 'assistant', content: 'Working.', createdAt: 1,
    runId: 'run-older', runStatus: 'running',
    events: [{ kind: 'tool_use', id: 'old-todo', name: 'TodoWrite', input: {
      todos: [{ content: 'Older current task', status: 'in_progress' }],
    } }],
  };
  const expectedOlder = [{
    content: 'Older current task', status: 'in_progress', activeForm: undefined,
  }];
  type OriginMessage = ChatMessage & { messageOrigin?: 'host_memory' };
  function tail(content = memory, extra: Partial<OriginMessage> = {}): OriginMessage {
    return {
      id: 'tail', role: 'assistant', content, createdAt: 2, messageOrigin: 'host_memory',
      events: [{ kind: 'text', text: content }], ...extra,
    };
  }

  // A new user request is persisted turn ownership. Do not infer authorship
  // from a standalone card whose legacy row has no run/timing metadata.
  const newRequest: ChatMessage = {
    id: 'new-user-request', role: 'user', content: 'Use my saved preference.', createdAt: 2,
  };

  it.each([
    ['omitted events', undefined],
    ['matching text events', [{ kind: 'text', text: memory }] as AgentEvent[]],
  ])('does not revive a previous plan across a new user request with %s', (_label, events) => {
    const legacyReply = tail(memory, { id: 'later-reply', createdAt: 3, events, messageOrigin: undefined });
    expect(todosDeclaredByLatestTurn([older, newRequest, legacyReply])).toEqual([]);
  });

  it('does not borrow the previous plan while the new user request awaits an assistant row', () => {
    expect(todosDeclaredByLatestTurn([older, newRequest])).toEqual([]);
  });

  it('keeps a same-turn host notification compatible when the request precedes its plan', () => {
    const currentPlan = { ...older, id: 'current-plan', createdAt: 3 };
    expect(todosDeclaredByLatestTurn([
      newRequest, currentPlan, tail(memory, { createdAt: 4 }),
    ])).toEqual(expectedOlder);
  });

  it('uses the plan explicitly re-emitted after the new user request', () => {
    const currentPlan: ChatMessage = {
      ...older, id: 'new-plan', createdAt: 3, runId: 'run-new',
      events: [{ kind: 'tool_use', id: 'new-todo', name: 'TodoWrite', input: {
        todos: [{ content: 'New requested task', status: 'pending' }],
      } }],
    };
    expect(todosDeclaredByLatestTurn([
      older, newRequest, currentPlan, tail(memory, { createdAt: 4 }),
    ])).toEqual([{ content: 'New requested task', status: 'pending', activeForm: undefined }]);
  });

  it.each([
    ['omitted events', undefined],
    ['matching text events', [{ kind: 'text', text: memory }] as AgentEvent[]],
  ])('retains an unmarked legacy model memory reply as a boundary with %s', (_label, events) => {
    expect(todosDeclaredByLatestTurn([
      older, tail(memory, { messageOrigin: undefined, events }),
    ])).toEqual([]);
  });

  it('does not infer host authorship from an unsupported origin', () => {
    expect(todosDeclaredByLatestTurn([
      older, tail(memory, { messageOrigin: 'unrecognized_source' as never }),
    ])).toEqual([]);
  });

  it('passes a standalone valid host memory notification without losing the current plan', () => {
    expect(todosDeclaredByLatestTurn([older, tail()])).toEqual(expectedOlder);
  });

  it('also recognizes the host card when optional text events were not stored', () => {
    expect(todosDeclaredByLatestTurn([older, tail(memory, { events: undefined })]))
      .toEqual(expectedOlder);
  });

  it.each([
    ['ordinary reply', 'The font is Inter.'],
    ['inline code example', '`' + memory + '`'],
    ['fenced code example', '```xml\n' + memory + '\n```'],
    ['ordinary prose containing a real card', 'Here is an example.\n' + memory],
    ['incomplete memory', '<od-card type="memory-applied">{"summary":"Partial","used":[]'],
    ['invalid memory JSON', '<od-card type="memory-applied">not JSON</od-card>'],
    ['different valid protocol card', '<od-card type="task-brief">{"summary":"New task","fields":[]}</od-card>'],
  ])('keeps %s as a new boundary rather than finding an older plan', (_label, content) => {
    expect(todosDeclaredByLatestTurn([older, tail(content)])).toEqual([]);
  });

  it.each([
    ['ordinary reply', 'This is a normal new reply.'],
    ['inline memory example', '`' + memory + '`'],
    ['fenced memory example', '```xml\n' + memory + '\n```'],
  ])('does not skip visible text events containing %s when content is memory-only', (_label, text) => {
    expect(todosDeclaredByLatestTurn([older, tail(memory, {
      events: [{ kind: 'text', text }],
    })])).toEqual([]);
  });

  it('does not skip ordinary content merely because text events are memory-only', () => {
    expect(todosDeclaredByLatestTurn([older, tail('This is a normal new reply.', {
      events: [{ kind: 'text', text: memory }],
    })])).toEqual([]);
  });

  it('uses a real legacy TodoWrite even when its body is a memory card', () => {
    const events: AgentEvent[] = [{
      kind: 'tool_use', id: 'new-todo', name: 'TodoWrite', input: {
        todos: [{ content: 'Latest actual task', status: 'pending' }],
      },
    }];
    expect(todosDeclaredByLatestTurn([older, tail(memory, { events })])).toEqual([
      { content: 'Latest actual task', status: 'pending', activeForm: undefined },
    ]);
  });

  it('treats an explicitly empty real TodoWrite as authoritative', () => {
    const events: AgentEvent[] = [{
      kind: 'tool_use', id: 'empty-todo', name: 'TodoWrite', input: { todos: [] },
    }];
    expect(todosDeclaredByLatestTurn([older, tail(memory, { events })])).toEqual([]);
  });

  it('does not skip a real non-Todo tool event merely because its prose is memory', () => {
    const events: AgentEvent[] = [{
      kind: 'tool_use', id: 'read-file', name: 'Read', input: { file_path: 'index.html' },
    }];
    expect(todosDeclaredByLatestTurn([older, tail(memory, { events })])).toEqual([]);
  });

  it.each([
    { startedAt: 2 },
    { runId: 'run-latest' },
    { runStatus: 'running' as const },
    { endedAt: 3 },
  ])('keeps existing run identity %j as a boundary even with pure memory content', (identity) => {
    expect(todosDeclaredByLatestTurn([older, tail(memory, identity)])).toEqual([]);
  });
});
