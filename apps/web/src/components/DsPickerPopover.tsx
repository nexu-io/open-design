import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';

interface PopoverAnchor {
  left: number;
  width: number;
  maxHeight: number;
  sidecarLeft: number;
  sidecarMaxHeight: number;
  sidecarWidth: number;
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
  sidecar?: ReactNode;
  sidecarAriaLabel?: string;
  sidecarClassName?: string;
  sidecarDataTestid?: string;
  children: ReactNode;
}

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
  sidecar,
  sidecarAriaLabel,
  sidecarClassName,
  sidecarDataTestid,
  children,
}: DsPickerPopoverProps) {
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const sidecarRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null);
      return undefined;
    }

    function updateAnchor() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewport = window.innerWidth;
      const width = rect.width;
      const left = Math.max(8, Math.min(viewport - width - 8, rect.left));
      const gap = 6;
      const margin = 12;
      const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
      const spaceAbove = rect.top - gap - margin;
      const openUp = spaceBelow < 280 && spaceAbove > spaceBelow;
      const sidecarGap = 8;
      const sidecarWidth = 320;
      const sidecarLeft =
        left + width + sidecarGap + sidecarWidth <= viewport - 8
          ? left + width + sidecarGap
          : Math.max(8, left - sidecarGap - sidecarWidth);
      const sidecarMaxHeight = Math.max(
        200,
        Math.min(560, openUp ? spaceAbove : spaceBelow),
      );

      if (openUp) {
        setAnchor({
          bottom: window.innerHeight - rect.top + gap,
          left,
          width,
          maxHeight: Math.max(200, Math.min(420, spaceAbove)),
          sidecarLeft,
          sidecarMaxHeight,
          sidecarWidth,
        });
      } else {
        setAnchor({
          top: rect.bottom + gap,
          left,
          width,
          maxHeight: Math.max(200, Math.min(420, spaceBelow)),
          sidecarLeft,
          sidecarMaxHeight,
          sidecarWidth,
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
      if (sidecarRef.current?.contains(target)) return;
      onRequestClose();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onRequestClose();
    }

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
    <>
      <div
        ref={popoverRef}
        className={`ds-picker-popover ds-picker-popover--portal${className ? ` ${className}` : ''}`}
        role={role}
        id={id}
        aria-label={ariaLabel}
        aria-multiselectable={ariaMultiselectable}
        data-testid={dataTestid}
        style={{
          top: anchor.top ?? 'auto',
          bottom: anchor.bottom ?? 'auto',
          left: anchor.left,
          width: anchor.width,
          maxHeight: anchor.maxHeight,
        }}
      >
        {children}
      </div>
      {sidecar ? (
        <aside
          ref={sidecarRef}
          className={`ds-picker-sidecar ds-picker-sidecar--portal${sidecarClassName ? ` ${sidecarClassName}` : ''}`}
          aria-label={sidecarAriaLabel}
          data-testid={sidecarDataTestid}
          style={{
            top: anchor.top ?? 'auto',
            bottom: anchor.bottom ?? 'auto',
            left: anchor.sidecarLeft,
            width: anchor.sidecarWidth,
            maxHeight: anchor.sidecarMaxHeight,
          }}
        >
          {sidecar}
        </aside>
      ) : null}
    </>,
    document.body,
  );
}
