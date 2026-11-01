// Thin `Toast` wrapper for the top-of-viewport placement (export progress,
// version-restored confirmation) so it shares ONE stacking registry with
// ShareFeedbackToast (see ./toast-stack) instead of both drawing at the same
// fixed `top: 64px` anchor. Registration is tied to this component's own
// mount/unmount — not to a hook call in the always-mounted FileViewer body —
// so the stack slot is only reserved while the toast is actually visible.
import { Toast, type ToastProps } from '../Toast';
import { useTopToastStackIndex, TOP_TOAST_STACK_OFFSET_PX } from './toast-stack';

export function TopStackedToast(props: Omit<ToastProps, 'placement' | 'topOffsetPx'>) {
  const stackIndex = useTopToastStackIndex();
  return (
    <Toast
      {...props}
      placement="top"
      topOffsetPx={stackIndex > 0 ? stackIndex * TOP_TOAST_STACK_OFFSET_PX : undefined}
    />
  );
}
