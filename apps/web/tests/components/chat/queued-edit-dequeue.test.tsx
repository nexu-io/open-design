// @vitest-environment jsdom
/**
 * 队列行的「编辑」是**取出来重新编辑**,不是「就地改一改」。
 *
 * 产品的原话:「点这个编辑,应该这一个消息就从消息队列里消失了,编辑意思是
 * 将它原本的文本和附件,都从消息队列里拿出来重新编辑的意思」。
 *
 * 原来点了编辑,文本进了输入框,**行还留在队列里**(只多一个 `-editing` 类)。
 * 屏幕上同一条话出现两遍,人自然会以为再发一次就发两遍。
 *
 * 这几条守的是:
 *   · 点编辑 → 那一行从队列里消失,别的行一根汗毛都不动;
 *   · 消失的同时,**整份行李**都回到输入框 —— 文本 **和附件**。只查「行没了」
 *     的用例,在「编辑=删除」这种实现下照样是绿的,所以两头都得查;
 *   · 输入框里原本没发出去的草稿被**覆盖**(产品拍板,见下面那条用例);
 *   · 队列删不动的时候(没给 onRemoveQueuedSend),退回原来的就地编辑,
 *     绝不能把这条话弄丢。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChatPane } from '../../../src/components/ChatPane';

if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  HTMLElement.prototype.scrollTo = function () {};
}
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = vi.fn();
}

afterEach(cleanup);
// 输入框的草稿会写进 localStorage 并在下次挂载时读回来。不清的话,上一条用例
// 点完编辑留下的 '111' 会变成下一条用例的「初始草稿」,前置断言就白写了。
beforeEach(() => window.localStorage.clear());

type PaneProps = Parameters<typeof ChatPane>[0];
type QueuedItem = NonNullable<PaneProps['queuedItems']>[number];

const FIRST = {
  id: 'q1',
  prompt: '111',
  attachments: [{ path: 'a.png', name: 'a.png', kind: 'image' }],
} as QueuedItem;

const SECOND = { id: 'q2', prompt: '第二条不该被动' } as QueuedItem;

function Harness({
  removable = true,
  initialDraft,
  onRemoved,
}: {
  removable?: boolean;
  initialDraft?: string;
  onRemoved?: (id: string) => void;
}) {
  const [items, setItems] = useState<QueuedItem[]>([FIRST, SECOND]);
  const remove = (id: string) => {
    onRemoved?.(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  };
  return (
    <ChatPane
      projectKindForTracking="prototype"
      messages={[]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      initialDraft={initialDraft}
      onEnsureProject={async () => 'project-1'}
      onSend={() => {}}
      onStop={() => {}}
      conversations={[]}
      activeConversationId="conversation-1"
      onSelectConversation={() => {}}
      onDeleteConversation={() => {}}
      queuedItems={items}
      onRemoveQueuedSend={removable ? remove : undefined}
      onUpdateQueuedSend={() => {}}
    />
  );
}

function composerText(): string {
  return document.querySelector('[contenteditable="true"]')?.textContent ?? '';
}

function rowTexts(): string[] {
  return screen.queryAllByTestId('chat-queued-send-row').map((el) => el.textContent ?? '');
}

function clickEditOnFirstRow() {
  fireEvent.click(screen.getAllByLabelText('Edit')[0]!);
}

describe('队列行的「编辑」', () => {
  it('把这一条从队列里取出来,别的行不动', () => {
    const onRemoved = vi.fn();
    render(<Harness onRemoved={onRemoved} />);
    expect(rowTexts()).toHaveLength(2);

    clickEditOnFirstRow();

    expect(onRemoved).toHaveBeenCalledWith('q1');
    const rows = rowTexts();
    // 被编辑的那一条走了 ——
    expect(rows.some((text) => text.includes('111'))).toBe(false);
    // —— 但「编辑」不是「清空队列」,后面那条必须原地不动。
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('第二条不该被动');
    // 也不该留下「正在编辑」的残影:这条已经不在队列里了。
    expect(document.querySelector('.chat-queued-send-row-editing')).toBeNull();
  });

  it('取出来的是整份行李 —— 文本和附件一起回到输入框', () => {
    render(<Harness />);
    // 编辑之前输入框是空的,附件托盘也没有卡。
    expect(composerText()).toBe('');
    expect(screen.queryByLabelText('Remove a.png')).toBeNull();

    clickEditOnFirstRow();

    expect(composerText()).toBe('111');
    // 附件跟着回来了。只搬文本不搬附件,人一发就少了图 —— 这一条就是为了挡它。
    expect(screen.getByLabelText('Remove a.png')).toBeTruthy();
    expect(screen.getByTestId('staged-attachment-image')).toBeTruthy();
  });

  it('输入框里没发出去的草稿被覆盖 —— 产品拍板的取舍', () => {
    render(<Harness initialDraft="草稿不能留" />);
    expect(composerText()).toBe('草稿不能留');

    clickEditOnFirstRow();

    // 覆盖,不是拼接、不是弹窗问、也不是拒绝。
    expect(composerText()).toBe('111');
    expect(composerText()).not.toContain('草稿');
  });

  it('队列删不动的时候退回就地编辑,绝不把这条话弄丢', () => {
    render(<Harness removable={false} />);

    clickEditOnFirstRow();

    // 没有 onRemoveQueuedSend 就没法出队;这时候必须保住原来的就地编辑,
    // 否则这条话既不在队列里、发出去也只会更新一个不存在的条目。
    const rows = rowTexts();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('111');
    expect(document.querySelector('.chat-queued-send-row-editing')).not.toBeNull();
    expect(composerText()).toBe('111');
  });
});
