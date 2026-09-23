// @vitest-environment jsdom
/**
 * W124 —— 聊天面板的**可见提示**与面板头两颗图标键。
 *
 * 稿子基线 `729fa43ce7`(PR #7170,`design/chat-cards-surface`)。
 *
 * 覆盖四件事,每一条都指到稿子的**字节**,不引用镜像陈列页:
 *
 *  ① `components/chat/` 子树里一个可见提示都没有(只有 `aria-label`,读屏听得到、
 *     用眼睛的人没有)。稿子在三处明确要求有:
 *       - `src/body-components.html:1041` `.th` × 4  `data-tip="查看大图"`
 *       - `src/body-components.html:324`   `.ch`      `data-tip="查看详情"`
 *       - `src/body-scene.html:302`        `.errb .ops` `data-tip="联系支持"`
 *  ② 面板头「历史」那颗今天挂的是**原生 `title`** —— 正是稿子
 *     `src/components.css:2684-2686` 点名反对的做法(「原生 tip 要等半秒到两秒
 *     ……等到时手已经点下去了」)。文案与字形也要跟稿:
 *       `src/body-scene.html:7` `aria-label="历史会话" data-tip="历史会话"`,
 *       描边时钟 + 回退箭头三条 path。
 *  ③ 面板头第二颗图标键「新会话」:`src/body-scene.html:8`,描边十字 + `data-tip="新会话"`,
 *     `mod-tip-b` ⇒ 气泡朝下(`src/components.css:2719-2721`)。
 *
 * ## 为什么断言只挑 `d` / `fill` / `stroke` / `data-tooltip` / `aria-label`
 *
 * 这几样是 React 直接写进 DOM 的**真属性**,不经样式管道。本仓库在样式/图标测试上
 * 出过多次假绿:vitest 的 CSS Module 代理对任何 key 都回一个类名(「有没有某个 class」
 * 证明不了样式生效),jsdom 又不加载样式表(`getComputedStyle` 常读出空值,
 * 两边都 `<unset>` 时 `toBe` 真空通过)。所以这里一律读属性,取不到就抛。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen, within } from '@testing-library/react';
import { forwardRef, type ReactElement } from 'react';

import { I18nProvider } from '../../../src/i18n';
import { ImageRow } from '../../../src/components/chat/primitives/ImageRow';
import { Reconnect } from '../../../src/components/chat/Reconnect';
import { ChatPane } from '../../../src/components/ChatPane';
import type { ImageRow as ImageRowData } from '../../../src/runtime/chat/contract';
import type { AppConfig, ChatMessage } from '../../../src/types';

import { ar } from '../../../src/i18n/locales/ar';
import { de } from '../../../src/i18n/locales/de';
import { en } from '../../../src/i18n/locales/en';
import { esES } from '../../../src/i18n/locales/es-ES';
import { fa } from '../../../src/i18n/locales/fa';
import { fr } from '../../../src/i18n/locales/fr';
import { hu } from '../../../src/i18n/locales/hu';
import { id } from '../../../src/i18n/locales/id';
import { it as itLocale } from '../../../src/i18n/locales/it';
import { ja } from '../../../src/i18n/locales/ja';
import { ko } from '../../../src/i18n/locales/ko';
import { pl } from '../../../src/i18n/locales/pl';
import { ptBR } from '../../../src/i18n/locales/pt-BR';
import { ru } from '../../../src/i18n/locales/ru';
import { th } from '../../../src/i18n/locales/th';
import { tr } from '../../../src/i18n/locales/tr';
import { uk } from '../../../src/i18n/locales/uk';
import { zhCN } from '../../../src/i18n/locales/zh-CN';
import { zhTW } from '../../../src/i18n/locales/zh-TW';

/* ── 稿子里那几段字节。改这里 = 改判据,请先回 `729fa43ce7` 核对 ────────── */

