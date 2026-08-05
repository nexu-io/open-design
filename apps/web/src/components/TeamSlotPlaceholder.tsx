import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { useT } from '../i18n';
import styles from './TeamSlotPlaceholder.module.css';

// A neutral "provided by the team service, wiring in progress" slot. The entry
// shell owns ONLY the navigation frame + the entry points to team destinations
// (members, workspace settings, board, team project spaces); the destinations
// themselves are other lanes' surfaces (B = members/billing, D = team project
// visibility). Until those land, every team nav item routes here so the shell is
// navigable end-to-end without this lane reaching into another lane's view.
interface Props {
  icon: IconName;
  title: string;
  /** Optional extra line under the standard "coming soon" note. */
  detail?: ReactNode;
}

export function TeamSlotPlaceholder({ icon, title, detail }: Props) {
  const t = useT();
  return (
    <div className="entry-section">
      <div className={styles.card} data-testid="team-slot-placeholder">
        <span className={styles.icon} aria-hidden>
          <Icon name={icon} size={26} />
        </span>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.note}>{t('entry.teamSlotNote')}</p>
        {detail ? <p className={styles.detail}>{detail}</p> : null}
        <span className={styles.badge}>{t('tasks.comingSoon')}</span>
      </div>
    </div>
  );
}
