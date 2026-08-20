// Reusable "invite teammates" dialog for the team workspace.
//
// Opened from the team dropdown in the left rail. Ported VERBATIM (markup +
// classes) from the design demo (origin/demo/workspace-team-features) — the
// Canva-style two-column layout: form on the left, decorative avatar-cluster art
// on the right. The ONLY difference from the demo is the submit: instead of the
// demo's no-backend `onSubmit` stub, "确认并邀请" POSTs the collected
// { email, role } rows to the real daemon endpoint (`POST /api/workspace/invite`),
// which creates each invite on B with the signed-in vela session. On success the
// dialog shows a brief success state and closes; on failure it surfaces an inline
// error and stays open. The UI never blocks on the backend being present.

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  normalizeWorkspaceInviteCreateErrorCode,
  type WorkspaceCollabContext,
  type WorkspaceInviteRole,
} from '@open-design/contracts';
import { Button } from '@open-design/components';
import { Icon } from './Icon';
import { useI18n } from '../i18n';
import { workspaceInviteErrorMessageKey } from '../collab/invite-error-copy';
import { workspaceProjectHeaders } from '../collab/workspace-identity';
import { useAnalytics } from '../analytics/provider';
import {
  trackWorkspaceInviteClick,
  trackWorkspaceInviteResult,
  trackWorkspaceSurfaceView,
} from '../analytics/events';
import {
  countBucket,
  stableAnalyticsErrorCode,
  workspaceAnalyticsDimensions,
} from '../analytics/workspace';

const ROLE_OPTIONS = ['admin', 'member'] as const;

// Vertical gap between the role trigger and its menu (was the CSS
// `top: calc(100% + var(--spacing-6))` before the menu moved to a portal).
const ROLE_MENU_GAP = 6;

function roleLabel(role: string, t: ReturnType<typeof useI18n>['t']) {
  return role === 'admin' ? t('invite.role.admin') : t('invite.role.member');
}

export interface InviteRow {
  email: string;
  role: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Identity the host already resolved for this invite mutation. */
  workspaceContext: WorkspaceCollabContext | null;
  /** Shows "你的团队有 1人" for single-seat plans (vs the team default). */
  freePlan?: boolean;
  /**
   * Seats the workspace can still fill. The daemon already computes this
   * (`seatSummary.availableSeats`); until this dialog consumed it, a workspace
   * with zero seats let the user type addresses, press 确认并邀请, and get a
   * per-row failure back from B — the plan limit surfaced as a send error
   * rather than as the reason they cannot invite yet (#115).
   *
   * `undefined` means "seat state unknown" and stays permissive, so a context
   * that has not loaded yet never blocks a workspace that does have seats.
   */
  availableSeats?: number;
  /** Opens B's plan-change flow. Rendered only when seats run out. */
  onUpgrade?: () => void;
  /** Called with the entered rows when "确认并邀请" is pressed. The host
   *  decides whether to send invites directly or route through upgrade. */
  onSubmit?: (rows: InviteRow[]) => void;
  /** Owner / Admin can choose roles; Member invites with the default role. */
  canAssignRoles?: boolean;
  /** The entry point that opened the dialog, used for the invite funnel. */
  entryFrom?: 'workspace_switcher' | 'all_projects';
}

// Default invited role, aligned to the PRD matrix (admin/member are assignable;
// owner is the workspace creator only and never assignable).
const DEFAULT_ROLE = 'member';

// Map the dialog role value to the canonical assignable role B expects
// (never 'owner'). Legacy Chinese labels are accepted for existing state.
function toCanonicalRole(role: string): WorkspaceInviteRole {
  return role === 'admin' || role === '管理员' ? 'admin' : 'member';
}

