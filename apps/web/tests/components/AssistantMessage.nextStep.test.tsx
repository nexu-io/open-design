// @vitest-environment jsdom

/**
 * Gate coverage for the "next step" affordance under the last assistant
 * message. The surface is reserved for successful, artifact-backed delivery;
 * pure answers, interruptions, and incomplete work stay compact.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import { en } from '../../src/i18n/locales/en';
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
});

function baseMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const message = {
    id: 'msg-1',
    role: 'assistant',
    content: 'Done.',
    runStatus: 'succeeded',
    startedAt: 1700000000,
    endedAt: 1700000005,
    events: [{ kind: 'text', text: 'Done.' } as NonNullable<ChatMessage['events']>[number]],
    producedFiles: [],
    ...overrides,
  } as ChatMessage;
  /*
   * 产物卡是 agent **声明**出来的(`<od-focus show="…">`),不再从产出清单推断。
   * 这一组用例讲的是「下一步」那一块,不是声明协议本身,所以夹具替这一轮把它的
   * 产出声明出来,让用例继续论证它原本要论证的事。产出为空的那几条不受影响 ——
   * 没有产出就没有可声明的东西,和今天一样。
   */
  const produced = message.producedFiles ?? [];
  if (produced.length > 0) {
    message.events = [
      ...(message.events ?? []),
      { kind: 'artifact_focus', show: produced.map((file) => file.name) } as NonNullable<
        ChatMessage['events']
      >[number],
    ];
  }
  return message;
}

function producedFile(name: string, kind: ProjectFile['kind'] = 'html'): ProjectFile {
  return {
    name,
    path: name,
    size: 100,
    mtime: 1700000005,
    kind,
    mime: kind === 'html' ? 'text/html' : 'application/octet-stream',
  } as ProjectFile;
}

const handlers = () => ({
  onArtifactShare: vi.fn(),
  onToolboxAction: vi.fn(),
  onNextStepPromptAction: vi.fn(),
  onNextStepSuggestion: vi.fn(),
});

/**
 * 这一轮的三条行为引导。
 *
 * 它们来自 daemon 解析 `<od-next key="…">` 之后下发并落库的 `next_steps` 事件,
 * 不是正文里的标记 —— 客户端从来看不到标记本身。
 * 一条消息**没有**这个事件,就是「旧会话 / 这一轮模型没给」,下一步引导整块不出。
 */
const SUGGESTIONS = ['再加一页订单列表', '把商品卡换成两列布局', '补一套深色模式'];

function withSuggestions(
  message: ChatMessage,
  suggestions: string[] = SUGGESTIONS,
): ChatMessage {
  return {
    ...message,
    events: [
      ...(message.events ?? []),
      { kind: 'next_steps', suggestions } as NonNullable<ChatMessage['events']>[number],
    ],
  };
}

