import { useState, type ReactNode } from 'react';
import styles from './ContextChipHoverCard.module.css';

interface Props {
  /** Short type label, e.g. "Referenced project" / "Local code". */
  typeLabel: string;
  /** Primary locator: folder path, project id, or url. Hidden when empty. */
  detail?: string;
  /** Class of the chip itself (its existing visual styling is preserved). */
  className?: string;
  /** Forwarded to the chip element so existing test ids keep working. */
  'data-testid'?: string;
  children: ReactNode;
}

/**
 * Wraps a composer context chip so hovering it reveals a minimal card with the
 * item's type and primary locator. Intentionally lightweight (type + one line)
 * — richer, expandable detail for complex kinds is deliberately out of scope.
 */
export function ContextChipHoverCard({ typeLabel, detail, className, children, ...rest }: Props) {
  const [open, setOpen] = useState(false);
  const testId = rest['data-testid'];
  return (
    <span
      className={`${styles.host}${className ? ` ${className}` : ''}`}
      data-testid={testId}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
    >
      {children}
      {open ? (
        <span
          className={styles.card}
          role="tooltip"
          data-testid={testId ? `${testId}-info` : undefined}
        >
          <span className={styles.type}>{typeLabel}</span>
          {detail ? <span className={styles.detail}>{detail}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
