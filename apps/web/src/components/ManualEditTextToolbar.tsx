import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { manualEditClampedCenter } from '../edit-mode/gestures';
import { manualEditTooltip } from '../edit-mode/shortcuts';
import type { ManualEditStyles, ManualEditTarget, ManualEditTextSelectionFormat } from '../edit-mode/types';
import { ManualEditColorPicker } from './ManualEditColorPicker';
import styles from './ManualEditTextToolbar.module.css';

const FONT_SIZE_PRESETS = [12, 14, 16, 20, 24, 32, 40, 48, 64, 72, 96] as const;
const TOOLBAR_HEIGHT = 40;
const DEFAULT_TOOLBAR_WIDTH = 340;

type PopoverKind = 'size' | 'spacing' | 'color' | null;

/**
 * Floating typography toolbar for the selected text/link element — the
 * Manus-style strip with font size, bold/italic/underline/strikethrough,
 * alignment, letter-spacing/line-height, and text color.
 *
 * Formatting commands apply at element level through the shared style
 * pipeline (live preview + debounced persist). When the user has an active
 * text selection inside the inline edit session, B/I/U/S and color escalate
 * to range-level formatting inside the iframe instead, exactly like a rich
 * text editor. The strip measures itself and clamps to the canvas bounds so
 * it never renders off-screen; when there is no room above the selection it
 * flips below it.
 */
