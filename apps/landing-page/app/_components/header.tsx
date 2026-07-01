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
import { getSolutionPageCopy } from '../solution-pages-i18n';
import type { SolutionPageKey } from '../solution-pages-i18n/types';

const REPO = 'https://github.com/nexu-io/open-design';
const REPO_DISCUSSIONS = `${REPO}/discussions`;
const DISCORD = 'https://discord.gg/mHAjSMV6gz';
const X_PROFILE = 'https://x.com/OpenDesignHQ';
// AMR product page on the production site (this repo has no /amr/ route).
// Single destination for every AMR surface: the nav logo, the Agent
// dropdown entry, and the footer Partners column.
const AMR_URL = 'https://open-design.ai/amr/';

// Open Design Cloud (AMR / vela) endpoints for the header sign-in module.
// Production defaults; overridable at build time via PUBLIC_* env so a
// preview/staging build can point at a non-prod cloud. These are surfaced to
// the runtime via `data-*` on `.nav-account` because the auth logic lives in
// `header-enhancer.astro`'s `<script is:inline>` (NOT processed by Vite, so it
// cannot read `import.meta.env` itself).
const env = import.meta.env as Record<string, string | undefined>;
const AMR_API_BASE = env.PUBLIC_AMR_API_BASE ?? 'https://amr-api.open-design.ai';
const AMR_LOGIN_URL = env.PUBLIC_AMR_LOGIN_URL ?? 'https://open-design.ai/amr/login';
const AMR_CONSOLE_URL =
  env.PUBLIC_AMR_CONSOLE_URL ?? 'https://open-design.ai/amr?source=open_design';

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

// Solution → Tools. AI generator pages. Labels come from the solution-page
// copy (the page breadcrumb) so the dropdown and the hub cards share one
// translation source and cannot drift apart.
const TOOL_ENTRIES: ReadonlyArray<{ href: string; key: SolutionPageKey }> = [
  { href: '/solutions/ai-wireframe-generator/', key: 'aiWireframeGenerator' },
  { href: '/solutions/ai-ui-generator/', key: 'aiUiGenerator' },
  { href: '/solutions/ai-prototype-generator/', key: 'aiPrototypeGenerator' },
  { href: '/solutions/ai-landing-page-generator/', key: 'aiLandingPageGenerator' },
  { href: '/solutions/design-to-code/', key: 'designToCode' },
  { href: '/solutions/figma-to-code/', key: 'figmaToCode' },
  { href: '/solutions/screenshot-to-code/', key: 'screenshotToCode' },
];

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
    | 'pricing'
    | 'library'
    | 'skills'
    | 'systems'
    | 'templates'
    | 'craft'
    | 'resources'
    | 'blog'
    | 'stories'
    | 'tutorials'
    | 'download'
    | 'community'
    // Standalone landing pages (e.g. /enterprise/) that intentionally do not
    // belong under any top-nav tab — pass this so no tab renders as active.
    | 'enterprise';
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
                trigger below, so a sub-page never marks Product by accident.
                It is a <button> (not a link) so it never navigates — Product
                used to bounce to the homepage — but its dropdown is revealed
                by the SAME pure-CSS :hover / :focus-within rule as the hub
                menus, so it works with no JS (first paint / script failure)
                and on touch (tapping focuses the button → :focus-within). */}
            <li className='has-dropdown'>
              <button
                type='button'
                className={
                  'nav-trigger' +
                  (active === 'product' ||
                  active === 'home' ||
                  active === 'html-anything' ||
                  active === 'html-video'
                    ? ' is-active'
                    : '')
                }
              >
                {productMenuCopy.product}
                <span className='dropdown-caret' aria-hidden='true'>▾</span>
              </button>
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
                    {productMenuCopy.tools}
                  </span>
                </li>
                {TOOL_ENTRIES.map(({ href: toolHref, key }) => (
                  <li key={key}>
                    <a href={href(toolHref)}>
                      <span className='dropdown-name'>
                        {getSolutionPageCopy(locale, key).breadcrumb}
                      </span>
                    </a>
                  </li>
                ))}
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

            {/* Pricing — localized page. The plan numbers it renders stay in
                sync with the vela commerce app at runtime (see
                app/_lib/pricing.ts); the card copy mirrors vela's subscription
                modal (see app/_lib/pricing-content.ts). */}
            <li>
              <a
                href={href('/pricing/')}
                className={active === 'pricing' ? 'is-active' : undefined}
              >
                {productMenuCopy.pricing}
              </a>
            </li>

            {/* Resources — a category label (Blog / Tutorials / Compare), not
                a page; a <button> so it never navigates (it used to bounce to
                /blog/), with its dropdown revealed by the same pure-CSS
                :hover / :focus-within rule as the hub menus (see Product). */}
            <li className='has-dropdown'>
              <button
                type='button'
                className={
                  'nav-trigger' +
                  (active === 'resources' ||
                  active === 'blog' ||
                  active === 'stories' ||
                  active === 'tutorials' ||
                  active === 'download'
                    ? ' is-active'
                    : '')
                }
              >
                {productMenuCopy.resources}
                <span className='dropdown-caret' aria-hidden='true'>▾</span>
              </button>
              <ul className='nav-dropdown' aria-label={productMenuCopy.resources}>
                <li>
                  <a href={href('/blog/')}>
                    <span className='dropdown-name'>
                      {productMenuCopy.resourceItems.blog}
                    </span>
                  </a>
                </li>
                <li>
                  <a href={href('/stories/')}>
                    <span className='dropdown-name'>
                      {productMenuCopy.resourceItems.stories}
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
          {/*
            Open Design Cloud (AMR) account entry. Renders BOTH states up front
            and lets `header-enhancer.astro` toggle them at runtime: the
            signed-out "Sign in" link is visible by default (so no-JS / pre-hydration
            shows a working login link), and the signed-in avatar menu stays
            `hidden` until the enhancer confirms a live cloud session via
            `GET {api}/api/auth/get-session`. Config flows through `data-*`
            because the enhancer script cannot read `import.meta.env`.
          */}
          <div
            className='nav-account'
            data-amr-account
            data-amr-api={AMR_API_BASE}
            data-amr-login={AMR_LOGIN_URL}
            data-amr-console={AMR_CONSOLE_URL}
            data-amr-home={href('/')}
          >
            <a className='nav-signin' href={AMR_LOGIN_URL} data-amr-signin>
              {headerCopy.signIn}
            </a>
            <details className='nav-account-menu' data-amr-menu hidden>
              <summary
                className='nav-account-trigger'
                aria-label={headerCopy.accountAria}
                title={headerCopy.accountAria}
              >
                <img className='nav-avatar' alt='' data-amr-avatar />
                <span
                  className='nav-avatar-fallback'
                  data-amr-avatar-fallback
                  aria-hidden='true'
                />
              </summary>
              <div className='nav-account-dropdown' role='menu'>
                <div className='nav-account-id'>
                  <span className='nav-account-name' data-amr-name />
                  <span className='nav-account-email' data-amr-email />
                </div>
                <a
                  className='nav-account-item'
                  role='menuitem'
                  href={AMR_CONSOLE_URL}
                  target='_blank'
                  rel='noreferrer noopener'
                  data-amr-console-link
                >
                  {headerCopy.menuConsole}
                </a>
                <button
                  type='button'
                  className='nav-account-item nav-account-signout'
                  role='menuitem'
                  data-amr-signout
                >
                  {headerCopy.menuSignOut}
                </button>
              </div>
            </details>
          </div>
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
