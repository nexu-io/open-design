import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useDismissOnOutsideInteraction } from '../../hooks/useDismissOnOutsideInteraction';
import styles from './TabContextMenu.module.css';

export interface TabContextMenuItem {
  label: string;
  disabled: boolean;
  onSelect: () => void;
}

const EDGE = 8;

// Right-click menu for a workspace tab (#9567). Opens at the pointer, clamped
// to the viewport. Escape returns focus to the tab; an outside press does not.
export function TabContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: TabContextMenuItem[];
  onClose: (restoreFocus: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useDismissOnOutsideInteraction(true, ref, () => onClose(false));

  useLayoutEffect(() => {
    const menu = ref.current!;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE)),
      top: Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE)),
    });
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [x, y]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose(true);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    buttons[(index + step + buttons.length) % buttons.length]?.focus();
  }

  return createPortal(
    <div ref={ref} role="menu" className={styles.menu} style={position} onKeyDown={onKeyDown}>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={styles.item}
          disabled={item.disabled}
          onClick={item.onSelect}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
