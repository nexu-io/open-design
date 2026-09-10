// ChatPanel renders memory and verification cards.
// Retired task-brief, rule-proposal, and brand-browser-assist payloads remain
// decodable for history without a ChatPanel presentation.
import { Fragment, useState } from 'react';
import type {
  OdCard,
  OdCardMemoryApplied,
  OdCardVerifyScorecard,
  OdCardRowStatus,
  OdCardBrandBrowserAssist,
} from '@open-design/contracts';
import { Icon, type IconName } from './Icon';
import { useT } from '../i18n';
import styles from './OdCard.module.css';

/** Compatibility result for existing browser-assist callers outside this renderer. */
export interface BrandBrowserAssistResult {
  ok: boolean;
  /** `opened` means the Browser tab was focused/navigated; extraction still
   * continues from the next-step action after the user clears verification. */
  action?: 'opened' | 'confirmed';
  /** Failure reason to show inline (e.g. "needs the desktop app"). */
  message?: string;
}

export type BrandBrowserAssistConfirm = (
  card: OdCardBrandBrowserAssist,
) => Promise<BrandBrowserAssistResult | void> | BrandBrowserAssistResult | void;

export function OdCardView({
  card,
}: {
  card: OdCard;
  /** Compatibility with existing message/shell callers; retired cards used this scope. */
  instanceScope?: string;
  onBrandBrowserAssistConfirm?: BrandBrowserAssistConfirm;
}) {
  switch (card.kind) {
    case 'task-brief':
    case 'rule-proposal':
    case 'brand-browser-assist':
      return null;
    case 'memory-applied':
      return <MemoryAppliedCard card={card} />;
    case 'verify-scorecard':
      return <VerifyScorecardCard card={card} />;
    default:
      return null;
  }
}

/**
 * 记忆书签(交付稿 `.memo-ic`,路径逐字抄自 `chat-panel-next.html`)。
 *
 * 稿子把它单独染成产品指定的那支绿(`#00ff04`,和绿勾底片同一支),理由写在稿子注释里:
 * 这一行是整条流水里唯一「东西被存下来了」的信号,原来跟旁边一堆折叠行长得一模一样,
 * 扫过去根本注意不到。**只染图标不染文字** —— 文字要跟其它折叠行保持一致。
 */
function MemoBookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width={15} height={15} aria-hidden>
      <path d="M6.5 3h11a1.5 1.5 0 011.5 1.5v16.2a.8.8 0 01-1.26.65L12 17.4l-5.74 3.95A.8.8 0 015 20.7V4.5A1.5 1.5 0 016.5 3z" />
    </svg>
  );
}

/**
 * 记忆卡(设计稿组件 8)。**可折叠**:收起只留一句「已记住 N 条偏好」,
 * 展开才列出具体记了什么(D47,用户 2026-08-25 拍板)。
 *
 * 之前是一行 chip、把条目直接铺在行内 —— 条目一多就把这一行撑得很长,
 * 而它在一轮对话里只是个旁注,不该占正文的宽度。
 * 展开的内容就是原来铺在行内的那几条,没有新数据。
 *
 * 没有条目时不出箭头也点不开:一个点开是空的抽屉是在骗人。
 */
function MemoryAppliedCard({ card }: { card: OdCardMemoryApplied }) {
  const hasEntries = card.used.length > 0;
  return (
    <details
      className={`${styles.card} ${styles.appliedCard}`}
      data-od-card="memory-applied"
    >
      <summary>
        <span className={styles.appliedIcon} aria-hidden>
          <MemoBookmarkIcon />
        </span>
        <span className={styles.appliedSummary}>{card.summary}</span>
        {hasEntries ? (
          <span className={styles.appliedChev} aria-hidden>
            <Icon name="chevron-down" size={11} />
          </span>
        ) : null}
      </summary>
      {hasEntries ? (
        <div className={styles.appliedBody}>
          {/*
            结构照稿子来:**一个 `.body` 里用 `<br>` 分行**,每条前缀是纯「·」。
            
            两处都按稿子改过:
             · 色点(项目 / 反馈 / 用户)是产品原有实现,稿子里没有 —— 我一度以「产品已有」
               为由保留,那是拿既有实现覆盖稿子;
             · 原来一条一个块级元素,和稿子的 `文本<br>文本` 不是同一棵树。
               逐元素比样式时两边序列长度对不上,而且这本身就不算 1:1。
          */}
          {card.used.map((ref, i) => (
            <Fragment key={ref.id ?? `${ref.name}-${i}`}>
              {i > 0 ? <br /> : null}
              {`· ${ref.name}`}
            </Fragment>
          ))}
        </div>
      ) : null}
    </details>
  );
}

