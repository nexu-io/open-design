import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import styles from './RailRecentSection.module.css';

/** A rail group with one accessible disclosure and an animated content region. */
export function RailDisclosure({
  label,
  open,
  onToggle,
  controlsId,
  testId,
  scrollable = false,
  afterList,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  controlsId: string;
  testId: string;
  scrollable?: boolean;
  afterList?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`entry-nav-rail__recent${scrollable ? ` ${styles.scrollable}` : ''}`}>
      <button
        type="button"
        className="entry-nav-rail__recent-head"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={controlsId}
        data-testid={testId}
      >
        <span className="entry-nav-rail__recent-title">{label}</span>
        <span className="entry-nav-rail__recent-chevron" aria-hidden>
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
        </span>
      </button>
      <div className={scrollable ? styles.scrollBody : undefined}>
        <div className={`accordion-collapsible${open ? ' open' : ''}`} inert={!open} aria-hidden={!open || undefined}>
          <div className="accordion-collapsible-inner">{children}</div>
        </div>
        {afterList}
      </div>
    </div>
  );
}
