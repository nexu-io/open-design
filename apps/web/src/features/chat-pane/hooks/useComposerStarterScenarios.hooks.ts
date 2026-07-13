import { useCallback, useMemo, type MutableRefObject } from 'react';
import type { ChatSessionMode } from '@open-design/contracts';
import { trackChatPanelClick } from '../../../analytics/events';
import type { ChatComposerHandle } from '../../../components/ChatComposer';
import type { PlaceholderScenario } from '../../../components/home-hero/placeholderScenarios';
import { DESIGN_SYSTEM_NEXT_STEP_ACTIONS, type NextStepActionsVariant } from '../../../components/NextStepActions';
import type { Dict } from '../../../i18n/types';
import type { ProductType } from '../../../onboarding/recommendation';
import { startersForProduct } from '../../../onboarding/recommendation';
import { starterCopyFor } from '../../../onboarding/starter-copy';
import {
  FEATURED_DESIGN_TOOLBOX_ACTION_IDS,
  findDesignToolboxSkill,
  getDesignToolboxAction,
  type DesignToolboxActionId,
} from '../../../runtime/design-toolbox';
import type { ChatMessage, ProjectMetadata, SkillSummary } from '../../../types';
import {
  isBrandExtractionNextStepProject,
  isDesignSystemNextStepProject,
  isProgrammaticBrandAssistantMessage,
  latestAssistantForBrandStateFor,
  pickStarters,
} from '../rules';
import type { StarterPrompt } from '../types';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;
type Track = (
  event: string,
  properties: Record<string, unknown>,
  options?: { requestId?: string; insertId?: string },
) => void;

