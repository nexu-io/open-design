// Visual byline strip — author avatar, author name, trust badge,
// version chip, optional pinned ref. Used at the top of every
// detail variant so users immediately see who shipped the plugin
// and how trustworthy it is, mirroring the way curated content
// platforms surface authorship.
//
// Variants:
//   - `default`   → full strip with avatar + name + trust + version
//   - `compact`   → tight chip-style row used inside dark gradient
//                   headers where the surrounding chrome already
//                   carries the title.

import { useState } from 'react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { Icon } from '../Icon';
import {
  authorInitials,
  derivePluginSourceLinks,
} from '../../runtime/plugin-source';

interface Props {
  record: InstalledPluginRecord;
  variant?: 'default' | 'compact';
}

export function PluginByline({ record, variant = 'default' }: Props) {
  const links = derivePluginSourceLinks(record);
  const trust = record.trust;
  const version = record.version;

  return (
    <div
      className={`plugin-byline plugin-byline--${variant}`}
      data-testid={`plugin-byline-${record.id}`}
    >
      <Avatar
        name={links.authorName}
        avatarUrl={links.authorAvatarUrl}
      />
      <div className="plugin-byline__meta">
        <div className="plugin-byline__primary">
          {links.authorName ? (
            <>
              <span className="plugin-byline__by">by</span>
              <span className="plugin-byline__name">{links.authorName}</span>
            </>
          ) : (
            <span className="plugin-byline__name">{links.sourceLabel}</span>
          )}
          <span className={`plugin-byline__trust trust-${trust}`}>{trust}</span>
          <span className="plugin-byline__version">v{version}</span>
        </div>
        {variant === 'default' ? (
          <div className="plugin-byline__secondary">
            {links.authorProfileUrl ? (
              <a
                className="plugin-byline__link"
                href={links.authorProfileUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="github" size={11} />
                <span>{githubProfileLabel(links.authorProfileUrl)}</span>
              </a>
            ) : null}
            {links.homepageUrl ? (
              <a
                className="plugin-byline__link"
                href={links.homepageUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="external-link" size={11} />
                <span>Homepage</span>
              </a>
            ) : null}
            {links.contributeUrl ? (
              <a
                className="plugin-byline__link"
                href={links.contributeUrl}
                target="_blank"
                rel="noreferrer"
                title={
                  links.contributeOnGithub
                    ? 'Open an issue on GitHub'
                    : 'Open the contribute page'
                }
              >
                <Icon
                  name={links.contributeOnGithub ? 'github' : 'external-link'}
                  size={11}
                />
                <span>Contribute</span>
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Avatar({
  name,
  avatarUrl,
}: {
  name: string | null;
  avatarUrl: string | null;
}) {
  const [broken, setBroken] = useState(false);
  if (avatarUrl && !broken) {
    return (
      <img
        className="plugin-byline__avatar"
        src={avatarUrl}
        alt={name ? `${name} avatar` : 'Author avatar'}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span
      className="plugin-byline__avatar plugin-byline__avatar--fallback"
      aria-hidden
    >
      {authorInitials(name)}
    </span>
  );
}

function githubProfileLabel(url: string): string {
  try {
    const parsed = new URL(url);
    if (/^(?:www\.)?github\.com$/.test(parsed.hostname)) {
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length >= 2) return `${segments[0]}/${segments[1]!.replace(/\.git$/, '')}`;
      if (segments.length === 1) return `@${segments[0]}`;
    }
    return parsed.hostname + parsed.pathname.replace(/\/$/, '');
  } catch {
    return url;
  }
}
