import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';

/**
 * Viewport-anchored placement for a portaled `.ds-picker-popover`.
 *
 * The in-modal pickers (platform / design system / model / prompt template)
 * live inside `.newproj-body`, which is an `overflow-y: auto` scroll container,
 * and amongst `.newproj-section` siblings that each form their own stacking
 * context (a `transform` is retained by their `animation: … both` entrance).
 * An inline `position: absolute` popover is therefore both clipped by the
 * scroll box and unable to reliably paint above later sibling sections. This
 * shape mirrors the proven trigger-anchored placement in `DesignSystemPicker`
 * so the popover can be portaled to `document.body` and escape both traps.
 */
interface PopoverAnchor {
  left: number;
  width: number;
  maxHeight: number;
  // Vertical placement: open downward (anchored by `top`) by default, or
  // upward (anchored by `bottom`) when the trigger sits near the viewport
  // bottom with more room above than below.
  top?: number;
  bottom?: number;
}

interface DsPickerPopoverProps {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  onRequestClose: () => void;
  className?: string;
  role?: string;
  id?: string;
  ariaLabel?: string;
  ariaMultiselectable?: boolean;
  dataTestid?: string;
  children: ReactNode;
}

/**
 * Portaled, trigger-anchored popover for the New Project modal pickers.
 *
 * Owns placement (`getBoundingClientRect` + reposition on scroll/resize),
 * `document.body` portaling, and the outside-click / Escape dismissal that each
 * picker previously duplicated inline. The trigger and the portaled popover are
 * both treated as "inside" so clicking either does not self-close.
 */
export function DsPickerPopover({
  open,
  triggerRef,
  onRequestClose,
  className,
  role,
  id,
  ariaLabel,
  ariaMultiselectable,
  dataTestid,
  children,
}: DsPickerPopoverProps) {
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null);
      return undefined;
    }
    if (!triggerRef.current) return undefined;
    function updateAnchor() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewport = window.innerWidth;
      // Match the trigger width — these dropdowns historically rendered
      // edge-to-edge with their trigger (`left: 0; right: 0`).
      const width = rect.width;
      const left = Math.max(8, Math.min(viewport - width - 8, rect.left));
      const gap = 6;
      const margin = 12;
      const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
      const spaceAbove = rect.top - gap - margin;
      const openUp = spaceBelow < 280 && spaceAbove > spaceBelow;
      if (openUp) {
        setAnchor({
          bottom: window.innerHeight - rect.top + gap,
          left,
          width,
          maxHeight: Math.max(200, Math.min(420, spaceAbove)),
        });
      } else {
        setAnchor({
          top: rect.bottom + gap,
          left,
          width,
          maxHeight: Math.max(200, Math.min(420, spaceBelow)),
        });
      }
    }
    updateAnchor();
    window.addEventListener('resize', updateAnchor);
    window.addEventListener('scroll', updateAnchor, true);
    return () => {
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor, true);
    };
  }, [open, triggerRef]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      onRequestClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onRequestClose();
    }
    // Defer listener registration by a tick so the click that opened the
    // popover isn't re-interpreted as an outside-click in the same cycle
    // (StrictMode also double-invokes the effect, which can race the event).
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointer);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onRequestClose, triggerRef]);

  if (!open || !anchor || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={popoverRef}
      className={`ds-picker-popover ds-picker-popover--portal${className ? ` ${className}` : ''}`}
      role={role}
      id={id}
      aria-label={ariaLabel}
      aria-multiselectable={ariaMultiselectable}
      data-testid={dataTestid}
      style={{
        top: anchor.top,
        bottom: anchor.bottom,
        left: anchor.left,
        width: anchor.width,
        maxHeight: anchor.maxHeight,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
