// Kinetic dot grid on the home hero's background — a canvas layer sized to
// its host block (the hero region only; the rest of the page stays clean).
// Dots spring toward the cursor inside an attraction radius; ported from the
// Originkit "Kinetic Grid" Framer component with the preview's tuning (green
// dots only — mesh lines and the cursor trail are disabled). The canvas takes
// no pointer events, so the cursor is tracked at the window level and mapped
// through the canvas rect.

import { useEffect, useRef } from 'react';

const DOT_COLOR = '#9a9a9a';
const SPACING = 25;
const RADIUS = 203;
const STRENGTH = 2;
/** How long the startup sweep takes to cross the field. */
const INTRO_SWEEP_MS = 1500;

/* The grid only moves under a cursor, so on a fresh Home it renders as a still
   dot field and most people never learn there is an effect there. Once per page
   load, a virtual attractor sweeps across it — the same physics a real cursor
   drives, just scripted — so the motion introduces itself. Module scope, not
   component state: Home unmounts this canvas on every navigation away, and a
   replay on each return would be a tic rather than an introduction. */
let introPlayedThisLoad = false;

interface GridDot {
  hx: number;
  hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface AppWashKineticGridProps {
  /** Selector (resolved within the host) whose bottom edge clips the grid —
   *  the effect stays above it instead of running down the whole board. */
  clipBottomTo?: string;
}

export function AppWashKineticGrid({ clipBottomTo }: AppWashKineticGridProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const pull = (Math.max(1, Math.min(10, STRENGTH)) / 10) * 4;
    const mouse = { x: -9999, y: -9999, active: false };
    // Scripted stand-in for the cursor during the startup sweep. It ignores
    // `hoverSuppressed` on purpose: Home autofocuses the composer, so the
    // suppression that silences the real cursor is already on at load and
    // would swallow the introduction entirely.
    const intro = { x: -9999, y: -9999, active: false };
    let introStart: number | null = null;
    // While the user is focused in an editable (the composer), the
    // cursor-follow behavior is switched off — dots settle back to rest.
    let hoverSuppressed = false;
    const isEditable = (node: EventTarget | null): boolean =>
      node instanceof Element &&
      !!node.closest('input, textarea, [contenteditable]:not([contenteditable="false"])');
    const onFocusIn = (event: FocusEvent) => {
      hoverSuppressed = isEditable(event.target);
    };
    const onFocusOut = () => {
      hoverSuppressed = false;
    };

    let width = 1;
    let height = 1;
    let dots: GridDot[] = [];

    const host = canvas.parentElement;
    if (!host) return;
    const clipEl = clipBottomTo ? host.querySelector(clipBottomTo) : null;

    function build(): void {
      if (!canvas || !ctx || !host) return;
      const rect = host.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      let h = rect.height;
      if (clipEl) h = Math.min(h, clipEl.getBoundingClientRect().bottom - rect.top);
      height = Math.max(1, Math.floor(h));
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      dots = [];
      const nCols = Math.floor(width / SPACING) + 2;
      const nRows = Math.floor(height / SPACING) + 2;
      for (let c = 0; c < nCols; c++) {
        for (let r = 0; r < nRows; r++) {
          const hx = c * SPACING;
          const hy = r * SPACING;
          dots.push({ hx, hy, x: hx, y: hy, vx: 0, vy: 0 });
        }
      }
    }

    function drawStatic(): void {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = DOT_COLOR;
      for (const d of dots) {
        ctx.globalAlpha = 0.22 * Math.max(0, Math.min(1, (height - d.hy) / 90));
        ctx.beginPath();
        ctx.arc(d.hx, d.hy, 0.55, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    build();

    const ro = new ResizeObserver(() => {
      build();
      if (reducedMotion) drawStatic();
    });
    ro.observe(host);
    if (clipEl) ro.observe(clipEl);

    if (reducedMotion) {
      drawStatic();
      return () => ro.disconnect();
    }

    // Background layer: the canvas never receives pointer events, so the
    // cursor is tracked on the window and mapped into the host's box (the
    // rect is re-read per move — the home view scrolls under the cursor).
    const onMove = (event: MouseEvent) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
      mouse.active = true;
      // A real cursor supersedes the demo mid-sweep — two attractors fighting
      // over the same dots reads as a glitch, not a flourish.
      intro.active = false;
    };
    const onLeave = () => {
      mouse.active = false;
      mouse.x = -9999;
      mouse.y = -9999;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseout', onLeave);
    window.addEventListener('blur', onLeave);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    hoverSuppressed = isEditable(document.activeElement);

    if (!introPlayedThisLoad) {
      introPlayedThisLoad = true;
      intro.active = true;
    }

    let raf = 0;
    const frame = () => {
      if (document.hidden) {
        raf = requestAnimationFrame(frame);
        return;
      }
      ctx.clearRect(0, 0, width, height);
      if (intro.active) {
        const now = performance.now();
        if (introStart === null) introStart = now;
        const p = Math.min(1, (now - introStart) / INTRO_SWEEP_MS);
        // easeInOutQuad: the sweep accelerates in and settles out instead of
        // entering and leaving at full speed.
        const eased = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
        // Starts and ends a radius outside the field so the first and last
        // dots get a full pass, not a half one.
        intro.x = -RADIUS * 0.6 + eased * (width + RADIUS * 1.2);
        intro.y = height * 0.58;
        if (p >= 1) intro.active = false;
      }
      const attractor = mouse.active && !hoverSuppressed ? mouse : intro.active ? intro : null;
      for (const d of dots) {
        let ax = (d.hx - d.x) * 0.08;
        let ay = (d.hy - d.y) * 0.08;
        if (attractor) {
          const dx = attractor.x - d.x;
          const dy = attractor.y - d.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < RADIUS && dist > 0.001) {
            const f = (1 - dist / RADIUS) * pull;
            ax += (dx / dist) * f;
            ay += (dy / dist) * f;
          }
        }
        d.vx = (d.vx + ax) * 0.82;
        d.vy = (d.vy + ay) * 0.82;
        d.x += d.vx;
        d.y += d.vy;

        const prox = attractor
          ? Math.max(0, 1 - Math.sqrt((attractor.x - d.x) ** 2 + (attractor.y - d.y) ** 2) / RADIUS)
          : 0;
        const edgeFade = Math.max(0, Math.min(1, (height - d.y) / 90));
        ctx.globalAlpha = (0.22 + prox * 0.78) * edgeFade;
        ctx.fillStyle = DOT_COLOR;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 0.55 + prox * 0.8, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseout', onLeave);
      window.removeEventListener('blur', onLeave);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [clipBottomTo]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: -1,
        pointerEvents: 'none',
      }}
    />
  );
}
