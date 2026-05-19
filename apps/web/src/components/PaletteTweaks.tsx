import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';

export type PaletteId =
  | 'coral'
  | 'electric'
  | 'acid-forest'
  | 'risograph'
  | 'mono-noir';

type Swatch = { id: PaletteId; labelKey: keyof Dict; stripe: string[] };

const PALETTES: Swatch[] = [
  { id: 'coral',       labelKey: 'paletteTweaks.coral', stripe: ['#ff5a3c', '#ff7a5c', '#fde2d6', '#171717'] },
  { id: 'electric',    labelKey: 'paletteTweaks.electric', stripe: ['#7c3aed', '#a855f7', '#e9d5ff', '#171717'] },
  { id: 'acid-forest', labelKey: 'paletteTweaks.acidForest', stripe: ['#16a34a', '#22c55e', '#bbf7d0', '#0f1d14'] },
  { id: 'risograph',   labelKey: 'paletteTweaks.risograph', stripe: ['#e11d48', '#2563eb', '#fde68a', '#171717'] },
  { id: 'mono-noir',   labelKey: 'paletteTweaks.monoNoir', stripe: ['#0a0a0a', '#262626', '#e5e5e5', '#fafafa'] },
];

type Props = {
  open: boolean;
  selected: PaletteId | null;
  onChange: (id: PaletteId | null) => void;
  onPreview: (id: PaletteId | null) => void;
  onClose: () => void;
};

export function PaletteTweaks({ open, selected, onChange, onPreview, onClose }: Props) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<PaletteId | 'original' | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(ev: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(ev.target as Node)) return;
      onClose();
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setHovered(null);
      onPreview(null);
    }
  }, [open, onPreview]);

  const setHover = useCallback(
    (id: PaletteId | 'original' | null) => {
      setHovered(id);
      if (id === 'original') onPreview(null);
      else if (id === null) onPreview(selected);
      else onPreview(id);
    },
    [onPreview, selected],
  );

  if (!open) return null;
  const isOriginal = selected === null;

  return (
    <div className="palette-tweaks" ref={rootRef} role="dialog" aria-label={t('paletteTweaks.aria')}>
      <div className="palette-tweaks-header">
        <span className="palette-tweaks-title">{t('paletteTweaks.title')}</span>
        <span className="palette-tweaks-sub">{t('paletteTweaks.subtitle')}</span>
      </div>
      <ul className="palette-tweaks-list" role="listbox">
        <li
          role="option"
          aria-selected={isOriginal}
          className={`palette-tweaks-item${isOriginal ? ' selected' : ''}${hovered === 'original' ? ' hovered' : ''}`}
          onMouseEnter={() => setHover('original')}
          onMouseLeave={() => setHover(null)}
          onClick={() => { onChange(null); onClose(); }}
        >
          <span className="palette-tweaks-stripe palette-tweaks-stripe-original" aria-hidden>
            <span className="palette-tweaks-chip palette-tweaks-chip-original" />
          </span>
          <span className="palette-tweaks-label">{t('paletteTweaks.original')}</span>
          {isOriginal ? (
            <span className="palette-tweaks-check" aria-hidden>
              <Icon name="check" size={12} />
            </span>
          ) : null}
        </li>
        {PALETTES.map((p) => {
          const isSelected = selected === p.id;
          const isHovered = hovered === p.id;
          return (
            <li
              key={p.id}
              role="option"
              aria-selected={isSelected}
              className={`palette-tweaks-item${isSelected ? ' selected' : ''}${isHovered ? ' hovered' : ''}`}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => {
                onChange(isSelected ? null : p.id);
                onClose();
              }}
            >
              <span className="palette-tweaks-stripe" aria-hidden>
                {p.stripe.map((c, i) => (
                  <span key={i} className="palette-tweaks-chip" style={{ backgroundColor: c }} />
                ))}
              </span>
              <span className="palette-tweaks-label">{t(p.labelKey)}</span>
              {isSelected ? (
                <span className="palette-tweaks-check" aria-hidden>
                  <Icon name="check" size={12} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
