import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ChatSessionMode } from '@open-design/contracts';
import { useI18n } from '../i18n';
import { localizeSkillDescription, localizeSkillName } from '../i18n/content';
import type { Dict } from '../i18n/types';
import { useAnalytics } from '../analytics/provider';
import { trackNextStepActionClick } from '../analytics/events';
import { Icon, type IconName } from './Icon';
import {
  DESIGN_TOOLBOX_ACTIONS,
  FEATURED_DESIGN_TOOLBOX_ACTION_IDS,
  designToolboxActionBadge,
  designToolboxActionDescription,
  designToolboxActionMatchesQuery,
  designToolboxActionTitle,
  findDesignToolboxSkill,
  getDesignToolboxAction,
  skillMatchesQuery,
  type DesignToolboxAction,
  type DesignToolboxActionId,
} from '../runtime/design-toolbox';
import type { SkillSummary } from '../types';
import styles from './NextStepActions.module.css';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;
export type NextStepActionsVariant =
  | 'default'
  | 'project-incomplete'
  | 'design-system'
  | 'brand-extraction'
  | 'brand-extraction-incomplete'
  | 'brand-programmatic-incomplete'
  | 'brand-ai-incomplete'
  | 'plan';

export const DESIGN_SYSTEM_NEXT_STEP_ACTIONS = [
  {
    id: 'design-system-ai-refine',
    icon: 'sparkles' as IconName,
    titleKey: 'nextStep.designSystemAiRefineTitle' as keyof Dict,
    prompt:
      'Use AI extraction to refine this design system in place. Read the current DESIGN.md, brand.json, source context, tokens, typography, palette, assets, and component kit previews. Re-measure any linked website or source files when available, then update the same design system id without creating a duplicate. Focus on stronger token roles, brand voice, component guidance, light/dark kit quality, and reusable implementation notes. Finish by summarizing what changed and which files were updated.',
  },
  {
    id: 'design-system-audit-kit',
    icon: 'blocks' as IconName,
    titleKey: 'nextStep.designSystemAuditKitTitle' as keyof Dict,
    prompt:
      'Audit this design system for readiness. Check DESIGN.md, brand.json, variables.css, theme.json, kit.html, kit.dark.html, generated artifacts, palette contrast, typography specimens, spacing/radius rules, and component coverage. Fix the highest-impact issues directly, keep the same registered design system id, and report remaining gaps before publishing or using it in other projects.',
  },
] as const;

export const PROJECT_CONTINUE_PROMPT =
  'Continue from the stopped or incomplete turn. Read the conversation, current project files, and any visible errors, then take the next concrete step. If a primary artifact already exists, update it in place; otherwise create the missing primary artifact and summarize what changed.';

export const PROJECT_GENERATE_ARTIFACT_PROMPT =
  'Generate the missing project artifact now. Use the current conversation and project context to create the primary previewable deliverable, usually index.html unless another file type is clearly requested. Save it into this project and include a concise summary of the files created.';

export const PROJECT_INCOMPLETE_NEXT_STEP_ACTIONS = [
  {
    id: 'project-continue',
    icon: 'refresh' as IconName,
    titleKey: 'nextStep.projectContinueTitle' as keyof Dict,
    prompt: PROJECT_CONTINUE_PROMPT,
  },
  {
    id: 'project-generate-artifact',
    icon: 'plus' as IconName,
    titleKey: 'nextStep.projectGenerateArtifactTitle' as keyof Dict,
    prompt: PROJECT_GENERATE_ARTIFACT_PROMPT,
  },
] as const;

export const BRAND_EXTRACTION_NEXT_STEP_ACTIONS = [
  {
    id: 'brand-ai-optimize',
    icon: 'sparkles' as IconName,
    titleKey: 'nextStep.brandAiOptimizeTitle' as keyof Dict,
    descriptionKey: 'nextStep.brandAiOptimizeBody' as keyof Dict,
    busyKey: 'brandEnrichment.busy' as keyof Dict,
  },
  {
    id: 'brand-create-design',
    icon: 'plus' as IconName,
    titleKey: 'nextStep.brandCreateDesignTitle' as keyof Dict,
    descriptionKey: 'nextStep.brandCreateDesignBody' as keyof Dict,
    busyKey: 'nextStep.createDesignBusy' as keyof Dict,
  },
] as const;

const PLAN_NEXT_STEP_ACTIONS = [
  {
    id: 'plan-generate-from-doc',
    icon: 'sparkles' as IconName,
    titleKey: 'nextStep.planGenerateTitle' as keyof Dict,
    descriptionKey: 'nextStep.planGenerateBody' as keyof Dict,
    promptKey: 'nextStep.planGeneratePrompt' as keyof Dict,
    sessionMode: 'design' as ChatSessionMode,
    requires: 'plan' as const,
  },
  {
    id: 'plan-improve-doc',
    icon: 'file' as IconName,
    titleKey: 'nextStep.planImproveTitle' as keyof Dict,
    descriptionKey: 'nextStep.planImproveBody' as keyof Dict,
    promptKey: 'nextStep.planImprovePrompt' as keyof Dict,
    sessionMode: 'plan' as ChatSessionMode,
    requires: 'plan' as const,
  },
  {
    id: 'plan-improve-artifact',
    icon: 'sparkles' as IconName,
    titleKey: 'nextStep.planImproveArtifactTitle' as keyof Dict,
    descriptionKey: 'nextStep.planImproveArtifactBody' as keyof Dict,
    promptKey: 'nextStep.planImproveArtifactPrompt' as keyof Dict,
    sessionMode: 'design' as ChatSessionMode,
    requires: 'artifact' as const,
  },
  {
    id: 'plan-merge-doc-artifact',
    icon: 'blocks' as IconName,
    titleKey: 'nextStep.planMergeTitle' as keyof Dict,
    descriptionKey: 'nextStep.planMergeBody' as keyof Dict,
    promptKey: 'nextStep.planMergePrompt' as keyof Dict,
    sessionMode: 'design' as ChatSessionMode,
    requires: 'both' as const,
  },
] as const;
const PLAN_GENERATE_ACTION = PLAN_NEXT_STEP_ACTIONS[0];
const PLAN_IMPROVE_DOC_ACTION = PLAN_NEXT_STEP_ACTIONS[1];
const PLAN_IMPROVE_ARTIFACT_ACTION = PLAN_NEXT_STEP_ACTIONS[2];
const PLAN_MERGE_DOC_ARTIFACT_ACTION = PLAN_NEXT_STEP_ACTIONS[3];

