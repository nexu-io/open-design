/**
 * Runtime State 缺失或格式错误仍保留自己的错误映射与原有恢复动作。
 * 卡面标题/正文按产品 2026-09-14 的补充场景文案对齐：
 * L7ukd6xcqoWpo2xJzKdcDPctnvh revision 96，「回复已收到，但没能记录下来」。
 *
 * 旧 W41 拟稿要求文案承诺「答案没有丢失」，不是本次批准原文。
 * 本文件以明确的批准文案验证呈现，不改变失败分类、重试或持久化行为。
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
    // 主按钮位归 Cloud CTA(OPEND-2772,非 Cloud 的卡一律有);〔重试〕退到次级但仍在。
    // ⚠️ 「别多长出第二颗**卡**」这条更严了:那张独立的切换卡已经整块删掉。
    expect(ui.cloudSwitchCta).toBe(true);
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

describe('批准文案与恢复指引', () => {
  it('英文:逐字对齐批准文案，不怪用户并给出重试下一步', async () => {
    const dict = await loadDict('en');
    const message = dict[MESSAGE_KEY].toLowerCase();

    expect(dict[TITLE_KEY]).toBe('The task could not be completed');
    expect(dict[MESSAGE_KEY]).toBe('This task failed to run. Please retry. If it fails again, please contact support.');
    // ① 不怪用户 —— 不许出现指着用户说的祈使式指责。
    expect(message).not.toMatch(/\byou (?:must|should|need to) (?:fix|correct|rewrite)\b/);
    // ② 给下一步 —— 明确说重试。
    expect(message).toMatch(/\bretry|\btry(?:ing)? again\b/);
  });

  it('中文:逐字对齐批准标题正文并保留重试指引', async () => {
    const dict = await loadDict('zh-CN');
    const message = dict[MESSAGE_KEY];

    expect(dict[TITLE_KEY]).toBe('任务未能完成');
    expect(message).toBe('本次任务运行失败，请重试。如果再次失败，请联系支持。');
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
