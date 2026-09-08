import { describe, expect, it } from 'vitest';
import { runProgressSteps } from '../../src/runtime/run-progress';
import type { AgentEvent, ChatMessage } from '../../src/types';

function toolUse(id: string, name: string, input: unknown): AgentEvent {
  return { kind: 'tool_use', id, name, input };
}

function assistant(events: AgentEvent[], id = 'a1'): ChatMessage {
  return { id, role: 'assistant', content: '', events };
}

function user(content: string, id = 'u1'): ChatMessage {
  return { id, role: 'user', content };
}

describe('runProgressSteps', () => {
  it('returns nothing for a conversation with no assistant turn', () => {
    expect(runProgressSteps([])).toEqual([]);
    expect(runProgressSteps([user('Build a portfolio')])).toEqual([]);
  });

  it('reads the newest tool call first', () => {
    const steps = runProgressSteps([
      assistant([
        toolUse('1', 'Read', { file_path: '/tmp/project/index.html' }),
        toolUse('2', 'Edit', { file_path: '/tmp/project/styles/site.css' }),
      ]),
    ]);
    expect(steps.map((step) => [step.category, step.target])).toEqual([
      ['edit', 'site.css'],
      ['read', 'index.html'],
    ]);
  });

  it('reads only the last assistant turn, not the one before it', () => {
    const steps = runProgressSteps([
      assistant([toolUse('1', 'Write', { file_path: 'old.html' })], 'first'),
      user('Now make it dark'),
      assistant([toolUse('2', 'Write', { file_path: 'new.html' })], 'second'),
    ]);
    expect(steps.map((step) => step.target)).toEqual(['new.html']);
  });

  it('returns nothing once the user has spoken after the assistant', () => {
    const steps = runProgressSteps([
      assistant([toolUse('1', 'Write', { file_path: 'old.html' })]),
      user('Now make it dark', 'u2'),
    ]);
    expect(steps).toEqual([]);
  });

  it('names a command by its first line and a fetch by host + path', () => {
    const steps = runProgressSteps([
      assistant([
        toolUse('1', 'WebFetch', { url: 'https://example.com/docs/intro?utm=1' }),
        toolUse('2', 'Bash', { command: 'pnpm build\necho done' }),
      ]),
    ]);
    expect(steps.map((step) => [step.category, step.target])).toEqual([
      ['run', 'pnpm build'],
      ['fetch', 'example.com/docs/intro'],
    ]);
  });

  it('skips TodoWrite — the pinned todo card already shows that state', () => {
    const steps = runProgressSteps([
      assistant([
        toolUse('1', 'TodoWrite', { todos: [] }),
        toolUse('2', 'Read', { file_path: 'index.html' }),
      ]),
    ]);
    expect(steps.map((step) => step.id)).toEqual(['2']);
  });

  it('keeps an unclassified tool, with its name for the caller to render', () => {
    const steps = runProgressSteps([assistant([toolUse('1', 'mcp__figma__export', {})])]);
    expect(steps).toEqual([
      { id: '1', category: 'other', toolName: 'mcp__figma__export', target: null },
    ]);
  });

  it('elides a target that would overrun the line', () => {
    const long = `${'a'.repeat(200)}.html`;
    const steps = runProgressSteps([assistant([toolUse('1', 'Write', { file_path: long })])]);
    expect(steps[0]?.target).toHaveLength(45);
    expect(steps[0]?.target?.endsWith('…')).toBe(true);
  });

  it('caps the trail so a long turn cannot grow it without bound', () => {
    const events = Array.from({ length: 40 }, (_, i) =>
      toolUse(String(i), 'Read', { file_path: `file-${i}.html` }),
    );
    const steps = runProgressSteps([assistant(events)]);
    expect(steps).toHaveLength(12);
    // Newest first: the cap drops the oldest calls, not the current one.
    expect(steps[0]?.target).toBe('file-39.html');
  });
});
