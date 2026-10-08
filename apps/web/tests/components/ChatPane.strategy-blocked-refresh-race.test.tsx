// @vitest-environment jsdom
//
// 红测:OD Next 协议门把这一轮判成 `blocked`(缺 Runtime State 块),客户端已经
// 拿到了原因码 `od_next_protocol_runtime_state_missing` —— 可 150ms 后那次
// 「拉一遍服务端消息列表做对齐」把这个判决抹掉了,于是那张**已经写好**的专用卡
// (`runtime/amr-guidance.ts` → 「回复已收到,但没能记录下来」)永远画不出来,
// 用户看到的是消息标着「已完成」+ 一张泛化的「任务执行失败」红卡 + 一串英文原文。
//
// 夹具形状取自真实那条记录(beta 客户端数据根 · 只读),不是编的:
//   strategy_task_executions[odnext_c4ee010be6b748dc9b92984946bc10a8]
//     route=full_plan · input_stage=request · outcome=blocked ·
//     execution_mode=NULL · clarification_count=0 ·
//     blocked_reason_codes_json=["od_next_protocol_runtime_state_missing"] ·
//     blocked_visible_text = 那段中文答复本身 ·
//     initial_run_id = latest_run_id = e5d6181b-1705-4a44-964b-cdcb3fbcb6ac
//   messages[5a5dbfe9-290d-4afd-a014-6691a8c13357]
//     role=assistant · run_id=e5d6181b… · **run_status='succeeded'** ·
//     result_delivery_state=NULL · last_run_event_id='12' ·
//     produced_files_json='[]' · pre_turn_file_names_json='["index.html"]' ·
//     events_json 里**没有任何 error 事件**(run 本身零错误)。
//   strategy_task_runs[odnext_c4ee…] → task_run_index=0(这条任务只有一个物理 run)
//
// 也就是说:run 确实成功了,daemon 记 `succeeded` 是对的;失败的是**策略任务**。
// 服务端那一行压根没有「blocked」这个概念可表达,所以它不该被当成对本地判决的
// 更正 —— 而今天的合并正是把它当更正用了。
import { cleanup, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { StrategyTaskProjectionV2Schema } from '@open-design/contracts';
import type { StrategyTaskProjectionV2 } from '@open-design/contracts';

import { ChatPane } from '../../src/components/ChatPane';
import { mergeServerMessagesIntoConversation } from '../../src/components/ProjectView';
import { STRATEGY_TASK_BLOCKED_MESSAGE } from '../../src/providers/daemon';
import { appendErrorStatusEvent } from '../../src/runtime/chat-events';
import { strategySettledMessageFields } from '../../src/runtime/strategy-question-continuation';
import type { AgentEvent, AppConfig, ChatMessage } from '../../src/types';

const translate = (key: string, vars?: Record<string, string | number>) => {
  if (vars && Object.keys(vars).length > 0) {
    return `${key} ${Object.values(vars).join(' ')}`;
  }
  return key;
};

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'zh-CN', setLocale: () => undefined, t: translate }),
  useT: () => translate,
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

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---- 真实那条记录的标识 ------------------------------------------------------
const ASSISTANT_ID = '5a5dbfe9-290d-4afd-a014-6691a8c13357';
const USER_ID = '592e9b3a-2a98-48ae-b8ca-9d98451f18ae';
const RUN_ID = 'e5d6181b-1705-4a44-964b-cdcb3fbcb6ac';
const TASK_EXECUTION_ID = 'odnext_c4ee010be6b748dc9b92984946bc10a8';
const SNAPSHOT_ID = '684ca6f1-cb2d-4b30-864c-509b9ac729d4';
const PACKAGE_HASH =
  '5dab616907413cbf0363d2b50d3ea577f088cab219305096d09f898e4247ee07';
const REASON_CODE = 'od_next_protocol_runtime_state_missing';

/** 用户那一轮的原话(messages[592e9b3a…].content)。 */
const USER_PROMPT = '详细讲讲这个页面的实现思路,分十节展开,每节写满一段。只输出文字,不要创建或修改文件。';

