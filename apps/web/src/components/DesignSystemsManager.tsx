import { useCallback, useRef, useState } from 'react';
import { useT } from '../i18n';
import type { DesignSystemSummary } from '../types';
import {
  createDesignSystem,
  deleteDesignSystemApi,
  fetchDesignSystem,
  updateDesignSystem,
} from '../providers/registry';
import { Icon } from './Icon';

interface Props {
  systems: DesignSystemSummary[];
  onRefresh: () => void;
}

type View =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; id: string; title: string; content: string };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function DesignSystemsManager({ systems, onRefresh }: Props) {
  const t = useT();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openEdit(id: string, title: string) {
    setBusy(true);
    setError(null);
    try {
      const ds = await fetchDesignSystem(id);
      if (!ds) { setError('Failed to load design system'); return; }
      setView({ kind: 'edit', id, title, content: ds.body });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await deleteDesignSystemApi(id);
      if (result.error) { setError(result.error); return; }
      setDeleteConfirm(null);
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  if (view.kind === 'create') {
    return (
      <CreateForm
        onSave={async (id, content) => {
          const result = await createDesignSystem(id, content);
          if (result.error) return result.error;
          onRefresh();
          setView({ kind: 'list' });
          return null;
        }}
        onCancel={() => setView({ kind: 'list' })}
      />
    );
  }

  if (view.kind === 'edit') {
    return (
      <EditForm
        id={view.id}
        title={view.title}
        initialContent={view.content}
        onSave={async (content) => {
          const result = await updateDesignSystem(view.id, content);
          if (result.error) return result.error;
          onRefresh();
          setView({ kind: 'list' });
          return null;
        }}
        onCancel={() => setView({ kind: 'list' })}
      />
    );
  }

  return (
    <div className="ds-manager">
      <div className="ds-manager-header">
        <h3 className="ds-manager-title">Design Systems</h3>
        <button
          type="button"
          className="primary ds-manager-add"
          onClick={() => { setError(null); setView({ kind: 'create' }); }}
          disabled={busy}
        >
          <Icon name="plus" size={13} />
          <span>New</span>
        </button>
      </div>

      {error ? <p className="ds-manager-error">{error}</p> : null}

      {systems.length === 0 ? (
        <p className="ds-manager-empty">No design systems yet. Create one to get started.</p>
      ) : (
        <ul className="ds-manager-list">
          {systems.map((ds) => (
            <li key={ds.id} className="ds-manager-item">
              <div className="ds-manager-item-info">
                <span className="ds-manager-item-title">{ds.title}</span>
                {ds.summary ? (
                  <span className="ds-manager-item-summary">{ds.summary.slice(0, 120)}</span>
                ) : null}
              </div>
              <div className="ds-manager-item-actions">
                <button
                  type="button"
                  className="ghost ds-manager-btn"
                  onClick={() => openEdit(ds.id, ds.title)}
                  disabled={busy}
                  title="Edit DESIGN.md"
                >
                  <Icon name="edit" size={14} />
                  <span>Edit</span>
                </button>
                {deleteConfirm === ds.id ? (
                  <>
                    <button
                      type="button"
                      className="ds-manager-btn ds-manager-btn-danger"
                      onClick={() => handleDelete(ds.id)}
                      disabled={busy}
                    >
                      Confirm delete
                    </button>
                    <button
                      type="button"
                      className="ghost ds-manager-btn"
                      onClick={() => setDeleteConfirm(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="ghost ds-manager-btn ds-manager-btn-del"
                    onClick={() => setDeleteConfirm(ds.id)}
                    disabled={busy}
                    title="Delete"
                  >
                    <Icon name="minus" size={14} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateForm({
  onSave,
  onCancel,
}: {
  onSave: (id: string, content: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [idTouched, setIdTouched] = useState(false);
  const [content, setContent] = useState('# New Design System\n\n');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const derivedId = idTouched ? id : slugify(name);

  function handleNameChange(v: string) {
    setName(v);
    if (!idTouched) setId(slugify(v));
  }

  function handleIdChange(v: string) {
    setIdTouched(true);
    setId(v);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    setContent(text);
    if (!name) {
      const h1 = /^#\s+(.+)$/m.exec(text);
      if (h1?.[1]) handleNameChange(h1[1].trim());
    }
  }

  async function handleSave() {
    setError(null);
    if (!derivedId) { setError('ID is required'); return; }
    if (!content.trim()) { setError('Content is required'); return; }
    setSaving(true);
    try {
      const err = await onSave(derivedId, content);
      if (err) setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ds-form">
      <div className="ds-form-header">
        <button type="button" className="ghost ds-form-back" onClick={onCancel}>
          <Icon name="chevron-left" size={14} />
          <span>Back</span>
        </button>
        <h3 className="ds-form-title">New Design System</h3>
      </div>

      {error ? <p className="ds-manager-error">{error}</p> : null}

      <label className="ds-form-label">
        Name
        <input
          className="ds-form-input"
          placeholder="My Company Design"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
        />
      </label>

      <label className="ds-form-label">
        ID <span className="ds-form-hint">(used as folder name, lowercase)</span>
        <input
          className="ds-form-input"
          placeholder="my-company"
          value={derivedId}
          onChange={(e) => handleIdChange(e.target.value)}
        />
      </label>

      <div className="ds-form-label">
        <span>
          DESIGN.md content
          <button
            type="button"
            className="ghost ds-form-upload-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="upload" size={13} />
            Upload .md file
          </button>
        </span>
        <input ref={fileInputRef} type="file" accept=".md,text/markdown,text/plain" hidden onChange={handleFile} />
        <textarea
          className="ds-form-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="ds-form-actions">
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="primary" onClick={handleSave} disabled={saving || !derivedId}>
          {saving ? 'Saving…' : 'Create'}
        </button>
      </div>
    </div>
  );
}

function EditForm({
  id,
  title,
  initialContent,
  onSave,
  onCancel,
}: {
  id: string;
  title: string;
  initialContent: string;
  onSave: (content: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    setContent(text);
    setSaved(false);
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const err = await onSave(content);
      if (err) { setError(err); return; }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ds-form">
      <div className="ds-form-header">
        <button type="button" className="ghost ds-form-back" onClick={onCancel}>
          <Icon name="chevron-left" size={14} />
          <span>Back</span>
        </button>
        <h3 className="ds-form-title">Edit — {title}</h3>
        <span className="ds-form-id">{id}/DESIGN.md</span>
      </div>

      {error ? <p className="ds-manager-error">{error}</p> : null}

      <div className="ds-form-label ds-form-label-grow">
        <span>
          DESIGN.md
          <button
            type="button"
            className="ghost ds-form-upload-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="upload" size={13} />
            Replace with file
          </button>
        </span>
        <input ref={fileInputRef} type="file" accept=".md,text/markdown,text/plain" hidden onChange={handleFile} />
        <textarea
          className="ds-form-textarea ds-form-textarea-grow"
          value={content}
          onChange={(e) => { setContent(e.target.value); setSaved(false); }}
          spellCheck={false}
        />
      </div>

      <div className="ds-form-actions">
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        {saved ? <span className="ds-form-saved">Saved ✓</span> : null}
        <button type="button" className="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
