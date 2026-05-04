/*
 * Open Design — Atelier Zero landing page.
 *
 * Mirrors `skills/editorial-collage/example.html` 1:1. When the canonical
 * example.html changes, mirror the diff here and into `app/globals.css`.
 *
 * Static React component rendered by Astro. The Header and Wire components
 * own the small client-side behaviors; promote other sections to Astro
 * islands only when behavior is needed.
 */

import { Header } from './_components/header';
import { Wire } from './_components/wire';
import { heroImage, imageAsset } from './image-assets';

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

// Canonical project URLs. Keep in sync with skills/editorial-collage/example.html.
const REPO = 'https://github.com/nexu-io/open-design';
const REPO_RELEASES = `${REPO}/releases`;
const REPO_ISSUES = `${REPO}/issues`;
const REPO_CONTRIBUTORS = `${REPO}/graphs/contributors`;
const REPO_DAEMON = `${REPO}/tree/main/apps/daemon`;
const REPO_SKILLS = `${REPO}/tree/main/skills`;
const REPO_DESIGN_SYSTEMS = `${REPO}/tree/main/design-systems`;
const REPO_DOCS = (file: string) => `${REPO}/blob/main/${file}`;

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

export default function Page() {
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
                Live · v0.2.0
              </a>
              <span className='locale-switch'>
                <b>EN</b>
                {' · '}
                <a className='topbar-link' href={REPO} {...ext} title='Localization in progress — open the repo on GitHub'>
                  DE
                </a>
                {' · '}
                <a className='topbar-link' href={REPO} {...ext} title='Localization in progress — open the repo on GitHub'>
                  中文
                </a>
                {' · '}
                <a className='topbar-link' href={REPO} {...ext} title='Localization in progress — open the repo on GitHub'>
                  日本語
                </a>
              </span>
            </span>
          </div>
        </div>

        {/* ====== NAV ====== */}
        {/* Headroom-style sticky header with live GitHub star count. */}
        <Header />

        {/* ====== HERO ====== */}
        <section className='hero' id='top' data-od-id='hero'>
          <div className='container hero-grid'>
            <div className='hero-copy'>
              <span className='label' data-reveal>
                Open-source design studio <span className='ix'>· Nº 01</span>
              </span>
              <h1 className='display' data-reveal>
                Designing <em>intelligence</em> with skills, <em>taste,</em> and{' '}
                <em>code</em>
                <span className='dot'>.</span>
              </h1>
              <p className='lead' data-reveal>
                The open-source alternative to Anthropic&rsquo;s Claude Design.
                12 coding agents — Claude, Codex, Cursor, Gemini and friends —
                drive 31 composable skills and 72 brand-grade design systems.
                Generate web pages, slide decks, mobile prototypes, images, even
                short videos — all running on your own laptop.
              </p>
              <div className='hero-actions' data-reveal>
                <a className='btn btn-primary' href={REPO} {...ext}>
                  Star us on GitHub
                  <span className='arrow'>{arrowOut}</span>
                </a>
                <a className='btn btn-ghost' href={REPO_RELEASES} {...ext}>
                  Download desktop
                  <span className='arrow'>{arrowPlus}</span>
                </a>
              </div>
              <div className='hero-stats' data-reveal>
                <div className='stat'>
                  <span className='ring solid'>31</span>
                  <span className='stat-label'>
                    <b>skills</b>shippable
                  </span>
                </div>
                <div className='stat'>
                  <span className='ring'>72</span>
                  <span className='stat-label'>
                    <b>systems</b>portable
                  </span>
                </div>
                <div className='stat'>
                  <span className='ring coral'>12</span>
                  <span className='stat-label'>
                    <b>CLIs</b>BYO agent
                  </span>
                </div>
              </div>
              <div className='hero-foot' data-reveal>
                <span className='meta'>
                  ↳{NBSP}{NBSP}pnpm tools-dev{NBSP}{NBSP}·{NBSP}{NBSP}3 commands
                  to start
                </span>
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
              <img src={heroImage} alt='' />
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
                <span className='label'>
                  About the studio <span className='ix'>· Nº 02</span>
                </span>
                <h2 className='display'>
                  We treat <em>your agent</em> as a creative{' '}
                  <em>collaborator,</em> not a black box
                  <span className='dot'>.</span>
                </h2>
                <p className='lead'>
                  The strongest coding agents already live on your laptop. We
                  don&rsquo;t ship one — we wire them into a skill-driven design
                  workflow that runs locally with{' '}
                  <code className='code-inline'>pnpm tools-dev</code>, deploys
                  the web layer to Vercel, and stays BYOK at every layer.
                </p>
                <a className='btn btn-ghost' href={REPO_DAEMON} {...ext}>
                  Read our approach
                  <span className='arrow'>{arrowOut}</span>
                </a>
                <div className='footer-row'>
                  <span className='mark'>Ø</span>
                  <span>Research · Design · Engineering · Repeat</span>
                  <span className='stamp'>
                    <span>Studio practice</span>
                    <span style={{ color: 'var(--ink)' }}>Est. MMXXVI</span>
                  </span>
                </div>
              </div>
              <div className='about-art' data-reveal='right'>
                <img src={imageAsset('about.png', { width: 1024, quality: 82 })} alt='' />
                <div className='about-side-note'>
                  <b />
                  From model behavior
                  <br />
                  to visual taste, we
                  <br />
                  prototype the full
                  <br />
                  stack of creative
                  <br />
                  systems.
                </div>
                <div className='about-caption'>
                  <b>Studies in form · perception · machine imagination.</b>
                  (Open Design, MMXXVI)
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
                <img src={imageAsset('capabilities.png', { width: 1024, quality: 82 })} alt='' />
                <div className='ribbon'>
                  <b>OPEN DESIGN</b>
                  {NBSP}·{NBSP}CAPABILITIES MATRIX{NBSP}·{NBSP}OD/26
                </div>
              </div>
              <div className='capabilities-copy' data-reveal>
                <span className='label'>
                  Capabilities <span className='ix'>· Nº 03</span>
                </span>
                <h2 className='display'>
                  Skills, systems, and surfaces <em>for creative</em>{' '}
                  intelligence<span className='dot'>.</span>
                </h2>
                <p className='lead'>
                  We blend human taste with whichever agent you already trust to
                  ship interfaces, decks, and editorial pages that feel
                  intentional, expressive, and alive.
                </p>
                <div className='cards'>
                  <div className='card' data-reveal>
                    <div className='num'>
                      01<span className='tag'>Skills</span>
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
                      Skills,
                      <br />
                      not plugins
                    </h3>
                    <p>
                      31 file-based{' '}
                      <code style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                        SKILL.md
                      </code>{' '}
                      bundles. Drop a folder in, restart the daemon, it appears.
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
                      02<span className='tag'>Systems</span>
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
                      Design Systems
                      <br />
                      as Markdown
                    </h3>
                    <p>
                      72 portable{' '}
                      <code style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                        DESIGN.md
                      </code>{' '}
                      systems — Linear, Vercel, Stripe, Apple, Cursor, Figma…
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
                      03<span className='tag'>Adapters</span>
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
                      12 Agent
                      <br />
                      Adapters
                    </h3>
                    <p>
                      Claude · Codex · Gemini · Cursor · Copilot · OpenCode ·
                      Devin · Hermes · Pi · Kimi · Kiro · Qwen — auto-detected
                      on $PATH.
                    </p>
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
                      04<span className='tag'>BYOK</span>
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
                      BYOK
                      <br />
                      at every layer
                    </h3>
                    <p>
                      OpenAI-compatible proxy. DeepSeek, Groq, OpenRouter, your
                      self-hosted vLLM — paste a baseUrl + key, ship.
                    </p>
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
                <span>05 of 31 ongoing</span>
              </span>
              <span>004 / 008</span>
            </div>
            <div className='labs-head'>
              <div data-reveal>
                <span className='label'>
                  Labs <span className='ix'>· Nº 04</span>
                </span>
                <h2 className='display' style={{ marginTop: 30 }}>
                  A living archive of <em>experiments</em> in skills, decks, and
                  machine-made form<span className='dot'>.</span>
                </h2>
              </div>
              <div className='pills' data-reveal='right'>
                <button type='button' className='pill active'>
                  All<span className='count'>31</span>
                </button>
                <button type='button' className='pill'>
                  Prototype<span className='count'>27</span>
                </button>
                <button type='button' className='pill'>
                  Deck<span className='count'>04</span>
                </button>
                <button type='button' className='pill'>
                  Mobile<span className='count'>03</span>
                </button>
                <button type='button' className='pill'>
                  Office<span className='count'>08</span>
                </button>
              </div>
            </div>
            <div className='labs-meta'>
              <span className='ring'>05</span>
              <div className='meta-text'>
                <b>Ongoing experiments</b>
                documenting ideas in flux
                <br />
                building intelligence
                <br />
                through making
              </div>
            </div>
            <div className='labs-grid'>
              {[
                {
                  badge: 'Deck',
                  num: 'Nº 01',
                  title: 'Magazine Decks',
                  body: (
                    <>
                      Editorial-grade slide decks with{' '}
                      <code style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                        guizang-ppt
                      </code>
                      . Magazine layout, WebGL hero.
                    </>
                  ),
                  src: imageAsset('lab-1.png', { width: 768, quality: 82 }),
                  href: `${REPO_SKILLS}/guizang-ppt`,
                },
                {
                  badge: 'Media',
                  num: 'Nº 02',
                  title: 'Synthetic Matter',
                  body: 'Gpt-image-2 + Seedance + HyperFrames. Image, video, audio — same chat surface as code.',
                  src: imageAsset('lab-2.png', { width: 768, quality: 82 }),
                  href: `${REPO_SKILLS}/hyperframes`,
                },
                {
                  badge: 'Loop',
                  num: 'Nº 03',
                  title: 'Prompt Choreography',
                  body: 'The interactive question form pops before a single pixel is improvised. 30s of radios beats 30min of redirects.',
                  src: imageAsset('lab-3.png', { width: 768, quality: 82 }),
                  href: `${REPO_SKILLS}/design-brief`,
                },
                {
                  badge: 'Critique',
                  num: 'Nº 04',
                  title: 'Visual Reasoning',
                  body: '5-dim self-critique gates every artifact: philosophy · hierarchy · execution · specificity · restraint.',
                  src: imageAsset('lab-4.png', { width: 768, quality: 82 }),
                  href: `${REPO_SKILLS}/critique`,
                },
                {
                  badge: 'Runtime',
                  num: 'Nº 05',
                  title: 'Soft Systems',
                  body: 'Sandboxed iframe preview. Streaming todos. Real-cwd filesystem. Adaptive loops between human and machine.',
                  src: imageAsset('lab-5.png', { width: 768, quality: 82 }),
                  href: REPO_DAEMON,
                },
              ].map((lab) => (
                <div className='lab' key={lab.num} data-reveal>
                  <div className='lab-img'>
                    <span className='badge'>{lab.badge}</span>
                    <img src={lab.src} alt='' />
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
                05 / 31 SKILLS{NBSP}·{NBSP}
                <a
                  href={REPO_SKILLS}
                  className='library-link'
                  style={{ color: 'var(--coral)' }}
                  {...ext}
                >
                  VIEW FULL LIBRARY →
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
                <span className='label'>
                  Method <span className='ix'>· Nº 05</span>
                </span>
                <h2 className='display' style={{ marginTop: 30 }}>
                  From <em>signals</em> to systems<span className='dot'>.</span>
                </h2>
              </div>
              <div className='right' data-reveal='right'>
                <span className='plus'>+</span>
                <p>
                  Every stage is iterative, visual, and research-driven —
                  composable files, not opaque prompts.
                </p>
              </div>
            </div>
            <div className='method-grid'>
              {[
                {
                  num: '01',
                  title: 'Detect',
                  body: 'The daemon scans your $PATH for 12 coding agents and auto-loads 31 skills + 72 systems on boot.',
                  src: imageAsset('method-1.png', { width: 816, quality: 82 }),
                },
                {
                  num: '02',
                  title: 'Discover',
                  body: 'Turn 1 is a question form — surface, audience, tone, scale, brand context. Locked in 30 seconds.',
                  src: imageAsset('method-2.png', { width: 816, quality: 82 }),
                },
                {
                  num: '03',
                  title: 'Direct',
                  body: 'Pick one of 5 deterministic visual directions. Palette in OKLch, font stack, layout posture cues.',
                  src: imageAsset('method-3.png', { width: 816, quality: 82 }),
                },
                {
                  num: '04',
                  title: 'Deliver',
                  body: 'The agent writes to disk, you preview in a sandboxed iframe, export HTML / PDF / PPTX / ZIP / Markdown.',
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
                    <img src={step.src} alt='' />
                  </div>
                </div>
              ))}
            </div>
            <div className='method-foot'>
              <div className='left'>
                <span className='ring' />
                <span>Skills inform everything. Files make it real.</span>
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
                <span className='label'>Selected work</span>
                <h2>
                  Skills that turn briefs into <em>memorable</em> shippable{' '}
                  <em>artifacts</em>
                  <span className='dot'>.</span>
                </h2>
                <a className='work-link' href={REPO_SKILLS} {...ext}>
                  View all 31 skills
                </a>
              </div>
              <a
                className='work-card'
                data-reveal
                href={`${REPO_SKILLS}/guizang-ppt`}
                {...ext}
              >
                <div className='label-row'>
                  <span className='small-label'>Featured skill</span>
                  <span className='index'>01 / 31</span>
                </div>
                <h3>guizang-ppt</h3>
                <p>
                  Magazine-style web PPT for product launches and pitch decks.
                  Bundled verbatim, original LICENSE preserved.
                </p>
                <div className='img'>
                  <img src={imageAsset('work-1.png', { width: 768, quality: 82 })} alt='' />
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
                  <span className='small-label'>Companion system</span>
                  <span className='index'>04 / 72</span>
                </div>
                <h3>kami</h3>
                <p>
                  An editorial paper system. Warm parchment canvas, ink-blue
                  accent, serif-led hierarchy — multilingual by design (EN ·
                  zh-CN · ja).
                </p>
                <div className='img'>
                  <img src={imageAsset('work-2.png', { width: 768, quality: 82 })} alt='' />
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
                <span className='label'>
                  Collaborators <span className='ix'>· Nº 06</span>
                </span>
                <h2 style={{ marginTop: 30 }}>
                  &ldquo;Open Design helped us turn vague <em>AI ideas</em> into
                  a visual system that felt <em>sharp, believable,</em> and
                  genuinely new.&rdquo;
                </h2>
                <div className='author'>
                  <span className='avatar'>m</span>
                  <p>
                    Mina Kovac
                    <br />
                    <span>Creative Director · North Form</span>
                  </p>
                </div>
                <div className='divider' />
                <p className='partners-text'>
                  Standing on the shoulders of teams shipping open-source design
                  culture.
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
                    <small>Philosophy</small>
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
                    <small>Decks</small>
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
                    <small>UX</small>
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
                    <small>Terminal</small>
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
                    <small>Frames</small>
                  </a>
                </div>
                <a className='read-more' href={REPO} {...ext}>
                  Read more stories
                </a>
              </div>
              <div className='testimonial-art' data-reveal='right'>
                <img src={imageAsset('testimonial.png', { width: 1024, quality: 82 })} alt='' />
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
                <span className='label'>
                  Start a conversation <span className='ix'>· Nº 07</span>
                </span>
                <h2 className='display'>
                  Let&rsquo;s build something <em>open</em> and{' '}
                  <em>visually</em> unforgettable<span className='dot'>.</span>
                </h2>
                <p className='lead'>
                  Star us on GitHub, drop into the issues, or run{' '}
                  <code className='code-inline'>pnpm tools-dev</code> tonight.
                  Three commands and the loop is yours.
                </p>
                <div className='cta-actions'>
                  <a className='btn btn-primary' href={REPO} {...ext}>
                    Star on GitHub
                    <span className='arrow'>{arrowOut}</span>
                  </a>
                  <a className='email-pill' href={REPO_ISSUES} {...ext}>
                    Open an issue
                    <span className='arrow-circle'>→</span>
                  </a>
                </div>
                <div className='cta-foot'>
                  <span className='stamp'>● Live</span>
                  <span>v0.2.0 / Apache-2.0</span>
                  <span style={{ marginLeft: 'auto' }}>
                    52.5200° N · 13.4050° E
                  </span>
                </div>
              </div>
              <div className='cta-art' data-reveal='right'>
                <img src={imageAsset('cta.png', { width: 1024, quality: 82 })} alt='' />
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
                  <span className='brand-mark'>Ø</span>
                  <span>Open Design</span>
                </a>
                <p style={{ marginTop: 18 }}>
                  The open-source alternative to Claude Design. Built on the
                  shoulders of{' '}
                  <a
                    className='inline-link'
                    href={LINEAGE['huashu-design']}
                    {...ext}
                  >
                    huashu-design
                  </a>
                  ,{' '}
                  <a
                    className='inline-link'
                    href={LINEAGE['guizang-ppt']}
                    {...ext}
                  >
                    guizang-ppt
                  </a>
                  ,{' '}
                  <a
                    className='inline-link'
                    href={LINEAGE['multica-ai']}
                    {...ext}
                  >
                    multica-ai
                  </a>
                  , and{' '}
                  <a
                    className='inline-link'
                    href={LINEAGE['open-codesign']}
                    {...ext}
                  >
                    open-codesign
                  </a>
                  .
                </p>
                <a
                  className='foot-cta'
                  href={REPO_RELEASES}
                  aria-label='Download the Open Design desktop app'
                  {...ext}
                >
                  Download desktop
                  <span className='meta'>macOS · v0.2.0</span>
                </a>
              </div>
              <div className='foot-col'>
                <h5>Studio</h5>
                <ul>
                  <li>
                    <a href='#agents'>Capabilities</a>
                  </li>
                  <li>
                    <a href='#labs'>Labs</a>
                  </li>
                  <li>
                    <a href={REPO_DAEMON} {...ext}>
                      Method
                    </a>
                  </li>
                  <li>
                    <a href={REPO} {...ext}>
                      Manifesto
                    </a>
                  </li>
                </ul>
              </div>
              <div className='foot-col'>
                <h5>Library</h5>
                <ul>
                  <li>
                    <a href={REPO_SKILLS} {...ext}>
                      31 Skills
                    </a>
                  </li>
                  <li>
                    <a href={REPO_DESIGN_SYSTEMS} {...ext}>
                      72 Systems
                    </a>
                  </li>
                  <li>
                    <a href={REPO_DESIGN_SYSTEMS} {...ext}>
                      5 Directions
                    </a>
                  </li>
                  <li>
                    <a href={`${REPO_SKILLS}/hyperframes`} {...ext}>
                      5 Frames
                    </a>
                  </li>
                </ul>
              </div>
              <div className='foot-col'>
                <h5>Connect</h5>
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
                      Contributors
                    </a>
                  </li>
                  <li>
                    <a href={REPO_RELEASES} {...ext}>
                      Releases
                    </a>
                  </li>
                </ul>
              </div>
              <div className='foot-col'>
                <h5>Docs</h5>
                <ul>
                  <li>
                    <a href={REPO_DOCS('QUICKSTART.md')} {...ext}>
                      Quickstart
                    </a>
                  </li>
                  <li>
                    <a href={REPO_DOCS('docs/architecture.md')} {...ext}>
                      Architecture
                    </a>
                  </li>
                  <li>
                    <a href={REPO_DOCS('docs/skills-protocol.md')} {...ext}>
                      Skill Protocol
                    </a>
                  </li>
                  <li>
                    <a href={REPO_DOCS('docs/roadmap.md')} {...ext}>
                      Roadmap
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
