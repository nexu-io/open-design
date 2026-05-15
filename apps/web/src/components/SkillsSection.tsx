import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useT } from '../i18n';
import { Icon } from './Icon';
import type { AppConfig } from '../types';
import type { SkillSummary } from '@open-design/contracts';
import {
  deleteSkill,
  fetchSkill,
  fetchSkillFiles,
  fetchSkills,
  importSkill,
  updateSkill,
  type SkillFileEntry,
} from '../providers/registry';

// Functional skills only — design templates render in EntryView's
// Templates tab and are managed under their own daemon registry. See
// specs/current/skills-and-design-templates.md.
//
// Layout mirrors the External MCP servers panel: a single vertical
// stack of collapsible rows. Each row is a skill — the header is
// always visible (enable toggle, name, mode badge, source badge,
// actions); the body (SKILL.md preview, file tree, inline edit form)
// is revealed only when the row is expanded. Replaces the previous
// left-list / right-detail two-column workspace, which felt cramped
// inside the settings dialog content column and left a wasteful empty
// detail panel whenever no skill was selected.

interface Props {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}

type SourceFilter = 'all' | 'user' | 'built-in';

interface DraftState {
  name: string;
  description: string;
  triggers: string;
  body: string;
}

const EMPTY_DRAFT: DraftState = {
  name: '',
  description: '',
  triggers: '',
  body: '',
};

function summaryToDraft(skill: SkillSummary, body: string): DraftState {
  return {
    name: skill.name,
    description: skill.description,
    triggers: Array.isArray(skill.triggers) ? skill.triggers.join(', ') : '',
    body,
  };
}

