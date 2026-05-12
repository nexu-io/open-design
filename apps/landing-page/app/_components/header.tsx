/*
 * Sticky Header — static markup rendered at build time. Headroom-style
 * hide/show and the live GitHub star count are attached by the tiny inline
 * script in `app/pages/index.astro`, so this marketing page ships no React
 * runtime to the browser.
 *
 * The nav links go to internal multi-page routes (`/skills/`, `/systems/`,
 * `/templates/`, `/craft/`) so Google sees a real site hierarchy. Numbers
 * reflect the live counts of the canonical Markdown bundles in the repo
 * root and are kept in sync with `getCatalogCounts()` at build time.
 */

const REPO = 'https://github.com/nexu-io/open-design';
const REPO_RELEASES = `${REPO}/releases`;

const ext = {
  target: '_blank',
  rel: 'noreferrer noopener',
} as const;

export interface HeaderProps {
  /** Nav highlight target. `'home'` is the default for `/`. */
  active?: 'home' | 'skills' | 'systems' | 'templates' | 'craft';
  /**
   * Live counts from the Markdown catalogs. Required so we can never
   * silently render stale fallback numbers when a caller forgets to
   * thread `getCatalogCounts()` through. Header only consumes these
   * four scalar fields; the homepage passes the wider `CatalogCounts`
   * value (with `byMode` / `byPlatform`) by structural subtyping.
   */
  counts: {
    skills: number;
    systems: number;
    templates: number;
    craft: number;
  };
  /** Brand link target — `#top` on the homepage, `/` on sub-pages. */
  brandHref?: string;
}

export function Header({
  active = 'home',
  counts,
  brandHref = '#top',
}: HeaderProps) {
  const linkClass = (key: NonNullable<HeaderProps['active']>) =>
    active === key ? 'is-active' : undefined;

  return (
    <header className='nav' data-od-id='nav' data-nav-headroom>
      <div className='container nav-inner'>
        <a href={brandHref} className='brand'>
          <span className='brand-mark'>Ø</span>
          <span>Open Design</span>
          <span className='brand-meta'>
            <b>Studio Nº 01</b>Berlin / Open / Earth
          </span>
        </a>
        <nav>
          <ul className='nav-links'>
            <li>
              <a href='/skills/' className={linkClass('skills')}>
                Skills<span className='num'>{counts.skills}</span>
              </a>
            </li>
            <li>
              <a href='/systems/' className={linkClass('systems')}>
                Systems<span className='num'>{counts.systems}</span>
              </a>
            </li>
            <li>
              <a href='/templates/' className={linkClass('templates')}>
                Templates<span className='num'>{counts.templates}</span>
              </a>
            </li>
            <li>
              <a href='/craft/' className={linkClass('craft')}>
                Craft<span className='num'>{counts.craft}</span>
              </a>
            </li>
            <li>
              <a href={brandHref === '#top' ? '#contact' : '/#contact'}>
                Contact
              </a>
            </li>
          </ul>
        </nav>
        <div className='nav-side'>
          <a
            className='nav-cta ghost'
            href={REPO_RELEASES}
            aria-label='Download Open Design desktop'
            title='Download the desktop app'
            {...ext}
          >
            Download
          </a>
          <a
            className='nav-cta'
            href={REPO}
            aria-label='Star Open Design on GitHub'
            title='Click to star us on GitHub'
            {...ext}
          >
            Star · <span data-github-stars>0</span>
          </a>
          <span className='status-dot' aria-hidden='true' />
        </div>
      </div>
    </header>
  );
}