export const BRAND_CONTINUE_EXTRACTION_PROMPT =
  'Continue the programmatic design-system extraction from the saved draft. Re-open the source website and current brand files, inspect brand.html, brand.json, DESIGN.md, system assets, and any prefetched source files if present, then fill missing logo, palette, typography, imagery, and kit guidance progressively. Update the same design system id and do not create a duplicate.';

export const BRAND_EXTRACTION_INCOMPLETE_NEXT_STEP_ACTIONS = [
  {
    id: 'brand-continue-extraction',
    icon: 'sparkles' as IconName,
    titleKey: 'nextStep.brandContinueExtractionTitle' as keyof Dict,
    descriptionKey: 'nextStep.brandContinueExtractionBody' as keyof Dict,
    busyKey: 'nextStep.brandContinueExtractionBusy' as keyof Dict,
    prompt: BRAND_CONTINUE_EXTRACTION_PROMPT,
  },
  {
    id: 'brand-continue-ai-extraction',
    icon: 'sparkles' as IconName,
    titleKey: 'nextStep.brandContinueAiExtractionTitle' as keyof Dict,
    descriptionKey: 'nextStep.brandContinueAiExtractionProgrammaticBody' as keyof Dict,
    busyKey: 'nextStep.brandContinueAiExtractionBusy' as keyof Dict,
  },
] as const;

export const BRAND_AI_EXTRACTION_INCOMPLETE_NEXT_STEP_ACTIONS = [
  {
    id: 'brand-continue-ai-extraction',
    icon: 'sparkles' as IconName,
    titleKey: 'nextStep.brandContinueAiExtractionTitle' as keyof Dict,
    descriptionKey: 'nextStep.brandContinueAiExtractionAiBody' as keyof Dict,
    busyKey: 'nextStep.brandContinueAiExtractionBusy' as keyof Dict,
  },
] as const;

const ALL_BRAND_EXTRACTION_NEXT_STEP_ACTIONS = [
  ...BRAND_EXTRACTION_NEXT_STEP_ACTIONS,
  ...BRAND_EXTRACTION_INCOMPLETE_NEXT_STEP_ACTIONS,
  ...BRAND_AI_EXTRACTION_INCOMPLETE_NEXT_STEP_ACTIONS,
] as const;

// Surfaced under More → Design toolbox. The two featured ids already have their
// own rows at the top of the card, so we drop them here to avoid duplicating
// the same action one level down.
const NON_FEATURED_TOOLBOX_ACTIONS = DESIGN_TOOLBOX_ACTIONS.filter(
  (action) => !FEATURED_DESIGN_TOOLBOX_ACTION_IDS.includes(action.id),
);

interface Props {
  // The previewable artifact this affordance is anchored to. Passed back to
  // share/download so the parent can act on the right file.
  fileName?: string | null;
  // Plan-mode actions need both sides of the handoff when available: the
  // editable Markdown plan and the generated artifact it should govern.
  planFileName?: string | null;
  artifactFileName?: string | null;
  // Open the file's existing Share/Export menu in the preview workspace.
  onShare?: (fileName: string) => void;
  // Download the previewable artifact.
  onDownload?: (fileName: string) => void;
  // Seed the composer with a featured design-toolbox action (matched skill +
  // prompt). Does NOT auto-send — the composer draft waits for the user.
  onToolboxAction?: (id: DesignToolboxActionId) => void;
  // Seed the composer with a custom prompt. Used for design-system projects,
  // where the primary next steps are system optimization rather than generic
  // artifact polishing.
  onPromptAction?: (
    prompt: string,
    options?: { sessionMode?: ChatSessionMode },
  ) => void;
  // Run the deeper AI extraction pass for a programmatically-created brand
  // design system.
  onAiOptimize?: () => void;
  aiOptimizeBusy?: boolean;
  // Restart the deterministic programmatic pass for an incomplete brand
  // extraction, reusing the same brand/project/design-system.
  onContinueExtraction?: () => void;
  continueExtractionBusy?: boolean;
  // Resume the selected agent on an incomplete brand extraction scaffold.
  onContinueAiExtraction?: () => void;
  continueAiExtractionBusy?: boolean;
  // Create a new design using the active brand/design system.
  onCreateDesign?: () => void;
  createDesignBusy?: boolean;
  // Create a new design-system project from the current regular project.
  onCreateDesignSystem?: () => void;
  createDesignSystemBusy?: boolean;
  // Seed the composer with a specific global skill resource picked from the toolbox.
  onPickSkill?: (skillId: string) => void;
  // Available global skill resources. The full composer toolbox also includes
  // MCP/plugins/connectors/files; this next-step flyout keeps the same shape
  // while using the resource data already owned by the chat pane.
  skills?: SkillSummary[];
  // Resolved `@skill` names per featured action, shown in the hover detail.
  toolboxSkillNames?: Partial<Record<DesignToolboxActionId, string | null>>;
  // Contribute the artifact to the Open Design community gallery.
  onShareToOpenDesign?: () => void;
  shareToOpenDesignBusy?: boolean;
  variant?: NextStepActionsVariant;
}

