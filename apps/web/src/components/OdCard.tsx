// Inline renderer for the four <od-card> kinds (display-only siblings of
// <question-form>). The agent emits these around the harness work so the user
// can SEE how memory shaped the turn:
//
//   - task-brief      — PRE intent gateway: a collapsed "Memory applied" chip
//                        that expands to the rewritten brief.
//   - memory-applied  — a compact one-line chip listing the entries used.
//   - verify-scorecard— POST self-verify: a status pill over rubric rows.
//   - rule-proposal   — a proposed verified rule the user can Keep / Edit /
//                        Discard; Keep writes a `type:'rule'` memory entry.
//
// The parser + payload types live in '@open-design/contracts' (od-card.ts) so
// web and daemon share one source of truth. This file only renders.
import { useState } from 'react';
import type {
  OdCard,
  OdCardTaskBrief,
  OdCardMemoryApplied,
  OdCardMemoryRef,
  OdCardVerifyScorecard,
  OdCardRowStatus,
  OdCardRuleProposal,
} from '@open-design/contracts';
import { Button } from '@open-design/components';
import { Icon, type IconName } from './Icon';
import { useT } from '../i18n';
import styles from './OdCard.module.css';

export function OdCardView({ card }: { card: OdCard }) {
  switch (card.kind) {
    case 'task-brief':
      return <TaskBriefCard card={card} />;
    case 'memory-applied':
      return <MemoryAppliedCard card={card} />;
    case 'verify-scorecard':
      return <VerifyScorecardCard card={card} />;
    case 'rule-proposal':
      return <RuleProposalCard card={card} />;
    default:
      return null;
  }
}

