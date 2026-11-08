import type { ReactNode } from 'react';
import styles from './ShareNoticeRow.module.css';

/**
 * S5/S13: the unboxed "text on the left, one fixed-width action on the
 * right" notice row (ShareTab's update notice, SignedOutObservedShare's
 * sign-in-to-update notice, CommentSyncBanner's backfill-retry row). The
 * action stays a caller-supplied node — this row only owns the shared
 * layout/typography, not any particular button (that's phase 2's job).
 */
export function ShareNoticeRow({ message, action, className }: {
  message: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${styles.row}${className ? ` ${className}` : ''}`}>
      <p>{message}</p>
      {action}
    </div>
  );
}
