import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import styles from './ShareProgressButton.module.css';

/**
 * S2 (upload) and K1 (comment backfill sync) both show progress for an
 * in-flight share action, but render differently: S2 overlays a native
 * `<progress>` under the existing dark button (idle markup stays unchanged
 * while `value` is null); K1 replaces the button entirely with a full
 * sweeping (indeterminate) or filled (determinate) bar carrying its own
 * label. Both live here as the single owner of "share progress" visuals
 * (2026 refactor: item 4) instead of two copies of the same idea spread
 * through ShareTab's JSX.
 */
export type ShareProgressButtonProps =
  | { variant: 'upload'; value: number | null; label: string; children: ReactNode }
  | { variant: 'sync'; determinate: boolean; percent: number; label: string };

export function ShareProgressButton(props: ShareProgressButtonProps) {
  if (props.variant === 'upload') {
    const { value, label, children } = props;
    if (value === null) return <>{children}</>;
    return (
      <div className={styles.uploadControl}>
        <progress className={styles.uploadProgress} max={1} value={value} aria-label={label} />
        {children}
      </div>
    );
  }
  const { determinate, percent, label } = props;
  return (
    <div
      className={styles.syncProgress}
      aria-label={label}
    >
      <div
        className={determinate ? `${styles.syncProgressFill} ${styles.syncProgressFillDeterminate}` : styles.syncProgressFill}
        aria-hidden="true"
        style={determinate ? { width: `${Math.round(percent * 100)}%` } : undefined}
      />
      <div className={styles.syncProgressText}>
        <Icon name="share-spinner" size={13} strokeWidth={2} className="icon-spin" />
        <span>{label}</span>
      </div>
    </div>
  );
}
