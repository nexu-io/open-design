import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Dialog } from '@open-design/components';
import { useT } from '../i18n';
import { useAnalytics } from '../analytics/provider';
import { getResolvedDeviceId } from '../analytics/client';
import {
  amrHandoffDeviceId,
  attributedAmrUrl,
  recordAmrEntry,
} from '../analytics/amr-attribution';
import { useWorkspaceBilling, useWorkspaceContext } from '../collab/useWorkspaceContext';
import { workspaceAutoRechargeUrl, workspaceUpgradeUrl } from './EntryNavRail';
import {
  AMR_HARD_BLOCK_BALANCE_USD,
  amrWalletBalanceUsd,
} from '../runtime/amr-balance-gate';
import { fetchAmrWalletSnapshot, formatVelaBalanceUsd } from '../providers/daemon';
import { AmrLoginPill } from './AmrLoginPill';
import { Icon } from './Icon';
import styles from './AmrBalanceDialog.module.css';

/** How often the post-recharge wallet watch polls (daemon-cached reads; the
 * daemon's own TTL rate-limits the upstream calls). */
const WALLET_WATCH_INTERVAL_MS = 5_000;
/** Give up watching after this long; the dialog stays, resume goes manual. */
const WALLET_WATCH_TIMEOUT_MS = 10 * 60_000;

interface Props {
  /** Why the send was hard-blocked: empty wallet, or not signed in at all. */
  reason: 'insufficient' | 'signed_out';
  /** Raw wallet balance string from the blocking snapshot; null hides the badge. */
  balanceUsd: string | null;
  /** OpenDesign Cloud profile from the blocking snapshot; picks the console origin. */
  profile: string | null;
  /** Which surface blocked the send — keys the amr_entry attribution. */
  entrySource: 'home_balance_gate_upgrade' | 'chat_balance_gate_upgrade';
  /**
   * Where THIS caller's primary CTA has to land — the one thing that differs
   * between the two owner cells of the balance matrix (spec T58). The dialog
   * itself, including every word of its copy, is identical in both.
   *
   *   pricing        — 非 Max 所有者:the console's plan surface (`billing=plan`).
   *   auto_recharge  — Max 所有者:the console's auto-recharge settings. A Max
   *                    subscriber has no higher plan to buy, so the plan surface
   *                    would sell them what they already own.
   *
   * Resolved by the caller from `amrBalanceDialogUpgradeIntent`, so the dialog
   * and the in-conversation UpgradeCard cannot drift apart. Defaults to
   * `pricing` — the destination that needs no billing permission, and the
   * behavior every caller had before T58.
   */
  upgradeIntent?: 'pricing' | 'auto_recharge';
  metricsConsent: boolean;
  installationId: string | null | undefined;
  /** Dismissal only ("not now" / Esc); the blocked payload stays parked. */
  onClose: () => void;
  /** The blocking condition just cleared (sign-in completed, or the wallet
   *  watch saw the recharge land) — the caller resumes the parked task. */
  onResolved: () => void;
}

