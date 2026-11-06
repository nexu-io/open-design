// @vitest-environment jsdom
/**
 * 点「跳过」之后,收口那一块不许说「答案已发送」。
 *
 * ── 用户报的是什么 ────────────────────────────────────────────────
 * 「点击跳过的话,不应该显示这个什么答案已发送,而是跳过的问题的答案那边
 *   显示『已跳过』之类的」。截图:一行绿色的「已确认」,底下一句
 *   `qf.lockedSubmitted` =「答案已发送,代理将在本次会话后续使用。」
 *
 * ── 「跳过」到底做了什么(查清楚了,不是猜) ────────────────────────
 * 跳过**不是**另一条路,它就是提交,只不过被跳的那道题提交的是空值:
 *   `handleSkipCurrent` / `handleSkipAll` → `finalizeSubmission('skip')`
 *   → `answersWithSkippedQuestions()` 把这些题置成 `emptyQuestionValue`
 *   → `formatFormAnswers()` 给它们写 `- <题目>: (skipped)`
 * 所以模型收到的**不是**一份空表:每道被跳的题都明写着 `(skipped)`,
 * 它知道「用户不想答这条,你自己定」。这一层没有问题(本文件第一条用例锁住它)。
 *
 * ── 病灶在收口那一块 ──────────────────────────────────────────────
 * `summarizeQuestionFormAnswers()` 遇到没有值的题**直接 `continue` 整条丢掉**。
 * 于是:
 *   · 一部分题被跳 → 收口里那几行凭空消失,看不出自己跳过了什么;
 *   · 整张表都被跳 → 一行都不剩,两个渲染方各自退回兜底 ——
 *     `AnsweredSummary` 直接 `return null`(什么都不画),
 *     `AssistantMessage` 的历史回放块改画 `qf.lockedSubmitted`
 *     (`AssistantMessage.tsx`,条件正是 `flat.length === 0 && visualItems.length === 0`)。
 *     那句话在这个分支里**必然**是假的 —— 它只在「一个答案都没有」时才出现。
 *
 * 修法因此是一句话:**提交出去的文本对某道题写了 `(skipped)`,收口就要照着念**,
 * 不能把这一行吞掉。吞掉之后兜底那句谎话才有机会出场。
 *
 * ── 措辞不是自造的 ────────────────────────────────────────────────
 * 新 key `qf.answeredSkipped` 的 19 份译文逐条取自仓库里同一个词的既有译法
 * (`settings.orbit.countSkipped` / `liveArtifact.refresh.persistedStatusSkipped`),
 * 没有新编一套说法。
 *
 * ── 「有值 / 没值 / 压根没这道题」必须分三档 ──────────────────────
 * 只有「这道题确实在提交里、但值是空的」才算跳过。一道题**根本没出现在
 * `answers` 里**是另一回事(回放时标签没对上、表单还在流式长出来),
 * 那时不许替用户宣布「已跳过」。这两档在本文件里各有一条用例。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../../src/i18n';
import {
  QuestionFormView,
  parseSubmittedAnswers,
  summarizeQuestionFormAnswers,
} from '../../../src/components/QuestionForm';
import type { QuestionForm } from '../../../src/artifacts/question-form';
import { zhCN } from '../../../src/i18n/locales/zh-CN';

afterEach(cleanup);

const SKIPPED = zhCN['qf.answeredSkipped'];
const SENT = zhCN['qf.lockedSubmitted'];

const FORM: QuestionForm = {
  id: 'scope',
  title: '还需要确认一件事',
  lang: 'zh-CN',
  questions: [
    {
      id: 'pages',
      label: '除了设置页,还有哪几页要一起换',
      type: 'radio',
      options: [
        { label: '商品详情页', value: 'pdp' },
        { label: '搜索结果页', value: 'search' },
      ],
    },
    {
      id: 'tone',
      label: '想要什么调性',
      type: 'radio',
      options: [
        { label: '克制', value: 'restrained' },
        { label: '张扬', value: 'loud' },
      ],
    },
  ],
};

function renderAnswered(answers: Record<string, string | string[]>): void {
  render(
    <I18nProvider initial="zh-CN">
      <QuestionFormView form={FORM} interactive={false} submittedAnswers={answers} />
    </I18nProvider>,
  );
}

/** 走一遍真实的分步表单,每一步都点「跳过」,拿回发出去的那段文本。 */
function skipEveryStep(): string {
  let sent = '';
  render(
    <I18nProvider initial="zh-CN">
      <QuestionFormView form={FORM} interactive onSubmit={(text) => { sent = text; }} />
    </I18nProvider>,
  );
  for (let step = 0; step < FORM.questions.length; step += 1) {
    const skip = [...document.querySelectorAll<HTMLButtonElement>('.question-form-foot button')]
      .find((button) => button.textContent?.trim() === '跳过');
    if (!skip) throw new Error(`第 ${step + 1} 步没有「跳过」—— 夹具或组件变了,先修这里`);
    fireEvent.click(skip);
  }
  return sent;
}

