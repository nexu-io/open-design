import { useEffect, useRef, useState } from 'react';
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

export function emptyManualEditDraft(source = ''): ManualEditDraft {
  return {
    text: '', href: '', src: '', alt: '',
    styles: emptyManualEditStyles(),
    attributesText: '{}', outerHtml: '', fullSource: source,
  };
}

export function ManualEditPanel({
  targets,
  selectedTarget,
  draft,
  error,
  canUndo,
  onSelectTarget,
  onDraftChange,
  onStyleChange,
  onInvalidStyle,
  onApplyPatch,
  onError,
  onClearSelection,
  onPickImage,
  busy = false,
  pageStylesEnabled = true,
}: {
  targets: ManualEditTarget[];
  selectedTarget: ManualEditTarget | null;
  draft: ManualEditDraft;
  history: ManualEditHistoryEntry[];
  error: string | null;
  canUndo: boolean;
  canRedo: boolean;
  busy?: boolean;
  pageStylesEnabled?: boolean;
  onSelectTarget: (target: ManualEditTarget) => void;
  onDraftChange: (draft: ManualEditDraft) => void;
  onStyleChange?: (id: string, styles: Partial<ManualEditStyles>, label: string) => void;
  onInvalidStyle?: (id: string, keys: Array<keyof ManualEditStyles>) => void;
  onApplyPatch: (patch: ManualEditPatch, label: string) => void;
  onPickImage?: (file: File) => Promise<string | null>;
  onError: (message: string) => void;
  onClearSelection: () => void;
  onCancelDraft: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const t = useT();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const selectedTargetRef = useRef<ManualEditTarget | null>(selectedTarget);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const targetForInspector = selectedTarget;
  useEffect(() => {
    selectedTargetRef.current = selectedTarget;
  }, [selectedTarget]);
  const [activeTab, setActiveTab] = useState<ManualEditTab>('style');
  const tab = targetForInspector
    ? (activeTab === 'page' ? 'style' : activeTab)
    : (activeTab === 'source' ? 'source' : 'page');

  const changeTargetStyle = (key: keyof ManualEditStyles, value: string) => {
    const nextStyles = { ...draft.styles, [key]: value };
    onDraftChange({ ...draft, styles: nextStyles });
    if (!targetForInspector) return;
    const normalized = normalizeManualEditStyles({ [key]: value }, {
      layoutEnabled: targetForInspector.isLayoutContainer,
    });
    if (!normalized.ok) {
      onError(normalized.error);
      onInvalidStyle?.(targetForInspector.id, [key]);
      return;
    }
    onError('');
    onStyleChange?.(targetForInspector.id, normalized.styles, `Style: ${targetForInspector.label}`);
  };
  const applyAttributes = () => {
    if (!targetForInspector) return;
    try {
      const parsed = JSON.parse(draft.attributesText) as unknown;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
      const attributes = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
      );
      onError('');
      onApplyPatch({ id: targetForInspector.id, kind: 'set-attributes', attributes }, `Attributes: ${targetForInspector.label}`);
    } catch {
      onError('Invalid attributes JSON.');
    }
  };
  const applyContent = () => {
    if (!targetForInspector) return;
    if (targetForInspector.kind === 'link') {
      onApplyPatch({ id: targetForInspector.id, kind: 'set-link', text: draft.text, href: draft.href }, `Content: ${targetForInspector.label}`);
      return;
    }
    if (targetForInspector.kind === 'image') {
      onApplyPatch({ id: targetForInspector.id, kind: 'set-image', src: draft.src, alt: draft.alt }, `Content: ${targetForInspector.label}`);
      return;
    }
    onApplyPatch({ id: targetForInspector.id, kind: 'set-text', value: draft.text }, `Content: ${targetForInspector.label}`);
  };

  return (
    <>
      <section className="manual-edit-layers">
        <div className="manual-edit-panel-head">
          <h3>{t('manualEdit.layers')}</h3>
          <span>{targets.length}</span>
        </div>
        <div className="manual-edit-layer-list">
          {targets.length > 0 ? targets.map((target) => (
            <button
              key={target.id}
              type="button"
              className={`manual-edit-layer-row${selectedTarget?.id === target.id ? ' selected' : ''}`}
              onClick={() => onSelectTarget(target)}
            >
              <strong>{target.label}</strong>
              <span>
                {target.tagName}
                {target.isHidden ? ` - ${t('manualEdit.hiddenBadge')}` : ''}
              </span>
            </button>
          )) : (
            <p className="manual-edit-empty">{t('manualEdit.noEditableLayers')}</p>
          )}
        </div>
      </section>
      <aside className="manual-edit-right">
        <section className="manual-edit-modal cc-panel">
          <div className="manual-edit-tabs" role="tablist" aria-label="Manual edit tabs">
            {(targetForInspector ? ELEMENT_TABS : PAGE_TABS).map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? 'selected' : ''}
                onClick={() => setActiveTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {targetForInspector ? (
            <>
              {tab === 'content' ? (
                <ContentEditor
                  target={targetForInspector}
                  draft={draft}
                  busy={busy}
                  onDraftChange={onDraftChange}
                  onApply={applyContent}
                />
              ) : null}
              {tab === 'style' ? (
                <StyleInspector
                  styles={draft.styles}
                  layoutEnabled={targetForInspector.isLayoutContainer}
                  onClearSelection={onClearSelection}
                  onChange={changeTargetStyle}
                />
              ) : null}
              {tab === 'attributes' ? (
                <div className="manual-edit-tab-body">
                  <label className="manual-edit-field">
                    <span>Attributes JSON</span>
                    <textarea
                      className="manual-edit-code"
                      value={draft.attributesText}
                      onChange={(event) => onDraftChange({ ...draft, attributesText: event.currentTarget.value })}
                    />
                  </label>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={applyAttributes}>Apply Attributes</button>
                </div>
              ) : null}
              {tab === 'html' ? (
                <div className="manual-edit-tab-body">
                  <label className="manual-edit-field">
                    <span>Selected element HTML</span>
                    <textarea
                      className="manual-edit-code tall"
                      value={draft.outerHtml}
                      onChange={(event) => onDraftChange({ ...draft, outerHtml: event.currentTarget.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => onApplyPatch({ id: targetForInspector.id, kind: 'set-outer-html', html: draft.outerHtml }, `HTML: ${targetForInspector.label}`)}
                  >
                    Apply HTML
                  </button>
                </div>
              ) : null}
              {tab === 'source' ? (
                <SourceEditor
                  draft={draft}
                  busy={busy}
                  onDraftChange={onDraftChange}
                  onApply={() => onApplyPatch({ kind: 'set-full-source', source: draft.fullSource }, 'Full source')}
                />
              ) : null}
            </>
          ) : !targetForInspector ? (
            tab === 'source' ? (
              <SourceEditor
                draft={draft}
                busy={busy}
                onDraftChange={onDraftChange}
                onApply={() => onApplyPatch({ kind: 'set-full-source', source: draft.fullSource }, 'Full source')}
              />
            ) : (
              <PageInspector
                enabled={pageStylesEnabled}
                onStyleChange={(styles) => {
                  const normalized = normalizeManualEditStyles(styles, { layoutEnabled: true });
                  if (!normalized.ok) {
                    onError(normalized.error);
                    onInvalidStyle?.('__body__', Object.keys(styles) as Array<keyof ManualEditStyles>);
                    return;
                  }
                  onError('');
                  onStyleChange?.('__body__', normalized.styles, 'Page styles');
                }}
              />
            )
          ) : null}

          {targetForInspector?.kind === 'image' && onPickImage ? (
          <div className="cc-section">
            <header className="cc-section-head">IMAGE</header>
            <div className="cc-section-body">
              <button
                type="button"
                className="cc-action-btn"
                disabled={uploadingImage}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingImage ? t('manualEdit.uploadingImage') : t('manualEdit.uploadImage')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.currentTarget.files?.[0];
                  if (!file) return;
                  e.currentTarget.value = '';
                  setUploadingImage(true);
                  try {
                    const src = await onPickImage(file);
                    if (src) {
                      const activeTargetId = selectedTargetRef.current?.id ?? targetForInspector.id;
                      onApplyPatch(
                        { id: activeTargetId, kind: 'set-image', src, alt: draft.alt },
                        t('manualEdit.uploadImage'),
                      );
                    } else {
                      onError(t('manualEdit.uploadImageFailed'));
                    }
                  } finally {
                    setUploadingImage(false);
                  }
                }}
              />
            </div>
          </div>
        ) : null}

        {targetForInspector ? (
          <div className="cc-section">
            <div className="cc-section-body">
              {confirmDelete ? (
                <>
                  <p className="cc-delete-confirm">{canUndo ? t('manualEdit.deleteElementConfirm') : t('manualEdit.deleteElement')}</p>
                  <button
                    type="button"
                    className="cc-action-btn cc-action-danger"
                    onClick={() => {
                      setConfirmDelete(false);
                      onApplyPatch(
                        { id: targetForInspector.id, kind: 'remove-element' },
                        t('manualEdit.deleteElement'),
                      );
                    }}
                  >
                    {t('manualEdit.deleteElement')}
                  </button>
                  <button
                    type="button"
                    className="cc-action-btn"
                    onClick={() => setConfirmDelete(false)}
                  >
                    {t('common.cancel')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="cc-action-btn cc-action-danger"
                  onClick={() => setConfirmDelete(true)}
                >
                  {t('manualEdit.deleteElement')}
                </button>
              )}
            </div>
          </div>
        ) : null}

        {error ? <div className="manual-edit-error">{error}</div> : null}
        </section>
      </aside>
    </>
  );
}

type ManualEditTab = 'page' | 'content' | 'style' | 'attributes' | 'html' | 'source';

const ELEMENT_TABS: ReadonlyArray<{ id: ManualEditTab; label: string }> = [
  { id: 'content', label: 'Content' },
  { id: 'style', label: 'Style' },
  { id: 'attributes', label: 'Attributes' },
  { id: 'html', label: 'HTML' },
  { id: 'source', label: 'Source' },
];

const PAGE_TABS: ReadonlyArray<{ id: ManualEditTab; label: string }> = [
  { id: 'page', label: 'Page' },
  { id: 'source', label: 'Source' },
];

function ContentEditor({
  target,
  draft,
  busy,
  onDraftChange,
  onApply,
}: {
  target: ManualEditTarget;
  draft: ManualEditDraft;
  busy: boolean;
  onDraftChange: (draft: ManualEditDraft) => void;
  onApply: () => void;
}) {
  return (
    <div className="manual-edit-tab-body">
      {target.kind === 'image' ? (
        <>
          <label className="manual-edit-field">
            <span>Image source</span>
            <input value={draft.src} onChange={(event) => onDraftChange({ ...draft, src: event.currentTarget.value })} />
          </label>
          <label className="manual-edit-field">
            <span>Alt text</span>
            <input value={draft.alt} onChange={(event) => onDraftChange({ ...draft, alt: event.currentTarget.value })} />
          </label>
        </>
      ) : (
        <label className="manual-edit-field">
          <span>Text</span>
          <textarea value={draft.text} onChange={(event) => onDraftChange({ ...draft, text: event.currentTarget.value })} />
        </label>
      )}
      {target.kind === 'link' ? (
        <label className="manual-edit-field">
          <span>Href</span>
          <input value={draft.href} onChange={(event) => onDraftChange({ ...draft, href: event.currentTarget.value })} />
        </label>
      ) : null}
      <button type="button" className="btn btn-primary" disabled={busy} onClick={onApply}>Apply Content</button>
    </div>
  );
}

function SourceEditor({
  draft,
  busy,
  onDraftChange,
  onApply,
}: {
  draft: ManualEditDraft;
  busy: boolean;
  onDraftChange: (draft: ManualEditDraft) => void;
  onApply: () => void;
}) {
  return (
    <div className="manual-edit-tab-body">
      <label className="manual-edit-field">
        <span>Full artifact source</span>
        <textarea
          className="manual-edit-code tall"
          value={draft.fullSource}
          onChange={(event) => onDraftChange({ ...draft, fullSource: event.currentTarget.value })}
        />
      </label>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={onApply}>Apply Source</button>
    </div>
  );
}

function PageInspector({
  enabled,
  onStyleChange,
}: {
  enabled: boolean;
  onStyleChange: (styles: Partial<ManualEditStyles>) => void;
}) {
  const [bg, setBg] = useState('');
  const [font, setFont] = useState('');
  const [size, setSize] = useState('');
  const update = (next: { bg?: string; font?: string; size?: string }) => {
    if ('bg' in next) {
      const value = next.bg ?? '';
      setBg(value);
      onStyleChange({ backgroundColor: value });
    }
    if ('font' in next) {
      const value = next.font ?? '';
      setFont(value);
      onStyleChange({ fontFamily: value });
    }
    if ('size' in next) {
      const value = next.size ?? '';
      setSize(value);
      onStyleChange({ fontSize: value });
    }
  };

  return (
    <div className="cc-inspector">
      <Section title="PAGE">
        {enabled ? (
          <>
            <ColorRow label="Background" value={bg} onChange={(value) => update({ bg: value })} />
            <FontRow value={font} onChange={(value) => update({ font: value })} />
            <UnitRow label="Base size" value={size} onChange={(value) => update({ size: value })} unit="px" autoUnit />
          </>
        ) : (
          <p className="cc-section-hint">Page styles are available only for full HTML documents.</p>
        )}
      </Section>
    </div>
  );
}

const FONT_OPTS = [
  { label: 'inherit', value: '' },
  { label: 'Space Grotesk', value: '"Space Grotesk", Inter, system-ui, sans-serif' },
  { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
  { label: 'Times', value: '"Times New Roman", Times, serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Roboto', value: 'Roboto, Arial, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'monospace', value: 'SFMono-Regular, Consolas, "Liberation Mono", monospace' },
] as const;
const WEIGHT_OPTS = ['', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
const ALIGN_OPTS = ['', 'left', 'center', 'right', 'justify', 'start', 'end'];
const DIRECTION_OPTS = ['', 'row', 'column', 'row-reverse', 'column-reverse'];
const JUSTIFY_OPTS = ['', 'flex-start', 'center', 'flex-end', 'space-between', 'space-around'];
const ITEMS_OPTS = ['', 'stretch', 'flex-start', 'center', 'flex-end', 'baseline'];
const BORDER_STYLE_OPTS = ['', 'solid', 'dashed', 'dotted', 'double', 'none'];
const EDITOR_SWATCH_COLORS = [
  '#000000',
  '#ffffff',
  '#374151',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
] as const;

type NormalizeResult =
  | { ok: true; styles: Partial<ManualEditStyles> }
  | { ok: false; error: string };

const PX_STYLE_PROPS = new Set<keyof ManualEditStyles>([
  'fontSize', 'letterSpacing', 'width', 'height', 'minHeight', 'gap',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'border', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderRadius',
]);
const COLOR_STYLE_PROPS = new Set<keyof ManualEditStyles>(['color', 'backgroundColor', 'borderColor']);
const SELECT_STYLE_OPTIONS: Partial<Record<keyof ManualEditStyles, ReadonlyArray<string>>> = {
  fontFamily: FONT_OPTS.map((option) => option.value),
  fontWeight: WEIGHT_OPTS,
  textAlign: ALIGN_OPTS,
  flexDirection: DIRECTION_OPTS,
  justifyContent: JUSTIFY_OPTS,
  alignItems: ITEMS_OPTS,
  borderStyle: BORDER_STYLE_OPTS,
};
const LAYOUT_STYLE_PROPS = new Set<keyof ManualEditStyles>(['gap', 'flexDirection', 'justifyContent', 'alignItems']);

export function normalizeManualEditStyles(
  styles: Partial<ManualEditStyles>,
  { layoutEnabled }: { layoutEnabled: boolean },
): NormalizeResult {
  const normalized: Partial<ManualEditStyles> = {};
  for (const [rawKey, rawValue] of Object.entries(styles) as Array<[keyof ManualEditStyles, string]>) {
    if (LAYOUT_STYLE_PROPS.has(rawKey) && !layoutEnabled) continue;
    const value = rawValue.trim();
    if (value === '') {
      normalized[rawKey] = '';
      continue;
    }
    if (PX_STYLE_PROPS.has(rawKey)) {
      const px = normalizePxValue(value);
      if (!px) return { ok: false, error: `${styleLabel(rawKey)} must be a number or px value.` };
      normalized[rawKey] = px;
      continue;
    }
    if (COLOR_STYLE_PROPS.has(rawKey)) {
      const color = normalizeHexColor(value);
      if (!color) return { ok: false, error: `${styleLabel(rawKey)} must be a hex color.` };
      normalized[rawKey] = color;
      continue;
    }
    if (rawKey === 'opacity') {
      const n = Number(value);
      if (!Number.isFinite(n)) return { ok: false, error: 'Opacity must be a number.' };
      normalized.opacity = String(Math.max(0, Math.min(1, n)));
      continue;
    }
    if (rawKey === 'lineHeight') {
      const lineHeight = normalizeLineHeightValue(value);
      if (!lineHeight) return { ok: false, error: 'Line height must be a positive number or px value.' };
      normalized.lineHeight = lineHeight;
      continue;
    }
    const options = SELECT_STYLE_OPTIONS[rawKey];
    if (options) {
      if (!options.includes(value)) return { ok: false, error: `${styleLabel(rawKey)} has an unsupported value.` };
      normalized[rawKey] = value;
      continue;
    }
    normalized[rawKey] = value;
  }
  return { ok: true, styles: normalized };
}

function normalizePxValue(value: string): string | null {
  if (/^-?\d+(\.\d+)?$/.test(value)) return `${value}px`;
  if (/^-?\d+(\.\d+)?px$/i.test(value)) return value.toLowerCase();
  return null;
}

function normalizeLineHeightValue(value: string): string | null {
  if (/^\d+(\.\d+)?$/.test(value)) {
    const n = Number(value);
    return n > 0 ? String(n) : null;
  }
  if (/^\d+(\.\d+)?px$/i.test(value)) {
    const n = Number(value.slice(0, -2));
    return n > 0 ? value.toLowerCase() : null;
  }
  return null;
}

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const r = trimmed[1]!, g = trimmed[2]!, b = trimmed[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

function styleLabel(key: keyof ManualEditStyles): string {
  return key.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`);
}

function StyleInspector({
  styles, layoutEnabled, onClearSelection, onChange,
}: {
  styles: ManualEditStyles;
  layoutEnabled: boolean;
  onClearSelection: () => void;
  onChange: (key: keyof ManualEditStyles, value: string) => void;
}) {
  const u = (key: keyof ManualEditStyles, value: string) => onChange(key, value);

  return (
    <div className="cc-inspector">
      <div className="cc-inspector-nav">
        <button type="button" className="cc-inspector-page" onClick={onClearSelection} aria-label="Show page inspector">
          Page
        </button>
      </div>
      <Section title="TYPOGRAPHY">
        <FontRow value={styles.fontFamily} onChange={(v) => u('fontFamily', v)} />
        <PairRow>
          <UnitRow label="Size" value={styles.fontSize} onChange={(v) => u('fontSize', v)} unit="px" autoUnit />
          <DropdownRow label="Weight" value={styles.fontWeight} onChange={(v) => u('fontWeight', v)} options={WEIGHT_OPTS} />
        </PairRow>
        <PairRow>
          <ColorRow label="Color" value={styles.color} onChange={(v) => u('color', v)} />
          <DropdownRow label="Align" value={styles.textAlign} onChange={(v) => u('textAlign', v)} options={ALIGN_OPTS} />
        </PairRow>
        <PairRow>
          <UnitRow label="Line" value={styles.lineHeight} onChange={(v) => u('lineHeight', v)} unit="" />
          <UnitRow label="Tracking" value={styles.letterSpacing} onChange={(v) => u('letterSpacing', v)} unit="px" autoUnit />
        </PairRow>
      </Section>

      <Section title="SIZE">
        <PairRow>
          <UnitRow label="Width" value={styles.width} onChange={(v) => u('width', v)} unit="px" autoUnit />
          <UnitRow label="Height" value={styles.height} onChange={(v) => u('height', v)} unit="px" autoUnit />
        </PairRow>
      </Section>

      <Section title="LAYOUT" inactive={!layoutEnabled}>
        {!layoutEnabled ? (
          <p className="cc-section-hint">Select a container or group to edit layout.</p>
        ) : null}
        <PairRow>
          <UnitRow label="Gap" value={styles.gap} onChange={(v) => u('gap', v)} unit="px" autoUnit disabled={!layoutEnabled} />
          <DropdownRow label="Direction" value={styles.flexDirection} onChange={(v) => u('flexDirection', v)} options={DIRECTION_OPTS} disabled={!layoutEnabled} />
        </PairRow>
        <PairRow>
          <DropdownRow label="Justify" value={styles.justifyContent} onChange={(v) => u('justifyContent', v)} options={JUSTIFY_OPTS} disabled={!layoutEnabled} />
          <DropdownRow label="Align" value={styles.alignItems} onChange={(v) => u('alignItems', v)} options={ITEMS_OPTS} disabled={!layoutEnabled} />
        </PairRow>
      </Section>

      <Section title="BOX">
        <PairRow>
          <ColorRow label="Fill" value={styles.backgroundColor} onChange={(v) => u('backgroundColor', v)} />
          <UnitRow label="Opacity" value={styles.opacity} onChange={(v) => u('opacity', v)} unit="" />
        </PairRow>

        <QuadRow label="Padding" values={{
          t: styles.paddingTop, r: styles.paddingRight, b: styles.paddingBottom, l: styles.paddingLeft,
        }} onChange={(side, value) => u(sideToProp('padding', side), value)} />

        <QuadRow label="Margin" values={{
          t: styles.marginTop, r: styles.marginRight, b: styles.marginBottom, l: styles.marginLeft,
        }} onChange={(side, value) => u(sideToProp('margin', side), value)} />

        <QuadRow label="Border" values={{
          t: styles.borderTopWidth, r: styles.borderRightWidth, b: styles.borderBottomWidth, l: styles.borderLeftWidth,
        }} onChange={(side, value) => u(`border${sideUpper(side)}Width` as keyof ManualEditStyles, value)} />

        <PairRow>
          <DropdownRow label="Style" value={styles.borderStyle} onChange={(v) => u('borderStyle', v)} options={BORDER_STYLE_OPTS} />
          <ColorRow label="Border" value={styles.borderColor} onChange={(v) => u('borderColor', v)} compact />
        </PairRow>
        <UnitRow label="Radius" value={styles.borderRadius} onChange={(v) => u('borderRadius', v)} unit="px" autoUnit />
      </Section>
    </div>
  );
}

function Section({ title, children, inactive }: { title: string; children: React.ReactNode; inactive?: boolean }) {
  return (
    <section className={`cc-section${inactive ? ' cc-section-inactive' : ''}`}>
      <header className="cc-section-head">{title}</header>
      <div className="cc-section-body">{children}</div>
    </section>
  );
}

function PairRow({ children }: { children: React.ReactNode }) {
  return <div className="cc-pair">{children}</div>;
}

function UnitRow({ label, value, onChange, unit, autoUnit, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  unit: string; autoUnit?: boolean; disabled?: boolean;
}) {
  const display = unit === 'px' ? stripPxUnit(value) : value;
  const step = unit === 'px' ? 1 : 0.1;
  const canStep = !disabled && isNumericInput(display);
  const valueFromDisplay = (raw: string) => {
    const trimmed = raw.trim();
    if (autoUnit && trimmed && isNumericInput(trimmed)) return `${trimmed}px`;
    if (autoUnit && /^-?\d+(\.\d+)?px$/i.test(trimmed)) return trimmed.toLowerCase();
    return raw;
  };
  const handle = (raw: string) => {
    const next = valueFromDisplay(raw);
    if (next !== value) onChange(next);
  };
  const stepBy = (direction: -1 | 1) => {
    if (!canStep) return;
    const next = formatSteppedNumber(Number(display) + direction * step, display, step);
    onChange(valueFromDisplay(next));
  };
  return (
    <label className="cc-row">
      <span className="cc-label">{label}</span>
      <span className="cc-value">
        <button type="button" className="cc-step" disabled={!canStep} aria-label={`${label} decrease`} onClick={() => stepBy(-1)}>−</button>
        <input value={display} placeholder="" disabled={disabled} onChange={(e) => onChange(valueFromDisplay(e.currentTarget.value))} onBlur={(e) => handle(e.currentTarget.value)} />
        <button type="button" className="cc-step" disabled={!canStep} aria-label={`${label} increase`} onClick={() => stepBy(1)}>+</button>
        {unit ? <em className="cc-unit">{unit}</em> : null}
      </span>
    </label>
  );
}

function DropdownRow({ label, value, onChange, options, placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  options: ReadonlyArray<string>; placeholder?: string; disabled?: boolean;
}) {
  return (
    <label className="cc-row">
      <span className="cc-label">{label}</span>
      <span className="cc-value cc-select">
        <select value={value} disabled={disabled} onChange={(e) => onChange(e.currentTarget.value)}>
          {!options.includes(value) && value ? <option value={value}>{value}</option> : null}
          {options.map((opt) => <option key={opt || '__'} value={opt}>{opt || (placeholder ?? '–')}</option>)}
        </select>
        <em className="cc-chevron">▾</em>
      </span>
    </label>
  );
}

function FontRow({ value, onChange }: {
  value: string;
  onChange: (v: string) => void;
}) {
  const normalizedValue = normalizeFontFamilyForSelect(value);
  const customValue = normalizedValue === value ? value : '';
  return (
    <label className="cc-row">
      <span className="cc-label">Font</span>
      <span className="cc-value cc-select">
        <select value={normalizedValue} onChange={(event) => onChange(event.currentTarget.value)}>
          {customValue && !FONT_OPTS.some((option) => option.value === customValue) ? (
            <option value={customValue}>{fontFamilyLabel(customValue)}</option>
          ) : null}
          {FONT_OPTS.map((option) => (
            <option key={option.label} value={option.value}>{option.label}</option>
          ))}
        </select>
        <em className="cc-chevron">▾</em>
      </span>
    </label>
  );
}

function normalizeFontFamilyForSelect(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const direct = FONT_OPTS.find((option) => option.value === trimmed);
  if (direct) return direct.value;
  const families = parseFontFamilies(trimmed);
  const primaryFamily = families[0];
  const match = FONT_OPTS.find((option) => {
    if (!option.value) return false;
    const optionFamilies = parseFontFamilies(option.value);
    return optionFamilies[0] === primaryFamily;
  });
  return match?.value ?? trimmed;
}

function fontFamilyLabel(value: string): string {
  return parseFontFamilies(value)[0] ?? value;
}

function parseFontFamilies(value: string): string[] {
  return value
    .split(',')
    .map((family) => family.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
    .filter(Boolean);
}

function ColorRow({ label, value, onChange, compact }: {
  label: string; value: string; onChange: (v: string) => void; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);
  return (
    <label className="cc-row">
      {compact ? null : <span className="cc-label">{label}</span>}
      <span className={`cc-value cc-color ${compact ? 'cc-color-compact' : ''}`} ref={ref}>
        <button type="button" className="cc-swatch" style={{ background: value || 'transparent' }}
          onClick={() => setOpen((v) => !v)} aria-label={`Pick ${label}`} />
        <input value={value} placeholder="#000000"
          onChange={(e) => onChange(e.currentTarget.value)} onFocus={() => setOpen(true)} />
        {open ? (
          <div className="cc-color-popover">
            <div className="cc-color-grid">
              {EDITOR_SWATCH_COLORS.map((hex) => (
                <button key={hex} type="button" className="cc-color-tile" style={{ background: hex }}
                  onClick={() => { onChange(hex); setOpen(false); }} aria-label={hex} />
              ))}
            </div>
            <input type="color" className="cc-color-native" value={normalizeColorForPicker(value)}
              onChange={(e) => onChange(e.currentTarget.value)} />
          </div>
        ) : null}
      </span>
    </label>
  );
}

function QuadRow({ label, values, onChange }: {
  label: string; values: { t: string; r: string; b: string; l: string };
  onChange: (side: 't' | 'r' | 'b' | 'l', value: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const allEqualValue = (() => {
    const v = values.t;
    return v === values.r && v === values.b && v === values.l ? v : null;
  })();
  return (
    <div className="cc-quad">
      <button type="button" className="cc-quad-head" onClick={() => setOpen((v) => !v)}>
        <span>{label}</span>
        {!open && allEqualValue !== null ? <em>{allEqualValue || '0 px'}</em> : <span className="cc-chevron-small">{open ? '▾' : '▸'}</span>}
      </button>
      {open ? (
        <div className="cc-quad-grid">
          <QuadCell axis="T" value={values.t} onChange={(v) => onChange('t', v)} />
          <QuadCell axis="R" value={values.r} onChange={(v) => onChange('r', v)} />
          <QuadCell axis="B" value={values.b} onChange={(v) => onChange('b', v)} />
          <QuadCell axis="L" value={values.l} onChange={(v) => onChange('l', v)} />
        </div>
      ) : null}
    </div>
  );
}

function QuadCell({ axis, value, onChange }: { axis: string; value: string; onChange: (v: string) => void }) {
  const display = stripPxUnit(value);
  const canStep = isNumericInput(display);
  const stepBy = (direction: -1 | 1) => {
    if (!canStep) return;
    onChange(`${formatSteppedNumber(Number(display) + direction, display, 1)}px`);
  };
  return (
    <span className="cc-quad-cell">
      <em className="cc-quad-axis">{axis}</em>
      <button type="button" className="cc-step cc-step-quad" disabled={!canStep} aria-label={`${axis} decrease`} onClick={() => stepBy(-1)}>−</button>
      <input value={display} placeholder="0"
        onChange={(e) => {
          const raw = e.currentTarget.value.trim();
          if (raw === '') onChange('');
          else if (isNumericInput(raw)) onChange(`${raw}px`);
          else if (/^-?\d+(\.\d+)?px$/i.test(raw)) onChange(raw.toLowerCase());
          else onChange(e.currentTarget.value);
        }}
        onBlur={(e) => {
          const v = e.currentTarget.value.trim();
          const next = v && isNumericInput(v) ? `${v}px` : e.currentTarget.value;
          if (next !== value) onChange(next);
        }} />
      <button type="button" className="cc-step cc-step-quad" disabled={!canStep} aria-label={`${axis} increase`} onClick={() => stepBy(1)}>+</button>
      <em className="cc-quad-unit">px</em>
    </span>
  );
}

function stripPxUnit(value: string): string {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/i);
  return match?.[1] ?? value;
}

function isNumericInput(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

function formatSteppedNumber(value: number, current: string, step: number): string {
  const decimals = Math.max(decimalPlaces(current), decimalPlaces(String(step)));
  return decimals > 0
    ? value.toFixed(decimals).replace(/\.?0+$/, '')
    : String(Math.round(value));
}

function decimalPlaces(value: string): number {
  const match = value.match(/\.(\d+)/);
  return match?.[1]?.length ?? 0;
}

function sideToProp(base: 'padding' | 'margin', side: 't' | 'r' | 'b' | 'l'): keyof ManualEditStyles {
  return `${base}${sideUpper(side)}` as keyof ManualEditStyles;
}
function sideUpper(side: 't' | 'r' | 'b' | 'l'): 'Top' | 'Right' | 'Bottom' | 'Left' {
  return side === 't' ? 'Top' : side === 'r' ? 'Right' : side === 'b' ? 'Bottom' : 'Left';
}

function normalizeColorForPicker(value: string): string {
  const trimmed = value.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
    if (trimmed.length === 4) {
      const r = trimmed[1]!, g = trimmed[2]!, b = trimmed[3]!;
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return trimmed.toLowerCase();
  }
  const match = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (match) {
    const toHex = (n: string) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0');
    return `#${toHex(match[1]!)}${toHex(match[2]!)}${toHex(match[3]!)}`;
  }
  return '#000000';
}

export function manualEditPatchSummary(patch: ManualEditPatch): string {
  if (patch.kind === 'set-full-source') return JSON.stringify({ kind: patch.kind, bytes: patch.source.length });
  if (patch.kind === 'set-outer-html') return JSON.stringify({ id: patch.id, kind: patch.kind, bytes: patch.html.length });
  return JSON.stringify(patch);
}
