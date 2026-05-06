import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { emptyManualEditStyles, type ManualEditHistoryEntry, type ManualEditPatch, type ManualEditStyles, type ManualEditTarget } from '../edit-mode/types';

export interface ManualEditDraft {
  text: string;
  href: string;
  src: string;
  alt: string;
  styles: ManualEditStyles;
  attributesText: string;
  outerHtml: string;
  fullSource: string;
}

export type ManualEditTab = 'content' | 'style' | 'attributes' | 'html' | 'source';

export function emptyManualEditDraft(source = ''): ManualEditDraft {
  return {
    text: '',
    href: '',
    src: '',
    alt: '',
    styles: emptyManualEditStyles(),
    attributesText: '{}',
    outerHtml: '',
    fullSource: source,
  };
}

export function ManualEditPanel({
  targets,
  selectedTarget,
  draft,
  history,
  error,
  canUndo,
  canRedo,
  busy = false,
  onSelectTarget,
  onDraftChange,
  onApplyPatch,
  onError,
  onCancelDraft,
  onUndo,
  onRedo,
}: {
  targets: ManualEditTarget[];
  selectedTarget: ManualEditTarget | null;
  draft: ManualEditDraft;
  history: ManualEditHistoryEntry[];
  error: string | null;
  canUndo: boolean;
  canRedo: boolean;
  busy?: boolean;
  onSelectTarget: (target: ManualEditTarget) => void;
  onDraftChange: (draft: ManualEditDraft) => void;
  onApplyPatch: (patch: ManualEditPatch, label: string) => void;
  onError: (message: string) => void;
  onCancelDraft: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<ManualEditTab>('content');

  useEffect(() => {
    setTab('content');
  }, [selectedTarget?.id]);

  return (
    <>
      <aside className="manual-edit-layers">
        <div className="manual-edit-panel-head">
          <h3>{t('manualEdit.layers')}</h3>
          <span>{t('manualEdit.editableCount', { count: targets.length })}</span>
        </div>
        <div className="manual-edit-layer-list">
          {targets.map((target) => (
            <button
              key={target.id}
              type="button"
              className={`manual-edit-layer-row ${selectedTarget?.id === target.id ? 'selected' : ''}`}
              onClick={() => onSelectTarget(target)}
            >
              <strong>{target.label}</strong>
              <span>{target.kind} - {target.id}</span>
            </button>
          ))}
        </div>
      </aside>

      <aside className="manual-edit-right">
        <section className="manual-edit-modal">
          <div className="manual-edit-modal-head">
            <div>
              <span>{t('manualEdit.title')}</span>
              <h3>{selectedTarget?.label ?? t('manualEdit.selectLayer')}</h3>
            </div>
            <em>{selectedTarget?.kind ?? 'none'}</em>
          </div>
          {!selectedTarget ? (
            <div className="manual-edit-empty">{t('manualEdit.empty')}</div>
          ) : (
            <>
              <div className="manual-edit-meta">
                <div>
                  <strong>{selectedTarget.tagName}</strong>
                  <span>{selectedTarget.id}</span>
                </div>
                <code>{selectedTarget.className || t('manualEdit.noClass')}</code>
              </div>
              <div className="manual-edit-tabs" role="tablist" aria-label={t('manualEdit.tabsAria')}>
                <EditTabButton label={t('manualEdit.tabContent')} tab="content" active={tab === 'content'} onClick={setTab} />
                <EditTabButton label={t('manualEdit.tabStyle')} tab="style" active={tab === 'style'} onClick={setTab} />
                <EditTabButton label={t('manualEdit.tabAttributes')} tab="attributes" active={tab === 'attributes'} onClick={setTab} />
                <EditTabButton label={t('manualEdit.tabHtml')} tab="html" active={tab === 'html'} onClick={setTab} />
                <EditTabButton label={t('manualEdit.tabSource')} tab="source" active={tab === 'source'} onClick={setTab} />
              </div>
              <div className="manual-edit-tab-body">
                {tab === 'content' ? (
                  <ContentEditor target={selectedTarget} draft={draft} onDraftChange={onDraftChange} />
                ) : null}
                {tab === 'style' ? (
                  <StyleEditor
                    styles={draft.styles}
                    onChange={(styles) => onDraftChange({ ...draft, styles })}
                  />
                ) : null}
                {tab === 'attributes' ? (
                  <label className="manual-edit-field">
                    <span>{t('manualEdit.attributesJson')}</span>
                    <textarea
                      className="manual-edit-code"
                      value={draft.attributesText}
                      onChange={(event) => onDraftChange({ ...draft, attributesText: event.currentTarget.value })}
                    />
                  </label>
                ) : null}
                {tab === 'html' ? (
                  <label className="manual-edit-field">
                    <span>{t('manualEdit.selectedHtml')}</span>
                    <textarea
                      className="manual-edit-code tall"
                      value={draft.outerHtml}
                      onChange={(event) => onDraftChange({ ...draft, outerHtml: event.currentTarget.value })}
                    />
                  </label>
                ) : null}
                {tab === 'source' ? (
                  <label className="manual-edit-field">
                    <span>{t('manualEdit.fullSource')}</span>
                    <textarea
                      className="manual-edit-code tall"
                      value={draft.fullSource}
                      onChange={(event) => onDraftChange({ ...draft, fullSource: event.currentTarget.value })}
                    />
                  </label>
                ) : null}
              </div>
              {error ? <div className="manual-edit-error">{error}</div> : null}
              <div className="manual-edit-actions">
                <button type="button" onClick={onCancelDraft} disabled={busy}>{t('common.cancel')}</button>
                {tab === 'content' ? (
                  <button type="button" className="primary" disabled={busy} onClick={() => onApplyPatch(contentPatch(selectedTarget, draft), `Content: ${selectedTarget.label}`)}>
                    {t('manualEdit.applyContent')}
                  </button>
                ) : null}
                {tab === 'style' ? (
                  <button type="button" className="primary" disabled={busy} onClick={() => onApplyPatch({ id: selectedTarget.id, kind: 'set-style', styles: draft.styles }, `Style: ${selectedTarget.label}`)}>
                    {t('manualEdit.applyStyle')}
                  </button>
                ) : null}
                {tab === 'attributes' ? (
                  <button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() => {
                      try {
                        onApplyPatch(parseAttributesPatch(selectedTarget.id, draft.attributesText), `Attributes: ${selectedTarget.label}`);
                      } catch (err) {
                        onError(err instanceof Error ? err.message : t('manualEdit.invalidAttributes'));
                      }
                    }}
                  >
                    {t('manualEdit.applyAttributes')}
                  </button>
                ) : null}
                {tab === 'html' ? (
                  <button type="button" className="primary" disabled={busy} onClick={() => onApplyPatch({ id: selectedTarget.id, kind: 'set-outer-html', html: draft.outerHtml }, `HTML: ${selectedTarget.label}`)}>
                    {t('manualEdit.applyHtml')}
                  </button>
                ) : null}
                {tab === 'source' ? (
                  <button type="button" className="primary" disabled={busy} onClick={() => onApplyPatch({ kind: 'set-full-source', source: draft.fullSource }, 'Full source')}>
                    {t('manualEdit.applySource')}
                  </button>
                ) : null}
              </div>
            </>
          )}
        </section>

        <section className="manual-edit-changes">
          <div className="manual-edit-panel-head">
            <h3>{t('manualEdit.changes')}</h3>
            <span>{history.length}</span>
          </div>
          <div className="manual-edit-history-actions">
            <button type="button" onClick={onUndo} disabled={busy || !canUndo}>{t('manualEdit.undo')}</button>
            <button type="button" onClick={onRedo} disabled={busy || !canRedo}>{t('manualEdit.redo')}</button>
          </div>
          {history.length === 0 ? (
            <div className="manual-edit-empty">{t('manualEdit.noChanges')}</div>
          ) : (
            <div className="manual-edit-history-list">
              {history.map((entry) => (
                <article key={entry.id} className="manual-edit-history-entry">
                  <strong>{entry.label}</strong>
                  <code>{manualEditPatchSummary(entry.patch)}</code>
                </article>
              ))}
            </div>
          )}
        </section>
      </aside>
    </>
  );
}