/** 助手真的答了 —— 这段就是 blocked_visible_text 的开头,逐字。 */
const ANSWER_TEXT =
  '这份页面的实现思路,分十节讲。\n\n**一、单文件架构与可编辑性**\n'
  + '整页只落一个 `index.html`,没有任何 JS、CSS、图片分离文件。';

/**
 * daemon 在 SSE 终态里发的终态投影(`StrategyTaskProjectionV2`),字段逐条对上
 * `strategy_task_executions` 那一行。用 schema 现场校验一次,免得夹具长成一个
 * 产品产不出来的形状。
 */
const BLOCKED_PROJECTION: StrategyTaskProjectionV2 = {
  taskExecutionId: TASK_EXECUTION_ID,
  strategy: {
    id: 'od-next-strategy',
    version: '2.0.0',
    packageHash: PACKAGE_HASH,
    snapshotId: SNAPSHOT_ID,
  },
  inputStage: 'request',
  outcome: 'blocked',
  route: 'full_plan',
  executionMode: null,
  activeRunId: RUN_ID,
  terminal: true,
  blockedContext: {
    reasonCodes: [REASON_CODE],
    visibleText: ANSWER_TEXT,
  },
};

/**
 * `messages.events_json` 里真正落库的那 29 条,顺序照抄。
 *
 * 两件事必须照实:**一条 error 事件都没有**(run 本身零错误),以及这一串
 * **比客户端手里那份长得多** —— 14 条是 daemon 侧的 `diagnostic`,客户端从来
 * 不造这种事件,而它逐块收到的 `thinking` 又被 `appendCoalescedAgentEvent`
 * 合成了一条。29 对 8,这正是合并里「谁的 events 更长谁赢」那一条的输赢所在。
 */
function persistedRunEvents(): AgentEvent[] {
  const acpShape: AgentEvent = {
    kind: 'diagnostic',
    name: 'acp_raw_event_shape',
    source: 'acp-json-rpc',
    shape: { sessionUpdate: 'agent_thought_chunk' },
  };
  const thinkingChunks = [
    'The',
    ' user is asking:',
    ' "详细讲讲这个页',
    '面的实现思路,分十',
    '节展开,每节写',
    '满一段。只输出文字',
    ',不要创建或修改文件',
    '。"',
  ];
  return [
    { kind: 'status', label: 'starting', detail: 'amr' },
    { kind: 'done_key', key: '7c93eb60600341cb' },
    { kind: 'status', label: 'model', detail: 'deepseek-v4-flash' },
    { kind: 'diagnostic', name: 'prompt_budget_v1', source: 'acp-json-rpc' },
    {
      kind: 'diagnostic',
      name: 'assistant_message_lifecycle',
      source: 'amr-opencode',
      elapsedMs: 66930,
    },
    {
      kind: 'diagnostic',
      name: 'model_step_lifecycle',
      source: 'amr-opencode',
      elapsedMs: 66931,
    },
    acpShape,
    { kind: 'status', label: 'thinking' },
    // 落库的是「思考块 / 诊断」交替的 8 对。
    ...thinkingChunks.flatMap((text, index): AgentEvent[] =>
      index === 0
        ? [{ kind: 'thinking', text }]
        : [acpShape, { kind: 'thinking', text }],
    ),
    { kind: 'status', label: 'streaming', detail: 'first token in 85.6s' },
    { kind: 'text', text: ANSWER_TEXT },
    {
      kind: 'diagnostic',
      name: 'model_step_lifecycle',
      source: 'amr-opencode',
      elapsedMs: 104858,
      reason: 'stop',
    },
    {
      kind: 'diagnostic',
      name: 'assistant_message_lifecycle',
      source: 'amr-opencode',
      elapsedMs: 104859,
    },
    { kind: 'usage', inputTokens: 24124, outputTokens: 1666, durationMs: 104860 },
    { kind: 'diagnostic', name: 'child_evidence_coverage_v1' },
  ];
}

