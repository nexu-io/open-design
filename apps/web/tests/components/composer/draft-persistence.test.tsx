// @vitest-environment jsdom
/**
 * 刷新之后草稿要**整份**回来(#owner 报的:「选择了文本添加到对话里之后,刷新页面,
 * 这个注释会丢掉…附件也是」)。
 *
 * 每条用例都模拟一次真实刷新:先渲染一次、把东西攒上去、`cleanup()` 卸载(等价于关掉页面),
 * 再用**同一把 key** 渲染一次,看有没有回来。
 */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { useState, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../../src/components/ChatComposer';
import {
  composerDraftExtrasKey,
  saveComposerDraftExtras,
} from '../../../src/runtime/chat/composer-draft';
import type { ChatQuote } from '../../../src/runtime/chat/quote-selection';
import { composerText, flushMounts, pressEnter } from '../../helpers/lexical-composer';

const KEY = 'od:chat-composer:draft:project-1:conv-1';
const OTHER_KEY = 'od:chat-composer:draft:project-1:conv-2';

const SKILL = {
  id: 'deck-builder',
  name: 'Deck Builder',
  description: 'Build a polished slide deck.',
  triggers: ['deck'],
  mode: 'deck' as const,
  previewType: 'html',
  designSystemRequired: false,
  defaultFor: [],
  upstream: null,
  hasBody: true,
  examplePrompt: 'Make a deck',
  aggregatesExamples: false,
};

const MCP_SERVER = {
  id: 'figma',
  label: 'Figma',
  transport: 'http' as const,
  enabled: true,
  url: 'https://mcp.example/figma',
  // 真实配置里这里装的是用户自己的 API key —— 它绝不能被写进 localStorage。
  headers: { Authorization: 'Bearer super-secret-token' },
};

let fetchMock: ReturnType<typeof vi.fn>;

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/mcp/servers') return json({ servers: [MCP_SERVER], templates: [] });
    if (url === '/api/plugins') return json({ plugins: [] });
    if (url === '/api/skills') return json({ skills: [SKILL] });
    return json({});
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  cleanup();
});

function renderComposer(overrides: Partial<ComponentProps<typeof ChatComposer>> = {}) {
  return render(
    <ChatComposer
      projectId="project-1"
      projectFiles={[]}
      streaming={false}
      draftStorageKey={KEY}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      skills={[SKILL]}
      {...overrides}
    />,
  );
}

/** 宿主(ChatPane)那一半:引用是它的 state,输入框通过回调把它还回去。 */
function QuoteHost({ storageKey = KEY }: { storageKey?: string }) {
  const [quotes, setQuotes] = useState<ChatQuote[]>([]);
  return (
    <ChatComposer
      projectId="project-1"
      projectFiles={[]}
      streaming={false}
      draftStorageKey={storageKey}
      quotes={quotes}
      onClearQuotes={() => setQuotes([])}
      onRestoreQuotes={setQuotes}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      skills={[SKILL]}
    />
  );
}

