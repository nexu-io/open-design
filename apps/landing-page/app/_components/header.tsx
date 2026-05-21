/*
 * Sticky Header — static markup rendered at build time. Headroom-style
 * hide/show and the live GitHub star count are attached by the tiny inline
 * scripts on each Astro page, so this marketing page ships no React runtime
 * to the browser.
 *
 * The nav links go to internal multi-page routes (`/skills/`, `/systems/`,
 * `/templates/`, `/craft/`) so Google sees a real site hierarchy. Numbers
 * reflect the live counts of the canonical Markdown bundles in the repo
 * root and are kept in sync with `getCatalogCounts()` at build time.
 */

import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_LABEL,
  getCopy,
  localePath,
  type Locale,
} from '../_lib/i18n';

const REPO = 'https://github.com/nexu-io/open-design';
const REPO_RELEASES = `${REPO}/releases`;

const ext = {
  target: '_blank',
  rel: 'noreferrer noopener',
} as const;

export interface HeaderProps {
  /** Nav highlight target. `'home'` is the default for `/`. */
  active?:
    | 'home'
    | 'product'
    | 'html-anything'
    | 'skills'
    | 'systems'
    | 'templates'
    | 'craft'
    | 'tutorials'
    | 'blog';
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
  github?: {
    starsLabel: string;
  };
  /** Brand link target — `#top` on the homepage, `/` on sub-pages. */
  brandHref?: string;
  /** Active page locale. Default routes remain unprefixed English. */
  locale?: Locale;
  /** Keep `/en/...` links when rendering the explicit English locale route. */
  prefixDefaultLocale?: boolean;
  /**
   * Active pathname (e.g. `/skills/`, `/zh-CN/blog/`). Used by the locale
   * switcher to compute the equivalent URL in each language so a click on
   * "日本語" from `/zh-CN/blog/` goes straight to `/ja/blog/`, not `/ja/`.
   */
  pathname?: string;
}

