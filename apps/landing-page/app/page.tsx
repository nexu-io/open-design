/*
 * Open Design — Atelier Zero landing page.
 *
 * Mirrors `design-templates/open-design-landing/example.html` 1:1. When the canonical
 * example.html changes, mirror the diff here and into `app/globals.css`.
 *
 * Static React component rendered by Astro. The Header component owns the
 * small client-side behaviors; promote other sections to Astro islands only
 * when behavior is needed.
 */

import { GradualBlur } from './_components/gradual-blur';
import { Header, type HeaderProps } from './_components/header';
import {
  DEFAULT_LOCALE,
  LANDING_LOCALES,
  getCommonCopy,
  getHeaderProductMenuCopy,
  getHomePageCopy,
  getLandingUiCopy,
  getLocaleDefinition,
  localePath,
  localizedHref,
  type HomeFaqEntry,
  type LandingLocaleCode,
} from './i18n';
import {
  heroBgImage,
  heroBgSrcset,
  heroProductImage,
  heroProductSrcset,
  PRECISE_LAZY_PLACEHOLDER,
} from './image-assets';
import { getHomeExtra } from './home-translations';

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

/**
 * Static SSR port of React Bits' `<BlurText />` "blur-in" reveal. The page is
 * rendered with `renderToStaticMarkup` (no client React / no `motion` runtime),
 * so instead of motion hooks we emit one `.blur-word` span per word/letter with
 * a `--i` stagger index. The CSS keyframes in globals.css mirror the original
 * blur(10px→5px→0) + opacity(0→.5→1) + translateY steps, and the existing
 * `data-reveal` IntersectionObserver (home-enhancer.astro) flips the ancestor to
 * `data-revealed='true'` to start the cascade once it scrolls into view.
 *
 * `start` continues the stagger index across multiple BlurText runs so a second
 * line picks up where the first left off.
 */
function BlurText({
  text,
  by = 'words',
  start = 0,
}: {
  text: string;
  by?: 'words' | 'letters';
  start?: number;
}) {
  const parts = by === 'words' ? text.split(' ') : Array.from(text);
  return (
    <>
      {parts.map((seg, i) => (
        <span
          className='blur-word'
          style={{ '--i': start + i } as React.CSSProperties}
          key={`${seg}-${i}`}
        >
          {seg === ' ' ? NBSP : seg}
          {by === 'words' && i < parts.length - 1 ? NBSP : ''}
        </span>
      ))}
    </>
  );
}

// Interface icons use ONLY the skill's Remix Icon font (see
// /Users/leon/Desktop/skills01 → references/图标.md: line style, no SVG icon
// sets / emoji / self-drawn glyphs). The font is bundled at
// /skill-assets/remixicon.ttf and declared as @font-face 'Remix Icon' in
// globals.css; these codepoints are read straight from its cmap.
const RI = {
  arrowUpRight: '\uea70', // arrow-right-up-line
  arrowRight: '\uea6c', // arrow-right-line
  arrowLeft: '\uea60', // arrow-left-line
  chevronLeft: '\uea64', // arrow-left-s-line
  chevronRight: '\uea6e', // arrow-right-s-line
  add: '\uea13', // add-fill (line variant absent from this build)
  addCircle: '\uea11', // add-circle-line
  download: '\uec5a', // download-line
  github: '\uedcb', // github-line
  star: '\uf18b', // star-line
  search: '\uf0d1', // search-line
  compass: '\uebbe', // compass-3-line
  grid: '\uee90', // layout-grid-line
  plug: '\uf019', // plug-line
  stack: '\uf181', // stack-line
} as const;

function RemixIcon({ glyph, className }: { glyph: string; className?: string }) {
  return (
    <span className={`ri-glyph${className ? ` ${className}` : ''}`} aria-hidden='true'>
      {glyph}
    </span>
  );
}

const arrowOut = <RemixIcon glyph={RI.arrowUpRight} />;
const iconDownload = <RemixIcon glyph={RI.download} />;
const arrowBack = <RemixIcon glyph={RI.arrowLeft} />;
const arrowPlus = <RemixIcon glyph={RI.addCircle} />;

// Capability-card glyphs, drawn from the skill's Remix Icon line set.
const capIcon = {
  search: <RemixIcon glyph={RI.search} className='icon' />,
  direction: <RemixIcon glyph={RI.compass} className='icon' />,
  grid: <RemixIcon glyph={RI.grid} className='icon' />,
  adapters: <RemixIcon glyph={RI.plug} className='icon' />,
  layers: <RemixIcon glyph={RI.stack} className='icon' />,
} as const;

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
const REPO_DOCS = `${REPO}#readme`;
const DISCORD = 'https://discord.gg/9ptkbbqRu';
const X_TWITTER = 'https://x.com/OpenDesignHQ';
const YOUTUBE = 'https://www.youtube.com/channel/UChtshixMhvtgBWzoD9R_Qfg';

// Footer columns mirror the top-nav sections + `site-footer.astro` (the
// sub-page footer) so the homepage and every sub-page share one footer
// contract. Hrefs stay in lockstep with header.tsx (USE_CASE_HREFS / agent
// routes); labels reuse the already-localized nav dropdown copy.
const FOOTER_USE_CASE_HREFS = [
  '/solutions/prototype/',
  '/solutions/dashboard/',
  '/solutions/slides/',
  '/solutions/image/',
  '/solutions/video/',
  '/solutions/design-system/',
] as const;