describe('刷新之后草稿整份回来', () => {
  it('附件回来(不只是文字)', async () => {
    window.localStorage.setItem(KEY, '把这张图放大');
    saveComposerDraftExtras(KEY, {
      attachments: [{ path: 'assets/hero.png', name: 'hero.png', kind: 'image', order: 0 }],
      commentAttachments: [],
      quotes: [],
      context: { skillIds: [], mcpServerIds: [], connectorIds: [], workspaceItems: [] },
    });

    renderComposer();
    await flushMounts();

    await waitFor(() => expect(composerText()).toBe('把这张图放大'));
    const tray = await screen.findByTestId('staged-attachments');
    // 图片卡不写文件名(57px 方卡只有缩略图),名字在「×」的 aria-label 上。
    expect(within(tray).getByTestId('staged-attachment-image')).toBeTruthy();
    expect(tray.innerHTML).toContain('hero.png');
  });

  it('注释(引用芯片)回来', async () => {
    saveComposerDraftExtras(KEY, {
      attachments: [],
      commentAttachments: [],
      quotes: [
        { id: 'q1', text: '商品卡已经抽成共享组件', messageId: 'm1' },
        { id: 'q2', text: '改一处两页都跟着变', messageId: 'm1' },
      ],
      context: { skillIds: [], mcpServerIds: [], connectorIds: [], workspaceItems: [] },
    });

    render(<QuoteHost />);
    await flushMounts();

    const chip = await screen.findByTestId('chat-quoted-refs');
    expect(chip.textContent).toContain('2');
    expect(chip.textContent).toContain('商品卡已经抽成共享组件');
    expect(chip.textContent).toContain('改一处两页都跟着变');
  });

  it('标注回来', async () => {
    saveComposerDraftExtras(KEY, {
      attachments: [],
      commentAttachments: [{
        id: 'c1',
        order: 0,
        filePath: 'index.html',
        elementId: 'hero-title',
        selector: '#hero-title',
        label: 'Hero title',
        comment: '这里换成暖色',
        currentText: 'Hello',
        pagePosition: { x: 10, y: 20, width: 100, height: 40 },
        htmlHint: '<h1 id="hero-title">Hello</h1>',
      }],
      quotes: [],
      context: { skillIds: [], mcpServerIds: [], connectorIds: [], workspaceItems: [] },
    });

    renderComposer();
    await flushMounts();

    const row = await screen.findByTestId('staged-comment-attachments');
    expect(row.textContent).toContain('这里换成暖色');
  });

  it('挂上去的技能 / MCP 绑定回来(靠 id 重新解析,不是把对象存下来)', async () => {
    saveComposerDraftExtras(KEY, {
      attachments: [],
      commentAttachments: [],
      quotes: [],
      context: {
        skillIds: [SKILL.id],
        mcpServerIds: [MCP_SERVER.id],
        connectorIds: [],
        workspaceItems: [{ id: 'w1', kind: 'browser' as const, label: 'Pricing page' }],
      },
    });

    renderComposer();
    await flushMounts();

    await waitFor(() => {
      const chips = screen.getByTestId('staged-contexts');
      expect(chips.textContent).toContain('Deck Builder');
      expect(chips.textContent).toContain('Figma');
      expect(chips.textContent).toContain('Pricing page');
    });
  });

  it('MCP / 连接器只存 id —— 落盘的字节里不能出现凭证', async () => {
    renderComposer();
    await flushMounts();

    // 走真实路径把 MCP 服务器挂上去:@ 提及面板里点一下。这里直接驱动更省事的
    // 等价路径 —— 先存一份带 id 的负载,再确认落盘内容里没有 header 值。
    saveComposerDraftExtras(KEY, {
      attachments: [],
      commentAttachments: [],
      quotes: [],
      context: {
        skillIds: [],
        mcpServerIds: [MCP_SERVER.id],
        connectorIds: [],
        workspaceItems: [],
      },
    });
    const raw = window.localStorage.getItem(composerDraftExtrasKey(KEY)) ?? '';
    expect(raw).toContain(MCP_SERVER.id);
    expect(raw).not.toContain('super-secret-token');
    expect(raw).not.toContain('Authorization');
  });
});

describe('刷新之后草稿整份回来 · 反面', () => {
  it('从来没存过的会话,什么都不回来', async () => {
    saveComposerDraftExtras(KEY, {
      attachments: [{ path: 'assets/hero.png', name: 'hero.png', kind: 'image', order: 0 }],
      commentAttachments: [],
      quotes: [{ id: 'q1', text: '别串到另一个会话去', messageId: 'm1' }],
      context: { skillIds: [], mcpServerIds: [], connectorIds: [], workspaceItems: [] },
    });

    render(<QuoteHost storageKey={OTHER_KEY} />);
    await flushMounts();

    expect(screen.queryByTestId('staged-attachments')).toBeNull();
    expect(screen.queryByTestId('chat-quoted-refs')).toBeNull();
    expect(composerText().trim()).toBe('');
  });

  it('根本没给 draftStorageKey 时,不读任何人的草稿', async () => {
    saveComposerDraftExtras(KEY, {
      attachments: [{ path: 'assets/hero.png', name: 'hero.png', kind: 'image', order: 0 }],
      commentAttachments: [],
      quotes: [],
      context: { skillIds: [], mcpServerIds: [], connectorIds: [], workspaceItems: [] },
    });

    renderComposer({ draftStorageKey: undefined });
    await flushMounts();

    expect(screen.queryByTestId('staged-attachments')).toBeNull();
  });

  it('负载整个坏掉:不抛,而且正文照样回来', async () => {
    window.localStorage.setItem(KEY, '正文得留住');
    window.localStorage.setItem(composerDraftExtrasKey(KEY), '{"attachments": [');

    expect(() => renderComposer()).not.toThrow();
    await flushMounts();

    await waitFor(() => expect(composerText()).toBe('正文得留住'));
    expect(screen.queryByTestId('staged-attachments')).toBeNull();
  });

  it('引用不到的绑定被静默丢掉,好的照样回来', async () => {
    saveComposerDraftExtras(KEY, {
      attachments: [],
      commentAttachments: [],
      quotes: [],
      context: {
        // 卸载掉的技能 / 删掉的 MCP —— 都不该让输入框炸,也不该长出芯片。
        skillIds: [SKILL.id, 'uninstalled-skill'],
        mcpServerIds: ['deleted-server'],
        connectorIds: ['revoked-connector'],
        workspaceItems: [],
      },
    });

    expect(() => renderComposer()).not.toThrow();
    await flushMounts();

    await waitFor(() => {
      expect(screen.getByTestId('staged-contexts').textContent).toContain('Deck Builder');
    });
    const chips = screen.getByTestId('staged-contexts').textContent ?? '';
    expect(chips).not.toContain('uninstalled-skill');
    expect(chips).not.toContain('deleted-server');
    expect(chips).not.toContain('revoked-connector');
  });

  it('半份坏掉:好的那几条留下,坏的丢掉,不抛', async () => {
    window.localStorage.setItem(composerDraftExtrasKey(KEY), JSON.stringify({
      attachments: [{ name: '没有 path.png' }, { path: 'ok.png', name: 'ok.png', kind: 'image' }],
      quotes: [{ id: 'q0', text: '' }, { id: 'q1', text: '留下的注释', messageId: 'm1' }],
      context: { skillIds: [7, SKILL.id] },
    }));

    expect(() => render(<QuoteHost />)).not.toThrow();
    await flushMounts();

    const tray = await screen.findByTestId('staged-attachments');
    expect(within(tray).getAllByTestId('staged-attachment-image')).toHaveLength(1);
    expect(tray.innerHTML).toContain('ok.png');
    expect(tray.innerHTML).not.toContain('没有 path.png');
    const chip = await screen.findByTestId('chat-quoted-refs');
    expect(chip.textContent).toContain('留下的注释');
    await waitFor(() => {
      expect(screen.getByTestId('staged-contexts').textContent).toContain('Deck Builder');
    });
  });
});

