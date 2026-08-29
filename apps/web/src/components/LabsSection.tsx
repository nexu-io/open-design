import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  OdNextRolloutControlResponse,
  OdNextRolloutMode,
  TrackingLabsOptOutReason,
} from '@open-design/contracts';

import { trackLabsItemToggled } from '../analytics/events';
import { useAnalytics } from '../analytics/provider';
import { useT } from '../i18n';
import { Icon } from './Icon';
import styles from './LabsSection.module.css';

/**
 * Why this component reads and writes on its own instead of going through
 * `cfg` / `setCfg` like the other Settings sections:
 *
 * `apps/web/src/types.ts`'s `AppConfig` is a web-local projection that does
 * not carry `odNextStrategyMode`, and `syncConfigToDaemon` serialises an
 * explicit allow-list of fields. Threading this switch through that pipeline
 * means three edits, and forgetting the allow-list one fails silently — the
 * toggle would look saved and never reach the daemon. A self-contained read
 * and a single-field PUT avoid the whole class of bug, and keep the Labs
 * surface deletable in one piece when the experiment converges.
 */

type SwitchLock = 'latched' | 'env' | 'unreadable';

interface LabsHarnessState {
  on: boolean;
  lock: SwitchLock | null;
}

const LOADING: LabsHarnessState | null = null;

/** `PUT /api/app-config` merges per key, so a single-field body is safe. */
async function writeHarnessMode(mode: OdNextRolloutMode): Promise<void> {
  const response = await fetch('/api/app-config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ odNextStrategyMode: mode }),
  });
  if (!response.ok) throw new Error(`app-config write failed (${response.status})`);
}

/**
 * Project the daemon's three-valued rollout mode onto the switch.
 *
 * `observe` reads as off because it does not run the new harness — but the
 * switch never rewrites it on its own: it is a developer-set diagnostic mode,
 * and silently clearing it would break someone's debugging session. The user's
 * next deliberate toggle resolves it to `active` / `off` naturally.
 *
 * The lock order matters. A latch is the safety valve — it overrides the saved
 * mode in `readOdNextRolloutControlStatus` — so it wins over the environment
 * note, which in turn wins over a plain saved value.
 */
export function harnessStateFromStatus(
  status: OdNextRolloutControlResponse['status'],
): LabsHarnessState {
  const on = status.requestedMode === 'active';
  if (status.latch) return { on, lock: 'latched' };
  if (status.requestedModeSource === 'env') return { on, lock: 'env' };
  return { on, lock: null };
}

