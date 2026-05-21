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

import type { ReactNode } from 'react';
import { Header, type HeaderProps } from './_components/header';
import { Wire } from './_components/wire';
import {
  heroImage,
  heroImageSrcset,
  imageAsset,
  PRECISE_LAZY_PLACEHOLDER,
} from './image-assets';
import { DEFAULT_LOCALE, getCopy, type Locale } from './_lib/i18n';
import { getHomeCopy, type HomeCopy } from './_lib/home-copy';

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

const arrowOut = (
  <svg viewBox='0 0 24 24'>
    <path d='M5 19L19 5M19 5H8M19 5v11' />
  </svg>
);

const arrowPlus = (
  <svg viewBox='0 0 24 24'>
    <circle cx='12' cy='12' r='9' />
    <path d='M9 12h6M12 9v6' />
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
const REPO_DOCS = (file: string) => `${REPO}/blob/main/${file}`;
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
  };
  github: {
    starsLabel: string;
    versionLabel: string;
  };
  locale?: Locale;
  pathname?: string;
  prefixDefaultLocale?: boolean;
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

/**
 * Render a translated footer-pitch sentence with brand mentions
 * replaced by `<a className="inline-link">…</a>` links. The pitch
 * string already contains the literal project names (e.g.
 * `huashu-design`) in whatever locale, so we tokenize on the longest
 * project slug first to avoid partial matches.
 */
function renderFooterPitch(
  template: string,
  links: Record<string, string>,
): ReactNode[] {
  const names = Object.keys(links).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `(${names.map((name) => name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})`,
    'g',
  );
  const out: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = pattern.exec(template);
  let key = 0;
  while (match) {
    if (match.index > lastIndex) {
      out.push(template.slice(lastIndex, match.index));
    }
    const name = match[1] ?? '';
    const href = links[name];
    if (href) {
      out.push(
        <a
          key={`footer-pitch-${key++}`}
          className='inline-link'
          href={href}
          target='_blank'
          rel='noreferrer noopener'
        >
          {name}
        </a>,
      );
    } else {
      out.push(name);
    }
    lastIndex = match.index + name.length;
    match = pattern.exec(template);
  }
  if (lastIndex < template.length) {
    out.push(template.slice(lastIndex));
  }
  return out;
}