const FLYOUT_GAP = 8;
const VIEWPORT_MARGIN = 8;
const DETAIL_WIDTH = 240;
const MENU_WIDTH = 200;
// Conservative heights used to keep a flyout on-screen vertically (over-estimating
// only shifts it further up, which is always safe).
const DETAIL_HEIGHT = 180;
const MENU_HEIGHT = 180;
// The Design toolbox submenu mirrors the plus-menu panel: title/search,
// follow-up actions, and global resources.
const TOOLBOX_SUB_WIDTH = 300;
const TOOLBOX_SUB_HEIGHT = 500;
// Give users enough time to cross the small gap between flyout levels without
// making dismissal feel sticky once the pointer leaves the whole affordance.
const FLYOUT_CLOSE_DELAY_MS = 240;

// Place a flyout next to an anchor rect: flip to the left when the right edge
// would overflow, and clamp vertically so a tall flyout under a row near the
// bottom of the viewport keeps its bottom edge on-screen. Returns viewport-fixed
// coordinates.
function place(
  anchor: DOMRect,
  width: number,
  height: number,
): { left: number; top: number } {
  const toRight = anchor.right + FLYOUT_GAP;
  const left =
    toRight + width > window.innerWidth - VIEWPORT_MARGIN
      ? anchor.left - FLYOUT_GAP - width
      : toRight;
  const maxTop = window.innerHeight - VIEWPORT_MARGIN - height;
  const top = Math.max(VIEWPORT_MARGIN, Math.min(anchor.top, maxTop));
  return { left: Math.max(VIEWPORT_MARGIN, left), top };
}

type Anchor = { left: number; top: number };
type SubKind = 'toolbox' | 'share';
type BrandExtractionAction = (typeof ALL_BRAND_EXTRACTION_NEXT_STEP_ACTIONS)[number];
type BrandExtractionActionId = BrandExtractionAction['id'];
type PlanAction = (typeof PLAN_NEXT_STEP_ACTIONS)[number];
type PromptNextStepAction =
  | (typeof DESIGN_SYSTEM_NEXT_STEP_ACTIONS)[number]
  | (typeof PROJECT_INCOMPLETE_NEXT_STEP_ACTIONS)[number];
type Detail =
  | ({ kind: 'toolbox'; id: DesignToolboxActionId } & Anchor)
  | ({ kind: 'brand'; id: BrandExtractionActionId } & Anchor);

function isPlanFileName(fileName: string | null | undefined): boolean {
  return !!fileName && /\.mdx?$/i.test(fileName);
}

function isArtifactFileName(fileName: string | null | undefined): boolean {
  return !!fileName && /\.html?$/i.test(fileName);
}

function brandActionTitle(action: BrandExtractionAction, t: TranslateFn, busy: boolean): string {
  if ('busyKey' in action && busy) return t(action.busyKey);
  return t(action.titleKey);
}

function brandActionDescription(action: BrandExtractionAction, t: TranslateFn): string {
  return t(action.descriptionKey);
}

function promptActionTitle(action: PromptNextStepAction, t: TranslateFn): string {
  return t(action.titleKey);
}

function promptActionPrompt(action: PromptNextStepAction, locale: string): string {
  if (locale !== 'zh-CN') return action.prompt;
  switch (action.id) {
    case 'project-continue':
      return '从已停止或未完成的回合继续处理。先阅读当前对话、项目文件和可见错误，再执行下一个具体步骤。如果主产物已经存在，就在原文件上更新；否则创建缺失的主产物，并简要总结改了什么。';
    case 'project-generate-artifact':
      return '现在生成缺失的项目产物。基于当前对话和项目上下文创建主要的可预览交付物；除非明确要求其他文件类型，通常保存为 index.html。把文件保存到当前项目中，并简要说明创建了哪些文件。';
    case 'design-system-ai-refine':
      return '使用 AI 提取继续原地优化这个设计系统。读取当前 DESIGN.md、brand.json、source context、tokens、字体、色板、资产和组件套件预览；如果有链接的网站或源文件，请重新测量。保持同一个设计系统 id，不要创建重复系统。重点强化 token 角色、品牌语气、组件指导、明暗主题套件质量和可复用实现说明。最后总结改动和更新的文件。';
    case 'design-system-audit-kit':
      return '审查这个设计系统是否已经可用。检查 DESIGN.md、brand.json、variables.css、theme.json、kit.html、kit.dark.html、生成产物、色彩对比度、字体样张、间距/圆角规则和组件覆盖度。直接修复最高影响的问题，保持同一个已注册设计系统 id，并在发布或用于其他项目之前报告剩余缺口。';
    default:
      return (action as PromptNextStepAction).prompt;
  }
}

