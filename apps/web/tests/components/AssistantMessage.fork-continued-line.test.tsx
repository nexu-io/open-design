// @vitest-environment jsdom

/**
 * OPEND-2714 — 分叉后的来源提示收成**一行**。
 *
 * 原来是两块:一条写着源会话标题的分界线,底下再一行脚注。改成 Codex 那种 ——
 * **分界线中间**放一枚分支图标配一行文案,源会话标题不再出现在界面上。
 *
 * 判据全部落在结构上:jsdom 不排版、不解 `var()`,量「是不是一行」只能靠
 * 「线里只剩一个标签、标签外面没有第二块」,量颜色 / 行高都是假绿。
 */

import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import { en } from '../../src/i18n/locales/en';
import type { ChatMessage } from '../../src/types';

const CHAT_CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../src/styles/chat.css'),
  'utf-8',
);

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
      setItem: (k: string, v: string) => store.set(k, v),
    },
  });
});

afterEach(cleanup);

const SOURCE_TITLE = '商城原型';

function forkedTurn(): ChatMessage {
  return {
    id: 'seeded-tail',
    role: 'assistant',
    content: '两页都好了。',
    runStatus: 'succeeded',
    startedAt: 1700000000,
    endedAt: 1700000042,
    events: [] as ChatMessage['events'],
    producedFiles: [],
    forkedInto: { title: SOURCE_TITLE, conversationId: 'src-conv' },
  } as unknown as ChatMessage;
}

function renderForked() {
  return render(
    <AssistantMessage
      message={forkedTurn()}
      streaming={false}
      isLast
      projectId="p1"
      errorCardOwnerId={null}
      onFeedback={vi.fn()}
    />,
  );
}

describe('分叉后的来源提示', () => {
  it('英文文案逐字是参考图那句', () => {
    expect(en['assistant.forkNote']).toBe('Continued from chat');
  });

  it('只有一块 —— 脚注住在分界线里,线外面没有第二块', () => {
    const { container } = renderForked();

    const divider = container.querySelector('[data-testid="assistant-fork-divider"]');
    const note = container.querySelector('[data-testid="assistant-fork-note"]');
    expect(divider).toBeTruthy();
    expect(note).toBeTruthy();
    expect(divider!.contains(note!)).toBe(true);
    expect(container.querySelectorAll('.fork-note')).toHaveLength(1);
    expect(container.querySelector('.fork-sep ~ .fork-note')).toBeNull();
  });

  it('线里是 hairline · 标签 · hairline 三样,标签就是那一行文案', () => {
    const { container } = renderForked();

    const divider = container.querySelector('[data-testid="assistant-fork-divider"]')!;
    expect(Array.from(divider.children).map((el) => el.tagName)).toEqual([
      'I',
      'SPAN',
      'I',
    ]);
    expect(divider.textContent).toBe('Continued from chat');
  });

  it('标签是分支图标配文案', () => {
    const { container } = renderForked();

    const note = container.querySelector('[data-testid="assistant-fork-note"]')!;
    expect(note.querySelector('svg')).toBeTruthy();
    expect(note.textContent).toBe('Continued from chat');
  });

  /*
   * 文案由**自己的那个元素**承载,不是图标旁边的一段裸文本。
   *
   * 这是「过长要出省略号」的前提:并成一行之后图标和字是并排的,裸文本会落进
   * 一个匿名盒里,而匿名盒没有任何抓手 —— 样式够不着,测试也够不着。
   * 这里只问结构,**不问样式**;省略号到底画没画出来要真浏览器才看得见,
   * 那条守卫在 `e2e/ui/fork-note-ellipsis.test.ts`(受限宽度 + 最长的那支译文)。
   */
  it('文案由自己那个元素承载,不是图标旁边的裸文本', () => {
    const { container } = renderForked();

    const note = container.querySelector('[data-testid="assistant-fork-note"]')!;
    const label = container.querySelector('[data-testid="assistant-fork-note-label"]');
    expect(label).toBeTruthy();
    expect(note.contains(label!)).toBe(true);
    expect(label!.textContent).toBe('Continued from chat');
    // 图标旁边不该再剩一段没人管的文本节点 —— 剩了就说明文案有两个出处。
    const looseText = Array.from(note.childNodes).filter(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim(),
    );
    expect(looseText).toHaveLength(0);
  });

  it('源会话标题不再出现在界面上', () => {
    const { container } = renderForked();

    expect(container.textContent).not.toContain(SOURCE_TITLE);
    expect(container.querySelector(`[title="${SOURCE_TITLE}"]`)).toBeNull();
  });
});

/**
 * 脚注的静音色,量在**真正渲染出来的那个节点**上。
 *
 * `message-muted-ink.test.tsx` 已经钉了同一件事,但它的夹具是一个**裸的**
 * `<div class="fork-note">` —— 那种问法只答得了「`.fork-note` 自己有没有」,
 * 答不了「它在线里还赢不赢」。脚注搬进 `.fork-sep` 之后这是两个问题:
 * 祖先侧只要写一条 `.fork-sep span { color }`(0-1-1)就能盖过 `.fork-note`
 * (0-1-0),裸夹具照样绿,产品里却已经不是静音色了。这一条就是补那半边。
 *
 * jsdom 跑层叠、继承自定义属性,但**不解析 `var()`** —— 所以问的是「最终落在
 * 这个元素上的是哪一条声明」,不是像素颜色。真实像素另有无头 Chrome 量。
 */
describe('分叉脚注的静音色(层叠意义上的)', () => {
  beforeAll(() => {
    const style = document.createElement('style');
    style.textContent = CHAT_CSS;
    document.head.appendChild(style);
  });

  it('线里那一格最终引用的仍是消息静音 token,没被祖先的规则盖掉', () => {
    const { container } = renderForked();
    const note = container.querySelector<HTMLElement>('[data-testid="assistant-fork-note"]')!;

    expect(getComputedStyle(note).color).toBe('var(--chat-message-muted-ink)');
    expect(getComputedStyle(note).getPropertyValue('--chat-message-muted-ink').trim())
      .toBe('#a3a3a3');
  });
});
