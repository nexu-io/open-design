import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import { useT } from '../../i18n';
import { Icon } from '../Icon';
import { chatSeam } from './ChatRoot';
import styles from './WorkspaceComposerDock.module.css';

export type ConversationPlacement = 'full' | 'left' | 'right';

export function WorkspaceComposerHeader({ title, expanded = false, owner, onExpand, onDrag, onPlacementChange, onMinimize }: {
  title: string;
  expanded?: boolean;
  owner?: string;
  onExpand?: () => void;
  /** Pointer delta since the previous move while the grip is held. */
  onDrag?: (dx: number, dy: number) => void;
  onPlacementChange?: (placement: ConversationPlacement) => void;
  onMinimize?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuLayer = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const menuReady = Boolean(anchor);
  const dragFrom = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const updateAnchor = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };
    updateAnchor();
    window.addEventListener('resize', updateAnchor);
    window.addEventListener('scroll', updateAnchor, true);
    return () => {
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)
        && !menuLayer.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open, menuReady]);

  const actions = [
    { value: 'left', label: t('chat.moveLeftPane'), icon: 'arrow-left' },
    { value: 'right', label: t('chat.moveRightPane'), icon: 'arrow-right' },
  ] as const;

  return <div ref={root} className={styles.headerReveal} data-expanded={expanded || undefined} data-menu-open={open || undefined}>
    <div className={styles.headerClip}>
      <div className={styles.header}>
        <span className={styles.grip} data-testid="chat-composer-drag-handle" aria-hidden
          onPointerDown={event => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            dragFrom.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerMove={event => {
            const from = dragFrom.current;
            if (!from) return;
            dragFrom.current = { x: event.clientX, y: event.clientY };
            onDrag?.(event.clientX - from.x, event.clientY - from.y);
          }}
          onPointerUp={() => { dragFrom.current = null; }}
          onPointerCancel={() => { dragFrom.current = null; }}>
          <Icon name="draggable" size={16} />
        </span>
        <Button className={styles.title} onClick={onExpand} title={title}
          data-testid="chat-composer-expand" aria-expanded={expanded}
          aria-label={t(expanded ? 'chat.collapsePane' : 'workspace.showChat')}>
          <span>{title}</span>
        </Button>
        <Button ref={trigger} className={styles.options} aria-label={t('chat.dockOptions')}
          aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
          onClick={() => setOpen(value => !value)}>
          <Icon name="more-horizontal" size={18} />
        </Button>
      </div>
    </div>
    {open && anchor && createPortal(<div ref={menuLayer} {...chatSeam(styles.menuLayer)} style={anchor}
      data-workspace-conversation-owner={owner}>
      <div ref={menu} id={menuId} className={styles.menu} role="menu" aria-label={t('chat.dockOptions')}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
        }
        const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'ArrowDown' ? (index + 1) % items.length
          : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
        if (next !== null) { event.preventDefault(); items[next]?.focus(); }
      }}>
      {actions.map(action => <Button key={action.value} className={styles.menuItem} role="menuitem"
        onClick={() => { setOpen(false); onPlacementChange?.(action.value); }}>
        <Icon name={action.icon} size={18} /><span>{action.label}</span>
      </Button>)}
      <Button className={styles.menuItem} role="menuitem"
        onClick={() => { setOpen(false); onMinimize?.(); }}>
        <Icon name="minus" size={18} /><span>{t('chat.minimizeConversation')}</span>
      </Button>
      </div>
    </div>, document.body)}
  </div>;
}
