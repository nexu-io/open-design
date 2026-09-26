import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import styles from './ShareMoreMenu.module.css';

interface ShareMoreAction {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
  onSelect: () => void;
}

const MENU_WIDTH = 214;
const VIEWPORT_GUTTER = 8;
const MENU_GAP = 6;

/** Disclosure only: deployment, permissions and pending work remain owned by the host. */
export function ShareMoreMenu({ label, items }: { label: string; items: readonly ShareMoreAction[] }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const startAtEnd = useRef(false);
  function enabledItems() {
    return Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
  }
  function dismiss(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }
  useLayoutEffect(() => {
    if (!open) return;
    const placeMenu = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const maxWidth = Math.max(0, viewportWidth - VIEWPORT_GUTTER * 2);
      const width = Math.min(MENU_WIDTH, maxWidth);
      // Design S12: a dropdown directly under the header "···", right-aligned
      // to the header tool group (the close button's outer edge) and layered
      // over the share panel's own content — not a flyout beside the panel.
      const toolsRight = root.current?.parentElement?.getBoundingClientRect().right ?? anchor.right;
      const left = Math.max(VIEWPORT_GUTTER, Math.min(toolsRight - width, viewportWidth - width - VIEWPORT_GUTTER));
      const menuHeight = menu.current?.getBoundingClientRect().height ?? 0;
      const below = anchor.bottom + MENU_GAP;
      const top = below + menuHeight + VIEWPORT_GUTTER <= window.innerHeight
        ? below
        : Math.max(VIEWPORT_GUTTER, anchor.top - MENU_GAP - menuHeight);
      setPosition({ position: 'fixed', left, top, width, maxWidth: `calc(100vw - ${VIEWPORT_GUTTER * 2}px)` });
    };
    placeMenu();
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    return () => {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const buttons = enabledItems();
    (startAtEnd.current ? buttons.at(-1) : buttons[0])?.focus();
    if (!buttons.length) menu.current?.focus();
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !root.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const menuNode = (
    <div ref={menu} id={id} role="menu" aria-label={label} tabIndex={-1} hidden={!open} style={open ? position : undefined} className={styles.menu}
      onKeyDown={event => {
        if (!open) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          dismiss(true);
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          const buttons = enabledItems();
          const index = buttons.findIndex(button => button === document.activeElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
      }}>
      {items.map(item => <Button key={item.id} type="button" role="menuitem" tabIndex={-1}
        className={styles.item} disabled={item.disabled} title={item.title}
        onClick={() => { if (item.disabled) return; dismiss(true); item.onSelect(); }}>
        {item.icon}<span>{item.label}</span>
      </Button>)}
    </div>
  );
  return (
    <div ref={root} className={styles.root} onBlur={event => {
      const next = event.relatedTarget;
      if (!(next instanceof Node) || (!root.current?.contains(next) && !menu.current?.contains(next))) setOpen(false);
    }}>
      <Button ref={trigger} type="button" className={styles.trigger} aria-label={label}
        aria-haspopup="menu" aria-expanded={open} aria-controls={id}
        onClick={() => { startAtEnd.current = false; setOpen(value => !value); }}
        onKeyDown={event => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            event.stopPropagation();
            startAtEnd.current = event.key === 'ArrowUp';
            setOpen(true);
          }
        }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
          <circle cx="3" cy="8" r="1" /><circle cx="8" cy="8" r="1" /><circle cx="13" cy="8" r="1" />
        </svg>
      </Button>
      {typeof document !== 'undefined' ? createPortal(menuNode, document.body) : null}
    </div>
  );
}
