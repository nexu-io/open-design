import { evaluateWiggleEase, parseWiggleEase } from "@hyperframes/core/wiggle-ease";
import { evaluateSpringEase, parseSpringBounce } from "@hyperframes/core/spring-ease";
import { resolveEaseCurveTuple } from "./gsapAnimationConstants";

export function sampledPath(
  samples: number,
  x: (progress: number) => number,
  y: (value: number) => number,
  evaluate: (progress: number) => number,
): string {
  return Array.from({ length: samples + 1 }, (_, index) => {
    const progress = index / samples;
    return `${index === 0 ? "M" : "L"}${x(progress)},${y(evaluate(progress))}`;
  }).join(" ");
}

export function holdCurvePath(left: number, bottom: number, right: number, top: number): string {
  return `M${left},${bottom} L${right},${bottom} L${right},${top}`;
}

export function MiniCurveSvg({
  ease,
  active,
  size = 24,
}: {
  ease: string;
  active: boolean;
  size?: number;
}) {
  const springBounce = parseSpringBounce(ease);
  const wiggle = parseWiggleEase(ease);
  const curve = resolveEaseCurveTuple(ease);
  const [x1, y1, x2, y2] = curve;
  const s = size;
  const p = size / 8;
  const g = s - p * 2;
  const sx = (px: number) => p + g * px;
  const sy = (py: number) => s - p - g * py;
  const d =
    ease === "hold"
      ? holdCurvePath(p, s - p, s - p, p)
      : wiggle
        ? sampledPath(64, sx, sy, (progress) =>
            evaluateWiggleEase(progress, wiggle.wiggles, wiggle.type, wiggle.amplitude),
          )
        : springBounce !== null
          ? sampledPath(
              24,
              sx,
              (value) => sy(value / 1.2),
              (progress) => evaluateSpringEase(progress, springBounce),
            )
          : `M${p},${s - p} C${sx(x1)},${sy(y1)} ${sx(x2)},${sy(y2)} ${s - p},${p}`;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <path
        d={d}
        fill="none"
        className={active ? "stroke-accent-ink" : "stroke-text-muted"}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
