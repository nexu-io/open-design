import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';
type InputModality = 'keyboard' | 'pointer';

interface TooltipState {
  target: HTMLElement;
  text: string;
  placement: TooltipPlacement;
  style: {
    x: number;
    y: number;
    visibility: 'hidden' | 'visible';
  };
}

const TOOLTIP_MARGIN = 8;
const TOOLTIP_GAP = 7;

function isTooltipTarget(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement
    && el.classList.contains('od-tooltip')
    && Boolean(el.dataset.tooltip?.trim())
    && el.getAttribute('aria-expanded') !== 'true';
}

function readTooltipTarget(start: EventTarget | null): HTMLElement | null {
  if (!(start instanceof Element)) return null;
  const candidate = start.closest('.od-tooltip[data-tooltip]');
  return isTooltipTarget(candidate) ? candidate : null;
}

function tooltipPlacement(target: HTMLElement): TooltipPlacement {
  const raw = target.dataset.tooltipPlacement;
  return raw === 'bottom' || raw === 'left' || raw === 'right' ? raw : 'top';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function positionTooltip(
  target: HTMLElement,
  tooltip: HTMLElement,
  placement: TooltipPlacement,
): TooltipState['style'] {
  const rect = target.getBoundingClientRect();
  const tip = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxLeft = Math.max(TOOLTIP_MARGIN, viewportWidth - tip.width - TOOLTIP_MARGIN);
  const maxTop = Math.max(TOOLTIP_MARGIN, viewportHeight - tip.height - TOOLTIP_MARGIN);

  let left = rect.left + rect.width / 2 - tip.width / 2;
  let top = rect.top - tip.height - TOOLTIP_GAP;

  if (placement === 'bottom') {
    top = rect.bottom + TOOLTIP_GAP;
  } else if (placement === 'left') {
    left = rect.left - tip.width - TOOLTIP_GAP;
    top = rect.top + rect.height / 2 - tip.height / 2;
  } else if (placement === 'right') {
    left = rect.right + TOOLTIP_GAP;
    top = rect.top + rect.height / 2 - tip.height / 2;
  }

  return {
    x: Math.round(clamp(left, TOOLTIP_MARGIN, maxLeft)),
    y: Math.round(clamp(top, TOOLTIP_MARGIN, maxTop)),
    visibility: 'visible',
  };
}

function sameStyle(
  left: TooltipState['style'],
  right: TooltipState['style'],
): boolean {
  return left.x === right.x
    && left.y === right.y
    && left.visibility === right.visibility;
}

export function TooltipLayer() {
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastInputRef = useRef<InputModality>('pointer');
  const suppressedTitleRef = useRef<{ target: HTMLElement; title: string } | null>(null);
  const [state, setState] = useState<TooltipState | null>(null);

  const restoreNativeTitle = useCallback(() => {
    const suppressed = suppressedTitleRef.current;
    if (!suppressed) return;
    if (document.contains(suppressed.target)) {
      if (!suppressed.target.hasAttribute('title')) {
        suppressed.target.setAttribute('title', suppressed.title);
      }
      suppressed.target.removeAttribute('data-od-tooltip-native-title');
    }
    suppressedTitleRef.current = null;
  }, []);

  const suppressNativeTitle = useCallback((target: HTMLElement) => {
    if (suppressedTitleRef.current?.target === target) return;
    restoreNativeTitle();
    const title = target.getAttribute('title');
    if (!title) return;
    target.setAttribute('data-od-tooltip-native-title', title);
    target.removeAttribute('title');
    suppressedTitleRef.current = { target, title };
  }, [restoreNativeTitle]);

  const hideTooltip = useCallback((options: { restoreTitle?: boolean } = {}) => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (options.restoreTitle !== false) restoreNativeTitle();
    setState(null);
  }, [restoreNativeTitle]);

  const hideTooltipForActivation = useCallback((target: HTMLElement | null) => {
    if (!target) {
      hideTooltip();
      return;
    }
    suppressNativeTitle(target);
    hideTooltip({ restoreTitle: false });
  }, [hideTooltip, suppressNativeTitle]);

  const showTooltip = useCallback((target: HTMLElement) => {
    const text = target.dataset.tooltip?.trim();
    if (!text) return;
    suppressNativeTitle(target);
    const placement = tooltipPlacement(target);
    setState((current) => {
      if (current?.target === target) {
        if (current.text === text && current.placement === placement) return current;
        return { ...current, text, placement };
      }
      return {
        target,
        text,
        placement,
        style: { x: 0, y: 0, visibility: 'hidden' },
      };
    });
  }, [suppressNativeTitle]);

  const updatePosition = useCallback(() => {
    setState((current) => {
      if (!current) return null;
      if (!document.contains(current.target)) return null;
      if (current.target.getAttribute('aria-expanded') === 'true') return null;
      const node = tooltipRef.current;
      if (!node) return current;
      const placement = tooltipPlacement(current.target);
      const nextText = current.target.dataset.tooltip?.trim() ?? current.text;
      const nextStyle = positionTooltip(current.target, node, placement);
      if (
        current.text === nextText
        && current.placement === placement
        && sameStyle(current.style, nextStyle)
      ) {
        return current;
      }
      return {
        ...current,
        text: nextText,
        placement,
        style: nextStyle,
      };
    });
  }, []);

  const scheduleUpdatePosition = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      updatePosition();
    });
  }, [updatePosition]);

  useLayoutEffect(() => {
    if (!state) return;
    updatePosition();
  }, [state?.target, state?.text, state?.placement, updatePosition]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      restoreNativeTitle();
    };
  }, [restoreNativeTitle]);

  useEffect(() => {
    if (!state?.target || typeof MutationObserver === 'undefined') return;
    const target = state.target;
    const observer = new MutationObserver(() => {
      if (!isTooltipTarget(target)) {
        hideTooltip({ restoreTitle: false });
      }
    });
    observer.observe(target, {
      attributes: true,
      attributeFilter: ['aria-expanded', 'class', 'data-tooltip', 'disabled'],
    });
    return () => observer.disconnect();
  }, [hideTooltip, state?.target]);

  useEffect(() => {
    const shouldShowForFocus = (target: HTMLElement) => {
      if (lastInputRef.current === 'keyboard') return true;
      try {
        return target.matches(':focus-visible');
      } catch {
        return false;
      }
    };
    const onPointerOver = (event: PointerEvent) => {
      lastInputRef.current = 'pointer';
      const target = readTooltipTarget(event.target);
      if (target) showTooltip(target);
    };
    const onPointerOut = (event: PointerEvent) => {
      const target = readTooltipTarget(event.target);
      if (!target) return;
      const next = event.relatedTarget;
      if (next instanceof Node && target.contains(next)) return;
      hideTooltip();
    };
    const onPointerDown = (event: PointerEvent) => {
      lastInputRef.current = 'pointer';
      hideTooltipForActivation(readTooltipTarget(event.target));
    };
    const onPointerCancel = () => {
      lastInputRef.current = 'pointer';
      hideTooltip();
    };
    const onClick = (event: MouseEvent) => {
      hideTooltipForActivation(readTooltipTarget(event.target));
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = readTooltipTarget(event.target);
      if (!target) return;
      if (shouldShowForFocus(target)) {
        showTooltip(target);
        return;
      }
      suppressNativeTitle(target);
    };
    const onFocusOut = (event: FocusEvent) => {
      const target = readTooltipTarget(event.target);
      if (!target) return;
      const next = event.relatedTarget;
      if (next instanceof Node && target.contains(next)) return;
      hideTooltip();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      lastInputRef.current = 'keyboard';
      if (event.key === 'Escape') hideTooltip();
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        hideTooltipForActivation(readTooltipTarget(event.target));
      }
    };

    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointercancel', onPointerCancel);
    document.addEventListener('click', onClick);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', scheduleUpdatePosition);
    window.addEventListener('scroll', scheduleUpdatePosition, true);
    return () => {
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointercancel', onPointerCancel);
      document.removeEventListener('click', onClick);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', scheduleUpdatePosition);
      window.removeEventListener('scroll', scheduleUpdatePosition, true);
    };
  }, [hideTooltip, hideTooltipForActivation, scheduleUpdatePosition, showTooltip, suppressNativeTitle]);

  if (!state || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className="od-tooltip-layer"
      role="tooltip"
      style={{
        transform: `translate3d(${state.style.x}px, ${state.style.y}px, 0)`,
        visibility: state.style.visibility,
      }}
    >
      {state.text}
    </div>,
    document.body,
  );
}
