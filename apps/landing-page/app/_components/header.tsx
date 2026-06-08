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
  LANDING_LOCALES,
  getCommonCopy,
  getHeaderProductMenuCopy,
  getLocaleDefinition,
  localePath,
  localizedHref,
  stripLocaleFromPath,
  type HeaderCopy,
  type LandingLocaleCode,
} from '../i18n';
import {
  getSolutionPageCopy,
  type SolutionPageKey,
} from '../solution-pages-i18n';

const REPO = 'https://github.com/nexu-io/open-design';
const DISCORD = 'https://discord.gg/9ptkbbqRu';
const X_TWITTER = 'https://x.com/nexudotio';
// Canonical AMR destination. Exported so the homepage AMR band CTA
// (app/page.tsx) links to the same URL the nav uses, without a second
// hand-maintained copy of the literal.
export const AMR_URL = 'https://open-design.ai/amr/';

const ext = {
  target: '_blank',
  rel: 'noreferrer noopener',
} as const;

/*
 * Nav structure mirrors the agreed Header spec 1:1 (see od-landing nav doc).
 * Sub-item display names are kept verbatim from that spec and are not
 * localized — product names and SEO use-case phrases stay in their canonical
 * English form regardless of UI locale. `href` values are placeholders today
 * (Solution use-case / Roles pages are a later milestone) and point at an
 * existing surface so nothing 404s; they get repointed as each page ships.
 */

// Solution → Use cases. Placeholder hrefs until the dedicated pages ship.
// Solution → Use cases. `key` maps to the solution page's copy block so the
// dropdown label is the page's localized breadcrumb (single source of truth,
// 18 locales) rather than a hard-coded English string.
const SOLUTION_USE_CASES: ReadonlyArray<{
  key: SolutionPageKey;
  href: string;
}> = [
  { key: 'prototype', href: '/solutions/prototype/' },
  { key: 'dashboard', href: '/solutions/dashboard/' },
  { key: 'slides', href: '/solutions/slides/' },
  { key: 'image', href: '/solutions/image/' },
  { key: 'video', href: '/solutions/video/' },
  { key: 'designSystem', href: '/solutions/design-system/' },
];

// Solution → Roles. Same `key`→localized-breadcrumb pattern as use cases.
const SOLUTION_ROLES: ReadonlyArray<{
  key: SolutionPageKey;
  href: string;
}> = [
  { key: 'roleSoloBuilder', href: '/solutions/solo-builder/' },
  { key: 'roleDesigner', href: '/solutions/designer/' },
  { key: 'roleEngineering', href: '/solutions/engineering/' },
  { key: 'roleProductManagers', href: '/solutions/product-managers/' },
  { key: 'roleMarketing', href: '/solutions/marketing/' },
];


export interface HeaderProps {
  /** Nav highlight target. `'home'` is the default for `/`. */
  active?:
    | 'home'
    | 'product'
    | 'html-anything'
    | 'html-video'
    | 'plugins'
    /*
     * `library` is kept as an alias for the dropdown trigger so older
     * pages that still pass `active="library"` keep working. New pages
     * should pass `active="plugins"`.
     */
    | 'library'
    | 'skills'
    | 'systems'
    | 'templates'
    | 'craft'
    | 'solution'
    | 'agent'
    | 'resources'
    | 'blog'
    | 'tutorials'
    | 'community';
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
  /** UI locale for nav labels and accessibility text. */
  locale?: LandingLocaleCode;
  /** Optional override for callers that already resolved localized chrome. */
  copy?: HeaderCopy;
  /** Brand link target — `/` (home) everywhere; callers may override. */
  brandHref?: string;
  /**
   * Current request pathname (e.g. `/zh/blog/x/`). Used to build the
   * language-switcher hrefs server-side so each option points at the
   * localized version of the CURRENT page rather than the homepage.
   * Defaults to `/` (correct for the homepage); sub-page callers thread
   * `Astro.url.pathname` through. The client script in
   * `locale-switcher-script.astro` then only handles persistence + menu
   * behavior instead of patching wrong hrefs.
   */
  currentPath?: string;
}

