import type { WorkspaceInviteEntry } from '@open-design/contracts/analytics';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { type WorkspaceCollabContext, type WorkspaceInviteRole } from '@open-design/contracts';
import { Button } from '@open-design/components';
import { useI18n, LOCALES, LOCALE_LABEL, type Locale } from '../i18n';
import { workspaceInviteErrorMessageKey } from '../collab/invite-error-copy';
import { workspaceProjectHeaders } from '../collab/workspace-identity';
import { useAnalytics } from '../analytics/provider';
import { trackWorkspaceInviteClick, trackWorkspaceInviteResult, trackWorkspaceSurfaceView, trackWorkspaceInvitePageView } from '../analytics/events';
import { countBucket, stableAnalyticsErrorCode, workspaceAnalyticsDimensions } from '../analytics/workspace';
import styles from './InviteDialog.module.css';

export interface InviteRow { email: string; role: string }
interface Row extends InviteRow { idempotencyKey: string; error?: string | undefined; validated?: boolean }
interface Props {
  variant?: 'dialog' | 'onboarding';
  onFinish?: (sentCount: number, completion: 'sent' | 'skipped') => void;
  open: boolean;
  onClose: () => void;
  workspaceContext: WorkspaceCollabContext | null;
  /** Legacy callers may still pass these; invitations no longer consume seats. */
  freePlan?: boolean;
  availableSeats?: number;
  onUpgrade?: () => void;
  onSubmit?: (rows: InviteRow[]) => void;
  canAssignRoles?: boolean;
  entryFrom?: WorkspaceInviteEntry;
}
const emptyRow = (): Row => ({ email: '', role: 'member', idempotencyKey: crypto.randomUUID() });
const validEmail = (value: string) => {
  const input = document.createElement('input');
  input.type = 'email';
  input.required = true;
  input.value = value.trim();
  return input.validity.valid;
};
const canonicalRole = (role: string): WorkspaceInviteRole => role === 'admin' || role === '管理员' ? 'admin' : 'member';

/** Keep translated sentences together while allowing a long sentence to wrap naturally. */
function onboardingSentences(text: string, locale: Locale) {
  const sentences = new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(text);
  return Array.from(sentences, ({ segment }, index) => (
    <span className={styles.sentence} dir="auto" key={index}>{segment}</span>
  ));
}