export function useComposerStarterScenarios(
  composerRef: MutableRefObject<ChatComposerHandle | null>,
  {
    displayMessages,
    projectMetadata,
    sessionMode,
    onSessionModeChange,
    skills,
    onboardingStarterPath,
    t,
    loading,
    initialDraft,
    queuedItemsLength,
    brandExtractionComplete,
    analyticsTrack,
  }: {
    displayMessages: ChatMessage[];
    projectMetadata: ProjectMetadata | undefined;
    sessionMode: ChatSessionMode;
    onSessionModeChange?: (mode: ChatSessionMode) => void;
    skills: SkillSummary[];
    onboardingStarterPath: ProductType | null;
    t: TranslateFn;
    loading: boolean;
    initialDraft: string | undefined;
    queuedItemsLength: number;
    brandExtractionComplete: boolean;
    analyticsTrack: Track;
  },
) {
  const handleToolboxAction = useCallback((id: DesignToolboxActionId) => {
    composerRef.current?.applyDesignToolboxAction(id);
  }, [composerRef]);
  const handleStarterCardClick = useCallback((prompt: string) => {
    trackChatPanelClick(analyticsTrack, {
      page_name: 'chat_panel',
      area: 'chat_panel',
      element: 'template_card',
    });
    composerRef.current?.setDraft(prompt);
  }, [analyticsTrack, composerRef]);
  const handleNextStepPromptAction = useCallback((
    prompt: string,
    options?: { sessionMode?: ChatSessionMode },
  ) => {
    if (options?.sessionMode && options.sessionMode !== sessionMode) {
      onSessionModeChange?.(options.sessionMode);
    }
    composerRef.current?.setDraft(prompt, {
      entryFrom: 'next_step',
      sessionMode: options?.sessionMode,
    });
  }, [composerRef, onSessionModeChange, sessionMode]);
  const handlePickSkill = useCallback((skillId: string) => {
    composerRef.current?.applyDesignToolboxSkill(skillId);
  }, [composerRef]);

  const latestAssistantForBrandState = useMemo(
    () => latestAssistantForBrandStateFor(displayMessages),
    [displayMessages],
  );
  const nextStepVariant: NextStepActionsVariant = sessionMode === 'plan'
    ? 'plan'
    : isDesignSystemNextStepProject(projectMetadata)
      ? isBrandExtractionNextStepProject(projectMetadata)
        ? brandExtractionComplete
          ? 'brand-extraction'
          : !latestAssistantForBrandState || isProgrammaticBrandAssistantMessage(latestAssistantForBrandState)
            ? 'brand-programmatic-incomplete'
            : 'brand-ai-incomplete'
        : 'design-system'
      : 'default';
  // The `@skill` shown in each featured row's hover detail — matched the same
  // way the composer matches it, using the raw skill name (what gets inlined
  // into the draft). Recomputed only when the skill list changes.
  const featuredToolboxSkillNames = useMemo<Partial<Record<DesignToolboxActionId, string | null>>>(() => {
    const map: Partial<Record<DesignToolboxActionId, string | null>> = {};
    for (const id of FEATURED_DESIGN_TOOLBOX_ACTION_IDS) {
      const action = getDesignToolboxAction(id);
      map[id] = action ? (findDesignToolboxSkill(action, skills)?.name ?? null) : null;
    }
    return map;
  }, [skills]);
  const blankProjectComposerScenarios = useMemo<PlaceholderScenario[]>(
    () => pickStarters(projectMetadata, t).map((starter, index) => ({
      id: `blank-${projectMetadata?.kind ?? 'prototype'}-${index}`,
      text: starter.prompt,
      chipId: 'project',
    })),
    [projectMetadata, t],
  );
  // Empty-conversation starter cards. A recommendation-started project shows
  // its OWN product path's starters — clicking replaces the composer draft, so
  // the pre-filled first request and the cards complement rather than compete.
  // The general fallback path and every other project keep the generic set.
  const starterTemplateCards = useMemo<StarterPrompt[]>(() => {
    if (onboardingStarterPath && onboardingStarterPath !== 'general') {
      return startersForProduct(onboardingStarterPath).map((starter) => {
        const copy = starterCopyFor(starter.id);
        return { icon: '✦', title: t(copy.title), tag: '', prompt: t(copy.firstPrompt) };
      });
    }
    return pickStarters(projectMetadata, t);
  }, [onboardingStarterPath, projectMetadata, t]);
  const followUpComposerScenarios = useMemo<PlaceholderScenario[]>(() => {
    if (nextStepVariant === 'design-system') {
      return DESIGN_SYSTEM_NEXT_STEP_ACTIONS.map((action) => ({
        id: action.id,
        text: action.prompt,
        chipId: 'design-system',
      }));
    }
    if (nextStepVariant === 'plan') {
      return [
        {
          id: 'plan-generate-from-doc',
          text: t('nextStep.planGeneratePrompt'),
          chipId: 'plan',
          sessionMode: 'design',
        },
        {
          id: 'plan-improve-doc',
          text: t('nextStep.planImprovePrompt'),
          chipId: 'plan',
          sessionMode: 'plan',
        },
      ];
    }
    const promptPairs: Array<[string, string]> = [
      ['auto-match', t('chat.designToolbox.prompt.autoMatchIntro')],
      ['visual-polish', t('chat.designToolbox.prompt.visualPolish')],
      ['asset-search', t('chat.designToolbox.prompt.assetSearch')],
      ['icon-workflow', t('chat.designToolbox.prompt.iconWorkflow')],
      ['anti-ai-polish', t('chat.designToolbox.prompt.antiAiPolish')],
      ['motion-polish', t('chat.designToolbox.prompt.motionPolish')],
      ['chart-gen', t('chat.designToolbox.prompt.chartGen')],
    ];
    return promptPairs.map(([id, text]) => ({
      id: `follow-up-${id}`,
      text,
      chipId: 'design-toolbox',
    }));
  }, [nextStepVariant, t]);
  const composerPlaceholderScenarios = useMemo<PlaceholderScenario[]>(() => {
    if (loading || initialDraft?.trim()) return [];
    if (displayMessages.length === 0 && queuedItemsLength === 0) return blankProjectComposerScenarios;
    if (displayMessages.length > 0) return followUpComposerScenarios;
    return [];
  }, [
    blankProjectComposerScenarios,
    displayMessages.length,
    followUpComposerScenarios,
    initialDraft,
    loading,
    queuedItemsLength,
  ]);

  return {
    handleToolboxAction,
    handleNextStepPromptAction,
    handlePickSkill,
    handleStarterCardClick,
    nextStepVariant,
    featuredToolboxSkillNames,
    starterTemplateCards,
    composerPlaceholderScenarios,
  };
}
