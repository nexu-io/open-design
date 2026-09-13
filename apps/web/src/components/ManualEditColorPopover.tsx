import { useEffect, useLayoutEffect, useRef, useState, type RefObject, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button, Input, Select } from '@open-design/components';
import { useT } from '../i18n';
import { clampColor, parsePickerColor, formatPickerColor, formatPickerDisplay, pickerHex, type PickerFormat, type PickerColor } from '../edit-mode/color-picker';
import css from './ManualEditColorPopover.module.css';

type EyeDropperConstructor = new () => { open: () => Promise<{ sRGBHex: string }> };

export function ManualEditColorPopover({ value, anchor, label, onChange, onClose, format, onFormatChange }: {
  format: PickerFormat; onFormatChange: (format: PickerFormat) => void;
  value: string; anchor: RefObject<HTMLSpanElement>; label: string;
  onChange: (value: string) => void; onClose: () => void;
}) {
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string>();
  const [color, setColor] = useState<PickerColor>(() => parsePickerColor(value) ?? { h: 0, s: 0, v: 0, a: 1 });
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [sampling, setSampling] = useState(false);
  const EyeDropper = typeof window === 'undefined' ? undefined : (window as Window & { EyeDropper?: EyeDropperConstructor }).EyeDropper;
  useEffect(() => {
    if (value === lastEmitted.current) return;
    const parsed = parsePickerColor(value);
    if (parsed) setColor(parsed);
  }, [value]);
  const update = (next: PickerColor) => {
    setColor(next);
    const output = formatPickerColor(next, 'hex');
    lastEmitted.current = output;
    onChange(output);
  };
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor.current || !panel.current) return;
      const a = anchor.current.getBoundingClientRect(), p = panel.current.getBoundingClientRect();
      setPosition({ left: Math.max(8, Math.min(a.right - p.width, window.innerWidth - p.width - 8)), top: Math.max(8, Math.min(a.bottom + 8 + p.height <= window.innerHeight - 8 ? a.bottom + 8 : a.top - p.height - 8, window.innerHeight - p.height - 8)) });
    };
    place();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    if (panel.current) observer?.observe(panel.current);
    if (anchor.current) observer?.observe(anchor.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { observer?.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchor]);
  useEffect(() => {
    const outside = (e: globalThis.PointerEvent) => {
      if (!sampling && !panel.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) onClose();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || sampling) return;
      e.preventDefault(); e.stopPropagation(); onClose(); anchor.current?.querySelector('button')?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [anchor, onClose, sampling]);
  const selectPoint = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    update({ ...color, s: clampColor((event.clientX - rect.left) / rect.width), v: 1 - clampColor((event.clientY - rect.top) / rect.height) });
  };
  // Match the serialized value used by the outer field, including RGB/alpha rounding.
  const display = formatPickerDisplay(parsePickerColor(formatPickerColor(color, 'hex')) ?? color, format);
  const commit = (text: string) => {
    const parsed = parsePickerColor(text) ?? parsePickerColor(format === 'hex' ? (text.startsWith('#') ? text : '#' + text) : format === 'rgb' ? `rgb(${text})` : format === 'hsl' ? `hsl(${text})` : text);
    if (!parsed) return false;
    update({ ...parsed, a: /^(rgba|hsla)\(|\//i.test(text) || format === 'css' || (format === 'hex' && [4, 8].includes(text.replace('#', '').length)) ? parsed.a : color.a });
    return true;
  };
  return createPortal(
    <div ref={panel} role="dialog" aria-label={label} className={css.popover} style={position}>
      <div className={css.selection} style={{ backgroundColor: `hsl(${color.h} 100% 50%)` }}
        onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); selectPoint(e); }}
        onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) selectPoint(e); }}
        onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}>
        <span className={css.thumb} style={{ left: `clamp(8px, ${color.s * 100}%, calc(100% - 8px))`, top: `clamp(8px, ${(1 - color.v) * 100}%, calc(100% - 8px))` }} />
      </div>
      <div className={css.adjustments}>
        <Button className={css.eyedropper} size="icon" disabled={!EyeDropper || sampling} aria-label={t('manualEdit.pickColor')} title={t('manualEdit.pickColor')}
          onClick={async () => {
            if (!EyeDropper) return;
            setSampling(true);
            try { const result = await new EyeDropper().open(); const parsed = parsePickerColor(result.sRGBHex); if (parsed) update(parsed); }
            catch { /* Cancellation leaves the current color unchanged. */ }
            finally { setSampling(false); }
          }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6 3-3a2.1 2.1 0 0 1 3 3l-3 3M13 4l7 7M15 6 4 17l-1 4 4-1L18 9" /></svg>
        </Button>
        <div className={css.sliders}>
          <input className={`${css.range} ${css.hue}`} type="range" min="0" max="360" step="1" value={color.h} aria-label={t('manualEdit.colorHue')} onChange={e => update({ ...color, h: Number(e.target.value) })} />
          <div className={css.checker}>
            <input className={css.range} style={{ background: `linear-gradient(to right, transparent, ${pickerHex(color)})` }} type="range" min="0" max="100" step="1" value={color.a * 100} aria-label={t('manualEdit.opacity')} onChange={e => update({ ...color, a: Number(e.target.value) / 100 })} />
          </div>
        </div>
      </div>
      <div className={css.keyboardChannels}>
        <input type="range" min="0" max="100" value={color.s * 100} aria-label={t('manualEdit.colorSaturation')} onChange={e => update({ ...color, s: Number(e.target.value) / 100 })} />
        <input type="range" min="0" max="100" value={color.v * 100} aria-label={t('manualEdit.colorBrightness')} onChange={e => update({ ...color, v: Number(e.target.value) / 100 })} />
      </div>
      <div className={css.fields}>
        <Select className={css.mode} aria-label={t('manualEdit.colorFormat')} value={format} onChange={e => onFormatChange(e.target.value as PickerFormat)}>
          {(['hex', 'rgb', 'hsl', 'css'] as const).map(mode => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}
        </Select>
        <ColorValue key={format} value={display} label={format.toUpperCase()} commit={commit} />
        <label className={css.alpha}><Input type="number" min="0" max="100" aria-label={t('manualEdit.opacity')} value={Math.round(color.a * 100)} onChange={e => { if (e.target.value !== '') update({ ...color, a: clampColor(Number(e.target.value), 100) / 100 }); }} /><span>%</span></label>
      </div>
    </div>, document.body,
  );
}

function ColorValue({ value, label, commit }: { value: string; label: string; commit: (value: string) => boolean }) {
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(value); setInvalid(false); }, [value]);
  const apply = () => { if (!commit(draft)) { setDraft(value); setInvalid(false); } };
  return <Input className={css.value} aria-label={label} aria-invalid={invalid} value={draft} onChange={e => { setDraft(e.target.value); setInvalid(false); }} onBlur={apply} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setInvalid(!commit(draft)); } }} />;
}
