import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import {
  localizeSkillDescription,
  localizeSkillPrompt,
} from '../i18n/content';
import type { Dict } from '../i18n/types';
import { fetchSkillExample } from '../providers/registry';
import { exportAsHtml, exportAsPdf, exportAsZip } from '../runtime/exports';
import { buildSrcdoc } from '../runtime/srcdoc';
import type { SkillSummary, Surface } from '../types';
import { Icon } from './Icon';
import { PreviewModal } from './PreviewModal';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

interface Props {
  skills: SkillSummary[];
  onUsePrompt: (skill: SkillSummary) => void;
}

type ModeFilter = 'all' | 'prototype-desktop' | 'prototype-mobile' | 'deck' | 'document';
type SurfaceFilter = 'all' | Surface;
type ScenarioFilter = string;

const SURFACE_PILLS: { value: SurfaceFilter; labelKey: keyof Dict }[] = [
  { value: 'all', labelKey: 'examples.modeAll' },
  { value: 'web', labelKey: 'examples.surfaceWeb' },
  { value: 'image', labelKey: 'examples.surfaceImage' },
  { value: 'video', labelKey: 'examples.surfaceVideo' },
  { value: 'audio', labelKey: 'examples.surfaceAudio' },
];

const MODE_PILLS: { value: ModeFilter; labelKey: keyof Dict }[] = [
  { value: 'all', labelKey: 'examples.modeAll' },
  { value: 'prototype-desktop', labelKey: 'examples.modePrototypeDesktop' },
  { value: 'prototype-mobile', labelKey: 'examples.modePrototypeMobile' },
  { value: 'deck', labelKey: 'examples.modeDeck' },
  { value: 'document', labelKey: 'examples.modeDocument' },
];

const SCENARIO_LABEL_KEY: Record<string, keyof Dict> = {
  general: 'examples.scenarioGeneral',
  engineering: 'examples.scenarioEngineering',
  product: 'examples.scenarioProduct',
  design: 'examples.scenarioDesign',
  marketing: 'examples.scenarioMarketing',
  sales: 'examples.scenarioSales',
  finance: 'examples.scenarioFinance',
  hr: 'examples.scenarioHr',
  operations: 'examples.scenarioOperations',
  support: 'examples.scenarioSupport',
  legal: 'examples.scenarioLegal',
  education: 'examples.scenarioEducation',
  personal: 'examples.scenarioPersonal',
};

function scenarioLabel(t: TranslateFn, tag: string): string {
  const key = SCENARIO_LABEL_KEY[tag];
  if (key) return t(key);
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

const SCENARIO_ORDER = [
  'engineering',
  'product',
  'design',
  'marketing',
  'sales',
  'finance',
  'hr',
  'operations',
  'support',
  'legal',
  'education',
  'personal',
  'general',
];

function matchesMode(skill: SkillSummary, filter: ModeFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'deck') return skill.mode === 'deck';
  if (filter === 'prototype-desktop')
    return skill.mode === 'prototype' && (skill.platform ?? 'desktop') === 'desktop';
  if (filter === 'prototype-mobile')
    return skill.mode === 'prototype' && skill.platform === 'mobile';
  if (filter === 'document') return skill.mode === 'template';
  return true;
}

function surfaceOf(skill: SkillSummary): Surface {
  if (skill.surface) return skill.surface;
  if (skill.mode === 'image' || skill.mode === 'video' || skill.mode === 'audio') return skill.mode;
  return 'web';
}

function matchesSurface(skill: SkillSummary, filter: SurfaceFilter): boolean {
  return filter === 'all' || surfaceOf(skill) === filter;
}

function quotePrompt(locale: string, text: string): string {
  return locale === 'de' ? `„${text}“` : `“${text}”`;
}

