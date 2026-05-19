// Horizontal "Recent projects" rail for the Home view.
//
// Mirrors the strip Lovart shows under its hero: a small set of
// recent project cards with a "View all" link that switches to the
// full Projects view. We keep the data shape narrow (Project[] +
// onOpen / onViewAll) so the strip can be reused later by other
// surfaces (e.g. an in-project quick-switcher pane).

import type { Project } from '../types';
import { Icon } from './Icon';
import { useT } from '../i18n';

interface Props {
  projects: Project[];
  /** Retained for call-site compatibility; the strip skips rendering
   *  while the list is loading so we never need a loading state. */
  loading?: boolean;
  onOpen: (id: string) => void;
  onViewAll: () => void;
  limit?: number;
}

export function RecentProjectsStrip({
  projects,
  onOpen,
  onViewAll,
  limit = 6,
}: Props) {
  const t = useT();
  const recent = [...projects]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);

  // First-run home shouldn't reserve space for an empty "Recent
  // projects" rail — the dashed empty box just adds visual noise
  // above the plugin gallery. We also skip rendering during the
  // load window so the section doesn't pop in and then collapse;
  // the prompt hero is enough chrome on its own.
  if (recent.length === 0) {
    return null;
  }

  return (
    <section className="recent-projects" data-testid="recent-projects-strip">
      <header className="recent-projects__head">
        <h2 className="recent-projects__title">{t('recentProjects.title')}</h2>
        <button
          type="button"
          className="recent-projects__view-all"
          onClick={onViewAll}
          data-testid="recent-projects-view-all"
        >
          <span>{t('recentProjects.viewAll')}</span>
          <Icon name="chevron-right" size={12} />
        </button>
      </header>
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
