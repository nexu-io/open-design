import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useT } from '../i18n';
import {
  formatCssColor,
  hsvToRgb,
  parseCssColor,
  rgbToHex,
  rgbToHsv,
  type HsvColor,
} from '../edit-mode/color';
import styles from './ManualEditColorPicker.module.css';

const COMMON_COLORS = [
  '#111827', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#2563eb', '#8b5cf6', '#ffffff',
] as const;

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * Manus-style color picker: saturation/value area, hue and alpha sliders,
 * hex + opacity inputs, and a common-colors row. Emits CSS color strings
 * (#hex, or rgba() when translucent). HSV state lives locally so dragging
 * through desaturated colors never loses the hue.
 */
export function ManualEditColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (css: string) => void;
}) {
  const t = useT();
  const parsed = parseCssColor(value);
  const [hsv, setHsv] = useState<HsvColor>(() => rgbToHsv(parsed ?? { r: 17, g: 24, b: 39 }));
  const [alpha, setAlpha] = useState(() => parsed?.a ?? 1);
  const [hexDraft, setHexDraft] = useState(() => rgbToHex(parsed ?? { r: 17, g: 24, b: 39 }));
  const lastEmittedRef = useRef<string | null>(null);
  const emitFrameRef = useRef(0);
  const pendingRef = useRef<{ hsv: HsvColor; alpha: number } | null>(null);

  // Adopt external value changes (e.g. selecting another element) unless the
  // change is the echo of our own last emit.
  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    const next = parseCssColor(value);
    if (!next) return;
    setHsv(rgbToHsv(next));
    setAlpha(next.a);
    setHexDraft(rgbToHex(next));
  }, [value]);

  useEffect(() => () => {
    if (emitFrameRef.current) cancelAnimationFrame(emitFrameRef.current);
  }, []);

  const emit = (nextHsv: HsvColor, nextAlpha: number) => {
    setHsv(nextHsv);
    setAlpha(nextAlpha);
    setHexDraft(rgbToHex(hsvToRgb(nextHsv)));
    // Coalesce drag emissions to one per frame — every emit previews into the
    // iframe, and text repaint there is the expensive part.
    pendingRef.current = { hsv: nextHsv, alpha: nextAlpha };
    if (emitFrameRef.current) return;
    emitFrameRef.current = requestAnimationFrame(() => {
      emitFrameRef.current = 0;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending) return;
      const css = formatCssColor({ ...hsvToRgb(pending.hsv), a: pending.alpha });
      lastEmittedRef.current = css;
      onChange(css);
    });
  };

  const dragTrack = (
    apply: (ratioX: number, ratioY: number) => void,
  ) => (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const node = event.currentTarget;
    node.setPointerCapture(event.pointerId);
    const measure = (clientX: number, clientY: number) => {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      apply(clamp01((clientX - rect.left) / rect.width), clamp01((clientY - rect.top) / rect.height));
    };
    measure(event.clientX, event.clientY);
    const onMove = (moveEvent: PointerEvent) => measure(moveEvent.clientX, moveEvent.clientY);
    const onUp = () => {
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', onUp);
      node.removeEventListener('pointercancel', onUp);
    };
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', onUp);
    node.addEventListener('pointercancel', onUp);
  };

  const rgb = hsvToRgb(hsv);
  const hueCss = `hsl(${Math.round(hsv.h)}, 100%, 50%)`;
  const solidCss = rgbToHex(rgb);
  const currentCss = formatCssColor({ ...rgb, a: alpha });

  return (
    <div className={styles.picker}>
      <div
        className={styles.svArea}
        style={{ backgroundColor: hueCss }}
        onPointerDown={dragTrack((x, y) => emit({ h: hsv.h, s: x, v: 1 - y }, alpha))}
      >
        <span
          className={styles.svThumb}
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: solidCss }}
        />
      </div>
      <div className={styles.slidersRow}>
        <div className={styles.sliders}>
          <div
            className={styles.hueTrack}
            role="slider"
            aria-label={t('manualEdit.hue')}
            aria-valuemin={0}
            aria-valuemax={360}
            aria-valuenow={Math.round(hsv.h)}
            onPointerDown={dragTrack((x) => emit({ ...hsv, h: x * 360 }, alpha))}
          >
            <span className={styles.trackThumb} style={{ left: `${(hsv.h / 360) * 100}%`, background: hueCss }} />
          </div>
          <div
            className={styles.alphaTrack}
            role="slider"
            aria-label={t('manualEdit.opacity')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(alpha * 100)}
            onPointerDown={dragTrack((x) => emit(hsv, x))}
          >
            <span
              className={styles.alphaGradient}
              style={{ background: `linear-gradient(to right, transparent, ${solidCss})` }}
            />
            <span className={styles.trackThumb} style={{ left: `${alpha * 100}%`, background: currentCss }} />
          </div>
        </div>
        <span className={styles.preview} style={{ background: currentCss }} />
      </div>
      <div className={styles.inputsRow}>
        <input
          className={styles.hexInput}
          value={hexDraft}
          placeholder="#111827"
          spellCheck={false}
          onChange={(event) => {
            const draft = event.currentTarget.value.trim();
            setHexDraft(draft);
            const next = parseCssColor(draft.startsWith('#') ? draft : `#${draft}`);
            if (next) emit(rgbToHsv(next), next.a < 1 ? next.a : alpha);
          }}
        />
        <input
          className={styles.alphaInput}
          type="number"
          min={0}
          max={100}
          value={Math.round(alpha * 100)}
          aria-label={t('manualEdit.opacity')}
          onChange={(event) => {
            const percent = Number(event.currentTarget.value);
            if (Number.isFinite(percent)) emit(hsv, clamp01(percent / 100));
          }}
        />
      </div>
      <div className={styles.commonBlock}>
        <span className={styles.commonLabel}>{t('manualEdit.commonColors')}</span>
        <div className={styles.commonRow}>
          {COMMON_COLORS.map((hex) => (
            <button
              key={hex}
              type="button"
              className={styles.swatch}
              style={{ background: hex }}
              aria-label={hex}
              onClick={() => {
                const next = parseCssColor(hex);
                if (next) emit(rgbToHsv(next), 1);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