/** The local form retains authoritative per-row results and never retries sent recipients. */
export function InviteDialog({ open, onClose, workspaceContext, onSubmit, canAssignRoles = true, entryFrom: requestedEntry = 'workspace_switcher', variant = 'dialog', onFinish }: Props) {
  const onboarding = variant === 'onboarding';
  const entryFrom = onboarding ? 'onboarding' : requestedEntry;
  const area = onboarding ? 'onboarding_invite_step' : 'workspace_invite_dialog';
  const exposure = useRef<{ key: string; id: string } | null>(null);
  const surfaceId = useRef('');
  const { t, locale, setLocale } = useI18n();
  const analytics = useAnalytics();
  const page = onboarding ? 'onboarding' : entryFrom === 'all_projects' ? 'all_projects' : 'home';
  const dimensions = workspaceAnalyticsDimensions(workspaceContext);
  const owner = workspaceContext?.role === 'owner' && canAssignRoles;
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [partialCount, setPartialCount] = useState<{ sent: number; failed: number } | null>(null);
  const [batchSuccess, setBatchSuccess] = useState<number | null>(null);
  const [readyToEnter, setReadyToEnter] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [leaving, setLeaving] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionSent = useRef(false);
  const finishCallback = useRef(onFinish);
  finishCallback.current = onFinish;
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openRoleIndex, setOpenRoleIndex] = useState<number | null>(null);
  const [menuKeyboardFocus, setMenuKeyboardFocus] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpPosition, setHelpPosition] = useState<CSSProperties>({});
  const helpTrigger = useRef<HTMLButtonElement>(null);
  const helpPanel = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!helpOpen) return;
    const place = () => {
      const trigger = helpTrigger.current?.getBoundingClientRect();
      const panel = helpPanel.current;
      if (!trigger || !panel) return;
      const center = trigger.left + trigger.width / 2;
      const bounds = panel.getBoundingClientRect();
      const left = Math.max(12, Math.min(center - bounds.width / 2, window.innerWidth - bounds.width - 12));
      const above = trigger.top - bounds.height - 10;
      setHelpPosition({ left, top: Math.max(8, above), '--tooltip-arrow-left': `${center - left}px` } as CSSProperties);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [helpOpen]);
  const [highlightedRole, setHighlightedRole] = useState<'member' | 'admin'>('member');
  const [menuPos, setMenuPos] = useState<CSSProperties>({});
  const triggers = useRef<Array<HTMLButtonElement | null>>([]);
  const menu = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const focusAddedRow = useRef(false);
  const requestVersion = useRef(0);
  const submittingRef = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const id = useId();
  const identity = `${workspaceContext?.workspaceId}:${workspaceContext?.workspaceMemberId}`;

  useEffect(() => {
    requestVersion.current += 1;
    submittingRef.current = false;
    if (finishTimer.current) clearTimeout(finishTimer.current);
    finishTimer.current = null;
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = null; setLeaving(false);
    setBatchSuccess(null); setPartialCount(null); setReadyToEnter(false); completionSent.current = false;
    controller.current?.abort();
    setHelpOpen(false);
    setRows([emptyRow()]); setError(null); setSentCount(0); setSubmitting(false); setOpenRoleIndex(null);
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    if (!onboarding) dialog.current?.querySelector<HTMLHeadingElement>('h2')?.focus();
    return () => { if (exitTimer.current) clearTimeout(exitTimer.current); if (finishTimer.current) clearTimeout(finishTimer.current); requestVersion.current += 1; controller.current?.abort(); previous?.focus(); };
  }, [open, identity, onboarding]);
  useEffect(() => {
    if (!open) { exposure.current = null; return; }
    const key = `${identity}:${entryFrom}`;
    if (exposure.current?.key === key) return;
    surfaceId.current = crypto.randomUUID();
    exposure.current = { key, id: surfaceId.current };
    if (onboarding) trackWorkspaceInvitePageView(analytics.track, { page_name: 'onboarding', area: 'onboarding_invite_step', step_name: 'invite_teammates', entry_from: 'onboarding', invite_surface_id: surfaceId.current, ...dimensions });
    else trackWorkspaceSurfaceView(analytics.track, { page_name: page === 'onboarding' ? 'home' : page, area: 'workspace_invite_dialog', entry_from: entryFrom, invite_surface_id: surfaceId.current, ...dimensions });
  }, [open, analytics.track, page, entryFrom, identity, onboarding, dimensions.workspace_key]);
  useEffect(() => {
    if (!owner) { setRows(previous => previous.map(row => ({ ...row, role: 'member' }))); setOpenRoleIndex(null); }
  }, [owner]);
  useLayoutEffect(() => {
    if (openRoleIndex === null) return;
    const position = () => {
      const rect = triggers.current[openRoleIndex]?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(onboarding ? 360 : 300, window.innerWidth - 24);
      const height = menu.current?.offsetHeight || 140;
      setMenuPos({ width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: rect.bottom + (onboarding ? 8 : 6) + height > window.innerHeight - 12 ? Math.max(12, rect.top - height - (onboarding ? 8 : 6)) : rect.bottom + (onboarding ? 8 : 6) });
    };
    position();
    const outside = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node) && !triggers.current[openRoleIndex]?.contains(event.target as Node)) setOpenRoleIndex(null);
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position);
    const trigger = triggers.current[openRoleIndex];
    if (trigger) observer?.observe(trigger);
    if (dialog.current) observer?.observe(dialog.current);
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true); window.addEventListener('mousedown', outside);
    return () => { observer?.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); window.removeEventListener('mousedown', outside); };
  }, [openRoleIndex, onboarding]);
  useEffect(() => {
    if (!open || !onboarding || !readyToEnter) return;
    setCountdown(3);
    dialog.current?.querySelector<HTMLHeadingElement>('h2')?.focus();
    const timers = [
      setTimeout(() => setCountdown(2), 1000),
      setTimeout(() => setCountdown(1), 2000),
      setTimeout(() => {
        enterWorkbench();
      }, 3000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [open, onboarding, readyToEnter, sentCount]);
  useLayoutEffect(() => {
    if (!open || !focusAddedRow.current) return;
    focusAddedRow.current = false;
    const input = dialog.current?.querySelectorAll<HTMLInputElement>('input[type="email"]')[rows.length - 1];
    input?.focus({ preventScroll: true });
    input?.closest('[data-invite-row]')?.scrollIntoView?.({ block: 'nearest' });
  }, [open, rows.length]);
  if (!open) return null;

  function enterWorkbench() {
    if (completionSent.current) return;
    completionSent.current = true;
    const version = requestVersion.current;
    const finish = () => {
      exitTimer.current = null;
      if (version === requestVersion.current) finishCallback.current?.(sentCount, 'sent');
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    setLeaving(true);
    exitTimer.current = setTimeout(finish, 180);
  }

  function rowErrors(values: Row[], includeServerErrors = true) {
    const seen = new Set<string>();
    return values.map(row => {
      const email = row.email.trim().toLowerCase();
      const message = !validEmail(email) ? t('workspaceInvite.errorInvalidEmail') : seen.has(email) ? t('workspaceInvite.errorDuplicateEmail') : includeServerErrors ? row.error : undefined;
      seen.add(email);
      return message;
    });
  }
  const errors = rowErrors(rows);
  function updateRow(index: number, patch: Partial<Row>) {
    setRows(previous => previous.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, ...patch, error: undefined };
      const changed = next.email.trim().toLowerCase() !== row.email.trim().toLowerCase() || canonicalRole(next.role) !== canonicalRole(row.role);
      return { ...next, idempotencyKey: changed ? crypto.randomUUID() : row.idempotencyKey };
    }));
    setError(null);
  }
  function click(element: 'skip_invite' | 'submit' | 'close' | 'add_recipient_row' | 'remove_recipient_row' | 'role_select') {
    trackWorkspaceInviteClick(analytics.track, { page_name: page, area, invite_surface_id: surfaceId.current, element, entry_from: entryFrom, ...dimensions });
  }
  function close() { if (!onboarding) { click('close'); requestVersion.current += 1; controller.current?.abort(); onClose(); } }
  async function submit() {
    setRows(previous => previous.map(row => ({ ...row, validated: true })));
    if (submittingRef.current || rowErrors(rows, false).some(Boolean)) return;
    if (!workspaceContext || workspaceContext.memberStatus !== 'active') { setError(t('workspaceInvite.submitFailed')); return; }
    submittingRef.current = true;
    const requestContext = workspaceContext;
    const version = ++requestVersion.current;
    const requested = rows.map(row => ({ email: row.email.trim(), role: owner ? canonicalRole(row.role) : 'member' as const, idempotencyKey: row.idempotencyKey }));
    const requestId = analytics.newRequestId();
    const startedAt = performance.now();
    let reported = false;
    const batchId = crypto.randomUUID();
    const result = (succeeded: number, failed: number, code?: string, unknown = 0) => {
      reported = true;
      return trackWorkspaceInviteResult(analytics.track, {
      page_name: page, area, invite_surface_id: surfaceId.current, entry_from: entryFrom,
      invite_batch_id: batchId,
      unknown_count: unknown,
      result: unknown > 0 ? 'unknown' : succeeded === requested.length ? 'success' : succeeded > 0 ? 'partial_success' : 'failed',
      requested_count: requested.length, succeeded_count: succeeded, failed_count: failed,
      duration_ms: Math.round(performance.now() - startedAt), ...(code ? { error_code: code } : {}), ...dimensions,
    }, { requestId });
    };
    trackWorkspaceInviteClick(analytics.track, { page_name: page, area, invite_surface_id: surfaceId.current, element: 'submit',
      entry_from: entryFrom, invite_batch_id: batchId, invite_count_bucket: countBucket(requested.length), ...dimensions }, { requestId });
    setSubmitting(true); setError(null); setPartialCount(null); setOpenRoleIndex(null);
    const abort = new AbortController(); controller.current = abort;
    let networkFailure = false;
    try {
      const response = await fetch('/api/workspace/invite', { method: 'POST', signal: abort.signal,
        headers: { 'content-type': 'application/json', ...workspaceProjectHeaders(requestContext) }, body: JSON.stringify({ invites: requested }) });
      if (version !== requestVersion.current) return;
      if (!response.ok) { networkFailure = response.status >= 500; result(0, networkFailure ? 0 : requested.length, stableAnalyticsErrorCode(response.status), networkFailure ? requested.length : 0); throw new Error('request_failed'); }
      const body = await response.json() as { results?: Array<{ email?: string; ok?: boolean; error?: string | undefined }> };
      if (version !== requestVersion.current) return;
      const results = body.results;
      const succeeded: InviteRow[] = []; const failed: Row[] = [];
      let onlyRowConflicts = true;
      let transportFailures = 0;
      requested.forEach((row, index) => {
        const match = results?.find(item => item.email?.trim().toLowerCase() === row.email.toLowerCase())
          ?? (results?.length === requested.length && results[index]?.email === undefined ? results[index] : undefined);
        if (match?.ok === true) succeeded.push(row);
        else {
          if (!match || match.error === 'create_unreachable') transportFailures += 1;
          const key = workspaceInviteErrorMessageKey(match?.error, onboarding);
          if (!['workspaceInvite.onboardingErrorAlreadyMember', 'workspaceInvite.onboardingErrorPendingInvite', 'workspaceInvite.errorAlreadyMember', 'workspaceInvite.errorPendingInvite', 'workspaceInvite.seatsExhaustedBody'].includes(key)) onlyRowConflicts = false;
          failed.push({ ...row, error: !onboarding && key === 'workspaceInvite.submitFailed' ? undefined : t(key) });
        }
      });
      result(succeeded.length, failed.length - transportFailures, failed.length ? transportFailures ? 'network_error' : 'invite_rejected' : undefined, transportFailures);
      if (!onboarding && transportFailures === requested.length) {
        setRows(rows.map(row => ({ ...row, error: undefined }))); setError(t('workspaceInvite.submitFailedPreserved')); return;
      }
      if (succeeded.length) {
        setSentCount(previous => previous + succeeded.length);
        if (!onboarding) window.dispatchEvent(new CustomEvent('od:workspace-invites-sent', { detail: {
          count: succeeded.length, totalCount: sentCount + succeeded.length, ...(failed.length ? { partial: true } : {}), workspaceId: requestContext.workspaceId, workspaceMemberId: requestContext.workspaceMemberId,
        } }));
      }
      if (onboarding && succeeded.length) {
        setBatchSuccess(failed.length ? succeeded.length : 0);
        if (!failed.length) {
          setReadyToEnter(true);
        } else {
          finishTimer.current = setTimeout(() => {
            if (version !== requestVersion.current) return;
            finishTimer.current = null; submittingRef.current = false; setBatchSuccess(null); setSubmitting(false);
          }, 650);
        }
      }
      if (!failed.length) {
        if (!onboarding) { setSubmitting(false); onSubmit?.(succeeded); onClose(); }
        return;
      }
      setRows(failed);
      if (onboarding && succeeded.length) setPartialCount({ sent: sentCount + succeeded.length, failed: failed.length });
      setError(onboarding ? succeeded.length || onlyRowConflicts ? null : t('workspaceInvite.submitFailedPreserved') : succeeded.length ? t('workspaceInvite.partialSummary').replace('{sent}', String(succeeded.length)).replace('{failed}', String(failed.length)) : onlyRowConflicts ? null : t('workspaceInvite.submitFailedPreserved'));
    } catch (caught) {
      if (version !== requestVersion.current) return;
      if (!reported) result(0, 0, caught instanceof TypeError ? 'network_error' : 'invalid_response', requested.length);
      if (!onboarding && (networkFailure || caught instanceof TypeError)) {
        setRows(rows.map(row => ({ ...row, error: undefined }))); setError(t('workspaceInvite.submitFailedPreserved'));
      } else setError(t('workspaceInvite.submitFailedPreserved'));
    } finally { if (version === requestVersion.current && !finishTimer.current) { submittingRef.current = false; setSubmitting(false); } }
  }

  const roleText = (role: string) => t(role === 'admin' ? 'invite.role.admin' : 'invite.role.member');
  return <div className={`${styles.root} ${onboarding ? styles.onboarding : ''}`} role={onboarding ? 'region' : 'dialog'} aria-modal={onboarding ? undefined : true} aria-label={t('workspaceInvite.dialogAria')} ref={dialog}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); if (openRoleIndex !== null) setOpenRoleIndex(null); else close(); }
      if (event.key === 'Tab') {
        const focusable = dialog.current?.querySelectorAll<HTMLElement>(':is(button,input,select):not([disabled])');
        const first = focusable?.[0]; const last = focusable?.[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current?.querySelector('h2'))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    {!onboarding ? <div className={styles.backdrop} onClick={close} /> : null}
    <section className={styles.panel} aria-busy={submitting}>
      {readyToEnter ? <div className={`${styles.complete} ${leaving ? styles.leaving : ''}`}>
        <span className={styles.completeIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <h2 tabIndex={-1}>{t('workspaceInvite.completeTitle')}</h2>
        <p>{t('workspaceInvite.completeReceipt').replace('{count}', String(sentCount))}<br />{t('workspaceInvite.completeBody')}</p>
        <Button className={styles.completeEnter} aria-describedby={`${id}-countdown`} onClick={enterWorkbench}>{t('workspaceInvite.enterWorkspace')}</Button>
        <p className={styles.countdown} id={`${id}-countdown`}>{t('workspaceInvite.completeCountdown').split('{seconds}')[0]}<span>{countdown}</span>{t('workspaceInvite.completeCountdown').split('{seconds}')[1]}</p>
      </div> : <><header className={styles.heading}><h2 tabIndex={onboarding ? undefined : -1}>{onboarding ? onboardingSentences(t('workspaceInvite.onboardingTitle'), locale) : t('workspaceInvite.title')}</h2>
        {!onboarding ? <>
        <span className={styles.help} onMouseEnter={() => setHelpOpen(true)} onMouseLeave={() => setHelpOpen(false)}>
          <Button ref={helpTrigger} className={styles.info} aria-label={t('workspaceInvite.helpLabel')} aria-describedby={helpOpen ? `${id}-help` : undefined}
            onFocus={() => setHelpOpen(true)} onBlur={() => setHelpOpen(false)} onClick={() => setHelpOpen(true)}><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><circle cx="10" cy="10" r="7.5" /><path d="M10 9v5" strokeLinecap="round" /><circle cx="10" cy="6.2" r=".7" fill="currentColor" stroke="none" /></svg></Button>
          {helpOpen ? createPortal(<span ref={helpPanel} className={styles.tooltip} style={helpPosition} id={`${id}-help`} role="tooltip">{t('workspaceInvite.teamPlanBody')}</span>, document.body) : null}
        </span>
        <Button className={styles.close} onClick={close} aria-label={t('workspaceInvite.cancel')}>✕</Button>
        </> : null}
      </header>
      {onboarding ? <p className={styles.context} dir="auto">{t('workspaceInvite.onboardingBody1')}{' '}{t('workspaceInvite.onboardingBody2')}</p> : <p className={styles.context}>{workspaceContext?.workspaceName ?? workspaceContext?.teamName ?? ''}{workspaceContext?.memberCount === undefined ? null : <> · {t('workspaceInvite.memberCount').replace('{count}', String(workspaceContext.memberCount))}</>}</p>}
      <form onSubmit={event => { event.preventDefault(); void submit(); }} noValidate>
        <div className={`${styles.labels} ${rows.length === 1 ? styles.single : ''}`}><span>{t(onboarding ? 'workspaceInvite.onboardingEmailLabel' : 'workspaceInvite.emailLabel')}</span><span>{t('workspaceInvite.roleLabel')}</span></div>
        <div className={styles.rows} data-invite-rows>
          {rows.map((row, index) => <div className={`${styles.row} ${rows.length === 1 ? styles.single : ''}`} key={index} data-invite-row>
            <input type="email" className={styles.input} value={row.email} placeholder={t(onboarding ? 'workspaceInvite.onboardingEmailPlaceholder' : 'workspaceInvite.emailPlaceholder')} aria-label={t('workspaceInvite.emailLabel')}
              disabled={submitting} aria-invalid={!!(row.validated || row.error) && !!errors[index]} aria-describedby={!!(row.validated || row.error) && errors[index] ? `${id}-error-${index}` : undefined}
              onChange={event => updateRow(index, { email: event.target.value })} />
            {owner ? <Button ref={element => { triggers.current[index] = element; }} className={styles.role} disabled={submitting}
              aria-label={t('workspaceInvite.roleLabel')} data-menu-keyboard={!onboarding && openRoleIndex === index && menuKeyboardFocus ? true : undefined} aria-haspopup="listbox" aria-expanded={openRoleIndex === index} aria-controls={`${id}-roles`}
              onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setMenuKeyboardFocus(true); setOpenRoleIndex(index); requestAnimationFrame(() => { const options = menu.current?.querySelectorAll<HTMLButtonElement>('button'); (event.key === 'ArrowUp' ? options?.[options.length - 1] : options?.[0])?.focus(); }); } }}
              onClick={event => { setMenuKeyboardFocus(event.currentTarget.matches(':focus-visible')); setHighlightedRole(row.role === 'admin' ? 'admin' : 'member'); click('role_select'); setOpenRoleIndex(current => current === index ? null : index); }}>
              {roleText(row.role)}{onboarding ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.9999 13.1714L16.9497 8.22168L18.3639 9.63589L11.9999 15.9999L5.63599 9.63589L7.0502 8.22168L11.9999 13.1714Z" /></svg> : <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>}</Button> : <span className={styles.fixedRole}>{roleText('member')}</span>}
            {rows.length > 1 ? <Button className={styles.remove} aria-label={t('workspaceInvite.removeRow')} disabled={submitting}
              onClick={() => { click('remove_recipient_row'); setRows(previous => previous.filter((_, i) => i !== index)); setOpenRoleIndex(null); }}>{'×'}</Button> : null}
            {!!(row.validated || row.error) && errors[index] ? <p className={styles.lineError} id={`${id}-error-${index}`} role="alert">{errors[index]}</p> : null}
          </div>)}
        </div>
        <Button className={styles.add} disabled={submitting} onClick={() => { click('add_recipient_row'); focusAddedRow.current = true; setRows(previous => [...previous, emptyRow()]); }}>{onboarding ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z" /></svg>{t('workspaceInvite.addMember')}</> : locale === 'en' ? t('workspaceInvite.addMember') : `＋ ${t('workspaceInvite.addMember')}`}</Button>
        {!onboarding && error ? <p className={styles.error} role="alert">{error}</p> : null}
        {onboarding && partialCount !== null ? <p className={styles.summary} role="alert">{t('workspaceInvite.onboardingPartialSummary').replace('{count}', String(partialCount.sent)).replace('{failed}', String(partialCount.failed))}</p> : null}
        {onboarding && error ? <p className={styles.error} role="alert">{error}</p> : null}
        {!onboarding && sentCount > 0 && !error ? <p className={styles.error} role="status">{t('workspaceInvite.sentCount').replace('{count}', String(sentCount))}</p> : null}
        <footer className={styles.footer}>{!onboarding ? <Button className={styles.cancel} onClick={close} disabled={submitting}>{t('workspaceInvite.cancel')}</Button> : null}
          <Button type="submit" className={styles.submit} disabled={submitting}>{batchSuccess !== null ? batchSuccess === 0 ? t('workspaceInvite.sent') : t('workspaceInvite.batchSent').replace('{count}', String(batchSuccess)) : submitting ? t('workspaceInvite.sending') : t('workspaceInvite.confirm')}</Button></footer>
      </form></>}
      {onboarding ? <>{!readyToEnter ? <Button className={styles.skip} disabled={submitting} onClick={() => { click('skip_invite'); onFinish?.(sentCount, 'skipped'); }}>{t('workspaceInvite.skip')}</Button> : null}<footer className={styles.onboardingFooter}><label className={styles.languagePicker}><select aria-label={LOCALE_LABEL[locale]} value={locale} onChange={event => setLocale(event.target.value as Locale)}>{LOCALES.map(code => <option key={code} value={code}>{LOCALE_LABEL[code]}</option>)}</select></label><span>{`© ${new Date().getFullYear()} OpenDesign · ${t('settings.onboardingCloudRights')}`}</span></footer></> : null}
    </section>
    {onboarding ? <div className={styles.art} aria-hidden="true"><img src="/onboarding/registration-invite-art.webp" alt="" /></div> : null}
    {owner && openRoleIndex !== null ? createPortal(<div className={`${styles.menu} ${onboarding ? styles.onboardingMenu : styles.dialogMenu}`} ref={menu} style={menuPos} role="listbox" id={`${id}-roles`}
      onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); setOpenRoleIndex(null); triggers.current[openRoleIndex]?.focus(); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const buttons = Array.from(menu.current?.querySelectorAll('button') ?? []); const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus(); }
      }}>
      {(['member', 'admin'] as const).map(role => <Button key={role} role="option" aria-selected={rows[openRoleIndex]?.role === role} data-highlighted={highlightedRole === role} onPointerMove={() => setHighlightedRole(role)} onFocus={event => { setHighlightedRole(role); setMenuKeyboardFocus(event.currentTarget.matches(':focus-visible')); }} className={styles.option}
        onClick={() => { updateRow(openRoleIndex, { role }); setOpenRoleIndex(null); triggers.current[openRoleIndex]?.focus(); }}>
        <span>{onboarding ? <strong>{roleText(role)}</strong> : roleText(role)}<small>{t(role === 'admin' ? 'workspaceInvite.adminDescription' : 'workspaceInvite.memberDescription')}</small></span>{onboarding ? (rows[openRoleIndex]?.role === role ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.2 6.2 11.2 13 4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg> : null) : <span aria-hidden="true" className={styles.check}>{rows[openRoleIndex]?.role === role ? '✓' : ''}</span>}
      </Button>)}
    </div>, document.body) : null}
  </div>;
}

/** Host chooses the first-registration trigger and publishes success only after exit. */
export function OnboardingInviteView({ workspaceContext, onFinish }: { workspaceContext: WorkspaceCollabContext | null; onFinish: (sentCount: number, completion: 'sent' | 'skipped') => void }) {
  return <InviteDialog variant="onboarding" open onClose={() => {}} workspaceContext={workspaceContext} onFinish={onFinish} />;
}