const FOOTER_AGENTS = [
  { name: 'Claude Code', route: 'claude-code-design' },
  { name: 'Codex', route: 'codex-design' },
  { name: 'Cursor', route: 'cursor-design' },
  { name: 'Gemini CLI', route: 'gemini-design' },
  { name: 'OpenCode', route: 'opencode-design' },
] as const;

// Legal / company labels — small inline map (en/zh/zh-tw, fallback en) kept
// identical to `site-footer.astro` so the two footers never drift.
const FOOTER_LEGAL = {
  en: { company: 'Company', about: 'About', faq: 'FAQ', privacy: 'Privacy Policy', terms: 'Terms', allAgents: 'All agents' },
  zh: { company: '公司', about: '关于', faq: '常见问题', privacy: '隐私政策', terms: '服务条款', allAgents: '全部 Agent' },
  'zh-tw': { company: '公司', about: '關於', faq: '常見問題', privacy: '隱私政策', terms: '服務條款', allAgents: '全部 Agent' },
} satisfies Record<string, Record<string, string>>;

const ext = {
  target: '_blank',
  rel: 'noreferrer noopener',
} as const;

// Coding-agent logos that fall in the Method section's FallingText physics
// playground (matter-js). Each is an icon chip that drops on hover instead of
// a text word. Assets live in `public/agent-icons/`.
const FALLING_ICONS = [
  { src: '/agent-icons/claude.svg', alt: 'Claude' },
  { src: '/agent-icons/codex.svg', alt: 'Codex' },
  { src: '/agent-icons/gemini.svg', alt: 'Gemini' },
  { src: '/agent-icons/cursor-agent.svg', alt: 'Cursor' },
  { src: '/agent-icons/copilot.svg', alt: 'GitHub Copilot' },
  { src: '/agent-icons/opencode.svg', alt: 'OpenCode' },
  { src: '/agent-icons/devin.png', alt: 'Devin' },
  { src: '/agent-icons/hermes.svg', alt: 'Hermes' },
  { src: '/agent-icons/pi.svg', alt: 'Pi' },
  { src: '/agent-icons/kimi.svg', alt: 'Kimi' },
  { src: '/agent-icons/kiro.svg', alt: 'Kiro' },
  { src: '/agent-icons/qwen.svg', alt: 'Qwen' },
  { src: '/agent-icons/grok-build.svg', alt: 'Grok' },
  { src: '/agent-icons/deepseek.svg', alt: 'DeepSeek' },
  { src: '/agent-icons/qoder.svg', alt: 'Qoder' },
  { src: '/agent-icons/amr.svg', alt: 'AMR' },
  { src: '/agent-icons/kilo.svg', alt: 'Kilo' },
  { src: '/agent-icons/aider.png', alt: 'Aider' },
  { src: '/agent-icons/trae-cli.png', alt: 'Trae' },
  { src: '/agent-icons/vibe.svg', alt: 'Mistral Vibe' },
  { src: '/agent-icons/mimo.svg', alt: 'MiMo' },
  { src: '/agent-icons/antigravity.svg', alt: 'Antigravity' },
  { src: '/agent-icons/reasonix.svg', alt: 'Reasonix' },
];

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
  /** FAQ pairs rendered above the closing CTA. Content comes from `getHomeFaq`. */
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

/**
 * Splits reveal copy into per-token spans. CJK characters/punctuation become
 * individual tokens (so they light up one at a time, since CJK has no word
 * spaces), runs of Latin letters/digits stay whole, and ASCII spaces are kept
 * as literal separators so Latin words don't run together when they wrap.
 */
const CJK_TOKEN = /[぀-ヿ㐀-鿿　-〿＀-￯]/;
function tokenizeReveal(
  text: string,
): Array<{ type: 'word'; value: string } | { type: 'space' }> {
  const tokens: Array<{ type: 'word'; value: string } | { type: 'space' }> = [];
  let buf = '';
  const flush = () => {
    if (buf) {
      tokens.push({ type: 'word', value: buf });
      buf = '';
    }
  };
  for (const ch of text) {
    if (ch === ' ') {
      flush();
      tokens.push({ type: 'space' });
    } else if (CJK_TOKEN.test(ch)) {
      flush();
      tokens.push({ type: 'word', value: ch });
    } else {
      buf += ch;
    }
  }
  flush();
  return tokens;
}

