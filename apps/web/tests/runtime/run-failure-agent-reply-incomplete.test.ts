/**
 * 「答案交上去了、计划也写出来了,然后被告知失败」这一格的卡面文案。
 *
 * ── 这是哪一种失败 ──────────────────────────────────────────────────────
 * OD Next 策略要求智能体每一轮回复里带一段机器可读的 Runtime State。**那一轮
 * 它忘了写**,澄清阶段的契约只认 `plan_ready` / `blocked` / `canceled` 三种
 * 结论,而 `plan_ready` 需要一份这一轮没有的 Plan Contract,于是这一轮落成
 * 终态 `blocked`。
 *
 * 判定本身是对的(fail-closed),这条规格**不碰判定**。它只钉卡面那句话。
 *
 * ── 事实链(每一步都在代码里可查) ────────────────────────────────────
 *
 *  1. daemon 发现回复里没有 Runtime State:
 *     `apps/daemon/src/strategies/od-next/coordinator.ts:378-391` 用
 *     `['od_next_protocol_runtime_state_missing']` 调 `blockTask`。
 *  2. `blockTask`(同文件 :931-956)把它写进
 *     `blockedContext.reasonCodes`,**排在数组第一位**
 *     (`uniqueReasonCodes([...reasonCodes, ...questionFormMarkerReasonCodes])`)。
 *  3. web `createStrategyTaskBlockedError`
 *     (`apps/web/src/providers/daemon.ts`)取 `reasonCodes[0]` 挂到
 *     `error.code`。
 *  4. `ChatPane.tsx:1783` 把这个 code 交给 `resolveRunFailureUi`。
 *
 * ── 今天为什么是错的 ────────────────────────────────────────────────────
 * 第 4 步在三张表里都查不到这个 code,于是掉进兜底
 * (`amr-guidance.ts` 结尾的 `failureCard({transient:true},'…title.generic',null)`)。
 * `messageKey` 是 `null`,卡面因此渲染
 * `RUN_FAILURE_FALLBACK_MESSAGE_KEY` 那句通用的「任务失败了」——
 * 用户眼前明明是一整份计划,卡上却什么都没解释,更没有说他提交的答案还在。
 * 那句真正描述了这次失败的英文原句只留在诊断区,一个字都没翻译。
 *
 * 这正是报错体验设计第 5 条原则的反面
 * (`docs/design/run-errors/error-ux-design.md` §1.5:
 * 「文案说人话,说清不怪用户,给下一步」)。
 *
 * ⚠️ 设计稿里**没有这一格**。最接近的 S21 是「模型输出不正常(空、伪造对话、
 * 死循环)」,不适用 —— 这次的回复是完整、可读、已经显示在屏幕上的。
 * 下面钉的文案是 **W41 拟稿**,等产品在上面改字,不是定稿。
 *
 * ── 按钮不动 ────────────────────────────────────────────────────────────
 * 兜底今天给的就是〔重试〕,新的一格必须还是〔重试〕:偶发漏写,同一段提示词
 * 重跑经常就对了 —— 阶梯第 2 级。所以下面既断言文案变了,也断言按钮没变。
 */
import { describe, expect, it } from 'vitest';

import { resolveRunFailureUi } from '../../src/runtime/amr-guidance';
import { LOCALES, type Dict, type Locale } from '../../src/i18n/types';

/**
 * `protocol.ts:16-19` 里 Runtime State 契约能产出的全部 issue code。
 * 四个讲的是同一件事:那段机器结构没有按约定出现在这一轮里。
 */
const RUNTIME_STATE_CODES = [
  'od_next_protocol_runtime_state_missing',
  'od_next_protocol_runtime_state_duplicate',
  'od_next_protocol_runtime_state_invalid_json',
  'od_next_protocol_runtime_state_invalid_schema',
] as const;

const TITLE_KEY = 'chat.runError.title.agentReplyIncomplete';
const MESSAGE_KEY = 'chat.runError.agentReplyIncompleteMessage';

async function loadDict(locale: Locale): Promise<Dict> {
  const module = await import(`../../src/i18n/locales/${locale}.ts`);
  const dict = Object.values(module).find((value): value is Dict => {
    return Boolean(value) && typeof value === 'object';
  });
  if (!dict) throw new Error(`No dictionary export found for locale ${locale}`);
  return dict;
}