export function Header({
  active = 'home',
  counts,
  github,
  brandHref = '#top',
  locale = DEFAULT_LOCALE,
  prefixDefaultLocale = false,
  pathname = '/',
}: HeaderProps) {
  const linkClass = (key: NonNullable<HeaderProps['active']>) =>
    active === key ? 'is-active' : undefined;
  const copy = getCopy(locale);
  const href = (path: string) =>
    localePath(path, locale, { prefixDefault: prefixDefaultLocale });
  const localizedBrandHref =
    brandHref === '#top' ? brandHref : href(brandHref);
  const contactHref = brandHref === '#top' ? '#contact' : `${href('/')}#contact`;

  /**
   * Minimal line-art globe icon, sized to sit next to the locale label
   * without dominating the pill. `currentColor` so it inherits the ghost
   * CTA color treatment (ink at rest, coral on hover).
   */
  const globeIcon = (
    <svg
      className='nav-locale-glyph'
      viewBox='0 0 24 24'
      width='14'
      height='14'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.5'
      aria-hidden='true'
    >
      <circle cx='12' cy='12' r='9' />
      <path d='M3 12h18' />
      <path d='M12 3a14 14 0 0 1 0 18' />
      <path d='M12 3a14 14 0 0 0 0 18' />
    </svg>
  );
  const chevronIcon = (
    <svg
      className='nav-locale-chevron'
      viewBox='0 0 24 24'
      width='10'
      height='10'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      aria-hidden='true'
    >
      <path d='M6 9l6 6 6-6' />
    </svg>
  );
  const checkIcon = (
    <svg
      className='nav-locale-check'
      viewBox='0 0 24 24'
      width='12'
      height='12'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      aria-hidden='true'
    >
      <path d='M5 12l5 5L20 7' />
    </svg>
  );

  return (
    <header className='nav' data-od-id='nav' data-nav-headroom>
      <div className='container nav-inner'>
        <a href={localizedBrandHref} className='brand'>
          <span className='brand-mark'>
            <img src='/logo.webp' alt='' width={36} height={36} />
          </span>
          <span>Open Design</span>
          <span className='brand-meta'>
            <b>Studio Nº 01</b>Berlin / Open / Earth
          </span>
        </a>
        {/*
          Mobile / tablet hamburger. Hidden by CSS at ≥1100px (the desktop
          breakpoint where the full nav fits). At narrower widths it toggles
          `.is-open` on the parent <header> via a small handler in
          `header-enhancer.astro` — when open, the `<nav>` element below
          drops down underneath the header bar as a vertical list.
        */}
        <button
          type='button'
          className='nav-toggle'
          aria-label='Toggle navigation menu'
          aria-controls='primary-nav'
          aria-expanded='false'
          data-nav-toggle
        >
          <span className='nav-toggle-icon' aria-hidden='true' />
        </button>
        <nav id='primary-nav' data-nav-primary>
          <ul className='nav-links'>
            <li className='has-dropdown'>
              {/*
                Product menu — top-level group exposing the Open Design family.
                CSS-only dropdown via :hover / :focus-within (no JS), so this
                still renders correctly under static export with no React
                runtime on the client. The trigger is a focusable <a> rather
                than a button so it remains a keyboard tab stop, with
                aria-haspopup signaling the submenu to assistive tech.
              */}
              <a
                href='/'
                className={
                  active === 'product' ||
                  active === 'home' ||
                  active === 'html-anything'
                    ? 'is-active'
                    : undefined
                }
                aria-haspopup='true'
                aria-expanded='false'
              >
                Product
                <span className='dropdown-caret' aria-hidden='true'>▾</span>
              </a>
              <ul className='nav-dropdown' role='menu'>
                <li role='none'>
                  <a
                    role='menuitem'
                    href='/'
                    className={
                      active === 'home' || active === 'product'
                        ? 'is-active'
                        : undefined
                    }
                  >
                    <span className='dropdown-name'>Open Design</span>
                    <span className='dropdown-blurb'>
                      The agentic design surface — skills, systems, templates.
                    </span>
                  </a>
                </li>
                <li role='none'>
                  <a
                    role='menuitem'
                    href='/html-anything/'
                    className={linkClass('html-anything')}
                  >
                    <span className='dropdown-name'>HTML Anything</span>
                    <span className='dropdown-blurb'>
                      Markdown / data → ship-ready HTML, by your local agent.
                    </span>
                  </a>
                </li>
              </ul>
            </li>
            <li>
              <a href={href('/skills/')} className={linkClass('skills')}>
                {copy.navSkills}<span className='num'>{counts.skills}</span>
              </a>
            </li>
            <li>
              <a href={href('/systems/')} className={linkClass('systems')}>
                {copy.navSystems}<span className='num'>{counts.systems}</span>
              </a>
            </li>
            <li>
              <a href={href('/templates/')} className={linkClass('templates')}>
                {copy.navTemplates}<span className='num'>{counts.templates}</span>
              </a>
            </li>
            <li>
              <a href={href('/craft/')} className={linkClass('craft')}>
                {copy.navCraft}<span className='num'>{counts.craft}</span>
              </a>
            </li>
            <li>
              <a href={href('/tutorials/')} className={linkClass('tutorials')}>
                Tutorials
              </a>
            </li>
            <li>
              <a href={href('/blog/')} className={linkClass('blog')}>
                {copy.navBlog}
              </a>
            </li>
            <li>
              <a href={contactHref}>
                {copy.navContact}
              </a>
            </li>
          </ul>
        </nav>
        <div className='nav-side'>
          {/*
           * Site-level locale switcher.
           *
           * Lives in nav-side (not the metadata topbar) so it carries the
           * same visual weight as Download/Star CTAs. Uses `<details>` so
           * the dropdown works without JavaScript — and is recognised as
           * a disclosure widget by screen readers. The trigger always
           * shows the active locale in its native script, matching
           * opendesigner.io's pattern.
           */}
          <details className='nav-locale' data-od-id='nav-locale'>
            <summary
              className='nav-locale-trigger'
              aria-label='Switch language'
              title='Switch language'
            >
              {globeIcon}
              <span className='nav-locale-current' lang={locale}>
                {LOCALE_LABEL[locale]}
              </span>
              {chevronIcon}
            </summary>
            <div className='nav-locale-panel' role='menu'>
              {LOCALES.map((item) => {
                const isCurrent = item === locale;
                return (
                  <a
                    key={item}
                    className={`nav-locale-item${isCurrent ? ' is-current' : ''}`}
                    href={localePath(pathname, item)}
                    hrefLang={item}
                    lang={item}
                    role='menuitem'
                    aria-current={isCurrent ? 'true' : undefined}
                  >
                    <span className='nav-locale-name'>
                      {LOCALE_LABEL[item]}
                    </span>
                    {isCurrent ? checkIcon : null}
                  </a>
                );
              })}
            </div>
          </details>
          <a
            className='nav-cta ghost'
            href={REPO_RELEASES}
            aria-label='Download Open Design desktop'
            title='Download the desktop app'
            {...ext}
          >
            {copy.download}
          </a>
          <a
            className='nav-cta'
            href={REPO}
            aria-label='Star Open Design on GitHub'
            title='Click to star us on GitHub'
            {...ext}
          >
            {copy.star} · <span data-github-stars>{github?.starsLabel ?? '40K+'}</span>
          </a>
          <span className='status-dot' aria-hidden='true' />
        </div>
      </div>
    </header>
  );
}
