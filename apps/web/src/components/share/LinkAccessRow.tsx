import styles from './LinkAccessRow.module.css';

/**
 * S1/S4/S13: the "link access" heading row — label + switch + description.
 * Same markup and classes in every host (ShareTab, SignedOutObservedShare;
 * see AGENTS.md item 3): only the switch's checked/disabled/title/onToggle
 * vary per caller, never the shape.
 */
export function LinkAccessRow({ label, description, checked, disabled = false, title, onToggle }: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  title?: string;
  /** Omitted for a purely static/disabled row (e.g. the signed-out card). */
  onToggle?: () => void;
}) {
  return (
    <div className={styles.heading}>
      <div className={styles.row}>
        <span className={styles.label}>{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          className={`${styles.toggle}${checked ? ` ${styles.toggleOn}` : ''}`}
          disabled={disabled}
          title={title}
          onClick={onToggle}
        >
          <span className={styles.toggleThumb} aria-hidden="true" />
        </button>
      </div>
      <p className={styles.description}>{description}</p>
    </div>
  );
}
