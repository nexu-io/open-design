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
      toolboxSkillNames={{ 'auto-match': 'creative-director', 'visual-polish': 'impeccable-design-polish' }}
      {...overrides}
    />
  );
  render(locale ? <I18nProvider initial={locale}>{ui}</I18nProvider> : ui);
  return handlers;
}

describe('NextStepActions', () => {
  it('renders the two featured rows and More', () => {
    renderActions();
    expect(screen.getByText(AUTO_MATCH_TITLE)).toBeTruthy();
    expect(screen.getByText(VISUAL_POLISH_TITLE)).toBeTruthy();
    expect(screen.getByTestId('next-step-toolbox-more')).toBeTruthy();
  });

  it('seeds the composer with the action id (no auto-send) when a featured row is clicked', () => {
    const h = renderActions();
    fireEvent.click(screen.getByTestId('next-step-toolbox-action-visual-polish'));
    expect(h.onToolboxAction).toHaveBeenCalledWith('visual-polish');
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
    expect(screen.getByText(en['nextStep.brandAiOptimizeTitle'])).toBeTruthy();
    expect(screen.getByText(en['nextStep.brandAiOptimizeBody'])).toBeTruthy();
    expect(screen.getByText(en['nextStep.brandCreateDesignTitle'])).toBeTruthy();
    expect(screen.getByText(en['nextStep.brandCreateDesignBody'])).toBeTruthy();
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
    expect(onPromptAction).not.toHaveBeenCalledWith(
      expect.stringContaining('Generate the missing project artifact now'),
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

  it('reveals the matched @skill in the featured-row hover detail', () => {
    renderActions();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-action-auto-match'));
    expect(screen.getByText('@creative-director')).toBeTruthy();
  });

  it('opens the More menu with Design toolbox + Share on hover', () => {
    renderActions();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    const menu = screen.getByTestId('next-step-more-menu');
    expect(menu).toBeTruthy();
    expect(screen.getByTestId('next-step-more-toolbox')).toBeTruthy();
    expect(screen.getByTestId('next-step-more-share')).toBeTruthy();
  });

  it('cascades into searchable non-featured toolbox actions and global resources', () => {
    renderActions();
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
    renderActions();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-toolbox'));
    const list = screen.getByTestId('next-step-toolbox-actions');

    fireEvent.change(within(list).getByRole('textbox'), { target: { value: 'image' } });

    expect(within(list).getByText(IMAGE_GEN_TITLE)).toBeTruthy();
    expect(within(list).getByText('Imagegen Frontend Web')).toBeTruthy();
    expect(within(list).queryByText(MOTION_TITLE)).toBeNull();
  });

  it('keeps an action visible when searching by its preferred skill id (parity with the composer matcher)', () => {
    renderActions();
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
    renderActions({ skills: [localizedSkill] }, 'zh-CN');
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
    renderActions({ skills: [motionSkill] }, 'zh-CN');
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
    const h = renderActions();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-toolbox'));
    fireEvent.click(screen.getByTestId('next-step-toolbox-sub-action-motion'));
    expect(h.onToolboxAction).toHaveBeenCalledWith('motion');
  });

  it('seeds the composer with a global resource skill when picked from the submenu', () => {
    const h = renderActions();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-toolbox'));
    fireEvent.click(screen.getByTestId('next-step-toolbox-resource-emilkowalski-motion'));
    expect(h.onPickSkill).toHaveBeenCalledWith('emilkowalski-motion');
  });

  it('cascades into Share / Download / Contribute and routes each action', () => {
    const h = renderActions();
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

  it('hides the toolbox rows when no toolbox handler is wired', () => {
    renderActions({ onToolboxAction: undefined });
    expect(screen.queryByTestId('next-step-toolbox-action-auto-match')).toBeNull();
  });
});
