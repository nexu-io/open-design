import { AntonIndicator } from '@open-design/components';

interface SpinnerProps {
  size?: number;
  label?: string;
}

/**
 * Shared pending glyph. The Orbit · Morph status affordance is the Anton
 * Indicator — the component only mounts while its caller is actually
 * pending, so `thinking` is wired to that same boolean by construction.
 * Default sits in the spec's 16–18px inline band.
 */
export function Spinner({ size = 16, label }: SpinnerProps) {
  return (
    <span className="loading-spinner" role="status" aria-live="polite">
      <AntonIndicator state="thinking" size={`${size}px`} />
      {label ? <span className="loading-spinner-label">{label}</span> : null}
    </span>
  );
}

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
}

export function Skeleton({ width, height = 14, radius = 6, className }: SkeletonProps) {
  return (
    <span
      className={`skeleton-block${className ? ` ${className}` : ''}`}
      style={{ width, height, borderRadius: radius }}
      aria-hidden
    />
  );
}

/**
 * Card-shaped skeleton tuned for the DesignsTab grid. Renders a thumb area
 * over the row of meta lines so the empty grid feels like content is
 * arriving rather than missing.
 */
export function DesignCardSkeleton() {
  return (
    <div className="design-card design-card-skeleton" aria-hidden>
      <div className="design-card-thumb skeleton-shimmer" />
      <div className="design-card-meta-block">
        <Skeleton height={13} width="65%" />
        <Skeleton height={11} width="45%" />
      </div>
    </div>
  );
}

/**
 * Centered overlay used while bootstrap data loads (agents, skills, design
 * systems, project list). Sits inside a flex/grid parent and grows with it.
 */
export function CenteredLoader({ label }: { label?: string }) {
  return (
    <div className="centered-loader">
      <Spinner size={20} />
      {label ? <span className="centered-loader-label">{label}</span> : null}
    </div>
  );
}
