// @vitest-environment jsdom
/**
 * 发送那一头:引用必须**同时**走两条路。
 *
 * · 折进正文 —— `> 原文` 的 markdown 引用块,给 agent 读的;
 * · 原样挂在 `meta.quotes` 上 —— 给发送队列存的。
 *
 * 少了后一条,排进队列的那一条在结构上就没有引用了,用户点「编辑」取回来
 * 只能是一段散文(这正是用户报的那个 bug)。而这件事**只在发送这一头能测**:
 * 直接手搓一个带 `meta.quotes` 的队列项去测取回,是测不到「谁把它放进去的」。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatComposer } from '../../../src/components/ChatComposer';
import { quotePromptPrefix } from '../../../src/runtime/chat/quote-selection';
import { DRAFT_MAX_QUOTES, DRAFT_MAX_QUOTE_CHARS } from '../../../src/runtime/chat/composer-draft';

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

const QUOTE = { id: 'quote-1', text: '商品卡已经抽成共享组件', messageId: 'assistant-1' };
const BODY = '把首屏文案改短一点';

type ComposerProps = Parameters<typeof ChatComposer>[0];
type Quote = NonNullable<ComposerProps['quotes']>[number];

function renderComposer(overrides: Partial<ComposerProps> = {}) {
  const onSend = vi.fn();
  const onClearQuotes = vi.fn();
  render(
    <ChatComposer
      projectId="project-1"
      projectFiles={[]}
      streaming={false}
      initialDraft={BODY}
      onEnsureProject={async () => 'project-1'}
      onSend={onSend}
      onStop={vi.fn()}
      onClearQuotes={onClearQuotes}
      {...overrides}
    />,
  );
  return { onSend, onClearQuotes };
}

async function send(onSend: ReturnType<typeof vi.fn>) {
  fireEvent.click(screen.getByTestId('chat-send'));
  await waitFor(() => expect(onSend).toHaveBeenCalled());
  return onSend.mock.calls[0] as [string, unknown, unknown, { quotes?: Quote[] } | undefined];
}

describe('发送时的引用', () => {
  it('仅引用时芯片可见，按钮与 Enter 都允许发送', async () => {
    const { onSend } = renderComposer({ initialDraft: '', quotes: [QUOTE] });

    expect(screen.getByTestId('chat-quoted-refs')).toHaveTextContent(QUOTE.text);
    expect(screen.getByTestId('chat-composer-input')).toHaveTextContent('');

    const sendButton = screen.getByTestId('chat-send') as HTMLButtonElement;
    expect(sendButton.disabled).toBe(false);

    fireEvent.keyDown(screen.getByTestId('chat-composer-input'), { key: 'Enter' });
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[0]).toBe(quotePromptPrefix([QUOTE]).trim());
  });

  it('折进正文,同时原样挂到 meta 上 —— 队列靠后者才拆得回芯片', async () => {
    const { onSend, onClearQuotes } = renderComposer({ quotes: [QUOTE] });

    const [prompt, , , meta] = await send(onSend);

    // 折进去的那一份:给 agent 读的散文,前缀由共享的那个函数定义。
    expect(prompt).toBe(`${quotePromptPrefix([QUOTE])}${BODY}`);
    expect(prompt).toContain(`> ${QUOTE.text}`);
    // 结构的那一份:队列存的就是它。没有它,取回来只能是散文。
    expect(meta?.quotes).toEqual([QUOTE]);
    // 发完芯片就清掉 —— 引用是这一条消息的上下文,不是长期状态。
    expect(onClearQuotes).toHaveBeenCalled();
  });

  it('没有引用时不往 meta 上挂空字段', async () => {
    const { onSend } = renderComposer();

    const [prompt, , , meta] = await send(onSend);

    expect(prompt).toBe(BODY);
    // 队列会把整个 meta 原样写进 localStorage,每一发都塞一个空数组纯属浪费。
    // (meta 整个是 undefined 也算数 —— 那就更没有 quotes 了。)
    expect(meta?.quotes).toBeUndefined();
  });

  it('超量 / 超长的引用在进 meta 之前就被削掉', async () => {
    const many: Quote[] = Array.from({ length: DRAFT_MAX_QUOTES + 5 }, (_, i) => ({
      id: `q${i}`,
      text: `第 ${i} 段`.padEnd(10, '字'),
      messageId: 'assistant-1',
    }));
    many[0] = { id: 'long', text: 'x'.repeat(DRAFT_MAX_QUOTE_CHARS + 500), messageId: 'assistant-1' };
    const { onSend } = renderComposer({ quotes: many });

    const [, , , meta] = await send(onSend);

    // 队列那一层对 meta 不做任何校验,原样 JSON 落盘。闸门只能设在这里 ——
    // 否则一次超长选区就能把 localStorage 的配额吃满,而报错会出现在别处。
    expect(meta?.quotes).toHaveLength(DRAFT_MAX_QUOTES);
    expect(meta?.quotes?.[0]?.text).toHaveLength(DRAFT_MAX_QUOTE_CHARS);
  });
});
