'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useId, useState, type CSSProperties } from 'react';
import styles from './user-avatars.module.css';

export interface AvatarUser {
  id: string | number;
  name?: string;
  image: string;
}

export interface UserAvatarsProps {
  users: readonly AvatarUser[];
  /** Avatar diameter in CSS pixels. */
  size?: number;
  className?: string;
  maxVisible?: number;
  overlap?: number;
  focusScale?: number;
  isRightToLeft?: boolean;
  isOverlapOnly?: boolean;
  tooltipPlacement?: 'top' | 'bottom';
}

// Keep structural constraints with the size prop. A delayed stylesheet (for
// example during a dev refresh) must never expose full-size source portraits.
const groupLayout: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  flexShrink: 0,
  isolation: 'isolate',
};
const portraitLayout: CSSProperties = {
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  borderRadius: 'inherit',
};
const imageLayout: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

/** Overlapping portraits adapted from the supplied UserAvatars component. */
export function UserAvatars({
  users,
  size = 56,
  className,
  maxVisible = 7,
  overlap = 60,
  focusScale = 1.2,
  isRightToLeft = false,
  isOverlapOnly = false,
  tooltipPlacement = 'bottom',
}: UserAvatarsProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [failedImages, setFailedImages] = useState<ReadonlySet<string>>(new Set());
  const tooltipId = useId();
  const reducedMotion = useReducedMotion();
  const visibleCount = Math.max(1, Math.floor(maxVisible));
  const visibleUsers = users.slice(0, visibleCount);
  const hiddenUsers = users.slice(visibleCount);
  const activeIndex = hoveredIndex ?? focusedIndex;
  const diameter = Math.max(16, size);
  const step = diameter * Math.max(0, Math.min(100, overlap)) / 100;
  const shift = isOverlapOnly ? 0 : Math.max(0, diameter * (1 + focusScale) / 2 - step);
  const entries = visibleUsers.map(user => ({ user, overflow: false }));
  if (hiddenUsers.length) entries.push({ user: hiddenUsers[0]!, overflow: true });

  if (!entries.length) return null;

  return (
    <div
      className={[styles.avatars, className].filter(Boolean).join(' ')}
      dir={isRightToLeft ? 'rtl' : 'ltr'}
      style={{ ...groupLayout, height: diameter, paddingInlineEnd: shift }}
    >
      {entries.map(({ user, overflow }, index) => {
        const active = activeIndex === index;
        const label = overflow
          ? `+${hiddenUsers.length}: ${hiddenUsers.map(entry => entry.name || String(entry.id)).join(', ')}`
          : user.name || String(user.id);
        const tooltip = overflow
          ? hiddenUsers.map(entry => entry.name || String(entry.id)).join(', ')
          : user.name;
        const move = activeIndex !== null && index > activeIndex && !isOverlapOnly;
        const initials = (user.name || String(user.id)).trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('');
        return (
          <motion.div
            key={overflow ? 'overflow' : `user:${user.id}`}
            role="img"
            aria-label={label}
            aria-describedby={active && tooltip ? `${tooltipId}-${index}` : undefined}
            className={styles.avatar}
            style={{
              position: 'relative',
              flexShrink: 0,
              width: diameter,
              height: diameter,
              borderRadius: '50%',
              marginInlineStart: index === 0 ? 0 : step - diameter,
              zIndex: active ? entries.length + 1 : index,
            }}
            tabIndex={0}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            onFocus={() => setFocusedIndex(index)}
            onBlur={() => setFocusedIndex(null)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setFocusedIndex(index);
              } else if (event.key === 'Escape') {
                setFocusedIndex(null);
                setHoveredIndex(null);
              }
            }}
            animate={{
              scale: active && !overflow && !reducedMotion ? focusScale : 1,
              x: move && !reducedMotion ? shift * (isRightToLeft ? -1 : 1) : 0,
            }}
            transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 20 }}
          >
            <div className={styles.portrait} style={portraitLayout}>
              {overflow ? <span className={styles.count}>+{hiddenUsers.length}</span>
                : failedImages.has(user.image) || !user.image ? <span>{initials}</span>
                : <img
                    src={user.image}
                    alt=""
                    width={diameter}
                    height={diameter}
                    style={imageLayout}
                    draggable={false}
                    onError={() => {
                      setFailedImages(previous => new Set(previous).add(user.image));
                    }}
                  />}
            </div>
            <AnimatePresence>
              {active && tooltip ? (
                <motion.div
                  id={`${tooltipId}-${index}`}
                  role="tooltip"
                  className={styles.tooltip}
                  data-placement={tooltipPlacement}
                  initial={{ opacity: 0, y: reducedMotion ? 0 : tooltipPlacement === 'bottom' ? 8 : -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.15, ease: [0.23, 1, 0.32, 1] }}
                >
                  <span className={styles.tooltipText}>{tooltip}</span>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
