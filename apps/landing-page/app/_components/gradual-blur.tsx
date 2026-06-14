/*
 * GradualBlur — SSR adaptation of the React Bits "Gradual Blur" component
 * (https://reactbits.dev/animations/gradual-blur, MIT; original by Ansh —
 * github.com/ansh-dhanani).
 *
 * The upstream component is hooks-based (useState/useEffect/Intersection
 * Observer, hover, responsive recompute). This landing page renders to
 * static markup and ships no React runtime to the browser, so none of that
 * client behaviour can run here. We therefore keep the upstream *visual*
 * algorithm verbatim — same curve functions, same blur formula, same
 * four-stop mask percentages — and emit the layered <div>s at render time
 * as plain inline-styled elements. Client-only props (animated, hover,
 * responsive, preset, onAnimationComplete) are intentionally dropped.
 *
 * Used here to blur the hero *background image* only: rendered inside the
 * `.hero` section with `target="parent"` and a z-index that sits above the
 * background image but below the hero copy, so the artwork fades into a
 * progressive blur at the bottom edge while the headline stays crisp.
 */

import type { CSSProperties } from 'react';

type Position = 'top' | 'bottom' | 'left' | 'right';
type Curve = 'linear' | 'bezier' | 'ease-in' | 'ease-out' | 'ease-in-out';

interface GradualBlurProps {
  position?: Position;
  strength?: number;
  height?: string;
  /** Custom width; defaults to 100% (vertical) or `height` (horizontal). */
  width?: string;
  divCount?: number;
  exponential?: boolean;
  curve?: Curve;
  opacity?: number;
  /** `'parent'` → absolute within the positioned parent; `'page'` → fixed. */
  target?: 'parent' | 'page';
  zIndex?: number;
  className?: string;
  style?: CSSProperties;
}

// Progress easing functions — identical set to the upstream component.
const CURVE_FUNCTIONS: Record<Curve, (p: number) => number> = {
  linear: (p) => p,
  bezier: (p) => p * p * (3 - 2 * p),
  'ease-in': (p) => p * p,
  'ease-out': (p) => 1 - Math.pow(1 - p, 2),
  'ease-in-out': (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
};

const getGradientDirection = (position: Position): string =>
  ({ top: 'to top', bottom: 'to bottom', left: 'to left', right: 'to right' }[
    position
  ] || 'to bottom');

export function GradualBlur({
  position = 'bottom',
  strength = 2,
  height = '6rem',
  width,
  divCount = 5,
  exponential = false,
  curve = 'linear',
  opacity = 1,
  target = 'parent',
  zIndex = 1000,
  className = '',
  style,
}: GradualBlurProps = {}) {
  const increment = 100 / divCount;
  const curveFunc = CURVE_FUNCTIONS[curve] || CURVE_FUNCTIONS.linear;
  const direction = getGradientDirection(position);

  // Layer generation mirrors the upstream `blurDivs` loop exactly.
  const layers = [] as JSX.Element[];
  for (let i = 1; i <= divCount; i++) {
    const progress = curveFunc(i / divCount);
    const blurValue = exponential
      ? Math.pow(2, progress * 4) * 0.0625 * strength
      : 0.0625 * (progress * divCount + 1) * strength;

    const p1 = Math.round((increment * i - increment) * 10) / 10;
    const p2 = Math.round(increment * i * 10) / 10;
    const p3 = Math.round((increment * i + increment) * 10) / 10;
    const p4 = Math.round((increment * i + increment * 2) * 10) / 10;

    let gradient = `transparent ${p1}%, black ${p2}%`;
    if (p3 <= 100) gradient += `, black ${p3}%`;
    if (p4 <= 100) gradient += `, transparent ${p4}%`;

    const mask = `linear-gradient(${direction}, ${gradient})`;
    const blur = `blur(${blurValue.toFixed(3)}rem)`;
    layers.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          inset: 0,
          opacity,
          maskImage: mask,
          WebkitMaskImage: mask,
          backdropFilter: blur,
          WebkitBackdropFilter: blur,
        }}
      />,
    );
  }

  const isVertical = position === 'top' || position === 'bottom';
  const isPage = target === 'page';

  const containerStyle: CSSProperties = {
    position: isPage ? 'fixed' : 'absolute',
    pointerEvents: 'none',
    zIndex: isPage ? zIndex + 100 : zIndex,
    [position]: 0,
    ...(isVertical
      ? { left: 0, right: 0, height, width: width || '100%' }
      : { top: 0, bottom: 0, width: width || height, height: '100%' }),
    ...style,
  };

  return (
    <div
      className={`gradual-blur ${
        isPage ? 'gradual-blur-page' : 'gradual-blur-parent'
      } ${className}`.trim()}
      aria-hidden='true'
      style={containerStyle}
    >
      <div
        className='gradual-blur-inner'
        style={{ position: 'relative', width: '100%', height: '100%' }}
      >
        {layers}
      </div>
    </div>
  );
}
