// @vitest-environment jsdom
// S05 BYOK invalid-key copy must remain distinct from local-CLI S02.
// G16 replaces every card-local settings/terminal action with the fixed Cloud
// handoff; it does not change failure classification or approved copy.
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { forwardRef } from 'react';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../src/types';

const translate = (key: string, vars?: Record<string, string | number>) => {
  if (vars && Object.keys(vars).length > 0) {
    return `${key} ${Object.values(vars).join(' ')}`;
  }
  return key;
};

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));

vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => (
    <div data-testid={`assistant-${message.id}`}>{message.content}</div>
  ),
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

vi.mock('../../src/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/events')>();
  return {
    ...actual,
    trackChatPanelClick: vi.fn(),
    trackRunFailedToastSurfaceView: vi.fn(),
    trackRunRecoveryActionClick: vi.fn(),
    trackRunRecoveryActionSurfaceView: vi.fn(),
  };
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

/**
 * 上游原样送上来的那句话。opencode 把提供商的 401 归一成这一句,daemon 原样带出
 * (`error.message`),`ProjectView` 再把它塞进面板级 error 槽
 * (`setRunError(err.message, assistantId)`)。
 */
const RAW_INVALID_KEY = 'API key is invalid.';

/** 兜底那一档的两枚指纹 —— 卡上出现任意一个就说明这一格还在兜底里。 */
const GENERIC_TITLE_KEY = 'chat.runError.title.generic';
const FALLBACK_MESSAGE_KEY = 'chat.runError.fallbackMessage';

interface FailedRunOptions {
  failureDetail: string;
  agentId?: string;
  code?: string;
  raw?: string;
  failureAction?: string;
  retryable?: boolean;
}

function failedMessage(options: FailedRunOptions): ChatMessage {
  return {
    id: 'msg-failed',
    role: 'assistant',
    content: '',
    createdAt: 1,
    runId: 'run-1',
    runStatus: 'failed',
    agentId: options.agentId ?? 'byok-opencode',
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: options.raw ?? RAW_INVALID_KEY,
        // BYOK 走的是 ACP 那条路,`fail()` 写死这颗码 —— 不是 AGENT_AUTH_REQUIRED。
        code: options.code ?? 'AGENT_EXECUTION_FAILED',
        failureDetail: options.failureDetail,
        failureAction: options.failureAction ?? 'login',
        retryable: options.retryable ?? false,
      },
    ],
  } as unknown as ChatMessage;
}

function renderChat(message: ChatMessage, onOpenSettings = vi.fn()) {
  const onSwitchToAmrAndRetry = vi.fn();
  const rendered = render(
    <ChatPane
      messages={[message]}
      streaming={false}
      error={(message.events?.[0] as { detail?: string } | undefined)?.detail ?? RAW_INVALID_KEY}
      errorSourceAssistantId="msg-failed"
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
      onOpenSettings={onOpenSettings}
      onSwitchToAmrAndRetry={onSwitchToAmrAndRetry}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={
        {
          // 跟着这条消息走 —— 卡是钉在失败那一轮的助手消息上的
          // (`resolveRunFailureUi` 读 `retryAssistant.agentId`),config 只是陪衬。
          agentId: (message as { agentId?: string }).agentId ?? 'byok-opencode',
          agentCliEnv: {},
        } as unknown as AppConfig
      }
    />,
  );
  return { ...rendered, onOpenSettings, onSwitchToAmrAndRetry };
}

const cardOf = (container: HTMLElement) =>
  container.querySelector('[data-user-action-card="run-recovery"]');

const descriptionOf = (container: HTMLElement) =>
  cardOf(container)?.querySelector('[data-testid="chat-run-error-description"]') ?? null;

const titleOf = (container: HTMLElement) => cardOf(container)?.firstElementChild ?? null;

const openSettingsButtonOf = (container: HTMLElement) =>
  cardOf(container)?.querySelector('[data-testid="chat-error-open-settings"]') ?? null;

