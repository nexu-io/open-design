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

// OpenDesign Cloud endpoints for the header account module.
// Production defaults; overridable at build time via PUBLIC_* env so a
// preview/staging build can point at a non-prod cloud. These are surfaced to
// the runtime via `data-*` on `.nav-account` because the auth logic lives in
// `header-enhancer.astro`'s `<script is:inline>` (NOT processed by Vite, so it
// cannot read `import.meta.env` itself).
const env = import.meta.env as Record<string, string | undefined>;
const CLOUD_API_BASE =
  env.PUBLIC_CLOUD_API_BASE ?? env.PUBLIC_AMR_API_BASE ?? 'https://amr-api.open-design.ai';
const CLOUD_CONSOLE_URL =
  env.PUBLIC_CLOUD_CONSOLE_URL ??
  env.PUBLIC_AMR_CONSOLE_URL ??
  'https://open-design.ai/cloud/dashboard?source=open_design';

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
  { href: '/solutions/html-to-ppt/', key: 'htmlToPpt' },
];

// Agent column — the coding agents with a dedicated long-form design page
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
  { name: 'DeepSeek Harness', route: 'deepseek-harness-design' },
  { name: 'Trae CLI', route: 'trae-cli-design' },
  { name: 'Aider', route: 'aider-design' },
  { name: 'Antigravity', route: 'antigravity-design' },
  { name: 'DeepSeek Reasonix', route: 'reasonix-design' },
  { name: 'Hermes', route: 'hermes-design' },
  { name: 'Devin for Terminal', route: 'devin-design' },
  { name: 'Pi', route: 'pi-design' },
  { name: 'Kiro CLI', route: 'kiro-design' },
  { name: 'Kilo', route: 'kilo-design' },
  { name: 'Mistral Vibe CLI', route: 'vibe-cli-design' },
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
    | 'codex-slides'
    | 'open-design-plugin'
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
            alt='OpenDesign'
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
            {/* Product — a mega menu whose columns are top-level categories:
                the OpenDesign product family and the Agent catalog today,
                with room to add more (e.g. Feature) as its own column later.
                The trigger is a <button> (not a link) so it never navigates —
                Product used to bounce to the homepage — but its panel is
                revealed by the SAME pure-CSS :hover / :focus-within rule as
                the hub menus, so it works with no JS (first paint / script
                failure) and on touch (tapping focuses the button →
                :focus-within). It lights ONLY for destinations inside the
                mega panel (Codex Plugin, Solutions, /agents/) — footer-only
                product siblings (HTML Anything / HTML Video / Codex Slides)
                intentionally do not light this tab. */}
            {/* `nav-item-mega`: on desktop this li goes position:static so
                the five-column mega panel positions against `.container`
                and centers on it (anchored to the li
                it overflowed narrow desktop widths). */}
            <li className='has-dropdown nav-item-mega'>
              <button
                type='button'
                className={
                  'nav-trigger' +
                  (active === 'product' ||
                  active === 'open-design-plugin' ||
                  active === 'solution' ||
                  active === 'agent'
                    ? ' is-active'
                    : '')
                }
              >
                {productMenuCopy.product}
                <span className='dropdown-caret' aria-hidden='true'>▾</span>
              </button>
              <ul
                className='nav-dropdown nav-dropdown-mega'
                aria-label={productMenuCopy.product}
              >
                {/* Plugin column — the Codex plugin entry. The product
                    family (HTML Anything / HTML Video / Codex Slides) moved
                    to the footer only (2026-08 nav consolidation); the mega
                    panel now carries Plugin + the former Solution groups. */}
                <li className='nav-mega-col nav-mega-col-merged'>
                  {/* Product name as the column head-link, not a translatable
                      phrase — same convention as "Codex Slides" before it.
                      The localized "Plugins" label is reserved for the
                      Resources → /plugins/ catalog hub to avoid one chrome
                      word pointing at two destinations. */}
                  <a
                    href={href('/codex-plugin/')}
                    className={
                      'nav-mega-col-head' +
                      (active === 'open-design-plugin' ? ' is-active' : '')
                    }
                  >
                    Codex Plugin
                  </a>
                </li>
                {/* Former Solution dropdown, folded into the mega panel as
                    three side-by-side columns (Use cases / Roles / Tools). */}
                <li className='nav-mega-col nav-mega-col-merged'>
                  <a
                    href={href('/solutions/')}
                    className={
                      'nav-mega-col-head' + (active === 'solution' ? ' is-active' : '')
                    }
                  >
                    {productMenuCopy.useCases}
                  </a>
                  <ul className='nav-mega-list'>
                    {productMenuCopy.useCaseItems.map((name, index) => (
                      <li key={name}>
                        <a href={href(USE_CASE_HREFS[index]!)}>
                          <span className='dropdown-name'>{name}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
                <li className='nav-mega-col nav-mega-col-merged'>
                  <span className='nav-mega-col-head'>{productMenuCopy.roles}</span>
                  <ul className='nav-mega-list'>
                    {productMenuCopy.roleItems.map((name, index) => (
                      <li key={name}>
                        <a href={href(ROLE_HREFS[index]!)}>
                          <span className='dropdown-name'>{name}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
                <li className='nav-mega-col nav-mega-col-merged'>
                  <span className='nav-mega-col-head'>{productMenuCopy.tools}</span>
                  <ul className='nav-mega-list nav-mega-list-scroll'>
                    {TOOL_ENTRIES.map(({ href: toolHref, key }) => (
                      <li key={key}>
                        <a href={href(toolHref)}>
                          <span className='dropdown-name'>
                            {getSolutionPageCopy(locale, key).breadcrumb}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
                {/* Agent column — the coding agents each with a dedicated
                    design page. The column header links to the /agents/ hub
                    (the old top-level Agent tab's target). The list caps its
                    own height and scrolls so 21 rows never run the panel
                    off-screen; the shorter Products column stays static. */}
                <li className='nav-mega-col nav-mega-col-agent'>
                  <a
                    href={href('/agents/')}
                    className={
                      'nav-mega-col-head' + (active === 'agent' ? ' is-active' : '')
                    }
                  >
                    {productMenuCopy.agent}
                  </a>
                  <ul className='nav-mega-list nav-mega-list-scroll'>
                    {AGENTS.map((agent) => (
                      <li key={agent.route}>
                        <a href={href(`/agents/${agent.route}/`)}>
                          <span className='dropdown-name'>{agent.name}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
                {/* Future category columns (e.g. Feature) drop in here as
                    another <li className='nav-mega-col'> with its own head +
                    list; the panel widens automatically. */}
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
                  active === 'download' ||
                  active === 'plugins' ||
                  active === 'library' ||
                  active === 'skills' ||
                  active === 'systems' ||
                  active === 'templates' ||
                  active === 'craft'
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
                {/* Plugins hub — the former top-level Plugins dropdown folded
                    into Resources as a single hub link (2026-08 nav
                    consolidation); the catalog sub-pages stay one click away
                    on the hub and in the footer. */}
                <li>
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
                    <span className='dropdown-name'>{productMenuCopy.plugins}</span>
                  </a>
                </li>
              </ul>
            </li>

            {/* Community — Contributors / Ambassadors / Moderators / Events. These
                pages are now localized Astro routes, so link through `href()`
                to keep visitors on their language variant. */}
            <li className='has-dropdown'>
              <a
                href={href('/community/')}
                className={active === 'community' ? 'is-active' : undefined}
              >
                {productMenuCopy.community}
                <span className='dropdown-caret' aria-hidden='true'>▾</span>
              </a>
              <ul className='nav-dropdown' aria-label={productMenuCopy.community}>
                <li>
                  <a href={href('/community/contributors/')}>
                    <span className='dropdown-name'>
                      {productMenuCopy.communityItems.contributors}
                    </span>
                  </a>
                </li>
                <li>
                  <a href={href('/community/ambassadors/')}>
                    <span className='dropdown-name'>
                      {productMenuCopy.communityItems.ambassadors}
                    </span>
                  </a>
                </li>
                <li>
                  <a href={href('/community/moderators/')}>
                    <span className='dropdown-name'>
                      {productMenuCopy.communityItems.moderators}
                    </span>
                  </a>
                </li>
                <li>
                  <a href={href('/community/events/')}>
                    <span className='dropdown-name'>Events</span>
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
          {/* GitHub star chip — quiet pill so Download stays the only
              strong CTA in the bar. [data-github-stars] is refreshed by the
              header enhancers (homepage inline script / header-enhancer). */}
          <a
            className='nav-star'
            href={REPO}
            {...ext}
            aria-label='Star OpenDesign on GitHub'
          >
            <svg viewBox='0 0 16 16' width='14' height='14' fill='currentColor' aria-hidden='true'><path d='M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z' /></svg>
            <span data-github-stars>{github?.starsLabel ?? '83K+'}</span>
          </a>
          <a
            className='nav-cta ghost'
            href={href('/download/')}
            aria-label={headerCopy.downloadAria}
            title={headerCopy.downloadTitle}
            data-download-cta
            data-direct-download
            data-download-placement='nav'
          >
            {headerCopy.download}
          </a>
          {/*
            OpenDesign Cloud account entry. Signed-out visitors only see the
            download CTA above; the avatar menu stays `hidden` until the
            enhancer confirms a live cloud session via
            `GET {api}/api/auth/get-session`. Config flows through `data-*`
            because the enhancer script cannot read `import.meta.env`.
          */}
          <div
            className='nav-account'
            data-amr-account
            data-amr-api={CLOUD_API_BASE}
            data-amr-console={CLOUD_CONSOLE_URL}
          >
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
                  href={CLOUD_CONSOLE_URL}
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
