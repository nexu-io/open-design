import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type MutableRefObject,
  type ReactElement,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';

interface Props {
  text: string;
  children: ReactElement;
}

interface Position {
  top: number;
  left: number;
}

type TriggerProps = {
  ref?: Ref<HTMLElement>;
  'aria-describedby'?: string;
  onMouseEnter?: (event: MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (event: MouseEvent<HTMLElement>) => void;
  onFocus?: (event: FocusEvent<HTMLElement>) => void;
  onBlur?: (event: FocusEvent<HTMLElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
};

export default function Tooltip({ text, children }: Props) {
  const tooltipText = text.trim();
  const id = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);

  useEffect(() => {
    if (!open) return;

    const positionBubble = () => {
      const trigger = triggerRef.current;
      const bubble = bubbleRef.current;
      if (!trigger || !bubble) return;

      const triggerRect = trigger.getBoundingClientRect();
      const bubbleRect = bubble.getBoundingClientRect();
      const margin = 8;
      const top =
        triggerRect.top >= bubbleRect.height + margin * 2
          ? triggerRect.top - bubbleRect.height - margin
          : triggerRect.bottom + margin;
      const centeredLeft = triggerRect.left + triggerRect.width / 2 - bubbleRect.width / 2;
      const left = Math.max(
        margin,
        Math.min(window.innerWidth - bubbleRect.width - margin, centeredLeft),
      );

      setPosition({ top, left });
    };

    positionBubble();
    window.addEventListener('resize', positionBubble);
    window.addEventListener('scroll', positionBubble, true);
    return () => {
      window.removeEventListener('resize', positionBubble);
      window.removeEventListener('scroll', positionBubble, true);
    };
  }, [open, tooltipText]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!tooltipText || !isValidElement<TriggerProps>(children)) {
    return children;
  }

  const child = children as ReactElement<TriggerProps>;
  const describedBy = [child.props['aria-describedby'], id]
    .filter(Boolean)
    .join(' ');

  const show = () => {
    setPosition(null);
    setOpen(true);
  };

  const setTriggerRef = (node: HTMLElement | null) => {
    triggerRef.current = node;

    const { ref } = child as ReactElement & { ref?: Ref<HTMLElement> };
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref && typeof ref === 'object') {
      (ref as MutableRefObject<HTMLElement | null>).current = node;
    }
  };

  const trigger = cloneElement(child, {
    ref: setTriggerRef,
    'aria-describedby': describedBy,
    onMouseEnter: (event: MouseEvent<HTMLElement>) => {
      child.props.onMouseEnter?.(event);
      show();
    },
    onMouseLeave: (event: MouseEvent<HTMLElement>) => {
      child.props.onMouseLeave?.(event);
      setOpen(false);
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      child.props.onFocus?.(event);
      show();
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      child.props.onBlur?.(event);
      setOpen(false);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      child.props.onKeyDown?.(event);
      if (event.key === 'Escape') setOpen(false);
    },
  });

  return (
    <>
      {trigger}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={bubbleRef}
              id={id}
              role="tooltip"
              style={{
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                position: 'fixed',
                zIndex: 50,
                pointerEvents: 'none',
                maxWidth: 240,
                borderRadius: 6,
                background: 'var(--text-strong)',
                color: 'var(--bg-panel)',
                padding: '5px 8px',
                fontSize: 12,
                fontWeight: 500,
                lineHeight: 1.2,
                boxShadow: 'var(--shadow-md)',
                whiteSpace: 'normal',
                visibility: position ? 'visible' : 'hidden',
              }}
            >
              {tooltipText}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
