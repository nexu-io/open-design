/**
 * The one place a `ProjectDisplayStatus` becomes a glyph — and the one place
 * the two surfaces that list projects (the rail's 最近项目 rows and the project
 * switcher above the chat) get their shared marks from, so they can never tell
 * different stories about the same project.
 *
 * A run that was interrupted is a static badge; a run still moving — or paused
 * on a question the user has to answer — is the same rotating orb in a
 * different colour, so the row reads as one object changing state rather than
 * a handful of unrelated icons. The split is "is it still going", not "did it
 * go well": spinning a stopped run's orb is the one thing this component must
 * never do, because the rotation itself is what says "working".
 *
 * Speed carries no distinction: everything that is live — queued, running
 * and awaiting a reply alike — turns at the same rate, so a colour change
 * never reads as a change of pace (P0-24: queued draws running's spinner).
 *
 * A FINISHED run is not a glyph in the lead slot at all (OPEND-3133): the row
 * keeps the folder every idle project leads with (`ProjectFolderGlyph`) and
 * says "done, unread" with a small dot at its END (`ProjectCompletionDot`),
 * which opening the project spends. `hasRunStatusGlyph` / `hasCompletionNotice`
 * are the two questions a caller asks to pick between the three.
 *
 * Returns `null` for `not_started` and `succeeded`, which draw nothing here.
 * Callers must still reserve the slot so names stay aligned; that is the
 * caller's layout concern, not this component's.
 */
import type { ProjectDisplayStatus } from '@open-design/contracts';
import tagStyles from './ProjectRunStatusIcon.module.css';
import { Icon } from './Icon';
import { SiriOrb } from './SiriOrb';

/**
 * P0-24 设计答复(2026-10-26,清单 3.1「以设计稿为准」;研发负责人要求四颗球与设计稿
 * 完全一致)。取值逐项照抄设计稿 OD-状态设计-20261015 渲染后的计算值:
 *  · 执行中 / 排队中:标准绿色球,约 6 秒一圈(`r:icon:p0`);
 *  · 需要你回复:纯橙 #FF8D02 底 + 一道明暗扫光,约 20 秒一圈(`r:icon:p1`);
 *  · 有新结果:单色 #578EFF,约 6 秒一圈(`r:icon:p2`);
 *  · 失败:c1 #F34801 / c2 #FF6038 / c5 #FFE6DF,底色 #F34801,不压平颜色,网格层只做
 *    模糊,约 6 秒一圈(`.entry-nav-rail__failed-orb`)。
 * 四颗球都不呼吸、不缩放,只有网格在转(设计稿侧栏 `animation: none` / `transform: none`)。
 * ⚠️ 与 PRD 显示规则①「失败标记静止」不一致,研发负责人 2026-10-26 决定以设计稿为准。
 */
const AWAITING = { c1: '#FF8D02', c2: '#FF8D02', c5: '#FF8D02', fill: '#FF8D02' };
const FAILURE = { c1: '#F34801', c2: '#FF6038', c5: '#FFE6DF', fill: '#F34801' };
const NEW_RESULT = { c1: '#578EFF' };

/**
 * 侧栏和顶部项目切换里状态球的直径:设计稿 10px(P0-24 设计答复 2026-10-26,两处
 * 「和侧栏一样」)。球放在原来的图标位里居中,项目名仍和文件夹那几行对齐。
 */
export const STATUS_BALL_SIZE = 10;

/**
 * Whether this status puts a glyph in the row's LEAD slot.
 *
 * Callers need to know BEFORE rendering: when this says no, the slot holds the
 * folder (`ProjectFolderGlyph`) instead, so the column is never empty and
 * names stay on one edge. `succeeded` answers no on purpose — a finished run
 * keeps the folder and reports through {@link hasCompletionNotice} instead.
 */
export function hasRunStatusGlyph(status: ProjectDisplayStatus | undefined): boolean {
  return status !== undefined && status !== 'not_started';
}

/**
 * Whether this status is a finished run the user has not looked at yet: the
 * one case that draws the unread dot at the row's END (`ProjectCompletionDot`)
 * rather than a glyph in its lead slot.
 *
 * The "not looked at yet" half is the store's, not this function's: the shared
 * run-status feed (`useProjectRunStatuses`) drops a `succeeded` the user has
 * acknowledged by opening the project, so a caller never sees it here. One
 * store, one rule, both surfaces.
 */
export function hasCompletionNotice(_status: ProjectDisplayStatus | undefined): boolean {
  // P0-24 设计答复:有新结果改为行首的蓝色球(见 `ProjectRunStatusIcon`),行尾不再出蓝点。
  return false;
}

