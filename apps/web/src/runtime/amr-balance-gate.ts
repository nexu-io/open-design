// Pre-run balance gate for the Open Design Cloud agent. Two tiers:
//
//   HARD  — the run cannot possibly succeed: the account is signed out, or the
//           wallet balance is definitively <= $0. The send is blocked and the
//           subscription dialog is the only way forward (plus dismiss).
//   SOFT  — the run can start but may die mid-flight: balance is at or below
//           the low-balance warning line. The user is warned once per send and
//           may proceed anyway, top up first, or opt out of future warnings.
//
// Fail-open contract: only DEFINITIVE answers gate. An unavailable endpoint or
// unparseable balance never blocks — those states already have their own
// recovery paths (run-time failure cards), and a flaky wallet must never lock
// users out of starting tasks. The signed-out answer comes from the local
// config read, so it is reliable enough to hard-gate on.

import type { AmrWalletSnapshot } from '@open-design/contracts';
import { fetchAmrWalletSnapshot } from '../providers/daemon';

/**
 * Hard-block line (USD): at or below this the wallet cannot fund any part of
 * a run, so starting one only manufactures a mid-run
 * AMR_INSUFFICIENT_BALANCE failure.
 */
export const AMR_HARD_BLOCK_BALANCE_USD = 0;

/**
 * Soft-warning line (USD): at or below this a run may start but is likely to
 * exhaust the wallet before finishing. Tune from data: the starting-balance
 * distribution of AMR_INSUFFICIENT_BALANCE failures tells you where this
 * line should actually sit.
 */
export const AMR_LOW_BALANCE_WARN_USD = 2;

const LOW_BALANCE_WARN_OPTOUT_KEY = 'open-design:amr-low-balance-warn-optout:v1';

export type AmrBalanceGateResult =
  | { kind: 'allow' }
  | { kind: 'hard'; reason: 'insufficient'; snapshot: AmrWalletSnapshot }
  | { kind: 'hard'; reason: 'signed_out'; snapshot: AmrWalletSnapshot }
  | { kind: 'soft'; snapshot: AmrWalletSnapshot };

/** Parse a definitive balance from a snapshot; null when the answer is
 * indefinite (missing/unavailable/unparseable — those must fail open). */
export function amrWalletBalanceUsd(
  snapshot: AmrWalletSnapshot | null | undefined,
): number | null {
  if (!snapshot || snapshot.status !== 'available') return null;
  // Trim before the emptiness check: Number(' ') is 0, so an untrimmed
  // whitespace-only balance would read as a definitive $0 and block instead
  // of failing open like every other unparseable answer.
  const raw = snapshot.balanceUsd?.trim();
  if (raw == null || raw === '') return null;
  const balance = Number(raw);
  return Number.isFinite(balance) ? balance : null;
}

/** Whether a snapshot definitively shows a hard-block balance (<= $0). */
export function amrWalletBalanceInsufficient(
  snapshot: AmrWalletSnapshot | null | undefined,
): boolean {
  const balance = amrWalletBalanceUsd(snapshot);
  return balance != null && balance <= AMR_HARD_BLOCK_BALANCE_USD;
}

/** Whether the user opted out of the low-balance soft warning ("don't remind
 * me again"). Hard blocks are never subject to this opt-out. */
export function isAmrLowBalanceWarnOptedOut(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(LOW_BALANCE_WARN_OPTOUT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAmrLowBalanceWarnOptedOut(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOW_BALANCE_WARN_OPTOUT_KEY, '1');
  } catch {
    // Persistence failure just means the warning shows again next time.
  }
}

/**
 * Decide whether an Open Design Cloud run may start. Fast path first: the
 * daemon-cached snapshot answers without an upstream roundtrip, so healthy
 * balances start with no added latency. Only a hard-block answer is confirmed
 * against the live wallet (refresh=1) — the cache may predate a recharge or
 * subscription, and a just-topped-up user must never be hard-blocked. The
 * soft tier trusts the cache (its cost is one dismissible reminder, and the
 * daemon cache is at most a few seconds old).
 */
export async function checkAmrBalanceGate(): Promise<AmrBalanceGateResult> {
  try {
    const cached = await fetchAmrWalletSnapshot().catch(() => null);
    const cachedBalance = amrWalletBalanceUsd(cached);
    const cachedHardCandidate =
      cached?.status === 'signed_out' ||
      (cachedBalance != null && cachedBalance <= AMR_HARD_BLOCK_BALANCE_USD);
    if (!cachedHardCandidate) {
      if (cachedBalance == null) return { kind: 'allow' };
      if (cachedBalance > AMR_LOW_BALANCE_WARN_USD || isAmrLowBalanceWarnOptedOut()) {
        return { kind: 'allow' };
      }
      // cached is non-null here: a definitive balance implies a snapshot.
      return { kind: 'soft', snapshot: cached! };
    }
    // Hard-block candidate (signed out or empty): confirm against the live
    // wallet before blocking — the cache may predate a sign-in or recharge.
    const fresh = await fetchAmrWalletSnapshot({ refresh: true }).catch(() => null);
    if (fresh == null) return { kind: 'allow' };
    // Signed-out is decided from the LOCAL profile read, so it is definitive
    // even though the snapshot carries an explanatory `signed_out` error —
    // check it before the stale/error guard below.
    if (fresh.status === 'signed_out') {
      return { kind: 'hard', reason: 'signed_out', snapshot: fresh };
    }
    // A failed refresh hands back the PREVIOUS cached snapshot flagged
    // `stale: true` (plus an upstream/network `error`). That is not a fresh
    // definitive answer, so it must not confirm a hard block — a user who
    // just topped up while the wallet endpoint hiccuped would be stranded.
    if (fresh.stale || fresh.error != null) return { kind: 'allow' };
    const freshBalance = amrWalletBalanceUsd(fresh);
    if (freshBalance == null) return { kind: 'allow' };
    if (freshBalance <= AMR_HARD_BLOCK_BALANCE_USD) {
      return { kind: 'hard', reason: 'insufficient', snapshot: fresh };
    }
    if (freshBalance <= AMR_LOW_BALANCE_WARN_USD && !isAmrLowBalanceWarnOptedOut()) {
      return { kind: 'soft', snapshot: fresh };
    }
    return { kind: 'allow' };
  } catch {
    // Fail open: an unexpected wallet-path error must never block task starts.
    return { kind: 'allow' };
  }
}
