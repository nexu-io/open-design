/**
 * 「我明明答了,它又来问我」这一格的卡面文案。
 *
 * ── 这是哪一种失败 ──────────────────────────────────────────────────────
 * 用户答完澄清表单,智能体**又发了一个问题表单**而不是继续往下做。
 * OD Next 的任务契约只给**一轮**提问:
 *
 *  · `beginStrategyClarification` 要求 `clarificationCount === 0` 且
 *    `inputStage === 'request'` —— 报错原话「The task is not awaiting its
 *    **one allowed** clarification answer」
 *    (`apps/daemon/src/strategies/od-next/coordinator.ts:224-233`)。
 *  · 到了 `inputStage === 'clarification'`,契约只认
 *    `plan_ready` / `blocked` / `canceled` —— 报错原话「Clarification cannot
 *    request another clarification round」
 *    (`packages/contracts/src/plugins/strategy-v2.ts:488-494`)。
 *
 * 所以这一轮必然落 `blocked`,原因码 `od_next_clarification_repeated`。
 *
 * ── 和 `agentReplyIncomplete` 那四条**不是**同一个故事 ──────────────────
 * 那四条是「回复回来了,但忘了带机器结构」—— 偶发漏写,重跑经常就对。
 * 这一条是「智能体真的还想再问」—— **不是随机忘记**:哪怕它规规矩矩declare
 * 了 `clarification_required`,契约照样拒(上面第二条),`validateAcceptedTurn`
 * 里 declare 版本走的就是同一个原因码
 * (`coordinator.ts:753-765`)。
 *
 * 所以这一格**必须有自己的文案**,不许复用那四条的。
 *
 * ── 那为什么还给〔重试〕? ───────────────────────────────────────────────
 * 因为〔重试〕不是「原地再赌一次」,是**重开一个任务**:
 *
 *  1. `handleRetry` 走 `handleSend('')`,只带 `retryOfAssistantId`,
 *     **不带** `strategyTaskExecutionId`(`ProjectView.tsx:9710-9724`)。
 *  2. 请求体里的 `taskExecutionId` 只在回答表单那条路上才塞
 *     (`ProjectView.tsx:8963` / `:9191`,源头是 `meta.strategyTaskExecutionId`)。
 *  3. daemon 侧 `resolveClarificationContinuation` 头一行就是
 *     `if (requestBody.taskExecutionId === undefined) return { kind: 'ordinary' }`
 *     (`apps/daemon/src/routes/runs.ts:1041`),docblock 写死「Conversation
 *     order is never an ownership signal」。
 *  4. 于是走 `createStrategyTaskExecution` 建**新任务**
 *     (`runs.ts:2790`),`clarificationCount = 0`、`inputStage = 'request'`,
 *     这时候提问是**合法**结论(`clarification_required`)。
 *
 * 结论:重试之后智能体多半还会问,但那一次会**正常渲染成一轮提问**,不再是
 * 一张失败卡。这是真的能恢复,所以按钮留着。
 *
 * ⚠️ 但正因为它不是「偶发」,文案**不许**照抄那四条的「重跑一次通常就好」。
 * 下面有一条反向断言专门钉这件事。
 *
 * ⚠️ 设计稿里**没有这一格**:`docs/design/run-errors/error-ux-design.md`
 * 32 个场景 S01–S32 里没有任何一格讲澄清/追问(全文搜「澄清」「clarification」
 * 零命中)。下面的文案是 **W41 拟稿**,等产品改字。
 */
import { describe, expect, it } from 'vitest';

import { resolveRunFailureUi } from '../../src/runtime/amr-guidance';
import { LOCALES, type Dict, type Locale } from '../../src/i18n/types';

const CODE = 'od_next_clarification_repeated';
const TITLE_KEY = 'chat.runError.title.clarificationRepeated';
const MESSAGE_KEY = 'chat.runError.clarificationRepeatedMessage';

/** 那四条的 key —— 用来证明这一格**没有**被塞进同一行。 */
const REPLY_INCOMPLETE_MESSAGE_KEY = 'chat.runError.agentReplyIncompleteMessage';

async function loadDict(locale: Locale): Promise<Dict> {
  const module = await import(`../../src/i18n/locales/${locale}.ts`);
  const dict = Object.values(module).find((value): value is Dict => {
    return Boolean(value) && typeof value === 'object';
  });
  if (!dict) throw new Error(`No dictionary export found for locale ${locale}`);
  return dict;
}

