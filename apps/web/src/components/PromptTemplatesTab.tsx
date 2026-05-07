import { useMemo, useState } from 'react';
import { useI18n, useT } from '../i18n';
import {
  localizePromptTemplateCategory,
  localizePromptTemplateSummary,
} from '../i18n/content';
import type { PromptTemplateSummary } from '../types';
import { Icon } from './Icon';

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

  const surfaceScoped = useMemo(
    () => templates.filter((tpl) => tpl.surface === surface),
    [templates, surface],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const tpl of surfaceScoped) set.add(tpl.category || 'General');
    return ['All', ...Array.from(set).sort()];
  }, [surfaceScoped]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return surfaceScoped.filter((tpl) => {
      if (category !== 'All' && (tpl.category || 'General') !== category) {
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
      );
    });
  }, [surfaceScoped, filter, category, locale]);

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