function ContentEditor({
  target,
  draft,
  onDraftChange,
}: {
  target: ManualEditTarget;
  draft: ManualEditDraft;
  onDraftChange: (draft: ManualEditDraft) => void;
}) {
  const t = useT();
  if (target.kind === 'image') {
    return (
      <>
        <label className="manual-edit-field">
          <span>{t('manualEdit.imageUrl')}</span>
          <input value={draft.src} onChange={(event) => onDraftChange({ ...draft, src: event.currentTarget.value })} />
        </label>
        <label className="manual-edit-field">
          <span>{t('manualEdit.altText')}</span>
          <input value={draft.alt} onChange={(event) => onDraftChange({ ...draft, alt: event.currentTarget.value })} />
        </label>
      </>
    );
  }
  return (
    <>
      <label className="manual-edit-field">
        <span>{target.kind === 'link' ? t('manualEdit.label') : t('manualEdit.text')}</span>
        <textarea value={draft.text} onChange={(event) => onDraftChange({ ...draft, text: event.currentTarget.value })} />
      </label>
      {target.kind === 'link' ? (
        <label className="manual-edit-field">
          <span>{t('manualEdit.href')}</span>
          <input value={draft.href} onChange={(event) => onDraftChange({ ...draft, href: event.currentTarget.value })} />
        </label>
      ) : null}
    </>
  );
}