export default function Page({
  counts,
  github,
  faq,
  locale = DEFAULT_LOCALE,
}: PageProps) {
  // The homepage layout, images, and module structure are authored once (the
  // Chinese design). `tt` supplies the copy per locale: Chinese for `zh`,
  // English for every other locale (the universal fallback) so every module
  // stays 1:1 across languages with no missing content.
  // Localized copy for every visual module — the layout/images are authored
  // once (the Chinese design); `t` supplies the translated text per locale so
  // all languages render the same structure. CJK locales use per-letter blur.
  const t = getHomeExtra(locale);
  const cjk = locale === 'zh' || locale === 'zh-tw' || locale === 'ja' || locale === 'ko';
  // Short inline labels still fall back to English for non-Chinese locales.
  const tt = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  const skills = fmt(counts.skills);
  const systems = fmt(counts.systems);
  const deckCount = pad2(counts.byMode?.deck);
  const prototypeCount = pad2(counts.byMode?.prototype);
  const mobileCount = pad2(counts.byPlatform?.mobile);
  const commonCopy = getCommonCopy(locale);
  const home = getHomePageCopy(locale);
  const ui = getLandingUiCopy(locale);
  const menu = getHeaderProductMenuCopy(locale);
  const footL =
    FOOTER_LEGAL[locale as keyof typeof FOOTER_LEGAL] ?? FOOTER_LEGAL.en;
  const localeDef = getLocaleDefinition(locale);
  const localeOptions = LANDING_LOCALES.map((entry) => ({
    ...entry,
    href: localePath(entry.code, '/'),
  }));
  const href = (path: string) => localizedHref(path, locale);

  /**
   * Capability cards. The zh homepage renders the five-step flow verbatim
   * (eyebrow "Step N — 名称" + description), reusing the card-1 layout. Other
   * locales keep the original four feature cards driven by i18n copy.
   */
  const capabilityCards: ReadonlyArray<{
    num?: React.ReactNode;
    title?: React.ReactNode;
    body?: React.ReactNode;
    icon: React.ReactNode;
    href: string;
    aria: string;
    img?: string;
    /** Caption overlaid in the image's top white bar, next to the "step N" pill. */
    desc?: string;
  }> =
    [
      {
        num: t.stepTitle1,
        icon: capIcon.search,
        href: REPO_SKILLS,
        aria: t.stepTitle1,
        img: '/step-cards/step-1.webp?v=8',
        desc: t.stepDesc1,
      },
      {
        num: t.stepTitle2,
        icon: capIcon.direction,
        href: REPO_SKILLS,
        aria: t.stepTitle2,
        img: '/step-cards/step-2.webp?v=8',
        desc: t.stepDesc2,
      },
      {
        num: t.stepTitle3,
        icon: capIcon.grid,
        href: REPO_DAEMON,
        aria: t.stepTitle3,
        img: '/step-cards/step-3.webp?v=7',
        desc: t.stepDesc3,
      },
      {
        num: t.stepTitle4,
        icon: capIcon.adapters,
        href: REPO,
        aria: t.stepTitle4,
        img: '/step-cards/step-4.webp?v=9',
        desc: t.stepDesc4,
      },
    ];

  /**
   * Deck-preview art for the Labs product-window showcase. Language-neutral —
   * each Dock mode maps onto one of these images (cycling), and the active
   * slide reuses the first. `labFallback` keeps the typed access non-optional
   * under `noUncheckedIndexedAccess`.
   */
  const labArtifacts = [
    '/lab-cards/card-1.webp',
    '/lab-cards/card-2.webp',
    '/lab-cards/card-3.webp',
    '/lab-cards/card-4.webp',
    '/lab-cards/card-5.webp',
    '/lab-cards/card-6.webp',
  ];
  const labActive = labArtifacts[0] ?? '';

  return (
    <>
      <div className='shell'>
        {/* ====== STICKY CHROME ====== */}
        <div className='site-chrome' data-chrome-headroom>
        {/* ====== NAV ====== */}
        {/* Headroom slide handled by `.site-chrome` wrapper above. */}
        <Header
          counts={counts}
          github={github}
          locale={locale}
          localeSwitcher={{
            label: commonCopy.topbar.languageSwitcherLabel,
            prefix: commonCopy.topbar.languageSwitcherPrefix ?? 'Lang',
            shortLabel: localeDef.shortLabel,
            options: localeOptions,
          }}
        />
        </div>{/* /site-chrome */}

        {/* ====== HERO ====== */}
        <section className='hero' id='top' data-od-id='hero'>
          {/* Full-bleed hero backdrop. Covers the whole first screen behind
              the copy; the design-canvas artwork bleeds edge to edge while
              the headline/CTAs sit on top via the grid's higher stacking. */}
          <img
            className='hero-bg'
            src={heroBgImage}
            srcSet={heroBgSrcset}
            sizes='100vw'
            width={2880}
            height={2608}
            alt=''
            aria-hidden='true'
            fetchPriority='high'
            decoding='async'
          />
          <div className='container hero-grid'>
            <div className='hero-copy'>
              <p className='hero-lead' data-reveal>
                {t.heroLead}
              </p>
              <h1 className='hero-title' data-reveal>
                <span className='hero-title-corner tl' aria-hidden='true' />
                <span className='hero-title-corner tr' aria-hidden='true' />
                <span className='hero-title-corner bl' aria-hidden='true' />
                <span className='hero-title-corner br' aria-hidden='true' />
                <span className='hero-title-brand'>
                  <BlurText text='Open Design' by='words' start={0} />
                </span>
                <span className='hero-title-sub'>
                  <BlurText text={t.heroTitleSub} by={cjk ? 'letters' : 'words'} start={2} />
                </span>
              </h1>
              <div className='hero-actions' data-reveal>
                {/* Platform-aware download: `enhanceDownloadCta` in the inline
                    script of pages/index.astro rewrites href to the matching
                    release asset (Apple Silicon / Intel Mac / Windows) for a
                    direct download and appends the detected chip label. When
                    the platform can't be named (Linux / undetermined / API
                    rate-limited) it falls back to the /download/ page (the
                    per-platform picker) rather than the GitHub releases list. */}
                <a
                  className='btn btn-primary'
                  href={href('/download/')}
                  data-download-cta
                  data-download-chip-target
                  data-download-placement='hero'
                >
                  <span className='arrow'>{iconDownload}</span>
                  {home.hero.download}
                </a>
                <a className='btn btn-ghost' href={REPO} {...ext}>
                  <span className='arrow'>{<RemixIcon glyph={RI.github} />}</span>
                  <span>
                    Star{' '}
                    <span className='star-count' data-github-stars>
                      {github.starsLabel}
                    </span>
                  </span>
                </a>
              </div>
              <p className='hero-sub' data-reveal>
                <BreakText text={t.heroSub} />
              </p>
              <div className='hero-shot' data-reveal>
                <img
                  src={heroProductImage}
                  srcSet={heroProductSrcset}
                  sizes='(max-width: 768px) 100vw, 60vw'
                  width={2508}
                  height={1450}
                  alt='Open Design desktop — design files & index.html preview'
                  decoding='async'
                  className='hero-shot-img'
                />
              </div>
            </div>
          </div>
        </section>

        {/* ====== ABOUT ====== */}
        <section className='about' data-od-id='about'>
          <div className='container'>
            <div className='about-grid'>
              <div className='about-copy' data-reveal>
                <p className='about-kicker'>
                  {locale === 'zh' ? '为什么选择 Open Design？' : 'Why Open Design?'}
                </p>
                {/*
                  Text Scroll Reveal (Magic UI / Inspira port): a tall track
                  with a sticky, vertically-centered paragraph whose tokens
                  brighten one by one as the reader scrolls. `data-about-reveal`
                  is the scroll host; `enhanceStatementReveal` in
                  `pages/index.astro` maps scroll progress → per-token opacity.
                */}
                <div className='about-reveal' data-about-reveal>
                  <div className='about-reveal-sticky'>
                    <h2 className='display about-reveal-text'>
                      {tokenizeReveal(t.aboutStatement).map((tok, i) =>
                        tok.type === 'space' ? (
                          <span className='reveal-space' key={i}>
                            {' '}
                          </span>
                        ) : (
                          <span className='reveal-word' data-reveal-word key={i}>
                            {tok.value}
                          </span>
                        ),
                      )}
                    </h2>
                  </div>
                </div>
                <div className='about-scrolly' data-about-scrolly>
                <div className='about-sticky'>
                <div className='about-tabs' data-reveal>
                  <input
                    type='radio'
                    name='about-tab'
                    id='about-tab-1'
                    className='about-tab-radio'
                    defaultChecked
                  />
                  <input
                    type='radio'
                    name='about-tab'
                    id='about-tab-2'
                    className='about-tab-radio'
                  />
                  <input
                    type='radio'
                    name='about-tab'
                    id='about-tab-3'
                    className='about-tab-radio'
                  />
                  <div className='about-tablist' role='tablist'>
                    <label className='about-tab' htmlFor='about-tab-1'>
                      {t.aboutTab1}
                    </label>
                    <label className='about-tab' htmlFor='about-tab-2'>
                      {t.aboutTab2}
                    </label>
                    <label className='about-tab' htmlFor='about-tab-3'>
                      {t.aboutTab3}
                    </label>
                  </div>
                  <div className='about-panels'>
                    <div className='about-track'>
                    <div className='about-panel'>
                      <div className='about-panel-img about-panel-img-bare about-panel-img-captioned'>
                        <LazyImg
                          src='/about/desktop-native.webp'
                          alt='设计在桌面端发生。本地文件、Figma 导出、代码仓库直接可读，Agent 拥有终端执行全部能力。'
                        />
                        <p className='about-panel-caption'>
                          <BreakText text={t.aboutCap1} />
                        </p>
                      </div>
                    </div>
                    <div className='about-panel'>
                      <div className='about-panel-img about-panel-img-bare about-panel-img-captioned'>
                        <LazyImg
                          src='/about/access-agent.webp'
                          alt='你电脑上的 Claude Code / Codex / Cursor 已经够强。OD 做的是把它们接进完整设计工作流。'
                        />
                        {/* Caption laid over the image's baked-in white card. */}
                        <p className='about-panel-caption'>
                          <BreakText text={t.aboutCap2} />
                        </p>
                      </div>
                    </div>
                    <div className='about-panel'>
                      <div className='about-panel-img about-panel-img-bare about-panel-img-captioned'>
                        <LazyImg
                          src='/about/self-evolution.webp?v=4'
                          alt='每次选择都沉淀为 Design System、偏好和记忆，下次生成更接近你要的结果。'
                        />
                        <p className='about-panel-caption'>
                          {t.aboutCap3}
                        </p>
                      </div>
                    </div>
                    </div>
                  </div>
                </div>
                </div>
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
            <div className='capabilities-grid'>
              <div className='capabilities-copy' data-reveal>
                {/* Two-column scrollytelling: a tall track pins the WHOLE module
                    (heading + steps + art). Scrolling through the track advances
                    the active step on the left and swaps the matching art on the
                    right one-to-one — the module stays frozen until the last step,
                    then the page scrolls on. Driven by `enhanceCapScrolly`. */}
                <div
                  className='cap-scrolly'
                  data-cap-scrolly
                  style={{ ['--steps' as string]: capabilityCards.length } as React.CSSProperties}
                >
                  <div className='cap-sticky'>
                    <div className='capabilities-head'>
                      <h2 className='display'>{t.capTitle}</h2>
                      {/* Draggable "DONE 👌" mark. Kept a DIRECT child of
                          .capabilities-head (not nested in the <h2>) so the
                          authored layout rules actually bind to it: on desktop
                          it's a flex item beside the heading (20px column-gap),
                          and on mobile it's a grid item (grid-area: icon) that
                          moves next to the two-up steps. Nested inside the
                          heading, grid-area never applied and the mark stayed
                          stuck in the title row. */}
                      <img
                        className='cap-head-icon'
                        src='/hero-icon-drag.svg'
                        alt='Done 👌'
                        width={252}
                        height={300}
                        draggable={false}
                        data-drag-icon
                        decoding='async'
                      />
                      {/* Pipeline-style leads (Brief → … → 记忆沉淀) must hold
                          a single line at every viewport; prose leads keep
                          the normal 36ch wrap. Detected by the arrow glyph. */}
                      <p
                        className={
                          home.capabilities.lead.includes('→')
                            ? 'lead lead-pipeline'
                            : 'lead'
                        }
                      >
                        {home.capabilities.lead}
                      </p>
                    </div>
                    <div className='cap-row'>
                      <ol className='cap-steps'>
                        {capabilityCards.map((card, index) => (
                          <li
                            className={index === 0 ? 'cap-step is-active' : 'cap-step'}
                            key={index}
                            data-cap-step
                            data-cap-index={index}
                          >
                            <span className='cap-step-num'>{`0${index + 1}`}</span>
                            <span className='cap-step-label'>{card.title ?? card.num}</span>
                          </li>
                        ))}
                      </ol>
                      <div className='cap-visual'>
                        {capabilityCards.map((card, index) => (
                          <div
                            className={index === 0 ? 'cap-frame is-active' : 'cap-frame'}
                            key={index}
                            data-cap-frame={index}
                          >
                            {card.img ? (
                              <>
                                <img src={card.img} alt='' loading='lazy' decoding='async' />
                                {card.desc ? (
                                  <span className='cap-frame-caption'>{card.desc}</span>
                                ) : null}
                              </>
                            ) : (
                              <div className='cap-frame-text'>
                                <div className='cap-frame-title'>{card.title ?? card.num}</div>
                                {card.body ? <p>{card.body}</p> : null}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ====== LABS ====== */}
        <section className='labs' id='labs' data-od-id='labs'>
          <div className='container'>
            <div className='labs-head'>
              <div data-reveal>
                <h2 className='display'>
                  {t.labsPre}
                  <em>Open Design</em>
                  {t.labsPost}
                </h2>
              </div>
            </div>
            {/* Labs — a clean image preview driven by the mode Dock below it.
                The app-window chrome is gone; the Dock magnifies on hover and
                its tiles switch / auto-cycle the preview image in place
                (enhancers in `pages/index.astro`). */}
            <div className='lab-stage' data-reveal>
              {/* Floating artifact card layered over the painting background.
                  `enhanceLabSwitch` (pages/index.astro) swaps its src from the
                  dock and toggles visibility; the "图片" tile maps to the
                  painting itself, so it hides the card and shows it bare. */}
              <img className='lab-artifact' data-lab-artifact alt='' decoding='async' />
              {/* Video mode: the "视频" tile plays this looping clip instead of a
                  still card. `enhanceLabSwitch` plays it on select and pauses it
                  on every other mode. CSS locks it to the cards' 1592×1000 box so
                  its height matches the image previews exactly. */}
              <video
                className='lab-artifact lab-artifact-video'
                data-lab-video
                muted
                loop
                playsInline
                preload='metadata'
                aria-hidden='true'
              />
              {/* Labs filter as a centered macOS-style magnifying Dock (React
                  Bits "Dock", reproduced in vanilla for this SSR/no-React
                  page). Proximity magnification + click/auto-cycle preview swap
                  are driven by the enhancers in `pages/index.astro`. */}
              <div className='lab-dock' data-lab-dock data-reveal>
                {([
                  {
                    label: 'Prototype',
                    href: href('/plugins/templates/prototype/'),
                    preview: '/lab-cards/prototype.webp?v=5',
                  },
                  {
                    label: 'Live Artifact',
                    href: href('/plugins/templates/live-artifact/'),
                    preview: '/lab-cards/live-artifact.webp?v=3',
                  },
                  {
                    label: 'Slides',
                    href: href('/plugins/templates/deck/'),
                    preview: '/lab-cards/slides.png?v=5',
                  },
                  { label: tt('图片', 'Image'), href: href('/plugins/templates/image/'), preview: '/lab-cards/quest.webp?v=1', wide: true },
                  { label: 'HyperFrames', href: href('/plugins/templates/hyperframes/'), video: '/lab-hyperframes.mp4' },
                  { label: tt('视频', 'Video'), href: href('/plugins/templates/video/'), video: '/lab-video.mp4' },
                ] as ReadonlyArray<{
                  label: string;
                  href: string;
                  preview?: string;
                  video?: string;
                  wide?: boolean;
                }>).map((item, i) => (
                  <a
                    key={item.label}
                    className={item.wide ? 'lab-dock-item active' : 'lab-dock-item'}
                    href={item.href}
                    data-dock-item
                    data-preview-src={
                      item.video
                        ? undefined
                        : item.preview ?? labArtifacts[i % labArtifacts.length] ?? labActive
                    }
                    data-preview-video={item.video}
                    data-preview-wide={item.wide ? '' : undefined}
                    data-preview-title={item.label}
                    aria-label={item.label}
                  >
                    <span className='lab-dock-icon' aria-hidden='true'></span>
                    <span className='lab-dock-label'>{item.label}</span>
                  </a>
                ))}
              </div>
            </div>{/* /lab-stage */}
          </div>
        </section>

        {/* ====== METHOD ====== */}
        <section className='method' data-od-id='method'>
          <div className='container'>
            <div className='method-head'>
              <div data-reveal>
                <h2 className='display' style={{ marginTop: 0 }}>
                  {t.methodTitle}
                </h2>
              </div>
              <div className='right' data-reveal='right'>
                <p>{home.method.lead}</p>
              </div>
            </div>
            {/* FallingText (React Bits, matter-js) — the coding-agent names
                drop into a physics playground on hover; driven by the
                `initFallingText` enhancer in `pages/index.astro`. */}
            <div
              className='falling-text'
              data-falling-text
              data-trigger='scroll'
              data-gravity='0.9'
              data-stiffness='0.9'
            >
              <div className='falling-text-target'>
                {FALLING_ICONS.map((icon, index) => (
                  <span className='falling-word falling-chip' key={`${icon.alt}-${index}`}>
                    <img src={icon.src} alt={icon.alt} loading='lazy' decoding='async' />
                  </span>
                ))}
              </div>
              <div className='falling-text-canvas' aria-hidden='true' />
              {/* Revealed (faded in) once every icon has dropped and settled. */}
              <img
                className='falling-text-reveal'
                src='/method-coding-agent.png'
                alt='21+ Coding Agent'
                data-falling-reveal
                loading='lazy'
                decoding='async'
              />
            </div>
          </div>
        </section>

        {/* ====== TESTIMONIAL / COLLABORATORS ====== */}
        <section className='testimonial' data-od-id='testimonial'>
          <div className='container'>
            <div className='testimonial-grid with-globe'>
              <div className='testimonial-copy' data-reveal>
                <h2 style={{ marginTop: 30 }}>
                  {t.testiPre}
                  <span data-github-contributors>326</span>
                  {t.testiMid}
                  <br />
                  <span style={{ whiteSpace: 'nowrap' }}>{t.testiPost}</span>
                </h2>
                <a
                  className='btn btn-ghost'
                  href={REPO_CONTRIBUTORS}
                  style={{ marginTop: 16 }}
                  {...ext}
                >
                  {tt('查看全部贡献者', 'View all contributors')}
                  <span className='arrow'>{arrowOut}</span>
                </a>
              </div>
              <div className='testimonial-globe' data-reveal='right' data-testimonial-globe>
                <canvas
                  aria-label='Open Design global contributor map'
                  className='testimonial-globe-canvas'
                  height={720}
                  width={720}
                />
                {/* Contributor avatars orbiting the globe (no spokes), populated
                    from the GitHub contributors API by `enhanceContributorOrbit`. */}
                <div
                  className='contributor-orbit'
                  data-contributor-orbit
                  aria-hidden='true'
                />
              </div>
            </div>
          </div>
        </section>

        {/* ====== SELECTED WORK ====== */}
        <section className='tight' data-od-id='work'>
          <h2 className='work-stats-title' data-reveal>
            {tt('我们的项目获得了：', 'What this project has earned')}
          </h2>
          <div className='work'>
            <div className='work-stats-grid' data-reveal>
                {([
                  // `live` cards show the real-time GitHub count (filled by the
                  // [data-github-stars] / [data-github-contributors] enhancers in
                  // index.astro); the hard-coded `num` is only the SSR fallback
                  // shown until the API responds. The rest count up from 0.
                  { src: 'card-1.webp', num: '52K+', to: '52', suffix: 'K+', alt: 'GitHub Stars', href: REPO, live: 'stars' as const },
                  { src: 'card-2.webp', num: '280+', to: '280', suffix: '+', alt: tt('贡献者', 'Contributors'), href: `${REPO}/graphs/contributors`, live: 'contributors' as const },
                  { src: 'card-3.webp', num: '217+', to: '217', suffix: '+', alt: 'Plugins', href: href('/plugins/') },
                  { src: 'card-4.webp', num: '129+', to: '129', suffix: '+', alt: 'Design Systems', href: href('/plugins/systems/') },
                  { src: 'card-5.webp', num: '21', to: '21', suffix: '', alt: tt('Coding Agent 支持', 'Coding Agents'), href: REPO },
                  { src: 'card-6.webp', num: null, to: null, suffix: '', alt: 'Star us', href: REPO, cta: true },
                ] as ReadonlyArray<{ src: string; num: string | null; to: string | null; suffix: string; alt: string; href: string; live?: 'stars' | 'contributors'; cta?: boolean }>).map((item, index) => (
                  <a
                    className={`work-stat-card work-img-card${item.cta ? ' work-stat-card-cta' : ''}`}
                    href={item.href}
                    key={item.src}
                    style={{ '--tilt': `${[-1.2, 1.4, -0.6, 0.9, -1, 1.1][index]}deg` } as React.CSSProperties}
                    {...(item.href.startsWith('http') ? ext : {})}
                  >
                    <LazyImg src={`/work-cards/${item.src}`} alt={item.alt} />
                    <span className='work-card-arrow' aria-hidden='true'>
                      {arrowOut}
                    </span>
                    <h3 className='work-stat-overlay'>
                      {item.live === 'stars' ? (
                        <span data-github-stars>{item.num}</span>
                      ) : item.live === 'contributors' ? (
                        <span data-github-contributors>{item.num}</span>
                      ) : item.num ? (
                        <span
                          data-countup
                          data-countup-to={item.to}
                          data-countup-suffix={item.suffix}
                        >
                          {item.num}
                        </span>
                      ) : null}
                      <em>{item.alt}</em>
                    </h3>
                  </a>
                ))}
              </div>
          </div>
        </section>

        {/* ====== FAQ ====== */}
        {/* Restored from the canonical open-design.ai/zh layout. Content comes
            from `getHomeFaq` (index.astro), the same source as the FAQPage
            JSON-LD, so the visible answers match the structured data. */}
        <section className='cta' id='contact' data-od-id='cta'>
          <div className='container'>
            <div className='cta-dance'>
              {/* Open Design Home window floating over the mural — sits above the
                  painting (::before) but below the CTA copy. Bottom is clipped by
                  the block's overflow:hidden, matching the reference comp.
                  `data-reveal` slides it up from below when the module enters view
                  (the module itself no longer animates). */}
              <img
                className='cta-window'
                src='/cta-window.webp'
                alt='Open Design 桌面端首页'
                width={2996}
                height={1870}
                decoding='async'
                data-reveal
              />
              <div className='cta-dance-inner'>
                <h2 className='display'>{t.ctaTitle}</h2>
                <p className='lead'>{home.cta.lead}</p>
                <div className='cta-actions'>
                  {/* Same direct-download behaviour as the hero CTA: the
                      `enhanceDownloadCta` enhancer detects the OS, rewrites this
                      to the matching release asset (.dmg/.exe) with a download
                      attr, and appends the platform chip. Falls back to the
                      /download/ picker when detection or the API is unavailable
                      — not the raw GitHub releases list. */}
                  <a
                    className='btn btn-primary'
                    href={href('/download/')}
                    data-download-cta
                    data-download-chip-target
                    data-download-placement='cta'
                  >
                    <span className='arrow'>{iconDownload}</span>
                    {home.hero.download}
                  </a>
                  <a className='btn btn-primary' href={REPO} {...ext}>
                    <span className='arrow'>{<RemixIcon glyph={RI.github} />}</span>
                    {home.cta.star}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ====== NEWSLETTER ====== */}
        {/* Subscribe band between the CTA window and the FAQ. Static site — no
            mailing-list backend exists yet, so `enhanceNewsletter` in
            `pages/index.astro` intercepts submit and swaps in the localized
            thanks line; wire a real provider endpoint into the form action
            when one lands. */}
        <section className='newsletter' id='newsletter' data-od-id='newsletter'>
          <div className='container'>
            <div className='newsletter-grid'>
              <div className='newsletter-copy' data-reveal>
                <h2 className='newsletter-title'>{t.newsTitle}</h2>
                <p className='newsletter-desc'>{t.newsDesc}</p>
              </div>
              <form
                className='newsletter-form'
                data-newsletter
                data-newsletter-done={t.newsDone}
                data-newsletter-error={t.newsError ?? 'Couldn’t subscribe just now — please try again.'}
                data-reveal='right'
              >
                <input
                  className='newsletter-input'
                  type='email'
                  name='email'
                  placeholder='you@studio.com'
                  autoComplete='email'
                  required
                  aria-label={t.newsTitle}
                />
                <button className='newsletter-submit' type='submit'>
                  {t.newsBtn}
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* ====== FAQ ====== */}
        <section className='faq' id='faq' data-od-id='faq'>
          <div className='container'>
            <div className='faq-layout'>
              <div className='faq-head' data-reveal>
                <h2 className='display faq-title-zh'>{t.faqTitle}</h2>
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
          </div>
        </section>

        {/* ====== FOOTER ====== */}
        <footer className='sub-footer' data-od-id='footer'>
          <div className='container sub-footer-inner'>
            <div className='sub-footer-grid'>
              <div className='sub-footer-col'>
                <h5>{menu.product}</h5>
                <ul>
                  <li><a href={href('/')}>Open Design</a></li>
                  <li><a href={href('/html-anything/')}>{ui.footer.htmlAnything}</a></li>
                  <li><a href={href('/html-video/')}>{ui.footer.htmlVideo}</a></li>
                </ul>
              </div>

              <div className='sub-footer-col'>
                <h5><a href={href('/solutions/')}>{menu.solution}</a></h5>
                <ul>
                  {menu.useCaseItems.map((name, i) => (
                    <li key={FOOTER_USE_CASE_HREFS[i]}>
                      <a href={href(FOOTER_USE_CASE_HREFS[i]!)}>{name}</a>
                    </li>
                  ))}
                </ul>
              </div>

              <div className='sub-footer-col'>
                <h5><a href={href('/agents/')}>{menu.agent}</a></h5>
                <ul>
                  {FOOTER_AGENTS.map((a) => (
                    <li key={a.route}>
                      <a href={href(`/agents/${a.route}/`)}>{a.name}</a>
                    </li>
                  ))}
                  <li><a href={href('/agents/')}>{footL.allAgents} →</a></li>
                </ul>
              </div>

              <div className='sub-footer-col'>
                <h5><a href={href('/plugins/')}>{commonCopy.header.nav.plugins}</a></h5>
                <ul>
                  <li><a href={href('/plugins/templates/')}>{commonCopy.header.nav.templates}</a></li>
                  <li><a href={href('/plugins/skills/')}>{commonCopy.header.nav.skills}</a></li>
                  <li><a href={href('/plugins/systems/')}>{commonCopy.header.nav.systems}</a></li>
                </ul>
              </div>

              <div className='sub-footer-col'>
                <h5><a href={href('/compare/')}>{ui.footer.compare}</a></h5>
                <ul>
                  <li><a href={href('/alternatives/claude-design/')}>Claude Design</a></li>
                  <li><a href={href('/alternatives/figma/')}>Figma</a></li>
                  <li><a href={href('/alternatives/lovable/')}>Lovable</a></li>
                  <li><a href={href('/alternatives/bolt/')}>Bolt</a></li>
                  <li><a href={href('/alternatives/v0/')}>v0</a></li>
                  <li><a href={href('/alternatives/framer/')}>Framer</a></li>
                </ul>
              </div>

              <div className='sub-footer-col'>
                <h5>{menu.resources}</h5>
                <ul>
                  <li><a href={href('/blog/')}>{menu.resourceItems.blog}</a></li>
                  <li><a href={href('/tutorials/')}>{menu.resourceItems.tutorials}</a></li>
                  <li><a href={href('/download/')}>{menu.resourceItems.download}</a></li>
                  <li><a href={href('/quickstart/')}>{ui.footer.quickstart}</a></li>
                  <li><a href={href('/official/')}>{ui.footer.official}</a></li>
                </ul>
              </div>

              <div className='sub-footer-col'>
                <h5>{footL.company}</h5>
                <ul>
                  <li><a href={href('/about/')}>{footL.about}</a></li>
                  <li><a href={href('/faq/')}>{footL.faq}</a></li>
                  <li><a href={href('/privacy/')}>{footL.privacy}</a></li>
                  <li><a href={href('/terms/')}>{footL.terms}</a></li>
                  <li><a href={REPO} target='_blank' rel='noopener'>{ui.footer.github}</a></li>
                  <li><a href={DISCORD} target='_blank' rel='noopener'>{ui.footer.discord}</a></li>
                </ul>
              </div>
            </div>

            <div className='foot-bar'>
              <div className='foot-bar-left'>
                <span className='foot-copy'>© 2026 Powerformer, Inc. · Apache-2.0</span>
                <a href={href('/privacy/')}>{footL.privacy}</a>
                <span className='foot-dot' aria-hidden='true'>·</span>
                <a href={href('/terms/')}>{footL.terms}</a>
              </div>
              <div className='foot-social'>
                <a href={X_TWITTER} target='_blank' rel='noopener' aria-label='X'>
                  <svg viewBox='0 0 24 24' width='18' height='18' fill='currentColor' aria-hidden='true'><path d='M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.65l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25h6.815l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z' /></svg>
                </a>
                <a href={DISCORD} target='_blank' rel='noopener' aria-label='Discord'>
                  <svg viewBox='0 0 24 24' width='18' height='18' fill='currentColor' aria-hidden='true'><path d='M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127c-.598.349-1.22.645-1.873.891a.076.076 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.056c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z' /></svg>
                </a>
                <a href={REPO} target='_blank' rel='noopener' aria-label='GitHub'>
                  <svg viewBox='0 0 24 24' width='18' height='18' fill='currentColor' aria-hidden='true'><path d='M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.5 11.5 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12' /></svg>
                </a>
                <a href={YOUTUBE} target='_blank' rel='noopener' aria-label='YouTube'>
                  <svg viewBox='0 0 24 24' width='18' height='18' fill='currentColor' aria-hidden='true'><path d='M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z' /></svg>
                </a>
              </div>
            </div>
            {/* Masthead sign-off — same markup contract as
                `site-footer.astro` so the shared `.foot-masthead` styles
                in globals.css cover both footers. */}
            <div className='foot-masthead' data-od-id='footer-masthead'>
              <p className='foot-masthead-wordmark'>
                Open <span className='foot-masthead-accent'>Design</span><span className='foot-masthead-period'>.</span>
              </p>
            </div>
          </div>
        </footer>
      </div>
      {/*
        Page-level progressive Gaussian blur pinned to the bottom edge
        (React Bits "Gradual Blur", SSR port). Restores the backdrop blur
        that a plain `.page-bottom-fade` white gradient had replaced.
      */}
      <GradualBlur
        target='page'
        position='bottom'
        height='4rem'
        strength={3}
        divCount={10}
        opacity={1}
        curve='linear'
        exponential
      />
    </>
  );
}
