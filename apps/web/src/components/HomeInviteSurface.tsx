import { useAnalytics } from '../analytics/provider';
import { trackWorkspaceJourneyClick } from '../analytics/events';
import { workspaceAnalyticsDimensions } from '../analytics/workspace';
import { useWorkspaceJourney } from '../analytics/use-workspace-journey';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useCloudSignIn } from './use-cloud-sign-in';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { useI18n } from '../i18n';
import { InviteDialog } from './InviteDialog';
import { Toast } from './Toast';
import styles from './HomeInviteSurface.module.css';

export const WORKSPACE_INVITES_SENT = 'od:workspace-invites-sent';
const OPEN_INVITE = 'od:workspace-invite-open';

export function HomeInviteTrigger({ context, signedOut = false }: { context: WorkspaceCollabContext | null; signedOut?: boolean }) {
  const { t } = useI18n();
  const analytics = useAnalytics();
  const [surfaceId] = useState(() => crypto.randomUUID());
  if (!signedOut && (!context || !context.permissions.canInviteMembers || context.memberStatus !== 'active' || context.lifecycleState !== 'active')) return null;
  return <Button className={styles.trigger} onClick={() => { trackWorkspaceJourneyClick(analytics.track, { page_name: 'home', area: 'home_invite_header', element: 'invite_teammates', entry_from: 'home_header', surface_instance_id: surfaceId, ...workspaceAnalyticsDimensions(context) }); window.dispatchEvent(new CustomEvent(OPEN_INVITE, { detail: signedOut ? { signedOut: true } : { workspaceId: context?.workspaceId, workspaceMemberId: context?.workspaceMemberId } })); }}><InvitePersonIcon /> {t('homeInvite.invite')}</Button>;
}

function InvitePersonIcon() {
  return <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2M16 5.5a3 3 0 0 1 0 5.5M17 14a4.5 4.5 0 0 1 3.5 4.4" /></svg>;
}

interface Props {
  accountId: string | null;
  context: WorkspaceCollabContext | null;
  active: boolean;
  signedOut?: boolean;
  identityReady?: boolean;
  onSignInRequested?: () => void;
  openAfterSignIn?: boolean;
  onSignInInviteConsumed?: () => void;
}

/** Account-scoped dismissal survives workspace changes without sharing it with
 * another account. Workspace membership IDs intentionally are not account IDs. */
