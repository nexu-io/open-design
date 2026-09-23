import type { ReactNode } from 'react';
import { Button } from '@open-design/components';
import styles from './SharePanelHeader.module.css';

/** Shared chrome for toolbar/card entry; closing the shell never cancels a publish. */
export function SharePanelHeader({ title, closeLabel, onClose, children }: {
  children?: ReactNode;
  title: string;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className={styles.header}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.tools}>
        {children}
        <Button type="button" className={styles.close} aria-label={closeLabel} onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" focusable="false">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
