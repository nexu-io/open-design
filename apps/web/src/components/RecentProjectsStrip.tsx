// Horizontal "Recent projects" rail for the Home view.
//
// Mirrors the strip Lovart shows under its hero: a small set of
// recent project cards with a "View all" link that switches to the
// full Projects view. We keep the data shape narrow (Project[] +
// onOpen / onViewAll) so the strip can be reused later by other
// surfaces (e.g. an in-project quick-switcher pane).

import { useT } from '../i18n';
import type { Project } from '../types';
import { Icon } from './Icon';

interface Props {
  projects: Project[];
  loading?: boolean;
  onOpen: (id: string) => void;
  onViewAll: () => void;
  limit?: number;
}

export function RecentProjectsStrip({
  projects,
  loading,
  onOpen,
  onViewAll,
  limit = 6,
}: Props) {
  const t = useT();
  const recent = [...projects]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);

  return (
    <section className="recent-projects" data-testid="recent-projects-strip">
      <header className="recent-projects__head">
        <h2 className="recent-projects__title">Recent projects</h2>
        <button
          type="button"
          className="recent-projects__view-all"
          onClick={onViewAll}
          data-testid="recent-projects-view-all"
        >
          <span>View all</span>
          <Icon name="chevron-right" size={12} />
        </button>
      </header>
      {loading && recent.length === 0 ? (
        <div className="recent-projects__empty">{t('common.loading')}</div>
      ) : recent.length === 0 ? (
        <div className="recent-projects__empty">No projects yet — type a prompt to start one.</div>
      ) : (
        <div className="recent-projects__row" role="list">
          {recent.map((project) => (
            <button
              key={project.id}
              type="button"
              role="listitem"
              className="recent-projects__card"
              onClick={() => onOpen(project.id)}
              title={project.name}
              data-project-id={project.id}
            >
              <div className="recent-projects__card-thumb" aria-hidden>
                <span className="recent-projects__card-glyph">
                  {projectGlyph(project.name)}
                </span>
              </div>
              <div className="recent-projects__card-meta">
                <div className="recent-projects__card-name">{project.name}</div>
                <div className="recent-projects__card-time">
                  {relativeTime(project.updatedAt, t)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function projectGlyph(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '·';
  const codePoint = trimmed.codePointAt(0);
  if (!codePoint) return '·';
  return String.fromCodePoint(codePoint).toUpperCase();
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
