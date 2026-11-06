// Sticky 'Star · <count>' pill in the entry top bar.
//
// Mirrors the marketing landing-page header: fetches the live star
// count via `useGithubStars` (shared module-scoped cache) and
// renders a small CTA that opens the GitHub repo in a new tab. The
// hook handles offline / rate-limited failures so the pill simply
// falls back to 'Star' with a placeholder count.

import { Icon } from './Icon';
import { useT } from '../i18n';
import {
  formatStars,
  GITHUB_REPO_URL,
  GITHUB_STARS_FALLBACK_LABEL,
  useGithubStars,
} from './useGithubStars';

export function GithubStarBadge() {
  const t = useT();
  const count = useGithubStars();
  const countLabel = count == null ? GITHUB_STARS_FALLBACK_LABEL : formatStars(count);

  return (
    <a
      className="entry-star-badge od-tooltip"
      href={GITHUB_REPO_URL}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={t('entry.githubStarAria')}
      data-tooltip={t('entry.githubStarTitle')}
      data-tooltip-placement="bottom"
      data-testid="entry-star-badge"
    >
      <Icon name="github-filled" size={16} className="entry-star-badge__icon" />
      <span className="entry-star-badge__label">{t('entry.githubStarLabel')}</span>
      <span className="entry-star-badge__sep" aria-hidden>
        ·
      </span>
      <span className="entry-star-badge__count">
        {countLabel}
      </span>
    </a>
  );
}