/**
 * Whether the row shows the visible 「需要你回复」 tag after the project name
 * (P0-24 display rule ①; assumption A-09 for its look). The orb in the lead
 * slot stays; the tag is what says it in words, not only to assistive tech.
 */
export function hasAwaitingReplyTag(status: ProjectDisplayStatus | undefined): boolean {
  return status === 'awaiting_input';
}

/**
 * The visible 「需要你回复」 tag (P0-24, test case X21 / OPEND-4216). The shape
 * is shared; each surface adds its own spacing class and test id, as with
 * {@link ProjectCompletionDot}.
 */
export function ProjectAwaitingReplyTag({
  className,
  label,
  testId,
}: {
  className?: string;
  /** Localized status name, shown as the tag's text. */
  label: string;
  testId: string;
}) {
  return (
    <span
      className={className ? `${tagStyles.replyTag} ${className}` : tagStyles.replyTag}
      data-testid={testId}
    >
      {label}
    </span>
  );
}

interface Props {
  status: ProjectDisplayStatus;
  size?: number;
  /** Localized status name, announced to assistive tech. */
  label?: string;
}

/**
 * The glyph a project leads with when it has nothing live to report
 * (OPEND-3129): the folder — the same mark the workspace tab strip and the
 * switcher trigger already draw for a project tab.
 *
 * ONE component for both surfaces that list projects — the rail's 最近项目
 * rows and the project switcher above the chat — for the same reason those two
 * share `ProjectRunStatusIcon`: an idle project must look like one and the same
 * thing wherever the user finds it. The first pass at this unified the two on
 * a chat-bubble mark; product and design settled on the folder instead, so
 * both slots now draw this. Pairs with `hasRunStatusGlyph`: callers draw this
 * exactly when that says there is no live status to draw — a finished, unread
 * run included, which keeps the folder and adds `ProjectCompletionDot`.
 *
 * `currentColor` through `Icon`, so each slot keeps its own ink — the rail
 * row's, hover included, and the switcher's muted text. `size` likewise: each
 * slot keeps the box it always had.
 */
export function ProjectFolderGlyph({ size = 14 }: { size?: number }) {
  return <Icon name="folder" size={size} data-testid="project-folder-glyph" />;
}

/**
 * "Finished, and you have not looked yet" (OPEND-3133): a 6px disc in the
 * design's blue at the END of the row — `margin-left: auto` in the caller's
 * stylesheet, so it sits on the row's right edge whatever the name's length.
 * The folder stays in the lead slot; this is a notice beside the name, not a
 * replacement for the glyph, which is why it is not a `ProjectRunStatusIcon`
 * case.
 *
 * Announced as the finished status it stands for (`role="img"` + the
 * localized label), the way the lead-slot glyphs are, so a screen reader
 * hears "Completed" here exactly as it did when this was a ✓. The caller
 * names the class and test id because each surface's stylesheet and specs
 * address it by their own convention; the shape and the semantics are shared.
 */
export function ProjectCompletionDot({
  className,
  label,
  testId,
}: {
  className: string;
  /** Localized status name, announced to assistive tech. */
  label: string;
  testId: string;
}) {
  return (
    <span
      className={className}
      role="img"
      aria-label={label}
      title={label}
      data-testid={testId}
    />
  );
}

export function ProjectRunStatusIcon({ status, size = 14, label }: Props) {
  switch (status) {
    case 'succeeded':
      // A finished run the user has not opened yet: the static blue ball in the
      // lead slot (P0-24 design reply). The store drops it once acknowledged.
      return <SiriOrb size={size} state="thinking" colors={NEW_RESULT} literal steady label={label} />;
    case 'failed':
    case 'canceled':
    case 'incomplete':
      // P0-24 design reply: the red ball, still — not the red exclamation mark.
      return <SiriOrb size={size} state="thinking" colors={FAILURE} filterMode="blur" steady label={label} />;
    case 'running':
      return <SiriOrb size={size} state="thinking" steady label={label} />;
    case 'queued':
      // P0-24 (PRD scenario A2, product answer P4): a queued run draws the same
      // spinner as a running one — the sidebar says "not finished yet", and
      // whether it has started is not a distinction the row makes. The label
      // still names it (排队中) for the tooltip and assistive tech.
      return <SiriOrb size={size} state="thinking" steady label={label} />;
    case 'awaiting_input':
      // The design draft's orange orb: flat #FF8D02 with one wedge turning
      // at idle pace (~20s). This replaces the earlier "running's speed"
      // rule — the lead chose the draft verbatim on 2026-10-26.
      return <SiriOrb size={size} state="idle" colors={AWAITING} variant="wedge" steady label={label} />;
    case 'not_started':
      return null;
    default:
      return null;
  }
}
