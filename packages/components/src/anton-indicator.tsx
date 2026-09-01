/**
 * Anton Indicator — Orbit · Morph.
 *
 * Verbatim React port of the vanilla animator in
 * leastgen/cowork/frontend/docs/design-guidelines/orbit-morph.html.
 * Spec-locked geometry & timings — do NOT tweak:
 *   viewBox 0 0 24 24 · center (12,12) · orbit r 8.5
 *   orbit: 1400ms thinking / 4500ms idle
 *   morph: 4800ms chaos → pyramid → dot → cube, easeInOutQuad grow-shrink
 *   done:  futurist "A" draw-on (stroke-dasharray 0→50 over 450ms)
 *          + ring locked at 35% opacity
 *   idle:  svg at 0.7 opacity
 * One requestAnimationFrame loop per instance; the SVG is rebuilt each
 * frame from the current (angle, phase). Size via --om-size (16–18px
 * inline, 24–32px compact UI, 72–200px hero/loading).
 */
import React, { useEffect, useRef } from "react";

export type AntonTheme = "dark" | "light";
export type AntonState = "idle" | "thinking" | "done";

const NS = "http://www.w3.org/2000/svg";
const PALETTE: Record<AntonTheme, { faded: string; accent: string }> = {
  light: { faded: "#6B6F73", accent: "#1F9CB0" },
  dark: { faded: "#8A97AE", accent: "rgb(34, 211, 238)" },
};

const svgEl = (tag: string, attrs: Record<string, string | number>): SVGElement => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  return e;
};

// easeInOutQuad, verbatim from the spec's animator.
const ease = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

export interface AntonIndicatorProps {
  theme?: AntonTheme;
  state?: AntonState;
  /** Any CSS length; feeds the --om-size variable (default 18px). */
  size?: string;
  className?: string;
}

