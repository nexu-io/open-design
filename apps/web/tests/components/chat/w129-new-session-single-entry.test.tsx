// @vitest-environment jsdom
/**
 * W129 ②③ —— 「新会话」这句话统一,入口收敛成一个。
 *
 * 稿子基线 `729fa43ce7`(PR #7170)。
 *
 * ## ② 文案(产品裁决 2026-09-03:**只统一聊天面板内**)
 *
 * 面板内原来三种说法:
 *   · `chat.newSession`(面板头图标键,稿 `src/body-scene.html:8` `data-tip="新会话"`)
 *   · `assistant.forkConversation`(回合动作行,稿 `src/body-components.html:1189`
 *     `data-tip="新开会话"`)
 *   · `chat.new`(历史下拉里那颗「新建」)—— 它的按钮被 ③ 删掉了,key 一并撤。
 * 面板**外**的 `chat.newConversation` 不动。
 *
 * ⚠️ 稿子自己这两处就不一致(「新会话」vs「新开会话」)。选「新会话」的依据也在稿子里:
 * `src/body-components.html:1243` 那条 fork 分界线写的是
 * `aria-label="新会话从这里开始"` —— 稿子自己把 Fork 产出的东西叫「新会话」。
 * 于是整套词族定成 名词「新会话」+ 动词「开始」:
 *   新会话 / 正在开始新会话… / 无法开始新会话。
 * 顺带收掉 W124 报告点出的**同一颗按钮里两套词**:hover 说「新开会话」、
 * 按下去变「正在分叉…」、失败提示「无法分叉这个对话」。
 *
 * 非中文语种**不生造新词**,沿用各自既有的「新建对话」措辞(`chat.newConversation`
 * 那一支的名词),只把 fork 词根换掉。
 *
 * ## ③ 入口(产品裁决:**只留面板头图标键**)
 *
 * 稿子的面板头有那枚十字键;历史下拉里那颗「新建」是产品自带的第二个入口,
 * 同一个动作两个口子 —— 删下拉那颗。两颗本来就共用同一个 `onNewConversation`
 * 与同一个 `newConversationDisabled` 门槛,所以删掉不改可达性。
 *
 * ## 判据取法
 *
 * DOM 侧只读 `data-testid` / `aria-label` / `data-tooltip` 这些 React 直写的真属性;
 * 「下拉里没有那颗」这种负向断言一律先证下拉**确实打开了**,免得组件根本没渲染
 * 也让 `toBeNull()` 真空通过。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forwardRef, type ReactElement } from 'react';

import { I18nProvider } from '../../../src/i18n';
import { ChatPane } from '../../../src/components/ChatPane';
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/* ══ ③ 入口:走产品真实的 ChatPane 渲染路径 ══════════════════════════ */

/* i18n **不 mock**:这一组连文案一起证。 */
vi.mock('../../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => (
    <div data-testid={`assistant-${message.id}`}>{message.content}</div>
  ),
}));