describe('智能体又问一次那一轮的报错卡', () => {
  it('有自己的卡面文案,不再掉进通用兜底', () => {
    const ui = resolveRunFailureUi(CODE, null, 'mock-agent', null);
    expect(ui.messageKey).toBe(MESSAGE_KEY);
    expect(ui.titleKey).toBe(TITLE_KEY);
  });

  it('不复用「回复没记下来」那一格 —— 两件事,两套话', () => {
    const ui = resolveRunFailureUi(CODE, null, 'mock-agent', null);
    // 复用那四条是最省事也最错的写法:用户看到的会是「回复没记下来」,
    // 而他眼前其实是又一个问题表单。
    expect(ui.messageKey).not.toBe(REPLY_INCOMPLETE_MESSAGE_KEY);
  });

  it('仍然给〔重试〕—— 重试重开一个任务,提问那一次就合法了', () => {
    const ui = resolveRunFailureUi(CODE, null, 'mock-agent', null);
    expect(ui.primaryAction).toBe('retry');
    // 不是模型/额度问题,别推 Cloud;别多长按钮。
    expect(ui.showSwitchCard).toBe(false);
    expect(ui.secondaryRetry).toBe(false);
    expect(ui.suppressCard).not.toBe(true);
  });
});

describe('这两句话 19 个语言都要有', () => {
  it.each(LOCALES)('%s 两个 key 都落了,且不是占位', async (locale) => {
    const dict = await loadDict(locale as Locale);
    for (const key of [TITLE_KEY, MESSAGE_KEY] as const) {
      const value = dict[key];
      expect(typeof value, `${locale} ${key} 缺失`).toBe('string');
      expect(value.trim().length, `${locale} ${key} 是空的`).toBeGreaterThan(0);
      expect(value, `${locale} ${key} 还是占位`).not.toMatch(/TODO|TBD|FIXME|XXX/i);
    }
    expect(dict[TITLE_KEY].length, `${locale} 标题太长了`).toBeLessThan(60);
  });

  it.each(LOCALES.filter((l) => l !== 'en'))('%s 不是把英文原样抄过去', async (locale) => {
    const dict = await loadDict(locale as Locale);
    const enDict = await loadDict('en');
    expect(dict[MESSAGE_KEY]).not.toBe(enDict[MESSAGE_KEY]);
    expect(dict[TITLE_KEY]).not.toBe(enDict[TITLE_KEY]);
  });

  it.each(LOCALES)('%s 和「回复没记下来」那一格不是同一句话', async (locale) => {
    const dict = await loadDict(locale as Locale);
    // 两格共用一句话 = 等于没分格。
    expect(dict[MESSAGE_KEY]).not.toBe(dict[REPLY_INCOMPLETE_MESSAGE_KEY]);
  });
});

describe('文案本身要满足第 5 条原则', () => {
  it('英文:不怪用户、说清答案还在、给下一步', async () => {
    const dict = await loadDict('en');
    const message = dict[MESSAGE_KEY].toLowerCase();
    // ① 不怪用户。
    expect(message).not.toMatch(/\byou (?:must|should|need to) (?:fix|correct|rewrite)\b/);
    // ② 说清答案还在。
    expect(message).toMatch(/\byour answers\b|\bwhat you answered\b|\bstill (?:in|there)\b/);
    // ③ 给下一步。
    expect(message).toMatch(/\bretry|\btry(?:ing)? again\b/);
  });

  it('英文:**不许**把这一格说成偶发 —— 那是那四条,不是这一条', async () => {
    const dict = await loadDict('en');
    const message = dict[MESSAGE_KEY].toLowerCase();
    // 智能体又问一次不是随机漏写:declare 了照样被拒。说「重跑一次通常就好」
    // 是骗人 —— 重试是**重开任务**才有用,不是同一件事再赌一次。
    expect(message).not.toMatch(/\bintermittent\b|\bone-off\b|\bglitch\b/);
    expect(message).not.toMatch(/usually (?:goes through|works|succeeds)\b/);
  });

  it('中文:答案还在 + 给重试,且不说「偶发」', async () => {
    const dict = await loadDict('zh-CN');
    const message = dict[MESSAGE_KEY];
    expect(message).toMatch(/仍然保留|还在|没有丢失/);
    expect(message).toMatch(/重试|再试/);
    expect(message).not.toMatch(/偶发|随机/);
  });
});