export function InviteDialog({
  open,
  onClose,
  workspaceContext,
  freePlan = false,
  availableSeats,
  onUpgrade,
  onSubmit,
  canAssignRoles = true,
  entryFrom = 'workspace_switcher',
}: Props) {
  const { t } = useI18n();
  const analytics = useAnalytics();
  const analyticsPage = entryFrom === 'all_projects' ? 'all_projects' : 'home';
  const workspaceDimensions = workspaceAnalyticsDimensions(workspaceContext);
  const [rows, setRows] = useState<InviteRow[]>([{ email: '', role: DEFAULT_ROLE }]);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openRoleIndex, setOpenRoleIndex] = useState<number | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const roleTriggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const roleMenuRef = useRef<HTMLDivElement | null>(null);
  const autoCloseTimerRef = useRef<number | null>(null);
  const [roleMenuPos, setRoleMenuPos] = useState<CSSProperties | null>(null);
  const roleListboxId = useId();

  useEffect(() => {
    if (!open || canAssignRoles) return;
    setRows((prev) => prev.map((row) => ({ ...row, role: DEFAULT_ROLE })));
  }, [canAssignRoles, open]);

  // The rows list is a scroll container (`overflow-y: auto`), which clips any
  // in-flow descendant to its box — a dropdown rendered inside it can never
  // extend past the row. The role menu therefore lives in a portal on <body>,
  // anchored to its trigger's viewport rect; re-anchor on resize and on any
  // scroll (capture phase covers the rows container itself). Same pattern as
  // ComposerModePicker.
  useLayoutEffect(() => {
    if (openRoleIndex === null) {
      setRoleMenuPos(null);
      return;
    }
    const update = () => {
      const rect = roleTriggerRefs.current[openRoleIndex]?.getBoundingClientRect();
      if (!rect) return;
      setRoleMenuPos({ left: rect.left, top: rect.bottom + ROLE_MENU_GAP, width: rect.width });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [openRoleIndex]);

  useEffect(() => {
    if (openRoleIndex === null) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      // The menu is portaled outside the rows container, so it must count as
      // "inside" here — otherwise this dismisser unmounts an option on
      // mousedown before its click can land.
      if (rowsRef.current?.contains(target)) return;
      if (roleMenuRef.current?.contains(target)) return;
      setOpenRoleIndex(null);
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [openRoleIndex]);

  useEffect(() => {
    if (!open) setOpenRoleIndex(null);
  }, [open]);

  useEffect(() => () => {
    if (autoCloseTimerRef.current === null) return;
    window.clearTimeout(autoCloseTimerRef.current);
    autoCloseTimerRef.current = null;
  }, [open]);

  // Reset the submit lifecycle each time the dialog opens so a prior error /
  // success never lingers on the next invite.
  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
    setSuccess(false);
    setError(null);
    trackWorkspaceSurfaceView(analytics.track, {
      page_name: analyticsPage,
      area: 'workspace_invite_dialog',
      entry_from: entryFrom,
      ...workspaceDimensions,
    });
  }, [open, analytics.track, analyticsPage, entryFrom, workspaceDimensions.workspace_key]);

  if (!open) return null;

  function updateRow(index: number, patch: Partial<InviteRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function addRow() {
    trackWorkspaceInviteClick(analytics.track, {
      page_name: analyticsPage,
      area: 'workspace_invite_dialog',
      element: 'add_recipient_row',
      entry_from: entryFrom,
      ...workspaceDimensions,
    });
    setRows((prev) => [...prev, { email: '', role: DEFAULT_ROLE }]);
  }
  function removeRow(index: number) {
    trackWorkspaceInviteClick(analytics.track, {
      page_name: analyticsPage,
      area: 'workspace_invite_dialog',
      element: 'remove_recipient_row',
      entry_from: entryFrom,
      ...workspaceDimensions,
    });
    setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  function closeDialog() {
    trackWorkspaceInviteClick(analytics.track, {
      page_name: analyticsPage,
      area: 'workspace_invite_dialog',
      element: 'close',
      entry_from: entryFrom,
      ...workspaceDimensions,
    });
    onClose();
  }

  // Demo-grade email shape check (something@something.tld) — keeps obvious
  // non-emails from enabling submit; both the button state and the rows
  // passed to onSubmit use the same predicate.
  const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  const hasValidEmail = rows.some((r) => isEmail(r.email));

  function inviteErrorMessage(code: string | undefined): string {
    return t(workspaceInviteErrorMessageKey(code));
  }

  // Seats are the gate B enforces anyway; checking here turns a post-send row
  // failure into an up-front reason the user can act on. Unknown (undefined)
  // stays permissive — see the prop docs.
  const seatsExhausted = availableSeats !== undefined && availableSeats <= 0;

  async function handleConfirm() {
    const valid = rows.filter((r) => isEmail(r.email));
    if (valid.length === 0 || submitting || success || seatsExhausted) return;
    if (!workspaceContext) {
      setError(t('workspaceInvite.submitFailed'));
      return;
    }
    const requestContext = workspaceContext;
    const startedAt = performance.now();
    const requestId = analytics.newRequestId();
    trackWorkspaceInviteClick(analytics.track, {
      page_name: analyticsPage,
      area: 'workspace_invite_dialog',
      element: 'submit',
      entry_from: entryFrom,
      invite_count_bucket: countBucket(valid.length),
      ...workspaceDimensions,
    }, { requestId });
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/workspace/invite', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...workspaceProjectHeaders(requestContext),
        },
        body: JSON.stringify({
          invites: valid.map((r) => ({ email: r.email.trim(), role: toCanonicalRole(r.role) })),
        }),
      });
      if (!res.ok) {
        trackWorkspaceInviteResult(analytics.track, {
          page_name: analyticsPage,
          area: 'workspace_invite_dialog',
          entry_from: entryFrom,
          result: 'failed',
          requested_count: valid.length,
          succeeded_count: 0,
          failed_count: valid.length,
          duration_ms: Math.round(performance.now() - startedAt),
          error_code: stableAnalyticsErrorCode(res.status),
          ...workspaceDimensions,
        }, { requestId });
        throw new Error('request_failed');
      }
      const body = (await res.json().catch(() => null)) as
        | { results?: Array<{ ok?: boolean; error?: string }> }
        | null;
      const results = body?.results ?? [];
      // Any failed row means the invite batch needs user attention; keep the
      // dialog open with a reason-specific message instead of a misleading
      // success state or a blanket "retry later".
      const failed = results.find((r) => r.ok === false);
      if (failed) {
        const failedCount = results.filter((r) => r.ok === false).length;
        const succeededCount = Math.max(valid.length - failedCount, 0);
        trackWorkspaceInviteResult(analytics.track, {
          page_name: analyticsPage,
          area: 'workspace_invite_dialog',
          entry_from: entryFrom,
          result: succeededCount > 0 ? 'partial_success' : 'failed',
          requested_count: valid.length,
          succeeded_count: succeededCount,
          failed_count: failedCount,
          duration_ms: Math.round(performance.now() - startedAt),
          error_code: normalizeWorkspaceInviteCreateErrorCode(failed.error) ?? 'invite_rejected',
          ...workspaceDimensions,
        }, { requestId });
        setError(inviteErrorMessage(failed.error));
        setSubmitting(false);
        return;
      }
      trackWorkspaceInviteResult(analytics.track, {
        page_name: analyticsPage,
        area: 'workspace_invite_dialog',
        entry_from: entryFrom,
        result: 'success',
        requested_count: valid.length,
        succeeded_count: valid.length,
        failed_count: 0,
        duration_ms: Math.round(performance.now() - startedAt),
        ...workspaceDimensions,
      }, { requestId });
      setSuccess(true);
      onSubmit?.(valid);
      autoCloseTimerRef.current = window.setTimeout(() => {
        autoCloseTimerRef.current = null;
        onClose();
        setRows([{ email: '', role: DEFAULT_ROLE }]);
        setSuccess(false);
        setSubmitting(false);
      }, 1000);
    } catch (caught) {
      if (caught instanceof TypeError) {
        trackWorkspaceInviteResult(analytics.track, {
          page_name: analyticsPage,
          area: 'workspace_invite_dialog',
          entry_from: entryFrom,
          result: 'failed',
          requested_count: valid.length,
          succeeded_count: 0,
          failed_count: valid.length,
          duration_ms: Math.round(performance.now() - startedAt),
          error_code: 'network_error',
          ...workspaceDimensions,
        }, { requestId });
      }
      setError(t('workspaceInvite.submitFailed'));
      setSubmitting(false);
    }
  }

  return (
    <div className="entry-invite" role="dialog" aria-modal="true" aria-label={t('workspaceInvite.dialogAria')}>
      <div className="entry-invite__backdrop" onClick={closeDialog} />
      <div className="entry-invite__panel entry-invite__panel--split">
        <button
          type="button"
          className="entry-invite__close"
          onClick={closeDialog}
          aria-label={t('common.close')}
        >
          <Icon name="close" size={16} />
        </button>

        <div className="entry-invite__form">
          <h2 className="entry-invite__title">{t('workspaceInvite.title')}</h2>
          <p className="entry-invite__teamsize">
            {seatsExhausted
              ? t('workspaceInvite.seatsExhaustedBody')
              : freePlan
                ? t('workspaceInvite.freePlanBody')
                : t('workspaceInvite.teamPlanBody')}
          </p>
          {seatsExhausted && onUpgrade ? (
            <Button variant="primary-ghost" onClick={() => {
              trackWorkspaceInviteClick(analytics.track, {
                page_name: analyticsPage,
                area: 'workspace_invite_dialog',
                element: 'upgrade',
                entry_from: entryFrom,
                ...workspaceDimensions,
              });
              onUpgrade();
            }}>
              {t('workspaceInvite.seatsExhaustedAction')}
            </Button>
          ) : null}

          <div className="entry-invite__field-labels">
            <span className="entry-invite__label">{t('workspaceInvite.emailLabel')}</span>
            <span className="entry-invite__label entry-invite__label--role">
              {canAssignRoles ? t('workspaceInvite.roleLabel') : t('workspaceInvite.defaultRoleLabel')}
            </span>
          </div>
          <div className="entry-invite__rows" ref={rowsRef}>
            {rows.map((row, i) => (
              <div className="entry-invite__fields" key={i}>
                <input
                  className="entry-invite__input"
                  type="email"
                  placeholder={t('workspaceInvite.emailPlaceholder')}
                  value={row.email}
                  onChange={(e) => updateRow(i, { email: e.target.value })}
                />
                <div className="entry-invite__role-picker">
                  <button
                    type="button"
                    ref={(el) => {
                      roleTriggerRefs.current[i] = el;
                    }}
                    className="entry-invite__role"
                    onClick={() => {
                      if (!canAssignRoles) return;
                      trackWorkspaceInviteClick(analytics.track, {
                        page_name: analyticsPage,
                        area: 'workspace_invite_dialog',
                        element: 'role_select',
                        entry_from: entryFrom,
                        ...workspaceDimensions,
                      });
                      setOpenRoleIndex((current) => (current === i ? null : i));
                    }}
                    disabled={!canAssignRoles}
                    aria-label={canAssignRoles ? t('workspaceInvite.roleLabel') : t('workspaceInvite.defaultRoleLabel')}
                    aria-haspopup="listbox"
                    aria-expanded={openRoleIndex === i}
                    aria-controls={`${roleListboxId}-${i}`}
                  >
                    <span>{roleLabel(canAssignRoles ? row.role : DEFAULT_ROLE, t)}</span>
                    <Icon name="chevron-down" size={16} />
                  </button>
                  {openRoleIndex === i && roleMenuPos && typeof document !== 'undefined'
                    ? createPortal(
                        <div
                          ref={roleMenuRef}
                          className="entry-invite__role-menu"
                          id={`${roleListboxId}-${i}`}
                          role="listbox"
                          style={roleMenuPos}
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <button
                              type="button"
                              key={role}
                              className={`entry-invite__role-option${(canAssignRoles ? row.role : DEFAULT_ROLE) === role ? ' is-selected' : ''}`}
                              role="option"
                              aria-selected={(canAssignRoles ? row.role : DEFAULT_ROLE) === role}
                              onClick={() => {
                                updateRow(i, { role });
                                setOpenRoleIndex(null);
                              }}
                            >
                              <span>{roleLabel(role, t)}</span>
                              {(canAssignRoles ? row.role : DEFAULT_ROLE) === role ? <Icon name="check" size={16} /> : null}
                            </button>
                          ))}
                        </div>,
                        document.body,
                      )
                    : null}
                </div>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    className="entry-invite__row-remove"
                    onClick={() => removeRow(i)}
                    aria-label={t('workspaceInvite.removeRow')}
                  >
                    <Icon name="close" size={15} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <button type="button" className="entry-invite__add-row" onClick={addRow}>
            <Icon name="plus" size={14} /> {t('workspaceInvite.addMember')}
          </button>

          <button
            type="button"
            className="entry-invite__collapse"
            onClick={() => setVisibilityOpen((v) => !v)}
            aria-expanded={visibilityOpen}
          >
            {t('workspaceInvite.visibilityQuestion')}
            <Icon
              name="chevron-down"
              size={16}
              style={visibilityOpen ? { transform: 'rotate(180deg)' } : undefined}
            />
          </button>
          {visibilityOpen ? (
            <p className="entry-invite__collapse-body">
              {t('workspaceInvite.visibilityAnswer')}
            </p>
          ) : null}

          {error ? (
            <p className="entry-invite__collapse-body" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            className="entry-invite__submit"
            onClick={handleConfirm}
            disabled={!hasValidEmail || submitting || success || seatsExhausted}
          >
            {success
              ? t('workspaceInvite.sent')
              : submitting
                ? t('workspaceInvite.sending')
                : t('workspaceInvite.confirm')}
          </button>
        </div>

        <div className="entry-invite__art" aria-hidden>
          <span className="entry-invite__art-glow" />
          <div className="entry-invite__art-cluster">
            <span className="entry-invite__art-avatar">
              <img src="/team-avatars/a2.png" alt="" />
            </span>
            <span className="entry-invite__art-avatar">
              <img src="/team-avatars/a1.png" alt="" />
            </span>
            <span className="entry-invite__art-avatar">
              <img src="/team-avatars/a4.png" alt="" />
            </span>
            <span className="entry-invite__art-avatar">
              <img src="/team-avatars/a6.png" alt="" />
            </span>
            <span className="entry-invite__art-avatar entry-invite__art-avatar--invite">
              <Icon name="plus" size={26} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
