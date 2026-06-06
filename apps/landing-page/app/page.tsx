/*
 * Open Design — Atelier Zero landing page.
 *
 * Mirrors `design-templates/open-design-landing/example.html` 1:1. When the canonical
 * example.html changes, mirror the diff here and into `app/globals.css`.
 *
 * Static React component rendered by Astro. The Header and Wire components
 * own the small client-side behaviors; promote other sections to Astro
 * islands only when behavior is needed.
 */

import { AMR_URL, Header, type HeaderProps } from './_components/header';
import { Wire } from './_components/wire';
import {
  DEFAULT_LOCALE,
  getCommonCopy,
  getHomePageCopy,
  getLandingUiCopy,
  localizedHref,
  type LandingLocaleCode,
} from './i18n';
import {
  imageAsset,
  PRECISE_LAZY_PLACEHOLDER,
} from './image-assets';
import { getPluginsCopy } from './_lib/plugins-i18n';

/**
 * `<img>` wrapper for non-hero homepage images. Outputs `data-precise-src`
 * so the global IntersectionObserver in `precise-lazyload.astro` swaps it
 * to a real `src` once the element enters viewport ± 300px. Avoids the
 * Chrome native-lazy 1250–3000px over-prefetch on this image-heavy page.
 *
 * Use a plain `<img>` (NOT this) for above-the-fold or LCP-critical images
 * where waiting on IntersectionObserver would defeat the priority hint.
 */
function LazyImg(props: { src: string; alt?: string; className?: string }) {
  return (
    <img
      src={PRECISE_LAZY_PLACEHOLDER}
      data-precise-src={props.src}
      alt={props.alt ?? ''}
      className={props.className}
      decoding='async'
    />
  );
}

function BreakText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((part, index) => (
        <span key={`${part}-${index}`}>
          {index > 0 ? <br /> : null}
          {part}
        </span>
      ))}
    </>
  );
}

const arrowOut = (
  <svg viewBox='0 0 24 24'>
    <path d='M5 19L19 5M19 5H8M19 5v11' />
  </svg>
);

const arrowPlus = (
  <svg className='icon-fill' viewBox='0 0 24 24'>
    <path d='M12 2C17.52 2 22 6.48 22 12C22 17.52 17.52 22 12 22C6.48 22 2 17.52 2 12C2 6.48 6.48 2 12 2ZM12 20C16.42 20 20 16.42 20 12C20 7.58 16.42 4 12 4C7.58 4 4 7.58 4 12C4 16.42 7.58 20 12 20ZM13 12H16L12 16L8 12H11V8H13V12Z' />
  </svg>
);

const NBSP = '\u00A0';

// Canonical project URLs. Keep in sync with design-templates/open-design-landing/example.html.
//
// `data-github-version` invariant: every wrapper must contain ONLY the version
// string (e.g. `v0.3.0`), never any surrounding label or punctuation. The
// inline enhancement script in `app/pages/index.astro` assigns `textContent`
// on each slot, so any extra text inside the wrapper would be clobbered.
const REPO = 'https://github.com/nexu-io/open-design';
const REPO_RELEASES = `${REPO}/releases`;
const REPO_ISSUES = `${REPO}/issues`;
const REPO_CONTRIBUTORS = `${REPO}/graphs/contributors`;
const REPO_DAEMON = `${REPO}/tree/main/apps/daemon`;
const REPO_SKILLS = `${REPO}/tree/main/skills`;
const REPO_DESIGN_SYSTEMS = `${REPO}/tree/main/design-systems`;
const REPO_DOCS = `${REPO}#readme`;
const DISCORD = 'https://discord.gg/9ptkbbqRu';

// Lineage / inspiration projects — make every brand mention clickable.
const LINEAGE = {
  'huashu-design': 'https://github.com/alchaincyf/huashu-design',
  'guizang-ppt': 'https://github.com/op7418/guizang-ppt-skill',
  'multica-ai': 'https://github.com/multica-ai/multica',
  'open-codesign': 'https://github.com/OpenCoworkAI/open-codesign',
  'devin-cli': 'https://devin.ai/terminal',
  hyperframes: 'https://github.com/heygen-com/hyperframes',
} as const;

const ext = {
  target: '_blank',
  rel: 'noreferrer noopener',
} as const;

// Global wire — cities the studio is composed from. The cities feed
// the top counter-scrolling marquee in the editorial ticker between
// the hero and the About section; the bottom contributor marquee is
// owned by `<Wire />`, which fetches the actual repo contributors
// from GitHub at runtime. Keep coordinates rough to fit the
// editorial register.
const WIRE_CITIES = [
  { name: 'Berlin', coord: '52.52°N' },
  { name: 'Tokyo', coord: '35.68°N' },
  { name: 'Shanghai', coord: '31.23°N' },
  { name: 'Beijing', coord: '39.90°N' },
  { name: 'Taipei', coord: '25.03°N' },
  { name: 'Singapore', coord: '1.35°N' },
  { name: 'Bangalore', coord: '12.97°N' },
  { name: 'Dubai', coord: '25.20°N' },
  { name: 'Lagos', coord: '6.52°N' },
  { name: 'Nairobi', coord: '1.29°S' },
  { name: 'Cape Town', coord: '33.92°S' },
  { name: 'Lisbon', coord: '38.72°N' },
  { name: 'Madrid', coord: '40.42°N' },
  { name: 'Paris', coord: '48.86°N' },
  { name: 'London', coord: '51.51°N' },
  { name: 'Amsterdam', coord: '52.37°N' },
  { name: 'Stockholm', coord: '59.33°N' },
  { name: 'Toronto', coord: '43.65°N' },
  { name: 'New York', coord: '40.71°N' },
  { name: 'San Francisco', coord: '37.77°N' },
  { name: 'Mexico City', coord: '19.43°N' },
  { name: 'São Paulo', coord: '23.55°S' },
  { name: 'Sydney', coord: '33.87°S' },
] as const;

/**
 * Question / answer pair for the visible homepage FAQ. The exact same
 * shape is consumed by the FAQPage JSON-LD in `pages/index.astro`, so
 * the two stay in lockstep: every schema entry has a visible answer on
 * the page (which Google requires for the rich result to be eligible).
 */
