// @vitest-environment jsdom
//
// 红测:BYOK 的 API key 填错了(daemon `failure_detail: invalid_api_key`),
// 报错卡上一个字都没用上,渲染的是通用兜底。
//
// 实测链路(真机端到端抓到的,不是推测):
//  1. 用户在「设置 → API 提供商」里填了一把错的 key,发起一轮 `byok-opencode`;
//  2. daemon 判得**完全正确** —— `run-failure-classification.ts` 的 `authDetail`
//     从上游那句 `API key is invalid.` 里认出这一格:
//        errorCode        = AGENT_EXECUTION_FAILED
//        failureCategory  = auth
//        failureDetail    = invalid_api_key
//        failureAction    = login     ← daemon 明说该去登录 / 改 key
//        retryable        = false
//  3. web 这一侧 `invalid_api_key` 在 `apps/web/src` 里出现 **0 次** —— 三张映射表
//     一格都没有,于是整轮落到 `resolveRunFailureUi` 最后那两条兜底:标题
//     `chat.runError.title.generic`(「任务执行失败」)、正文
//     `chat.runError.fallbackMessage`(「这次没能顺利完成……把日志发给我们」),
//     卡上唯一像出路的按钮是〔联系支持〕,而**没有任何**通往改 key 的入口。
//
// 也就是说:API key 填错了,我们让用户去联系客服。
//
// 目标文案不是新写的。产品《报错文案》文档 S05「自带 API key 没配好」那一格,
// 「润色标题」=「模型设置不完整」,「润色正文」=「API key 配置错误，请重新填写后
// 重试。」,按钮 =〔去设置〕—— 逐字落进 `chat.runError.title.apiKeyInvalid` /
// `chat.runError.apiKeyInvalidMessage`,按钮复用现成的
// `chat.runError.openSettingsCta` + `onOpenSettings('execution')`(和发送前那道
// BYOK 闸门 `ProjectView.requiresByokPreflight` 落的是同一个地方)。
//
// 判据只看**渲染出来的文本**(标题行 + `data-testid="chat-run-error-description"`)
// 和按钮的 `data-testid` / 点击行为 —— 不断言任何 CSS 类名
// (`apps/web/src/components/chat/AGENTS.md` §5)。
import { cleanup, fireEvent, render } from '@testing-library/react';
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
  return { ...rendered, onOpenSettings };
}

const cardOf = (container: HTMLElement) =>
  container.querySelector('[data-user-action-card="run-recovery"]');

const descriptionOf = (container: HTMLElement) =>
  cardOf(container)?.querySelector('[data-testid="chat-run-error-description"]') ?? null;

const titleOf = (container: HTMLElement) => cardOf(container)?.firstElementChild ?? null;

const openSettingsButtonOf = (container: HTMLElement) =>
  cardOf(container)?.querySelector('[data-testid="chat-error-open-settings"]') ?? null;

describe('S05 · 自带 API key 没配好,卡上要有自己的文案和改 key 的入口', () => {
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

  it('卡上有一颗〔去设置〕,文案走现成的 openSettingsCta', () => {
    const { container } = renderChat(failedMessage({ failureDetail: 'invalid_api_key' }));
    const button = openSettingsButtonOf(container);
    expect(button).toBeTruthy();
    expect(button!.textContent).toContain('chat.runError.openSettingsCta');
  });

  // 这一条才是「真正能解决问题的入口」:按钮要落到那一屏 BYOK 的 key 输入框上,
  // 也就是发送前那道 BYOK 闸门(`ProjectView.requiresByokPreflight`)落的同一个
  // `execution` 节 —— 不是新造的一条路。
  it('点〔去设置〕落到 execution 这一节(BYOK key 输入框那一屏)', () => {
    const { container, onOpenSettings } = renderChat(
      failedMessage({ failureDetail: 'invalid_api_key' }),
    );
    fireEvent.click(openSettingsButtonOf(container)!);
    expect(onOpenSettings).toHaveBeenCalledWith('execution');
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

/**
 * 评审拦截(PR #7893,PerishCode):〔去设置〕只能给**那把 key 我们自己存着**的
 * 一档,别的 agent 报 key 错要留在它原本的终端认证路上。
 *
 * 为什么这条会成立:`authDetail()` 是从**任何** agent 拍平的 stderr 上读出来的
 * (`apps/daemon/src/run-failure-classification.ts`),所以本机 CLI 一样会报
 * `invalid_api_key` —— `claude` 那句 `Invalid API key · Please run /login` 同时命中
 * `AGENT_AUTH_FAILURE_RE`(→ code `AGENT_AUTH_REQUIRED`)和这条 detail。而本机
 * CLI 的登录态在用户自己的终端里:`opencode` / `kimi` / `qwen` 在设置页那一屏
 * **连一个 key 输入框都没有**,把人送过去等于送到一屏改不了那把 key 的界面,
 * 还顺手吃掉了它们本来该看到的 S02「{agent} 尚未登录」。
 *
 * 判据:`byokApiKeyIsEditableInSettings`(`apps/web/src/utils/byokProvider.ts`)——
 * `byok-opencode` 加 `API_PROTOCOL_AGENT_IDS` 那八个 `*-api`,也就是发送前那道
 * BYOK 闸门(`ProjectView.requiresByokPreflight`)管的同一档。
 *
 * 撤掉那道收窄(把 `apiKeyInvalidCardFor` 里的 `byokApiKeyIsEditableInSettings`
 * 判空去掉,或把这一格塞回 `DETAIL_FAILURE_UI`)之后,下面这两条本机 CLI 必红。
 */
describe('评审拦截 · 〔去设置〕只给 key 能在设置里改的那一档', () => {
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
    '%s 落 S05,并且〔去设置〕点下去到 execution 这一节',
    (agentId) => {
      const { container, onOpenSettings } = renderChat(
        failedMessage({ agentId, failureDetail: 'invalid_api_key' }),
      );
      expect(titleOf(container)!.textContent).toContain(
        'chat.runError.title.apiKeyInvalid',
      );
      const button = openSettingsButtonOf(container);
      expect(button).toBeTruthy();
      fireEvent.click(button!);
      expect(onOpenSettings).toHaveBeenCalledWith('execution');
    },
  );

  // Antigravity 的登录只能在终端里做,它在 `resolveRunFailureUi` 里排在这一格
  // **之前**,本来就抢不走。钉一条,免得日后有人把这一格往上挪。
  it('antigravity 报 key 错仍走它自己的终端登录卡', () => {
    const { container } = renderChat(
      failedMessage({
        agentId: 'antigravity',
        failureDetail: 'invalid_api_key',
        code: 'AGENT_AUTH_REQUIRED',
        raw: 'invalid api key',
      }),
    );
    expect(titleOf(container)!.textContent).toContain(S02_TITLE);
    expect(openSettingsButtonOf(container)).toBeNull();
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
