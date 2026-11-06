import { useEffect, useId, useRef, useState } from 'react';
import type { CollabCloudMemberDirectoryEntry } from '@open-design/contracts';
import type { CollabPresenceMember } from './collab-client';
import styles from './PresenceBar.module.css';
import { useT } from '../i18n';

export interface PresenceBarProps {
  members: CollabPresenceMember[];
  /** Max avatars before collapsing into a "+N" chip. */
  max?: number;
  /** The viewer's own member id. Used to keep self first and add online state. */
  selfMemberId?: string;
  /** Current viewer identity. Lets the bar render self before the first heartbeat returns. */
  selfMember?: CollabPresenceMember | null;
  /** Resolve sparse heartbeat member ids through the Workspace directory. */
  resolveMember?: (
    memberId: string,
  ) => CollabCloudMemberDirectoryEntry | null;
}

function initials(source: string): string {
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]![0] ?? '';
    const second = parts[1]![0] ?? '';
    return (first + second).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function displayName(
  member: CollabPresenceMember,
): string {
  return member.name?.trim() ?? '';
}

function roleLabel(member: CollabPresenceMember, t: ReturnType<typeof useT>): string {
  switch (member.role) {
    case 'owner':
      return t('collabPresence.roleOwner');
    case 'admin':
      return t('collabPresence.roleAdmin');
    default:
      return t('collabPresence.roleMember');
  }
}

function activityLabel(member: CollabPresenceMember, isSelf: boolean, t: ReturnType<typeof useT>): string {
  const activity = member.activity;
  if (typeof activity === 'string' && activity.trim()) return activity.trim();
  if (
    activity &&
    typeof activity === 'object' &&
    'label' in activity &&
    typeof activity.label === 'string' &&
    activity.label.trim()
  ) {
    return activity.label.trim();
  }
  if (member.filePath?.trim()) {
    return t(isSelf ? 'collabPresence.viewingFileSelf' : 'collabPresence.viewingFileOther', {
      file: member.filePath.trim(),
    });
  }
  return t(isSelf ? 'collabPresence.viewingProjectSelf' : 'collabPresence.viewingProjectOther');
}

/**
 * Presence overlay (presence, the spec): a compact avatar stack of the members
 * currently viewing the shared project. Poll-driven — the set comes from
 * {@link useCollab}; there are no live cursors.
 */
export function PresenceBar({
  members,
  max = 5,
  selfMemberId,
  selfMember = null,
  resolveMember,
}: PresenceBarProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popoverId = useId();
  const enrich = (member: CollabPresenceMember): CollabPresenceMember => {
    const directoryEntry = resolveMember?.(member.memberId);
    const memberName = member.name?.trim();
    const directoryName = directoryEntry?.displayName.trim();
    const resolvedName = directoryName && directoryName !== member.memberId
      ? directoryName
      : memberName && memberName !== member.memberId
        ? memberName
        : undefined;
    const next = { ...member };
    if (resolvedName) next.name = resolvedName;
    else delete next.name;
    if (directoryEntry) next.role = directoryEntry.role;
    return next;
  };
  const resolvedSelf =
    (selfMember ? enrich(selfMember) : null) ??
    (selfMemberId
      ? enrich(
          members.find((m) => m.memberId === selfMemberId)
          ?? { memberId: selfMemberId },
        )
      : null);
  const enrichedMembers = members.map(enrich);
  const others = resolvedSelf
    ? enrichedMembers.filter((m) => m.memberId !== resolvedSelf.memberId)
    : enrichedMembers;
  // A Team presence id has already passed membership authorization, so a
  // missing directory entry is a transient convergence problem, not a license
  // to expose the transport id or invent a fake "Member" identity. Keep that
  // avatar hidden until the shared directory store resolves it; the store's
  // last-good snapshot keeps already resolved identities visible on failures.
  const ordered = (resolvedSelf ? [resolvedSelf, ...others] : others)
    .filter((member) => Boolean(displayName(member)));

  const shown = ordered.slice(0, max);
  const overflow = ordered.length - shown.length;
  const total = ordered.length;
  const label = t(
    total === 1
      ? (resolvedSelf ? 'collabPresence.ariaWithSelfOne' : 'collabPresence.ariaOne')
      : (resolvedSelf ? 'collabPresence.ariaWithSelf' : 'collabPresence.aria'),
    { count: total },
  );

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // Presence answers "who ELSE is in here". A roster of one, where that one is
  // you, answers nothing — it rendered your own avatar over your own project
  // and captioned it "你正在查看此项目" (acceptance #19). Self still leads the
  // stack the moment anybody else shows up.
  const selfIsAlone = ordered.length === 1 && resolvedSelf?.memberId === ordered[0]?.memberId;
  if (ordered.length === 0 || selfIsAlone) return null;

  return (
    <div
      ref={containerRef}
      className={styles.container}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className={styles.bar}
        aria-label={label}
        aria-expanded={open}
        aria-controls={popoverId}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        {shown.map((member) => (
          <span
            key={member.memberId}
            className={styles.avatar}
            data-role={member.role ?? 'member'}
            data-self={resolvedSelf?.memberId === member.memberId ? 'true' : undefined}
            title={displayName(member)}
          >
            {initials(displayName(member))}
          </span>
        ))}
        {overflow > 0 && (
          <span className={styles.overflow} title={t('collabPresence.moreOnline', { count: overflow })}>
            +{overflow}
          </span>
        )}
      </button>
      {open ? (
        <div id={popoverId} className={styles.popover} role="dialog" aria-label={t('collabPresence.dialogTitle')}>
          <div className={styles.popoverHeader}>
            <strong>{t('collabPresence.dialogTitle')}</strong>
            <span>{t('collabPresence.onlineCount', { count: total })}</span>
          </div>
          <ul className={styles.memberList}>
            {ordered.map((member) => {
              const isSelf = resolvedSelf?.memberId === member.memberId;
              return (
                <li key={member.memberId} className={styles.memberRow}>
                  <span
                    className={styles.rowAvatar}
                    data-role={member.role ?? 'member'}
                    aria-hidden="true"
                  >
                    {initials(displayName(member))}
                    <span className={styles.onlineDot} />
                  </span>
                  <span className={styles.memberText}>
                    <span className={styles.memberName}>
                      {displayName(member)}
                      {isSelf ? <span className={styles.selfBadge}>{t('collabPresence.selfBadge')}</span> : null}
                    </span>
                    <span className={styles.memberMeta}>
                      {roleLabel(member, t)} · {activityLabel(member, isSelf, t)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