describe('跳过之后,收口那一块照着提交出去的内容念', () => {
  it('事实基线:跳过发出去的**不是**空表,每道被跳的题都明写 `(skipped)`', () => {
    const sent = skipEveryStep();
    expect(sent).toContain('[form answers — scope]');
    for (const q of FORM.questions) expect(sent).toContain(`- ${q.label}: (skipped)`);
  });

  it('被跳的那道题在收口里占一行,写的是「已跳过」', () => {
    const summary = summarizeQuestionFormAnswers(
      FORM,
      { pages: 'pdp', tone: '' },
      undefined,
      false,
      SKIPPED,
    );
    expect(summary.items).toEqual([
      { label: '除了设置页,还有哪几页要一起换', value: '商品详情页' },
      { label: '想要什么调性', value: SKIPPED },
    ]);
  });

  it('压根没提交过的题不算跳过 —— 不许替用户宣布', () => {
    // 回放时标签没对上、或表单还在流式长出来,这道题根本不在 `answers` 里。
    const summary = summarizeQuestionFormAnswers(FORM, { pages: 'pdp' }, undefined, false, SKIPPED);
    expect(summary.items).toEqual([
      { label: '除了设置页,还有哪几页要一起换', value: '商品详情页' },
    ]);
  });

  it('整张表都跳过时,收口仍旧有内容 —— 兜底那句「答案已发送」再也够不着', () => {
    /*
     * `AssistantMessage` 的历史回放块用的就是这个条件:
     *   `flat.length === 0 && visualItems.length === 0` → 画 `qf.lockedSubmitted`。
     * 它只在「一个答案都没有」时出现,所以那句话在这个分支里必然是假的。
     * 这里锁的是让它够不着的前提。
     */
    const summary = summarizeQuestionFormAnswers(
      FORM,
      { pages: '', tone: '' },
      undefined,
      false,
      SKIPPED,
    );
    expect(summary.items.map((item) => item.value)).toEqual([SKIPPED, SKIPPED]);
    expect(summary.items.length > 0 || summary.visualItems.length > 0).toBe(true);
  });

  it('渲染出来:被跳的题挂在自己那一行上,不是一句笼统的「答案已发送」', () => {
    renderAnswered({ pages: 'pdp', tone: '' });
    expect(screen.getByText('已确认')).toBeTruthy();
    expect(screen.getByText('商品详情页')).toBeTruthy();
    expect(screen.getByText(SKIPPED)).toBeTruthy();
    expect(screen.queryByText(SENT)).toBeNull();
    // 「已跳过」贴在被跳那道题的标签旁边,不是飘在别处
    const row = screen.getByText(SKIPPED).closest('li, .ab');
    expect(row?.textContent).toContain('想要什么调性');
  });

  it('整张表都跳过时,收口不再整块消失', () => {
    renderAnswered({ pages: '', tone: '' });
    expect(screen.getAllByText(SKIPPED)).toHaveLength(2);
    expect(screen.queryByText(SENT)).toBeNull();
  });

  it('全链路:真的点完两次「跳过」,把发出去的文本原样回放,两行都是「已跳过」', () => {
    // 这条走的是产品回放路径:发出去的文本 → `parseSubmittedAnswers` → 收口。
    const sent = skipEveryStep();
    cleanup();
    const replayed = parseSubmittedAnswers(FORM, sent);
    expect(replayed).not.toBeNull();
    const summary = summarizeQuestionFormAnswers(FORM, replayed!, undefined, false, SKIPPED);
    expect(summary.items).toEqual([
      { label: '除了设置页,还有哪几页要一起换', value: SKIPPED },
      { label: '想要什么调性', value: SKIPPED },
    ]);
  });
});
