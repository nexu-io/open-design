import { useEffect, useState, type RefObject } from 'react';
import styles from './ChatScrollEdge.module.css';

/** The transcript softens as it passes under the project toolbar. */
export function ChatScrollEdge({ scrollRef }: { scrollRef: RefObject<HTMLDivElement | null> }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const log = scrollRef.current;
    if (!log) return;
    const update = () => setActive(log.scrollTop > 1);
    // Include restored/programmatic scroll positions as well as user scrolling.
    const frame = requestAnimationFrame(update);
    log.addEventListener('scroll', update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      log.removeEventListener('scroll', update);
    };
  }, [scrollRef]);

  return (
    <div className={styles.edge} data-active={active} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}
