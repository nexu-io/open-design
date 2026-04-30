import { useMemo, useState } from 'react';
import { useT } from '../i18n';
import type { DesignSystemSummary, Project, SkillSummary } from '../types';
import { Icon } from './Icon';

type SubTab = 'recent' | 'yours';

interface Props {
  projects: Project[];
  skills: SkillSummary[];
  designSystems: DesignSystemSummary[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export function DesignsTab({ projects, skills, designSystems, onOpen, onDelete }: Props) {
  const t = useT();
  const [filter, setFilter] = useState('');
  const [sub, setSub] = useState<SubTab>('recent');

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = projects;
    if (sub === 'recent') {
      list = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    }
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, filter, sub]);

  const skillName = (id: string | null) => skills.find((s) => s.id === id)?.name ?? '';
  const dsName = (id: string | null) => designSystems.find((d) => d.id === id)?.title ?? '';

  return (
    <div className="tab-panel">
      <div className="tab-panel-toolbar">
        <div className="toolbar-left">
          <div
            className="subtab-pill"
            role="tablist"
            aria-label={t('designs.filterAria')}
          >
            <button
              role="tab"
              aria-selected={sub === 'recent'}
              className={sub === 'recent' ? 'active' : ''}
              onClick={() => setSub('recent')}
            >
              {t('designs.subRecent')}
            </button>
            <button
              role="tab"
              aria-selected={sub === 'yours'}
              className={sub === 'yours' ? 'active' : ''}
              onClick={() => setSub('yours')}
            >
              {t('designs.subYours')}
            </button>
          </div>
        </div>
        <div className="toolbar-search">
          <span className="search-icon" aria-hidden>
            <Icon name="search" size={13} />
          </span>
          <input
            placeholder={t('designs.searchPlaceholder')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="tab-empty">
          {projects.length === 0
            ? t('designs.emptyNoProjects')
            : t('designs.emptyNoMatch')}
        </div>
      ) : (
        <div className="design-grid">
          {filtered.map((p) => {
            const skill = skillName(p.skillId);
            const ds = dsName(p.designSystemId);
            return (
              <div
                key={p.id}
                className="design-card"
                role="button"
                tabIndex={0}
                onClick={() => onOpen(p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onOpen(p.id);
                }}
              >
                <button
                  className="design-card-close"
                  title={t('designs.deleteTitle')}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(t('designs.deleteConfirm', { name: p.name }))) {
                      onDelete(p.id);
                    }
                  }}
                >
                  ×
                </button>
                <div className="design-card-thumb" aria-hidden />
                <div className="design-card-meta-block">
                  <div className="design-card-name" title={p.name}>{p.name}</div>
                  <div className="design-card-meta">
                    {ds ? (
                      <span className="ds">{ds}</span>
                    ) : (
                      <span>{t('designs.cardFreeform')}</span>
                    )}
                    {skill ? ` · ${skill}` : ''}
                    {' · '}
                    {relativeTime(p.updatedAt, t)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function relativeTime(ts: number, t: ReturnType<typeof useT>): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return t('common.justNow');
  if (diff < hr) return t('common.minutesAgo', { n: Math.floor(diff / min) });
  if (diff < day) return t('common.hoursAgo', { n: Math.floor(diff / hr) });
  if (diff < 7 * day) return t('common.daysAgo', { n: Math.floor(diff / day) });
  return new Date(ts).toLocaleDateString();
}
