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
            <img src='/logo.webp' alt='' width={44} height={44} />
          </span>
          <span className='brand-name'>Open Design</span>
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
            {/*
              Library — catalog facets (Skills / Systems / Templates / Craft).
              Each is a top-level entry-point in its own right and keeps its
              own count badge inside the panel, but they share the same
              shape (catalog list → detail page), so the surface treats them
              as facets of one library group instead of competing for nav
              real estate one row at a time.

              The trigger highlights when any one of the four facet pages
              is active. The same CSS-only :hover / :focus-within mechanic
              from Product applies — no JS, no React runtime in the browser.
            */}
            <li className='has-dropdown'>
              <a
                href={href('/skills/')}
                className={
                  active === 'skills' ||
                  active === 'systems' ||
                  active === 'templates' ||
                  active === 'craft'
                    ? 'is-active'
                    : undefined
                }
                aria-haspopup='true'
                aria-expanded='false'
              >
                Library
                <span className='dropdown-caret' aria-hidden='true'>▾</span>
              </a>
              <ul className='nav-dropdown' role='menu'>
                <li role='none'>
                  <a
                    role='menuitem'
                    href={href('/skills/')}
                    className={linkClass('skills')}
                  >
                    <span className='dropdown-name'>
                      {copy.navSkills}
                      <span className='dropdown-num'>{counts.skills}</span>
                    </span>
                    <span className='dropdown-blurb'>
                      Composable skill templates the agent invokes mid-task.
                    </span>
                  </a>
                </li>
                <li role='none'>
                  <a
                    role='menuitem'
                    href={href('/systems/')}
                    className={linkClass('systems')}
                  >
                    <span className='dropdown-name'>
                      {copy.navSystems}
                      <span className='dropdown-num'>{counts.systems}</span>
                    </span>
                    <span className='dropdown-blurb'>
                      Brand-grade design systems — tokens, type, voice.
                    </span>
                  </a>
                </li>
                <li role='none'>
                  <a
                    role='menuitem'
                    href={href('/templates/')}
                    className={linkClass('templates')}
                  >
                    <span className='dropdown-name'>
                      {copy.navTemplates}
                      <span className='dropdown-num'>{counts.templates}</span>
                    </span>
                    <span className='dropdown-blurb'>
                      Ready-to-fork artifact bundles with sample data.
                    </span>
                  </a>
                </li>
                <li role='none'>
                  <a
                    role='menuitem'
                    href={href('/craft/')}
                    className={linkClass('craft')}
                  >
                    <span className='dropdown-name'>
                      {copy.navCraft}
                      <span className='dropdown-num'>{counts.craft}</span>
                    </span>
                    <span className='dropdown-blurb'>
                      Universal craft principles a skill can opt into.
                    </span>
                  </a>
                </li>
              </ul>
            </li>
            {/*
              Tutorials and Blog stay as standalone top-row links rather
              than nesting under a Learn group: they're the only two
              editorial reading surfaces, and rolling two items into a
              dropdown adds a click without earning back any horizontal
              space. The Library grouping above is what reclaimed the
              row — Tutorials/Blog can live side by side at the cost of
              one extra slot.
            */}
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
            {/*
              Contact intentionally NOT exposed in the top nav: it's a
              page-internal anchor (`#contact` on the homepage CTA section)
              that the footer already surfaces. Keeping it out of the bar
              frees a slot at narrow widths where the row was overflowing.
            */}
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