export function ManualEditTextToolbar({
  target,
  draftStyles,
  scale,
  canvasSize,
  hasRangeSelection = false,
  rangeFormat = null,
  busy = false,
  onElementStyle,
  onRangeFormat,
}: {
  target: ManualEditTarget;
  draftStyles: ManualEditStyles;
  scale: number;
  canvasSize?: { width: number; height: number };
  hasRangeSelection?: boolean;
  // Live formatting state of the active text selection, reported by the iframe.
  // When present it drives B/I/U/S so the toolbar reflects what the selected
  // run actually renders with — range formatting is invisible to draftStyles.
  rangeFormat?: ManualEditTextSelectionFormat | null;
  busy?: boolean;
  onElementStyle: (partial: Partial<ManualEditStyles>, label: string) => void;
  onRangeFormat: (command: string, value?: string) => void;
}) {
  const t = useT();
  const [popover, setPopover] = useState<PopoverKind>(null);
  const [toolbarWidth, setToolbarWidth] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const effectiveScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

  useEffect(() => {
    setPopover(null);
  }, [target.id]);

  useEffect(() => {
    if (!popover) return;
    const onDocPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setPopover(null);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [popover]);

  // Measure the rendered strip so clamping uses the real width (locale and
  // font-size label width vary); the equality guard prevents render loops.
  useLayoutEffect(() => {
    const width = rootRef.current?.offsetWidth ?? 0;
    setToolbarWidth((current) => (current === width ? current : width));
  });

  const frameLeft = target.rect.x * effectiveScale;
  const frameTop = target.rect.y * effectiveScale;
  const frameWidth = target.rect.width * effectiveScale;
  const frameHeight = target.rect.height * effectiveScale;
  const canvasWidth = canvasSize?.width;
  const canvasHeight = canvasSize?.height;
  // Above the selection frame and its action bar; flip below the element
  // when the top edge would clip, and always stay inside the canvas.
  const preferredTop = frameTop - TOOLBAR_HEIGHT - 52;
  const openDown = preferredTop < 6;
  const rawTop = openDown ? frameTop + frameHeight + 12 : preferredTop;
  const top = Math.max(6, canvasHeight ? Math.min(rawTop, canvasHeight - TOOLBAR_HEIGHT - 6) : rawTop);
  const left = manualEditClampedCenter(
    frameLeft + frameWidth / 2,
    toolbarWidth || DEFAULT_TOOLBAR_WIDTH,
    canvasWidth,
  );

  const fontSize = parseFloat(draftStyles.fontSize) || 16;
  const letterSpacing = parseFloat(draftStyles.letterSpacing) || 0;
  const lineHeightRaw = draftStyles.lineHeight;
  const lineHeight = lineHeightRaw && lineHeightRaw !== 'normal'
    ? (/px$/i.test(lineHeightRaw) ? round2(parseFloat(lineHeightRaw) / fontSize) : parseFloat(lineHeightRaw) || 1.4)
    : 1.4;
  // With a live text range, B/I/U/S mirror the SELECTION's real formatting
  // (a range-level bold span the element style can't see); otherwise they fall
  // back to the element-level draft styles.
  const boldActive = rangeFormat
    ? rangeFormat.bold
    : (parseInt(draftStyles.fontWeight, 10) || 400) >= 600 || draftStyles.fontWeight === 'bold';
  const italicActive = rangeFormat ? rangeFormat.italic : draftStyles.fontStyle === 'italic';
  const underlineActive = rangeFormat
    ? rangeFormat.underline
    : draftStyles.textDecorationLine.includes('underline');
  const strikeActive = rangeFormat
    ? rangeFormat.strike
    : draftStyles.textDecorationLine.includes('line-through');
  const align = draftStyles.textAlign;
  // The "A" underline always shows the color the text actually renders with:
  // the unsaved draft first, then the element's computed color.
  const currentColor = draftStyles.color || target.styles.color || '#111827';

  const setStyle = (partial: Partial<ManualEditStyles>, label: string) => {
    if (busy) return;
    onElementStyle(partial, label);
  };

  const toggleDecoration = (token: 'underline' | 'line-through') => {
    const tokens = new Set(draftStyles.textDecorationLine.split(/\s+/).filter((item) => item && item !== 'none'));
    if (tokens.has(token)) tokens.delete(token);
    else tokens.add(token);
    return tokens.size > 0 ? Array.from(tokens).join(' ') : 'none';
  };

  const format = (
    command: 'bold' | 'italic' | 'underline' | 'strikeThrough',
    elementPartial: Partial<ManualEditStyles>,
    label: string,
  ) => {
    if (hasRangeSelection) onRangeFormat(command);
    else setStyle(elementPartial, label);
  };

  const applyColor = (css: string) => {
    if (hasRangeSelection) onRangeFormat('foreColor', css);
    else setStyle({ color: css }, t('manualEdit.textColor'));
  };

  return (
    <div
      ref={rootRef}
      className={styles.toolbar}
      data-testid="manual-edit-text-toolbar"
      style={{ left, top }}
      onPointerDown={(event) => {
        // Never steal focus from the inline text session in the iframe —
        // a host-side focus flip would end the user's selection. Inputs
        // inside popovers still need focus to be typeable.
        const interactive = (event.target as HTMLElement).closest('input, select, textarea');
        if (!interactive) event.preventDefault();
      }}
    >
      <div className={styles.group}>
        <button
          type="button"
          className={`${styles.sizeButton} od-tooltip`}
          data-tooltip={t('manualEdit.fontSize')}
          data-tooltip-placement="bottom"
          aria-label={t('manualEdit.fontSize')}
          onClick={() => setPopover(popover === 'size' ? null : 'size')}
        >
          {stripUnit(draftStyles.fontSize) || '16'}px
          <span className={styles.chevron}>▾</span>
        </button>
      </div>
      <span className={styles.divider} />
      <div className={styles.group}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonBold}${boldActive ? ` ${styles.buttonActive}` : ''} od-tooltip`}
          data-tooltip={manualEditTooltip(t('manualEdit.bold'), 'bold')}
          data-tooltip-placement="bottom"
          aria-label={t('manualEdit.bold')}
          aria-pressed={boldActive}
          onClick={() => format('bold', { fontWeight: boldActive ? '400' : '700' }, t('manualEdit.bold'))}
        >
          B
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonItalic}${italicActive ? ` ${styles.buttonActive}` : ''} od-tooltip`}
          data-tooltip={manualEditTooltip(t('manualEdit.italic'), 'italic')}
          data-tooltip-placement="bottom"
          aria-label={t('manualEdit.italic')}
          aria-pressed={italicActive}
          onClick={() => format('italic', { fontStyle: italicActive ? 'normal' : 'italic' }, t('manualEdit.italic'))}
        >
          I
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonUnderline}${underlineActive ? ` ${styles.buttonActive}` : ''} od-tooltip`}
          data-tooltip={manualEditTooltip(t('manualEdit.underline'), 'underline')}
          data-tooltip-placement="bottom"
          aria-label={t('manualEdit.underline')}
          aria-pressed={underlineActive}
          onClick={() => format('underline', { textDecorationLine: toggleDecoration('underline') }, t('manualEdit.underline'))}
        >
          U
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonStrike}${strikeActive ? ` ${styles.buttonActive}` : ''} od-tooltip`}
          data-tooltip={t('manualEdit.strikethrough')}
          data-tooltip-placement="bottom"
          aria-label={t('manualEdit.strikethrough')}
          aria-pressed={strikeActive}
          onClick={() => format('strikeThrough', { textDecorationLine: toggleDecoration('line-through') }, t('manualEdit.strikethrough'))}
        >
          S
        </button>
      </div>
      <span className={styles.divider} />
      <div className={styles.group}>
        {(['left', 'center', 'right'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`${styles.button}${align === value ? ` ${styles.buttonActive}` : ''} od-tooltip`}
            data-tooltip={t(`manualEdit.align${value === 'left' ? 'Left' : value === 'center' ? 'Center' : 'Right'}`)}
            data-tooltip-placement="bottom"
            aria-label={t(`manualEdit.align${value === 'left' ? 'Left' : value === 'center' ? 'Center' : 'Right'}`)}
            aria-pressed={align === value}
            onClick={() => setStyle({ textAlign: align === value ? '' : value }, t('manualEdit.applyStyle'))}
          >
            <AlignGlyph kind={value} />
          </button>
        ))}
        <button
          type="button"
          className={`${styles.button}${popover === 'spacing' ? ` ${styles.buttonActive}` : ''} od-tooltip`}
          data-tooltip={t('manualEdit.spacing')}
          data-tooltip-placement="bottom"
          aria-label={t('manualEdit.spacing')}
          onClick={() => setPopover(popover === 'spacing' ? null : 'spacing')}
        >
          <SpacingGlyph />
        </button>
      </div>
      <span className={styles.divider} />
      <div className={styles.group}>
        <button
          type="button"
          className={`${styles.button} ${styles.colorButton} od-tooltip`}
          data-tooltip={t('manualEdit.textColor')}
          data-tooltip-placement="bottom"
          aria-label={t('manualEdit.textColor')}
          onClick={() => setPopover(popover === 'color' ? null : 'color')}
        >
          A
          <span className={styles.colorUnderline} style={{ background: currentColor }} />
        </button>
      </div>

      {popover === 'size' ? (
        <div className={`${styles.popover} ${styles.popoverSize}${openDown ? ` ${styles.popoverDown}` : ''}`}>
          {FONT_SIZE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`${styles.sizeOption}${Math.round(fontSize) === preset ? ` ${styles.sizeOptionActive}` : ''}`}
              onClick={() => {
                setStyle({ fontSize: `${preset}px` }, t('manualEdit.fontSize'));
                setPopover(null);
              }}
            >
              {preset}px
            </button>
          ))}
        </div>
      ) : null}

      {popover === 'spacing' ? (
        <div className={`${styles.popover} ${styles.popoverSpacing}${openDown ? ` ${styles.popoverDown}` : ''}`}>
          <label className={styles.sliderRow}>
            <span className={styles.sliderLabel}>{t('manualEdit.letterSpacing')}</span>
            <input
              type="range"
              min={-5}
              max={20}
              step={0.5}
              value={letterSpacing}
              onChange={(event) => setStyle({ letterSpacing: `${event.currentTarget.value}px` }, t('manualEdit.letterSpacing'))}
            />
            <input
              className={styles.sliderValue}
              type="number"
              step={0.5}
              value={letterSpacing}
              onChange={(event) => setStyle({ letterSpacing: `${event.currentTarget.value || 0}px` }, t('manualEdit.letterSpacing'))}
            />
          </label>
          <label className={styles.sliderRow}>
            <span className={styles.sliderLabel}>{t('manualEdit.lineHeight')}</span>
            <input
              type="range"
              min={0.8}
              max={3}
              step={0.05}
              value={lineHeight}
              onChange={(event) => setStyle({ lineHeight: event.currentTarget.value }, t('manualEdit.lineHeight'))}
            />
            <input
              className={styles.sliderValue}
              type="number"
              step={0.05}
              value={lineHeight}
              onChange={(event) => setStyle({ lineHeight: event.currentTarget.value || '1' }, t('manualEdit.lineHeight'))}
            />
          </label>
        </div>
      ) : null}

      {popover === 'color' ? (
        <div className={`${styles.popover} ${styles.popoverColor}${openDown ? ` ${styles.popoverDown}` : ''}`}>
          <ManualEditColorPicker value={currentColor} onChange={applyColor} />
        </div>
      ) : null}
    </div>
  );
}

function AlignGlyph({ kind }: { kind: 'left' | 'center' | 'right' }) {
  const x2 = kind === 'left' ? [21, 15, 21, 13] : kind === 'center' ? [21, 17, 21, 17] : [21, 21, 21, 21];
  const x1 = kind === 'left' ? [3, 3, 3, 3] : kind === 'center' ? [3, 7, 3, 7] : [3, 9, 3, 11];
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      {[5, 10, 15, 20].map((y, index) => (
        <line key={y} x1={x1[index]} y1={y} x2={x2[index]} y2={y} />
      ))}
    </svg>
  );
}

function SpacingGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <line x1="4" y1="6" x2="14" y2="6" />
      <line x1="4" y1="12" x2="11" y2="12" />
      <line x1="4" y1="18" x2="14" y2="18" />
      <path d="M19 5v14" />
      <path d="m17 8 2-2 2 2" />
      <path d="m17 16 2 2 2-2" />
    </svg>
  );
}

function stripUnit(value: string): string {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/i);
  if (match) return String(Math.round(Number(match[1])));
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? String(Math.round(parsed)) : '';
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