export function ExamplesTab({ skills, onUsePrompt }: Props) {
  const { locale, t } = useI18n();
  // Hold preview HTML per skill across re-renders so cards never re-flicker.
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>('all');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [scenarioFilter, setScenarioFilter] = useState<ScenarioFilter>('all');
  // Free-text search filters by skill name + description + prompt so users
  // can find a known example by typing any associated word ("airbnb",
  // "wireframe", "deck") without having to click through filter pills first.
  const [search, setSearch] = useState('');
  const [previewSkillId, setPreviewSkillId] = useState<string | null>(null);

  const loadPreview = useCallback(
    async (id: string) => {
      if (previews[id] !== undefined) return;
      const html = await fetchSkillExample(id);
      setPreviews((prev) => ({ ...prev, [id]: html }));
    },
    [previews],
  );

  // Open the modal for a card. We always trigger a preview fetch even if
  // the card hasn't been hovered yet — the modal needs the HTML.
  const openPreview = useCallback(
    (id: string) => {
      setPreviewSkillId(id);
      void loadPreview(id);
    },
    [loadPreview],
  );

  const previewSkill = useMemo(
    () => (previewSkillId ? skills.find((s) => s.id === previewSkillId) ?? null : null),
    [skills, previewSkillId],
  );

  const modeCounts = useMemo(() => {
    const surfaceScoped = skills.filter((skill) => matchesSurface(skill, surfaceFilter));
    const c: Record<ModeFilter, number> = {
      all: surfaceScoped.length,
      'prototype-desktop': 0,
      'prototype-mobile': 0,
      deck: 0,
      document: 0,
    };
    for (const s of surfaceScoped) {
      if (matchesMode(s, 'prototype-desktop')) c['prototype-desktop']++;
      if (matchesMode(s, 'prototype-mobile')) c['prototype-mobile']++;
      if (matchesMode(s, 'deck')) c.deck++;
      if (matchesMode(s, 'document')) c.document++;
    }
    return c;
  }, [skills, surfaceFilter]);

  const surfaceCounts = useMemo(() => {
    const counts: Record<SurfaceFilter, number> = { all: skills.length, web: 0, image: 0, video: 0, audio: 0 };
    for (const s of skills) counts[surfaceOf(s)]++;
    return counts;
  }, [skills]);

  const scenarioCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of skills) {
      if (!matchesSurface(s, surfaceFilter) || !matchesMode(s, modeFilter)) continue;
      const tag = s.scenario || 'general';
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return counts;
  }, [skills, surfaceFilter, modeFilter]);

  const scenarioOptions = useMemo(() => {
    const have = new Set(scenarioCounts.keys());
    const ordered: string[] = [];
    for (const k of SCENARIO_ORDER) if (have.has(k)) ordered.push(k);
    for (const k of [...have].sort()) if (!ordered.includes(k)) ordered.push(k);
    return ordered;
  }, [scenarioCounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = skills.filter((s) => {
      if (!matchesSurface(s, surfaceFilter) || !matchesMode(s, modeFilter)) return false;
      if (scenarioFilter !== 'all' && (s.scenario || 'general') !== scenarioFilter) return false;
      if (!q) return true;
      const desc = localizeSkillDescription(locale, s);
      const prompt = localizeSkillPrompt(locale, s) || '';
      const haystack = `${s.name} ${desc} ${prompt} ${s.scenario ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
    // Featured magazine-style examples float to the top (lower priority
    // number wins). Non-featured skills keep their server-side order so
    // contributors can still author SKILL.md alphabetically.
    return matched
      .map((s, idx) => ({ s, idx }))
      .sort((a, b) => {
        const aRank = typeof a.s.featured === 'number' ? a.s.featured : Number.POSITIVE_INFINITY;
        const bRank = typeof b.s.featured === 'number' ? b.s.featured : Number.POSITIVE_INFINITY;
        if (aRank !== bRank) return aRank - bRank;
        return a.idx - b.idx;
      })
      .map(({ s }) => s);
  }, [skills, surfaceFilter, modeFilter, scenarioFilter, search, locale]);

  if (skills.length === 0) {
    return <div className="tab-empty">{t('examples.emptyNoSkills')}</div>;
  }

  return (
    <div className="tab-panel examples-panel">
      <div className="examples-toolbar">
        <div className="examples-search">
          <span className="search-icon" aria-hidden>
            <Icon name="search" size={13} />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('examples.searchPlaceholder')}
            aria-label={t('examples.searchAria')}
          />
        </div>
        <div
          className="examples-filter-row"
          role="tablist"
          aria-label={t('examples.surfaceLabel')}
        >
          <span className="examples-filter-label">{t('examples.surfaceLabel')}</span>
          {SURFACE_PILLS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="tab"
              aria-selected={surfaceFilter === p.value}
              className={`filter-pill ${surfaceFilter === p.value ? 'active' : ''}`}
              onClick={() => {
                setSurfaceFilter(p.value);
                setModeFilter('all');
                setScenarioFilter('all');
              }}
            >
              {t(p.labelKey)}
              <span className="filter-pill-count">{surfaceCounts[p.value]}</span>
            </button>
          ))}
        </div>
        <div
          className="examples-filter-row"
          role="tablist"
          aria-label={t('examples.typeLabel')}
        >
          <span className="examples-filter-label">{t('examples.typeLabel')}</span>
          {MODE_PILLS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="tab"
              aria-selected={modeFilter === p.value}
              className={`filter-pill ${modeFilter === p.value ? 'active' : ''}`}
              onClick={() => {
                setModeFilter(p.value);
                setScenarioFilter('all');
              }}
            >
              {t(p.labelKey)}
              <span className="filter-pill-count">{modeCounts[p.value]}</span>
            </button>
          ))}
        </div>
        {scenarioOptions.length > 1 ? (
          <div
            className="examples-filter-row"
            role="tablist"
            aria-label={t('examples.scenarioLabel')}
          >
            <span className="examples-filter-label">
              {t('examples.scenarioLabel')}
            </span>
            <button
              type="button"
              className={`filter-pill ${scenarioFilter === 'all' ? 'active' : ''}`}
              onClick={() => setScenarioFilter('all')}
            >
              {t('examples.modeAll')}
              <span className="filter-pill-count">{filtered.length}</span>
            </button>
            {scenarioOptions.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`filter-pill ${scenarioFilter === tag ? 'active' : ''}`}
                onClick={() => setScenarioFilter(tag)}
              >
                {scenarioLabel(t, tag)}
                <span className="filter-pill-count">{scenarioCounts.get(tag) ?? 0}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="tab-empty">{t('examples.emptyNoMatch')}</div>
      ) : (
        filtered.map((skill) => (
          <ExampleCard
            key={skill.id}
            skill={skill}
            html={previews[skill.id]}
            onLoad={() => void loadPreview(skill.id)}
            onUsePrompt={() => onUsePrompt(skill)}
            onOpenPreview={() => openPreview(skill.id)}
          />
        ))
      )}
      {previewSkill ? (
        <PreviewModal
          title={previewSkill.name}
          subtitle={
            localizeSkillPrompt(locale, previewSkill)
            ?? localizeSkillDescription(locale, previewSkill).slice(0, 160)
          }
          views={[
            {
              id: 'preview',
              label: t('examples.previewLabel'),
              html: previews[previewSkill.id],
              deck: previewSkill.mode === 'deck',
            },
          ]}
          exportTitleFor={() => previewSkill.name}
          onClose={() => setPreviewSkillId(null)}
        />
      ) : null}
    </div>
  );
}

function ExampleCard({
  skill,
  html,
  onLoad,
  onUsePrompt,
  onOpenPreview,
}: {
  skill: SkillSummary;
  html: string | null | undefined;
  onLoad: () => void;
  onUsePrompt: () => void;
  onOpenPreview: () => void;
}) {
  const { locale, t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!shareOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!shareRef.current) return;
      if (!shareRef.current.contains(e.target as Node)) setShareOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShareOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [shareOpen]);

  const exportTitle = skill.name;
  const isMobile = skill.platform === 'mobile';
  const isDeck = skill.mode === 'deck';
  const displayPrompt = localizeSkillPrompt(locale, skill);
  const displayDescription = localizeSkillDescription(locale, skill).slice(0, 240);

  return (
    <div
      className="example-card"
      data-testid={`example-card-${skill.id}`}
      onMouseEnter={() => {
        setHovered(true);
        onLoad();
      }}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="example-preview"
        role="button"
        tabIndex={0}
        title={t('common.openPreview')}
        onClick={onOpenPreview}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenPreview();
          }
        }}
      >
        {html ? (
          <>
            <iframe
              title={`${skill.name} ${t('examples.previewLabel').toLowerCase()}`}
              sandbox="allow-scripts"
              srcDoc={buildSrcdoc(html)}
              tabIndex={-1}
            />
            <span className="example-preview-overlay" aria-hidden="true">
              {t('examples.openPreview')}
            </span>
          </>
        ) : (
          <div className="example-preview-placeholder">
            {hovered
              ? t('examples.loadingPreview')
              : t('examples.hoverPreview')}
          </div>
        )}
      </div>
      <div className="example-meta">
        <div className="example-name">{skill.name}</div>
        <div className="example-tags">
          <span className={`example-tag ${isMobile ? 'platform-mobile' : ''} ${isDeck ? 'mode-deck' : ''}`}>
            {tagForSkill(skill, t)}
          </span>
          {skill.scenario && skill.scenario !== 'general' ? (
            <span className="example-tag">
              {scenarioLabel(t, skill.scenario)}
            </span>
          ) : null}
        </div>
        <div className="example-prompt">
          {displayPrompt ? quotePrompt(locale, displayPrompt) : displayDescription}
        </div>
        <div className="example-card-actions">
          <button
            className="primary example-cta"
            data-testid={`example-use-prompt-${skill.id}`}
            onClick={onUsePrompt}
          >
            {t('examples.usePrompt')}
          </button>
          <button
            className="ghost"
            onClick={onOpenPreview}
            title={t('examples.previewModalTitle')}
          >
            {t('examples.openPreview')}
          </button>
          <div className="share-menu" ref={shareRef}>
            <button
              className="ghost"
              aria-haspopup="menu"
              aria-expanded={shareOpen}
              disabled={!html}
              title={
                html
                  ? t('examples.shareTitle')
                  : t('examples.shareLoadFirst')
              }
              onClick={() => setShareOpen((v) => !v)}
            >
              {t('examples.shareMenu')}
            </button>
            {shareOpen && html ? (
              <div className="share-menu-popover" role="menu">
                <button
                  type="button"
                  className="share-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setShareOpen(false);
                    exportAsPdf(html, exportTitle, { deck: isDeck });
                  }}
                >
                  <span className="share-menu-icon">📄</span>
                  <span>
                    {isDeck
                      ? t('examples.exportPdfAllSlides')
                      : t('common.exportPdf')}
                  </span>
                </button>
                {isDeck ? (
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    title={t('examples.exportPptxLocked')}
                    disabled
                  >
                    <span className="share-menu-icon">📊</span>
                    <span>{t('examples.exportPptxLocked')}</span>
                  </button>
                ) : null}
                <div className="share-menu-divider" />
                <button
                  type="button"
                  className="share-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setShareOpen(false);
                    exportAsZip(html, exportTitle);
                  }}
                >
                  <span className="share-menu-icon">🗜</span>
                  <span>{t('common.exportZip')}</span>
                </button>
                <button
                  type="button"
                  className="share-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setShareOpen(false);
                    exportAsHtml(html, exportTitle);
                  }}
                >
                  <span className="share-menu-icon">🌐</span>
                  <span>{t('common.exportHtml')}</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function tagForSkill(skill: SkillSummary, t: TranslateFn): string {
  if (skill.mode === 'deck') return t('examples.tagSlideDeck');
  if (skill.mode === 'template') return t('examples.tagTemplate');
  if (skill.mode === 'design-system') return t('examples.tagDesignSystem');
  if (skill.platform === 'mobile') return t('examples.tagMobilePrototype');
  return t('examples.tagDesktopPrototype');
}
