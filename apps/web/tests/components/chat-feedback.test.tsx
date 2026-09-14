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
  hasActiveDesignSystem = false,
  onForkFromMessage,
  viewerOnly = false,
}: {
  messages: ChatMessage[];
  streaming?: boolean;
  onAssistantFeedback?: (
    assistantMessage: ChatMessage,
    change: ChatMessageFeedbackChange,
  ) => void;
  hasActiveDesignSystem?: boolean;
  onForkFromMessage?: (message: ChatMessage) => void;
  viewerOnly?: boolean;
}) {
  return {
    onAssistantFeedback,
    ...render(
      <ChatPane
        projectKindForTracking="prototype"
        messages={messages}
        streaming={streaming}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        hasActiveDesignSystem={hasActiveDesignSystem}
        onEnsureProject={async () => 'project-1'}
        onSend={() => {}}
        onStop={() => {}}
        conversations={[]}
        activeConversationId="conversation-1"
        onSelectConversation={() => {}}
        onDeleteConversation={() => {}}
        onAssistantFeedback={onAssistantFeedback}
        onForkFromMessage={onForkFromMessage}
        viewerOnly={viewerOnly}
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

  it('collects feedback after any successfully completed assistant turn', () => {
    renderChatPane({
      messages: [completedAssistant()],
    });

    expect(screen.getByRole('group', { name: 'Feedback' })).toBeTruthy();
  });

  it('hides conversation fork actions from read-only project viewers', () => {
    renderChatPane({
      messages: [completedAssistant()],
      onForkFromMessage: vi.fn(),
      viewerOnly: true,
    });

    expect(screen.queryByRole('button', { name: 'New conversation' })).toBeNull();
  });

  it('collects positive and negative feedback on completed artifact results', () => {
    const { onAssistantFeedback } = renderChatPane({
      messages: [completedArtifactAssistant()],
    });
    const feedbackGroup = screen.getByRole('group', { name: 'Feedback' });
    const footer = screen.getByTestId('assistant-footer');

    expect(feedbackGroup.textContent).not.toContain('Feedback');
    expect(footer.contains(feedbackGroup)).toBe(true);

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
    expect(screen.getByTestId('assistant-feedback-burst')).toBeTruthy();
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

  /* OPEND-2542: both rows keep their controls; CSS keeps only the final row visible. */
  it('keeps feedback controls on historical and final turns, targeting each turn', () => {
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
    expect(groups[0]!.closest('.assistant-footer')?.getAttribute('data-last')).toBe('false');
    expect(groups[1]!.closest('.assistant-footer')?.getAttribute('data-last')).toBe('true');

    fireEvent.click(within(groups[0]!).getByRole('button', { name: 'Not helpful' }));
    expect(onAssistantFeedback).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'assistant-1' }),
      { rating: 'negative' },
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
    expect(screen.queryByText('😊')).toBeNull();
    expect(screen.queryByText(/Discord/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Understood my request' }));
    fireEvent.click(screen.getByRole('button', { name: 'Other' }));
    fireEvent.change(screen.getByPlaceholderText('Add something (optional)'), {
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

  it('adds design-system feedback reasons only when a design system is active', () => {
    const { unmount } = renderChatPane({
      messages: [completedArtifactAssistant()],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Helpful' }));
    expect(screen.queryByRole('button', { name: 'Followed the design system' })).toBeNull();
    unmount();

    const { onAssistantFeedback } = renderChatPane({
      messages: [completedArtifactAssistant()],
      hasActiveDesignSystem: true,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Helpful' }));
    fireEvent.click(screen.getByRole('button', { name: 'Followed the design system' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onAssistantFeedback).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'assistant-1' }),
      expect.objectContaining({
        rating: 'positive',
        reasonCodes: ['followed_design_system'],
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Not helpful' }));
    expect(screen.queryByRole('button', { name: 'Did not follow the design system' })).toBeNull();
  });

  /*
   * 交付稿第 40 格里补充框是**常驻**的,不再挂在「其他」这颗胶囊上。
   * 所以这条规格从「取消勾选就清空」改成:框一直在、人写的话一直留着、提交时一定带走。
   * 原来那套的代价是人把话打完了,顺手取消一颗胶囊就被悄悄丢掉。
   */
  it('keeps the note when Other is deselected, and still submits it', () => {
    const { onAssistantFeedback } = renderChatPane({
      messages: [completedArtifactAssistant()],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Helpful' }));
    fireEvent.change(screen.getByPlaceholderText('Add something (optional)'), {
      target: { value: 'This note must survive.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Other' }));
    fireEvent.click(screen.getByRole('button', { name: 'Other' }));
    expect(
      (screen.getByPlaceholderText('Add something (optional)') as HTMLTextAreaElement).value,
    ).toBe('This note must survive.');

    fireEvent.click(screen.getByRole('button', { name: 'Understood my request' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onAssistantFeedback).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'assistant-1' }),
      expect.objectContaining({
        rating: 'positive',
        reasonCodes: ['matched_request'],
        customReason: 'This note must survive.',
        reasonsSubmittedAt: expect.any(Number),
      }),
    );
  });

  it('uses the design title without adding a marker or community row', () => {
    renderChatPane({
      messages: [completedArtifactAssistant()],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Not helpful' }));

    // 点踩这一路用交付稿第 40 格的问句,点赞仍是中性的「Tell us why」
    expect(screen.getByText('What went wrong?')).toBeTruthy();
    expect(screen.queryByText('Tell us why')).toBeNull();
    expect(screen.queryByText('😔')).toBeNull();
    expect(screen.queryByText(/Discord/i)).toBeNull();
    expect(
      screen.getAllByRole('button').filter((button) =>
        ['Did not follow my request', 'Visual inconsistency', 'Could not run', 'Too slow']
          .includes(button.textContent ?? ''),
      ).map((button) => button.textContent),
    ).toEqual([
      'Did not follow my request',
      'Visual inconsistency',
      'Could not run',
      'Too slow',
    ]);
    expect(screen.queryByRole('button', { name: 'Other' })).toBeNull();
  });

  /**
   * Rating a reply must not move the view when the panel is already on screen.
   *
   * `block: 'start'` pulls the panel to the top of the scroller whether or not
   * it needed pulling, which reads as the page jumping away from what the user
   * was looking at; `smooth` then animates that jump, and the animation's own
   * frames look exactly like a user scroll to whoever is watching scroll
   * position. `nearest` scrolls the minimum required — nothing at all when the
   * panel is already visible, which is the common case.
   */
  it('brings the feedback reasons panel into view without yanking the log', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    renderChatPane({
      messages: [completedArtifactAssistant()],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Not helpful' }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' });
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

  it('collects feedback on a failed assistant turn', () => {
    renderChatPane({
      messages: [
        completedAssistant({
          content: '',
          runStatus: 'failed',
          events: [{ kind: 'status', label: 'error', detail: 'boom-401' }],
        }),
      ],
    });

    expect(screen.getByRole('group', { name: 'Feedback' })).toBeTruthy();
  });

  /**
   * 手动停止的那一轮**不收赞踩** —— 这条 2026-08-27 被设计稿推翻过一次。
   *
   * 原来断言的是「取消的轮次照样收反馈」。设计稿 15-6(组件 #39,「仅一种状态」)
   * 那一格里,停住的轮次只有复制和 Fork 两个按钮,没有赞踩:用户自己把它掐了,
   * 没有产出可评价。**跑失败的轮次仍然给赞踩** —— 那是一个结果,而且恰恰是
   * 大家最想踩的那种,判据落在 `userStoppedTheTurn` 上,不是「非成功即无反馈」。
   *
   * 连带影响:分析侧从此拿不到「被手动停止的轮次」这一档样本。设计稿是明确的,
   * 所以先按稿子走;真要保留这档样本,`userStoppedTheTurn` 是唯一那一行。
   */
  it('does not collect feedback on a manually stopped turn', () => {
    renderChatPane({
      messages: [
        completedAssistant({
          content: 'Partial answer',
          runStatus: 'canceled',
        }),
      ],
    });

    expect(screen.queryByRole('group', { name: 'Feedback' })).toBeNull();
  });

  it('still collects feedback on a failed turn — a failure is a result', () => {
    renderChatPane({
      messages: [
        completedAssistant({
          content: 'Partial answer',
          runStatus: 'failed',
        }),
      ],
    });

    expect(screen.getByRole('group', { name: 'Feedback' })).toBeTruthy();
  });

  it('does not ask for feedback on a queued turn that has not started', () => {
    renderChatPane({
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '',
          createdAt: 1_700_000_000_000,
          runStatus: 'queued',
        },
      ],
    });

    expect(screen.queryByRole('group', { name: 'Feedback' })).toBeNull();
  });
});
