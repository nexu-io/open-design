import type { ReactNode } from 'react';
import { Button } from '@open-design/components';
import { Icon } from '../Icon';
import styles from './SharePanelHeader.module.css';

/**
 * Shared chrome for toolbar/card entry; closing the shell never cancels a
 * publish. `onClose`/`closeLabel` are optional so a header with no ✕ and no
 * tools (e.g. the signed-out standalone card, which never had either) can
 * still share this same title row instead of hand-rolling its own `<h2>`.
 * `size="lg"` keeps that same card's pre-existing 16px title; every other
 * caller keeps the original 15px (`size="sm"`, the default).
 */
export function SharePanelHeader({ title, closeLabel, onClose, size = 'sm', children }: {
  children?: ReactNode;
  title: string;
  closeLabel?: string;
  onClose?: () => void;
  size?: 'sm' | 'lg';
}) {
  const hasTools = Boolean(children) || Boolean(onClose);
  return (
    <div className={styles.header}>
      <h2 className={`${styles.title}${size === 'lg' ? ` ${styles.titleLg}` : ''}`}>{title}</h2>
      {hasTools ? (
        <div className={styles.tools}>
          {children}
          {onClose ? (
            <Button type="button" className={styles.close} aria-label={closeLabel} onClick={onClose}>
              <Icon name="share-close-thin" size={14} strokeWidth={1.5} />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