describe('S05 · 自带 API key 错误保留专属文案，入口按 G16 固定', () => {
  it('标题不再是通用「任务执行失败」,而是 S05 的润色标题', () => {
    const { container } = renderChat(failedMessage({ failureDetail: 'invalid_api_key' }));
    const title = titleOf(container);
    expect(title).toBeTruthy();
    expect(title!.textContent).toContain('chat.runError.title.apiKeyInvalid');
    expect(title!.textContent).not.toContain(GENERIC_TITLE_KEY);
  });

  it('正文不再是兜底句,而是 S05 的润色正文', () => {
    const { container } = renderChat(failedMessage({ failureDetail: 'invalid_api_key' }));
    const description = descriptionOf(container);
    expect(description).toBeTruthy();
    expect(description!.textContent).toContain('chat.runError.apiKeyInvalidMessage');
    expect(description!.textContent).not.toContain(FALLBACK_MESSAGE_KEY);
  });

  it('上游那句英文原文不上卡面 —— 卡上只说人话', () => {
    const { container } = renderChat(failedMessage({ failureDetail: 'invalid_api_key' }));
    expect(descriptionOf(container)!.textContent ?? '').not.toContain(RAW_INVALID_KEY);
  });

  it('卡内固定为联系、导出日志和 Cloud，不再出现去设置', () => {
    const { container } = renderChat(failedMessage({ failureDetail: 'invalid_api_key' }));
    expect(within(cardOf(container) as HTMLElement).getAllByRole('button').map((button) => button.textContent?.trim()))
      .toEqual(['chat.runError.contactSupportCta', 'chat.runError.exportLogsCta', 'chat.amrCard.switchCta']);
    expect(openSettingsButtonOf(container)).toBeNull();
  });

  it('点击 Cloud 将原失败消息交给宿主，不调用旧设置入口', () => {
    const { container, onOpenSettings, onSwitchToAmrAndRetry } = renderChat(
      failedMessage({ failureDetail: 'invalid_api_key' }),
    );
    fireEvent.click(within(cardOf(container) as HTMLElement).getByRole('button', { name: 'chat.amrCard.switchCta' }));
    expect(onSwitchToAmrAndRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-failed', agentId: 'byok-opencode' }));
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  // daemon 对这一格的 code 有两种写法(ACP 的 AGENT_EXECUTION_FAILED,以及
  // 认出授权失败时的 AGENT_AUTH_REQUIRED)。**同一个 BYOK agent** 的这两条都要落到
  // S05 —— 否则同一件事会因为码不同渲染成两张卡。
  //
  // 注意这一条的作用域:它说的是「BYOK 这一轮,码不同也是同一张卡」,不是「谁报
  // invalid_api_key 都归 S05」。后者正是评审拦下来的越界,钉在下面那个 describe。
  it('BYOK 的码是 AGENT_AUTH_REQUIRED 时同样落 S05,而不是 S02「尚未登录」', () => {
    const { container } = renderChat(
      failedMessage({ failureDetail: 'invalid_api_key', code: 'AGENT_AUTH_REQUIRED' }),
    );
    expect(titleOf(container)!.textContent).toContain('chat.runError.title.apiKeyInvalid');
    expect(titleOf(container)!.textContent).not.toContain(
      'chat.runError.title.signInRequired.other',
    );
  });
});

/** The original review narrowed S05 to API keys managed by Open Design.
 * Keep local CLI authentication failures in S02; fixed actions must not erase
 * this distinction or send users to a settings page that cannot edit their key.
 */
describe('评审拦截 · S05 只给 Open Design 管理的 API key', () => {
  // 本机 CLI 那一档原本走的就是这张卡:code `AGENT_AUTH_REQUIRED` →
  // `resolveRunFailureUi` 末段那条码级分支 → S02。这里断言的是「保留原状」,
  // 不是新设计 —— 这两把 i18n key 在这个 PR 之前就在用。
  const S02_TITLE = 'chat.runError.title.signInRequired.other';
  const S02_MESSAGE = 'chat.runError.signInMessage.other';

  it('claude 报 key 错仍是 S02「{agent} 尚未登录」,且不长出〔去设置〕', () => {
    const { container } = renderChat(
      failedMessage({
        agentId: 'claude',
        failureDetail: 'invalid_api_key',
        code: 'AGENT_AUTH_REQUIRED',
        raw: 'Invalid API key · Please run /login',
      }),
    );
    expect(titleOf(container)!.textContent).toContain(S02_TITLE);
    expect(titleOf(container)!.textContent).not.toContain(
      'chat.runError.title.apiKeyInvalid',
    );
    expect(descriptionOf(container)!.textContent).toContain(S02_MESSAGE);
    expect(openSettingsButtonOf(container)).toBeNull();
  });

  // 评审点名的那个:opencode 在设置页那一屏连 key 输入框都没有。
  it('opencode 报 key 错仍是 S02,且不长出〔去设置〕', () => {
    const { container } = renderChat(
      failedMessage({
        agentId: 'opencode',
        failureDetail: 'invalid_api_key',
        code: 'AGENT_AUTH_REQUIRED',
        raw: 'AI_APICallError: Invalid API key',
      }),
    );
    expect(titleOf(container)!.textContent).toContain(S02_TITLE);
    expect(descriptionOf(container)!.textContent).toContain(S02_MESSAGE);
    expect(openSettingsButtonOf(container)).toBeNull();
  });

  // BYOK 那一档不只有 `byok-opencode`:`mode === 'api'` 的一轮,消息上记的是
  // `API_PROTOCOL_AGENT_IDS` 里那八个 `*-api` 之一
  // (`ProjectView` 的 `apiProtocolAgentId(config.apiProtocol)`)。收窄不能把
  // 它们一起关在门外 —— 它们的 key 就填在设置页那一屏。
  it.each(['anthropic-api', 'openai-api', 'bedrock-api'])(
    '%s 保留 S05 文案，并把原失败交给固定 Cloud 入口',
    (agentId) => {
      const { container, onOpenSettings, onSwitchToAmrAndRetry } = renderChat(
        failedMessage({ agentId, failureDetail: 'invalid_api_key' }),
      );
      expect(titleOf(container)!.textContent).toContain(
        'chat.runError.title.apiKeyInvalid',
      );
      expect(openSettingsButtonOf(container)).toBeNull();
      fireEvent.click(within(cardOf(container) as HTMLElement).getByRole('button', { name: 'chat.amrCard.switchCta' }));
      expect(onSwitchToAmrAndRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-failed', agentId }));
      expect(onOpenSettings).not.toHaveBeenCalled();
    },
  );

  // Antigravity 的登录只能在终端里做,它在 `resolveRunFailureUi` 里排在这一格
  // **之前**,本来就抢不走。钉一条,免得日后有人把这一格往上挪。
  it('antigravity 保留 S02 文案，卡内入口改为 Cloud', () => {
    const { container, onSwitchToAmrAndRetry } = renderChat(
      failedMessage({
        agentId: 'antigravity',
        failureDetail: 'invalid_api_key',
        code: 'AGENT_AUTH_REQUIRED',
        raw: 'invalid api key',
      }),
    );
    expect(titleOf(container)!.textContent).toContain(S02_TITLE);
    expect(openSettingsButtonOf(container)).toBeNull();
    fireEvent.click(within(cardOf(container) as HTMLElement).getByRole('button', { name: 'chat.amrCard.switchCta' }));
    expect(onSwitchToAmrAndRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-failed', agentId: 'antigravity' }));
  });
});

// 反向锚点:随手挑两个**已经在表里**的 detail,确认它们的卡一个字都没被动到。
// 一个来自同一张表(`DETAIL_FAILURE_UI` 的 `cli_not_installed`),一个来自排在
// 更前面的那张(`AGENT_AGNOSTIC_DETAIL_FAILURE_UI` 的 `timeout`)—— 新增一行
// 最常见的回归形状就是顺手改坏了邻居,或者把解析顺序挪了位。
describe('反向锚点:别人的格没被动', () => {
  it('cli_not_installed 仍是 S01「未检测到 {agent}」,且不长出〔去设置〕', () => {
    const { container } = renderChat(
      failedMessage({
        failureDetail: 'cli_not_installed',
        raw: 'command not found: opencode',
        failureAction: 'install_cli',
      }),
    );
    expect(titleOf(container)!.textContent).toContain('chat.runError.title.cliMissing');
    expect(descriptionOf(container)!.textContent).toContain(
      'chat.runError.cliMissingMessage',
    );
    expect(openSettingsButtonOf(container)).toBeNull();
  });

  it('timeout 仍是「运行超时」,且不长出〔去设置〕', () => {
    const { container } = renderChat(
      failedMessage({
        failureDetail: 'timeout',
        raw: 'run exceeded the maximum duration',
        failureAction: 'retry',
        retryable: true,
      }),
    );
    expect(titleOf(container)!.textContent).toContain('chat.runError.title.timedOut');
    expect(descriptionOf(container)!.textContent).toContain('chat.runError.timedOutMessage');
    expect(openSettingsButtonOf(container)).toBeNull();
  });
});

/**
 * 19 个语言包的路径 —— 从磁盘数,不写死清单(同 `run-error-ladder.test.ts`)。
 * 不用 `import.meta.glob`:那是 Vite 的编译期语法,`apps/web` 的 `tsc` 不认。
 */
const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../src/i18n/locales');

function localeModulePaths(): string[] {
  return readdirSync(LOCALES_DIR)
    .filter((name) => name.endsWith('.ts'))
    .sort()
    .map((name) => join(LOCALES_DIR, name));
}

async function loadLocaleDict(path: string): Promise<Record<string, string>> {
  const mod = (await import(/* @vite-ignore */ path)) as Record<string, unknown>;
  return (mod.default ?? Object.values(mod)[0]) as Record<string, string>;
}

describe('S05 文案进了 19 个语言包,中文那两句逐字照抄产品文档', () => {
  const NEW_KEYS = [
    'chat.runError.title.apiKeyInvalid',
    'chat.runError.apiKeyInvalidMessage',
  ] as const;

  // 现场 transform 19 个 locale 文件,机器忙的时候会逼近 vitest 默认的 5s ——
  // 那种红是环境噪音,不是回归。
  it('每个语种都有这两条,且都不是空串', { timeout: 30_000 }, async () => {
    const paths = localeModulePaths();
    expect(paths).toHaveLength(19);
    for (const path of paths) {
      const dict = await loadLocaleDict(path);
      for (const key of NEW_KEYS) {
        expect(typeof dict[key], `${path} → ${key}`).toBe('string');
        expect(dict[key]!.trim().length, `${path} → ${key}`).toBeGreaterThan(0);
      }
    }
  });

  // 文案的唯一权威是产品《报错文案》文档 S05 的「润色标题」/「润色正文」两列。
  // 这两句被随手改写(或退回自拟)是这一格最可能的回归形状,所以逐字钉住。
  it('zh-CN 是 S05 那两句的原文', async () => {
    const dict = await loadLocaleDict(join(LOCALES_DIR, 'zh-CN.ts'));
    expect(dict['chat.runError.title.apiKeyInvalid']).toBe('模型设置不完整');
    expect(dict['chat.runError.apiKeyInvalidMessage']).toBe(
      'API key 配置错误，请重新填写后重试。',
    );
  });

  it('没有任何语种给这两句加插值位 —— S05 的主语是固定的', { timeout: 30_000 }, async () => {
    for (const path of localeModulePaths()) {
      const dict = await loadLocaleDict(path);
      for (const key of NEW_KEYS) {
        expect(dict[key], `${path} → ${key}`).not.toMatch(/\{\w+\}/);
      }
    }
  });
});
