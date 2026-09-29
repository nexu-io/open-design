import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import type { ManualEditLayoutPreset, ManualEditPatch, ManualEditTarget } from '../edit-mode/types';
import styles from './LayoutTweaksPanel.module.css';

type PatchAction = (patch: ManualEditPatch, label: string) => Promise<boolean>;

const COPY_TAGS = new Set(['h1', 'h2', 'h3', 'p', 'a', 'button']);
const LAYOUT_TAGS = new Set(['main', 'section', 'article', 'aside', 'header', 'footer', 'nav']);
const LAYOUT_CLASS = /hero|grid|cards|layout|split|columns|sidebar/i;
const LAYOUT_PRESETS: readonly ManualEditLayoutPreset[] = ['original', 'stack', 'row', 'reverse', 'grid-2', 'grid-3'];
const LAYOUT_LABELS = { original: 'layoutOriginal', stack: 'layoutStack', row: 'layoutRow', reverse: 'layoutReverse', 'grid-2': 'layoutGrid2', 'grid-3': 'layoutGrid3' } as const;

function ContentRow({ target, onPatch, busy }: {
  target: ManualEditTarget;
  onPatch: PatchAction;
  busy: boolean;
}) {
  const t = useT();
  const current = target.fields.text ?? target.text;
  const [draft, setDraft] = useState(current);
  const changed = draft !== current;
  useEffect(() => setDraft(current), [current]);
  const apply = () => {
    if (!changed || busy) return;
    const patch: ManualEditPatch = target.kind === 'link'
      ? { id: target.id, kind: 'set-link', text: draft, href: target.fields.href ?? '' }
      : { id: target.id, kind: 'set-text', value: draft };
    void onPatch(patch, `${t('fileViewer.layoutTweaks')}: ${target.label}`);
  };
  return (
    <div className={styles.row}>
      <label className={styles.label} htmlFor={`content-tweak-${target.id}`}>{target.tagName.toUpperCase()} · {target.label}</label>
      <div className={styles.editor}>
        <input id={`content-tweak-${target.id}`} value={draft} onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') apply(); }} />
        <button type="button" disabled={!changed || busy} onClick={apply}>{t('contentTweaks.apply')}</button>
      </div>
    </div>
  );
}

export function LayoutTweaksPanel({ targets, onPatch, onUndo, onRedo, canUndo, canRedo, busy, error, onClose }: {
  targets: ManualEditTarget[];
  onPatch: PatchAction;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const copy = targets.filter((target) => COPY_TAGS.has(target.tagName) && (target.kind === 'text' || target.kind === 'link') && target.fields.text?.trim()).slice(0, 24);
  const layouts = targets.filter((target) => target.isLayoutContainer && (LAYOUT_TAGS.has(target.tagName) || LAYOUT_CLASS.test(target.className))).slice(0, 12);
  return (
    <aside className={styles.panel} aria-label={t('fileViewer.layoutTweaks')} data-testid="layout-tweaks-panel">
      <header className={styles.header}>
        <div><strong>{t('fileViewer.layoutTweaks')}</strong><p>{t('contentTweaks.hint')}</p></div>
        <button type="button" aria-label={t('manualEdit.closePanel')} onClick={onClose}>×</button>
      </header>
      <div className={styles.body}>
        <h3>{t('contentTweaks.layouts')}</h3>
        {layouts.length ? layouts.map((target) => {
          const mode = (target.attributes['data-od-tweaks-layout-mode'] ?? 'original') as ManualEditLayoutPreset;
          const name = target.attributes['data-od-label'] || target.className.split(/\s+/).find((item) => item && !item.startsWith('css-')) || target.tagName;
          return <div className={styles.layoutRow} key={target.id}>
            <div className={styles.layoutLabel}>{name} <small>{target.computedSummary?.display ?? target.tagName}</small></div>
            <div className={styles.presetGrid} role="group" aria-label={`${name} ${t('contentTweaks.layouts')}`}>
              {LAYOUT_PRESETS.map((preset) => <button key={preset} type="button"
                className={mode === preset ? styles.selected : undefined}
                aria-pressed={mode === preset} disabled={busy}
                onClick={() => { if (mode !== preset) void onPatch({ id: target.id, kind: 'set-layout', layout: preset }, `${t('fileViewer.layoutTweaks')}: ${name} · ${t(`contentTweaks.${LAYOUT_LABELS[preset]}`)}`); }}
              >{t(`contentTweaks.${LAYOUT_LABELS[preset]}`)}</button>)}
            </div>
          </div>;
        }) : <p className={styles.empty}>{t('contentTweaks.emptyLayouts')}</p>}
        <h3>{t('contentTweaks.copy')}</h3>
        {copy.length ? copy.map((target) => <ContentRow key={target.id} target={target} onPatch={onPatch} busy={busy} />) : <p className={styles.empty}>{t('contentTweaks.emptyCopy')}</p>}
      </div>
      <footer className={styles.footer}>
        <button type="button" disabled={busy || !canUndo} onClick={onUndo}>{t('manualEdit.undo')}</button>
        <button type="button" disabled={busy || !canRedo} onClick={onRedo}>{t('manualEdit.redo')}</button>
        {busy && <span role="status">{t('contentTweaks.saving')}</span>}
        {error && <p role="alert">{error}</p>}
      </footer>
    </aside>
  );
}
