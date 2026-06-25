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
import { useMemo, useState } from 'react';
import type {
  OdCard,
  OdCardTaskBrief,
  OdCardMemoryApplied,
  OdCardMemoryRef,
  OdCardVerifyScorecard,
  OdCardRowStatus,
  OdCardRuleProposal,
  OdCardBrandBrowserAssist,
} from '@open-design/contracts';
import { Button } from '@open-design/components';
import { Icon, type IconName } from './Icon';
import { useT } from '../i18n';
import styles from './OdCard.module.css';

const RULE_PROPOSAL_DECISION_PREFIX = 'od:rule-proposal-decision:';

type RuleProposalDecision =
  | { status: 'idle' }
  | { status: 'saved'; name: string }
  | { status: 'discarded' };

function hashRuleProposalKey(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function ruleProposalStorageKey(card: OdCardRuleProposal, instanceScope?: string): string {
  return `${RULE_PROPOSAL_DECISION_PREFIX}${hashRuleProposalKey(
    JSON.stringify([
      instanceScope ?? '',
      card.name,
      card.description ?? '',
      card.assertion,
      card.check,
      card.rationale ?? '',
    ]),
  )}`;
}

function readRuleProposalDecision(key: string): RuleProposalDecision {
  if (typeof window === 'undefined') return { status: 'idle' };
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { status: 'idle' };
    const parsed = JSON.parse(raw) as Partial<RuleProposalDecision> | null;
    if (parsed?.status === 'discarded') return { status: 'discarded' };
    if (parsed?.status === 'saved') {
      return {
        status: 'saved',
        name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : '',
      };
    }
  } catch {
    // Storage can be unavailable in hardened contexts; fall back to per-mount state.
  }
  return { status: 'idle' };
}

function writeRuleProposalDecision(key: string, decision: Exclude<RuleProposalDecision, { status: 'idle' }>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(decision));
  } catch {
    // Best effort only: keeping the in-memory state still lets the current mount update.
  }
}

/** Outcome a brand-browser-assist confirm handler reports back to the card so it
 *  can show a done / error state. */
export interface BrandBrowserAssistResult {
  ok: boolean;
  /** Failure reason to show inline (e.g. "needs the desktop app"). */
  message?: string;
}

export type BrandBrowserAssistConfirm = (
  card: OdCardBrandBrowserAssist,
) => Promise<BrandBrowserAssistResult | void> | BrandBrowserAssistResult | void;

export function OdCardView({
  card,
  instanceScope,
  onBrandBrowserAssistConfirm,
}: {
  card: OdCard;
  instanceScope?: string;
  onBrandBrowserAssistConfirm?: BrandBrowserAssistConfirm;
}) {
  switch (card.kind) {
    case 'task-brief':
      return <TaskBriefCard card={card} />;
    case 'memory-applied':
      return <MemoryAppliedCard card={card} />;
    case 'verify-scorecard':
      return <VerifyScorecardCard card={card} />;
    case 'rule-proposal':
      return <RuleProposalCard card={card} instanceScope={instanceScope} />;
    case 'brand-browser-assist':
      return <BrandBrowserAssistCard card={card} onConfirm={onBrandBrowserAssistConfirm} />;
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
function RuleProposalCard({
  card,
  instanceScope,
}: {
  card: OdCardRuleProposal;
  instanceScope?: string;
}) {
  const t = useT();
  const storageKey = useMemo(
    () => ruleProposalStorageKey(card, instanceScope),
    [card, instanceScope],
  );
  const [decision, setDecision] = useState<RuleProposalDecision>(() =>
    readRuleProposalDecision(storageKey),
  );
  const [name, setName] = useState(card.name);
  const [description, setDescription] = useState(card.description ?? '');
  const [assertion, setAssertion] = useState(card.assertion);
  const [check, setCheck] = useState(card.check);
  const [rationale, setRationale] = useState(card.rationale ?? '');
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  if (decision.status === 'discarded') return null;

  if (decision.status === 'saved') {
    const savedName = decision.name || name;
    return (
      <div className={`${styles.card} ${styles.ruleSaved}`} data-od-card="rule-proposal">
        <span className={styles.ruleSavedIcon} aria-hidden>
          <Icon name="check" size={14} />
        </span>
        <span className={styles.ruleSavedLabel}>
          {t('artifact.odCardRuleSaved', { name: savedName })}
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
      const savedDecision = { status: 'saved', name: name.trim() } as const;
      writeRuleProposalDecision(storageKey, savedDecision);
      setDecision(savedDecision);
      setStatus('idle');
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
          onClick={() => {
            const discardedDecision = { status: 'discarded' } as const;
            writeRuleProposalDecision(storageKey, discardedDecision);
            setDecision(discardedDecision);
          }}
        >
          {t('artifact.odCardRuleDiscard')}
        </Button>
      </div>
    </div>
  );
}

const BRAND_ASSIST_DECISION_PREFIX = 'od:brand-browser-assist-decision:';

function brandAssistStorageKey(brandId: string): string {
  return `${BRAND_ASSIST_DECISION_PREFIX}${brandId}`;
}

function readBrandAssistDone(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key) === 'done';
  } catch {
    return false;
  }
}

function writeBrandAssistDone(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, 'done');
  } catch {
    // Best effort — the in-memory `done` state still hides the button this mount.
  }
}

