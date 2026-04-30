import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import type {
  DesignSystemSummary,
  ProjectKind,
  ProjectMetadata,
  ProjectTemplate,
  SkillSummary,
} from '../types';
import { Icon } from './Icon';
import { Skeleton } from './Loading';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

export type CreateTab = 'prototype' | 'deck' | 'template' | 'other';

export interface CreateInput {
  name: string;
  skillId: string | null;
  designSystemId: string | null;
  metadata: ProjectMetadata;
}

interface Props {
  skills: SkillSummary[];
  designSystems: DesignSystemSummary[];
  defaultDesignSystemId: string | null;
  templates: ProjectTemplate[];
  onCreate: (input: CreateInput) => void;
  onImportClaudeDesign?: (file: File) => Promise<void> | void;
  loading?: boolean;
}

const TAB_LABEL_KEYS: Record<CreateTab, keyof Dict> = {
  prototype: 'newproj.tabPrototype',
  deck: 'newproj.tabDeck',
  template: 'newproj.tabTemplate',
  other: 'newproj.tabOther',
};

export function NewProjectPanel({
  skills,
  designSystems,
  defaultDesignSystemId,
  templates,
  onCreate,
  onImportClaudeDesign,
  loading = false,
}: Props) {
  const t = useT();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [tab, setTab] = useState<CreateTab>('prototype');
  const [name, setName] = useState('');
  // Design-system selection is now an *array* internally so the same
  // component can drive both single-select and multi-select modes without
  // duplicating state. Single-select coerces to length 0/1.
  const [selectedDsIds, setSelectedDsIds] = useState<string[]>([]);
  const [dsMulti, setDsMulti] = useState(false);

  // Per-tab metadata. Tracked independently so switching tabs preserves
  // each tab's pick rather than resetting to defaults.
  const [fidelity, setFidelity] = useState<'wireframe' | 'high-fidelity'>(
    'high-fidelity',
  );
  const [speakerNotes, setSpeakerNotes] = useState(false);
  const [animations, setAnimations] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);

  // When entering the template tab, snap to the first user-saved template
  // if there is one (and we don't already have a valid pick). The template
  // tab no longer offers a built-in fallback — the entire point is to
  // start from a template *the user* created via Share.
  useEffect(() => {
    if (tab !== 'template') return;
    if (templates.length === 0) {
      setTemplateId(null);
      return;
    }
    if (templateId == null || !templates.some((t) => t.id === templateId)) {
      setTemplateId(templates[0]!.id);
    }
  }, [tab, templates, templateId]);

  // The skill the request still routes through — kept so prototype/deck
  // pick a default-rendered skill (so the agent gets the right SKILL.md
  // body) without requiring the user to choose one explicitly.
  const skillIdForTab = useMemo(() => {
    if (tab === 'other') return null;
    if (tab === 'prototype') {
      const list = skills.filter((s) => s.mode === 'prototype');
      return list.find((s) => s.defaultFor.includes('prototype'))?.id
        ?? list[0]?.id
        ?? null;
    }
    if (tab === 'deck') {
      const list = skills.filter((s) => s.mode === 'deck');
      return list.find((s) => s.defaultFor.includes('deck'))?.id
        ?? list[0]?.id
        ?? null;
    }
    return null;
  }, [tab, skills]);

  const canCreate =
    !loading && (tab !== 'template' || templateId != null);

  function handleCreate() {
    if (!canCreate) return;
    const primaryDs = selectedDsIds[0] ?? null;
    const inspirations = selectedDsIds.slice(1);
    const metadata = buildMetadata({
      tab,
      fidelity,
      speakerNotes,
      animations,
      templateId,
      templates,
      inspirationIds: inspirations,
    });
    onCreate({
      name: name.trim() || autoName(tab, t),
      skillId: skillIdForTab,
      designSystemId: primaryDs,
      metadata,
    });
  }

  async function handleImportPicked(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file || !onImportClaudeDesign) return;
    setImporting(true);
    try {
      await onImportClaudeDesign(file);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="newproj" data-testid="new-project-panel">
      <div className="newproj-tabs" role="tablist">
        {(Object.keys(TAB_LABEL_KEYS) as CreateTab[]).map((entry) => (
          <button
            key={entry}
            role="tab"
            data-testid={`new-project-tab-${entry}`}
            aria-selected={tab === entry}
            className={`newproj-tab ${tab === entry ? 'active' : ''}`}
            onClick={() => setTab(entry)}
          >
            {t(TAB_LABEL_KEYS[entry])}
          </button>
        ))}
      </div>
      <div className="newproj-body">
        <h3 className="newproj-title">{titleForTab(tab, t)}</h3>

        <input
          className="newproj-name"
          data-testid="new-project-name"
          placeholder={t('newproj.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <DesignSystemPicker
          designSystems={designSystems}
          defaultDesignSystemId={defaultDesignSystemId}
          selectedIds={selectedDsIds}
          multi={dsMulti}
          onChangeMulti={setDsMulti}
          onChange={setSelectedDsIds}
          loading={loading}
        />

        {tab === 'prototype' ? (
          <FidelityPicker value={fidelity} onChange={setFidelity} />
        ) : null}

        {tab === 'deck' ? (
          <ToggleRow
            label={t('newproj.toggleSpeakerNotes')}
            hint={t('newproj.toggleSpeakerNotesHint')}
            checked={speakerNotes}
            onChange={setSpeakerNotes}
          />
        ) : null}

        {tab === 'template' ? (
          <>
            <TemplatePicker
              templates={templates}
              value={templateId}
              onChange={setTemplateId}
            />
            <ToggleRow
              label={t('newproj.toggleAnimations')}
              hint={t('newproj.toggleAnimationsHint')}
              checked={animations}
              onChange={setAnimations}
            />
          </>
        ) : null}

        <button
          className="primary newproj-create"
          data-testid="create-project"
          onClick={handleCreate}
          disabled={!canCreate}
          title={
            tab === 'template' && templateId == null
              ? t('newproj.createDisabledTitle')
              : undefined
          }
        >
          <Icon name="plus" size={13} />
          <span>
            {tab === 'template'
              ? t('newproj.createFromTemplate')
              : t('newproj.create')}
          </span>
        </button>
        {onImportClaudeDesign ? (
          <>
            <input
              ref={importInputRef}
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={handleImportPicked}
            />
            <button
              type="button"
              className="ghost newproj-import"
              disabled={loading || importing}
              title={t('newproj.importClaudeZipTitle')}
              onClick={() => importInputRef.current?.click()}
            >
              <Icon name="import" size={13} />
              <span>
                {importing
                  ? t('newproj.importingClaudeZip')
                  : t('newproj.importClaudeZip')}
              </span>
            </button>
          </>
        ) : null}
      </div>
      <div className="newproj-footer">{t('newproj.privacyFooter')}</div>
    </div>
  );
}

function FidelityPicker({
  value,
  onChange,
}: {
  value: 'wireframe' | 'high-fidelity';
  onChange: (v: 'wireframe' | 'high-fidelity') => void;
}) {
  const t = useT();
  return (
    <div className="newproj-section">
      <label className="newproj-label">{t('newproj.fidelityLabel')}</label>
      <div className="fidelity-grid">
        <FidelityCard
          active={value === 'wireframe'}
          onClick={() => onChange('wireframe')}
          label={t('newproj.fidelityWireframe')}
          variant="wireframe"
        />
        <FidelityCard
          active={value === 'high-fidelity'}
          onClick={() => onChange('high-fidelity')}
          label={t('newproj.fidelityHigh')}
          variant="high-fidelity"
        />
      </div>
    </div>
  );
}

function FidelityCard({
  active,
  onClick,
  label,
  variant,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  variant: 'wireframe' | 'high-fidelity';
}) {
  return (
    <button
      type="button"
      className={`fidelity-card${active ? ' active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className={`fidelity-thumb fidelity-thumb-${variant}`} aria-hidden>
        {variant === 'wireframe' ? <WireframeArt /> : <HighFidelityArt />}
      </span>
      <span className="fidelity-label">{label}</span>
    </button>
  );
}

function WireframeArt() {
  return (
    <svg viewBox="0 0 120 70" width="100%" height="100%" aria-hidden>
      <rect x="6" y="8" width="46" height="6" rx="2" fill="#d8d4cb" />
      <rect x="6" y="20" width="34" height="4" rx="2" fill="#ebe8e1" />
      <rect x="6" y="28" width="38" height="4" rx="2" fill="#ebe8e1" />
      <rect x="6" y="36" width="30" height="4" rx="2" fill="#ebe8e1" />
      <circle cx="22" cy="56" r="6" fill="none" stroke="#d8d4cb" strokeWidth="1.4" />
      <rect x="64" y="8" width="50" height="54" rx="3" fill="none" stroke="#d8d4cb" strokeWidth="1.4" />
      <rect x="70" y="14" width="38" height="4" rx="2" fill="#ebe8e1" />
      <rect x="70" y="22" width="32" height="4" rx="2" fill="#ebe8e1" />
      <rect x="70" y="30" width="38" height="4" rx="2" fill="#ebe8e1" />
    </svg>
  );
}

function HighFidelityArt() {
  return (
    <svg viewBox="0 0 120 70" width="100%" height="100%" aria-hidden>
      <rect x="6" y="8" width="34" height="6" rx="2" fill="#1a1916" />
      <rect x="6" y="20" width="46" height="4" rx="2" fill="#74716b" />
      <rect x="6" y="28" width="42" height="4" rx="2" fill="#b3b0a8" />
      <rect x="6" y="40" width="22" height="9" rx="2" fill="#c96442" />
      <rect x="64" y="8" width="50" height="54" rx="4" fill="#fbeee5" />
      <rect x="70" y="14" width="38" height="4" rx="2" fill="#c96442" />
      <rect x="70" y="22" width="32" height="3" rx="1.5" fill="#74716b" />
      <rect x="70" y="29" width="36" height="3" rx="1.5" fill="#b3b0a8" />
      <rect x="70" y="36" width="20" height="6" rx="2" fill="#c96442" />
    </svg>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`toggle-row${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <div className="toggle-row-text">
        <span className="toggle-row-label">{label}</span>
        {hint ? <span className="toggle-row-hint">{hint}</span> : null}
      </div>
      <span className="toggle-row-switch" aria-hidden />
    </button>
  );
}

function TemplatePicker({
  templates,
  value,
  onChange,
}: {
  templates: ProjectTemplate[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const t = useT();
  return (
    <div className="newproj-section">
      <label className="newproj-label">{t('newproj.templateLabel')}</label>
      {templates.length === 0 ? (
        <div className="template-howto">
          <span className="template-howto-title">
            {t('newproj.noTemplatesTitle')}
          </span>
          <span className="template-howto-body">
            {t('newproj.noTemplatesBody')}
          </span>
        </div>
      ) : (
        <div className="template-list">
          {templates.map((tpl) => {
            const fallbackDesc = `${t('newproj.savedTemplate')} · ${tpl.files.length} ${
              tpl.files.length === 1
                ? t('newproj.fileSingular')
                : t('newproj.filePlural')
            }`;
            return (
              <TemplateOption
                key={tpl.id}
                active={value === tpl.id}
                onClick={() => onChange(tpl.id)}
                name={tpl.name}
                description={tpl.description ?? fallbackDesc}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function TemplateOption({
  active,
  onClick,
  name,
  description,
}: {
  active: boolean;
  onClick: () => void;
  name: string;
  description: string;
}) {
  return (
    <button
      type="button"
      className={`template-option${active ? ' active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className={`template-radio${active ? ' active' : ''}`} aria-hidden />
      <span className="template-option-text">
        <span className="template-option-name">{name}</span>
        <span className="template-option-desc">{description}</span>
      </span>
    </button>
  );
}

/* ============================================================
   Design system picker — custom popover (replaces native <select>).
   - Single-select by default. Toggle in the popover header switches to
     multi-select, which lets users blend up to a few inspirations
     (first pick is the primary; the rest go into metadata).
   - Trigger card mirrors the claude.ai/design treatment: a tiny brand
     swatch strip + title + "Default" subtitle + chevron.
   ============================================================ */
function DesignSystemPicker({
  designSystems,
  defaultDesignSystemId,
  selectedIds,
  multi,
  onChange,
  onChangeMulti,
  loading,
}: {
  designSystems: DesignSystemSummary[];
  defaultDesignSystemId: string | null;
  selectedIds: string[];
  multi: boolean;
  onChange: (ids: string[]) => void;
  onChangeMulti: (v: boolean) => void;
  loading: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const byId = useMemo(() => {
    const map = new Map<string, DesignSystemSummary>();
    for (const d of designSystems) map.set(d.id, d);
    return map;
  }, [designSystems]);

  // Sort: selected first (in pick order), then default DS, then alpha
  // by category then title. Keeps the popover scannable while honoring
  // the user's existing picks.
  const ordered = useMemo(() => {
    const picked = selectedIds
      .map((id) => byId.get(id))
      .filter((d): d is DesignSystemSummary => Boolean(d));
    const pickedSet = new Set(picked.map((d) => d.id));
    const rest = designSystems
      .filter((d) => !pickedSet.has(d.id))
      .sort((a, b) => {
        if (a.id === defaultDesignSystemId) return -1;
        if (b.id === defaultDesignSystemId) return 1;
        const ca = a.category || 'Other';
        const cb = b.category || 'Other';
        if (ca !== cb) return ca.localeCompare(cb);
        return a.title.localeCompare(b.title);
      });
    return [...picked, ...rest];
  }, [designSystems, byId, selectedIds, defaultDesignSystemId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((d) => {
      return (
        d.title.toLowerCase().includes(q) ||
        (d.summary || '').toLowerCase().includes(q) ||
        (d.category || '').toLowerCase().includes(q)
      );
    });
  }, [ordered, query]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    // Defer listener registration by a tick so the very click that opened
    // the popover doesn't get re-interpreted as an outside-click on the
    // mousedown that follows in the same event cycle (StrictMode also
    // double-invokes the effect, which can race the same event).
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointer);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(id: string) {
    if (multi) {
      // Multi-select: tapping toggles membership; the *first* id in the
      // array is treated as the primary across the rest of the app.
      const has = selectedIds.includes(id);
      if (has) {
        onChange(selectedIds.filter((x) => x !== id));
      } else {
        onChange([...selectedIds, id]);
      }
    } else {
      onChange([id]);
      setOpen(false);
    }
  }

  function clearAll() {
    onChange([]);
    if (!multi) setOpen(false);
  }

  const primaryId = selectedIds[0] ?? null;
  const primary = primaryId ? byId.get(primaryId) ?? null : null;
  const extraCount = Math.max(0, selectedIds.length - 1);
  const isDefault = !!primary && primary.id === defaultDesignSystemId;

  if (loading && designSystems.length === 0) {
    return (
      <div className="newproj-section">
        <label className="newproj-label">{t('newproj.designSystem')}</label>
        <Skeleton height={56} width="100%" radius={8} />
      </div>
    );
  }

  return (
    <div className="newproj-section ds-picker" data-testid="design-system-picker" ref={wrapRef}>
      <label className="newproj-label">{t('newproj.designSystem')}</label>
      <button
        type="button"
        data-testid="design-system-trigger"
        className={`ds-picker-trigger${open ? ' open' : ''}${primary ? '' : ' empty'}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <DesignSystemAvatar system={primary} extraCount={extraCount} />
        <span className="ds-picker-meta">
          <span className="ds-picker-title">
            {primary ? primary.title : t('newproj.dsNoneFreeform')}
            {extraCount > 0 ? (
              <span className="ds-picker-extra-pill">+{extraCount}</span>
            ) : null}
          </span>
          <span className="ds-picker-sub">
            {primary
              ? isDefault
                ? t('common.default')
                : primary.category || t('newproj.dsCategoryFallback')
              : t('newproj.dsNoneSubtitleEmpty')}
          </span>
        </span>
        <Icon
          name="chevron-down"
          size={14}
          className="ds-picker-chevron"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>
      {open ? (
        <div className="ds-picker-popover" role="listbox">
          <div className="ds-picker-head">
            <input
              ref={searchRef}
              data-testid="design-system-search"
              className="ds-picker-search"
              placeholder={t('newproj.dsSearch')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div
              className="ds-picker-mode"
              role="tablist"
              aria-label={t('newproj.dsModeAria')}
            >
              <button
                type="button"
                role="tab"
                aria-selected={!multi}
                className={`ds-picker-mode-btn${!multi ? ' active' : ''}`}
                onClick={() => {
                  onChangeMulti(false);
                  if (selectedIds.length > 1) onChange(selectedIds.slice(0, 1));
                }}
              >
                {t('newproj.dsModeSingle')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={multi}
                className={`ds-picker-mode-btn${multi ? ' active' : ''}`}
                onClick={() => onChangeMulti(true)}
              >
                {t('newproj.dsModeMulti')}
              </button>
            </div>
          </div>
          <div className="ds-picker-list">
            <DsPickerItem
              active={selectedIds.length === 0}
              multi={multi}
              onClick={clearAll}
              avatar={<NoneAvatar />}
              title={t('newproj.dsNoneTitle')}
              subtitle={t('newproj.dsNoneSub')}
            />
            {filtered.length === 0 ? (
              <div className="ds-picker-empty">
                {t('newproj.dsEmpty', { query })}
              </div>
            ) : (
              filtered.map((d) => {
                const active = selectedIds.includes(d.id);
                const order = active ? selectedIds.indexOf(d.id) : -1;
                return (
                  <DsPickerItem
                    key={d.id}
                    active={active}
                    multi={multi}
                    order={order}
                    onClick={() => toggle(d.id)}
                    avatar={<DesignSystemAvatar system={d} />}
                    title={d.title}
                    badge={
                      d.id === defaultDesignSystemId
                        ? t('newproj.dsBadgeDefault')
                        : undefined
                    }
                    subtitle={d.summary || d.category || ''}
                  />
                );
              })
            )}
          </div>
          {multi && selectedIds.length > 1 ? (
            <div className="ds-picker-foot">
              <span className="ds-picker-foot-text">
                <strong>{primary?.title ?? t('newproj.dsPrimaryFallback')}</strong>{' '}
                {extraCount === 1
                  ? t('newproj.dsFootSingular')
                  : t('newproj.dsFootPlural')}
              </span>
              <button
                type="button"
                className="ds-picker-clear"
                onClick={clearAll}
              >
                {t('newproj.dsFootClear')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DsPickerItem({
  active,
  multi,
  order,
  onClick,
  avatar,
  title,
  subtitle,
  badge,
}: {
  active: boolean;
  multi: boolean;
  order?: number;
  onClick: () => void;
  avatar: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      className={`ds-picker-item${active ? ' active' : ''}`}
      onClick={onClick}
    >
      <span className="ds-picker-item-avatar">{avatar}</span>
      <span className="ds-picker-item-text">
        <span className="ds-picker-item-title">
          {title}
          {badge ? <span className="ds-picker-item-badge">{badge}</span> : null}
        </span>
        <span className="ds-picker-item-sub">{subtitle}</span>
      </span>
      <span
        className={`ds-picker-mark ${multi ? 'check' : 'radio'}${active ? ' active' : ''}`}
        aria-hidden
      >
        {multi ? (
          active ? (order != null && order >= 0 ? order + 1 : '✓') : ''
        ) : null}
      </span>
    </button>
  );
}

function DesignSystemAvatar({
  system,
  extraCount = 0,
}: {
  system: DesignSystemSummary | null;
  extraCount?: number;
}) {
  if (!system) return <NoneAvatar />;
  const swatches = system.swatches && system.swatches.length > 0
    ? system.swatches.slice(0, 4)
    : fallbackSwatches(system.title);
  return (
    <span className="ds-avatar" aria-hidden>
      <span className="ds-avatar-grid">
        {swatches.map((c, i) => (
          <span key={i} className="ds-avatar-cell" style={{ background: c }} />
        ))}
      </span>
      {extraCount > 0 ? (
        <span className="ds-avatar-stack">+{extraCount}</span>
      ) : null}
    </span>
  );
}

function NoneAvatar() {
  return (
    <span className="ds-avatar ds-avatar-none" aria-hidden>
      <svg viewBox="0 0 24 24" width="16" height="16">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <line x1="6" y1="18" x2="18" y2="6" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </span>
  );
}

// Deterministic fallback swatches for design systems whose DESIGN.md doesn't
// expose its tokens via the bold-and-hex format. Keeps the avatar visually
// distinct per-system without extra metadata fetches.
function fallbackSwatches(seed: string): string[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const base = h % 360;
  return [
    `hsl(${base}, 18%, 96%)`,
    `hsl(${(base + 90) % 360}, 22%, 78%)`,
    `hsl(${(base + 180) % 360}, 30%, 32%)`,
    `hsl(${(base + 30) % 360}, 70%, 52%)`,
  ];
}

function buildMetadata(input: {
  tab: CreateTab;
  fidelity: 'wireframe' | 'high-fidelity';
  speakerNotes: boolean;
  animations: boolean;
  templateId: string | null;
  templates: ProjectTemplate[];
  inspirationIds: string[];
}): ProjectMetadata {
  const kind: ProjectKind = input.tab;
  const inspirations = input.inspirationIds.length > 0
    ? { inspirationDesignSystemIds: input.inspirationIds }
    : {};
  if (input.tab === 'prototype') {
    return { kind, fidelity: input.fidelity, ...inspirations };
  }
  if (input.tab === 'deck') {
    return { kind, speakerNotes: input.speakerNotes, ...inspirations };
  }
  if (input.tab === 'template') {
    if (input.templateId == null) {
      return { kind, animations: input.animations, ...inspirations };
    }
    const tpl = input.templates.find((x) => x.id === input.templateId);
    // The fallback label is consumed by the agent prompt rather than the
    // UI, so we keep it in English to match the rest of the prompt corpus.
    return {
      kind,
      animations: input.animations,
      templateId: input.templateId,
      templateLabel: tpl?.name ?? 'Saved template',
      ...inspirations,
    };
  }
  return { kind: 'other', ...inspirations };
}

function titleForTab(tab: CreateTab, t: TranslateFn): string {
  switch (tab) {
    case 'prototype':
      return t('newproj.titlePrototype');
    case 'deck':
      return t('newproj.titleDeck');
    case 'template':
      return t('newproj.titleTemplate');
    case 'other':
      return t('newproj.titleOther');
  }
}

function autoName(tab: CreateTab, t: TranslateFn): string {
  const stamp = new Date().toLocaleDateString();
  return `${t(TAB_LABEL_KEYS[tab])} · ${stamp}`;
}
