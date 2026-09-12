import { describe, expect, it } from 'vitest';
import {
  pendingQuestionTitle,
  runFailureState,
  runProgressPhase,
  runProgressSteps,
} from '../../src/runtime/run-progress';
import type { AgentEvent, ChatMessage } from '../../src/types';

function toolUse(id: string, name: string, input: unknown): AgentEvent {
  return { kind: 'tool_use', id, name, input };
}

function assistant(events: AgentEvent[], id = 'a1'): ChatMessage {
  return { id, role: 'assistant', content: '', events };
}

function form(title: string, id = 'f1'): string {
  return `<question-form>${JSON.stringify({
    id,
    title,
    questions: [{ id: 'q1', type: 'text', label: 'Who?' }],
  })}</question-form>`;
}

function asked(content: string, id = 'a1'): ChatMessage {
  return { id, role: 'assistant', content, events: [] };
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

// The chat footer and the Design Files ring describe ONE run. The footer says
// "preparing" until the turn produces something, "thinking" once the run
// reports it is reasoning, and "working" the moment content lands; the ring
// reads the same three states from here, so the split can never show
// "Preparing…" on the left beside "Thinking" on the right.
describe('runProgressPhase', () => {
  it('is preparing before the turn has said anything', () => {
    expect(runProgressPhase([])).toBe('preparing');
    expect(runProgressPhase([user('Build a portfolio')])).toBe('preparing');
    expect(runProgressPhase([assistant([])])).toBe('preparing');
  });

  // A "thinking" STATUS is the run talking about itself, not output: the
  // wording changes, the phase does not.
  it('is thinking once the run reports reasoning, with nothing produced yet', () => {
    expect(runProgressPhase([assistant([{ kind: 'status', label: 'thinking' }])])).toBe('thinking');
    expect(
      runProgressPhase([assistant([{ kind: 'status', label: 'context_compaction' }])]),
    ).toBe('preparing');
  });

  it('is working the moment the turn produces content', () => {
    expect(runProgressPhase([assistant([{ kind: 'text', text: 'Here it is' }])])).toBe('working');
    expect(runProgressPhase([assistant([{ kind: 'thinking', text: 'hmm' }])])).toBe('working');
    expect(runProgressPhase([assistant([toolUse('1', 'Write', {})])])).toBe('working');
    // An empty text delta is not content — the turn has still said nothing.
    expect(
      runProgressPhase([assistant([{ kind: 'status', label: 'thinking' }, { kind: 'text', text: '  ' }])]),
    ).toBe('thinking');
  });

  it('reads the LAST turn only, and resets at a new user message', () => {
    expect(
      runProgressPhase([
        assistant([{ kind: 'text', text: 'done' }], 'a1'),
        user('now the pricing page', 'u2'),
      ]),
    ).toBe('preparing');
  });
});

// A turn that ends by ASKING is finished but not done — the run stopped
// because it needs an answer. The ring named nothing in that state while an
// open form sat in the chat column beside it.
describe('pendingQuestionTitle', () => {
  it('names the question the last turn is waiting on', () => {
    expect(pendingQuestionTitle([asked(`Here is the plan.\n${form('开场三问')}`)])).toBe(
      '开场三问',
    );
  });

  it('is null when the turn asked nothing', () => {
    expect(pendingQuestionTitle([])).toBe(null);
    expect(pendingQuestionTitle([asked('All done.')])).toBe(null);
    expect(pendingQuestionTitle([assistant([])])).toBe(null);
  });

  // The moment the user replies, their message is last: the form is answered
  // and there is nothing left to wait for.
  it('is null once the user has replied', () => {
    expect(
      pendingQuestionTitle([asked(form('开场三问')), user('主角是我', 'u2')]),
    ).toBe(null);
  });

  it('takes the last form when a turn asks twice', () => {
    expect(
      pendingQuestionTitle([asked(`${form('第一问', 'f1')}\n${form('第二问', 'f2')}`)]),
    ).toBe('第二问');
  });
});

describe('runFailureState', () => {
  it('reports nothing without an assistant turn to report on', () => {
    expect(runFailureState([])).toBeNull();
    expect(runFailureState([user('Build a portfolio')])).toBeNull();
  });

  it('reads the run status the chat card reads', () => {
    expect(runFailureState([{ ...assistant([]), runStatus: 'failed' }])).toBe('failed');
    expect(runFailureState([{ ...assistant([]), runStatus: 'canceled' }])).toBe('canceled');
    expect(runFailureState([{ ...assistant([]), runStatus: 'succeeded' }])).toBeNull();
  });

  // Still in flight: `running` owns that state, and a queued turn has not had
  // the chance to fail yet.
  it('does not call an unfinished run a failure', () => {
    expect(runFailureState([{ ...assistant([]), runStatus: 'running' }])).toBeNull();
    expect(runFailureState([{ ...assistant([]), runStatus: 'queued' }])).toBeNull();
  });

  it('counts a result that never reached the conversation', () => {
    expect(
      runFailureState([{ ...assistant([]), resultDeliveryState: 'no_result' }]),
    ).toBe('failed');
    expect(
      runFailureState([{ ...assistant([]), resultDeliveryState: 'delivery_failed' }]),
    ).toBe('failed');
  });

  // The card's own fallback for a message with no terminal status of its own.
  it('falls back to the tool calls when the run reported no status', () => {
    const errored: ChatMessage = {
      ...assistant([
        toolUse('1', 'Bash', { command: 'pnpm build' }),
        { kind: 'tool_result', toolUseId: '1', content: 'boom', isError: true },
      ]),
      endedAt: 2,
    };
    expect(runFailureState([errored])).toBe('failed');

    const settled: ChatMessage = {
      ...assistant([
        toolUse('1', 'Bash', { command: 'pnpm build' }),
        { kind: 'tool_result', toolUseId: '1', content: 'ok', isError: false },
      ]),
      endedAt: 2,
    };
    expect(runFailureState([settled])).toBeNull();
  });

  it('counts a tool call that never came back in a turn that never ended', () => {
    const dropped = assistant([toolUse('1', 'Bash', { command: 'pnpm build' })]);
    expect(runFailureState([dropped])).toBe('failed');
    expect(runFailureState([{ ...dropped, endedAt: 2 }])).toBeNull();
  });

  // The user answering moves the conversation on; the turn before their
  // message is history, not the state of the pane.
  it('stops reporting once the user has replied', () => {
    expect(
      runFailureState([{ ...assistant([]), runStatus: 'failed' }, user('Try again', 'u2')]),
    ).toBeNull();
  });
});


describe('plan progress titles', () => {
  it('prefers the active plan title over subsequent low-level tools', () => {
    const steps = runProgressSteps([assistant([
      toolUse('plan', 'TodoWrite', { todos: [
        { content: 'Create proposal', status: 'in_progress' },
        { content: 'Validate', status: 'pending' },
      ] }),
      toolUse('search', 'ToolSearch', { query: 'select:TaskUpdate' }),
    ])]);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.title).toBe('Create proposal');
  });
  it('follows plan updates and uses the first pending step when none is active', () => {
    const steps = runProgressSteps([assistant([
      toolUse('plan', 'TodoWrite', { todos: [
        { content: 'Create proposal', status: 'completed' },
        { content: 'Validate', status: 'pending' },
      ] }),
    ])]);
    expect(steps[0]?.title).toBe('Validate');
  });
});

 it('retains write location after plan and tool updates', () => {
   const steps = runProgressSteps([assistant([
     toolUse('write', 'Write', { file_path: 'index.html', content: '<h1>Studio Nine Design</h1>' }),
     toolUse('plan', 'TodoWrite', { todos: [{ content: 'Build hero', status: 'in_progress' }] }),
     toolUse('search', 'ToolSearch', { query: 'select:TaskUpdate' }),
   ])]);
   expect(steps[0]?.title).toBe('Build hero');
   expect(steps[0]?.location).toEqual({ file: 'index.html', anchor: 'Studio Nine Design' });
 });
