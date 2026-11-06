// Shared stacking registry for every toast that mounts fixed at the same
// top-of-viewport anchor (`top: 64px` — see ShareFeedbackToast.module.css and
// `.od-toast.placement-top` in styles/viewer/routines.css). Both the share
// feedback pill (ShareFeedbackToast) and the generic top-placement `Toast`
// (export/version-restore toasts in FileViewer) can be simultaneously true,
// and previously drew on top of each other because each tracked its own
// mount order. Sharing one registry lets whichever toast mounts SECOND -
// regardless of which of the two components it is - offset downward.
//
// The first toast registered keeps the unstyled default position (no inline
// `top`), so the common single-toast screenshots stay byte-identical to
// before this registry existed.
import { useEffect, useRef, useState } from 'react';

let stackOrder: number[] = [];
let nextId = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

/** Registration-order index (0-based) among every currently-mounted
 *  top-anchored toast sharing this registry. */
export function useTopToastStackIndex(): number {
  const idRef = useRef<number | null>(null);
  if (idRef.current === null) idRef.current = ++nextId;
  const [, forceRender] = useState(0);
  useEffect(() => {
    const id = idRef.current;
    if (id === null) return;
    stackOrder = [...stackOrder, id];
    notify();
    const listener = () => forceRender((tick) => tick + 1);
    listeners.add(listener);
    return () => {
      stackOrder = stackOrder.filter((entry) => entry !== id);
      listeners.delete(listener);
      notify();
    };
  }, []);
  return idRef.current === null ? 0 : stackOrder.indexOf(idRef.current);
}

// Approximate single-line toast height (10px+10px padding, 18px line) plus a
// visible gap — close enough that a taller two-line toast above it still
// reads as "stacked", not "touching".
export const TOP_TOAST_STACK_OFFSET_PX = 44;
