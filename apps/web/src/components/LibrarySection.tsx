import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useT } from '../i18n';
import { Icon } from './Icon';
import type { AppConfig, InstallInput } from '../types';
import type { SkillSummary, DesignSystemSummary } from '@open-design/contracts';
import {
  fetchSkills,
  fetchDesignSystems,
  fetchSkill,
  fetchDesignSystem,
  installSkill,
  uninstallSkill,
  installDesignSystem,
  uninstallDesignSystem,
} from '../providers/registry';

type Tab = 'skills' | 'design-systems';

interface Props {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}

const MODES = [
  'prototype',
  'deck',
  'template',
  'design-system',
  'image',
  'video',
  'audio',
] as const;

export function LibrarySection({ cfg, setCfg }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('skills');
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [designSystems, setDesignSystems] = useState<DesignSystemSummary[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewBody, setPreviewBody] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Install state
  const [installOpen, setInstallOpen] = useState(false);
  const [installTab, setInstallTab] = useState<'github' | 'local'>('github');
  const [installUrl, setInstallUrl] = useState('');
  const [installPath, setInstallPath] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const reloadData = useCallback(() => {
    fetchSkills().then(setSkills);
    fetchDesignSystems().then(setDesignSystems);
  }, []);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  const categories = useMemo(() => {
    const cats = new Set(designSystems.map((d) => d.category));
    return ['All', ...Array.from(cats).sort()];
  }, [designSystems]);

  const disabledSkills = useMemo(
    () => new Set(cfg.disabledSkills ?? []),
    [cfg.disabledSkills],
  );
  const disabledDS = useMemo(
    () => new Set(cfg.disabledDesignSystems ?? []),
    [cfg.disabledDesignSystems],
  );

  const filteredSkills = useMemo(() => {
    const q = search.toLowerCase();
    return skills.filter((s) => {
      if (modeFilter !== 'all' && s.mode !== modeFilter) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [skills, modeFilter, search]);

  const filteredDS = useMemo(() => {
    const q = search.toLowerCase();
    return designSystems.filter((d) => {
      if (categoryFilter !== 'All' && d.category !== categoryFilter) return false;
      if (q && !d.title.toLowerCase().includes(q) && !d.summary.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [designSystems, categoryFilter, search]);

  const groupedSkills = useMemo(() => {
    const groups = new Map<string, SkillSummary[]>();
    for (const s of filteredSkills) {
      const list = groups.get(s.mode) ?? [];
      list.push(s);
      groups.set(s.mode, list);
    }
    return groups;
  }, [filteredSkills]);

  const groupedDS = useMemo(() => {
    const groups = new Map<string, DesignSystemSummary[]>();
    for (const d of filteredDS) {
      const list = groups.get(d.category) ?? [];
      list.push(d);
      groups.set(d.category, list);
    }
    return groups;
  }, [filteredDS]);

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
        const detail =
          tab === 'skills'
            ? await fetchSkill(id)
            : await fetchDesignSystem(id);
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
    [previewId, tab],
  );

  function toggleSkillDisabled(id: string, disabled: boolean) {
    setCfg((c) => {
      const set = new Set(c.disabledSkills ?? []);
      if (disabled) set.add(id);
      else set.delete(id);
      return { ...c, disabledSkills: [...set] };
    });
  }

  function toggleDSDisabled(id: string, disabled: boolean) {
    setCfg((c) => {
      const set = new Set(c.disabledDesignSystems ?? []);
      if (disabled) set.add(id);
      else set.delete(id);
      return { ...c, disabledDesignSystems: [...set] };
    });
  }

  async function handleInstall() {
    setInstallError(null);
    setInstalling(true);
    const input: InstallInput =
      installTab === 'github'
        ? { source: 'github', url: installUrl.trim() }
        : { source: 'local', path: installPath.trim() };

    const result =
      tab === 'skills'
        ? await installSkill(input)
        : await installDesignSystem(input);

    setInstalling(false);
    if ('error' in result) {
      setInstallError(result.error);
      return;
    }
    setInstallOpen(false);
    setInstallUrl('');
    setInstallPath('');
    setInstallError(null);
    reloadData();
  }

  async function handleUninstallSkill(id: string) {
    const result = await uninstallSkill(id);
    if ('error' in result) return;
    reloadData();
  }

  async function handleUninstallDS(id: string) {
    const result = await uninstallDesignSystem(id);
    if ('error' in result) return;
    reloadData();
  }

  return (
    <section className="settings-section">
      <div className="section-head">
        <div>
          <h3>{t('settings.library')}</h3>
          <p className="hint">{t('settings.libraryHint')}</p>
        </div>
      </div>

      <div className="seg-control" role="tablist">
        <button
          type="button"
          role="tab"
          className={`seg-btn${tab === 'skills' ? ' active' : ''}`}
          onClick={() => {
            setTab('skills');
            setModeFilter('all');
            setCategoryFilter('All');
            setSearch('');
            setPreviewId(null);
          }}
        >
          <span className="seg-title">
            {t('settings.librarySkills')}
            <span className="seg-meta">{skills.length}</span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          className={`seg-btn${tab === 'design-systems' ? ' active' : ''}`}
          onClick={() => {
            setTab('design-systems');
            setModeFilter('all');
            setCategoryFilter('All');
            setSearch('');
            setPreviewId(null);
          }}
        >
          <span className="seg-title">
            {t('settings.libraryDesignSystems')}
            <span className="seg-meta">{designSystems.length}</span>
          </span>
        </button>
      </div>

      <div className="library-toolbar">
        <div className="library-toolbar-row">
          <input
            type="search"
            className="library-search"
            placeholder={t('settings.librarySearch')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="library-install-btn"
            onClick={() => setInstallOpen((v) => !v)}
          >
            <Icon name="plus" size={14} />
            {t('settings.libraryInstall')}
          </button>
        </div>

        {installOpen && (
          <div className="library-install-form">
            <div className="seg-control" role="tablist">
              <button
                type="button"
                role="tab"
                className={`seg-btn${installTab === 'github' ? ' active' : ''}`}
                onClick={() => setInstallTab('github')}
              >
                {t('settings.libraryInstallGithub')}
              </button>
              <button
                type="button"
                role="tab"
                className={`seg-btn${installTab === 'local' ? ' active' : ''}`}
                onClick={() => setInstallTab('local')}
              >
                {t('settings.libraryInstallLocal')}
              </button>
            </div>
            <div className="library-install-row">
              {installTab === 'github' ? (
                <input
                  type="url"
                  className="library-search"
                  placeholder={t('settings.libraryInstallUrl')}
                  value={installUrl}
                  onChange={(e) => setInstallUrl(e.target.value)}
                />
              ) : (
                <input
                  type="text"
                  className="library-search"
                  placeholder={t('settings.libraryInstallPath')}
                  value={installPath}
                  onChange={(e) => setInstallPath(e.target.value)}
                />
              )}
              <button
                type="button"
                className="library-install-submit"
                disabled={installing}
                onClick={handleInstall}
              >
                {installing ? t('settings.libraryLoading') : t('settings.libraryInstallButton')}
              </button>
            </div>
            {installError && (
              <p className="library-install-error">{installError}</p>
            )}
          </div>
        )}

        {tab === 'skills' ? (
          <div className="library-filters">
            <button
              type="button"
              className={`filter-pill${modeFilter === 'all' ? ' active' : ''}`}
              onClick={() => setModeFilter('all')}
            >
              {t('settings.libraryAll')}
            </button>
            {MODES.map((mode) => {
              const count = skills.filter((s) => s.mode === mode).length;
              if (count === 0) return null;
              return (
                <button
                  key={mode}
                  type="button"
                  className={`filter-pill${modeFilter === mode ? ' active' : ''}`}
                  onClick={() => setModeFilter(mode)}
                >
                  {mode}
                  <span className="filter-pill-count">{count}</span>
                </button>
              );
            })}
          </div>
        ) : (
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
        )}
      </div>

      <div className="library-content">
        {tab === 'skills' ? (
          filteredSkills.length === 0 ? (
            <p className="library-empty">{t('settings.libraryNoResults')}</p>
          ) : (
            MODES.filter((m) => groupedSkills.has(m)).map((mode) => (
              <div key={mode} className="library-group">
                <h4 className="library-group-title">
                  {mode}{' '}
                  <span className="library-group-count">{groupedSkills.get(mode)!.length}</span>
                </h4>
                {groupedSkills.get(mode)!.map((skill) => (
                  <div
                    key={skill.id}
                    className={`library-card${disabledSkills.has(skill.id) ? ' disabled' : ''}`}
                  >
                    <div className="library-card-info">
                      <div className="library-card-title-row">
                        <span className="library-card-name">{skill.name}</span>
                        <span className="library-card-badge">{skill.previewType}</span>
                        <span
                          className={`library-source-badge${skill.source === 'installed' ? ' installed' : ''}`}
                        >
                          {skill.source === 'installed'
                            ? t('settings.libraryInstalled')
                            : t('settings.libraryBuiltIn')}
                        </span>
                      </div>
                      <div className="library-card-desc">{skill.description}</div>
                    </div>
                    <button
                      type="button"
                      className="library-card-expand"
                      onClick={() => openPreview(skill.id)}
                      title={t('settings.libraryPreview')}
                    >
                      <Icon
                        name={previewId === skill.id ? 'close' : 'chevron-right'}
                        size={14}
                      />
                    </button>
                    {skill.source === 'installed' && (
                      <button
                        type="button"
                        className="library-uninstall-btn"
                        title={t('settings.libraryUninstall')}
                        onClick={() => handleUninstallSkill(skill.id)}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                    <label className="toggle-switch" title={t('settings.libraryToggleLabel')}>
                      <input
                        type="checkbox"
                        checked={!disabledSkills.has(skill.id)}
                        onChange={(e) => toggleSkillDisabled(skill.id, !e.target.checked)}
                      />
                      <span className="toggle-slider" />
                    </label>
                    {previewId === skill.id && (
                      <div className="library-preview">
                        {previewLoading ? (
                          <p>{t('settings.libraryLoading')}</p>
                        ) : previewBody ? (
                          <pre className="library-preview-body">{previewBody}</pre>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )
        ) : filteredDS.length === 0 ? (
          <p className="library-empty">{t('settings.libraryNoResults')}</p>
        ) : (
          <>
            {Array.from(groupedDS.entries()).map(([category, items]) => (
              <div key={category} className="library-group">
                <h4 className="library-group-title">
                  {category} <span className="library-group-count">{items.length}</span>
                </h4>
                <div className="ds-grid">
                  {items.map((ds) => (
                    <div
                      key={ds.id}
                      className={`library-ds-card${disabledDS.has(ds.id) ? ' disabled' : ''}`}
                    >
                      <div className="library-ds-card-content" onClick={() => openPreview(ds.id)}>
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
                        <div className="library-ds-title-row">
                          <span className="library-ds-title">{ds.title}</span>
                          <span
                            className={`library-source-badge${ds.source === 'installed' ? ' installed' : ''}`}
                          >
                            {ds.source === 'installed'
                              ? t('settings.libraryInstalled')
                              : t('settings.libraryBuiltIn')}
                          </span>
                        </div>
                        <div className="library-ds-summary">{ds.summary}</div>
                      </div>
                      <div className="library-ds-card-actions">
                        {ds.source === 'installed' && (
                          <button
                            type="button"
                            className="library-uninstall-btn"
                            title={t('settings.libraryUninstall')}
                            onClick={() => handleUninstallDS(ds.id)}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        )}
                        <label className="toggle-switch toggle-switch-sm" title={t('settings.libraryToggleLabel')}>
                          <input
                            type="checkbox"
                            checked={!disabledDS.has(ds.id)}
                            onChange={(e) => toggleDSDisabled(ds.id, !e.target.checked)}
                          />
                          <span className="toggle-slider" />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {previewId && filteredDS.some((d) => d.id === previewId) && (
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