describe('AssistantMessage next-step affordance', () => {
  it('renders this turn\'s three agent-written suggestions and sends the one clicked', () => {
    const h = handlers();
    render(
      <AssistantMessage
        message={withSuggestions(baseMessage({ producedFiles: [producedFile('landing.html')] }))}
        streaming={false}
        projectId="proj-1"
        isLast
        {...h}
      />,
    );
    expect(screen.getByRole('group', { name: en['nextStep.suggestionsLabel'] })).toBeTruthy();
    // 稿子里这一块没有标题行 —— 三条建议自己铺满,不套框不加头
    expect(screen.queryByText(en['nextStep.suggestionsLabel'])).toBeNull();
    for (const text of SUGGESTIONS) expect(screen.getByText(text)).toBeTruthy();

    fireEvent.click(screen.getByTestId('next-step-suggestion-0'));
    expect(h.onNextStepSuggestion).toHaveBeenCalledWith('再加一页订单列表');
  });

  /**
   * 旧会话兼容(产品硬要求)。历史消息里没有 `next_steps` 事件 —— 这一行
   * **干脆不出**:既不退回原来那份固定工具箱目录,也不出一个空壳。
   * 建议是关于「这一轮到底做了什么」的,事后无从重建。
   */
  it('renders nothing for a turn recorded before suggestions existed', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('landing.html')] })}
        streaming={false}
        projectId="proj-1"
        isLast
        {...handlers()}
      />,
    );
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
    expect(screen.queryByTestId('next-step-suggestions')).toBeNull();
    expect(screen.queryByTestId('next-step-toolbox-more')).toBeNull();
  });

  /** 重试会在同一条消息上再跑一轮:当前这一轮的建议才算数 */
  it('uses the latest suggestions when a retried turn emits a second set', () => {
    const h = handlers();
    const message = withSuggestions(
      withSuggestions(baseMessage({ producedFiles: [producedFile('landing.html')] }), ['旧的一条']),
      ['新的一条'],
    );
    render(
      <AssistantMessage
        message={message}
        streaming={false}
        projectId="proj-1"
        isLast
        {...h}
      />,
    );
    expect(screen.getByText('新的一条')).toBeTruthy();
    expect(screen.queryByText('旧的一条')).toBeNull();
  });

  it('does not render when the message is not the last assistant message', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('landing.html')] })}
        streaming={false}
        projectId="proj-1"
        isLast={false}
        {...handlers()}
      />,
    );
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
  });

  /**
   * ⚠️ 落点变更,**待产品拍板**。
   *
   * 「贡献到 OpenDesign 社区」(`onShareToOpenDesign`)原来挂在
   * 更多 → 分享 → 贡献 这条三级路径上,而那条路径只在 `default` 档出现。
   * `default` 档现在整档换成 agent 现写的三条建议,所以这个入口在常规交付
   * 回合上**没有落点了**(仅在 brand / plan / design-system 这些工作流档上
   * 还画得出更多行 —— 但那几档不是它原来出现的地方)。
   *
   * 这里不写成「断言它不可达」——那等于把回归钉死。只锁住一件事:
   * 交付回合的 `default` 档现在出的是建议行,而不是那条三级菜单。
   * 该给贡献入口找哪个新家,由产品定(见交接报告「失去落点的入口」一节)。
   */
  it('no longer routes Contribute through the default variant (needs a new home)', () => {
    const onShareToOpenDesign = vi.fn();
    render(
      <AssistantMessage
        message={withSuggestions(baseMessage({ producedFiles: [producedFile('landing.html')] }))}
        streaming={false}
        projectId="proj-1"
        isLast
        onFeedback={vi.fn()}
        onShareToOpenDesign={onShareToOpenDesign}
        {...handlers()}
      />,
    );
    expect(screen.getByTestId('next-step-suggestions')).toBeTruthy();
    expect(screen.queryByTestId('next-step-toolbox-more')).toBeNull();
    expect(onShareToOpenDesign).not.toHaveBeenCalled();
  });

  it('does not render after a simple answer with no deliverable', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [] })}
        streaming={false}
        projectId="proj-1"
        isLast
        {...handlers()}
      />,
    );
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
  });

  /**
   * OPEND-2497:「添加到对话」发起的任务跑完了,末尾却没有下一步引导。
   *
   * 这一档的三条建议是 **agent 自己现写的** —— 它已经按提示词判过
   * 「这一轮有没有值得接着做的事」,没有就一条都不发。所以再由宿主拿
   * 「本轮有没有产物文件」二次否决,只会把 agent 已经给出的判断丢掉:
   * 引用一段正文追问、改一处措辞、答一个问题,这些回合宿主都不会记到
   * 产物名下,建议却是有的。
   *
   * 产物门只留给工具箱那几档(brand / plan / design-system /
   * project-incomplete)—— 它们的行是宿主自己造的,得有个锚点。
   */
  it('renders the agent-written suggestions on a completed turn with no produced file (OPEND-2497)', () => {
    const h = handlers();
    render(
      <AssistantMessage
        message={withSuggestions(baseMessage({ producedFiles: [] }))}
        streaming={false}
        projectId="proj-1"
        isLast
        {...h}
      />,
    );
    expect(screen.getByTestId('next-step-suggestions')).toBeTruthy();
    for (const text of SUGGESTIONS) expect(screen.getByText(text)).toBeTruthy();
    fireEvent.click(screen.getByTestId('next-step-suggestion-0'));
    expect(h.onNextStepSuggestion).toHaveBeenCalledWith('再加一页订单列表');
  });

  /**
   * 同一条口子不能顺带放开失败 / 中止的回合 —— 那不是「任务结束」,
   * 是「任务没做成」,收尾出口是重试,不是接着往下做。
   */
  it('still withholds agent-written suggestions when the turn did not succeed', () => {
    for (const runStatus of ['failed', 'canceled'] as const) {
      render(
        <AssistantMessage
          message={withSuggestions(
            baseMessage({ runStatus, content: 'Stopped.', producedFiles: [] }),
          )}
          streaming={false}
          projectId="proj-1"
          isLast
          {...handlers()}
        />,
      );
      expect(screen.queryByTestId('next-step-suggestions')).toBeNull();
      cleanup();
    }
  });

  it('does not render for a simple answer without a project id', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [] })}
        streaming={false}
        isLast
        {...handlers()}
      />,
    );
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
  });

  it('does not fall back to the fixed project menu when a successful turn has no previewable artifact', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('notes.md', 'text')] })}
        streaming={false}
        projectId="proj-1"
        isLast
        {...handlers()}
      />,
    );
    // #5517 shape: a turn with produced files but no tool ops renders the produced
    // artifact itself, not the collapsible tool-op summary.
    // 2026-08-26:拿不出预览图的产出(md/txt)也走产物卡了(`doc` 档),
    // 不再退化成一行灰列表 —— 所以这里改看卡片。
    expect(document.querySelector('[data-testid="artifact-card-notes.md"]')).toBeTruthy();
    // 「不是那张可折叠的工具摘要」现在看的是**没有文本清单**:两条产物面板路径
    // 收成一个组件之后,`file-ops-summary` 标的是面板身份,两条路上都有。
    expect(document.querySelector('.file-ops-list')).toBeNull();
    expect(document.querySelectorAll('[data-testid="file-ops-summary"]')).toHaveLength(1);
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
    expect(screen.queryByText(en['nextStep.projectGenerateArtifactTitle'])).toBeNull();
    expect(screen.queryByTestId('next-step-toolbox-more')).toBeNull();
  });

  it('uses agent-written suggestions for a successful non-preview artifact turn', () => {
    render(
      <AssistantMessage
        message={withSuggestions(
          baseMessage({ producedFiles: [producedFile('notes.md', 'text')] }),
        )}
        streaming={false}
        projectId="proj-1"
        isLast
        {...handlers()}
      />,
    );

    expect(screen.getByTestId('next-step-suggestions')).toBeTruthy();
    for (const suggestion of SUGGESTIONS) expect(screen.getByText(suggestion)).toBeTruthy();
    expect(screen.queryByText(en['nextStep.projectGenerateArtifactTitle'])).toBeNull();
    expect(screen.queryByTestId('next-step-toolbox-more')).toBeNull();
  });

  it('does not reuse an earlier artifact for a pure-answer turn', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [] })}
        streaming={false}
        projectId="proj-1"
        isLast
        projectFiles={[producedFile('landing.html')]}
        {...handlers()}
      />,
    );
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
  });

  it('does not render incomplete brand extraction next steps after cancellation', () => {
    const h = handlers();
    const onContinueExtraction = vi.fn();
    const onContinueAiExtraction = vi.fn();
    render(
      <AssistantMessage
        message={baseMessage({
          runStatus: 'canceled',
          content: 'Stopped.',
          producedFiles: [],
        })}
        streaming={false}
        projectId="proj-brand"
        isLast
        nextStepVariant="brand-extraction"
        onNextStepContinueExtraction={onContinueExtraction}
        onNextStepContinueAiExtraction={onContinueAiExtraction}
        {...h}
      />,
    );

    expect(screen.queryByTestId('next-step-actions')).toBeNull();
    expect(onContinueExtraction).not.toHaveBeenCalled();
    expect(onContinueAiExtraction).not.toHaveBeenCalled();
  });

  it('refreshes the brand continuation busy state on memoized rows', () => {
    const h = handlers();
    const onContinueExtraction = vi.fn();
    const message = baseMessage({
      runStatus: 'succeeded',
      content: 'Done.',
      producedFiles: [producedFile('brand.html')],
    });
    const view = render(
      <AssistantMessage
        message={message}
        streaming={false}
        projectId="proj-brand"
        isLast
        nextStepVariant="brand-programmatic-incomplete"
        onNextStepContinueExtraction={onContinueExtraction}
        nextStepContinueExtractionBusy={false}
        {...h}
      />,
    );

    const firstButton = screen.getByTestId('next-step-brand-action-brand-continue-extraction');
    fireEvent.click(firstButton);
    expect(onContinueExtraction).toHaveBeenCalledTimes(1);

    view.rerender(
      <AssistantMessage
        message={message}
        streaming={false}
        projectId="proj-brand"
        isLast
        nextStepVariant="brand-programmatic-incomplete"
        onNextStepContinueExtraction={onContinueExtraction}
        nextStepContinueExtractionBusy
        {...h}
      />,
    );

    const busyButton = screen.getByTestId('next-step-brand-action-brand-continue-extraction');
    expect((busyButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busyButton);
    expect(onContinueExtraction).toHaveBeenCalledTimes(1);
  });

  it('does not render when the handlers are not wired', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('landing.html')] })}
        streaming={false}
        projectId="proj-1"
        isLast
      />,
    );
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
  });

  it('does not render after a failed turn', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [], runStatus: 'failed' })}
        streaming={false}
        projectId="proj-1"
        isLast
        {...handlers()}
      />,
    );
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
  });

  it('does not render after a canceled turn', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [], runStatus: 'canceled' })}
        streaming={false}
        projectId="proj-1"
        isLast
        {...handlers()}
      />,
    );
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
  });
});

