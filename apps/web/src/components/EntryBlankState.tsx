import { useId } from 'react';
import { Icon } from './Icon';

interface Props {
  heading: string;
  description: string;
  actionLabel: string;
  onCreate: () => void;
}

/**
 * Inline SVG remake of the old `/drafts-empty-mark.png` mark (sans the PNG's
 * blueprint guide lines — product dropped them). Geometry is lifted from
 * `clipper/assets/mark.svg`; the gradient axis and stops are sampled from the
 * PNG so the resting frame is pixel-faithful. Being real strokes (normalized
 * via pathLength) lets hover replay a draw-on demo that always settles back
 * to this exact resting frame. The viewBox keeps the PNG's framing so the
 * mark's on-page size and position are unchanged.
 */
function BlankMark() {
  const gradientId = useId();
  return (
    <svg
      className="entry-blank__mark"
      viewBox="-6 -5.9 104.7 104.7"
      width="168"
      height="168"
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1="46.4"
          y1="75.9"
          x2="75.1"
          y2="46.4"
        >
          <stop offset="0" stopColor="#01220b" />
          <stop offset="0.5" stopColor="#016a21" />
          <stop offset="1" stopColor="#00b238" />
        </linearGradient>
      </defs>
      <g
        stroke={`url(#${gradientId})`}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          className="entry-blank__mark-line"
          pathLength={1}
          d="M46.3765 17.8047C62.2253 17.8047 75.0733 30.6527 75.0733 46.5015C75.0732 62.3503 62.2253 75.1983 46.3765 75.1983H21.4977C19.3845 75.1983 17.6798 73.4938 17.6798 71.3806C17.6798 64.9804 17.6797 52.2256 17.6797 46.5015C17.6797 30.6527 30.5277 17.8047 46.3765 17.8047Z"
        />
        <circle
          className="entry-blank__mark-line"
          pathLength={1}
          cx="46.3766"
          cy="46.5016"
          r="22.9575"
        />
        <path
          className="entry-blank__mark-line entry-blank__mark-line--cursor"
          pathLength={1}
          d="M44.5871 59.9762L35.8379 36.9521C35.5548 36.207 36.2825 35.4765 37.0227 35.7628L60.0576 44.6746C61.0056 45.0413 60.7444 46.4564 59.7287 46.4564H46.3592V59.6471C46.3592 60.6699 44.9502 60.9315 44.5871 59.9762Z"
        />
      </g>
    </svg>
  );
}

export function EntryBlankState({
  heading,
  description,
  actionLabel,
  onCreate,
}: Props) {
  return (
    <div className="entry-section">
      <header className="entry-section__head">
        <h1 className="entry-section__title">{heading}</h1>
      </header>
      <div className="entry-blank">
        <BlankMark />
        <p className="entry-blank__desc">{description}</p>
        <button type="button" className="entry-blank__cta" onClick={onCreate}>
          <Icon name="plus" size={15} /> {actionLabel}
        </button>
      </div>
    </div>
  );
}