export function HomeInviteSurface({ accountId, context, active, signedOut = false, identityReady = true, onSignInRequested, openAfterSignIn = false, onSignInInviteConsumed }: Props) {
  const { t } = useI18n();
  const bannerRef = useRef<HTMLDivElement>(null);
  const storageKey = accountId ? `od.invitation-banner.dismissed:${encodeURIComponent(accountId)}` : signedOut ? 'od.invitation-banner.dismissed:local' : null;
  const [dismissal, setDismissal] = useState<string | null>(() => {
    try { return storageKey && window.localStorage.getItem(storageKey) === '1' ? storageKey : null; } catch { return null; }
  });
  const [open, setOpen] = useState(false);
  const [entryFrom, setEntryFrom] = useState<'home_banner' | 'home_header'>('home_banner');
  const eligible = signedOut || Boolean(context && context.memberStatus === 'active' && context.lifecycleState === 'active' && context.permissions.canInviteMembers);
  const bannerJourney = useWorkspaceJourney({ page_name: 'home', area: 'home_invite_banner', entry_from: 'home_banner', ...workspaceAnalyticsDimensions(context) }, Boolean(eligible && active && storageKey && dismissal !== storageKey));
  const [pendingSignInInvite, setPendingSignInInvite] = useState(false);
  const { state: signInState, status: signInStatus, begin, cancel } = useCloudSignIn({ onLoginSuccess: () => setPendingSignInInvite(true) });
  const [sent, setSent] = useState(0);
  const [sentGeneration, setSentGeneration] = useState(0);
  const principal = context ? `${context.workspaceId}:${context.workspaceMemberId}` : '';
  useEffect(() => {
    setOpen(false);
    setSent(0);
  }, [principal, accountId]);
  useEffect(() => {
    if ((!pendingSignInInvite && !openAfterSignIn) || signedOut || !accountId || !identityReady || !context) return;
    setPendingSignInInvite(false);
    onSignInInviteConsumed?.();
    if (context.memberStatus === 'active' && context.lifecycleState === 'active' && context.permissions.canInviteMembers) setOpen(true);
  }, [pendingSignInInvite, openAfterSignIn, signedOut, accountId, identityReady, context, onSignInInviteConsumed]);

  function requestSignIn() {
    if (onSignInRequested) onSignInRequested();
    else void begin();
  }

  useEffect(() => {
    function onOpen(event: Event) {
      setEntryFrom('home_header');
      const detail = (event as CustomEvent).detail;
      if (signedOut && detail?.signedOut) { requestSignIn(); return; }
      if (context && detail?.workspaceId === context.workspaceId && detail?.workspaceMemberId === context.workspaceMemberId) setOpen(true);
    }
    window.addEventListener(OPEN_INVITE, onOpen);
    return () => window.removeEventListener(OPEN_INVITE, onOpen);
  }, [context, signedOut, begin, onSignInRequested]);
  useEffect(() => {
    if (!storageKey) return;
    try {
      setDismissal(window.localStorage.getItem(storageKey) === '1' ? storageKey : null);
    } catch {
      setDismissal(null);
    }
  }, [storageKey]);
  // Match A03's 56px desktop lift without moving the title or composer.
  // When an expanded input leaves less room, reduce only the visual lift so
  // the invitation remains inside the main scroll surface rather than clipped.
  useLayoutEffect(() => {
    const banner = bannerRef.current;
    const scroll = banner?.closest<HTMLElement>('.entry-main--scroll');
    if (!banner || !scroll) return;
    let lift = 0;
    const update = () => {
      const rowTop = banner.getBoundingClientRect().top + lift;
      const edge = Math.max(0, scroll.getBoundingClientRect().top) + 16;
      lift = window.matchMedia('(min-width: 761px)').matches
        ? Math.min(56, Math.max(0, rowTop - edge)) : 0;
      banner.style.setProperty('--home-invite-lift', String(lift));
    };
    const observer = new ResizeObserver(update);
    observer.observe(banner.parentElement ?? banner);
    observer.observe(scroll);
    scroll.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
    return () => {
      observer.disconnect();
      scroll.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      banner.style.removeProperty('--home-invite-lift');
    };
  }, [active, storageKey, dismissal, principal, signedOut, context?.permissions.canInviteMembers, context?.memberStatus, context?.lifecycleState]);
  function dismiss() {
    bannerJourney.click('close');
    if (!storageKey) return;
    setDismissal(storageKey);
    try { window.localStorage.setItem(storageKey, '1'); } catch { /* session state still applies */ }
  }
  useEffect(() => {
    function onSent(event: Event) {
      const detail = (event as CustomEvent).detail;
      if (!context || detail?.workspaceId !== context.workspaceId
        || detail?.workspaceMemberId !== context.workspaceMemberId
        || !Number.isInteger(detail?.count) || detail.count <= 0) return;
      if (detail.partial !== true) {
        setSentGeneration(previous => previous + 1);
        setSent(Number.isInteger(detail.totalCount) && detail.totalCount >= detail.count ? detail.totalCount : detail.count);
      }
      if (storageKey) {
        setDismissal(storageKey);
        try { window.localStorage.setItem(storageKey, '1'); } catch { /* best effort */ }
      }
    }
    window.addEventListener(WORKSPACE_INVITES_SENT, onSent);
    return () => window.removeEventListener(WORKSPACE_INVITES_SENT, onSent);
  }, [active, context, storageKey]);
  if (!signedOut && (!context || context.memberStatus !== 'active'
    || context.lifecycleState !== 'active' || !context.permissions.canInviteMembers)) return null;
  const banner = active && storageKey && dismissal !== storageKey ? (
    <div ref={bannerRef} className={styles.banner} data-home-invite-row role="region" aria-label={t('homeInvite.invite')}>
      <span className={styles.copy}>{t('homeInvite.banner')}</span>
      <Button variant="ghost" className={styles.invite} disabled={signInState === 'signing'} onClick={() => { setEntryFrom('home_banner'); bannerJourney.click('invite_teammates'); signedOut ? requestSignIn() : setOpen(true); }}>{t(signInState === 'signing' ? 'settings.amrSigningIn' : 'homeInvite.invite')}</Button>
      <Button variant="ghost" className={styles.close} aria-label={t('homeInvite.dismiss')} onClick={dismiss}><svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="m4.5 4.5 7 7m0-7-7 7" /></svg></Button>
    </div>
  ) : null;
  return (
    <>
      {banner ?? (active ? <div className={styles.bannerSpace} data-home-invite-row data-dismissed={dismissal === storageKey ? "true" : undefined} aria-hidden="true" /> : null)}
      {signedOut && signInState === 'error' ? <p role="alert">{t('settings.amrLoginErrorCompact')}</p> : null}
      {signedOut && signInState === 'signing' ? <div role="status">{signInStatus?.activationUrl ? <a href={signInStatus.activationUrl} target="_blank" rel="noopener noreferrer">{t('settings.amrActivationOpen')}</a> : null}<Button onClick={() => void cancel()}>{t('settings.amrCancelSignIn')}</Button></div> : null}
      {sent ? <Toast key={sentGeneration} className={styles.toast} message={t('homeInvite.sent', { n: sent })} tone="success" placement="top" portalToBody ttlMs={4000} onDismiss={() => setSent(0)} /> : null}
      {open && !signedOut && context ? createPortal(<InviteDialog entryFrom={entryFrom} open={open} onClose={() => setOpen(false)} workspaceContext={context} canAssignRoles={context.role === 'owner'} />, document.body) : null}
    </>
  );
}
