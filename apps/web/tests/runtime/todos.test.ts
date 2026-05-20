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
});