function StyleEditor({
  styles,
  onChange,
}: {
  styles: ManualEditStyles;
  onChange: (styles: ManualEditStyles) => void;
}) {
  const t = useT();
  const update = (key: keyof ManualEditStyles, value: string) => onChange({ ...styles, [key]: value });
  return (
    <div className="manual-edit-style-grid">
      <StyleInput label={t('manualEdit.textColor')} value={styles.color} onChange={(value) => update('color', value)} />
      <StyleInput label={t('manualEdit.background')} value={styles.backgroundColor} onChange={(value) => update('backgroundColor', value)} />
      <StyleInput label={t('manualEdit.fontSize')} value={styles.fontSize} placeholder="46px" onChange={(value) => update('fontSize', value)} />
      <label className="manual-edit-field compact">
        <span>{t('manualEdit.weight')}</span>
        <select value={styles.fontWeight} onChange={(event) => update('fontWeight', event.currentTarget.value)}>
          <option value="">default</option>
          <option value="400">400</option>
          <option value="500">500</option>
          <option value="600">600</option>
          <option value="700">700</option>
          <option value="800">800</option>
        </select>
      </label>
      <label className="manual-edit-field compact">
        <span>{t('manualEdit.align')}</span>
        <select value={styles.textAlign} onChange={(event) => update('textAlign', event.currentTarget.value)}>
          <option value="">default</option>
          <option value="left">left</option>
          <option value="center">center</option>
          <option value="right">right</option>
        </select>
      </label>
      <StyleInput label={t('manualEdit.padding')} value={styles.padding} placeholder="24px" onChange={(value) => update('padding', value)} />
      <StyleInput label={t('manualEdit.margin')} value={styles.margin} placeholder="0 0 16px" onChange={(value) => update('margin', value)} />
      <StyleInput label={t('manualEdit.radius')} value={styles.borderRadius} placeholder="8px" onChange={(value) => update('borderRadius', value)} />
      <StyleInput label={t('manualEdit.border')} value={styles.border} placeholder="1px solid #d0d5dd" wide onChange={(value) => update('border', value)} />
      <StyleInput label={t('manualEdit.width')} value={styles.width} placeholder="100%" onChange={(value) => update('width', value)} />
      <StyleInput label={t('manualEdit.minHeight')} value={styles.minHeight} placeholder="240px" onChange={(value) => update('minHeight', value)} />
    </div>
  );
}

function StyleInput({
  label,
  value,
  placeholder,
  wide,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  wide?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`manual-edit-field compact ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
  );
}

function EditTabButton({
  tab,
  label,
  active,
  onClick,
}: {
  tab: ManualEditTab;
  label: string;
  active: boolean;
  onClick: (tab: ManualEditTab) => void;
}) {
  return (
    <button type="button" className={active ? 'active' : ''} role="tab" aria-selected={active} onClick={() => onClick(tab)}>
      {label}
    </button>
  );
}

function contentPatch(target: ManualEditTarget, draft: ManualEditDraft): ManualEditPatch {
  if (target.kind === 'link') return { id: target.id, kind: 'set-link', text: draft.text, href: draft.href };
  if (target.kind === 'image') return { id: target.id, kind: 'set-image', src: draft.src, alt: draft.alt };
  return { id: target.id, kind: 'set-text', value: draft.text };
}

export function manualEditPatchSummary(patch: ManualEditPatch): string {
  if (patch.kind === 'set-full-source') {
    return JSON.stringify({ kind: patch.kind, bytes: patch.source.length });
  }
  if (patch.kind === 'set-outer-html') {
    return JSON.stringify({ id: patch.id, kind: patch.kind, bytes: patch.html.length });
  }
  return JSON.stringify(patch);
}

function parseAttributesPatch(id: string, attributesText: string): ManualEditPatch {
  const parsed = JSON.parse(attributesText) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Attributes must be a JSON object.');
  }
  return {
    id,
    kind: 'set-attributes',
    attributes: Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)])),
  };
}
