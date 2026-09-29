import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import type { ManualEditPatch, ManualEditTarget } from '../edit-mode/types';
import styles from './ContentTweaksPanel.module.css';

type PatchAction = (patch: ManualEditPatch, label: string) => Promise<boolean>;

const COPY_TAGS = new Set(['h1', 'h2', 'h3', 'p', 'a', 'button']);
const SECTION_TAGS = new Set(['section', 'article', 'aside', 'header', 'footer']);

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
    void onPatch(patch, `${t('fileViewer.contentTweaks')}: ${target.label}`);
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

export function ContentTweaksPanel({ targets, onPatch, onUndo, onRedo, canUndo, canRedo, busy, error, onClose }: {
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
  const sections = targets.filter((target) => SECTION_TAGS.has(target.tagName)).slice(0, 16);
  return (
    <aside className={styles.panel} aria-label={t('fileViewer.contentTweaks')} data-testid="content-tweaks-panel">
      <header className={styles.header}>
        <div><strong>{t('fileViewer.contentTweaks')}</strong><p>{t('contentTweaks.hint')}</p></div>
        <button type="button" aria-label={t('manualEdit.closePanel')} onClick={onClose}>×</button>
      </header>
      <div className={styles.body}>
        <h3>{t('contentTweaks.copy')}</h3>
        {copy.length ? copy.map((target) => <ContentRow key={target.id} target={target} onPatch={onPatch} busy={busy} />) : <p className={styles.empty}>{t('contentTweaks.emptyCopy')}</p>}
        <h3>{t('contentTweaks.sections')}</h3>
        {sections.length ? sections.map((target) => {
          const visible = !target.isHidden;
          const name = target.text.slice(0, 55) || target.label;
          return <label className={styles.toggleRow} key={target.id}>
            <span>{target.tagName.toUpperCase()} · {name}</span>
            <input type="checkbox" checked={visible} disabled={busy}
              onChange={() => void onPatch({ id: target.id, kind: 'set-visibility', visible: !visible }, `${visible ? t('contentTweaks.hide') : t('contentTweaks.show')}: ${name}`)} />
          </label>;
        }) : <p className={styles.empty}>{t('contentTweaks.emptySections')}</p>}
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