export function AntonIndicator({
  theme = "dark",
  state = "idle",
  size = "18px",
  className,
}: AntonIndicatorProps): React.ReactElement {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  // Latest props for the rAF loop, without restarting it on re-render.
  const live = useRef({ theme, state });
  live.current = { theme, state };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const svg = svgEl("svg", { viewBox: "0 0 24 24", width: "100%", height: "100%" }) as SVGSVGElement;
    svg.style.display = "block";
    svg.style.width = "var(--om-size, 18px)";
    svg.style.height = "var(--om-size, 18px)";
    host.appendChild(svg);

    // Environment probe: real browsers schedule rAF callbacks asynchronously.
    // A synchronous rAF shim (some test environments stub it that way) would
    // turn the animator's self-rescheduling loop below into unbounded
    // recursion, so detect that degenerate case once and render a single
    // static frame there instead of a loop. No effect in real browsers.
    let probeRan = false;
    requestAnimationFrame(() => { probeRan = true; });
    const rafIsSynchronous = probeRan;

    let raf = 0;
    // Draw-on clock for the done state (spec: dasharray 0→50 over 450ms).
    let doneAt: number | null = null;
    let prevState: AntonState | null = null;
    const t0 = performance.now();

    const tick = (): void => {
      const { theme: th, state: st } = live.current;
      const p = PALETTE[th];
      const t = performance.now() - t0;

      // Reset the draw-on clock whenever we (re-)enter done.
      if (st === "done" && prevState !== "done") doneAt = t;
      if (st !== "done") doneAt = null;
      prevState = st;

      const orbitDur = st === "thinking" ? 1400 : 4500;
      const morphDur = st === "thinking" ? 4800 : 12000;
      const angle = ((t / orbitDur) * 360) % 360;
      const phase = (t / morphDur) % 1;

      // Stage / grow envelope (verbatim).
      const stage = Math.floor(phase * 4);
      const stageT = (phase * 4) % 1;
      const grow = stageT < 0.5 ? stageT * 2 : (1 - stageT) * 2;
      const g = ease(grow);

      let shape = "dot";
      if (st === "thinking") {
        if (stage === 0) shape = "chaos";
        else if (stage === 1) shape = "pyramid";
        else if (stage === 3) shape = "cube";
      }
      if (st === "done") shape = "A";

      const orbitR = 8.5;
      const a = (angle * Math.PI) / 180;
      const sx = 12 + Math.cos(a) * orbitR;
      const sy = 12 + Math.sin(a) * orbitR;
      const dotR = 1.4 + g * 1.0;
      const shapeSize = 1.8 + g * 3.2;

      // Build the SVG content from scratch each frame (cheap at this size).
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      // orbit ring guide
      svg.appendChild(
        svgEl("circle", {
          cx: 12, cy: 12, r: orbitR, fill: "none",
          stroke: p.faded, "stroke-opacity": 0.18, "stroke-width": 0.6,
        }),
      );

      // satellite (idle + thinking)
      if (st !== "done") {
        svg.appendChild(
          svgEl("circle", {
            cx: sx.toFixed(2), cy: sy.toFixed(2),
            r: st === "idle" ? 1.0 : 1.4,
            fill: p.accent,
          }),
        );
      }

      // CENTER MORPH — only in thinking
      if (st === "thinking") {
        if (shape === "chaos") {
          const frags = [
            { d: "M-3.5,6 L0,-6",  spin: phase * 720,  ox: -2, oy: -1 },
            { d: "M0,-6 L3.5,6",   spin: -phase * 540, ox:  2, oy:  1 },
            { d: "M-2.5,5 L2.5,5", spin: phase * 900,  ox:  0, oy:  2 },
          ];
          const wrap = svgEl("g", { opacity: g });
          frags.forEach((f) => {
            const outer = svgEl("g", {
              transform: `translate(${(12 + f.ox * g).toFixed(2)} ${(12 + f.oy * g).toFixed(2)}) rotate(${f.spin.toFixed(2)})`,
            });
            const inner = svgEl("path", {
              d: f.d,
              fill: "none",
              stroke: p.accent,
              "stroke-width": (0.15 + g * 0.35).toFixed(3),
              "stroke-linejoin": "round",
              "stroke-linecap": "round",
              transform: `scale(${(0.5 + g * 0.7).toFixed(3)})`,
            });
            outer.appendChild(inner);
            wrap.appendChild(outer);
          });
          svg.appendChild(wrap);
        } else if (shape === "pyramid") {
          const outer = svgEl("g", { transform: `rotate(${angle.toFixed(2)} 12 12)` });
          const inner = svgEl("g", {
            transform: `translate(12 12) scale(${(shapeSize / 9).toFixed(3)}) translate(-12 -12)`,
            opacity: g,
          });
          inner.appendChild(
            svgEl("path", {
              d: "M5,20 L12,15.96 M19,20 L12,15.96 M12,7.88 L12,15.96",
              fill: "none", stroke: p.accent,
              "stroke-opacity": 0.55,
              "stroke-width": (0.18 + g * 0.4).toFixed(3),
              "stroke-linejoin": "round", "stroke-linecap": "round",
            }),
          );
          inner.appendChild(
            svgEl("path", {
              d: "M5,20 L12,7.88 L19,20 Z",
              fill: "none", stroke: p.accent,
              "stroke-width": (0.25 + g * 0.55).toFixed(3),
              "stroke-linejoin": "round", "stroke-linecap": "round",
            }),
          );
          outer.appendChild(inner);
          svg.appendChild(outer);
        } else if (shape === "dot") {
          svg.appendChild(
            svgEl("circle", {
              cx: 12, cy: 12, r: dotR.toFixed(3), fill: "none",
              stroke: p.accent, "stroke-width": (0.15 + g * 0.35).toFixed(3),
            }),
          );
        } else if (shape === "cube") {
          const outer = svgEl("g", { transform: `rotate(${angle.toFixed(2)} 12 12)` });
          const inner = svgEl("g", {
            transform: `translate(12 12) scale(${(shapeSize / 9).toFixed(3)}) translate(-12 -12)`,
            opacity: g,
          });
          inner.appendChild(
            svgEl("path", {
              d: "M3.5,8 L12,13 L20.5,8 M12,13 L12,22",
              fill: "none", stroke: p.faded,
              "stroke-opacity": 0.45,
              "stroke-width": 0.8,
              "stroke-dasharray": "1.5 1.5",
            }),
          );
          inner.appendChild(
            svgEl("path", {
              d: [
                "M3.5,8 L12,3 L20.5,8 L12,13 Z",
                "M3.5,8 L3.5,17",
                "M20.5,8 L20.5,17",
                "M12,13 L12,22",
                "M3.5,17 L12,22 L20.5,17",
              ].join(" "),
              fill: "none",
              stroke: p.accent,
              "stroke-width": (0.25 + g * 0.55).toFixed(3),
              "stroke-linejoin": "round",
              "stroke-linecap": "round",
            }),
          );
          outer.appendChild(inner);
          svg.appendChild(outer);
        }
      }

      // DONE — futurist A (draw-on) + locked ring
      if (st === "done") {
        const drawT = doneAt === null ? 1 : Math.min(1, Math.max(0, (t - doneAt) / 450));
        const dash = drawT >= 1 ? "none" : `${(drawT * 50).toFixed(2)} 50`;
        const grp = svgEl("g", {
          stroke: p.accent, "stroke-width": 1.4,
          "stroke-linecap": "round", "stroke-linejoin": "round", fill: "none",
        });
        const pathA = svgEl("path", { d: "M5 20 L12 7.88 L19 20 L9 20" });
        if (dash !== "none") pathA.setAttribute("stroke-dasharray", dash);
        grp.appendChild(pathA);
        svg.appendChild(grp);
        svg.appendChild(
          svgEl("circle", {
            cx: 12, cy: 12, r: orbitR, fill: "none",
            stroke: p.accent, "stroke-width": 1, "stroke-opacity": 0.35,
          }),
        );
      }

      if (!rafIsSynchronous) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <span
      ref={hostRef}
      className={`orbit-morph${className ? ` ${className}` : ""}`}
      data-theme={theme}
      data-state={state}
      style={{ "--om-size": size, display: "inline-block" } as React.CSSProperties}
      aria-hidden="true"
    />
  );
}

export default AntonIndicator;
