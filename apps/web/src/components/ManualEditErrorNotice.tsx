import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './ManualEditErrorNotice.module.css';

export function ManualEditErrorNotice({ message, anchor }: { message: string; anchor: HTMLElement | null }) {
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(480, window.innerWidth - 24);
      setPosition({
        left: Math.max(12 + width / 2, Math.min(rect.left + rect.width / 2, window.innerWidth - 12 - width / 2)),
        top: rect.bottom + 12,
        width,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    // Ancestor resizing includes the sidebar and workspace layout changes.
    for (let node: HTMLElement | null = anchor; node; node = node.parentElement) observer.observe(node);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchor]);

  const notice = <div role="alert" className={`${styles.notice} ${anchor ? styles.anchored : styles.fallback}`} style={anchor ? position ?? { visibility: 'hidden' } : undefined}>{message}</div>;
  return anchor ? createPortal(notice, document.body) : notice;
}
