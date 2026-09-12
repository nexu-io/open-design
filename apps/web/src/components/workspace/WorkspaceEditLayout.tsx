import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useT } from '../../i18n';
import styles from './WorkspaceEditLayout.module.css';

const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 280;
const MAX_WIDTH = 480;
const DIVIDER_WIDTH = 4;
const MIN_CANVAS_WIDTH = 200;

interface EditDock {
  target: HTMLDivElement | null;
  claim: (owner: string) => void;
  release: (owner: string) => void;
}

const EditDockContext = createContext<EditDock | null>(null);

/** Only the visible viewer can occupy the project inspector; retained viewers
 * keep their edit state without leaving a panel in another file's workspace. */
export function useWorkspaceEditDock(owner: string, visible: boolean) {
  const dock = useContext(EditDockContext);
  const claim = dock?.claim;
  const release = dock?.release;
  useLayoutEffect(() => {
    if (!visible || !claim || !release) return;
    claim(owner);
    return () => release(owner);
  }, [owner, visible, claim, release]);
  return dock;
}

/** A sibling of the preview card, so its background belongs to the app shell. */
export function WorkspaceEditLayout({ children }: { children: ReactNode }) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [preferredWidth, setPreferredWidth] = useState(DEFAULT_WIDTH);
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const cleanupDragRef = useRef<(() => void) | null>(null);
  const active = owner !== null;
  // Preserve a usable canvas in narrow windows without overwriting the user's
  // preferred sidebar width. Widening the window restores that preference.
  const maxWidth = availableWidth === null ? MAX_WIDTH
    : Math.min(MAX_WIDTH, Math.max(0, availableWidth - MIN_CANVAS_WIDTH - DIVIDER_WIDTH));
  const minWidth = Math.min(MIN_WIDTH, maxWidth);
  const width = Math.max(minWidth, Math.min(maxWidth, preferredWidth));
  const claim = useCallback((next: string) => setOwner(next), []);
  const release = useCallback((previous: string) => {
    setOwner(current => current === previous ? null : current);
  }, []);
  const context = useMemo(() => ({ target, claim, release }), [target, claim, release]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => { if (root.clientWidth > 0) setAvailableWidth(root.clientWidth); };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(root);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useLayoutEffect(() => {
    if (!active) cleanupDragRef.current?.();
    return () => cleanupDragRef.current?.();
  }, [active]);

  const changeWidth = (value: number) => setPreferredWidth(Math.max(minWidth, Math.min(maxWidth, value)));

  return (
    <EditDockContext.Provider value={context}>
      <div
        ref={rootRef}
        className={styles.layout}
        data-testid="workspace-edit-layout"
        data-resizing={dragging || undefined}
        style={{ gridTemplateColumns: `minmax(0, 1fr) ${active ? DIVIDER_WIDTH : 0}px ${active ? width : 0}px` }}
      >
        {children}
        <div
          className={styles.divider}
          role="separator"
          aria-label={t('manualEdit.resizePanel')}
          aria-orientation="vertical"
          aria-valuemin={minWidth}
          aria-valuemax={maxWidth}
          aria-valuenow={width}
          hidden={!active}
          tabIndex={active ? 0 : -1}
          onKeyDown={event => {
            const delta = event.shiftKey ? 40 : 10;
            const next = event.key === 'ArrowLeft' ? width + delta
              : event.key === 'ArrowRight' ? width - delta
                : event.key === 'Home' ? minWidth : event.key === 'End' ? maxWidth : null;
            if (next === null) return;
            event.preventDefault();
            changeWidth(next);
          }}
          onPointerDown={event => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            cleanupDragRef.current?.();
            const startX = event.clientX;
            const startWidth = width;
            const startPreference = preferredWidth;
            let frame: number | null = null;
            let pendingX = startX;
            const flush = () => {
              if (frame !== null) cancelAnimationFrame(frame);
              frame = null;
              changeWidth(startWidth + startX - pendingX);
            };
            const move = (e: PointerEvent) => {
              pendingX = e.clientX;
              if (frame === null) frame = requestAnimationFrame(flush);
            };
            const cleanup = () => {
              if (frame !== null) cancelAnimationFrame(frame);
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', end);
              window.removeEventListener('pointercancel', cancel);
              window.removeEventListener('blur', cancel);
              cleanupDragRef.current = null;
              setDragging(false);
            };
            const end = () => { flush(); cleanup(); };
            const cancel = () => { setPreferredWidth(startPreference); cleanup(); };
            cleanupDragRef.current = cleanup;
            setDragging(true);
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', end);
            window.addEventListener('pointercancel', cancel);
            window.addEventListener('blur', cancel);
          }}
        />
        <div
          ref={setTarget}
          className={styles.host}
          data-testid="workspace-edit-dock"
          hidden={!active}
        />
      </div>
    </EditDockContext.Provider>
  );
}
