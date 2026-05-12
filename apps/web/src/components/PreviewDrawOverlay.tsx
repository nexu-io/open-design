import type { ReactNode } from 'react';

// Stub pass-through. The full draw-annotation overlay is a work-in-progress
// in a separate branch; until it lands, render children unchanged so the
// preview iframe still mounts and the surrounding viewer logic isn't blocked.
export function PreviewDrawOverlay({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