/** `src/body-scene.html:7` —— 描边时钟 + 回退箭头 */
/* OPEND-3087(Demo #8113):「历史」换成实心 discuss-line,一条 path。 */
const DEMO_HISTORY_PATH =
  'M14 22.5L11.2 19H6C5.44772 19 5 18.5523 5 18V7.10256C5 6.55028 5.44772 6.10256 6 6.10256H22C22.5523 6.10256 23 6.55028 23 7.10256V18C23 18.5523 22.5523 19 22 19H16.8L14 22.5ZM15.8387 17H21V8.10256H7V17H11.2H12.1613L14 19.2984L15.8387 17ZM2 2H19V4H3V15H1V3C1 2.44772 1.44772 2 2 2Z';
/** `src/body-scene.html:8` —— 描边十字(一条 path 走两笔) */
const DESIGN_NEW_SESSION_PATH = 'M12 5v14M5 12h14';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** 取属性,取不到就抛 —— 绝不返回 undefined 让 `toBe(undefined)` 真空通过 */
function attr(el: Element, name: string): string {
  const value = el.getAttribute(name);
  if (value === null) {
    throw new Error(`<${el.tagName.toLowerCase()}> 上没有 ${name} 属性`);
  }
  return value;
}

function classList(el: Element): string[] {
  return String(el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean);
}

/* ══ ① `components/chat/` 子树的三处可见提示 ══════════════════════════ */

const render = (ui: ReactElement) => rtlRender(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);

function settledImageRow(total: number): ImageRowData {
  return {
    kind: 'image',
    id: 'img-1',
    surface: 'image',
    total,
    done: total,
    failed: 0,
    thumbs: Array.from({ length: total }, (_, i) => `out-${i}.png`),
    pending: false,
    elapsedMs: 2600,
  };
}

describe('① 缩略图条 —— 稿子 body-components.html:1041 的 data-tip="查看大图"', () => {
  it('收成一行之后,每一枚 26×34 的缩略图都要能自报家门', () => {
    const { container } = render(<ImageRow row={settledImageRow(4)} onOpenImage={vi.fn()} />);
    const thumbs = Array.from(container.querySelectorAll('button'));

    /* 先证判据看得见东西:一个按钮都没渲染时下面的 forEach 会空转成假绿 */
    expect(thumbs.length, '缩略图条一个按钮都没渲染出来').toBe(4);

    thumbs.forEach((thumb, i) => {
      expect(classList(thumb), `第 ${i + 1} 枚缺 od-tooltip —— 产品的气泡只认这个 class`)
        .toContain('od-tooltip');
      expect(attr(thumb, 'data-tooltip')).toBe('查看大图');
      /* aria-label 是带序号的那句,和稿子 `aria-label="查看第 1 张大图"` 一致,不许被顶掉 */
      expect(attr(thumb, 'aria-label')).toBe(`查看第 ${i + 1} 张大图`);
    });
  });
});

describe('① 重连行 —— 稿子 body-components.html:324 的 data-tip="查看详情"', () => {
  it('⌄ 那颗按钮要带可见提示', () => {
    const { container } = render(<Reconnect attempt={2} max={5} onShowDetail={vi.fn()} />);
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.length, '重连行没渲染出那颗 ⌄').toBe(1);

    const detail = buttons[0]!;
    expect(classList(detail)).toContain('od-tooltip');
    expect(attr(detail, 'data-tooltip')).toBe('查看详情');
    expect(attr(detail, 'aria-label')).toBe('查看详情');
  });
});

/* ══ ②③ 面板头 + ① 报错卡:走产品真实的 ChatPane 渲染路径 ════════════ */

/* i18n **不 mock**:这一组连文案一起证,判据就是稿子上那几个中文词。
   (换成「回 key」的假实现会让文案断言从判据里整个消失。) */

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

