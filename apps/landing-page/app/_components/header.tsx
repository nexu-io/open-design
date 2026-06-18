/*
 * Sticky Header — static markup rendered at build time. Headroom-style
 * hide/show and the live GitHub star count are attached by the tiny inline
 * scripts on each Astro page, so this marketing page ships no React runtime
 * to the browser.
 *
 * The primary resource link points to the Skill catalog. Catalog counts are
 * still accepted by the public prop shape because sub-pages pass them through.
 */

import {
  DEFAULT_LOCALE,
  getCommonCopy,
  getHeaderProductMenuCopy,
  localizedHref,
  type HeaderCopy,
  type LandingLocaleCode,
} from '../i18n';

const REPO = 'https://github.com/nexu-io/open-design';
const REPO_DISCUSSIONS = `${REPO}/discussions`;
const DISCORD = 'https://discord.gg/9ptkbbqRu';
const X_PROFILE = 'https://x.com/OpenDesignHQ';
// AMR product page on the production site (this repo has no /amr/ route).
// Single destination for every AMR surface: the nav logo, the Agent
// dropdown entry, and the footer Partners column.
const AMR_URL = 'https://open-design.ai/amr/';

// Solution → Use cases / Roles. Hrefs mirror upstream main's header 1:1 and
// pair positionally with the localized `useCaseItems` / `roleItems` tuples.
const USE_CASE_HREFS = [
  '/solutions/prototype/',
  '/solutions/dashboard/',
  '/solutions/slides/',
  '/solutions/image/',
  '/solutions/video/',
  '/solutions/design-system/',
] as const;

const ROLE_HREFS = [
  '/solutions/solo-builder/',
  '/solutions/designer/',
  '/solutions/engineering/',
  '/solutions/product-managers/',
  '/solutions/marketing/',
] as const;

// Agent column — AMR (the design Agent) heads the dropdown in the markup,
// followed by the coding agents with a dedicated long-form design page
// upstream. Routes stay in lockstep with main's /agents/ hub.
const AGENTS: ReadonlyArray<{ name: string; route: string }> = [
  { name: 'Codex', route: 'codex-design' },
  { name: 'Cursor Agent', route: 'cursor-design' },
  { name: 'Claude Code', route: 'claude-code-design' },
  { name: 'OpenCode', route: 'opencode-design' },
  { name: 'Gemini CLI', route: 'gemini-design' },
  { name: 'GitHub Copilot CLI', route: 'copilot-design' },
  { name: 'Qwen Code', route: 'qwen-design' },
  { name: 'Grok Build', route: 'grok-design' },
  { name: 'Kimi CLI', route: 'kimi-design' },
  { name: 'DeepSeek TUI', route: 'deepseek-design' },
  { name: 'Trae CLI', route: 'trae-cli-design' },
  { name: 'Aider', route: 'aider-design' },
  { name: 'Antigravity', route: 'antigravity-design' },
  { name: 'DeepSeek Reasonix', route: 'reasonix-design' },
  { name: 'Hermes', route: 'hermes-design' },
  { name: 'Devin for Terminal', route: 'devin-design' },
  { name: 'Pi', route: 'pi-design' },
  { name: 'Kiro CLI', route: 'kiro-design' },
  { name: 'Kilo', route: 'kilo-design' },
  { name: 'Mistral Vibe CLI', route: 'vibe-design' },
  { name: 'Qoder CLI', route: 'qoder-design' },
];

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
    | 'html-video'
    | 'solution'
    | 'agent'
    | 'plugins'
    | 'library'
    | 'skills'
    | 'systems'
    | 'templates'
    | 'craft'
    | 'resources'
    | 'blog'
    | 'tutorials'
    | 'download'
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
  localeSwitcher?: {
    label: string;
    prefix: string;
    shortLabel: string;
    options: ReadonlyArray<{
      code: LandingLocaleCode;
      href: string;
      htmlLang: string;
      label: string;
    }>;
  };
  /** UI locale for nav labels and accessibility text. */
  locale?: LandingLocaleCode;
  /** Optional override for callers that already resolved localized chrome. */
  copy?: HeaderCopy;
  /** Brand link target — `#top` on the homepage, `/` on sub-pages. */
  brandHref?: string;
}

