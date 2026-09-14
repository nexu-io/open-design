// @vitest-environment jsdom

/**
 * 模型**自己开**的 `direction-cards` 也由内置风格目录接管
 * (2026-08-26 用户裁决:「为什么不把 tone 的内容换到 direction-cards 里?」)。
 *
 * 起因:用户截到一张「四张纯色卡」的方向选择 —— 那是模型现开的 `direction-cards`,
 * 它**没有素材**,预览面只能画占位块。而产品自己有一沓真预览图(每个 context 一沓,
 * 共 96 张,住在 R2),今天只挂在 discovery 简报的 `tone` 那道题上。
 * 同一件事(选视觉方向)不该有真图和占位块两副样子。
 *
 * 换掉模型给的选项后，答案会把 Host stable id、可由 agent 拉取的 foundation
 * id，以及这张卡的视觉 guidance 一起回传，避免 agent 拿 Host id 去查旧方向库。
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QuestionFormView } from '../../src/components/QuestionForm';
import type { QuestionForm } from '../../src/artifacts/question-form';
import { visualStyleCardsForContext } from '../../src/runtime/visual-style-catalog';
import { VISUAL_STYLE_BATCH_SIZE } from '../../src/runtime/visual-style-deck';

afterEach(cleanup);

/** 模型现开的那种:四个自造选项 + 四张没有图的卡 */
const modelAuthored: QuestionForm = {
  id: 'directions',
  title: '先定个视觉方向',
  questions: [
    {
      id: 'direction',
      label: '视觉方向',
      type: 'direction-cards',
      required: true,
      options: [
        { label: '克制留白', value: 'restrained' },
        { label: '编辑杂志', value: 'editorial' },
        { label: '活泼消费', value: 'playful' },
        { label: '数据密集', value: 'dense' },
      ],
      cards: [
        { id: 'restrained', label: '克制留白' },
        { id: 'editorial', label: '编辑杂志' },
        { id: 'playful', label: '活泼消费' },
        { id: 'dense', label: '数据密集' },
      ],
    },
  ],
} as unknown as QuestionForm;

describe('direction-cards 由内置目录接管', () => {
  it('项目有视觉风格上下文时:出的是**整份目录**,不是模型那四张', () => {
    render(
      <QuestionFormView form={modelAuthored} interactive visualStyleContext="prototype" onSubmit={vi.fn()} />,
    );
    const catalog = visualStyleCardsForContext('prototype');
    expect(catalog.length).toBeGreaterThan(20);
    // 目录里的名字在,模型自造的名字不在
    expect(screen.getByText(catalog[0]!.title)).toBeTruthy();
    expect(screen.queryByText('克制留白')).toBeNull();
  });

  it('每张卡都带**真预览图**,不是占位块', () => {
    const { container } = render(
      <QuestionFormView form={modelAuthored} interactive visualStyleContext="prototype" onSubmit={vi.fn()} />,
    );
    const imgs = container.querySelectorAll('img.qf-visual-preview-image');
    /* 牌面上是【这一批的 6 张】,不是整份目录 —— 2026-08-27 产品口径
       (「换一批时,顺序从 22 个里每次挑 6 个出来」)。这条要守的是
       「每一张都是真图」,和一批放几张无关,所以按牌面上的卡数比。 */
    expect(imgs.length).toBe(container.querySelectorAll('.qf-visual-card').length);
    expect(imgs.length).toBe(VISUAL_STYLE_BATCH_SIZE);
    expect((imgs[0] as HTMLImageElement).src).toContain('/style-catalog/v1/prototype-');
    // 占位块那一路一张都不该出
    expect(container.querySelectorAll('.qf-visual-preview-prototype')).toHaveLength(0);
  });

  it('是**单选** —— 方向只能挑一个', () => {
    const { container } = render(
      <QuestionFormView form={modelAuthored} interactive visualStyleContext="prototype" onSubmit={vi.fn()} />,
    );
    const picker = container.querySelector('.qf-visual-picker');
    expect(picker).toBeTruthy();
    expect(container.querySelectorAll('.qf-visual-card[aria-pressed="true"]').length).toBeLessThanOrEqual(1);
  });

  it('提交给 agent 的文本同时返回 stable value、foundation 与视觉 guidance', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <QuestionFormView
        form={modelAuthored}
        interactive
        visualStyleContext="prototype"
        onSubmit={onSubmit}
      />,
    );
    const selected = visualStyleCardsForContext('prototype')[0]!;

    fireEvent.click(container.querySelector(`[title="${selected.title}"]`)!);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(onSubmit.mock.calls[0]?.[0]).toContain(`${selected.title} [foundation: editorial-monocle;`);
    expect(onSubmit.mock.calls[0]?.[0]).toContain(`guidance: ${selected.description}]`);
    expect(onSubmit.mock.calls[0]?.[0]).toContain(`[value: ${selected.value}]`);
    expect(onSubmit.mock.calls[0]?.[1]).toEqual({ direction: [selected.value] });
  });

  it('**没有**视觉风格上下文时原样渲染模型那几张 —— 没有对应的一沓可换', () => {
    render(<QuestionFormView form={modelAuthored} interactive onSubmit={vi.fn()} />);
    expect(screen.getByText('克制留白')).toBeTruthy();
  });
});