function failedMessage(): ChatMessage {
  return {
    id: 'msg-failed',
    role: 'assistant',
    content: 'Partial work before the failure.',
    createdAt: 1,
    runId: 'run-failed',
    runStatus: 'failed',
    agentId: 'amr',
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: 'Something went wrong.',
        code: 'AGENT_EXECUTION_FAILED',
      },
    ],
  } as ChatMessage;
}

function renderChat(opts: {
  messages?: ChatMessage[];
  onNewConversation?: () => void;
} = {}) {
  return render(
    <ChatPane
      messages={opts.messages ?? []}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
      amrBalanceCardUsd={null}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      onNewConversation={opts.onNewConversation ?? vi.fn()}
      config={{ agentId: 'amr', agentCliEnv: {} } as unknown as AppConfig}
    />,
  );
}

describe('① 报错卡 —— 稿子 body-scene.html:302 的 data-tip="联系支持"', () => {
  it('〔联系支持〕要挂可见提示', () => {
    renderChat({ messages: [failedMessage()] });
    const support = screen.getByTestId('chat-error-contact-support');

    expect(classList(support)).toContain('od-tooltip');
    /* ⚠️ 稿子 body-scene.html:302 的 `data-tip` 写的是「联系支持」,
       OPEND-2807 把这颗按钮的文案改成「联系我们」(19 语齐),工单是较新的权威。
       要守的是「挂了可见提示、且和按钮文字同源」,不是那四个字本身。 */
    expect(attr(support, 'data-tooltip')).toBe('联系我们');
    expect(support.textContent).toContain('联系我们');
  });
});

describe('② 面板头「历史」—— 稿子 body-scene.html:7', () => {
  it('不许再用原生 title:改挂产品统一的 data-tooltip,气泡朝下(mod-tip-b)', () => {
    renderChat();
    const trigger = screen.getByTestId('conversation-history-trigger');

    /* 稿子 components.css:2684-2686 点名反对原生 title */
    expect(
      trigger.getAttribute('title'),
      '面板头「历史」还挂着原生 title —— 稿子明确不要这个',
    ).toBeNull();
    expect(classList(trigger)).toContain('od-tooltip');
    expect(attr(trigger, 'data-tooltip')).toBe('历史会话');
    expect(attr(trigger, 'aria-label')).toBe('历史会话');
    expect(attr(trigger, 'data-tooltip-placement')).toBe('bottom');
  });

  it('字形是 Demo #8113 那枚 16px 实心 discuss-line', () => {
    renderChat();
    const trigger = screen.getByTestId('conversation-history-trigger');
    const svg = trigger.querySelector('svg');
    if (!svg) throw new Error('「历史」按钮里没有 svg');

    expect(attr(svg, 'fill')).toBe('currentColor');
    expect(attr(svg, 'stroke')).toBe('none');
    expect(attr(svg, 'width')).toBe('16');
    expect(attr(svg, 'height')).toBe('16');

    const ds = Array.from(svg.querySelectorAll('path')).map((p) => attr(p, 'd'));
    expect(ds, '「历史」的 path 和 Demo 的 discuss-line 对不上').toEqual([DEMO_HISTORY_PATH]);
  });
});