export function Header({
  active = 'home',
  github,
  localeSwitcher,
  locale = DEFAULT_LOCALE,
  copy,
  brandHref = '#top',
}: HeaderProps) {
  const headerCopy = copy ?? getCommonCopy(locale).header;
  const href = (path: string) => localizedHref(path, locale);
  const homeBrandHref = brandHref === '/' ? href('/') : brandHref;
  const productMenuCopy = getHeaderProductMenuCopy(locale);

  return (
    <header className='nav' data-od-id='nav'>
      <div className='container nav-inner'>
        <a href={homeBrandHref} className='brand'>
          <img
            className='brand-logo'
            src='/logo-lockup.svg'
            alt='Open Design'
            width={225}
            height={83}
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
            {/* Product — the Open Design products. The trigger lights up only
                for its own family; every other section maps to its own
                trigger below, so a sub-page never marks Product by accident. */}
            <li className='has-dropdown'>
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
              >
                {productMenuCopy.product}
                <span className='dropdown-caret' aria-hidden='true'>▾</span>
              </a>
              <ul className='nav-dropdown' aria-label={productMenuCopy.product}>
                <li>
                  <a href={href('/')}>
                    <span className='dropdown-name'>{productMenuCopy.openDesignName}</span>
                    <span className='dropdown-blurb'>{productMenuCopy.openDesignBlurb}</span>
                  </a>
                </li>
                <li>
                  <a
                    href={href('/html-anything/')}
                    className={active === 'html-anything' ? 'is-active' : undefined}
                  >
                    <span className='dropdown-name'>{productMenuCopy.htmlAnythingName}</span>
                    <span className='dropdown-blurb'>{productMenuCopy.htmlAnythingBlurb}</span>
                  </a>
                </li>
                <li>
                  <a href={href('/html-video/')}>
                    <span className='dropdown-name'>{productMenuCopy.htmlVideoName}</span>
                    <span className='dropdown-blurb'>{productMenuCopy.htmlVideoBlurb}</span>
                  </a>
                </li>
              </ul>
            </li>

            {/* Solution — Use cases + Roles. */}
            <li className='has-dropdown'>
              <a
                href={href('/solutions/')}
                className={active === 'solution' ? 'is-active' : undefined}
              >
                {productMenuCopy.solution}
                <span className='dropdown-caret' aria-hidden='true'>▾</span>
              </a>
              <ul
                className='nav-dropdown nav-dropdown-solution'
                aria-label={productMenuCopy.solution}
              >
                <li className='nav-dropdown-group'>
                  <span className='nav-dropdown-group-label'>
                    {productMenuCopy.useCases}
                  </span>
                </li>
                {productMenuCopy.useCaseItems.map((name, index) => (
                  <li key={name}>
                    <a href={href(USE_CASE_HREFS[index]!)}>
                      <span className='dropdown-name'>{name}</span>
                    </a>
                  </li>
                ))}
                <li className='nav-dropdown-group'>
                  <span className='nav-dropdown-group-label'>
                    {productMenuCopy.roles}
                  </span>
                </li>
                {productMenuCopy.roleItems.map((name, index) => (
                  <li key={name}>
                    <a href={href(ROLE_HREFS[index]!)}>
                      <span className='dropdown-name'>{name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </li>

            {/* Agent — AMR plus the coding agents with a dedicated design
                page. The top-level link goes to the /agents/ hub. */}
            <li className='has-dropdown'>
              <a
                href={href('/agents/')}
                className={active === 'agent' ? 'is-active' : undefined}
              >
                {productMenuCopy.agent}
                <span className='dropdown-caret' aria-hidden='true'>▾</span>
              </a>
              {/* 22 rows (AMR + 21 coding agents) — reuse the tall-dropdown
                  height cap so the panel scrolls instead of running off
                  short viewports. */}
              <ul
                className='nav-dropdown nav-dropdown-solution'
                aria-label={productMenuCopy.agent}
              >
                <li>
                  <a href={AMR_URL}>
                    <span className='dropdown-name'>{productMenuCopy.amrName}</span>
                    <span className='dropdown-blurb'>{productMenuCopy.amrBlurb}</span>
                  </a>
                </li>
                {AGENTS.map((agent) => (
                  <li key={agent.route}>
                    <a href={href(`/agents/${agent.route}/`)}>
                      <span className='dropdown-name'>{agent.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </li>

            {/* Plugins — the three composable catalogs. */}
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
              >
                {productMenuCopy.plugins}
                <span className='dropdown-caret' aria-hidden='true'>▾</span>
              </a>
              <ul className='nav-dropdown' aria-label={productMenuCopy.plugins}>
                <li>
                  <a href={href('/plugins/templates/')}>
                    <span className='dropdown-name'>
                      {productMenuCopy.pluginItems.templates}
                    </span>
                  </a>
                </li>
                <li>
                  <a href={href('/plugins/skills/')}>
                    <span className='dropdown-name'>
                      {productMenuCopy.pluginItems.skills}
                    </span>
                  </a>
                </li>
                <li>
                  <a href={href('/plugins/systems/')}>
                    <span className='dropdown-name'>
                      {productMenuCopy.pluginItems.systems}
                    </span>
                  </a>
                </li>
              </ul>
            </li>

            {/* Resources — the top-level link mirrors the live site, which
                points it at the blog index. */}
            <li className='has-dropdown'>
              <a
                href={href('/blog/')}
                className={
                  active === 'resources' ||
                  active === 'blog' ||
                  active === 'tutorials' ||
                  active === 'download'
                    ? 'is-active'
                    : undefined
                }
              >
                {productMenuCopy.resources}
                <span className='dropdown-caret' aria-hidden='true'>▾</span>
              </a>
              <ul className='nav-dropdown' aria-label={productMenuCopy.resources}>
                <li>
                  <a href={href('/blog/')}>
                    <span className='dropdown-name'>
                      {productMenuCopy.resourceItems.blog}
                    </span>
                  </a>
                </li>
                <li>
                  <a href={href('/tutorials/')}>
                    <span className='dropdown-name'>
                      {productMenuCopy.resourceItems.tutorials}
                    </span>
                  </a>
                </li>
                <li>
                  <a href={href('/compare/')}>
                    <span className='dropdown-name'>
                      {productMenuCopy.resourceItems.compare}
                    </span>
                  </a>
                </li>
                {/* Weekly Newsletter is intentionally not listed — upstream
                    main dropped it from Resources until the subscribe page
                    ships. */}
                <li>
                  <a
                    href={href('/download/')}
                    className={active === 'download' ? 'is-active' : undefined}
                  >
                    <span className='dropdown-name'>
                      {productMenuCopy.resourceItems.download}
                    </span>
                  </a>
                </li>
              </ul>
            </li>

            {/* Community — Contributors / Ambassadors / Moderators anchor
                into the `/community/` hub's sections (same destinations as
                upstream main's header), not the standalone static pages.
                The community pages are non-locale-aware, so no `href()`
                localization here. */}
            <li className='has-dropdown'>
              <a
                href='/community/'
                className={active === 'community' ? 'is-active' : undefined}
              >
                {productMenuCopy.community}
                <span className='dropdown-caret' aria-hidden='true'>▾</span>
              </a>
              <ul className='nav-dropdown' aria-label={productMenuCopy.community}>
                <li>
                  <a href='/community/contributors/'>
                    <span className='dropdown-name'>
                      {productMenuCopy.communityItems.contributors}
                    </span>
                  </a>
                </li>
                <li>
                  <a href='/community/ambassadors/'>
                    <span className='dropdown-name'>
                      {productMenuCopy.communityItems.ambassadors}
                    </span>
                  </a>
                </li>
                <li>
                  <a href='/community/moderators/'>
                    <span className='dropdown-name'>
                      {productMenuCopy.communityItems.moderators}
                    </span>
                  </a>
                </li>
                <li>
                  <a href={DISCORD} {...ext}>
                    <span className='dropdown-name'>Discord</span>
                  </a>
                </li>
                <li>
                  <a href={REPO_DISCUSSIONS} {...ext}>
                    <span className='dropdown-name'>
                      {productMenuCopy.communityItems.discussions}
                    </span>
                  </a>
                </li>
                <li>
                  <a href={X_PROFILE} {...ext}>
                    <span className='dropdown-name'>X</span>
                  </a>
                </li>
              </ul>
            </li>

            {/* AMR partner logo at the tail of the nav links. */}
            <li className='nav-amr'>
              <a href={AMR_URL} aria-label='AMR' {...ext}>
                <img
                  className='nav-amr-logo'
                  src='/amr-lockup.svg'
                  alt='AMR'
                  width={700}
                  height={272}
                  loading='lazy'
                  decoding='async'
                />
              </a>
            </li>
          </ul>
        </nav>
        <div className='nav-side'>
          {localeSwitcher ? (
            <details className='locale-switch nav-locale-switch' data-locale-switch>
              <summary
                className='locale-trigger locale-trigger-iconic'
                aria-label={localeSwitcher.label}
                title={localeSwitcher.label}
              >
                {/* Language switcher rendered as the skill's Remix Icon
                    "translate-2" glyph (\f226) instead of the 语言 · 简中 text. */}
                <span className='locale-trigger-icon' aria-hidden='true' />
                {/* Dropdown caret as the skill's Remix Icon "arrow-down-s-line"
                    glyph () instead of an inline SVG path. */}
                <span className='locale-trigger-caret ri-glyph' aria-hidden='true'>
                  {''}
                </span>
              </summary>
              <div className='locale-menu' role='menu'>
                {localeSwitcher.options.map((entry) => (
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
          ) : null}
          <a
            className='nav-cta ghost'
            href={href('/download/')}
            aria-label={headerCopy.downloadAria}
            title={headerCopy.downloadTitle}
            data-download-cta
            data-download-page
            data-download-placement='nav'
          >
            {headerCopy.download}
          </a>
        </div>
      </div>
      {/*
        Liquid Glass material — SVG displacement filter (chromatic edge
        refraction) ported 1:1 from Inspira UI's LiquidGlass.vue. Referenced
        by the nav's `backdrop-filter` once the bar condenses on scroll. The
        displacement map (the `feImage`) is generated and sized to the live
        bar by the inline script in `header-enhancer.astro` (ResizeObserver).
        Chromium-only; Safari/Firefox fall back to the plain `blur()` declared
        in globals.css, per the component's own browser-support note.
      */}
      <svg
        className='nav-glass-defs'
        aria-hidden='true'
        focusable='false'
        width='0'
        height='0'
      >
        <defs>
          <filter id='nav-liquid-glass' colorInterpolationFilters='sRGB'>
            <feImage
              x='0'
              y='0'
              width='100%'
              height='100%'
              preserveAspectRatio='none'
              result='map'
              data-nav-glass-map
            />
            <feDisplacementMap
              in='SourceGraphic'
              in2='map'
              xChannelSelector='R'
              yChannelSelector='B'
              scale='-50'
              result='dispRed'
            />
            <feColorMatrix
              in='dispRed'
              type='matrix'
              values='1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0'
              result='red'
            />
            <feDisplacementMap
              in='SourceGraphic'
              in2='map'
              xChannelSelector='R'
              yChannelSelector='B'
              scale='-47'
              result='dispGreen'
            />
            <feColorMatrix
              in='dispGreen'
              type='matrix'
              values='0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0'
              result='green'
            />
            <feDisplacementMap
              in='SourceGraphic'
              in2='map'
              xChannelSelector='R'
              yChannelSelector='B'
              scale='-44'
              result='dispBlue'
            />
            <feColorMatrix
              in='dispBlue'
              type='matrix'
              values='0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0'
              result='blue'
            />
            <feBlend in='red' in2='green' mode='screen' result='rg' />
            <feBlend in='rg' in2='blue' mode='screen' result='output' />
            <feGaussianBlur in='output' stdDeviation='0.7' />
          </filter>
        </defs>
      </svg>
    </header>
  );
}