const ROW_STATUS_ICON: Record<OdCardRowStatus, IconName> = {
  pass: 'check',
  fail: 'close',
  fixed: 'refresh',
};

// Map the rolled-up verdict + per-row status to their CSS-module class keys.
// Explicit maps keep the lookups type-safe and avoid snake_case template-key
// fragility against CSS-module name mangling.
const SCORECARD_PILL_CLASS: Record<OdCardVerifyScorecard['status'], string> = {
  pass: styles.pillPass ?? '',
  partial: styles.pillPartial ?? '',
  fail: styles.pillFail ?? '',
};

const SCORE_ROW_CLASS: Record<OdCardRowStatus, string> = {
  pass: styles.rowPass ?? '',
  fail: styles.rowFail ?? '',
  fixed: styles.rowFixed ?? '',
};

// POST — a header (status pill + summary) over rubric rows; each row shows a
// pass/fail/fixed icon, the rule text, and the note. Light and scannable.
function VerifyScorecardCard({ card }: { card: OdCardVerifyScorecard }) {
  const t = useT();
  // Passing validation is supporting evidence, so keep it to one quiet line.
  // Partial/failed validation is actionable and starts open, but only failed
  // rules are promoted; passing rows remain available when an all-pass card is
  // explicitly expanded instead of competing with the answer by default.
  const [open, setOpen] = useState(card.status !== 'pass');
  const statusLabel =
    card.status === 'pass'
      ? t('artifact.odCardScorecardStatusPass')
      : card.status === 'partial'
        ? t('artifact.odCardScorecardStatusPartial')
        : t('artifact.odCardScorecardStatusFail');
  const failedRows = card.rows.filter((row) => row.status === 'fail');
  const visibleRows = card.status === 'pass'
    ? card.rows
    : failedRows.length > 0
      ? failedRows
      : card.rows.filter((row) => row.status !== 'pass');
  return (
    <div className={`${styles.card} ${styles.scorecard}`} data-od-card="verify-scorecard">
      <button
        type="button"
        className={styles.scorecardHead}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`${styles.scorecardPill} ${SCORECARD_PILL_CLASS[card.status]}`}>
          {statusLabel}
        </span>
        <span className={styles.scorecardTitle}>
          {t('artifact.odCardScorecardTitle')}
        </span>
        {card.summary ? (
          <span className={styles.scorecardSummary}>{card.summary}</span>
        ) : null}
        <span className={styles.scorecardCount}>{card.rows.length}</span>
        <span className={`${styles.scorecardChevron}${open ? ` ${styles.scorecardChevronOpen}` : ''}`} aria-hidden>
          <Icon name="chevron-down" size={14} />
        </span>
      </button>
      <div className={`accordion-collapsible${open ? ' open' : ''}`}>
        <div className="accordion-collapsible-inner">
          <ul className={styles.scoreRows}>
            {visibleRows.map((row, i) => (
              <li
                key={`${row.rule}-${i}`}
                className={`${styles.scoreRow} ${SCORE_ROW_CLASS[row.status]}`}
              >
                <span className={styles.scoreRowIcon} aria-hidden>
                  <Icon name={ROW_STATUS_ICON[row.status]} size={14} />
                </span>
                <span className={styles.scoreRowBody}>
                  <span className={styles.scoreRowRule}>{row.rule}</span>
                  {row.note ? (
                    <span className={styles.scoreRowNote}>{row.note}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
