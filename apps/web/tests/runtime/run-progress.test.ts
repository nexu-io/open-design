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
      { id: '1', category: 'other', toolName: 'mcp__figma__export', target: null, anchor: null },
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

// The anchor is what lets a live preview scroll to the part being written: a
// literal run of visible text taken from the tool's own input. It exists only
// where it can point at something — an HTML page the step actually wrote.
describe('runProgressSteps anchors', () => {
  it('takes the replacement text of an html edit', () => {
    const [step] = runProgressSteps([
      assistant([
        toolUse('1', 'Edit', {
          file_path: '/tmp/project/index.html',
          old_string: '<h1>Old</h1>',
          new_string: '<h1 class="hero">Studio Nine, a design practice</h1>',
        }),
      ]),
    ]);
    expect(step?.anchor).toBe('Studio Nine, a design practice');
  });

  it('takes the LAST edit of a multi-edit, which is where the step ended up', () => {
    const [step] = runProgressSteps([
      assistant([
        toolUse('1', 'MultiEdit', {
          file_path: 'index.html',
          edits: [
            { old_string: 'a', new_string: '<p>The first paragraph of copy</p>' },
            { old_string: 'b', new_string: '<p>The closing paragraph of copy</p>' },
          ],
        }),
      ]),
    ]);
    expect(step?.anchor).toBe('The closing paragraph of copy');
  });

  it('takes the tail of a whole-file write — the part just finished', () => {
    const [step] = runProgressSteps([
      assistant([
        toolUse('1', 'Write', {
          file_path: 'index.html',
          content: '<html><body><h1>A portfolio index</h1><footer>Contact the studio</footer></body></html>',
        }),
      ]),
    ]);
    expect(step?.anchor).toBe('Contact the studio');
  });

  it('has no anchor when the step wrote no visible html text', () => {
    const steps = runProgressSteps([
      assistant([
        toolUse('1', 'Read', { file_path: 'index.html' }),
        toolUse('2', 'Edit', { file_path: 'site.css', new_string: '.hero { color: red; }' }),
        toolUse('3', 'Edit', {
          file_path: 'index.html',
          new_string: '<style>.hero{color:red}</style>',
        }),
        toolUse('4', 'Bash', { command: 'pnpm build' }),
      ]),
    ]);
    expect(steps.map((step) => step.anchor)).toEqual([null, null, null, null]);
  });

  it('ignores a run of text too short to point at anything in particular', () => {
    const [step] = runProgressSteps([
      assistant([
        toolUse('1', 'Edit', { file_path: 'index.html', new_string: '<button>OK</button>' }),
      ]),
    ]);
    expect(step?.anchor).toBeNull();
  });
});
