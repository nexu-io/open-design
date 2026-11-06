// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  NextStepActions,
  PROJECT_CONTINUE_PROMPT,
  PROJECT_GENERATE_ARTIFACT_PROMPT,
} from '../../src/components/NextStepActions';
import { I18nProvider } from '../../src/i18n';
import { en } from '../../src/i18n/locales/en';
import type { Locale } from '../../src/i18n/types';
import type { SkillSummary } from '../../src/types';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const AUTO_MATCH_TITLE = en['chat.designToolbox.action.auto-match.title'];
const VISUAL_POLISH_TITLE = en['chat.designToolbox.action.visual-polish.title'];
// The five non-featured actions surfaced inside the More → Design toolbox submenu.
const MOTION_TITLE = en['chat.designToolbox.action.motion.title'];
const MOTION_POLISH_TITLE = en['chat.designToolbox.action.motion-polish.title'];
const ANTI_AI_TITLE = en['chat.designToolbox.action.anti-ai-polish.title'];
const IMAGE_GEN_TITLE = en['chat.designToolbox.action.image-gen.title'];
const VIDEO_GEN_TITLE = en['chat.designToolbox.action.video-gen.title'];

function skill(id: string, name: string, category = 'creative-direction'): SkillSummary {
  return {
    id,
    name,
    description: `${name} skill`,
    triggers: [],
    mode: 'prototype',
    surface: 'web',
    category,
    previewType: 'html',
    designSystemRequired: false,
    defaultFor: [],
    upstream: '',
    hasBody: true,
    examplePrompt: '',
    aggregatesExamples: false,
  } as SkillSummary;
}

function renderActions(
  overrides: Partial<Parameters<typeof NextStepActions>[0]> = {},
  locale?: Locale,
) {
  const handlers = {
    onShare: vi.fn(),
    onDownload: vi.fn(),
    onToolboxAction: vi.fn(),
    onPickSkill: vi.fn(),
    onShareToOpenDesign: vi.fn(),
  };
  const ui = (
    <NextStepActions
      fileName="landing.html"
      onShare={handlers.onShare}
      onDownload={handlers.onDownload}
      onToolboxAction={handlers.onToolboxAction}
      onPickSkill={handlers.onPickSkill}
      onShareToOpenDesign={handlers.onShareToOpenDesign}
      skills={[
        skill('creative-director', 'Creative Director'),
        skill('emilkowalski-motion', 'Emil Kowalski Motion', 'animation-motion'),
        skill('imagegen-frontend-web', 'Imagegen Frontend Web', 'image-generation'),
      ]}
      {...overrides}
    />
  );
  render(locale ? <I18nProvider initial={locale}>{ui}</I18nProvider> : ui);
  return handlers;
}

/**
 * 「更多」级联现在只在**工作流档**上出现 —— `default` 那一档整档换成了
 * agent 现写的三条建议(产品裁决 2026-08-26)。设计百宝箱 / 分享 / 下载 /
 * 建设计系统这些入口没删,只是不再挂在 `default` 上,所以这些用例改用
 * `design-system` 档去打同一段代码,别让活代码丢掉回归覆盖。
 */
function renderToolbox(
  overrides: Partial<Parameters<typeof NextStepActions>[0]> = {},
  locale?: Locale,
) {
  return renderActions({ variant: 'design-system', onPromptAction: vi.fn(), ...overrides }, locale);
}

