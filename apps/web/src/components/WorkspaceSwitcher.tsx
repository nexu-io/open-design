import { useEffect, useRef, useState } from 'react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { Icon } from './Icon';
import { useI18n } from '../i18n';
import { navigate } from '../router';
import { useWorkspaceContext } from '../collab/useWorkspaceContext';
import styles from './WorkspaceSwitcher.module.css';

// The team-workspace affordance. When the signed-in identity is a team workspace,
// it surfaces the current team and a small menu (invite / new team). It reads the
// one workspace context the rest of the collab surface reads, so a personal or
// local session simply renders nothing — the team switcher only appears once you
// are actually in a team. When the entry shell already holds the context it passes
// it in (`context` prop) so we don't re-fetch; otherwise we read it ourselves.
//
// Membership management itself lives in another lane (B): invite opens the team
// members/invite slot rather than navigating to onboarding (that jump was wrong —
// inviting a colleague is not a first-run flow). `onInvite` lets the host route to
// the members/invite placeholder; without it we fall back to the members slot.
interface Props {
  /** Pre-fetched context from the entry shell. When omitted we read it ourselves. */
  context?: WorkspaceCollabContext | null;
  /** Open the invite slot (B's InviteDialog). Falls back to the members slot. */
  onInvite?: () => void;
  /** Start the "new team" flow. Falls back to onboarding (the cloud team flow). */
  onCreateTeam?: () => void;
}

export function WorkspaceSwitcher({ context: contextProp, onInvite, onCreateTeam }: Props) {
  const { t } = useI18n();
  const own = useWorkspaceContext();
  // Prefer the host-provided context; only self-fetch when the host passes nothing.
  const context = contextProp !== undefined ? contextProp : own.context;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!context || context.workspaceType !== 'team') return null;

  const teamName = context.teamName?.trim() || context.teamId || t('workspaceSwitcher.team');
  const initial = teamName.trim().charAt(0).toUpperCase() || 'T';
  const canInvite = context.permissions.canInviteMembers;

  const handleInvite = () => {
    setOpen(false);
    if (onInvite) {
      onInvite();
      return;
    }
    // No host handler: land on the members slot rather than onboarding.
    navigate({ kind: 'home', view: 'members' });
  };

  const handleCreateTeam = () => {
    setOpen(false);
    if (onCreateTeam) {
      onCreateTeam();
      return;
    }
    navigate({ kind: 'home', view: 'onboarding' });
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={teamName}
        data-testid="workspace-switcher"
      >
        <span className={styles.avatar} aria-hidden>
          {initial}
        </span>
        <span className={styles.name}>{teamName}</span>
        <Icon name="chevron-down" size={14} />
      </button>
      {open ? (
        <div className={styles.menu} role="menu">
          <button type="button" className={`${styles.item} ${styles.itemCurrent}`} role="menuitem" disabled>
            <span className={styles.avatar} aria-hidden>
              {initial}
            </span>
            <span className={styles.itemName}>{teamName}</span>
            <Icon name="check" size={14} />
          </button>
          {canInvite ? (
            <>
              <div className={styles.divider} role="separator" />
              <button type="button" className={styles.item} role="menuitem" onClick={handleInvite}>
                <Icon name="send" size={15} />
                {t('workspaceSwitcher.invite')}
              </button>
            </>
          ) : null}
          <button type="button" className={styles.item} role="menuitem" onClick={handleCreateTeam}>
            <Icon name="plus" size={15} />
            {t('workspaceSwitcher.createTeam')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
