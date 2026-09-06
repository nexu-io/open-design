// @vitest-environment jsdom
/**
 * 从队列里「编辑」取回来的,**引用要还是引用**,不能变成一段普通文字。
 *
 * 产品的原话:「选中文字添加到对话里, 然后发送时进入发送队列, 然后点编辑回来后,
 * 怎么变成普通文本了, 不是放到注释的那个里了?」
 *
 * 原因在发送那一头,不在取回那一头:`submit()` 把引用折成 `> 原文` 拼进正文,
 * 然后 `onClearQuotes()` 把芯片清掉 —— 排进队列的那一条**结构上已经没有引用了**,
 * 只剩一段带 `>` 的散文。所以取回时无论怎么恢复,都只能恢复出散文。
 *
 * 这几条守的是:
 *   · 取回来引用是芯片,正文是**去掉引文之后**那一段(两头都查,只查一头会被
 *     「把整段话都塞进芯片」或者「芯片有了正文却被啃掉」蒙混过去);
 *   · 老队列(存在 localStorage 里、没有这个字段的那些)照样能取回正文,
 *     只是没有芯片 —— 静默退回今天的行为,绝不报错;
 *   · 正文被改过、前缀对不上了,就一个字都不拆;
 *   · 顺带钉住标注(注释附件)的往返:它是另一条列表,别一起丢了、也别翻倍。
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
beforeEach(() => window.localStorage.clear());

type PaneProps = Parameters<typeof ChatPane>[0];
type QueuedItem = NonNullable<PaneProps['queuedItems']>[number];

const QUOTE = { id: 'quote-1', text: '商品卡已经抽成共享组件', messageId: 'assistant-1' };
const BODY = '把首屏文案改短一点';
/** 队列里存的正是 `submit()` 折出来的那个样子。 */
const FOLDED = `> ${QUOTE.text}\n\n${BODY}`;

const mark = {
  id: 'c1',
  order: 1,
  filePath: 'index.html',
  elementId: 'hero-title',
  selector: '[data-od-id="hero-title"]',
  label: 'h1.hero-title',
  comment: '标题短一点',
  currentText: '一个很长的标题',
  pagePosition: { x: 12, y: 44, width: 500, height: 60 },
  htmlHint: '<h1 data-od-id="hero-title">',
};

function Harness({ item }: { item: QueuedItem }) {
  const [items, setItems] = useState<QueuedItem[]>([item]);
  return (
    <ChatPane
      projectKindForTracking="prototype"
      messages={[]}
      streaming={false}
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
      queuedItems={items}
      onRemoveQueuedSend={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
      onUpdateQueuedSend={() => {}}
    />
  );
}

/**
 * 输入框里那段字。Lexical 把换行画成 `<br>`,段落画成 `<p>` —— 直接读
 * `textContent` 会把换行**吃掉**,于是「原样取回」和「把换行吞了」看起来一模一样。
 * 这一层把 `<br>` 还原成 `\n`,断言才照得出空白上的差别。
 */
function composerText(): string {
  const el = document.querySelector('[contenteditable="true"]');
  if (!el) return '';
  const walk = (node: Node): string => {
    if (node.nodeName === 'BR') return '\n';
    if (node.nodeType === node.TEXT_NODE) return node.textContent ?? '';
    return Array.from(node.childNodes).map(walk).join('');
  };
  return Array.from(el.childNodes).map(walk).join('\n');
}

function quoteChipTexts(): string[] {
  const refs = screen.queryByTestId('chat-quoted-refs');
  if (!refs) return [];
  return Array.from(refs.querySelectorAll('li')).map((li) => li.textContent ?? '');
}

function clickEdit() {
  fireEvent.click(screen.getAllByLabelText('Edit')[0]!);
}

describe('从队列取回引用', () => {
  it('引用回到芯片里,正文是去掉引文之后那一段', () => {
    render(<Harness item={{ id: 'q1', prompt: FOLDED, meta: { quotes: [QUOTE] } } as QueuedItem} />);
    expect(quoteChipTexts()).toEqual([]);

    clickEdit();

    // 引用是引用 ——
    expect(quoteChipTexts()).toEqual([QUOTE.text]);
    // —— 正文是正文。少了这一条,「把整段话都塞进芯片」也能过。
    expect(composerText()).toBe(BODY);
    // 引文不该在输入框里再出现一次(那就是今天这个 bug 的样子)。
    expect(composerText()).not.toContain('>');
    expect(composerText()).not.toContain(QUOTE.text);
  });

  it('老队列里没有这个字段,照样取回正文 —— 只是没有芯片,不报错', () => {
    render(<Harness item={{ id: 'q1', prompt: FOLDED } as QueuedItem} />);

    clickEdit();

    expect(quoteChipTexts()).toEqual([]);
    expect(composerText()).toBe(FOLDED);
  });

  it('正文被改过、前缀对不上,就一个字都不拆', () => {
    const edited = '> 我自己敲的引用\n\n把首屏文案改短一点';
    render(<Harness item={{ id: 'q1', prompt: edited, meta: { quotes: [QUOTE] } } as QueuedItem} />);

    clickEdit();

    // 芯片照样回来 —— 结构上它就是有引用的。
    expect(quoteChipTexts()).toEqual([QUOTE.text]);
    // 但正文不许动:啃掉用户自己敲的那一行比多留一段引文糟得多。
    expect(composerText()).toBe(edited);
  });

  it('接着编辑另一条没有引用的,上一条的芯片必须被清掉', () => {
    // 两条队列项:第一条带引用,第二条不带。
    function TwoItems() {
      const [items, setItems] = useState<QueuedItem[]>([
        { id: 'q1', prompt: FOLDED, meta: { quotes: [QUOTE] } } as QueuedItem,
        { id: 'q2', prompt: '第二条,没有引用' } as QueuedItem,
      ]);
      return (
        <ChatPane
          projectKindForTracking="prototype"
          messages={[]}
          streaming={false}
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
          queuedItems={items}
          onRemoveQueuedSend={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
          onUpdateQueuedSend={() => {}}
        />
      );
    }
    render(<TwoItems />);

    clickEdit();
    expect(quoteChipTexts()).toEqual([QUOTE.text]);

    // 第一条已经出队,现在这颗「编辑」是第二条的。
    clickEdit();

    // 芯片不清掉的话,它会被折进下一发的正文里 —— 用户没选过的引用凭空出现。
    expect(quoteChipTexts()).toEqual([]);
    expect(composerText()).toBe('第二条,没有引用');
  });

  it('标注跟着回来,而且只回来一次', () => {
    render(
      <Harness item={{ id: 'q1', prompt: BODY, commentAttachments: [mark] } as QueuedItem} />,
    );

    clickEdit();

    const tray = screen.getByTestId('staged-comment-attachments');
    expect(tray.querySelectorAll('.staged-chip')).toHaveLength(1);
  });
});