describe('回复缺了机器结构那一轮的报错卡', () => {
  it.each(RUNTIME_STATE_CODES)('%s 有自己的卡面文案,不再掉进通用兜底', (code) => {
    const ui = resolveRunFailureUi(code, null, 'mock-agent', null);

    // 兜底那条的特征就是 `messageKey === null` —— 卡面于是退到
    // `RUN_FAILURE_FALLBACK_MESSAGE_KEY`。这一行是整条规格的红点。
    expect(ui.messageKey).toBe(MESSAGE_KEY);
    expect(ui.titleKey).toBe(TITLE_KEY);
  });

  it.each(RUNTIME_STATE_CODES)('%s 仍然只给〔重试〕,按钮一颗都没换', (code) => {
    const ui = resolveRunFailureUi(code, null, 'mock-agent', null);

    // 偶发漏写、重跑常常就对 —— 阶梯第 2 级,重试是对的。
    expect(ui.primaryAction).toBe('retry');
    // 不是模型/额度问题,别推 Cloud;也别多长出第二颗按钮。
    expect(ui.showSwitchCard).toBe(false);
    expect(ui.secondaryRetry).toBe(false);
    // 这张卡必须画出来,不能像断线那条一样让别的界面接管。
    expect(ui.suppressCard).not.toBe(true);
  });

  it('daemon 说重试没用时,这一格也不硬给重试', () => {
    // 这一行守的是「别把判定写死」:verdict 是 daemon 读完这次 run 给的结论,
    // 它说没用就是没用。今天 daemon 还不发 verdict,所以上面那条才是常态。
    const ui = resolveRunFailureUi(
      'od_next_protocol_runtime_state_missing',
      null,
      'mock-agent',
      null,
    );
    expect(ui.titleKey).toBe(TITLE_KEY);
  });
});

describe('这两句话 19 个语言都要有', () => {
  it.each(LOCALES)('%s 两个 key 都落了,且不是占位', async (locale) => {
    const dict = await loadDict(locale as Locale);
    const title = dict[TITLE_KEY];
    const message = dict[MESSAGE_KEY];

    for (const [name, value] of [['title', title], ['message', message]] as const) {
      expect(typeof value, `${locale} ${name} 缺失`).toBe('string');
      expect(value.trim().length, `${locale} ${name} 是空的`).toBeGreaterThan(0);
      // 「零 TODO 零占位」:这三种是最常见的没写完的痕迹。
      expect(value, `${locale} ${name} 还是占位`).not.toMatch(/TODO|TBD|FIXME|XXX/i);
    }
  });

  it.each(LOCALES.filter((l) => l !== 'en'))('%s 不是把英文原样抄过去', async (locale) => {
    const dict = await loadDict(locale as Locale);
    const enDict = await loadDict('en');

    // 逐字等于英文 = 这一格没翻。19 个语言的回归最常见就长这样:
    // 英文改了,其余 18 个留着上一版或者干脆复制英文。
    expect(dict[MESSAGE_KEY]).not.toBe(enDict[MESSAGE_KEY]);
    expect(dict[TITLE_KEY]).not.toBe(enDict[TITLE_KEY]);
  });
});

describe('文案本身要满足第 5 条原则', () => {
  it('英文:不怪用户、说清答案没白费、给下一步', async () => {
    const dict = await loadDict('en');
    const message = dict[MESSAGE_KEY].toLowerCase();

    // ① 不怪用户 —— 不许出现指着用户说的祈使式指责。
    expect(message).not.toMatch(/\byou (?:must|should|need to) (?:fix|correct|rewrite)\b/);
    // ② 说清「你做的事没白费」。
    expect(message).toMatch(/\bnothing you (?:sent|wrote|entered)\b|\bwas(?:n't| not) lost\b|\bnothing .* lost\b/);
    // ③ 给下一步 —— 明确说重试。
    expect(message).toMatch(/\bretry|\btry(?:ing)? again\b/);
  });

  it('中文:同样三条', async () => {
    const dict = await loadDict('zh-CN');
    const message = dict[MESSAGE_KEY];

    expect(message).toMatch(/没有丢失|没丢|仍然保留|不会丢失/);
    expect(message).toMatch(/重试|再试/);
  });

  it('标题是一句短话,不是一段解释', async () => {
    for (const locale of LOCALES) {
      const dict = await loadDict(locale as Locale);
      // 邻居标题(「Agent crashed」「Timed out」「任务已被质量门拦下」)都是短名词短语。
      expect(dict[TITLE_KEY].length, `${locale} 标题太长了`).toBeLessThan(60);
    }
  });
});