describe('NextStepActions', () => {
  it('no longer renders the fixed featured rows on any variant', () => {
    // 产品裁决把「智能匹配下一步 / 设计润色 · 可交付」这两行拿掉了。
    // 它们原来只在 `default` 出现,而 `default` 现在整档是 agent 现写的三条建议。
    for (const variant of ['design-system', 'project-incomplete', 'plan', 'brand-extraction'] as const) {
      cleanup();
      renderActions({ variant, onPromptAction: vi.fn(), onAiOptimize: vi.fn() });
      expect(screen.queryByText(AUTO_MATCH_TITLE)).toBeNull();
      expect(screen.queryByText(VISUAL_POLISH_TITLE)).toBeNull();
      expect(screen.queryByTestId('next-step-toolbox-action-auto-match')).toBeNull();
      expect(screen.queryByTestId('next-step-toolbox-action-visual-polish')).toBeNull();
    }
  });

  it('uses design-system-specific primary rows for design-system projects', () => {
    const onPromptAction = vi.fn();
    renderActions({ variant: 'design-system', onPromptAction });

    expect(screen.queryByText(AUTO_MATCH_TITLE)).toBeNull();
    expect(screen.queryByText(VISUAL_POLISH_TITLE)).toBeNull();
    expect(screen.getByText(en['nextStep.designSystemAiRefineTitle'])).toBeTruthy();
    expect(screen.getByText(en['nextStep.designSystemAuditKitTitle'])).toBeTruthy();

    fireEvent.click(screen.getByTestId('next-step-design-system-action-design-system-ai-refine'));
    expect(onPromptAction).toHaveBeenCalledWith(expect.stringContaining('refine this design system in place'));
  });

  it('offers document handoff rows after plan mode produces only a document', () => {
    const onPromptAction = vi.fn();
    renderActions({
      variant: 'plan',
      fileName: 'plan.md',
      planFileName: 'plan.md',
      artifactFileName: null,
      onPromptAction,
    });

    expect(screen.queryByText(AUTO_MATCH_TITLE)).toBeNull();
    expect(screen.getByText(en['nextStep.planGenerateTitle'])).toBeTruthy();
    expect(screen.getByText(en['nextStep.planImproveTitle'])).toBeTruthy();
    expect(screen.queryByText(en['nextStep.planImproveArtifactTitle'])).toBeNull();

    fireEvent.click(screen.getByTestId('next-step-plan-action-plan-generate-from-doc'));
    expect(onPromptAction).toHaveBeenLastCalledWith(
      expect.stringContaining('plan.md'),
      { sessionMode: 'design' },
    );

    fireEvent.click(screen.getByTestId('next-step-plan-action-plan-improve-doc'));
    expect(onPromptAction).toHaveBeenLastCalledWith(
      expect.stringContaining('plan.md'),
      { sessionMode: 'plan' },
    );
  });

  it('offers artifact refinement after plan mode produces only an artifact', () => {
    const onPromptAction = vi.fn();
    renderActions({
      variant: 'plan',
      fileName: 'index.html',
      planFileName: null,
      artifactFileName: 'index.html',
      onPromptAction,
    });

    expect(screen.queryByText(en['nextStep.planGenerateTitle'])).toBeNull();
    expect(screen.queryByText(en['nextStep.planImproveTitle'])).toBeNull();
    expect(screen.getByText(en['nextStep.planImproveArtifactTitle'])).toBeTruthy();

    fireEvent.click(screen.getByTestId('next-step-plan-action-plan-improve-artifact'));
    expect(onPromptAction).toHaveBeenLastCalledWith(
      expect.stringContaining('index.html'),
      { sessionMode: 'design' },
    );
  });

  it('offers a document/artifact merge when plan mode produces both', () => {
    const onPromptAction = vi.fn();
    renderActions({
      variant: 'plan',
      fileName: 'plan.md',
      planFileName: 'plan.md',
      artifactFileName: 'index.html',
      onPromptAction,
    });

    expect(screen.queryByText(en['nextStep.planGenerateTitle'])).toBeNull();
    expect(screen.queryByText(en['nextStep.planImproveTitle'])).toBeNull();
    expect(screen.getByText(en['nextStep.planMergeTitle'])).toBeTruthy();
    expect(screen.getByText(en['nextStep.planImproveArtifactTitle'])).toBeTruthy();

    fireEvent.click(screen.getByTestId('next-step-plan-action-plan-merge-doc-artifact'));
    expect(onPromptAction).toHaveBeenLastCalledWith(
      expect.stringContaining('plan.md'),
      { sessionMode: 'design' },
    );
    expect(onPromptAction.mock.calls.at(-1)?.[0]).toContain('index.html');
  });

  it('uses brand-extraction primary rows for programmatic brand projects', () => {
    const onAiOptimize = vi.fn();
    const onCreateDesign = vi.fn();
    renderActions({ variant: 'brand-extraction', onAiOptimize, onCreateDesign });

    expect(screen.queryByText(AUTO_MATCH_TITLE)).toBeNull();
    expect(screen.queryByText(VISUAL_POLISH_TITLE)).toBeNull();
    expect(screen.getByRole('button', {
      name: `${en['nextStep.brandAiOptimizeTitle']}. ${en['nextStep.brandAiOptimizeBody']}`,
    })).toBeTruthy();
    expect(screen.getByRole('button', {
      name: `${en['nextStep.brandCreateDesignTitle']}. ${en['nextStep.brandCreateDesignBody']}`,
    })).toBeTruthy();
    expect(screen.getByTestId('next-step-toolbox-more')).toBeTruthy();

    fireEvent.click(screen.getByTestId('next-step-brand-action-brand-ai-optimize'));
    expect(onAiOptimize).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('next-step-brand-action-brand-create-design'));
    expect(onCreateDesign).toHaveBeenCalledTimes(1);
  });

  it('offers continue extraction and agent fallback for incomplete brand extraction', () => {
    const onContinueExtraction = vi.fn();
    const onContinueAiExtraction = vi.fn();
    renderActions({
      variant: 'brand-programmatic-incomplete',
      onContinueExtraction,
      onContinueAiExtraction,
      onCreateDesign: undefined,
    });

    expect(screen.getByText(en['nextStep.brandContinueExtractionTitle'])).toBeTruthy();
    expect(screen.getByText(en['nextStep.brandContinueAiExtractionTitle'])).toBeTruthy();
    expect(screen.queryByText(en['nextStep.brandCreateDesignTitle'])).toBeNull();
    expect(screen.queryByText(en['nextStep.brandAiOptimizeTitle'])).toBeNull();

    fireEvent.click(screen.getByTestId('next-step-brand-action-brand-continue-extraction'));
    expect(onContinueExtraction).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('next-step-brand-action-brand-continue-ai-extraction'));
    expect(onContinueAiExtraction).toHaveBeenCalledTimes(1);
  });

  it('offers only agent continuation for incomplete AI brand extraction', () => {
    const onContinueAiExtraction = vi.fn();
    renderActions({
      variant: 'brand-ai-incomplete',
      onContinueExtraction: vi.fn(),
      onContinueAiExtraction,
      onAiOptimize: vi.fn(),
      onCreateDesign: vi.fn(),
    });

    expect(screen.getByText(en['nextStep.brandContinueAiExtractionTitle'])).toBeTruthy();
    expect(screen.queryByText(en['nextStep.brandContinueExtractionTitle'])).toBeNull();
    expect(screen.queryByText(en['nextStep.brandAiOptimizeTitle'])).toBeNull();
    expect(screen.queryByText(en['nextStep.brandCreateDesignTitle'])).toBeNull();

    fireEvent.click(screen.getByTestId('next-step-brand-action-brand-continue-ai-extraction'));
    expect(onContinueAiExtraction).toHaveBeenCalledTimes(1);
  });

  it('offers ordinary project recovery prompts for incomplete turns without artifacts', () => {
    const onPromptAction = vi.fn();
    renderActions({
      variant: 'project-incomplete',
      fileName: null,
      onPromptAction,
    });

    expect(screen.getByText(en['nextStep.projectContinueTitle'])).toBeTruthy();
    expect(screen.getByText(en['nextStep.projectGenerateArtifactTitle'])).toBeTruthy();
    fireEvent.click(screen.getByTestId('next-step-project-action-project-continue'));
    expect(onPromptAction).toHaveBeenCalledWith(PROJECT_CONTINUE_PROMPT);
    fireEvent.click(screen.getByTestId('next-step-project-action-project-generate-artifact'));
    expect(onPromptAction).toHaveBeenCalledWith(PROJECT_GENERATE_ARTIFACT_PROMPT);
    expect(PROJECT_GENERATE_ARTIFACT_PROMPT).toContain('semantic filename');
    expect(PROJECT_GENERATE_ARTIFACT_PROMPT).not.toContain('usually index.html');
  });

  it('localizes incomplete-project recovery prompts in Chinese', () => {
    const onPromptAction = vi.fn();
    renderActions({
      variant: 'project-incomplete',
      fileName: null,
      onPromptAction,
    }, 'zh-CN');

    fireEvent.click(screen.getByTestId('next-step-project-action-project-continue'));
    expect(onPromptAction).toHaveBeenCalledWith(
      expect.stringContaining('从已停止或未完成的回合继续处理'),
    );
    fireEvent.click(screen.getByTestId('next-step-project-action-project-generate-artifact'));
    expect(onPromptAction).toHaveBeenCalledWith(
      expect.stringContaining('现在生成缺失的项目产物'),
    );
    expect(onPromptAction).toHaveBeenCalledWith(
      expect.stringContaining('语义化文件名'),
    );
    expect(onPromptAction).not.toHaveBeenCalledWith(
      expect.stringContaining('Generate the missing project artifact now'),
    );
    expect(onPromptAction).not.toHaveBeenCalledWith(
      expect.stringContaining('通常保存为 index.html'),
    );
  });

  it('localizes design-system project prompts in Chinese', () => {
    const onPromptAction = vi.fn();
    renderActions({ variant: 'design-system', onPromptAction }, 'zh-CN');

    fireEvent.click(screen.getByTestId('next-step-design-system-action-design-system-ai-refine'));
    expect(onPromptAction).toHaveBeenCalledWith(
      expect.stringContaining('原地优化这个设计系统'),
    );
    fireEvent.click(screen.getByTestId('next-step-design-system-action-design-system-audit-kit'));
    expect(onPromptAction).toHaveBeenCalledWith(
      expect.stringContaining('审查这个设计系统是否已经可用'),
    );
    expect(onPromptAction).not.toHaveBeenCalledWith(
      expect.stringContaining('refine this design system in place'),
    );
  });

  it('keeps brand-extraction rows visible and disabled while their actions are starting', () => {
    renderActions({
      variant: 'brand-extraction',
      onAiOptimize: vi.fn(),
      onCreateDesign: vi.fn(),
      aiOptimizeBusy: true,
      createDesignBusy: true,
    });

    const optimize = screen.getByTestId('next-step-brand-action-brand-ai-optimize') as HTMLButtonElement;
    const create = screen.getByTestId('next-step-brand-action-brand-create-design') as HTMLButtonElement;
    expect(screen.getByText(en['brandEnrichment.busy'])).toBeTruthy();
    expect(screen.getByText(en['nextStep.createDesignBusy'])).toBeTruthy();
    expect(optimize.disabled).toBe(true);
    expect(create.disabled).toBe(true);
  });

  it('explains brand-extraction actions in hover detail', () => {
    renderActions({
      variant: 'brand-extraction',
      onAiOptimize: vi.fn(),
      onCreateDesign: vi.fn(),
    });

    fireEvent.mouseEnter(screen.getByTestId('next-step-brand-action-brand-ai-optimize'));

    const tooltip = screen.getByRole('tooltip');
    expect(within(tooltip).getByText(en['nextStep.brandAiOptimizeTitle'])).toBeTruthy();
    expect(within(tooltip).getByText(en['nextStep.brandAiOptimizeBody'])).toBeTruthy();
  });

  it('opens the More menu with Design toolbox + Share on hover', () => {
    renderToolbox();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    const menu = screen.getByTestId('next-step-more-menu');
    expect(menu).toBeTruthy();
    expect(screen.getByTestId('next-step-more-toolbox')).toBeTruthy();
    expect(screen.getByTestId('next-step-more-share')).toBeTruthy();
  });

  it('cascades into searchable non-featured toolbox actions and global resources', () => {
    renderToolbox();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-toolbox'));
    const list = screen.getByTestId('next-step-toolbox-actions');

    for (const title of [
      MOTION_TITLE,
      MOTION_POLISH_TITLE,
      ANTI_AI_TITLE,
      IMAGE_GEN_TITLE,
      VIDEO_GEN_TITLE,
    ]) {
      expect(within(list).getByText(title)).toBeTruthy();
    }

    // The two featured actions are not duplicated inside the submenu.
    expect(within(list).queryByText(AUTO_MATCH_TITLE)).toBeNull();
    expect(within(list).queryByText(VISUAL_POLISH_TITLE)).toBeNull();
    expect(within(list).getByRole('textbox')).toBeTruthy();
    expect(within(list).getByText(en['chat.designToolbox.resourcesSection'])).toBeTruthy();
    expect(within(list).getByText('Creative Director')).toBeTruthy();
    expect(within(list).getByText('Emil Kowalski Motion')).toBeTruthy();
  });

  it('filters actions and global resources from the toolbox search box', () => {
    renderToolbox();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-toolbox'));
    const list = screen.getByTestId('next-step-toolbox-actions');

    fireEvent.change(within(list).getByRole('textbox'), { target: { value: 'image' } });

    expect(within(list).getByText(IMAGE_GEN_TITLE)).toBeTruthy();
    expect(within(list).getByText('Imagegen Frontend Web')).toBeTruthy();
    expect(within(list).queryByText(MOTION_TITLE)).toBeNull();
  });

  it('keeps an action visible when searching by its preferred skill id (parity with the composer matcher)', () => {
    renderToolbox();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-toolbox'));
    const list = screen.getByTestId('next-step-toolbox-actions');

    // `emilkowalski-motion` is the preferred skill of the `motion` action.
    fireEvent.change(within(list).getByRole('textbox'), { target: { value: 'emilkowalski-motion' } });

    // The skill resource row matches by id...
    expect(within(list).getByTestId('next-step-toolbox-resource-emilkowalski-motion')).toBeTruthy();
    // ...and the action it is the preferred skill for must stay visible too,
    // instead of the action row disappearing while its resource row shows.
    expect(within(list).getByTestId('next-step-toolbox-sub-action-motion')).toBeTruthy();
  });

  it('matches and renders a global resource by its localized text under a non-English locale', () => {
    const localizedSkill = {
      ...skill('creative-director', 'creative-director'),
      displayName: { 'zh-CN': '创意总监' },
      descriptionI18n: { 'zh-CN': 'AI 创意总监，负责整体审美方向' },
    } as SkillSummary;
    renderToolbox({ skills: [localizedSkill] }, 'zh-CN');
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-toolbox'));
    const list = screen.getByTestId('next-step-toolbox-actions');

    fireEvent.change(within(list).getByRole('textbox'), { target: { value: '创意总监' } });

    // The localized query matches (parity with the composer's localized index)...
    expect(within(list).getByTestId('next-step-toolbox-resource-creative-director')).toBeTruthy();
    // ...and the row renders the localized name rather than the raw id.
    expect(within(list).getByText('创意总监')).toBeTruthy();
  });

  it('keeps the paired action visible for a localized preferred-skill query (action/resource parity under a non-English locale)', () => {
    const motionSkill = {
      ...skill('emilkowalski-motion', 'emilkowalski-motion', 'animation-motion'),
      displayName: { 'zh-CN': '动效大师' },
    } as SkillSummary;
    renderToolbox({ skills: [motionSkill] }, 'zh-CN');
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-toolbox'));
    const list = screen.getByTestId('next-step-toolbox-actions');

    fireEvent.change(within(list).getByRole('textbox'), { target: { value: '动效大师' } });

    // The resource row matches the localized name...
    expect(within(list).getByTestId('next-step-toolbox-resource-emilkowalski-motion')).toBeTruthy();
    // ...and the action it is the preferred skill for must stay visible, instead
    // of the action matcher ignoring the localized skill text and hiding it.
    expect(within(list).getByTestId('next-step-toolbox-sub-action-motion')).toBeTruthy();
  });

  it('seeds the composer with a non-featured action id when picked from the submenu', () => {
    const h = renderToolbox();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-toolbox'));
    fireEvent.click(screen.getByTestId('next-step-toolbox-sub-action-motion'));
    expect(h.onToolboxAction).toHaveBeenCalledWith('motion');
  });

  it('seeds the composer with a global resource skill when picked from the submenu', () => {
    const h = renderToolbox();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-toolbox'));
    fireEvent.click(screen.getByTestId('next-step-toolbox-resource-emilkowalski-motion'));
    expect(h.onPickSkill).toHaveBeenCalledWith('emilkowalski-motion');
  });

  it('cascades into Share / Download / Contribute and routes each action', () => {
    const h = renderToolbox();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-share'));
    expect(screen.getByTestId('next-step-share-menu')).toBeTruthy();

    fireEvent.click(screen.getByTestId('next-step-share-share'));
    expect(h.onShare).toHaveBeenCalledWith('landing.html');

    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-share'));
    fireEvent.click(screen.getByTestId('next-step-share-download'));
    expect(h.onDownload).toHaveBeenCalledWith('landing.html');

    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-share'));
    fireEvent.click(screen.getByTestId('next-step-share-contribute'));
    expect(h.onShareToOpenDesign).toHaveBeenCalledTimes(1);
  });

  it('hides the More row when nothing behind it is wired', () => {
    renderToolbox({
      onToolboxAction: undefined,
      onShare: undefined,
      onDownload: undefined,
      onShareToOpenDesign: undefined,
      onCreateDesignSystem: undefined,
    });
    expect(screen.queryByTestId('next-step-toolbox-more')).toBeNull();
  });
});

