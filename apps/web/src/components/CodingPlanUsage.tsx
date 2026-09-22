import { useEffect, useState } from 'react';
import type {
  WorkspaceBillingPreflight,
  WorkspaceBillingResponse,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import { VisuallyHidden } from '@open-design/components';
import { useI18n } from '../i18n';
import {
  codingPlanResetCountdown,
  codingPlanWindowDuration,
  codingPlanWindowViews,
  formatCodingPlanResetAt,
  type CodingPlanWindowView,
} from './coding-plan-usage-model';
import styles from './CodingPlanUsage.module.css';

/**
 * The largest delay `setTimeout` can hold: a 32-bit signed millisecond count
 * (~24.8 days). A larger delay does not wait longer — it wraps and fires on the
 * next tick, which would turn "wake once at the reset" into a request per
 * millisecond. A reset further out than this (a freshly opened 30-day window)
 * wakes early instead and re-reads; the fresh payload schedules the remainder.
 */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** How the panel got on: still reading, holding a reading, or unable to read. */
type ReadState =
  | { status: 'loading' }
  | {
      status: 'ready';
      preflight: WorkspaceBillingPreflight;
      /** The server's credits-per-dollar rate; null when it reported none. */
      creditsPerUsd: number | null;
    }
  | { status: 'unavailable' };

/**
 * Mounted only while the billing panel is visible.
 *
 * Quota changes do not emit wallet events, so this reads for itself — but it
 * does NOT poll. The preflight is uncached on the daemon and costs a dozen DB
 * queries per read, and an open panel would hold that heartbeat for as long as
 * the user leaves it open. The only instant a quota number changes on its own
 * is the window reset, and the payload already says when that is: read once at
 * mount, then once more the moment the soonest window resets.
 */
export function CodingPlanUsage({ context }: { context: WorkspaceCollabContext | null }) {
  const { t, locale } = useI18n();
  const workspaceId = context?.workspaceId;
  const memberId = context?.workspaceMemberId;
  const [state, setState] = useState<ReadState>({ status: 'loading' });
  useEffect(() => {
    setState({ status: 'loading' });
    if (!workspaceId || !memberId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      // Null means "nothing to wake up for" — no timer at all, not a baseline.
      let resetDelay: number | null = null;
      try {
        const response = await fetch(
          `/api/workspace/billing?scope=workspace&workspaceId=${encodeURIComponent(workspaceId)}&includePreflight=1`,
          {
            cache: 'no-store',
            signal: controller.signal,
          },
        );
        const body: WorkspaceBillingResponse | null = response.ok ? await response.json() : null;
        const next = body?.preflight;
        const valid =
          next?.workspaceId === workspaceId &&
          next.workspaceMemberId === memberId &&
          Math.abs(Date.now() - Date.parse(next.generatedAt)) < 60_000;
        if (!controller.signal.aborted) {
          setState(
            valid
              ? {
                  status: 'ready',
                  preflight: next,
                  // The exchange rate is account-scoped, so it rides the
                  // summary rather than the preflight.
                  creditsPerUsd: body?.summary?.creditsPerUsd ?? null,
                }
              : { status: 'unavailable' },
          );
        }
        if (valid) {
          for (const window of next.codingPlan.windows) {
            if (window.resetsAt) {
              const untilReset = Date.parse(window.resetsAt) - Date.now();
              if (untilReset > 0) {
                resetDelay =
                  resetDelay === null ? untilReset + 250 : Math.min(resetDelay, untilReset + 250);
              }
            }
          }
        }
      } catch {
        if (!controller.signal.aborted) setState({ status: 'unavailable' });
      }
      if (!controller.signal.aborted && resetDelay !== null) {
        timer = setTimeout(() => void refresh(), Math.min(resetDelay, MAX_TIMEOUT_MS));
      }
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [workspaceId, memberId]);
  if (!workspaceId || !memberId) return null;
  if (state.status === 'loading') {
    // A skeleton, not an empty gap: the quota area occupies its slot from the
    // first paint of the card, so nothing pops in beside the wallet row later.
    return (
      <div className={styles.panel} data-testid="coding-plan-usage-skeleton" role="status">
        <VisuallyHidden>{t('common.loading')}</VisuallyHidden>
        <span className={styles.skeletonLine} aria-hidden />
        <span className={styles.skeletonBar} aria-hidden />
      </div>
    );
  }
  if (state.status === 'unavailable') {
    // One quiet line. A quota read the client could not make is not an error
    // the user has to act on, and it never blocks sending.
    return (
      <div className={styles.panel}>
        <p className={styles.note}>{t('billing.codingPlanUnavailable')}</p>
      </div>
    );
  }
  const plan = state.preflight.codingPlan;
  // No plan (or a plan the backend cannot name a tier for) has no quota to
  // draw. Product ruling: the area is ABSENT — the card falls back to the
  // wallet row alone rather than explaining an absence.
  if (!plan.eligible || plan.tier === null) return null;
  const views = codingPlanWindowViews(plan.windows, state.creditsPerUsd);
  if (views.length === 0) return null;
  return (
    <div className={styles.panel} aria-label={t('billing.codingPlan')}>
      <strong>{t('billing.codingPlan')}</strong>
      {views.map((view) => (
        <CodingPlanWindowRow key={view.policyId} view={view} locale={locale} t={t} />
      ))}
      <p className={styles.note}>{t('billing.codingPlanFallback')}</p>
    </div>
  );
}

function CodingPlanWindowRow({
  view,
  locale,
  t,
}: {
  view: CodingPlanWindowView;
  locale: string;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const duration = codingPlanWindowDuration(view.durationSeconds);
  const name = t(
    duration.unit === 'day' ? 'billing.codingPlanWindowDays' : 'billing.codingPlanWindowHours',
    { count: duration.count },
  );
  const percent = view.usedPercent;
  // An unreadable share must not be narrated as "0% used" — the bar sits at
  // zero but the label only names the window.
  const share = view.exhausted
    ? t('billing.codingPlanExhausted')
    : percent === null
      ? null
      : t('billing.codingPlanUsedPercent', { percent });
  return (
    <div className={styles.window} data-testid="coding-plan-window" data-exhausted={view.exhausted}>
      <div className={styles.windowHead}>
        <span className={styles.windowName} data-testid="coding-plan-window-name">
          {name}
        </span>
        <span className={styles.windowStat}>
          {share === null ? null : <span>{share}</span>}
          {!view.exhausted && view.remainingUsd ? (
            <span className={styles.windowRemaining}>
              {t('billing.codingPlanRemainingAmount', { amount: view.remainingUsd })}
            </span>
          ) : null}
        </span>
      </div>
      <progress
        className={styles.bar}
        value={percent ?? 0}
        max={100}
        aria-label={share === null ? name : `${name} · ${share}`}
      />
      <small className={styles.windowReset} data-testid="coding-plan-window-reset">
        <CodingPlanReset view={view} locale={locale} t={t} />
      </small>
    </div>
  );
}

/**
 * The reset line: how long the user has to wait, then the instant itself on
 * their own wall clock. `resetsAt` is a UTC instant, so the machine-readable
 * value stays on `<time dateTime>` whatever the rendered text says.
 */
function CodingPlanReset({
  view,
  locale,
  t,
}: {
  view: CodingPlanWindowView;
  locale: string;
  t: ReturnType<typeof useI18n>['t'];
}) {
  // Neutral by design: the backend's window-start semantics are changing, so
  // this must not promise that the clock starts on first use.
  if (view.notStarted) return <>{t('billing.codingPlanUnstarted')}</>;
  if (!view.resetsAt) return null;
  const at = formatCodingPlanResetAt(view.resetsAt, locale);
  if (!at) return null;
  const countdown = codingPlanResetCountdown(view.resetsAt, Date.now());
  // Coarsest non-zero unit wins, all the way down to minutes — see
  // `codingPlanResetCountdown` for why the last hour keeps a countdown.
  const text = !countdown
    ? t('billing.codingPlanReset', { time: at })
    : countdown.days > 0
      ? t('billing.codingPlanResetsInDays', {
          days: countdown.days,
          hours: countdown.hours,
          time: at,
        })
      : countdown.hours > 0
        ? t('billing.codingPlanResetsInHours', { hours: countdown.hours, time: at })
        : t('billing.codingPlanResetsInMinutes', { minutes: countdown.minutes, time: at });
  return <time dateTime={view.resetsAt}>{text}</time>;
}
