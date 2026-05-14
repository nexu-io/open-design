// @vitest-environment jsdom

if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  HTMLElement.prototype.scrollTo = function (
    options?: ScrollToOptions | number,
    _y?: number,
  ) {
    if (typeof options === 'object' && options !== null) {
      if (options.top !== undefined) this.scrollTop = options.top;
      if (options.left !== undefined) this.scrollLeft = options.left;
    }
  };
}

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage, ChatMessageFeedbackChange } from '../../src/types';

const originalScrollIntoView = Element.prototype.scrollIntoView;

if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = vi.fn();
}

function completedAssistant(
  input: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Done',
    createdAt: 1_700_000_000_000,
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_003_000,
    runStatus: 'succeeded',
    ...input,
  };
}

function completedArtifactAssistant(
  input: Partial<ChatMessage> = {},
): ChatMessage {
  return completedAssistant({
    producedFiles: [
      {
        name: 'index.html',
        size: 1024,
        mtime: 1_700_000_003_000,
        kind: 'html',
        mime: 'text/html',
      },
    ],
    ...input,
  });
}

function completedEditAssistant(
  input: Partial<ChatMessage> = {},
): ChatMessage {
  return completedAssistant({
    events: [
      {
        kind: 'tool_use',
        id: 'edit-1',
        name: 'Edit',
        input: { file_path: 'index.html' },
      },
      {
        kind: 'tool_result',
        toolUseId: 'edit-1',
        content: 'Done',
        isError: false,
      },
    ],
    ...input,
  });
}

function completedLiveArtifactAssistant(
  input: Partial<ChatMessage> = {},
): ChatMessage {
  return completedAssistant({
    events: [
      {
        kind: 'live_artifact',
        action: 'updated',
        projectId: 'project-1',
        artifactId: 'live-1',
        title: 'Ricky Dental Poster',
        refreshStatus: 'idle',
      },
    ],
    ...input,
  });
}

function renderChatPane({
  messages,
  streaming = false,
  onAssistantFeedback = vi.fn(),
}: {
  messages: ChatMessage[];
  streaming?: boolean;
  onAssistantFeedback?: (
    assistantMessage: ChatMessage,
    change: ChatMessageFeedbackChange,
  ) => void;
}) {
  return {
    onAssistantFeedback,
    ...render(
      <ChatPane
        messages={messages}
        streaming={streaming}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={() => {}}
        onStop={() => {}}
        conversations={[]}
        activeConversationId="conversation-1"
        onSelectConversation={() => {}}
        onDeleteConversation={() => {}}
        onAssistantFeedback={onAssistantFeedback}
      />,
    ),
  };
}