function parseTriggers(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function SkillsSection({ cfg, setCfg }: Props) {
  const t = useT();

  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [modeFilter, setModeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Body for the currently-expanded skill — fetched lazily so the
  // initial list payload stays small. `undefined` means 'not yet
  // fetched'; `''` means 'fetched but empty'.
  const [bodyById, setBodyById] = useState<Record<string, string>>({});
  const [bodyLoadingId, setBodyLoadingId] = useState<string | null>(null);

  // File tree, cached the same way as bodies so re-expanding the same
  // row is instant after the first fetch.
  const [filesById, setFilesById] = useState<Record<string, SkillFileEntry[]>>({});
  const [filesLoadingId, setFilesLoadingId] = useState<string | null>(null);

  // One row expanded at a time — keeps the section scannable. `null`
  // means every row is collapsed.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Editing happens inline inside an expanded row. Holds the id of the
  // skill currently being edited, or `null` when no edit is in flight.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Top-of-list create form. Toggled by the header 'New skill' button.
  const [creating, setCreating] = useState(false);

  // Editing draft + status. The draft is held in local state so the
  // user can collapse a row and come back without losing progress
  // (we drop it only on Save / Cancel).
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);

  // Inline delete confirmation — replaces the old window.confirm() call.
  // Only one skill can be in the 'confirm pending' state at a time; the
  // user clicks once to arm, twice to commit.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await fetchSkills();
    setSkills(list);
    return list;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const disabledSkills = useMemo(
    () => new Set(cfg.disabledSkills ?? []),
    [cfg.disabledSkills],
  );

  const modeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of skills) {
      counts.set(s.mode, (counts.get(s.mode) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [skills]);

  // Categories are optional per-skill metadata (`od.category` in the
  // SKILL.md frontmatter). The pill row only renders when at least one
  // skill in the listing carries one, so a project that ships only the
  // baseline functional skills doesn't see an empty filter row.
  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of skills) {
      const cat = s.category;
      if (typeof cat !== 'string' || !cat) continue;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [skills]);

  const filteredSkills = useMemo(() => {
    const q = search.toLowerCase().trim();
    return skills.filter((s) => {
      if (modeFilter !== 'all' && s.mode !== modeFilter) return false;
      if (sourceFilter !== 'all' && s.source !== sourceFilter) return false;
      if (categoryFilter !== 'all' && s.category !== categoryFilter)
        return false;
      if (!q) return true;
      const hay = `${s.name}\n${s.description}\n${(s.triggers ?? []).join(
        ' ',
      )}\n${s.category ?? ''}`;
      return hay.toLowerCase().includes(q);
    });
  }, [skills, modeFilter, sourceFilter, categoryFilter, search]);

  const ensureBody = useCallback(
    async (id: string) => {
      if (bodyById[id] !== undefined) return bodyById[id];
      setBodyLoadingId(id);
      try {
        const detail = await fetchSkill(id);
        const body = detail?.body ?? '';
        setBodyById((cur) => ({ ...cur, [id]: body }));
        return body;
      } finally {
        setBodyLoadingId((cur) => (cur === id ? null : cur));
      }
    },
    [bodyById],
  );

  const ensureFiles = useCallback(
    async (id: string) => {
      if (filesById[id]) return filesById[id]!;
      setFilesLoadingId(id);
      try {
        const files = await fetchSkillFiles(id);
        setFilesById((cur) => ({ ...cur, [id]: files }));
        return files;
      } finally {
        setFilesLoadingId((cur) => (cur === id ? null : cur));
      }
    },
    [filesById],
  );

  const toggleExpanded = useCallback(
    (id: string) => {
      setExpandedId((cur) => {
        if (cur === id) return null;
        void ensureBody(id);
        void ensureFiles(id);
        return id;
      });
      // Switching rows aborts any in-flight edit on the previous row.
      setEditingId((cur) => (cur === id ? cur : null));
      setConfirmDeleteId(null);
    },
    [ensureBody, ensureFiles],
  );

  const startCreate = useCallback(() => {
    setCreating(true);
    setDraft(EMPTY_DRAFT);
    setDraftError(null);
    setEditingId(null);
    setConfirmDeleteId(null);
  }, []);

  const startEdit = useCallback(
    async (skill: SkillSummary) => {
      const body = await ensureBody(skill.id);
      setDraft(summaryToDraft(skill, body ?? ''));
      setDraftError(null);
      setEditingId(skill.id);
      setExpandedId(skill.id);
      setCreating(false);
      setConfirmDeleteId(null);
    },
    [ensureBody],
  );

  const cancelDraft = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setDraftError(null);
    setEditingId(null);
    setCreating(false);
  }, []);

  const submitDraft = useCallback(async () => {
    if (draftSaving) return;
    const name = draft.name.trim();
    const body = draft.body.trim();
    if (!name) {
      setDraftError('Skill name is required.');
      return;
    }
    if (!body) {
      setDraftError('Skill body is required.');
      return;
    }
    const triggers = parseTriggers(draft.triggers);
    const payload = {
      name,
      description: draft.description.trim() || undefined,
      body,
      triggers,
    };
    setDraftSaving(true);
    setDraftError(null);
    const result =
      editingId
        ? await updateSkill(editingId, payload)
        : await importSkill(payload);
    setDraftSaving(false);
    if ('error' in result) {
      setDraftError(result.error.message);
      return;
    }
    const updated = result.skill;
    await refresh();
    setBodyById((cur) => ({ ...cur, [updated.id]: body }));
    // Drop the cached file tree for this id so the next expand
    // re-walks the on-disk folder; SKILL.md may have been the only
    // file before, but the user might have meant to add more.
    setFilesById((cur) => {
      const next = { ...cur };
      delete next[updated.id];
      return next;
    });
    setExpandedId(updated.id);
    setEditingId(null);
    setCreating(false);
    setDraft(EMPTY_DRAFT);
  }, [draft, draftSaving, editingId, refresh]);

  const armDelete = useCallback((id: string) => {
    setConfirmDeleteId(id);
  }, []);

  const cancelDelete = useCallback(() => {
    setConfirmDeleteId(null);
  }, []);

  const commitDelete = useCallback(
    async (id: string) => {
      const result = await deleteSkill(id);
      if ('error' in result) {
        setDraftError(result.error.message);
        return;
      }
      setConfirmDeleteId(null);
      await refresh();
      setBodyById((cur) => {
        const next = { ...cur };
        delete next[id];
        return next;
      });
      setFilesById((cur) => {
        const next = { ...cur };
        delete next[id];
        return next;
      });
      // Clear the disabled-skill flag so deleting a skill that was
      // toggled off doesn't leave dangling preferences behind.
      setCfg((c) => {
        const set = new Set(c.disabledSkills ?? []);
        set.delete(id);
        return { ...c, disabledSkills: [...set] };
      });
      if (expandedId === id) setExpandedId(null);
      if (editingId === id) {
        setEditingId(null);
        setDraft(EMPTY_DRAFT);
      }
    },
    [editingId, expandedId, refresh, setCfg],
  );

  const toggleEnabled = useCallback(
    (id: string, enabled: boolean) => {
      setCfg((c) => {
        const set = new Set(c.disabledSkills ?? []);
        if (enabled) set.delete(id);
        else set.add(id);
        return { ...c, disabledSkills: [...set] };
      });
    },
    [setCfg],
  );

  return (
    <section className="settings-section settings-skills">
      <div className="library-toolbar skills-toolbar">
        {/* Row 1: search + New skill button */}
        <div className="skills-toolbar-top">
          <input
            type="search"
            className="library-search"
            placeholder={t('settings.librarySearch')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="primary skills-add-btn"
            onClick={startCreate}
            data-testid="skills-new"
          >
            <Icon name="plus" size={13} />
            <span>{t('settings.skillsNew')}</span>
          </button>
        </div>
        {/* Row 2: filter dropdowns */}
        <div className="library-filter-selects">
          <label className="library-filter-select">
            <span className="library-filter-select-label">Source</span>
            <select
              value={sourceFilter}
              data-active={sourceFilter !== 'all' ? 'true' : undefined}
              onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            >
              <option value="all">
                {t('settings.libraryAll')} ({skills.length})
              </option>
              {(['user', 'built-in'] as const).map((s) => {
                const count = skills.filter((sk) => sk.source === s).length;
                return (
                  <option key={s} value={s}>
                    {s} ({count})
                  </option>
                );
              })}
            </select>
          </label>
          <label className="library-filter-select">
            <span className="library-filter-select-label">Type</span>
            <select
              value={modeFilter}
              data-active={modeFilter !== 'all' ? 'true' : undefined}
              onChange={(e) => setModeFilter(e.target.value)}
            >
              <option value="all">
                {t('settings.libraryAll')} ({skills.length})
              </option>
              {modeOptions.map(([mode, count]) => (
                <option key={mode} value={mode}>
                  {mode} ({count})
                </option>
              ))}
            </select>
          </label>
          {categoryOptions.length > 0 ? (
            <label
              className="library-filter-select"
              data-testid="skills-category-filters"
            >
              <span className="library-filter-select-label">Category</span>
              <select
                value={categoryFilter}
                data-active={categoryFilter !== 'all' ? 'true' : undefined}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">
                  {t('settings.libraryAll')} ({skills.length})
                </option>
                {categoryOptions.map(([cat, count]) => (
                  <option key={cat} value={cat}>
                    {humanizeCategory(cat)} ({count})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      {creating ? (
        <SkillDraftForm
          heading={t('settings.skillsNew')}
          subheading={null}
          draft={draft}
          setDraft={setDraft}
          error={draftError}
          saving={draftSaving}
          isEdit={false}
          onCancel={cancelDraft}
          onSubmit={() => void submitDraft()}
        />
      ) : null}

      {filteredSkills.length === 0 ? (
        <div className="empty-card">
          <strong>{t('settings.libraryNoResults')}</strong>
        </div>
      ) : (
        <div className="skills-rows" data-testid="skills-list">
          {filteredSkills.map((skill) => {
            const enabled = !disabledSkills.has(skill.id);
            const isExpanded = expandedId === skill.id;
            const isEditing = editingId === skill.id;
            return (
              <SkillRow
                key={skill.id}
                skill={skill}
                enabled={enabled}
                expanded={isExpanded}
                editing={isEditing}
                body={bodyById[skill.id]}
                bodyLoading={bodyLoadingId === skill.id}
                files={filesById[skill.id] ?? null}
                filesLoading={filesLoadingId === skill.id}
                confirmDelete={confirmDeleteId === skill.id}
                draft={isEditing ? draft : null}
                draftError={isEditing ? draftError : null}
                draftSaving={isEditing && draftSaving}
                setDraft={setDraft}
                onToggleExpanded={() => toggleExpanded(skill.id)}
                onToggleEnabled={(e) => toggleEnabled(skill.id, e)}
                onStartEdit={() => void startEdit(skill)}
                onArmDelete={() => armDelete(skill.id)}
                onCancelDelete={cancelDelete}
                onCommitDelete={() => void commitDelete(skill.id)}
                onCancelEdit={cancelDraft}
                onSubmitEdit={() => void submitDraft()}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

interface SkillRowProps {
  skill: SkillSummary;
  enabled: boolean;
  expanded: boolean;
  editing: boolean;
  body: string | undefined;
  bodyLoading: boolean;
  files: SkillFileEntry[] | null;
  filesLoading: boolean;
  confirmDelete: boolean;
  draft: DraftState | null;
  draftError: string | null;
  draftSaving: boolean;
  setDraft: Dispatch<SetStateAction<DraftState>>;
  onToggleExpanded: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onStartEdit: () => void;
  onArmDelete: () => void;
  onCancelDelete: () => void;
  onCommitDelete: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: () => void;
}

function SkillRow({
  skill,
  enabled,
  expanded,
  editing,
  body,
  bodyLoading,
  files,
  filesLoading,
  confirmDelete,
  draft,
  draftError,
  draftSaving,
  setDraft,
  onToggleExpanded,
  onToggleEnabled,
  onStartEdit,
  onArmDelete,
  onCancelDelete,
  onCommitDelete,
  onCancelEdit,
  onSubmitEdit,
}: SkillRowProps) {
  const t = useT();
  const summaryName = skill.name || skill.id;
  const canDelete = skill.source === 'user';
  return (
    <div
      className={`skills-row${enabled ? '' : ' skills-row-disabled'}${
        expanded ? ' skills-row-expanded' : ''
      }${editing ? ' skills-row-editing' : ''}`}
      data-testid={`skill-row-${skill.id}`}
    >
      <div className="skills-row-head">
        <button
          type="button"
          className="skills-row-summary-btn"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          <span className="skills-row-icon" aria-hidden>
            <Icon name="grid" size={14} />
          </span>
          <span className="skills-row-summary">
            <span className="skills-row-summary-line">
              <span className="skills-row-summary-name">{summaryName}</span>
              <span className="skills-row-summary-mode">{skill.mode}</span>
              {skill.category ? (
                <span
                  className="skills-row-summary-category"
                  title={`Category: ${humanizeCategory(skill.category)}`}
                >
                  {humanizeCategory(skill.category)}
                </span>
              ) : null}
              {skill.source === 'user' ? (
                <span
                  className="skills-row-summary-source"
                  title="User-imported skill"
                >
                  user
                </span>
              ) : null}
            </span>
            {skill.description ? (
              <span className="skills-row-summary-desc">{skill.description}</span>
            ) : null}
          </span>
          <span className="skills-row-chevron" aria-hidden>
            <Icon name="chevron-down" size={14} />
          </span>
        </button>
        <div className="skills-row-actions">
          {canDelete && confirmDelete ? (
            <span className="skills-delete-confirm" role="group">
              <button
                type="button"
                className="btn danger"
                onClick={onCommitDelete}
                data-testid="skills-delete-confirm"
              >
                {t('settings.skillsDeleteConfirm')}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={onCancelDelete}
              >
                {t('common.cancel')}
              </button>
            </span>
          ) : (
            <>
              <button
                type="button"
                className="icon-btn"
                onClick={onStartEdit}
                title={t('settings.skillsEdit')}
                data-testid="skills-edit"
              >
                <Icon name="edit" size={13} />
              </button>
              {canDelete ? (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={onArmDelete}
                  title={t('settings.skillsDelete')}
                  data-testid="skills-delete"
                >
                  <Icon name="close" size={13} />
                </button>
              ) : null}
            </>
          )}
          <label
            className="toggle-switch toggle-switch-sm skills-row-enable"
            title={t('settings.libraryToggleLabel')}
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggleEnabled(e.target.checked)}
              aria-label={t('settings.libraryToggleLabel')}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      {expanded && !editing ? (
        <div className="skills-row-detail">
          <div className="skills-row-section">
            <h5>SKILL.md</h5>
            {bodyLoading ? (
              <p className="library-empty">{t('settings.libraryLoading')}</p>
            ) : (
              <pre className="library-preview-body">{body ?? ''}</pre>
            )}
          </div>
          <div className="skills-row-section">
            <h5>{t('settings.skillsFiles')}</h5>
            {filesLoading ? (
              <p className="library-empty">{t('settings.libraryLoading')}</p>
            ) : !files || files.length === 0 ? (
              <p className="library-empty">{t('settings.skillsNoFiles')}</p>
            ) : (
              <ul className="skills-file-tree">
                {files.map((entry) => (
                  <li
                    key={entry.path}
                    className={`skills-file-entry skills-file-entry-${entry.kind}`}
                    style={{ paddingLeft: depthIndent(entry.path) }}
                  >
                    <Icon
                      name={entry.kind === 'directory' ? 'folder' : 'file'}
                      size={12}
                    />
                    <span>{leafName(entry.path)}</span>
                    {entry.kind === 'file' && typeof entry.size === 'number' ? (
                      <span className="skills-file-size">
                        {formatSize(entry.size)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {editing && draft ? (
        <SkillDraftForm
          heading={t('settings.skillsEdit')}
          subheading={skill.id}
          draft={draft}
          setDraft={setDraft}
          error={draftError}
          saving={draftSaving}
          isEdit
          onCancel={onCancelEdit}
          onSubmit={onSubmitEdit}
        />
      ) : null}
    </div>
  );
}

interface SkillDraftFormProps {
  heading: string;
  subheading: string | null;
  draft: DraftState;
  setDraft: Dispatch<SetStateAction<DraftState>>;
  error: string | null;
  saving: boolean;
  isEdit: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

function SkillDraftForm({
  heading,
  subheading,
  draft,
  setDraft,
  error,
  saving,
  isEdit,
  onCancel,
  onSubmit,
}: SkillDraftFormProps) {
  const t = useT();
  return (
    <div
      className="skills-draft library-import-form"
      data-testid={isEdit ? 'skills-edit-form' : 'skills-create-form'}
    >
      <header className="skills-draft-head">
        <div>
          <h4>{heading}</h4>
          {subheading ? <p className="skills-draft-sub">{subheading}</p> : null}
        </div>
      </header>
      <div className="library-import-row">
        <label>
          <span>{t('settings.skillsName')}</span>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="my-skill"
            disabled={isEdit}
          />
        </label>
        <label>
          <span>{t('settings.skillsTriggers')}</span>
          <input
            type="text"
            value={draft.triggers}
            onChange={(e) =>
              setDraft((d) => ({ ...d, triggers: e.target.value }))
            }
            placeholder="search the web, summarize"
          />
        </label>
      </div>
      <label className="library-import-block">
        <span>{t('settings.skillsDescription')}</span>
        <textarea
          rows={2}
          value={draft.description}
          onChange={(e) =>
            setDraft((d) => ({ ...d, description: e.target.value }))
          }
          placeholder="What does this skill do? When should the agent reach for it?"
        />
      </label>
      <label className="library-import-block">
        <span>{t('settings.skillsBody')}</span>
        <textarea
          rows={14}
          value={draft.body}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          placeholder={'# My skill\n\n1. Explain the workflow.\n2. Describe the inputs and outputs.'}
        />
      </label>
      {error ? (
        <div className="library-import-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="library-import-actions">
        <button
          type="button"
          className="btn ghost"
          onClick={onCancel}
          disabled={saving}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={onSubmit}
          disabled={saving}
          data-testid="skills-save"
        >
          {saving
            ? t('settings.skillsSaving')
            : isEdit
              ? t('settings.skillsSave')
              : t('settings.skillsCreate')}
        </button>
      </div>
    </div>
  );
}

// Each `/`-separated segment indents by 12px so a small assets/ tree
// reads as a tree without us building a nested list. Capped at 4 levels
// so bundles with deep folder hierarchies don't push the file label
// past the panel.
function depthIndent(p: string): number {
  const depth = Math.min(4, p.split('/').length - 1);
  return depth * 12;
}

function leafName(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx >= 0 ? p.slice(idx + 1) : p;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Frontmatter-style category slugs come in as kebab-case
// ("image-generation"). Render them as Title Case in the filter pill so
// the row reads as a category list rather than a raw enum dump.
function humanizeCategory(slug: string): string {
  if (!slug) return slug;
  return slug
    .split('-')
    .map((word) =>
      word.length === 0
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}