// Brand extraction hit an anti-bot wall. This card asks the user to clear it in
// the in-app browser tab, then its Confirm button runs a CLIENT-side handler
// (read the unblocked DOM → re-extract) — it does NOT round-trip to the agent.
// A localStorage latch keyed off the brand id keeps a resolved card from
// re-prompting on reload.
function BrandBrowserAssistCard({
  card,
  onConfirm,
}: {
  card: OdCardBrandBrowserAssist;
  onConfirm?: BrandBrowserAssistConfirm;
}) {
  const t = useT();
  const storageKey = useMemo(() => brandAssistStorageKey(card.brandId), [card.brandId]);
  const [done, setDone] = useState(() => readBrandAssistDone(storageKey));
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (done) {
    return (
      <div className={`${styles.card} ${styles.ruleSaved}`} data-od-card="brand-browser-assist">
        <span className={styles.ruleSavedIcon} aria-hidden>
          <Icon name="check" size={14} />
        </span>
        <span className={styles.ruleSavedLabel}>{t('artifact.odCardBrandAssistDone')}</span>
      </div>
    );
  }

  const confirm = async () => {
    if (!onConfirm) return;
    setStatus('working');
    setErrorMsg(null);
    try {
      // The handler reports `{ ok: true }` only once the brand actually
      // finalized; anything else (a desktop-only refusal, a thin harvest, a
      // missing handler) keeps the button so the user can retry.
      const result = await onConfirm(card);
      if (!result || result.ok !== true) {
        setStatus('error');
        setErrorMsg((result && result.message) || null);
        return;
      }
      writeBrandAssistDone(storageKey);
      setDone(true);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : null);
    }
  };

  return (
    <div className={`${styles.card} ${styles.ruleCard}`} data-od-card="brand-browser-assist">
      <div className={styles.ruleHead}>
        <span className={styles.ruleHeadIcon} aria-hidden>
          <Icon name="globe" size={13} />
        </span>
        <span className={styles.ruleKicker}>
          {t('artifact.odCardBrandAssistKicker', { reason: card.reason || 'Cloudflare' })}
        </span>
      </div>
      <div className={styles.ruleSummary}>
        <p className={styles.ruleDescription}>{t('artifact.odCardBrandAssistBody')}</p>
        {card.url ? <p className={styles.ruleName}>{card.url}</p> : null}
      </div>
      {status === 'error' ? (
        <p className={styles.ruleError} role="status">
          {errorMsg || t('artifact.odCardBrandAssistError')}
        </p>
      ) : null}
      <div className={styles.ruleActions}>
        <Button
          variant="primary"
          className={styles.ruleAction}
          disabled={status === 'working' || !onConfirm}
          onClick={() => void confirm()}
        >
          {status === 'working'
            ? t('artifact.odCardBrandAssistWorking')
            : t('artifact.odCardBrandAssistConfirm')}
        </Button>
      </div>
    </div>
  );
}
