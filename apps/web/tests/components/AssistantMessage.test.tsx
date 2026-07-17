// @vitest-environment jsdom

/**
 * Visibility-gate coverage for the assistant feedback widget. It should
 * appear after any successfully completed turn, and stay hidden for
 * streaming turns, failed runs, and empty responses.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import * as registry from '../../src/providers/registry';
import type { ChatMessage, ProjectFile } from '../../src/types';

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
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
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

  it('reaches Contribute (share to Open Design) through the More -> Share cascade', () => {
    const onShare = vi.fn();

    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('landing.html')] })}
        streaming={false}
        projectId="proj-1"
        isLast
        onFeedback={vi.fn()}
        onShareToOpenDesign={onShare}
      />,
    );

    // Contribute lives behind the next-step card's More -> Share flyout; the busy
    // guard in NextStepActions (and the menu closing on click) prevent a second
    // submit, replacing the old always-visible disabled button.
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-share'));
    fireEvent.click(screen.getByTestId('next-step-share-contribute'));

    expect(onShare).toHaveBeenCalledTimes(1);
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

  it('shows the feedback widget when the run failed', () => {
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
    // A failed turn is a settled outcome worth rating — it's exactly the case a
    // user most wants to thumbs-down, so the feedback row must be present.
    expect(screen.getByRole('group', { name: 'Feedback' })).toBeTruthy();
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
  // The previous `buildBlocks` dedupe SKIPPED the second event and the
  // badge stayed stuck on the initial default, even though the running
  // model and the conversation header were already correct. The fix
  // updates the existing block's detail to the latest value so the badge
  // tracks the most recent model the daemon reported.
  it('renders the most recent detail when multiple status events share a label', () => {
    render(
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

    // Latest detail should be rendered in the badge.
    expect(screen.getByText('claude-opus-4-7-max')).toBeTruthy();

    // The initial default must not be present — if it is, the stale-detail
    // bug is back.
    expect(screen.queryByText('swe-1-6-fast')).toBeNull();
  });

  it('still collapses repeated status events with the same label and detail into a single badge', () => {
    render(
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

    const matches = screen.queryAllByText('claude-opus-4-7-max');
    expect(matches.length).toBe(1);
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
});

describe('AssistantMessage question forms', () => {
  it('renders repeated question forms once as an interactive inline form', () => {
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
    const onSubmitQuestionForm = vi.fn();

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
        isLast
        onSubmitQuestionForm={onSubmitQuestionForm}
      />,
    );

    expect(screen.getByText('Quick brief — tailored')).toBeTruthy();
    const audienceInput = document.querySelector('.qf-input');
    if (!(audienceInput instanceof HTMLInputElement)) throw new Error('expected audience input');
    fireEvent.change(audienceInput, {
      target: { value: 'Product evaluators' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send answers' }));
    expect(onSubmitQuestionForm).toHaveBeenCalledWith(
      expect.stringContaining('- Who is this for?: Product evaluators'),
    );
    expect(screen.queryByText('Quick brief — 30 seconds')).toBeNull();
    expect(screen.queryByText('What are we making?')).toBeNull();
  });

  it('restores an inline form draft after remounting the conversation', () => {
    const form = [
      '<question-form id="draft" title="Quick brief">',
      JSON.stringify({
        questions: [{ id: 'audience', label: 'Audience', type: 'text' }],
      }),
      '</question-form>',
    ].join('\n');
    const props = {
      message: baseMessage({
        content: form,
        events: [{ kind: 'text', text: form } as ChatMessage['events'][number]],
      }),
      streaming: false,
      projectId: 'proj-1',
      conversationId: 'conv-1',
      isLast: true,
      onSubmitQuestionForm: vi.fn(),
    };
    const first = render(<AssistantMessage {...props} />);
    const draftInput = first.container.querySelector('.qf-input');
    if (!(draftInput instanceof HTMLInputElement)) throw new Error('expected draft input');
    fireEvent.change(draftInput, {
      target: { value: 'Product leaders' },
    });
    first.unmount();

    const restored = render(<AssistantMessage {...props} />);
    const restoredInput = restored.container.querySelector('.qf-input');
    if (!(restoredInput instanceof HTMLInputElement)) throw new Error('expected restored input');
    expect(restoredInput.value).toBe('Product leaders');
  });

  it('submits one answer when the send action is triggered twice', () => {
    const form = [
      '<question-form id="single-submit" title="Quick brief">',
      JSON.stringify({
        questions: [{ id: 'audience', label: 'Audience', type: 'text', required: true }],
      }),
      '</question-form>',
    ].join('\n');
    const onSubmitQuestionForm = vi.fn();
    render(
      <AssistantMessage
        message={baseMessage({
          content: form,
          events: [{ kind: 'text', text: form } as ChatMessage['events'][number]],
        })}
        streaming={false}
        projectId="proj-1"
        conversationId="conv-1"
        isLast
        onSubmitQuestionForm={onSubmitQuestionForm}
      />,
    );
    const audienceInput = document.querySelector('.qf-input');
    if (!(audienceInput instanceof HTMLInputElement)) throw new Error('expected audience input');
    fireEvent.change(audienceInput, {
      target: { value: 'Product leaders' },
    });
    const send = screen.getByRole('button', { name: 'Send answers' });
    fireEvent.click(send);
    fireEvent.click(send);

    expect(onSubmitQuestionForm).toHaveBeenCalledTimes(1);
  });

  it('re-enables an inline form when the host blocks its submit before a run starts', async () => {
    let resolveSubmit: (started: boolean) => void = () => {};
    const onSubmitQuestionForm = vi.fn(
      () => new Promise<boolean>((resolve) => {
        resolveSubmit = resolve;
      }),
    );
    const form = [
      '<question-form id="single-submit" title="Quick brief">',
      JSON.stringify({
        questions: [{ id: 'audience', label: 'Audience', type: 'text', required: true }],
      }),
      '</question-form>',
    ].join('\n');
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          content: form,
          events: [{ kind: 'text', text: form } as ChatMessage['events'][number]],
        })}
        streaming={false}
        projectId="proj-1"
        conversationId="conv-1"
        isLast
        onSubmitQuestionForm={onSubmitQuestionForm}
      />,
    );
    const audienceInput = container.querySelector('.qf-input');
    if (!(audienceInput instanceof HTMLInputElement)) throw new Error('expected audience input');
    fireEvent.change(audienceInput, {
      target: { value: 'Product leaders' },
    });
    const send = screen.getByRole('button', { name: 'Send answers' }) as HTMLButtonElement;
    fireEvent.click(send);

    await waitFor(() => {
      expect(onSubmitQuestionForm).toHaveBeenCalledTimes(1);
    });
    expect(send.disabled).toBe(true);

    await act(async () => {
      resolveSubmit(false);
    });

    await waitFor(() => {
      expect(send.disabled).toBe(false);
    });
    expect(audienceInput.value).toBe('Product leaders');
  });

  it('uploads file answers before sending their attachment context', async () => {
    vi.spyOn(registry, 'uploadProjectFiles').mockResolvedValue({
      uploaded: [
        {
          name: 'mood.png',
          path: 'uploads/mood.png',
          kind: 'image',
          size: 4,
        },
      ],
      failed: [],
    });
    const form = [
      '<question-form id="references" title="References">',
      JSON.stringify({
        questions: [
          {
            id: 'assets',
            label: 'Reference assets',
            type: 'file',
            required: true,
            accept: 'image/*',
          },
        ],
      }),
      '</question-form>',
    ].join('\n');
    const onSubmitQuestionForm = vi.fn();
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          content: form,
          events: [{ kind: 'text', text: form } as ChatMessage['events'][number]],
        })}
        streaming={false}
        projectId="proj-1"
        conversationId="conv-1"
        isLast
        onSubmitQuestionForm={onSubmitQuestionForm}
      />,
    );
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('expected file input');
    const file = new File(['mood'], 'mood.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Send answers' }));

    await waitFor(() => {
      expect(onSubmitQuestionForm).toHaveBeenCalledWith(
        expect.stringContaining('Uploaded file 1: mood.png -> uploads/mood.png (for: Reference assets)'),
        [expect.objectContaining({ name: 'mood.png', path: 'uploads/mood.png', order: 0 })],
        {
          workspaceItems: [
            {
              id: 'file:uploads/mood.png',
              kind: 'file',
              label: 'mood.png',
              path: 'uploads/mood.png',
            },
          ],
        },
      );
    });
  });

  it('rolls back successful inline uploads when the host rejects a send before it starts', async () => {
    const uploadProjectFilesMock = vi
      .spyOn(registry, 'uploadProjectFiles')
      .mockResolvedValue({
        uploaded: [
          {
            name: 'mood.png',
            path: 'uploads/mood.png',
            kind: 'image' as const,
            size: 4,
          },
        ],
        failed: [],
      });
    const deleteProjectFileMock = vi.spyOn(registry, 'deleteProjectFile').mockResolvedValue(true);
    const form = [
      '<question-form id="references" title="References">',
      JSON.stringify({
        questions: [
          {
            id: 'assets',
            label: 'Reference assets',
            type: 'file',
            required: true,
            accept: 'image/*',
          },
        ],
      }),
      '</question-form>',
    ].join('\n');
    const onSubmitQuestionForm = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          content: form,
          events: [{ kind: 'text', text: form } as ChatMessage['events'][number]],
        })}
        streaming={false}
        projectId="proj-1"
        conversationId="conv-1"
        isLast
        onSubmitQuestionForm={onSubmitQuestionForm}
      />,
    );
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('expected file input');
    const file = new File(['mood'], 'mood.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    const send = screen.getByRole('button', { name: 'Send answers' }) as HTMLButtonElement;
    fireEvent.click(send);

    await waitFor(() => {
      expect(onSubmitQuestionForm).toHaveBeenCalledTimes(1);
      expect(deleteProjectFileMock).toHaveBeenCalledWith('proj-1', 'uploads/mood.png');
    });
    expect(send.disabled).toBe(false);

    fireEvent.click(send);

    await waitFor(() => {
      expect(uploadProjectFilesMock).toHaveBeenCalledTimes(2);
      expect(onSubmitQuestionForm).toHaveBeenCalledTimes(2);
    });
    expect(deleteProjectFileMock).toHaveBeenCalledTimes(1);
  });

  it('cleans up partial file uploads before retrying an inline answer', async () => {
    const uploadProjectFilesMock = vi
      .spyOn(registry, 'uploadProjectFiles')
      .mockResolvedValueOnce({
        uploaded: [
          {
            name: 'mood.png',
            path: 'uploads/mood.png',
            kind: 'image' as const,
            size: 4,
          },
        ],
        failed: [{ name: 'brief.png', error: 'storage unavailable' }],
        error: 'storage unavailable',
      })
      .mockResolvedValueOnce({
        uploaded: [
          {
            name: 'mood.png',
            path: 'uploads/mood.png',
            kind: 'image' as const,
            size: 4,
          },
          {
            name: 'brief.png',
            path: 'uploads/brief.png',
            kind: 'image' as const,
            size: 5,
          },
        ],
        failed: [],
      });
    const deleteProjectFileMock = vi.spyOn(registry, 'deleteProjectFile').mockResolvedValue(true);
    const form = [
      '<question-form id="references" title="References">',
      JSON.stringify({
        questions: [
          {
            id: 'assets',
            label: 'Reference assets',
            type: 'file',
            required: true,
            accept: 'image/*',
            multiple: true,
          },
        ],
      }),
      '</question-form>',
    ].join('\n');
    const onSubmitQuestionForm = vi.fn();
    const { container } = render(
      <AssistantMessage
        message={baseMessage({
          content: form,
          events: [{ kind: 'text', text: form } as ChatMessage['events'][number]],
        })}
        streaming={false}
        projectId="proj-1"
        conversationId="conv-1"
        isLast
        onSubmitQuestionForm={onSubmitQuestionForm}
      />,
    );
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('expected file input');
    const mood = new File(['mood'], 'mood.png', { type: 'image/png' });
    const brief = new File(['brief'], 'brief.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [mood, brief] } });

    const send = screen.getByRole('button', { name: 'Send answers' });
    fireEvent.click(send);

    await waitFor(() => {
      expect(deleteProjectFileMock).toHaveBeenCalledWith('proj-1', 'uploads/mood.png');
    });
    expect(onSubmitQuestionForm).not.toHaveBeenCalled();

    fireEvent.click(send);

    await waitFor(() => {
      expect(uploadProjectFilesMock).toHaveBeenCalledTimes(2);
      expect(onSubmitQuestionForm).toHaveBeenCalledWith(
        expect.any(String),
        [
          expect.objectContaining({ path: 'uploads/mood.png' }),
          expect.objectContaining({ path: 'uploads/brief.png' }),
        ],
        expect.any(Object),
      );
    });
    expect(deleteProjectFileMock).toHaveBeenCalledTimes(1);
  });

  it('collapses answered questions into a readable inline summary', () => {
    const form = [
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

    render(
      <AssistantMessage
        message={baseMessage({
          events: [
            {
              kind: 'text',
              text: form,
            } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        nextUserContent={'[form answers for discovery]\n- Who is this for?: Product evaluators'}
      />,
    );

    expect(screen.getByTestId('question-form-summary')).toBeTruthy();
    expect(screen.getByText('Questions answered')).toBeTruthy();
    expect(screen.getByText('Who is this for?')).toBeTruthy();
    expect(screen.getByText('Product evaluators')).toBeTruthy();
    expect(screen.queryByText('Quick brief — tailored')).toBeNull();
  });

  it('keeps file names in the answered summary when an upload appendix repeats a question label', () => {
    const form = [
      '<question-form id="references" title="References">',
      JSON.stringify({
        questions: [
          {
            id: 'assets',
            label: 'Reference assets',
            type: 'file',
          },
        ],
      }),
      '</question-form>',
    ].join('\n');

    render(
      <AssistantMessage
        message={baseMessage({
          content: form,
          events: [{ kind: 'text', text: form } as ChatMessage['events'][number]],
        })}
        streaming={false}
        projectId="proj-1"
        nextUserContent={[
          '[form answers for references]',
          '- Reference assets: mood.png',
          '',
          '[uploaded design files]',
          '- Reference assets: mood.png -> uploads/mood.png',
        ].join('\n')}
      />,
    );

    expect(screen.getByTestId('question-form-summary')).toBeTruthy();
    expect(screen.getByText('mood.png')).toBeTruthy();
  });

  it('keeps selected visual style previews in the answered summary', () => {
    const form = [
      '<question-form id="discovery" title="Quick brief">',
      JSON.stringify({
        questions: [
          {
            id: 'tone',
            label: 'Visual tone',
            type: 'checkbox',
            options: ['Editorial / magazine', 'Modern minimal'],
          },
        ],
      }),
      '</question-form>',
    ].join('\n');

    render(
      <AssistantMessage
        message={baseMessage({
          content: form,
          events: [{ kind: 'text', text: form } as ChatMessage['events'][number]],
        })}
        streaming={false}
        projectId="proj-1"
        projectKind="slide_deck"
        nextUserContent={'[form answers for discovery]\n- Visual tone: Editorial / magazine'}
      />,
    );

    expect(screen.getByText('Visual tone')).toBeTruthy();
    expect(screen.getByText('Editorial narrative')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Visual tone: Editorial narrative' })).toHaveAttribute(
      'src',
      'https://repo-assets.open-design.ai/style-catalog/v1/deck-editorial-narrative-v1.webp',
    );
  });

  it('normalizes every selected legacy visual style to its preview card', () => {
    const form = [
      '<question-form id="discovery" title="Quick brief">',
      JSON.stringify({
        questions: [
          {
            id: 'tone',
            label: 'Visual tone',
            type: 'checkbox',
            options: ['Editorial / magazine', 'Luxury / refined'],
          },
        ],
      }),
      '</question-form>',
    ].join('\n');

    render(
      <AssistantMessage
        message={baseMessage({
          content: form,
          events: [{ kind: 'text', text: form } as ChatMessage['events'][number]],
        })}
        streaming={false}
        projectId="proj-1"
        projectKind="slide_deck"
        nextUserContent={[
          '[form answers for discovery]',
          '- Visual tone: Editorial / magazine, Luxury / refined',
        ].join('\n')}
      />,
    );

    expect(screen.getByRole('img', { name: 'Visual tone: Editorial narrative' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Visual tone: Premium pitch' })).toHaveAttribute(
      'src',
      'https://repo-assets.open-design.ai/style-catalog/v1/deck-premium-pitch-v1.webp',
    );
  });

  it('keeps a custom visual style selection alongside preview cards', () => {
    const form = [
      '<question-form id="discovery" title="Quick brief">',
      JSON.stringify({
        questions: [
          {
            id: 'tone',
            label: 'Visual tone',
            type: 'checkbox',
            options: ['Editorial / magazine'],
          },
        ],
      }),
      '</question-form>',
    ].join('\n');

    render(
      <AssistantMessage
        message={baseMessage({
          content: form,
          events: [{ kind: 'text', text: form } as ChatMessage['events'][number]],
        })}
        streaming={false}
        projectId="proj-1"
        projectKind="slide_deck"
        nextUserContent={[
          '[form answers for discovery]',
          '- Visual tone: Editorial / magazine, Warm Japanese editorial',
        ].join('\n')}
      />,
    );

    expect(screen.getByRole('img', { name: 'Visual tone: Editorial narrative' })).toBeTruthy();
    expect(screen.getByText('Warm Japanese editorial')).toBeTruthy();
  });

  it('does not recommend next steps on the same turn as an inline question form', () => {
    const form = [
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
    const questionMessage = baseMessage({
      content: form,
      events: [{ kind: 'text', text: form } as ChatMessage['events'][number]],
    });
    const onNextStepPromptAction = vi.fn();
    const { rerender } = render(
      <AssistantMessage
        message={questionMessage}
        streaming={false}
        projectId="proj-1"
        isLast
        onNextStepPromptAction={onNextStepPromptAction}
      />,
    );

    expect(screen.queryByTestId('next-step-actions')).toBeNull();

    rerender(
      <AssistantMessage
        message={questionMessage}
        streaming={false}
        projectId="proj-1"
        isLast
        nextUserContent={'[form answers for discovery]\n- Who is this for?: Product evaluators'}
        onNextStepPromptAction={onNextStepPromptAction}
      />,
    );
    expect(screen.getByTestId('question-form-summary')).toBeTruthy();
    expect(screen.getByTestId('next-step-actions')).toBeTruthy();

    rerender(
      <AssistantMessage
        message={baseMessage()}
        streaming={false}
        projectId="proj-1"
        isLast
        onNextStepPromptAction={onNextStepPromptAction}
      />,
    );
    expect(screen.getByTestId('next-step-actions')).toBeTruthy();
  });

  it('shows an inline loading frame while a form is streaming', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          events: [
            {
              kind: 'text',
              text: 'One quick check:\n<question-form id="discovery" title="Quick brief">\n{"questions":[',
            } as ChatMessage['events'][number],
          ],
        })}
        streaming
        projectId="proj-1"
        isLast
      />,
    );

    expect(screen.getByTestId('question-form-loading')).toBeTruthy();
    expect(screen.getByText('One quick check:')).toBeTruthy();
  });
});

describe('AssistantMessage recovered produced files', () => {
  it('shows linked project files from the assistant summary as files this turn', () => {
    const content = '已创建计划文档：[browser-war-deck-outline.md](browser-war-deck-outline.md)。';
    render(
      <AssistantMessage
        message={baseMessage({
          content,
          events: [{ kind: 'text', text: content } as ChatMessage['events'][number]],
          producedFiles: [],
        })}
        streaming={false}
        projectId="proj-1"
        projectFiles={[
          {
            name: 'browser-war-deck-outline.md',
            path: 'browser-war-deck-outline.md',
            size: 4096,
            mtime: 1700000005,
            kind: 'text',
            mime: 'text/markdown',
          } as ProjectFile,
        ]}
      />,
    );

    expect(screen.getByTestId('file-ops-summary')).toBeTruthy();
    expect(screen.getByTestId('file-ops-row-browser-war-deck-outline.md')).toBeTruthy();
    expect(screen.getByText(/Write 1/)).toBeTruthy();
  });

  it('shows project files mentioned as plain filenames in the assistant summary', () => {
    const content = '文件列表：\n- browser-war-deck-outline.md';
    render(
      <AssistantMessage
        message={baseMessage({
          content,
          events: [{ kind: 'text', text: content } as ChatMessage['events'][number]],
          producedFiles: [],
        })}
        streaming={false}
        projectId="proj-1"
        projectFiles={[
          {
            name: 'browser-war-deck-outline.md',
            path: 'browser-war-deck-outline.md',
            size: 4096,
            mtime: 1700000004,
            kind: 'text',
            mime: 'text/markdown',
          } as ProjectFile,
        ]}
      />,
    );

    expect(screen.getByTestId('file-ops-summary')).toBeTruthy();
    expect(screen.getByTestId('file-ops-row-browser-war-deck-outline.md')).toBeTruthy();
  });

  it('does not recover old reference files as produced files', () => {
    const content = '参考 `README.md` 的内容。';
    render(
      <AssistantMessage
        message={baseMessage({
          content,
          events: [{ kind: 'text', text: content } as ChatMessage['events'][number]],
          producedFiles: [],
        })}
        streaming={false}
        projectId="proj-1"
        projectFiles={[
          {
            name: 'README.md',
            path: 'README.md',
            size: 2048,
            mtime: 1699990000,
            kind: 'text',
            mime: 'text/markdown',
          } as ProjectFile,
        ]}
      />,
    );

    expect(screen.queryByTestId('file-ops-summary')).toBeNull();
  });

  it('shows files modified during a sparse completed assistant turn', () => {
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
});