/**
 * 稿子第 41 / 42 格 —— 回合末尾三行**由 agent 现写**的行为引导。
 *
 * 产品裁决(2026-08-26):固定的工具箱目录不要了,换成 agent 生成的三条行为引导。
 * 这一族的判据全在这里:
 *   · 三条建议照原样出成三行,不是菜单;
 *   · 点一条 = 把那句话**直接发出去**(所以行尾没有 `›`);
 *   · 旧会话(没有建议)这一行**干脆不出** —— 不退回工具箱、不出空壳。
 */
describe('NextStepActions · 三条行为引导', () => {
  const THREE = ['再加一页订单列表', '把商品卡换成两列布局', '补一套深色模式'];

  function renderSuggestions(
    suggestions: string[] | undefined,
    overrides: Partial<Parameters<typeof NextStepActions>[0]> = {},
  ) {
    const onSuggestion = vi.fn();
    renderActions({ suggestions, onSuggestion, ...overrides });
    return { onSuggestion };
  }

  it('把三条建议出成三行', () => {
    renderSuggestions(THREE);
    const list = screen.getByTestId('next-step-suggestions');
    for (const text of THREE) expect(within(list).getByText(text)).toBeTruthy();
    expect(within(list).getAllByRole('button')).toHaveLength(3);
  });

  it('每行一枚箭头,没有分类图标、没有行尾 chevron', () => {
    renderSuggestions(THREE);
    const row = screen.getByTestId('next-step-suggestion-0');
    // 稿子 `.nexts button` 里只有一个 svg —— 同一枚箭头。多出来的那个就是
    // 「点开还有下一层」的承诺,而这一行点下去是直接发送,没有下一层。
    expect(row.querySelectorAll('svg')).toHaveLength(1);
  });

  it('点一条就把那句话发出去 —— 不是打开菜单、也不是填草稿', () => {
    const { onSuggestion } = renderSuggestions(THREE);
    fireEvent.click(screen.getByTestId('next-step-suggestion-1'));
    expect(onSuggestion).toHaveBeenCalledTimes(1);
    expect(onSuggestion).toHaveBeenCalledWith('把商品卡换成两列布局');
  });

  it('旧会话(没有建议)整块不出 —— 不退回工具箱、不出空壳', () => {
    renderSuggestions(undefined);
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
    expect(screen.queryByTestId('next-step-suggestions')).toBeNull();
    // 工具箱那一档已经不在 `default` 上了,不能因为「没有建议」又退回去
    expect(screen.queryByTestId('next-step-toolbox-more')).toBeNull();
    expect(screen.queryByText(AUTO_MATCH_TITLE)).toBeNull();
  });

  it('空数组同理', () => {
    renderSuggestions([]);
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
  });

  it('全是空白字符时也不出', () => {
    renderSuggestions(['  ', '\n']);
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
  });

  it('没有接发送回调时不出 —— 出了也点不动', () => {
    renderActions({ suggestions: THREE, onSuggestion: undefined });
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
  });

  it('模型给多于三条时只出前三条', () => {
    renderSuggestions([...THREE, '再来一条', '还有一条']);
    expect(within(screen.getByTestId('next-step-suggestions')).getAllByRole('button')).toHaveLength(3);
    expect(screen.queryByText('再来一条')).toBeNull();
  });

  it('模型只给一条时就出一条,不补空行', () => {
    renderSuggestions(['补一套深色模式']);
    const list = screen.getByTestId('next-step-suggestions');
    expect(within(list).getAllByRole('button')).toHaveLength(1);
    expect(within(list).getByText('补一套深色模式')).toBeTruthy();
  });

  it('工作流档不受影响:仍然是各自的恢复入口,不出建议行', () => {
    renderActions({
      variant: 'brand-programmatic-incomplete',
      suggestions: THREE,
      onSuggestion: vi.fn(),
      onContinueExtraction: vi.fn(),
      onContinueAiExtraction: vi.fn(),
    });
    expect(screen.queryByTestId('next-step-suggestions')).toBeNull();
    expect(screen.getByText(en['nextStep.brandContinueExtractionTitle'])).toBeTruthy();
  });
});
