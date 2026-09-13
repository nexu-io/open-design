"use client";

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { HTMLAttributes, ReactNode } from 'react';
import styles from './hybrid-tabs.module.css';

/**
 * Hybrid Tabs presentation with selection owned by the workspace. Accepting
 * children also lets the active viewer portal its Code control into the list.
 */
export default function HybridTabs({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="tablist" {...props} className={[className, styles.tabs].filter(Boolean).join(' ')} />;
}

/** Animate the label and its icon gap together, including the exit frame. */
export function HybridTabLabel({ show, children }: { show: boolean; children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.span
          key="label"
          className={styles.label}
          aria-hidden="true"
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: 'auto' }}
          exit={{ opacity: 0, width: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.25, ease: [0.23, 1, 0.32, 1] }}
        >
          <span className={styles.content}>{children}</span>
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}
