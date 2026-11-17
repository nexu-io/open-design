import { useEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { fetchVelaLoginStatus, type VelaLoginStatus } from '../providers/daemon';
import { useT } from '../i18n';
import { workspaceProjectHeaders } from '../collab/workspace-identity';
import { CenteredLoader } from './Loading';
import { OnboardingInviteView } from './InviteDialog';
import styles from './RegistrationInviteHost.module.css';

export function registrationInviteCompletionKey(status: VelaLoginStatus): string | null {
  const claim = status.registrationInvite;
  if (!status.loggedIn || status.sessionState !== 'authenticated' || !status.credentialRevision
    || !status.user?.id || claim?.accountId !== status.user.id
    || typeof claim.deviceAuthorizationId !== 'string' || !claim.deviceAuthorizationId.trim()
    || claim.deviceAuthorizationId.length > 256) return null;
  return `od.registration-invite.completed:${encodeURIComponent(claim.accountId)}:${encodeURIComponent(claim.deviceAuthorizationId)}`;
}
function sameClaim(a: VelaLoginStatus, b: VelaLoginStatus | null): b is VelaLoginStatus {
  return Boolean(b && registrationInviteCompletionKey(b) === registrationInviteCompletionKey(a)
    && b.profile === a.profile && b.credentialRevision === a.credentialRevision);
}
interface Props {
  status: VelaLoginStatus | null | undefined;
  accountId: string | null;
  configuredProfile: string;
  context: WorkspaceCollabContext | null;
  identityReady: boolean;
  identityUnavailable: boolean;
  onRetryIdentity: () => void;
  allowHost: boolean;
  onExit: (count: number, context: WorkspaceCollabContext, completion: 'sent' | 'skipped') => void;
}
/** Registration eligibility comes exclusively from the AMR-issued claim. Local
 * storage only records completion; it never manufactures registration status. */
export function useRegistrationInvite(props: Props) {
  const { status, accountId, context, identityReady } = props;
  const t = useT();
  const claimKey = status ? registrationInviteCompletionKey(status) : null;
  const claimedAccount = Boolean(claimKey && status?.user?.id === accountId && status.profile === props.configuredProfile && props.allowHost);
  const eligible = Boolean(claimedAccount && identityReady
    && context?.memberStatus === 'active' && context.lifecycleState === 'active' && context.permissions.canInviteMembers);
  const principal = eligible ? JSON.stringify([claimKey, status?.profile, status?.credentialRevision, context?.workspaceId, context?.workspaceMemberId]) : '';
  const latest = useRef({ principal, props }); latest.current = { principal, props };
  const [candidate, setCandidate] = useState<{ principal: string; status: VelaLoginStatus; context: WorkspaceCollabContext } | null>(null);
  const [errorFor, setErrorFor] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [settledFor, setSettledFor] = useState('');
  let alreadyComplete = false;
  try { alreadyComplete = Boolean(claimKey && window.localStorage.getItem(claimKey) === '1'); } catch { /* effect exposes recoverable storage failure */ }
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const finishing = useRef(false);
  const pendingCount = useRef<number | null>(null);
  const pendingCompletion = useRef<'sent' | 'skipped'>('skipped');
  useEffect(() => {
    let disposed = false;
    setCandidate(null); setErrorFor(''); pendingCount.current = null; finishing.current = false;
    if (!principal || !status || !context || !claimKey || alreadyComplete) return;
    void (async () => {
      try {
        const fresh = await fetchVelaLoginStatus({ refresh: true });
        if (disposed || latest.current.principal !== principal) return;
        if (!fresh) throw new Error('Registration status unavailable');
        if (!sameClaim(status, fresh)) { setSettledFor(principal); return; }
        if (window.localStorage.getItem(claimKey) === '1') return;
        // The account status and cached Workspace context resolve independently.
        // Revalidate this exact member under the current selected credential;
        // never borrow a previous account's retained navigation snapshot.
        const response = await fetch('/api/workspace/context', { cache: 'no-store', headers: workspaceProjectHeaders(context) });
        if (!response.ok) throw new Error('Registration workspace unavailable');
        const body = await response.json() as { context?: WorkspaceCollabContext };
        if (disposed || latest.current.principal !== principal) return;
        const verified = body.context;
        if (!verified || verified.workspaceId !== context.workspaceId || verified.workspaceMemberId !== context.workspaceMemberId
          || verified.memberStatus !== 'active' || verified.lifecycleState !== 'active' || !verified.permissions.canInviteMembers) {
          throw new Error('Registration workspace identity mismatch');
        }
        setCandidate({ principal, status: fresh, context: verified });
      } catch { if (!disposed && latest.current.principal === principal) setErrorFor(principal); }
    })();
    return () => { disposed = true; };
  }, [principal, attempt]);
  async function finish(count: number, completion: 'sent' | 'skipped') {
    const captured = candidate;
    if (!mounted.current || !captured || finishing.current || latest.current.principal !== captured.principal) return;
    finishing.current = true; pendingCount.current = count; pendingCompletion.current = completion; setErrorFor('');
    try {
      const fresh = await fetchVelaLoginStatus({ refresh: true });
      if (!mounted.current) return;
      if (!fresh) throw new Error('Registration status unavailable');
      if (latest.current.principal !== captured.principal || !sameClaim(captured.status, fresh)) {
        if (latest.current.principal === captured.principal) { setCandidate(null); setSettledFor(captured.principal); }
        return;
      }
      const key = registrationInviteCompletionKey(fresh)!;
      if (count > 0) window.localStorage.setItem(`od.invitation-banner.dismissed:${encodeURIComponent(fresh.user!.id)}`, '1');
      window.localStorage.setItem(key, '1');
      setCandidate(null);
      latest.current.props.onExit(count, captured.context, completion);
    } catch { if (mounted.current && latest.current.principal === captured.principal) setErrorFor(captured.principal); }
    finally { finishing.current = false; }
  }
  const visible = candidate?.principal === principal && Boolean(principal);
  if (claimedAccount && !alreadyComplete && props.identityUnavailable) return <div className={styles.recovery} role="alert"><p>{t('invite.error.generic')}</p><Button onClick={props.onRetryIdentity}>{t('invite.error.retry')}</Button></div>;
  if (claimedAccount && !alreadyComplete && (!identityReady || !context)) return <div className={styles.loading}><CenteredLoader label={t('entry.loadingWorkspace')} /></div>;
  if (principal && !alreadyComplete && !visible && errorFor !== principal && settledFor !== principal) return <div className={styles.loading}><CenteredLoader label={t('entry.loadingWorkspace')} /></div>;
  if (!visible && (!principal || errorFor !== principal)) return null;
  return <>
    {visible ? <OnboardingInviteView key={principal} workspaceContext={candidate.context} onFinish={(count, completion) => void finish(count, completion)} /> : null}
    {principal && errorFor === principal ? <div className={styles.recovery} role="alert"><p>{t('invite.error.generic')}</p><Button onClick={() => pendingCount.current === null ? setAttempt(n => n + 1) : void finish(pendingCount.current, pendingCompletion.current)}>{t('invite.error.retry')}</Button></div> : null}
  </>;
}