/**
 * 客户端流式收下来、攒在内存里的那一份。
 *
 * `pushEvent` 只收 SSE 投过来的那几类(没有 `diagnostic`),连续的 `thinking`
 * 又被 `appendCoalescedAgentEvent` 合成一条 —— 于是 29 条落库对上 8 条在手。
 */
function streamedRunEvents(): AgentEvent[] {
  return [
    { kind: 'status', label: 'starting', detail: 'amr' },
    { kind: 'done_key', key: '7c93eb60600341cb' },
    { kind: 'status', label: 'model', detail: 'deepseek-v4-flash' },
    { kind: 'status', label: 'thinking' },
    {
      kind: 'thinking',
      text: 'The user is asking: "详细讲讲这个页面的实现思路,分十节展开,每节写满一段。只输出文字,不要创建或修改文件。"',
    },
    { kind: 'status', label: 'streaming', detail: 'first token in 85.6s' },
    { kind: 'text', text: ANSWER_TEXT },
    { kind: 'usage', inputTokens: 24124, outputTokens: 1666, durationMs: 104860 },
  ];
}

/**
 * `GET /api/projects/:id/conversations/:cid/messages` 对这一行的返回。
 *
 * `run_status` 是 daemon 自己写的 `succeeded` —— run 确实跑通了(exitCode=0,
 * 零 error 事件)。`strategyTaskExecutionId` / `strategyTaskRunIndex` 是那个接口
 * 现场贴上去的任务血缘(`routes/project/conversations.ts`),**blocked 判决不在
 * 这份投影里**:daemon 根本没有把它投到消息上的字段。
 */
function serverAlignedMessages(): ChatMessage[] {
  return [
    {
      id: USER_ID,
      role: 'user',
      content: USER_PROMPT,
      createdAt: 1788678035198,
      startedAt: 1788678036721,
      endedAt: 1788678036721,
      sessionMode: 'design',
      taskAnalytics: {
        taskExecutionId: '826ca155-667a-453f-afa9-fd18ab37c022',
        taskRunIndex: 0,
      },
    },
    {
      id: ASSISTANT_ID,
      role: 'assistant',
      content: ANSWER_TEXT,
      agentId: 'amr',
      runId: RUN_ID,
      runStatus: 'succeeded',
      lastRunEventId: '12',
      events: persistedRunEvents(),
      createdAt: 1788678036733,
      startedAt: 1788678036718,
      endedAt: 1788678142372,
      sessionMode: 'design',
      producedFiles: [],
      preTurnFileNames: ['index.html'],
      strategyTaskExecutionId: TASK_EXECUTION_ID,
      strategyTaskRunIndex: 0,
      taskAnalytics: {
        taskExecutionId: '826ca155-667a-453f-afa9-fd18ab37c022',
        taskRunIndex: 0,
        initialRunId: RUN_ID,
      },
    },
  ];
}

/**
 * 本地那份 —— 也就是服务端对齐**到达之前**、界面上正在显示的那一版。
 *
 * 三个动作照 `providers/daemon.ts` + `components/ProjectView.tsx` 的真实顺序来,
 * 而且都走产品自己的函数,不手搓字段:
 *   1. `onStrategyTaskSettled` → `strategySettledMessageFields(投影)`;
 *   2. `onRunStatus('failed')` → 助手消息落 `runStatus: 'failed'`;
 *   3. `onError(结构化错误)` → `appendErrorStatusEvent(…, code)` 把原因码挂上去。
 */
function localMessagesBeforeAlignment(): ChatMessage[] {
  const [user, serverAssistant] = serverAlignedMessages();
  const settled = strategySettledMessageFields(BLOCKED_PROJECTION);
  expect(settled).not.toBeNull();
  const failed: ChatMessage = {
    ...serverAssistant!,
    // 客户端手里的是流式那一份,不是落库那一份。
    events: streamedRunEvents(),
    // 客户端不知道服务端的血缘投影,它只有 SSE 给的那个 taskExecutionId。
    strategyTaskExecutionId: TASK_EXECUTION_ID,
    strategyTaskRunIndex: 0,
    runStatus: 'failed',
    endedAt: 1788678142372,
    ...settled,
  };
  return [
    user!,
    appendErrorStatusEvent(failed, STRATEGY_TASK_BLOCKED_MESSAGE, REASON_CODE),
  ];
}