export interface HomeFaqEntry {
  q: string;
  a: string;
}

interface PageProps {
  /**
   * Live counts from the Markdown catalogs. Required: every visible
   * "X skills / Y systems" claim on the page reads from here so meta,
   * nav, hero copy, capability cards, labs pills, selected-work
   * fractions, and the footer Library never disagree.
   */
  counts: HeaderProps['counts'] & {
    /** Optional richer breakdown used by the Labs filter pills. */
    byMode?: Readonly<Record<string, number>>;
    byPlatform?: Readonly<Record<string, number>>;
    /**
     * Live `/plugins/templates/` category breakdown driving the Labs
     * pills. Ordered by count desc, zero-count categories dropped.
     */
    templateCategories?: {
      total: number;
      byCategory: ReadonlyArray<{ slug: string; count: number }>;
    };
  };
  github: {
    starsLabel: string;
    versionLabel: string;
  };
  /**
   * FAQ pairs the page renders above the contact section. Required so
   * the structured-data block on `/` can reference visible content
   * verbatim — see `FAQ Rules` in `growth/seo-opendesigner-analysis.md`.
   */
  faq: ReadonlyArray<HomeFaqEntry>;
  /** Locale for shared chrome, topbar language links, and localized FAQ text. */
  locale?: LandingLocaleCode;
}

/**
 * Format a count for inline editorial copy. Returns the live value when
 * positive (so a fresh `git pull` immediately reflects the new totals),
 * falls back to a neutral em-dash when the catalog couldn't be read so
 * we never publish "0 skills" to a visitor by mistake.
 */
function fmt(n: number | undefined): string {
  return typeof n === 'number' && n > 0 ? String(n) : '—';
}

/** Two-digit padded count for the Labs pills (matches the "04", "27" feel). */
function pad2(n: number | undefined): string {
  if (typeof n !== 'number' || n <= 0) return '—';
  return n < 10 ? `0${n}` : String(n);
}