describe('③ 「新会话」—— 稿子 body-scene.html:8,OPEND-3087 挪进历史下拉', () => {
  function openMenu() {
    fireEvent.click(screen.getByTestId('conversation-history-trigger'));
    return screen.getByTestId('conversation-history-menu');
  }

  it('下拉里那枚图标键带可见提示、气泡朝下', () => {
    renderChat();
    const button = within(openMenu()).getByTestId('chat-new-conversation');

    expect(classList(button)).toContain('od-tooltip');
    expect(attr(button, 'data-tooltip')).toBe('新会话');
    expect(attr(button, 'aria-label')).toBe('新会话');
    expect(attr(button, 'data-tooltip-placement')).toBe('bottom');
  });

  it('字形是稿子那枚描边十字', () => {
    renderChat();
    const svg = within(openMenu()).getByTestId('chat-new-conversation').querySelector('svg');
    if (!svg) throw new Error('「新会话」按钮里没有 svg');

    expect(attr(svg, 'fill')).toBe('none');
    expect(attr(svg, 'stroke')).toBe('currentColor');
    const ds = Array.from(svg.querySelectorAll('path')).map((p) => attr(p, 'd'));
    expect(ds).toEqual([DESIGN_NEW_SESSION_PATH]);
  });

  it('点下去就是现有的「新建会话」那条路 —— 不新开第二套行为', () => {
    const onNewConversation = vi.fn();
    renderChat({ onNewConversation });

    fireEvent.click(within(openMenu()).getByTestId('chat-new-conversation'));
    expect(onNewConversation).toHaveBeenCalledTimes(1);
  });

  /*
   * 产品裁决 2026-09-03 收敛成一个入口;OPEND-3087(Demo #8113)把这唯一一个
   * 从面板头挪进历史下拉。这里守两头:面板头没有、下拉里有且只有一枚。
   * 完整的 ③ 判据在 `w129-new-session-single-entry.test.tsx`。
   */
  it('面板头没有新建按钮,历史下拉里有且只有一枚', () => {
    renderChat();
    expect(screen.queryByTestId('chat-new-conversation')).toBeNull();
    const menu = openMenu();
    expect(within(menu).getByTestId('chat-new-conversation')).toBeTruthy();
    expect(screen.queryAllByTestId('chat-new-conversation').length).toBe(1);
    expect(screen.queryByTestId('conversation-history-new')).toBeNull();
  });
});

/* ══ i18n:文案本体 ════════════════════════════════════════════════ */

const LOCALES = {
  ar, de, en, 'es-ES': esES, fa, fr, hu, id, it: itLocale, ja, ko, pl,
  'pt-BR': ptBR, ru, th, tr, uk, 'zh-CN': zhCN, 'zh-TW': zhTW,
} as const;

const NEW_KEYS = ['chat.newSession', 'chat.record.viewLarge'] as const;

describe('i18n —— 19 语一个都不能少', () => {
  it('清点:确实是 19 本词典', () => {
    expect(Object.keys(LOCALES).length).toBe(19);
  });

  NEW_KEYS.forEach((key) => {
    it(`${key} 在 19 本词典里都有真翻译(不许 TODO / 不许英文占位回落)`, () => {
      Object.entries(LOCALES).forEach(([locale, dict]) => {
        const value: string = dict[key];
        expect(value, `${locale} 缺 ${key}`).toBeTruthy();
        expect(value, `${locale} 的 ${key} 写成了 TODO`).not.toMatch(/TODO/i);
      });
    });
  });

  it('中文按稿子的字面走 —— 稿子是唯一的中文事实源', () => {
    /* body-scene.html:7 / :8 / body-components.html:1041 */
    expect(zhCN['chat.conversationsTitle']).toBe('历史会话');
    expect(zhCN['chat.conversationsAria']).toBe('历史会话');
    expect(zhCN['chat.newSession']).toBe('新会话');
    expect(zhCN['chat.record.viewLarge']).toBe('查看大图');
    /* 稿子 body-components.html:324 */
    expect(zhCN['chat.edge.reconnectDetail']).toBe('查看详情');
    /* ⚠️ 稿子 body-scene.html:302 写的是「联系支持」,但 OPEND-2807 的工单
       逐字给的是「联系我们」——工单较新,以它为准。 */
    expect(zhCN['chat.runError.contactSupportCta']).toBe('联系我们');
  });

  it('zh-TW 跟着 zh-CN 走同一套词序', () => {
    expect(zhTW['chat.conversationsTitle']).toBe('歷史會話');
    expect(zhTW['chat.conversationsAria']).toBe('歷史會話');
    expect(zhTW['chat.newSession']).toBe('新會話');
    expect(zhTW['chat.record.viewLarge']).toBe('查看大圖');
  });
});
