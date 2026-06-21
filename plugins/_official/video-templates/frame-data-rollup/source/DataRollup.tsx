// frame-data-rollup — the first NATIVE Remotion template (RFC-08 Phase 2).
//
// This is what the HTML bridge can't do: bars GROW from real data via spring()
// and numbers ROLL from 0 to their target via interpolate(), every value driven
// by the actual data array fed through inputProps — not a static chart screenshot.
// That visible "the numbers are alive" difference is the whole point of letting a
// user opt a data frame into Remotion enhancement.
//
// Offline-deterministic by construction: system font stack only, no external
// fonts / assets / network (the same all-black-frame trap the bridge's
// neutralizeBlockingResources() guards against — here we just never introduce it).
import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export interface DataRollupItem {
  label: string;
  value: number;
}

export interface DataRollupProps {
  data: {
    title?: string;
    /** Optional unit suffix shown after each rolled number, e.g. "K", "%". */
    unit?: string;
    items: DataRollupItem[];
  };
  /** Accent color for the bars + rolled numbers. */
  accent?: string;
  background?: string;
  foreground?: string;
}

const SYSTEM_SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const SYSTEM_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const DEFAULTS: Required<Omit<DataRollupProps, 'data'>> = {
  accent: '#FF5A2C',
  background: '#0E0E10',
  foreground: '#F5F5F2',
};

/** Format a rolled number: thousands separators, no decimals while counting. */
function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export const DataRollup: React.FC<DataRollupProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const data = props.data ?? { items: [] };
  const items = Array.isArray(data.items) ? data.items : [];
  const accent = props.accent ?? DEFAULTS.accent;
  const background = props.background ?? DEFAULTS.background;
  const foreground = props.foreground ?? DEFAULTS.foreground;
  const unit = data.unit ?? '';

  // Bar-height scaling. Normally each bar is linear against the largest value.
  // But when one value dwarfs the rest (e.g. 61,059 stars next to 142 systems),
  // linear scaling crushes the small bars to a 2px sliver. So if the spread is
  // extreme (max ≥ 50× the smallest positive value), switch to a log scale so
  // every bar stays legible. The rolled NUMBERS always show the true value —
  // only the bar HEIGHT is remapped.
  const values = items.map((it) => (Number.isFinite(it.value) ? it.value : 0));
  const maxValue = Math.max(1, ...values);
  const positives = values.filter((v) => v > 0);
  const minPositive = positives.length > 0 ? Math.min(...positives) : maxValue;
  const useLog = minPositive > 0 && maxValue / minPositive >= 50;
  // Map a raw value → 0..1 fraction of the tallest bar.
  const heightFrac = (value: number): number => {
    if (value <= 0) return 0;
    if (!useLog) return value / maxValue;
    // Log scale: smallest positive bar reads ~25% tall, the tallest 100%.
    const logMin = Math.log(minPositive);
    const logMax = Math.log(maxValue);
    const t = (Math.log(value) - logMin) / (logMax - logMin || 1);
    return 0.25 + t * 0.75;
  };

  // Title fades + slides up over the first ~0.5s.
  const titleProgress = spring({ frame, fps, config: { damping: 200 } });
  const titleY = interpolate(titleProgress, [0, 1], [24, 0]);

  // Layout maths (all in px, scaled off the real canvas so 9:16 / 1:1 work too).
  const padX = Math.round(width * 0.08);
  const chartTop = Math.round(height * (data.title ? 0.26 : 0.16));
  const chartBottom = Math.round(height * 0.82);
  const chartHeight = chartBottom - chartTop;
  const slotW = items.length > 0 ? (width - padX * 2) / items.length : 0;
  const barW = Math.min(slotW * 0.52, Math.round(width * 0.12));

  return (
    <AbsoluteFill style={{ backgroundColor: background, fontFamily: SYSTEM_SANS }}>
      {data.title ? (
        <div
          style={{
            position: 'absolute',
            top: Math.round(height * 0.1),
            left: padX,
            right: padX,
            color: foreground,
            fontSize: Math.round(height * 0.058),
            fontWeight: 800,
            letterSpacing: '-0.02em',
            opacity: titleProgress,
            transform: `translateY(${titleY}px)`,
          }}
        >
          {data.title}
        </div>
      ) : null}

      {items.map((it, i) => {
        const value = Number.isFinite(it.value) ? it.value : 0;

        // Each bar starts growing on a staggered delay so they cascade in.
        const delay = i * Math.round(fps * 0.12);
        const grow = spring({
          frame: frame - delay,
          fps,
          config: { damping: 14, mass: 0.7, stiffness: 90 },
        });
        const barHeight = Math.max(2, heightFrac(value) * chartHeight * grow);

        // The number rolls from 0 → value tracking the same growth curve, so the
        // figure and the bar finish together.
        const rolled = value * grow;

        const cx = padX + slotW * i + slotW / 2;
        const labelColor = foreground;

        return (
          <React.Fragment key={`${it.label}-${i}`}>
            {/* rolled number, sits just above the bar top */}
            <div
              style={{
                position: 'absolute',
                left: cx - slotW / 2,
                width: slotW,
                top: chartBottom - barHeight - Math.round(height * 0.07),
                textAlign: 'center',
                color: accent,
                fontFamily: SYSTEM_MONO,
                fontSize: Math.round(height * 0.04),
                fontWeight: 700,
                opacity: grow,
              }}
            >
              {fmt(rolled)}
              {unit ? ` ${unit}` : ''}
            </div>

            {/* the bar */}
            <div
              style={{
                position: 'absolute',
                left: cx - barW / 2,
                width: barW,
                bottom: height - chartBottom,
                height: barHeight,
                backgroundColor: accent,
                borderRadius: `${Math.round(barW * 0.12)}px ${Math.round(barW * 0.12)}px 0 0`,
              }}
            />

            {/* label under the baseline */}
            <div
              style={{
                position: 'absolute',
                left: cx - slotW / 2,
                width: slotW,
                top: chartBottom + Math.round(height * 0.025),
                textAlign: 'center',
                color: labelColor,
                fontSize: Math.round(height * 0.028),
                fontWeight: 500,
                opacity: interpolate(grow, [0, 0.4], [0, 0.85], { extrapolateRight: 'clamp' }),
              }}
            >
              {it.label}
            </div>
          </React.Fragment>
        );
      })}

      {/* baseline rule */}
      <div
        style={{
          position: 'absolute',
          left: padX,
          right: padX,
          top: chartBottom,
          height: 2,
          backgroundColor: foreground,
          opacity: 0.18,
        }}
      />
    </AbsoluteFill>
  );
};