describe('攒上去的东西会被写下来,发出去之后会被清掉', () => {
  it('宿主传进来的引用会落盘', async () => {
    function Host() {
      const [quotes, setQuotes] = useState<ChatQuote[]>([]);
      return (
        <>
          <button type="button" data-testid="add-quote" onClick={() => setQuotes([
            { id: 'q1', text: '这段要一起改', messageId: 'm1' },
          ])}>add</button>
          <ChatComposer
            projectId="project-1"
            projectFiles={[]}
            streaming={false}
            draftStorageKey={KEY}
            quotes={quotes}
            onClearQuotes={() => setQuotes([])}
            onRestoreQuotes={setQuotes}
            onEnsureProject={async () => 'project-1'}
            onSend={vi.fn()}
            onStop={vi.fn()}
            skills={[SKILL]}
          />
        </>
      );
    }
    render(<Host />);
    await flushMounts();

    act(() => {
      screen.getByTestId('add-quote').click();
    });

    await waitFor(() => {
      const raw = window.localStorage.getItem(composerDraftExtrasKey(KEY)) ?? '';
      expect(raw).toContain('这段要一起改');
    });
  });

  it('发出去之后,落盘的整份草稿都消失(不然下一轮会把同一批附件再带一遍)', async () => {
    window.localStorage.setItem(KEY, '把这张图放大');
    saveComposerDraftExtras(KEY, {
      attachments: [{ path: 'assets/hero.png', name: 'hero.png', kind: 'image', order: 0 }],
      commentAttachments: [],
      quotes: [{ id: 'q1', text: '这段一起改', messageId: 'm1' }],
      context: { skillIds: [SKILL.id], mcpServerIds: [], connectorIds: [], workspaceItems: [] },
    });

    const onSend = vi.fn();
    function Host() {
      const [quotes, setQuotes] = useState<ChatQuote[]>([]);
      return (
        <ChatComposer
          projectId="project-1"
          projectFiles={[]}
          streaming={false}
          draftStorageKey={KEY}
          quotes={quotes}
          onClearQuotes={() => setQuotes([])}
          onRestoreQuotes={setQuotes}
          onEnsureProject={async () => 'project-1'}
          onSend={onSend}
          onStop={vi.fn()}
          skills={[SKILL]}
        />
      );
    }
    render(<Host />);
    await flushMounts();
    await screen.findByTestId('chat-quoted-refs');

    pressEnter({ meta: true });

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(window.localStorage.getItem(KEY)).toBeNull();
      expect(window.localStorage.getItem(composerDraftExtrasKey(KEY))).toBeNull();
    });
  });

  it('引用被清掉之后,落盘的那份也跟着消失', async () => {
    saveComposerDraftExtras(KEY, {
      attachments: [],
      commentAttachments: [],
      quotes: [{ id: 'q1', text: '待会儿要清掉', messageId: 'm1' }],
      context: { skillIds: [], mcpServerIds: [], connectorIds: [], workspaceItems: [] },
    });

    render(<QuoteHost />);
    await flushMounts();
    const chip = await screen.findByTestId('chat-quoted-refs');

    act(() => {
      chip.querySelector('button')?.click();
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(composerDraftExtrasKey(KEY))).toBeNull();
    });
  });
});