// HARD pre-run blocker for OpenDesign Cloud tasks: the run cannot possibly
// succeed, so the send is stopped BEFORE any run spawns — unlike the
// post-failure AMR_INSUFFICIENT_BALANCE error card which appears after a run
// already burned its startup. It fires at the moment of PEAK intent — the
// user just wrote a task and pressed send — so it must read as "one step from
// starting", never as an error. Two variants with distinct copy AND CTAs:
//
//   insufficient — signed in, wallet definitively empty. The CTA must LAND on
//     the surface that fixes it rather than drop the user on a page to hunt for
//     it, and WHICH surface that is depends on the caller's plan (spec T58):
//     a 非 Max owner is sold a plan (`workspaceUpgradeUrl` → this runtime
//     profile's console plan surface, `/dashboard?…&billing=plan`, spec T54),
//     while a Max owner — who has no higher plan to buy — lands on the console's
//     auto-recharge settings (`workspaceAutoRechargeUrl`). The caller picks via
//     `upgradeIntent`; both destinations are the same shared decision points the
//     account menu and the UpgradeCard use. It has NOT been `billing=checkout`
//     since #7122; the older comment here said so long after that stopped being
//     true. Balance badge shown.
//
//   signed_out — OpenDesign Cloud selected but no account session. The CTA
//     is the in-app sign-in (AmrLoginPill: spawns vela login, surfaces the
//     activation link when the browser doesn't auto-open, polls until done);
//     sending the user to the wallet website would be a dead end.
//
// Both variants AUTO-RESUME: a completed sign-in fires `onResolved`
// immediately, and clicking the wallet CTA arms a bounded wallet watch that
// fires `onResolved` once the recharge lands — so the parked task continues
// without the user having to re-send it.
//
// Both variants keep the benefits list (they sell the service to exactly the
// not-yet-committed cohort). The caller preserves the payload (home keeps
// the composer draft; chat parks the full send in the queue).
//
// This is now the ONLY balance dialog. The softer low-balance reminder used to
// have its own centered dialog (AmrLowBalanceDialog); product deleted it on
// 2026-09-06 — "软提醒弹窗就是产品告诉我不要这个的,只用弹那个插画的就行" (T53).
// The soft tier survives only as the project page's in-conversation UpgradeCard,
// and Home shows nothing at all for it.
export function AmrBalanceDialog({
  reason,
  balanceUsd,
  profile,
  entrySource,
  upgradeIntent = 'pricing',
  metricsConsent,
  installationId,
  onClose,
  onResolved,
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const formattedBalance = formatVelaBalanceUsd(balanceUsd);
  const signedOut = reason === 'signed_out';
  const signInEntrySource =
    entrySource === 'home_balance_gate_upgrade'
      ? ('home_balance_gate_sign_in' as const)
      : ('chat_balance_gate_sign_in' as const);
  // Armed by the wallet CTA click (the user's "I'm going to recharge"
  // signal): poll the wallet until the balance clears the hard line, then
  // resume the parked task via onResolved. Bounded so an abandoned recharge
  // doesn't poll forever; guarded against double-fires.
  const [watchingWallet, setWatchingWallet] = useState(false);
  const {
    context: workspaceContext,
    loading: workspaceContextLoading,
  } = useWorkspaceContext();
  const workspaceBilling = useWorkspaceBilling();
  // Both destinations come from the two shared decision points in
  // `EntryNavRail`, so this dialog cannot grow a link the account menu, the
  // settings panel and the in-conversation UpgradeCard do not agree with.
  //
  // The auto-recharge link is withheld for a readable-but-not-writable
  // workspace (`canManageAutoRecharge` is `writable && isOwner`, one notch
  // stricter than billing's `readable && isOwner`). Falling back to the plan
  // surface there is the same rule the UpgradeCard follows: one fewer
  // capability beats one dead button.
  const upgradeUrl = workspaceContextLoading
    ? null
    : (upgradeIntent === 'auto_recharge'
        ? workspaceAutoRechargeUrl(workspaceContext, { fallbackProfile: profile })
        : null)
      ?? workspaceUpgradeUrl(workspaceContext, workspaceBilling, {
        fallbackProfile: profile,
      });
  const resolvedRef = useRef(false);
  const resolveOnce = () => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    onResolved();
  };
  useEffect(() => {
    if (!watchingWallet) return;
    let cancelled = false;
    const startedAt = Date.now();
    const tick = async () => {
      if (cancelled) return;
      const snapshot = await fetchAmrWalletSnapshot().catch(() => null);
      if (cancelled) return;
      const balance = amrWalletBalanceUsd(snapshot);
      if (balance != null && balance > AMR_HARD_BLOCK_BALANCE_USD) {
        resolveOnce();
        return;
      }
      if (Date.now() - startedAt > WALLET_WATCH_TIMEOUT_MS) {
        setWatchingWallet(false);
      }
    };
    const interval = setInterval(() => void tick(), WALLET_WATCH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // resolveOnce is stable via ref; onResolved changes don't re-arm the watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchingWallet]);
  const openUpgrade = () => {
    if (!upgradeUrl) return;
    setWatchingWallet(true);
    // Same attribution handshake as the other OpenDesign Cloud handoffs
    // (ChatPane recharge, AvatarMenu upgrade): record the amr_entry, forward
    // the consent-gated device id, and open the console for the profile.
    const attribution = recordAmrEntry(analytics.track, entrySource, new Date(), {
      metricsConsent,
    });
    const deviceId = amrHandoffDeviceId({
      metricsConsent,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId,
    });
    window.open(
      attributedAmrUrl(upgradeUrl, attribution, deviceId),
      '_blank',
      'noopener,noreferrer',
    );
  };
  const benefits = [
    t('chat.amrBalanceGate.benefit1'),
    t('chat.amrBalanceGate.benefit2'),
    t('chat.amrBalanceGate.benefit3'),
    t('chat.amrBalanceGate.benefit4'),
  ];
  const dialog = (
    <Dialog
      role="alertdialog"
      ariaLabel={signedOut ? t('chat.amrBalanceGate.signedOutTitle') : t('chat.amrBalanceGate.title')}
      onClose={onClose}
      closeOnEscape
      className={styles.panel}
      data-testid="amr-balance-dialog"
    >
      <button
        type="button"
        className={styles.closeButton}
        onClick={onClose}
        aria-label={t('common.close')}
      >
        <Icon name="close" size={14} />
      </button>
      <div className={styles.banner}>
        <img
          className={styles.bannerImage}
          src="/upgrade/cloud-signin-aurora.jpg"
          alt=""
          width={1680}
          height={720}
          decoding="async"
          draggable={false}
        />
      </div>
      <h2 className={styles.title}>
        {signedOut ? t('chat.amrBalanceGate.signedOutTitle') : t('chat.amrBalanceGate.title')}
      </h2>
      <p className={styles.message}>
        {signedOut
          ? t('chat.amrBalanceGate.signedOutMessage')
          : // The insufficient variant always carries a definitive balance
            // (that's what made the gate fire); the fallback is belt and
            // suspenders for a malformed snapshot.
            t('chat.amrBalanceGate.message', { balance: formattedBalance ?? '$0.00' })}
      </p>
      <div className={styles.benefitsCard}>
        <span className={styles.benefitsTitle}>
          {t('chat.amrBalanceGate.benefitsTitle')}
        </span>
        <ul className={styles.benefits}>
          {benefits.map((benefit) => (
            <li key={benefit} className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden>
                <Icon name="check" size={14} />
              </span>
              {benefit}
            </li>
          ))}
        </ul>
      </div>
      {/* Dismissal first in DOM so it lands on the left of the row and focus
          order matches the reading order; the CTA follows on the right. */}
      <div className={styles.actions}>
        <Button variant="ghost" className={styles.later} onClick={onClose}>
          {t('chat.amrBalanceGate.laterCta')}
        </Button>
        {signedOut ? (
          <AmrLoginPill
            className={styles.signInPill}
            signInLabel={t('chat.amrBalanceGate.signInCta')}
            amrEntrySourceDetail={signInEntrySource}
            metricsConsent={metricsConsent}
            installationId={installationId}
            showActivationDetails
            hideSignedOutStatus
            revealPendingCancelAction
            onStatusChange={(loginStatus) => {
              // Signed in — the gate's reason is gone; resume the parked task.
              if (loginStatus?.loggedIn === true) resolveOnce();
            }}
          />
        ) : upgradeUrl ? (
          <Button
            variant="primary"
            className={styles.cta}
            onClick={openUpgrade}
            data-testid="amr-balance-dialog-plans"
          >
            {t('chat.amrBalanceGate.plansCta')}
          </Button>
        ) : null}
      </div>
      {watchingWallet ? (
        <p className={styles.watchingHint} data-testid="amr-balance-dialog-watching">
          {t('chat.amrBalanceGate.watchingWallet')}
        </p>
      ) : null}
    </Dialog>
  );
  if (typeof document === 'undefined') return dialog;
  return createPortal(dialog, document.body);
}
