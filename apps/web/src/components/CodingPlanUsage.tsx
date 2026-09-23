import { useEffect, useState } from 'react';
import type {
  WorkspaceBillingPreflight,
  WorkspaceBillingResponse,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import { VisuallyHidden } from '@open-design/components';
import { isTeamPlanTier } from '../collab/team-plan';
import { useI18n } from '../i18n';
import { Icon } from './Icon';
import { codingPlanQuotaView } from './coding-plan-usage-model';
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
  | { status: 'ready'; preflight: WorkspaceBillingPreflight }
  | { status: 'unavailable' };

/**
 * Whether this workspace's billing card shows a plan allowance at all.
 *
 * User ruling: 团队版的面板跟以前保持一致 — a team workspace keeps the card it
 * already had (团队版 + wordmark, 升级, 钱包余额) and gains no quota row. The
 * allowance is a PERSONAL-plan surface.
 *
 * Deliberately asked of the workspace and its plan id rather than of the
 * backend's `eligible` flag. `eligible` answers "does a coding-plan pool exist
 * for this member", which a team plan can answer yes to; the question here is
 * which surface the user is looking at, and that is the client's own to decide.
 */
function drawsPlanAllowance(context: WorkspaceCollabContext): boolean {
  return context.workspaceType !== 'team' && !isTeamPlanTier(context.planId);
}

/**
 * The Coding Plan allowance block inside the top-right billing card, built to
 * the design in `docs/ui-previews/plan-panels/` (PR #8364).
 *
 * One row — the allowance on the left, the used share as an entry on the
 * right — over a 5px track. That is the whole surface: the design defines a
 * normal state and a loading state, so every other reading (no plan, an old
 * CLI with no preflight, a failed read) draws NOTHING and the card falls back
 * to its wallet row alone.
 *
 * Mounted only while the billing panel is visible. Quota changes do not emit
 * wallet events, so this reads for itself — but it does NOT poll. The preflight
 * is uncached on the daemon and costs a dozen DB queries per read, and an open
 * panel would hold that heartbeat for as long as the user leaves it open. The
 * only instant a quota number changes on its own is the window reset, and the
 * payload already says when that is: read once at mount, then once more the
 * moment the soonest window resets.
 */
export function CodingPlanUsage({
  context,
  usageUrl,
  onUsageClick,
}: {
  context: WorkspaceCollabContext | null;
  /** Where the used share leads; null drops the entry and keeps plain text. */
  usageUrl?: string | null;
  /** Fired when the entry is taken, so the card can close and record it. */
  onUsageClick?: () => void;
}) {
  const { t } = useI18n();
  const workspaceId = context?.workspaceId;
  const memberId = context?.workspaceMemberId;
  const personalScope = context ? drawsPlanAllowance(context) : false;
  const [state, setState] = useState<ReadState>({ status: 'loading' });
  useEffect(() => {
    setState({ status: 'loading' });
    if (!workspaceId || !memberId || !personalScope) return;
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
          setState(valid ? { status: 'ready', preflight: next } : { status: 'unavailable' });
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
  }, [workspaceId, memberId, personalScope]);
  if (!workspaceId || !memberId || !personalScope) return null;
  if (state.status === 'loading') {
    // The design's skeleton, in the loaded block's own slot so the card does
    // not resize under the pointer when the reading lands.
    return (
      <div
        className={styles.quota}
        data-coding-plan-quota=""
        data-testid="coding-plan-quota-skeleton"
        role="status"
      >
        <VisuallyHidden>{t('common.loading')}</VisuallyHidden>
        <div className={styles.row} aria-hidden>
          <span className={styles.bone} data-testid="coding-plan-quota-bone" />
          <span
            className={`${styles.bone} ${styles.boneEnd}`}
            data-testid="coding-plan-quota-bone"
          />
        </div>
        <span
          className={`${styles.bone} ${styles.boneTrack}`}
          data-testid="coding-plan-quota-bone"
          aria-hidden
        />
      </div>
    );
  }
  // Every non-normal reading is an ABSENCE, not a sentence. A quota the client
  // could not read is not an error the user has to act on, and it never blocks
  // sending — so the card simply falls back to the wallet row it already had.
  if (state.status === 'unavailable') return null;
  const plan = state.preflight.codingPlan;
  if (!plan.eligible || plan.tier === null) return null;
  const view = codingPlanQuotaView(plan.windows);
  if (!view) return null;
  const allowance = t('billing.codingPlanWeeklyAllowance');
  const share = t('billing.codingPlanUsedPercent', { percent: view.usedPercent });
  return (
    <div className={styles.quota} data-coding-plan-quota="" data-testid="coding-plan-quota">
      <div className={styles.row}>
        <span className={styles.allowance}>{allowance}</span>
        {usageUrl ? (
          <a
            className={styles.entry}
            data-testid="coding-plan-quota-entry"
            href={usageUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onUsageClick}
          >
            <span>{share}</span>
            <Icon name="chevron-right" size={14} />
          </a>
        ) : (
          <span className={styles.entry}>{share}</span>
        )}
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={allowance}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={view.usedPercent}
        aria-valuetext={share}
      >
        <span
          className={styles.fill}
          data-testid="coding-plan-quota-fill"
          style={{ width: `${view.usedPercent}%` }}
        />
      </div>
    </div>
  );
}
