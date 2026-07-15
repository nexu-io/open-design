// Dumb "Advanced" modal: the raw MEMORY.md index editor plus the technical
// memory-tree view. Rendered into `modalHost` via a portal (the orchestrator
// resolves `document.body` and passes it, so this file stays DOM-free). All
// state + transport live in the entries hook; this is props-in / JSX-out.
import { createPortal } from 'react-dom';
import type { MemoryTreeNode } from '@open-design/contracts';
import { Icon } from '../../../components/Icon';
import { useT } from '../../../i18n';

export function MemoryAdvancedModal({
  open,
  modalHost,
  onClose,
  index,
  indexDraft,
  onIndexDraftChange,
  onSaveIndex,
  busy,
  memoryTree,
  treeFolders,
  treeChildren,
  onStartEdit,
}: {
  open: boolean;
  modalHost: HTMLElement | null;
  onClose: () => void;
  index: string;
  indexDraft: string | null;
  onIndexDraftChange: (value: string | null) => void;
  onSaveIndex: () => void;
  busy: boolean;
  memoryTree: MemoryTreeNode[];
  treeFolders: MemoryTreeNode[];
  treeChildren: Map<string, MemoryTreeNode[]>;
  onStartEdit: (id: string) => void;
}) {
  const t = useT();
  if (!open || !modalHost) return null;
  return createPortal(
    <div
      className="memory-action-modal-backdrop"
      role="presentation"
      // The dialog below stops propagation, so any mouse-down that reaches the
      // backdrop must have originated on the backdrop itself.
      onMouseDown={onClose}
    >
      <div
        className="memory-action-modal memory-action-modal--advanced"
        role="dialog"
        aria-modal="true"
        aria-labelledby="memory-advanced-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="memory-action-modal-head">
          <div>
            <h3 id="memory-advanced-modal-title">Advanced</h3>
            <p>Inspect or edit the underlying memory index.</p>
          </div>
          <button
            type="button"
            className="memory-action-modal-close"
            onClick={onClose}
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="memory-action-modal-body memory-advanced-modal-body">
        <p className="memory-advanced-hint">
          Inspect or edit the underlying memory index.
        </p>
        <div className="memory-advanced-stack">
          <details className="library-group memory-advanced-card">
            <summary className="memory-details-summary">
              <span className="memory-details-title">
                {t('settings.memoryIndex')}
              </span>
            </summary>
            <textarea
              value={indexDraft ?? index}
              onChange={(e) => onIndexDraftChange(e.target.value)}
              rows={8}
              style={{
                width: '100%',
                marginTop: 8,
                fontFamily: 'monospace',
              }}
            />
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 6,
                flexWrap: 'wrap',
              }}
            >
              <span
                className="hint"
                style={{
                  fontSize: 11,
                  margin: 0,
                  color:
                    indexDraft !== null
                      ? 'var(--text-warning, #b06a00)'
                      : 'var(--text-muted, #888)',
                  fontWeight: indexDraft !== null ? 600 : 400,
                }}
              >
                {indexDraft !== null
                  ? `● ${t('settings.memoryIndexUnsaved')} — ${t('settings.memoryIndexSaveHint')}`
                  : t('settings.memoryIndexSaveHint')}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => onIndexDraftChange(null)}
                  disabled={indexDraft === null}
                >
                  {t('settings.memoryIndexReset')}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={onSaveIndex}
                  disabled={busy || indexDraft === null}
                >
                  {t('settings.memoryIndexSave')}
                </button>
              </div>
            </div>
          </details>
          {treeFolders.length > 0 ? (
            <details className="library-group memory-advanced-card">
              <summary className="memory-details-summary">
                <span className="memory-details-title">Memory tree</span>
                <span className="filter-pill-count">{memoryTree.length}</span>
              </summary>
              <p className="memory-advanced-hint">
                Technical view of the same saved memories. Most users only
                need the saved-memory list above.
              </p>
              <div className="memory-tree-advanced">
                {treeFolders.map((folder) => {
                  const children = treeChildren.get(folder.id) ?? [];
                  return (
                    <div
                      key={folder.id}
                      className="library-card"
                      style={{ alignItems: 'stretch' }}
                    >
                      <div className="library-card-info" style={{ width: '100%' }}>
                        <div className="library-card-title-row">
                          <span className="library-card-name">{folder.name}</span>
                          <span className="library-card-badge">{folder.path}</span>
                        </div>
                        <div className="library-card-desc">
                          {children.length} {children.length === 1 ? 'node' : 'nodes'}
                        </div>
                        {children.length > 0 ? (
                          <ul
                            style={{
                              display: 'grid',
                              gap: 6,
                              margin: '8px 0 0',
                              padding: 0,
                              listStyle: 'none',
                            }}
                          >
                            {children.map((child) => (
                              <li
                                key={child.id}
                                className="memory-tree-child-row"
                              >
                                <span style={{ minWidth: 0 }}>
                                  <span className="library-card-name">{child.name}</span>{' '}
                                  <span className="library-card-badge">{child.id}</span>
                                  {child.description ? (
                                    <span
                                      className="library-card-desc"
                                      style={{ display: 'block' }}
                                    >
                                      {child.description}
                                    </span>
                                  ) : null}
                                </span>
                                <div className="memory-card-actions">
                                  <button
                                    type="button"
                                    className="ghost library-card-action"
                                    onClick={() => onStartEdit(child.id)}
                                    title={t('settings.memoryEdit')}
                                  >
                                    <Icon name="edit" size={14} />
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}
        </div>
        </div>
      </div>
    </div>,
    modalHost,
  );
}
