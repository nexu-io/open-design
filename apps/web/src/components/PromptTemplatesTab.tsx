import { useMemo, useState } from 'react';
import { useI18n, useT } from '../i18n';
import {
  localizePromptTemplateCategory,
  localizePromptTemplateSummary,
} from '../i18n/content';
import type { PromptTemplateSource, PromptTemplateSummary } from '../types';
import { Icon } from './Icon';

// Stable, human-readable provider name used by the source filter and the
// thumbnail badge. Anchored on `source.repo` (a small enumerated set) rather
// than `source.author` (dozens of curators). Known upstream repos get a
// brand-aware label; everything else falls back to the repo's last segment.
const PROVIDER_LABELS: Record<string, string> = {
  'heygen-com/hyperframes': 'HyperFrames',
  'YouMind-OpenLab/awesome-seedance-2-prompts': 'Seedance 2',
  'YouMind-OpenLab/awesome-gpt-image-2': 'GPT Image 2',
  'nexu-io/open-design': 'Open Design',
};
function providerLabel(source: PromptTemplateSource): string {
  const known = PROVIDER_LABELS[source.repo];
  if (known) return known;
  const repo = source.repo.split('/').pop() ?? source.repo;
  return repo;
}

interface Props {
  surface: 'image' | 'video';
  templates: PromptTemplateSummary[];
  onPreview: (tpl: PromptTemplateSummary) => void;
}

// Curated prompt-template gallery — one tab per surface (image / video).
// Layout mirrors the Examples tab: a category filter row + a responsive
// card grid that lazy-loads remote thumbnails (the upstream README hosts
// images on CMS / Cloudflare Stream, both public). Each card opens a
// preview modal with the full prompt body and attribution.
export function PromptTemplatesTab({ surface, templates, onPreview }: Props) {
  const { locale, t } = useI18n();
  const [filter, setFilter] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [source, setSource] = useState<string>('All');

  const surfaceScoped = useMemo(
    () => templates.filter((tpl) => tpl.surface === surface),
    [templates, surface],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const tpl of surfaceScoped) set.add(tpl.category || 'General');
    return ['All', ...Array.from(set).sort()];
  }, [surfaceScoped]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const tpl of surfaceScoped) {
      const label = providerLabel(tpl.source);
      if (label) set.add(label);
    }
    return ['All', ...Array.from(set).sort()];
  }, [surfaceScoped]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return surfaceScoped.filter((tpl) => {
      if (category !== 'All' && (tpl.category || 'General') !== category) {
        return false;
      }
      if (source !== 'All' && providerLabel(tpl.source) !== source) {
        return false;
      }
      if (!q) return true;
      const localized = localizePromptTemplateSummary(locale, tpl);
      return (
        tpl.title.toLowerCase().includes(q)
        || tpl.summary.toLowerCase().includes(q)
        || (tpl.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
        || localized.title.toLowerCase().includes(q)
        || localized.summary.toLowerCase().includes(q)
        || localized.category.toLowerCase().includes(q)
        || (localized.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
        || providerLabel(tpl.source).toLowerCase().includes(q)
      );
    });
  }, [surfaceScoped, filter, category, source, locale]);

  if (surfaceScoped.length === 0) {
    return (
      <div className="tab-empty">
        {surface === 'image'
          ? t('promptTemplates.emptyImage')
          : t('promptTemplates.emptyVideo')}
      </div>
    );
  }

  return (
    <div className="tab-panel prompt-templates-panel">
      <div className="tab-panel-toolbar">
        <input
          placeholder={t('promptTemplates.searchPlaceholder')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c === 'All' ? t('common.all') : localizePromptTemplateCategory(locale, c)}
            </option>
          ))}
        </select>
        {sources.length > 2 ? (
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aria-label={t('promptTemplates.sourceFilterAria')}
          >
            {sources.map((s) => (
              <option key={s} value={s}>
                {s === 'All' ? t('promptTemplates.allSources') : s}
              </option>
            ))}
          </select>
        ) : null}
        <span className="prompt-templates-count">
          {t('promptTemplates.countLabel', { n: filtered.length })}
        </span>
      </div>
      {filtered.length === 0 ? (
        <div className="tab-empty">{t('promptTemplates.emptyNoMatch')}</div>
      ) : (
        <div className="prompt-templates-grid">
          {filtered.map((tpl) => {
            const localized = localizePromptTemplateSummary(locale, tpl);
            return (
              <PromptTemplateCard
                key={tpl.id}
                tpl={localized}
                onPreview={() => onPreview(localized)}
              />
            );
          })}
        </div>
      )}
      <div className="prompt-templates-footer">
        {t('promptTemplates.attributionFooter')}
      </div>
    </div>
  );
}

function PromptTemplateCard({
  tpl,
  onPreview,
}: {
  tpl: PromptTemplateSummary;
  onPreview: () => void;
}) {
  const t = useT();
  const provider = providerLabel(tpl.source);
  const isHyperFrames = tpl.source.repo === 'heygen-com/hyperframes';
  const sourceLabel = tpl.source.author
    ? `${tpl.source.author} · ${tpl.source.repo.split('/').pop()}`
    : tpl.source.repo.split('/').pop();
  return (
    <button
      type="button"
      className="prompt-template-card"
      onClick={onPreview}
      title={t('promptTemplates.openPreviewTitle')}
    >
      <span className="prompt-template-thumb">
        {tpl.previewImageUrl ? (
          <img src={tpl.previewImageUrl} alt="" loading="lazy" draggable={false} />
        ) : tpl.surface === 'video' ? (
          <span className="prompt-template-thumb-fallback" aria-hidden>
            <Icon name="play" size={28} />
          </span>
        ) : (
          <span className="prompt-template-thumb-fallback" aria-hidden>
            <Icon name="image" size={28} />
          </span>
        )}
        {provider ? (
          <span
            className={
              `prompt-template-thumb-provider${isHyperFrames ? ' is-hyperframes' : ''}`
            }
          >
            {provider}
          </span>
        ) : null}
        {tpl.surface === 'video' && tpl.previewVideoUrl ? (
          <span className="prompt-template-thumb-play" aria-hidden>
            ▶
          </span>
        ) : null}
      </span>
      <span className="prompt-template-meta">
        <span className="prompt-template-title">{tpl.title}</span>
        <span className="prompt-template-summary">{tpl.summary}</span>
        <span className="prompt-template-tags">
          <span className="prompt-template-category">{tpl.category}</span>
          {(tpl.tags ?? []).slice(0, 3).map((tag) => (
            <span key={tag} className="prompt-template-tag">
              {tag}
            </span>
          ))}
        </span>
        <span className="prompt-template-source">
          {t('promptTemplates.sourcePrefix')} {sourceLabel}
        </span>
      </span>
    </button>
  );
}