export default function Page({
  counts,
  github,
  locale = DEFAULT_LOCALE,
  pathname = '/',
  prefixDefaultLocale = false,
}: PageProps) {
  const skills = fmt(counts.skills);
  const systems = fmt(counts.systems);
  const deckCount = pad2(counts.byMode?.deck);
  const prototypeCount = pad2(counts.byMode?.prototype);
  const mobileCount = pad2(counts.byPlatform?.mobile);
  const copy = getCopy(locale);
  const home: HomeCopy = getHomeCopy(locale);

  /**
   * Inline `{skills}` / `{systems}` / `{cmd}` placeholders inside a
   * translation string. `cmd` is the only one that renders a JSX node,
   * so we split on it and let the caller wrap the text fragments.
   */
  const fill = (template: string) =>
    template.replace(/\{skills\}/g, skills).replace(/\{systems\}/g, systems);
  const fillWithCmd = (template: string, cmd: ReactNode) => {
    const filled = fill(template);
    const parts = filled.split('{cmd}');
    return parts.flatMap((part, idx) => (idx === 0 ? [part] : [cmd, part]));
  };
  /**
   * Inline a literal token (e.g. `SKILL.md`) inside a translated card
   * body, wrapping the token in a monospaced code chip while leaving
   * the surrounding prose as plain translated text. Works for any
   * locale: the token sits inside the translation verbatim and we
   * split on it.
   */
  const fillCardBody = (template: string, token: string) => {
    const filled = fill(template);
    const parts = filled.split(token);
    return parts.flatMap((part, idx) =>
      idx === 0
        ? [part]
        : [
            <code
              key={`${token}-${idx}`}
              style={{ fontFamily: 'var(--mono)', fontSize: 12 }}
            >
              {token}
            </code>,
            part,
          ],
    );
  };

  return (
    <>
      {/* side rails (rotated brand text) */}
      <div className='side-rail right' data-od-id='rail-right'>
        <span className='rail-text'>
          Open Design — Vol. 01 · Issue Nº 26 · Apache-2.0
        </span>
      </div>
      <div className='side-rail left' data-od-id='rail-left'>
        <span className='rail-text'>
          Skills · Systems · Agents · BYOK · Local-first
        </span>
      </div>

      <div className='shell'>
        {/* ====== TOP METADATA STRIP ====== */}
        <div className='topbar' data-od-id='topbar'>
          <div className='container topbar-inner'>
            <span>
              <b>OD / 2026</b>
              {NBSP}·{NBSP}Vol. 01 / Issue Nº 26
            </span>
            <span className='mid'>
              <span>
                Filed under <b className='coral'>Design · Intelligence</b>
              </span>
              <span>Apache-2.0 · Made on Earth</span>
            </span>
            <span className='right'>
              <a className='topbar-link' href={REPO_RELEASES} {...ext}>
                <span className='pulse' />
                {copy.live} · <span data-github-version>{github.versionLabel}</span>
              </a>
            </span>
          </div>
        </div>

        {/* ====== NAV ====== */}
        {/* Headroom-style sticky header with live GitHub star count. */}
        <Header
          counts={counts}
          github={github}
          locale={locale}
          prefixDefaultLocale={prefixDefaultLocale}
          pathname={pathname}
        />

        {/* ====== HERO ====== */}
        <section className='hero' id='top' data-od-id='hero'>
          <div className='container hero-grid'>
            <div className='hero-copy'>
              <a
                className='hero-discord-pill'
                href={DISCORD}
                aria-label='Join the Open Design Discord'
                {...ext}
                data-reveal
              >
                <span aria-hidden='true'>●</span>
                {home.heroJoinDiscord}
              </a>
              <span className='label' data-reveal>
                {home.heroLabel}
              </span>
              <h1 className='display' data-reveal>
                {home.heroTitleA} <em>{home.heroTitleEmphasis1}</em>{' '}
                {home.heroTitleB} <em>{home.heroTitleEmphasis2}</em>{' '}
                {home.heroTitleC} <em>{home.heroTitleEmphasis3}</em>
                <span className='dot'>.</span>
              </h1>
              <p className='lead' data-reveal>
                {fill(home.heroLead)}
              </p>
              <div className='hero-actions' data-reveal>
                <a className='btn btn-primary' href={REPO} {...ext}>
                  {home.heroCtaStar}
                  <span className='arrow'>{arrowOut}</span>
                </a>
                <a className='btn btn-ghost' href={REPO_RELEASES} {...ext}>
                  {home.heroCtaDownload}
                  <span className='arrow'>{arrowPlus}</span>
                </a>
              </div>
              <div className='hero-stats' data-reveal>
                <div className='stat'>
                  <span className='ring solid'>{skills}</span>
                  <span className='stat-label'>
                    <b>{home.heroStatSkillsBold}</b>
                    {home.heroStatSkillsLabel}
                  </span>
                </div>
                <div className='stat'>
                  <span className='ring'>{systems}</span>
                  <span className='stat-label'>
                    <b>{home.heroStatSystemsBold}</b>
                    {home.heroStatSystemsLabel}
                  </span>
                </div>
                <div className='stat'>
                  <span className='ring coral'>12</span>
                  <span className='stat-label'>
                    <b>{home.heroStatCLIsBold}</b>
                    {home.heroStatCLIsLabel}
                  </span>
                </div>
              </div>
              <div className='hero-foot' data-reveal>
                <span className='meta'>{home.heroFootCommands}</span>
                <span className='coord'>
                  52.5200° N{NBSP}·{NBSP}13.4050° E
                </span>
              </div>
            </div>
            <div className='hero-art' data-reveal='scale'>
              <span className='corner tl' />
              <span className='corner tr' />
              <span className='corner bl' />
              <span className='corner br' />
              <span className='annot annot-tl coord'>FIG. 01 / OD-26</span>
              <span className='annot annot-tr'>Plate Nº 08</span>
              <span className='annot annot-bl coord'>SHA · a1b2c3d</span>
              <span className='annot annot-br'>
                Composed in{NBSP}
                <span style={{ color: 'var(--coral)' }}>Open Design</span>
              </span>
              <img
                src={heroImage}
                srcSet={heroImageSrcset}
                sizes='(max-width: 768px) 100vw, 60vw'
                width={1280}
                height={1600}
                alt=''
                fetchPriority='high'
                decoding='async'
              />
              <div className='index'>
                <span>
                  <span className='n'>01</span>Detect
                </span>
                <span className='on'>
                  <span className='n'>02</span>Discover
                </span>
                <span>
                  <span className='n'>03</span>Direct
                </span>
                <span>
                  <span className='n'>04</span>Deliver
                </span>
              </div>
            </div>
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

        {/* ====== ABOUT ====== */}
        <section className='about' data-od-id='about'>
          <div className='container'>
            <div className='sec-rule'>
              <span className='roman'>I.</span>
              <span className='meta-grp'>
                <span>About / Manifesto</span>
                <span className='dot-mark'>•</span>
                <span>Open Design / Volume 01</span>
              </span>
              <span>002 / 008</span>
            </div>
            <div className='about-grid'>
              <div className='about-copy' data-reveal>
                <span className='label'>{home.aboutLabel}</span>
                <h2 className='display'>
                  {home.aboutTitleA} <em>{home.aboutTitleEmphasis1}</em>{' '}
                  {home.aboutTitleB} <em>{home.aboutTitleEmphasis2}</em>{' '}
                  {home.aboutTitleC}
                  <span className='dot'>.</span>
                </h2>
                <p className='lead'>
                  {fillWithCmd(
                    home.aboutLead,
                    <code key='cmd' className='code-inline'>
                      pnpm tools-dev
                    </code>,
                  )}
                </p>
                <a className='btn btn-ghost' href={REPO_DAEMON} {...ext}>
                  {home.aboutCtaApproach}
                  <span className='arrow'>{arrowOut}</span>
                </a>
                <div className='footer-row'>
                  <span className='mark'>Ø</span>
                  <span>{home.aboutFooterRow}</span>
                  <span className='stamp'>
                    <span>Studio practice</span>
                    <span style={{ color: 'var(--ink)' }}>Est. MMXXVI</span>
                  </span>
                </div>
              </div>
              <div className='about-art' data-reveal='right'>
                <LazyImg src={imageAsset('about.png', { width: 1024, quality: 82 })} />
                <div className='about-side-note'>
                  <b />
                  {home.aboutSideNote}
                </div>
                <div className='about-caption'>
                  <b>{home.aboutCaption}</b>
                  {' '}
                  {home.aboutCaptionCredit}
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
                <span>Capabilities · Skills · Systems</span>
                <span className='dot-mark'>•</span>
                <span>4 surfaces / 1 loop</span>
              </span>
              <span>003 / 008</span>
            </div>
            <div className='capabilities-grid'>
              <div className='capabilities-art' data-reveal='left'>
                <span className='corner tl' />
                <span className='corner br' />
                <LazyImg src={imageAsset('capabilities.png', { width: 1024, quality: 82 })} />
                <div className='ribbon'>
                  <b>OPEN DESIGN</b>
                  {NBSP}·{NBSP}CAPABILITIES MATRIX{NBSP}·{NBSP}OD/26
                </div>
              </div>
              <div className='capabilities-copy' data-reveal>
                <span className='label'>{home.capLabel}</span>
                <h2 className='display'>
                  {home.capTitleA} <em>{home.capTitleEmphasis}</em>{' '}
                  {home.capTitleB}
                  <span className='dot'>.</span>
                </h2>
                <p className='lead'>{home.capLead}</p>
                <div className='cards'>
                  <div className='card' data-reveal>
                    <div className='num'>
                      01<span className='tag'>{home.capCard1Tag}</span>
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
                    <h3>{home.capCard1Title}</h3>
                    <p>
                      {fillCardBody(home.capCard1Body, 'SKILL.md')}
                    </p>
                    <a
                      className='arrow-mark'
                      href={REPO_SKILLS}
                      aria-label='Browse all skills on GitHub'
                      {...ext}
                    >
                      {arrowOut}
                    </a>
                  </div>
                  <div className='card' data-reveal>
                    <div className='num'>
                      02<span className='tag'>{home.capCard2Tag}</span>
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
                    <h3>{home.capCard2Title}</h3>
                    <p>
                      {fillCardBody(home.capCard2Body, 'DESIGN.md')}
                    </p>
                    <a
                      className='arrow-mark'
                      href={REPO_DESIGN_SYSTEMS}
                      aria-label='Browse all design systems on GitHub'
                      {...ext}
                    >
                      {arrowOut}
                    </a>
                  </div>
                  <div className='card' data-reveal>
                    <div className='num'>
                      03<span className='tag'>{home.capCard3Tag}</span>
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
                    <h3>{home.capCard3Title}</h3>
                    <p>{home.capCard3Body}</p>
                    <a
                      className='arrow-mark'
                      href={REPO_DAEMON}
                      aria-label='Read the agent adapter source on GitHub'
                      {...ext}
                    >
                      {arrowOut}
                    </a>
                  </div>
                  <div className='card' data-reveal>
                    <div className='num'>
                      04<span className='tag'>{home.capCard4Tag}</span>
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
                    <h3>{home.capCard4Title}</h3>
                    <p>{home.capCard4Body}</p>
                    <a
                      className='arrow-mark'
                      href={REPO}
                      aria-label='See BYOK setup on GitHub'
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
                <span>Labs / Skills Catalog</span>
                <span className='dot-mark'>•</span>
                <span>05 of {skills} ongoing</span>
              </span>
              <span>004 / 008</span>
            </div>
            <div className='labs-head'>
              <div data-reveal>
                <span className='label'>{home.labsLabel}</span>
                <h2 className='display' style={{ marginTop: 30 }}>
                  {home.labsTitleA} <em>{home.labsTitleEmphasis}</em>{' '}
                  {home.labsTitleB}
                  <span className='dot'>.</span>
                </h2>
              </div>
              <div className='pills' data-reveal='right'>
                <a className='pill active' href='/skills/'>
                  {home.labsFilterAll}
                  <span className='count'>{skills}</span>
                </a>
                <a className='pill' href='/skills/mode/prototype/'>
                  {home.labsFilterPrototype}
                  <span className='count'>{prototypeCount}</span>
                </a>
                <a className='pill' href='/skills/mode/deck/'>
                  {home.labsFilterDeck}
                  <span className='count'>{deckCount}</span>
                </a>
                <a className='pill' href='/skills/'>
                  {home.labsFilterMobile}
                  <span className='count'>{mobileCount}</span>
                </a>
                <a className='pill' href='/skills/'>
                  {home.labsFilterOffice}
                  <span className='count'>—</span>
                </a>
              </div>
            </div>
            <div className='labs-meta'>
              <span className='ring'>05</span>
              <div className='meta-text'>
                <b>{home.labsMetaBold}</b>
                {home.labsMetaText.split('\n').flatMap((line, idx) =>
                  idx === 0 ? [line] : [<br key={`labs-meta-${idx}`} />, line],
                )}
              </div>
            </div>
            <div className='labs-grid'>
              {[
                {
                  badge: 'Deck',
                  num: 'Nº 01',
                  title: home.lab1Title,
                  body: fillCardBody(home.lab1Body, 'guizang-ppt'),
                  src: imageAsset('lab-1.png', { width: 768, quality: 82 }),
                  href: `${REPO_SKILLS}/guizang-ppt`,
                },
                {
                  badge: 'Media',
                  num: 'Nº 02',
                  title: home.lab2Title,
                  body: home.lab2Body,
                  src: imageAsset('lab-2.png', { width: 768, quality: 82 }),
                  href: `${REPO_SKILLS}/hyperframes`,
                },
                {
                  badge: 'Loop',
                  num: 'Nº 03',
                  title: home.lab3Title,
                  body: home.lab3Body,
                  src: imageAsset('lab-3.png', { width: 768, quality: 82 }),
                  href: `${REPO_SKILLS}/design-brief`,
                },
                {
                  badge: 'Critique',
                  num: 'Nº 04',
                  title: home.lab4Title,
                  body: home.lab4Body,
                  src: imageAsset('lab-4.png', { width: 768, quality: 82 }),
                  href: `${REPO_SKILLS}/critique`,
                },
                {
                  badge: 'Runtime',
                  num: 'Nº 05',
                  title: home.lab5Title,
                  body: home.lab5Body,
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
                    aria-label={`Open ${lab.title} on GitHub`}
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
                05 / {skills} SKILLS{NBSP}·{NBSP}
                <a
                  href='/skills/'
                  className='library-link'
                  style={{ color: 'var(--coral)' }}
                >
                  {home.labsViewFullLibrary}
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
                <span>Method / Loop</span>
                <span className='dot-mark'>•</span>
                <span>04 stages, iterative</span>
              </span>
              <span>005 / 008</span>
            </div>
            <div className='method-head'>
              <div data-reveal>
                <span className='label'>{home.methodLabel}</span>
                <h2 className='display' style={{ marginTop: 30 }}>
                  {home.methodTitleA} <em>{home.methodTitleEmphasis}</em>{' '}
                  {home.methodTitleB}
                  <span className='dot'>.</span>
                </h2>
              </div>
              <div className='right' data-reveal='right'>
                <span className='plus'>+</span>
                <p>{home.methodLead}</p>
              </div>
            </div>
            <div className='method-grid'>
              {[
                {
                  num: '01',
                  title: home.method1Title,
                  body: fill(home.method1Body),
                  src: imageAsset('method-1.png', { width: 816, quality: 82 }),
                },
                {
                  num: '02',
                  title: home.method2Title,
                  body: home.method2Body,
                  src: imageAsset('method-2.png', { width: 816, quality: 82 }),
                },
                {
                  num: '03',
                  title: home.method3Title,
                  body: home.method3Body,
                  src: imageAsset('method-3.png', { width: 816, quality: 82 }),
                },
                {
                  num: '04',
                  title: home.method4Title,
                  body: home.method4Body,
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
                <span>{home.methodFootText}</span>
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
                <span>Selected Work · 2026 Catalog</span>
                <span style={{ color: 'var(--coral)' }}>•</span>
                <span>Edited by Open Design</span>
              </span>
              <span>006 / 008</span>
            </div>
            <div className='work-grid'>
              <div className='work-copy' data-reveal>
                <span className='label'>{home.workLabel}</span>
                <h2>
                  {home.workTitleA} <em>{home.workTitleEmphasis1}</em>{' '}
                  {home.workTitleB} <em>{home.workTitleEmphasis2}</em>
                  <span className='dot'>.</span>
                </h2>
                <a className='work-link' href='/skills/'>
                  {fill(home.workViewAll)}
                </a>
              </div>
              <a
                className='work-card'
                data-reveal
                href={`${REPO_SKILLS}/guizang-ppt`}
                {...ext}
              >
                <div className='label-row'>
                  <span className='small-label'>{home.workFeaturedTag}</span>
                  <span className='index'>01 / {skills}</span>
                </div>
                <h3>guizang-ppt</h3>
                <p>{home.work1Body}</p>
                <div className='img'>
                  <LazyImg src={imageAsset('work-1.png', { width: 768, quality: 82 })} />
                </div>
                <div className='meta-row'>
                  <span className='year'>2026 · DECK</span>
                  <span>DEFAULT</span>
                </div>
              </a>
              <a
                className='work-card alt'
                data-reveal
                href='https://github.com/tw93/kami'
                {...ext}
              >
                <div className='label-row'>
                  <span className='small-label'>{home.workCompanionTag}</span>
                  <span className='index'>04 / {systems}</span>
                </div>
                <h3>kami</h3>
                <p>{home.work2Body}</p>
                <div className='img'>
                  <LazyImg src={imageAsset('work-2.png', { width: 768, quality: 82 })} />
                </div>
                <div className='meta-row'>
                  <span className='year'>2026 · PAPER</span>
                  <span>SYSTEM</span>
                </div>
              </a>
            </div>
            <div className='work-arrows'>
              <button type='button' className='nav-btn'>
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
              <button type='button' className='nav-btn active'>
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
                <span>Collaborators / Lineage</span>
                <span className='dot-mark'>•</span>
                <span>Standing on shoulders</span>
              </span>
              <span>007 / 008</span>
            </div>
            <div className='testimonial-grid'>
              <div className='testimonial-copy' data-reveal>
                <span className='label'>{home.testimonialLabel}</span>
                <h2 style={{ marginTop: 30 }}>
                  {home.testimonialQuotePre}{' '}
                  <em>{home.testimonialQuoteEm1}</em>{' '}
                  {home.testimonialQuoteMid}{' '}
                  <em>{home.testimonialQuoteEm2}</em>{' '}
                  {home.testimonialQuotePost}
                </h2>
                <div className='author'>
                  <span className='avatar'>m</span>
                  <p>
                    Mina Kovac
                    <br />
                    <span>{home.testimonialAuthorRole}</span>
                  </p>
                </div>
                <div className='divider' />
                <p className='partners-text'>{home.testimonialPartnersText}</p>
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
                    <small>{home.partnerHuashu}</small>
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
                    <small>{home.partnerGuizang}</small>
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
                    <small>{home.partnerCodesign}</small>
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
                    <small>{home.partnerDevin}</small>
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
                    <small>{home.partnerHyperframes}</small>
                  </a>
                </div>
                <a className='read-more' href={REPO} {...ext}>
                  {home.testimonialReadMore}
                </a>
              </div>
              <div className='testimonial-art' data-reveal='right'>
                <LazyImg src={imageAsset('testimonial.png', { width: 1024, quality: 82 })} />
              </div>
            </div>
          </div>
        </section>

        {/* ====== CTA ====== */}
        <section className='cta' id='contact' data-od-id='cta'>
          <div className='container'>
            <div className='sec-rule'>
              <span className='roman'>VII.</span>
              <span className='meta-grp'>
                <span>Contact / Conversation</span>
                <span className='dot-mark'>•</span>
                <span>Three commands to ship</span>
              </span>
              <span>008 / 008</span>
            </div>
            <div className='cta-grid'>
              <div data-reveal>
                <span className='label'>{home.ctaLabel}</span>
                <h2 className='display'>
                  {home.ctaTitleA} <em>{home.ctaTitleEmphasis1}</em>{' '}
                  {home.ctaTitleB} <em>{home.ctaTitleEmphasis2}</em>{' '}
                  {home.ctaTitleC}
                  <span className='dot'>.</span>
                </h2>
                <p className='lead'>
                  {fillWithCmd(
                    home.ctaLead,
                    <code key='cmd' className='code-inline'>
                      pnpm tools-dev
                    </code>,
                  )}
                </p>
                <div className='cta-actions'>
                  <a className='btn btn-primary' href={REPO} {...ext}>
                    {home.ctaPrimary}
                    <span className='arrow'>{arrowOut}</span>
                  </a>
                  <a className='email-pill' href={REPO_ISSUES} {...ext}>
                    {home.ctaSecondary}
                    <span className='arrow-circle'>→</span>
                  </a>
                </div>
                <div className='cta-foot'>
                  <span className='stamp'>{home.ctaFootLive}</span>
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
                  OPEN DESIGN{NBSP}·{NBSP}FIN.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ====== FOOTER ====== */}
        <footer data-od-id='footer'>
          <div className='container'>
            <div className='foot-grid'>
              <div className='foot-brand'>
                <a href='#top' className='brand'>
                  <span className='brand-mark'>
                    <img src='/logo.webp' alt='' width={36} height={36} />
                  </span>
                  <span>Open Design</span>
                </a>
                <p style={{ marginTop: 18 }}>
                  {renderFooterPitch(home.footPitch, {
                    'huashu-design': LINEAGE['huashu-design'],
                    'guizang-ppt': LINEAGE['guizang-ppt'],
                    'multica-ai': LINEAGE['multica-ai'],
                    'open-codesign': LINEAGE['open-codesign'],
                  })}
                </p>
                <a
                  className='foot-cta'
                  href={REPO_RELEASES}
                  aria-label='Download the Open Design desktop app'
                  {...ext}
                >
                  {home.footDownloadDesktop}
                  <span className='meta'>
                    {home.footDownloadMeta} ·{' '}
                    <span data-github-version>{github.versionLabel}</span>
                  </span>
                </a>
              </div>
              <div className='foot-col'>
                <h5>{home.footStudio}</h5>
                <ul>
                  <li>
                    <a href='#agents'>{home.footCapabilities}</a>
                  </li>
                  <li>
                    <a href='#labs'>{home.footLabs}</a>
                  </li>
                  <li>
                    <a href={REPO_DAEMON} {...ext}>
                      {home.footMethod}
                    </a>
                  </li>
                  <li>
                    <a href={REPO} {...ext}>
                      {home.footManifesto}
                    </a>
                  </li>
                </ul>
              </div>
              <div className='foot-col'>
                <h5>{home.footLibrary}</h5>
                <ul>
                  <li>
                    <a href='/skills/'>
                      {skills} {copy.navSkills}
                    </a>
                  </li>
                  <li>
                    <a href='/systems/'>
                      {systems} {copy.navSystems}
                    </a>
                  </li>
                  <li>
                    <a href='/templates/'>{copy.navTemplates}</a>
                  </li>
                  <li>
                    <a href='/craft/'>{copy.navCraft}</a>
                  </li>
                  {/*
                   * Sister product: HTML Anything is the agent-driven HTML
                   * editor from the same team. Listed here as a peer to the
                   * Open Design library facets so the home delivers a real
                   * inline anchor link to /html-anything/ — nav-only entries
                   * (the Product dropdown) carry less SEO weight than a body
                   * anchor in a discoverable section like the footer. The
                   * brand name stays in English on every locale, so we
                   * hardcode the label rather than threading a new key
                   * through 18 home-copy translations.
                   */}
                  <li>
                    <a href='/html-anything/'>HTML Anything</a>
                  </li>
                </ul>
              </div>
              <div className='foot-col'>
                <h5>{home.footConnect}</h5>
                <ul>
                  <li>
                    <a href={REPO} {...ext}>
                      GitHub
                    </a>
                  </li>
                  <li>
                    <a href={REPO_ISSUES} {...ext}>
                      Issues
                    </a>
                  </li>
                  <li>
                    <a href={REPO_CONTRIBUTORS} {...ext}>
                      {home.footContributors}
                    </a>
                  </li>
                  <li>
                    <a href={REPO_RELEASES} {...ext}>
                      Releases
                    </a>
                  </li>
                  <li>
                    <a href={DISCORD} {...ext}>
                      Discord
                    </a>
                  </li>
                </ul>
              </div>
              <div className='foot-col'>
                <h5>{home.footDocs}</h5>
                <ul>
                  <li>
                    <a href={REPO_DOCS('QUICKSTART.md')} {...ext}>
                      {home.footQuickstart}
                    </a>
                  </li>
                  <li>
                    <a href={REPO_DOCS('docs/architecture.md')} {...ext}>
                      {home.footArchitecture}
                    </a>
                  </li>
                  <li>
                    <a href={REPO_DOCS('docs/skills-protocol.md')} {...ext}>
                      {home.footSkillProtocol}
                    </a>
                  </li>
                  <li>
                    <a href={REPO_DOCS('docs/roadmap.md')} {...ext}>
                      {home.footRoadmap}
                    </a>
                  </li>
                </ul>
              </div>
            </div>
            <div className='foot-bottom'>
              <span>
                <span className='pulse' />●{' '}
                <b style={{ color: 'var(--ink)' }}>Open Design</b> · Apache-2.0
                · 2026 / Volume 01 / Issue Nº 26
              </span>
              <span className='right'>
                <span>Berlin / Open / Earth</span>
                <span>52.5200° N · 13.4050° E</span>
                <span style={{ color: 'var(--coral)' }}>♥ MMXXVI</span>
              </span>
            </div>
            <div className='foot-mega'>
              <div className='word' data-reveal='rise-lg'>
                Open <em>Design</em>.
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
