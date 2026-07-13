// Dumb panel for the "Add manually" source tab: the summary + New button, the
// transient flash pill, and the create/edit form (starters, name/type/desc/body,
// save/cancel). The draft, its validity, and the save transport live in the
// orchestrator's entries hook; this renders the draft and reports edits.
import { useMemo, type MutableRefObject } from 'react';
import type { MemoryType } from '@open-design/contracts';
import { Button } from '@open-design/components';
import { Icon } from '../../../components/Icon';
import { useT } from '../../../i18n';
import { STARTERS, TYPES, FIELD_LABEL_STYLE } from '../constants';
import { memoryTypeLabels, memoryFlashLabels } from '../formatters';
import type { DraftEntry, FlashKind } from '../types';

export function MemoryManualEditor({
  editing,
  onEditingChange,
  onStartNew,
  onCancel,
  onSave,
  busy,
  editorRef,
  editorNameRef,
  flash,
}: {
  editing: DraftEntry | null;
  onEditingChange: (draft: DraftEntry) => void;
  onStartNew: () => void;
  onCancel: () => void;
  onSave: () => void;
  busy: boolean;
  editorRef: MutableRefObject<HTMLDivElement | null>;
  editorNameRef: MutableRefObject<HTMLInputElement | null>;
  flash: { kind: FlashKind; key: number } | null;
}) {
  const t = useT();
  const typeLabel = useMemo(() => memoryTypeLabels(t), [t]);
  const flashLabel = useMemo(() => memoryFlashLabels(t), [t]);
  return (
    <div className="memory-tab-panel memory-manual-panel">
      <div className="memory-source-summary">
        <span className="memory-block-icon">
          <Icon name="edit" size={15} />
        </span>
        <div>
          <h4>Add manually</h4>
          <p className="hint">
            Add facts, preferences, or project context yourself. Fixed assistant
            behavior lives in Instructions / Rules.
          </p>
        </div>
        <button
          type="button"
          className="primary memory-source-action"
          onClick={onStartNew}
          disabled={editing !== null}
        >
          <Icon name="plus" size={14} />
          <span>{t('settings.memoryNew')}</span>
        </button>
      </div>

      {flash && flash.kind !== 'pathCopied' ? (
        <div
          key={flash.key}
          role="status"
          aria-live="polite"
          className="memory-flash-pill"
        >
          {flashLabel[flash.kind]}
        </div>
      ) : null}

      {editing ? (
        <div
          ref={editorRef}
          className="library-card"
          style={{
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: 14,
            padding: 14,
            background: 'var(--surface-subtle, rgba(0,0,0,0.02))',
            border: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
            borderRadius: 10,
          }}
        >
          {!editing.id ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 6,
                paddingBottom: 10,
                borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
              }}
            >
              <span
                style={{
                  ...FIELD_LABEL_STYLE,
                  display: 'inline-block',
                  marginRight: 4,
                  marginBottom: 0,
                }}
              >
                {t('settings.memoryStartersLabel')}
              </span>
              {STARTERS.map((starter) => (
                <button
                  key={starter.nameKey}
                  type="button"
                  className="filter-pill"
                  onClick={() =>
                    onEditingChange({
                      id: editing.id,
                      type: starter.type,
                      name: t(starter.nameKey),
                      description: t(starter.descKey),
                      body: t(starter.bodyKey),
                    })
                  }
                  title={t(starter.descKey)}
                  style={{ display: 'inline-flex', alignItems: 'center' }}
                >
                  {t(starter.nameKey)}
                </button>
              ))}
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={FIELD_LABEL_STYLE}>
                  {t('settings.memoryNameLabel')}
                </label>
                <input
                  ref={editorNameRef}
                  type="text"
                  placeholder={t('settings.memoryName')}
                  value={editing.name}
                  onChange={(e) =>
                    onEditingChange({ ...editing, name: e.target.value })
                  }
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ flex: '0 0 auto', minWidth: 120 }}>
                <label style={FIELD_LABEL_STYLE}>
                  {t('settings.memoryTypeLabel')}
                </label>
                <select
                  value={editing.type}
                  onChange={(e) =>
                    onEditingChange({
                      ...editing,
                      type: e.target.value as MemoryType,
                    })
                  }
                  style={{ width: '100%' }}
                >
                  {TYPES.map((tt) => (
                    <option key={tt} value={tt}>
                      {typeLabel[tt]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label style={FIELD_LABEL_STYLE}>
                {t('settings.memoryDescLabel')}
              </label>
              <input
                type="text"
                placeholder={t('settings.memoryDesc')}
                value={editing.description}
                onChange={(e) =>
                  onEditingChange({ ...editing, description: e.target.value })
                }
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={FIELD_LABEL_STYLE}>
                {t('settings.memoryBodyLabel')}
              </label>
              <textarea
                placeholder={t('settings.memoryBody')}
                value={editing.body}
                onChange={(e) =>
                  onEditingChange({ ...editing, body: e.target.value })
                }
                rows={7}
                style={{
                  width: '100%',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              />
              <p className="hint" style={{ fontSize: 11, marginTop: 4 }}>
                {t('settings.memoryBodyHint')}
              </p>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
            }}
          >
            <span
              className="hint"
              style={{
                fontSize: 11,
                margin: 0,
                color: 'var(--text-muted, #888)',
              }}
            >
              {t('settings.memorySaveHint')}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" onClick={onCancel}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={onSave}
                disabled={busy || !editing.name.trim()}
              >
                {editing.id ? t('common.save') : t('common.create')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
