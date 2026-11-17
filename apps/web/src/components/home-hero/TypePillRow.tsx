// Unselected Home entry: three fixed types, with all remaining types in More.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import type { HomeHeroChip } from './chips';
import { HOME_TYPE_ROW_IDS, HOME_TYPE_ROW_MORE_IDS } from './chips';
import { Icon } from '../Icon';
import { useT } from '../../i18n';
import { smoothScrollTo } from '../../utils/smoothScrollToTop';
import styles from './TypePillRow.module.css';

const MENU_LIST_HEIGHT = 205; // Four 42px rows, four 4px gaps and half a row.
const VIEWPORT_GUTTER = 16;
const KEYBOARD_SCROLL_MS = 120;
const PAGE_REVEAL_MS = 200;

interface Props {
  chips: HomeHeroChip[];
  activeChipId: string | null;
  disabled?: boolean;
  labelFor: (chipId: string) => string;
  onPick: (chip: HomeHeroChip) => void;
}

export function TypePillRow({ chips, activeChipId, disabled, labelFor, onPick }: Props) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<'first' | 'last' | null>(null);
  const cancelScrollRef = useRef<(() => void) | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const menuId = useId();
  const byId = (ids: readonly string[]) => ids
    .map((id) => chips.find((chip) => chip.id === id))
    .filter((chip): chip is HomeHeroChip => Boolean(chip));
  const inlineChips = byId(HOME_TYPE_ROW_IDS);
  const moreChips = byId(HOME_TYPE_ROW_MORE_IDS);

  useLayoutEffect(() => {
    if (!moreOpen) return;
    let cancelReveal: (() => void) | undefined;
    const revealMenu = () => {
      const menu = menuRef.current;
      if (!menu) return;
      // The Home surface scrolls inside the shell, not on window. The menu's
      // overflow provides the extra scroll range without moving the composer
      // through a layout change or placing the menu over it.
      let scrollport = menu.parentElement;
      while (scrollport && !/^(auto|scroll)$/.test(getComputedStyle(scrollport).overflowY)) {
        scrollport = scrollport.parentElement;
      }
      scrollport ??= document.scrollingElement as HTMLElement | null;
      if (!scrollport) return;
      cancelReveal?.();
      const bottom = scrollport === document.scrollingElement
        ? window.innerHeight
        : Math.min(window.innerHeight,
          scrollport.getBoundingClientRect().top + scrollport.clientTop + scrollport.clientHeight);
      const delta = menu.getBoundingClientRect().bottom + VIEWPORT_GUTTER - bottom;
      if (delta > 0) {
        const target = Math.min(scrollport.scrollHeight - scrollport.clientHeight, scrollport.scrollTop + delta);
        if (target > scrollport.scrollTop) cancelReveal = smoothScrollTo(scrollport, target, PAGE_REVEAL_MS);
      }
    };
    revealMenu();
    window.addEventListener('resize', revealMenu);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(revealMenu);
    if (rootRef.current) observer?.observe(rootRef.current);
    if (triggerRef.current) observer?.observe(triggerRef.current);
    return () => {
      window.removeEventListener('resize', revealMenu);
      observer?.disconnect();
      cancelReveal?.();
    };
  }, [moreOpen, moreChips.length]);

  function focusItem(item: HTMLButtonElement | undefined) {
    const list = listRef.current;
    if (!item || !list) return;
    cancelScrollRef.current?.();
    cancelScrollRef.current = null;
    // Native focus scrolling may center off-screen items and jump several
    // rows. Keep the page still and reveal only the clipped part of this row.
    item.focus({ preventScroll: true });
    const itemRect = item.getBoundingClientRect();
    const top = list.getBoundingClientRect().top + list.clientTop;
    const bottom = top + list.clientHeight;
    const delta = itemRect.top < top ? itemRect.top - top
      : itemRect.bottom > bottom ? itemRect.bottom - bottom : 0;
    if (delta !== 0) {
      const target = Math.max(0, Math.min(list.scrollHeight - list.clientHeight, list.scrollTop + delta));
      cancelScrollRef.current = smoothScrollTo(list, target, KEYBOARD_SCROLL_MS);
    }
  }

  function focusMenuItem(edge: 'first' | 'last') {
    const items = listRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    focusItem(items?.[edge === 'first' ? 0 : items.length - 1]);
  }

  useLayoutEffect(() => {
    if (moreOpen && pendingFocusRef.current) focusMenuItem(pendingFocusRef.current);
    pendingFocusRef.current = null;
    return () => {
      cancelScrollRef.current?.();
      cancelScrollRef.current = null;
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setMoreOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMoreOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [moreOpen]);
  if (disabled && moreOpen) setMoreOpen(false);

  const pill = (chip: HomeHeroChip, inMenu = false) => (
    <Button key={chip.id}
      className={inMenu ? styles.menuItem : styles.pill}
      role={inMenu ? 'option' : undefined}
      aria-selected={inMenu ? chip.id === activeChipId : undefined}
      disabled={disabled}
      data-chip={chip.id}
      data-testid={`home-hero-type-pill-${chip.id}${inMenu ? '-more' : ''}`}
      onClick={() => { setMoreOpen(false); if (chip.id !== activeChipId) onPick(chip); }}>
      <span className={styles.icon}><Icon name={chip.icon} size={18} /></span>
      <span>{labelFor(chip.id)}</span>
    </Button>
  );

  return (
    <div ref={rootRef} className={styles.row} role="group"
      aria-label={t('homeHero.templatePicker.label')} data-testid="home-hero-type-pills">
      {inlineChips.map((chip) => pill(chip))}
      <div className={styles.moreAnchor}>
        <Button ref={triggerRef} className={`${styles.pill} ${styles.more}`}
          aria-haspopup="listbox" aria-expanded={moreOpen}
          aria-controls={moreOpen ? menuId : undefined} disabled={disabled}
          data-testid="home-hero-type-pills-more"
          onKeyDown={(event) => {
            if (disabled || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
            event.preventDefault();
            const edge = event.key === 'ArrowDown' ? 'first' : 'last';
            if (moreOpen) focusMenuItem(edge);
            else {
              pendingFocusRef.current = edge;
              setMoreOpen(true);
            }
          }}
          onClick={(event) => {
            pendingFocusRef.current = !moreOpen && event.detail === 0 ? 'first' : null;
            setMoreOpen((value) => !value);
          }}>
          {t('homeHero.subTypeMore')}<Icon name="chevron-down" size={14} />
        </Button>
        {moreOpen ? <div ref={menuRef} className={styles.menu} data-side="bottom" data-testid="home-hero-type-pills-popover">
          <div ref={listRef} id={menuId} className={styles.menuList} role="listbox"
            style={{ maxHeight: MENU_LIST_HEIGHT }}
            aria-label={t('homeHero.subTypeMore')}
            onKeyDown={(event) => {
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
                : Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
              if (items[next] !== document.activeElement) focusItem(items[next]);
            }}>{moreChips.map((chip) => pill(chip, true))}</div>
        </div> : null}
      </div>
    </div>
  );
}
