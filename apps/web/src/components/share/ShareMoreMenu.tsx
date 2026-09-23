import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
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

/** Disclosure only: deployment, permissions and pending work remain owned by the host. */
export function ShareMoreMenu({ label, items }: { label: string; items: readonly ShareMoreAction[] }) {
  const [open, setOpen] = useState(false);
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
  useEffect(() => {
    if (!open) return;
    const buttons = enabledItems();
    (startAtEnd.current ? buttons.at(-1) : buttons[0])?.focus();
    if (!buttons.length) menu.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return (
    <div ref={root} className={styles.root} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={event => {
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
      <div ref={menu} id={id} role="menu" aria-label={label} tabIndex={-1} hidden={!open} className={styles.menu}>
        {items.map(item => <Button key={item.id} type="button" role="menuitem" tabIndex={-1}
          className={styles.item} disabled={item.disabled} title={item.title}
          onClick={() => { if (item.disabled) return; dismiss(true); item.onSelect(); }}>
          {item.icon}<span>{item.label}</span>
        </Button>)}
      </div>
    </div>
  );
}