function errorEventOf(message: ChatMessage) {
  return (message.events ?? []).find(
    (event) => event.kind === 'status' && event.label === 'error',
  );
}

/**
 * 真实那台 beta 客户端的 `app-config.json`(agentId=amr,agentModels.amr.model=
 * deepseek-v4-flash),只取 ChatPane 用得着的那几项。
 */
const CHAT_CONFIG: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: '',
  model: 'deepseek-v4-flash',
  agentId: 'amr',
  agentCliEnv: {},
  skillId: null,
  designSystemId: 'default',
  telemetry: { metrics: true, content: true, artifactManifest: false },
};

function renderChat(messages: ChatMessage[], globalError: string | null) {
  return render(
    <ChatPane
      messages={messages}
      streaming={false}
      error={globalError}
      errorSourceAssistantId={globalError ? ASSISTANT_ID : null}
      projectId="74e9fec7-0d38-443c-9a58-47db0db7e7fe"
      projectFiles={[]}
      onEnsureProject={async () => '74e9fec7-0d38-443c-9a58-47db0db7e7fe'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
      conversations={[
        {
          projectId: '74e9fec7-0d38-443c-9a58-47db0db7e7fe',
          id: '82e93140-e700-4996-b9fa-bcadab9cad8d',
          title: 'Current',
          createdAt: 1,
          updatedAt: 1,
        },
      ]}
      activeConversationId="82e93140-e700-4996-b9fa-bcadab9cad8d"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={CHAT_CONFIG}
    />,
  );
}

describe('夹具保真', () => {
  it('那份 blocked 投影是 StrategyTaskProjectionV2 真的接受的形状', () => {
    expect(() => StrategyTaskProjectionV2Schema.parse(BLOCKED_PROJECTION)).not.toThrow();
  });

  it('服务端那一行确实带着 succeeded、而且一条 error 事件都没有', () => {
    const [, assistant] = serverAlignedMessages();
    expect(assistant!.runStatus).toBe('succeeded');
    expect(errorEventOf(assistant!)).toBeUndefined();
  });

  it('落库那份比客户端手里那份长 —— 「谁更长谁赢」在这里帮不上忙', () => {
    const [, serverAssistant] = serverAlignedMessages();
    const [, localAssistant] = localMessagesBeforeAlignment();
    expect(serverAssistant!.events).toHaveLength(29);
    // 8 条流式 + 1 条客户端自己补的 error。
    expect(localAssistant!.events).toHaveLength(9);
    expect(localAssistant!.events!.length).toBeLessThan(serverAssistant!.events!.length);
  });
});

describe('服务端对齐到达后,blocked 的原因码要活下来', () => {
  it('合并之后原因码还在,而且还够得着(这一轮仍算终态失败)', () => {
    const merged = mergeServerMessagesIntoConversation(
      localMessagesBeforeAlignment(),
      serverAlignedMessages(),
    );
    const assistant = merged.find((message) => message.id === ASSISTANT_ID);
    expect(assistant).toBeDefined();

    const errorEvent = errorEventOf(assistant!);
    expect(errorEvent?.kind === 'status' ? errorEvent.code : undefined).toBe(REASON_CODE);
    // 原因码留在 events 里还不够 —— 报错卡是从「这一轮终态失败了吗」那道门
    // 进去才读得到它的(`retryableAssistantMessage`)。门关着,码就等于没有。
    expect(assistant!.runStatus).toBe('failed');
    // 判决本身也别丢:服务端那一行没有这两个字段,下一次对齐还要靠它做见证。
    expect(assistant!.strategyTaskBlocked).toBe(true);
    expect(assistant!.strategyTaskBlockedText).toBe(ANSWER_TEXT);
    // 保住原因码不等于把客户端那份短流水整个换上来:落库那 29 条(含 daemon
    // 独有的 14 条 diagnostic)一条都不能少,error 只是**补**在后面。
    expect(assistant!.events).toHaveLength(30);
    expect(
      assistant!.events!.filter((event) => event.kind === 'diagnostic'),
    ).toHaveLength(14);
  });

  it('连续两次对齐也不会把判决磨掉', () => {
    const once = mergeServerMessagesIntoConversation(
      localMessagesBeforeAlignment(),
      serverAlignedMessages(),
    );
    const twice = mergeServerMessagesIntoConversation(once, serverAlignedMessages());
    const assistant = twice.find((message) => message.id === ASSISTANT_ID);
    expect(assistant!.runStatus).toBe('failed');
    expect(assistant!.strategyTaskBlocked).toBe(true);
    const errorEvent = errorEventOf(assistant!);
    expect(errorEvent?.kind === 'status' ? errorEvent.code : undefined).toBe(REASON_CODE);
  });
});

describe('对齐之后那张卡:专用文案,不是泛化的「任务执行失败」', () => {
  it('标题和正文都是 agentReplyIncomplete 那一档,英文原文不出现在卡上', () => {
    const merged = mergeServerMessagesIntoConversation(
      localMessagesBeforeAlignment(),
      serverAlignedMessages(),
    );
    const { container } = renderChat(merged, STRATEGY_TASK_BLOCKED_MESSAGE);

    const card = container.querySelector<HTMLElement>(
      '[data-user-action-card="run-recovery"]',
    );
    expect(card).toBeTruthy();
    expect(card!.textContent).toContain('chat.runError.title.agentReplyIncomplete');
    // 泛化标题被顶掉了才算真的命中这一档。
    expect(card!.textContent).not.toContain('chat.runError.title.generic');

    const description = card!.querySelector('[data-testid="chat-run-error-description"]');
    expect(description?.textContent).toContain('chat.runError.agentReplyIncompleteMessage');
    expect(description?.textContent).not.toContain('chat.runError.fallbackMessage');

    // 用户实际看到的那串英文诊断句,一个字都不该出现在卡面上。
    expect(card!.textContent).not.toContain('machine-readable state');
    expect(card!.textContent).not.toContain(STRATEGY_TASK_BLOCKED_MESSAGE);
  });

  // OPEND-2422:「阻断错误卡缺少重试按钮」。那一排动作整体挂在
  // `retryAssistant && onRetry && runFailureUi` 上,runFailureUi 为空时
  // 一颗按钮都画不出来 —— 同一处根因的下游后果。
  it('重试按钮跟着回来(OPEND-2422)', () => {
    const merged = mergeServerMessagesIntoConversation(
      localMessagesBeforeAlignment(),
      serverAlignedMessages(),
    );
    renderChat(merged, STRATEGY_TASK_BLOCKED_MESSAGE);
    expect(screen.getByTestId('chat-error-retry')).toBeTruthy();
  });
});

// 反向对照 · 别把手伸过界。
//
// `providers/daemon.ts` 里有一条明确的例外:blocked 但**东西已经交付**
// (`deliverableValid`)时,endStatus 保持 `succeeded`、不构造错误。那一路本地的
// `runStatus` 就是 `succeeded`,所以合并不该无中生有地把它翻成失败。
// 少了这条,一个「本地 blocked 就一律判失败」的实现也会绿。
describe('blocked 但已交付的那一路不受影响', () => {
  it('本地本来就是 succeeded,合并后不冒出报错卡', () => {
    const [user, serverAssistant] = serverAlignedMessages();
    const settled = strategySettledMessageFields(BLOCKED_PROJECTION);
    const deliveredDespiteBlock: ChatMessage = {
      ...serverAssistant!,
      events: streamedRunEvents(),
      ...settled,
    };
    const merged = mergeServerMessagesIntoConversation(
      [user!, deliveredDespiteBlock],
      serverAlignedMessages(),
    );
    const assistant = merged.find((message) => message.id === ASSISTANT_ID);
    expect(assistant!.runStatus).toBe('succeeded');

    const { container } = renderChat(merged, null);
    expect(container.querySelector('[data-user-action-card="run-recovery"]')).toBeNull();
  });
});
