import { describe, expect, it } from 'vitest';
import {
  latestTodosFromEvents,
  latestTodoWriteInputForPinnedCard,
  parseTodoWriteInput,
  unfinishedTodosFromEvents,
} from '../../src/runtime/todos';
import type { AgentEvent } from '../../src/types';

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
