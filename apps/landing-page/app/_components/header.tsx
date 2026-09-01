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

// Pricing can opt into the existing Cloud account menu without restoring it
// across the marketing site. The enhancer reads these values from data-*
// because its inline script cannot access import.meta.env at runtime.
const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
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
const AGENTS: ReadonlyArray<{ name: string; route: string; highlight?: boolean }> = [
  // DeepSeek Harness leads with a red-dot highlight while its integration is
  // the freshly launched entry (2026-08 request); demote when the push ends.
  { name: 'DeepSeek Harness', route: 'deepseek-harness-design', highlight: true },
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
  /** Icon-only language switcher in the action cluster (footer has the twin). */
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
  /** Render the signed-in Cloud avatar/menu. Disabled on marketing pages by default. */
  showAccount?: boolean;
}

export function Header({
  active = 'home',
  github,
  localeSwitcher,
  locale = DEFAULT_LOCALE,
  copy,
  brandHref = '#top',
  showAccount = false,
}: HeaderProps) {
  const headerCopy = copy ?? getCommonCopy(locale).header;
  const href = (path: string) => localizedHref(path, locale);
  const homeBrandHref = brandHref === '/' ? href('/') : brandHref;
  const productMenuCopy = getHeaderProductMenuCopy(locale);
  // Icon-only community entry in the action cluster: Discord for every locale
  // (the zh / zh-tw Feishu group entry was retired in favour of one community).
  const communityLabel =
    locale === 'zh' || locale === 'zh-tw' ? '加入 Discord' : 'Join Discord';
  // Hover card copy: the community hands out credits, say so right at the entry.
  const communityPerk =
    locale === 'zh'
      ? '群内每周发放 Credits'
      : locale === 'zh-tw'
        ? '群內每週發放 Credits'
        : 'Weekly credit drops inside';

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
          Mobile / tablet hamburger. Hidden by CSS at ≥1367px (the desktop
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
                {/* Feature column — the first mega-panel group. The former
                    head-only "Codex Plugin" column read as a blank panel next
                    to the populated Solution/Agent columns (live bug), so the
                    column is now the localized "Feature" category with Codex
                    Plugin as its first entry (2026-08 design). The product
                    family (HTML Anything / HTML Video / Codex Slides) stays
                    footer-only per the 2026-08 nav consolidation. */}
                <li className='nav-mega-col nav-mega-col-merged'>
                  <span className='nav-mega-col-head'>{productMenuCopy.feature}</span>
                  <ul className='nav-mega-list'>
                    {/* Product name, not a translatable phrase — same
                        convention as the Agent column entries. */}
                    <li>
                      <a
                        href={href('/codex-plugin/')}
                        className={
                          active === 'open-design-plugin' ? 'is-active' : undefined
                        }
                      >
                        <span className='dropdown-name'>Codex Plugin</span>
                      </a>
                    </li>
                  </ul>
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
                          <span className='dropdown-name'>
                            {agent.name}
                            {agent.highlight ? (
                              <span className='nav-new-dot' aria-hidden='true'></span>
                            ) : null}
                          </span>
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
                to keep visitors on their language variant. Discord opens the
                community space in a new tab. */}
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
                  <a href={REPO_DISCUSSIONS} {...ext}>
                    <span className='dropdown-name'>
                      {productMenuCopy.communityItems.discussions}
                    </span>
                  </a>
                </li>
              </ul>
            </li>

          </ul>
        </nav>
        <div className='nav-side'>
          <div className='nav-social'>
            <div className='nav-social-item nav-community-entry' data-community-platform='discord'>
              <a
                className='nav-social-link'
                href={DISCORD}
                {...ext}
                aria-label={communityLabel}
                title={communityLabel}
                data-community-cta
                data-community-platform='discord'
              >
                <svg className='nav-social-icon' viewBox='0 0 24 24' width='20' height='20' fill='currentColor' aria-hidden='true'>
                  <path d='M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127c-.598.349-1.22.645-1.873.891a.076.076 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.056c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z' />
                </svg>
                <span className='nav-social-badge' aria-hidden='true' />
              </a>
              <div className='nav-community-qr-card' role='tooltip'>
                <span className='nav-community-card-title'>{communityLabel}</span>
                <span className='nav-community-card-sub'>
                  <span className='nav-community-perk-dot' aria-hidden='true' />
                  {communityPerk}
                </span>
              </div>
            </div>
            <a className='nav-social-link' href={X_PROFILE} {...ext} aria-label='X' title='X'>
              <svg className='nav-social-icon' viewBox='0 0 24 24' width='18' height='18' fill='currentColor' aria-hidden='true'>
                <path d='M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.65l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25h6.815l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z' />
              </svg>
            </a>
            {localeSwitcher ? (
              <details className='locale-switch nav-locale-switch' data-locale-switch>
                <summary
                  className='locale-trigger locale-trigger-iconic nav-social-link nav-locale-trigger'
                  aria-label={localeSwitcher.label}
                  title={localeSwitcher.label}
                >
                  <span className='locale-trigger-icon' aria-hidden='true' />
                </summary>
                <div className='locale-menu' role='menu'>
                  {localeSwitcher.options.map((entry) => (
                    <a
                      className={`locale-menu-item${entry.code === locale ? ' is-active' : ''}`}
                      role='menuitem'
                      data-locale-link
                      data-locale-code={entry.code}
                      href={entry.href}
                      lang={entry.htmlLang}
                      aria-current={entry.code === locale ? 'true' : undefined}
                      key={entry.code}
                    >
                      <span className='locale-menu-code'>{entry.code.toUpperCase()}</span>
                      <span className='locale-menu-label'>{entry.label}</span>
                    </a>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
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
          {showAccount ? (
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
          ) : null}
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
