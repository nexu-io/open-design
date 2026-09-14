// @vitest-environment jsdom
/**
 * 红测:**右侧导轨数出来的用户消息,必须和正文里画出来的那些是同一批。**
 *
 * QA 现象:导轨上有 2 个点,正文里只有 1 个用户气泡;点那多出来的一个点,
 * 跳向一条**根本没渲染**的消息 —— 视图不动,也没有任何东西被点亮。
 *
 * 因果:同一份 `displayMessages` 喂给了两个消费者,而两个消费者各自决定
 * 「哪些算数」——
 *
 *  · 正文(`buildChatRenderItems`)**跳过**内容以 `[form answers` 开头的用户消息。
 *    这是产品取向(#5496):表单答案已经以摘要形式长在上一条助手消息上,再画一个
 *    用户气泡等于把同一个决定说两遍,还会把 `[form answers — <id>]` 这种机器载荷
 *    摆到用户脸上。
 *  · 导轨(`ChatMessageRail`)只看 `message.role === 'user'`,不做这个跳过。
 *
 * 两套口径吃同一份输入,对不上是必然的,不是偶发。
 *
 * 判据分两条,缺一不可:
 *
 *  1. **数目相等** —— 导轨条目数 === 正文用户气泡数。
 *  2. **不是两边都变成 0**(相等的平凡解)—— 这个夹具下正文确实画出 2 个气泡,
 *     导轨也确实有 2 个点;并且**逐个点过去**,每一次都要在正文里点亮一条真消息。
 *     第 2 条才是「死链」那一半:光对数字,把导轨改成「一条都不画」也叫相等。
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../../src/types';

const translate = (key: string, vars?: Record<string, string | number>) =>
  (vars && Object.keys(vars).length > 0 ? `${key} ${Object.values(vars).join(' ')}` : key);

vi.mock('../../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));

vi.mock('../../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => (
    <div data-testid={`assistant-${message.id}`}>{message.content}</div>
  ),
}));

vi.mock('../../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

vi.mock('../../../src/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/analytics/events')>();
  return {
    ...actual,
    trackChatPanelClick: vi.fn(),
    trackRunFailedToastSurfaceView: vi.fn(),
    trackRunRecoveryActionClick: vi.fn(),
    trackRunRecoveryActionSurfaceView: vi.fn(),
  };
});

let originalScrollTo: PropertyDescriptor | undefined;
let originalScrollIntoView: PropertyDescriptor | undefined;

beforeEach(() => {
  // jsdom 两个都没有。跳转本身不是这条用例的判据(几何全是 0),桩掉只是别让
  // `handleChatRailNavigate` 半路抛异常,把后面的断言吃掉。
  originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
  originalScrollIntoView = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollIntoView',
  );
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true, writable: true, value: () => undefined,
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true, writable: true, value: () => undefined,
  });
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((handle: number) =>
      clearTimeout(handle as unknown as NodeJS.Timeout)) as typeof cancelAnimationFrame;
  }
});

afterEach(() => {
  cleanup();
  if (originalScrollTo) {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
  } else {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTo;
  }
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
  } else {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView;
  }
  vi.clearAllMocks();
});

/**
 * 两轮正常问答 + 一次表单交答案。
 *
 * 三条用户消息,其中最后一条是表单载荷 —— 正文画 2 个气泡。导轨至少要 2 条用户消息
 * 才现身(`CHAT_RAIL_MIN_USER_MESSAGES`),所以过滤之后的 2 条正好还够它出场:
 * 「修好 = 导轨整个消失」不能拿来蒙混过关。
 */
function transcriptWithFormAnswers(): ChatMessage[] {
  return [
    { id: 'u1', role: 'user', content: 'make me a landing page', createdAt: 1 },
    { id: 'a1', role: 'assistant', content: 'here it is', createdAt: 2 },
    { id: 'u2', role: 'user', content: 'make the hero bigger', createdAt: 3 },
    {
      id: 'a2', role: 'assistant',
      content: 'sure — a couple of choices first <question-form id="f1"></question-form>',
      createdAt: 4,
    },
    {
      id: 'u3', role: 'user',
      content: '[form answers — f1]\n- Tone: bold\n- Layout: split',
      createdAt: 5,
    },
    { id: 'a3', role: 'assistant', content: 'done', createdAt: 6 },
  ] as ChatMessage[];
}

function renderChat(messages: ChatMessage[]) {
  return render(
    <ChatPane
      messages={messages}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: 'amr', agentCliEnv: {} } as unknown as AppConfig}
    />,
  );
}

const railMarkers = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.chat-message-rail__marker'));
const userBubbles = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.msg.user'));

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('导轨与正文必须是同一份口径', () => {
  it('导轨的用户条目数 === 正文画出来的用户气泡数(而且都不是 0)', async () => {
    renderChat(transcriptWithFormAnswers());
    await tick();

    const bubbles = userBubbles();
    const markers = railMarkers();

    // 防真空:两边都变成 0 也叫「相等」。先钉住这个夹具确实两边都有东西。
    expect(bubbles.length, '正文应当画出 2 个用户气泡(表单载荷那条按产品取向跳过)')
      .toBe(2);
    expect(markers.length, '导轨应当有条目,不能靠「一条都不画」来对上数字')
      .toBeGreaterThan(0);

    expect(
      markers.length,
      `导轨数出 ${markers.length} 条用户消息,正文只画了 ${bubbles.length} 个气泡`,
    ).toBe(bubbles.length);
  });

  it('导轨里的每一条都点得到正文里的一条真消息 —— 没有死链', async () => {
    renderChat(transcriptWithFormAnswers());
    await tick();

    const markers = railMarkers();
    expect(markers.length, '夹具自检:导轨得先有条目可点').toBeGreaterThan(0);

    for (const [index, marker] of markers.entries()) {
      await act(async () => { fireEvent.click(marker); });
      const highlighted = document.querySelectorAll('.msg.user.is-chat-rail-highlighted');
      expect(
        highlighted.length,
        `点导轨第 ${index + 1} 条之后,正文里应当正好点亮一条消息;`
        + `点亮了 ${highlighted.length} 条 —— 0 就是跳到了一条没渲染的消息上`,
      ).toBe(1);
    }
  });
});
