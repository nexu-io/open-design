// Boot loader: a 5×5 dot matrix pulsing as a wave that radiates out from a
// solid core. Rendered by the dynamic-import shell in `app/[[...slug]]/
// client-app.tsx` before `src/App` arrives, so it stays dependency-free and
// animates from CSS alone rather than waiting on any JS of ours to drive it.
//
// Dots inherit `currentColor` so the shell's `--text-muted` carries them in
// both themes. The source asset painted them near-white (#DEDDDD) with a
// screen-blend bloom for a dark canvas; that combination is invisible on the
// light shell, and the bloom is a no-op once the dots aren't near-white.
// Motion lives in MatrixLoader.module.css — see its header for why the
// asset's SMIL <animate> elements don't survive React.

import styles from './MatrixLoader.module.css';

// Which opacity track a dot plays is a pure function of its squared distance
// from the center cell, so the wave's phase and amplitude both fall out of the
// geometry. A number is a fixed opacity — the core holds steady while
// everything beyond it pulses. On a 5×5 grid the only distances are
// 0/1/2/4/5/8, and 8 (the corners) is the default.
type PulseTrack = 'inner' | 'axis' | 'edge' | 'far';

function pulseForDistance(distance: number): PulseTrack | number {
  switch (distance) {
    case 0:
      return 1; // center, always solid
    case 1:
      return 0.8; // orthogonal neighbours, always lit
    case 2:
      return 'inner';
    case 4:
      return 'axis';
    case 5:
      return 'edge';
    default:
      return 'far';
  }
}

const CELLS = [0, 1, 2, 3, 4];
const CENTER = 2;
// viewBox units: cell centers at 8/27/46/65/84, dot radius 8.
const cellToCoord = (index: number) => 8 + index * 19;

export function MatrixLoader({ size = 26 }: { size?: number }) {
  return (
    <svg
      className={styles.loader}
      width={size}
      height={size}
      viewBox="0 0 92 92"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {CELLS.map((row) =>
        CELLS.map((col) => {
          const pulse = pulseForDistance((col - CENTER) ** 2 + (row - CENTER) ** 2);
          const key = `${col}-${row}`;
          const shared = {
            cx: cellToCoord(col),
            cy: cellToCoord(row),
            r: 8,
          };
          return typeof pulse === 'number' ? (
            <circle key={key} {...shared} opacity={pulse} />
          ) : (
            <circle key={key} {...shared} className={styles[pulse]} />
          );
        }),
      )}
    </svg>
  );
}
