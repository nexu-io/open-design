import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  // Open the file's existing Share/Export menu in the preview workspace.
  onShare?: (fileName: string) => void;
  // Download the previewable artifact.
  onDownload?: (fileName: string) => void;
  // Seed the composer with a featured design-toolbox action (matched skill +
  // prompt). Does NOT auto-send — the composer draft waits for the user.
  onToolboxAction?: (id: DesignToolboxActionId) => void;
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
}

const FLYOUT_GAP = 8;
const VIEWPORT_MARGIN = 8;
const DETAIL_WIDTH = 240;
const MENU_WIDTH = 200;
// Conservative heights used to keep a flyout on-screen vertically (over-estimating
// only shifts it further up, which is always safe).
const DETAIL_HEIGHT = 180;
const MENU_HEIGHT = 150;
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

export function NextStepActions({
  fileName,
  onShare,
  onDownload,
  onToolboxAction,
  onPickSkill,
  skills = [],
  toolboxSkillNames,
  onShareToOpenDesign,
  shareToOpenDesignBusy = false,
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
  const [detail, setDetail] = useState<{ id: DesignToolboxActionId } & Anchor | null>(null);
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
      setDetail({ id, ...place(rect, DETAIL_WIDTH, DETAIL_HEIGHT) });
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

  // Share group is available whenever any of its three actions can fire.
  const canShare = !!(fileName && onShare);
  const canDownload = !!(fileName && onDownload);
  const canContribute = !!onShareToOpenDesign;
  const hasShareGroup = canShare || canDownload || canContribute;
  const hasMore = !!onToolboxAction || hasShareGroup;
  const showToolbox = !!onToolboxAction;

  // Hover handlers shared by every flyout surface: stay open while hovered.
  const keepOpen = { onMouseEnter: cancelClose, onMouseLeave: scheduleClose };

  return (
    <div className={styles.root} data-testid="next-step-actions">
      <div className={styles.label}>{t('nextStep.title')}</div>
      {showToolbox || hasMore ? (
        <div className={styles.toolboxList} data-testid="next-step-toolbox">
          {showToolbox
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

      {/* Level 2: More → [Design toolbox, Share] */}
      {more && typeof document !== 'undefined'
        ? createPortal(
            <div
              className={`${styles.flyout} ${styles.flyoutMenu}`}
              role="menu"
              data-testid="next-step-more-menu"
              style={{ left: more.left, top: more.top }}
              {...keepOpen}
            >
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