function LabsTooltip({ label, body, scope }: { label: string; body: string; scope: string }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  return (
    <span className={styles.tooltipHost}>
      <button
        type="button"
        className={styles.tooltipTrigger}
        aria-label={label}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        // The trigger explains, it does not act. Swallow the click so it
        // cannot reach the row and flip the switch by accident.
        onClick={(event) => event.preventDefault()}
      >
        <Icon name="help-circle" size={14} aria-hidden />
      </button>
      {open ? (
        <span className={styles.tooltip} role="tooltip" id={tooltipId}>
          <span className={styles.tooltipBody}>{body}</span>
          <span className={styles.tooltipScope}>{scope}</span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * How long the reason panel waits before recording a non-answer.
 *
 * Long enough that it is not a trick question, short enough that the row does
 * not stay in a feedback state for the rest of the session. Not shown as a
 * countdown: a visible timer turns a question into a deadline.
 */
const OPT_OUT_PROMPT_TTL_MS = 120_000;

/** How long the saved confirmation stays up before the pill returns to idle. */
const SAVED_PILL_TTL_MS = 3_000;

/** Free-text cap. Long enough for a real sentence, short of an essay. */
const CUSTOM_REASON_MAX = 200;

const OPT_OUT_CHOICES: ReadonlyArray<{ reason: TrackingLabsOptOutReason; labelKey: 'labs.optOutWorseOutput' | 'labs.optOutTooSlow' | 'labs.optOutNotWhatIWanted' }> = [
  { reason: 'worse_output', labelKey: 'labs.optOutWorseOutput' },
  { reason: 'too_slow', labelKey: 'labs.optOutTooSlow' },
  { reason: 'not_what_i_wanted', labelKey: 'labs.optOutNotWhatIWanted' },
];

interface OptOutPanelProps {
  onAnswer: (answer: { reason: TrackingLabsOptOutReason[]; customReason?: string }) => void;
}

/**
 * Asks why, once, right after the user turns an experiment off.
 *
 * Inline rather than a dialog: the user just declined something, and a modal
 * asking them to justify it reads as friction. It resolves exactly once —
 * every path out (a choice, skip, the timeout, or leaving the page) reports,
 * so the share of people who declined to answer is visible rather than missing.
 */
function OptOutPanel({ onAnswer }: OptOutPanelProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const answerRef = useRef(onAnswer);
  answerRef.current = onAnswer;

  useEffect(() => {
    // Picking "other" is an explicit intent to write something. Taking the
    // panel away mid-sentence would be hostile, so the clock stops there —
    // a discrete state change, not hover-tracking.
    if (expanded) return undefined;
    const timer = window.setTimeout(() => {
      answerRef.current({ reason: ['skipped'] });
    }, OPT_OUT_PROMPT_TTL_MS);
    return () => window.clearTimeout(timer);
  }, [expanded]);

  const trimmed = text.trim();
  return (
    <div className={styles.optOut}>
      <span className={styles.optOutPrompt}>{t('labs.optOutPrompt')}</span>
      <div className={styles.optOutChoices}>
        {OPT_OUT_CHOICES.map((choice) => (
          <button
            key={choice.reason}
            type="button"
            className={styles.optOutChip}
            onClick={() => onAnswer({ reason: [choice.reason] })}
          >
            {t(choice.labelKey)}
          </button>
        ))}
        <button
          type="button"
          className={`${styles.optOutChip}${expanded ? ` ${styles.optOutChipActive}` : ''}`}
          aria-expanded={expanded}
          onClick={() => setExpanded(true)}
        >
          {t('labs.optOutOther')}
        </button>
        <button
          type="button"
          className={styles.optOutSkip}
          onClick={() => onAnswer({ reason: ['skipped'] })}
        >
          {t('labs.optOutSkip')}
        </button>
      </div>
      {expanded ? (
        <div className={styles.optOutInputRow}>
          <input
            type="text"
            className={styles.optOutInput}
            maxLength={CUSTOM_REASON_MAX}
            placeholder={t('labs.optOutOtherPlaceholder')}
            aria-label={t('labs.optOutOtherPlaceholder')}
            value={text}
            autoFocus
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || !trimmed) return;
              onAnswer({ reason: ['other'], customReason: trimmed });
            }}
          />
          <button
            type="button"
            className={styles.optOutSubmit}
            disabled={!trimmed}
            onClick={() => onAnswer({ reason: ['other'], customReason: trimmed })}
          >
            {t('labs.optOutSubmit')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The dialog's save indicator, borrowed for one write.
 *
 * It is a single shared surface: every Settings section drives the same pill.
 * This switch writes immediately instead of through the dialog's debounced
 * autosave, and its request can outlive the section — so a claim id, not a
 * status alone, is what crosses the await. Comparing the pill's current value
 * would not be enough: a newer section can legitimately be showing the same
 * `saving` this write left behind.
 */
export interface LabsAutosaveController {
  /** Take the indicator for one write and report it as saving. */
  claim(): number;
  /** Settle that claim. A no-op once a newer writer has taken the indicator. */
  settle(claim: number, status: 'saved' | 'error' | 'idle'): void;
}

export interface LabsSectionProps {
  autosave?: LabsAutosaveController;
}

export function LabsSection({ autosave }: LabsSectionProps) {
  const t = useT();
  const analytics = useAnalytics();
  const [state, setState] = useState<LabsHarnessState | null>(LOADING);
  const [busy, setBusy] = useState(false);
  const noticeId = useId();
  // Non-null while the reason panel is up. Held in a ref as well as state so
  // the unmount path can settle it without re-rendering a dying component.
  const [askingReason, setAskingReason] = useState(false);
  const reasonPendingRef = useRef(false);
  // Guards against a slow earlier write re-applying UI after a later toggle,
  // and against setState landing on an unmounted section.
  const writeTokenRef = useRef(0);
  const mountedRef = useRef(true);
  // `busy` drives the disabled styling, but it cannot gate re-entry: a second
  // click in the same tick reads the pre-render closure, where `busy` is still
  // false and `state.on` is still the old value, so it would start a second
  // write from a stale baseline. The ref flips synchronously and is what the
  // guard actually reads.
  const writeInFlightRef = useRef(false);
  // The dialog's autosave pill is a shared surface with no timer of its own —
  // whoever sets it owns clearing it. Without this the confirmation sat there
  // for the rest of the session, following the user into every other section.
  const savedPillTimerRef = useRef<number | null>(null);
  // The claim this section currently holds on the shared indicator, captured
  // when the write starts rather than read back when it finishes.
  const autosaveClaimRef = useRef<number | null>(null);
  const autosaveRef = useRef(autosave);
  autosaveRef.current = autosave;

  const settleAutosave = useCallback(
    (claim: number | null, status: 'saved' | 'error' | 'idle') => {
      if (claim == null) return;
      autosaveRef.current?.settle(claim, status);
    },
    [],
  );

  const reportSaved = useCallback((claim: number | null) => {
    settleAutosave(claim, 'saved');
    if (savedPillTimerRef.current != null) window.clearTimeout(savedPillTimerRef.current);
    savedPillTimerRef.current = window.setTimeout(() => {
      savedPillTimerRef.current = null;
      settleAutosave(claim, 'idle');
    }, SAVED_PILL_TTL_MS);
  }, [settleAutosave]);

  useEffect(() => () => {
    // Leaving the section takes the confirmation with it; it describes an edit
    // the user can no longer see.
    if (savedPillTimerRef.current == null) return;
    window.clearTimeout(savedPillTimerRef.current);
    savedPillTimerRef.current = null;
    settleAutosave(autosaveClaimRef.current, 'idle');
  }, [settleAutosave]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/strategies/od-next/rollout');
        if (!response.ok) throw new Error(`rollout status failed (${response.status})`);
        const body = (await response.json()) as OdNextRolloutControlResponse;
        if (cancelled) return;
        setState(harnessStateFromStatus(body.status));
      } catch {
        if (cancelled) return;
        // An unreachable daemon must not blank the page: show the row, locked,
        // with the reason spelled out.
        setState({ on: false, lock: 'unreadable' });
      }
    })();
    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  const answerOptOut = useCallback(
    (answer: { reason: TrackingLabsOptOutReason[]; customReason?: string }) => {
      // Exactly once. A chip click that races the timeout, or a timeout that
      // races unmount, must not produce two reason rows for one opt-out.
      if (!reasonPendingRef.current) return;
      reasonPendingRef.current = false;
      const custom = answer.customReason?.trim() ?? '';
      trackLabsItemToggled(analytics.track, {
        item_id: 'design_harness',
        to: 'off',
        source: 'settings',
        reason: answer.reason,
        has_custom_reason: custom.length > 0,
        ...(custom ? { custom_reason: custom } : {}),
      });
      if (mountedRef.current) setAskingReason(false);
    },
    [analytics.track],
  );

  useEffect(() => () => {
    // Leaving the page with the question still open is the same signal as
    // letting it time out: the user moved on. Recording it keeps every opt-out
    // paired with exactly one reason row, so the share who declined to answer
    // is a number rather than a gap.
    if (reasonPendingRef.current) answerOptOut({ reason: ['skipped'] });
  }, [answerOptOut]);

  const toggle = useCallback(() => {
    if (!state || state.lock || writeInFlightRef.current) return;
    const next = !state.on;
    const previous = state.on;
    const token = ++writeTokenRef.current;
    writeInFlightRef.current = true;
    setState({ ...state, on: next });
    setBusy(true);
    const claim = autosaveRef.current?.claim() ?? null;
    autosaveClaimRef.current = claim;
    void (async () => {
      try {
        // `'off'` rather than clearing the key: an absent value reads as
        // "never touched", and the two are worth telling apart later.
        await writeHarnessMode(next ? 'active' : 'off');
        // Only staleness ends the write here. `mountedRef` guards this
        // component's own state and nothing else: leaving Labs mid-write is
        // the ordinary case — flip the switch, click another section — and the
        // preference is on the machine either way. Letting the guard reach
        // this far turned every one of those into a missing event and left the
        // dialog's pill on "Saving" for an edit that had already landed.
        if (token !== writeTokenRef.current) return;
        // After the write, not on click: a failed write rolls the switch back,
        // and an event for a preference the machine does not hold is worse
        // than a missing one.
        trackLabsItemToggled(analytics.track, {
          item_id: 'design_harness',
          to: next ? 'on' : 'off',
          source: 'settings',
        });
        if (next) {
          // Turning it back on retracts the question. Left open, a fumbled
          // off/on/off would report two opt-outs against a single reason row
          // and leave the panel asking about a switch that is now on. Settling
          // here keeps the invariant every count depends on: one reported
          // opt-out, one reason row.
          answerOptOut({ reason: ['skipped'] });
        } else if (mountedRef.current) {
          // The opt-out itself is already reported above; the reason arrives
          // as a second event once the user answers. Counting opt-outs from
          // the first and reasons from the second keeps the opt-out count
          // whole even when nobody answers.
          reasonPendingRef.current = true;
          setAskingReason(true);
        } else {
          // Nobody is left to ask, and the unmount settler has already run.
          // Recording the non-answer here keeps the same invariant: an
          // opt-out reported without a reason row would never be paired.
          reasonPendingRef.current = true;
          answerOptOut({ reason: ['skipped'] });
        }
        reportSaved(claim);
      } catch {
        if (token !== writeTokenRef.current) return;
        if (mountedRef.current) {
          setState((current) => (current ? { ...current, on: previous } : current));
        }
        // Reported even after unmount: the pill belongs to the dialog, which
        // outlives this section, and a failed save it never hears about stays
        // on "Saving" forever. Still gated on the claim — a newer section's
        // save must not be relabelled as this one's failure.
        settleAutosave(claim, 'error');
      } finally {
        if (token === writeTokenRef.current) {
          writeInFlightRef.current = false;
          if (mountedRef.current) setBusy(false);
        }
      }
    })();
  }, [analytics.track, answerOptOut, reportSaved, settleAutosave, state]);

  const lockNoticeKey = state?.lock === 'latched'
    ? 'labs.latchedNotice'
    : state?.lock === 'env'
      ? 'labs.envOverrideNotice'
      : state?.lock === 'unreadable'
        ? 'labs.loadFailedNotice'
        : null;

  const on = state?.on ?? false;
  // A section that has not resolved yet is not operable either — treating the
  // pending read as locked keeps the switch from accepting a click it would
  // immediately overwrite.
  const locked = state == null || state.lock != null;

  return (
    <section className="settings-section">
      <p className={styles.pageDesc}>{t('labs.pageDesc')}</p>
      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.rowTitle}>
            <span className={styles.rowName}>{t('labs.harnessName')}</span>
            <LabsTooltip
              label={t('labs.itemAbout', { name: t('labs.harnessName') })}
              body={t('labs.harnessTooltip')}
              scope={t('labs.harnessScope')}
            />
          </span>
          <span className={styles.rowHint}>{t('labs.harnessHint')}</span>
          {lockNoticeKey ? (
            <span className={styles.rowNotice} role="status" id={noticeId}>
              <Icon name="info" size={12} aria-hidden />
              {t(lockNoticeKey)}
            </span>
          ) : null}
          {askingReason ? <OptOutPanel onAnswer={answerOptOut} /> : null}
        </div>
        {/* `aria-disabled` rather than `disabled`: a disabled button leaves the
            tab order, so a screen-reader user never reaches the sentence that
            explains why the switch will not move. `toggle` refuses the click
            on its own. */}
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t('labs.harnessName')}
          aria-disabled={locked || busy}
          aria-describedby={lockNoticeKey ? noticeId : undefined}
          className={`${styles.switch}${on ? ` ${styles.switchOn}` : ''}`}
          onClick={toggle}
          data-testid="labs-harness-switch"
        >
          <span className={styles.switchKnob} aria-hidden />
        </button>
      </div>
    </section>
  );
}
