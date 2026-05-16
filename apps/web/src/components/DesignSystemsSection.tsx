import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useT } from '../i18n';
import type { AppConfig } from '../types';
import type { DesignSystemSummary } from '@open-design/contracts';
import {
  fetchDesignSystem,
  fetchDesignSystems,
} from '../providers/registry';

// Sibling Settings section that hosts the design-systems registry.
// Lifted out of the previous LibrarySection so each surface (functional
// skills vs. design systems) gets its own dedicated nav entry instead of
// sharing a sub-tab toggle. See specs/current/skills-and-design-templates.md.

interface Props {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}

export function DesignSystemsSection({ cfg, setCfg }: Props) {
  const t = useT();
  const [designSystems, setDesignSystems] = useState<DesignSystemSummary[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewBody, setPreviewBody] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    fetchDesignSystems().then(setDesignSystems);
  }, []);

  const disabledDS = useMemo(
    () => new Set(cfg.disabledDesignSystems ?? []),
    [cfg.disabledDesignSystems],
  );

  const categories = useMemo(() => {
    const cats = new Set(designSystems.map((d) => d.category));
    return ['All', ...Array.from(cats).sort()];
  }, [designSystems]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return designSystems.filter((d) => {
      if (categoryFilter !== 'All' && d.category !== categoryFilter) return false;
      if (
        q &&
        !d.title.toLowerCase().includes(q) &&
        !d.summary.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [designSystems, categoryFilter, search]);

  const grouped = useMemo(() => {
    const groups = new Map<string, DesignSystemSummary[]>();
    for (const d of filtered) {
      const list = groups.get(d.category) ?? [];
      list.push(d);
      groups.set(d.category, list);
    }
    return groups;
  }, [filtered]);

  const openPreview = useCallback(
    async (id: string) => {
      if (previewId === id) {
        setPreviewId(null);
        setPreviewBody(null);
        return;
      }
      setPreviewId(id);
      setPreviewBody(null);
      setPreviewLoading(true);
      try {
        const detail = await fetchDesignSystem(id);
        setPreviewId((cur) => {
          if (cur === id) setPreviewBody(detail?.body ?? null);
          return cur;
        });
      } catch {
        setPreviewId((cur) => {
          if (cur === id) setPreviewBody(null);
          return cur;
        });
      } finally {
        setPreviewId((cur) => {
          if (cur === id) setPreviewLoading(false);
          return cur;
        });
      }
    },
    [previewId],
  );

  function toggleDSDisabled(id: string, enabled: boolean) {
    setCfg((c) => {
      const set = new Set(c.disabledDesignSystems ?? []);
      if (enabled) set.delete(id);
      else set.add(id);
      return { ...c, disabledDesignSystems: [...set] };
    });
  }

  return (
    <section className="settings-section settings-design-systems">
      <div className="library-toolbar">
        <input
          type="search"
          className="library-search"
          placeholder={t('settings.librarySearch')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="library-filters">
          {categories.map((cat) => {
            const count =
              cat === 'All'
                ? designSystems.length
                : designSystems.filter((d) => d.category === cat).length;
            return (
              <button
                key={cat}
                type="button"
                className={`filter-pill${categoryFilter === cat ? ' active' : ''}`}
                onClick={() => setCategoryFilter(cat)}
              >
                {cat}
                <span className="filter-pill-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="library-content">
        {filtered.length === 0 ? (
          <p className="library-empty">{t('settings.libraryNoResults')}</p>
        ) : (
          <>
            {Array.from(grouped.entries()).map(([category, items]) => (
              <div key={category} className="library-group">
                <h4 className="library-group-title">
                  {category}{' '}
                  <span className="library-group-count">{items.length}</span>
                </h4>
                <div className="ds-grid">
                  {items.map((ds) => (
                    <div
                      key={ds.id}
                      className={`library-ds-card${
                        disabledDS.has(ds.id) ? ' disabled' : ''
                      }`}
                    >
                      <div
                        className="library-ds-card-content"
                        onClick={() => openPreview(ds.id)}
                      >
                        {ds.swatches && ds.swatches.length > 0 && (
                          <div className="library-ds-swatches">
                            {ds.swatches.slice(0, 4).map((c, i) => (
                              <span
                                key={i}
                                className="library-ds-swatch"
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        )}
                        <div className="library-ds-title">{ds.title}</div>
                        <div className="library-ds-summary">{ds.summary}</div>
                      </div>
                      <label
                        className="toggle-switch toggle-switch-sm"
                        title={t('settings.libraryToggleLabel')}
                      >
                        <input
                          type="checkbox"
                          checked={!disabledDS.has(ds.id)}
                          onChange={(e) =>
                            toggleDSDisabled(ds.id, e.target.checked)
                          }
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {previewId && filtered.some((d) => d.id === previewId) && (
              <div className="library-preview">
                {previewLoading ? (
                  <p>{t('settings.libraryLoading')}</p>
                ) : previewBody ? (
                  <pre className="library-preview-body">{previewBody}</pre>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