describe('chat assistant feedback', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
    vi.restoreAllMocks();
  });

  it('collects feedback only after an assistant turn produces an artifact', () => {
    renderChatPane({
      messages: [completedAssistant()],
    });

    expect(screen.queryByRole('group', { name: 'Feedback' })).toBeNull();
  });

  it('collects positive and negative feedback on completed artifact results', () => {
    const { onAssistantFeedback } = renderChatPane({
      messages: [completedArtifactAssistant()],
    });
    const feedbackGroup = screen.getByRole('group', { name: 'Feedback' });
    const footer = document.querySelector('.assistant-footer');

    expect(feedbackGroup.textContent).not.toContain('Feedback');
    expect(footer?.contains(feedbackGroup)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Helpful' }));
    expect(onAssistantFeedback).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'assistant-1' }),
      { rating: 'positive' },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Not helpful' }));
    expect(onAssistantFeedback).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'assistant-1' }),
      { rating: 'negative' },
    );
    expect(document.querySelector('.assistant-feedback-burst')).toBeTruthy();
  });

  it('shows feedback after completed artifact edits without newly produced files', () => {
    renderChatPane({
      messages: [completedEditAssistant()],
    });

    expect(screen.getByRole('group', { name: 'Feedback' })).toBeTruthy();
  });

  it('shows feedback after completed live artifact updates', () => {
    renderChatPane({
      messages: [completedLiveArtifactAssistant()],
    });

    expect(screen.getByRole('group', { name: 'Feedback' })).toBeTruthy();
  });

  it('keeps every artifact turn feedback control visible and independent', () => {
    const { onAssistantFeedback } = renderChatPane({
      messages: [
        completedArtifactAssistant({ id: 'assistant-1' }),
        {
          id: 'user-1',
          role: 'user',
          content: 'Make another version',
          createdAt: 1_700_000_004_000,
        },
        completedArtifactAssistant({ id: 'assistant-2', createdAt: 1_700_000_005_000 }),
      ],
    });

    const groups = screen.getAllByRole('group', { name: 'Feedback' });
    expect(groups).toHaveLength(2);

    fireEvent.click(within(groups[0]!).getByRole('button', { name: 'Helpful' }));
    expect(onAssistantFeedback).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'assistant-1' }),
      { rating: 'positive' },
    );

    fireEvent.click(within(groups[1]!).getByRole('button', { name: 'Not helpful' }));
    expect(onAssistantFeedback).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'assistant-2' }),
      { rating: 'negative' },
    );
  });

  it('shows the persisted feedback state without saved copy', () => {
    renderChatPane({
      messages: [
        completedArtifactAssistant({
          feedback: {
            rating: 'negative',
            createdAt: 1_700_000_004_000,
            updatedAt: 1_700_000_004_000,
          },
        }),
      ],
    });

    expect(screen.queryByText('Feedback saved')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Not helpful' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Helpful' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('clicking an already selected feedback rating clears it', () => {
    const { onAssistantFeedback } = renderChatPane({
      messages: [
        completedArtifactAssistant({
          feedback: {
            rating: 'positive',
            createdAt: 1_700_000_004_000,
            updatedAt: 1_700_000_004_000,
          },
        }),
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Helpful' }));
    expect(onAssistantFeedback).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'assistant-1' }),
      null,
    );
  });

  it('collects preset and custom reasons after a rating is selected', () => {
    const { onAssistantFeedback } = renderChatPane({
      messages: [completedArtifactAssistant()],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Helpful' }));
    expect(screen.getByText('Tell us why')).toBeTruthy();
    expect(screen.getByText('😊')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Understood my request'));
    fireEvent.click(screen.getByLabelText('Other'));
    fireEvent.change(screen.getByPlaceholderText('Add a short note...'), {
      target: { value: 'The layout is ready to present.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onAssistantFeedback).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'assistant-1' }),
      expect.objectContaining({
        rating: 'positive',
        reasonCodes: ['matched_request', 'other'],
        customReason: 'The layout is ready to present.',
        reasonsSubmittedAt: expect.any(Number),
      }),
    );
    expect(screen.queryByText('Tell us why')).toBeNull();
  });

  it('clears custom reason when Other is deselected', () => {
    const { onAssistantFeedback } = renderChatPane({
      messages: [completedArtifactAssistant()],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Helpful' }));
    fireEvent.click(screen.getByLabelText('Other'));
    fireEvent.change(screen.getByPlaceholderText('Add a short note...'), {
      target: { value: 'This note should not be submitted.' },
    });
    fireEvent.click(screen.getByLabelText('Other'));
    expect(screen.queryByPlaceholderText('Add a short note...')).toBeNull();

    fireEvent.click(screen.getByLabelText('Understood my request'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onAssistantFeedback).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'assistant-1' }),
      expect.objectContaining({
        rating: 'positive',
        reasonCodes: ['matched_request'],
        customReason: undefined,
        reasonsSubmittedAt: expect.any(Number),
      }),
    );
  });

  it('uses a sad marker for negative feedback reasons', () => {
    renderChatPane({
      messages: [completedArtifactAssistant()],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Not helpful' }));

    expect(screen.getByText('Tell us why')).toBeTruthy();
    expect(screen.getByText('😔')).toBeTruthy();
  });

  it('scrolls the feedback reasons panel into view after selecting a rating', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    renderChatPane({
      messages: [completedArtifactAssistant()],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Not helpful' }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
  });

  it('does not ask for feedback while the assistant is still running', () => {
    renderChatPane({
      streaming: true,
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '',
          createdAt: 1_700_000_000_000,
          startedAt: 1_700_000_000_000,
          runStatus: 'running',
          producedFiles: [
            {
              name: 'index.html',
              size: 1024,
              mtime: 1_700_000_003_000,
              kind: 'html',
              mime: 'text/html',
            },
          ],
        },
      ],
    });

    expect(screen.queryByRole('group', { name: 'Feedback' })).toBeNull();
  });
});
