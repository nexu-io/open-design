// @vitest-environment jsdom

/**
 * Visibility-gate coverage for the assistant feedback widget. It should
 * appear after any successfully completed turn, and stay hidden for
 * streaming turns, failed runs, and empty responses.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import { CollabProvider } from '../../src/collab/collab-context';
import * as registry from '../../src/providers/registry';
import type { ChatMessage, ProjectFile } from '../../src/types';
import { workspaceContextFixture } from '../helpers/workspace-context';

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

/**
 * 一枚 `<od-focus show="…">` 事件。
 *
 * 产物卡改成 agent **声明**出来的之后,不带声明的回合一张卡都没有。下面凡是
 * 讲「这一轮算不算产出了这个文件」的用例,夹具都得先把声明发出来 —— 包括
 * 反面用例:声明照发、卡仍然不出,才说明拦住它的是归属判断而不是缺一枚声明。
 */
function declareTurnCards(...names: string[]): ChatMessage['events'][number] {
  return { kind: 'artifact_focus', show: names } as ChatMessage['events'][number];
}

function baseMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const message = {
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
  // 产出清单非空的夹具自动带上声明:那些用例讲的是卡片长相和动作,不是声明协议。
  const produced = message.producedFiles ?? [];
  if (produced.length > 0) {
    message.events = [
      ...(message.events ?? []),
      declareTurnCards(...produced.map((file) => file.name)),
    ] as ChatMessage['events'];
  }
  return message;
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

const PROJECT_A_CONTEXT = workspaceContextFixture({
  workspaceId: 'workspace-a',
  workspaceMemberId: 'member-a',
});

function projectCollabValue(workspaceContext = PROJECT_A_CONTEXT) {
  return {
    workspaceContext,
    workspaceContextLoading: false,
    enabled: false,
    member: null,
    present: [],
    publishedVersion: null,
    syncState: null,
    viewerOnly: false,
    isOwner: false,
    ownerDisplayName: null,
    ownerRole: null,
    downloadPending: false,
    reportChange: vi.fn(),
    requestPublish: vi.fn(),
    refreshPresence: vi.fn(),
    checkStatusNow: vi.fn(),
  };
}

describe('internal control markers', () => {
  // Acceptance: a resumed CLI repeated the daemon's internal title directive on
  // a later turn, and `<od-title>LV奢侈品电商原型</od-title>` rendered as body text.
  it('never renders a leaked title marker as prose', () => {
    const content = [
      '我会使用 Open Design 技能把已确认的电商流程整理为可执行的原型计划。',
      '<od-title>LV奢侈品电商原型</od-title>',
      '目标已锁定为响应式 LV 奢侈品电商概念原型。',
    ].join('\n\n');

    render(
      <AssistantMessage
        message={baseMessage({
          content,
          events: [{ kind: 'text', text: content } as ChatMessage['events'][number]],
        })}
        streaming={false}
        projectId="proj-1"
      />,
    );

    expect(document.body.textContent).not.toContain('od-title');
    expect(document.body.textContent).toContain('目标已锁定为响应式');
  });

  it('never renders OD Next machine protocol blocks as prose', () => {
    const content = [
      'Plan is frozen.',
      '<open-design-plan-contract>{"schema":"open-design.plan-contract/v2"}</open-design-plan-contract>',
      '<open-design-runtime-state>{"schema":"open-design.strategy-state/v2"}</open-design-runtime-state>',
    ].join('\n\n');

    render(
      <AssistantMessage
        message={baseMessage({
          content,
          events: [{ kind: 'text', text: content } as ChatMessage['events'][number]],
        })}
        streaming={false}
        projectId="proj-1"
      />,
    );

    expect(document.body.textContent).not.toContain('open-design-plan-contract');
    expect(document.body.textContent).not.toContain('open-design-runtime-state');
    expect(document.body.textContent).toContain('Plan is frozen.');
  });
});

describe('AssistantMessage feedback gate', () => {
  // Component 14 / D28: an image, video or HTML artifact is delivered as a
  // card whose picture IS the open target — the card writes no filename, so
  // the click lands on the artwork rather than on a text row.
  it('opens a produced artifact when the user clicks its card', () => {
    const onRequestOpenFile = vi.fn();
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('poster.png')] })}
        streaming={false}
        projectId="proj-1"
        onRequestOpenFile={onRequestOpenFile}
      />,
    );

    expect(screen.queryByText('poster.png')).toBeNull();
    fireEvent.click(screen.getByTestId('artifact-card-open-poster.png'));
    /*
     * **只传文件名,没有第二个实参。**
     *
     * 这里原来钉的是 `('poster.png', undefined)`,并在注释里解释第二个实参是
     * 产物的快照身份(设计 §4.2:图片卡点击开当轮那一张)。用户 2026-09-02
     * 裁决**缩略图是快照、点开永远是最新**,那条路整条撤掉了,连字段一起 ——
     * 所以现在不是「传了 undefined」,是**根本没有第二个实参**。
     *
     * `toHaveBeenCalledWith` 对多余实参是敏感的:真要有人把快照身份接回来,
     * 这条当场红。这正是它该做的事 —— 那个行为已经被否掉了。
     */
    expect(onRequestOpenFile).toHaveBeenCalledWith('poster.png');
  });

  it('does not turn the whole assistant reply into a persistent focus target', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('poster.png')] })}
        streaming={false}
        projectId="proj-1"
        onRequestOpenFile={vi.fn()}
      />,
    );

    const reply = document.querySelector('[data-assistant-message-id]');
    expect(reply?.hasAttribute('tabindex')).toBe(false);
    expect(screen.getByRole('button', { name: 'Open: poster.png' })).toBeTruthy();
  });

  it('keeps the artifact card openable from the keyboard', () => {
    const onRequestOpenFile = vi.fn();
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('poster.png')] })}
        streaming={false}
        projectId="proj-1"
        onRequestOpenFile={onRequestOpenFile}
      />,
    );

    // A real <button>, not a div with role="button": Enter and Space activate
    // it natively, so the component owns no hand-rolled key handling.
    const open = screen.getByRole('button', { name: 'Open: poster.png' });
    expect(open.tagName).toBe('BUTTON');
    fireEvent.click(open);
    // 同上:点击只带文件名,快照身份那条路已撤(用户裁决 2026-09-02)
    expect(onRequestOpenFile).toHaveBeenCalledWith('poster.png');
  });

  it('renders plugin suggestions as compact user decisions with secondary actions in details', () => {
    const message = baseMessage({
      content: '',
      events: [
        {
          kind: 'plugin_candidate',
          candidateId: 'candidate-1',
          title: 'Design review helper',
          description: 'Turn this repository workflow into a reusable helper.',
        } as ChatMessage['events'][number],
      ],
    });

    const { container } = render(
      <AssistantMessage
        message={message}
        streaming={false}
        projectId="proj-1"
      />,
    );

    expect(container.querySelector('[data-user-action-card="plugin-suggestion"]')).toBeTruthy();
    const contribute = screen.getByRole('button', { name: 'Contribute to open-design' });
    expect(contribute).toBeTruthy();
    expect(contribute.classList.contains('plugin-action-button--primary')).toBe(false);
    const toggle = screen.getByRole('button', { name: 'View details' });
    const disclosure = container.querySelector('[data-user-action-card="plugin-suggestion"] .accordion-collapsible');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(disclosure?.classList.contains('open')).toBe(false);

    fireEvent.click(toggle);
    expect(disclosure?.classList.contains('open')).toBe(true);
    expect(screen.getByRole('button', { name: 'Create plugin/template' })).toBeTruthy();
  });

  it('omits the repeated identity header for a consecutive assistant reply', () => {
    const { container } = render(
      <AssistantMessage
        message={baseMessage()}
        streaming={false}
        projectId="proj-1"
        showRole={false}
      />,
    );

    expect(container.querySelector('[data-continuation="true"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="assistant-role"]')).toBeNull();
    expect(container.textContent).toContain('Done.');
  });

  it('shows the agent name again when it is not a continuation', () => {
    // 反面这一条是为了让上面那条**可证伪**:只断言「接续时为 true」的话,
    // 把这个属性写死成 true 也照样绿
    const { container } = render(
      <AssistantMessage
        message={baseMessage()}
        streaming={false}
        projectId="proj-1"
        showRole
      />,
    );

    expect(container.querySelector('[data-continuation="false"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="assistant-role"]')).toBeTruthy();
  });

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
        // 回合状态行(复制所在那一行)**只在最后一轮出**(2026-08-26 产品裁决),
        // 所以这条测试必须把这条消息摆成最后一条,否则它测的是一行不存在的 UI。
        <AssistantMessage
          message={message}
          streaming={false}
          isLast
          projectId="proj-1"
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

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

  /*
   * ⚠️ **这条规格被产品覆盖了**(2026-08-26,用户真机两次指认「运行中最下面这一行不显示」)。
   *
   * 原来的意图见下面保留的注释:让人不必等整轮跑完就能复制已出的文字。
   * 现在回合状态行整行在运行中不出,复制按钮随之也不出 —— 想恢复这条能力,
   * 得把复制挪到别处(比如壳头或悬浮),不能靠这一行。记在
   * `specs/current/chat-panel-feedback.md` 的 B50。
   */
  it('recvqacy887jsF — 运行中整行不出,所以复制也不出(产品覆盖)', () => {
    // The copy affordance is gated on "is there any non-whitespace text yet"
    // (copyMarkdown in AssistantMessage.tsx), not on the turn having ended —
    // so a user can copy what has streamed in so far instead of waiting for
    // the whole reply. The footer's own CSS backs this: `.assistant-footer`
    // is opacity:0/hover-revealed at rest, but `[data-streaming="true"]`
    // forces it to full opacity so a mid-stream reader doesn't ALSO need to
    // hover to see it.
    const message = baseMessage({
      content: 'Partial answer so far',
      runStatus: undefined,
      endedAt: undefined,
      events: [{ kind: 'text', text: 'Partial answer so far' } as ChatMessage['events'][number]],
    });
    render(
      <AssistantMessage
        message={message}
        streaming
        projectId="proj-1"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
  });

  it('recvqacy887jsF — hides the copy button while streaming has not produced any text yet', () => {
    // The inverse of the above: before the first token lands there is
    // nothing to copy, so the button correctly stays absent (not merely
    // faded out) rather than rendering with an empty payload.
    const message = baseMessage({
      content: '',
      runStatus: undefined,
      endedAt: undefined,
      events: [{ kind: 'status', label: 'thinking' } as ChatMessage['events'][number]],
    });
    render(
      <AssistantMessage
        message={message}
        streaming
        projectId="proj-1"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
  });

  it('calls the fork handler from completed assistant turns', () => {
    const onForkFromMessage = vi.fn();
    render(
      // 分叉按钮同样住在回合状态行里,只在最后一轮出(见上面同族注释)
      <AssistantMessage
        message={baseMessage()}
        streaming={false}
        isLast
        projectId="proj-1"
        onForkFromMessage={onForkFromMessage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));

    expect(onForkFromMessage).toHaveBeenCalledTimes(1);
  });

  /*
   * 「贡献到 OpenDesign 社区」原来的用例住在这里,走的是下一步引导的
   * 更多 → 分享 → 贡献 三级路径。产品裁决(2026-08-26)把 `default` 那一档
   * 整档换成 agent 现写的三条行为引导,那条路径连同它的三级菜单一起没了,
   * 这个入口因此**没有落点了**。
   *
   * 用例移到 `AssistantMessage.nextStep.test.tsx`,在那里连同「该给它找哪个
   * 新家」一起记着 —— 不在这里再写一份「断言它不可达」,那等于把回归钉死。
   */

  it('lands a fork divider carrying the inherited title plus the "context came with you" note', () => {
    // 设计稿第 38 格:Fork 不是跳走 —— 点完必须在这条回复下面**原地**留下痕迹,
    // 否则人只会以为按钮没反应。分界线中间是承接过来的会话标题,
    // 线下面那行脚注告诉人上文已经带过去了。
    render(
      <AssistantMessage
        message={baseMessage({
          forkedInto: { title: 'Storefront prototype', conversationId: 'conv-fork' },
        })}
        streaming={false}
        projectId="proj-1"
      />,
    );

    const divider = screen.getByTestId('assistant-fork-divider');
    expect(divider.textContent).toContain('Storefront prototype');
    expect(screen.getByTestId('assistant-fork-note').textContent).toContain(
      'Context above came along',
    );
  });

  it('leaves the fork divider out of turns that were never forked', () => {
    render(
      <AssistantMessage message={baseMessage()} streaming={false} projectId="proj-1" />,
    );

    expect(screen.queryByTestId('assistant-fork-divider')).toBeNull();
    expect(screen.queryByTestId('assistant-fork-note')).toBeNull();
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

    expect(screen.queryByRole('button', { name: 'New conversation' })).toBeNull();
  });

  it('shows the feedback widget after a successful turn that produced files', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('index.html')] })}
        streaming={false}
        isLast
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
        isLast
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
        isLast
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
  /*
   * 这两条验的是**同标签状态行的去重与取值**:同一个 label 来了多次,徽标要显示
   * **最新**那个 detail,而重复的同值只留一枚。
   *
   * 原来拿 `label: 'model'` 当载体 —— 那是 AMR(ACP)独有的运行时标记,
   * 2026-08-27 用户裁决把它整个不画了(见 `AssistantMessage.amr-model-status.test.tsx`),
   * 于是这两条跟着变红。**红的是载体,不是被测行为** —— 去重和取最新这条规则照旧,
   * 所以换成 `done` 这个会照常渲染的标签,规则本身一个字没改。
   */
  it('renders the most recent detail when multiple status events share a label', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          events: [
            { kind: 'status', label: 'done', detail: 'swe-1-6-fast' } as ChatMessage['events'][number],
            { kind: 'status', label: 'done', detail: 'claude-opus-4-7-max' } as ChatMessage['events'][number],
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
            { kind: 'status', label: 'done', detail: 'claude-opus-4-7-max' } as ChatMessage['events'][number],
            { kind: 'status', label: 'done', detail: 'claude-opus-4-7-max' } as ChatMessage['events'][number],
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
          runStatus: 'succeeded',
          events: [
            {
              kind: 'status',
              // `error` 那一档已经整档不渲染了(稿子里没有那种状态行,见
              // `AssistantMessage.no-error-pill.test.tsx`),所以这一条改用一个
              // **还会出**的 label 来验链接化 —— 它守的是 `renderStatusDetail`,
              // 不是某一个 label。
              label: 'context_compaction',
              detail:
                'AMR Cloud reported insufficient balance. Top up at https://open-design.ai/amr/dashboard, then retry.',
            } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );

    const link = screen.getByRole('link', { name: 'https://open-design.ai/amr/dashboard' });
    expect(link.getAttribute('href')).toBe('https://open-design.ai/amr/dashboard');
    expect(link.classList.contains('md-link')).toBe(true);
  });

  it('renders context compaction status with a readable label and detail', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          events: [
            {
              kind: 'status',
              label: 'context_compaction',
              detail: 'Compacting conversation history after a context-length error',
            } as ChatMessage['events'][number],
          ],
        })}
        streaming
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Compacting context')).toBeTruthy();
    expect(screen.getByText('Compacting conversation history after a context-length error')).toBeTruthy();
  });

  it('suppresses legacy persisted OpenCode compaction lifecycle statuses', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          events: [
            { kind: 'text', text: 'Visible answer' } as ChatMessage['events'][number],
            {
              kind: 'status',
              label: 'opencode_compaction',
            } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Visible answer')).toBeTruthy();
    expect(screen.queryByText('opencode_compaction')).toBeNull();
  });

  it('suppresses normalized and legacy Codex reconnect telemetry from history', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          events: [
            { kind: 'text', text: 'Visible answer' } as ChatMessage['events'][number],
            {
              kind: 'status',
              label: 'agent_reconnecting',
              detail: '2/5',
            } as ChatMessage['events'][number],
            {
              kind: 'status',
              label: 'Reconnecting... 3/5 (stream disconnected before completion: socket closed)',
            } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
      />,
    );

    expect(screen.getByText('Visible answer')).toBeTruthy();
    expect(screen.queryByText('agent_reconnecting')).toBeNull();
    expect(screen.queryByText(/Reconnecting\.\.\./u)).toBeNull();
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

    expect(container.querySelector('[data-testid="thinking-block"]')).toBeNull();
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

    // 已结束执行的折叠正文会延迟到首次展开再挂 DOM；展开后仍需保留非空 thinking。
    const executionSummary = container.querySelector('details > summary');
    expect(executionSummary).not.toBeNull();
    fireEvent.click(executionSummary!);
    fireEvent.click(screen.getByText('Thoughts'));
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
    const audienceInput = document.querySelector('[data-testid="qf-input"]');
    if (!(audienceInput instanceof HTMLInputElement)) throw new Error('expected audience input');
    fireEvent.change(audienceInput, {
      target: { value: 'Product evaluators' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    // The trailing arguments carry the answer's occupancy: the form id (and,
    // from ChatPane, the asking message's id) is what gives the answer a
    // stable identity instead of a fresh one per send.
    expect(onSubmitQuestionForm).toHaveBeenCalledWith(
      expect.stringContaining('- Who is this for?: Product evaluators'),
      undefined,
      undefined,
      undefined,
      'discovery',
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
    const draftInput = first.container.querySelector('[data-testid="qf-input"]');
    if (!(draftInput instanceof HTMLInputElement)) throw new Error('expected draft input');
    fireEvent.change(draftInput, {
      target: { value: 'Product leaders' },
    });
    first.unmount();

    const restored = render(<AssistantMessage {...props} />);
    const restoredInput = restored.container.querySelector('[data-testid="qf-input"]');
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
    const audienceInput = document.querySelector('[data-testid="qf-input"]');
    if (!(audienceInput instanceof HTMLInputElement)) throw new Error('expected audience input');
    fireEvent.change(audienceInput, {
      target: { value: 'Product leaders' },
    });
    const send = screen.getByRole('button', { name: 'Next' });
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
    const audienceInput = container.querySelector('[data-testid="qf-input"]');
    if (!(audienceInput instanceof HTMLInputElement)) throw new Error('expected audience input');
    fireEvent.change(audienceInput, {
      target: { value: 'Product leaders' },
    });
    const send = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
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
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

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
        undefined,
        'references',
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
    const send = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
    fireEvent.click(send);

    await waitFor(() => {
      expect(onSubmitQuestionForm).toHaveBeenCalledTimes(1);
      expect(deleteProjectFileMock).toHaveBeenCalledWith(
        'proj-1',
        'uploads/mood.png',
        null,
      );
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
      <CollabProvider value={projectCollabValue()}>
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
        />
      </CollabProvider>,
    );
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('expected file input');
    const mood = new File(['mood'], 'mood.png', { type: 'image/png' });
    const brief = new File(['brief'], 'brief.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [mood, brief] } });

    const send = screen.getByRole('button', { name: 'Next' });
    fireEvent.click(send);

    await waitFor(() => {
      expect(uploadProjectFilesMock).toHaveBeenNthCalledWith(
        1,
        'proj-1',
        [mood, brief],
        undefined,
        PROJECT_A_CONTEXT,
      );
      expect(deleteProjectFileMock).toHaveBeenCalledWith(
        'proj-1',
        'uploads/mood.png',
        PROJECT_A_CONTEXT,
      );
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
        undefined,
        'references',
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
    // 2026-08-26:这一块按稿子第 23/24/25 格重做 —— 绿色「已确认」+ 纯行式「标签 值」,
    // 不再是灰底卡 +「Questions answered」标题 + 胶囊。
    expect(screen.getByText('Confirmed')).toBeTruthy();
    expect(screen.queryByText('Questions answered')).toBeNull();
    expect(screen.getByText('Who is this for?')).toBeTruthy();
    expect(screen.getByText('Product evaluators')).toBeTruthy();
    expect(screen.queryByText('Quick brief — tailored')).toBeNull();
  });

  /**
   * 跳过的题在回放里要占一行,写「已跳过」—— 而不是让整块退回那句「答案已发送」。
   *
   * 这条钉的是**接线**,不是语义:共享的 summarizer 早就会念跳过了
   * (`question-form-skipped-answer-row.test.tsx` 覆盖它),但这里的历史回放块
   * 曾经不给它那个标签,于是被跳的行照旧被吞掉。整张表都跳时一行不剩,
   * 兜底分支(`flat.length === 0 && visualItems.length === 0`)就画出
   * `qf.lockedSubmitted`「答案已发送」—— 而这一分支里那句话必然是假的:
   * `formatFormAnswers` 明明给每道题都写了 `(skipped)` 发出去了。
   */
  it('replays a skipped question as a row instead of the answers-sent fallback', () => {
    const form = [
      '<question-form id="discovery" title="Quick brief">',
      JSON.stringify({
        questions: [{ id: 'audience', label: 'Who is this for?', type: 'text' }],
      }),
      '</question-form>',
    ].join('\n');

    render(
      <AssistantMessage
        message={baseMessage({
          events: [{ kind: 'text', text: form } as ChatMessage['events'][number]],
        })}
        streaming={false}
        projectId="proj-1"
        nextUserContent={'[form answers for discovery]\n- Who is this for?: (skipped)'}
      />,
    );

    expect(screen.getByText('Who is this for?')).toBeTruthy();
    expect(screen.getByText('Skipped')).toBeTruthy();
    expect(
      screen.queryByText(
        'Answers sent — agent is using these for the rest of the session.',
      ),
    ).toBeNull();
  });

  it('keeps ordinary checkbox answers on one replay-summary row', () => {
    const form = [
      '<question-form id="pages" title="Pages">',
      JSON.stringify({
        questions: [
          {
            id: 'pages',
            label: 'Pages',
            type: 'checkbox',
            options: ['Product detail', 'Search results'],
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
          '[form answers — pages]',
          '- Pages: Product detail, Search results',
        ].join('\n')}
      />,
    );

    const summary = screen.getByTestId('question-form-summary');
    expect(summary.querySelectorAll('.ab')).toHaveLength(1);
    expect(summary.querySelector('.ab b')?.textContent).toBe('Product detail, Search results');
    expect(summary.querySelector('.al')).toBeNull();
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

  it('keeps a catalog-backed direction-card preview in the answered summary', () => {
    const form = [
      '<question-form id="direction" title="Choose a visual direction">',
      JSON.stringify({
        questions: [
          {
            id: 'direction',
            label: 'Visual direction',
            type: 'direction-cards',
            options: [{ label: 'Model-authored placeholder', value: 'placeholder' }],
            cards: [{ id: 'placeholder', label: 'Model-authored placeholder' }],
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
        projectKind="web_clone"
        nextUserContent={[
          '[form answers — direction]',
          '- Visual direction: Expressive consumer [value: prototype-expressive-consumer]',
        ].join('\n')}
      />,
    );

    expect(screen.getByText('Expressive consumer')).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Visual direction: Expressive consumer' }),
    ).toHaveAttribute(
      'src',
      'https://repo-assets.open-design.ai/style-catalog/v1/prototype-expressive-consumer-v1.webp',
    );
    expect(screen.queryByText('prototype-expressive-consumer')).toBeNull();
  });

  it('serves the prototype style catalog for an options-only direction form in an other project', () => {
    // Regression: beta conversation "风格选择测试" was created as kind=other.
    // Codex emitted a valid direction-cards question with options but no legacy
    // cards metadata. The host accepted the form, but rendered an empty body
    // because `other` had no visual-style context to select a built-in catalog.
    const form = [
      '<question-form id="visual-direction" title="选择视觉方向">',
      JSON.stringify({
        lang: 'zh-CN',
        submitLabel: '确认方向',
        questions: [
          {
            id: 'visual_direction',
            label: '你希望采用哪种视觉方向？',
            type: 'direction-cards',
            required: true,
            defaultValue: 'modern-minimal',
            options: [
              { label: '编辑感', value: 'editorial-monocle' },
              { label: '现代极简', value: 'modern-minimal' },
              { label: '活泼消费', value: 'playful-consumer' },
            ],
          },
        ],
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
        projectKind="other"
      />,
    );

    const cards = container.querySelectorAll('.qf-visual-card');
    const previews = container.querySelectorAll('img.qf-visual-preview-image');
    expect(cards.length).toBeGreaterThan(0);
    expect(previews).toHaveLength(cards.length);
    expect((previews[0] as HTMLImageElement).src).toContain(
      '/style-catalog/v1/prototype-',
    );
  });

  it('serves host-owned direction cards when the model emits only the canonical trigger', () => {
    const form = [
      '<question-form id="visual-direction" title="选择视觉方向">',
      JSON.stringify({
        lang: 'zh-CN',
        questions: [
          {
            id: 'visual_direction',
            label: '你希望采用哪种视觉方向？',
            type: 'direction-cards',
            required: true,
          },
        ],
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
        projectKind="other"
      />,
    );

    const cards = container.querySelectorAll('.qf-visual-card');
    const previews = container.querySelectorAll('img.qf-visual-preview-image');
    expect(cards.length).toBeGreaterThan(0);
    expect(previews).toHaveLength(cards.length);
    expect((previews[0] as HTMLImageElement).src).toContain(
      '/style-catalog/v1/prototype-',
    );
  });

  it.each([
    {
      projectKind: 'web_clone' as const,
      title: 'Quiet SaaS',
      src: 'https://repo-assets.open-design.ai/style-catalog/v1/prototype-quiet-saas-v1.webp',
    },
    {
      projectKind: 'wireframe' as const,
      title: 'Quiet SaaS',
      src: 'https://repo-assets.open-design.ai/style-catalog/v1/prototype-quiet-saas-v1.webp',
    },
    {
      projectKind: 'live_artifact' as const,
      title: 'Quiet SaaS',
      src: 'https://repo-assets.open-design.ai/style-catalog/v1/prototype-quiet-saas-v1.webp',
    },
    {
      projectKind: 'document' as const,
      title: 'Docs reference',
      src: 'https://repo-assets.open-design.ai/style-catalog/v1/document-docs-reference-v1.webp',
    },
    {
      projectKind: 'image' as const,
      title: 'Editorial photo',
      src: 'https://repo-assets.open-design.ai/style-catalog/v1/image-photo-editorial-v1.webp',
    },
    {
      projectKind: 'video' as const,
      title: 'Swiss Pulse',
      src: 'https://repo-assets.open-design.ai/style-catalog/v1/video-swiss-pulse-v1.webp',
    },
    {
      projectKind: 'hyperframes' as const,
      title: 'Swiss Pulse',
      src: 'https://repo-assets.open-design.ai/style-catalog/v1/video-swiss-pulse-v1.webp',
    },
  ])('keeps selected $projectKind style previews in the answered summary', ({
    projectKind,
    title,
    src,
  }) => {
    const form = [
      '<question-form id="discovery" title="Quick brief">',
      JSON.stringify({
        questions: [
          {
            id: 'tone',
            label: 'Visual tone',
            type: 'checkbox',
            options: [title],
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
        projectKind={projectKind}
        nextUserContent={`[form answers for discovery]\n- Visual tone: ${title}`}
      />,
    );

    expect(screen.getByRole('img', { name: `Visual tone: ${title}` })).toHaveAttribute('src', src);
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

  it('does not recommend next steps for a question-only turn', () => {
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
    expect(screen.queryByTestId('next-step-actions')).toBeNull();

    rerender(
      <AssistantMessage
        message={baseMessage()}
        streaming={false}
        projectId="proj-1"
        isLast
        onNextStepPromptAction={onNextStepPromptAction}
      />,
    );
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
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
    /* 按 textContent 找,不用精确文本匹配:流式期间正文的字被 `useCharReveal`
       拆成了一串 `.rv` span(2026-08-27 起第一批字也化开,不再是「整段直接刷出来」),
       `getByText` 会被拆散的节点挡住。要钉的是「表单前面那句话还在」,不是它在同一个节点里。 */
    expect(document.querySelector('[data-assistant-message-id]')?.textContent)
      .toContain('One quick check:');
  });

  // NOTE(sync/main): origin/main asserted the tail synchronously. This branch
  // streams prose through the per-character reveal (`useCharReveal`), so a
  // `streaming` render only paints the whole tail once the reveal budget has
  // elapsed. The assertions are main's, unchanged — only the clock is advanced
  // first, the same way this branch's own reveal specs do it.
  it('renders a prose-bodied open tag as text instead of a loading frame', async () => {
    // Production repro: a strategy turn that needed no clarification narrated
    // its decision into an open <question-form> tag. The tail can never parse
    // as a form body, so the skeleton must not appear and no character after
    // the tag may be dropped from the view.
    const text =
      '策略判断信息充足，将直接进入生产。\n\n<question-form> 无需提出——所有决策都可通过场景推断安全默认。';
    render(
      <AssistantMessage
        message={baseMessage({
          content: text,
          events: [{ kind: 'text', text } as ChatMessage['events'][number]],
        })}
        streaming
        projectId="proj-1"
        isLast
      />,
    );

    expect(screen.queryByTestId('question-form-loading')).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByText(/无需提出——所有决策都可通过场景推断安全默认。/),
      ).toBeTruthy(),
    );
  });
});

describe('AssistantMessage recovered produced files', () => {
  it('shows linked project files from the assistant summary as files this turn', () => {
    const content = '已创建计划文档：[browser-war-deck-outline.md](browser-war-deck-outline.md)。';
    render(
      <CollabProvider value={projectCollabValue()}>
        <AssistantMessage
          message={baseMessage({
            content,
            events: [
              { kind: 'text', text: content } as ChatMessage['events'][number],
              declareTurnCards('browser-war-deck-outline.md'),
            ],
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
        />
      </CollabProvider>,
    );

    // #5517 shape:找回来的文件是**这一轮的产出**,不折进那张只列真实操作的工具摘要。
    // 2026-08-26:产出一律走产物卡(拿不出预览图的走 `doc` 档),不再有第二种列表形态。
    const produced = document.querySelector('[data-testid="artifact-card-browser-war-deck-outline.md"]');
    expect(produced).toBeTruthy();
    expect(produced?.textContent).toContain('browser-war-deck-outline.md');
    const download = produced?.querySelector('a[download]');
    expect(download).toBeTruthy();
    expect(download?.getAttribute('href')).toBe(
      '/api/projects/proj-1/raw/browser-war-deck-outline.md',
    );
    /*
     * 「不折进工具摘要」现在断言的是**没有那份文本清单**,不是「没有
     * file-ops-summary 这个 testid」—— 两条产物面板路径收成一个组件之后,
     * 那个 testid 标的是「这一轮的产物面板」这个身份,两条路上都有它
     * (P0 recvqaerXd82bE 的不变量就挂在它上面),不再是「文本清单那种画法」的记号。
     */
    expect(document.querySelector('.file-ops-list')).toBeNull();
    expect(document.querySelectorAll('[data-testid="file-ops-summary"]')).toHaveLength(1);
  });

  it('never shows the tool-op summary and the produced-files block at once (P0 recvqaerXd82bE)', () => {
    // A turn that both writes a file via a tracked tool call AND mentions an
    // older, already-existing file in its prose recovers that older file into
    // `displayedProduced` too. Before the fix this rendered two stacked panels
    // that both read "Files from this turn" — one scoped to the tool call,
    // one to the wider recovered set — which reads to users as a duplicate,
    // untrustworthy render rather than two different pieces of information.
    const content = '已创建 index.html，基于更早的 [logo.svg](logo.svg)。';
    render(
      <AssistantMessage
        message={baseMessage({
          content,
          events: [
            { kind: 'text', text: content } as ChatMessage['events'][number],
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Write',
              input: { file_path: 'index.html' },
            } as ChatMessage['events'][number],
            // 两个都声明:logo.svg 不出卡必须是「不是这一轮的产出」造成的
            declareTurnCards('index.html', 'logo.svg'),
          ],
          producedFiles: [],
        })}
        streaming={false}
        projectId="proj-1"
        projectFiles={[
          {
            name: 'logo.svg',
            path: 'logo.svg',
            size: 2048,
            mtime: 1700000005,
            kind: 'image',
            mime: 'image/svg+xml',
          } as ProjectFile,
        ]}
      />,
    );

    /*
     * 收口之后这条不变量是**结构性**的:一条消息只调用一次那个组件,所以
     * 「两块同名面板」在类型上就摆不出来了。断言相应地改成数面板个数 ——
     * 原来那条 `[data-testid="produced-files"]` 已经随 `ProducedFiles` 一起
     * 消失,留着会永远为真、白白空过。
     */
    expect(document.querySelectorAll('[data-testid="file-ops-summary"]')).toHaveLength(1);
    // 这一轮真写的那份在面板里;从正文里找回来的**更早**那份不另起一块
    // (它本来就不是这一轮的产物,原来那第二块面板正是这么冒出来的)。
    expect(document.querySelector('[data-testid="artifact-card-index.html"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="artifact-card-logo.svg"]')).toBeNull();
  });

  it('lists only the authoritative artifact when an earlier edit targeted a wrong project path', () => {
    const fileName = 'opendesign-b2b-sales-deck.html';
    const failedPath = `/workspace/projects/wrong-project/${fileName}`;
    const deliveredPath = `/workspace/projects/project-1/${fileName}`;
    const file = producedFile(fileName);

    render(
      <AssistantMessage
        message={baseMessage({
          events: [
            {
              kind: 'tool_use',
              id: 'failed-edit',
              name: 'Edit',
              input: { file_path: failedPath },
            } as ChatMessage['events'][number],
            {
              kind: 'tool_result',
              toolUseId: 'failed-edit',
              content: `File ${failedPath} not found`,
              isError: true,
            } as ChatMessage['events'][number],
            {
              kind: 'tool_use',
              id: 'successful-edit',
              name: 'Edit',
              input: { file_path: deliveredPath },
            } as ChatMessage['events'][number],
            {
              kind: 'tool_result',
              toolUseId: 'successful-edit',
              content: 'Updated successfully.',
              isError: false,
            } as ChatMessage['events'][number],
          ],
          producedFiles: [file],
        })}
        streaming={false}
        projectId="project-1"
        projectFiles={[file]}
      />,
    );

    // HTML 产物现在走卡片形态(组件 14),不再是文本行 —— 这条测的是**去重**:
    // 同一个文件被写到过错项目路径,最终只应该出现一次
    expect(document.querySelectorAll('[data-artifact-card]')).toHaveLength(1);
    expect(screen.queryByTestId(`file-ops-row-${fileName}`)).toBeNull();
    expect(screen.queryByTestId('file-ops-toggle')).toBeNull();
  });

  it('shows project files mentioned as plain filenames in the assistant summary', () => {
    const content = '文件列表：\n- browser-war-deck-outline.md';
    render(
      <AssistantMessage
        message={baseMessage({
          content,
          events: [
            { kind: 'text', text: content } as ChatMessage['events'][number],
            declareTurnCards('browser-war-deck-outline.md'),
          ],
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

    const produced = document.querySelector('[data-testid="artifact-card-browser-war-deck-outline.md"]');
    expect(produced).toBeTruthy();
    expect(produced?.textContent).toContain('browser-war-deck-outline.md');
  });

  it('does not recover old reference files as produced files', () => {
    const content = '参考 `README.md` 的内容。';
    render(
      <AssistantMessage
        message={baseMessage({
          content,
          events: [
            { kind: 'text', text: content } as ChatMessage['events'][number],
            declareTurnCards('README.md'),
          ],
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
            declareTurnCards('iphone-device-reveal.mp4'),
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

    // Video artifacts land on a card (grid 33) instead of a filename row.
    expect(screen.getByTestId('artifact-card-iphone-device-reveal.mp4')).toBeTruthy();
  });


  it('does not infer user sketches as turn output files', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          content: '',
          events: [
            { kind: 'status', label: 'starting', detail: 'Claude' } as ChatMessage['events'][number],
            { kind: 'status', label: 'initializing', detail: 'claude-opus' } as ChatMessage['events'][number],
            declareTurnCards('board.sketch.json'),
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
            declareTurnCards('diagram.svg', 'board.sketch.json'),
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

    // The svg is an artifact, so it arrives as a card (grid 32, export only);
    // the sketch json is still not inferred as turn output at all.
    expect(screen.getByTestId('artifact-card-diagram.svg')).toBeTruthy();
    expect(screen.queryByTestId('artifact-card-board.sketch.json')).toBeNull();
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