// PRE — a collapsed chip ("✦ Memory applied · view brief") that expands on
// click to show the rewritten title + fields + note. Default collapsed so the
// transcript stays compact; the brief is one click away when the user is
// curious how memory reshaped their short ask.
function TaskBriefCard({ card }: { card: OdCardTaskBrief }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.card} data-od-card="task-brief">
      <button
        type="button"
        className={styles.briefChip}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.briefChipIcon} aria-hidden>
          <Icon name="sparkles" size={13} />
        </span>
        <span className={styles.briefChipLabel}>
          {t('artifact.odCardTaskBriefChip')}
        </span>
        <span className={styles.briefChipSummary}>{card.summary}</span>
        <span className={styles.briefChipChevron} aria-hidden>
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} />
        </span>
      </button>
      <div className={`accordion-collapsible${open ? ' open' : ''}`}>
        <div className="accordion-collapsible-inner">
          <div className={styles.briefBody}>
            {card.title ? <h5 className={styles.briefTitle}>{card.title}</h5> : null}
            {card.fields.length > 0 ? (
              <dl className={styles.briefFields}>
                {card.fields.map((field, i) => (
                  <div key={`${field.label}-${i}`} className={styles.briefField}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {card.note ? <p className={styles.briefNote}>{card.note}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

const MEMORY_REF_DOT: Record<OdCardMemoryRef['type'], string> = {
  profile: styles.dotProfile ?? '',
  user: styles.dotUser ?? '',
  feedback: styles.dotFeedback ?? '',
  project: styles.dotProject ?? '',
  reference: styles.dotReference ?? '',
  rule: styles.dotRule ?? '',
};

// A compact one-line chip with the summary + small type-dotted refs of the
// memory entries that shaped the turn.
function MemoryAppliedCard({ card }: { card: OdCardMemoryApplied }) {
  return (
    <div className={`${styles.card} ${styles.appliedCard}`} data-od-card="memory-applied">
      <span className={styles.appliedIcon} aria-hidden>
        <Icon name="sparkles" size={13} />
      </span>
      <span className={styles.appliedSummary}>{card.summary}</span>
      {card.used.length > 0 ? (
        <span className={styles.appliedRefs}>
          {card.used.map((ref, i) => (
            <span key={ref.id ?? `${ref.name}-${i}`} className={styles.appliedRef}>
              <span
                className={`${styles.refDot} ${MEMORY_REF_DOT[ref.type]}`}
                aria-hidden
              />
              <span className={styles.refName}>{ref.name}</span>
            </span>
          ))}
        </span>
      ) : null}
    </div>
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
  const statusLabel =
    card.status === 'pass'
      ? t('artifact.odCardScorecardStatusPass')
      : card.status === 'partial'
        ? t('artifact.odCardScorecardStatusPartial')
        : t('artifact.odCardScorecardStatusFail');
  return (
    <div className={`${styles.card} ${styles.scorecard}`} data-od-card="verify-scorecard">
      <div className={styles.scorecardHead}>
        <span className={`${styles.scorecardPill} ${SCORECARD_PILL_CLASS[card.status]}`}>
          {statusLabel}
        </span>
        <span className={styles.scorecardTitle}>
          {t('artifact.odCardScorecardTitle')}
        </span>
        {card.summary ? (
          <span className={styles.scorecardSummary}>{card.summary}</span>
        ) : null}
      </div>
      <ul className={styles.scoreRows}>
        {card.rows.map((row, i) => (
          <li
            key={`${row.rule}-${i}`}
            className={`${styles.scoreRow} ${SCORE_ROW_CLASS[row.status]}`}
          >
            <span className={styles.scoreRowIcon} aria-hidden>
              <Icon name={ROW_STATUS_ICON[row.status]} size={13} />
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
  );
}

// A proposed verified rule the user can Keep / Edit / Discard. "Keep" POSTs a
// `type:'rule'` memory entry to /api/memory (same shape as MemorySection's
// saveMemoryEntry); future verify passes then enforce it. "Edit" opens the
// same fields inline editable before saving; "Discard" dismisses locally.
function RuleProposalCard({ card }: { card: OdCardRuleProposal }) {
  const t = useT();
  const [name, setName] = useState(card.name);
  const [description, setDescription] = useState(card.description ?? '');
  const [assertion, setAssertion] = useState(card.assertion);
  const [check, setCheck] = useState(card.check);
  const [rationale, setRationale] = useState(card.rationale ?? '');
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'discarded'>(
    'idle',
  );

  if (status === 'discarded') return null;

  if (status === 'saved') {
    return (
      <div className={`${styles.card} ${styles.ruleSaved}`} data-od-card="rule-proposal">
        <span className={styles.ruleSavedIcon} aria-hidden>
          <Icon name="check" size={14} />
        </span>
        <span className={styles.ruleSavedLabel}>
          {t('artifact.odCardRuleSaved', { name })}
        </span>
      </div>
    );
  }

  const keep = async () => {
    if (!name.trim() || !assertion.trim()) {
      setStatus('error');
      return;
    }
    setStatus('saving');
    // Assemble the rule body the daemon renders. The assertion + check are the
    // rubric a verify pass evaluates; the rationale (why this was inferred) is
    // recorded as a "Verified by" provenance line.
    const bodyLines = [
      `Assertion: ${assertion.trim()}`,
      `Check: ${check.trim() || assertion.trim()}`,
    ];
    if (rationale.trim()) bodyLines.push(`Verified by: ${rationale.trim()}`);
    try {
      const resp = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'rule',
          name: name.trim(),
          description: description.trim(),
          body: bodyLines.join('\n'),
        }),
      });
      if (!resp.ok) {
        setStatus('error');
        return;
      }
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className={`${styles.card} ${styles.ruleCard}`} data-od-card="rule-proposal">
      <div className={styles.ruleHead}>
        <span className={styles.ruleHeadIcon} aria-hidden>
          <Icon name="star" size={13} />
        </span>
        <span className={styles.ruleKicker}>
          {t('artifact.odCardRuleKicker')}
        </span>
      </div>
      {editing ? (
        <div className={styles.ruleFields}>
          <label className={styles.ruleFieldLabel}>
            {t('artifact.odCardRuleNameLabel')}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className={styles.ruleFieldLabel}>
            {t('artifact.odCardRuleDescriptionLabel')}
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className={styles.ruleFieldLabel}>
            {t('artifact.odCardRuleAssertionLabel')}
            <textarea
              rows={2}
              value={assertion}
              onChange={(e) => setAssertion(e.target.value)}
            />
          </label>
          <label className={styles.ruleFieldLabel}>
            {t('artifact.odCardRuleCheckLabel')}
            <textarea
              rows={2}
              value={check}
              onChange={(e) => setCheck(e.target.value)}
            />
          </label>
          <label className={styles.ruleFieldLabel}>
            {t('artifact.odCardRuleRationaleLabel')}
            <input
              type="text"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
            />
          </label>
        </div>
      ) : (
        <div className={styles.ruleSummary}>
          <h5 className={styles.ruleName}>{name}</h5>
          {description ? <p className={styles.ruleDescription}>{description}</p> : null}
          <dl className={styles.ruleFacts}>
            <div>
              <dt>{t('artifact.odCardRuleAssertionLabel')}</dt>
              <dd>{assertion}</dd>
            </div>
            <div>
              <dt>{t('artifact.odCardRuleCheckLabel')}</dt>
              <dd>{check}</dd>
            </div>
            {rationale ? (
              <div>
                <dt>{t('artifact.odCardRuleRationaleLabel')}</dt>
                <dd>{rationale}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      )}
      {status === 'error' ? (
        <p className={styles.ruleError} role="status">
          {t('artifact.odCardRuleError')}
        </p>
      ) : null}
      <div className={styles.ruleActions}>
        <Button
          variant="primary"
          className={styles.ruleAction}
          disabled={status === 'saving'}
          onClick={() => void keep()}
        >
          {status === 'saving'
            ? t('artifact.odCardRuleSaving')
            : t('artifact.odCardRuleKeep')}
        </Button>
        <Button
          variant="ghost"
          className={styles.ruleAction}
          disabled={status === 'saving'}
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? t('artifact.odCardRuleDone') : t('artifact.odCardRuleEdit')}
        </Button>
        <Button
          variant="ghost"
          className={styles.ruleAction}
          disabled={status === 'saving'}
          onClick={() => setStatus('discarded')}
        >
          {t('artifact.odCardRuleDiscard')}
        </Button>
      </div>
    </div>
  );
}