// A clarification turn ends the run while its inline <question-form> is still
// waiting for the user; the next-step card must hold back until
// the answers (or a skip-all, which submits through the same path) arrive as
// the following user message.
describe('AssistantMessage next-step affordance during the question phase', () => {
  const QUESTION_FORM_CONTENT = [
    'Got it — a couple of quick questions first.',
    '',
    '<question-form id="discovery" title="Brief">',
    '{"questions":[{"id":"studio","label":"Studio name","type":"text","required":true}]}',
    '</question-form>',
  ].join('\n');

  function questionFormMessage(content = QUESTION_FORM_CONTENT): ChatMessage {
    // 带上这一轮的三条建议:门开了之后要看得见东西,才测得出「门开了」。
    return withSuggestions(
      baseMessage({
        content,
        events: [{ kind: 'text', text: content } as NonNullable<ChatMessage['events']>[number]],
        producedFiles: [producedFile('brief.html')],
      }),
    );
  }

  it('does not render while the question form is still unanswered', () => {
    render(
      <AssistantMessage
        message={questionFormMessage()}
        streaming={false}
        projectId="proj-1"
        isLast
        {...handlers()}
      />,
    );
    expect(screen.getByText('Brief')).toBeTruthy();
    expect(screen.getByText('Studio name')).toBeTruthy();
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
    expect(screen.queryByTestId('assistant-label')).toBeNull();
  });

  it('replays a persisted legacy child-tag form without a false completed label', () => {
    const content = [
      'One quick check.',
      '<question-form id="audio" title="Audio brief">',
      '<question-select id="format" label="Format">',
      '<option value="mp3">MP3</option>',
      '<option value="wav">WAV</option>',
      '</question-select>',
      '<question-text id="mood" label="Mood" />',
      '</question-form>',
    ].join('');
    render(
      <AssistantMessage
        message={questionFormMessage(content)}
        streaming={false}
        projectId="proj-1"
        isLast
        {...handlers()}
      />,
    );

    expect(screen.getByText('Audio brief')).toBeTruthy();
    expect(screen.getByText('Format')).toBeTruthy();
    expect(screen.getByText('Mood')).toBeTruthy();
    expect(screen.queryByTestId('assistant-label')).toBeNull();
  });

  it('does not render while an unterminated question form is pending', () => {
    const content = 'Quick brief first.\n\n<question-form id="discovery" title="Brief">\n{"questions":[';
    render(
      <AssistantMessage
        message={questionFormMessage(content)}
        streaming={false}
        projectId="proj-1"
        isLast
        {...handlers()}
      />,
    );
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
  });

  it('renders on a settled turn whose only open tag has a prose body', () => {
    // Production repro: a turn that needed no clarification narrated its
    // decision into an open <question-form> tag. The tail can never become a
    // form body, so there is nothing for the user to answer — the turn is
    // settled and its next-step affordance must not be suppressed.
    const content =
      '策略判断信息充足，将直接进入生产。\n\n<question-form> 无需提出';
    render(
      <AssistantMessage
        message={questionFormMessage(content)}
        streaming={false}
        projectId="proj-1"
        isLast
        {...handlers()}
      />,
    );
    expect(screen.getByTestId('next-step-actions')).toBeTruthy();
  });

  it('renders once the next user message submits the form answers', () => {
    render(
      <AssistantMessage
        message={questionFormMessage()}
        streaming={false}
        projectId="proj-1"
        isLast
        nextUserContent={'[form answers — discovery]\n- Studio name: Cobalt Studio'}
        {...handlers()}
      />,
    );
    expect(screen.getByTestId('next-step-actions')).toBeTruthy();
  });

  it('ignores a suppressed direction form (locked design system) when gating', () => {
    const content = [
      'Pick a direction.',
      '',
      '<question-form id="direction" title="Visual direction">',
      '{"questions":[{"id":"dir","label":"Direction","type":"direction-cards","options":["A","B"]}]}',
      '</question-form>',
    ].join('\n');
    render(
      <AssistantMessage
        message={questionFormMessage(content)}
        streaming={false}
        projectId="proj-1"
        isLast
        suppressDirectionForms
        {...handlers()}
      />,
    );
    expect(screen.getByTestId('next-step-actions')).toBeTruthy();
  });
});
