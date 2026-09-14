// @vitest-environment jsdom
/**
 * 一道**渲染不出任何选项**的 `direction-cards` 不许把整张表锁死。
 *
 * ── 缺陷形状 ────────────────────────────────────────────────
 *
 * `direction-cards` 有两条素材来源,缺一条就换另一条:
 *   · host 自带的风格目录 —— 前提是项目有 `visualStyleContext`;
 *   · 模型自己带的 `cards` —— 老格式,现在的提示词明确要求省略。
 *
 * **两条同时没有**时,`QuestionForm.tsx` 那两处渲染分支
 * (`visualStyleCards && visualStyleContext` / `q.cards && q.cards.length > 0`)
 * 都不成立 —— 这道题只剩一个标题,底下什么都没有。
 *
 * 而 `direction-cards` 又躺在 `CHOICE_QUESTION_TYPES` 里,于是
 * `questionNeedsAnswer` 说它「必须有答案」→ `requiredAnswered` 永远 false →
 * 「下一步」**永远置灰**。用户看着一道空题,唯一出口只剩「跳过」。
 *
 * ── 什么时候真会撞上 ─────────────────────────────────────────
 *
 * `visualStyleContextForProjectKind`(`AssistantMessage.tsx`)对
 * `audio` / `brand` / `orbit` / `design_system` 四种项目、以及**项目类型还没落定**
 * (`projectKind === null`)一律返回 `undefined`。这几种项目里模型若发一道
 * 不带 `cards` 的 `direction-cards`,就是上面那个死角。
 *
 * 这个洞**本来就在**,不是这次改出来的。但 2026-09-07 把设计风格题从提示词整题
 * 下线之后,`direction-cards` 变成一个**不再被宣传的类型** —— 从此它的每一次出现
 * 都是「计划外的」(缓存的旧提示词、别的客户端版本、模型记住的旧格式),
 * 也就更可能是这种缺素材的畸形形态。安全网必须真的兜得住,不能只是「留着代码」。
 *
 * ── 这条测试证明什么 ─────────────────────────────────────────
 *
 * 只证明**不会把人锁死**:「下一步」仍然可点、答案照常提交。它**不**保证那道题
 * 好看 —— 一道空题本来就该由上游别发出来,这里只负责不让它变成死路。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';

import { QuestionFormView } from '../../src/components/QuestionForm';
import type { QuestionForm } from '../../src/artifacts/question-form';
import { I18nProvider } from '../../src/i18n';

afterEach(cleanup);
const render = (ui: ReactElement) =>
  rtlRender(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);

/** 底栏那颗主按钮(「下一步」)。 */
const nextBtn = (): HTMLButtonElement => {
  const hit = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.classList.contains('qf-primary-action'),
  );
  if (!hit) throw new Error('没有找到「下一步」');
  return hit;
};

/** 提示词今天要求的形态:只有 id / label / type,没有 options、没有 cards。 */
const bare = (extra: Record<string, unknown> = {}): QuestionForm =>
  ({
    id: 'f-dead-end',
    title: '先定个方向',
    questions: [
      { id: 'direction', label: '视觉方向', type: 'direction-cards', ...extra },
    ],
  }) as unknown as QuestionForm;

describe('渲染不出选项的 direction-cards 不锁死提交', () => {
  it('前提成立:这道题确实一张卡都没渲染出来', () => {
    // 防真空 —— 底下三条如果是因为「其实渲染出来了」而绿,那什么都没测到
    render(<QuestionFormView form={bare()} interactive onSubmit={vi.fn()} />);
    expect(document.querySelector('.qf-visual-card')).toBeNull();
    expect(document.querySelector('[data-testid="question-form-visual-picker"]')).toBeNull();
  });

  it('没有目录上下文、也没有模型自带 cards 时,「下一步」仍然可点', () => {
    render(<QuestionFormView form={bare()} interactive onSubmit={vi.fn()} />);
    expect(nextBtn().disabled).toBe(false);
  });

  it('模型把它标成 required 也一样 —— 一道空题不能当门闩', () => {
    render(<QuestionFormView form={bare({ required: true })} interactive onSubmit={vi.fn()} />);
    expect(nextBtn().disabled).toBe(false);
  });

  it('点得下去,而且真的提交了', () => {
    const onSubmit = vi.fn();
    render(<QuestionFormView form={bare()} interactive onSubmit={onSubmit} />);
    nextBtn().click();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('对照组:同一道题**渲染得出**卡片时,门闩照旧 —— 没选就是置灰', () => {
    /*
     * 这一条把上面三条的适用范围钉死:放宽只发生在「什么都渲染不出来」那一种,
     * 有卡可点时交付稿 5-1「一个都没选 ——「下一步」置灰」继续生效。
     * 少了它,上面三条会被误读成「direction-cards 从此不再是必答题」。
     */
    render(<QuestionFormView form={bare()} interactive visualStyleContext="prototype" onSubmit={vi.fn()} />);
    expect(document.querySelectorAll('.qf-visual-card').length).toBeGreaterThan(0);
    expect(nextBtn().disabled).toBe(true);
  });
});
