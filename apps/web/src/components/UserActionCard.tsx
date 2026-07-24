import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Icon, type IconName } from './Icon';
import styles from './UserActionCard.module.css';

export type UserActionCardTone = 'neutral' | 'danger' | 'warning' | 'brand';

interface UserActionCardProps {
  icon: IconName;
  title: ReactNode;
  actions?: ReactNode;
  footerActions?: ReactNode;
  details?: ReactNode;
  detailsLabel?: ReactNode;
  status?: ReactNode;
  tone?: UserActionCardTone;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  dataKind?: string;
  dataOdCard?: string;
  testId?: string;
}

/**
 * Shared shell for chat responses that need the user to decide or recover.
 * The default view stays intentionally small: one concrete problem and its
 * primary action. Explanations, diagnostics, and secondary choices live in a
 * disclosure so chat history remains scannable.
 */
export function UserActionCard({
  icon,
  title,
  actions,
  footerActions,
  details,
  detailsLabel,
  status,
  tone = 'neutral',
  open,
  defaultOpen = false,
  onOpenChange,
  className,
  dataKind,
  dataOdCard,
  testId,
}: UserActionCardProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;
  const hasDetails = details != null;
  // Keep collapsed diagnostics out of keyboard and pointer navigation. Set
  // `inert` imperatively because React 18 does not serialize its boolean JSX
  // prop into the DOM attribute.
  const detailsInnerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = detailsInnerRef.current;
    if (!node) return;
    if (isOpen) {
      node.removeAttribute('inert');
    } else {
      node.setAttribute('inert', '');
    }
  }, [isOpen]);

  const setOpen = (next: boolean) => {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <section
      className={`${styles.card}${className ? ` ${className}` : ''}`}
      data-user-action-card={dataKind ?? 'true'}
      data-od-card={dataOdCard}
      data-testid={testId}
      data-tone={tone}
    >
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          <Icon name={icon} size={16} />
        </span>
        <div className={styles.title}>{title}</div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>

      {hasDetails || footerActions ? (
        <>
          <div className={styles.footer} data-user-action-footer="true">
            {hasDetails ? (
              <button
                type="button"
                className={styles.detailsToggle}
                aria-expanded={isOpen}
                onClick={() => setOpen(!isOpen)}
              >
                <span>{detailsLabel}</span>
                <Icon
                  name="chevron-down"
                  size={14}
                  className={`${styles.chevron}${isOpen ? ` ${styles.chevronOpen}` : ''}`}
                />
              </button>
            ) : (
              <span />
            )}
            {footerActions ? <div className={styles.footerActions}>{footerActions}</div> : null}
          </div>
          {hasDetails ? (
            <div className={`accordion-collapsible${isOpen ? ' open' : ''}`}>
              <div
                ref={detailsInnerRef}
                className="accordion-collapsible-inner"
                aria-hidden={!isOpen}
              >
                <div className={styles.details}>{details}</div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {status ? <div className={styles.status}>{status}</div> : null}
    </section>
  );
}
