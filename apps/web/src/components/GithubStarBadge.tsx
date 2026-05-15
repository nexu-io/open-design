// Sticky 'Star · <count>' pill in the entry top bar.
//
// Mirrors the marketing landing-page header: fetches the live star
// count via `useGithubStars` (shared module-scoped cache) and
// renders a small CTA that opens the GitHub repo in a new tab. The
// hook handles offline / rate-limited failures so the pill simply
// falls back to 'Star' with a placeholder count.

import { Icon } from './Icon';
import { useT } from '../i18n';
import { formatStars, GITHUB_REPO_URL, useGithubStars } from './useGithubStars';

export function GithubStarBadge() {
  const t = useT();
  const count = useGithubStars();

  return (
    <a
      className="entry-star-badge"
      href={GITHUB_REPO_URL}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={t('entry.githubStarAria')}
      title={t('entry.githubStarTitle')}
      data-testid="entry-star-badge"
    >
      <Icon name="github" size={13} className="entry-star-badge__icon" />
      <span className="entry-star-badge__label">{t('entry.githubStarLabel')}</span>
      <span className="entry-star-badge__sep" aria-hidden>
        ·
      </span>
      <span className="entry-star-badge__count" data-loading={count === null}>
        {count === null ? '—' : formatStars(count)}
      </span>
    </a>
  );
}