export default function Page({
  counts,
  github,
  faq,
  locale = DEFAULT_LOCALE,
}: PageProps) {
  const skills = fmt(counts.skills);
  const systems = fmt(counts.systems);
  const commonCopy = getCommonCopy(locale);
  const home = getHomePageCopy(locale);
  const ui = getLandingUiCopy(locale);
  const pcopy = getPluginsCopy(locale);
  // Labs pills mirror the live `/plugins/templates/` category strip: an
  // "All" chip plus the top categories by count, labelled and counted
  // from the same source so the homepage never drifts from the library.
  const templateCategories = counts.templateCategories;
  const labsPills = templateCategories
    ? templateCategories.byCategory.slice(0, 4).map((c) => ({
        slug: c.slug,
        label:
          pcopy.category[c.slug as keyof typeof pcopy.category]?.label ?? c.slug,
        count: pad2(c.count),
      }))
    : [];
  const href = (path: string) => localizedHref(path, locale);

  /*
   * Frontier model brands AMR routes to, shown as a monochrome logo strip
   * (mirrors opencode's Zen band). Names are display-only and not part of
   * the localized copy — they are product/brand marks. The SVGs in
   * /public/agents/ use fill="currentColor"; rendered through <img> they
   * resolve against the SVG's own default ink (near-black), so the strip
   * reads as one dark monochrome row. (An <img>-loaded SVG renders in an
   * isolated context and cannot inherit the page's `color`, so recoloring
   * the strip would require inlining the SVGs or a CSS mask — not a one-
   * line `color:` change.)
   */
  const amrModelLogos: ReadonlyArray<{ slug: string; name: string }> = [
    { slug: 'openai', name: 'OpenAI' },
    { slug: 'anthropic', name: 'Anthropic' },
    { slug: 'gemini', name: 'Google Gemini' },
    { slug: 'deepseek', name: 'DeepSeek' },
    { slug: 'zhipu', name: 'Zhipu GLM' },
    { slug: 'moonshot', name: 'Moonshot Kimi' },
    { slug: 'qwen', name: 'Qwen' },
    { slug: 'minimax', name: 'MiniMax' },
    { slug: 'xiaomi', name: 'Xiaomi MiMo' },
    { slug: 'xai', name: 'xAI' },
  ];

  return (
    <>
      {/* side rails (rotated brand text) */}
      <div className='side-rail right' data-od-id='rail-right'>
        <span className='rail-text'>{home.rail.right}</span>
      </div>
      <div className='side-rail left' data-od-id='rail-left'>
        <span className='rail-text'>{home.rail.left}</span>
      </div>

      <div className='shell'>
        {/* ====== STICKY CHROME (topbar + nav as one unit) ====== */}
        <div className='site-chrome' data-chrome-headroom>
        {/* ====== NAV ====== */}
        {/* Headroom slide handled by `.site-chrome` wrapper above. */}
        <Header counts={counts} github={github} locale={locale} />
        </div>{/* /site-chrome */}

        {/* ====== HERO ====== */}
        <section className='hero' id='top' data-od-id='hero'>
          <div className='container hero-grid'>
            <div className='hero-copy'>
              <h1 className='display' data-reveal>
                {home.hero.titlePrefix}
                {home.hero.titleEmphasis ? (
                  <>
                    {home.hero.titlePrefix ? ' ' : null}
                    <em>{home.hero.titleEmphasis}</em>
                    {home.hero.titleBreakAfterEmphasis ? <br /> : null}
                  </>
                ) : null}
                {home.hero.titleMiddle ? (
                  <>
                    {home.hero.titleBreakAfterEmphasis ? null : ' '}
                    <span className='hero-title-line'>{home.hero.titleMiddle}</span>
                  </>
                ) : null}
                {home.hero.titleSecondEmphasis ? (
                  <>
                    {' '}
                    <em>{home.hero.titleSecondEmphasis}</em>
                  </>
                ) : null}
                <span className='dot'>.</span>
              </h1>
              <p className='lead' data-reveal>
                <BreakText text={home.hero.lead(skills, systems)} />
              </p>
              <div className='hero-actions' data-reveal>
                <a className='btn btn-ghost' href={REPO} {...ext}>
                  {home.hero.star}
                  <span className='arrow'>
                    <svg className='icon-fill' viewBox='0 0 24 24' fill='currentColor'>
                      <path d='M16.0037 9.41421L7.39712 18.0208L5.98291 16.6066L14.5895 8H7.00373V6H18.0037V17H16.0037V9.41421Z' />
                    </svg>
                  </span>
                </a>
                <a className='btn btn-primary' href={REPO_RELEASES} data-download-cta {...ext}>
                  {home.hero.download}
                  <span className='download-arch' data-download-arch hidden />
                  <span className='arrow arrow-fill'>{arrowPlus}</span>
                </a>
              </div>
              <div className='hero-stats' data-reveal>
                <div className='stat'>
                  <span className='ring solid'>{skills}</span>
                  <span className='stat-label'>
                    <b>{home.hero.stats[0].strong}</b>
                    {home.hero.stats[0].text}
                  </span>
                </div>
                <div className='stat'>
                  <span className='ring'>{systems}</span>
                  <span className='stat-label'>
                    <b>{home.hero.stats[1].strong}</b>
                    {home.hero.stats[1].text}
                  </span>
                </div>
                <div className='stat'>
                  <span className='ring coral'>12</span>
                  <span className='stat-label'>
                    <b>{home.hero.stats[2].strong}</b>
                    {home.hero.stats[2].text}
                  </span>
                </div>
              </div>
            </div>
            <div className='hero-scene-wrap'>
              <img
                className='hero-scene'
                src='/hero-scene.gif'
                alt=''
                width={132}
                height={186}
                aria-hidden='true'
                data-hero-scene
              />
            </div>
            <img
              className='hero-dancer'
              src={imageAsset('hero-dancer.png', { width: 560, quality: 82 })}
              alt=''
              width={694}
              height={1097}
              aria-hidden='true'
              loading='lazy'
            />
            <img
              className='hero-angel'
              src={imageAsset('hero-angel.png', { width: 760, quality: 82 })}
              alt=''
              width={1002}
              height={1239}
              aria-hidden='true'
              loading='lazy'
            />
          </div>
        </section>

        {/* ====== WIRE / GLOBAL TICKER ====== */}
        {/*
         * Slim editorial ticker between the hero and About. Two
         * counter-scrolling marquees signal that the project is
         * global (cities, top row) and contributor-driven (handles,
         * bottom row). Pure CSS animation; the track content is
         * doubled in markup so the loop wraps seamlessly.
         *
         * Lives inside a client island because the contributor row is
         * fetched live from the GitHub contributors API; the cities
         * row is passed through as static data.
         */}
        <Wire cities={WIRE_CITIES} />

        {/* ====== OFFICIAL SOURCE STRIP ======
         *
         * Thin attestation band that reinforces the canonical surfaces:
         * official site, GitHub repo, releases, download, docs, Discord.
         * Mirrors the Organization.sameAs + SoftwareApplication signals
         * emitted in `pages/index.astro` so both Google entity-merge and
         * human verification see the same six links in the same order.
         * Keep this small (one line of icons + labels); the editorial
         * sections below carry the heavy explanation.
         */}
        <section
          className='official-strip'
          data-od-id='official-strip'
          aria-label={home.official.aria}
        >
          <div className='container'>
            <div className='official-strip-inner' data-reveal>
              <span className='official-strip-label'>
                {home.official.label} <span className='ix'>· Nº 00</span>
              </span>
              <ul className='official-strip-list'>
                <li>
                  <a href={href('/official/')}>
                    <span className='label'>{home.official.items[0].label}</span>
                    <span className='value'>{home.official.items[0].value}</span>
                  </a>
                </li>
                <li>
                  <a href={REPO} {...ext}>
                    <span className='label'>{home.official.items[1].label}</span>
                    <span className='value'>{home.official.items[1].value}</span>
                  </a>
                </li>
                <li>
                  <a href={REPO_RELEASES} {...ext}>
                    <span className='label'>{home.official.items[2].label}</span>
                    <span className='value' data-github-version>
                      {github.versionLabel}
                    </span>
                  </a>
                </li>
                <li>
                  <a href={REPO_RELEASES} {...ext}>
                    <span className='label'>{home.official.items[3].label}</span>
                    <span className='value'>{home.official.items[3].value}</span>
                  </a>
                </li>
                <li>
                  <a href={REPO_DOCS} {...ext}>
                    <span className='label'>{home.official.items[4].label}</span>
                    <span className='value'>{home.official.items[4].value}</span>
                  </a>
                </li>
                <li>
                  <a href={DISCORD} {...ext}>
                    <span className='label'>{home.official.items[5].label}</span>
                    <span className='value'>{home.official.items[5].value}</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ====== ABOUT ====== */}
        <section className='about' data-od-id='about'>
          <div className='container'>
            <div className='sec-rule'>
              <span className='roman'>I.</span>
              <span className='meta-grp'>
                <span>{home.about.rule}</span>
                <span className='dot-mark'>•</span>
                <span>{home.about.volume}</span>
              </span>
              <span>002 / 008</span>
            </div>
            <div className='about-grid'>
              <div className='about-copy' data-reveal>
                <span className='label'>
                  {home.about.label} <span className='ix'>· Nº 02</span>
                </span>
                <h2 className='display'>
                  {home.about.titlePrefix} <em>{home.about.titleAgent}</em>{' '}
                  {home.about.titleMiddle} <em>{home.about.titleCollaborator}</em>{' '}
                  {home.about.titleSuffix}
                  <span className='dot'>.</span>
                </h2>
                <p className='lead'>{home.about.lead}</p>
                <a className='btn btn-ghost' href={REPO_DAEMON} {...ext}>
                  {home.about.approach}
                  <span className='arrow'>{arrowOut}</span>
                </a>
                <div className='footer-row'>
                  <span className='mark'>Ø</span>
                  <span>{home.about.practice}</span>
                  <span className='stamp'>
                    <span>{home.about.stampTop}</span>
                    <span style={{ color: 'var(--ink)' }}>
                      {home.about.stampBottom}
                    </span>
                  </span>
                </div>
              </div>
              <div className='about-art' data-reveal='right'>
                <LazyImg src={imageAsset('about.png', { width: 1024, quality: 82 })} />
                <div className='about-side-note'>
                  <b />
                  {home.about.sideNote.map((line) => (
                    <span key={line}>
                      {line}
                      <br />
                    </span>
                  ))}
                </div>
                <div className='about-caption'>
                  <b>{home.about.caption}</b>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ====== CAPABILITIES ====== */}
        <section
          className='capabilities'
          id='agents'
          data-od-id='capabilities'
        >
          <div className='container'>
            <div className='sec-rule'>
              <span className='roman'>II.</span>
              <span className='meta-grp'>
                <span>{home.capabilities.rule}</span>
                <span className='dot-mark'>•</span>
                <span>{home.capabilities.surfaces}</span>
              </span>
              <span>003 / 008</span>
            </div>
            <div className='capabilities-grid'>
              <div className='capabilities-art' data-reveal='left'>
                <span className='corner tl' />
                <span className='corner br' />
                <LazyImg src={imageAsset('capabilities.png', { width: 1024, quality: 82 })} />
                <div className='ribbon'>
                  <b>{home.capabilities.ribbon}</b>
                </div>
              </div>
              <div className='capabilities-copy' data-reveal>
                <span className='label'>
                  {home.capabilities.label} <span className='ix'>· Nº 03</span>
                </span>
                <h2 className='display'>
                  {home.capabilities.titlePrefix}{' '}
                  <em>{home.capabilities.titleEmphasis}</em>{' '}
                  {home.capabilities.titleSuffix}
                  <span className='dot'>.</span>
                </h2>
                <p className='lead'>{home.capabilities.lead}</p>
                <div className='cards'>
                  <div className='card' data-reveal>
                    <div className='num'>
                      01<span className='tag'>{home.capabilities.cards[0].tag}</span>
                    </div>
                    <svg
                      className='icon'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='1.5'
                    >
                      <circle cx='9' cy='9' r='5' />
                      <path d='M14 14l5 5' />
                    </svg>
                    <h3>
                      <BreakText text={home.capabilities.cards[0].title} />
                    </h3>
                    <p>{home.capabilities.cards[0].body(skills, systems)}</p>
                    <a
                      className='arrow-mark'
                      href={REPO_SKILLS}
                      aria-label={home.capabilities.cards[0].aria}
                      {...ext}
                    >
                      {arrowOut}
                    </a>
                  </div>
                  <div className='card' data-reveal>
                    <div className='num'>
                      02<span className='tag'>{home.capabilities.cards[1].tag}</span>
                    </div>
                    <svg
                      className='icon'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='1.5'
                    >
                      <rect x='3.5' y='3.5' width='8' height='8' />
                      <rect x='12.5' y='3.5' width='8' height='8' />
                      <rect x='3.5' y='12.5' width='8' height='8' />
                      <rect x='12.5' y='12.5' width='8' height='8' />
                    </svg>
                    <h3>
                      <BreakText text={home.capabilities.cards[1].title} />
                    </h3>
                    <p>{home.capabilities.cards[1].body(skills, systems)}</p>
                    <a
                      className='arrow-mark'
                      href={REPO_DESIGN_SYSTEMS}
                      aria-label={home.capabilities.cards[1].aria}
                      {...ext}
                    >
                      {arrowOut}
                    </a>
                  </div>
                  <div className='card' data-reveal>
                    <div className='num'>
                      03<span className='tag'>{home.capabilities.cards[2].tag}</span>
                    </div>
                    <svg
                      className='icon'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='1.5'
                    >
                      <circle cx='8' cy='12' r='4.5' />
                      <circle cx='16' cy='12' r='4.5' />
                    </svg>
                    <h3>
                      <BreakText text={home.capabilities.cards[2].title} />
                    </h3>
                    <p>{home.capabilities.cards[2].body(skills, systems)}</p>
                    <a
                      className='arrow-mark'
                      href={REPO_DAEMON}
                      aria-label={home.capabilities.cards[2].aria}
                      {...ext}
                    >
                      {arrowOut}
                    </a>
                  </div>
                  <div className='card' data-reveal>
                    <div className='num'>
                      04<span className='tag'>{home.capabilities.cards[3].tag}</span>
                    </div>
                    <svg
                      className='icon'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='1.5'
                    >
                      <path d='M5 8h14v8H5z' />
                      <path d='M9 12h6M12 9v6' />
                    </svg>
                    <h3>
                      <BreakText text={home.capabilities.cards[3].title} />
                    </h3>
                    <p>{home.capabilities.cards[3].body(skills, systems)}</p>
                    <a
                      className='arrow-mark'
                      href={REPO}
                      aria-label={home.capabilities.cards[3].aria}
                      {...ext}
                    >
                      {arrowOut}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ====== LABS ====== */}
        <section className='labs' id='labs' data-od-id='labs'>
          <div className='container'>
            <div className='sec-rule'>
              <span className='roman'>III.</span>
              <span className='meta-grp'>
                <span>{home.labs.rule}</span>
                <span className='dot-mark'>•</span>
                <span>{home.labs.ongoing(skills)}</span>
              </span>
              <span>004 / 008</span>
            </div>
            <div className='labs-head'>
              <div data-reveal>
                <span className='label'>
                  {home.labs.label} <span className='ix'>· Nº 04</span>
                </span>
                <h2 className='display' style={{ marginTop: 30 }}>
                  {home.labs.titlePrefix} <em>{home.labs.titleEmphasis}</em>{' '}
                  {home.labs.titleSuffix}
                  <span className='dot'>.</span>
                </h2>
              </div>
              <div className='pills' data-reveal='right'>
                <a className='pill active' href={href('/plugins/templates/')}>
                  {pcopy.allChip}
                  <span className='count'>
                    {templateCategories ? fmt(templateCategories.total) : skills}
                  </span>
                </a>
                {labsPills.map((pill) => (
                  <a
                    key={pill.slug}
                    className='pill'
                    href={href(`/plugins/templates/${pill.slug}/`)}
                  >
                    {pill.label}
                    <span className='count'>{pill.count}</span>
                  </a>
                ))}
              </div>
            </div>
            <div className='labs-meta'>
              <span className='ring'>05</span>
              <div className='meta-text'>
                <b>{home.labs.metaTitle}</b>
                <BreakText text={home.labs.metaBody} />
              </div>
            </div>
            <div className='labs-grid'>
              {[
                {
                  badge: home.labs.items[0].badge,
                  num: 'Nº 01',
                  title: home.labs.items[0].title,
                  body: home.labs.items[0].body,
                  src: imageAsset('lab-1.png', { width: 768, quality: 82 }),
                  href: `${REPO_SKILLS}/guizang-ppt`,
                },
                {
                  badge: home.labs.items[1].badge,
                  num: 'Nº 02',
                  title: home.labs.items[1].title,
                  body: home.labs.items[1].body,
                  src: imageAsset('lab-2.png', { width: 768, quality: 82 }),
                  href: `${REPO_SKILLS}/hyperframes`,
                },
                {
                  badge: home.labs.items[2].badge,
                  num: 'Nº 03',
                  title: home.labs.items[2].title,
                  body: home.labs.items[2].body,
                  src: imageAsset('lab-3.png', { width: 768, quality: 82 }),
                  href: `${REPO_SKILLS}/design-brief`,
                },
                {
                  badge: home.labs.items[3].badge,
                  num: 'Nº 04',
                  title: home.labs.items[3].title,
                  body: home.labs.items[3].body,
                  src: imageAsset('lab-4.png', { width: 768, quality: 82 }),
                  href: `${REPO_SKILLS}/critique`,
                },
                {
                  badge: home.labs.items[4].badge,
                  num: 'Nº 05',
                  title: home.labs.items[4].title,
                  body: home.labs.items[4].body,
                  src: imageAsset('lab-5.png', { width: 768, quality: 82 }),
                  href: REPO_DAEMON,
                },
              ].map((lab) => (
                <div className='lab' key={lab.num} data-reveal>
                  <div className='lab-img'>
                    <span className='badge'>{lab.badge}</span>
                    <LazyImg src={lab.src} />
                  </div>
                  <div className='num-row'>
                    <span>{lab.num}</span>
                    <span>2026</span>
                  </div>
                  <h4>{lab.title}</h4>
                  <p>{lab.body}</p>
                  <a
                    className='arrow-mark'
                    href={lab.href}
                    aria-label={home.labs.openAria(lab.title)}
                    {...ext}
                  >
                    {arrowOut}
                  </a>
                </div>
              ))}
            </div>
            <div className='labs-foot'>
              <div className='progress'>
                <span className='on' />
                <span className='on' />
                <span className='on' />
                <span className='on' />
                <span className='on' />
                <span />
                <span />
                <span />
              </div>
              <span className='meta'>
                {home.labs.foot(skills)}
                {NBSP}·{NBSP}
                <a
                  href={href('/plugins/skills/')}
                  className='library-link'
                  style={{ color: 'var(--coral)' }}
                >
                  {home.labs.viewLibrary}
                </a>
              </span>
            </div>
          </div>
        </section>

        {/* ====== METHOD ====== */}
        <section className='method' data-od-id='method'>
          <div className='container'>
            <div className='sec-rule'>
              <span className='roman'>IV.</span>
              <span className='meta-grp'>
                <span>{home.method.rule}</span>
                <span className='dot-mark'>•</span>
                <span>{home.method.stages}</span>
              </span>
              <span>005 / 008</span>
            </div>
            <div className='method-head'>
              <div data-reveal>
                <span className='label'>
                  {home.method.label} <span className='ix'>· Nº 05</span>
                </span>
                <h2 className='display' style={{ marginTop: 30 }}>
                  {home.method.titlePrefix} <em>{home.method.titleEmphasis}</em>{' '}
                  {home.method.titleSuffix}
                  <span className='dot'>.</span>
                </h2>
              </div>
              <div className='right' data-reveal='right'>
                <span className='plus'>+</span>
                <p>{home.method.lead}</p>
              </div>
            </div>
            <div className='method-grid'>
              {[
                {
                  num: '01',
                  title: home.method.steps[0].title,
                  body: home.method.steps[0].body(skills, systems),
                  src: imageAsset('method-1.png', { width: 816, quality: 82 }),
                },
                {
                  num: '02',
                  title: home.method.steps[1].title,
                  body: home.method.steps[1].body(skills, systems),
                  src: imageAsset('method-2.png', { width: 816, quality: 82 }),
                },
                {
                  num: '03',
                  title: home.method.steps[2].title,
                  body: home.method.steps[2].body(skills, systems),
                  src: imageAsset('method-3.png', { width: 816, quality: 82 }),
                },
                {
                  num: '04',
                  title: home.method.steps[3].title,
                  body: home.method.steps[3].body(skills, systems),
                  src: imageAsset('method-4.png', { width: 816, quality: 82 }),
                },
              ].map((step) => (
                <div className='method-step' key={step.num} data-reveal>
                  <div className='num'>{step.num}</div>
                  <h4>
                    {step.title} <span className='arrow-r'>→</span>
                  </h4>
                  <p>{step.body}</p>
                  <div className='img'>
                    <LazyImg src={step.src} />
                  </div>
                </div>
              ))}
            </div>
            <div className='method-foot'>
              <div className='left'>
                <span className='ring' />
                <span>{home.method.footLeft}</span>
              </div>
              <div className='right'>
                <a className='method-repo-link' href={REPO} {...ext}>
                  <b>github.com/nexu-io/open-design</b>
                </a>
                {NBSP}·{NBSP}Apache-2.0
              </div>
            </div>
          </div>
        </section>

        {/* ====== SELECTED WORK ====== */}
        <section className='tight' data-od-id='work'>
          <div className='work'>
            <div className='work-rule'>
              <span className='roman'>V.</span>
              <span style={{ display: 'inline-flex', gap: 24 }}>
                <span>{home.work.rule}</span>
                <span style={{ color: 'var(--coral)' }}>•</span>
                <span>{home.work.editedBy}</span>
              </span>
              <span>006 / 008</span>
            </div>
            <div className='work-grid'>
              <div className='work-copy' data-reveal>
                <span className='label'>{home.work.label}</span>
                <h2>
                  {home.work.titlePrefix} <em>{home.work.titleEmphasisA}</em>{' '}
                  {home.work.titleMiddle} <em>{home.work.titleEmphasisB}</em>{' '}
                  {home.work.titleSuffix}
                  <span className='dot'>.</span>
                </h2>
                <a className='work-link' href={href('/plugins/skills/')}>
                  {home.work.viewAll(skills)}
                </a>
              </div>
              <a
                className='work-card'
                data-reveal
                href={`${REPO_SKILLS}/guizang-ppt`}
                {...ext}
              >
                <div className='label-row'>
                  <span className='small-label'>{home.work.cards[0].label}</span>
                  <span className='index'>01 / {skills}</span>
                </div>
                <h3>{home.work.cards[0].title}</h3>
                <p>{home.work.cards[0].body}</p>
                <div className='img'>
                  <LazyImg src={imageAsset('work-1.png', { width: 768, quality: 82 })} />
                </div>
                <div className='meta-row'>
                  <span className='year'>{home.work.cards[0].metaLeft}</span>
                  <span>{home.work.cards[0].metaRight}</span>
                </div>
              </a>
              <a
                className='work-card alt'
                data-reveal
                href='https://github.com/tw93/kami'
                {...ext}
              >
                <div className='label-row'>
                  <span className='small-label'>{home.work.cards[1].label}</span>
                  <span className='index'>04 / {systems}</span>
                </div>
                <h3>{home.work.cards[1].title}</h3>
                <p>{home.work.cards[1].body}</p>
                <div className='img'>
                  <LazyImg src={imageAsset('work-2.png', { width: 768, quality: 82 })} />
                </div>
                <div className='meta-row'>
                  <span className='year'>{home.work.cards[1].metaLeft}</span>
                  <span>{home.work.cards[1].metaRight}</span>
                </div>
              </a>
            </div>
            <div className='work-arrows'>
              <button type='button' className='nav-btn' data-carousel-dir='prev'>
                <svg
                  width='14'
                  height='14'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='1.6'
                >
                  <path d='M14 6l-6 6 6 6' />
                </svg>
              </button>
              <button type='button' className='nav-btn active' data-carousel-dir='next'>
                <svg
                  width='14'
                  height='14'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='1.6'
                >
                  <path d='M10 6l6 6-6 6' />
                </svg>
              </button>
            </div>
          </div>
        </section>

        {/* ====== TESTIMONIAL / COLLABORATORS ====== */}
        <section className='testimonial' data-od-id='testimonial'>
          <div className='container'>
            <div className='sec-rule'>
              <span className='roman'>VI.</span>
              <span className='meta-grp'>
                <span>{home.testimonial.rule}</span>
                <span className='dot-mark'>•</span>
                <span>{home.testimonial.shoulders}</span>
              </span>
              <span>007 / 008</span>
            </div>
            <div className='testimonial-grid'>
              <div className='testimonial-copy' data-reveal>
                <span className='label'>
                  {home.testimonial.label} <span className='ix'>· Nº 06</span>
                </span>
                <h2 style={{ marginTop: 30 }}>
                  {home.testimonial.quote}
                </h2>
                <div className='author'>
                  <span className='avatar'>m</span>
                  <p>
                    {home.testimonial.authorName}
                    <br />
                    <span>{home.testimonial.authorTitle}</span>
                  </p>
                </div>
                <div className='divider' />
                <p className='partners-text'>
                  {home.testimonial.partnersText}
                </p>
                <div className='partners'>
                  <a
                    className='partner'
                    data-reveal
                    href={LINEAGE['huashu-design']}
                    {...ext}
                  >
                    <div className='glyph'>
                      <svg
                        viewBox='0 0 80 30'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='2'
                      >
                        <path d='M5 24L20 6L35 24M12 18h16' />
                      </svg>
                    </div>
                    <span>huashu-design</span>
                    <small>{home.testimonial.partnerLabels[0]}</small>
                  </a>
                  <a
                    className='partner'
                    data-reveal
                    href={LINEAGE['guizang-ppt']}
                    {...ext}
                  >
                    <div className='glyph'>
                      <svg
                        viewBox='0 0 80 30'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='2'
                      >
                        <path d='M8 24L20 6L24 22L36 4' />
                      </svg>
                    </div>
                    <span>guizang-ppt</span>
                    <small>{home.testimonial.partnerLabels[1]}</small>
                  </a>
                  <a
                    className='partner'
                    data-reveal
                    href={LINEAGE['open-codesign']}
                    {...ext}
                  >
                    <div className='glyph'>
                      <svg
                        viewBox='0 0 80 30'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='2'
                      >
                        <circle cx='15' cy='15' r='9' />
                        <path d='M15 6v18M6 15h18' />
                      </svg>
                    </div>
                    <span>open-codesign</span>
                    <small>{home.testimonial.partnerLabels[2]}</small>
                  </a>
                  <a
                    className='partner'
                    data-reveal
                    href={LINEAGE['devin-cli']}
                    {...ext}
                  >
                    <div className='glyph'>
                      <svg
                        viewBox='0 0 80 30'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='2'
                      >
                        <path d='M5 8l9 7-9 7M20 24h18' />
                      </svg>
                    </div>
                    <span>Devin CLI</span>
                    <small>{home.testimonial.partnerLabels[3]}</small>
                  </a>
                  <a
                    className='partner'
                    data-reveal
                    href={LINEAGE['hyperframes']}
                    {...ext}
                  >
                    <div className='glyph'>
                      <svg
                        viewBox='0 0 80 30'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='2'
                      >
                        <rect x='4' y='5' width='22' height='18' />
                        <rect x='14' y='9' width='22' height='18' />
                      </svg>
                    </div>
                    <span>hyperframes</span>
                    <small>{home.testimonial.partnerLabels[4]}</small>
                  </a>
                </div>
                <a className='read-more' href={href('/solutions/')}>
                  {home.testimonial.readMore}
                </a>
              </div>
              <div className='testimonial-art' data-reveal='right'>
                <LazyImg src={imageAsset('testimonial.png', { width: 1024, quality: 82 })} />
              </div>
            </div>
          </div>
        </section>

        {/* ====== AMR band ======
          The "Open Design AMR" model band: AMR is the built-in design Agent
          that ships SOTA frontier models out of the box (zero provider setup,
          real token-metered billing). Sits directly under the testimonial,
          outside the roman-numbered main sequence. A static monochrome row of
          vendor logos, trailing with an ellipsis to signal "and more". */}
        <section className='amr-band' data-od-id='amr-band' data-reveal>
          <div className='container'>
            <div className='amr-band-inner'>
              <span className='amr-band-kicker'>{home.amrBand.kicker}</span>
              <h2 className='amr-band-title'>{home.amrBand.title}</h2>
              <p className='amr-band-lead'>{home.amrBand.lead}</p>
              <ul className='amr-band-chips' aria-label={home.amrBand.kicker}>
                {home.amrBand.chips.map((chip) => (
                  <li className='amr-band-chip' key={chip}>
                    <span className='amr-band-chip-dot' aria-hidden='true' />
                    {chip}
                  </li>
                ))}
              </ul>
              <ul
                className='amr-band-logos'
                aria-label={home.amrBand.logosAriaLabel}
              >
                {amrModelLogos.map((m) => (
                  <li key={m.slug}>
                    <img
                      className='amr-band-logo'
                      src={`/agents/${m.slug}.svg`}
                      alt={m.name}
                      title={m.name}
                      width={26}
                      height={26}
                      loading='lazy'
                    />
                  </li>
                ))}
                <li className='amr-band-more' aria-label={home.amrBand.moreAriaLabel}>
                  …
                </li>
              </ul>
              <div className='amr-band-actions'>
                <a className='nav-cta amr-band-cta' href={AMR_URL}>
                  {home.amrBand.cta}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ====== FAQ ======
         *
         * Visible answers — kept in lockstep with the FAQPage JSON-LD
         * defined in `app/pages/index.astro`. Each entry mirrors the
         * `q`/`a` pair, so the structured data describes content the
         * user actually sees (Google's rich-result eligibility rule).
         */}
        <section className='faq' id='faq' data-od-id='faq'>
          <div className='container'>
            <div className='sec-rule'>
              <span className='roman'>VI·5.</span>
              <span className='meta-grp'>
                <span>{home.faqSection.rule}</span>
                <span className='dot-mark'>•</span>
                <span>{home.faqSection.answers}</span>
              </span>
              <span>{`00${faq.length}`.slice(-3)} / 008</span>
            </div>
            <div className='faq-head' data-reveal>
              <span className='label'>
                {home.faqSection.label} <span className='ix'>· Nº 06.5</span>
              </span>
              <h2 className='display'>
                {home.faqSection.titlePrefix} <em>Open Design</em>,{' '}
                <em>OpenDesign</em>, {home.faqSection.titleMiddle}{' '}
                <em>{home.faqSection.titleSuffix}</em>
                <span className='dot'>.</span>
              </h2>
            </div>
            <ol className='faq-list'>
              {faq.map(({ q, a }, idx) => (
                <li className='faq-item' key={q} data-reveal>
                  <details>
                    <summary>
                      <span className='faq-index'>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className='faq-q'>{q}</span>
                      <span className='faq-toggle' aria-hidden='true'>
                        +
                      </span>
                    </summary>
                    <p className='faq-a'>{a}</p>
                  </details>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ====== CTA ====== */}
        <section className='cta' id='contact' data-od-id='cta'>
          <div className='container'>
            <div className='sec-rule'>
              <span className='roman'>VII.</span>
              <span className='meta-grp'>
                <span>{home.cta.rule}</span>
                <span className='dot-mark'>•</span>
                <span>{home.cta.command}</span>
              </span>
              <span>008 / 008</span>
            </div>
            <div className='cta-grid'>
              <div data-reveal>
                <span className='label'>
                  {home.cta.label} <span className='ix'>· Nº 07</span>
                </span>
                <h2 className='display'>
                  {home.cta.titlePrefix} <em>{home.cta.titleOpen}</em>{' '}
                  {home.cta.titleMiddle} <em>{home.cta.titleVisual}</em>{' '}
                  {home.cta.titleSuffix}
                  <span className='dot'>.</span>
                </h2>
                <p className='lead'>{home.cta.lead}</p>
                <div className='cta-actions'>
                  <a className='btn btn-primary' href={REPO} {...ext}>
                    {home.cta.star}
                    <span className='arrow'>{arrowOut}</span>
                  </a>
                  <a className='email-pill' href={REPO_ISSUES} {...ext}>
                    {home.cta.issue}
                    <span className='arrow-circle'>→</span>
                  </a>
                </div>
                <div className='cta-foot'>
                  <span className='stamp'>● {home.cta.live}</span>
                  <span>
                    <span data-github-version>{github.versionLabel}</span> / Apache-2.0
                  </span>
                  <span style={{ marginLeft: 'auto' }}>
                    52.5200° N · 13.4050° E
                  </span>
                </div>
              </div>
              <div className='cta-art' data-reveal='right'>
                <LazyImg src={imageAsset('cta.png', { width: 1024, quality: 82 })} />
                <div className='index'>Nº 08</div>
                <div className='ribbon'>
                  {home.cta.ribbon}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ====== NEWSLETTER ====== */}
        <section className='newsletter' id='newsletter' data-od-id='newsletter'>
          <div className='container'>
            <div className='newsletter-card' data-reveal>
              <div className='newsletter-copy'>
                <span className='label'>{home.newsletter.label}</span>
                <h2 className='newsletter-title'>{home.newsletter.title}</h2>
                <p className='lead'>{home.newsletter.lead}</p>
              </div>
              <form
            className='newsletter-form'
            data-newsletter-form
            data-source='landing'
            data-success={home.newsletter.success}
            data-error={home.newsletter.error}
          >
                <input
                  className='newsletter-input'
                  type='email'
                  name='email'
                  required
                  autoComplete='email'
                  placeholder={home.newsletter.placeholder}
                  aria-label={home.newsletter.placeholder}
                  data-newsletter-email
                />
                <button className='btn btn-primary newsletter-submit' type='submit'>
                  {home.newsletter.button}
                </button>
                <p className='newsletter-msg' data-newsletter-msg aria-live='polite'></p>
              </form>
            </div>
          </div>
        </section>

        {/* ====== NEWSLETTER POPUP (hidden until JS shows it) ====== */}
        <aside
          className='newsletter-popup'
          data-newsletter-popup
          hidden
          role='dialog'
          aria-label={home.newsletter.title}
        >
          <button
            className='newsletter-popup__close'
            type='button'
            data-newsletter-dismiss
            aria-label={home.newsletter.dismiss}
          >
            ×
          </button>
          <span className='label'>{home.newsletter.label}</span>
          <h3 className='newsletter-popup__title'>{home.newsletter.title}</h3>
          <p className='newsletter-popup__lead'>{home.newsletter.lead}</p>
          <form
            className='newsletter-form'
            data-newsletter-form
            data-source='landing'
            data-success={home.newsletter.success}
            data-error={home.newsletter.error}
          >
            <input
              className='newsletter-input'
              type='email'
              name='email'
              required
              autoComplete='email'
              placeholder={home.newsletter.placeholder}
              aria-label={home.newsletter.placeholder}
              data-newsletter-email
            />
            <button className='btn btn-primary newsletter-submit' type='submit'>
              {home.newsletter.button}
            </button>
            <p className='newsletter-msg' data-newsletter-msg aria-live='polite'></p>
          </form>
        </aside>

        {/* ====== FOOTER ====== */}
        <footer data-od-id='footer'>
          <div className='container'>
            <div className='foot-grid'>
              <div className='foot-brand'>
                <a href='#top' className='brand'>
                  <img
                    className='brand-logo'
                    src='/open-design-brand.svg'
                    alt='Open Design'
                    width={204}
                    height={83}
                  />
                </a>
                <p style={{ marginTop: 18 }}>
                  {home.footer.summary}
                </p>
                <a
                  className='foot-cta'
                  href={REPO_RELEASES}
                  aria-label={home.footer.downloadAria}
                  data-download-cta
                  {...ext}
                >
                  {home.footer.download}
                  <span className='meta'>
                    <span data-download-os>macOS</span> ·{' '}
                    <span data-github-version>{github.versionLabel}</span>
                  </span>
                </a>
              </div>
              <div className='foot-col'>
                <h5>{ui.footer.products}</h5>
                <ul>
                  <li>
                    <a href={href('/')}>Open Design</a>
                  </li>
                  <li>
                    <a href={href('/html-anything/')}>{ui.footer.htmlAnything}</a>
                  </li>
                  <li>
                    <a href={href('/html-video/')}>{ui.footer.htmlVideo}</a>
                  </li>
                </ul>
              </div>
              <div className='foot-col'>
                <h5>{home.footer.columns.studio}</h5>
                <ul>
                  <li>
                    <a href='#agents'>{home.footer.studioLinks[0]}</a>
                  </li>
                  <li>
                    <a href='#labs'>{home.footer.studioLinks[1]}</a>
                  </li>
                  <li>
                    <a href={REPO_DAEMON} {...ext}>
                      {home.footer.studioLinks[2]}
                    </a>
                  </li>
                  <li>
                    <a href={REPO} {...ext}>
                      {home.footer.studioLinks[3]}
                    </a>
                  </li>
                </ul>
              </div>
              <div className='foot-col'>
                {/*
                 * Plugins column — title and entries mirror the header
                 * Plugins dropdown and the sub-page footer exactly
                 * (Templates → Skills → Systems, plain names, no count
                 * prefixes). Reuses the shared `nav` copy so the three
                 * surfaces can never drift; `home.footer.columns.library`
                 * and `home.footer.libraryLinks.*` are intentionally left
                 * unused here.
                 */}
                <h5>{commonCopy.header.nav.plugins}</h5>
                <ul>
                  <li>
                    <a href={href('/plugins/templates/')}>
                      {commonCopy.header.nav.templates}
                    </a>
                  </li>
                  <li>
                    <a href={href('/plugins/skills/')}>
                      {commonCopy.header.nav.skills}
                    </a>
                  </li>
                  <li>
                    <a href={href('/plugins/systems/')}>
                      {commonCopy.header.nav.systems}
                    </a>
                  </li>
                </ul>
              </div>
              <div className='foot-col'>
                <h5>{home.footer.columns.connect}</h5>
                <ul>
                  <li>
                    <a href={REPO} {...ext}>
                      {home.footer.connectLinks[0]}
                    </a>
                  </li>
                  <li>
                    <a href={REPO_ISSUES} {...ext}>
                      {home.footer.connectLinks[1]}
                    </a>
                  </li>
                  <li>
                    <a href={REPO_CONTRIBUTORS} {...ext}>
                      {home.footer.connectLinks[2]}
                    </a>
                  </li>
                  <li>
                    <a href={REPO_RELEASES} {...ext}>
                      {home.footer.connectLinks[3]}
                    </a>
                  </li>
                  <li>
                    <a href={DISCORD} {...ext}>
                      {home.footer.connectLinks[4]}
                    </a>
                  </li>
                </ul>
              </div>
              <div className='foot-col'>
                <h5>{home.footer.columns.openDesign}</h5>
                <ul>
                  <li>
                    <a href={href('/official/')}>
                      {home.footer.openDesignLinks.official}
                    </a>
                  </li>
                  <li>
                    <a href={href('/quickstart/')}>
                      {home.footer.openDesignLinks.quickstart}
                    </a>
                  </li>
                  <li>
                    <a href={href('/agents/')}>
                      {home.footer.openDesignLinks.agents}
                    </a>
                  </li>
                  <li>
                    <a href={href('/compare/')}>
                      {home.footer.openDesignLinks.compare}
                    </a>
                  </li>
                  <li>
                    <a href={href('/alternatives/claude-design/')}>
                      {home.footer.openDesignLinks.alternative}
                    </a>
                  </li>
                </ul>
              </div>
            </div>
            <div className='foot-bottom'>
              <span>
                <span className='pulse' />●{' '}
                <b style={{ color: 'var(--ink)' }}>{home.footer.bottomLeft}</b>
              </span>
              <span className='right'>
                <span>{home.footer.bottomRightA}</span>
                <span>{home.footer.bottomRightB}</span>
                <span style={{ color: 'var(--coral)' }}>♥ MMXXVI</span>
              </span>
            </div>
            <div className='foot-mega'>
              <div className='word' data-reveal='rise-lg'>
                {(() => {
                  const parts = home.footer.mega.split('Design');
                  if (parts.length !== 2) return home.footer.mega;
                  return (
                    <>
                      {parts[0]}
                      <span style={{ color: 'var(--coral)' }}>Design</span>
                      {parts[1]}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
