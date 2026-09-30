import type { ReactNode } from 'react';
import styles from './ShareErrorRow.module.css';

/**
 * O7/OD-4: the share panel's red error row (icon + text, #C94E4E) — used for
 * a failed publish, the pre-check "file too large" block (both in
 * `ShareTab`), the after-export guide's "couldn't save preference" line, and
 * (2026 refactor: item 2/OD-4) CommentSyncBanner's retry-failed line, which
 * previously rendered as an unstyled grey `<p role="alert">` instead of this
 * shared error look — that grey→red change is the one allowed visual
 * difference this consolidation introduces for a state a baseline capture
 * exists for. AfterExportShareGuide's pref-save-failed error has no baseline
 * capture at all (no Owner-* spec drives `saveFailed`), so gaining the icon
 * here is not a regression against any captured screenshot.
 *
 * `icon` defaults to shown; pass `icon={false}` for a text-only row.
 */
export function ShareErrorRow({ message, icon = true, role = 'status', className }: {
  message: ReactNode;
  icon?: boolean;
  role?: 'status' | 'alert';
  className?: string;
}) {
  return (
    <p
      className={`${styles.row}${icon ? ` ${styles.hasIcon}` : ''}${className ? ` ${className}` : ''}`}
      role={role}
    >
      {icon ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
          className={styles.icon}
        >
          <circle cx="8" cy="8" r="6.2" />
          <path d="M8 4.8v3.6M8 11h.01" />
        </svg>
      ) : null}
      <span>{message}</span>
    </p>
  );
}