vi.mock('../../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

vi.mock('../../../src/components/AmrGuidance', () => ({
  AmrGuidance: () => <div data-testid="amr-guidance" />,
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

const render = (ui: ReactElement) => rtlRender(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);

function renderChat(opts: { onNewConversation?: (() => void) | null } = {}) {
  const onNewConversation = opts.onNewConversation === null
    ? undefined
    : opts.onNewConversation ?? vi.fn();
  return render(
    <ChatPane
      messages={[]}
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
      onNewConversation={onNewConversation}
      config={{ agentId: 'amr', agentCliEnv: {} } as unknown as AppConfig}
    />,
  );
}

function attr(el: Element, name: string): string {
  const value = el.getAttribute(name);
  if (value === null) throw new Error(`<${el.tagName.toLowerCase()}> 上没有 ${name} 属性`);
  return value;
}

describe('③ 新建入口只剩面板头那一枚', () => {
  it('历史下拉里那颗「新建」没了(下拉本身照常展开)', () => {
    renderChat();
    fireEvent.click(screen.getByTestId('conversation-history-trigger'));

    /* 真空探针:先证下拉确实开着,下面的 toBeNull 才有意义 */
    expect(screen.getByTestId('conversation-history-menu')).toBeTruthy();
    expect(screen.getByTestId('conversation-history-search')).toBeTruthy();

    expect(
      screen.queryByTestId('conversation-history-new'),
      '历史下拉里还留着第二个「新建」入口 —— 同一个动作两个口子',
    ).toBeNull();
  });

  it('面板头那一枚还在,点得到,走的还是同一条 onNewConversation', () => {
    const onNewConversation = vi.fn();
    renderChat({ onNewConversation });

    const button = screen.getByTestId('chat-new-conversation');
    expect(attr(button, 'aria-label')).toBe('新会话');
    fireEvent.click(button);
    expect(onNewConversation).toHaveBeenCalledTimes(1);
  });

  it('两个入口本来就同一个门槛:没有 onNewConversation 时两处一起消失', () => {
    renderChat({ onNewConversation: null });
    expect(screen.queryByTestId('chat-new-conversation')).toBeNull();

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));
    expect(screen.getByTestId('conversation-history-menu')).toBeTruthy();
    expect(screen.queryByTestId('conversation-history-new')).toBeNull();
  });
});

describe('③ 删干净:`chat.new` 这个 key 跟着它的按钮一起撤', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = (rel: string) => readFileSync(resolve(here, '../../../src', rel), 'utf8');

  it('ChatPane 里不再引用 chat.new', () => {
    const chatPane = src('components/ChatPane.tsx');
    /* 探针:文件确实读到了 */
    expect(chatPane).toContain('chat-new-conversation');
    expect(chatPane).not.toMatch(/t\(['"]chat\.new['"]\)/);
  });

  it('`chat.new` 从 Dict 与 19 本词典里一起撤掉', () => {
    expect(src('i18n/types.ts')).not.toMatch(/^\s*'chat\.new':/m);
    Object.entries(LOCALES).forEach(([locale, dict]) => {
      expect(
        (dict as unknown as Record<string, unknown>)['chat.new'],
        `${locale} 里还留着已经没人用的 chat.new`,
      ).toBeUndefined();
    });
  });
});

/* ══ ② 文案:19 语一个都不能少 ═══════════════════════════════════════ */

const LOCALES = {
  ar, de, en, 'es-ES': esES, fa, fr, hu, id, it: itLocale, ja, ko, pl,
  'pt-BR': ptBR, ru, th, tr, uk, 'zh-CN': zhCN, 'zh-TW': zhTW,
} as const;

/**
 * 各语种「正在开始新会话…」/「无法开始新会话」。
 * 每一条都从该语种**已有**的 `chat.newConversation` 名词长出来,不引入新词。
 */
const EXPECTED: Record<keyof typeof LOCALES, { busy: string; failed: string }> = {
  ar: { busy: 'جارٍ بدء محادثة جديدة…', failed: 'تعذر بدء محادثة جديدة.' },
  de: { busy: 'Neue Konversation wird gestartet…', failed: 'Neue Konversation konnte nicht gestartet werden.' },
  en: { busy: 'Starting new conversation…', failed: 'Could not start a new conversation.' },
  'es-ES': { busy: 'Iniciando nueva conversación…', failed: 'No se pudo iniciar una nueva conversación.' },
  fa: { busy: 'در حال شروع مکالمه جدید…', failed: 'شروع مکالمه جدید ممکن نبود.' },
  fr: { busy: 'Démarrage d’une nouvelle conversation…', failed: 'Impossible de démarrer une nouvelle conversation.' },
  hu: { busy: 'Új beszélgetés indítása…', failed: 'Nem sikerült új beszélgetést indítani.' },
  id: { busy: 'Memulai percakapan baru…', failed: 'Tidak dapat memulai percakapan baru.' },
  it: { busy: 'Avvio nuova conversazione…', failed: 'Impossibile avviare una nuova conversazione.' },
  ja: { busy: '新しい会話を開始中…', failed: '新しい会話を開始できませんでした。' },
  ko: { busy: '새 대화 시작 중…', failed: '새 대화를 시작할 수 없습니다.' },
  pl: { busy: 'Rozpoczynanie nowej rozmowy…', failed: 'Nie udało się rozpocząć nowej rozmowy.' },
  'pt-BR': { busy: 'Iniciando nova conversa…', failed: 'Não foi possível iniciar uma nova conversa.' },
  ru: { busy: 'Начинается новый разговор…', failed: 'Не удалось начать новый разговор.' },
  th: { busy: 'กำลังเริ่มสนทนาใหม่…', failed: 'ไม่สามารถเริ่มสนทนาใหม่ได้' },
  tr: { busy: 'Yeni konuşma başlatılıyor…', failed: 'Yeni konuşma başlatılamadı.' },
  uk: { busy: 'Починається нова розмова…', failed: 'Не вдалося почати нову розмову.' },
  'zh-CN': { busy: '正在开始新会话…', failed: '无法开始新会话。' },
  'zh-TW': { busy: '正在開始新會話…', failed: '無法開始新會話。' },
};

describe('② 面板内说同一句', () => {
  it('清点:确实是 19 本词典', () => {
    expect(Object.keys(LOCALES).length).toBe(19);
    expect(Object.keys(EXPECTED).length).toBe(19);
  });

  it('面板头图标键和回合动作行说的是同一句', () => {
    Object.entries(LOCALES).forEach(([locale, dict]) => {
      expect(dict['chat.newSession'], `${locale} 缺 chat.newSession`).toBeTruthy();
      expect(
        dict['assistant.forkConversation'],
        `${locale}:回合动作行和面板头说的不是同一句`,
      ).toBe(dict['chat.newSession']);
    });
  });

  it('中文按稿子的词族:新会话 / 正在开始新会话… / 无法开始新会话', () => {
    /* 名词取自稿 body-scene.html:8;动词取自稿 body-components.html:1243
       的 `aria-label="新会话从这里开始"` */
    expect(zhCN['chat.newSession']).toBe('新会话');
    expect(zhCN['assistant.forkConversation']).toBe('新会话');
    expect(zhCN['assistant.forkingConversation']).toBe('正在开始新会话…');
    expect(zhCN['chat.forkConversationFailed']).toBe('无法开始新会话。');

    expect(zhTW['chat.newSession']).toBe('新會話');
    expect(zhTW['assistant.forkConversation']).toBe('新會話');
    expect(zhTW['assistant.forkingConversation']).toBe('正在開始新會話…');
    expect(zhTW['chat.forkConversationFailed']).toBe('無法開始新會話。');
  });

  it('同一颗按钮里不再有两套词 —— 19 语的进行态与失败提示都跟着改', () => {
    Object.entries(LOCALES).forEach(([locale, dict]) => {
      const want = EXPECTED[locale as keyof typeof LOCALES];
      expect(dict['assistant.forkingConversation'], `${locale} 的进行态`).toBe(want.busy);
      expect(dict['chat.forkConversationFailed'], `${locale} 的失败提示`).toBe(want.failed);
    });
  });

  it('不许 TODO,也不许非英语语种直接落英文占位', () => {
    Object.entries(LOCALES).forEach(([locale, dict]) => {
      (['assistant.forkingConversation', 'chat.forkConversationFailed'] as const).forEach((key) => {
        const value: string = dict[key];
        expect(value, `${locale} 缺 ${key}`).toBeTruthy();
        expect(value, `${locale} 的 ${key} 写成了 TODO`).not.toMatch(/TODO/i);
        if (locale !== 'en') {
          expect(value, `${locale} 的 ${key} 直接落了英文原句`).not.toBe(en[key]);
        }
      });
    });
  });

  it('面板外的 chat.newConversation 没被顺手动过', () => {
    expect(zhCN['chat.newConversation']).toBe('新建对话');
    expect(zhTW['chat.newConversation']).toBe('新建對話');
    expect(en['chat.newConversation']).toBe('New conversation');
  });
});