export function NextStepActions({
  fileName,
  planFileName,
  artifactFileName,
  onShare,
  onDownload,
  onToolboxAction,
  onPromptAction,
  onAiOptimize,
  aiOptimizeBusy = false,
  onContinueExtraction,
  continueExtractionBusy = false,
  onContinueAiExtraction,
  continueAiExtractionBusy = false,
  onCreateDesign,
  createDesignBusy = false,
  onCreateDesignSystem,
  createDesignSystemBusy = false,
  onPickSkill,
  skills = [],
  toolboxSkillNames,
  onShareToOpenDesign,
  shareToOpenDesignBusy = false,
  variant = 'default',
}: Props) {
  const { t, locale } = useI18n();
  const analytics = useAnalytics();
  const exposedRef = useRef(false);
  useEffect(() => {
    if (exposedRef.current) return;
    exposedRef.current = true;
    trackNextStepActionClick(analytics.track, {
      page_name: 'chat_panel',
      area: 'next_step',
      element: 'next_step_exposed',
    });
  }, [analytics.track]);

  // Three-level cascading hover menu, all portaled to <body> with fixed
  // positioning so the narrow chat column never clips or occludes them:
  //   featured row  → detail card (skill summary)
  //   More          → [Design toolbox, Share]   (level 2)
  //   Design toolbox → search + non-featured actions + global resources (level 3)
  //   Share          → Share / Download / Contribute (level 3)
  // A single close timer with hover-intent keeps the whole path open while the
  // cursor travels between levels; entering any panel cancels the pending close.
  const [detail, setDetail] = useState<Detail | null>(null);
  const [more, setMore] = useState<Anchor | null>(null);
  const [sub, setSub] = useState<({ kind: SubKind } & Anchor) | null>(null);
  const [toolboxQuery, setToolboxQuery] = useState('');

  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  const closeAll = useCallback(() => {
    setDetail(null);
    setMore(null);
    setSub(null);
  }, []);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      closeAll();
      closeTimer.current = null;
    }, FLYOUT_CLOSE_DELAY_MS);
  }, [cancelClose, closeAll]);
  useEffect(() => () => cancelClose(), [cancelClose]);

  const openDetail = useCallback(
    (id: DesignToolboxActionId, rect: DOMRect) => {
      cancelClose();
      setMore(null);
      setSub(null);
      setDetail({ kind: 'toolbox', id, ...place(rect, DETAIL_WIDTH, DETAIL_HEIGHT) });
    },
    [cancelClose],
  );
  const openBrandDetail = useCallback(
    (id: BrandExtractionActionId, rect: DOMRect) => {
      cancelClose();
      setMore(null);
      setSub(null);
      setDetail({ kind: 'brand', id, ...place(rect, DETAIL_WIDTH, DETAIL_HEIGHT) });
    },
    [cancelClose],
  );
  const openMore = useCallback(
    (rect: DOMRect) => {
      cancelClose();
      setDetail(null);
      setSub(null);
      setMore(place(rect, MENU_WIDTH, MENU_HEIGHT));
    },
    [cancelClose],
  );
  const openSub = useCallback(
    (kind: SubKind, rect: DOMRect) => {
      cancelClose();
      if (kind === 'toolbox') setToolboxQuery('');
      setSub({
        kind,
        ...place(
          rect,
          kind === 'toolbox' ? TOOLBOX_SUB_WIDTH : MENU_WIDTH,
          kind === 'toolbox' ? TOOLBOX_SUB_HEIGHT : MENU_HEIGHT,
        ),
      });
    },
    [cancelClose],
  );

  const track = useCallback(
    (element: 'share' | 'toolbox_action' | 'toolbox_more' | 'share_to_open_design', chipId?: string) => {
      trackNextStepActionClick(analytics.track, {
        page_name: 'chat_panel',
        area: 'next_step',
        element,
        ...(chipId ? { chip_id: chipId } : {}),
      });
    },
    [analytics.track],
  );

  const handleShare = useCallback(() => {
    if (!fileName || !onShare) return;
    track('share');
    onShare(fileName);
    closeAll();
  }, [closeAll, fileName, onShare, track]);

  const handleDownload = useCallback(() => {
    if (!fileName || !onDownload) return;
    track('share', 'download');
    onDownload(fileName);
    closeAll();
  }, [closeAll, fileName, onDownload, track]);

  const handleContribute = useCallback(() => {
    if (!onShareToOpenDesign || shareToOpenDesignBusy) return;
    track('share_to_open_design');
    onShareToOpenDesign();
    closeAll();
  }, [closeAll, onShareToOpenDesign, shareToOpenDesignBusy, track]);

  const handleToolboxAction = useCallback(
    (id: DesignToolboxActionId) => {
      track('toolbox_action', id);
      onToolboxAction?.(id);
      closeAll();
    },
    [closeAll, onToolboxAction, track],
  );
  const handlePromptAction = useCallback(
    (action: PromptNextStepAction) => {
      track('toolbox_action', action.id);
      onPromptAction?.(promptActionPrompt(action, locale));
      closeAll();
    },
    [closeAll, locale, onPromptAction, track],
  );
  const resolvedPlanFileName =
    planFileName ?? (variant === 'plan' && isPlanFileName(fileName) ? fileName : null);
  const resolvedArtifactFileName =
    artifactFileName ?? (variant === 'plan' && isArtifactFileName(fileName) ? fileName : null);
  const handlePlanPromptAction = useCallback(
    (action: PlanAction) => {
      if (action.requires === 'plan' && !resolvedPlanFileName) return;
      if (action.requires === 'artifact' && !resolvedArtifactFileName) return;
      if (action.requires === 'both' && (!resolvedPlanFileName || !resolvedArtifactFileName)) return;
      const primaryFile =
        action.requires === 'artifact'
          ? resolvedArtifactFileName
          : resolvedPlanFileName ?? resolvedArtifactFileName;
      if (!primaryFile) return;
      track('toolbox_action', action.id);
      onPromptAction?.(
        t(action.promptKey, {
          file: primaryFile,
          document: resolvedPlanFileName ?? primaryFile,
          artifact: resolvedArtifactFileName ?? primaryFile,
        }),
        {
          sessionMode: action.sessionMode,
        },
      );
      closeAll();
    },
    [closeAll, onPromptAction, resolvedArtifactFileName, resolvedPlanFileName, t, track],
  );

  const handleAiOptimize = useCallback(() => {
    if (aiOptimizeBusy) return;
    track('toolbox_action', 'brand-ai-optimize');
    onAiOptimize?.();
    closeAll();
  }, [aiOptimizeBusy, closeAll, onAiOptimize, track]);

  const handleCreateDesign = useCallback(() => {
    if (createDesignBusy) return;
    track('toolbox_action', 'brand-create-design');
    onCreateDesign?.();
    closeAll();
  }, [closeAll, createDesignBusy, onCreateDesign, track]);

  const handleCreateDesignSystem = useCallback(() => {
    if (createDesignSystemBusy) return;
    track('toolbox_action', 'project-create-design-system');
    onCreateDesignSystem?.();
    closeAll();
  }, [closeAll, createDesignSystemBusy, onCreateDesignSystem, track]);

  const handleContinueAiExtraction = useCallback(() => {
    if (continueAiExtractionBusy) return;
    track('toolbox_action', 'brand-continue-ai-extraction');
    onContinueAiExtraction?.();
    closeAll();
  }, [closeAll, continueAiExtractionBusy, onContinueAiExtraction, track]);

  const handleBrandAction = useCallback(
    (action: BrandExtractionAction) => {
      if (action.id === 'brand-continue-extraction') {
        if (continueExtractionBusy) return;
        track('toolbox_action', action.id);
        onContinueExtraction?.();
        closeAll();
        return;
      }
      if (action.id === 'brand-continue-ai-extraction') {
        handleContinueAiExtraction();
        return;
      }
      if (action.id === 'brand-ai-optimize') {
        handleAiOptimize();
        return;
      }
      handleCreateDesign();
    },
    [
      closeAll,
      continueExtractionBusy,
      handleContinueAiExtraction,
      handleAiOptimize,
      handleCreateDesign,
      onContinueExtraction,
      track,
    ],
  );

  const handlePickSkill = useCallback(
    (skillId: string) => {
      track('toolbox_more', skillId);
      onPickSkill?.(skillId);
      closeAll();
    },
    [closeAll, onPickSkill, track],
  );

  const visibleToolboxActions = useMemo(
    () =>
      NON_FEATURED_TOOLBOX_ACTIONS.filter((action) => {
        const skill = findDesignToolboxSkill(action, skills);
        return designToolboxActionMatchesQuery(
          action,
          toolboxQuery,
          skill,
          t,
          skill ? [localizeSkillName(locale, skill), localizeSkillDescription(locale, skill)] : [],
        );
      }),
    [toolboxQuery, skills, locale, t],
  );

  const visibleToolboxResources = useMemo(() => {
    const source = toolboxQuery
      ? skills.filter((skill) =>
          skillMatchesQuery(skill, toolboxQuery, [
            localizeSkillName(locale, skill),
            localizeSkillDescription(locale, skill),
          ]),
        )
      : defaultToolboxSkillResources(NON_FEATURED_TOOLBOX_ACTIONS, skills);
    return source.slice(0, toolboxQuery ? 14 : 8);
  }, [skills, toolboxQuery, locale]);

  const visiblePlanActions = useMemo(() => {
    if (resolvedPlanFileName && resolvedArtifactFileName) {
      return [PLAN_MERGE_DOC_ARTIFACT_ACTION, PLAN_IMPROVE_ARTIFACT_ACTION];
    }
    if (resolvedPlanFileName) {
      return [PLAN_GENERATE_ACTION, PLAN_IMPROVE_DOC_ACTION];
    }
    if (resolvedArtifactFileName) {
      return [PLAN_IMPROVE_ARTIFACT_ACTION];
    }
    return [];
  }, [resolvedArtifactFileName, resolvedPlanFileName]);

  // Share group is available whenever any of its three actions can fire.
  const canShare = !!(fileName && onShare);
  const canDownload = !!(fileName && onDownload);
  const canContribute = !!onShareToOpenDesign;
  const hasShareGroup = canShare || canDownload || canContribute;
  const showCreateDesignSystem = (
    variant === 'default' ||
    variant === 'project-incomplete'
  ) && !!onCreateDesignSystem;
  const hasMore = showCreateDesignSystem || !!onToolboxAction || hasShareGroup;
  const showToolbox = !!onToolboxAction;
  const showPlanRows = variant === 'plan' && visiblePlanActions.length > 0 && !!onPromptAction;
  const showProjectIncompleteRows = variant === 'project-incomplete' && !!onPromptAction;
  const showDesignSystemRows = variant === 'design-system' && !!onPromptAction;
  const brandActions =
    variant === 'brand-ai-incomplete'
      ? BRAND_AI_EXTRACTION_INCOMPLETE_NEXT_STEP_ACTIONS
      : variant === 'brand-extraction-incomplete' || variant === 'brand-programmatic-incomplete'
        ? BRAND_EXTRACTION_INCOMPLETE_NEXT_STEP_ACTIONS
        : BRAND_EXTRACTION_NEXT_STEP_ACTIONS;
  const showBrandRows =
    (
      variant === 'brand-extraction' ||
      variant === 'brand-extraction-incomplete' ||
      variant === 'brand-programmatic-incomplete' ||
      variant === 'brand-ai-incomplete'
    ) &&
    (
      variant === 'brand-extraction-incomplete' || variant === 'brand-programmatic-incomplete'
        ? !!onContinueExtraction || !!onContinueAiExtraction
        : variant === 'brand-ai-incomplete'
          ? !!onContinueAiExtraction
        : !!onAiOptimize || !!onCreateDesign
    );

  // Hover handlers shared by every flyout surface: stay open while hovered.
  const keepOpen = { onMouseEnter: cancelClose, onMouseLeave: scheduleClose };

  return (
    <div className={styles.root} data-testid="next-step-actions">
      <div className={styles.label}>{t('nextStep.title')}</div>
      {showBrandRows || showPlanRows || showProjectIncompleteRows || showDesignSystemRows || showToolbox || hasMore ? (
        <div className={styles.toolboxList} data-testid="next-step-toolbox">
          {showPlanRows
            ? visiblePlanActions.map((action) => {
                const title = t(action.titleKey);
                const description = t(action.descriptionKey);
                return (
                  <button
                    key={action.id}
                    type="button"
                    className={styles.toolboxRow}
                    data-testid={`next-step-plan-action-${action.id}`}
                    aria-label={`${title}. ${description}`}
                    title={description}
                    onClick={() => handlePlanPromptAction(action)}
                  >
                    <Icon name={action.icon} size={14} className={styles.toolboxRowIcon} />
                    <span className={styles.toolboxRowText}>
                      <span className={styles.toolboxRowTitle}>{title}</span>
                      <span className={styles.toolboxRowDescription}>{description}</span>
                    </span>
                    <Icon name="chevron-right" size={13} className={styles.toolboxRowArrow} />
                  </button>
                );
              })
            : null}
          {showBrandRows
            ? brandActions.map((action) => {
                const busy =
                  (action.id === 'brand-continue-extraction' && continueExtractionBusy) ||
                  (action.id === 'brand-continue-ai-extraction' && continueAiExtractionBusy) ||
                  (action.id === 'brand-ai-optimize' && aiOptimizeBusy) ||
                  (action.id === 'brand-create-design' && createDesignBusy);
                const unavailable =
                  (action.id === 'brand-continue-extraction' && !onContinueExtraction) ||
                  (action.id === 'brand-continue-ai-extraction' && !onContinueAiExtraction) ||
                  (action.id === 'brand-ai-optimize' && !onAiOptimize) ||
                  (action.id === 'brand-create-design' && !onCreateDesign);
                if (unavailable) return null;
                const title = brandActionTitle(action, t, busy);
                const description = brandActionDescription(action, t);
                return (
                  <button
                    key={action.id}
                    type="button"
                    className={styles.toolboxRow}
                    data-testid={`next-step-brand-action-${action.id}`}
                    aria-busy={busy || undefined}
                    aria-label={`${title}. ${description}`}
                    disabled={busy}
                    title={description}
                    onClick={() => handleBrandAction(action)}
                    onMouseEnter={(e) => openBrandDetail(action.id, e.currentTarget.getBoundingClientRect())}
                    onMouseLeave={scheduleClose}
                  >
                    <Icon
                      name={busy ? 'spinner' : action.icon}
                      size={14}
                      className={busy ? 'icon-spin' : styles.toolboxRowIcon}
                    />
                    <span className={styles.toolboxRowText}>
                      <span className={styles.toolboxRowTitle}>{title}</span>
                      <span className={styles.toolboxRowDescription}>{description}</span>
                    </span>
                    <Icon name="chevron-right" size={13} className={styles.toolboxRowArrow} />
                  </button>
                );
              })
            : null}
          {showProjectIncompleteRows
            ? PROJECT_INCOMPLETE_NEXT_STEP_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={styles.toolboxRow}
                  data-testid={`next-step-project-action-${action.id}`}
                  onClick={() => handlePromptAction(action)}
                >
                  <Icon name={action.icon} size={14} className={styles.toolboxRowIcon} />
                  <span className={styles.toolboxRowTitle}>{promptActionTitle(action, t)}</span>
                  <Icon name="chevron-right" size={13} className={styles.toolboxRowArrow} />
                </button>
              ))
            : null}
          {showDesignSystemRows
            ? DESIGN_SYSTEM_NEXT_STEP_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={styles.toolboxRow}
                  data-testid={`next-step-design-system-action-${action.id}`}
                  onClick={() => handlePromptAction(action)}
                >
                  <Icon name={action.icon} size={14} className={styles.toolboxRowIcon} />
                  <span className={styles.toolboxRowTitle}>{promptActionTitle(action, t)}</span>
                  <Icon name="chevron-right" size={13} className={styles.toolboxRowArrow} />
                </button>
              ))
            : null}
          {showToolbox && !showDesignSystemRows
            && !showProjectIncompleteRows
            && !showBrandRows
            && !showPlanRows
            ? FEATURED_DESIGN_TOOLBOX_ACTION_IDS.map((id) => {
                const action = getDesignToolboxAction(id);
                if (!action) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    className={styles.toolboxRow}
                    data-testid={`next-step-toolbox-action-${id}`}
                    onClick={() => handleToolboxAction(id)}
                    onMouseEnter={(e) => openDetail(id, e.currentTarget.getBoundingClientRect())}
                    onMouseLeave={scheduleClose}
                  >
                    <Icon name={action.icon} size={14} className={styles.toolboxRowIcon} />
                    <span className={styles.toolboxRowTitle}>
                      {designToolboxActionTitle(action, t)}
                    </span>
                    <Icon name="chevron-right" size={13} className={styles.toolboxRowArrow} />
                  </button>
                );
              })
            : null}
          {hasMore ? (
            <button
              type="button"
              className={styles.moreRow}
              data-testid="next-step-toolbox-more"
              aria-expanded={!!more}
              onMouseEnter={(e) => openMore(e.currentTarget.getBoundingClientRect())}
              onMouseLeave={scheduleClose}
              onClick={(e) => openMore(e.currentTarget.getBoundingClientRect())}
            >
              <Icon name="more-horizontal" size={14} className={styles.toolboxRowIcon} />
              <span className={styles.toolboxRowTitle}>{t('nextStep.more')}</span>
              <Icon name="chevron-right" size={13} className={styles.toolboxRowArrow} />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Level: featured-row detail card */}
      {detail && typeof document !== 'undefined'
        ? createPortal(
            (() => {
              if (detail.kind === 'brand') {
                const action = brandActions.find((item) => item.id === detail.id);
                if (!action) return null;
                return (
                  <div
                    className={styles.detail}
                    role="tooltip"
                    style={{ left: detail.left, top: detail.top }}
                    {...keepOpen}
                  >
                    <div className={styles.detailTitle}>{brandActionTitle(action, t, false)}</div>
                    <div className={styles.detailDesc}>{brandActionDescription(action, t)}</div>
                  </div>
                );
              }
              const action = getDesignToolboxAction(detail.id);
              if (!action) return null;
              const skillName = toolboxSkillNames?.[detail.id] ?? null;
              return (
                <div
                  className={styles.detail}
                  role="tooltip"
                  style={{ left: detail.left, top: detail.top }}
                  {...keepOpen}
                >
                  <div className={styles.detailTitle}>{designToolboxActionTitle(action, t)}</div>
                  <div className={styles.detailDesc}>
                    {designToolboxActionDescription(action, t)}
                  </div>
                  {skillName ? <div className={styles.detailSkill}>@{skillName}</div> : null}
                  <div className={styles.detailBadge}>{designToolboxActionBadge(action, t)}</div>
                </div>
              );
            })(),
            document.body,
          )
        : null}

      {/* Level 2: More → [Create design system, Design toolbox, Share] */}
      {more && typeof document !== 'undefined'
        ? createPortal(
            <div
              className={`${styles.flyout} ${styles.flyoutMenu}`}
              role="menu"
              data-testid="next-step-more-menu"
              style={{ left: more.left, top: more.top }}
              {...keepOpen}
            >
              {showCreateDesignSystem ? (
                <button
                  type="button"
                  className={styles.flyoutRow}
                  data-testid="next-step-more-create-design-system"
                  disabled={createDesignSystemBusy}
                  title={t('nextStep.createDesignSystemBody')}
                  onClick={handleCreateDesignSystem}
                >
                  <Icon
                    name={createDesignSystemBusy ? 'spinner' : 'blocks'}
                    size={14}
                    className={createDesignSystemBusy ? 'icon-spin' : styles.toolboxRowIcon}
                  />
                  <span className={styles.toolboxRowTitle}>
                    {createDesignSystemBusy
                      ? t('nextStep.createDesignSystemBusy')
                      : t('nextStep.createDesignSystemTitle')}
                  </span>
                </button>
              ) : null}
              {showToolbox ? (
                <button
                  type="button"
                  className={styles.flyoutRow}
                  data-testid="next-step-more-toolbox"
                  aria-expanded={sub?.kind === 'toolbox'}
                  onMouseEnter={(e) => openSub('toolbox', e.currentTarget.getBoundingClientRect())}
                  onClick={(e) => openSub('toolbox', e.currentTarget.getBoundingClientRect())}
                >
                  <Icon name="lightbulb" size={14} className={styles.toolboxRowIcon} />
                  <span className={styles.toolboxRowTitle}>{t('chat.designToolbox.title')}</span>
                  <Icon name="chevron-right" size={13} className={styles.toolboxRowArrow} />
                </button>
              ) : null}
              {hasShareGroup ? (
                <button
                  type="button"
                  className={styles.flyoutRow}
                  data-testid="next-step-more-share"
                  aria-expanded={sub?.kind === 'share'}
                  onMouseEnter={(e) => openSub('share', e.currentTarget.getBoundingClientRect())}
                  onClick={(e) => openSub('share', e.currentTarget.getBoundingClientRect())}
                >
                  <Icon name="share" size={14} className={styles.toolboxRowIcon} />
                  <span className={styles.toolboxRowTitle}>{t('nextStep.share')}</span>
                  <Icon name="chevron-right" size={13} className={styles.toolboxRowArrow} />
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      {/* Level 3a: search + non-featured toolbox actions + global resources */}
      {sub?.kind === 'toolbox' && typeof document !== 'undefined'
        ? createPortal(
            <div
              className={`${styles.flyout} ${styles.flyoutToolbox}`}
              role="menu"
              data-testid="next-step-toolbox-actions"
              style={{ left: sub.left, top: sub.top }}
              {...keepOpen}
            >
              <div className={styles.toolboxFlyoutTitle}>
                <Icon name="lightbulb" size={14} />
                <span>{t('chat.designToolbox.title')}</span>
              </div>
              <div className={styles.flyoutSearch}>
                <Icon name="search" size={13} />
                <input
                  value={toolboxQuery}
                  onChange={(e) => setToolboxQuery(e.currentTarget.value)}
                  placeholder={t('chat.designToolbox.searchPlaceholder')}
                  aria-label={t('chat.designToolbox.searchAria')}
                />
              </div>
              <div className={styles.flyoutScroll}>
                {visibleToolboxActions.length > 0 ? (
                  <div className={styles.flyoutSectionLabel}>
                    {t('chat.designToolbox.followupSection')}
                  </div>
                ) : null}
                {visibleToolboxActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className={styles.flyoutRow}
                    data-testid={`next-step-toolbox-sub-action-${action.id}`}
                    onClick={() => handleToolboxAction(action.id)}
                  >
                    <Icon name={action.icon} size={14} className={styles.toolboxRowIcon} />
                    <span className={styles.toolboxRowTitle}>
                      {designToolboxActionTitle(action, t)}
                    </span>
                  </button>
                ))}
                {visibleToolboxResources.length > 0 ? (
                  <div className={styles.flyoutSectionLabel}>
                    {t('chat.designToolbox.resourcesSection')}
                  </div>
                ) : null}
                {visibleToolboxResources.map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    className={styles.flyoutRow}
                    data-testid={`next-step-toolbox-resource-${skill.id}`}
                    onClick={() => handlePickSkill(skill.id)}
                  >
                    <Icon name={designToolboxSkillIcon(skill)} size={14} className={styles.toolboxRowIcon} />
                    <span className={styles.toolboxRowTitle}>{localizeSkillName(locale, skill)}</span>
                  </button>
                ))}
                {visibleToolboxActions.length === 0 && visibleToolboxResources.length === 0 ? (
                  <div className={styles.flyoutEmpty}>
                    {t('chat.designToolbox.noResources', { query: toolboxQuery })}
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Level 3b: Share / Download / Contribute */}
      {sub?.kind === 'share' && typeof document !== 'undefined'
        ? createPortal(
            <div
              className={`${styles.flyout} ${styles.flyoutMenu}`}
              role="menu"
              data-testid="next-step-share-menu"
              style={{ left: sub.left, top: sub.top }}
              {...keepOpen}
            >
              {canShare ? (
                <button
                  type="button"
                  className={styles.flyoutRow}
                  data-testid="next-step-share-share"
                  onClick={handleShare}
                >
                  <Icon name="share" size={14} className={styles.toolboxRowIcon} />
                  <span className={styles.toolboxRowTitle}>{t('nextStep.share')}</span>
                </button>
              ) : null}
              {canDownload ? (
                <button
                  type="button"
                  className={styles.flyoutRow}
                  data-testid="next-step-share-download"
                  onClick={handleDownload}
                >
                  <Icon name="download" size={14} className={styles.toolboxRowIcon} />
                  <span className={styles.toolboxRowTitle}>{t('nextStep.download')}</span>
                </button>
              ) : null}
              {canContribute ? (
                <button
                  type="button"
                  className={styles.flyoutRow}
                  data-testid="next-step-share-contribute"
                  disabled={shareToOpenDesignBusy}
                  onClick={handleContribute}
                >
                  <Icon
                    name={shareToOpenDesignBusy ? 'spinner' : 'globe'}
                    size={14}
                    className={shareToOpenDesignBusy ? 'icon-spin' : styles.toolboxRowIcon}
                  />
                  <span className={styles.toolboxRowTitle}>{t('nextStep.contribute')}</span>
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function defaultToolboxSkillResources(
  actions: DesignToolboxAction[],
  skills: SkillSummary[],
): SkillSummary[] {
  const out: SkillSummary[] = [];
  const seen = new Set<string>();
  const add = (skill: SkillSummary | null | undefined) => {
    if (!skill || seen.has(skill.id)) return;
    seen.add(skill.id);
    out.push(skill);
  };

  add(skills.find((skill) => skill.id === 'creative-director'));
  for (const action of actions) {
    add(
      skills.find((skill) =>
        action.preferredSkillIds.some((id) => skill.id === id || skill.name === id),
      ),
    );
  }
  for (const term of ['design', 'image', 'video', 'motion', 'figma']) {
    for (const skill of skills) {
      if (out.length >= 8) return out;
      if (skillMatchesQuery(skill, term)) add(skill);
    }
  }
  return out;
}

function designToolboxSkillIcon(skill: SkillSummary): IconName {
  if (skill.mode === 'video' || skill.category === 'video-generation') return 'play';
  if (skill.mode === 'image' || skill.category === 'image-generation') return 'image';
  if (skill.category === 'animation-motion') return 'sliders';
  if (skill.category === 'creative-direction') return 'sparkles';
  return 'file';
}
