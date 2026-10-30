import { useEffect, useRef, useState, type FocusEvent } from 'react';

// Border beam on a prompt card (styles/home/composer-beam.css), shared by
// Home's composer and the project composer wearing Home's input. Mirrors
// border-beam's own active/fading contract so blur fades the light out over
// 0.5s instead of cutting it; `fading` clears when that keyframe ends.
export type ComposerBeamPhase = 'idle' | 'active' | 'fading';

/** Beam lifecycle plus the focus handlers for the card it traces. */
export function useComposerBeam() {
  const [phase, setPhase] = useState<ComposerBeamPhase>('idle');
  const onFocus = () => setPhase('active');
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    // focusout bubbles; ignore focus moving BETWEEN the card's own controls
    // (editor → plus menu → send button).
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setPhase((current) => (current === 'active' ? 'fading' : current));
  };
  return { phase, setPhase, onFocus, onBlur };
}

/** The lit ring itself; mount it as the traced card's last child. */
export function ComposerBeam({
  phase,
  onFaded,
}: {
  phase: ComposerBeamPhase;
  onFaded: () => void;
}) {
  const beamRef = useRef<HTMLDivElement | null>(null);
  // The light rides `offset-path`, and a `path()` cannot be written in terms
  // of the element's own size — border-beam measures the box in JS for exactly
  // this reason. A ResizeObserver also catches the card growing as the prompt
  // wraps.
  useEffect(() => {
    const node = beamRef.current;
    if (!node) return;
    const syncPath = () => {
      node.style.setProperty(
        '--beam-path',
        `path("M 0 0 H ${node.offsetWidth} V ${node.offsetHeight} H 0 V 0")`,
      );
    };
    syncPath();
    // jsdom has no ResizeObserver; the one sync above is the whole answer in a
    // test render, where nothing resizes.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(syncPath);
    observer.observe(node);
    return () => observer.disconnect();
  }, [phase]);

  if (phase === 'idle') return null;
  return (
    <div
      ref={beamRef}
      className="home-hero__composer-beam"
      data-beam="composer"
      data-active={phase === 'active' ? '' : undefined}
      data-fading={phase === 'fading' ? '' : undefined}
      aria-hidden
      onAnimationEnd={(event) => {
        if (event.animationName.includes('beam-fade-out')) onFaded();
      }}
    >
      {/* The travelling light — a real node, since it carries its own
          offset-path animation. */}
      <div data-beam-bloom />
    </div>
  );
}
