import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { Icon } from './Icon';
import styles from './TweaksPanel.module.css';

export interface TweakVariable {
  name: string; // e.g. '--accent-hue'
  value: string; // e.g. '45deg'
}

type Props = {
  open: boolean;
  variables: TweakVariable[];
  onClose: () => void;
  onDiscover: () => void;
  onPreview: (vars: Record<string, string>) => void;
  onApply: (vars: Record<string, string>) => void;
  onReset: (vars: Record<string, string>) => void;
  previewing: Record<string, string>;
  initialValues: Record<string, string>;
};

function parseNumericValue(value: string): { num: number; unit: string } | null {
  const match = /^(-?[\d.]+)(.*)$/.exec(value.trim());
  if (!match || match[1] == null) return null;
  return { num: parseFloat(match[1]), unit: match[2] ?? '' };
}

function formatValue(num: number, unit: string): string {
  if (unit === '' || unit === 'px' || unit === 'deg' || unit === '%' || unit === 'ms' || unit === 's' || unit === 'em' || unit === 'rem') {
    return String(num) + unit;
  }
  if (Number.isInteger(num)) return String(num);
  return String(Math.round(num * 100) / 100);
}

const SLIDER_DEFAULTS: Record<string, { min: number; max: number; step: number }> = {
  '':        { min: 0,   max: 100,  step: 1 },
  'deg':     { min: 0,   max: 360,  step: 1   },
  'px':      { min: 0,   max: 200,  step: 1   },
  '%':       { min: 0,   max: 100,  step: 1   },
  'ms':      { min: 0,   max: 5000, step: 50 },
  's':       { min: 0,   max: 5,    step: 0.1 },
  'em':      { min: 0,   max: 5,    step: 0.1 },
  'rem':     { min: 0,   max: 5,    step: 0.1 },
};

const FALLBACK_SLIDER = { min: 0, max: 100, step: 1 } as const;

function getSliderDefaults(unit: string): { min: number; max: number; step: number } {
  return SLIDER_DEFAULTS[unit] ?? FALLBACK_SLIDER;
}

export function TweaksPanel({
  open,
  variables,
  onClose,
  onDiscover,
  onPreview,
  onApply,
  onReset,
  previewing,
  initialValues,
}: Props) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [dirtyVars, setDirtyVars] = useState<Record<string, string>>({});

  // Sync dirty vars when variables or preview change
  useEffect(() => {
    if (!open) return;
    setDirtyVars({});
    onDiscover();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(ev: MouseEvent) {
      // composedPath includes elements from the iframe content document; if
      // the panel itself is on the path, the click is inside it. Everything
      // else (including the iframe element itself) is "outside".
      if (rootRef.current && ev.composedPath().includes(rootRef.current)) return;
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

  const hasChanges = Object.keys(dirtyVars).length > 0;

  const handleSlider = (name: string, num: number, unit: string) => {
    const val = formatValue(num, unit);
    setDirtyVars((prev) => {
      if (prev[name] === val) return prev;
      return { ...prev, [name]: val };
    });
    onPreview({ [name]: val });
  };

  const handleCommitAll = () => {
    if (Object.keys(dirtyVars).length > 0) {
      onApply(dirtyVars);
      setDirtyVars({});
    }
  };

  const handleResetAll = () => {
    const resets: Record<string, string> = {};
    for (const v of variables) {
      resets[v.name] = initialValues[v.name] ?? v.value;
    }
    onReset(resets);
    setDirtyVars({});
  };

  if (!open) return null;

  return (
    <div className={styles.panel} ref={rootRef} role="dialog" aria-label={t('tweaks.title')}>
      <div className={styles.header}>
        <span className={styles.title}>{t('tweaks.title')}</span>
        <button
          type="button"
          className={styles.close}
          aria-label={t('manualEdit.closePanel')}
          onClick={onClose}
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className={styles.body}>
        {variables.length === 0 ? (
          <p className={styles.empty}>{t('tweaks.noVariables')}</p>
        ) : (
          <ul className={styles.list} role="list">
            {variables.map((v) => {
              const parsed = parseNumericValue(v.value);
              const unit = parsed?.unit ?? '';
              const defaults = getSliderDefaults(unit);
              const currentNum = parsed?.num ?? 0;
              const displayValue = dirtyVars[v.name] ?? previewing[v.name] ?? v.value;
              const displayParsed = parseNumericValue(displayValue);
              const displayNum = displayParsed?.num ?? currentNum;

              return (
                <li key={v.name} className={styles.item}>
                  <label className={styles.label}>
                    <span className={styles.varName}>{v.name}</span>
                    <span className={styles.varValue}>{displayValue}</span>
                  </label>
                  {parsed !== null ? (
                    <input
                      type="range"
                      className={styles.slider}
                      min={defaults.min}
                      max={defaults.max}
                      step={defaults.step}
                      value={displayNum}
                      onChange={(e) => handleSlider(v.name, parseFloat(e.target.value), unit)}
                      aria-label={v.name}
                    />
                  ) : (
                    <input
                      type="text"
                      className={styles.textInput}
                      value={dirtyVars[v.name] ?? displayValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDirtyVars((prev) => ({ ...prev, [v.name]: val }));
                        onPreview({ [v.name]: val });
                      }}
                      aria-label={v.name}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={handleCommitAll}
          disabled={!hasChanges}
        >
          {t('tweaks.commit')}
        </button>
        <button
          type="button"
          className={styles.btn}
          onClick={handleResetAll}
          disabled={variables.length === 0}
        >
          {t('tweaks.reset')}
        </button>
      </div>
    </div>
  );
}