export function Header({
  active = 'home',
  counts,
  github,
  locale = DEFAULT_LOCALE,
  copy,
  brandHref = '/',
  currentPath = '/',
}: HeaderProps) {
  const linkClass = (key: NonNullable<HeaderProps['active']>) =>
    active === key ? 'is-active' : undefined;
  const headerCopy = copy ?? getCommonCopy(locale).header;
  const href = (path: string) => localizedHref(path, locale);
  const homeBrandHref = brandHref === '/' ? href('/') : brandHref;
  const productMenuCopy = getHeaderProductMenuCopy(locale);
  const localeDef = getLocaleDefinition(locale);
  const localeBasePath = stripLocaleFromPath(currentPath).pathname;
  const localeOptions = LANDING_LOCALES.map((entry) => ({
    ...entry,
    href: localePath(entry.code, localeBasePath),
  }));

  return (
    <header className='nav' data-od-id='nav'>
      <div className='container nav-inner'>
        <a href={homeBrandHref} className='brand'>
          <img
            className='brand-logo'
            src='/open-design-logo-new.svg'
            alt='Open Design'
            width={150}
            height={61}
          />
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
          aria-label={productMenuCopy.toggleNavigationMenu}
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
                href={href('/')}
                className={
                  active === 'product' ||
                  active === 'home' ||
                  active === 'html-anything' ||
                  active === 'html-video'
                    ? 'is-active'
                    : undefined
                }
                aria-haspopup='true'
                aria-expanded='false'
              >
                {productMenuCopy.product}
                <span className='dropdown-caret' aria-hidden='true'>▾</span>
              </a>
              <ul className='nav-dropdown' role='menu'>
                <li role='none'>
                  <a
                    role='menuitem'
                    href={href('/')}
                    className={
                      active === 'home' || active === 'product'
                        ? 'is-active'
                        : undefined
                    }
                  >
                    <span className='dropdown-name'>{productMenuCopy.openDesignName}</span>
                    <span className='dropdown-blurb'>
                      {productMenuCopy.openDesignBlurb}
                    </span>
                  </a>
                </li>
                <li role='none'>
                  <a
                    role='menuitem'
                    href={href('/html-anything/')}
                    className={linkClass('html-anything')}
                  >
                    <span className='dropdown-name'>{productMenuCopy.htmlAnythingName}</span>
                    <span className='dropdown-blurb'>
                      {productMenuCopy.htmlAnythingBlurb}
                    </span>
                  </a>
                </li>
                <li role='none'>
                  <a
                    role='menuitem'
                    href={href('/html-video/')}
                    className={linkClass('html-video')}
                  >
                    <span className='dropdown-name'>{productMenuCopy.htmlVideoName}</span>
                    <span className='dropdown-blurb'>
                      {productMenuCopy.htmlVideoBlurb}
                    </span>
                  </a>
                </li>
                {/* AMR is no longer listed here — per the Header spec it now
                  heads the Agent dropdown (the design Agent above the coding
                  agents). Listing it in both places would be redundant. */}
              </ul>
            </li>
            {/*
              Solution — two labeled groups per the Header spec: Use cases
              (Prototype / Dashboard / Slides / Image / Video / Design System)
              and Roles (Solo Builder / Designer / Engineering / Product
              Managers / Marketing). Sub-item hrefs are placeholders until each
              dedicated page ships; sub-item names are verbatim from the spec
              and not localized. Same CSS-only dropdown mechanic as Product.
            */}
            <li className='has-dropdown'>
              <a
                href={href('/solutions/')}
                className={active === 'solution' ? 'is-active' : undefined}
                aria-haspopup='true'
                aria-expanded='false'
              >
                {headerCopy.nav.solution}
                <span className='dropdown-caret' aria-hidden='true'>▾</span>
              </a>
              <ul className='nav-dropdown nav-dropdown-solution' role='menu'>
                <li role='none' className='nav-dropdown-group'>
                  <span className='nav-dropdown-group-label'>{headerCopy.nav.useCases}</span>
                </li>
                {SOLUTION_USE_CASES.map((item) => (
                  <li role='none' key={`uc-${item.key}`}>
                    <a role='menuitem' href={href(item.href)}>
                      <span className='dropdown-name'>{getSolutionPageCopy(locale, item.key).breadcrumb}</span>
                    </a>
                  </li>
                ))}
                <li role='none' className='nav-dropdown-group'>
                  <span className='nav-dropdown-group-label'>{headerCopy.nav.roles}</span>
                </li>
                {SOLUTION_ROLES.map((item) => (
                  <li role='none' key={`role-${item.key}`}>
                    <a role='menuitem' href={href(item.href)}>
                      <span className='dropdown-name'>{getSolutionPageCopy(locale, item.key).breadcrumb}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </li>
            {/*
              Agent — for now this dropdown lists only AMR (the design Agent).
              The 17 first-party coding-agent adapters and their per-agent
              /agents/ hub anchors are intentionally held back for a later
              pass; the trigger already links to the /agents/ hub.
            */}
            <li className='has-dropdown'>
              <a
                href={href('/agents/')}
                className={active === 'agent' ? 'is-active' : undefined}
                aria-haspopup='true'
                aria-expanded='false'
              >
                {headerCopy.nav.agent}
                <span className='dropdown-caret' aria-hidden='true'>▾</span>
              </a>
              <ul className='nav-dropdown' role='menu'>
                <li role='none'>
                  <a role='menuitem' href={AMR_URL}>
                    <span className='dropdown-name'>{productMenuCopy.amrName}</span>
                    <span className='dropdown-blurb'>{productMenuCopy.amrBlurb}</span>
                  </a>
                </li>
              </ul>
            </li>
            {/*
              Plugins — catalog facets (Templates / Skills / Systems / Craft)
              collapsed under one parent. Each row keeps its count badge
              inside the panel and the trigger highlights when any of the
              four facet pages is active. Same CSS-only :hover /
              :focus-within mechanic from Product.
            */}
            <li className='has-dropdown'>
              <a
                href={href('/plugins/')}
                className={
                  active === 'plugins' ||
                  active === 'library' ||
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
                {headerCopy.nav.plugins}
                <span className='dropdown-caret' aria-hidden='true'>▾</span>
              </a>
              {/* Labels come from the localized nav copy (Templates / Skills /
                Systems) so the dropdown is translated in every locale. */}
              <ul className='nav-dropdown' role='menu'>
                <li role='none'>
                  <a
                    role='menuitem'
                    href={href('/plugins/templates/')}
                    className={linkClass('templates')}
                  >
                    <span className='dropdown-name'>{headerCopy.nav.templates}</span>
                  </a>
                </li>
                <li role='none'>
                  <a
                    role='menuitem'
                    href={href('/plugins/skills/')}
                    className={linkClass('skills')}
                  >
                    <span className='dropdown-name'>{headerCopy.nav.skills}</span>
                  </a>
                </li>
                <li role='none'>
                  <a
                    role='menuitem'
                    href={href('/plugins/systems/')}
                    className={linkClass('systems')}
                  >
                    <span className='dropdown-name'>{headerCopy.nav.systems}</span>
                  </a>
                </li>
              </ul>
            </li>
            {/*
              Resources — Blog, Tutorials, Download. Blog/Tutorials were
              standalone top-level items before; folding them here frees slots
              for the new Solution/Agent dropdowns. (Weekly Newsletter was
              dropped — no product yet; re-add when the subscribe page ships.)
            */}
            <li className='has-dropdown'>
              <a
                href={href('/blog/')}
                className={
                  active === 'resources' ||
                  active === 'blog' ||
                  active === 'tutorials'
                    ? 'is-active'
                    : undefined
                }
                aria-haspopup='true'
                aria-expanded='false'
              >
                {headerCopy.nav.resources}
                <span className='dropdown-caret' aria-hidden='true'>▾</span>
              </a>
              <ul className='nav-dropdown' role='menu'>
                <li role='none'>
                  <a
                    role='menuitem'
                    href={href('/blog/')}
                    className={linkClass('blog')}
                  >
                    <span className='dropdown-name'>{headerCopy.nav.blog}</span>
                  </a>
                </li>
                <li role='none'>
                  <a
                    role='menuitem'
                    href={href('/tutorials/')}
                    className={linkClass('tutorials')}
                  >
                    <span className='dropdown-name'>{headerCopy.nav.tutorials}</span>
                  </a>
                </li>
                <li role='none'>
                  <a role='menuitem' href={href('/download/')}>
                    <span className='dropdown-name'>{headerCopy.download}</span>
                  </a>
                </li>
              </ul>
            </li>
            {/*
              Community — dropdown per the Header spec: Contributors,
              Ambassadors, Moderators, Discord, Discussions. The first three
              are anchors on the static `/community/` page (served verbatim
              from `public/community/index.html`); Discord and Discussions are
              external. Hrefs are the literal `/community/...` — the page is a
              single non-locale-aware destination, so `/zh/community/` would
              404 against the `[locale]/[...path].astro` catch-all.
            */}
            <li className='has-dropdown'>
              <a
                href='/community/'
                className={
                  active === 'community' ? 'is-active' : undefined
                }
                aria-haspopup='true'
                aria-expanded='false'
              >
                {headerCopy.nav.community}
                <span className='dropdown-caret' aria-hidden='true'>▾</span>
              </a>
              <ul className='nav-dropdown' role='menu'>
                <li role='none'>
                  <a role='menuitem' href='/community/#contributors'>
                    <span className='dropdown-name'>{headerCopy.nav.contributors}</span>
                  </a>
                </li>
                <li role='none'>
                  <a role='menuitem' href='/community/#ambassadors'>
                    <span className='dropdown-name'>{headerCopy.nav.ambassadors}</span>
                  </a>
                </li>
                <li role='none'>
                  <a role='menuitem' href='/community/#moderators'>
                    <span className='dropdown-name'>{headerCopy.nav.moderators}</span>
                  </a>
                </li>
                <li role='none'>
                  <a role='menuitem' href={DISCORD} {...ext}>
                    <span className='dropdown-name'>Discord</span>
                  </a>
                </li>
                <li role='none'>
                  <a role='menuitem' href={`${REPO}/discussions`} {...ext}>
                    <span className='dropdown-name'>Discussions</span>
                  </a>
                </li>
              </ul>
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
          <a
            className='nav-amr'
            href={AMR_URL}
            aria-label={`${productMenuCopy.amrName}: ${productMenuCopy.amrBlurb}`}
          >
            <img src='/amr-nav-logo.svg' alt='' width={66} height={24} aria-hidden='true' />
          </a>
          {/*
            Discord + X icon buttons live near Download / Star so the
            community channels are reachable from every page without
            burning a nav text slot. The icons are aria-labeled and
            otherwise unlabeled. At ≤1080px they collapse alongside the
            ghost Download CTA and the text-only nav <ul> (the latter
            moves into the hamburger panel) — only the Star CTA stays
            visible in the bar.
          */}
          <a
            className='nav-icon'
            href={DISCORD}
            aria-label='Join Open Design on Discord'
            title='Discord'
            {...ext}
          >
            <svg viewBox='0 0 24 24' width='18' height='18' fill='currentColor' aria-hidden='true'>
              <path d='M19.27 5.33A18 18 0 0 0 14.72 4l-.2.4a13.7 13.7 0 0 0-5.04 0L9.27 4a18 18 0 0 0-4.54 1.33C2.4 8.94 1.78 12.45 2.09 15.9a18.4 18.4 0 0 0 5.6 2.83l1.13-1.55a11.6 11.6 0 0 1-1.78-.86l.44-.34a13 13 0 0 0 11.04 0l.44.34c-.55.33-1.16.61-1.78.86l1.13 1.55a18.3 18.3 0 0 0 5.6-2.83c.45-4.05-.5-7.53-2.64-10.57ZM9.5 14.07c-1.07 0-1.95-.99-1.95-2.21 0-1.22.86-2.22 1.95-2.22 1.1 0 1.97 1 1.95 2.22 0 1.22-.86 2.21-1.95 2.21Zm5 0c-1.07 0-1.95-.99-1.95-2.21 0-1.22.87-2.22 1.96-2.22 1.1 0 1.96 1 1.95 2.22 0 1.22-.86 2.21-1.96 2.21Z' />
            </svg>
          </a>
          <a
            className='nav-icon'
            href={X_TWITTER}
            aria-label='Follow Open Design on X'
            title='X / Twitter'
            {...ext}
          >
            <svg viewBox='0 0 24 24' width='16' height='16' fill='currentColor' aria-hidden='true'>
              <path d='M17.53 3H21l-7.39 8.45L22 21h-6.83l-5.36-6.99L3.7 21H.23l7.9-9.04L0 3h7l4.85 6.41L17.53 3Zm-2.39 16h2.04L5.96 4.9H3.78L15.14 19Z' />
            </svg>
          </a>
          <a
            className='nav-cta ghost is-star'
            href={REPO}
            aria-label={headerCopy.starAria}
            title={headerCopy.starTitle}
            {...ext}
          >
            {headerCopy.starPrefix} ·{' '}
            <span data-github-stars>{github?.starsLabel ?? '40K+'}</span>
          </a>
          <a
            className='nav-cta ghost is-download'
            href={href('/download/')}
            aria-label={headerCopy.downloadAria}
            title={headerCopy.downloadTitle}
            data-download-cta
            data-download-page
          >
            {/*
              The CPU-arch chip (（Apple Silicon）/（Apple Intel）) is
              intentionally NOT rendered in the nav CTA — at mid widths it
              pushed the row over the available space and crowded the bar.
              The arch suffix still appears on the homepage hero download
              button (page.tsx) and the /download/ page, where there is room.
            */}
            {headerCopy.download}
          </a>
          <details className='locale-switch nav-locale' data-locale-switch>
            <summary
              className='locale-trigger'
              aria-label={getCommonCopy(locale).topbar.languageSwitcherLabel}
            >
              <span className='locale-trigger-code'>{localeDef.shortLabel}</span>
              <svg
                className='locale-trigger-caret'
                viewBox='0 0 8 5'
                aria-hidden='true'
                focusable='false'
              >
                <path
                  d='M0.5 0.75 L4 4 L7.5 0.75'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='1'
                  strokeLinecap='square'
                />
              </svg>
            </summary>
            <div className='locale-menu' role='menu'>
              {localeOptions.map((entry) => (
                <a
                  className={`locale-menu-item${
                    entry.code === locale ? ' is-active' : ''
                  }`}
                  role='menuitem'
                  data-locale-link
                  data-locale-code={entry.code}
                  href={entry.href}
                  lang={entry.htmlLang}
                  aria-current={entry.code === locale ? 'true' : undefined}
                  key={entry.code}
                >
                  <span className='locale-menu-code'>
                    {entry.code.toUpperCase()}
                  </span>
                  <span className='locale-menu-label'>{entry.label}</span>
                </a>
              ))}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
