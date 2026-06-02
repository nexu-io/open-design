// @vitest-environment jsdom

/**
 * Visibility-gate coverage for the assistant feedback widget. It should
 * appear after any successfully completed turn, and stay hidden for
 * streaming turns, failed runs, and empty responses.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import { CHAT_DISCLOSURE_TOGGLE_EVENT } from '../../src/components/chat/ChatSurface';
import type { AgentInfo, ChatMessage, ProjectFile } from '../../src/types';

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

beforeEach(() => {
  window.localStorage.clear();
});

function baseMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: 'Done.',
    runStatus: 'succeeded',
    startedAt: 1700000000,
    endedAt: 1700000005,
    events: [{ kind: 'text', text: 'Done.' } as ChatMessage['events'][number]],
    producedFiles: [],
    ...overrides,
  } as ChatMessage;
}

function producedFile(name: string): ProjectFile {
  return {
    name,
    path: name,
    size: 100,
    mtime: 1700000005,
    kind: 'html',
    mime: 'text/html',
  } as ProjectFile;
}

describe('AssistantMessage feedback gate', () => {
  it('copies the raw assistant markdown from the completion footer', async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText,
      },
    });
    try {
      const message = baseMessage({
        content: '**Done.**\n\n- Keep the markdown',
        events: [
          {
            kind: 'text',
            text: '**Done.**\n\n- Keep the markdown',
          } as ChatMessage['events'][number],
        ],
      });
      render(
        <AssistantMessage
          message={message}
          streaming={false}
          projectId="proj-1"
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Copy response markdown' }));

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(message.content);
      });
      expect(screen.getByRole('button', { name: 'Copied!' })).toBeTruthy();
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', originalClipboard);
      } else {
        delete (navigator as { clipboard?: Clipboard }).clipboard;
      }
    }
  });

  it('calls the fork handler from completed assistant turns', () => {
    const onForkFromMessage = vi.fn();
    render(
      <AssistantMessage
        message={baseMessage()}
        streaming={false}
        projectId="proj-1"
        onForkFromMessage={onForkFromMessage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fork from here' }));

    expect(onForkFromMessage).toHaveBeenCalledTimes(1);
  });

  it('does not show the fork action while the assistant is streaming', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          runStatus: 'running',
          endedAt: undefined,
        })}
        streaming
        projectId="proj-1"
        onForkFromMessage={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Fork from here' })).toBeNull();
  });

  it('shows the feedback widget after a successful turn that produced files', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('index.html')] })}
        streaming={false}
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.getByRole('group', { name: 'Feedback' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Helpful' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not helpful' })).toBeTruthy();
  });

  it('shows the feedback widget for a successful text-only turn with no producedFiles', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [] })}
        streaming={false}
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.getByRole('group', { name: 'Feedback' })).toBeTruthy();
  });

  it('hides the feedback widget while the turn is still streaming', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          producedFiles: [producedFile('index.html')],
          runStatus: 'running',
          endedAt: undefined,
        })}
        streaming
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Feedback' })).toBeNull();
  });

  it('hides the feedback widget when the run failed', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          producedFiles: [producedFile('index.html')],
          runStatus: 'failed',
        })}
        streaming={false}
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Feedback' })).toBeNull();
  });

  it('hides the feedback widget when the run ended with an empty_response status', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          producedFiles: [producedFile('index.html')],
          events: [
            { kind: 'status', label: 'empty_response' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Feedback' })).toBeNull();
  });
});

describe('AssistantMessage status badge updates (Bug A)', () => {
  // Regression coverage for the model-badge stale-detail bug. ACP agents
  // emit two `status: 'model'` events per turn:
  //   1. After session/new returns — the agent's initial default model
  //      (e.g. `swe-1-6-fast` for Devin for Terminal)
  //   2. After session/set_config_option (or legacy session/set_model)
  //      succeeds — the user-selected model (e.g. `claude-opus-4-7-max`)
  //
  // The raw status used to render as a separate body badge. The header now
  // owns provider/model identity, but it still needs the latest ACP detail.
  it('renders the most recent ACP model detail in the assistant header', () => {
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          events: [
            { kind: 'status', label: 'model', detail: 'swe-1-6-fast' } as ChatMessage['events'][number],
            { kind: 'status', label: 'model', detail: 'claude-opus-4-7-max' } as ChatMessage['events'][number],
            { kind: 'text', text: 'Done.' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );

    expect(container.querySelector('.assistant-identity-provider')?.textContent).toBe('Assistant');
    expect(container.querySelector('.assistant-identity-model')?.textContent).toBe('Claude Opus 4.7 Max');
    expect(container.querySelector('[data-status="model"]')).toBeNull();
    expect(screen.queryByText('swe-1-6-fast')).toBeNull();
    expect(screen.queryByText('claude-opus-4-7-max')).toBeNull();
  });

  it('does not duplicate repeated ACP model status outside the assistant header', () => {
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          events: [
            { kind: 'status', label: 'model', detail: 'claude-opus-4-7-max' } as ChatMessage['events'][number],
            { kind: 'status', label: 'model', detail: 'claude-opus-4-7-max' } as ChatMessage['events'][number],
            { kind: 'text', text: 'Done.' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );

    expect(container.querySelector('.assistant-identity-provider')?.textContent).toBe('Assistant');
    expect(container.querySelector('.assistant-identity-model')?.textContent).toBe('Claude Opus 4.7 Max');
    expect(container.querySelector('[data-status="model"]')).toBeNull();
    expect(screen.queryByText('claude-opus-4-7-max')).toBeNull();
  });

  it('renders bare URLs in status details as links', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          runStatus: 'failed',
          events: [
            {
              kind: 'status',
              label: 'error',
              detail:
                'AMR Cloud reported insufficient balance. Recharge at https://open-design.ai/amr/wallet, then retry.',
            } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );

    const link = screen.getByRole('link', { name: 'https://open-design.ai/amr/wallet' });
    expect(link.getAttribute('href')).toBe('https://open-design.ai/amr/wallet');
    expect(link.classList.contains('md-link')).toBe(true);
  });
});

describe('AssistantMessage model identity', () => {
  const agents: AgentInfo[] = [
    {
      id: 'claude',
      name: 'Claude Code',
      bin: 'claude',
      available: true,
      models: [
        { id: 'claude-opus-4.8', label: 'Claude Opus 4.8' },
        { id: 'opus', label: 'Opus (alias)' },
      ],
    } as AgentInfo,
  ];

  it('merges the initializing model detail into the assistant header', () => {
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          agentId: 'claude',
          agentName: 'Claude Code',
          events: [
            { kind: 'status', label: 'starting', detail: 'claude' } as ChatMessage['events'][number],
            { kind: 'status', label: 'initializing', detail: 'claude-opus-4-8' } as ChatMessage['events'][number],
            { kind: 'text', text: 'Done.' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        agents={agents}
      />,
    );

    const identity = container.querySelector('.assistant-identity');
    expect(identity?.textContent).toBe('Claude·Claude Opus 4.8');
    expect(container.querySelector('.assistant-identity-icon')).toBeTruthy();
    expect(container.querySelector('[data-status="initializing"]')).toBeNull();
    expect(screen.queryByText('claude-opus-4-8')).toBeNull();
  });

  it('merges ACP model status into the assistant header without a duplicate pill', () => {
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          agentId: 'claude',
          agentName: 'Claude Code',
          events: [
            { kind: 'status', label: 'starting', detail: 'claude' } as ChatMessage['events'][number],
            { kind: 'status', label: 'model', detail: 'claude-opus-4.8' } as ChatMessage['events'][number],
            { kind: 'text', text: 'Done.' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        agents={agents}
      />,
    );

    expect(container.querySelector('.assistant-identity')?.textContent).toBe('Claude·Claude Opus 4.8');
    expect(container.querySelector('[data-status="model"]')).toBeNull();
    expect(screen.queryByText('claude-opus-4.8')).toBeNull();
  });

  it('normalizes raw fallback model ids when registry labels are raw', () => {
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          agentId: 'gemini',
          events: [
            { kind: 'status', label: 'initializing', detail: 'gemini-2.5-flash-lite' } as ChatMessage['events'][number],
            { kind: 'text', text: 'Done.' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        agents={[
          {
            id: 'gemini',
            name: 'Gemini CLI',
            bin: 'gemini',
            available: true,
            models: [{ id: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite' }],
          } as AgentInfo,
        ]}
      />,
    );

    expect(container.querySelector('.assistant-identity')?.textContent).toBe('Gemini·Gemini 2.5 Flash Lite');
    expect(screen.queryByText('gemini-2.5-flash-lite')).toBeNull();
  });
});

describe('AssistantMessage AskUserQuestion history', () => {
  const askQuestionEvent = {
    kind: 'tool_use',
    id: 'tool-1',
    name: 'AskUserQuestion',
    input: {
      questions: [
        {
          header: 'Next move',
          question: 'Where next?',
          options: [
            { label: 'macOS Settings window', description: 'Desktop variant' },
            { label: 'Leave as-is', description: 'Stop here' },
          ],
        },
      ],
    },
  } as ChatMessage['events'][number];

  it('keeps fallback answers truthful after the assistant card remounts from history', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          content: '',
          events: [askQuestionEvent],
        })}
        streaming={false}
        projectId="proj-1"
        isLast={false}
        nextUserContent={'Where next?\nmacOS Settings window'}
      />,
    );

    expect(screen.getByText('Sent as follow-up')).toBeTruthy();
    expect(screen.queryByText('No answer received')).toBeNull();
    expect(screen.getByRole('button', { name: /macOS Settings window/i }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('AssistantMessage thinking blocks', () => {
  it('does not render an empty thinking block for whitespace-only thinking deltas', () => {
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          content: '',
          events: [
            { kind: 'status', label: 'thinking' } as ChatMessage['events'][number],
            { kind: 'thinking', text: '\n  \t' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
      />,
    );

    expect(container.querySelector('.thinking-block')).toBeNull();
  });

  it('keeps non-empty thinking content visible after leading whitespace deltas', () => {
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          content: '',
          events: [
            { kind: 'thinking', text: '\n  ' } as ChatMessage['events'][number],
            { kind: 'thinking', text: 'Reading the directory listing.' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
      />,
    );

    expect(container.querySelector('.thinking-block')).toBeTruthy();
    expect(screen.getByText('Reading the directory listing.')).toBeTruthy();
  });

  it('keeps streaming thinking collapsed behind a minimal disclosure', () => {
    const rawThinking = 'I should inspect the files, reason about the layout, and then choose the safest design path.';
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          content: '',
          runStatus: 'running',
          endedAt: undefined,
          events: [
            { kind: 'status', label: 'thinking' } as ChatMessage['events'][number],
            { kind: 'thinking', text: rawThinking } as ChatMessage['events'][number],
          ],
        })}
        streaming
        projectId="proj-1"
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Thought' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.thinking-label.shimmer-text')).toBeTruthy();
    expect(container.querySelector('.accordion-collapsible.open')).toBeNull();
    expect(screen.getByText(rawThinking)).toBeTruthy();
  });

  it('expands and collapses thinking when the user toggles it', () => {
    const rawThinking = 'Private reasoning details stay out of the main transcript until requested.';
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          content: '',
          events: [
            { kind: 'thinking', text: rawThinking } as ChatMessage['events'][number],
            { kind: 'text', text: 'Final answer.' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Thought' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.accordion-collapsible.open')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.accordion-collapsible.open')).toBeTruthy();
    expect(screen.getByText(rawThinking)).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.accordion-collapsible.open')).toBeNull();
  });

  it('dispatches the shared disclosure event before expanding thinking', () => {
    const rawThinking = 'Private reasoning details.';
    const events: Array<{ open: boolean }> = [];
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          content: '',
          events: [{ kind: 'thinking', text: rawThinking } as ChatMessage['events'][number]],
        })}
        streaming={false}
        projectId="proj-1"
      />,
    );
    container.addEventListener(CHAT_DISCLOSURE_TOGGLE_EVENT, (event) => {
      events.push((event as CustomEvent<{ open: boolean }>).detail);
    });

    const toggle = screen.getByRole('button', { name: 'Thinking' });
    fireEvent.click(toggle);

    expect(events).toEqual([{ open: true }]);
    expect(screen.getByText(rawThinking)).toBeTruthy();
  });

  it('keeps text emitted during thinking collapsed when it leads into tool use', () => {
    const operationalThought = "I'll inspect the provider state before editing.";
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          content: '',
          events: [
            { kind: 'status', label: 'thinking' } as ChatMessage['events'][number],
            { kind: 'text', text: operationalThought } as ChatMessage['events'][number],
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Read',
              input: { file_path: 'settings.html' },
            } as ChatMessage['events'][number],
          ],
        })}
        streaming
        projectId="proj-1"
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Thought' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.accordion-collapsible.open')).toBeNull();
    expect(screen.getByText(operationalThought)).toBeTruthy();

    fireEvent.click(toggle);
    expect(container.querySelector('.accordion-collapsible.open')).toBeTruthy();
    expect(screen.getByText(operationalThought)).toBeTruthy();
  });

  it('keeps pending thinking-phase text collapsed while the run is still streaming', () => {
    const pendingThought = 'Gemini is already connected in defaults, so I need to inspect local state.';
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          content: '',
          runStatus: 'running',
          endedAt: undefined,
          events: [
            { kind: 'status', label: 'thinking' } as ChatMessage['events'][number],
            { kind: 'text', text: pendingThought } as ChatMessage['events'][number],
          ],
        })}
        streaming
        projectId="proj-1"
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Thinking' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.accordion-collapsible.open')).toBeNull();
    expect(screen.getByText(pendingThought)).toBeTruthy();

    fireEvent.click(toggle);
    expect(container.querySelector('.accordion-collapsible.open')).toBeTruthy();
    expect(screen.getByText(pendingThought)).toBeTruthy();
  });

  it('keeps final answer text visible when thinking does not lead into a tool call', () => {
    const finalAnswer = 'Done — Gemini now shows connected.';
    render(
      <AssistantMessage
        message={baseMessage({
          content: '',
          events: [
            { kind: 'status', label: 'thinking' } as ChatMessage['events'][number],
            { kind: 'text', text: finalAnswer } as ChatMessage['events'][number],
            { kind: 'usage' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
      />,
    );

    expect(screen.getByText(finalAnswer)).toBeTruthy();
  });

  it('keeps short planning text before a later tool call collapsed after completion', () => {
    const planningText = 'Now let me look at the screenshot.';
    const finalAnswer = 'The settings screen renders cleanly.';
    render(
      <AssistantMessage
        message={baseMessage({
          content: '',
          events: [
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'screenshot' },
            } as ChatMessage['events'][number],
            {
              kind: 'tool_result',
              toolUseId: 'tool-1',
              content: 'done',
              isError: false,
            } as ChatMessage['events'][number],
            { kind: 'text', text: planningText } as ChatMessage['events'][number],
            {
              kind: 'tool_use',
              id: 'tool-2',
              name: 'Read',
              input: { file_path: 'settings.png' },
            } as ChatMessage['events'][number],
            {
              kind: 'tool_result',
              toolUseId: 'tool-2',
              content: 'done',
              isError: false,
            } as ChatMessage['events'][number],
            { kind: 'text', text: finalAnswer } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
      />,
    );

    expect(screen.queryByText(planningText)).toBeNull();
    expect(screen.getByText(finalAnswer)).toBeTruthy();

    const toggles = screen.getAllByRole('button', { name: 'Thinking' });
    fireEvent.click(toggles.at(-1)!);
    expect(screen.getByText(planningText)).toBeTruthy();
  });
});

describe('AssistantMessage question forms', () => {
  it('renders only the first question form for a repeated form id in one assistant turn', () => {
    const firstForm = [
      '<question-form id="discovery" title="Quick brief — tailored">',
      JSON.stringify({
        questions: [
          {
            id: 'audience',
            label: 'Who is this for?',
            type: 'text',
          },
        ],
      }),
      '</question-form>',
    ].join('\n');
    const duplicateForm = [
      '<question-form id="discovery" title="Quick brief — 30 seconds">',
      JSON.stringify({
        questions: [
          {
            id: 'output',
            label: 'What are we making?',
            type: 'radio',
            required: true,
            options: ['Slide deck / pitch', 'Dashboard / tool UI'],
          },
        ],
      }),
      '</question-form>',
    ].join('\n');

    // A historical (non-last) assistant turn renders its question forms
    // inline in the scrollback. The live, still-unanswered form on the most
    // recent turn lives in the right-hand Questions tab (chat shows only a
    // focus banner), so the dedup behavior is asserted on a historical turn
    // where the form markup is rendered in place.
    render(
      <AssistantMessage
        message={baseMessage({
          events: [
            {
              kind: 'text',
              text: `${firstForm}\n\nFirst answer the tailored brief:\n\n${duplicateForm}`,
            } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Quick brief — tailored')).toBeTruthy();
    expect(screen.getByText('Who is this for?')).toBeTruthy();
    expect(screen.queryByText('Quick brief — 30 seconds')).toBeNull();
    expect(screen.queryByText('What are we making?')).toBeNull();
  });
});

describe('AssistantMessage recovered produced files', () => {
  it('shows files modified during a sparse completed assistant turn', () => {
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          content: '',
          events: [
            { kind: 'status', label: 'starting', detail: 'Claude' } as ChatMessage['events'][number],
            { kind: 'status', label: 'initializing', detail: 'claude-opus' } as ChatMessage['events'][number],
          ],
          producedFiles: [],
        })}
        streaming={false}
        projectId="proj-1"
        projectFiles={[
          {
            name: 'iphone-device-reveal.mp4',
            path: 'iphone-device-reveal.mp4',
            size: 2328155,
            mtime: 1700000004,
            kind: 'video',
            mime: 'video/mp4',
          } as ProjectFile,
        ]}
      />,
    );

    expect(screen.getByText('iphone-device-reveal.mp4')).toBeTruthy();
    expect(screen.getByTestId('file-ops-summary')).toBeTruthy();
    expect(container.querySelector('.chat-surface.produced-files')).toBeNull();
  });

  it('does not infer user sketches as turn output files', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          content: '',
          events: [
            { kind: 'status', label: 'starting', detail: 'Claude' } as ChatMessage['events'][number],
            { kind: 'status', label: 'initializing', detail: 'claude-opus' } as ChatMessage['events'][number],
          ],
          producedFiles: [],
        })}
        streaming={false}
        projectId="proj-1"
        projectFiles={[
          {
            name: 'board.sketch.json',
            path: 'board.sketch.json',
            size: 2048,
            mtime: 1700000004,
            kind: 'sketch',
            mime: 'application/json',
          } as ProjectFile,
        ]}
      />,
    );

    expect(screen.queryByText('board.sketch.json')).toBeNull();
  });

  it('still infers generated svg files classified as sketches', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          content: '',
          events: [
            { kind: 'status', label: 'starting', detail: 'Claude' } as ChatMessage['events'][number],
            { kind: 'status', label: 'initializing', detail: 'claude-opus' } as ChatMessage['events'][number],
          ],
          producedFiles: [],
        })}
        streaming={false}
        projectId="proj-1"
        projectFiles={[
          {
            name: 'diagram.svg',
            path: 'diagram.svg',
            size: 2048,
            mtime: 1700000004,
            kind: 'sketch',
            mime: 'image/svg+xml',
          } as ProjectFile,
          {
            name: 'board.sketch.json',
            path: 'board.sketch.json',
            size: 2048,
            mtime: 1700000004,
            kind: 'sketch',
            mime: 'application/json',
          } as ProjectFile,
        ]}
      />,
    );

    expect(screen.getByText('diagram.svg')).toBeTruthy();
    expect(screen.queryByText('board.sketch.json')).toBeNull();
  });

  it('keeps explicitly recorded sketch outputs visible', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          producedFiles: [
            {
              name: 'agent-sketch.sketch.json',
              path: 'agent-sketch.sketch.json',
              size: 2048,
              mtime: 1700000004,
              kind: 'sketch',
              mime: 'application/json',
            } as ProjectFile,
          ],
        })}
        streaming={false}
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('agent-sketch.sketch.json')).toBeTruthy();
  });

  it('opens generated files from the file name while keeping download as the explicit action', () => {
    const onRequestOpenFile = vi.fn();
    const { container } = render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('index.html')] })}
        streaming={false}
        projectId="proj-1"
        onRequestOpenFile={onRequestOpenFile}
      />,
    );

    const nameButton = screen.getByTestId('file-ops-row-path-index.html');
    expect(nameButton).toBeTruthy();
    expect(nameButton?.textContent).toBe('index.html');
    expect(container.querySelector('.file-ops-row-action .ghost')).toBeNull();
    expect(screen.getByLabelText('Download index.html')).toBeTruthy();

    fireEvent.click(nameButton!);
    expect(onRequestOpenFile).toHaveBeenCalledWith('index.html');
  });

  it('renders the file activity summary after assistant content, not pinned above the turn', () => {
    const finalText = 'Done. Reload the preview and keep going.';
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          content: '',
          events: [
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Write',
              input: { file_path: '/repo/settings.html', content: '<html></html>' },
            } as ChatMessage['events'][number],
            {
              kind: 'tool_result',
              toolUseId: 'tool-1',
              content: 'ok',
              isError: false,
            } as ChatMessage['events'][number],
            { kind: 'text', text: finalText } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        projectFileNames={new Set(['settings.html'])}
      />,
    );

    const flow = container.querySelector('.assistant-flow');
    const prose = container.querySelector('.prose-block');
    const summary = screen.getByTestId('file-ops-summary');
    expect(flow).toBeTruthy();
    expect(prose).toBeTruthy();
    const children = Array.from(flow!.children);
    expect(children.indexOf(summary)).toBeGreaterThan(children.indexOf(prose!));
  });

  it('does not render a second produced-files surface for files already covered by file activity', () => {
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          producedFiles: [producedFile('settings.html')],
          events: [
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Write',
              input: { file_path: '/repo/settings.html', content: '<html></html>' },
            } as ChatMessage['events'][number],
            {
              kind: 'tool_result',
              toolUseId: 'tool-1',
              content: 'ok',
              isError: false,
            } as ChatMessage['events'][number],
            { kind: 'text', text: 'Done.' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        projectFileNames={new Set(['settings.html'])}
      />,
    );

    expect(screen.getByTestId('file-ops-summary')).toBeTruthy();
    expect(container.querySelector('.produced-files')).toBeNull();
  });

  it('does not duplicate nested produced files already covered by file activity', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          producedFiles: [producedFile('plugins/foo/index.ts')],
          events: [
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Write',
              input: { file_path: '/repo/plugins/foo/index.ts', content: 'export {};' },
            } as ChatMessage['events'][number],
            {
              kind: 'tool_result',
              toolUseId: 'tool-1',
              content: 'ok',
              isError: false,
            } as ChatMessage['events'][number],
            { kind: 'text', text: 'Done.' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        projectFileNames={new Set(['index.ts'])}
      />,
    );

    expect(screen.getByTestId('file-ops-summary')).toBeTruthy();
    expect(screen.getByTestId('file-ops-row-index.ts')).toBeTruthy();
    expect(screen.queryByTestId('file-ops-row-plugins/foo/index.ts')).toBeNull();
  });

  it('folds produced files not covered by file activity into the same file report', () => {
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          producedFiles: [producedFile('artifact.html')],
          events: [
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Read',
              input: { file_path: '/repo/source.md' },
            } as ChatMessage['events'][number],
            {
              kind: 'tool_result',
              toolUseId: 'tool-1',
              content: 'ok',
              isError: false,
            } as ChatMessage['events'][number],
            { kind: 'text', text: 'Generated a separate artifact.' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        projectFileNames={new Set(['source.md', 'artifact.html'])}
      />,
    );

    expect(screen.getByTestId('file-ops-summary')).toBeTruthy();
    expect(screen.getByTestId('file-ops-row-source.md')).toBeTruthy();
    expect(screen.getByTestId('file-ops-row-artifact.html')).toBeTruthy();
    expect(container.querySelector('.produced-files')).toBeNull();
  });
});
