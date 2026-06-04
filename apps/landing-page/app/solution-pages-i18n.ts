/*
 * Copy for the Solution → Use case and Role landing pages
 * (`/solutions/<slug>/` and `/for/<slug>/`).
 *
 * These pages are image + text + table surfaces that explain how a given
 * workflow or role uses Open Design. They are kept OUT of the large
 * `InfoPageCopy` shape in `info-page-i18n.ts` on purpose: that interface is
 * mirrored field-by-field inside `compactInfoPageCopy()` for all 18 locales,
 * so adding rich page bodies there would force a hand-written entry per
 * locale. Here we ship English + Simplified Chinese now; every other locale
 * falls back to English via `getSolutionPageCopy()` until it is translated.
 *
 * Each page shares one shape (`SolutionPageCopy`) so the Astro template is
 * identical across all 11 pages — only the data differs.
 */
import { DEFAULT_LOCALE, type LandingLocaleCode } from './i18n';

export type SolutionStep = {
  /** Step heading, e.g. "Describe the screen". */
  title: string;
  /** One or two sentences explaining the step. */
  body: string;
  /** Alt text for the step's illustration. */
  imageAlt: string;
  /**
   * Optional thumbnail id for the alternating image+text row — basename of a
   * real PNG under `public/previews/plugins/` (no extension). When set, the
   * step renders as a left/right image+text band; when omitted it stays a
   * plain numbered row.
   */
  thumb?: string;
};

export type SolutionFeature = {
  /** Short feature title. */
  title: string;
  /** One sentence describing the feature. */
  body: string;
  /**
   * Thumbnail id — basename of a real PNG under `public/previews/plugins/`
   * (no extension). Drives the feature-grid card image.
   */
  thumb: string;
};

export type SolutionTableRow = {
  /** Row label — the capability or task. */
  capability: string;
  /** What Open Design does. */
  withOd: string;
  /** The old / manual / tool-bound way. */
  without: string;
};

export type SolutionFaq = {
  q: string;
  a: string;
};

export type SolutionGalleryItem = {
  /**
   * Thumbnail id — the basename of a real preview PNG under
   * `public/previews/plugins/`, WITHOUT the `.png` extension. The page
   * renders it from `/previews/plugins/<thumb>.png`, so every value here
   * must point at a file that actually ships in the repo.
   */
  thumb: string;
  /** Short caption naming the real template / output this thumbnail is. */
  caption: string;
};

export type SolutionPageCopy = {
  // ---- meta / SEO ----
  title: string;
  description: string;
  breadcrumb: string;
  /** Uppercase kicker above the H1, e.g. "Use case · Prototype". */
  label: string;
  // ---- hero ----
  heading: string;
  lead: string;
  heroImageAlt: string;
  // ---- tl;dr ----
  tldrTitle: string;
  tldrBody: string;
  // ---- how to use (image + text steps) ----
  stepsTitle: string;
  steps: SolutionStep[];
  // ---- capability table ----
  tableTitle: string;
  tableColCapability: string;
  tableColWithOd: string;
  tableColWithout: string;
  tableRows: SolutionTableRow[];
  // ---- feature grid (what you can do, each with a thumbnail) ----
  featuresTitle: string;
  features: SolutionFeature[];
  // ---- template gallery (real in-repo example thumbnails) ----
  galleryTitle: string;
  galleryLead: string;
  gallery: SolutionGalleryItem[];
  /** Relative href to the matching templates/plugins surface. */
  exampleHref: string;
  exampleLinkLabel: string;
  // ---- faq ----
  faqTitle: string;
  faq: SolutionFaq[];
  // ---- cta ----
  ctaTitle: string;
  ctaBody: string;
};

export type SolutionPageKey =
  | 'prototype'
  | 'dashboard'
  | 'slides'
  | 'image'
  | 'video'
  | 'designSystem';

type SolutionLocaleCopy = Partial<Record<SolutionPageKey, SolutionPageCopy>>;

// ---------------------------------------------------------------------------
// English (source of truth)
// ---------------------------------------------------------------------------
const EN: SolutionLocaleCopy = {
  prototype: {
    title: 'Build interactive prototypes with Open Design + Claude Code',
    description:
      'Turn a prompt into a clickable, multi-screen prototype without leaving your terminal. Open Design gives your coding agent the design skills, templates, and design system to ship real prototypes you can open in a browser.',
    breadcrumb: 'Prototype',
    label: 'Use case · Prototype',
    heading: 'Prototype at the speed of a prompt',
    lead: 'Describe the flow you have in mind and let your agent assemble a real, clickable prototype — multiple screens, shared styles, and live interactions — rendered straight to HTML you can open, share, and hand to engineering.',
    heroImageAlt:
      'Editorial illustration of a hand sketching a wireframe that turns into a clickable multi-screen app prototype',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design is the design layer for the coding agent you already use. For prototyping, that means going from a one-paragraph idea to a navigable, styled prototype in a single session — no design tool, no export step, no handoff gap.',
    stepsTitle: 'How prototyping works with Open Design',
    steps: [
      {
        title: 'Describe the flow',
        body: 'Tell your agent what you are building in plain language — "an onboarding flow with a welcome screen, a plan picker, and a confirmation." Open Design loads the prototype skill so the agent knows to produce screens, not a single page.',
        imageAlt:
          'Illustration of a person typing a plain-language description of an app flow into a terminal',
      },
      {
        title: 'Generate styled screens',
        body: 'The agent applies a design system and prototype templates from Open Design, so every screen shares typography, spacing, and components instead of looking like a rough draft. You get a coherent set of screens, not disconnected mockups.',
        imageAlt:
          'Illustration of several app screens appearing in sequence, all sharing one consistent visual style',
      },
      {
        title: 'Wire up the interactions',
        body: 'Buttons navigate, tabs switch, modals open. The prototype renders to self-contained HTML, so it behaves like the real thing in any browser — no prototyping tool account required to view it.',
        imageAlt:
          'Illustration of a cursor clicking through linked screens with arrows showing navigation between them',
      },
      {
        title: 'Iterate and hand off',
        body: 'Refine by talking to the agent — "make the plan picker a three-column layout." Because the artifact lives in your project, the design and the eventual code share one source of truth, closing the usual designer-to-engineer handoff gap.',
        imageAlt:
          'Illustration of a prototype being revised then passed to an engineer, with design and code merging into one file',
      },
    ],
    tableTitle: 'Prototyping with Open Design vs. the old way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'Traditional prototyping tools',
    tableRows: [
      {
        capability: 'Go from idea to first screen',
        withOd: 'One prompt in the agent you already have open',
        without: 'Open a separate tool, start a file, drag boxes by hand',
      },
      {
        capability: 'Multiple linked screens',
        withOd: 'Generated as a set with shared styles and working navigation',
        without: 'Each frame drawn and linked manually',
      },
      {
        capability: 'Consistent visual system',
        withOd: 'Pulled from a reusable design system the agent applies',
        without: 'Re-created per file or maintained by hand',
      },
      {
        capability: 'Shareable result',
        withOd: 'Self-contained HTML — opens in any browser, no account',
        without: 'Viewer needs a seat or a share link in the vendor tool',
      },
      {
        capability: 'Path to real code',
        withOd: 'Artifact lives in your repo; design and code share one source',
        without: 'Re-built from scratch after a separate handoff',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, bring your own keys, runs locally',
        without: 'Per-seat subscription, vendor-hosted, export-limited',
      },
    ],
    featuresTitle: 'What you can prototype',
    features: [
      {
        title: 'Multi-screen web apps',
        body: 'Full flows with shared navigation — onboarding, dashboards, settings — not single pages.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Mobile app flows',
        body: 'Screen-by-screen mobile journeys with native-feeling transitions and states.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Landing pages',
        body: 'Marketing pages and SaaS landings you can click through and ship.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Any visual taste',
        body: 'Editorial, soft, or brutalist — the prototype carries a coherent style end to end.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Waitlist & pricing',
        body: 'Conversion surfaces — waitlists, pricing tables — wired and on brand.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Gamified & playful',
        body: 'Interaction-heavy concepts where motion and state are part of the pitch.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Prototypes people built with Open Design',
    galleryLead:
      'Every one of these started as a prompt and rendered to a clickable artifact. Pick a template close to your idea, describe your variation, and the agent adapts it.',
    gallery: [
      { thumb: "example-dating-web", caption: "Dating web app — multi-screen flow" },
      { thumb: "example-hr-onboarding", caption: "HR onboarding flow" },
      { thumb: "example-kami-landing", caption: "Product landing page" },
      { thumb: "example-web-prototype-taste-soft", caption: "Soft-style web prototype" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse prototype templates',
    faqTitle: 'Prototyping FAQ',
    faq: [
      {
        q: 'Do I need a design tool like Figma to prototype with Open Design?',
        a: 'No. Open Design runs inside your coding agent and renders prototypes to HTML. You describe the flow in language; the agent produces the screens. There is no separate canvas tool to learn or pay for.',
      },
      {
        q: 'Are the prototypes interactive or just static mockups?',
        a: 'Interactive. Navigation, tabs, and modals work because the output is real HTML and CSS. You can click through it in any browser exactly as a user would.',
      },
      {
        q: 'Which agents can I use?',
        a: 'Open Design works with Claude Code, Codex, Cursor Agent, Gemini CLI, and a dozen more first-party adapters. You bring your own provider keys; nothing is hosted for you.',
      },
      {
        q: 'Can a prototype become the real product?',
        a: 'That is the point. The artifact lives in your project, so the same design system and components carry into production code instead of being thrown away after a handoff.',
      },
    ],
    ctaTitle: 'Prototype your next idea tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn your next "what if" into something you can click — in the agent you already use.',
  },
  dashboard: {
    title: 'Generate data dashboards with Open Design + Claude Code',
    description:
      'Describe the metrics you track and let your coding agent build a styled, responsive dashboard — charts, KPI cards, and tables rendered to HTML you can host anywhere. No BI tool seat, no drag-and-drop builder.',
    breadcrumb: 'Dashboard',
    label: 'Use case · Dashboard',
    heading: 'Dashboards from a description, not a drag-and-drop builder',
    lead: 'Tell your agent what to show and how it should feel. Open Design supplies the chart patterns, layout system, and visual language so you get a coherent, presentable dashboard — not a wall of default-styled widgets.',
    heroImageAlt:
      'Editorial illustration of raw numbers on the left flowing into a clean dashboard of charts and KPI cards on the right',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design turns a plain-language spec of your metrics into a styled dashboard your agent renders to HTML — versioned in your repo, hostable anywhere, with no per-seat BI subscription.',
    stepsTitle: 'How dashboards work with Open Design',
    steps: [
      {
        title: 'Describe the metrics',
        body: 'List what matters — "weekly active users, revenue by plan, churn, and a 30-day trend." The agent loads the dashboard skill so it knows to lay out KPI cards, charts, and a table rather than a single block of text.',
        imageAlt: 'Illustration of a person listing the metrics they care about',
      },
      {
        title: 'Pick the chart patterns',
        body: 'Open Design ships chart and layout templates, so trends become line charts, breakdowns become bars, and ratios become the right visual — consistent typography and spacing throughout instead of mismatched defaults.',
        imageAlt: 'Illustration of several chart types arranged into a coherent grid',
      },
      {
        title: 'Wire in your data',
        body: 'Point the dashboard at a CSV, a JSON endpoint, or paste sample rows. It renders to self-contained HTML that updates when the data does — open it in any browser, drop it on any static host.',
        imageAlt: 'Illustration of a data file connecting into a live-updating dashboard',
      },
      {
        title: 'Refine and ship',
        body: 'Adjust by talking to the agent — "group revenue by region, move the KPI row to the top." The artifact lives in your project, so the dashboard is reviewable and versioned like any other code.',
        imageAlt: 'Illustration of a dashboard being refined then deployed',
      },
    ],
    tableTitle: 'Dashboards with Open Design vs. the old way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'BI tools / hand-coded',
    tableRows: [
      {
        capability: 'Go from metrics list to layout',
        withOd: 'One prompt; the agent lays out cards, charts, and tables',
        without: 'Drag widgets one by one, or write chart code from scratch',
      },
      {
        capability: 'Consistent visual system',
        withOd: 'Chart patterns and spacing from a reusable design system',
        without: 'Default widget styles, or styled by hand per chart',
      },
      {
        capability: 'Connect data',
        withOd: 'CSV / JSON / pasted rows, rendered to live HTML',
        without: 'Vendor connectors or bespoke data plumbing',
      },
      {
        capability: 'Hosting & sharing',
        withOd: 'Self-contained HTML on any static host, no account',
        without: 'Viewer needs a seat in the BI vendor',
      },
      {
        capability: 'Review & versioning',
        withOd: 'Lives in your repo; diffable like code',
        without: 'Locked inside the vendor, no real diff',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, bring your own keys, runs locally',
        without: 'Per-seat subscription, vendor-hosted',
      },
    ],
    featuresTitle: "What you can build",
    features: [
      { title: "Product analytics", body: "Active users, funnels, retention — the metrics a product team lives in.", thumb: "example-dashboard" },
      { title: "Repo & dev metrics", body: "Stars, PRs, CI health — engineering dashboards from your own data.", thumb: "example-github-dashboard" },
      { title: "Finance reports", body: "Revenue, burn, runway laid out as a shareable report.", thumb: "example-finance-report" },
      { title: "Live operations", body: "Real-time metrics that refresh as the underlying data moves.", thumb: "example-live-dashboard" },
      { title: "Social & marketing", body: "Channel performance and campaign tracking in one view.", thumb: "example-social-media-dashboard" },
      { title: "Domain reports", body: "Structured reports for any field — from clinical to trading.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Dashboards people built with Open Design',
    galleryLead:
      'Real dashboards rendered from a prompt and a data source. Start from one close to yours and describe the metrics you track.',
    gallery: [
      { thumb: "example-data-report", caption: "Data report" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Live ops dashboard" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Trading analysis dashboard" },
      { thumb: "example-frame-data-chart-nyt", caption: "Editorial data chart" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse dashboard templates',
    faqTitle: 'Dashboard FAQ',
    faq: [
      {
        q: 'Do I need a BI tool like Tableau or Looker?',
        a: 'No. Open Design renders dashboards to HTML inside your coding agent. You describe the metrics and point it at your data; there is no separate BI platform to license or learn.',
      },
      {
        q: 'Where does the data come from?',
        a: 'A CSV, a JSON endpoint, or rows you paste in. The dashboard is plain HTML and JavaScript, so you control exactly where it reads from — nothing is proxied through a hosted service.',
      },
      {
        q: 'Can non-technical teammates view it?',
        a: 'Yes. The output is a self-contained web page. Anyone with the link or file can open it in a browser — no account, no seat.',
      },
      {
        q: 'Which agents can I use?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, and a dozen more first-party adapters. You bring your own provider keys.',
      },
    ],
    ctaTitle: 'Build your dashboard tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn your metrics into a dashboard you can host anywhere — in the agent you already use.',
  },
  slides: {
    title: 'Generate presentation decks with Open Design + Claude Code',
    description:
      'Turn an outline into a designed, on-brand slide deck without opening a presentation app. Open Design gives your coding agent deck templates and a visual system, rendering slides to HTML you can present, export, or share.',
    breadcrumb: 'Slides',
    label: 'Use case · Slides',
    heading: 'Decks that look designed, written by a prompt',
    lead: 'Hand your agent an outline and a tone. Open Design applies a deck template and visual system so every slide is laid out, typeset, and on-brand — not a bullet list on a blank background.',
    heroImageAlt:
      'Editorial illustration of an outline on the left turning into a sequence of designed presentation slides on the right',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design turns an outline into a designed HTML deck your agent renders in one session — present it in the browser, export to PDF or PPTX, and keep the source in your repo.',
    stepsTitle: 'How decks work with Open Design',
    steps: [
      {
        title: 'Give it the outline',
        body: 'Paste your talking points or a rough structure. The agent loads the deck skill so it produces a sequence of laid-out slides, not one long document.',
        imageAlt: 'Illustration of a text outline being handed to an agent',
      },
      {
        title: 'Choose a deck style',
        body: 'Open Design ships deck templates — editorial, Swiss-international, dark technical, and more. The agent applies one so typography, grid, and accents stay consistent across every slide.',
        imageAlt: 'Illustration of several deck style options laid side by side',
      },
      {
        title: 'Generate the slides',
        body: 'Each point becomes a designed slide with the right hierarchy — titles, supporting visuals, data callouts. It renders to HTML, so it presents full-screen in any browser.',
        imageAlt: 'Illustration of a sequence of finished slides with consistent styling',
      },
      {
        title: 'Present, export, iterate',
        body: 'Present from the browser, or export to PDF / PPTX for sharing. Refine by talking to the agent — "tighten the data slide, add a closing call to action." The deck source stays in your project.',
        imageAlt: 'Illustration of a deck being presented and exported to multiple formats',
      },
    ],
    tableTitle: 'Decks with Open Design vs. the old way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'PowerPoint / Keynote / AI slide tools',
    tableRows: [
      {
        capability: 'Go from outline to slides',
        withOd: 'One prompt; the agent lays out every slide',
        without: 'Build each slide by hand, or fight a template',
      },
      {
        capability: 'Consistent design',
        withOd: 'Deck templates with a real grid and type system',
        without: 'Theme drift, manual alignment, off-brand defaults',
      },
      {
        capability: 'Data & diagrams',
        withOd: 'Charts and callouts rendered as part of the slide',
        without: 'Paste static images or rebuild charts each time',
      },
      {
        capability: 'Export formats',
        withOd: 'HTML to present, plus PDF / PPTX export',
        without: 'Locked to one app’s format',
      },
      {
        capability: 'Review & versioning',
        withOd: 'Source lives in your repo, diffable',
        without: 'Binary file, no meaningful diff',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, bring your own keys, runs locally',
        without: 'App license or per-seat AI add-on',
      },
    ],
    featuresTitle: "What you can present",
    features: [
      { title: "Pitch decks", body: "Investor and sales decks with a strong narrative and clean data slides.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Swiss / editorial", body: "Grid-driven, typographic decks that look art-directed.", thumb: "example-deck-swiss-international" },
      { title: "Course modules", body: "Teaching decks with clear steps, callouts, and pacing.", thumb: "example-html-ppt-course-module" },
      { title: "Data-graph decks", body: "Dark, chart-forward decks for analytics and reviews.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Presenter mode", body: "Reveal-style decks built to present live in the browser.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Technical blueprints", body: "Architecture and knowledge decks that map complex systems.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Decks people built with Open Design',
    galleryLead:
      'Real decks rendered from an outline. Pick a style close to your talk and describe the content.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Editorial magazine deck" },
      { thumb: "example-guizang-ppt", caption: "Illustrated keynote" },
      { thumb: "example-deck-open-slide-canvas", caption: "Open slide canvas deck" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Gradient theme deck" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse deck templates',
    faqTitle: 'Slides FAQ',
    faq: [
      {
        q: 'Do I need PowerPoint or Keynote?',
        a: 'No. Open Design renders decks to HTML inside your coding agent and can export to PDF or PPTX. You present from the browser or hand off a file — no presentation app required to build it.',
      },
      {
        q: 'Are these just AI-generated bullet points?',
        a: 'No. The agent applies a real deck template with a grid, type scale, and visual hierarchy, so slides look designed rather than auto-filled.',
      },
      {
        q: 'Can I export to PowerPoint for a client?',
        a: 'Yes. Decks export to PPTX and PDF in addition to the HTML you present from, so they fit whatever the audience expects.',
      },
      {
        q: 'Which agents can I use?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, and more first-party adapters, with your own provider keys.',
      },
    ],
    ctaTitle: 'Build your next deck tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn your outline into a designed deck — in the agent you already use.',
  },
  image: {
    title: 'Generate on-brand graphics with Open Design + Claude Code',
    description:
      'Produce social cards, article covers, and marketing graphics from a prompt — laid out with real typography and your brand system, rendered to crisp HTML you can export to PNG. No design app, no template subscription.',
    breadcrumb: 'Image',
    label: 'Use case · Image',
    heading: 'On-brand graphics, generated and laid out for you',
    lead: 'Describe the card or cover you need. Open Design composes it with real type, grid, and your brand colors — then renders to HTML you can export as an image, instead of wrestling a design app or a generic template.',
    heroImageAlt:
      'Editorial illustration of a prompt turning into a set of laid-out social cards and article covers',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design turns a prompt into a typeset, on-brand graphic your agent renders to HTML and exports to PNG — repeatable, versioned, and free of per-seat design tools.',
    stepsTitle: 'How graphics work with Open Design',
    steps: [
      {
        title: 'Describe the graphic',
        body: 'Say what it is — "a Twitter card for our launch with the headline and a quote." The agent loads the right skill so it composes a laid-out graphic, not a plain text block.',
        imageAlt: 'Illustration of a person describing a social card they need',
      },
      {
        title: 'Apply the brand system',
        body: 'Open Design pulls your colors, type, and spacing from a reusable design system, so every card matches the rest of your brand instead of looking like a one-off.',
        imageAlt: 'Illustration of brand colors and type being applied to a card layout',
      },
      {
        title: 'Render and export',
        body: 'The graphic renders to HTML at the exact dimensions you need — social card, cover, banner — then exports to PNG. Crisp text, real layout, no manual nudging.',
        imageAlt: 'Illustration of a graphic rendering and exporting to an image file',
      },
      {
        title: 'Reuse the recipe',
        body: 'Because it is a template, the next graphic is one prompt away — change the headline, keep the layout. Series of cards stay perfectly consistent.',
        imageAlt: 'Illustration of one card template producing a consistent series of graphics',
      },
    ],
    tableTitle: 'Graphics with Open Design vs. the old way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'Design apps / generic templates',
    tableRows: [
      {
        capability: 'Go from idea to laid-out graphic',
        withOd: 'One prompt; the agent composes type and layout',
        without: 'Open an app, place every element by hand',
      },
      {
        capability: 'Stay on brand',
        withOd: 'Colors and type from a reusable design system',
        without: 'Re-pick brand styles per file, or drift off-brand',
      },
      {
        capability: 'Consistent series',
        withOd: 'Same template, new copy — perfectly aligned set',
        without: 'Re-align each variant manually',
      },
      {
        capability: 'Export',
        withOd: 'HTML at exact dimensions, exported to PNG',
        without: 'Manual canvas sizing and export settings',
      },
      {
        capability: 'Repeatable',
        withOd: 'A prompt-driven recipe in your repo',
        without: 'A one-off file you recreate each time',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, bring your own keys, runs locally',
        without: 'Per-seat design tool or template marketplace',
      },
    ],
    featuresTitle: "What you can make",
    features: [
      { title: "Social cards", body: "X / Twitter cards composed with your headline and brand.", thumb: "example-card-twitter" },
      { title: "Article covers", body: "Editorial, magazine-style covers for posts and newsletters.", thumb: "example-article-magazine" },
      { title: "Xiaohongshu cards", body: "RedNote-style cards tuned for that feed.", thumb: "example-card-xiaohongshu" },
      { title: "Hero graphics", body: "Liquid, gradient hero visuals for sites and launches.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Carousels", body: "Multi-slide social carousels that stay consistent across frames.", thumb: "example-social-carousel" },
      { title: "UI mock frames", body: "Notification and device frames for product storytelling.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Graphics people built with Open Design',
    galleryLead:
      'Real cards and covers rendered from a prompt. Pick one close to what you need and swap in your copy.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Pastel social card" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Editorial tri-tone poster" },
      { thumb: "example-magazine-poster", caption: "Magazine-style poster" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Bold editorial cover" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse graphic templates',
    faqTitle: 'Image FAQ',
    faq: [
      {
        q: 'Is this an AI image generator like Midjourney?',
        a: 'No. Open Design composes graphics with real layout and typography — your headline, your brand, exact dimensions — and renders to HTML you export as PNG. It is design composition, not pixel generation.',
      },
      {
        q: 'Can I make a consistent series of cards?',
        a: 'Yes. Because each graphic is a template, you keep the layout and change the copy, so a whole series stays perfectly aligned and on-brand.',
      },
      {
        q: 'What sizes can it produce?',
        a: 'Any — the graphic renders at the exact dimensions you specify, from a square social card to a wide banner, then exports to PNG.',
      },
      {
        q: 'Which agents can I use?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, and more first-party adapters, with your own provider keys.',
      },
    ],
    ctaTitle: 'Make your next graphic tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn a prompt into an on-brand graphic — in the agent you already use.',
  },
  video: {
    title: 'Generate motion graphics & short video with Open Design + Claude Code',
    description:
      'Turn a script into animated frames and short-form video — title cards, motion backgrounds, and outros composed with your brand system and rendered from HTML. No motion-graphics suite, no timeline scrubbing.',
    breadcrumb: 'Video',
    label: 'Use case · Video',
    heading: 'Motion graphics from a script, not a timeline',
    lead: 'Describe the moment you want — a title reveal, a data animation, a logo outro. Open Design composes animated frames with your brand system and renders them to video, no motion-graphics suite required.',
    heroImageAlt:
      'Editorial illustration of a script turning into a sequence of animated video frames',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design turns a script into animated, on-brand frames your agent renders to short-form video — composed from HTML, versioned in your repo, with no timeline editor to learn.',
    stepsTitle: 'How motion works with Open Design',
    steps: [
      {
        title: 'Describe the moment',
        body: 'Say what should happen — "a glitch title that resolves into our logo, then a closing card." The agent loads the motion skill so it produces animated frames, not a static image.',
        imageAlt: 'Illustration of a person describing a motion sequence',
      },
      {
        title: 'Apply the brand & motion style',
        body: 'Open Design supplies frame templates — cinematic light leaks, glitch titles, logo outros — and applies your colors and type, so the motion looks intentional and on-brand.',
        imageAlt: 'Illustration of brand styling applied to animated frames',
      },
      {
        title: 'Render the frames to video',
        body: 'Frames are composed in HTML and rendered to video, so timing and layout are precise and repeatable — no manual keyframing on a timeline.',
        imageAlt: 'Illustration of HTML frames rendering into a video clip',
      },
      {
        title: 'Iterate and export',
        body: 'Refine by talking to the agent — "slow the title reveal, add a caption." Export short-form clips for social or product. The source stays in your project.',
        imageAlt: 'Illustration of a video clip being refined and exported for social',
      },
    ],
    tableTitle: 'Motion with Open Design vs. the old way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'After Effects / motion suites',
    tableRows: [
      {
        capability: 'Go from script to animated frames',
        withOd: 'One prompt; the agent composes the sequence',
        without: 'Keyframe each element on a timeline by hand',
      },
      {
        capability: 'Stay on brand',
        withOd: 'Frame templates + your colors and type',
        without: 'Rebuild brand styling per project',
      },
      {
        capability: 'Precise, repeatable timing',
        withOd: 'Composed in HTML, rendered deterministically',
        without: 'Manual scrubbing, hard to reproduce',
      },
      {
        capability: 'Export for social',
        withOd: 'Short-form clips rendered to video',
        without: 'Export presets and codec wrangling',
      },
      {
        capability: 'Review & versioning',
        withOd: 'Frame source lives in your repo, diffable',
        without: 'Binary project file, no real diff',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, bring your own keys, runs locally',
        without: 'Expensive suite, steep learning curve',
      },
    ],
    featuresTitle: "What you can animate",
    features: [
      { title: "Hyperframes", body: "Frame-by-frame motion sequences composed from HTML.", thumb: "example-video-hyperframes" },
      { title: "Short-form social", body: "Vertical clips built for social feeds.", thumb: "example-video-shortform" },
      { title: "Motion frame sets", body: "Reusable animated frames you compose into a clip.", thumb: "example-motion-frames" },
      { title: "Cinematic light leaks", body: "Filmic transitions and atmospheric backgrounds.", thumb: "example-frame-light-leak-cinema" },
      { title: "Glitch titles", body: "Title reveals with motion and texture.", thumb: "example-frame-glitch-title" },
      { title: "Logo outros", body: "Branded closing animations for any clip.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Motion people built with Open Design',
    galleryLead:
      'Real animated frames and clips rendered from a prompt. Pick one close to your idea and describe the motion.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Hyperframes sequence" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Liquid motion background" },
      { thumb: "example-frame-macos-notification", caption: "Animated UI frame" },
      { thumb: "example-frame-data-chart-nyt", caption: "Animated data chart" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse motion templates',
    faqTitle: 'Video FAQ',
    faq: [
      {
        q: 'Do I need After Effects or a motion-graphics suite?',
        a: 'No. Open Design composes animated frames in HTML and renders them to video inside your coding agent. There is no timeline editor to learn or license.',
      },
      {
        q: 'What kind of video is this good for?',
        a: 'Short-form motion — title cards, data animations, logo outros, social clips. It is built for brand and product motion, not feature-length editing.',
      },
      {
        q: 'Is the timing reproducible?',
        a: 'Yes. Because frames are composed in code and rendered deterministically, you get the same result every time and can tweak it precisely with a prompt.',
      },
      {
        q: 'Which agents can I use?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, and more first-party adapters, with your own provider keys.',
      },
    ],
    ctaTitle: 'Animate your next idea tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn a script into motion — in the agent you already use.',
  },
  designSystem: {
    title: 'Build and apply a design system with Open Design + Claude Code',
    description:
      'Capture your brand as a reusable design system your coding agent applies to every artifact — colors, type, components, and tone in one DESIGN.md. Define it once; every prototype, deck, and dashboard stays on brand.',
    breadcrumb: 'Design System',
    label: 'Use case · Design System',
    heading: 'One design system, applied to everything your agent makes',
    lead: 'Define your brand once and Open Design carries it into every output — prototypes, decks, dashboards, graphics. The system lives in your repo as a DESIGN.md the agent reads, so consistency is automatic, not manual.',
    heroImageAlt:
      'Editorial illustration of a single design system radiating into many on-brand artifacts',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design captures your brand as a portable design system your agent applies to every artifact — defined once in your repo, enforced everywhere, with no central design tool to gate-keep it.',
    stepsTitle: 'How design systems work with Open Design',
    steps: [
      {
        title: 'Capture the system',
        body: 'Describe your brand — colors, type, spacing, voice — or point the agent at an existing site to extract it. Open Design writes it into a DESIGN.md that lives in your project.',
        imageAlt: 'Illustration of a brand being captured into a single design-system file',
      },
      {
        title: 'Start from a proven base',
        body: 'Open Design ships 140+ reference design systems — from Apple and Linear to editorial and brutalist. Fork one close to your brand instead of starting from a blank page.',
        imageAlt: 'Illustration of a gallery of reference design systems being browsed',
      },
      {
        title: 'Apply it everywhere',
        body: 'Every other skill reads the same system, so a prototype, a deck, and a dashboard all share one visual language — without you re-specifying it each time.',
        imageAlt: 'Illustration of one system applied consistently across many artifact types',
      },
      {
        title: 'Evolve it in one place',
        body: 'Change the system and the next render reflects it everywhere. Because it is a file in your repo, design decisions are reviewed and versioned like code.',
        imageAlt: 'Illustration of a design system being updated and propagating to all outputs',
      },
    ],
    tableTitle: 'Design systems with Open Design vs. the old way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'Design-tool libraries / style guides',
    tableRows: [
      {
        capability: 'Define the system',
        withOd: 'A DESIGN.md the agent reads, forked from 140+ references',
        without: 'A static style guide or a tool-bound library',
      },
      {
        capability: 'Apply across artifact types',
        withOd: 'Same system feeds prototypes, decks, dashboards, graphics',
        without: 'Re-implemented per tool and per file',
      },
      {
        capability: 'Keep everything consistent',
        withOd: 'Automatic — every skill reads one source',
        without: 'Manual discipline; drifts over time',
      },
      {
        capability: 'Evolve the brand',
        withOd: 'Edit once; next render updates everywhere',
        without: 'Hunt-and-replace across files and tools',
      },
      {
        capability: 'Review & versioning',
        withOd: 'Lives in your repo, diffable like code',
        without: 'Buried in a design tool, hard to audit',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, portable, runs locally',
        without: 'Locked to a design-tool subscription',
      },
    ],
    featuresTitle: "Systems you can start from",
    features: [
      { title: "Apple", body: "Clean, restrained, system-font aesthetic.", thumb: "design-system-apple" },
      { title: "Linear", body: "Crisp product-tool look with tight spacing.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Soft, document-first, approachable.", thumb: "design-system-notion" },
      { title: "Figma", body: "Playful, colorful, creative-tool energy.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimal, neutral, research-grade.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Dense, technical, developer-native.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Design systems in Open Design',
    galleryLead:
      'A few of the 140+ reference systems you can fork as a starting point. Pick one close to your brand and adapt it.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Airbnb-style system" },
      { thumb: "design-system-vercel", caption: "Vercel-style system" },
      { thumb: "design-system-stripe", caption: "Stripe-style system" },
      { thumb: "design-system-spotify", caption: "Spotify-style system" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Browse design systems',
    faqTitle: 'Design System FAQ',
    faq: [
      {
        q: 'What exactly is the design system here?',
        a: 'A DESIGN.md file in your repo that captures colors, type, spacing, components, and voice. Every Open Design skill reads it, so your brand is applied automatically to whatever the agent produces.',
      },
      {
        q: 'Do I have to start from scratch?',
        a: 'No. Open Design ships 140+ reference design systems you can fork — from Apple and Linear to editorial and brutalist — then adapt to your brand.',
      },
      {
        q: 'How does it stay consistent across decks, dashboards, and prototypes?',
        a: 'Because all of those skills read the same DESIGN.md. Define the system once and consistency is automatic instead of something you police by hand.',
      },
      {
        q: 'Which agents can I use?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, and more first-party adapters, with your own provider keys.',
      },
    ],
    ctaTitle: 'Define your design system tonight',
    ctaBody:
      'Star the repo, install Open Design, and give your agent one brand to apply everywhere — in the agent you already use.',
  },
};

// ---------------------------------------------------------------------------
// Simplified Chinese (hand-reviewed)
// ---------------------------------------------------------------------------
const ZH: SolutionLocaleCopy = {
  prototype: {
    title: '用 Open Design + Claude Code 做可交互原型',
    description:
      '一句话描述，就能在终端里生成可点击、多屏的原型。Open Design 把设计技能、模板和设计系统交给你的编码 agent，直接产出能在浏览器里打开的真实原型。',
    breadcrumb: '原型',
    label: '使用场景 · 原型',
    heading: '以一句话的速度做原型',
    lead: '把脑子里的流程描述出来，让 agent 拼出真实可点击的原型——多个屏幕、统一样式、可交互——直接渲染成 HTML，能打开、能分享、能交给工程。',
    heroImageAlt: '编辑风插画：一只手画出线框，线框变成可点击的多屏应用原型',
    tldrTitle: '一句话',
    tldrBody:
      'Open Design 是你正在用的编码 agent 的设计层。对原型来说，就是在一次对话里从一段想法走到可导航、有样式的原型——不用设计工具、不用导出、没有交接断层。',
    stepsTitle: '用 Open Design 做原型的流程',
    steps: [
      {
        title: '描述流程',
        body: '用大白话告诉 agent 你要做什么——"一个引导流程，含欢迎页、套餐选择页和确认页"。Open Design 会加载原型 skill，让 agent 知道要产出多个屏幕，而不是单页。',
        imageAlt: '插画：一个人在终端里用自然语言描述应用流程',
      },
      {
        title: '生成带样式的屏幕',
        body: 'agent 套用 Open Design 的设计系统和原型模板，每个屏幕共享字体、间距和组件，而不是看起来像草稿。你得到的是一套连贯的屏幕，不是互不相干的 mockup。',
        imageAlt: '插画：多个应用屏幕依次出现，全部共享同一套视觉风格',
      },
      {
        title: '接上交互',
        body: '按钮能跳转、标签页能切换、弹窗能打开。原型渲染成自包含的 HTML，在任何浏览器里都像真东西一样运行——查看它不需要任何原型工具账号。',
        imageAlt: '插画：光标在彼此链接的屏幕间点击，箭头标出页面之间的跳转',
      },
      {
        title: '迭代并交付',
        body: '靠跟 agent 对话来改——"把套餐选择页改成三列布局"。因为产物就在你的项目里，设计和最终代码共享同一份事实来源，弥合了设计到工程的交接断层。',
        imageAlt: '插画：原型被修改后交给工程师，设计与代码合并成同一个文件',
      },
    ],
    tableTitle: '用 Open Design 做原型 vs. 老办法',
    tableColCapability: '你需要什么',
    tableColWithOd: '用 Open Design',
    tableColWithout: '传统原型工具',
    tableRows: [
      {
        capability: '从想法到第一屏',
        withOd: '在你本来就开着的 agent 里一句话',
        without: '打开另一个工具、新建文件、手动拖框',
      },
      {
        capability: '多个相互链接的屏幕',
        withOd: '成套生成，共享样式、导航可用',
        without: '每一屏手动绘制并手动连线',
      },
      {
        capability: '一致的视觉系统',
        withOd: '从可复用的设计系统里取，由 agent 套用',
        without: '每个文件重做一遍，或纯靠手维护',
      },
      {
        capability: '可分享的成果',
        withOd: '自包含 HTML——任何浏览器都能打开，不需账号',
        without: '查看者要占一个席位或要厂商工具的分享链接',
      },
      {
        capability: '通往真实代码的路径',
        withOd: '产物在你的 repo 里，设计与代码同源',
        without: '一次交接之后从零重建',
      },
      {
        capability: '成本与锁定',
        withOd: '开源、自带密钥、本地运行',
        without: '按席位订阅、厂商托管、导出受限',
      },
    ],
    featuresTitle: '你能做出哪些原型',
    features: [
      { title: '多屏 Web 应用', body: '带共享导航的完整流程——引导、看板、设置——而不是单页。', thumb: 'example-web-prototype' },
      { title: '移动应用流程', body: '一屏接一屏的移动端旅程，转场和状态都有原生感。', thumb: 'example-mobile-app' },
      { title: '落地页', body: '能点击、能上线的营销页和 SaaS 落地页。', thumb: 'example-saas-landing' },
      { title: '任意视觉风格', body: '编辑风、柔和风、粗野主义——原型从头到尾保持一致风格。', thumb: 'example-web-prototype-taste-editorial' },
      { title: '等候名单与定价', body: '转化页——等候名单、定价表——接好线、贴合品牌。', thumb: 'example-waitlist-page' },
      { title: '游戏化与趣味', body: '交互密集的概念，动效和状态本身就是卖点。', thumb: 'example-gamified-app' },
    ],
    galleryTitle: '别人用 Open Design 做出来的原型',
    galleryLead:
      '下面每一个都是从一句 prompt 开始、渲染成可点击产物的。挑一个跟你想法接近的模板，描述你的改法，agent 帮你改。',
    gallery: [
      { thumb: "example-dating-web", caption: "交友 Web 应用——多屏流程" },
      { thumb: "example-hr-onboarding", caption: "HR 入职流程" },
      { thumb: "example-kami-landing", caption: "产品落地页" },
      { thumb: "example-web-prototype-taste-soft", caption: "柔和风 Web 原型" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '浏览原型模板',
    faqTitle: '原型常见问题',
    faq: [
      {
        q: '用 Open Design 做原型需要 Figma 这类设计工具吗？',
        a: '不需要。Open Design 在你的编码 agent 里运行，把原型渲染成 HTML。你用语言描述流程，agent 产出屏幕。没有额外的画布工具要学或要付费。',
      },
      {
        q: '产出的是可交互原型还是静态 mockup？',
        a: '可交互。导航、标签页、弹窗都能用，因为输出是真实的 HTML 和 CSS。你能在任何浏览器里像用户一样点击体验。',
      },
      {
        q: '可以用哪些 agent？',
        a: 'Open Design 支持 Claude Code、Codex、Cursor Agent、Gemini CLI 等十多个一方适配。你自带 provider 密钥，没有任何东西替你托管。',
      },
      {
        q: '原型能变成真正的产品吗？',
        a: '这正是重点。产物就在你的项目里，同一套设计系统和组件会带进生产代码，而不是交接后被丢弃。',
      },
    ],
    ctaTitle: '今晚就把下一个想法做成原型',
    ctaBody:
      '给 repo 点个 star、装上 Open Design，在你本来就用的 agent 里，把下一个"要是……"变成能点击的东西。',
  },
  dashboard: {
    title: '用 Open Design + Claude Code 生成数据看板',
    description:
      '描述你要盯的指标，让编码 agent 帮你做出有样式、响应式的看板——图表、KPI 卡片、表格，全部渲染成可随处托管的 HTML。不用 BI 工具席位，不用拖拽搭建。',
    breadcrumb: '看板',
    label: '使用场景 · 看板',
    heading: '看板靠描述生成，不靠拖拽搭建',
    lead: '告诉 agent 要展示什么、要什么感觉。Open Design 提供图表范式、布局系统和视觉语言，你拿到的是连贯、能拿得出手的看板，而不是一堆默认样式的控件。',
    heroImageAlt: '编辑风插画：左边的原始数字流向右边一个干净的图表 + KPI 卡片看板',
    tldrTitle: '一句话',
    tldrBody:
      'Open Design 把你对指标的大白话描述变成有样式的看板，由 agent 渲染成 HTML——在你的 repo 里版本化、随处可托管、无需按席位订阅 BI。',
    stepsTitle: '用 Open Design 做看板的流程',
    steps: [
      {
        title: '描述指标',
        body: '列出你关心的——"周活、按套餐分的收入、流失率、近 30 天趋势"。agent 加载看板 skill，知道要排布 KPI 卡片、图表和表格，而不是一段文字。',
        imageAlt: '插画：一个人列出自己关心的指标',
      },
      {
        title: '选择图表范式',
        body: 'Open Design 自带图表和布局模板，趋势变折线、占比变柱状、比例用对的图——全程字体和间距统一，而不是一堆不搭的默认样式。',
        imageAlt: '插画：多种图表类型排成一个连贯的网格',
      },
      {
        title: '接入数据',
        body: '把看板指向 CSV、JSON 接口，或粘贴示例行。它渲染成自包含 HTML，数据变它就变——任何浏览器能打开，任何静态托管能放。',
        imageAlt: '插画：一个数据文件接入实时更新的看板',
      },
      {
        title: '打磨并交付',
        body: '靠跟 agent 对话来调——"收入按地区分组、把 KPI 行挪到顶部"。产物在你的项目里，看板像任何代码一样可 review、可版本化。',
        imageAlt: '插画：看板被打磨后部署上线',
      },
    ],
    tableTitle: '用 Open Design 做看板 vs. 老办法',
    tableColCapability: '你需要什么',
    tableColWithOd: '用 Open Design',
    tableColWithout: 'BI 工具 / 纯手写',
    tableRows: [
      { capability: '从指标清单到布局', withOd: '一句话，agent 排布卡片、图表、表格', without: '一个个拖控件，或从零写图表代码' },
      { capability: '一致的视觉系统', withOd: '图表范式和间距来自可复用设计系统', without: '默认控件样式，或每张图手动调' },
      { capability: '接入数据', withOd: 'CSV / JSON / 粘贴行，渲染成实时 HTML', without: '厂商连接器或定制数据管道' },
      { capability: '托管与分享', withOd: '自包含 HTML 放任何静态托管，不要账号', without: '查看者要 BI 厂商的席位' },
      { capability: 'review 与版本化', withOd: '在 repo 里，像代码一样可 diff', without: '锁在厂商里，无法真正 diff' },
      { capability: '成本与锁定', withOd: '开源、自带密钥、本地运行', without: '按席位订阅、厂商托管' },
    ],
    featuresTitle: "你能做出哪些看板",
    features: [
      { title: "产品分析", body: "活跃、漏斗、留存——产品团队天天看的指标。", thumb: "example-dashboard" },
      { title: "仓库与研发指标", body: "Star、PR、CI 健康度——用你自己的数据做研发看板。", thumb: "example-github-dashboard" },
      { title: "财务报告", body: "收入、消耗、跑道，排成可分享的报告。", thumb: "example-finance-report" },
      { title: "实时运营", body: "随底层数据变动而刷新的实时指标。", thumb: "example-live-dashboard" },
      { title: "社交与营销", body: "渠道表现和投放追踪汇于一屏。", thumb: "example-social-media-dashboard" },
      { title: "领域报告", body: "任意领域的结构化报告——从临床到交易。", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: '别人用 Open Design 做出来的看板',
    galleryLead: '下面是从 prompt + 数据源渲染出的真实看板。挑一个接近你的，描述你要盯的指标。',
    gallery: [
      { thumb: "example-data-report", caption: "数据报告" },
      { thumb: "example-flowai-live-dashboard-template", caption: "实时运营看板" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "交易分析看板" },
      { thumb: "example-frame-data-chart-nyt", caption: "编辑风数据图表" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '浏览看板模板',
    faqTitle: '看板常见问题',
    faq: [
      { q: '需要 Tableau、Looker 这类 BI 工具吗？', a: '不需要。Open Design 在你的编码 agent 里把看板渲染成 HTML。你描述指标、指向数据，没有额外的 BI 平台要授权或学习。' },
      { q: '数据从哪来？', a: 'CSV、JSON 接口，或你粘贴的行。看板是纯 HTML + JavaScript，你完全控制它从哪读——不经任何托管服务中转。' },
      { q: '非技术同事能看吗？', a: '能。产出是自包含网页，任何人拿到链接或文件就能在浏览器打开——不要账号、不要席位。' },
      { q: '可以用哪些 agent？', a: 'Claude Code、Codex、Cursor Agent、Gemini CLI 等十多个一方适配，自带 provider 密钥。' },
    ],
    ctaTitle: '今晚就把看板做出来',
    ctaBody: '给 repo 点个 star、装上 Open Design，把你的指标变成一个随处可托管的看板——在你本来就用的 agent 里。',
  },
  slides: {
    title: '用 Open Design + Claude Code 生成演示文稿',
    description:
      '把大纲变成有设计感、符合品牌的幻灯片，不用打开任何演示软件。Open Design 给编码 agent 提供 deck 模板和视觉系统，把幻灯片渲染成可演示、可导出、可分享的 HTML。',
    breadcrumb: '幻灯片',
    label: '使用场景 · 幻灯片',
    heading: '看起来精心设计的 deck，由一句 prompt 写出来',
    lead: '把大纲和语气交给 agent。Open Design 套用 deck 模板和视觉系统，每一页都排好版、配好字、贴合品牌——不是空白底上的一串要点。',
    heroImageAlt: '编辑风插画：左边的大纲变成右边一连串有设计感的演示幻灯片',
    tldrTitle: '一句话',
    tldrBody:
      'Open Design 把大纲变成有设计感的 HTML deck，由 agent 一次生成——浏览器里全屏演示、导出 PDF 或 PPTX、源文件留在 repo。',
    stepsTitle: '用 Open Design 做 deck 的流程',
    steps: [
      { title: '给它大纲', body: '粘贴你的要点或粗略结构。agent 加载 deck skill，产出一连串排好版的幻灯片，而不是一篇长文档。', imageAlt: '插画：一份文字大纲被交给 agent' },
      { title: '选一个 deck 风格', body: 'Open Design 自带 deck 模板——编辑风、瑞士国际主义、深色技术风等。agent 套用其中一个，字体、网格、强调色在每页之间保持一致。', imageAlt: '插画：几种 deck 风格并排展示' },
      { title: '生成幻灯片', body: '每个要点变成一页有层次的幻灯片——标题、辅助视觉、数据高亮。渲染成 HTML，任何浏览器都能全屏演示。', imageAlt: '插画：一连串风格一致的成品幻灯片' },
      { title: '演示、导出、迭代', body: '从浏览器演示，或导出 PDF / PPTX 分享。靠跟 agent 对话来改——"收紧数据页、加一个结尾行动号召"。deck 源文件留在你的项目里。', imageAlt: '插画：一个 deck 被演示并导出成多种格式' },
    ],
    tableTitle: '用 Open Design 做 deck vs. 老办法',
    tableColCapability: '你需要什么',
    tableColWithOd: '用 Open Design',
    tableColWithout: 'PowerPoint / Keynote / AI 幻灯工具',
    tableRows: [
      { capability: '从大纲到幻灯片', withOd: '一句话，agent 排布每一页', without: '一页页手搭，或跟模板较劲' },
      { capability: '一致的设计', withOd: 'deck 模板带真实网格和字体系统', without: '主题跑偏、手动对齐、默认样式不贴品牌' },
      { capability: '数据与图示', withOd: '图表和高亮作为幻灯片的一部分渲染', without: '贴静态图，或每次重建图表' },
      { capability: '导出格式', withOd: 'HTML 演示，外加 PDF / PPTX 导出', without: '锁在某个软件的格式里' },
      { capability: 'review 与版本化', withOd: '源文件在 repo 里，可 diff', without: '二进制文件，无法有意义地 diff' },
      { capability: '成本与锁定', withOd: '开源、自带密钥、本地运行', without: '软件授权或按席位的 AI 附加费' },
    ],
    featuresTitle: "你能演示什么",
    features: [
      { title: "路演 deck", body: "投资和销售 deck，叙事有力、数据页干净。", thumb: "example-html-ppt-pitch-deck" },
      { title: "瑞士 / 编辑风", body: "网格驱动、排版讲究，看起来像艺术指导过。", thumb: "example-deck-swiss-international" },
      { title: "课程模块", body: "教学 deck，步骤清晰、有重点、有节奏。", thumb: "example-html-ppt-course-module" },
      { title: "数据图表 deck", body: "深色、图表为主，适合分析和复盘。", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "演示者模式", body: "reveal 风格 deck，专为浏览器现场演示而建。", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "技术蓝图", body: "架构和知识 deck，把复杂系统讲清楚。", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: '别人用 Open Design 做出来的 deck',
    galleryLead: '下面是从大纲渲染出的真实 deck。挑一个接近你演讲风格的，描述内容。',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "编辑杂志风 deck" },
      { thumb: "example-guizang-ppt", caption: "插画风主题演讲" },
      { thumb: "example-deck-open-slide-canvas", caption: "Open slide canvas deck" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "渐变主题 deck" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '浏览 deck 模板',
    faqTitle: '幻灯片常见问题',
    faq: [
      { q: '需要 PowerPoint 或 Keynote 吗？', a: '不需要。Open Design 在你的编码 agent 里把 deck 渲染成 HTML，还能导出 PDF 或 PPTX。你从浏览器演示或交付文件——做的时候不需要任何演示软件。' },
      { q: '这只是 AI 生成的要点吗？', a: '不是。agent 套用带网格、字号体系和视觉层次的真实 deck 模板，幻灯片看起来是设计出来的，而不是自动填的。' },
      { q: '能导出 PowerPoint 给客户吗？', a: '能。deck 除了用来演示的 HTML，还能导出 PPTX 和 PDF，适配观众的预期。' },
      { q: '可以用哪些 agent？', a: 'Claude Code、Codex、Cursor Agent、Gemini CLI 等一方适配，自带 provider 密钥。' },
    ],
    ctaTitle: '今晚就把下一个 deck 做出来',
    ctaBody: '给 repo 点个 star、装上 Open Design，把你的大纲变成有设计感的 deck——在你本来就用的 agent 里。',
  },
  image: {
    title: '用 Open Design + Claude Code 生成贴合品牌的图片',
    description:
      '从一句 prompt 产出社交卡片、文章封面、营销图——用真实排版和你的品牌系统排好版，渲染成可导出 PNG 的清晰 HTML。不用设计软件，不用订阅模板。',
    breadcrumb: '图片',
    label: '使用场景 · 图片',
    heading: '贴合品牌的图片，自动生成并排好版',
    lead: '描述你要的卡片或封面。Open Design 用真实字体、网格和你的品牌色把它组合出来，再渲染成可导出图片的 HTML——不用跟设计软件或通用模板较劲。',
    heroImageAlt: '编辑风插画：一句 prompt 变成一组排好版的社交卡片和文章封面',
    tldrTitle: '一句话',
    tldrBody:
      'Open Design 把 prompt 变成排好版、贴合品牌的图片，由 agent 渲染成 HTML 并导出 PNG——可复用、可版本化，没有按席位的设计工具。',
    stepsTitle: '用 Open Design 做图的流程',
    steps: [
      { title: '描述图片', body: '说清它是什么——"一张发布用的 Twitter 卡片，带标题和一句引用"。agent 加载对应 skill，组合出排好版的图片，而不是纯文字块。', imageAlt: '插画：一个人描述自己需要的社交卡片' },
      { title: '套用品牌系统', body: 'Open Design 从可复用设计系统里取你的颜色、字体和间距，每张卡片都跟品牌其余部分一致，而不是各做各的。', imageAlt: '插画：品牌色和字体被套用到卡片布局上' },
      { title: '渲染并导出', body: '图片按你要的精确尺寸渲染成 HTML——社交卡、封面、横幅——再导出 PNG。文字清晰、布局真实、不用手动微调。', imageAlt: '插画：一张图片渲染并导出成图片文件' },
      { title: '复用这套配方', body: '因为它是模板，下一张图只差一句 prompt——换标题、留布局。成系列的卡片完美一致。', imageAlt: '插画：一个卡片模板产出一致的系列图片' },
    ],
    tableTitle: '用 Open Design 做图 vs. 老办法',
    tableColCapability: '你需要什么',
    tableColWithOd: '用 Open Design',
    tableColWithout: '设计软件 / 通用模板',
    tableRows: [
      { capability: '从想法到排好版的图', withOd: '一句话，agent 组合字体和布局', without: '打开软件、手动摆每个元素' },
      { capability: '保持贴合品牌', withOd: '颜色和字体来自可复用设计系统', without: '每个文件重选品牌样式，或跑偏' },
      { capability: '一致的系列', withOd: '同模板、换文案——完美对齐的一组', without: '每个变体手动对齐' },
      { capability: '导出', withOd: 'HTML 按精确尺寸，导出 PNG', without: '手动调画布尺寸和导出设置' },
      { capability: '可复用', withOd: 'repo 里一套 prompt 驱动的配方', without: '每次重做的一次性文件' },
      { capability: '成本与锁定', withOd: '开源、自带密钥、本地运行', without: '按席位的设计工具或模板市场' },
    ],
    featuresTitle: "你能做出哪些图",
    features: [
      { title: "社交卡片", body: "用你的标题和品牌组合的 X / Twitter 卡片。", thumb: "example-card-twitter" },
      { title: "文章封面", body: "杂志编辑风的文章和 newsletter 封面。", thumb: "example-article-magazine" },
      { title: "小红书卡片", body: "为小红书 feed 调过的卡片样式。", thumb: "example-card-xiaohongshu" },
      { title: "Hero 主视觉", body: "液态、渐变的 hero 视觉，用于站点和发布。", thumb: "example-frame-liquid-bg-hero" },
      { title: "轮播图", body: "多图社交轮播，每帧之间保持一致。", thumb: "example-social-carousel" },
      { title: "UI 示意帧", body: "通知和设备外框，用于产品叙事。", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: '别人用 Open Design 做出来的图',
    galleryLead: '下面是从 prompt 渲染出的真实卡片和封面。挑一个接近你需要的，换上你的文案。',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "粉彩社交卡片" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "三色编辑风海报" },
      { thumb: "example-magazine-poster", caption: "杂志风海报" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "醒目编辑风封面" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '浏览图片模板',
    faqTitle: '图片常见问题',
    faq: [
      { q: '这是 Midjourney 那种 AI 生图吗？', a: '不是。Open Design 用真实布局和排版组合图片——你的标题、你的品牌、精确尺寸——渲染成 HTML 再导出 PNG。是设计排版，不是像素生成。' },
      { q: '能做风格一致的系列卡片吗？', a: '能。因为每张图都是模板，保留布局换文案，整个系列就完美对齐、贴合品牌。' },
      { q: '能出哪些尺寸？', a: '任意——图片按你指定的精确尺寸渲染，从方形社交卡到宽幅横幅，再导出 PNG。' },
      { q: '可以用哪些 agent？', a: 'Claude Code、Codex、Cursor Agent、Gemini CLI 等一方适配，自带 provider 密钥。' },
    ],
    ctaTitle: '今晚就把下一张图做出来',
    ctaBody: '给 repo 点个 star、装上 Open Design，把一句 prompt 变成贴合品牌的图片——在你本来就用的 agent 里。',
  },
  video: {
    title: '用 Open Design + Claude Code 生成动态图形和短视频',
    description:
      '把脚本变成动画帧和短视频——标题卡、动态背景、片尾，用你的品牌系统组合并从 HTML 渲染。不用动态图形套件，不用在时间轴上拖拽。',
    breadcrumb: '视频',
    label: '使用场景 · 视频',
    heading: '动态图形靠脚本生成，不靠时间轴',
    lead: '描述你想要的那一刻——标题揭示、数据动画、logo 片尾。Open Design 用你的品牌系统组合动画帧并渲染成视频，不需要动态图形套件。',
    heroImageAlt: '编辑风插画：一份脚本变成一连串动画视频帧',
    tldrTitle: '一句话',
    tldrBody:
      'Open Design 把脚本变成贴合品牌的动画帧，由 agent 渲染成短视频——从 HTML 组合、在 repo 里版本化、不用学时间轴编辑器。',
    stepsTitle: '用 Open Design 做动效的流程',
    steps: [
      { title: '描述那一刻', body: '说清要发生什么——"一个故障感标题化解成我们的 logo，然后一张结尾卡"。agent 加载动效 skill，产出动画帧而不是静态图。', imageAlt: '插画：一个人描述一段动效序列' },
      { title: '套用品牌与动效风格', body: 'Open Design 提供帧模板——电影感漏光、故障标题、logo 片尾——并套用你的颜色和字体，让动效看起来是有意为之、贴合品牌。', imageAlt: '插画：品牌样式被套用到动画帧上' },
      { title: '把帧渲染成视频', body: '帧在 HTML 里组合并渲染成视频，时序和布局精确可复现——不用在时间轴上手动打关键帧。', imageAlt: '插画：HTML 帧渲染成一段视频' },
      { title: '迭代并导出', body: '靠跟 agent 对话来改——"放慢标题揭示、加一行字幕"。导出短视频用于社交或产品。源文件留在你的项目里。', imageAlt: '插画：一段视频被打磨并导出用于社交' },
    ],
    tableTitle: '用 Open Design 做动效 vs. 老办法',
    tableColCapability: '你需要什么',
    tableColWithOd: '用 Open Design',
    tableColWithout: 'After Effects / 动效套件',
    tableRows: [
      { capability: '从脚本到动画帧', withOd: '一句话，agent 组合整段序列', without: '在时间轴上一个个手打关键帧' },
      { capability: '保持贴合品牌', withOd: '帧模板 + 你的颜色和字体', without: '每个项目重建品牌样式' },
      { capability: '精确可复现的时序', withOd: '在 HTML 里组合、确定性渲染', without: '手动拖拽，难以复现' },
      { capability: '导出用于社交', withOd: '短视频渲染成片', without: '导出预设和编码格式折腾' },
      { capability: 'review 与版本化', withOd: '帧源文件在 repo 里，可 diff', without: '二进制工程文件，无法真正 diff' },
      { capability: '成本与锁定', withOd: '开源、自带密钥、本地运行', without: '昂贵套件、陡峭学习曲线' },
    ],
    featuresTitle: "你能做出哪些动效",
    features: [
      { title: "Hyperframes", body: "用 HTML 组合的逐帧动效序列。", thumb: "example-video-hyperframes" },
      { title: "短视频", body: "为社交 feed 做的竖版短片。", thumb: "example-video-shortform" },
      { title: "动效帧组", body: "可复用的动画帧，组合成一段片子。", thumb: "example-motion-frames" },
      { title: "电影感漏光", body: "电影质感的转场和氛围背景。", thumb: "example-frame-light-leak-cinema" },
      { title: "故障标题", body: "带动效和质感的标题揭示。", thumb: "example-frame-glitch-title" },
      { title: "logo 片尾", body: "任意片子都能用的品牌收尾动画。", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: '别人用 Open Design 做出来的动效',
    galleryLead: '下面是从 prompt 渲染出的真实动画帧和短片。挑一个接近你想法的，描述动效。',
    gallery: [
      { thumb: "example-hyperframes", caption: "Hyperframes 序列" },
      { thumb: "example-frame-liquid-bg-hero", caption: "液态动态背景" },
      { thumb: "example-frame-macos-notification", caption: "动态 UI 帧" },
      { thumb: "example-frame-data-chart-nyt", caption: "动态数据图表" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '浏览动效模板',
    faqTitle: '视频常见问题',
    faq: [
      { q: '需要 After Effects 或动效套件吗？', a: '不需要。Open Design 在你的编码 agent 里用 HTML 组合动画帧并渲染成视频。没有时间轴编辑器要学或要授权。' },
      { q: '这适合做什么视频？', a: '短视频动效——标题卡、数据动画、logo 片尾、社交短片。它为品牌和产品动效而生，不是做长片剪辑。' },
      { q: '时序可复现吗？', a: '可以。因为帧是用代码组合、确定性渲染的，每次结果一致，还能用一句 prompt 精确调整。' },
      { q: '可以用哪些 agent？', a: 'Claude Code、Codex、Cursor Agent、Gemini CLI 等一方适配，自带 provider 密钥。' },
    ],
    ctaTitle: '今晚就把下一个想法做成动效',
    ctaBody: '给 repo 点个 star、装上 Open Design，把一份脚本变成动效——在你本来就用的 agent 里。',
  },
  designSystem: {
    title: '用 Open Design + Claude Code 搭建并套用设计系统',
    description:
      '把你的品牌沉淀成一套可复用的设计系统，让编码 agent 套用到每一个产物——颜色、字体、组件、语气，全在一份 DESIGN.md 里。定义一次，每个原型、deck、看板都贴合品牌。',
    breadcrumb: '设计系统',
    label: '使用场景 · 设计系统',
    heading: '一套设计系统，套用到 agent 做的每一样东西',
    lead: '把你的品牌定义一次，Open Design 就把它带进每个产出——原型、deck、看板、图片。系统作为一份 DESIGN.md 留在你的 repo 里供 agent 读取，一致性是自动的，不靠手动维护。',
    heroImageAlt: '编辑风插画：一套设计系统向外辐射成众多贴合品牌的产物',
    tldrTitle: '一句话',
    tldrBody:
      'Open Design 把你的品牌沉淀成一套可移植的设计系统，agent 套用到每个产物——在 repo 里定义一次、处处强制执行，没有中心化设计工具把关。',
    stepsTitle: '用 Open Design 做设计系统的流程',
    steps: [
      { title: '沉淀系统', body: '描述你的品牌——颜色、字体、间距、语气——或让 agent 指向一个现有站点去提取。Open Design 把它写进一份留在你项目里的 DESIGN.md。', imageAlt: '插画：一个品牌被沉淀进一份设计系统文件' },
      { title: '从成熟基底起步', body: 'Open Design 自带 140+ 套参考设计系统——从 Apple、Linear 到编辑风、粗野主义。fork 一个接近你品牌的，而不是从白纸开始。', imageAlt: '插画：浏览一排参考设计系统' },
      { title: '处处套用', body: '其他每个 skill 都读同一套系统，所以原型、deck、看板共享一套视觉语言——你不用每次重新指定。', imageAlt: '插画：一套系统一致地套用到多种产物类型' },
      { title: '在一处演进', body: '改一处系统，下一次渲染处处生效。因为它是 repo 里的一个文件，设计决策像代码一样被 review 和版本化。', imageAlt: '插画：一套设计系统被更新并传播到所有产出' },
    ],
    tableTitle: '用 Open Design 做设计系统 vs. 老办法',
    tableColCapability: '你需要什么',
    tableColWithOd: '用 Open Design',
    tableColWithout: '设计工具组件库 / 风格指南',
    tableRows: [
      { capability: '定义系统', withOd: '一份 agent 读取的 DESIGN.md，从 140+ 参考 fork', without: '一份静态风格指南或锁在工具里的组件库' },
      { capability: '跨产物类型套用', withOd: '同一套系统喂给原型、deck、看板、图片', without: '每个工具、每个文件重做一遍' },
      { capability: '保持一致', withOd: '自动——每个 skill 读同一个源', without: '靠人工自律，时间一长就跑偏' },
      { capability: '演进品牌', withOd: '改一次，下次渲染处处更新', without: '跨文件跨工具查找替换' },
      { capability: 'review 与版本化', withOd: '在 repo 里，像代码一样可 diff', without: '埋在设计工具里，难以审计' },
      { capability: '成本与锁定', withOd: '开源、可移植、本地运行', without: '锁在设计工具订阅里' },
    ],
    featuresTitle: "可作为起点的系统",
    features: [
      { title: "Apple", body: "干净、克制、系统字体的美学。", thumb: "design-system-apple" },
      { title: "Linear", body: "利落的产品工具风，间距紧凑。", thumb: "design-system-linear-app" },
      { title: "Notion", body: "柔和、文档优先、亲和。", thumb: "design-system-notion" },
      { title: "Figma", body: "活泼、多彩、创意工具的能量。", thumb: "design-system-figma" },
      { title: "OpenAI", body: "极简、中性、研究级。", thumb: "design-system-openai" },
      { title: "GitHub", body: "密集、技术、开发者原生。", thumb: "design-system-github" },
    ],
    galleryTitle: 'Open Design 里的设计系统',
    galleryLead: '下面是 140+ 套参考系统里的几个，可作为起点 fork。挑一个接近你品牌的去改。',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Airbnb 风格系统" },
      { thumb: "design-system-vercel", caption: "Vercel 风格系统" },
      { thumb: "design-system-stripe", caption: "Stripe 风格系统" },
      { thumb: "design-system-spotify", caption: "Spotify 风格系统" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: '浏览设计系统',
    faqTitle: '设计系统常见问题',
    faq: [
      { q: '这里的设计系统具体是什么？', a: 'repo 里一份 DESIGN.md，沉淀颜色、字体、间距、组件和语气。每个 Open Design skill 都读它，所以 agent 产出的任何东西都自动套用你的品牌。' },
      { q: '必须从零开始吗？', a: '不必。Open Design 自带 140+ 套参考设计系统可 fork——从 Apple、Linear 到编辑风、粗野主义——再适配你的品牌。' },
      { q: '怎么在 deck、看板、原型之间保持一致？', a: '因为这些 skill 都读同一份 DESIGN.md。定义一次，一致性就是自动的，而不是靠手动盯着。' },
      { q: '可以用哪些 agent？', a: 'Claude Code、Codex、Cursor Agent、Gemini CLI 等一方适配，自带 provider 密钥。' },
    ],
    ctaTitle: '今晚就定义你的设计系统',
    ctaBody: '给 repo 点个 star、装上 Open Design，给你的 agent 一套处处套用的品牌——在你本来就用的 agent 里。',
  },
};

const JA: SolutionLocaleCopy = {
  prototype: {
    title: 'Open Design + Claude Code でインタラクティブなプロトタイプを作る',
    description:
      'プロンプトを、ターミナルから離れることなくクリック可能なマルチスクリーンのプロトタイプに変えます。Open Design はコーディングエージェントに、デザインスキル、テンプレート、デザインシステムを与え、ブラウザで開ける本物のプロトタイプを出力します。',
    breadcrumb: 'プロトタイプ',
    label: 'ユースケース · プロトタイプ',
    heading: 'プロンプトの速さでプロトタイピング',
    lead: '頭の中にあるフローを説明するだけで、エージェントが本物のクリック可能なプロトタイプを組み立てます。複数の画面、共有スタイル、ライブなインタラクションが、開いて共有しエンジニアリングに渡せる HTML へとそのままレンダリングされます。',
    heroImageAlt:
      '手がワイヤーフレームをスケッチし、それがクリック可能なマルチスクリーンのアプリプロトタイプに変わる様子を描いたエディトリアルなイラスト',
    tldrTitle: '一言で言うと',
    tldrBody:
      'Open Design は、あなたがすでに使っているコーディングエージェントのためのデザインレイヤーです。プロトタイピングにおいては、一段落のアイデアから、操作可能でスタイルの整ったプロトタイプを一度のセッションで生み出せるということ。デザインツールも、エクスポート工程も、引き継ぎの断絶もありません。',
    stepsTitle: 'Open Design でのプロトタイピングの流れ',
    steps: [
      {
        title: 'フローを説明する',
        body: '作りたいものを普通の言葉で伝えます。「ウェルカム画面、プラン選択、確認画面のあるオンボーディングフロー」のように。Open Design がプロトタイプスキルを読み込み、エージェントは単一ページではなく複数の画面を生み出すべきだと理解します。',
        imageAlt:
          'アプリフローの説明を普通の言葉でターミナルに打ち込む人物のイラスト',
      },
      {
        title: 'スタイル付きの画面を生成する',
        body: 'エージェントは Open Design のデザインシステムとプロトタイプテンプレートを適用するため、どの画面もタイポグラフィ、余白、コンポーネントを共有し、ラフな下書きには見えません。バラバラのモックアップではなく、まとまりのある画面群が手に入ります。',
        imageAlt:
          '複数のアプリ画面が順番に現れ、すべてが一貫したビジュアルスタイルを共有しているイラスト',
      },
      {
        title: 'インタラクションをつなぐ',
        body: 'ボタンで遷移し、タブが切り替わり、モーダルが開きます。プロトタイプは自己完結した HTML にレンダリングされるので、どのブラウザでも本物のように動作します。閲覧のためにプロトタイピングツールのアカウントは要りません。',
        imageAlt:
          'カーソルがリンクされた画面をクリックしていき、矢印が画面間のナビゲーションを示すイラスト',
      },
      {
        title: '反復し、引き継ぐ',
        body: 'エージェントと話しながら磨き込みます。「プラン選択を3カラムのレイアウトにして」のように。成果物はあなたのプロジェクト内にあるため、デザインと最終的なコードが一つの信頼できる情報源を共有し、よくあるデザイナーからエンジニアへの引き継ぎの断絶を解消します。',
        imageAlt:
          'プロトタイプが修正され、その後エンジニアに渡され、デザインとコードが一つのファイルに統合されるイラスト',
      },
    ],
    tableTitle: 'Open Design でのプロトタイピング vs これまでのやり方',
    tableColCapability: '必要なこと',
    tableColWithOd: 'Open Design なら',
    tableColWithout: '従来のプロトタイピングツール',
    tableRows: [
      {
        capability: 'アイデアから最初の画面へ',
        withOd: 'すでに開いているエージェントへの一つのプロンプト',
        without: '別のツールを開き、ファイルを始め、手でボックスをドラッグする',
      },
      {
        capability: 'リンクされた複数の画面',
        withOd: '共有スタイルと動作するナビゲーションを備えた一式として生成',
        without: '各フレームを手で描き、手でリンクする',
      },
      {
        capability: '一貫したビジュアルシステム',
        withOd: 'エージェントが適用する再利用可能なデザインシステムから取得',
        without: 'ファイルごとに作り直すか、手で維持する',
      },
      {
        capability: '共有できる成果物',
        withOd: '自己完結した HTML — どのブラウザでも開け、アカウント不要',
        without: '閲覧者にはベンダーツールのシートか共有リンクが必要',
      },
      {
        capability: '本物のコードへの道筋',
        withOd: '成果物がリポジトリ内にあり、デザインとコードが一つの情報源を共有',
        without: '別途の引き継ぎ後にゼロから作り直し',
      },
      {
        capability: 'コストとロックイン',
        withOd: 'オープンソース、自分の鍵を持ち込み、ローカルで動作',
        without: 'シート単位のサブスク、ベンダーホスト、エクスポート制限あり',
      },
    ],
    featuresTitle: 'プロトタイプにできるもの',
    features: [
      {
        title: 'マルチスクリーンの Web アプリ',
        body: '共有ナビゲーションを備えた完全なフロー — オンボーディング、ダッシュボード、設定 — 単一ページではなく。',
        thumb: 'example-web-prototype',
      },
      {
        title: 'モバイルアプリのフロー',
        body: 'ネイティブのような遷移と状態を備えた、画面ごとのモバイル体験。',
        thumb: 'example-mobile-app',
      },
      {
        title: 'ランディングページ',
        body: 'クリックして確かめ、そのまま出荷できるマーケティングページや SaaS のランディング。',
        thumb: 'example-saas-landing',
      },
      {
        title: 'あらゆるビジュアルの好み',
        body: 'エディトリアル、ソフト、ブルータリスト — プロトタイプは一貫したスタイルを最初から最後まで貫きます。',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'ウェイトリストと料金',
        body: 'コンバージョン面 — ウェイトリスト、料金表 — を配線済みでブランドに沿って。',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'ゲーム化された遊び心',
        body: 'モーションと状態がプレゼンの一部となる、インタラクション重視のコンセプト。',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Open Design で作られたプロトタイプ',
    galleryLead:
      'どれもプロンプトから始まり、クリック可能な成果物へとレンダリングされました。アイデアに近いテンプレートを選び、あなたのバリエーションを説明すれば、エージェントがそれを適応させます。',
    gallery: [
      { thumb: "example-dating-web", caption: "デーティング Web アプリ — マルチスクリーンのフロー" },
      { thumb: "example-hr-onboarding", caption: "人事オンボーディングのフロー" },
      { thumb: "example-kami-landing", caption: "プロダクトのランディングページ" },
      { thumb: "example-web-prototype-taste-soft", caption: "ソフトスタイルの Web プロトタイプ" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'プロトタイプテンプレートを見る',
    faqTitle: 'プロトタイピング FAQ',
    faq: [
      {
        q: 'Open Design でプロトタイプを作るのに Figma のようなデザインツールは必要ですか？',
        a: 'いいえ。Open Design はコーディングエージェントの中で動き、プロトタイプを HTML にレンダリングします。フローを言葉で説明すれば、エージェントが画面を生み出します。学んだり料金を払ったりする別のキャンバスツールはありません。',
      },
      {
        q: 'プロトタイプはインタラクティブですか、それともただの静的なモックアップですか？',
        a: 'インタラクティブです。出力は本物の HTML と CSS なので、ナビゲーション、タブ、モーダルが動作します。ユーザーとまったく同じように、どのブラウザでもクリックして確かめられます。',
      },
      {
        q: 'どのエージェントを使えますか？',
        a: 'Open Design は Claude Code、Codex、Cursor Agent、Gemini CLI、その他10種以上のファーストパーティアダプターで動作します。プロバイダーの鍵は自分で持ち込み、何もホストされません。',
      },
      {
        q: 'プロトタイプは本物のプロダクトになれますか？',
        a: 'まさにそれが狙いです。成果物がプロジェクト内にあるため、同じデザインシステムとコンポーネントが、引き継ぎ後に捨てられるのではなく、本番コードへと引き継がれます。',
      },
    ],
    ctaTitle: '次のアイデアを今夜プロトタイプに',
    ctaBody:
      'リポジトリにスターを付け、Open Design をインストールして、次の「もし〜だったら」を、すでに使っているエージェントの中で、クリックできる形に変えましょう。',
  },
  dashboard: {
    title: 'Open Design + Claude Code でデータダッシュボードを生成する',
    description:
      '追跡している指標を説明するだけで、コーディングエージェントがスタイルの整ったレスポンシブなダッシュボードを構築します。チャート、KPI カード、テーブルがどこにでもホストできる HTML にレンダリングされます。BI ツールのシートも、ドラッグ&ドロップのビルダーも不要です。',
    breadcrumb: 'ダッシュボード',
    label: 'ユースケース · ダッシュボード',
    heading: 'ドラッグ&ドロップのビルダーではなく、説明からダッシュボードを',
    lead: '何を見せたいか、どう感じさせたいかをエージェントに伝えます。Open Design がチャートのパターン、レイアウトシステム、ビジュアル言語を供給するので、デフォルトスタイルのウィジェットの壁ではなく、まとまりのある見栄えの良いダッシュボードが手に入ります。',
    heroImageAlt:
      '左側の生の数値が、右側のチャートと KPI カードのきれいなダッシュボードへと流れ込むエディトリアルなイラスト',
    tldrTitle: '一言で言うと',
    tldrBody:
      'Open Design は指標を普通の言葉で書いた仕様を、エージェントが HTML にレンダリングするスタイルの整ったダッシュボードに変えます。リポジトリでバージョン管理され、どこにでもホストでき、シート単位の BI サブスクは不要です。',
    stepsTitle: 'Open Design でのダッシュボードの流れ',
    steps: [
      {
        title: '指標を説明する',
        body: '大切なものを挙げます。「週間アクティブユーザー、プラン別の収益、解約率、30日間のトレンド」のように。エージェントがダッシュボードスキルを読み込み、一塊のテキストではなく、KPI カード、チャート、テーブルをレイアウトすべきだと理解します。',
        imageAlt: '自分が重視する指標を列挙する人物のイラスト',
      },
      {
        title: 'チャートのパターンを選ぶ',
        body: 'Open Design はチャートとレイアウトのテンプレートを備えているので、トレンドは折れ線グラフに、内訳は棒グラフに、比率は適切なビジュアルになります。ちぐはぐなデフォルトではなく、一貫したタイポグラフィと余白が全体を通ります。',
        imageAlt: 'いくつかのチャートタイプがまとまりのあるグリッドに配置されたイラスト',
      },
      {
        title: 'データをつなぐ',
        body: 'ダッシュボードを CSV や JSON エンドポイントに向けるか、サンプル行を貼り付けます。データが変わると更新される自己完結した HTML にレンダリングされ、どのブラウザでも開け、どの静的ホストにも置けます。',
        imageAlt: 'データファイルがライブ更新されるダッシュボードに接続するイラスト',
      },
      {
        title: '磨いて出荷する',
        body: 'エージェントと話して調整します。「収益を地域別にまとめて、KPI 行を一番上に移して」のように。成果物がプロジェクト内にあるので、ダッシュボードは他のコードと同じようにレビューでき、バージョン管理されます。',
        imageAlt: 'ダッシュボードが磨かれ、その後デプロイされるイラスト',
      },
    ],
    tableTitle: 'Open Design でのダッシュボード vs これまでのやり方',
    tableColCapability: '必要なこと',
    tableColWithOd: 'Open Design なら',
    tableColWithout: 'BI ツール / 手書きコード',
    tableRows: [
      {
        capability: '指標リストからレイアウトへ',
        withOd: '一つのプロンプト。エージェントがカード、チャート、テーブルをレイアウト',
        without: 'ウィジェットを一つずつドラッグ、またはチャートコードをゼロから記述',
      },
      {
        capability: '一貫したビジュアルシステム',
        withOd: '再利用可能なデザインシステムからのチャートパターンと余白',
        without: 'デフォルトのウィジェットスタイル、またはチャートごとに手でスタイリング',
      },
      {
        capability: 'データの接続',
        withOd: 'CSV / JSON / 貼り付けた行を、ライブな HTML にレンダリング',
        without: 'ベンダーのコネクタや独自のデータ配管',
      },
      {
        capability: 'ホスティングと共有',
        withOd: 'どの静的ホストでも動く自己完結した HTML、アカウント不要',
        without: '閲覧者には BI ベンダーのシートが必要',
      },
      {
        capability: 'レビューとバージョン管理',
        withOd: 'リポジトリ内にあり、コードのように差分が取れる',
        without: 'ベンダー内に閉じ込められ、本当の差分が取れない',
      },
      {
        capability: 'コストとロックイン',
        withOd: 'オープンソース、自分の鍵を持ち込み、ローカルで動作',
        without: 'シート単位のサブスク、ベンダーホスト',
      },
    ],
    featuresTitle: '構築できるもの',
    features: [
      { title: "プロダクト分析", body: "アクティブユーザー、ファネル、リテンション — プロダクトチームが日々向き合う指標。", thumb: "example-dashboard" },
      { title: "リポジトリと開発の指標", body: "スター、PR、CI の健全性 — 自分のデータから作るエンジニアリングダッシュボード。", thumb: "example-github-dashboard" },
      { title: "財務レポート", body: "収益、バーン、ランウェイを共有できるレポートとしてレイアウト。", thumb: "example-finance-report" },
      { title: "ライブオペレーション", body: "基となるデータが動くにつれて更新されるリアルタイム指標。", thumb: "example-live-dashboard" },
      { title: "ソーシャルとマーケティング", body: "チャネルのパフォーマンスとキャンペーンのトラッキングを一つのビューに。", thumb: "example-social-media-dashboard" },
      { title: "ドメインレポート", body: "あらゆる分野の構造化されたレポート — 臨床からトレーディングまで。", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Open Design で作られたダッシュボード',
    galleryLead:
      'プロンプトとデータソースからレンダリングされた本物のダッシュボード。自分に近いものから始め、追跡している指標を説明してください。',
    gallery: [
      { thumb: "example-data-report", caption: "データレポート" },
      { thumb: "example-flowai-live-dashboard-template", caption: "ライブオペレーションのダッシュボード" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "トレーディング分析のダッシュボード" },
      { thumb: "example-frame-data-chart-nyt", caption: "エディトリアルなデータチャート" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'ダッシュボードテンプレートを見る',
    faqTitle: 'ダッシュボード FAQ',
    faq: [
      {
        q: 'Tableau や Looker のような BI ツールは必要ですか？',
        a: 'いいえ。Open Design はコーディングエージェントの中でダッシュボードを HTML にレンダリングします。指標を説明してデータに向けるだけで、ライセンスや習得が必要な別の BI プラットフォームはありません。',
      },
      {
        q: 'データはどこから来ますか？',
        a: 'CSV、JSON エンドポイント、または貼り付けた行から。ダッシュボードはプレーンな HTML と JavaScript なので、どこから読むかを正確に自分で制御できます。ホストされたサービスを経由するものは何もありません。',
      },
      {
        q: '技術者でないチームメンバーも見られますか？',
        a: 'はい。出力は自己完結した Web ページです。リンクやファイルがあれば誰でもブラウザで開けます。アカウントもシートも不要です。',
      },
      {
        q: 'どのエージェントを使えますか？',
        a: 'Claude Code、Codex、Cursor Agent、Gemini CLI、その他10種以上のファーストパーティアダプター。プロバイダーの鍵は自分で持ち込みます。',
      },
    ],
    ctaTitle: '今夜あなたのダッシュボードを構築',
    ctaBody:
      'リポジトリにスターを付け、Open Design をインストールして、あなたの指標を、すでに使っているエージェントの中で、どこにでもホストできるダッシュボードに変えましょう。',
  },
  slides: {
    title: 'Open Design + Claude Code でプレゼンテーション資料を生成する',
    description:
      'アウトラインを、プレゼンアプリを開かずにデザインされたブランドに沿ったスライド資料に変えます。Open Design はコーディングエージェントに資料テンプレートとビジュアルシステムを与え、プレゼン・エクスポート・共有できる HTML にスライドをレンダリングします。',
    breadcrumb: 'スライド',
    label: 'ユースケース · スライド',
    heading: 'デザインされて見える資料を、プロンプトで書く',
    lead: 'エージェントにアウトラインとトーンを渡します。Open Design が資料テンプレートとビジュアルシステムを適用するので、どのスライドもレイアウトされ、組版され、ブランドに沿います。空白の背景に箇条書きが並ぶだけではありません。',
    heroImageAlt:
      '左側のアウトラインが、右側のデザインされたプレゼンスライドの連なりに変わるエディトリアルなイラスト',
    tldrTitle: '一言で言うと',
    tldrBody:
      'Open Design はアウトラインを、エージェントが一度のセッションでレンダリングするデザインされた HTML 資料に変えます。ブラウザでプレゼンし、PDF や PPTX にエクスポートし、ソースはリポジトリに保持できます。',
    stepsTitle: 'Open Design での資料作成の流れ',
    steps: [
      {
        title: 'アウトラインを渡す',
        body: '話したいポイントやおおまかな構成を貼り付けます。エージェントが資料スキルを読み込み、一つの長い文書ではなく、レイアウトされたスライドの連なりを生み出します。',
        imageAlt: 'テキストのアウトラインがエージェントに渡されるイラスト',
      },
      {
        title: '資料のスタイルを選ぶ',
        body: 'Open Design は資料テンプレートを備えています — エディトリアル、スイス・インターナショナル、ダークなテクニカルなど。エージェントが一つを適用し、タイポグラフィ、グリッド、アクセントがすべてのスライドで一貫します。',
        imageAlt: 'いくつかの資料スタイルの選択肢が横並びに配置されたイラスト',
      },
      {
        title: 'スライドを生成する',
        body: '各ポイントが適切な階層を備えたデザインされたスライドになります — タイトル、補助となるビジュアル、データの強調表示。HTML にレンダリングされるので、どのブラウザでもフルスクリーンでプレゼンできます。',
        imageAlt: '一貫したスタイリングで仕上がったスライドの連なりのイラスト',
      },
      {
        title: 'プレゼン、エクスポート、反復',
        body: 'ブラウザからプレゼンするか、共有用に PDF / PPTX にエクスポートします。エージェントと話して磨きます。「データスライドを引き締めて、締めの行動喚起を加えて」のように。資料のソースはプロジェクト内に残ります。',
        imageAlt: '資料がプレゼンされ、複数の形式にエクスポートされるイラスト',
      },
    ],
    tableTitle: 'Open Design での資料 vs これまでのやり方',
    tableColCapability: '必要なこと',
    tableColWithOd: 'Open Design なら',
    tableColWithout: 'PowerPoint / Keynote / AI スライドツール',
    tableRows: [
      {
        capability: 'アウトラインからスライドへ',
        withOd: '一つのプロンプト。エージェントが全スライドをレイアウト',
        without: '各スライドを手で作るか、テンプレートと格闘する',
      },
      {
        capability: '一貫したデザイン',
        withOd: '本物のグリッドと文字組みシステムを備えた資料テンプレート',
        without: 'テーマのずれ、手動の位置合わせ、ブランド外のデフォルト',
      },
      {
        capability: 'データと図表',
        withOd: 'スライドの一部としてレンダリングされるチャートと強調表示',
        without: '静止画を貼るか、毎回チャートを作り直す',
      },
      {
        capability: 'エクスポート形式',
        withOd: 'プレゼン用の HTML に加え、PDF / PPTX エクスポート',
        without: '一つのアプリの形式に縛られる',
      },
      {
        capability: 'レビューとバージョン管理',
        withOd: 'ソースがリポジトリ内にあり、差分が取れる',
        without: 'バイナリファイル、意味のある差分が取れない',
      },
      {
        capability: 'コストとロックイン',
        withOd: 'オープンソース、自分の鍵を持ち込み、ローカルで動作',
        without: 'アプリのライセンスやシート単位の AI アドオン',
      },
    ],
    featuresTitle: 'プレゼンできるもの',
    features: [
      { title: "ピッチ資料", body: "力強いストーリーときれいなデータスライドを備えた投資家・営業向け資料。", thumb: "example-html-ppt-pitch-deck" },
      { title: "スイス / エディトリアル", body: "アートディレクションされたように見える、グリッド主導でタイポグラフィ的な資料。", thumb: "example-deck-swiss-international" },
      { title: "コースモジュール", body: "明確なステップ、強調表示、ペース配分を備えた教育用資料。", thumb: "example-html-ppt-course-module" },
      { title: "データグラフ資料", body: "分析やレビューのための、ダークでチャート前面の資料。", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "プレゼンターモード", body: "ブラウザでライブにプレゼンするために作られた Reveal 風の資料。", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "技術ブループリント", body: "複雑なシステムを図解する、アーキテクチャと知識の資料。", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Open Design で作られた資料',
    galleryLead:
      'アウトラインからレンダリングされた本物の資料。あなたの話に近いスタイルを選び、内容を説明してください。',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "エディトリアルなマガジン資料" },
      { thumb: "example-guizang-ppt", caption: "イラスト入りのキーノート" },
      { thumb: "example-deck-open-slide-canvas", caption: "オープンスライドキャンバスの資料" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "グラデーションテーマの資料" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '資料テンプレートを見る',
    faqTitle: 'スライド FAQ',
    faq: [
      {
        q: 'PowerPoint や Keynote は必要ですか？',
        a: 'いいえ。Open Design はコーディングエージェントの中で資料を HTML にレンダリングし、PDF や PPTX にエクスポートできます。ブラウザからプレゼンするかファイルを渡すだけで、作るためにプレゼンアプリは要りません。',
      },
      {
        q: 'これは単なる AI 生成の箇条書きですか？',
        a: 'いいえ。エージェントはグリッド、文字サイズの体系、ビジュアル階層を備えた本物の資料テンプレートを適用するので、スライドは自動入力されたものではなく、デザインされて見えます。',
      },
      {
        q: 'クライアント向けに PowerPoint にエクスポートできますか？',
        a: 'はい。資料はプレゼン元の HTML に加えて PPTX と PDF にエクスポートできるので、相手が期待するどんな形式にも合わせられます。',
      },
      {
        q: 'どのエージェントを使えますか？',
        a: 'Claude Code、Codex、Cursor Agent、Gemini CLI、その他のファーストパーティアダプター。プロバイダーの鍵は自分で持ち込みます。',
      },
    ],
    ctaTitle: '次の資料を今夜作る',
    ctaBody:
      'リポジトリにスターを付け、Open Design をインストールして、あなたのアウトラインを、すでに使っているエージェントの中で、デザインされた資料に変えましょう。',
  },
  image: {
    title: 'Open Design + Claude Code でブランドに沿ったグラフィックを生成する',
    description:
      'ソーシャルカード、記事のカバー、マーケティンググラフィックをプロンプトから生み出します。本物のタイポグラフィとブランドシステムでレイアウトされ、PNG にエクスポートできる鮮明な HTML にレンダリングされます。デザインアプリも、テンプレートのサブスクも不要です。',
    breadcrumb: '画像',
    label: 'ユースケース · 画像',
    heading: 'ブランドに沿ったグラフィックを、生成しレイアウトまで',
    lead: '必要なカードやカバーを説明します。Open Design が本物の文字組み、グリッド、ブランドカラーで構成し、画像としてエクスポートできる HTML にレンダリングします。デザインアプリと格闘したり、ありきたりなテンプレートを使ったりする必要はありません。',
    heroImageAlt:
      'プロンプトが、レイアウトされたソーシャルカードと記事カバーの一式に変わるエディトリアルなイラスト',
    tldrTitle: '一言で言うと',
    tldrBody:
      'Open Design はプロンプトを、エージェントが HTML にレンダリングして PNG にエクスポートする、組版されたブランドに沿ったグラフィックに変えます。繰り返し可能で、バージョン管理され、シート単位のデザインツールから解放されます。',
    stepsTitle: 'Open Design でのグラフィック作成の流れ',
    steps: [
      {
        title: 'グラフィックを説明する',
        body: '何かを伝えます。「ローンチ用の Twitter カードで、見出しと引用を入れて」のように。エージェントが適切なスキルを読み込み、プレーンなテキストブロックではなく、レイアウトされたグラフィックを構成します。',
        imageAlt: '必要なソーシャルカードを説明する人物のイラスト',
      },
      {
        title: 'ブランドシステムを適用する',
        body: 'Open Design があなたの色、文字組み、余白を再利用可能なデザインシステムから引き出すので、どのカードも一度きりのものに見えるのではなく、ブランドの他の部分と揃います。',
        imageAlt: 'ブランドカラーと文字組みがカードレイアウトに適用されるイラスト',
      },
      {
        title: 'レンダリングしてエクスポートする',
        body: 'グラフィックは必要なちょうどの寸法で HTML にレンダリングされます — ソーシャルカード、カバー、バナー — そして PNG にエクスポートされます。鮮明な文字、本物のレイアウト、手動の微調整なし。',
        imageAlt: 'グラフィックがレンダリングされ、画像ファイルにエクスポートされるイラスト',
      },
      {
        title: 'レシピを再利用する',
        body: 'テンプレートなので、次のグラフィックはプロンプト一つの距離です — 見出しを変えて、レイアウトはそのまま。一連のカードは完璧に一貫したままです。',
        imageAlt: '一つのカードテンプレートが一貫した一連のグラフィックを生み出すイラスト',
      },
    ],
    tableTitle: 'Open Design でのグラフィック vs これまでのやり方',
    tableColCapability: '必要なこと',
    tableColWithOd: 'Open Design なら',
    tableColWithout: 'デザインアプリ / ありきたりなテンプレート',
    tableRows: [
      {
        capability: 'アイデアからレイアウトされたグラフィックへ',
        withOd: '一つのプロンプト。エージェントが文字組みとレイアウトを構成',
        without: 'アプリを開き、要素を一つずつ手で配置する',
      },
      {
        capability: 'ブランドを保つ',
        withOd: '再利用可能なデザインシステムからの色と文字組み',
        without: 'ファイルごとにブランドスタイルを選び直すか、ブランドから外れる',
      },
      {
        capability: '一貫したシリーズ',
        withOd: '同じテンプレート、新しいコピー — 完璧に揃った一式',
        without: '各バリエーションを手で揃え直す',
      },
      {
        capability: 'エクスポート',
        withOd: 'ちょうどの寸法の HTML を PNG にエクスポート',
        without: '手動のキャンバスサイズ設定とエクスポート設定',
      },
      {
        capability: '繰り返し可能',
        withOd: 'リポジトリ内のプロンプト駆動のレシピ',
        without: '毎回作り直す一度きりのファイル',
      },
      {
        capability: 'コストとロックイン',
        withOd: 'オープンソース、自分の鍵を持ち込み、ローカルで動作',
        without: 'シート単位のデザインツールやテンプレートマーケットプレイス',
      },
    ],
    featuresTitle: '作れるもの',
    features: [
      { title: "ソーシャルカード", body: "あなたの見出しとブランドで構成された X / Twitter カード。", thumb: "example-card-twitter" },
      { title: "記事カバー", body: "投稿やニュースレター向けの、エディトリアルでマガジン風のカバー。", thumb: "example-article-magazine" },
      { title: "Xiaohongshu カード", body: "そのフィードに合わせて調整された RedNote 風のカード。", thumb: "example-card-xiaohongshu" },
      { title: "ヒーローグラフィック", body: "サイトやローンチ向けの、リキッドでグラデーションのヒーロービジュアル。", thumb: "example-frame-liquid-bg-hero" },
      { title: "カルーセル", body: "フレーム間で一貫性を保つ、複数スライドのソーシャルカルーセル。", thumb: "example-social-carousel" },
      { title: "UI モックフレーム", body: "プロダクトのストーリーテリング向けの通知・デバイスフレーム。", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Open Design で作られたグラフィック',
    galleryLead:
      'プロンプトからレンダリングされた本物のカードとカバー。必要なものに近いものを選び、あなたのコピーに差し替えてください。',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "パステルのソーシャルカード" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "エディトリアルな三色ポスター" },
      { thumb: "example-magazine-poster", caption: "マガジン風ポスター" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "大胆なエディトリアルカバー" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'グラフィックテンプレートを見る',
    faqTitle: '画像 FAQ',
    faq: [
      {
        q: 'これは Midjourney のような AI 画像ジェネレーターですか？',
        a: 'いいえ。Open Design は本物のレイアウトとタイポグラフィでグラフィックを構成します — あなたの見出し、あなたのブランド、ちょうどの寸法で — そして PNG としてエクスポートする HTML にレンダリングします。ピクセル生成ではなく、デザインの構成です。',
      },
      {
        q: '一貫した一連のカードを作れますか？',
        a: 'はい。各グラフィックがテンプレートなので、レイアウトを保ったままコピーを変えられます。一連のシリーズ全体が完璧に揃い、ブランドに沿ったままです。',
      },
      {
        q: 'どんなサイズを作れますか？',
        a: 'どんなサイズでも。グラフィックは指定したちょうどの寸法でレンダリングされ、正方形のソーシャルカードから横長のバナーまで対応し、PNG にエクスポートします。',
      },
      {
        q: 'どのエージェントを使えますか？',
        a: 'Claude Code、Codex、Cursor Agent、Gemini CLI、その他のファーストパーティアダプター。プロバイダーの鍵は自分で持ち込みます。',
      },
    ],
    ctaTitle: '次のグラフィックを今夜作る',
    ctaBody:
      'リポジトリにスターを付け、Open Design をインストールして、プロンプトを、すでに使っているエージェントの中で、ブランドに沿ったグラフィックに変えましょう。',
  },
  video: {
    title: 'Open Design + Claude Code でモーショングラフィックとショート動画を生成する',
    description:
      'スクリプトを、アニメーションフレームとショート動画に変えます — タイトルカード、モーション背景、アウトロが、あなたのブランドシステムで構成され、HTML からレンダリングされます。モーショングラフィックスイートも、タイムラインのスクラブも不要です。',
    breadcrumb: '動画',
    label: 'ユースケース · 動画',
    heading: 'タイムラインではなく、スクリプトからモーショングラフィックを',
    lead: '欲しい瞬間を説明します — タイトルの登場、データのアニメーション、ロゴのアウトロ。Open Design があなたのブランドシステムでアニメーションフレームを構成し、動画にレンダリングします。モーショングラフィックスイートは要りません。',
    heroImageAlt:
      'スクリプトが、アニメーションする動画フレームの連なりに変わるエディトリアルなイラスト',
    tldrTitle: '一言で言うと',
    tldrBody:
      'Open Design はスクリプトを、エージェントがショート動画にレンダリングする、アニメーションするブランドに沿ったフレームに変えます。HTML から構成され、リポジトリでバージョン管理され、習得すべきタイムラインエディターはありません。',
    stepsTitle: 'Open Design でのモーションの流れ',
    steps: [
      {
        title: '瞬間を説明する',
        body: '何が起きるべきかを伝えます。「グリッチのタイトルが我々のロゴに解決し、その後に締めのカード」のように。エージェントがモーションスキルを読み込み、静止画ではなくアニメーションフレームを生み出します。',
        imageAlt: 'モーションシーケンスを説明する人物のイラスト',
      },
      {
        title: 'ブランドとモーションのスタイルを適用する',
        body: 'Open Design がフレームテンプレートを供給します — 映画的なライトリーク、グリッチのタイトル、ロゴのアウトロ — そしてあなたの色と文字組みを適用するので、モーションは意図的でブランドに沿って見えます。',
        imageAlt: 'ブランドのスタイリングがアニメーションフレームに適用されるイラスト',
      },
      {
        title: 'フレームを動画にレンダリングする',
        body: 'フレームは HTML で構成され動画にレンダリングされるので、タイミングとレイアウトが正確で繰り返し可能です — タイムライン上での手動キーフレームはありません。',
        imageAlt: 'HTML フレームが動画クリップにレンダリングされるイラスト',
      },
      {
        title: '反復してエクスポートする',
        body: 'エージェントと話して磨きます。「タイトルの登場を遅くして、キャプションを加えて」のように。ソーシャルやプロダクト向けにショートクリップをエクスポートします。ソースはプロジェクト内に残ります。',
        imageAlt: '動画クリップが磨かれ、ソーシャル向けにエクスポートされるイラスト',
      },
    ],
    tableTitle: 'Open Design でのモーション vs これまでのやり方',
    tableColCapability: '必要なこと',
    tableColWithOd: 'Open Design なら',
    tableColWithout: 'After Effects / モーションスイート',
    tableRows: [
      {
        capability: 'スクリプトからアニメーションフレームへ',
        withOd: '一つのプロンプト。エージェントがシーケンスを構成',
        without: '各要素をタイムライン上で手でキーフレームする',
      },
      {
        capability: 'ブランドを保つ',
        withOd: 'フレームテンプレート + あなたの色と文字組み',
        without: 'プロジェクトごとにブランドスタイリングを作り直す',
      },
      {
        capability: '正確で繰り返し可能なタイミング',
        withOd: 'HTML で構成され、決定論的にレンダリング',
        without: '手動スクラブ、再現が難しい',
      },
      {
        capability: 'ソーシャル向けエクスポート',
        withOd: '動画にレンダリングされたショートクリップ',
        without: 'エクスポートプリセットとコーデックとの格闘',
      },
      {
        capability: 'レビューとバージョン管理',
        withOd: 'フレームソースがリポジトリ内にあり、差分が取れる',
        without: 'バイナリのプロジェクトファイル、本当の差分が取れない',
      },
      {
        capability: 'コストとロックイン',
        withOd: 'オープンソース、自分の鍵を持ち込み、ローカルで動作',
        without: '高価なスイート、急な学習曲線',
      },
    ],
    featuresTitle: 'アニメーションにできるもの',
    features: [
      { title: "Hyperframes", body: "HTML から構成されたフレームごとのモーションシーケンス。", thumb: "example-video-hyperframes" },
      { title: "ショート向けソーシャル", body: "ソーシャルフィード向けに作られた縦型クリップ。", thumb: "example-video-shortform" },
      { title: "モーションフレームセット", body: "クリップに組み立てる再利用可能なアニメーションフレーム。", thumb: "example-motion-frames" },
      { title: "映画的なライトリーク", body: "フィルム的なトランジションと雰囲気のある背景。", thumb: "example-frame-light-leak-cinema" },
      { title: "グリッチタイトル", body: "モーションとテクスチャを伴うタイトルの登場。", thumb: "example-frame-glitch-title" },
      { title: "ロゴアウトロ", body: "どんなクリップにも合うブランドの締めアニメーション。", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Open Design で作られたモーション',
    galleryLead:
      'プロンプトからレンダリングされた本物のアニメーションフレームとクリップ。アイデアに近いものを選び、モーションを説明してください。',
    gallery: [
      { thumb: "example-hyperframes", caption: "Hyperframes のシーケンス" },
      { thumb: "example-frame-liquid-bg-hero", caption: "リキッドなモーション背景" },
      { thumb: "example-frame-macos-notification", caption: "アニメーションする UI フレーム" },
      { thumb: "example-frame-data-chart-nyt", caption: "アニメーションするデータチャート" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'モーションテンプレートを見る',
    faqTitle: '動画 FAQ',
    faq: [
      {
        q: 'After Effects やモーショングラフィックスイートは必要ですか？',
        a: 'いいえ。Open Design はコーディングエージェントの中でアニメーションフレームを HTML で構成し、動画にレンダリングします。習得やライセンスが必要なタイムラインエディターはありません。',
      },
      {
        q: 'これはどんな種類の動画に向いていますか？',
        a: 'ショート向けのモーション — タイトルカード、データアニメーション、ロゴアウトロ、ソーシャルクリップ。長尺の編集ではなく、ブランドとプロダクトのモーション向けに作られています。',
      },
      {
        q: 'タイミングは再現可能ですか？',
        a: 'はい。フレームはコードで構成され決定論的にレンダリングされるので、毎回同じ結果が得られ、プロンプトで正確に微調整できます。',
      },
      {
        q: 'どのエージェントを使えますか？',
        a: 'Claude Code、Codex、Cursor Agent、Gemini CLI、その他のファーストパーティアダプター。プロバイダーの鍵は自分で持ち込みます。',
      },
    ],
    ctaTitle: '次のアイデアを今夜アニメーションに',
    ctaBody:
      'リポジトリにスターを付け、Open Design をインストールして、スクリプトを、すでに使っているエージェントの中で、モーションに変えましょう。',
  },
  designSystem: {
    title: 'Open Design + Claude Code でデザインシステムを構築し適用する',
    description:
      'ブランドを、コーディングエージェントがあらゆる成果物に適用する再利用可能なデザインシステムとして捉えます — 色、文字組み、コンポーネント、トーンを一つの DESIGN.md に。一度定義すれば、どのプロトタイプ、資料、ダッシュボードもブランドに沿ったままです。',
    breadcrumb: 'デザインシステム',
    label: 'ユースケース · デザインシステム',
    heading: '一つのデザインシステムを、エージェントが作るすべてに適用',
    lead: 'ブランドを一度定義すれば、Open Design がそれをすべての出力に持ち込みます — プロトタイプ、資料、ダッシュボード、グラフィック。システムはエージェントが読む DESIGN.md としてリポジトリ内にあるので、一貫性は手作業ではなく自動です。',
    heroImageAlt:
      '一つのデザインシステムが、多くのブランドに沿った成果物へと放射状に広がるエディトリアルなイラスト',
    tldrTitle: '一言で言うと',
    tldrBody:
      'Open Design はブランドを、エージェントがあらゆる成果物に適用する持ち運び可能なデザインシステムとして捉えます — リポジトリ内で一度定義し、どこでも強制され、それを管理する中央のデザインツールはありません。',
    stepsTitle: 'Open Design でのデザインシステムの流れ',
    steps: [
      {
        title: 'システムを捉える',
        body: 'ブランドを説明します — 色、文字組み、余白、声 — または既存のサイトをエージェントに指して抽出させます。Open Design がそれをプロジェクト内にある DESIGN.md に書き込みます。',
        imageAlt: 'ブランドが一つのデザインシステムファイルに捉えられるイラスト',
      },
      {
        title: '実証済みのベースから始める',
        body: 'Open Design は140以上の参照デザインシステムを備えています — Apple や Linear からエディトリアル、ブルータリストまで。白紙から始めるのではなく、自分のブランドに近いものをフォークしましょう。',
        imageAlt: '参照デザインシステムのギャラリーが閲覧されるイラスト',
      },
      {
        title: 'どこにでも適用する',
        body: '他のすべてのスキルが同じシステムを読むので、プロトタイプも、資料も、ダッシュボードも、一つのビジュアル言語を共有します — 毎回それを指定し直すことなく。',
        imageAlt: '一つのシステムが多くの成果物タイプに一貫して適用されるイラスト',
      },
      {
        title: '一か所で進化させる',
        body: 'システムを変えれば、次のレンダリングがそれをどこでも反映します。リポジトリ内のファイルなので、デザインの判断はコードのようにレビューされバージョン管理されます。',
        imageAlt: 'デザインシステムが更新され、すべての出力に伝播するイラスト',
      },
    ],
    tableTitle: 'Open Design でのデザインシステム vs これまでのやり方',
    tableColCapability: '必要なこと',
    tableColWithOd: 'Open Design なら',
    tableColWithout: 'デザインツールのライブラリ / スタイルガイド',
    tableRows: [
      {
        capability: 'システムを定義する',
        withOd: 'エージェントが読む DESIGN.md、140以上の参照からフォーク',
        without: '静的なスタイルガイドか、ツールに縛られたライブラリ',
      },
      {
        capability: '成果物タイプをまたいで適用する',
        withOd: '同じシステムがプロトタイプ、資料、ダッシュボード、グラフィックに供給',
        without: 'ツールごと、ファイルごとに実装し直す',
      },
      {
        capability: 'すべてを一貫させる',
        withOd: '自動 — すべてのスキルが一つの情報源を読む',
        without: '手作業の規律。時間とともにずれる',
      },
      {
        capability: 'ブランドを進化させる',
        withOd: '一度編集すれば、次のレンダリングがどこでも更新',
        without: 'ファイルとツールをまたいで探して置換',
      },
      {
        capability: 'レビューとバージョン管理',
        withOd: 'リポジトリ内にあり、コードのように差分が取れる',
        without: 'デザインツールに埋もれ、監査が難しい',
      },
      {
        capability: 'コストとロックイン',
        withOd: 'オープンソース、持ち運び可能、ローカルで動作',
        without: 'デザインツールのサブスクに縛られる',
      },
    ],
    featuresTitle: '始められるシステム',
    features: [
      { title: "Apple", body: "クリーンで抑制された、システムフォントの美学。", thumb: "design-system-apple" },
      { title: "Linear", body: "余白を詰めた、シャープなプロダクトツールの見た目。", thumb: "design-system-linear-app" },
      { title: "Notion", body: "柔らかく、文書を主役にした、親しみやすさ。", thumb: "design-system-notion" },
      { title: "Figma", body: "遊び心があり、カラフルで、クリエイティブツールのエネルギー。", thumb: "design-system-figma" },
      { title: "OpenAI", body: "ミニマルで、ニュートラルで、研究グレード。", thumb: "design-system-openai" },
      { title: "GitHub", body: "密度が高く、テクニカルで、開発者ネイティブ。", thumb: "design-system-github" },
    ],
    galleryTitle: 'Open Design のデザインシステム',
    galleryLead:
      '出発点としてフォークできる140以上の参照システムのほんの一部。自分のブランドに近いものを選び、適応させてください。',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Airbnb 風のシステム" },
      { thumb: "design-system-vercel", caption: "Vercel 風のシステム" },
      { thumb: "design-system-stripe", caption: "Stripe 風のシステム" },
      { thumb: "design-system-spotify", caption: "Spotify 風のシステム" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'デザインシステムを見る',
    faqTitle: 'デザインシステム FAQ',
    faq: [
      {
        q: 'ここで言うデザインシステムとは正確には何ですか？',
        a: '色、文字組み、余白、コンポーネント、声を捉えた、リポジトリ内の DESIGN.md ファイルです。Open Design のすべてのスキルがそれを読むので、あなたのブランドがエージェントの生み出すものに自動的に適用されます。',
      },
      {
        q: 'ゼロから始めなければなりませんか？',
        a: 'いいえ。Open Design はフォークできる140以上の参照デザインシステムを備えています — Apple や Linear からエディトリアル、ブルータリストまで — そこから自分のブランドに適応させます。',
      },
      {
        q: '資料、ダッシュボード、プロトタイプをまたいでどう一貫性を保つのですか？',
        a: 'それらのスキルがすべて同じ DESIGN.md を読むからです。システムを一度定義すれば、手で取り締まるものではなく、一貫性が自動になります。',
      },
      {
        q: 'どのエージェントを使えますか？',
        a: 'Claude Code、Codex、Cursor Agent、Gemini CLI、その他のファーストパーティアダプター。プロバイダーの鍵は自分で持ち込みます。',
      },
    ],
    ctaTitle: 'あなたのデザインシステムを今夜定義する',
    ctaBody:
      'リポジトリにスターを付け、Open Design をインストールして、すでに使っているエージェントに、どこにでも適用できる一つのブランドを与えましょう。',
  },
};

const KO: SolutionLocaleCopy = {
  prototype: {
    title: 'Open Design + Claude Code로 인터랙티브 프로토타입 만들기',
    description:
      '프롬프트 하나를, 터미널을 벗어나지 않고 클릭 가능한 멀티 스크린 프로토타입으로 바꿉니다. Open Design은 코딩 에이전트에게 디자인 기술, 템플릿, 디자인 시스템을 제공하여 브라우저에서 열 수 있는 진짜 프로토타입을 만들어 냅니다.',
    breadcrumb: '프로토타입',
    label: '활용 사례 · 프로토타입',
    heading: '프롬프트의 속도로 프로토타이핑',
    lead: '머릿속에 있는 플로우를 설명하기만 하면 에이전트가 진짜 클릭 가능한 프로토타입을 조립합니다 — 여러 화면, 공유된 스타일, 살아있는 인터랙션이 열고, 공유하고, 엔지니어링에 넘길 수 있는 HTML로 곧장 렌더링됩니다.',
    heroImageAlt:
      '손이 와이어프레임을 스케치하고 그것이 클릭 가능한 멀티 스크린 앱 프로토타입으로 바뀌는 모습을 그린 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      'Open Design은 이미 사용 중인 코딩 에이전트를 위한 디자인 레이어입니다. 프로토타이핑에서는 한 단락짜리 아이디어에서 탐색 가능하고 스타일이 잡힌 프로토타입까지 한 번의 세션으로 간다는 뜻입니다 — 디자인 도구도, 내보내기 단계도, 인계의 단절도 없이.',
    stepsTitle: 'Open Design에서 프로토타이핑이 작동하는 방식',
    steps: [
      {
        title: '플로우를 설명한다',
        body: '무엇을 만드는지 평범한 언어로 에이전트에게 말합니다 — "환영 화면, 요금제 선택, 확인 화면이 있는 온보딩 플로우"처럼. Open Design이 프로토타입 기술을 불러와 에이전트가 단일 페이지가 아니라 여러 화면을 만들어야 한다는 것을 알게 합니다.',
        imageAlt:
          '앱 플로우 설명을 평범한 언어로 터미널에 입력하는 사람의 일러스트',
      },
      {
        title: '스타일이 잡힌 화면을 생성한다',
        body: '에이전트는 Open Design의 디자인 시스템과 프로토타입 템플릿을 적용하므로 모든 화면이 타이포그래피, 여백, 컴포넌트를 공유하며 거친 초안처럼 보이지 않습니다. 동떨어진 목업이 아니라 일관된 화면 묶음을 얻습니다.',
        imageAlt:
          '여러 앱 화면이 차례로 나타나며 모두 하나의 일관된 비주얼 스타일을 공유하는 일러스트',
      },
      {
        title: '인터랙션을 연결한다',
        body: '버튼이 이동하고, 탭이 전환되고, 모달이 열립니다. 프로토타입은 자체 완결형 HTML로 렌더링되어 어떤 브라우저에서도 진짜처럼 동작합니다 — 보기 위해 프로토타이핑 도구 계정이 필요 없습니다.',
        imageAlt:
          '커서가 연결된 화면들을 클릭해 나가고 화살표가 화면 간 이동을 보여주는 일러스트',
      },
      {
        title: '반복하고 인계한다',
        body: '에이전트와 대화하며 다듬습니다 — "요금제 선택을 3열 레이아웃으로 만들어줘"처럼. 산출물이 프로젝트 안에 있기 때문에 디자인과 최종 코드가 하나의 진실 공급원을 공유하여, 흔한 디자이너-엔지니어 인계의 단절을 메웁니다.',
        imageAlt:
          '프로토타입이 수정된 뒤 엔지니어에게 넘겨지고, 디자인과 코드가 하나의 파일로 합쳐지는 일러스트',
      },
    ],
    tableTitle: 'Open Design 프로토타이핑 vs 기존 방식',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: '기존 프로토타이핑 도구',
    tableRows: [
      {
        capability: '아이디어에서 첫 화면으로',
        withOd: '이미 열어 둔 에이전트에 프롬프트 하나',
        without: '별도 도구를 열고, 파일을 시작하고, 박스를 손으로 드래그',
      },
      {
        capability: '연결된 여러 화면',
        withOd: '공유 스타일과 작동하는 내비게이션을 갖춘 한 세트로 생성',
        without: '각 프레임을 손으로 그리고 손으로 연결',
      },
      {
        capability: '일관된 비주얼 시스템',
        withOd: '에이전트가 적용하는 재사용 가능한 디자인 시스템에서 가져옴',
        without: '파일마다 다시 만들거나 손으로 유지',
      },
      {
        capability: '공유 가능한 결과물',
        withOd: '자체 완결형 HTML — 어떤 브라우저에서도 열림, 계정 불필요',
        without: '보는 사람에게 벤더 도구의 좌석이나 공유 링크가 필요',
      },
      {
        capability: '실제 코드로 가는 경로',
        withOd: '산출물이 리포지토리에 있고, 디자인과 코드가 하나의 원천을 공유',
        without: '별도 인계 후 처음부터 다시 제작',
      },
      {
        capability: '비용과 종속',
        withOd: '오픈소스, 자신의 키를 가져와 로컬에서 실행',
        without: '좌석당 구독, 벤더 호스팅, 내보내기 제한',
      },
    ],
    featuresTitle: '프로토타입으로 만들 수 있는 것',
    features: [
      {
        title: '멀티 스크린 웹 앱',
        body: '공유 내비게이션을 갖춘 완전한 플로우 — 온보딩, 대시보드, 설정 — 단일 페이지가 아니라.',
        thumb: 'example-web-prototype',
      },
      {
        title: '모바일 앱 플로우',
        body: '네이티브 같은 전환과 상태를 갖춘 화면별 모바일 여정.',
        thumb: 'example-mobile-app',
      },
      {
        title: '랜딩 페이지',
        body: '클릭해 보고 바로 출시할 수 있는 마케팅 페이지와 SaaS 랜딩.',
        thumb: 'example-saas-landing',
      },
      {
        title: '어떤 비주얼 취향이든',
        body: '에디토리얼, 소프트, 브루탈리스트 — 프로토타입이 처음부터 끝까지 일관된 스타일을 담습니다.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: '대기자 명단과 요금',
        body: '전환 화면 — 대기자 명단, 요금표 — 가 연결되고 브랜드에 맞게.',
        thumb: 'example-waitlist-page',
      },
      {
        title: '게임화되고 장난스러운',
        body: '모션과 상태가 피치의 일부가 되는, 인터랙션 중심의 콘셉트.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: '사람들이 Open Design으로 만든 프로토타입',
    galleryLead:
      '이 모두가 프롬프트로 시작해 클릭 가능한 산출물로 렌더링되었습니다. 아이디어에 가까운 템플릿을 고르고 변형을 설명하면 에이전트가 그것을 적응시킵니다.',
    gallery: [
      { thumb: "example-dating-web", caption: "데이팅 웹 앱 — 멀티 스크린 플로우" },
      { thumb: "example-hr-onboarding", caption: "인사 온보딩 플로우" },
      { thumb: "example-kami-landing", caption: "제품 랜딩 페이지" },
      { thumb: "example-web-prototype-taste-soft", caption: "소프트 스타일 웹 프로토타입" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '프로토타입 템플릿 둘러보기',
    faqTitle: '프로토타이핑 FAQ',
    faq: [
      {
        q: 'Open Design으로 프로토타이핑하려면 Figma 같은 디자인 도구가 필요한가요?',
        a: '아니요. Open Design은 코딩 에이전트 안에서 실행되며 프로토타입을 HTML로 렌더링합니다. 플로우를 언어로 설명하면 에이전트가 화면을 만들어 냅니다. 따로 배우거나 비용을 낼 캔버스 도구가 없습니다.',
      },
      {
        q: '프로토타입은 인터랙티브한가요, 아니면 그냥 정적 목업인가요?',
        a: '인터랙티브합니다. 출력이 진짜 HTML과 CSS이기 때문에 내비게이션, 탭, 모달이 작동합니다. 사용자와 똑같이 어떤 브라우저에서든 클릭해 볼 수 있습니다.',
      },
      {
        q: '어떤 에이전트를 쓸 수 있나요?',
        a: 'Open Design은 Claude Code, Codex, Cursor Agent, Gemini CLI 및 12종 이상의 퍼스트파티 어댑터와 함께 작동합니다. 자신의 프로바이더 키를 가져오며, 무엇도 대신 호스팅되지 않습니다.',
      },
      {
        q: '프로토타입이 실제 제품이 될 수 있나요?',
        a: '바로 그게 핵심입니다. 산출물이 프로젝트 안에 있으므로 같은 디자인 시스템과 컴포넌트가 인계 후 버려지는 대신 프로덕션 코드로 이어집니다.',
      },
    ],
    ctaTitle: '다음 아이디어를 오늘 밤 프로토타입으로',
    ctaBody:
      '리포지토리에 스타를 누르고 Open Design을 설치한 뒤, 다음 "만약에"를, 이미 사용 중인 에이전트 안에서 클릭할 수 있는 무언가로 바꿔 보세요.',
  },
  dashboard: {
    title: 'Open Design + Claude Code로 데이터 대시보드 생성하기',
    description:
      '추적하는 지표를 설명하기만 하면 코딩 에이전트가 스타일이 잡힌 반응형 대시보드를 만듭니다 — 차트, KPI 카드, 테이블이 어디에나 호스팅할 수 있는 HTML로 렌더링됩니다. BI 도구 좌석도, 드래그 앤 드롭 빌더도 없이.',
    breadcrumb: '대시보드',
    label: '활용 사례 · 대시보드',
    heading: '드래그 앤 드롭 빌더가 아니라, 설명에서 나오는 대시보드',
    lead: '무엇을 보여줄지, 어떤 느낌이어야 할지 에이전트에게 말하세요. Open Design이 차트 패턴, 레이아웃 시스템, 비주얼 언어를 제공하므로 기본 스타일 위젯의 벽이 아니라 일관되고 보여줄 만한 대시보드를 얻습니다.',
    heroImageAlt:
      '왼쪽의 원시 숫자가 오른쪽의 차트와 KPI 카드로 이루어진 깔끔한 대시보드로 흘러 들어가는 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      'Open Design은 지표를 평범한 언어로 적은 명세를, 에이전트가 HTML로 렌더링하는 스타일이 잡힌 대시보드로 바꿉니다 — 리포지토리에서 버전 관리되고, 어디에나 호스팅 가능하며, 좌석당 BI 구독이 없습니다.',
    stepsTitle: 'Open Design에서 대시보드가 작동하는 방식',
    steps: [
      {
        title: '지표를 설명한다',
        body: '중요한 것을 나열합니다 — "주간 활성 사용자, 요금제별 매출, 이탈률, 30일 추세"처럼. 에이전트가 대시보드 기술을 불러와 한 덩어리의 텍스트가 아니라 KPI 카드, 차트, 테이블을 배치해야 한다는 것을 압니다.',
        imageAlt: '자신이 중요하게 여기는 지표를 나열하는 사람의 일러스트',
      },
      {
        title: '차트 패턴을 고른다',
        body: 'Open Design은 차트와 레이아웃 템플릿을 제공하므로 추세는 선 차트로, 분해는 막대로, 비율은 알맞은 비주얼로 바뀝니다 — 어긋나는 기본값 대신 일관된 타이포그래피와 여백이 전체를 관통합니다.',
        imageAlt: '여러 차트 유형이 일관된 그리드로 배열된 일러스트',
      },
      {
        title: '데이터를 연결한다',
        body: '대시보드를 CSV나 JSON 엔드포인트로 향하게 하거나 샘플 행을 붙여넣습니다. 데이터가 바뀌면 갱신되는 자체 완결형 HTML로 렌더링되어 어떤 브라우저에서도 열리고 어떤 정적 호스트에도 올릴 수 있습니다.',
        imageAlt: '데이터 파일이 실시간 갱신 대시보드로 연결되는 일러스트',
      },
      {
        title: '다듬고 출시한다',
        body: '에이전트와 대화하며 조정합니다 — "매출을 지역별로 묶고 KPI 행을 맨 위로 옮겨"처럼. 산출물이 프로젝트 안에 있으므로 대시보드는 다른 코드처럼 검토되고 버전 관리됩니다.',
        imageAlt: '대시보드가 다듬어진 뒤 배포되는 일러스트',
      },
    ],
    tableTitle: 'Open Design 대시보드 vs 기존 방식',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: 'BI 도구 / 직접 코딩',
    tableRows: [
      {
        capability: '지표 목록에서 레이아웃으로',
        withOd: '프롬프트 하나로 에이전트가 카드, 차트, 테이블을 배치',
        without: '위젯을 하나씩 드래그하거나 차트 코드를 처음부터 작성',
      },
      {
        capability: '일관된 비주얼 시스템',
        withOd: '재사용 가능한 디자인 시스템에서 나온 차트 패턴과 여백',
        without: '기본 위젯 스타일이거나 차트마다 손으로 스타일링',
      },
      {
        capability: '데이터 연결',
        withOd: 'CSV / JSON / 붙여넣은 행을 실시간 HTML로 렌더링',
        without: '벤더 커넥터나 맞춤형 데이터 배관',
      },
      {
        capability: '호스팅과 공유',
        withOd: '어떤 정적 호스트에서도 동작하는 자체 완결형 HTML, 계정 불필요',
        without: '보는 사람에게 BI 벤더의 좌석이 필요',
      },
      {
        capability: '검토와 버전 관리',
        withOd: '리포지토리에 있어 코드처럼 diff 가능',
        without: '벤더 안에 갇혀 진짜 diff가 안 됨',
      },
      {
        capability: '비용과 종속',
        withOd: '오픈소스, 자신의 키를 가져와 로컬에서 실행',
        without: '좌석당 구독, 벤더 호스팅',
      },
    ],
    featuresTitle: '만들 수 있는 것',
    features: [
      { title: "제품 분석", body: "활성 사용자, 퍼널, 리텐션 — 제품 팀이 늘 들여다보는 지표.", thumb: "example-dashboard" },
      { title: "리포지토리와 개발 지표", body: "스타, PR, CI 상태 — 자신의 데이터로 만든 엔지니어링 대시보드.", thumb: "example-github-dashboard" },
      { title: "재무 리포트", body: "매출, 번, 런웨이를 공유 가능한 리포트로 배치.", thumb: "example-finance-report" },
      { title: "실시간 운영", body: "기반 데이터가 움직이는 대로 새로고침되는 실시간 지표.", thumb: "example-live-dashboard" },
      { title: "소셜과 마케팅", body: "채널 성과와 캠페인 추적을 한 화면에.", thumb: "example-social-media-dashboard" },
      { title: "도메인 리포트", body: "어떤 분야든 구조화된 리포트 — 임상부터 트레이딩까지.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: '사람들이 Open Design으로 만든 대시보드',
    galleryLead:
      '프롬프트와 데이터 소스로 렌더링된 진짜 대시보드. 자신에게 가까운 것에서 시작해 추적하는 지표를 설명하세요.',
    gallery: [
      { thumb: "example-data-report", caption: "데이터 리포트" },
      { thumb: "example-flowai-live-dashboard-template", caption: "실시간 운영 대시보드" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "트레이딩 분석 대시보드" },
      { thumb: "example-frame-data-chart-nyt", caption: "에디토리얼 데이터 차트" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '대시보드 템플릿 둘러보기',
    faqTitle: '대시보드 FAQ',
    faq: [
      {
        q: 'Tableau나 Looker 같은 BI 도구가 필요한가요?',
        a: '아니요. Open Design은 코딩 에이전트 안에서 대시보드를 HTML로 렌더링합니다. 지표를 설명하고 데이터로 향하게 하기만 하면 되고, 라이선스를 사거나 배워야 할 별도 BI 플랫폼이 없습니다.',
      },
      {
        q: '데이터는 어디서 오나요?',
        a: 'CSV, JSON 엔드포인트, 또는 붙여넣은 행에서. 대시보드는 평범한 HTML과 JavaScript이므로 어디서 읽어올지를 정확히 직접 제어합니다 — 호스팅된 서비스를 거치는 것은 없습니다.',
      },
      {
        q: '비기술 동료도 볼 수 있나요?',
        a: '네. 출력은 자체 완결형 웹 페이지입니다. 링크나 파일이 있는 누구나 브라우저에서 열 수 있습니다 — 계정도, 좌석도 필요 없습니다.',
      },
      {
        q: '어떤 에이전트를 쓸 수 있나요?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI 및 12종 이상의 퍼스트파티 어댑터. 자신의 프로바이더 키를 가져옵니다.',
      },
    ],
    ctaTitle: '오늘 밤 당신의 대시보드를 만드세요',
    ctaBody:
      '리포지토리에 스타를 누르고 Open Design을 설치한 뒤, 당신의 지표를, 이미 사용 중인 에이전트 안에서 어디에나 호스팅할 수 있는 대시보드로 바꿔 보세요.',
  },
  slides: {
    title: 'Open Design + Claude Code로 프레젠테이션 덱 생성하기',
    description:
      '아웃라인을, 프레젠테이션 앱을 열지 않고 디자인되고 브랜드에 맞는 슬라이드 덱으로 바꿉니다. Open Design은 코딩 에이전트에게 덱 템플릿과 비주얼 시스템을 주어, 발표하고 내보내고 공유할 수 있는 HTML로 슬라이드를 렌더링합니다.',
    breadcrumb: '슬라이드',
    label: '활용 사례 · 슬라이드',
    heading: '디자인된 듯 보이는 덱을, 프롬프트로 쓴다',
    lead: '에이전트에게 아웃라인과 톤을 건네세요. Open Design이 덱 템플릿과 비주얼 시스템을 적용하므로 모든 슬라이드가 레이아웃되고, 조판되고, 브랜드에 맞습니다 — 빈 배경 위의 글머리 기호 목록이 아니라.',
    heroImageAlt:
      '왼쪽의 아웃라인이 오른쪽의 디자인된 프레젠테이션 슬라이드 연속으로 바뀌는 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      'Open Design은 아웃라인을, 에이전트가 한 번의 세션으로 렌더링하는 디자인된 HTML 덱으로 바꿉니다 — 브라우저에서 발표하고, PDF나 PPTX로 내보내며, 소스는 리포지토리에 보관합니다.',
    stepsTitle: 'Open Design에서 덱이 작동하는 방식',
    steps: [
      {
        title: '아웃라인을 준다',
        body: '말할 요점이나 대략의 구조를 붙여넣습니다. 에이전트가 덱 기술을 불러와 한 편의 긴 문서가 아니라 레이아웃된 슬라이드의 연속을 만들어 냅니다.',
        imageAlt: '텍스트 아웃라인이 에이전트에게 건네지는 일러스트',
      },
      {
        title: '덱 스타일을 고른다',
        body: 'Open Design은 덱 템플릿을 제공합니다 — 에디토리얼, 스위스 인터내셔널, 다크 테크니컬 등. 에이전트가 하나를 적용해 타이포그래피, 그리드, 강조가 모든 슬라이드에서 일관되게 유지됩니다.',
        imageAlt: '여러 덱 스타일 선택지가 나란히 놓인 일러스트',
      },
      {
        title: '슬라이드를 생성한다',
        body: '각 요점이 알맞은 위계를 갖춘 디자인된 슬라이드가 됩니다 — 제목, 보조 비주얼, 데이터 강조. HTML로 렌더링되므로 어떤 브라우저에서도 전체 화면으로 발표됩니다.',
        imageAlt: '일관된 스타일링으로 완성된 슬라이드 연속의 일러스트',
      },
      {
        title: '발표하고, 내보내고, 반복한다',
        body: '브라우저에서 발표하거나 공유를 위해 PDF / PPTX로 내보냅니다. 에이전트와 대화하며 다듬습니다 — "데이터 슬라이드를 조이고 마무리 행동 유도를 추가해"처럼. 덱 소스는 프로젝트 안에 남습니다.',
        imageAlt: '덱이 발표되고 여러 형식으로 내보내지는 일러스트',
      },
    ],
    tableTitle: 'Open Design 덱 vs 기존 방식',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: 'PowerPoint / Keynote / AI 슬라이드 도구',
    tableRows: [
      {
        capability: '아웃라인에서 슬라이드로',
        withOd: '프롬프트 하나로 에이전트가 모든 슬라이드를 배치',
        without: '슬라이드를 일일이 손으로 만들거나 템플릿과 씨름',
      },
      {
        capability: '일관된 디자인',
        withOd: '진짜 그리드와 타입 시스템을 갖춘 덱 템플릿',
        without: '테마 흐트러짐, 수동 정렬, 브랜드 밖 기본값',
      },
      {
        capability: '데이터와 다이어그램',
        withOd: '슬라이드의 일부로 렌더링되는 차트와 강조',
        without: '정적 이미지를 붙이거나 매번 차트를 다시 제작',
      },
      {
        capability: '내보내기 형식',
        withOd: '발표용 HTML과 함께 PDF / PPTX 내보내기',
        without: '하나의 앱 형식에 묶임',
      },
      {
        capability: '검토와 버전 관리',
        withOd: '소스가 리포지토리에 있어 diff 가능',
        without: '바이너리 파일, 의미 있는 diff 불가',
      },
      {
        capability: '비용과 종속',
        withOd: '오픈소스, 자신의 키를 가져와 로컬에서 실행',
        without: '앱 라이선스나 좌석당 AI 추가 기능',
      },
    ],
    featuresTitle: '발표할 수 있는 것',
    features: [
      { title: "피치 덱", body: "강한 서사와 깔끔한 데이터 슬라이드를 갖춘 투자자·영업 덱.", thumb: "example-html-ppt-pitch-deck" },
      { title: "스위스 / 에디토리얼", body: "아트 디렉션된 듯 보이는, 그리드 주도의 타이포그래피 덱.", thumb: "example-deck-swiss-international" },
      { title: "코스 모듈", body: "명확한 단계, 강조, 호흡을 갖춘 교육 덱.", thumb: "example-html-ppt-course-module" },
      { title: "데이터 그래프 덱", body: "분석과 리뷰를 위한 다크하고 차트 중심의 덱.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "발표자 모드", body: "브라우저에서 실시간 발표하도록 만든 Reveal 스타일 덱.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "기술 블루프린트", body: "복잡한 시스템을 그려내는 아키텍처와 지식 덱.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: '사람들이 Open Design으로 만든 덱',
    galleryLead:
      '아웃라인으로 렌더링된 진짜 덱. 당신의 발표에 가까운 스타일을 고르고 내용을 설명하세요.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "에디토리얼 매거진 덱" },
      { thumb: "example-guizang-ppt", caption: "일러스트 키노트" },
      { thumb: "example-deck-open-slide-canvas", caption: "오픈 슬라이드 캔버스 덱" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "그라데이션 테마 덱" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '덱 템플릿 둘러보기',
    faqTitle: '슬라이드 FAQ',
    faq: [
      {
        q: 'PowerPoint나 Keynote가 필요한가요?',
        a: '아니요. Open Design은 코딩 에이전트 안에서 덱을 HTML로 렌더링하며 PDF나 PPTX로 내보낼 수 있습니다. 브라우저에서 발표하거나 파일을 넘기면 되고, 만들기 위해 프레젠테이션 앱이 필요 없습니다.',
      },
      {
        q: '이건 그냥 AI가 만든 글머리 기호 아닌가요?',
        a: '아니요. 에이전트는 그리드, 타입 스케일, 비주얼 위계를 갖춘 진짜 덱 템플릿을 적용하므로 슬라이드가 자동 채워진 것이 아니라 디자인된 듯 보입니다.',
      },
      {
        q: '클라이언트를 위해 PowerPoint로 내보낼 수 있나요?',
        a: '네. 덱은 발표하는 HTML 외에 PPTX와 PDF로도 내보내지므로 청중이 기대하는 어떤 형식에도 맞출 수 있습니다.',
      },
      {
        q: '어떤 에이전트를 쓸 수 있나요?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI 및 그 밖의 퍼스트파티 어댑터. 자신의 프로바이더 키와 함께.',
      },
    ],
    ctaTitle: '다음 덱을 오늘 밤 만드세요',
    ctaBody:
      '리포지토리에 스타를 누르고 Open Design을 설치한 뒤, 당신의 아웃라인을, 이미 사용 중인 에이전트 안에서 디자인된 덱으로 바꿔 보세요.',
  },
  image: {
    title: 'Open Design + Claude Code로 브랜드에 맞는 그래픽 생성하기',
    description:
      '소셜 카드, 아티클 커버, 마케팅 그래픽을 프롬프트에서 만들어 냅니다 — 진짜 타이포그래피와 브랜드 시스템으로 레이아웃되고, PNG로 내보낼 수 있는 선명한 HTML로 렌더링됩니다. 디자인 앱도, 템플릿 구독도 없이.',
    breadcrumb: '이미지',
    label: '활용 사례 · 이미지',
    heading: '브랜드에 맞는 그래픽을, 생성하고 레이아웃까지',
    lead: '필요한 카드나 커버를 설명하세요. Open Design이 진짜 타입, 그리드, 브랜드 컬러로 구성한 뒤 이미지로 내보낼 수 있는 HTML로 렌더링합니다 — 디자인 앱과 씨름하거나 평범한 템플릿을 쓰는 대신.',
    heroImageAlt:
      '프롬프트가 레이아웃된 소셜 카드와 아티클 커버 한 세트로 바뀌는 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      'Open Design은 프롬프트를, 에이전트가 HTML로 렌더링해 PNG로 내보내는 조판되고 브랜드에 맞는 그래픽으로 바꿉니다 — 반복 가능하고, 버전 관리되며, 좌석당 디자인 도구에서 자유롭습니다.',
    stepsTitle: 'Open Design에서 그래픽이 작동하는 방식',
    steps: [
      {
        title: '그래픽을 설명한다',
        body: '무엇인지 말합니다 — "헤드라인과 인용이 들어간 우리 런칭용 트위터 카드"처럼. 에이전트가 알맞은 기술을 불러와 평범한 텍스트 블록이 아니라 레이아웃된 그래픽을 구성합니다.',
        imageAlt: '필요한 소셜 카드를 설명하는 사람의 일러스트',
      },
      {
        title: '브랜드 시스템을 적용한다',
        body: 'Open Design이 재사용 가능한 디자인 시스템에서 당신의 컬러, 타입, 여백을 가져오므로 모든 카드가 일회성처럼 보이는 대신 브랜드의 나머지와 어울립니다.',
        imageAlt: '브랜드 컬러와 타입이 카드 레이아웃에 적용되는 일러스트',
      },
      {
        title: '렌더링하고 내보낸다',
        body: '그래픽은 필요한 정확한 치수로 HTML에 렌더링됩니다 — 소셜 카드, 커버, 배너 — 그리고 PNG로 내보냅니다. 선명한 텍스트, 진짜 레이아웃, 수동 미세 조정 없음.',
        imageAlt: '그래픽이 렌더링되어 이미지 파일로 내보내지는 일러스트',
      },
      {
        title: '레시피를 재사용한다',
        body: '템플릿이기 때문에 다음 그래픽은 프롬프트 하나 거리입니다 — 헤드라인만 바꾸고 레이아웃은 그대로. 카드 시리즈가 완벽하게 일관됩니다.',
        imageAlt: '하나의 카드 템플릿이 일관된 그래픽 시리즈를 만들어 내는 일러스트',
      },
    ],
    tableTitle: 'Open Design 그래픽 vs 기존 방식',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: '디자인 앱 / 평범한 템플릿',
    tableRows: [
      {
        capability: '아이디어에서 레이아웃된 그래픽으로',
        withOd: '프롬프트 하나로 에이전트가 타입과 레이아웃을 구성',
        without: '앱을 열고 모든 요소를 손으로 배치',
      },
      {
        capability: '브랜드를 유지',
        withOd: '재사용 가능한 디자인 시스템에서 나온 컬러와 타입',
        without: '파일마다 브랜드 스타일을 다시 고르거나 브랜드에서 벗어남',
      },
      {
        capability: '일관된 시리즈',
        withOd: '같은 템플릿, 새 카피 — 완벽하게 정렬된 세트',
        without: '각 변형을 손으로 다시 정렬',
      },
      {
        capability: '내보내기',
        withOd: '정확한 치수의 HTML을 PNG로 내보냄',
        without: '수동 캔버스 크기 조정과 내보내기 설정',
      },
      {
        capability: '반복 가능',
        withOd: '리포지토리 안의 프롬프트 주도 레시피',
        without: '매번 다시 만드는 일회성 파일',
      },
      {
        capability: '비용과 종속',
        withOd: '오픈소스, 자신의 키를 가져와 로컬에서 실행',
        without: '좌석당 디자인 도구나 템플릿 마켓플레이스',
      },
    ],
    featuresTitle: '만들 수 있는 것',
    features: [
      { title: "소셜 카드", body: "당신의 헤드라인과 브랜드로 구성된 X / Twitter 카드.", thumb: "example-card-twitter" },
      { title: "아티클 커버", body: "글과 뉴스레터를 위한 에디토리얼 매거진 스타일 커버.", thumb: "example-article-magazine" },
      { title: "Xiaohongshu 카드", body: "그 피드에 맞춰 조정된 RedNote 스타일 카드.", thumb: "example-card-xiaohongshu" },
      { title: "히어로 그래픽", body: "사이트와 런칭을 위한 리퀴드, 그라데이션 히어로 비주얼.", thumb: "example-frame-liquid-bg-hero" },
      { title: "캐러셀", body: "프레임 간 일관성을 유지하는 다중 슬라이드 소셜 캐러셀.", thumb: "example-social-carousel" },
      { title: "UI 목 프레임", body: "제품 스토리텔링을 위한 알림과 기기 프레임.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: '사람들이 Open Design으로 만든 그래픽',
    galleryLead:
      '프롬프트로 렌더링된 진짜 카드와 커버. 필요한 것에 가까운 하나를 골라 당신의 카피로 바꿔 넣으세요.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "파스텔 소셜 카드" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "에디토리얼 삼색 포스터" },
      { thumb: "example-magazine-poster", caption: "매거진 스타일 포스터" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "대담한 에디토리얼 커버" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '그래픽 템플릿 둘러보기',
    faqTitle: '이미지 FAQ',
    faq: [
      {
        q: '이건 Midjourney 같은 AI 이미지 생성기인가요?',
        a: '아니요. Open Design은 진짜 레이아웃과 타이포그래피로 그래픽을 구성합니다 — 당신의 헤드라인, 당신의 브랜드, 정확한 치수로 — 그리고 PNG로 내보내는 HTML로 렌더링합니다. 픽셀 생성이 아니라 디자인 구성입니다.',
      },
      {
        q: '일관된 카드 시리즈를 만들 수 있나요?',
        a: '네. 각 그래픽이 템플릿이기 때문에 레이아웃을 유지하고 카피를 바꾸면 시리즈 전체가 완벽하게 정렬되고 브랜드에 맞게 유지됩니다.',
      },
      {
        q: '어떤 크기를 만들 수 있나요?',
        a: '어떤 크기든. 그래픽은 지정한 정확한 치수로 렌더링되며, 정사각형 소셜 카드부터 넓은 배너까지 대응한 뒤 PNG로 내보냅니다.',
      },
      {
        q: '어떤 에이전트를 쓸 수 있나요?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI 및 그 밖의 퍼스트파티 어댑터. 자신의 프로바이더 키와 함께.',
      },
    ],
    ctaTitle: '다음 그래픽을 오늘 밤 만드세요',
    ctaBody:
      '리포지토리에 스타를 누르고 Open Design을 설치한 뒤, 프롬프트를, 이미 사용 중인 에이전트 안에서 브랜드에 맞는 그래픽으로 바꿔 보세요.',
  },
  video: {
    title: 'Open Design + Claude Code로 모션 그래픽과 숏폼 영상 생성하기',
    description:
      '스크립트를, 애니메이션 프레임과 숏폼 영상으로 바꿉니다 — 타이틀 카드, 모션 배경, 아웃트로가 당신의 브랜드 시스템으로 구성되고 HTML에서 렌더링됩니다. 모션 그래픽 스위트도, 타임라인 스크러빙도 없이.',
    breadcrumb: '영상',
    label: '활용 사례 · 영상',
    heading: '타임라인이 아니라, 스크립트에서 나오는 모션 그래픽',
    lead: '원하는 순간을 설명하세요 — 타이틀 등장, 데이터 애니메이션, 로고 아웃트로. Open Design이 당신의 브랜드 시스템으로 애니메이션 프레임을 구성해 영상으로 렌더링합니다 — 모션 그래픽 스위트가 필요 없습니다.',
    heroImageAlt:
      '스크립트가 애니메이션되는 영상 프레임의 연속으로 바뀌는 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      'Open Design은 스크립트를, 에이전트가 숏폼 영상으로 렌더링하는 애니메이션되고 브랜드에 맞는 프레임으로 바꿉니다 — HTML로 구성되고, 리포지토리에서 버전 관리되며, 배워야 할 타임라인 에디터가 없습니다.',
    stepsTitle: 'Open Design에서 모션이 작동하는 방식',
    steps: [
      {
        title: '순간을 설명한다',
        body: '무엇이 일어나야 하는지 말합니다 — "글리치 타이틀이 우리 로고로 해소된 뒤 마무리 카드"처럼. 에이전트가 모션 기술을 불러와 정적 이미지가 아니라 애니메이션 프레임을 만들어 냅니다.',
        imageAlt: '모션 시퀀스를 설명하는 사람의 일러스트',
      },
      {
        title: '브랜드와 모션 스타일을 적용한다',
        body: 'Open Design이 프레임 템플릿을 제공합니다 — 시네마틱 라이트 릭, 글리치 타이틀, 로고 아웃트로 — 그리고 당신의 컬러와 타입을 적용하므로 모션이 의도적이고 브랜드에 맞게 보입니다.',
        imageAlt: '브랜드 스타일링이 애니메이션 프레임에 적용되는 일러스트',
      },
      {
        title: '프레임을 영상으로 렌더링한다',
        body: '프레임은 HTML로 구성되어 영상으로 렌더링되므로 타이밍과 레이아웃이 정밀하고 반복 가능합니다 — 타임라인에서의 수동 키프레이밍이 없습니다.',
        imageAlt: 'HTML 프레임이 영상 클립으로 렌더링되는 일러스트',
      },
      {
        title: '반복하고 내보낸다',
        body: '에이전트와 대화하며 다듬습니다 — "타이틀 등장을 늦추고 자막을 추가해"처럼. 소셜이나 제품용 숏폼 클립을 내보냅니다. 소스는 프로젝트 안에 남습니다.',
        imageAlt: '영상 클립이 다듬어지고 소셜용으로 내보내지는 일러스트',
      },
    ],
    tableTitle: 'Open Design 모션 vs 기존 방식',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: 'After Effects / 모션 스위트',
    tableRows: [
      {
        capability: '스크립트에서 애니메이션 프레임으로',
        withOd: '프롬프트 하나로 에이전트가 시퀀스를 구성',
        without: '각 요소를 타임라인에서 손으로 키프레임',
      },
      {
        capability: '브랜드를 유지',
        withOd: '프레임 템플릿 + 당신의 컬러와 타입',
        without: '프로젝트마다 브랜드 스타일링을 다시 제작',
      },
      {
        capability: '정밀하고 반복 가능한 타이밍',
        withOd: 'HTML로 구성되어 결정론적으로 렌더링',
        without: '수동 스크러빙, 재현이 어려움',
      },
      {
        capability: '소셜용 내보내기',
        withOd: '영상으로 렌더링된 숏폼 클립',
        without: '내보내기 프리셋과 코덱 씨름',
      },
      {
        capability: '검토와 버전 관리',
        withOd: '프레임 소스가 리포지토리에 있어 diff 가능',
        without: '바이너리 프로젝트 파일, 진짜 diff 불가',
      },
      {
        capability: '비용과 종속',
        withOd: '오픈소스, 자신의 키를 가져와 로컬에서 실행',
        without: '비싼 스위트, 가파른 학습 곡선',
      },
    ],
    featuresTitle: '애니메이션할 수 있는 것',
    features: [
      { title: "Hyperframes", body: "HTML로 구성된 프레임별 모션 시퀀스.", thumb: "example-video-hyperframes" },
      { title: "숏폼 소셜", body: "소셜 피드를 위해 만든 세로형 클립.", thumb: "example-video-shortform" },
      { title: "모션 프레임 세트", body: "클립으로 구성하는 재사용 가능한 애니메이션 프레임.", thumb: "example-motion-frames" },
      { title: "시네마틱 라이트 릭", body: "필름 같은 전환과 분위기 있는 배경.", thumb: "example-frame-light-leak-cinema" },
      { title: "글리치 타이틀", body: "모션과 텍스처가 있는 타이틀 등장.", thumb: "example-frame-glitch-title" },
      { title: "로고 아웃트로", body: "어떤 클립에도 어울리는 브랜드 마무리 애니메이션.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: '사람들이 Open Design으로 만든 모션',
    galleryLead:
      '프롬프트로 렌더링된 진짜 애니메이션 프레임과 클립. 아이디어에 가까운 하나를 골라 모션을 설명하세요.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Hyperframes 시퀀스" },
      { thumb: "example-frame-liquid-bg-hero", caption: "리퀴드 모션 배경" },
      { thumb: "example-frame-macos-notification", caption: "애니메이션 UI 프레임" },
      { thumb: "example-frame-data-chart-nyt", caption: "애니메이션 데이터 차트" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '모션 템플릿 둘러보기',
    faqTitle: '영상 FAQ',
    faq: [
      {
        q: 'After Effects나 모션 그래픽 스위트가 필요한가요?',
        a: '아니요. Open Design은 코딩 에이전트 안에서 애니메이션 프레임을 HTML로 구성하고 영상으로 렌더링합니다. 배우거나 라이선스를 살 타임라인 에디터가 없습니다.',
      },
      {
        q: '이건 어떤 종류의 영상에 적합한가요?',
        a: '숏폼 모션 — 타이틀 카드, 데이터 애니메이션, 로고 아웃트로, 소셜 클립. 장편 편집이 아니라 브랜드와 제품 모션을 위해 만들어졌습니다.',
      },
      {
        q: '타이밍은 재현 가능한가요?',
        a: '네. 프레임이 코드로 구성되어 결정론적으로 렌더링되므로 매번 같은 결과를 얻고 프롬프트로 정밀하게 조정할 수 있습니다.',
      },
      {
        q: '어떤 에이전트를 쓸 수 있나요?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI 및 그 밖의 퍼스트파티 어댑터. 자신의 프로바이더 키와 함께.',
      },
    ],
    ctaTitle: '다음 아이디어를 오늘 밤 모션으로',
    ctaBody:
      '리포지토리에 스타를 누르고 Open Design을 설치한 뒤, 스크립트를, 이미 사용 중인 에이전트 안에서 모션으로 바꿔 보세요.',
  },
  designSystem: {
    title: 'Open Design + Claude Code로 디자인 시스템 구축하고 적용하기',
    description:
      '브랜드를, 코딩 에이전트가 모든 산출물에 적용하는 재사용 가능한 디자인 시스템으로 담아냅니다 — 컬러, 타입, 컴포넌트, 톤을 하나의 DESIGN.md에. 한 번 정의하면 모든 프로토타입, 덱, 대시보드가 브랜드에 맞게 유지됩니다.',
    breadcrumb: '디자인 시스템',
    label: '활용 사례 · 디자인 시스템',
    heading: '하나의 디자인 시스템을, 에이전트가 만드는 모든 것에 적용',
    lead: '브랜드를 한 번 정의하면 Open Design이 그것을 모든 출력으로 가져갑니다 — 프로토타입, 덱, 대시보드, 그래픽. 시스템은 에이전트가 읽는 DESIGN.md로 리포지토리에 있으므로 일관성은 수동이 아니라 자동입니다.',
    heroImageAlt:
      '하나의 디자인 시스템이 브랜드에 맞는 여러 산출물로 방사형으로 퍼져 나가는 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      'Open Design은 브랜드를, 에이전트가 모든 산출물에 적용하는 이식 가능한 디자인 시스템으로 담아냅니다 — 리포지토리에서 한 번 정의하고, 어디서나 강제되며, 그것을 통제하는 중앙 디자인 도구가 없습니다.',
    stepsTitle: 'Open Design에서 디자인 시스템이 작동하는 방식',
    steps: [
      {
        title: '시스템을 담아낸다',
        body: '브랜드를 설명합니다 — 컬러, 타입, 여백, 보이스 — 또는 기존 사이트를 에이전트에게 가리켜 추출하게 합니다. Open Design이 그것을 프로젝트 안에 있는 DESIGN.md에 적습니다.',
        imageAlt: '브랜드가 하나의 디자인 시스템 파일로 담기는 일러스트',
      },
      {
        title: '검증된 기반에서 시작한다',
        body: 'Open Design은 140개 이상의 참조 디자인 시스템을 제공합니다 — Apple과 Linear부터 에디토리얼, 브루탈리스트까지. 빈 페이지에서 시작하는 대신 당신의 브랜드에 가까운 것을 포크하세요.',
        imageAlt: '참조 디자인 시스템 갤러리를 둘러보는 일러스트',
      },
      {
        title: '어디에나 적용한다',
        body: '다른 모든 기술이 같은 시스템을 읽으므로 프로토타입, 덱, 대시보드가 모두 하나의 비주얼 언어를 공유합니다 — 매번 다시 지정하지 않고도.',
        imageAlt: '하나의 시스템이 여러 산출물 유형에 일관되게 적용되는 일러스트',
      },
      {
        title: '한곳에서 진화시킨다',
        body: '시스템을 바꾸면 다음 렌더링이 그것을 어디서나 반영합니다. 리포지토리 안의 파일이기 때문에 디자인 결정이 코드처럼 검토되고 버전 관리됩니다.',
        imageAlt: '디자인 시스템이 갱신되어 모든 출력으로 전파되는 일러스트',
      },
    ],
    tableTitle: 'Open Design 디자인 시스템 vs 기존 방식',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: '디자인 도구 라이브러리 / 스타일 가이드',
    tableRows: [
      {
        capability: '시스템을 정의',
        withOd: '에이전트가 읽는 DESIGN.md, 140개 이상의 참조에서 포크',
        without: '정적 스타일 가이드나 도구에 묶인 라이브러리',
      },
      {
        capability: '산출물 유형을 넘나들며 적용',
        withOd: '같은 시스템이 프로토타입, 덱, 대시보드, 그래픽에 공급',
        without: '도구마다, 파일마다 다시 구현',
      },
      {
        capability: '모든 것을 일관되게 유지',
        withOd: '자동 — 모든 기술이 하나의 원천을 읽음',
        without: '수동 규율; 시간이 지나며 흐트러짐',
      },
      {
        capability: '브랜드를 진화',
        withOd: '한 번 편집하면 다음 렌더링이 어디서나 갱신',
        without: '파일과 도구를 넘나들며 찾아 바꾸기',
      },
      {
        capability: '검토와 버전 관리',
        withOd: '리포지토리에 있어 코드처럼 diff 가능',
        without: '디자인 도구에 묻혀 감사가 어려움',
      },
      {
        capability: '비용과 종속',
        withOd: '오픈소스, 이식 가능, 로컬에서 실행',
        without: '디자인 도구 구독에 묶임',
      },
    ],
    featuresTitle: '시작할 수 있는 시스템',
    features: [
      { title: "Apple", body: "깔끔하고 절제된 시스템 폰트 미학.", thumb: "design-system-apple" },
      { title: "Linear", body: "여백을 좁힌 선명한 제품 도구 룩.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "부드럽고 문서 중심이며 다가가기 쉬운.", thumb: "design-system-notion" },
      { title: "Figma", body: "장난스럽고 컬러풀하며 창작 도구의 에너지.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "미니멀하고 중립적이며 연구급.", thumb: "design-system-openai" },
      { title: "GitHub", body: "밀도 높고 기술적이며 개발자 네이티브.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Open Design의 디자인 시스템',
    galleryLead:
      '출발점으로 포크할 수 있는 140개 이상의 참조 시스템 중 일부. 당신의 브랜드에 가까운 하나를 골라 적응시키세요.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Airbnb 스타일 시스템" },
      { thumb: "design-system-vercel", caption: "Vercel 스타일 시스템" },
      { thumb: "design-system-stripe", caption: "Stripe 스타일 시스템" },
      { thumb: "design-system-spotify", caption: "Spotify 스타일 시스템" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: '디자인 시스템 둘러보기',
    faqTitle: '디자인 시스템 FAQ',
    faq: [
      {
        q: '여기서 말하는 디자인 시스템이 정확히 무엇인가요?',
        a: '컬러, 타입, 여백, 컴포넌트, 보이스를 담은 리포지토리 안의 DESIGN.md 파일입니다. 모든 Open Design 기술이 그것을 읽으므로 당신의 브랜드가 에이전트가 만들어 내는 무엇에든 자동으로 적용됩니다.',
      },
      {
        q: '처음부터 시작해야 하나요?',
        a: '아니요. Open Design은 포크할 수 있는 140개 이상의 참조 디자인 시스템을 제공합니다 — Apple과 Linear부터 에디토리얼, 브루탈리스트까지 — 그런 다음 당신의 브랜드에 맞게 적응시킵니다.',
      },
      {
        q: '덱, 대시보드, 프로토타입을 넘나들며 어떻게 일관성을 유지하나요?',
        a: '그 모든 기술이 같은 DESIGN.md를 읽기 때문입니다. 시스템을 한 번 정의하면 손으로 단속하는 것이 아니라 일관성이 자동이 됩니다.',
      },
      {
        q: '어떤 에이전트를 쓸 수 있나요?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI 및 그 밖의 퍼스트파티 어댑터. 자신의 프로바이더 키와 함께.',
      },
    ],
    ctaTitle: '오늘 밤 당신의 디자인 시스템을 정의하세요',
    ctaBody:
      '리포지토리에 스타를 누르고 Open Design을 설치한 뒤, 이미 사용 중인 에이전트에게 어디에나 적용할 하나의 브랜드를 주세요.',
  },
};

const DE: SolutionLocaleCopy = {
  prototype: {
    title: 'Interaktive Prototypen mit Open Design + Claude Code bauen',
    description:
      'Verwandle einen Prompt in einen klickbaren Multi-Screen-Prototypen, ohne dein Terminal zu verlassen. Open Design gibt deinem Coding-Agent die Design-Fähigkeiten, Vorlagen und das Designsystem, um echte Prototypen auszuliefern, die du im Browser öffnen kannst.',
    breadcrumb: 'Prototyp',
    label: 'Anwendungsfall · Prototyp',
    heading: 'Prototyping im Tempo eines Prompts',
    lead: 'Beschreibe den Flow, den du im Kopf hast, und lass deinen Agent einen echten, klickbaren Prototypen zusammenbauen — mehrere Screens, gemeinsame Stile und lebendige Interaktionen — direkt als HTML gerendert, das du öffnen, teilen und an die Entwicklung übergeben kannst.',
    heroImageAlt:
      'Redaktionelle Illustration einer Hand, die ein Wireframe skizziert, das sich in einen klickbaren Multi-Screen-App-Prototypen verwandelt',
    tldrTitle: 'In einem Satz',
    tldrBody:
      'Open Design ist die Design-Ebene für den Coding-Agent, den du bereits nutzt. Fürs Prototyping heißt das: von einer Idee in einem Absatz zu einem navigierbaren, gestalteten Prototypen in einer einzigen Session — kein Design-Tool, kein Export-Schritt, keine Übergabelücke.',
    stepsTitle: 'So funktioniert Prototyping mit Open Design',
    steps: [
      {
        title: 'Beschreibe den Flow',
        body: 'Sag deinem Agent in klarer Sprache, was du baust — "ein Onboarding-Flow mit Willkommens-Screen, Tarifauswahl und Bestätigung." Open Design lädt die Prototyp-Fähigkeit, damit der Agent weiß, dass er Screens produzieren soll, nicht eine einzelne Seite.',
        imageAlt:
          'Illustration einer Person, die eine Beschreibung eines App-Flows in klarer Sprache in ein Terminal tippt',
      },
      {
        title: 'Generiere gestaltete Screens',
        body: 'Der Agent wendet ein Designsystem und Prototyp-Vorlagen von Open Design an, sodass jeder Screen Typografie, Abstände und Komponenten teilt, statt wie ein grober Entwurf auszusehen. Du bekommst ein zusammenhängendes Set von Screens, keine zusammenhanglosen Mockups.',
        imageAlt:
          'Illustration mehrerer App-Screens, die nacheinander erscheinen und alle einen einheitlichen visuellen Stil teilen',
      },
      {
        title: 'Verdrahte die Interaktionen',
        body: 'Buttons navigieren, Tabs wechseln, Modals öffnen sich. Der Prototyp wird als eigenständiges HTML gerendert und verhält sich daher in jedem Browser wie das echte Produkt — kein Prototyping-Tool-Konto nötig, um ihn anzusehen.',
        imageAlt:
          'Illustration eines Cursors, der sich durch verknüpfte Screens klickt, mit Pfeilen, die die Navigation dazwischen zeigen',
      },
      {
        title: 'Iteriere und übergib',
        body: 'Verfeinere im Gespräch mit dem Agent — "mach die Tarifauswahl zu einem dreispaltigen Layout." Da das Artefakt in deinem Projekt liegt, teilen Design und der spätere Code eine einzige Quelle der Wahrheit und schließen so die übliche Lücke zwischen Designer und Entwickler.',
        imageAlt:
          'Illustration eines Prototyps, der überarbeitet und dann an einen Entwickler übergeben wird, wobei Design und Code in einer Datei verschmelzen',
      },
    ],
    tableTitle: 'Prototyping mit Open Design vs. die alte Art',
    tableColCapability: 'Was du brauchst',
    tableColWithOd: 'Mit Open Design',
    tableColWithout: 'Klassische Prototyping-Tools',
    tableRows: [
      {
        capability: 'Von der Idee zum ersten Screen',
        withOd: 'Ein Prompt im Agent, den du ohnehin offen hast',
        without: 'Ein separates Tool öffnen, eine Datei anlegen, Boxen von Hand ziehen',
      },
      {
        capability: 'Mehrere verknüpfte Screens',
        withOd: 'Als Set generiert mit gemeinsamen Stilen und funktionierender Navigation',
        without: 'Jeder Frame von Hand gezeichnet und verknüpft',
      },
      {
        capability: 'Einheitliches visuelles System',
        withOd: 'Aus einem wiederverwendbaren Designsystem gezogen, das der Agent anwendet',
        without: 'Pro Datei neu erstellt oder von Hand gepflegt',
      },
      {
        capability: 'Teilbares Ergebnis',
        withOd: 'Eigenständiges HTML — öffnet sich in jedem Browser, kein Konto',
        without: 'Betrachter braucht einen Platz oder einen Freigabelink im Anbieter-Tool',
      },
      {
        capability: 'Weg zu echtem Code',
        withOd: 'Artefakt liegt in deinem Repo; Design und Code teilen eine Quelle',
        without: 'Nach separater Übergabe von Grund auf neu gebaut',
      },
      {
        capability: 'Kosten & Lock-in',
        withOd: 'Open Source, eigene Schlüssel mitbringen, läuft lokal',
        without: 'Abo pro Platz, anbietergehostet, exportbegrenzt',
      },
    ],
    featuresTitle: 'Was du prototypisieren kannst',
    features: [
      {
        title: 'Multi-Screen-Web-Apps',
        body: 'Vollständige Flows mit gemeinsamer Navigation — Onboarding, Dashboards, Einstellungen — keine Einzelseiten.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Mobile-App-Flows',
        body: 'Screen-für-Screen-Mobile-Journeys mit nativ wirkenden Übergängen und Zuständen.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Landingpages',
        body: 'Marketing-Seiten und SaaS-Landings, die du durchklicken und ausliefern kannst.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Jeder visuelle Geschmack',
        body: 'Redaktionell, weich oder brutalistisch — der Prototyp trägt einen durchgängigen Stil von Anfang bis Ende.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Warteliste & Preise',
        body: 'Conversion-Flächen — Wartelisten, Preistabellen — verdrahtet und markengerecht.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Gamifiziert & verspielt',
        body: 'Interaktionsstarke Konzepte, bei denen Bewegung und Zustand Teil des Pitches sind.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Prototypen, die Menschen mit Open Design gebaut haben',
    galleryLead:
      'Jeder davon begann als Prompt und wurde zu einem klickbaren Artefakt gerendert. Wähle eine Vorlage nahe deiner Idee, beschreibe deine Variante, und der Agent passt sie an.',
    gallery: [
      { thumb: "example-dating-web", caption: "Dating-Web-App — Multi-Screen-Flow" },
      { thumb: "example-hr-onboarding", caption: "HR-Onboarding-Flow" },
      { thumb: "example-kami-landing", caption: "Produkt-Landingpage" },
      { thumb: "example-web-prototype-taste-soft", caption: "Web-Prototyp im weichen Stil" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Prototyp-Vorlagen durchsuchen',
    faqTitle: 'Prototyping-FAQ',
    faq: [
      {
        q: 'Brauche ich ein Design-Tool wie Figma, um mit Open Design zu prototypisieren?',
        a: 'Nein. Open Design läuft in deinem Coding-Agent und rendert Prototypen als HTML. Du beschreibst den Flow in Sprache; der Agent produziert die Screens. Es gibt kein separates Canvas-Tool zu lernen oder zu bezahlen.',
      },
      {
        q: 'Sind die Prototypen interaktiv oder nur statische Mockups?',
        a: 'Interaktiv. Navigation, Tabs und Modals funktionieren, weil die Ausgabe echtes HTML und CSS ist. Du kannst dich in jedem Browser genau so durchklicken wie ein Nutzer.',
      },
      {
        q: 'Welche Agents kann ich nutzen?',
        a: 'Open Design funktioniert mit Claude Code, Codex, Cursor Agent, Gemini CLI und einem Dutzend weiterer hauseigener Adapter. Du bringst deine eigenen Anbieter-Schlüssel mit; nichts wird für dich gehostet.',
      },
      {
        q: 'Kann ein Prototyp zum echten Produkt werden?',
        a: 'Genau das ist der Sinn. Das Artefakt liegt in deinem Projekt, sodass dasselbe Designsystem und dieselben Komponenten in den Produktionscode übergehen, statt nach einer Übergabe weggeworfen zu werden.',
      },
    ],
    ctaTitle: 'Prototypisiere deine nächste Idee noch heute Abend',
    ctaBody:
      'Gib dem Repo einen Stern, installiere Open Design und verwandle dein nächstes "Was wäre wenn" in etwas Klickbares — im Agent, den du bereits nutzt.',
  },
  dashboard: {
    title: 'Daten-Dashboards mit Open Design + Claude Code erstellen',
    description:
      'Beschreibe die Kennzahlen, die du verfolgst, und lass deinen Coding-Agent ein gestaltetes, responsives Dashboard bauen — Diagramme, KPI-Karten und Tabellen, als HTML gerendert, das du überall hosten kannst. Kein BI-Tool-Platz, kein Drag-and-Drop-Builder.',
    breadcrumb: 'Dashboard',
    label: 'Anwendungsfall · Dashboard',
    heading: 'Dashboards aus einer Beschreibung, nicht aus einem Drag-and-Drop-Builder',
    lead: 'Sag deinem Agent, was er zeigen soll und wie es wirken soll. Open Design liefert die Diagrammmuster, das Layoutsystem und die visuelle Sprache, sodass du ein zusammenhängendes, vorzeigbares Dashboard bekommst — keine Wand aus Widgets im Standardstil.',
    heroImageAlt:
      'Redaktionelle Illustration: rohe Zahlen links fließen in ein sauberes Dashboard aus Diagrammen und KPI-Karten rechts',
    tldrTitle: 'In einem Satz',
    tldrBody:
      'Open Design verwandelt eine in klarer Sprache verfasste Spezifikation deiner Kennzahlen in ein gestaltetes Dashboard, das dein Agent als HTML rendert — versioniert in deinem Repo, überall hostbar, ohne BI-Abo pro Platz.',
    stepsTitle: 'So funktionieren Dashboards mit Open Design',
    steps: [
      {
        title: 'Beschreibe die Kennzahlen',
        body: 'Liste auf, was zählt — "wöchentlich aktive Nutzer, Umsatz nach Tarif, Churn und ein 30-Tage-Trend." Der Agent lädt die Dashboard-Fähigkeit, damit er weiß, dass er KPI-Karten, Diagramme und eine Tabelle anordnen soll, statt eines einzelnen Textblocks.',
        imageAlt: 'Illustration einer Person, die die Kennzahlen auflistet, die ihr wichtig sind',
      },
      {
        title: 'Wähle die Diagrammmuster',
        body: 'Open Design liefert Diagramm- und Layout-Vorlagen, sodass Trends zu Liniendiagrammen, Aufschlüsselungen zu Balken und Verhältnisse zur richtigen Visualisierung werden — durchgängig einheitliche Typografie und Abstände statt nicht zusammenpassender Standards.',
        imageAlt: 'Illustration mehrerer Diagrammtypen, in ein zusammenhängendes Raster angeordnet',
      },
      {
        title: 'Binde deine Daten ein',
        body: 'Richte das Dashboard auf eine CSV, einen JSON-Endpunkt oder füge Beispielzeilen ein. Es rendert zu eigenständigem HTML, das sich aktualisiert, wenn sich die Daten ändern — öffne es in jedem Browser, leg es auf jeden statischen Host.',
        imageAlt: 'Illustration einer Datendatei, die sich mit einem live aktualisierenden Dashboard verbindet',
      },
      {
        title: 'Verfeinere und liefere aus',
        body: 'Passe es im Gespräch mit dem Agent an — "gruppiere Umsatz nach Region, schieb die KPI-Zeile nach oben." Das Artefakt liegt in deinem Projekt, sodass das Dashboard wie jeder andere Code überprüfbar und versioniert ist.',
        imageAlt: 'Illustration eines Dashboards, das verfeinert und dann bereitgestellt wird',
      },
    ],
    tableTitle: 'Dashboards mit Open Design vs. die alte Art',
    tableColCapability: 'Was du brauchst',
    tableColWithOd: 'Mit Open Design',
    tableColWithout: 'BI-Tools / handcodiert',
    tableRows: [
      {
        capability: 'Von der Kennzahlenliste zum Layout',
        withOd: 'Ein Prompt; der Agent ordnet Karten, Diagramme und Tabellen an',
        without: 'Widgets einzeln ziehen oder Diagrammcode von Grund auf schreiben',
      },
      {
        capability: 'Einheitliches visuelles System',
        withOd: 'Diagrammmuster und Abstände aus einem wiederverwendbaren Designsystem',
        without: 'Standard-Widget-Stile oder pro Diagramm von Hand gestaltet',
      },
      {
        capability: 'Daten verbinden',
        withOd: 'CSV / JSON / eingefügte Zeilen, zu lebendigem HTML gerendert',
        without: 'Anbieter-Konnektoren oder maßgeschneiderte Datenverkabelung',
      },
      {
        capability: 'Hosting & Teilen',
        withOd: 'Eigenständiges HTML auf jedem statischen Host, kein Konto',
        without: 'Betrachter braucht einen Platz beim BI-Anbieter',
      },
      {
        capability: 'Review & Versionierung',
        withOd: 'Liegt in deinem Repo; diff-bar wie Code',
        without: 'Beim Anbieter eingeschlossen, kein echtes Diff',
      },
      {
        capability: 'Kosten & Lock-in',
        withOd: 'Open Source, eigene Schlüssel mitbringen, läuft lokal',
        without: 'Abo pro Platz, anbietergehostet',
      },
    ],
    featuresTitle: 'Was du bauen kannst',
    features: [
      { title: "Produktanalysen", body: "Aktive Nutzer, Funnels, Retention — die Kennzahlen, in denen ein Produktteam lebt.", thumb: "example-dashboard" },
      { title: "Repo- & Dev-Kennzahlen", body: "Sterne, PRs, CI-Status — Engineering-Dashboards aus deinen eigenen Daten.", thumb: "example-github-dashboard" },
      { title: "Finanzberichte", body: "Umsatz, Burn, Runway als teilbarer Bericht angeordnet.", thumb: "example-finance-report" },
      { title: "Live-Betrieb", body: "Echtzeit-Kennzahlen, die sich aktualisieren, wenn sich die zugrunde liegenden Daten bewegen.", thumb: "example-live-dashboard" },
      { title: "Social & Marketing", body: "Kanal-Performance und Kampagnen-Tracking in einer Ansicht.", thumb: "example-social-media-dashboard" },
      { title: "Fachberichte", body: "Strukturierte Berichte für jedes Feld — von klinisch bis Trading.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Dashboards, die Menschen mit Open Design gebaut haben',
    galleryLead:
      'Echte Dashboards, aus einem Prompt und einer Datenquelle gerendert. Starte mit einem, das deinem nahekommt, und beschreibe die Kennzahlen, die du verfolgst.',
    gallery: [
      { thumb: "example-data-report", caption: "Datenbericht" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Live-Betriebs-Dashboard" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Trading-Analyse-Dashboard" },
      { thumb: "example-frame-data-chart-nyt", caption: "Redaktionelles Datendiagramm" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Dashboard-Vorlagen durchsuchen',
    faqTitle: 'Dashboard-FAQ',
    faq: [
      {
        q: 'Brauche ich ein BI-Tool wie Tableau oder Looker?',
        a: 'Nein. Open Design rendert Dashboards als HTML in deinem Coding-Agent. Du beschreibst die Kennzahlen und richtest es auf deine Daten; es gibt keine separate BI-Plattform zu lizenzieren oder zu lernen.',
      },
      {
        q: 'Woher kommen die Daten?',
        a: 'Aus einer CSV, einem JSON-Endpunkt oder Zeilen, die du einfügst. Das Dashboard ist einfaches HTML und JavaScript, sodass du genau steuerst, woher es liest — nichts wird über einen gehosteten Dienst geleitet.',
      },
      {
        q: 'Können nicht-technische Teammitglieder es ansehen?',
        a: 'Ja. Die Ausgabe ist eine eigenständige Webseite. Jeder mit dem Link oder der Datei kann sie im Browser öffnen — kein Konto, kein Platz.',
      },
      {
        q: 'Welche Agents kann ich nutzen?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI und ein Dutzend weiterer hauseigener Adapter. Du bringst deine eigenen Anbieter-Schlüssel mit.',
      },
    ],
    ctaTitle: 'Bau dein Dashboard noch heute Abend',
    ctaBody:
      'Gib dem Repo einen Stern, installiere Open Design und verwandle deine Kennzahlen in ein Dashboard, das du überall hosten kannst — im Agent, den du bereits nutzt.',
  },
  slides: {
    title: 'Präsentations-Decks mit Open Design + Claude Code erstellen',
    description:
      'Verwandle eine Gliederung in ein gestaltetes, markengerechtes Slide-Deck, ohne eine Präsentations-App zu öffnen. Open Design gibt deinem Coding-Agent Deck-Vorlagen und ein visuelles System und rendert Slides als HTML, das du präsentieren, exportieren oder teilen kannst.',
    breadcrumb: 'Slides',
    label: 'Anwendungsfall · Slides',
    heading: 'Decks, die gestaltet aussehen, von einem Prompt geschrieben',
    lead: 'Gib deinem Agent eine Gliederung und einen Ton. Open Design wendet eine Deck-Vorlage und ein visuelles System an, sodass jede Slide angeordnet, gesetzt und markengerecht ist — keine Aufzählung auf leerem Hintergrund.',
    heroImageAlt:
      'Redaktionelle Illustration: eine Gliederung links verwandelt sich in eine Folge gestalteter Präsentations-Slides rechts',
    tldrTitle: 'In einem Satz',
    tldrBody:
      'Open Design verwandelt eine Gliederung in ein gestaltetes HTML-Deck, das dein Agent in einer Session rendert — präsentiere es im Browser, exportiere nach PDF oder PPTX und behalte die Quelle in deinem Repo.',
    stepsTitle: 'So funktionieren Decks mit Open Design',
    steps: [
      {
        title: 'Gib ihm die Gliederung',
        body: 'Füge deine Stichpunkte oder eine grobe Struktur ein. Der Agent lädt die Deck-Fähigkeit, sodass er eine Folge angeordneter Slides produziert, kein langes Dokument.',
        imageAlt: 'Illustration einer Textgliederung, die einem Agent übergeben wird',
      },
      {
        title: 'Wähle einen Deck-Stil',
        body: 'Open Design liefert Deck-Vorlagen — redaktionell, Swiss-International, dunkel-technisch und mehr. Der Agent wendet eine an, sodass Typografie, Raster und Akzente über jede Slide hinweg einheitlich bleiben.',
        imageAlt: 'Illustration mehrerer Deck-Stil-Optionen, nebeneinander gelegt',
      },
      {
        title: 'Generiere die Slides',
        body: 'Jeder Punkt wird zu einer gestalteten Slide mit der richtigen Hierarchie — Titel, unterstützende Visuals, Daten-Hervorhebungen. Sie rendert zu HTML und präsentiert daher im Vollbild in jedem Browser.',
        imageAlt: 'Illustration einer Folge fertiger Slides mit einheitlichem Styling',
      },
      {
        title: 'Präsentiere, exportiere, iteriere',
        body: 'Präsentiere aus dem Browser oder exportiere zum Teilen nach PDF / PPTX. Verfeinere im Gespräch mit dem Agent — "straffe die Daten-Slide, füge einen abschließenden Call-to-Action hinzu." Die Deck-Quelle bleibt in deinem Projekt.',
        imageAlt: 'Illustration eines Decks, das präsentiert und in mehrere Formate exportiert wird',
      },
    ],
    tableTitle: 'Decks mit Open Design vs. die alte Art',
    tableColCapability: 'Was du brauchst',
    tableColWithOd: 'Mit Open Design',
    tableColWithout: 'PowerPoint / Keynote / KI-Slide-Tools',
    tableRows: [
      {
        capability: 'Von der Gliederung zu Slides',
        withOd: 'Ein Prompt; der Agent ordnet jede Slide an',
        without: 'Jede Slide von Hand bauen oder gegen eine Vorlage kämpfen',
      },
      {
        capability: 'Einheitliches Design',
        withOd: 'Deck-Vorlagen mit echtem Raster- und Typsystem',
        without: 'Theme-Drift, manuelle Ausrichtung, markenfremde Standards',
      },
      {
        capability: 'Daten & Diagramme',
        withOd: 'Diagramme und Hervorhebungen als Teil der Slide gerendert',
        without: 'Statische Bilder einfügen oder Diagramme jedes Mal neu bauen',
      },
      {
        capability: 'Exportformate',
        withOd: 'HTML zum Präsentieren, plus PDF- / PPTX-Export',
        without: 'An das Format einer App gebunden',
      },
      {
        capability: 'Review & Versionierung',
        withOd: 'Quelle liegt in deinem Repo, diff-bar',
        without: 'Binärdatei, kein sinnvolles Diff',
      },
      {
        capability: 'Kosten & Lock-in',
        withOd: 'Open Source, eigene Schlüssel mitbringen, läuft lokal',
        without: 'App-Lizenz oder KI-Add-on pro Platz',
      },
    ],
    featuresTitle: 'Was du präsentieren kannst',
    features: [
      { title: "Pitch-Decks", body: "Investoren- und Sales-Decks mit starkem Narrativ und sauberen Daten-Slides.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Swiss / redaktionell", body: "Rastergetriebene, typografische Decks, die art-directed aussehen.", thumb: "example-deck-swiss-international" },
      { title: "Kursmodule", body: "Lehr-Decks mit klaren Schritten, Hervorhebungen und Tempo.", thumb: "example-html-ppt-course-module" },
      { title: "Datengrafik-Decks", body: "Dunkle, diagrammlastige Decks für Analysen und Reviews.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Präsentatormodus", body: "Decks im Reveal-Stil, gebaut für die Live-Präsentation im Browser.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Technische Blueprints", body: "Architektur- und Wissens-Decks, die komplexe Systeme abbilden.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Decks, die Menschen mit Open Design gebaut haben',
    galleryLead:
      'Echte Decks, aus einer Gliederung gerendert. Wähle einen Stil nahe deinem Vortrag und beschreibe den Inhalt.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Redaktionelles Magazin-Deck" },
      { thumb: "example-guizang-ppt", caption: "Illustrierte Keynote" },
      { thumb: "example-deck-open-slide-canvas", caption: "Open-Slide-Canvas-Deck" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Deck im Gradient-Theme" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Deck-Vorlagen durchsuchen',
    faqTitle: 'Slides-FAQ',
    faq: [
      {
        q: 'Brauche ich PowerPoint oder Keynote?',
        a: 'Nein. Open Design rendert Decks als HTML in deinem Coding-Agent und kann nach PDF oder PPTX exportieren. Du präsentierst aus dem Browser oder übergibst eine Datei — keine Präsentations-App nötig, um es zu bauen.',
      },
      {
        q: 'Sind das nur KI-generierte Aufzählungspunkte?',
        a: 'Nein. Der Agent wendet eine echte Deck-Vorlage mit Raster, Typskala und visueller Hierarchie an, sodass Slides gestaltet aussehen statt automatisch befüllt.',
      },
      {
        q: 'Kann ich für einen Kunden nach PowerPoint exportieren?',
        a: 'Ja. Decks exportieren zusätzlich zum HTML, aus dem du präsentierst, nach PPTX und PDF, sodass sie zu jedem Format passen, das das Publikum erwartet.',
      },
      {
        q: 'Welche Agents kann ich nutzen?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI und weitere hauseigene Adapter, mit deinen eigenen Anbieter-Schlüsseln.',
      },
    ],
    ctaTitle: 'Bau dein nächstes Deck noch heute Abend',
    ctaBody:
      'Gib dem Repo einen Stern, installiere Open Design und verwandle deine Gliederung in ein gestaltetes Deck — im Agent, den du bereits nutzt.',
  },
  image: {
    title: 'Markengerechte Grafiken mit Open Design + Claude Code erstellen',
    description:
      'Erzeuge Social-Cards, Artikel-Cover und Marketing-Grafiken aus einem Prompt — mit echter Typografie und deinem Markensystem angeordnet, als gestochen scharfes HTML gerendert, das du nach PNG exportieren kannst. Keine Design-App, kein Vorlagen-Abo.',
    breadcrumb: 'Bild',
    label: 'Anwendungsfall · Bild',
    heading: 'Markengerechte Grafiken, für dich generiert und angeordnet',
    lead: 'Beschreibe die Card oder das Cover, das du brauchst. Open Design komponiert es mit echter Schrift, Raster und deinen Markenfarben — und rendert dann zu HTML, das du als Bild exportierst, statt mit einer Design-App oder einer generischen Vorlage zu ringen.',
    heroImageAlt:
      'Redaktionelle Illustration: ein Prompt verwandelt sich in ein Set angeordneter Social-Cards und Artikel-Cover',
    tldrTitle: 'In einem Satz',
    tldrBody:
      'Open Design verwandelt einen Prompt in eine gesetzte, markengerechte Grafik, die dein Agent als HTML rendert und nach PNG exportiert — wiederholbar, versioniert und frei von Design-Tools pro Platz.',
    stepsTitle: 'So funktionieren Grafiken mit Open Design',
    steps: [
      {
        title: 'Beschreibe die Grafik',
        body: 'Sag, was es ist — "eine Twitter-Card für unseren Launch mit der Schlagzeile und einem Zitat." Der Agent lädt die passende Fähigkeit, sodass er eine angeordnete Grafik komponiert, keinen reinen Textblock.',
        imageAlt: 'Illustration einer Person, die eine benötigte Social-Card beschreibt',
      },
      {
        title: 'Wende das Markensystem an',
        body: 'Open Design zieht deine Farben, Schrift und Abstände aus einem wiederverwendbaren Designsystem, sodass jede Card zum Rest deiner Marke passt, statt wie ein Einzelstück auszusehen.',
        imageAlt: 'Illustration von Markenfarben und Schrift, die auf ein Card-Layout angewendet werden',
      },
      {
        title: 'Rendern und exportieren',
        body: 'Die Grafik rendert zu HTML in genau den Maßen, die du brauchst — Social-Card, Cover, Banner — und exportiert dann nach PNG. Gestochen scharfer Text, echtes Layout, kein manuelles Nachjustieren.',
        imageAlt: 'Illustration einer Grafik, die gerendert und in eine Bilddatei exportiert wird',
      },
      {
        title: 'Verwende das Rezept wieder',
        body: 'Weil es eine Vorlage ist, ist die nächste Grafik nur einen Prompt entfernt — ändere die Schlagzeile, behalte das Layout. Card-Serien bleiben perfekt einheitlich.',
        imageAlt: 'Illustration einer Card-Vorlage, die eine einheitliche Grafik-Serie produziert',
      },
    ],
    tableTitle: 'Grafiken mit Open Design vs. die alte Art',
    tableColCapability: 'Was du brauchst',
    tableColWithOd: 'Mit Open Design',
    tableColWithout: 'Design-Apps / generische Vorlagen',
    tableRows: [
      {
        capability: 'Von der Idee zur angeordneten Grafik',
        withOd: 'Ein Prompt; der Agent komponiert Schrift und Layout',
        without: 'Eine App öffnen, jedes Element von Hand platzieren',
      },
      {
        capability: 'Markengerecht bleiben',
        withOd: 'Farben und Schrift aus einem wiederverwendbaren Designsystem',
        without: 'Markenstile pro Datei neu wählen oder vom Markenbild abdriften',
      },
      {
        capability: 'Einheitliche Serie',
        withOd: 'Gleiche Vorlage, neuer Text — perfekt ausgerichtetes Set',
        without: 'Jede Variante von Hand neu ausrichten',
      },
      {
        capability: 'Export',
        withOd: 'HTML in exakten Maßen, nach PNG exportiert',
        without: 'Manuelle Canvas-Größe und Export-Einstellungen',
      },
      {
        capability: 'Wiederholbar',
        withOd: 'Ein prompt-getriebenes Rezept in deinem Repo',
        without: 'Eine Einzeldatei, die du jedes Mal neu erstellst',
      },
      {
        capability: 'Kosten & Lock-in',
        withOd: 'Open Source, eigene Schlüssel mitbringen, läuft lokal',
        without: 'Design-Tool pro Platz oder Vorlagen-Marktplatz',
      },
    ],
    featuresTitle: 'Was du machen kannst',
    features: [
      { title: "Social-Cards", body: "X- / Twitter-Cards, komponiert mit deiner Schlagzeile und Marke.", thumb: "example-card-twitter" },
      { title: "Artikel-Cover", body: "Redaktionelle Cover im Magazin-Stil für Beiträge und Newsletter.", thumb: "example-article-magazine" },
      { title: "Xiaohongshu-Cards", body: "Cards im RedNote-Stil, auf diesen Feed abgestimmt.", thumb: "example-card-xiaohongshu" },
      { title: "Hero-Grafiken", body: "Flüssige Gradient-Hero-Visuals für Websites und Launches.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Karussells", body: "Social-Karussells aus mehreren Slides, die über alle Frames einheitlich bleiben.", thumb: "example-social-carousel" },
      { title: "UI-Mock-Frames", body: "Benachrichtigungs- und Geräte-Frames für Produkt-Storytelling.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Grafiken, die Menschen mit Open Design gebaut haben',
    galleryLead:
      'Echte Cards und Cover, aus einem Prompt gerendert. Wähle eines nahe deinem Bedarf und tausch deinen Text ein.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Social-Card in Pastell" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Redaktionelles Dreiton-Poster" },
      { thumb: "example-magazine-poster", caption: "Poster im Magazin-Stil" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Markantes redaktionelles Cover" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Grafik-Vorlagen durchsuchen',
    faqTitle: 'Bild-FAQ',
    faq: [
      {
        q: 'Ist das ein KI-Bildgenerator wie Midjourney?',
        a: 'Nein. Open Design komponiert Grafiken mit echtem Layout und echter Typografie — deine Schlagzeile, deine Marke, exakte Maße — und rendert zu HTML, das du als PNG exportierst. Es ist Design-Komposition, keine Pixel-Generierung.',
      },
      {
        q: 'Kann ich eine einheitliche Serie von Cards machen?',
        a: 'Ja. Da jede Grafik eine Vorlage ist, behältst du das Layout und änderst den Text, sodass eine ganze Serie perfekt ausgerichtet und markengerecht bleibt.',
      },
      {
        q: 'Welche Größen kann es produzieren?',
        a: 'Jede — die Grafik rendert in den exakten Maßen, die du angibst, von einer quadratischen Social-Card bis zu einem breiten Banner, und exportiert dann nach PNG.',
      },
      {
        q: 'Welche Agents kann ich nutzen?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI und weitere hauseigene Adapter, mit deinen eigenen Anbieter-Schlüsseln.',
      },
    ],
    ctaTitle: 'Mach deine nächste Grafik noch heute Abend',
    ctaBody:
      'Gib dem Repo einen Stern, installiere Open Design und verwandle einen Prompt in eine markengerechte Grafik — im Agent, den du bereits nutzt.',
  },
  video: {
    title: 'Motion-Grafiken & Kurzvideos mit Open Design + Claude Code erstellen',
    description:
      'Verwandle ein Skript in animierte Frames und Kurzvideos — Titelkarten, Bewegungs-Hintergründe und Outros, mit deinem Markensystem komponiert und aus HTML gerendert. Keine Motion-Graphics-Suite, kein Scrubben auf der Timeline.',
    breadcrumb: 'Video',
    label: 'Anwendungsfall · Video',
    heading: 'Motion-Grafiken aus einem Skript, nicht aus einer Timeline',
    lead: 'Beschreibe den Moment, den du willst — ein Titel-Reveal, eine Daten-Animation, ein Logo-Outro. Open Design komponiert animierte Frames mit deinem Markensystem und rendert sie zu Video, keine Motion-Graphics-Suite nötig.',
    heroImageAlt:
      'Redaktionelle Illustration: ein Skript verwandelt sich in eine Folge animierter Video-Frames',
    tldrTitle: 'In einem Satz',
    tldrBody:
      'Open Design verwandelt ein Skript in animierte, markengerechte Frames, die dein Agent zu Kurzvideo rendert — aus HTML komponiert, in deinem Repo versioniert, ohne Timeline-Editor zu lernen.',
    stepsTitle: 'So funktioniert Motion mit Open Design',
    steps: [
      {
        title: 'Beschreibe den Moment',
        body: 'Sag, was passieren soll — "ein Glitch-Titel, der sich in unser Logo auflöst, dann eine Abschlusskarte." Der Agent lädt die Motion-Fähigkeit, sodass er animierte Frames produziert, kein statisches Bild.',
        imageAlt: 'Illustration einer Person, die eine Bewegungssequenz beschreibt',
      },
      {
        title: 'Wende Marken- & Motion-Stil an',
        body: 'Open Design liefert Frame-Vorlagen — filmische Light-Leaks, Glitch-Titel, Logo-Outros — und wendet deine Farben und Schrift an, sodass die Bewegung gewollt und markengerecht wirkt.',
        imageAlt: 'Illustration von Marken-Styling, das auf animierte Frames angewendet wird',
      },
      {
        title: 'Rendere die Frames zu Video',
        body: 'Frames werden in HTML komponiert und zu Video gerendert, sodass Timing und Layout präzise und wiederholbar sind — kein manuelles Keyframing auf einer Timeline.',
        imageAlt: 'Illustration von HTML-Frames, die zu einem Videoclip rendern',
      },
      {
        title: 'Iteriere und exportiere',
        body: 'Verfeinere im Gespräch mit dem Agent — "verlangsame das Titel-Reveal, füge eine Bildunterschrift hinzu." Exportiere Kurzclips für Social oder Produkt. Die Quelle bleibt in deinem Projekt.',
        imageAlt: 'Illustration eines Videoclips, der verfeinert und für Social exportiert wird',
      },
    ],
    tableTitle: 'Motion mit Open Design vs. die alte Art',
    tableColCapability: 'Was du brauchst',
    tableColWithOd: 'Mit Open Design',
    tableColWithout: 'After Effects / Motion-Suiten',
    tableRows: [
      {
        capability: 'Vom Skript zu animierten Frames',
        withOd: 'Ein Prompt; der Agent komponiert die Sequenz',
        without: 'Jedes Element von Hand auf einer Timeline keyframen',
      },
      {
        capability: 'Markengerecht bleiben',
        withOd: 'Frame-Vorlagen + deine Farben und Schrift',
        without: 'Marken-Styling pro Projekt neu bauen',
      },
      {
        capability: 'Präzises, wiederholbares Timing',
        withOd: 'In HTML komponiert, deterministisch gerendert',
        without: 'Manuelles Scrubben, schwer zu reproduzieren',
      },
      {
        capability: 'Export für Social',
        withOd: 'Kurzclips zu Video gerendert',
        without: 'Export-Presets und Codec-Gefummel',
      },
      {
        capability: 'Review & Versionierung',
        withOd: 'Frame-Quelle liegt in deinem Repo, diff-bar',
        without: 'Binäre Projektdatei, kein echtes Diff',
      },
      {
        capability: 'Kosten & Lock-in',
        withOd: 'Open Source, eigene Schlüssel mitbringen, läuft lokal',
        without: 'Teure Suite, steile Lernkurve',
      },
    ],
    featuresTitle: 'Was du animieren kannst',
    features: [
      { title: "Hyperframes", body: "Frame-für-Frame-Bewegungssequenzen, aus HTML komponiert.", thumb: "example-video-hyperframes" },
      { title: "Kurzformat für Social", body: "Vertikale Clips, gebaut für Social-Feeds.", thumb: "example-video-shortform" },
      { title: "Motion-Frame-Sets", body: "Wiederverwendbare animierte Frames, die du zu einem Clip zusammensetzt.", thumb: "example-motion-frames" },
      { title: "Filmische Light-Leaks", body: "Filmische Übergänge und atmosphärische Hintergründe.", thumb: "example-frame-light-leak-cinema" },
      { title: "Glitch-Titel", body: "Titel-Reveals mit Bewegung und Textur.", thumb: "example-frame-glitch-title" },
      { title: "Logo-Outros", body: "Markenkonforme Abschluss-Animationen für jeden Clip.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Motion, die Menschen mit Open Design gebaut haben',
    galleryLead:
      'Echte animierte Frames und Clips, aus einem Prompt gerendert. Wähle einen nahe deiner Idee und beschreibe die Bewegung.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Hyperframes-Sequenz" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Flüssiger Bewegungs-Hintergrund" },
      { thumb: "example-frame-macos-notification", caption: "Animierter UI-Frame" },
      { thumb: "example-frame-data-chart-nyt", caption: "Animiertes Datendiagramm" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Motion-Vorlagen durchsuchen',
    faqTitle: 'Video-FAQ',
    faq: [
      {
        q: 'Brauche ich After Effects oder eine Motion-Graphics-Suite?',
        a: 'Nein. Open Design komponiert animierte Frames in HTML und rendert sie zu Video in deinem Coding-Agent. Es gibt keinen Timeline-Editor zu lernen oder zu lizenzieren.',
      },
      {
        q: 'Für welche Art von Video eignet sich das?',
        a: 'Kurzformat-Motion — Titelkarten, Daten-Animationen, Logo-Outros, Social-Clips. Es ist für Marken- und Produkt-Motion gebaut, nicht für abendfüllenden Schnitt.',
      },
      {
        q: 'Ist das Timing reproduzierbar?',
        a: 'Ja. Da Frames in Code komponiert und deterministisch gerendert werden, bekommst du jedes Mal dasselbe Ergebnis und kannst es per Prompt präzise anpassen.',
      },
      {
        q: 'Welche Agents kann ich nutzen?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI und weitere hauseigene Adapter, mit deinen eigenen Anbieter-Schlüsseln.',
      },
    ],
    ctaTitle: 'Animiere deine nächste Idee noch heute Abend',
    ctaBody:
      'Gib dem Repo einen Stern, installiere Open Design und verwandle ein Skript in Motion — im Agent, den du bereits nutzt.',
  },
  designSystem: {
    title: 'Ein Designsystem mit Open Design + Claude Code bauen und anwenden',
    description:
      'Erfasse deine Marke als wiederverwendbares Designsystem, das dein Coding-Agent auf jedes Artefakt anwendet — Farben, Schrift, Komponenten und Ton in einer DESIGN.md. Einmal definieren; jeder Prototyp, jedes Deck und jedes Dashboard bleibt markengerecht.',
    breadcrumb: 'Designsystem',
    label: 'Anwendungsfall · Designsystem',
    heading: 'Ein Designsystem, angewendet auf alles, was dein Agent macht',
    lead: 'Definiere deine Marke einmal, und Open Design trägt sie in jede Ausgabe — Prototypen, Decks, Dashboards, Grafiken. Das System liegt in deinem Repo als DESIGN.md, die der Agent liest, sodass Konsistenz automatisch entsteht, nicht von Hand.',
    heroImageAlt:
      'Redaktionelle Illustration eines einzelnen Designsystems, das in viele markengerechte Artefakte ausstrahlt',
    tldrTitle: 'In einem Satz',
    tldrBody:
      'Open Design erfasst deine Marke als portables Designsystem, das dein Agent auf jedes Artefakt anwendet — einmal in deinem Repo definiert, überall durchgesetzt, ohne zentrales Design-Tool, das den Zugang kontrolliert.',
    stepsTitle: 'So funktionieren Designsysteme mit Open Design',
    steps: [
      {
        title: 'Erfasse das System',
        body: 'Beschreibe deine Marke — Farben, Schrift, Abstände, Stimme — oder richte den Agent auf eine bestehende Website, um sie zu extrahieren. Open Design schreibt sie in eine DESIGN.md, die in deinem Projekt liegt.',
        imageAlt: 'Illustration einer Marke, die in eine einzelne Designsystem-Datei erfasst wird',
      },
      {
        title: 'Starte von einer bewährten Basis',
        body: 'Open Design liefert über 140 Referenz-Designsysteme — von Apple und Linear bis redaktionell und brutalistisch. Forke eines nahe deiner Marke, statt von einer leeren Seite zu starten.',
        imageAlt: 'Illustration einer Galerie von Referenz-Designsystemen, durch die geblättert wird',
      },
      {
        title: 'Wende es überall an',
        body: 'Jede andere Fähigkeit liest dasselbe System, sodass ein Prototyp, ein Deck und ein Dashboard alle eine visuelle Sprache teilen — ohne dass du sie jedes Mal neu angeben musst.',
        imageAlt: 'Illustration eines Systems, das einheitlich über viele Artefakt-Typen angewendet wird',
      },
      {
        title: 'Entwickle es an einem Ort weiter',
        body: 'Ändere das System, und das nächste Rendering spiegelt es überall wider. Da es eine Datei in deinem Repo ist, werden Design-Entscheidungen wie Code überprüft und versioniert.',
        imageAlt: 'Illustration eines Designsystems, das aktualisiert wird und sich auf alle Ausgaben überträgt',
      },
    ],
    tableTitle: 'Designsysteme mit Open Design vs. die alte Art',
    tableColCapability: 'Was du brauchst',
    tableColWithOd: 'Mit Open Design',
    tableColWithout: 'Design-Tool-Bibliotheken / Styleguides',
    tableRows: [
      {
        capability: 'Das System definieren',
        withOd: 'Eine DESIGN.md, die der Agent liest, geforkt aus über 140 Referenzen',
        without: 'Ein statischer Styleguide oder eine tool-gebundene Bibliothek',
      },
      {
        capability: 'Über Artefakt-Typen hinweg anwenden',
        withOd: 'Dasselbe System speist Prototypen, Decks, Dashboards, Grafiken',
        without: 'Pro Tool und pro Datei neu implementiert',
      },
      {
        capability: 'Alles konsistent halten',
        withOd: 'Automatisch — jede Fähigkeit liest eine Quelle',
        without: 'Manuelle Disziplin; driftet mit der Zeit',
      },
      {
        capability: 'Die Marke weiterentwickeln',
        withOd: 'Einmal bearbeiten; nächstes Rendering aktualisiert überall',
        without: 'Suchen und Ersetzen über Dateien und Tools hinweg',
      },
      {
        capability: 'Review & Versionierung',
        withOd: 'Liegt in deinem Repo, diff-bar wie Code',
        without: 'In einem Design-Tool vergraben, schwer zu prüfen',
      },
      {
        capability: 'Kosten & Lock-in',
        withOd: 'Open Source, portabel, läuft lokal',
        without: 'An ein Design-Tool-Abo gebunden',
      },
    ],
    featuresTitle: 'Systeme, von denen du starten kannst',
    features: [
      { title: "Apple", body: "Saubere, zurückhaltende Ästhetik mit Systemschrift.", thumb: "design-system-apple" },
      { title: "Linear", body: "Klarer Produkt-Tool-Look mit engen Abständen.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Weich, dokumentenorientiert, zugänglich.", thumb: "design-system-notion" },
      { title: "Figma", body: "Verspielt, farbenfroh, mit der Energie eines Kreativ-Tools.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimal, neutral, in Forschungsqualität.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Dicht, technisch, entwicklernativ.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Designsysteme in Open Design',
    galleryLead:
      'Einige der über 140 Referenzsysteme, die du als Startpunkt forken kannst. Wähle eines nahe deiner Marke und passe es an.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "System im Airbnb-Stil" },
      { thumb: "design-system-vercel", caption: "System im Vercel-Stil" },
      { thumb: "design-system-stripe", caption: "System im Stripe-Stil" },
      { thumb: "design-system-spotify", caption: "System im Spotify-Stil" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Designsysteme durchsuchen',
    faqTitle: 'Designsystem-FAQ',
    faq: [
      {
        q: 'Was genau ist hier das Designsystem?',
        a: 'Eine DESIGN.md-Datei in deinem Repo, die Farben, Schrift, Abstände, Komponenten und Stimme erfasst. Jede Open-Design-Fähigkeit liest sie, sodass deine Marke automatisch auf alles angewendet wird, was der Agent produziert.',
      },
      {
        q: 'Muss ich bei null anfangen?',
        a: 'Nein. Open Design liefert über 140 Referenz-Designsysteme, die du forken kannst — von Apple und Linear bis redaktionell und brutalistisch — und dann an deine Marke anpasst.',
      },
      {
        q: 'Wie bleibt es über Decks, Dashboards und Prototypen hinweg konsistent?',
        a: 'Weil all diese Fähigkeiten dieselbe DESIGN.md lesen. Definiere das System einmal, und Konsistenz entsteht automatisch, statt etwas zu sein, das du von Hand überwachst.',
      },
      {
        q: 'Welche Agents kann ich nutzen?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI und weitere hauseigene Adapter, mit deinen eigenen Anbieter-Schlüsseln.',
      },
    ],
    ctaTitle: 'Definiere dein Designsystem noch heute Abend',
    ctaBody:
      'Gib dem Repo einen Stern, installiere Open Design und gib deinem Agent eine Marke, die er überall anwendet — im Agent, den du bereits nutzt.',
  },
};

const FR: SolutionLocaleCopy = {
  prototype: {
    title: 'Créer des prototypes interactifs avec Open Design + Claude Code',
    description:
      'Transformez une invite en un prototype cliquable et multi-écrans sans quitter votre terminal. Open Design donne à votre agent de code les compétences de design, les modèles et le système de design pour livrer de vrais prototypes que vous pouvez ouvrir dans un navigateur.',
    breadcrumb: 'Prototype',
    label: 'Cas d’usage · Prototype',
    heading: 'Prototyper à la vitesse d’une invite',
    lead: 'Décrivez le parcours que vous avez en tête et laissez votre agent assembler un vrai prototype cliquable — plusieurs écrans, styles partagés et interactions vivantes — rendu directement en HTML que vous pouvez ouvrir, partager et confier à l’ingénierie.',
    heroImageAlt:
      'Illustration éditoriale d’une main esquissant un wireframe qui se transforme en prototype d’application cliquable multi-écrans',
    tldrTitle: 'En une ligne',
    tldrBody:
      'Open Design est la couche de design de l’agent de code que vous utilisez déjà. Pour le prototypage, cela signifie passer d’une idée d’un paragraphe à un prototype navigable et stylé en une seule session — sans outil de design, sans étape d’export, sans rupture de transmission.',
    stepsTitle: 'Comment fonctionne le prototypage avec Open Design',
    steps: [
      {
        title: 'Décrivez le parcours',
        body: 'Dites à votre agent ce que vous construisez en langage clair — "un parcours d’onboarding avec un écran de bienvenue, un sélecteur de forfait et une confirmation." Open Design charge la compétence de prototype pour que l’agent sache produire des écrans, pas une seule page.',
        imageAlt:
          'Illustration d’une personne tapant dans un terminal une description en langage clair d’un parcours d’application',
      },
      {
        title: 'Générez des écrans stylés',
        body: 'L’agent applique un système de design et des modèles de prototype d’Open Design, si bien que chaque écran partage typographie, espacements et composants au lieu de ressembler à un brouillon. Vous obtenez un ensemble d’écrans cohérent, pas des maquettes disparates.',
        imageAlt:
          'Illustration de plusieurs écrans d’application apparaissant en séquence, tous partageant un style visuel cohérent',
      },
      {
        title: 'Reliez les interactions',
        body: 'Les boutons naviguent, les onglets changent, les fenêtres modales s’ouvrent. Le prototype est rendu en HTML autonome, donc il se comporte comme le vrai produit dans n’importe quel navigateur — aucun compte d’outil de prototypage requis pour le consulter.',
        imageAlt:
          'Illustration d’un curseur cliquant à travers des écrans reliés, avec des flèches montrant la navigation entre eux',
      },
      {
        title: 'Itérez et transmettez',
        body: 'Affinez en parlant à l’agent — "passe le sélecteur de forfait en disposition trois colonnes." Comme l’artefact vit dans votre projet, le design et le code final partagent une seule source de vérité, comblant la rupture habituelle entre designer et ingénieur.',
        imageAlt:
          'Illustration d’un prototype révisé puis transmis à un ingénieur, design et code fusionnant en un seul fichier',
      },
    ],
    tableTitle: 'Le prototypage avec Open Design vs l’ancienne méthode',
    tableColCapability: 'Ce dont vous avez besoin',
    tableColWithOd: 'Avec Open Design',
    tableColWithout: 'Outils de prototypage classiques',
    tableRows: [
      {
        capability: 'Passer de l’idée au premier écran',
        withOd: 'Une invite dans l’agent que vous avez déjà ouvert',
        without: 'Ouvrir un outil séparé, créer un fichier, glisser des boîtes à la main',
      },
      {
        capability: 'Plusieurs écrans reliés',
        withOd: 'Générés comme un ensemble avec styles partagés et navigation fonctionnelle',
        without: 'Chaque écran dessiné et relié manuellement',
      },
      {
        capability: 'Système visuel cohérent',
        withOd: 'Tiré d’un système de design réutilisable que l’agent applique',
        without: 'Recréé par fichier ou maintenu à la main',
      },
      {
        capability: 'Résultat partageable',
        withOd: 'HTML autonome — s’ouvre dans n’importe quel navigateur, sans compte',
        without: 'Le spectateur a besoin d’un siège ou d’un lien de partage dans l’outil du fournisseur',
      },
      {
        capability: 'Chemin vers le vrai code',
        withOd: 'L’artefact vit dans votre dépôt ; design et code partagent une source',
        without: 'Reconstruit de zéro après une transmission séparée',
      },
      {
        capability: 'Coût et verrouillage',
        withOd: 'Open source, apportez vos propres clés, fonctionne en local',
        without: 'Abonnement par siège, hébergé par le fournisseur, export limité',
      },
    ],
    featuresTitle: 'Ce que vous pouvez prototyper',
    features: [
      {
        title: 'Applications web multi-écrans',
        body: 'Des parcours complets avec navigation partagée — onboarding, tableaux de bord, paramètres — pas des pages isolées.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Parcours d’application mobile',
        body: 'Des parcours mobiles écran par écran avec des transitions et états au rendu natif.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Pages d’atterrissage',
        body: 'Des pages marketing et des landings SaaS que vous pouvez parcourir et livrer.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Tout goût visuel',
        body: 'Éditorial, doux ou brutaliste — le prototype porte un style cohérent de bout en bout.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Liste d’attente et tarifs',
        body: 'Des surfaces de conversion — listes d’attente, grilles tarifaires — câblées et fidèles à la marque.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Ludique et gamifié',
        body: 'Des concepts riches en interactions où le mouvement et l’état font partie du pitch.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Des prototypes créés avec Open Design',
    galleryLead:
      'Chacun a commencé par une invite et a été rendu en artefact cliquable. Choisissez un modèle proche de votre idée, décrivez votre variante, et l’agent l’adapte.',
    gallery: [
      { thumb: "example-dating-web", caption: "Application web de rencontres — parcours multi-écrans" },
      { thumb: "example-hr-onboarding", caption: "Parcours d’onboarding RH" },
      { thumb: "example-kami-landing", caption: "Page d’atterrissage produit" },
      { thumb: "example-web-prototype-taste-soft", caption: "Prototype web au style doux" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Parcourir les modèles de prototype',
    faqTitle: 'FAQ prototypage',
    faq: [
      {
        q: 'Ai-je besoin d’un outil de design comme Figma pour prototyper avec Open Design ?',
        a: 'Non. Open Design fonctionne à l’intérieur de votre agent de code et rend les prototypes en HTML. Vous décrivez le parcours en langage ; l’agent produit les écrans. Il n’y a aucun outil de canevas distinct à apprendre ou à payer.',
      },
      {
        q: 'Les prototypes sont-ils interactifs ou juste des maquettes statiques ?',
        a: 'Interactifs. La navigation, les onglets et les modales fonctionnent parce que la sortie est du vrai HTML et CSS. Vous pouvez le parcourir dans n’importe quel navigateur exactement comme le ferait un utilisateur.',
      },
      {
        q: 'Quels agents puis-je utiliser ?',
        a: 'Open Design fonctionne avec Claude Code, Codex, Cursor Agent, Gemini CLI et une douzaine d’autres adaptateurs maison. Vous apportez vos propres clés de fournisseur ; rien n’est hébergé pour vous.',
      },
      {
        q: 'Un prototype peut-il devenir le vrai produit ?',
        a: 'C’est tout l’intérêt. L’artefact vit dans votre projet, donc le même système de design et les mêmes composants passent dans le code de production au lieu d’être jetés après une transmission.',
      },
    ],
    ctaTitle: 'Prototypez votre prochaine idée ce soir',
    ctaBody:
      'Mettez une étoile au dépôt, installez Open Design et transformez votre prochain "et si" en quelque chose de cliquable — dans l’agent que vous utilisez déjà.',
  },
  dashboard: {
    title: 'Générer des tableaux de bord de données avec Open Design + Claude Code',
    description:
      'Décrivez les indicateurs que vous suivez et laissez votre agent de code construire un tableau de bord stylé et responsive — graphiques, cartes KPI et tableaux rendus en HTML que vous pouvez héberger partout. Pas de siège d’outil BI, pas de constructeur glisser-déposer.',
    breadcrumb: 'Tableau de bord',
    label: 'Cas d’usage · Tableau de bord',
    heading: 'Des tableaux de bord à partir d’une description, pas d’un constructeur glisser-déposer',
    lead: 'Dites à votre agent quoi montrer et quelle impression donner. Open Design fournit les motifs de graphiques, le système de mise en page et le langage visuel pour obtenir un tableau de bord cohérent et présentable — pas un mur de widgets au style par défaut.',
    heroImageAlt:
      'Illustration éditoriale de chiffres bruts à gauche qui se transforment en un tableau de bord épuré de graphiques et de cartes KPI à droite',
    tldrTitle: 'En une ligne',
    tldrBody:
      'Open Design transforme une spécification en langage clair de vos indicateurs en un tableau de bord stylé que votre agent rend en HTML — versionné dans votre dépôt, hébergeable partout, sans abonnement BI par siège.',
    stepsTitle: 'Comment fonctionnent les tableaux de bord avec Open Design',
    steps: [
      {
        title: 'Décrivez les indicateurs',
        body: 'Listez ce qui compte — "utilisateurs actifs hebdomadaires, revenu par forfait, attrition et tendance sur 30 jours." L’agent charge la compétence de tableau de bord pour savoir disposer des cartes KPI, des graphiques et un tableau plutôt qu’un seul bloc de texte.',
        imageAlt: 'Illustration d’une personne listant les indicateurs qui lui importent',
      },
      {
        title: 'Choisissez les motifs de graphiques',
        body: 'Open Design livre des modèles de graphiques et de mise en page, si bien que les tendances deviennent des courbes, les répartitions des barres et les ratios la bonne visualisation — typographie et espacements cohérents partout au lieu de réglages par défaut disparates.',
        imageAlt: 'Illustration de plusieurs types de graphiques disposés dans une grille cohérente',
      },
      {
        title: 'Branchez vos données',
        body: 'Pointez le tableau de bord vers un CSV, un point de terminaison JSON, ou collez des lignes d’exemple. Il est rendu en HTML autonome qui se met à jour quand les données changent — ouvrez-le dans n’importe quel navigateur, déposez-le sur n’importe quel hébergement statique.',
        imageAlt: 'Illustration d’un fichier de données se connectant à un tableau de bord à mise à jour en direct',
      },
      {
        title: 'Affinez et livrez',
        body: 'Ajustez en parlant à l’agent — "regroupe le revenu par région, remonte la ligne KPI en haut." L’artefact vit dans votre projet, donc le tableau de bord est relisible et versionné comme n’importe quel autre code.',
        imageAlt: 'Illustration d’un tableau de bord en cours d’affinage puis déployé',
      },
    ],
    tableTitle: 'Les tableaux de bord avec Open Design vs l’ancienne méthode',
    tableColCapability: 'Ce dont vous avez besoin',
    tableColWithOd: 'Avec Open Design',
    tableColWithout: 'Outils BI / codé à la main',
    tableRows: [
      {
        capability: 'Passer de la liste d’indicateurs à la mise en page',
        withOd: 'Une invite ; l’agent dispose cartes, graphiques et tableaux',
        without: 'Glisser les widgets un à un, ou écrire le code des graphiques de zéro',
      },
      {
        capability: 'Système visuel cohérent',
        withOd: 'Motifs de graphiques et espacements d’un système de design réutilisable',
        without: 'Styles de widgets par défaut, ou stylés à la main par graphique',
      },
      {
        capability: 'Connecter les données',
        withOd: 'CSV / JSON / lignes collées, rendus en HTML vivant',
        without: 'Connecteurs du fournisseur ou plomberie de données sur mesure',
      },
      {
        capability: 'Hébergement et partage',
        withOd: 'HTML autonome sur n’importe quel hébergement statique, sans compte',
        without: 'Le spectateur a besoin d’un siège chez le fournisseur BI',
      },
      {
        capability: 'Relecture et versionnage',
        withOd: 'Vit dans votre dépôt ; comparable comme du code',
        without: 'Enfermé chez le fournisseur, pas de vrai diff',
      },
      {
        capability: 'Coût et verrouillage',
        withOd: 'Open source, apportez vos propres clés, fonctionne en local',
        without: 'Abonnement par siège, hébergé par le fournisseur',
      },
    ],
    featuresTitle: 'Ce que vous pouvez construire',
    features: [
      { title: "Analytique produit", body: "Utilisateurs actifs, entonnoirs, rétention — les indicateurs où vit une équipe produit.", thumb: "example-dashboard" },
      { title: "Indicateurs dépôt et dev", body: "Étoiles, PR, santé du CI — des tableaux de bord d’ingénierie à partir de vos propres données.", thumb: "example-github-dashboard" },
      { title: "Rapports financiers", body: "Revenu, burn, runway disposés en un rapport partageable.", thumb: "example-finance-report" },
      { title: "Opérations en direct", body: "Des indicateurs en temps réel qui se rafraîchissent au gré des données sous-jacentes.", thumb: "example-live-dashboard" },
      { title: "Social et marketing", body: "Performance des canaux et suivi des campagnes en une seule vue.", thumb: "example-social-media-dashboard" },
      { title: "Rapports métier", body: "Des rapports structurés pour tout domaine — du clinique au trading.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Des tableaux de bord créés avec Open Design',
    galleryLead:
      'De vrais tableaux de bord rendus à partir d’une invite et d’une source de données. Partez d’un proche du vôtre et décrivez les indicateurs que vous suivez.',
    gallery: [
      { thumb: "example-data-report", caption: "Rapport de données" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Tableau de bord des opérations en direct" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Tableau de bord d’analyse de trading" },
      { thumb: "example-frame-data-chart-nyt", caption: "Graphique de données éditorial" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Parcourir les modèles de tableau de bord',
    faqTitle: 'FAQ tableau de bord',
    faq: [
      {
        q: 'Ai-je besoin d’un outil BI comme Tableau ou Looker ?',
        a: 'Non. Open Design rend les tableaux de bord en HTML à l’intérieur de votre agent de code. Vous décrivez les indicateurs et le pointez vers vos données ; il n’y a aucune plateforme BI distincte à licencier ou à apprendre.',
      },
      {
        q: 'D’où viennent les données ?',
        a: 'D’un CSV, d’un point de terminaison JSON ou de lignes que vous collez. Le tableau de bord est du HTML et du JavaScript simples, donc vous contrôlez exactement où il lit — rien ne transite par un service hébergé.',
      },
      {
        q: 'Des coéquipiers non techniques peuvent-ils le consulter ?',
        a: 'Oui. La sortie est une page web autonome. Quiconque a le lien ou le fichier peut l’ouvrir dans un navigateur — sans compte, sans siège.',
      },
      {
        q: 'Quels agents puis-je utiliser ?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI et une douzaine d’autres adaptateurs maison. Vous apportez vos propres clés de fournisseur.',
      },
    ],
    ctaTitle: 'Construisez votre tableau de bord ce soir',
    ctaBody:
      'Mettez une étoile au dépôt, installez Open Design et transformez vos indicateurs en un tableau de bord que vous pouvez héberger partout — dans l’agent que vous utilisez déjà.',
  },
  slides: {
    title: 'Générer des présentations avec Open Design + Claude Code',
    description:
      'Transformez un plan en une présentation conçue et fidèle à la marque sans ouvrir d’application de présentation. Open Design donne à votre agent de code des modèles de présentation et un système visuel, rendant les diapositives en HTML que vous pouvez présenter, exporter ou partager.',
    breadcrumb: 'Diapositives',
    label: 'Cas d’usage · Diapositives',
    heading: 'Des présentations qui semblent conçues, écrites par une invite',
    lead: 'Confiez à votre agent un plan et un ton. Open Design applique un modèle de présentation et un système visuel pour que chaque diapositive soit disposée, composée et fidèle à la marque — pas une liste à puces sur un fond vide.',
    heroImageAlt:
      'Illustration éditoriale d’un plan à gauche se transformant en une séquence de diapositives de présentation conçues à droite',
    tldrTitle: 'En une ligne',
    tldrBody:
      'Open Design transforme un plan en une présentation HTML conçue que votre agent rend en une session — présentez-la dans le navigateur, exportez en PDF ou PPTX et gardez la source dans votre dépôt.',
    stepsTitle: 'Comment fonctionnent les présentations avec Open Design',
    steps: [
      {
        title: 'Donnez-lui le plan',
        body: 'Collez vos points clés ou une structure approximative. L’agent charge la compétence de présentation pour produire une séquence de diapositives disposées, pas un long document.',
        imageAlt: 'Illustration d’un plan textuel remis à un agent',
      },
      {
        title: 'Choisissez un style de présentation',
        body: 'Open Design livre des modèles de présentation — éditorial, suisse-international, technique sombre, et plus. L’agent en applique un pour que typographie, grille et accents restent cohérents sur chaque diapositive.',
        imageAlt: 'Illustration de plusieurs options de style de présentation posées côte à côte',
      },
      {
        title: 'Générez les diapositives',
        body: 'Chaque point devient une diapositive conçue avec la bonne hiérarchie — titres, visuels d’appui, mises en avant de données. C’est rendu en HTML, donc cela se présente en plein écran dans n’importe quel navigateur.',
        imageAlt: 'Illustration d’une séquence de diapositives finies avec un style cohérent',
      },
      {
        title: 'Présentez, exportez, itérez',
        body: 'Présentez depuis le navigateur, ou exportez en PDF / PPTX pour partager. Affinez en parlant à l’agent — "resserre la diapositive de données, ajoute un appel à l’action de clôture." La source de la présentation reste dans votre projet.',
        imageAlt: 'Illustration d’une présentation présentée et exportée vers plusieurs formats',
      },
    ],
    tableTitle: 'Les présentations avec Open Design vs l’ancienne méthode',
    tableColCapability: 'Ce dont vous avez besoin',
    tableColWithOd: 'Avec Open Design',
    tableColWithout: 'PowerPoint / Keynote / outils de diapositives IA',
    tableRows: [
      {
        capability: 'Passer du plan aux diapositives',
        withOd: 'Une invite ; l’agent dispose chaque diapositive',
        without: 'Construire chaque diapositive à la main, ou se battre avec un modèle',
      },
      {
        capability: 'Design cohérent',
        withOd: 'Des modèles de présentation avec une vraie grille et un système typographique',
        without: 'Dérive de thème, alignement manuel, réglages par défaut hors marque',
      },
      {
        capability: 'Données et diagrammes',
        withOd: 'Graphiques et mises en avant rendus comme partie de la diapositive',
        without: 'Coller des images statiques ou reconstruire les graphiques à chaque fois',
      },
      {
        capability: 'Formats d’export',
        withOd: 'HTML pour présenter, plus export PDF / PPTX',
        without: 'Verrouillé au format d’une seule application',
      },
      {
        capability: 'Relecture et versionnage',
        withOd: 'La source vit dans votre dépôt, comparable',
        without: 'Fichier binaire, pas de diff significatif',
      },
      {
        capability: 'Coût et verrouillage',
        withOd: 'Open source, apportez vos propres clés, fonctionne en local',
        without: 'Licence d’application ou module IA par siège',
      },
    ],
    featuresTitle: 'Ce que vous pouvez présenter',
    features: [
      { title: "Présentations de pitch", body: "Des présentations investisseurs et ventes avec un récit fort et des diapositives de données nettes.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Suisse / éditorial", body: "Des présentations typographiques, guidées par la grille, à l’allure dirigée artistiquement.", thumb: "example-deck-swiss-international" },
      { title: "Modules de cours", body: "Des présentations pédagogiques avec des étapes claires, des mises en avant et un rythme.", thumb: "example-html-ppt-course-module" },
      { title: "Présentations à graphiques", body: "Des présentations sombres, axées sur les graphiques, pour analyses et revues.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Mode présentateur", body: "Des présentations de style Reveal conçues pour présenter en direct dans le navigateur.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Schémas techniques", body: "Des présentations d’architecture et de connaissances qui cartographient des systèmes complexes.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Des présentations créées avec Open Design',
    galleryLead:
      'De vraies présentations rendues à partir d’un plan. Choisissez un style proche de votre exposé et décrivez le contenu.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Présentation magazine éditoriale" },
      { thumb: "example-guizang-ppt", caption: "Keynote illustrée" },
      { thumb: "example-deck-open-slide-canvas", caption: "Présentation open slide canvas" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Présentation au thème dégradé" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Parcourir les modèles de présentation',
    faqTitle: 'FAQ diapositives',
    faq: [
      {
        q: 'Ai-je besoin de PowerPoint ou Keynote ?',
        a: 'Non. Open Design rend les présentations en HTML à l’intérieur de votre agent de code et peut exporter en PDF ou PPTX. Vous présentez depuis le navigateur ou transmettez un fichier — aucune application de présentation requise pour la construire.',
      },
      {
        q: 'Ne sont-ce que des puces générées par IA ?',
        a: 'Non. L’agent applique un vrai modèle de présentation avec une grille, une échelle typographique et une hiérarchie visuelle, si bien que les diapositives semblent conçues plutôt que remplies automatiquement.',
      },
      {
        q: 'Puis-je exporter vers PowerPoint pour un client ?',
        a: 'Oui. Les présentations s’exportent en PPTX et PDF en plus du HTML depuis lequel vous présentez, pour s’adapter à ce que le public attend.',
      },
      {
        q: 'Quels agents puis-je utiliser ?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI et d’autres adaptateurs maison, avec vos propres clés de fournisseur.',
      },
    ],
    ctaTitle: 'Construisez votre prochaine présentation ce soir',
    ctaBody:
      'Mettez une étoile au dépôt, installez Open Design et transformez votre plan en une présentation conçue — dans l’agent que vous utilisez déjà.',
  },
  image: {
    title: 'Générer des visuels fidèles à la marque avec Open Design + Claude Code',
    description:
      'Produisez des cartes sociales, des couvertures d’articles et des visuels marketing à partir d’une invite — disposés avec une vraie typographie et votre système de marque, rendus en HTML net que vous pouvez exporter en PNG. Pas d’application de design, pas d’abonnement à des modèles.',
    breadcrumb: 'Image',
    label: 'Cas d’usage · Image',
    heading: 'Des visuels fidèles à la marque, générés et mis en page pour vous',
    lead: 'Décrivez la carte ou la couverture dont vous avez besoin. Open Design la compose avec une vraie typographie, une grille et vos couleurs de marque — puis la rend en HTML que vous exportez en image, au lieu de batailler avec une application de design ou un modèle générique.',
    heroImageAlt:
      'Illustration éditoriale d’une invite se transformant en un ensemble de cartes sociales et de couvertures d’articles mises en page',
    tldrTitle: 'En une ligne',
    tldrBody:
      'Open Design transforme une invite en un visuel composé et fidèle à la marque que votre agent rend en HTML et exporte en PNG — reproductible, versionné et libéré des outils de design par siège.',
    stepsTitle: 'Comment fonctionnent les visuels avec Open Design',
    steps: [
      {
        title: 'Décrivez le visuel',
        body: 'Dites ce que c’est — "une carte Twitter pour notre lancement avec le titre et une citation." L’agent charge la bonne compétence pour composer un visuel mis en page, pas un simple bloc de texte.',
        imageAlt: 'Illustration d’une personne décrivant une carte sociale dont elle a besoin',
      },
      {
        title: 'Appliquez le système de marque',
        body: 'Open Design tire vos couleurs, votre typographie et vos espacements d’un système de design réutilisable, si bien que chaque carte s’accorde au reste de votre marque au lieu d’avoir l’air d’un coup unique.',
        imageAlt: 'Illustration de couleurs et de typographie de marque appliquées à une mise en page de carte',
      },
      {
        title: 'Rendez et exportez',
        body: 'Le visuel est rendu en HTML aux dimensions exactes dont vous avez besoin — carte sociale, couverture, bannière — puis exporté en PNG. Texte net, vraie mise en page, aucun ajustement manuel.',
        imageAlt: 'Illustration d’un visuel rendu et exporté vers un fichier image',
      },
      {
        title: 'Réutilisez la recette',
        body: 'Comme c’est un modèle, le visuel suivant n’est qu’à une invite — changez le titre, gardez la mise en page. Les séries de cartes restent parfaitement cohérentes.',
        imageAlt: 'Illustration d’un modèle de carte produisant une série de visuels cohérente',
      },
    ],
    tableTitle: 'Les visuels avec Open Design vs l’ancienne méthode',
    tableColCapability: 'Ce dont vous avez besoin',
    tableColWithOd: 'Avec Open Design',
    tableColWithout: 'Applications de design / modèles génériques',
    tableRows: [
      {
        capability: 'Passer de l’idée au visuel mis en page',
        withOd: 'Une invite ; l’agent compose typographie et mise en page',
        without: 'Ouvrir une application, placer chaque élément à la main',
      },
      {
        capability: 'Rester fidèle à la marque',
        withOd: 'Couleurs et typographie d’un système de design réutilisable',
        without: 'Re-choisir les styles de marque par fichier, ou dériver hors marque',
      },
      {
        capability: 'Série cohérente',
        withOd: 'Même modèle, nouveau texte — un ensemble parfaitement aligné',
        without: 'Réaligner chaque variante manuellement',
      },
      {
        capability: 'Export',
        withOd: 'HTML aux dimensions exactes, exporté en PNG',
        without: 'Dimensionnement de canevas et réglages d’export manuels',
      },
      {
        capability: 'Reproductible',
        withOd: 'Une recette guidée par invite dans votre dépôt',
        without: 'Un fichier unique que vous recréez à chaque fois',
      },
      {
        capability: 'Coût et verrouillage',
        withOd: 'Open source, apportez vos propres clés, fonctionne en local',
        without: 'Outil de design par siège ou place de marché de modèles',
      },
    ],
    featuresTitle: 'Ce que vous pouvez créer',
    features: [
      { title: "Cartes sociales", body: "Des cartes X / Twitter composées avec votre titre et votre marque.", thumb: "example-card-twitter" },
      { title: "Couvertures d’articles", body: "Des couvertures éditoriales, style magazine, pour billets et newsletters.", thumb: "example-article-magazine" },
      { title: "Cartes Xiaohongshu", body: "Des cartes style RedNote calibrées pour ce fil.", thumb: "example-card-xiaohongshu" },
      { title: "Visuels hero", body: "Des visuels hero liquides et dégradés pour sites et lancements.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Carrousels", body: "Des carrousels sociaux multi-diapositives qui restent cohérents d’un cadre à l’autre.", thumb: "example-social-carousel" },
      { title: "Cadres de maquette UI", body: "Des cadres de notification et d’appareil pour le storytelling produit.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Des visuels créés avec Open Design',
    galleryLead:
      'De vraies cartes et couvertures rendues à partir d’une invite. Choisissez-en une proche de votre besoin et remplacez par votre texte.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Carte sociale pastel" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Affiche éditoriale tricolore" },
      { thumb: "example-magazine-poster", caption: "Affiche style magazine" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Couverture éditoriale audacieuse" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Parcourir les modèles de visuel',
    faqTitle: 'FAQ image',
    faq: [
      {
        q: 'Est-ce un générateur d’images IA comme Midjourney ?',
        a: 'Non. Open Design compose des visuels avec une vraie mise en page et une vraie typographie — votre titre, votre marque, des dimensions exactes — et les rend en HTML que vous exportez en PNG. C’est de la composition de design, pas de la génération de pixels.',
      },
      {
        q: 'Puis-je créer une série de cartes cohérente ?',
        a: 'Oui. Comme chaque visuel est un modèle, vous gardez la mise en page et changez le texte, si bien qu’une série entière reste parfaitement alignée et fidèle à la marque.',
      },
      {
        q: 'Quelles tailles peut-il produire ?',
        a: 'N’importe laquelle — le visuel est rendu aux dimensions exactes que vous précisez, d’une carte sociale carrée à une large bannière, puis exporté en PNG.',
      },
      {
        q: 'Quels agents puis-je utiliser ?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI et d’autres adaptateurs maison, avec vos propres clés de fournisseur.',
      },
    ],
    ctaTitle: 'Créez votre prochain visuel ce soir',
    ctaBody:
      'Mettez une étoile au dépôt, installez Open Design et transformez une invite en un visuel fidèle à la marque — dans l’agent que vous utilisez déjà.',
  },
  video: {
    title: 'Générer des motion graphics et des vidéos courtes avec Open Design + Claude Code',
    description:
      'Transformez un script en cadres animés et vidéos courtes — cartons-titres, fonds animés et outros composés avec votre système de marque et rendus à partir de HTML. Pas de suite de motion graphics, pas de défilement sur une timeline.',
    breadcrumb: 'Vidéo',
    label: 'Cas d’usage · Vidéo',
    heading: 'Des motion graphics à partir d’un script, pas d’une timeline',
    lead: 'Décrivez le moment que vous voulez — une apparition de titre, une animation de données, un outro de logo. Open Design compose des cadres animés avec votre système de marque et les rend en vidéo, sans suite de motion graphics requise.',
    heroImageAlt:
      'Illustration éditoriale d’un script se transformant en une séquence de cadres vidéo animés',
    tldrTitle: 'En une ligne',
    tldrBody:
      'Open Design transforme un script en cadres animés et fidèles à la marque que votre agent rend en vidéo courte — composés à partir de HTML, versionnés dans votre dépôt, sans éditeur de timeline à apprendre.',
    stepsTitle: 'Comment fonctionne le motion avec Open Design',
    steps: [
      {
        title: 'Décrivez le moment',
        body: 'Dites ce qui doit se passer — "un titre glitch qui se résout en notre logo, puis un carton de clôture." L’agent charge la compétence de motion pour produire des cadres animés, pas une image statique.',
        imageAlt: 'Illustration d’une personne décrivant une séquence animée',
      },
      {
        title: 'Appliquez le style de marque et de motion',
        body: 'Open Design fournit des modèles de cadres — fuites de lumière cinématiques, titres glitch, outros de logo — et applique vos couleurs et votre typographie, pour que le mouvement semble intentionnel et fidèle à la marque.',
        imageAlt: 'Illustration d’un style de marque appliqué à des cadres animés',
      },
      {
        title: 'Rendez les cadres en vidéo',
        body: 'Les cadres sont composés en HTML et rendus en vidéo, donc le timing et la mise en page sont précis et reproductibles — pas de keyframing manuel sur une timeline.',
        imageAlt: 'Illustration de cadres HTML rendus en un clip vidéo',
      },
      {
        title: 'Itérez et exportez',
        body: 'Affinez en parlant à l’agent — "ralentis l’apparition du titre, ajoute une légende." Exportez des clips courts pour le social ou le produit. La source reste dans votre projet.',
        imageAlt: 'Illustration d’un clip vidéo affiné et exporté pour le social',
      },
    ],
    tableTitle: 'Le motion avec Open Design vs l’ancienne méthode',
    tableColCapability: 'Ce dont vous avez besoin',
    tableColWithOd: 'Avec Open Design',
    tableColWithout: 'After Effects / suites de motion',
    tableRows: [
      {
        capability: 'Passer du script aux cadres animés',
        withOd: 'Une invite ; l’agent compose la séquence',
        without: 'Keyframer chaque élément sur une timeline à la main',
      },
      {
        capability: 'Rester fidèle à la marque',
        withOd: 'Modèles de cadres + vos couleurs et votre typographie',
        without: 'Reconstruire le style de marque par projet',
      },
      {
        capability: 'Timing précis et reproductible',
        withOd: 'Composé en HTML, rendu de façon déterministe',
        without: 'Défilement manuel, difficile à reproduire',
      },
      {
        capability: 'Export pour le social',
        withOd: 'Clips courts rendus en vidéo',
        without: 'Préréglages d’export et bataille avec les codecs',
      },
      {
        capability: 'Relecture et versionnage',
        withOd: 'La source des cadres vit dans votre dépôt, comparable',
        without: 'Fichier de projet binaire, pas de vrai diff',
      },
      {
        capability: 'Coût et verrouillage',
        withOd: 'Open source, apportez vos propres clés, fonctionne en local',
        without: 'Suite coûteuse, courbe d’apprentissage raide',
      },
    ],
    featuresTitle: 'Ce que vous pouvez animer',
    features: [
      { title: "Hyperframes", body: "Des séquences animées image par image composées à partir de HTML.", thumb: "example-video-hyperframes" },
      { title: "Social court", body: "Des clips verticaux conçus pour les fils sociaux.", thumb: "example-video-shortform" },
      { title: "Sets de cadres animés", body: "Des cadres animés réutilisables que vous assemblez en un clip.", thumb: "example-motion-frames" },
      { title: "Fuites de lumière cinématiques", body: "Des transitions cinématographiques et des fonds atmosphériques.", thumb: "example-frame-light-leak-cinema" },
      { title: "Titres glitch", body: "Des apparitions de titre avec mouvement et texture.", thumb: "example-frame-glitch-title" },
      { title: "Outros de logo", body: "Des animations de clôture aux couleurs de la marque pour tout clip.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Du motion créé avec Open Design',
    galleryLead:
      'De vrais cadres animés et clips rendus à partir d’une invite. Choisissez-en un proche de votre idée et décrivez le mouvement.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Séquence Hyperframes" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Fond animé liquide" },
      { thumb: "example-frame-macos-notification", caption: "Cadre UI animé" },
      { thumb: "example-frame-data-chart-nyt", caption: "Graphique de données animé" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Parcourir les modèles de motion',
    faqTitle: 'FAQ vidéo',
    faq: [
      {
        q: 'Ai-je besoin d’After Effects ou d’une suite de motion graphics ?',
        a: 'Non. Open Design compose des cadres animés en HTML et les rend en vidéo à l’intérieur de votre agent de code. Il n’y a aucun éditeur de timeline à apprendre ou à licencier.',
      },
      {
        q: 'Pour quel type de vidéo est-ce adapté ?',
        a: 'Le motion court — cartons-titres, animations de données, outros de logo, clips sociaux. C’est conçu pour le motion de marque et produit, pas pour le montage long format.',
      },
      {
        q: 'Le timing est-il reproductible ?',
        a: 'Oui. Comme les cadres sont composés en code et rendus de façon déterministe, vous obtenez le même résultat à chaque fois et pouvez l’ajuster précisément par une invite.',
      },
      {
        q: 'Quels agents puis-je utiliser ?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI et d’autres adaptateurs maison, avec vos propres clés de fournisseur.',
      },
    ],
    ctaTitle: 'Animez votre prochaine idée ce soir',
    ctaBody:
      'Mettez une étoile au dépôt, installez Open Design et transformez un script en motion — dans l’agent que vous utilisez déjà.',
  },
  designSystem: {
    title: 'Construire et appliquer un système de design avec Open Design + Claude Code',
    description:
      'Capturez votre marque comme un système de design réutilisable que votre agent de code applique à chaque artefact — couleurs, typographie, composants et ton dans un seul DESIGN.md. Définissez-le une fois ; chaque prototype, présentation et tableau de bord reste fidèle à la marque.',
    breadcrumb: 'Système de design',
    label: 'Cas d’usage · Système de design',
    heading: 'Un système de design, appliqué à tout ce que crée votre agent',
    lead: 'Définissez votre marque une fois et Open Design la porte dans chaque sortie — prototypes, présentations, tableaux de bord, visuels. Le système vit dans votre dépôt sous forme de DESIGN.md que l’agent lit, donc la cohérence est automatique, pas manuelle.',
    heroImageAlt:
      'Illustration éditoriale d’un seul système de design rayonnant vers de nombreux artefacts fidèles à la marque',
    tldrTitle: 'En une ligne',
    tldrBody:
      'Open Design capture votre marque comme un système de design portable que votre agent applique à chaque artefact — défini une fois dans votre dépôt, imposé partout, sans outil de design central qui en garde l’accès.',
    stepsTitle: 'Comment fonctionnent les systèmes de design avec Open Design',
    steps: [
      {
        title: 'Capturez le système',
        body: 'Décrivez votre marque — couleurs, typographie, espacements, voix — ou pointez l’agent vers un site existant pour l’extraire. Open Design l’écrit dans un DESIGN.md qui vit dans votre projet.',
        imageAlt: 'Illustration d’une marque capturée dans un seul fichier de système de design',
      },
      {
        title: 'Partez d’une base éprouvée',
        body: 'Open Design livre plus de 140 systèmes de design de référence — d’Apple et Linear à l’éditorial et au brutaliste. Forkez-en un proche de votre marque au lieu de partir d’une page blanche.',
        imageAlt: 'Illustration d’une galerie de systèmes de design de référence que l’on parcourt',
      },
      {
        title: 'Appliquez-le partout',
        body: 'Toutes les autres compétences lisent le même système, donc un prototype, une présentation et un tableau de bord partagent tous un langage visuel — sans que vous ayez à le re-spécifier à chaque fois.',
        imageAlt: 'Illustration d’un système appliqué de façon cohérente à de nombreux types d’artefacts',
      },
      {
        title: 'Faites-le évoluer en un seul endroit',
        body: 'Changez le système et le prochain rendu le reflète partout. Comme c’est un fichier dans votre dépôt, les décisions de design sont relues et versionnées comme du code.',
        imageAlt: 'Illustration d’un système de design mis à jour et se propageant à toutes les sorties',
      },
    ],
    tableTitle: 'Les systèmes de design avec Open Design vs l’ancienne méthode',
    tableColCapability: 'Ce dont vous avez besoin',
    tableColWithOd: 'Avec Open Design',
    tableColWithout: 'Bibliothèques d’outils de design / chartes graphiques',
    tableRows: [
      {
        capability: 'Définir le système',
        withOd: 'Un DESIGN.md que l’agent lit, forké depuis plus de 140 références',
        without: 'Une charte graphique statique ou une bibliothèque liée à un outil',
      },
      {
        capability: 'Appliquer à travers les types d’artefacts',
        withOd: 'Le même système alimente prototypes, présentations, tableaux de bord, visuels',
        without: 'Réimplémenté par outil et par fichier',
      },
      {
        capability: 'Tout garder cohérent',
        withOd: 'Automatique — chaque compétence lit une seule source',
        without: 'Discipline manuelle ; dérive avec le temps',
      },
      {
        capability: 'Faire évoluer la marque',
        withOd: 'Modifiez une fois ; le prochain rendu se met à jour partout',
        without: 'Chercher-remplacer à travers fichiers et outils',
      },
      {
        capability: 'Relecture et versionnage',
        withOd: 'Vit dans votre dépôt, comparable comme du code',
        without: 'Enfoui dans un outil de design, difficile à auditer',
      },
      {
        capability: 'Coût et verrouillage',
        withOd: 'Open source, portable, fonctionne en local',
        without: 'Verrouillé à un abonnement d’outil de design',
      },
    ],
    featuresTitle: 'Des systèmes d’où partir',
    features: [
      { title: "Apple", body: "Esthétique épurée, sobre, à police système.", thumb: "design-system-apple" },
      { title: "Linear", body: "Allure d’outil produit nette avec des espacements serrés.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Doux, centré sur le document, accessible.", thumb: "design-system-notion" },
      { title: "Figma", body: "Ludique, coloré, avec l’énergie d’un outil créatif.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimal, neutre, de qualité recherche.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Dense, technique, natif pour les développeurs.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Les systèmes de design dans Open Design',
    galleryLead:
      'Quelques-uns des plus de 140 systèmes de référence que vous pouvez forker comme point de départ. Choisissez-en un proche de votre marque et adaptez-le.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Système style Airbnb" },
      { thumb: "design-system-vercel", caption: "Système style Vercel" },
      { thumb: "design-system-stripe", caption: "Système style Stripe" },
      { thumb: "design-system-spotify", caption: "Système style Spotify" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Parcourir les systèmes de design',
    faqTitle: 'FAQ système de design',
    faq: [
      {
        q: 'Qu’est-ce exactement que le système de design ici ?',
        a: 'Un fichier DESIGN.md dans votre dépôt qui capture couleurs, typographie, espacements, composants et voix. Chaque compétence Open Design le lit, donc votre marque est appliquée automatiquement à tout ce que l’agent produit.',
      },
      {
        q: 'Dois-je partir de zéro ?',
        a: 'Non. Open Design livre plus de 140 systèmes de design de référence que vous pouvez forker — d’Apple et Linear à l’éditorial et au brutaliste — puis adapter à votre marque.',
      },
      {
        q: 'Comment reste-t-il cohérent entre présentations, tableaux de bord et prototypes ?',
        a: 'Parce que toutes ces compétences lisent le même DESIGN.md. Définissez le système une fois et la cohérence devient automatique au lieu d’être quelque chose que vous surveillez à la main.',
      },
      {
        q: 'Quels agents puis-je utiliser ?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI et d’autres adaptateurs maison, avec vos propres clés de fournisseur.',
      },
    ],
    ctaTitle: 'Définissez votre système de design ce soir',
    ctaBody:
      'Mettez une étoile au dépôt, installez Open Design et donnez à votre agent une marque à appliquer partout — dans l’agent que vous utilisez déjà.',
  },
};

const RU: SolutionLocaleCopy = {
  prototype: {
    title: 'Создавайте интерактивные прототипы с Open Design + Claude Code',
    description:
      'Превратите промпт в кликабельный многоэкранный прототип, не покидая терминал. Open Design даёт вашему кодинг-агенту дизайнерские навыки, шаблоны и дизайн-систему, чтобы выпускать настоящие прототипы, которые открываются в браузере.',
    breadcrumb: 'Прототип',
    label: 'Сценарий · Прототип',
    heading: 'Прототип со скоростью промпта',
    lead: 'Опишите задуманный поток, и агент соберёт настоящий кликабельный прототип — несколько экранов, общие стили и живые взаимодействия — отрисованный прямо в HTML, который можно открыть, поделиться и передать инженерам.',
    heroImageAlt:
      'Редакционная иллюстрация руки, набрасывающей вайрфрейм, который превращается в кликабельный многоэкранный прототип приложения',
    tldrTitle: 'В одну строку',
    tldrBody:
      'Open Design — это слой дизайна для кодинг-агента, которым вы уже пользуетесь. Для прототипирования это значит пройти путь от идеи в один абзац до навигируемого стилизованного прототипа за одну сессию — без дизайн-инструмента, без шага экспорта, без разрыва при передаче.',
    stepsTitle: 'Как работает прототипирование с Open Design',
    steps: [
      {
        title: 'Опишите поток',
        body: 'Расскажите агенту, что вы создаёте, простыми словами — «онбординг с экраном приветствия, выбором тарифа и подтверждением». Open Design загружает навык прототипирования, чтобы агент знал: нужны экраны, а не одна страница.',
        imageAlt:
          'Иллюстрация человека, набирающего в терминале описание потока приложения простым языком',
      },
      {
        title: 'Сгенерируйте стилизованные экраны',
        body: 'Агент применяет дизайн-систему и шаблоны прототипов из Open Design, поэтому каждый экран использует общую типографику, отступы и компоненты, а не выглядит черновиком. Вы получаете связный набор экранов, а не разрозненные макеты.',
        imageAlt:
          'Иллюстрация нескольких экранов приложения, появляющихся последовательно, все с одним единым визуальным стилем',
      },
      {
        title: 'Свяжите взаимодействия',
        body: 'Кнопки ведут по навигации, вкладки переключаются, модальные окна открываются. Прототип отрисовывается в самодостаточный HTML, поэтому ведёт себя как настоящий продукт в любом браузере — для просмотра не нужен аккаунт в инструменте прототипирования.',
        imageAlt:
          'Иллюстрация курсора, кликающего по связанным экранам со стрелками навигации между ними',
      },
      {
        title: 'Итерации и передача',
        body: 'Дорабатывайте, разговаривая с агентом — «сделай выбор тарифа в три колонки». Поскольку артефакт живёт в вашем проекте, дизайн и итоговый код имеют один источник истины, закрывая привычный разрыв при передаче от дизайнера к инженеру.',
        imageAlt:
          'Иллюстрация прототипа, который дорабатывается и затем передаётся инженеру, где дизайн и код сливаются в один файл',
      },
    ],
    tableTitle: 'Прототипирование с Open Design против старого подхода',
    tableColCapability: 'Что вам нужно',
    tableColWithOd: 'С Open Design',
    tableColWithout: 'Традиционные инструменты прототипирования',
    tableRows: [
      {
        capability: 'Пройти путь от идеи к первому экрану',
        withOd: 'Один промпт в агенте, который у вас уже открыт',
        without: 'Открыть отдельный инструмент, создать файл, вручную расставлять блоки',
      },
      {
        capability: 'Несколько связанных экранов',
        withOd: 'Генерируются как набор с общими стилями и рабочей навигацией',
        without: 'Каждый кадр рисуется и связывается вручную',
      },
      {
        capability: 'Единая визуальная система',
        withOd: 'Берётся из переиспользуемой дизайн-системы, которую применяет агент',
        without: 'Пересоздаётся в каждом файле или поддерживается вручную',
      },
      {
        capability: 'Результат, которым можно поделиться',
        withOd: 'Самодостаточный HTML — открывается в любом браузере, без аккаунта',
        without: 'Зрителю нужно место в подписке или ссылка для доступа в инструменте вендора',
      },
      {
        capability: 'Путь к реальному коду',
        withOd: 'Артефакт живёт в вашем репозитории; дизайн и код имеют один источник',
        without: 'Пересобирается с нуля после отдельной передачи',
      },
      {
        capability: 'Стоимость и привязка к вендору',
        withOd: 'Открытый исходный код, свои ключи, работает локально',
        without: 'Подписка за каждое место, хостинг у вендора, ограничения экспорта',
      },
    ],
    featuresTitle: 'Что можно прототипировать',
    features: [
      {
        title: 'Многоэкранные веб-приложения',
        body: 'Полноценные потоки с общей навигацией — онбординг, дашборды, настройки — а не отдельные страницы.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Потоки мобильных приложений',
        body: 'Поэкранные мобильные сценарии с переходами и состояниями, ощущающимися нативно.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Лендинги',
        body: 'Маркетинговые страницы и SaaS-лендинги, которые можно прокликать и выпустить.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Любой визуальный вкус',
        body: 'Редакционный, мягкий или брутализм — прототип несёт связный стиль от начала до конца.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Список ожидания и тарифы',
        body: 'Конверсионные поверхности — списки ожидания, таблицы тарифов — связанные и в фирменном стиле.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Геймификация и игровость',
        body: 'Насыщенные взаимодействием концепции, где движение и состояние — часть подачи.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Прототипы, созданные людьми с Open Design',
    galleryLead:
      'Каждый из них начинался как промпт и отрисовывался в кликабельный артефакт. Выберите шаблон, близкий к вашей идее, опишите свою вариацию — и агент адаптирует его.',
    gallery: [
      { thumb: "example-dating-web", caption: "Веб-приложение для знакомств — многоэкранный поток" },
      { thumb: "example-hr-onboarding", caption: "Поток HR-онбординга" },
      { thumb: "example-kami-landing", caption: "Лендинг продукта" },
      { thumb: "example-web-prototype-taste-soft", caption: "Веб-прототип в мягком стиле" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Просмотреть шаблоны прототипов',
    faqTitle: 'FAQ по прототипированию',
    faq: [
      {
        q: 'Нужен ли мне дизайн-инструмент вроде Figma, чтобы прототипировать с Open Design?',
        a: 'Нет. Open Design работает внутри вашего кодинг-агента и отрисовывает прототипы в HTML. Вы описываете поток словами, агент создаёт экраны. Нет отдельного инструмента-холста, который надо осваивать или оплачивать.',
      },
      {
        q: 'Прототипы интерактивны или это просто статичные макеты?',
        a: 'Интерактивны. Навигация, вкладки и модальные окна работают, потому что на выходе настоящий HTML и CSS. Вы можете прокликать их в любом браузере точно так же, как это сделал бы пользователь.',
      },
      {
        q: 'Какие агенты можно использовать?',
        a: 'Open Design работает с Claude Code, Codex, Cursor Agent, Gemini CLI и десятком других нативных адаптеров. Вы используете свои ключи провайдера; ничего не хостится за вас.',
      },
      {
        q: 'Может ли прототип стать реальным продуктом?',
        a: 'В этом и смысл. Артефакт живёт в вашем проекте, поэтому та же дизайн-система и компоненты переходят в продакшен-код, а не выбрасываются после передачи.',
      },
    ],
    ctaTitle: 'Прототипируйте свою следующую идею сегодня вечером',
    ctaBody:
      'Поставьте звезду репозиторию, установите Open Design и превратите своё следующее «а что если» во что-то кликабельное — в агенте, которым вы уже пользуетесь.',
  },
  dashboard: {
    title: 'Создавайте дашборды данных с Open Design + Claude Code',
    description:
      'Опишите метрики, которые вы отслеживаете, и пусть ваш кодинг-агент построит стилизованный адаптивный дашборд — графики, KPI-карточки и таблицы, отрисованные в HTML, который можно разместить где угодно. Без места в BI-инструменте, без drag-and-drop-конструктора.',
    breadcrumb: 'Дашборд',
    label: 'Сценарий · Дашборд',
    heading: 'Дашборды из описания, а не из drag-and-drop-конструктора',
    lead: 'Скажите агенту, что показать и каким это должно ощущаться. Open Design предоставляет паттерны графиков, систему компоновки и визуальный язык, чтобы вы получили связный презентабельный дашборд — а не стену виджетов со стандартным оформлением.',
    heroImageAlt:
      'Редакционная иллюстрация сырых чисел слева, перетекающих в аккуратный дашборд из графиков и KPI-карточек справа',
    tldrTitle: 'В одну строку',
    tldrBody:
      'Open Design превращает описание ваших метрик простым языком в стилизованный дашборд, который агент отрисовывает в HTML — версионируется в вашем репозитории, размещается где угодно, без подписки на BI за каждое место.',
    stepsTitle: 'Как работают дашборды с Open Design',
    steps: [
      {
        title: 'Опишите метрики',
        body: 'Перечислите, что важно — «недельные активные пользователи, выручка по тарифам, отток и тренд за 30 дней». Агент загружает навык дашборда, чтобы знать: нужно разместить KPI-карточки, графики и таблицу, а не один блок текста.',
        imageAlt: 'Иллюстрация человека, перечисляющего важные для него метрики',
      },
      {
        title: 'Выберите паттерны графиков',
        body: 'Open Design поставляет шаблоны графиков и компоновки, поэтому тренды становятся линейными графиками, разбивки — столбчатыми, а соотношения — нужной визуализацией, с единой типографикой и отступами повсюду вместо разнобоя стандартов.',
        imageAlt: 'Иллюстрация нескольких типов графиков, выстроенных в связную сетку',
      },
      {
        title: 'Подключите данные',
        body: 'Направьте дашборд на CSV, JSON-эндпоинт или вставьте примеры строк. Он отрисовывается в самодостаточный HTML, который обновляется при изменении данных — откройте его в любом браузере, разместите на любом статическом хостинге.',
        imageAlt: 'Иллюстрация файла данных, подключающегося к дашборду с живым обновлением',
      },
      {
        title: 'Доработайте и выпустите',
        body: 'Настраивайте, разговаривая с агентом — «сгруппируй выручку по регионам, перенеси ряд KPI наверх». Артефакт живёт в вашем проекте, поэтому дашборд можно ревьюить и версионировать как любой другой код.',
        imageAlt: 'Иллюстрация дашборда, который дорабатывается и затем разворачивается',
      },
    ],
    tableTitle: 'Дашборды с Open Design против старого подхода',
    tableColCapability: 'Что вам нужно',
    tableColWithOd: 'С Open Design',
    tableColWithout: 'BI-инструменты / ручное кодирование',
    tableRows: [
      {
        capability: 'Пройти путь от списка метрик к компоновке',
        withOd: 'Один промпт; агент раскладывает карточки, графики и таблицы',
        without: 'Перетаскивать виджеты по одному или писать код графиков с нуля',
      },
      {
        capability: 'Единая визуальная система',
        withOd: 'Паттерны графиков и отступы из переиспользуемой дизайн-системы',
        without: 'Стандартные стили виджетов или ручное оформление каждого графика',
      },
      {
        capability: 'Подключить данные',
        withOd: 'CSV / JSON / вставленные строки, отрисованные в живой HTML',
        without: 'Коннекторы вендора или кастомная обвязка данных',
      },
      {
        capability: 'Хостинг и доступ',
        withOd: 'Самодостаточный HTML на любом статическом хостинге, без аккаунта',
        without: 'Зрителю нужно место в BI-вендоре',
      },
      {
        capability: 'Ревью и версионирование',
        withOd: 'Живёт в вашем репозитории; различимо как код',
        without: 'Заперто внутри вендора, без настоящего diff',
      },
      {
        capability: 'Стоимость и привязка к вендору',
        withOd: 'Открытый исходный код, свои ключи, работает локально',
        without: 'Подписка за каждое место, хостинг у вендора',
      },
    ],
    featuresTitle: "Что можно построить",
    features: [
      { title: "Продуктовая аналитика", body: "Активные пользователи, воронки, удержание — метрики, в которых живёт продуктовая команда.", thumb: "example-dashboard" },
      { title: "Метрики репозитория и разработки", body: "Звёзды, PR, состояние CI — инженерные дашборды из ваших собственных данных.", thumb: "example-github-dashboard" },
      { title: "Финансовые отчёты", body: "Выручка, расходы, запас прочности, оформленные как отчёт, которым можно поделиться.", thumb: "example-finance-report" },
      { title: "Живые операции", body: "Метрики в реальном времени, которые обновляются по мере движения данных.", thumb: "example-live-dashboard" },
      { title: "Соцсети и маркетинг", body: "Эффективность каналов и отслеживание кампаний в одном представлении.", thumb: "example-social-media-dashboard" },
      { title: "Отраслевые отчёты", body: "Структурированные отчёты для любой сферы — от клинической до трейдинга.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Дашборды, созданные людьми с Open Design',
    galleryLead:
      'Настоящие дашборды, отрисованные из промпта и источника данных. Начните с близкого к вашему и опишите метрики, которые вы отслеживаете.',
    gallery: [
      { thumb: "example-data-report", caption: "Отчёт по данным" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Дашборд живых операций" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Дашборд анализа трейдинга" },
      { thumb: "example-frame-data-chart-nyt", caption: "Редакционный график данных" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Просмотреть шаблоны дашбордов',
    faqTitle: 'FAQ по дашбордам',
    faq: [
      {
        q: 'Нужен ли мне BI-инструмент вроде Tableau или Looker?',
        a: 'Нет. Open Design отрисовывает дашборды в HTML внутри вашего кодинг-агента. Вы описываете метрики и указываете на свои данные; нет отдельной BI-платформы, которую надо лицензировать или осваивать.',
      },
      {
        q: 'Откуда берутся данные?',
        a: 'Из CSV, JSON-эндпоинта или строк, которые вы вставляете. Дашборд — это обычный HTML и JavaScript, поэтому вы точно контролируете, откуда он читает — ничего не проксируется через хостинговый сервис.',
      },
      {
        q: 'Смогут ли его просматривать нетехнические коллеги?',
        a: 'Да. На выходе самодостаточная веб-страница. Любой со ссылкой или файлом может открыть её в браузере — без аккаунта, без места в подписке.',
      },
      {
        q: 'Какие агенты можно использовать?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI и десяток других нативных адаптеров. Вы используете свои ключи провайдера.',
      },
    ],
    ctaTitle: 'Постройте свой дашборд сегодня вечером',
    ctaBody:
      'Поставьте звезду репозиторию, установите Open Design и превратите свои метрики в дашборд, который можно разместить где угодно — в агенте, которым вы уже пользуетесь.',
  },
  slides: {
    title: 'Создавайте презентации с Open Design + Claude Code',
    description:
      'Превратите план в оформленную фирменную презентацию, не открывая приложение для презентаций. Open Design даёт вашему кодинг-агенту шаблоны слайдов и визуальную систему, отрисовывая слайды в HTML, который можно показывать, экспортировать или которым можно делиться.',
    breadcrumb: 'Слайды',
    label: 'Сценарий · Слайды',
    heading: 'Презентации, которые выглядят оформленными, написанные промптом',
    lead: 'Передайте агенту план и тон. Open Design применяет шаблон презентации и визуальную систему, поэтому каждый слайд скомпонован, набран и в фирменном стиле — а не список пунктов на пустом фоне.',
    heroImageAlt:
      'Редакционная иллюстрация плана слева, превращающегося в последовательность оформленных слайдов презентации справа',
    tldrTitle: 'В одну строку',
    tldrBody:
      'Open Design превращает план в оформленную HTML-презентацию, которую агент отрисовывает за одну сессию — показывайте её в браузере, экспортируйте в PDF или PPTX и храните исходник в вашем репозитории.',
    stepsTitle: 'Как работают презентации с Open Design',
    steps: [
      {
        title: 'Передайте план',
        body: 'Вставьте тезисы или черновую структуру. Агент загружает навык презентации, чтобы создать последовательность скомпонованных слайдов, а не один длинный документ.',
        imageAlt: 'Иллюстрация текстового плана, передаваемого агенту',
      },
      {
        title: 'Выберите стиль презентации',
        body: 'Open Design поставляет шаблоны презентаций — редакционный, швейцарский интернациональный, тёмный технический и другие. Агент применяет один из них, чтобы типографика, сетка и акценты оставались согласованными на каждом слайде.',
        imageAlt: 'Иллюстрация нескольких вариантов стиля презентации, выложенных рядом',
      },
      {
        title: 'Сгенерируйте слайды',
        body: 'Каждый тезис становится оформленным слайдом с правильной иерархией — заголовки, поддерживающие визуалы, выноски с данными. Он отрисовывается в HTML, поэтому показывается на весь экран в любом браузере.',
        imageAlt: 'Иллюстрация последовательности готовых слайдов с согласованным оформлением',
      },
      {
        title: 'Показывайте, экспортируйте, итерируйте',
        body: 'Показывайте из браузера или экспортируйте в PDF / PPTX, чтобы поделиться. Дорабатывайте, разговаривая с агентом — «подтяни слайд с данными, добавь финальный призыв к действию». Исходник презентации остаётся в вашем проекте.',
        imageAlt: 'Иллюстрация презентации, которую показывают и экспортируют в несколько форматов',
      },
    ],
    tableTitle: 'Презентации с Open Design против старого подхода',
    tableColCapability: 'Что вам нужно',
    tableColWithOd: 'С Open Design',
    tableColWithout: 'PowerPoint / Keynote / ИИ-инструменты для слайдов',
    tableRows: [
      {
        capability: 'Пройти путь от плана к слайдам',
        withOd: 'Один промпт; агент компонует каждый слайд',
        without: 'Строить каждый слайд вручную или бороться с шаблоном',
      },
      {
        capability: 'Согласованный дизайн',
        withOd: 'Шаблоны презентаций с настоящей сеткой и системой шрифтов',
        without: 'Расползание темы, ручное выравнивание, стандарты вне фирменного стиля',
      },
      {
        capability: 'Данные и диаграммы',
        withOd: 'Графики и выноски отрисованы как часть слайда',
        without: 'Вставлять статичные картинки или каждый раз пересобирать графики',
      },
      {
        capability: 'Форматы экспорта',
        withOd: 'HTML для показа, плюс экспорт в PDF / PPTX',
        without: 'Привязка к формату одного приложения',
      },
      {
        capability: 'Ревью и версионирование',
        withOd: 'Исходник живёт в вашем репозитории, различим',
        without: 'Бинарный файл, без осмысленного diff',
      },
      {
        capability: 'Стоимость и привязка к вендору',
        withOd: 'Открытый исходный код, свои ключи, работает локально',
        without: 'Лицензия на приложение или ИИ-надстройка за каждое место',
      },
    ],
    featuresTitle: "Что можно презентовать",
    features: [
      { title: "Питч-деки", body: "Инвесторские и продажные презентации с сильным нарративом и чистыми слайдами с данными.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Швейцарский / редакционный", body: "Построенные на сетке типографические презентации, выглядящие как с арт-дирекшеном.", thumb: "example-deck-swiss-international" },
      { title: "Учебные модули", body: "Обучающие презентации с чёткими шагами, выносками и темпом.", thumb: "example-html-ppt-course-module" },
      { title: "Презентации с графиками данных", body: "Тёмные, ориентированные на графики презентации для аналитики и обзоров.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Режим докладчика", body: "Презентации в стиле Reveal, созданные для живого показа в браузере.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Технические схемы", body: "Архитектурные и знаниевые презентации, описывающие сложные системы.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Презентации, созданные людьми с Open Design',
    galleryLead:
      'Настоящие презентации, отрисованные из плана. Выберите стиль, близкий к вашему выступлению, и опишите содержание.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Редакционная журнальная презентация" },
      { thumb: "example-guizang-ppt", caption: "Иллюстрированный кейноут" },
      { thumb: "example-deck-open-slide-canvas", caption: "Презентация на открытом холсте слайдов" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Презентация с градиентной темой" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Просмотреть шаблоны презентаций',
    faqTitle: 'FAQ по слайдам',
    faq: [
      {
        q: 'Нужен ли мне PowerPoint или Keynote?',
        a: 'Нет. Open Design отрисовывает презентации в HTML внутри вашего кодинг-агента и может экспортировать в PDF или PPTX. Вы показываете из браузера или передаёте файл — для создания презентации приложение не нужно.',
      },
      {
        q: 'Это просто сгенерированные ИИ списки пунктов?',
        a: 'Нет. Агент применяет настоящий шаблон презентации с сеткой, шкалой шрифтов и визуальной иерархией, поэтому слайды выглядят оформленными, а не автозаполненными.',
      },
      {
        q: 'Могу ли я экспортировать в PowerPoint для клиента?',
        a: 'Да. Презентации экспортируются в PPTX и PDF в дополнение к HTML, из которого вы показываете, поэтому подходят под любые ожидания аудитории.',
      },
      {
        q: 'Какие агенты можно использовать?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI и другие нативные адаптеры, с вашими собственными ключами провайдера.',
      },
    ],
    ctaTitle: 'Постройте свою следующую презентацию сегодня вечером',
    ctaBody:
      'Поставьте звезду репозиторию, установите Open Design и превратите свой план в оформленную презентацию — в агенте, которым вы уже пользуетесь.',
  },
  image: {
    title: 'Создавайте фирменную графику с Open Design + Claude Code',
    description:
      'Создавайте карточки для соцсетей, обложки статей и маркетинговую графику из промпта — скомпонованную с настоящей типографикой и вашей фирменной системой, отрисованную в чёткий HTML, который можно экспортировать в PNG. Без дизайн-приложения, без подписки на шаблоны.',
    breadcrumb: 'Изображение',
    label: 'Сценарий · Изображение',
    heading: 'Фирменная графика, сгенерированная и скомпонованная за вас',
    lead: 'Опишите нужную карточку или обложку. Open Design компонует её с настоящим шрифтом, сеткой и вашими фирменными цветами — затем отрисовывает в HTML, который можно экспортировать как изображение, вместо борьбы с дизайн-приложением или универсальным шаблоном.',
    heroImageAlt:
      'Редакционная иллюстрация промпта, превращающегося в набор скомпонованных карточек для соцсетей и обложек статей',
    tldrTitle: 'В одну строку',
    tldrBody:
      'Open Design превращает промпт в набранную фирменную графику, которую агент отрисовывает в HTML и экспортирует в PNG — повторяемую, версионируемую и свободную от дизайн-инструментов с оплатой за место.',
    stepsTitle: 'Как работает графика с Open Design',
    steps: [
      {
        title: 'Опишите графику',
        body: 'Скажите, что это — «карточка для Twitter к нашему запуску с заголовком и цитатой». Агент загружает нужный навык, чтобы скомпоновать оформленную графику, а не простой текстовый блок.',
        imageAlt: 'Иллюстрация человека, описывающего нужную ему карточку для соцсетей',
      },
      {
        title: 'Примените фирменную систему',
        body: 'Open Design берёт ваши цвета, шрифт и отступы из переиспользуемой дизайн-системы, поэтому каждая карточка соответствует остальному вашему бренду, а не выглядит разовой.',
        imageAlt: 'Иллюстрация фирменных цветов и шрифта, применяемых к компоновке карточки',
      },
      {
        title: 'Отрисуйте и экспортируйте',
        body: 'Графика отрисовывается в HTML в точно нужных размерах — карточка для соцсетей, обложка, баннер — затем экспортируется в PNG. Чёткий текст, настоящая компоновка, без ручной подгонки.',
        imageAlt: 'Иллюстрация графики, отрисовываемой и экспортируемой в файл изображения',
      },
      {
        title: 'Переиспользуйте рецепт',
        body: 'Поскольку это шаблон, следующая графика — в одном промпте: смените заголовок, сохраните компоновку. Серии карточек остаются идеально согласованными.',
        imageAlt: 'Иллюстрация одного шаблона карточки, создающего согласованную серию графики',
      },
    ],
    tableTitle: 'Графика с Open Design против старого подхода',
    tableColCapability: 'Что вам нужно',
    tableColWithOd: 'С Open Design',
    tableColWithout: 'Дизайн-приложения / универсальные шаблоны',
    tableRows: [
      {
        capability: 'Пройти путь от идеи к скомпонованной графике',
        withOd: 'Один промпт; агент компонует шрифт и компоновку',
        without: 'Открыть приложение, разместить каждый элемент вручную',
      },
      {
        capability: 'Оставаться в фирменном стиле',
        withOd: 'Цвета и шрифт из переиспользуемой дизайн-системы',
        without: 'Заново подбирать фирменные стили в каждом файле или уходить от бренда',
      },
      {
        capability: 'Согласованная серия',
        withOd: 'Тот же шаблон, новый текст — идеально выровненный набор',
        without: 'Заново выравнивать каждый вариант вручную',
      },
      {
        capability: 'Экспорт',
        withOd: 'HTML в точных размерах, экспортируется в PNG',
        without: 'Ручная настройка размера холста и параметров экспорта',
      },
      {
        capability: 'Повторяемость',
        withOd: 'Рецепт на основе промпта в вашем репозитории',
        without: 'Разовый файл, который пересоздаётся каждый раз',
      },
      {
        capability: 'Стоимость и привязка к вендору',
        withOd: 'Открытый исходный код, свои ключи, работает локально',
        without: 'Дизайн-инструмент с оплатой за место или маркетплейс шаблонов',
      },
    ],
    featuresTitle: "Что можно создать",
    features: [
      { title: "Карточки для соцсетей", body: "Карточки для X / Twitter, скомпонованные с вашим заголовком и брендом.", thumb: "example-card-twitter" },
      { title: "Обложки статей", body: "Редакционные обложки в журнальном стиле для постов и рассылок.", thumb: "example-article-magazine" },
      { title: "Карточки Xiaohongshu", body: "Карточки в стиле RedNote, настроенные под эту ленту.", thumb: "example-card-xiaohongshu" },
      { title: "Hero-графика", body: "Текучие градиентные hero-визуалы для сайтов и запусков.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Карусели", body: "Многослайдовые карусели для соцсетей, остающиеся согласованными между кадрами.", thumb: "example-social-carousel" },
      { title: "Макетные UI-кадры", body: "Кадры уведомлений и устройств для продуктового сторителлинга.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Графика, созданная людьми с Open Design',
    galleryLead:
      'Настоящие карточки и обложки, отрисованные из промпта. Выберите близкую к нужной и подставьте свой текст.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Пастельная карточка для соцсетей" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Редакционный трёхцветный плакат" },
      { thumb: "example-magazine-poster", caption: "Плакат в журнальном стиле" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Смелая редакционная обложка" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Просмотреть шаблоны графики',
    faqTitle: 'FAQ по изображениям',
    faq: [
      {
        q: 'Это ИИ-генератор изображений вроде Midjourney?',
        a: 'Нет. Open Design компонует графику с настоящей компоновкой и типографикой — ваш заголовок, ваш бренд, точные размеры — и отрисовывает в HTML, который вы экспортируете в PNG. Это дизайн-композиция, а не генерация пикселей.',
      },
      {
        q: 'Могу ли я создать согласованную серию карточек?',
        a: 'Да. Поскольку каждая графика — это шаблон, вы сохраняете компоновку и меняете текст, поэтому вся серия остаётся идеально выровненной и в фирменном стиле.',
      },
      {
        q: 'Какие размеры она может создавать?',
        a: 'Любые — графика отрисовывается в точно указанных вами размерах, от квадратной карточки для соцсетей до широкого баннера, затем экспортируется в PNG.',
      },
      {
        q: 'Какие агенты можно использовать?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI и другие нативные адаптеры, с вашими собственными ключами провайдера.',
      },
    ],
    ctaTitle: 'Создайте свою следующую графику сегодня вечером',
    ctaBody:
      'Поставьте звезду репозиторию, установите Open Design и превратите промпт в фирменную графику — в агенте, которым вы уже пользуетесь.',
  },
  video: {
    title: 'Создавайте моушн-графику и короткие видео с Open Design + Claude Code',
    description:
      'Превратите сценарий в анимированные кадры и короткие видео — титульные карточки, движущиеся фоны и аутро, скомпонованные с вашей фирменной системой и отрисованные из HTML. Без пакета моушн-графики, без перетаскивания по таймлайну.',
    breadcrumb: 'Видео',
    label: 'Сценарий · Видео',
    heading: 'Моушн-графика из сценария, а не из таймлайна',
    lead: 'Опишите нужный момент — появление заголовка, анимация данных, аутро с логотипом. Open Design компонует анимированные кадры с вашей фирменной системой и отрисовывает их в видео, без пакета моушн-графики.',
    heroImageAlt:
      'Редакционная иллюстрация сценария, превращающегося в последовательность анимированных видеокадров',
    tldrTitle: 'В одну строку',
    tldrBody:
      'Open Design превращает сценарий в анимированные фирменные кадры, которые агент отрисовывает в короткие видео — скомпонованные из HTML, версионируемые в вашем репозитории, без таймлайн-редактора, который надо осваивать.',
    stepsTitle: 'Как работает моушн с Open Design',
    steps: [
      {
        title: 'Опишите момент',
        body: 'Скажите, что должно произойти — «глитч-заголовок, переходящий в наш логотип, затем финальная карточка». Агент загружает навык моушна, чтобы создать анимированные кадры, а не статичную картинку.',
        imageAlt: 'Иллюстрация человека, описывающего моушн-последовательность',
      },
      {
        title: 'Примените бренд и стиль движения',
        body: 'Open Design предоставляет шаблоны кадров — кинематографические засветки, глитч-заголовки, аутро с логотипом — и применяет ваши цвета и шрифт, чтобы движение выглядело продуманным и в фирменном стиле.',
        imageAlt: 'Иллюстрация фирменного оформления, применённого к анимированным кадрам',
      },
      {
        title: 'Отрисуйте кадры в видео',
        body: 'Кадры компонуются в HTML и отрисовываются в видео, поэтому тайминг и компоновка точны и повторяемы — без ручной расстановки ключевых кадров на таймлайне.',
        imageAlt: 'Иллюстрация HTML-кадров, отрисовываемых в видеоклип',
      },
      {
        title: 'Итерируйте и экспортируйте',
        body: 'Дорабатывайте, разговаривая с агентом — «замедли появление заголовка, добавь подпись». Экспортируйте короткие клипы для соцсетей или продукта. Исходник остаётся в вашем проекте.',
        imageAlt: 'Иллюстрация видеоклипа, который дорабатывается и экспортируется для соцсетей',
      },
    ],
    tableTitle: 'Моушн с Open Design против старого подхода',
    tableColCapability: 'Что вам нужно',
    tableColWithOd: 'С Open Design',
    tableColWithout: 'After Effects / пакеты моушна',
    tableRows: [
      {
        capability: 'Пройти путь от сценария к анимированным кадрам',
        withOd: 'Один промпт; агент компонует последовательность',
        without: 'Вручную расставлять ключевые кадры для каждого элемента на таймлайне',
      },
      {
        capability: 'Оставаться в фирменном стиле',
        withOd: 'Шаблоны кадров + ваши цвета и шрифт',
        without: 'Пересобирать фирменное оформление под каждый проект',
      },
      {
        capability: 'Точный, повторяемый тайминг',
        withOd: 'Скомпонован в HTML, отрисован детерминированно',
        without: 'Ручная перемотка, трудно воспроизвести',
      },
      {
        capability: 'Экспорт для соцсетей',
        withOd: 'Короткие клипы, отрисованные в видео',
        without: 'Пресеты экспорта и возня с кодеками',
      },
      {
        capability: 'Ревью и версионирование',
        withOd: 'Исходник кадров живёт в вашем репозитории, различим',
        without: 'Бинарный файл проекта, без настоящего diff',
      },
      {
        capability: 'Стоимость и привязка к вендору',
        withOd: 'Открытый исходный код, свои ключи, работает локально',
        without: 'Дорогой пакет, крутая кривая обучения',
      },
    ],
    featuresTitle: "Что можно анимировать",
    features: [
      { title: "Hyperframes", body: "Покадровые моушн-последовательности, скомпонованные из HTML.", thumb: "example-video-hyperframes" },
      { title: "Короткий формат для соцсетей", body: "Вертикальные клипы, созданные для лент соцсетей.", thumb: "example-video-shortform" },
      { title: "Наборы моушн-кадров", body: "Переиспользуемые анимированные кадры, которые вы компонуете в клип.", thumb: "example-motion-frames" },
      { title: "Кинематографические засветки", body: "Кинематографичные переходы и атмосферные фоны.", thumb: "example-frame-light-leak-cinema" },
      { title: "Глитч-заголовки", body: "Появления заголовков с движением и текстурой.", thumb: "example-frame-glitch-title" },
      { title: "Аутро с логотипом", body: "Фирменные финальные анимации для любого клипа.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Моушн, созданный людьми с Open Design',
    galleryLead:
      'Настоящие анимированные кадры и клипы, отрисованные из промпта. Выберите близкий к вашей идее и опишите движение.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Последовательность Hyperframes" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Текучий движущийся фон" },
      { thumb: "example-frame-macos-notification", caption: "Анимированный UI-кадр" },
      { thumb: "example-frame-data-chart-nyt", caption: "Анимированный график данных" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Просмотреть шаблоны моушна',
    faqTitle: 'FAQ по видео',
    faq: [
      {
        q: 'Нужен ли мне After Effects или пакет моушн-графики?',
        a: 'Нет. Open Design компонует анимированные кадры в HTML и отрисовывает их в видео внутри вашего кодинг-агента. Нет таймлайн-редактора, который надо осваивать или лицензировать.',
      },
      {
        q: 'Для какого видео это подходит?',
        a: 'Короткий моушн — титульные карточки, анимации данных, аутро с логотипом, клипы для соцсетей. Это создано для брендового и продуктового движения, а не для полнометражного монтажа.',
      },
      {
        q: 'Воспроизводим ли тайминг?',
        a: 'Да. Поскольку кадры компонуются в коде и отрисовываются детерминированно, вы получаете один и тот же результат каждый раз и можете точно подстроить его промптом.',
      },
      {
        q: 'Какие агенты можно использовать?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI и другие нативные адаптеры, с вашими собственными ключами провайдера.',
      },
    ],
    ctaTitle: 'Анимируйте свою следующую идею сегодня вечером',
    ctaBody:
      'Поставьте звезду репозиторию, установите Open Design и превратите сценарий в движение — в агенте, которым вы уже пользуетесь.',
  },
  designSystem: {
    title: 'Создавайте и применяйте дизайн-систему с Open Design + Claude Code',
    description:
      'Зафиксируйте свой бренд как переиспользуемую дизайн-систему, которую ваш кодинг-агент применяет к каждому артефакту — цвета, шрифт, компоненты и тон в одном DESIGN.md. Определите один раз; каждый прототип, презентация и дашборд остаются в фирменном стиле.',
    breadcrumb: 'Дизайн-система',
    label: 'Сценарий · Дизайн-система',
    heading: 'Одна дизайн-система, применяемая ко всему, что создаёт ваш агент',
    lead: 'Определите свой бренд один раз, и Open Design перенесёт его в каждый результат — прототипы, презентации, дашборды, графику. Система живёт в вашем репозитории как DESIGN.md, который читает агент, поэтому согласованность автоматическая, а не ручная.',
    heroImageAlt:
      'Редакционная иллюстрация одной дизайн-системы, расходящейся во множество фирменных артефактов',
    tldrTitle: 'В одну строку',
    tldrBody:
      'Open Design фиксирует ваш бренд как переносимую дизайн-систему, которую агент применяет к каждому артефакту — определена один раз в вашем репозитории, действует везде, без центрального дизайн-инструмента, который её контролирует.',
    stepsTitle: 'Как работают дизайн-системы с Open Design',
    steps: [
      {
        title: 'Зафиксируйте систему',
        body: 'Опишите свой бренд — цвета, шрифт, отступы, голос — или направьте агента на существующий сайт, чтобы извлечь их. Open Design записывает это в DESIGN.md, который живёт в вашем проекте.',
        imageAlt: 'Иллюстрация бренда, фиксируемого в единый файл дизайн-системы',
      },
      {
        title: 'Начните с проверенной основы',
        body: 'Open Design поставляет более 140 эталонных дизайн-систем — от Apple и Linear до редакционных и брутализма. Сделайте форк близкой к вашему бренду вместо старта с пустой страницы.',
        imageAlt: 'Иллюстрация просмотра галереи эталонных дизайн-систем',
      },
      {
        title: 'Применяйте везде',
        body: 'Каждый другой навык читает ту же систему, поэтому прототип, презентация и дашборд используют один визуальный язык — без необходимости заново задавать его каждый раз.',
        imageAlt: 'Иллюстрация одной системы, согласованно применённой к множеству типов артефактов',
      },
      {
        title: 'Развивайте её в одном месте',
        body: 'Измените систему — и следующая отрисовка отразит это везде. Поскольку это файл в вашем репозитории, дизайн-решения ревьюятся и версионируются как код.',
        imageAlt: 'Иллюстрация дизайн-системы, которая обновляется и распространяется на все результаты',
      },
    ],
    tableTitle: 'Дизайн-системы с Open Design против старого подхода',
    tableColCapability: 'Что вам нужно',
    tableColWithOd: 'С Open Design',
    tableColWithout: 'Библиотеки дизайн-инструментов / гайды по стилю',
    tableRows: [
      {
        capability: 'Определить систему',
        withOd: 'DESIGN.md, который читает агент, форкнутый из более чем 140 эталонов',
        without: 'Статичный гайд по стилю или библиотека, привязанная к инструменту',
      },
      {
        capability: 'Применять к разным типам артефактов',
        withOd: 'Та же система питает прототипы, презентации, дашборды, графику',
        without: 'Реализуется заново под каждый инструмент и каждый файл',
      },
      {
        capability: 'Сохранять всё согласованным',
        withOd: 'Автоматически — каждый навык читает один источник',
        without: 'Ручная дисциплина; со временем расползается',
      },
      {
        capability: 'Развивать бренд',
        withOd: 'Отредактируйте один раз; следующая отрисовка обновляется везде',
        without: 'Поиск и замена по файлам и инструментам',
      },
      {
        capability: 'Ревью и версионирование',
        withOd: 'Живёт в вашем репозитории, различимо как код',
        without: 'Закопано в дизайн-инструменте, трудно проверить',
      },
      {
        capability: 'Стоимость и привязка к вендору',
        withOd: 'Открытый исходный код, переносимо, работает локально',
        without: 'Привязка к подписке на дизайн-инструмент',
      },
    ],
    featuresTitle: "Системы, с которых можно начать",
    features: [
      { title: "Apple", body: "Чистая, сдержанная эстетика на системном шрифте.", thumb: "design-system-apple" },
      { title: "Linear", body: "Чёткий вид продуктового инструмента с плотными отступами.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Мягкий, ориентированный на документы, располагающий.", thumb: "design-system-notion" },
      { title: "Figma", body: "Игривая, красочная энергия творческого инструмента.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Минималистичная, нейтральная, исследовательского уровня.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Плотная, техническая, родная для разработчиков.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Дизайн-системы в Open Design',
    galleryLead:
      'Несколько из более чем 140 эталонных систем, которые можно форкнуть как отправную точку. Выберите близкую к вашему бренду и адаптируйте её.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Система в стиле Airbnb" },
      { thumb: "design-system-vercel", caption: "Система в стиле Vercel" },
      { thumb: "design-system-stripe", caption: "Система в стиле Stripe" },
      { thumb: "design-system-spotify", caption: "Система в стиле Spotify" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Просмотреть дизайн-системы',
    faqTitle: 'FAQ по дизайн-системе',
    faq: [
      {
        q: 'Что именно здесь является дизайн-системой?',
        a: 'Файл DESIGN.md в вашем репозитории, который фиксирует цвета, шрифт, отступы, компоненты и голос. Каждый навык Open Design читает его, поэтому ваш бренд применяется автоматически к тому, что создаёт агент.',
      },
      {
        q: 'Обязательно ли начинать с нуля?',
        a: 'Нет. Open Design поставляет более 140 эталонных дизайн-систем, которые можно форкнуть — от Apple и Linear до редакционных и брутализма — а затем адаптировать под свой бренд.',
      },
      {
        q: 'Как сохраняется согласованность между презентациями, дашбордами и прототипами?',
        a: 'Потому что все эти навыки читают один и тот же DESIGN.md. Определите систему один раз, и согласованность становится автоматической, а не тем, что вы контролируете вручную.',
      },
      {
        q: 'Какие агенты можно использовать?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI и другие нативные адаптеры, с вашими собственными ключами провайдера.',
      },
    ],
    ctaTitle: 'Определите свою дизайн-систему сегодня вечером',
    ctaBody:
      'Поставьте звезду репозиторию, установите Open Design и дайте своему агенту один бренд для применения везде — в агенте, которым вы уже пользуетесь.',
  },
};

const ES: SolutionLocaleCopy = {
  prototype: {
    title: 'Crea prototipos interactivos con Open Design + Claude Code',
    description:
      'Convierte un prompt en un prototipo de varias pantallas y navegable sin salir de tu terminal. Open Design dota a tu agente de programación de las habilidades de diseño, las plantillas y el sistema de diseño para entregar prototipos reales que puedes abrir en un navegador.',
    breadcrumb: 'Prototipo',
    label: 'Caso de uso · Prototipo',
    heading: 'Prototipa a la velocidad de un prompt',
    lead: 'Describe el flujo que tienes en mente y deja que tu agente ensamble un prototipo real y navegable — varias pantallas, estilos compartidos e interacciones en vivo — renderizado directamente a HTML que puedes abrir, compartir y entregar a ingeniería.',
    heroImageAlt:
      'Ilustración editorial de una mano bocetando un wireframe que se convierte en un prototipo de app navegable de varias pantallas',
    tldrTitle: 'En una línea',
    tldrBody:
      'Open Design es la capa de diseño para el agente de programación que ya usas. Para prototipar, eso significa pasar de una idea de un párrafo a un prototipo navegable y con estilo en una sola sesión — sin herramienta de diseño, sin paso de exportación, sin brecha de entrega.',
    stepsTitle: 'Cómo funciona prototipar con Open Design',
    steps: [
      {
        title: 'Describe el flujo',
        body: 'Dile a tu agente qué estás construyendo en lenguaje sencillo — «un flujo de onboarding con una pantalla de bienvenida, un selector de planes y una confirmación». Open Design carga la habilidad de prototipo para que el agente sepa que debe producir pantallas, no una sola página.',
        imageAlt:
          'Ilustración de una persona escribiendo en una terminal una descripción en lenguaje sencillo del flujo de una app',
      },
      {
        title: 'Genera pantallas con estilo',
        body: 'El agente aplica un sistema de diseño y plantillas de prototipo de Open Design, así cada pantalla comparte tipografía, espaciado y componentes en lugar de parecer un borrador. Obtienes un conjunto coherente de pantallas, no maquetas inconexas.',
        imageAlt:
          'Ilustración de varias pantallas de app apareciendo en secuencia, todas compartiendo un estilo visual consistente',
      },
      {
        title: 'Conecta las interacciones',
        body: 'Los botones navegan, las pestañas cambian, los modales se abren. El prototipo se renderiza a HTML autocontenido, así se comporta como lo real en cualquier navegador — no hace falta cuenta en una herramienta de prototipado para verlo.',
        imageAlt:
          'Ilustración de un cursor haciendo clic a través de pantallas enlazadas con flechas que muestran la navegación entre ellas',
      },
      {
        title: 'Itera y entrega',
        body: 'Refina hablando con el agente — «pon el selector de planes en un diseño de tres columnas». Como el artefacto vive en tu proyecto, el diseño y el código final comparten una única fuente de verdad, cerrando la habitual brecha de entrega entre diseñador e ingeniero.',
        imageAlt:
          'Ilustración de un prototipo que se revisa y luego se pasa a un ingeniero, con el diseño y el código fundiéndose en un solo archivo',
      },
    ],
    tableTitle: 'Prototipar con Open Design frente al método tradicional',
    tableColCapability: 'Lo que necesitas',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Herramientas de prototipado tradicionales',
    tableRows: [
      {
        capability: 'Pasar de la idea a la primera pantalla',
        withOd: 'Un prompt en el agente que ya tienes abierto',
        without: 'Abrir una herramienta aparte, iniciar un archivo, arrastrar cajas a mano',
      },
      {
        capability: 'Varias pantallas enlazadas',
        withOd: 'Generadas como un conjunto con estilos compartidos y navegación funcional',
        without: 'Cada cuadro dibujado y enlazado manualmente',
      },
      {
        capability: 'Sistema visual consistente',
        withOd: 'Tomado de un sistema de diseño reutilizable que el agente aplica',
        without: 'Recreado por archivo o mantenido a mano',
      },
      {
        capability: 'Resultado que se puede compartir',
        withOd: 'HTML autocontenido — se abre en cualquier navegador, sin cuenta',
        without: 'Quien lo ve necesita una licencia o un enlace de la herramienta del proveedor',
      },
      {
        capability: 'Camino al código real',
        withOd: 'El artefacto vive en tu repositorio; diseño y código comparten una fuente',
        without: 'Reconstruido desde cero tras una entrega aparte',
      },
      {
        capability: 'Coste y dependencia del proveedor',
        withOd: 'Código abierto, usa tus propias claves, funciona en local',
        without: 'Suscripción por licencia, alojado por el proveedor, exportación limitada',
      },
    ],
    featuresTitle: 'Lo que puedes prototipar',
    features: [
      {
        title: 'Apps web de varias pantallas',
        body: 'Flujos completos con navegación compartida — onboarding, paneles, ajustes — no páginas sueltas.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Flujos de apps móviles',
        body: 'Recorridos móviles pantalla a pantalla con transiciones y estados de apariencia nativa.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Páginas de aterrizaje',
        body: 'Páginas de marketing y landings SaaS que puedes recorrer y lanzar.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Cualquier gusto visual',
        body: 'Editorial, suave o brutalista — el prototipo mantiene un estilo coherente de principio a fin.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Lista de espera y precios',
        body: 'Superficies de conversión — listas de espera, tablas de precios — conectadas y con tu marca.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Gamificado y lúdico',
        body: 'Conceptos cargados de interacción donde el movimiento y el estado son parte de la propuesta.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Prototipos que la gente creó con Open Design',
    galleryLead:
      'Cada uno de estos empezó como un prompt y se renderizó a un artefacto navegable. Elige una plantilla cercana a tu idea, describe tu variación y el agente la adapta.',
    gallery: [
      { thumb: "example-dating-web", caption: "App web de citas — flujo de varias pantallas" },
      { thumb: "example-hr-onboarding", caption: "Flujo de onboarding de RR. HH." },
      { thumb: "example-kami-landing", caption: "Página de aterrizaje de producto" },
      { thumb: "example-web-prototype-taste-soft", caption: "Prototipo web de estilo suave" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar plantillas de prototipo',
    faqTitle: 'Preguntas frecuentes sobre prototipado',
    faq: [
      {
        q: '¿Necesito una herramienta de diseño como Figma para prototipar con Open Design?',
        a: 'No. Open Design funciona dentro de tu agente de programación y renderiza prototipos a HTML. Describes el flujo con palabras; el agente produce las pantallas. No hay una herramienta de lienzo aparte que aprender o pagar.',
      },
      {
        q: '¿Los prototipos son interactivos o solo maquetas estáticas?',
        a: 'Interactivos. La navegación, las pestañas y los modales funcionan porque la salida es HTML y CSS reales. Puedes recorrerlos en cualquier navegador exactamente como lo haría un usuario.',
      },
      {
        q: '¿Qué agentes puedo usar?',
        a: 'Open Design funciona con Claude Code, Codex, Cursor Agent, Gemini CLI y una docena más de adaptadores nativos. Aportas tus propias claves de proveedor; nada se aloja por ti.',
      },
      {
        q: '¿Puede un prototipo convertirse en el producto real?',
        a: 'Esa es la idea. El artefacto vive en tu proyecto, así que el mismo sistema de diseño y los componentes pasan al código de producción en lugar de descartarse tras una entrega.',
      },
    ],
    ctaTitle: 'Prototipa tu próxima idea esta noche',
    ctaBody:
      'Dale una estrella al repositorio, instala Open Design y convierte tu próximo «¿y si...?» en algo que puedas recorrer — en el agente que ya usas.',
  },
  dashboard: {
    title: 'Genera paneles de datos con Open Design + Claude Code',
    description:
      'Describe las métricas que sigues y deja que tu agente de programación construya un panel con estilo y adaptable — gráficos, tarjetas de KPI y tablas renderizadas a HTML que puedes alojar donde sea. Sin licencia de herramienta de BI, sin constructor de arrastrar y soltar.',
    breadcrumb: 'Panel',
    label: 'Caso de uso · Panel',
    heading: 'Paneles a partir de una descripción, no de un constructor de arrastrar y soltar',
    lead: 'Dile a tu agente qué mostrar y cómo debe sentirse. Open Design aporta los patrones de gráficos, el sistema de maquetación y el lenguaje visual para que obtengas un panel coherente y presentable — no un muro de widgets con estilos por defecto.',
    heroImageAlt:
      'Ilustración editorial de números en bruto a la izquierda fluyendo hacia un panel limpio de gráficos y tarjetas de KPI a la derecha',
    tldrTitle: 'En una línea',
    tldrBody:
      'Open Design convierte una especificación en lenguaje sencillo de tus métricas en un panel con estilo que tu agente renderiza a HTML — versionado en tu repositorio, alojable donde sea, sin suscripción de BI por licencia.',
    stepsTitle: 'Cómo funcionan los paneles con Open Design',
    steps: [
      {
        title: 'Describe las métricas',
        body: 'Enumera lo que importa — «usuarios activos semanales, ingresos por plan, abandono y una tendencia de 30 días». El agente carga la habilidad de panel para saber que debe disponer tarjetas de KPI, gráficos y una tabla en lugar de un solo bloque de texto.',
        imageAlt: 'Ilustración de una persona enumerando las métricas que le importan',
      },
      {
        title: 'Elige los patrones de gráficos',
        body: 'Open Design incluye plantillas de gráficos y maquetación, así las tendencias se vuelven gráficos de líneas, los desgloses se vuelven barras y los ratios la visualización adecuada — tipografía y espaciado consistentes en todo en lugar de valores por defecto dispares.',
        imageAlt: 'Ilustración de varios tipos de gráficos dispuestos en una cuadrícula coherente',
      },
      {
        title: 'Conecta tus datos',
        body: 'Apunta el panel a un CSV, un endpoint JSON o pega filas de ejemplo. Se renderiza a HTML autocontenido que se actualiza cuando lo hacen los datos — ábrelo en cualquier navegador, ponlo en cualquier alojamiento estático.',
        imageAlt: 'Ilustración de un archivo de datos conectándose a un panel que se actualiza en vivo',
      },
      {
        title: 'Refina y publica',
        body: 'Ajusta hablando con el agente — «agrupa los ingresos por región, mueve la fila de KPI arriba». El artefacto vive en tu proyecto, así que el panel se puede revisar y versionar como cualquier otro código.',
        imageAlt: 'Ilustración de un panel siendo refinado y luego desplegado',
      },
    ],
    tableTitle: 'Paneles con Open Design frente al método tradicional',
    tableColCapability: 'Lo que necesitas',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Herramientas de BI / programado a mano',
    tableRows: [
      {
        capability: 'Pasar de la lista de métricas a la maquetación',
        withOd: 'Un prompt; el agente dispone tarjetas, gráficos y tablas',
        without: 'Arrastrar widgets uno a uno, o escribir el código de los gráficos desde cero',
      },
      {
        capability: 'Sistema visual consistente',
        withOd: 'Patrones de gráficos y espaciado de un sistema de diseño reutilizable',
        without: 'Estilos de widget por defecto, o estilizado a mano por gráfico',
      },
      {
        capability: 'Conectar datos',
        withOd: 'CSV / JSON / filas pegadas, renderizado a HTML en vivo',
        without: 'Conectores del proveedor o fontanería de datos a medida',
      },
      {
        capability: 'Alojamiento y compartición',
        withOd: 'HTML autocontenido en cualquier alojamiento estático, sin cuenta',
        without: 'Quien lo ve necesita una licencia en el proveedor de BI',
      },
      {
        capability: 'Revisión y versionado',
        withOd: 'Vive en tu repositorio; comparable como código',
        without: 'Encerrado dentro del proveedor, sin diff real',
      },
      {
        capability: 'Coste y dependencia del proveedor',
        withOd: 'Código abierto, usa tus propias claves, funciona en local',
        without: 'Suscripción por licencia, alojado por el proveedor',
      },
    ],
    featuresTitle: "Lo que puedes construir",
    features: [
      { title: "Analítica de producto", body: "Usuarios activos, embudos, retención — las métricas en las que vive un equipo de producto.", thumb: "example-dashboard" },
      { title: "Métricas de repositorio y desarrollo", body: "Estrellas, PR, salud de CI — paneles de ingeniería con tus propios datos.", thumb: "example-github-dashboard" },
      { title: "Informes financieros", body: "Ingresos, gasto y margen de operación dispuestos como un informe para compartir.", thumb: "example-finance-report" },
      { title: "Operaciones en vivo", body: "Métricas en tiempo real que se refrescan a medida que se mueven los datos subyacentes.", thumb: "example-live-dashboard" },
      { title: "Redes y marketing", body: "Rendimiento de canales y seguimiento de campañas en una sola vista.", thumb: "example-social-media-dashboard" },
      { title: "Informes por sector", body: "Informes estructurados para cualquier ámbito — de lo clínico al trading.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Paneles que la gente creó con Open Design',
    galleryLead:
      'Paneles reales renderizados a partir de un prompt y una fuente de datos. Empieza por uno cercano al tuyo y describe las métricas que sigues.',
    gallery: [
      { thumb: "example-data-report", caption: "Informe de datos" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Panel de operaciones en vivo" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Panel de análisis de trading" },
      { thumb: "example-frame-data-chart-nyt", caption: "Gráfico de datos editorial" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar plantillas de panel',
    faqTitle: 'Preguntas frecuentes sobre paneles',
    faq: [
      {
        q: '¿Necesito una herramienta de BI como Tableau o Looker?',
        a: 'No. Open Design renderiza paneles a HTML dentro de tu agente de programación. Describes las métricas y lo apuntas a tus datos; no hay una plataforma de BI aparte que licenciar o aprender.',
      },
      {
        q: '¿De dónde vienen los datos?',
        a: 'De un CSV, un endpoint JSON o filas que pegas. El panel es HTML y JavaScript puros, así que controlas exactamente de dónde lee — nada pasa por un servicio alojado.',
      },
      {
        q: '¿Pueden verlo compañeros no técnicos?',
        a: 'Sí. La salida es una página web autocontenida. Cualquiera con el enlace o el archivo puede abrirla en un navegador — sin cuenta, sin licencia.',
      },
      {
        q: '¿Qué agentes puedo usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI y una docena más de adaptadores nativos. Aportas tus propias claves de proveedor.',
      },
    ],
    ctaTitle: 'Construye tu panel esta noche',
    ctaBody:
      'Dale una estrella al repositorio, instala Open Design y convierte tus métricas en un panel que puedas alojar donde sea — en el agente que ya usas.',
  },
  slides: {
    title: 'Genera presentaciones con Open Design + Claude Code',
    description:
      'Convierte un esquema en una presentación diseñada y fiel a tu marca sin abrir una app de presentaciones. Open Design da a tu agente de programación plantillas de diapositivas y un sistema visual, renderizando las diapositivas a HTML que puedes presentar, exportar o compartir.',
    breadcrumb: 'Diapositivas',
    label: 'Caso de uso · Diapositivas',
    heading: 'Presentaciones que parecen diseñadas, escritas con un prompt',
    lead: 'Entrega a tu agente un esquema y un tono. Open Design aplica una plantilla de presentación y un sistema visual para que cada diapositiva quede maquetada, compuesta y fiel a tu marca — no una lista de viñetas sobre un fondo en blanco.',
    heroImageAlt:
      'Ilustración editorial de un esquema a la izquierda convirtiéndose en una secuencia de diapositivas de presentación diseñadas a la derecha',
    tldrTitle: 'En una línea',
    tldrBody:
      'Open Design convierte un esquema en una presentación HTML diseñada que tu agente renderiza en una sola sesión — preséntala en el navegador, expórtala a PDF o PPTX y guarda la fuente en tu repositorio.',
    stepsTitle: 'Cómo funcionan las presentaciones con Open Design',
    steps: [
      {
        title: 'Dale el esquema',
        body: 'Pega tus puntos clave o una estructura aproximada. El agente carga la habilidad de presentación para producir una secuencia de diapositivas maquetadas, no un único documento largo.',
        imageAlt: 'Ilustración de un esquema de texto siendo entregado a un agente',
      },
      {
        title: 'Elige un estilo de presentación',
        body: 'Open Design incluye plantillas de presentación — editorial, suizo-internacional, técnico oscuro y más. El agente aplica una para que la tipografía, la cuadrícula y los acentos se mantengan consistentes en cada diapositiva.',
        imageAlt: 'Ilustración de varias opciones de estilo de presentación dispuestas una al lado de otra',
      },
      {
        title: 'Genera las diapositivas',
        body: 'Cada punto se convierte en una diapositiva diseñada con la jerarquía adecuada — títulos, apoyos visuales, destacados de datos. Se renderiza a HTML, así que se presenta a pantalla completa en cualquier navegador.',
        imageAlt: 'Ilustración de una secuencia de diapositivas terminadas con un estilo consistente',
      },
      {
        title: 'Presenta, exporta, itera',
        body: 'Presenta desde el navegador, o exporta a PDF / PPTX para compartir. Refina hablando con el agente — «aprieta la diapositiva de datos, añade una llamada a la acción de cierre». La fuente de la presentación se queda en tu proyecto.',
        imageAlt: 'Ilustración de una presentación siendo presentada y exportada a varios formatos',
      },
    ],
    tableTitle: 'Presentaciones con Open Design frente al método tradicional',
    tableColCapability: 'Lo que necesitas',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'PowerPoint / Keynote / herramientas de IA para diapositivas',
    tableRows: [
      {
        capability: 'Pasar del esquema a las diapositivas',
        withOd: 'Un prompt; el agente maqueta cada diapositiva',
        without: 'Construir cada diapositiva a mano, o pelearte con una plantilla',
      },
      {
        capability: 'Diseño consistente',
        withOd: 'Plantillas de presentación con una cuadrícula y un sistema tipográfico reales',
        without: 'Deriva del tema, alineación manual, valores por defecto fuera de marca',
      },
      {
        capability: 'Datos y diagramas',
        withOd: 'Gráficos y destacados renderizados como parte de la diapositiva',
        without: 'Pegar imágenes estáticas o rehacer los gráficos cada vez',
      },
      {
        capability: 'Formatos de exportación',
        withOd: 'HTML para presentar, además de exportación a PDF / PPTX',
        without: 'Atado al formato de una sola app',
      },
      {
        capability: 'Revisión y versionado',
        withOd: 'La fuente vive en tu repositorio, comparable',
        without: 'Archivo binario, sin diff con sentido',
      },
      {
        capability: 'Coste y dependencia del proveedor',
        withOd: 'Código abierto, usa tus propias claves, funciona en local',
        without: 'Licencia de la app o complemento de IA por licencia',
      },
    ],
    featuresTitle: "Lo que puedes presentar",
    features: [
      { title: "Pitch decks", body: "Presentaciones para inversores y ventas con una narrativa fuerte y diapositivas de datos limpias.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Suizo / editorial", body: "Presentaciones tipográficas guiadas por cuadrícula que parecen dirigidas artísticamente.", thumb: "example-deck-swiss-international" },
      { title: "Módulos de curso", body: "Presentaciones didácticas con pasos claros, destacados y ritmo.", thumb: "example-html-ppt-course-module" },
      { title: "Presentaciones con gráficos de datos", body: "Presentaciones oscuras y centradas en gráficos para analítica y revisiones.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Modo presentador", body: "Presentaciones estilo Reveal creadas para presentar en vivo en el navegador.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Planos técnicos", body: "Presentaciones de arquitectura y conocimiento que mapean sistemas complejos.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Presentaciones que la gente creó con Open Design',
    galleryLead:
      'Presentaciones reales renderizadas a partir de un esquema. Elige un estilo cercano a tu charla y describe el contenido.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Presentación tipo revista editorial" },
      { thumb: "example-guizang-ppt", caption: "Keynote ilustrado" },
      { thumb: "example-deck-open-slide-canvas", caption: "Presentación de lienzo de diapositivas abierto" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Presentación con tema degradado" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar plantillas de presentación',
    faqTitle: 'Preguntas frecuentes sobre diapositivas',
    faq: [
      {
        q: '¿Necesito PowerPoint o Keynote?',
        a: 'No. Open Design renderiza presentaciones a HTML dentro de tu agente de programación y puede exportar a PDF o PPTX. Presentas desde el navegador o entregas un archivo — no hace falta una app de presentaciones para crearla.',
      },
      {
        q: '¿Son solo viñetas generadas por IA?',
        a: 'No. El agente aplica una plantilla de presentación real con cuadrícula, escala tipográfica y jerarquía visual, así las diapositivas parecen diseñadas en lugar de autorrellenadas.',
      },
      {
        q: '¿Puedo exportar a PowerPoint para un cliente?',
        a: 'Sí. Las presentaciones se exportan a PPTX y PDF además del HTML desde el que presentas, así encajan con lo que sea que espere la audiencia.',
      },
      {
        q: '¿Qué agentes puedo usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI y más adaptadores nativos, con tus propias claves de proveedor.',
      },
    ],
    ctaTitle: 'Construye tu próxima presentación esta noche',
    ctaBody:
      'Dale una estrella al repositorio, instala Open Design y convierte tu esquema en una presentación diseñada — en el agente que ya usas.',
  },
  image: {
    title: 'Genera gráficos fieles a tu marca con Open Design + Claude Code',
    description:
      'Produce tarjetas para redes, portadas de artículos y gráficos de marketing a partir de un prompt — maquetados con tipografía real y tu sistema de marca, renderizados a HTML nítido que puedes exportar a PNG. Sin app de diseño, sin suscripción de plantillas.',
    breadcrumb: 'Imagen',
    label: 'Caso de uso · Imagen',
    heading: 'Gráficos fieles a tu marca, generados y maquetados por ti',
    lead: 'Describe la tarjeta o portada que necesitas. Open Design la compone con tipografía, cuadrícula y los colores de tu marca reales — luego la renderiza a HTML que puedes exportar como imagen, en vez de pelearte con una app de diseño o una plantilla genérica.',
    heroImageAlt:
      'Ilustración editorial de un prompt convirtiéndose en un conjunto de tarjetas para redes y portadas de artículos maquetadas',
    tldrTitle: 'En una línea',
    tldrBody:
      'Open Design convierte un prompt en un gráfico compuesto y fiel a tu marca que tu agente renderiza a HTML y exporta a PNG — repetible, versionado y libre de herramientas de diseño por licencia.',
    stepsTitle: 'Cómo funcionan los gráficos con Open Design',
    steps: [
      {
        title: 'Describe el gráfico',
        body: 'Di qué es — «una tarjeta de Twitter para nuestro lanzamiento con el titular y una cita». El agente carga la habilidad adecuada para componer un gráfico maquetado, no un bloque de texto plano.',
        imageAlt: 'Ilustración de una persona describiendo una tarjeta para redes que necesita',
      },
      {
        title: 'Aplica el sistema de marca',
        body: 'Open Design toma tus colores, tipografía y espaciado de un sistema de diseño reutilizable, así cada tarjeta cuadra con el resto de tu marca en vez de parecer algo aislado.',
        imageAlt: 'Ilustración de colores y tipografía de marca aplicándose a la maquetación de una tarjeta',
      },
      {
        title: 'Renderiza y exporta',
        body: 'El gráfico se renderiza a HTML en las dimensiones exactas que necesitas — tarjeta para redes, portada, banner — y luego se exporta a PNG. Texto nítido, maquetación real, sin ajustes a mano.',
        imageAlt: 'Ilustración de un gráfico renderizándose y exportándose a un archivo de imagen',
      },
      {
        title: 'Reutiliza la receta',
        body: 'Como es una plantilla, el siguiente gráfico está a un prompt de distancia — cambia el titular, conserva la maquetación. Las series de tarjetas quedan perfectamente consistentes.',
        imageAlt: 'Ilustración de una plantilla de tarjeta produciendo una serie consistente de gráficos',
      },
    ],
    tableTitle: 'Gráficos con Open Design frente al método tradicional',
    tableColCapability: 'Lo que necesitas',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Apps de diseño / plantillas genéricas',
    tableRows: [
      {
        capability: 'Pasar de la idea al gráfico maquetado',
        withOd: 'Un prompt; el agente compone tipografía y maquetación',
        without: 'Abrir una app, colocar cada elemento a mano',
      },
      {
        capability: 'Mantener la marca',
        withOd: 'Colores y tipografía de un sistema de diseño reutilizable',
        without: 'Reelegir estilos de marca por archivo, o desviarte de la marca',
      },
      {
        capability: 'Serie consistente',
        withOd: 'Misma plantilla, nuevo texto — un conjunto perfectamente alineado',
        without: 'Realinear cada variante manualmente',
      },
      {
        capability: 'Exportación',
        withOd: 'HTML en dimensiones exactas, exportado a PNG',
        without: 'Dimensionado del lienzo y ajustes de exportación manuales',
      },
      {
        capability: 'Repetible',
        withOd: 'Una receta basada en prompt en tu repositorio',
        without: 'Un archivo aislado que recreas cada vez',
      },
      {
        capability: 'Coste y dependencia del proveedor',
        withOd: 'Código abierto, usa tus propias claves, funciona en local',
        without: 'Herramienta de diseño por licencia o mercado de plantillas',
      },
    ],
    featuresTitle: "Lo que puedes crear",
    features: [
      { title: "Tarjetas para redes", body: "Tarjetas de X / Twitter compuestas con tu titular y tu marca.", thumb: "example-card-twitter" },
      { title: "Portadas de artículos", body: "Portadas editoriales, estilo revista, para publicaciones y boletines.", thumb: "example-article-magazine" },
      { title: "Tarjetas de Xiaohongshu", body: "Tarjetas estilo RedNote afinadas para ese feed.", thumb: "example-card-xiaohongshu" },
      { title: "Gráficos hero", body: "Visuales hero líquidos y con degradado para sitios y lanzamientos.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Carruseles", body: "Carruseles para redes de varias diapositivas que se mantienen consistentes entre cuadros.", thumb: "example-social-carousel" },
      { title: "Marcos de maqueta de UI", body: "Marcos de notificación y de dispositivo para narrar el producto.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Gráficos que la gente creó con Open Design',
    galleryLead:
      'Tarjetas y portadas reales renderizadas a partir de un prompt. Elige una cercana a lo que necesitas e intercambia tu texto.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Tarjeta para redes en tonos pastel" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Cartel editorial a tres tintas" },
      { thumb: "example-magazine-poster", caption: "Cartel estilo revista" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Portada editorial atrevida" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar plantillas de gráficos',
    faqTitle: 'Preguntas frecuentes sobre imágenes',
    faq: [
      {
        q: '¿Es esto un generador de imágenes por IA como Midjourney?',
        a: 'No. Open Design compone gráficos con maquetación y tipografía reales — tu titular, tu marca, dimensiones exactas — y los renderiza a HTML que exportas como PNG. Es composición de diseño, no generación de píxeles.',
      },
      {
        q: '¿Puedo crear una serie consistente de tarjetas?',
        a: 'Sí. Como cada gráfico es una plantilla, conservas la maquetación y cambias el texto, así toda una serie se mantiene perfectamente alineada y fiel a la marca.',
      },
      {
        q: '¿Qué tamaños puede producir?',
        a: 'Cualquiera — el gráfico se renderiza en las dimensiones exactas que especifiques, desde una tarjeta cuadrada para redes hasta un banner ancho, y luego se exporta a PNG.',
      },
      {
        q: '¿Qué agentes puedo usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI y más adaptadores nativos, con tus propias claves de proveedor.',
      },
    ],
    ctaTitle: 'Crea tu próximo gráfico esta noche',
    ctaBody:
      'Dale una estrella al repositorio, instala Open Design y convierte un prompt en un gráfico fiel a tu marca — en el agente que ya usas.',
  },
  video: {
    title: 'Genera motion graphics y vídeo corto con Open Design + Claude Code',
    description:
      'Convierte un guion en cuadros animados y vídeo de formato corto — tarjetas de título, fondos en movimiento y cierres compuestos con tu sistema de marca y renderizados desde HTML. Sin suite de motion graphics, sin arrastrar por una línea de tiempo.',
    breadcrumb: 'Vídeo',
    label: 'Caso de uso · Vídeo',
    heading: 'Motion graphics a partir de un guion, no de una línea de tiempo',
    lead: 'Describe el momento que quieres — una aparición de título, una animación de datos, un cierre con logo. Open Design compone cuadros animados con tu sistema de marca y los renderiza a vídeo, sin suite de motion graphics.',
    heroImageAlt:
      'Ilustración editorial de un guion convirtiéndose en una secuencia de cuadros de vídeo animados',
    tldrTitle: 'En una línea',
    tldrBody:
      'Open Design convierte un guion en cuadros animados y fieles a tu marca que tu agente renderiza a vídeo de formato corto — compuestos desde HTML, versionados en tu repositorio, sin editor de línea de tiempo que aprender.',
    stepsTitle: 'Cómo funciona el movimiento con Open Design',
    steps: [
      {
        title: 'Describe el momento',
        body: 'Di qué debe pasar — «un título con glitch que se resuelve en nuestro logo, luego una tarjeta de cierre». El agente carga la habilidad de movimiento para producir cuadros animados, no una imagen estática.',
        imageAlt: 'Ilustración de una persona describiendo una secuencia de movimiento',
      },
      {
        title: 'Aplica la marca y el estilo de movimiento',
        body: 'Open Design aporta plantillas de cuadro — fugas de luz cinematográficas, títulos con glitch, cierres con logo — y aplica tus colores y tipografía, así el movimiento se ve intencionado y fiel a la marca.',
        imageAlt: 'Ilustración de estilo de marca aplicado a cuadros animados',
      },
      {
        title: 'Renderiza los cuadros a vídeo',
        body: 'Los cuadros se componen en HTML y se renderizan a vídeo, así el ritmo y la maquetación son precisos y repetibles — sin keyframing manual en una línea de tiempo.',
        imageAlt: 'Ilustración de cuadros HTML renderizándose en un clip de vídeo',
      },
      {
        title: 'Itera y exporta',
        body: 'Refina hablando con el agente — «ralentiza la aparición del título, añade un subtítulo». Exporta clips de formato corto para redes o producto. La fuente se queda en tu proyecto.',
        imageAlt: 'Ilustración de un clip de vídeo siendo refinado y exportado para redes',
      },
    ],
    tableTitle: 'Movimiento con Open Design frente al método tradicional',
    tableColCapability: 'Lo que necesitas',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'After Effects / suites de motion',
    tableRows: [
      {
        capability: 'Pasar del guion a cuadros animados',
        withOd: 'Un prompt; el agente compone la secuencia',
        without: 'Hacer keyframe de cada elemento en una línea de tiempo a mano',
      },
      {
        capability: 'Mantener la marca',
        withOd: 'Plantillas de cuadro + tus colores y tipografía',
        without: 'Rehacer el estilo de marca por proyecto',
      },
      {
        capability: 'Ritmo preciso y repetible',
        withOd: 'Compuesto en HTML, renderizado de forma determinista',
        without: 'Arrastre manual, difícil de reproducir',
      },
      {
        capability: 'Exportar para redes',
        withOd: 'Clips de formato corto renderizados a vídeo',
        without: 'Ajustes de exportación y lidiar con códecs',
      },
      {
        capability: 'Revisión y versionado',
        withOd: 'La fuente de los cuadros vive en tu repositorio, comparable',
        without: 'Archivo de proyecto binario, sin diff real',
      },
      {
        capability: 'Coste y dependencia del proveedor',
        withOd: 'Código abierto, usa tus propias claves, funciona en local',
        without: 'Suite cara, curva de aprendizaje pronunciada',
      },
    ],
    featuresTitle: "Lo que puedes animar",
    features: [
      { title: "Hyperframes", body: "Secuencias de movimiento cuadro a cuadro compuestas desde HTML.", thumb: "example-video-hyperframes" },
      { title: "Formato corto para redes", body: "Clips verticales hechos para los feeds de redes.", thumb: "example-video-shortform" },
      { title: "Conjuntos de cuadros de movimiento", body: "Cuadros animados reutilizables que compones en un clip.", thumb: "example-motion-frames" },
      { title: "Fugas de luz cinematográficas", body: "Transiciones fílmicas y fondos atmosféricos.", thumb: "example-frame-light-leak-cinema" },
      { title: "Títulos con glitch", body: "Apariciones de título con movimiento y textura.", thumb: "example-frame-glitch-title" },
      { title: "Cierres con logo", body: "Animaciones de cierre con tu marca para cualquier clip.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Movimiento que la gente creó con Open Design',
    galleryLead:
      'Cuadros y clips animados reales renderizados a partir de un prompt. Elige uno cercano a tu idea y describe el movimiento.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Secuencia de Hyperframes" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Fondo en movimiento líquido" },
      { thumb: "example-frame-macos-notification", caption: "Cuadro de UI animado" },
      { thumb: "example-frame-data-chart-nyt", caption: "Gráfico de datos animado" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar plantillas de movimiento',
    faqTitle: 'Preguntas frecuentes sobre vídeo',
    faq: [
      {
        q: '¿Necesito After Effects o una suite de motion graphics?',
        a: 'No. Open Design compone cuadros animados en HTML y los renderiza a vídeo dentro de tu agente de programación. No hay editor de línea de tiempo que aprender ni que licenciar.',
      },
      {
        q: '¿Para qué tipo de vídeo sirve?',
        a: 'Movimiento de formato corto — tarjetas de título, animaciones de datos, cierres con logo, clips para redes. Está hecho para movimiento de marca y producto, no para edición de largometraje.',
      },
      {
        q: '¿El ritmo es reproducible?',
        a: 'Sí. Como los cuadros se componen en código y se renderizan de forma determinista, obtienes el mismo resultado cada vez y puedes ajustarlo con precisión con un prompt.',
      },
      {
        q: '¿Qué agentes puedo usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI y más adaptadores nativos, con tus propias claves de proveedor.',
      },
    ],
    ctaTitle: 'Anima tu próxima idea esta noche',
    ctaBody:
      'Dale una estrella al repositorio, instala Open Design y convierte un guion en movimiento — en el agente que ya usas.',
  },
  designSystem: {
    title: 'Crea y aplica un sistema de diseño con Open Design + Claude Code',
    description:
      'Captura tu marca como un sistema de diseño reutilizable que tu agente de programación aplica a cada artefacto — colores, tipografía, componentes y tono en un solo DESIGN.md. Defínelo una vez; cada prototipo, presentación y panel se mantiene fiel a la marca.',
    breadcrumb: 'Sistema de diseño',
    label: 'Caso de uso · Sistema de diseño',
    heading: 'Un sistema de diseño, aplicado a todo lo que crea tu agente',
    lead: 'Define tu marca una vez y Open Design la lleva a cada salida — prototipos, presentaciones, paneles, gráficos. El sistema vive en tu repositorio como un DESIGN.md que el agente lee, así la consistencia es automática, no manual.',
    heroImageAlt:
      'Ilustración editorial de un único sistema de diseño irradiando hacia muchos artefactos fieles a la marca',
    tldrTitle: 'En una línea',
    tldrBody:
      'Open Design captura tu marca como un sistema de diseño portátil que tu agente aplica a cada artefacto — definido una vez en tu repositorio, aplicado en todas partes, sin una herramienta de diseño central que haga de guardián.',
    stepsTitle: 'Cómo funcionan los sistemas de diseño con Open Design',
    steps: [
      {
        title: 'Captura el sistema',
        body: 'Describe tu marca — colores, tipografía, espaciado, voz — o apunta el agente a un sitio existente para extraerla. Open Design lo escribe en un DESIGN.md que vive en tu proyecto.',
        imageAlt: 'Ilustración de una marca siendo capturada en un único archivo de sistema de diseño',
      },
      {
        title: 'Parte de una base probada',
        body: 'Open Design incluye más de 140 sistemas de diseño de referencia — de Apple y Linear a editoriales y brutalistas. Haz un fork de uno cercano a tu marca en vez de empezar desde una página en blanco.',
        imageAlt: 'Ilustración de una galería de sistemas de diseño de referencia siendo explorada',
      },
      {
        title: 'Aplícalo en todas partes',
        body: 'Cada otra habilidad lee el mismo sistema, así un prototipo, una presentación y un panel comparten un único lenguaje visual — sin que tengas que volver a especificarlo cada vez.',
        imageAlt: 'Ilustración de un sistema aplicado de forma consistente a muchos tipos de artefacto',
      },
      {
        title: 'Hazlo evolucionar en un solo lugar',
        body: 'Cambia el sistema y el siguiente renderizado lo refleja en todas partes. Como es un archivo en tu repositorio, las decisiones de diseño se revisan y versionan como código.',
        imageAlt: 'Ilustración de un sistema de diseño siendo actualizado y propagándose a todas las salidas',
      },
    ],
    tableTitle: 'Sistemas de diseño con Open Design frente al método tradicional',
    tableColCapability: 'Lo que necesitas',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Bibliotecas de herramientas de diseño / guías de estilo',
    tableRows: [
      {
        capability: 'Definir el sistema',
        withOd: 'Un DESIGN.md que el agente lee, forkeado de más de 140 referencias',
        without: 'Una guía de estilo estática o una biblioteca atada a una herramienta',
      },
      {
        capability: 'Aplicar a distintos tipos de artefacto',
        withOd: 'El mismo sistema alimenta prototipos, presentaciones, paneles, gráficos',
        without: 'Reimplementado por herramienta y por archivo',
      },
      {
        capability: 'Mantener todo consistente',
        withOd: 'Automático — cada habilidad lee una sola fuente',
        without: 'Disciplina manual; se desvía con el tiempo',
      },
      {
        capability: 'Hacer evolucionar la marca',
        withOd: 'Edita una vez; el siguiente renderizado se actualiza en todas partes',
        without: 'Buscar y reemplazar entre archivos y herramientas',
      },
      {
        capability: 'Revisión y versionado',
        withOd: 'Vive en tu repositorio, comparable como código',
        without: 'Enterrado en una herramienta de diseño, difícil de auditar',
      },
      {
        capability: 'Coste y dependencia del proveedor',
        withOd: 'Código abierto, portátil, funciona en local',
        without: 'Atado a una suscripción de herramienta de diseño',
      },
    ],
    featuresTitle: "Sistemas desde los que puedes partir",
    features: [
      { title: "Apple", body: "Estética limpia, contenida, de fuente del sistema.", thumb: "design-system-apple" },
      { title: "Linear", body: "Aspecto nítido de herramienta de producto con espaciado compacto.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Suave, centrado en documentos, cercano.", thumb: "design-system-notion" },
      { title: "Figma", body: "Energía lúdica, colorida, de herramienta creativa.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimalista, neutral, de nivel investigación.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Densa, técnica, nativa para desarrolladores.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Sistemas de diseño en Open Design',
    galleryLead:
      'Algunos de los más de 140 sistemas de referencia que puedes forkear como punto de partida. Elige uno cercano a tu marca y adáptalo.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Sistema estilo Airbnb" },
      { thumb: "design-system-vercel", caption: "Sistema estilo Vercel" },
      { thumb: "design-system-stripe", caption: "Sistema estilo Stripe" },
      { thumb: "design-system-spotify", caption: "Sistema estilo Spotify" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Explorar sistemas de diseño',
    faqTitle: 'Preguntas frecuentes sobre sistemas de diseño',
    faq: [
      {
        q: '¿Qué es exactamente el sistema de diseño aquí?',
        a: 'Un archivo DESIGN.md en tu repositorio que captura colores, tipografía, espaciado, componentes y voz. Cada habilidad de Open Design lo lee, así que tu marca se aplica automáticamente a lo que produzca el agente.',
      },
      {
        q: '¿Tengo que empezar desde cero?',
        a: 'No. Open Design incluye más de 140 sistemas de diseño de referencia que puedes forkear — de Apple y Linear a editoriales y brutalistas — y luego adaptar a tu marca.',
      },
      {
        q: '¿Cómo se mantiene consistente entre presentaciones, paneles y prototipos?',
        a: 'Porque todas esas habilidades leen el mismo DESIGN.md. Define el sistema una vez y la consistencia es automática en lugar de algo que vigilas a mano.',
      },
      {
        q: '¿Qué agentes puedo usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI y más adaptadores nativos, con tus propias claves de proveedor.',
      },
    ],
    ctaTitle: 'Define tu sistema de diseño esta noche',
    ctaBody:
      'Dale una estrella al repositorio, instala Open Design y dale a tu agente una sola marca que aplicar en todas partes — en el agente que ya usas.',
  },
};

const PT_BR: SolutionLocaleCopy = {
  prototype: {
    title: 'Crie protótipos interativos com Open Design + Claude Code',
    description:
      'Transforme um prompt em um protótipo clicável de várias telas sem sair do terminal. O Open Design dá ao seu agente de programação as habilidades de design, os modelos e o sistema de design para entregar protótipos reais que você abre no navegador.',
    breadcrumb: 'Protótipo',
    label: 'Caso de uso · Protótipo',
    heading: 'Prototipe na velocidade de um prompt',
    lead: 'Descreva o fluxo que você tem em mente e deixe seu agente montar um protótipo real e clicável — várias telas, estilos compartilhados e interações ao vivo — renderizado direto em HTML que você pode abrir, compartilhar e entregar à engenharia.',
    heroImageAlt:
      'Ilustração editorial de uma mão esboçando um wireframe que vira um protótipo de app clicável de várias telas',
    tldrTitle: 'Em uma linha',
    tldrBody:
      'O Open Design é a camada de design para o agente de programação que você já usa. Para prototipagem, isso significa ir de uma ideia de um parágrafo a um protótipo navegável e estilizado em uma única sessão — sem ferramenta de design, sem etapa de exportação, sem lacuna na entrega.',
    stepsTitle: 'Como funciona a prototipagem com o Open Design',
    steps: [
      {
        title: 'Descreva o fluxo',
        body: 'Diga ao seu agente o que você está construindo em linguagem simples — «um fluxo de onboarding com tela de boas-vindas, seletor de planos e confirmação». O Open Design carrega a habilidade de protótipo para que o agente saiba que deve produzir telas, não uma única página.',
        imageAlt:
          'Ilustração de uma pessoa digitando em um terminal uma descrição em linguagem simples do fluxo de um app',
      },
      {
        title: 'Gere telas estilizadas',
        body: 'O agente aplica um sistema de design e modelos de protótipo do Open Design, então cada tela compartilha tipografia, espaçamento e componentes em vez de parecer um rascunho. Você obtém um conjunto coerente de telas, não maquetes desconexas.',
        imageAlt:
          'Ilustração de várias telas de app surgindo em sequência, todas compartilhando um estilo visual consistente',
      },
      {
        title: 'Conecte as interações',
        body: 'Os botões navegam, as abas trocam, os modais abrem. O protótipo é renderizado em HTML autocontido, então se comporta como o produto real em qualquer navegador — não é preciso conta em uma ferramenta de prototipagem para visualizá-lo.',
        imageAlt:
          'Ilustração de um cursor clicando por telas conectadas com setas mostrando a navegação entre elas',
      },
      {
        title: 'Itere e entregue',
        body: 'Refine conversando com o agente — «coloque o seletor de planos em um layout de três colunas». Como o artefato vive no seu projeto, o design e o código final compartilham uma única fonte da verdade, fechando a habitual lacuna de entrega entre designer e engenheiro.',
        imageAlt:
          'Ilustração de um protótipo sendo revisado e depois passado a um engenheiro, com design e código se fundindo em um só arquivo',
      },
    ],
    tableTitle: 'Prototipagem com Open Design vs. o jeito antigo',
    tableColCapability: 'O que você precisa',
    tableColWithOd: 'Com o Open Design',
    tableColWithout: 'Ferramentas de prototipagem tradicionais',
    tableRows: [
      {
        capability: 'Ir da ideia à primeira tela',
        withOd: 'Um prompt no agente que você já tem aberto',
        without: 'Abrir uma ferramenta separada, iniciar um arquivo, arrastar caixas à mão',
      },
      {
        capability: 'Várias telas conectadas',
        withOd: 'Geradas como um conjunto com estilos compartilhados e navegação funcionando',
        without: 'Cada quadro desenhado e conectado manualmente',
      },
      {
        capability: 'Sistema visual consistente',
        withOd: 'Vindo de um sistema de design reutilizável que o agente aplica',
        without: 'Recriado por arquivo ou mantido à mão',
      },
      {
        capability: 'Resultado compartilhável',
        withOd: 'HTML autocontido — abre em qualquer navegador, sem conta',
        without: 'Quem visualiza precisa de uma licença ou de um link de compartilhamento na ferramenta do fornecedor',
      },
      {
        capability: 'Caminho até o código real',
        withOd: 'O artefato vive no seu repositório; design e código compartilham uma fonte',
        without: 'Refeito do zero após uma entrega separada',
      },
      {
        capability: 'Custo e dependência do fornecedor',
        withOd: 'Código aberto, use suas próprias chaves, roda localmente',
        without: 'Assinatura por licença, hospedado pelo fornecedor, exportação limitada',
      },
    ],
    featuresTitle: 'O que você pode prototipar',
    features: [
      {
        title: 'Apps web de várias telas',
        body: 'Fluxos completos com navegação compartilhada — onboarding, painéis, configurações — não páginas avulsas.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Fluxos de apps mobile',
        body: 'Jornadas mobile tela a tela com transições e estados de cara nativa.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Páginas de destino',
        body: 'Páginas de marketing e landings SaaS que você pode percorrer e publicar.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Qualquer gosto visual',
        body: 'Editorial, suave ou brutalista — o protótipo carrega um estilo coerente do começo ao fim.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Lista de espera e preços',
        body: 'Superfícies de conversão — listas de espera, tabelas de preços — conectadas e com a sua marca.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Gamificado e divertido',
        body: 'Conceitos com muita interação, onde movimento e estado fazem parte da proposta.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Protótipos que as pessoas criaram com o Open Design',
    galleryLead:
      'Cada um deles começou como um prompt e foi renderizado em um artefato clicável. Escolha um modelo próximo da sua ideia, descreva sua variação e o agente o adapta.',
    gallery: [
      { thumb: "example-dating-web", caption: "App web de namoro — fluxo de várias telas" },
      { thumb: "example-hr-onboarding", caption: "Fluxo de onboarding de RH" },
      { thumb: "example-kami-landing", caption: "Página de destino de produto" },
      { thumb: "example-web-prototype-taste-soft", caption: "Protótipo web de estilo suave" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar modelos de protótipo',
    faqTitle: 'Perguntas frequentes sobre prototipagem',
    faq: [
      {
        q: 'Preciso de uma ferramenta de design como o Figma para prototipar com o Open Design?',
        a: 'Não. O Open Design roda dentro do seu agente de programação e renderiza protótipos em HTML. Você descreve o fluxo em palavras; o agente produz as telas. Não há uma ferramenta de canvas separada para aprender ou pagar.',
      },
      {
        q: 'Os protótipos são interativos ou apenas maquetes estáticas?',
        a: 'Interativos. Navegação, abas e modais funcionam porque a saída é HTML e CSS reais. Você pode percorrê-los em qualquer navegador exatamente como um usuário faria.',
      },
      {
        q: 'Quais agentes posso usar?',
        a: 'O Open Design funciona com Claude Code, Codex, Cursor Agent, Gemini CLI e mais uma dúzia de adaptadores nativos. Você usa suas próprias chaves de provedor; nada é hospedado por você.',
      },
      {
        q: 'Um protótipo pode virar o produto real?',
        a: 'É essa a ideia. O artefato vive no seu projeto, então o mesmo sistema de design e os componentes seguem para o código de produção em vez de serem descartados após uma entrega.',
      },
    ],
    ctaTitle: 'Prototipe sua próxima ideia hoje à noite',
    ctaBody:
      'Dê uma estrela ao repositório, instale o Open Design e transforme seu próximo «e se...» em algo que você pode clicar — no agente que você já usa.',
  },
  dashboard: {
    title: 'Gere painéis de dados com Open Design + Claude Code',
    description:
      'Descreva as métricas que você acompanha e deixe seu agente de programação construir um painel estilizado e responsivo — gráficos, cartões de KPI e tabelas renderizados em HTML que você hospeda onde quiser. Sem licença de ferramenta de BI, sem construtor de arrastar e soltar.',
    breadcrumb: 'Painel',
    label: 'Caso de uso · Painel',
    heading: 'Painéis a partir de uma descrição, não de um construtor de arrastar e soltar',
    lead: 'Diga ao seu agente o que mostrar e como deve parecer. O Open Design fornece os padrões de gráfico, o sistema de layout e a linguagem visual para que você obtenha um painel coerente e apresentável — não uma parede de widgets com estilo padrão.',
    heroImageAlt:
      'Ilustração editorial de números brutos à esquerda fluindo para um painel limpo de gráficos e cartões de KPI à direita',
    tldrTitle: 'Em uma linha',
    tldrBody:
      'O Open Design transforma uma especificação em linguagem simples das suas métricas em um painel estilizado que seu agente renderiza em HTML — versionado no seu repositório, hospedável onde quiser, sem assinatura de BI por licença.',
    stepsTitle: 'Como funcionam os painéis com o Open Design',
    steps: [
      {
        title: 'Descreva as métricas',
        body: 'Liste o que importa — «usuários ativos semanais, receita por plano, churn e uma tendência de 30 dias». O agente carrega a habilidade de painel para saber que deve dispor cartões de KPI, gráficos e uma tabela em vez de um único bloco de texto.',
        imageAlt: 'Ilustração de uma pessoa listando as métricas que lhe importam',
      },
      {
        title: 'Escolha os padrões de gráfico',
        body: 'O Open Design traz modelos de gráfico e layout, então tendências viram gráficos de linha, divisões viram barras e proporções viram a visualização certa — tipografia e espaçamento consistentes em tudo, em vez de padrões desencontrados.',
        imageAlt: 'Ilustração de vários tipos de gráfico organizados em uma grade coerente',
      },
      {
        title: 'Conecte seus dados',
        body: 'Aponte o painel para um CSV, um endpoint JSON ou cole linhas de exemplo. Ele renderiza em HTML autocontido que se atualiza quando os dados mudam — abra em qualquer navegador, coloque em qualquer hospedagem estática.',
        imageAlt: 'Ilustração de um arquivo de dados conectando-se a um painel com atualização ao vivo',
      },
      {
        title: 'Refine e publique',
        body: 'Ajuste conversando com o agente — «agrupe a receita por região, mova a linha de KPI para o topo». O artefato vive no seu projeto, então o painel pode ser revisado e versionado como qualquer outro código.',
        imageAlt: 'Ilustração de um painel sendo refinado e depois implantado',
      },
    ],
    tableTitle: 'Painéis com Open Design vs. o jeito antigo',
    tableColCapability: 'O que você precisa',
    tableColWithOd: 'Com o Open Design',
    tableColWithout: 'Ferramentas de BI / codificado à mão',
    tableRows: [
      {
        capability: 'Ir da lista de métricas ao layout',
        withOd: 'Um prompt; o agente dispõe cartões, gráficos e tabelas',
        without: 'Arrastar widgets um a um, ou escrever o código dos gráficos do zero',
      },
      {
        capability: 'Sistema visual consistente',
        withOd: 'Padrões de gráfico e espaçamento de um sistema de design reutilizável',
        without: 'Estilos de widget padrão, ou estilizado à mão por gráfico',
      },
      {
        capability: 'Conectar dados',
        withOd: 'CSV / JSON / linhas coladas, renderizado em HTML ao vivo',
        without: 'Conectores do fornecedor ou encanamento de dados sob medida',
      },
      {
        capability: 'Hospedagem e compartilhamento',
        withOd: 'HTML autocontido em qualquer hospedagem estática, sem conta',
        without: 'Quem visualiza precisa de uma licença no fornecedor de BI',
      },
      {
        capability: 'Revisão e versionamento',
        withOd: 'Vive no seu repositório; comparável como código',
        without: 'Trancado dentro do fornecedor, sem diff real',
      },
      {
        capability: 'Custo e dependência do fornecedor',
        withOd: 'Código aberto, use suas próprias chaves, roda localmente',
        without: 'Assinatura por licença, hospedado pelo fornecedor',
      },
    ],
    featuresTitle: "O que você pode construir",
    features: [
      { title: "Analytics de produto", body: "Usuários ativos, funis, retenção — as métricas em que um time de produto vive.", thumb: "example-dashboard" },
      { title: "Métricas de repositório e dev", body: "Estrelas, PRs, saúde de CI — painéis de engenharia com os seus próprios dados.", thumb: "example-github-dashboard" },
      { title: "Relatórios financeiros", body: "Receita, queima de caixa e fôlego dispostos como um relatório para compartilhar.", thumb: "example-finance-report" },
      { title: "Operações ao vivo", body: "Métricas em tempo real que se atualizam conforme os dados de base se movem.", thumb: "example-live-dashboard" },
      { title: "Redes e marketing", body: "Desempenho de canais e acompanhamento de campanhas em uma só visão.", thumb: "example-social-media-dashboard" },
      { title: "Relatórios por área", body: "Relatórios estruturados para qualquer campo — do clínico ao trading.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Painéis que as pessoas criaram com o Open Design',
    galleryLead:
      'Painéis reais renderizados a partir de um prompt e de uma fonte de dados. Comece por um próximo do seu e descreva as métricas que você acompanha.',
    gallery: [
      { thumb: "example-data-report", caption: "Relatório de dados" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Painel de operações ao vivo" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Painel de análise de trading" },
      { thumb: "example-frame-data-chart-nyt", caption: "Gráfico de dados editorial" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar modelos de painel',
    faqTitle: 'Perguntas frequentes sobre painéis',
    faq: [
      {
        q: 'Preciso de uma ferramenta de BI como Tableau ou Looker?',
        a: 'Não. O Open Design renderiza painéis em HTML dentro do seu agente de programação. Você descreve as métricas e o aponta para os seus dados; não há uma plataforma de BI separada para licenciar ou aprender.',
      },
      {
        q: 'De onde vêm os dados?',
        a: 'De um CSV, um endpoint JSON ou linhas que você cola. O painel é HTML e JavaScript puros, então você controla exatamente de onde ele lê — nada passa por um serviço hospedado.',
      },
      {
        q: 'Colegas não técnicos conseguem visualizar?',
        a: 'Sim. A saída é uma página web autocontida. Qualquer pessoa com o link ou o arquivo pode abri-la em um navegador — sem conta, sem licença.',
      },
      {
        q: 'Quais agentes posso usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e mais uma dúzia de adaptadores nativos. Você usa suas próprias chaves de provedor.',
      },
    ],
    ctaTitle: 'Construa seu painel hoje à noite',
    ctaBody:
      'Dê uma estrela ao repositório, instale o Open Design e transforme suas métricas em um painel que você pode hospedar onde quiser — no agente que você já usa.',
  },
  slides: {
    title: 'Gere apresentações com Open Design + Claude Code',
    description:
      'Transforme um roteiro em uma apresentação projetada e fiel à marca sem abrir um app de apresentações. O Open Design dá ao seu agente de programação modelos de slides e um sistema visual, renderizando os slides em HTML que você apresenta, exporta ou compartilha.',
    breadcrumb: 'Slides',
    label: 'Caso de uso · Slides',
    heading: 'Apresentações com cara de projetadas, escritas por um prompt',
    lead: 'Entregue ao seu agente um roteiro e um tom. O Open Design aplica um modelo de apresentação e um sistema visual para que cada slide fique disposto, composto e fiel à marca — não uma lista de tópicos sobre um fundo em branco.',
    heroImageAlt:
      'Ilustração editorial de um roteiro à esquerda virando uma sequência de slides de apresentação projetados à direita',
    tldrTitle: 'Em uma linha',
    tldrBody:
      'O Open Design transforma um roteiro em uma apresentação HTML projetada que seu agente renderiza em uma única sessão — apresente no navegador, exporte para PDF ou PPTX e mantenha a fonte no seu repositório.',
    stepsTitle: 'Como funcionam as apresentações com o Open Design',
    steps: [
      {
        title: 'Dê o roteiro',
        body: 'Cole seus pontos de fala ou uma estrutura aproximada. O agente carrega a habilidade de apresentação para produzir uma sequência de slides dispostos, não um único documento longo.',
        imageAlt: 'Ilustração de um roteiro de texto sendo entregue a um agente',
      },
      {
        title: 'Escolha um estilo de apresentação',
        body: 'O Open Design traz modelos de apresentação — editorial, suíço-internacional, técnico escuro e mais. O agente aplica um para que tipografia, grade e acentos fiquem consistentes em cada slide.',
        imageAlt: 'Ilustração de várias opções de estilo de apresentação dispostas lado a lado',
      },
      {
        title: 'Gere os slides',
        body: 'Cada ponto vira um slide projetado com a hierarquia certa — títulos, apoios visuais, destaques de dados. Renderiza em HTML, então é apresentado em tela cheia em qualquer navegador.',
        imageAlt: 'Ilustração de uma sequência de slides finalizados com estilo consistente',
      },
      {
        title: 'Apresente, exporte, itere',
        body: 'Apresente pelo navegador, ou exporte para PDF / PPTX para compartilhar. Refine conversando com o agente — «aperte o slide de dados, adicione uma chamada para ação de encerramento». A fonte da apresentação fica no seu projeto.',
        imageAlt: 'Ilustração de uma apresentação sendo apresentada e exportada para vários formatos',
      },
    ],
    tableTitle: 'Apresentações com Open Design vs. o jeito antigo',
    tableColCapability: 'O que você precisa',
    tableColWithOd: 'Com o Open Design',
    tableColWithout: 'PowerPoint / Keynote / ferramentas de IA para slides',
    tableRows: [
      {
        capability: 'Ir do roteiro aos slides',
        withOd: 'Um prompt; o agente dispõe cada slide',
        without: 'Construir cada slide à mão, ou brigar com um modelo',
      },
      {
        capability: 'Design consistente',
        withOd: 'Modelos de apresentação com grade e sistema tipográfico reais',
        without: 'Desvio de tema, alinhamento manual, padrões fora da marca',
      },
      {
        capability: 'Dados e diagramas',
        withOd: 'Gráficos e destaques renderizados como parte do slide',
        without: 'Colar imagens estáticas ou refazer os gráficos toda vez',
      },
      {
        capability: 'Formatos de exportação',
        withOd: 'HTML para apresentar, além de exportação para PDF / PPTX',
        without: 'Preso ao formato de um único app',
      },
      {
        capability: 'Revisão e versionamento',
        withOd: 'A fonte vive no seu repositório, comparável',
        without: 'Arquivo binário, sem diff com sentido',
      },
      {
        capability: 'Custo e dependência do fornecedor',
        withOd: 'Código aberto, use suas próprias chaves, roda localmente',
        without: 'Licença do app ou complemento de IA por licença',
      },
    ],
    featuresTitle: "O que você pode apresentar",
    features: [
      { title: "Pitch decks", body: "Apresentações para investidores e vendas com narrativa forte e slides de dados limpos.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Suíço / editorial", body: "Apresentações tipográficas guiadas por grade com cara de direção de arte.", thumb: "example-deck-swiss-international" },
      { title: "Módulos de curso", body: "Apresentações de ensino com passos claros, destaques e ritmo.", thumb: "example-html-ppt-course-module" },
      { title: "Apresentações com gráficos de dados", body: "Apresentações escuras e voltadas a gráficos para analytics e revisões.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Modo apresentador", body: "Apresentações estilo Reveal feitas para apresentar ao vivo no navegador.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Plantas técnicas", body: "Apresentações de arquitetura e conhecimento que mapeiam sistemas complexos.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Apresentações que as pessoas criaram com o Open Design',
    galleryLead:
      'Apresentações reais renderizadas a partir de um roteiro. Escolha um estilo próximo da sua palestra e descreva o conteúdo.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Apresentação tipo revista editorial" },
      { thumb: "example-guizang-ppt", caption: "Keynote ilustrado" },
      { thumb: "example-deck-open-slide-canvas", caption: "Apresentação de canvas de slides aberto" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Apresentação com tema gradiente" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar modelos de apresentação',
    faqTitle: 'Perguntas frequentes sobre slides',
    faq: [
      {
        q: 'Preciso de PowerPoint ou Keynote?',
        a: 'Não. O Open Design renderiza apresentações em HTML dentro do seu agente de programação e pode exportar para PDF ou PPTX. Você apresenta pelo navegador ou entrega um arquivo — não é preciso um app de apresentações para criá-la.',
      },
      {
        q: 'Isso é só tópicos gerados por IA?',
        a: 'Não. O agente aplica um modelo de apresentação real com grade, escala tipográfica e hierarquia visual, então os slides parecem projetados em vez de preenchidos automaticamente.',
      },
      {
        q: 'Posso exportar para PowerPoint para um cliente?',
        a: 'Sim. As apresentações exportam para PPTX e PDF além do HTML pelo qual você apresenta, então se encaixam no que quer que a plateia espere.',
      },
      {
        q: 'Quais agentes posso usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e mais adaptadores nativos, com suas próprias chaves de provedor.',
      },
    ],
    ctaTitle: 'Construa sua próxima apresentação hoje à noite',
    ctaBody:
      'Dê uma estrela ao repositório, instale o Open Design e transforme seu roteiro em uma apresentação projetada — no agente que você já usa.',
  },
  image: {
    title: 'Gere gráficos fiéis à marca com Open Design + Claude Code',
    description:
      'Produza cartões para redes, capas de artigos e gráficos de marketing a partir de um prompt — dispostos com tipografia real e o seu sistema de marca, renderizados em HTML nítido que você exporta para PNG. Sem app de design, sem assinatura de modelos.',
    breadcrumb: 'Imagem',
    label: 'Caso de uso · Imagem',
    heading: 'Gráficos fiéis à marca, gerados e dispostos para você',
    lead: 'Descreva o cartão ou a capa que você precisa. O Open Design o compõe com tipografia, grade e as cores da sua marca reais — depois renderiza em HTML que você exporta como imagem, em vez de brigar com um app de design ou um modelo genérico.',
    heroImageAlt:
      'Ilustração editorial de um prompt virando um conjunto de cartões para redes e capas de artigos dispostos',
    tldrTitle: 'Em uma linha',
    tldrBody:
      'O Open Design transforma um prompt em um gráfico composto e fiel à marca que seu agente renderiza em HTML e exporta para PNG — repetível, versionado e livre de ferramentas de design por licença.',
    stepsTitle: 'Como funcionam os gráficos com o Open Design',
    steps: [
      {
        title: 'Descreva o gráfico',
        body: 'Diga o que é — «um cartão de Twitter para o nosso lançamento com a manchete e uma citação». O agente carrega a habilidade certa para compor um gráfico disposto, não um bloco de texto simples.',
        imageAlt: 'Ilustração de uma pessoa descrevendo um cartão para redes de que precisa',
      },
      {
        title: 'Aplique o sistema de marca',
        body: 'O Open Design puxa suas cores, tipografia e espaçamento de um sistema de design reutilizável, então cada cartão combina com o restante da sua marca em vez de parecer algo avulso.',
        imageAlt: 'Ilustração de cores e tipografia da marca sendo aplicadas ao layout de um cartão',
      },
      {
        title: 'Renderize e exporte',
        body: 'O gráfico renderiza em HTML nas dimensões exatas que você precisa — cartão para redes, capa, banner — e depois exporta para PNG. Texto nítido, layout real, sem ajustes manuais.',
        imageAlt: 'Ilustração de um gráfico renderizando e exportando para um arquivo de imagem',
      },
      {
        title: 'Reutilize a receita',
        body: 'Como é um modelo, o próximo gráfico está a um prompt de distância — troque a manchete, mantenha o layout. Séries de cartões ficam perfeitamente consistentes.',
        imageAlt: 'Ilustração de um modelo de cartão produzindo uma série consistente de gráficos',
      },
    ],
    tableTitle: 'Gráficos com Open Design vs. o jeito antigo',
    tableColCapability: 'O que você precisa',
    tableColWithOd: 'Com o Open Design',
    tableColWithout: 'Apps de design / modelos genéricos',
    tableRows: [
      {
        capability: 'Ir da ideia ao gráfico disposto',
        withOd: 'Um prompt; o agente compõe tipografia e layout',
        without: 'Abrir um app, posicionar cada elemento à mão',
      },
      {
        capability: 'Manter a marca',
        withOd: 'Cores e tipografia de um sistema de design reutilizável',
        without: 'Reescolher estilos de marca por arquivo, ou desviar da marca',
      },
      {
        capability: 'Série consistente',
        withOd: 'Mesmo modelo, novo texto — um conjunto perfeitamente alinhado',
        without: 'Realinhar cada variação manualmente',
      },
      {
        capability: 'Exportação',
        withOd: 'HTML em dimensões exatas, exportado para PNG',
        without: 'Dimensionamento de canvas e configurações de exportação manuais',
      },
      {
        capability: 'Repetível',
        withOd: 'Uma receita baseada em prompt no seu repositório',
        without: 'Um arquivo avulso que você recria toda vez',
      },
      {
        capability: 'Custo e dependência do fornecedor',
        withOd: 'Código aberto, use suas próprias chaves, roda localmente',
        without: 'Ferramenta de design por licença ou marketplace de modelos',
      },
    ],
    featuresTitle: "O que você pode criar",
    features: [
      { title: "Cartões para redes", body: "Cartões de X / Twitter compostos com a sua manchete e a sua marca.", thumb: "example-card-twitter" },
      { title: "Capas de artigos", body: "Capas editoriais, estilo revista, para posts e newsletters.", thumb: "example-article-magazine" },
      { title: "Cartões do Xiaohongshu", body: "Cartões estilo RedNote afinados para aquele feed.", thumb: "example-card-xiaohongshu" },
      { title: "Gráficos hero", body: "Visuais hero líquidos e com gradiente para sites e lançamentos.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Carrosséis", body: "Carrosséis para redes de vários slides que se mantêm consistentes entre quadros.", thumb: "example-social-carousel" },
      { title: "Molduras de mockup de UI", body: "Molduras de notificação e de dispositivo para narrar o produto.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Gráficos que as pessoas criaram com o Open Design',
    galleryLead:
      'Cartões e capas reais renderizados a partir de um prompt. Escolha um próximo do que você precisa e troque pelo seu texto.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Cartão para redes em tons pastel" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Pôster editorial em três tons" },
      { thumb: "example-magazine-poster", caption: "Pôster estilo revista" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Capa editorial ousada" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar modelos de gráfico',
    faqTitle: 'Perguntas frequentes sobre imagens',
    faq: [
      {
        q: 'Isso é um gerador de imagens por IA como o Midjourney?',
        a: 'Não. O Open Design compõe gráficos com layout e tipografia reais — sua manchete, sua marca, dimensões exatas — e renderiza em HTML que você exporta como PNG. É composição de design, não geração de pixels.',
      },
      {
        q: 'Posso criar uma série consistente de cartões?',
        a: 'Sim. Como cada gráfico é um modelo, você mantém o layout e muda o texto, então uma série inteira fica perfeitamente alinhada e fiel à marca.',
      },
      {
        q: 'Que tamanhos ele consegue produzir?',
        a: 'Qualquer um — o gráfico renderiza nas dimensões exatas que você especificar, de um cartão quadrado para redes a um banner largo, e depois exporta para PNG.',
      },
      {
        q: 'Quais agentes posso usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e mais adaptadores nativos, com suas próprias chaves de provedor.',
      },
    ],
    ctaTitle: 'Crie seu próximo gráfico hoje à noite',
    ctaBody:
      'Dê uma estrela ao repositório, instale o Open Design e transforme um prompt em um gráfico fiel à marca — no agente que você já usa.',
  },
  video: {
    title: 'Gere motion graphics e vídeo curto com Open Design + Claude Code',
    description:
      'Transforme um roteiro em quadros animados e vídeo de formato curto — cartões de título, fundos em movimento e encerramentos compostos com o seu sistema de marca e renderizados a partir de HTML. Sem suíte de motion graphics, sem arrastar por uma linha do tempo.',
    breadcrumb: 'Vídeo',
    label: 'Caso de uso · Vídeo',
    heading: 'Motion graphics a partir de um roteiro, não de uma linha do tempo',
    lead: 'Descreva o momento que você quer — uma revelação de título, uma animação de dados, um encerramento com logo. O Open Design compõe quadros animados com o seu sistema de marca e os renderiza em vídeo, sem suíte de motion graphics.',
    heroImageAlt:
      'Ilustração editorial de um roteiro virando uma sequência de quadros de vídeo animados',
    tldrTitle: 'Em uma linha',
    tldrBody:
      'O Open Design transforma um roteiro em quadros animados e fiéis à marca que seu agente renderiza em vídeo de formato curto — compostos a partir de HTML, versionados no seu repositório, sem editor de linha do tempo para aprender.',
    stepsTitle: 'Como funciona o movimento com o Open Design',
    steps: [
      {
        title: 'Descreva o momento',
        body: 'Diga o que deve acontecer — «um título com glitch que se resolve no nosso logo, depois um cartão de encerramento». O agente carrega a habilidade de movimento para produzir quadros animados, não uma imagem estática.',
        imageAlt: 'Ilustração de uma pessoa descrevendo uma sequência de movimento',
      },
      {
        title: 'Aplique a marca e o estilo de movimento',
        body: 'O Open Design fornece modelos de quadro — vazamentos de luz cinematográficos, títulos com glitch, encerramentos com logo — e aplica suas cores e tipografia, então o movimento parece intencional e fiel à marca.',
        imageAlt: 'Ilustração de estilo de marca aplicado a quadros animados',
      },
      {
        title: 'Renderize os quadros em vídeo',
        body: 'Os quadros são compostos em HTML e renderizados em vídeo, então o tempo e o layout são precisos e repetíveis — sem keyframing manual em uma linha do tempo.',
        imageAlt: 'Ilustração de quadros HTML renderizando em um clipe de vídeo',
      },
      {
        title: 'Itere e exporte',
        body: 'Refine conversando com o agente — «desacelere a revelação do título, adicione uma legenda». Exporte clipes de formato curto para redes ou produto. A fonte fica no seu projeto.',
        imageAlt: 'Ilustração de um clipe de vídeo sendo refinado e exportado para redes',
      },
    ],
    tableTitle: 'Movimento com Open Design vs. o jeito antigo',
    tableColCapability: 'O que você precisa',
    tableColWithOd: 'Com o Open Design',
    tableColWithout: 'After Effects / suítes de motion',
    tableRows: [
      {
        capability: 'Ir do roteiro a quadros animados',
        withOd: 'Um prompt; o agente compõe a sequência',
        without: 'Fazer keyframe de cada elemento em uma linha do tempo à mão',
      },
      {
        capability: 'Manter a marca',
        withOd: 'Modelos de quadro + suas cores e tipografia',
        without: 'Refazer o estilo de marca por projeto',
      },
      {
        capability: 'Tempo preciso e repetível',
        withOd: 'Composto em HTML, renderizado de forma determinística',
        without: 'Arraste manual, difícil de reproduzir',
      },
      {
        capability: 'Exportar para redes',
        withOd: 'Clipes de formato curto renderizados em vídeo',
        without: 'Predefinições de exportação e lida com codecs',
      },
      {
        capability: 'Revisão e versionamento',
        withOd: 'A fonte dos quadros vive no seu repositório, comparável',
        without: 'Arquivo de projeto binário, sem diff real',
      },
      {
        capability: 'Custo e dependência do fornecedor',
        withOd: 'Código aberto, use suas próprias chaves, roda localmente',
        without: 'Suíte cara, curva de aprendizado íngreme',
      },
    ],
    featuresTitle: "O que você pode animar",
    features: [
      { title: "Hyperframes", body: "Sequências de movimento quadro a quadro compostas a partir de HTML.", thumb: "example-video-hyperframes" },
      { title: "Formato curto para redes", body: "Clipes verticais feitos para os feeds de redes.", thumb: "example-video-shortform" },
      { title: "Conjuntos de quadros de movimento", body: "Quadros animados reutilizáveis que você compõe em um clipe.", thumb: "example-motion-frames" },
      { title: "Vazamentos de luz cinematográficos", body: "Transições fílmicas e fundos atmosféricos.", thumb: "example-frame-light-leak-cinema" },
      { title: "Títulos com glitch", body: "Revelações de título com movimento e textura.", thumb: "example-frame-glitch-title" },
      { title: "Encerramentos com logo", body: "Animações de encerramento com a sua marca para qualquer clipe.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Movimento que as pessoas criaram com o Open Design',
    galleryLead:
      'Quadros e clipes animados reais renderizados a partir de um prompt. Escolha um próximo da sua ideia e descreva o movimento.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Sequência de Hyperframes" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Fundo em movimento líquido" },
      { thumb: "example-frame-macos-notification", caption: "Quadro de UI animado" },
      { thumb: "example-frame-data-chart-nyt", caption: "Gráfico de dados animado" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar modelos de movimento',
    faqTitle: 'Perguntas frequentes sobre vídeo',
    faq: [
      {
        q: 'Preciso do After Effects ou de uma suíte de motion graphics?',
        a: 'Não. O Open Design compõe quadros animados em HTML e os renderiza em vídeo dentro do seu agente de programação. Não há editor de linha do tempo para aprender ou licenciar.',
      },
      {
        q: 'Para que tipo de vídeo isso é bom?',
        a: 'Movimento de formato curto — cartões de título, animações de dados, encerramentos com logo, clipes para redes. É feito para movimento de marca e produto, não para edição de longa-metragem.',
      },
      {
        q: 'O tempo é reproduzível?',
        a: 'Sim. Como os quadros são compostos em código e renderizados de forma determinística, você obtém o mesmo resultado toda vez e pode ajustá-lo com precisão por um prompt.',
      },
      {
        q: 'Quais agentes posso usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e mais adaptadores nativos, com suas próprias chaves de provedor.',
      },
    ],
    ctaTitle: 'Anime sua próxima ideia hoje à noite',
    ctaBody:
      'Dê uma estrela ao repositório, instale o Open Design e transforme um roteiro em movimento — no agente que você já usa.',
  },
  designSystem: {
    title: 'Crie e aplique um sistema de design com Open Design + Claude Code',
    description:
      'Capture sua marca como um sistema de design reutilizável que seu agente de programação aplica a cada artefato — cores, tipografia, componentes e tom em um único DESIGN.md. Defina uma vez; cada protótipo, apresentação e painel se mantém fiel à marca.',
    breadcrumb: 'Sistema de design',
    label: 'Caso de uso · Sistema de design',
    heading: 'Um sistema de design, aplicado a tudo o que seu agente cria',
    lead: 'Defina sua marca uma vez e o Open Design a leva para cada saída — protótipos, apresentações, painéis, gráficos. O sistema vive no seu repositório como um DESIGN.md que o agente lê, então a consistência é automática, não manual.',
    heroImageAlt:
      'Ilustração editorial de um único sistema de design irradiando para muitos artefatos fiéis à marca',
    tldrTitle: 'Em uma linha',
    tldrBody:
      'O Open Design captura sua marca como um sistema de design portátil que seu agente aplica a cada artefato — definido uma vez no seu repositório, aplicado em todo lugar, sem uma ferramenta de design central para controlar o acesso.',
    stepsTitle: 'Como funcionam os sistemas de design com o Open Design',
    steps: [
      {
        title: 'Capture o sistema',
        body: 'Descreva sua marca — cores, tipografia, espaçamento, voz — ou aponte o agente para um site existente para extraí-la. O Open Design a escreve em um DESIGN.md que vive no seu projeto.',
        imageAlt: 'Ilustração de uma marca sendo capturada em um único arquivo de sistema de design',
      },
      {
        title: 'Parta de uma base comprovada',
        body: 'O Open Design traz mais de 140 sistemas de design de referência — de Apple e Linear a editoriais e brutalistas. Faça um fork de um próximo da sua marca em vez de começar de uma página em branco.',
        imageAlt: 'Ilustração de uma galeria de sistemas de design de referência sendo explorada',
      },
      {
        title: 'Aplique em todo lugar',
        body: 'Cada outra habilidade lê o mesmo sistema, então um protótipo, uma apresentação e um painel compartilham uma única linguagem visual — sem você ter que especificá-la de novo toda vez.',
        imageAlt: 'Ilustração de um sistema aplicado de forma consistente a muitos tipos de artefato',
      },
      {
        title: 'Faça-o evoluir em um só lugar',
        body: 'Mude o sistema e o próximo render o reflete em todo lugar. Como é um arquivo no seu repositório, as decisões de design são revisadas e versionadas como código.',
        imageAlt: 'Ilustração de um sistema de design sendo atualizado e propagando-se para todas as saídas',
      },
    ],
    tableTitle: 'Sistemas de design com Open Design vs. o jeito antigo',
    tableColCapability: 'O que você precisa',
    tableColWithOd: 'Com o Open Design',
    tableColWithout: 'Bibliotecas de ferramentas de design / guias de estilo',
    tableRows: [
      {
        capability: 'Definir o sistema',
        withOd: 'Um DESIGN.md que o agente lê, forkeado de mais de 140 referências',
        without: 'Um guia de estilo estático ou uma biblioteca presa a uma ferramenta',
      },
      {
        capability: 'Aplicar a diferentes tipos de artefato',
        withOd: 'O mesmo sistema alimenta protótipos, apresentações, painéis, gráficos',
        without: 'Reimplementado por ferramenta e por arquivo',
      },
      {
        capability: 'Manter tudo consistente',
        withOd: 'Automático — cada habilidade lê uma única fonte',
        without: 'Disciplina manual; desvia com o tempo',
      },
      {
        capability: 'Fazer a marca evoluir',
        withOd: 'Edite uma vez; o próximo render se atualiza em todo lugar',
        without: 'Buscar e substituir entre arquivos e ferramentas',
      },
      {
        capability: 'Revisão e versionamento',
        withOd: 'Vive no seu repositório, comparável como código',
        without: 'Enterrado em uma ferramenta de design, difícil de auditar',
      },
      {
        capability: 'Custo e dependência do fornecedor',
        withOd: 'Código aberto, portátil, roda localmente',
        without: 'Preso a uma assinatura de ferramenta de design',
      },
    ],
    featuresTitle: "Sistemas dos quais você pode partir",
    features: [
      { title: "Apple", body: "Estética limpa, contida, de fonte do sistema.", thumb: "design-system-apple" },
      { title: "Linear", body: "Visual nítido de ferramenta de produto com espaçamento compacto.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Suave, centrado em documentos, acolhedor.", thumb: "design-system-notion" },
      { title: "Figma", body: "Energia lúdica, colorida, de ferramenta criativa.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimalista, neutra, de nível pesquisa.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Densa, técnica, nativa para desenvolvedores.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Sistemas de design no Open Design',
    galleryLead:
      'Alguns dos mais de 140 sistemas de referência que você pode forkear como ponto de partida. Escolha um próximo da sua marca e adapte-o.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Sistema estilo Airbnb" },
      { thumb: "design-system-vercel", caption: "Sistema estilo Vercel" },
      { thumb: "design-system-stripe", caption: "Sistema estilo Stripe" },
      { thumb: "design-system-spotify", caption: "Sistema estilo Spotify" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Explorar sistemas de design',
    faqTitle: 'Perguntas frequentes sobre sistema de design',
    faq: [
      {
        q: 'O que exatamente é o sistema de design aqui?',
        a: 'Um arquivo DESIGN.md no seu repositório que captura cores, tipografia, espaçamento, componentes e voz. Cada habilidade do Open Design o lê, então sua marca é aplicada automaticamente ao que o agente produzir.',
      },
      {
        q: 'Tenho que começar do zero?',
        a: 'Não. O Open Design traz mais de 140 sistemas de design de referência que você pode forkear — de Apple e Linear a editoriais e brutalistas — e depois adaptar à sua marca.',
      },
      {
        q: 'Como ele se mantém consistente entre apresentações, painéis e protótipos?',
        a: 'Porque todas essas habilidades leem o mesmo DESIGN.md. Defina o sistema uma vez e a consistência é automática em vez de algo que você fiscaliza à mão.',
      },
      {
        q: 'Quais agentes posso usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e mais adaptadores nativos, com suas próprias chaves de provedor.',
      },
    ],
    ctaTitle: 'Defina seu sistema de design hoje à noite',
    ctaBody:
      'Dê uma estrela ao repositório, instale o Open Design e dê ao seu agente uma única marca para aplicar em todo lugar — no agente que você já usa.',
  },
};

const IT: SolutionLocaleCopy = {
  prototype: {
    title: 'Crea prototipi interattivi con Open Design + Claude Code',
    description:
      'Trasforma un prompt in un prototipo cliccabile e multi-schermata senza uscire dal terminale. Open Design fornisce al tuo agente di programmazione le competenze di design, i template e il design system per consegnare prototipi reali che apri nel browser.',
    breadcrumb: 'Prototipo',
    label: 'Caso d’uso · Prototipo',
    heading: 'Prototipa alla velocità di un prompt',
    lead: 'Descrivi il flusso che hai in mente e lascia che il tuo agente assembli un prototipo reale e cliccabile — più schermate, stili condivisi e interazioni dal vivo — renderizzato direttamente in HTML che puoi aprire, condividere e consegnare al team di ingegneria.',
    heroImageAlt:
      'Illustrazione editoriale di una mano che abbozza un wireframe che si trasforma in un prototipo di app cliccabile e multi-schermata',
    tldrTitle: 'In una riga',
    tldrBody:
      'Open Design è il livello di design per l’agente di programmazione che già usi. Per la prototipazione significa passare da un’idea di un paragrafo a un prototipo navigabile e curato nello stile in una sola sessione — senza strumento di design, senza passaggio di esportazione, senza divario di consegna.',
    stepsTitle: 'Come funziona la prototipazione con Open Design',
    steps: [
      {
        title: 'Descrivi il flusso',
        body: 'Spiega al tuo agente cosa stai costruendo in linguaggio semplice — «un flusso di onboarding con una schermata di benvenuto, un selettore di piani e una conferma». Open Design carica la skill di prototipo così l’agente sa di dover produrre schermate, non una singola pagina.',
        imageAlt:
          'Illustrazione di una persona che digita in un terminale una descrizione in linguaggio semplice del flusso di un’app',
      },
      {
        title: 'Genera schermate curate nello stile',
        body: 'L’agente applica un design system e i template di prototipo di Open Design, così ogni schermata condivide tipografia, spaziatura e componenti invece di sembrare una bozza. Ottieni un insieme coerente di schermate, non mockup scollegati.',
        imageAlt:
          'Illustrazione di più schermate di app che compaiono in sequenza, tutte con un unico stile visivo coerente',
      },
      {
        title: 'Collega le interazioni',
        body: 'I pulsanti navigano, le schede cambiano, i modali si aprono. Il prototipo viene renderizzato in HTML autonomo, così si comporta come il prodotto reale in qualsiasi browser — non serve un account in uno strumento di prototipazione per visualizzarlo.',
        imageAlt:
          'Illustrazione di un cursore che clicca tra schermate collegate con frecce che mostrano la navigazione tra di esse',
      },
      {
        title: 'Itera e consegna',
        body: 'Affina parlando con l’agente — «metti il selettore di piani su un layout a tre colonne». Poiché l’artefatto vive nel tuo progetto, il design e il codice finale condividono un’unica fonte di verità, colmando il consueto divario di consegna tra designer e ingegnere.',
        imageAlt:
          'Illustrazione di un prototipo che viene revisionato e poi passato a un ingegnere, con design e codice che si fondono in un unico file',
      },
    ],
    tableTitle: 'Prototipazione con Open Design rispetto al vecchio metodo',
    tableColCapability: 'Cosa ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Strumenti di prototipazione tradizionali',
    tableRows: [
      {
        capability: 'Passare dall’idea alla prima schermata',
        withOd: 'Un prompt nell’agente che hai già aperto',
        without: 'Aprire uno strumento separato, avviare un file, trascinare i riquadri a mano',
      },
      {
        capability: 'Più schermate collegate',
        withOd: 'Generate come insieme con stili condivisi e navigazione funzionante',
        without: 'Ogni schermata disegnata e collegata manualmente',
      },
      {
        capability: 'Sistema visivo coerente',
        withOd: 'Preso da un design system riutilizzabile che l’agente applica',
        without: 'Ricreato per ogni file o mantenuto a mano',
      },
      {
        capability: 'Risultato condivisibile',
        withOd: 'HTML autonomo — si apre in qualsiasi browser, senza account',
        without: 'Chi visualizza ha bisogno di una licenza o di un link di condivisione nello strumento del fornitore',
      },
      {
        capability: 'Percorso verso il codice reale',
        withOd: 'L’artefatto vive nel tuo repository; design e codice condividono una fonte',
        without: 'Ricostruito da zero dopo una consegna separata',
      },
      {
        capability: 'Costo e lock-in',
        withOd: 'Open source, usa le tue chiavi, gira in locale',
        without: 'Abbonamento a postazione, ospitato dal fornitore, esportazione limitata',
      },
    ],
    featuresTitle: 'Cosa puoi prototipare',
    features: [
      {
        title: 'App web multi-schermata',
        body: 'Flussi completi con navigazione condivisa — onboarding, dashboard, impostazioni — non singole pagine.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Flussi di app mobili',
        body: 'Percorsi mobili schermata per schermata con transizioni e stati dal sapore nativo.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Landing page',
        body: 'Pagine di marketing e landing SaaS che puoi percorrere e pubblicare.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Qualsiasi gusto visivo',
        body: 'Editoriale, soft o brutalista — il prototipo porta uno stile coerente dall’inizio alla fine.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Lista d’attesa e prezzi',
        body: 'Superfici di conversione — liste d’attesa, tabelle prezzi — collegate e in linea con il brand.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Giocoso e gamificato',
        body: 'Concept ricchi di interazione dove movimento e stato fanno parte della proposta.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Prototipi che le persone hanno creato con Open Design',
    galleryLead:
      'Ognuno di questi è partito come un prompt ed è stato renderizzato in un artefatto cliccabile. Scegli un template vicino alla tua idea, descrivi la tua variante e l’agente lo adatta.',
    gallery: [
      { thumb: "example-dating-web", caption: "App web di incontri — flusso multi-schermata" },
      { thumb: "example-hr-onboarding", caption: "Flusso di onboarding HR" },
      { thumb: "example-kami-landing", caption: "Landing page di prodotto" },
      { thumb: "example-web-prototype-taste-soft", caption: "Prototipo web in stile soft" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Sfoglia i template di prototipo',
    faqTitle: 'FAQ sulla prototipazione',
    faq: [
      {
        q: 'Mi serve uno strumento di design come Figma per prototipare con Open Design?',
        a: 'No. Open Design gira dentro il tuo agente di programmazione e renderizza i prototipi in HTML. Descrivi il flusso a parole; l’agente produce le schermate. Non c’è uno strumento di canvas separato da imparare o pagare.',
      },
      {
        q: 'I prototipi sono interattivi o solo mockup statici?',
        a: 'Interattivi. Navigazione, schede e modali funzionano perché l’output è HTML e CSS reali. Puoi percorrerli in qualsiasi browser esattamente come farebbe un utente.',
      },
      {
        q: 'Quali agenti posso usare?',
        a: 'Open Design funziona con Claude Code, Codex, Cursor Agent, Gemini CLI e una dozzina di altri adattatori nativi. Porti le tue chiavi del provider; nulla viene ospitato per te.',
      },
      {
        q: 'Un prototipo può diventare il prodotto reale?',
        a: 'È proprio questo il punto. L’artefatto vive nel tuo progetto, così lo stesso design system e i componenti proseguono nel codice di produzione invece di essere buttati via dopo una consegna.',
      },
    ],
    ctaTitle: 'Prototipa la tua prossima idea stasera',
    ctaBody:
      'Metti una stella al repository, installa Open Design e trasforma il tuo prossimo «e se...» in qualcosa che puoi cliccare — nell’agente che già usi.',
  },
  dashboard: {
    title: 'Genera dashboard di dati con Open Design + Claude Code',
    description:
      'Descrivi le metriche che monitori e lascia che il tuo agente di programmazione costruisca una dashboard curata nello stile e responsive — grafici, schede KPI e tabelle renderizzate in HTML che ospiti ovunque. Senza postazione di uno strumento di BI, senza costruttore drag-and-drop.',
    breadcrumb: 'Dashboard',
    label: 'Caso d’uso · Dashboard',
    heading: 'Dashboard da una descrizione, non da un costruttore drag-and-drop',
    lead: 'Di’ al tuo agente cosa mostrare e che effetto deve fare. Open Design fornisce i pattern dei grafici, il sistema di layout e il linguaggio visivo così ottieni una dashboard coerente e presentabile — non un muro di widget con lo stile predefinito.',
    heroImageAlt:
      'Illustrazione editoriale di numeri grezzi a sinistra che confluiscono in una dashboard pulita di grafici e schede KPI a destra',
    tldrTitle: 'In una riga',
    tldrBody:
      'Open Design trasforma una specifica in linguaggio semplice delle tue metriche in una dashboard curata nello stile che il tuo agente renderizza in HTML — versionata nel tuo repository, ospitabile ovunque, senza abbonamento di BI a postazione.',
    stepsTitle: 'Come funzionano le dashboard con Open Design',
    steps: [
      {
        title: 'Descrivi le metriche',
        body: 'Elenca cosa conta — «utenti attivi settimanali, ricavi per piano, abbandono e un trend a 30 giorni». L’agente carica la skill di dashboard così sa di dover disporre schede KPI, grafici e una tabella invece di un singolo blocco di testo.',
        imageAlt: 'Illustrazione di una persona che elenca le metriche a cui tiene',
      },
      {
        title: 'Scegli i pattern dei grafici',
        body: 'Open Design include template di grafico e layout, così i trend diventano grafici a linee, le suddivisioni diventano barre e i rapporti la visualizzazione giusta — tipografia e spaziatura coerenti ovunque invece di impostazioni predefinite disomogenee.',
        imageAlt: 'Illustrazione di vari tipi di grafico disposti in una griglia coerente',
      },
      {
        title: 'Collega i tuoi dati',
        body: 'Punta la dashboard a un CSV, a un endpoint JSON o incolla righe di esempio. Si renderizza in HTML autonomo che si aggiorna quando lo fanno i dati — aprila in qualsiasi browser, mettila su qualsiasi hosting statico.',
        imageAlt: 'Illustrazione di un file di dati che si collega a una dashboard con aggiornamento dal vivo',
      },
      {
        title: 'Affina e pubblica',
        body: 'Regola parlando con l’agente — «raggruppa i ricavi per regione, sposta la riga dei KPI in alto». L’artefatto vive nel tuo progetto, così la dashboard è revisionabile e versionabile come qualsiasi altro codice.',
        imageAlt: 'Illustrazione di una dashboard che viene affinata e poi distribuita',
      },
    ],
    tableTitle: 'Dashboard con Open Design rispetto al vecchio metodo',
    tableColCapability: 'Cosa ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Strumenti di BI / scritto a mano',
    tableRows: [
      {
        capability: 'Passare dalla lista delle metriche al layout',
        withOd: 'Un prompt; l’agente dispone schede, grafici e tabelle',
        without: 'Trascinare i widget uno per uno, o scrivere il codice dei grafici da zero',
      },
      {
        capability: 'Sistema visivo coerente',
        withOd: 'Pattern dei grafici e spaziatura da un design system riutilizzabile',
        without: 'Stili widget predefiniti, o stile a mano per ogni grafico',
      },
      {
        capability: 'Collegare i dati',
        withOd: 'CSV / JSON / righe incollate, renderizzato in HTML dal vivo',
        without: 'Connettori del fornitore o impianti dati su misura',
      },
      {
        capability: 'Hosting e condivisione',
        withOd: 'HTML autonomo su qualsiasi hosting statico, senza account',
        without: 'Chi visualizza ha bisogno di una postazione nel fornitore di BI',
      },
      {
        capability: 'Revisione e versionamento',
        withOd: 'Vive nel tuo repository; confrontabile come codice',
        without: 'Bloccato dentro il fornitore, senza diff reale',
      },
      {
        capability: 'Costo e lock-in',
        withOd: 'Open source, usa le tue chiavi, gira in locale',
        without: 'Abbonamento a postazione, ospitato dal fornitore',
      },
    ],
    featuresTitle: "Cosa puoi costruire",
    features: [
      { title: "Analytics di prodotto", body: "Utenti attivi, funnel, retention — le metriche in cui vive un team di prodotto.", thumb: "example-dashboard" },
      { title: "Metriche di repository e dev", body: "Stelle, PR, salute della CI — dashboard di ingegneria dai tuoi stessi dati.", thumb: "example-github-dashboard" },
      { title: "Report finanziari", body: "Ricavi, burn e autonomia di cassa disposti come un report da condividere.", thumb: "example-finance-report" },
      { title: "Operazioni dal vivo", body: "Metriche in tempo reale che si aggiornano man mano che i dati sottostanti si muovono.", thumb: "example-live-dashboard" },
      { title: "Social e marketing", body: "Performance dei canali e monitoraggio delle campagne in un’unica vista.", thumb: "example-social-media-dashboard" },
      { title: "Report di settore", body: "Report strutturati per qualsiasi ambito — dal clinico al trading.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Dashboard che le persone hanno creato con Open Design',
    galleryLead:
      'Dashboard reali renderizzate da un prompt e da una fonte di dati. Parti da una vicina alla tua e descrivi le metriche che monitori.',
    gallery: [
      { thumb: "example-data-report", caption: "Report di dati" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Dashboard di operazioni dal vivo" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Dashboard di analisi del trading" },
      { thumb: "example-frame-data-chart-nyt", caption: "Grafico dati editoriale" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Sfoglia i template di dashboard',
    faqTitle: 'FAQ sulle dashboard',
    faq: [
      {
        q: 'Mi serve uno strumento di BI come Tableau o Looker?',
        a: 'No. Open Design renderizza le dashboard in HTML dentro il tuo agente di programmazione. Descrivi le metriche e lo punti ai tuoi dati; non c’è una piattaforma di BI separata da licenziare o imparare.',
      },
      {
        q: 'Da dove vengono i dati?',
        a: 'Da un CSV, da un endpoint JSON o da righe che incolli. La dashboard è HTML e JavaScript puri, così controlli esattamente da dove legge — nulla passa attraverso un servizio ospitato.',
      },
      {
        q: 'I colleghi non tecnici possono visualizzarla?',
        a: 'Sì. L’output è una pagina web autonoma. Chiunque abbia il link o il file può aprirla in un browser — senza account, senza postazione.',
      },
      {
        q: 'Quali agenti posso usare?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e una dozzina di altri adattatori nativi. Porti le tue chiavi del provider.',
      },
    ],
    ctaTitle: 'Costruisci la tua dashboard stasera',
    ctaBody:
      'Metti una stella al repository, installa Open Design e trasforma le tue metriche in una dashboard che puoi ospitare ovunque — nell’agente che già usi.',
  },
  slides: {
    title: 'Genera presentazioni con Open Design + Claude Code',
    description:
      'Trasforma una scaletta in una presentazione progettata e in linea con il brand senza aprire un’app di presentazioni. Open Design fornisce al tuo agente di programmazione template di slide e un sistema visivo, renderizzando le slide in HTML che puoi presentare, esportare o condividere.',
    breadcrumb: 'Slide',
    label: 'Caso d’uso · Slide',
    heading: 'Presentazioni dall’aria progettata, scritte da un prompt',
    lead: 'Consegna al tuo agente una scaletta e un tono. Open Design applica un template di presentazione e un sistema visivo così ogni slide è impaginata, composta e in linea con il brand — non un elenco puntato su uno sfondo vuoto.',
    heroImageAlt:
      'Illustrazione editoriale di una scaletta a sinistra che si trasforma in una sequenza di slide di presentazione progettate a destra',
    tldrTitle: 'In una riga',
    tldrBody:
      'Open Design trasforma una scaletta in una presentazione HTML progettata che il tuo agente renderizza in una sola sessione — presentala nel browser, esportala in PDF o PPTX e conserva la fonte nel tuo repository.',
    stepsTitle: 'Come funzionano le presentazioni con Open Design',
    steps: [
      {
        title: 'Dagli la scaletta',
        body: 'Incolla i tuoi punti chiave o una struttura approssimativa. L’agente carica la skill di presentazione così produce una sequenza di slide impaginate, non un unico documento lungo.',
        imageAlt: 'Illustrazione di una scaletta testuale consegnata a un agente',
      },
      {
        title: 'Scegli uno stile di presentazione',
        body: 'Open Design include template di presentazione — editoriale, svizzero-internazionale, tecnico scuro e altri. L’agente ne applica uno così tipografia, griglia e accenti restano coerenti su ogni slide.',
        imageAlt: 'Illustrazione di varie opzioni di stile di presentazione disposte una accanto all’altra',
      },
      {
        title: 'Genera le slide',
        body: 'Ogni punto diventa una slide progettata con la giusta gerarchia — titoli, supporti visivi, evidenze di dati. Si renderizza in HTML, così si presenta a schermo intero in qualsiasi browser.',
        imageAlt: 'Illustrazione di una sequenza di slide finite con uno stile coerente',
      },
      {
        title: 'Presenta, esporta, itera',
        body: 'Presenta dal browser, o esporta in PDF / PPTX per condividere. Affina parlando con l’agente — «stringi la slide dei dati, aggiungi una call to action di chiusura». La fonte della presentazione resta nel tuo progetto.',
        imageAlt: 'Illustrazione di una presentazione che viene presentata ed esportata in più formati',
      },
    ],
    tableTitle: 'Presentazioni con Open Design rispetto al vecchio metodo',
    tableColCapability: 'Cosa ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'PowerPoint / Keynote / strumenti di IA per slide',
    tableRows: [
      {
        capability: 'Passare dalla scaletta alle slide',
        withOd: 'Un prompt; l’agente impagina ogni slide',
        without: 'Costruire ogni slide a mano, o lottare con un template',
      },
      {
        capability: 'Design coerente',
        withOd: 'Template di presentazione con una vera griglia e un sistema tipografico',
        without: 'Deriva del tema, allineamento manuale, impostazioni fuori brand',
      },
      {
        capability: 'Dati e diagrammi',
        withOd: 'Grafici ed evidenze renderizzati come parte della slide',
        without: 'Incollare immagini statiche o rifare i grafici ogni volta',
      },
      {
        capability: 'Formati di esportazione',
        withOd: 'HTML per presentare, più esportazione in PDF / PPTX',
        without: 'Vincolato al formato di una singola app',
      },
      {
        capability: 'Revisione e versionamento',
        withOd: 'La fonte vive nel tuo repository, confrontabile',
        without: 'File binario, senza diff significativo',
      },
      {
        capability: 'Costo e lock-in',
        withOd: 'Open source, usa le tue chiavi, gira in locale',
        without: 'Licenza dell’app o add-on di IA a postazione',
      },
    ],
    featuresTitle: "Cosa puoi presentare",
    features: [
      { title: "Pitch deck", body: "Presentazioni per investitori e vendite con una narrazione forte e slide di dati pulite.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Svizzero / editoriale", body: "Presentazioni tipografiche guidate dalla griglia che sembrano curate da un art director.", thumb: "example-deck-swiss-international" },
      { title: "Moduli di corso", body: "Presentazioni didattiche con passaggi chiari, evidenze e ritmo.", thumb: "example-html-ppt-course-module" },
      { title: "Presentazioni con grafici di dati", body: "Presentazioni scure e incentrate sui grafici per analytics e revisioni.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Modalità presentatore", body: "Presentazioni in stile Reveal create per presentare dal vivo nel browser.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Progetti tecnici", body: "Presentazioni di architettura e conoscenza che mappano sistemi complessi.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Presentazioni che le persone hanno creato con Open Design',
    galleryLead:
      'Presentazioni reali renderizzate da una scaletta. Scegli uno stile vicino al tuo intervento e descrivi il contenuto.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Presentazione in stile rivista editoriale" },
      { thumb: "example-guizang-ppt", caption: "Keynote illustrato" },
      { thumb: "example-deck-open-slide-canvas", caption: "Presentazione su canvas di slide aperto" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Presentazione con tema sfumato" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Sfoglia i template di presentazione',
    faqTitle: 'FAQ sulle slide',
    faq: [
      {
        q: 'Mi servono PowerPoint o Keynote?',
        a: 'No. Open Design renderizza le presentazioni in HTML dentro il tuo agente di programmazione e può esportare in PDF o PPTX. Presenti dal browser o consegni un file — non serve un’app di presentazioni per crearla.',
      },
      {
        q: 'Sono solo elenchi puntati generati dall’IA?',
        a: 'No. L’agente applica un vero template di presentazione con griglia, scala tipografica e gerarchia visiva, così le slide sembrano progettate invece che riempite automaticamente.',
      },
      {
        q: 'Posso esportare in PowerPoint per un cliente?',
        a: 'Sì. Le presentazioni si esportano in PPTX e PDF oltre all’HTML da cui presenti, così si adattano a qualsiasi cosa si aspetti il pubblico.',
      },
      {
        q: 'Quali agenti posso usare?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e altri adattatori nativi, con le tue chiavi del provider.',
      },
    ],
    ctaTitle: 'Costruisci la tua prossima presentazione stasera',
    ctaBody:
      'Metti una stella al repository, installa Open Design e trasforma la tua scaletta in una presentazione progettata — nell’agente che già usi.',
  },
  image: {
    title: 'Genera grafiche in linea con il brand con Open Design + Claude Code',
    description:
      'Produci card social, copertine di articoli e grafiche di marketing da un prompt — impaginate con tipografia reale e il tuo sistema di brand, renderizzate in HTML nitido che esporti in PNG. Senza app di design, senza abbonamento ai template.',
    breadcrumb: 'Immagine',
    label: 'Caso d’uso · Immagine',
    heading: 'Grafiche in linea con il brand, generate e impaginate per te',
    lead: 'Descrivi la card o la copertina che ti serve. Open Design la compone con tipografia, griglia e i colori del tuo brand reali — poi la renderizza in HTML che puoi esportare come immagine, invece di combattere con un’app di design o un template generico.',
    heroImageAlt:
      'Illustrazione editoriale di un prompt che si trasforma in un insieme di card social e copertine di articoli impaginate',
    tldrTitle: 'In una riga',
    tldrBody:
      'Open Design trasforma un prompt in una grafica composta e in linea con il brand che il tuo agente renderizza in HTML ed esporta in PNG — ripetibile, versionata e libera da strumenti di design a postazione.',
    stepsTitle: 'Come funzionano le grafiche con Open Design',
    steps: [
      {
        title: 'Descrivi la grafica',
        body: 'Di’ cos’è — «una card di Twitter per il nostro lancio con il titolo e una citazione». L’agente carica la skill giusta così compone una grafica impaginata, non un semplice blocco di testo.',
        imageAlt: 'Illustrazione di una persona che descrive una card social di cui ha bisogno',
      },
      {
        title: 'Applica il sistema di brand',
        body: 'Open Design preleva i tuoi colori, la tipografia e la spaziatura da un design system riutilizzabile, così ogni card si abbina al resto del tuo brand invece di sembrare un’occasione isolata.',
        imageAlt: 'Illustrazione di colori e tipografia del brand applicati al layout di una card',
      },
      {
        title: 'Renderizza ed esporta',
        body: 'La grafica si renderizza in HTML alle dimensioni esatte che ti servono — card social, copertina, banner — poi si esporta in PNG. Testo nitido, layout reale, senza ritocchi manuali.',
        imageAlt: 'Illustrazione di una grafica che si renderizza e si esporta in un file immagine',
      },
      {
        title: 'Riusa la ricetta',
        body: 'Poiché è un template, la grafica successiva è a un prompt di distanza — cambia il titolo, mantieni il layout. Le serie di card restano perfettamente coerenti.',
        imageAlt: 'Illustrazione di un template di card che produce una serie coerente di grafiche',
      },
    ],
    tableTitle: 'Grafiche con Open Design rispetto al vecchio metodo',
    tableColCapability: 'Cosa ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'App di design / template generici',
    tableRows: [
      {
        capability: 'Passare dall’idea alla grafica impaginata',
        withOd: 'Un prompt; l’agente compone tipografia e layout',
        without: 'Aprire un’app, posizionare ogni elemento a mano',
      },
      {
        capability: 'Restare in linea con il brand',
        withOd: 'Colori e tipografia da un design system riutilizzabile',
        without: 'Riscegliere gli stili di brand per ogni file, o sbandare fuori brand',
      },
      {
        capability: 'Serie coerente',
        withOd: 'Stesso template, nuovo testo — un insieme perfettamente allineato',
        without: 'Riallineare ogni variante manualmente',
      },
      {
        capability: 'Esportazione',
        withOd: 'HTML alle dimensioni esatte, esportato in PNG',
        without: 'Dimensionamento del canvas e impostazioni di esportazione manuali',
      },
      {
        capability: 'Ripetibile',
        withOd: 'Una ricetta guidata da prompt nel tuo repository',
        without: 'Un file isolato che ricrei ogni volta',
      },
      {
        capability: 'Costo e lock-in',
        withOd: 'Open source, usa le tue chiavi, gira in locale',
        without: 'Strumento di design a postazione o marketplace di template',
      },
    ],
    featuresTitle: "Cosa puoi creare",
    features: [
      { title: "Card social", body: "Card per X / Twitter composte con il tuo titolo e il tuo brand.", thumb: "example-card-twitter" },
      { title: "Copertine di articoli", body: "Copertine editoriali, in stile rivista, per post e newsletter.", thumb: "example-article-magazine" },
      { title: "Card Xiaohongshu", body: "Card in stile RedNote calibrate per quel feed.", thumb: "example-card-xiaohongshu" },
      { title: "Grafiche hero", body: "Visual hero liquidi e sfumati per siti e lanci.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Caroselli", body: "Caroselli social multi-slide che restano coerenti tra i fotogrammi.", thumb: "example-social-carousel" },
      { title: "Mockup di UI", body: "Cornici di notifica e di dispositivo per raccontare il prodotto.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Grafiche che le persone hanno creato con Open Design',
    galleryLead:
      'Card e copertine reali renderizzate da un prompt. Scegline una vicina a ciò che ti serve e sostituisci il tuo testo.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Card social pastello" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Poster editoriale a tre tonalità" },
      { thumb: "example-magazine-poster", caption: "Poster in stile rivista" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Copertina editoriale audace" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Sfoglia i template di grafica',
    faqTitle: 'FAQ sulle immagini',
    faq: [
      {
        q: 'È un generatore di immagini IA come Midjourney?',
        a: 'No. Open Design compone grafiche con layout e tipografia reali — il tuo titolo, il tuo brand, dimensioni esatte — e le renderizza in HTML che esporti come PNG. È composizione di design, non generazione di pixel.',
      },
      {
        q: 'Posso creare una serie coerente di card?',
        a: 'Sì. Poiché ogni grafica è un template, mantieni il layout e cambi il testo, così un’intera serie resta perfettamente allineata e in linea con il brand.',
      },
      {
        q: 'Che dimensioni può produrre?',
        a: 'Qualsiasi — la grafica si renderizza alle dimensioni esatte che specifichi, da una card social quadrata a un banner largo, poi si esporta in PNG.',
      },
      {
        q: 'Quali agenti posso usare?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e altri adattatori nativi, con le tue chiavi del provider.',
      },
    ],
    ctaTitle: 'Crea la tua prossima grafica stasera',
    ctaBody:
      'Metti una stella al repository, installa Open Design e trasforma un prompt in una grafica in linea con il brand — nell’agente che già usi.',
  },
  video: {
    title: 'Genera motion graphics e video brevi con Open Design + Claude Code',
    description:
      'Trasforma una sceneggiatura in fotogrammi animati e video di formato breve — title card, sfondi in movimento e chiusure composti con il tuo sistema di brand e renderizzati da HTML. Senza suite di motion graphics, senza scrubbing sulla timeline.',
    breadcrumb: 'Video',
    label: 'Caso d’uso · Video',
    heading: 'Motion graphics da una sceneggiatura, non da una timeline',
    lead: 'Descrivi il momento che vuoi — una comparsa del titolo, un’animazione di dati, una chiusura con logo. Open Design compone fotogrammi animati con il tuo sistema di brand e li renderizza in video, senza suite di motion graphics.',
    heroImageAlt:
      'Illustrazione editoriale di una sceneggiatura che si trasforma in una sequenza di fotogrammi video animati',
    tldrTitle: 'In una riga',
    tldrBody:
      'Open Design trasforma una sceneggiatura in fotogrammi animati e in linea con il brand che il tuo agente renderizza in video di formato breve — composti da HTML, versionati nel tuo repository, senza editor di timeline da imparare.',
    stepsTitle: 'Come funziona il movimento con Open Design',
    steps: [
      {
        title: 'Descrivi il momento',
        body: 'Di’ cosa deve succedere — «un titolo con glitch che si risolve nel nostro logo, poi una card di chiusura». L’agente carica la skill di movimento così produce fotogrammi animati, non un’immagine statica.',
        imageAlt: 'Illustrazione di una persona che descrive una sequenza di movimento',
      },
      {
        title: 'Applica il brand e lo stile di movimento',
        body: 'Open Design fornisce template di fotogramma — light leak cinematografici, titoli con glitch, chiusure con logo — e applica i tuoi colori e la tua tipografia, così il movimento appare intenzionale e in linea con il brand.',
        imageAlt: 'Illustrazione di stile di brand applicato a fotogrammi animati',
      },
      {
        title: 'Renderizza i fotogrammi in video',
        body: 'I fotogrammi sono composti in HTML e renderizzati in video, così tempi e layout sono precisi e ripetibili — senza keyframing manuale su una timeline.',
        imageAlt: 'Illustrazione di fotogrammi HTML che si renderizzano in una clip video',
      },
      {
        title: 'Itera ed esporta',
        body: 'Affina parlando con l’agente — «rallenta la comparsa del titolo, aggiungi una didascalia». Esporta clip di formato breve per i social o il prodotto. La fonte resta nel tuo progetto.',
        imageAlt: 'Illustrazione di una clip video che viene affinata ed esportata per i social',
      },
    ],
    tableTitle: 'Movimento con Open Design rispetto al vecchio metodo',
    tableColCapability: 'Cosa ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'After Effects / suite di motion',
    tableRows: [
      {
        capability: 'Passare dalla sceneggiatura ai fotogrammi animati',
        withOd: 'Un prompt; l’agente compone la sequenza',
        without: 'Fare keyframe di ogni elemento su una timeline a mano',
      },
      {
        capability: 'Restare in linea con il brand',
        withOd: 'Template di fotogramma + i tuoi colori e la tua tipografia',
        without: 'Ricostruire lo stile di brand per ogni progetto',
      },
      {
        capability: 'Tempi precisi e ripetibili',
        withOd: 'Composto in HTML, renderizzato in modo deterministico',
        without: 'Scrubbing manuale, difficile da riprodurre',
      },
      {
        capability: 'Esportare per i social',
        withOd: 'Clip di formato breve renderizzate in video',
        without: 'Preset di esportazione e gestione dei codec',
      },
      {
        capability: 'Revisione e versionamento',
        withOd: 'La fonte dei fotogrammi vive nel tuo repository, confrontabile',
        without: 'File di progetto binario, senza diff reale',
      },
      {
        capability: 'Costo e lock-in',
        withOd: 'Open source, usa le tue chiavi, gira in locale',
        without: 'Suite costosa, curva di apprendimento ripida',
      },
    ],
    featuresTitle: "Cosa puoi animare",
    features: [
      { title: "Hyperframes", body: "Sequenze di movimento fotogramma per fotogramma composte da HTML.", thumb: "example-video-hyperframes" },
      { title: "Formato breve per social", body: "Clip verticali pensate per i feed social.", thumb: "example-video-shortform" },
      { title: "Set di fotogrammi di movimento", body: "Fotogrammi animati riutilizzabili che componi in una clip.", thumb: "example-motion-frames" },
      { title: "Light leak cinematografici", body: "Transizioni filmiche e sfondi atmosferici.", thumb: "example-frame-light-leak-cinema" },
      { title: "Titoli con glitch", body: "Comparse di titolo con movimento e texture.", thumb: "example-frame-glitch-title" },
      { title: "Chiusure con logo", body: "Animazioni di chiusura brandizzate per qualsiasi clip.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Movimento che le persone hanno creato con Open Design',
    galleryLead:
      'Fotogrammi e clip animati reali renderizzati da un prompt. Scegline uno vicino alla tua idea e descrivi il movimento.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Sequenza di Hyperframes" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Sfondo in movimento liquido" },
      { thumb: "example-frame-macos-notification", caption: "Fotogramma di UI animato" },
      { thumb: "example-frame-data-chart-nyt", caption: "Grafico dati animato" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Sfoglia i template di movimento',
    faqTitle: 'FAQ sui video',
    faq: [
      {
        q: 'Mi servono After Effects o una suite di motion graphics?',
        a: 'No. Open Design compone fotogrammi animati in HTML e li renderizza in video dentro il tuo agente di programmazione. Non c’è un editor di timeline da imparare o licenziare.',
      },
      {
        q: 'Per che tipo di video va bene?',
        a: 'Movimento di formato breve — title card, animazioni di dati, chiusure con logo, clip social. È pensato per il movimento di brand e prodotto, non per il montaggio di lungometraggi.',
      },
      {
        q: 'I tempi sono riproducibili?',
        a: 'Sì. Poiché i fotogrammi sono composti nel codice e renderizzati in modo deterministico, ottieni lo stesso risultato ogni volta e puoi ritoccarlo con precisione tramite un prompt.',
      },
      {
        q: 'Quali agenti posso usare?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e altri adattatori nativi, con le tue chiavi del provider.',
      },
    ],
    ctaTitle: 'Anima la tua prossima idea stasera',
    ctaBody:
      'Metti una stella al repository, installa Open Design e trasforma una sceneggiatura in movimento — nell’agente che già usi.',
  },
  designSystem: {
    title: 'Costruisci e applica un design system con Open Design + Claude Code',
    description:
      'Cattura il tuo brand come un design system riutilizzabile che il tuo agente di programmazione applica a ogni artefatto — colori, tipografia, componenti e tono in un unico DESIGN.md. Definiscilo una volta; ogni prototipo, presentazione e dashboard resta in linea con il brand.',
    breadcrumb: 'Design system',
    label: 'Caso d’uso · Design system',
    heading: 'Un design system, applicato a tutto ciò che il tuo agente crea',
    lead: 'Definisci il tuo brand una volta e Open Design lo porta in ogni output — prototipi, presentazioni, dashboard, grafiche. Il sistema vive nel tuo repository come un DESIGN.md che l’agente legge, così la coerenza è automatica, non manuale.',
    heroImageAlt:
      'Illustrazione editoriale di un singolo design system che si irradia in molti artefatti in linea con il brand',
    tldrTitle: 'In una riga',
    tldrBody:
      'Open Design cattura il tuo brand come un design system portabile che il tuo agente applica a ogni artefatto — definito una volta nel tuo repository, applicato ovunque, senza uno strumento di design centrale che faccia da controllore.',
    stepsTitle: 'Come funzionano i design system con Open Design',
    steps: [
      {
        title: 'Cattura il sistema',
        body: 'Descrivi il tuo brand — colori, tipografia, spaziatura, voce — oppure punta l’agente a un sito esistente per estrarlo. Open Design lo scrive in un DESIGN.md che vive nel tuo progetto.',
        imageAlt: 'Illustrazione di un brand catturato in un unico file di design system',
      },
      {
        title: 'Parti da una base collaudata',
        body: 'Open Design include oltre 140 design system di riferimento — da Apple e Linear a quelli editoriali e brutalisti. Fai il fork di uno vicino al tuo brand invece di partire da una pagina bianca.',
        imageAlt: 'Illustrazione di una galleria di design system di riferimento mentre viene sfogliata',
      },
      {
        title: 'Applicalo ovunque',
        body: 'Ogni altra skill legge lo stesso sistema, così un prototipo, una presentazione e una dashboard condividono un unico linguaggio visivo — senza che tu lo debba rispecificare ogni volta.',
        imageAlt: 'Illustrazione di un sistema applicato in modo coerente a molti tipi di artefatto',
      },
      {
        title: 'Fallo evolvere in un solo posto',
        body: 'Cambia il sistema e il render successivo lo riflette ovunque. Poiché è un file nel tuo repository, le decisioni di design sono revisionate e versionate come codice.',
        imageAlt: 'Illustrazione di un design system che viene aggiornato e si propaga a tutti gli output',
      },
    ],
    tableTitle: 'Design system con Open Design rispetto al vecchio metodo',
    tableColCapability: 'Cosa ti serve',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Librerie di strumenti di design / guide di stile',
    tableRows: [
      {
        capability: 'Definire il sistema',
        withOd: 'Un DESIGN.md che l’agente legge, forkato da oltre 140 riferimenti',
        without: 'Una guida di stile statica o una libreria legata a uno strumento',
      },
      {
        capability: 'Applicare a diversi tipi di artefatto',
        withOd: 'Lo stesso sistema alimenta prototipi, presentazioni, dashboard, grafiche',
        without: 'Reimplementato per ogni strumento e ogni file',
      },
      {
        capability: 'Mantenere tutto coerente',
        withOd: 'Automatico — ogni skill legge un’unica fonte',
        without: 'Disciplina manuale; sbanda nel tempo',
      },
      {
        capability: 'Far evolvere il brand',
        withOd: 'Modifica una volta; il render successivo si aggiorna ovunque',
        without: 'Cerca e sostituisci tra file e strumenti',
      },
      {
        capability: 'Revisione e versionamento',
        withOd: 'Vive nel tuo repository, confrontabile come codice',
        without: 'Sepolto in uno strumento di design, difficile da verificare',
      },
      {
        capability: 'Costo e lock-in',
        withOd: 'Open source, portabile, gira in locale',
        without: 'Vincolato a un abbonamento di uno strumento di design',
      },
    ],
    featuresTitle: "Sistemi da cui puoi partire",
    features: [
      { title: "Apple", body: "Estetica pulita, sobria, con font di sistema.", thumb: "design-system-apple" },
      { title: "Linear", body: "Aspetto nitido da strumento di prodotto con spaziatura compatta.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Morbido, incentrato sui documenti, accogliente.", thumb: "design-system-notion" },
      { title: "Figma", body: "Energia giocosa, colorata, da strumento creativo.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimale, neutra, di livello ricerca.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Densa, tecnica, nativa per sviluppatori.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Design system in Open Design',
    galleryLead:
      'Alcuni degli oltre 140 sistemi di riferimento di cui puoi fare il fork come punto di partenza. Scegline uno vicino al tuo brand e adattalo.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Sistema in stile Airbnb" },
      { thumb: "design-system-vercel", caption: "Sistema in stile Vercel" },
      { thumb: "design-system-stripe", caption: "Sistema in stile Stripe" },
      { thumb: "design-system-spotify", caption: "Sistema in stile Spotify" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Sfoglia i design system',
    faqTitle: 'FAQ sul design system',
    faq: [
      {
        q: 'Cos’è esattamente il design system qui?',
        a: 'Un file DESIGN.md nel tuo repository che cattura colori, tipografia, spaziatura, componenti e voce. Ogni skill di Open Design lo legge, così il tuo brand viene applicato automaticamente a qualsiasi cosa l’agente produca.',
      },
      {
        q: 'Devo partire da zero?',
        a: 'No. Open Design include oltre 140 design system di riferimento di cui puoi fare il fork — da Apple e Linear a quelli editoriali e brutalisti — per poi adattarli al tuo brand.',
      },
      {
        q: 'Come resta coerente tra presentazioni, dashboard e prototipi?',
        a: 'Perché tutte quelle skill leggono lo stesso DESIGN.md. Definisci il sistema una volta e la coerenza è automatica invece di qualcosa che controlli a mano.',
      },
      {
        q: 'Quali agenti posso usare?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI e altri adattatori nativi, con le tue chiavi del provider.',
      },
    ],
    ctaTitle: 'Definisci il tuo design system stasera',
    ctaBody:
      'Metti una stella al repository, installa Open Design e dai al tuo agente un unico brand da applicare ovunque — nell’agente che già usi.',
  },
};

const VI: SolutionLocaleCopy = {
  prototype: {
    title: 'Xây dựng nguyên mẫu tương tác với Open Design + Claude Code',
    description:
      'Biến một câu lệnh thành nguyên mẫu nhiều màn hình có thể nhấp được mà không cần rời khỏi terminal. Open Design trang bị cho coding agent của bạn các kỹ năng thiết kế, mẫu và hệ thống thiết kế để tạo ra nguyên mẫu thực sự mà bạn có thể mở trong trình duyệt.',
    breadcrumb: 'Nguyên mẫu',
    label: 'Trường hợp sử dụng · Nguyên mẫu',
    heading: 'Tạo nguyên mẫu nhanh như một câu lệnh',
    lead: 'Mô tả luồng bạn đang hình dung và để agent dựng nên một nguyên mẫu thực sự, có thể nhấp được — nhiều màn hình, kiểu dáng dùng chung và tương tác trực tiếp — kết xuất thẳng ra HTML mà bạn có thể mở, chia sẻ và bàn giao cho đội kỹ thuật.',
    heroImageAlt:
      'Minh họa kiểu biên tập về một bàn tay phác thảo wireframe biến thành nguyên mẫu ứng dụng nhiều màn hình có thể nhấp được',
    tldrTitle: 'Tóm lại một câu',
    tldrBody:
      'Open Design là lớp thiết kế cho coding agent mà bạn đang dùng. Với việc tạo nguyên mẫu, điều đó nghĩa là đi từ một ý tưởng dài một đoạn đến một nguyên mẫu có thể điều hướng, được tạo kiểu trong một phiên làm việc — không cần công cụ thiết kế, không cần bước xuất, không có khoảng trống bàn giao.',
    stepsTitle: 'Tạo nguyên mẫu với Open Design hoạt động như thế nào',
    steps: [
      {
        title: 'Mô tả luồng',
        body: 'Nói cho agent biết bạn đang xây dựng gì bằng ngôn ngữ tự nhiên — “một luồng onboarding với màn hình chào mừng, bộ chọn gói và màn hình xác nhận.” Open Design nạp kỹ năng nguyên mẫu để agent biết phải tạo ra các màn hình, chứ không phải một trang đơn lẻ.',
        imageAlt:
          'Minh họa một người gõ mô tả bằng ngôn ngữ tự nhiên về một luồng ứng dụng vào terminal',
      },
      {
        title: 'Tạo các màn hình đã được tạo kiểu',
        body: 'Agent áp dụng hệ thống thiết kế và mẫu nguyên mẫu từ Open Design, nên mọi màn hình đều dùng chung kiểu chữ, khoảng cách và các thành phần thay vì trông như bản nháp thô. Bạn nhận được một bộ màn hình mạch lạc, không phải những mockup rời rạc.',
        imageAlt:
          'Minh họa nhiều màn hình ứng dụng xuất hiện theo trình tự, tất cả cùng chung một phong cách thị giác nhất quán',
      },
      {
        title: 'Kết nối các tương tác',
        body: 'Nút bấm điều hướng, tab chuyển đổi, modal mở ra. Nguyên mẫu kết xuất thành HTML khép kín, nên nó hoạt động như sản phẩm thật trong mọi trình duyệt — không cần tài khoản công cụ tạo nguyên mẫu để xem.',
        imageAlt:
          'Minh họa một con trỏ nhấp qua các màn hình được liên kết với các mũi tên thể hiện sự điều hướng giữa chúng',
      },
      {
        title: 'Lặp lại và bàn giao',
        body: 'Tinh chỉnh bằng cách trò chuyện với agent — “đổi bộ chọn gói thành bố cục ba cột.” Vì sản phẩm nằm trong dự án của bạn, thiết kế và mã nguồn cuối cùng dùng chung một nguồn chân lý, khép lại khoảng trống bàn giao quen thuộc giữa nhà thiết kế và kỹ sư.',
        imageAlt:
          'Minh họa một nguyên mẫu đang được chỉnh sửa rồi chuyển cho một kỹ sư, với thiết kế và mã nguồn hợp nhất thành một tệp',
      },
    ],
    tableTitle: 'Tạo nguyên mẫu với Open Design so với cách cũ',
    tableColCapability: 'Điều bạn cần',
    tableColWithOd: 'Với Open Design',
    tableColWithout: 'Công cụ tạo nguyên mẫu truyền thống',
    tableRows: [
      {
        capability: 'Đi từ ý tưởng đến màn hình đầu tiên',
        withOd: 'Một câu lệnh trong agent bạn đang mở sẵn',
        without: 'Mở một công cụ riêng, tạo tệp, kéo các hộp bằng tay',
      },
      {
        capability: 'Nhiều màn hình được liên kết',
        withOd: 'Được tạo thành một bộ với kiểu dáng dùng chung và điều hướng hoạt động',
        without: 'Vẽ và liên kết từng khung thủ công',
      },
      {
        capability: 'Hệ thống thị giác nhất quán',
        withOd: 'Lấy từ một hệ thống thiết kế tái sử dụng mà agent áp dụng',
        without: 'Tạo lại theo từng tệp hoặc duy trì bằng tay',
      },
      {
        capability: 'Kết quả có thể chia sẻ',
        withOd: 'HTML khép kín — mở trong mọi trình duyệt, không cần tài khoản',
        without: 'Người xem cần một chỗ hoặc một liên kết chia sẻ trong công cụ của nhà cung cấp',
      },
      {
        capability: 'Con đường đến mã nguồn thật',
        withOd: 'Sản phẩm nằm trong repo của bạn; thiết kế và mã nguồn dùng chung một nguồn',
        without: 'Xây dựng lại từ đầu sau một lần bàn giao riêng',
      },
      {
        capability: 'Chi phí và khóa nhà cung cấp',
        withOd: 'Mã nguồn mở, dùng khóa của riêng bạn, chạy cục bộ',
        without: 'Thuê bao theo từng chỗ, lưu trữ bởi nhà cung cấp, giới hạn xuất',
      },
    ],
    featuresTitle: 'Bạn có thể tạo nguyên mẫu cho những gì',
    features: [
      {
        title: 'Ứng dụng web nhiều màn hình',
        body: 'Luồng đầy đủ với điều hướng dùng chung — onboarding, dashboard, cài đặt — không phải trang đơn lẻ.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Luồng ứng dụng di động',
        body: 'Hành trình di động từng màn hình với các chuyển cảnh và trạng thái mang cảm giác native.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Trang đích',
        body: 'Trang tiếp thị và trang đích SaaS mà bạn có thể nhấp qua và phát hành.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Bất kỳ gu thẩm mỹ nào',
        body: 'Biên tập, mềm mại hay brutalist — nguyên mẫu mang một phong cách mạch lạc từ đầu đến cuối.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Danh sách chờ và bảng giá',
        body: 'Các bề mặt chuyển đổi — danh sách chờ, bảng giá — được kết nối và đúng thương hiệu.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Game hóa và vui nhộn',
        body: 'Các ý tưởng nặng tương tác nơi chuyển động và trạng thái là một phần của màn chào hàng.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Những nguyên mẫu mọi người đã xây dựng với Open Design',
    galleryLead:
      'Mỗi cái trong số này bắt đầu từ một câu lệnh và kết xuất thành một sản phẩm có thể nhấp được. Chọn một mẫu gần với ý tưởng của bạn, mô tả biến thể của bạn, và agent sẽ điều chỉnh nó.',
    gallery: [
      { thumb: "example-dating-web", caption: "Ứng dụng hẹn hò web — luồng nhiều màn hình" },
      { thumb: "example-hr-onboarding", caption: "Luồng onboarding nhân sự" },
      { thumb: "example-kami-landing", caption: "Trang đích sản phẩm" },
      { thumb: "example-web-prototype-taste-soft", caption: "Nguyên mẫu web phong cách mềm mại" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Duyệt các mẫu nguyên mẫu',
    faqTitle: 'Câu hỏi thường gặp về tạo nguyên mẫu',
    faq: [
      {
        q: 'Tôi có cần một công cụ thiết kế như Figma để tạo nguyên mẫu với Open Design không?',
        a: 'Không. Open Design chạy bên trong coding agent của bạn và kết xuất nguyên mẫu thành HTML. Bạn mô tả luồng bằng ngôn ngữ; agent tạo ra các màn hình. Không có công cụ canvas riêng nào để học hay phải trả phí.',
      },
      {
        q: 'Các nguyên mẫu có tương tác được hay chỉ là mockup tĩnh?',
        a: 'Tương tác được. Điều hướng, tab và modal đều hoạt động vì đầu ra là HTML và CSS thật. Bạn có thể nhấp qua nó trong mọi trình duyệt y như một người dùng thực sự.',
      },
      {
        q: 'Tôi có thể dùng những agent nào?',
        a: 'Open Design hoạt động với Claude Code, Codex, Cursor Agent, Gemini CLI và hơn một chục adapter chính chủ khác. Bạn dùng khóa nhà cung cấp của riêng mình; không có gì được lưu trữ thay cho bạn.',
      },
      {
        q: 'Một nguyên mẫu có thể trở thành sản phẩm thật không?',
        a: 'Đó chính là mục đích. Sản phẩm nằm trong dự án của bạn, nên cùng một hệ thống thiết kế và các thành phần được mang vào mã sản xuất thay vì bị vứt bỏ sau một lần bàn giao.',
      },
    ],
    ctaTitle: 'Tạo nguyên mẫu cho ý tưởng tiếp theo của bạn ngay tối nay',
    ctaBody:
      'Gắn sao cho repo, cài Open Design, và biến câu “sẽ ra sao nếu” tiếp theo của bạn thành thứ bạn có thể nhấp vào — ngay trong agent bạn đang dùng.',
  },
  dashboard: {
    title: 'Tạo dashboard dữ liệu với Open Design + Claude Code',
    description:
      'Mô tả các chỉ số bạn theo dõi và để coding agent dựng nên một dashboard được tạo kiểu, đáp ứng — biểu đồ, thẻ KPI và bảng kết xuất thành HTML mà bạn có thể lưu trữ ở bất cứ đâu. Không cần chỗ trong công cụ BI, không cần trình dựng kéo-thả.',
    breadcrumb: 'Dashboard',
    label: 'Trường hợp sử dụng · Dashboard',
    heading: 'Dashboard từ một mô tả, không phải trình dựng kéo-thả',
    lead: 'Nói cho agent biết phải hiển thị gì và nó nên trông như thế nào. Open Design cung cấp các mẫu biểu đồ, hệ thống bố cục và ngôn ngữ thị giác để bạn có được một dashboard mạch lạc, trình bày được — không phải một bức tường widget kiểu mặc định.',
    heroImageAlt:
      'Minh họa kiểu biên tập về những con số thô bên trái chảy thành một dashboard gọn gàng gồm biểu đồ và thẻ KPI bên phải',
    tldrTitle: 'Tóm lại một câu',
    tldrBody:
      'Open Design biến một bản mô tả các chỉ số bằng ngôn ngữ tự nhiên thành một dashboard được tạo kiểu mà agent kết xuất ra HTML — được phiên bản hóa trong repo của bạn, lưu trữ được ở bất cứ đâu, không có thuê bao BI theo từng chỗ.',
    stepsTitle: 'Dashboard với Open Design hoạt động như thế nào',
    steps: [
      {
        title: 'Mô tả các chỉ số',
        body: 'Liệt kê điều quan trọng — “người dùng hoạt động hàng tuần, doanh thu theo gói, tỷ lệ rời bỏ và xu hướng 30 ngày.” Agent nạp kỹ năng dashboard để biết phải bố trí thẻ KPI, biểu đồ và một bảng thay vì một khối văn bản đơn lẻ.',
        imageAlt: 'Minh họa một người liệt kê các chỉ số họ quan tâm',
      },
      {
        title: 'Chọn các mẫu biểu đồ',
        body: 'Open Design đi kèm các mẫu biểu đồ và bố cục, nên xu hướng trở thành biểu đồ đường, các phân tách trở thành biểu đồ cột, và tỷ lệ trở thành kiểu biểu đồ phù hợp — kiểu chữ và khoảng cách nhất quán xuyên suốt thay vì các mặc định lệch lạc.',
        imageAlt: 'Minh họa nhiều loại biểu đồ được sắp xếp thành một lưới mạch lạc',
      },
      {
        title: 'Kết nối dữ liệu của bạn',
        body: 'Trỏ dashboard tới một CSV, một endpoint JSON, hoặc dán các hàng mẫu vào. Nó kết xuất thành HTML khép kín tự cập nhật khi dữ liệu thay đổi — mở trong mọi trình duyệt, thả lên bất kỳ host tĩnh nào.',
        imageAlt: 'Minh họa một tệp dữ liệu kết nối vào một dashboard cập nhật trực tiếp',
      },
      {
        title: 'Tinh chỉnh và phát hành',
        body: 'Điều chỉnh bằng cách trò chuyện với agent — “nhóm doanh thu theo khu vực, đưa hàng KPI lên trên cùng.” Sản phẩm nằm trong dự án của bạn, nên dashboard có thể được xem xét và phiên bản hóa như bất kỳ mã nào khác.',
        imageAlt: 'Minh họa một dashboard đang được tinh chỉnh rồi triển khai',
      },
    ],
    tableTitle: 'Dashboard với Open Design so với cách cũ',
    tableColCapability: 'Điều bạn cần',
    tableColWithOd: 'Với Open Design',
    tableColWithout: 'Công cụ BI / viết mã thủ công',
    tableRows: [
      {
        capability: 'Đi từ danh sách chỉ số đến bố cục',
        withOd: 'Một câu lệnh; agent bố trí thẻ, biểu đồ và bảng',
        without: 'Kéo từng widget một, hoặc viết mã biểu đồ từ đầu',
      },
      {
        capability: 'Hệ thống thị giác nhất quán',
        withOd: 'Mẫu biểu đồ và khoảng cách từ một hệ thống thiết kế tái sử dụng',
        without: 'Kiểu widget mặc định, hoặc tạo kiểu bằng tay cho từng biểu đồ',
      },
      {
        capability: 'Kết nối dữ liệu',
        withOd: 'CSV / JSON / các hàng được dán vào, kết xuất thành HTML trực tiếp',
        without: 'Trình kết nối của nhà cung cấp hoặc đường ống dữ liệu tùy biến',
      },
      {
        capability: 'Lưu trữ và chia sẻ',
        withOd: 'HTML khép kín trên bất kỳ host tĩnh nào, không cần tài khoản',
        without: 'Người xem cần một chỗ trong nhà cung cấp BI',
      },
      {
        capability: 'Xem xét và phiên bản hóa',
        withOd: 'Nằm trong repo của bạn; so sánh diff được như mã',
        without: 'Bị khóa bên trong nhà cung cấp, không có diff thực sự',
      },
      {
        capability: 'Chi phí và khóa nhà cung cấp',
        withOd: 'Mã nguồn mở, dùng khóa của riêng bạn, chạy cục bộ',
        without: 'Thuê bao theo từng chỗ, lưu trữ bởi nhà cung cấp',
      },
    ],
    featuresTitle: 'Bạn có thể xây dựng những gì',
    features: [
      { title: "Phân tích sản phẩm", body: "Người dùng hoạt động, phễu, giữ chân — các chỉ số mà một đội sản phẩm sống cùng.", thumb: "example-dashboard" },
      { title: "Chỉ số repo và dev", body: "Sao, PR, sức khỏe CI — dashboard kỹ thuật từ dữ liệu của riêng bạn.", thumb: "example-github-dashboard" },
      { title: "Báo cáo tài chính", body: "Doanh thu, mức đốt vốn, đường băng được bố trí thành một báo cáo chia sẻ được.", thumb: "example-finance-report" },
      { title: "Vận hành trực tiếp", body: "Chỉ số thời gian thực làm mới khi dữ liệu nền thay đổi.", thumb: "example-live-dashboard" },
      { title: "Mạng xã hội và tiếp thị", body: "Hiệu suất kênh và theo dõi chiến dịch trong một khung nhìn.", thumb: "example-social-media-dashboard" },
      { title: "Báo cáo theo lĩnh vực", body: "Báo cáo có cấu trúc cho bất kỳ ngành nào — từ lâm sàng đến giao dịch.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Những dashboard mọi người đã xây dựng với Open Design',
    galleryLead:
      'Những dashboard thật được kết xuất từ một câu lệnh và một nguồn dữ liệu. Bắt đầu từ một cái gần với của bạn và mô tả các chỉ số bạn theo dõi.',
    gallery: [
      { thumb: "example-data-report", caption: "Báo cáo dữ liệu" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Dashboard vận hành trực tiếp" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Dashboard phân tích giao dịch" },
      { thumb: "example-frame-data-chart-nyt", caption: "Biểu đồ dữ liệu kiểu biên tập" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Duyệt các mẫu dashboard',
    faqTitle: 'Câu hỏi thường gặp về dashboard',
    faq: [
      {
        q: 'Tôi có cần một công cụ BI như Tableau hay Looker không?',
        a: 'Không. Open Design kết xuất dashboard thành HTML bên trong coding agent của bạn. Bạn mô tả các chỉ số và trỏ nó tới dữ liệu của bạn; không có nền tảng BI riêng nào để cấp phép hay học.',
      },
      {
        q: 'Dữ liệu đến từ đâu?',
        a: 'Một CSV, một endpoint JSON, hoặc các hàng bạn dán vào. Dashboard là HTML và JavaScript thuần, nên bạn kiểm soát chính xác nơi nó đọc từ đó — không có gì được proxy qua một dịch vụ lưu trữ.',
      },
      {
        q: 'Đồng đội không rành kỹ thuật có xem được không?',
        a: 'Có. Đầu ra là một trang web khép kín. Bất kỳ ai có liên kết hoặc tệp đều có thể mở nó trong trình duyệt — không cần tài khoản, không cần chỗ.',
      },
      {
        q: 'Tôi có thể dùng những agent nào?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI và hơn một chục adapter chính chủ khác. Bạn dùng khóa nhà cung cấp của riêng mình.',
      },
    ],
    ctaTitle: 'Xây dashboard của bạn ngay tối nay',
    ctaBody:
      'Gắn sao cho repo, cài Open Design, và biến các chỉ số của bạn thành một dashboard bạn có thể lưu trữ ở bất cứ đâu — ngay trong agent bạn đang dùng.',
  },
  slides: {
    title: 'Tạo bộ slide thuyết trình với Open Design + Claude Code',
    description:
      'Biến một dàn ý thành một bộ slide được thiết kế, đúng thương hiệu mà không cần mở ứng dụng thuyết trình. Open Design trang bị cho coding agent của bạn các mẫu slide và một hệ thống thị giác, kết xuất slide thành HTML mà bạn có thể trình bày, xuất hoặc chia sẻ.',
    breadcrumb: 'Slide',
    label: 'Trường hợp sử dụng · Slide',
    heading: 'Bộ slide trông được thiết kế, viết bằng một câu lệnh',
    lead: 'Trao cho agent một dàn ý và một tông giọng. Open Design áp dụng một mẫu slide và hệ thống thị giác để mọi slide đều được bố trí, sắp chữ và đúng thương hiệu — không phải một danh sách gạch đầu dòng trên nền trống.',
    heroImageAlt:
      'Minh họa kiểu biên tập về một dàn ý bên trái biến thành một chuỗi slide thuyết trình được thiết kế bên phải',
    tldrTitle: 'Tóm lại một câu',
    tldrBody:
      'Open Design biến một dàn ý thành một bộ slide HTML được thiết kế mà agent kết xuất trong một phiên — trình bày trong trình duyệt, xuất ra PDF hoặc PPTX, và giữ mã nguồn trong repo của bạn.',
    stepsTitle: 'Bộ slide với Open Design hoạt động như thế nào',
    steps: [
      {
        title: 'Đưa cho nó dàn ý',
        body: 'Dán các điểm nói chuyện của bạn hoặc một cấu trúc thô. Agent nạp kỹ năng slide để tạo ra một chuỗi slide được bố trí, không phải một tài liệu dài.',
        imageAlt: 'Minh họa một dàn ý văn bản đang được trao cho một agent',
      },
      {
        title: 'Chọn phong cách bộ slide',
        body: 'Open Design đi kèm các mẫu slide — biên tập, Thụy Sĩ quốc tế, kỹ thuật tối màu và nhiều hơn nữa. Agent áp dụng một mẫu để kiểu chữ, lưới và điểm nhấn nhất quán trên mọi slide.',
        imageAlt: 'Minh họa nhiều tùy chọn phong cách bộ slide được đặt cạnh nhau',
      },
      {
        title: 'Tạo các slide',
        body: 'Mỗi điểm trở thành một slide được thiết kế với phân cấp đúng — tiêu đề, hình ảnh hỗ trợ, điểm nhấn dữ liệu. Nó kết xuất thành HTML, nên trình bày toàn màn hình trong mọi trình duyệt.',
        imageAlt: 'Minh họa một chuỗi slide hoàn chỉnh với kiểu dáng nhất quán',
      },
      {
        title: 'Trình bày, xuất, lặp lại',
        body: 'Trình bày từ trình duyệt, hoặc xuất ra PDF / PPTX để chia sẻ. Tinh chỉnh bằng cách trò chuyện với agent — “gọn lại slide dữ liệu, thêm một lời kêu gọi hành động kết thúc.” Mã nguồn bộ slide ở lại trong dự án của bạn.',
        imageAlt: 'Minh họa một bộ slide đang được trình bày và xuất ra nhiều định dạng',
      },
    ],
    tableTitle: 'Bộ slide với Open Design so với cách cũ',
    tableColCapability: 'Điều bạn cần',
    tableColWithOd: 'Với Open Design',
    tableColWithout: 'PowerPoint / Keynote / công cụ slide AI',
    tableRows: [
      {
        capability: 'Đi từ dàn ý đến slide',
        withOd: 'Một câu lệnh; agent bố trí mọi slide',
        without: 'Dựng từng slide bằng tay, hoặc vật lộn với một mẫu',
      },
      {
        capability: 'Thiết kế nhất quán',
        withOd: 'Mẫu slide với một lưới và hệ thống kiểu chữ thực sự',
        without: 'Trôi dạt chủ đề, căn chỉnh thủ công, mặc định lệch thương hiệu',
      },
      {
        capability: 'Dữ liệu và sơ đồ',
        withOd: 'Biểu đồ và điểm nhấn được kết xuất như một phần của slide',
        without: 'Dán hình ảnh tĩnh hoặc dựng lại biểu đồ mỗi lần',
      },
      {
        capability: 'Định dạng xuất',
        withOd: 'HTML để trình bày, cộng thêm xuất PDF / PPTX',
        without: 'Bị khóa vào định dạng của một ứng dụng',
      },
      {
        capability: 'Xem xét và phiên bản hóa',
        withOd: 'Mã nguồn nằm trong repo của bạn, so sánh diff được',
        without: 'Tệp nhị phân, không có diff có ý nghĩa',
      },
      {
        capability: 'Chi phí và khóa nhà cung cấp',
        withOd: 'Mã nguồn mở, dùng khóa của riêng bạn, chạy cục bộ',
        without: 'Giấy phép ứng dụng hoặc tiện ích AI bổ sung theo từng chỗ',
      },
    ],
    featuresTitle: 'Bạn có thể trình bày những gì',
    features: [
      { title: "Pitch deck", body: "Bộ slide gọi vốn và bán hàng với câu chuyện mạnh mẽ và các slide dữ liệu sạch sẽ.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Thụy Sĩ / biên tập", body: "Bộ slide theo lưới, đậm kiểu chữ trông như được chỉ đạo nghệ thuật.", thumb: "example-deck-swiss-international" },
      { title: "Mô-đun khóa học", body: "Bộ slide giảng dạy với các bước rõ ràng, điểm nhấn và nhịp độ.", thumb: "example-html-ppt-course-module" },
      { title: "Bộ slide biểu đồ dữ liệu", body: "Bộ slide tối màu, thiên về biểu đồ cho phân tích và đánh giá.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Chế độ người trình bày", body: "Bộ slide kiểu reveal được dựng để trình bày trực tiếp trong trình duyệt.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Bản thiết kế kỹ thuật", body: "Bộ slide kiến trúc và kiến thức ánh xạ các hệ thống phức tạp.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Những bộ slide mọi người đã xây dựng với Open Design',
    galleryLead:
      'Những bộ slide thật được kết xuất từ một dàn ý. Chọn một phong cách gần với bài nói của bạn và mô tả nội dung.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Bộ slide tạp chí biên tập" },
      { thumb: "example-guizang-ppt", caption: "Keynote có minh họa" },
      { thumb: "example-deck-open-slide-canvas", caption: "Bộ slide open slide canvas" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Bộ slide chủ đề gradient" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Duyệt các mẫu bộ slide',
    faqTitle: 'Câu hỏi thường gặp về slide',
    faq: [
      {
        q: 'Tôi có cần PowerPoint hoặc Keynote không?',
        a: 'Không. Open Design kết xuất bộ slide thành HTML bên trong coding agent của bạn và có thể xuất ra PDF hoặc PPTX. Bạn trình bày từ trình duyệt hoặc bàn giao một tệp — không cần ứng dụng thuyết trình nào để dựng nó.',
      },
      {
        q: 'Đây có chỉ là các gạch đầu dòng do AI tạo ra không?',
        a: 'Không. Agent áp dụng một mẫu slide thực sự với một lưới, thang kiểu chữ và phân cấp thị giác, nên các slide trông được thiết kế chứ không phải tự động điền.',
      },
      {
        q: 'Tôi có thể xuất ra PowerPoint cho khách hàng không?',
        a: 'Có. Bộ slide xuất ra PPTX và PDF bên cạnh HTML bạn trình bày từ đó, nên chúng phù hợp với bất cứ điều gì khán giả mong đợi.',
      },
      {
        q: 'Tôi có thể dùng những agent nào?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI và nhiều adapter chính chủ khác, với khóa nhà cung cấp của riêng bạn.',
      },
    ],
    ctaTitle: 'Dựng bộ slide tiếp theo của bạn ngay tối nay',
    ctaBody:
      'Gắn sao cho repo, cài Open Design, và biến dàn ý của bạn thành một bộ slide được thiết kế — ngay trong agent bạn đang dùng.',
  },
  image: {
    title: 'Tạo đồ họa đúng thương hiệu với Open Design + Claude Code',
    description:
      'Tạo thẻ mạng xã hội, ảnh bìa bài viết và đồ họa tiếp thị từ một câu lệnh — được bố trí với kiểu chữ thực sự và hệ thống thương hiệu của bạn, kết xuất thành HTML sắc nét mà bạn có thể xuất ra PNG. Không cần ứng dụng thiết kế, không cần thuê bao mẫu.',
    breadcrumb: 'Hình ảnh',
    label: 'Trường hợp sử dụng · Hình ảnh',
    heading: 'Đồ họa đúng thương hiệu, được tạo và bố trí cho bạn',
    lead: 'Mô tả thẻ hoặc ảnh bìa bạn cần. Open Design dựng nó với kiểu chữ, lưới thực sự và màu thương hiệu của bạn — rồi kết xuất thành HTML mà bạn có thể xuất ra hình ảnh, thay vì vật lộn với một ứng dụng thiết kế hay một mẫu chung chung.',
    heroImageAlt:
      'Minh họa kiểu biên tập về một câu lệnh biến thành một bộ thẻ mạng xã hội và ảnh bìa bài viết được bố trí',
    tldrTitle: 'Tóm lại một câu',
    tldrBody:
      'Open Design biến một câu lệnh thành một đồ họa được sắp chữ, đúng thương hiệu mà agent kết xuất thành HTML và xuất ra PNG — lặp lại được, phiên bản hóa được, và không có công cụ thiết kế theo từng chỗ.',
    stepsTitle: 'Đồ họa với Open Design hoạt động như thế nào',
    steps: [
      {
        title: 'Mô tả đồ họa',
        body: 'Nói nó là gì — “một thẻ Twitter cho buổi ra mắt của chúng tôi với tiêu đề và một câu trích dẫn.” Agent nạp đúng kỹ năng để dựng một đồ họa được bố trí, không phải một khối văn bản thuần.',
        imageAlt: 'Minh họa một người mô tả một thẻ mạng xã hội họ cần',
      },
      {
        title: 'Áp dụng hệ thống thương hiệu',
        body: 'Open Design lấy màu sắc, kiểu chữ và khoảng cách của bạn từ một hệ thống thiết kế tái sử dụng, nên mọi thẻ đều khớp với phần còn lại của thương hiệu thay vì trông như một thứ làm một lần.',
        imageAlt: 'Minh họa màu thương hiệu và kiểu chữ đang được áp dụng vào một bố cục thẻ',
      },
      {
        title: 'Kết xuất và xuất ra',
        body: 'Đồ họa kết xuất thành HTML ở chính xác kích thước bạn cần — thẻ mạng xã hội, ảnh bìa, banner — rồi xuất ra PNG. Chữ sắc nét, bố cục thực sự, không cần nhích thủ công.',
        imageAlt: 'Minh họa một đồ họa đang kết xuất và xuất ra một tệp hình ảnh',
      },
      {
        title: 'Tái sử dụng công thức',
        body: 'Vì nó là một mẫu, đồ họa tiếp theo chỉ cách một câu lệnh — đổi tiêu đề, giữ bố cục. Một loạt thẻ giữ nhất quán hoàn hảo.',
        imageAlt: 'Minh họa một mẫu thẻ tạo ra một loạt đồ họa nhất quán',
      },
    ],
    tableTitle: 'Đồ họa với Open Design so với cách cũ',
    tableColCapability: 'Điều bạn cần',
    tableColWithOd: 'Với Open Design',
    tableColWithout: 'Ứng dụng thiết kế / mẫu chung chung',
    tableRows: [
      {
        capability: 'Đi từ ý tưởng đến đồ họa được bố trí',
        withOd: 'Một câu lệnh; agent dựng kiểu chữ và bố cục',
        without: 'Mở một ứng dụng, đặt từng phần tử bằng tay',
      },
      {
        capability: 'Giữ đúng thương hiệu',
        withOd: 'Màu sắc và kiểu chữ từ một hệ thống thiết kế tái sử dụng',
        without: 'Chọn lại kiểu thương hiệu theo từng tệp, hoặc trôi dạt lệch thương hiệu',
      },
      {
        capability: 'Một loạt nhất quán',
        withOd: 'Cùng mẫu, nội dung mới — một bộ được căn chỉnh hoàn hảo',
        without: 'Căn chỉnh lại từng biến thể thủ công',
      },
      {
        capability: 'Xuất ra',
        withOd: 'HTML ở chính xác kích thước, xuất ra PNG',
        without: 'Định cỡ canvas và cài đặt xuất thủ công',
      },
      {
        capability: 'Lặp lại được',
        withOd: 'Một công thức điều khiển bằng câu lệnh trong repo của bạn',
        without: 'Một tệp làm một lần mà bạn tạo lại mỗi lần',
      },
      {
        capability: 'Chi phí và khóa nhà cung cấp',
        withOd: 'Mã nguồn mở, dùng khóa của riêng bạn, chạy cục bộ',
        without: 'Công cụ thiết kế theo từng chỗ hoặc chợ mẫu',
      },
    ],
    featuresTitle: 'Bạn có thể tạo những gì',
    features: [
      { title: "Thẻ mạng xã hội", body: "Thẻ X / Twitter được dựng với tiêu đề và thương hiệu của bạn.", thumb: "example-card-twitter" },
      { title: "Ảnh bìa bài viết", body: "Ảnh bìa kiểu biên tập, kiểu tạp chí cho bài đăng và bản tin.", thumb: "example-article-magazine" },
      { title: "Thẻ Xiaohongshu", body: "Thẻ kiểu RedNote được tinh chỉnh cho feed đó.", thumb: "example-card-xiaohongshu" },
      { title: "Đồ họa hero", body: "Hình hero kiểu lỏng, gradient cho website và buổi ra mắt.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Carousel", body: "Carousel mạng xã hội nhiều slide giữ nhất quán qua các khung.", thumb: "example-social-carousel" },
      { title: "Khung mockup UI", body: "Khung thông báo và khung thiết bị để kể chuyện sản phẩm.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Những đồ họa mọi người đã xây dựng với Open Design',
    galleryLead:
      'Những thẻ và ảnh bìa thật được kết xuất từ một câu lệnh. Chọn một cái gần với điều bạn cần và thay nội dung của bạn vào.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Thẻ mạng xã hội pastel" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Poster biên tập ba tông màu" },
      { thumb: "example-magazine-poster", caption: "Poster kiểu tạp chí" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Ảnh bìa biên tập đậm nét" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Duyệt các mẫu đồ họa',
    faqTitle: 'Câu hỏi thường gặp về hình ảnh',
    faq: [
      {
        q: 'Đây có phải là một trình tạo ảnh AI như Midjourney không?',
        a: 'Không. Open Design dựng đồ họa với bố cục và kiểu chữ thực sự — tiêu đề của bạn, thương hiệu của bạn, kích thước chính xác — và kết xuất thành HTML mà bạn xuất ra PNG. Đó là việc dựng thiết kế, không phải tạo điểm ảnh.',
      },
      {
        q: 'Tôi có thể tạo một loạt thẻ nhất quán không?',
        a: 'Có. Vì mỗi đồ họa là một mẫu, bạn giữ bố cục và đổi nội dung, nên cả một loạt giữ được căn chỉnh hoàn hảo và đúng thương hiệu.',
      },
      {
        q: 'Nó có thể tạo những kích thước nào?',
        a: 'Bất kỳ kích thước nào — đồ họa kết xuất ở chính xác kích thước bạn chỉ định, từ một thẻ mạng xã hội hình vuông đến một banner rộng, rồi xuất ra PNG.',
      },
      {
        q: 'Tôi có thể dùng những agent nào?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI và nhiều adapter chính chủ khác, với khóa nhà cung cấp của riêng bạn.',
      },
    ],
    ctaTitle: 'Tạo đồ họa tiếp theo của bạn ngay tối nay',
    ctaBody:
      'Gắn sao cho repo, cài Open Design, và biến một câu lệnh thành một đồ họa đúng thương hiệu — ngay trong agent bạn đang dùng.',
  },
  video: {
    title: 'Tạo đồ họa chuyển động và video ngắn với Open Design + Claude Code',
    description:
      'Biến một kịch bản thành các khung hình động và video dạng ngắn — thẻ tiêu đề, nền chuyển động và đoạn kết được dựng với hệ thống thương hiệu của bạn và kết xuất từ HTML. Không cần bộ công cụ đồ họa chuyển động, không cần kéo timeline.',
    breadcrumb: 'Video',
    label: 'Trường hợp sử dụng · Video',
    heading: 'Đồ họa chuyển động từ một kịch bản, không phải một timeline',
    lead: 'Mô tả khoảnh khắc bạn muốn — một màn hé lộ tiêu đề, một hoạt cảnh dữ liệu, một đoạn kết logo. Open Design dựng các khung hình động với hệ thống thương hiệu của bạn và kết xuất chúng thành video, không cần bộ công cụ đồ họa chuyển động.',
    heroImageAlt:
      'Minh họa kiểu biên tập về một kịch bản biến thành một chuỗi khung hình video động',
    tldrTitle: 'Tóm lại một câu',
    tldrBody:
      'Open Design biến một kịch bản thành các khung hình động, đúng thương hiệu mà agent kết xuất thành video dạng ngắn — được dựng từ HTML, phiên bản hóa trong repo của bạn, không có trình chỉnh sửa timeline nào để học.',
    stepsTitle: 'Chuyển động với Open Design hoạt động như thế nào',
    steps: [
      {
        title: 'Mô tả khoảnh khắc',
        body: 'Nói điều gì nên xảy ra — “một tiêu đề glitch chuyển thành logo của chúng tôi, rồi một thẻ kết thúc.” Agent nạp kỹ năng chuyển động để tạo ra các khung hình động, không phải một hình ảnh tĩnh.',
        imageAlt: 'Minh họa một người mô tả một chuỗi chuyển động',
      },
      {
        title: 'Áp dụng phong cách thương hiệu và chuyển động',
        body: 'Open Design cung cấp các mẫu khung hình — vệt sáng điện ảnh, tiêu đề glitch, đoạn kết logo — và áp dụng màu sắc cùng kiểu chữ của bạn, nên chuyển động trông có chủ ý và đúng thương hiệu.',
        imageAlt: 'Minh họa kiểu dáng thương hiệu được áp dụng vào các khung hình động',
      },
      {
        title: 'Kết xuất các khung hình thành video',
        body: 'Các khung hình được dựng trong HTML và kết xuất thành video, nên thời lượng và bố cục chính xác và lặp lại được — không cần dựng keyframe thủ công trên một timeline.',
        imageAlt: 'Minh họa các khung hình HTML đang kết xuất thành một đoạn video',
      },
      {
        title: 'Lặp lại và xuất ra',
        body: 'Tinh chỉnh bằng cách trò chuyện với agent — “làm chậm màn hé lộ tiêu đề, thêm một chú thích.” Xuất các đoạn clip dạng ngắn cho mạng xã hội hoặc sản phẩm. Mã nguồn ở lại trong dự án của bạn.',
        imageAlt: 'Minh họa một đoạn video đang được tinh chỉnh và xuất ra cho mạng xã hội',
      },
    ],
    tableTitle: 'Chuyển động với Open Design so với cách cũ',
    tableColCapability: 'Điều bạn cần',
    tableColWithOd: 'Với Open Design',
    tableColWithout: 'After Effects / bộ công cụ chuyển động',
    tableRows: [
      {
        capability: 'Đi từ kịch bản đến khung hình động',
        withOd: 'Một câu lệnh; agent dựng chuỗi hình',
        without: 'Dựng keyframe từng phần tử trên một timeline bằng tay',
      },
      {
        capability: 'Giữ đúng thương hiệu',
        withOd: 'Mẫu khung hình + màu sắc và kiểu chữ của bạn',
        without: 'Dựng lại kiểu dáng thương hiệu theo từng dự án',
      },
      {
        capability: 'Thời lượng chính xác, lặp lại được',
        withOd: 'Được dựng trong HTML, kết xuất một cách xác định',
        without: 'Kéo thủ công, khó tái tạo',
      },
      {
        capability: 'Xuất ra cho mạng xã hội',
        withOd: 'Các đoạn clip dạng ngắn được kết xuất thành video',
        without: 'Cài đặt sẵn xuất và vật lộn với codec',
      },
      {
        capability: 'Xem xét và phiên bản hóa',
        withOd: 'Mã nguồn khung hình nằm trong repo của bạn, so sánh diff được',
        without: 'Tệp dự án nhị phân, không có diff thực sự',
      },
      {
        capability: 'Chi phí và khóa nhà cung cấp',
        withOd: 'Mã nguồn mở, dùng khóa của riêng bạn, chạy cục bộ',
        without: 'Bộ công cụ đắt tiền, đường cong học tập dốc',
      },
    ],
    featuresTitle: 'Bạn có thể làm động những gì',
    features: [
      { title: "Hyperframes", body: "Các chuỗi chuyển động từng khung hình được dựng từ HTML.", thumb: "example-video-hyperframes" },
      { title: "Mạng xã hội dạng ngắn", body: "Clip dọc được dựng cho các feed mạng xã hội.", thumb: "example-video-shortform" },
      { title: "Bộ khung hình chuyển động", body: "Các khung hình động tái sử dụng được mà bạn dựng thành một đoạn clip.", thumb: "example-motion-frames" },
      { title: "Vệt sáng điện ảnh", body: "Chuyển cảnh kiểu phim và nền tạo không khí.", thumb: "example-frame-light-leak-cinema" },
      { title: "Tiêu đề glitch", body: "Màn hé lộ tiêu đề với chuyển động và kết cấu.", thumb: "example-frame-glitch-title" },
      { title: "Đoạn kết logo", body: "Hoạt cảnh kết thúc gắn thương hiệu cho bất kỳ đoạn clip nào.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Những chuyển động mọi người đã xây dựng với Open Design',
    galleryLead:
      'Những khung hình động và đoạn clip thật được kết xuất từ một câu lệnh. Chọn một cái gần với ý tưởng của bạn và mô tả chuyển động.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Chuỗi hyperframes" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Nền chuyển động kiểu lỏng" },
      { thumb: "example-frame-macos-notification", caption: "Khung UI động" },
      { thumb: "example-frame-data-chart-nyt", caption: "Biểu đồ dữ liệu động" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Duyệt các mẫu chuyển động',
    faqTitle: 'Câu hỏi thường gặp về video',
    faq: [
      {
        q: 'Tôi có cần After Effects hoặc một bộ công cụ đồ họa chuyển động không?',
        a: 'Không. Open Design dựng các khung hình động trong HTML và kết xuất chúng thành video bên trong coding agent của bạn. Không có trình chỉnh sửa timeline nào để học hay cấp phép.',
      },
      {
        q: 'Loại video này phù hợp cho việc gì?',
        a: 'Chuyển động dạng ngắn — thẻ tiêu đề, hoạt cảnh dữ liệu, đoạn kết logo, clip mạng xã hội. Nó được dựng cho chuyển động thương hiệu và sản phẩm, không phải dựng phim dài tập.',
      },
      {
        q: 'Thời lượng có tái tạo được không?',
        a: 'Có. Vì các khung hình được dựng trong mã và kết xuất một cách xác định, bạn nhận được cùng một kết quả mỗi lần và có thể tinh chỉnh nó chính xác bằng một câu lệnh.',
      },
      {
        q: 'Tôi có thể dùng những agent nào?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI và nhiều adapter chính chủ khác, với khóa nhà cung cấp của riêng bạn.',
      },
    ],
    ctaTitle: 'Làm động ý tưởng tiếp theo của bạn ngay tối nay',
    ctaBody:
      'Gắn sao cho repo, cài Open Design, và biến một kịch bản thành chuyển động — ngay trong agent bạn đang dùng.',
  },
  designSystem: {
    title: 'Xây dựng và áp dụng một hệ thống thiết kế với Open Design + Claude Code',
    description:
      'Nắm bắt thương hiệu của bạn thành một hệ thống thiết kế tái sử dụng mà coding agent áp dụng cho mọi sản phẩm — màu sắc, kiểu chữ, thành phần và tông giọng trong một DESIGN.md. Định nghĩa một lần; mọi nguyên mẫu, bộ slide và dashboard đều giữ đúng thương hiệu.',
    breadcrumb: 'Hệ thống thiết kế',
    label: 'Trường hợp sử dụng · Hệ thống thiết kế',
    heading: 'Một hệ thống thiết kế, áp dụng cho mọi thứ agent của bạn tạo ra',
    lead: 'Định nghĩa thương hiệu của bạn một lần và Open Design mang nó vào mọi đầu ra — nguyên mẫu, bộ slide, dashboard, đồ họa. Hệ thống nằm trong repo của bạn dưới dạng một DESIGN.md mà agent đọc, nên sự nhất quán là tự động, không phải thủ công.',
    heroImageAlt:
      'Minh họa kiểu biên tập về một hệ thống thiết kế duy nhất tỏa ra thành nhiều sản phẩm đúng thương hiệu',
    tldrTitle: 'Tóm lại một câu',
    tldrBody:
      'Open Design nắm bắt thương hiệu của bạn thành một hệ thống thiết kế di động mà agent áp dụng cho mọi sản phẩm — định nghĩa một lần trong repo của bạn, thực thi ở mọi nơi, không có công cụ thiết kế trung tâm nào canh giữ nó.',
    stepsTitle: 'Hệ thống thiết kế với Open Design hoạt động như thế nào',
    steps: [
      {
        title: 'Nắm bắt hệ thống',
        body: 'Mô tả thương hiệu của bạn — màu sắc, kiểu chữ, khoảng cách, giọng điệu — hoặc trỏ agent tới một website hiện có để trích xuất nó. Open Design viết nó vào một DESIGN.md nằm trong dự án của bạn.',
        imageAlt: 'Minh họa một thương hiệu đang được nắm bắt vào một tệp hệ thống thiết kế duy nhất',
      },
      {
        title: 'Bắt đầu từ một nền tảng đã được kiểm chứng',
        body: 'Open Design đi kèm hơn 140 hệ thống thiết kế tham khảo — từ Apple và Linear đến biên tập và brutalist. Fork một cái gần với thương hiệu của bạn thay vì bắt đầu từ một trang trống.',
        imageAlt: 'Minh họa một thư viện các hệ thống thiết kế tham khảo đang được duyệt',
      },
      {
        title: 'Áp dụng nó ở mọi nơi',
        body: 'Mọi kỹ năng khác đều đọc cùng một hệ thống, nên một nguyên mẫu, một bộ slide và một dashboard đều dùng chung một ngôn ngữ thị giác — mà không cần bạn chỉ định lại mỗi lần.',
        imageAlt: 'Minh họa một hệ thống được áp dụng nhất quán qua nhiều loại sản phẩm',
      },
      {
        title: 'Tiến hóa nó ở một nơi',
        body: 'Thay đổi hệ thống và lần kết xuất tiếp theo phản ánh nó ở mọi nơi. Vì nó là một tệp trong repo của bạn, các quyết định thiết kế được xem xét và phiên bản hóa như mã.',
        imageAlt: 'Minh họa một hệ thống thiết kế đang được cập nhật và lan truyền tới mọi đầu ra',
      },
    ],
    tableTitle: 'Hệ thống thiết kế với Open Design so với cách cũ',
    tableColCapability: 'Điều bạn cần',
    tableColWithOd: 'Với Open Design',
    tableColWithout: 'Thư viện công cụ thiết kế / hướng dẫn phong cách',
    tableRows: [
      {
        capability: 'Định nghĩa hệ thống',
        withOd: 'Một DESIGN.md mà agent đọc, fork từ hơn 140 tham khảo',
        without: 'Một hướng dẫn phong cách tĩnh hoặc một thư viện gắn với công cụ',
      },
      {
        capability: 'Áp dụng qua các loại sản phẩm',
        withOd: 'Cùng một hệ thống cấp cho nguyên mẫu, bộ slide, dashboard, đồ họa',
        without: 'Triển khai lại theo từng công cụ và từng tệp',
      },
      {
        capability: 'Giữ mọi thứ nhất quán',
        withOd: 'Tự động — mọi kỹ năng đọc một nguồn',
        without: 'Kỷ luật thủ công; trôi dạt theo thời gian',
      },
      {
        capability: 'Tiến hóa thương hiệu',
        withOd: 'Sửa một lần; lần kết xuất tiếp theo cập nhật ở mọi nơi',
        without: 'Tìm-và-thay qua các tệp và công cụ',
      },
      {
        capability: 'Xem xét và phiên bản hóa',
        withOd: 'Nằm trong repo của bạn, so sánh diff được như mã',
        without: 'Bị chôn trong một công cụ thiết kế, khó kiểm toán',
      },
      {
        capability: 'Chi phí và khóa nhà cung cấp',
        withOd: 'Mã nguồn mở, di động, chạy cục bộ',
        without: 'Bị khóa vào một thuê bao công cụ thiết kế',
      },
    ],
    featuresTitle: 'Những hệ thống bạn có thể bắt đầu từ đó',
    features: [
      { title: "Apple", body: "Thẩm mỹ sạch sẽ, kiềm chế, dùng font hệ thống.", thumb: "design-system-apple" },
      { title: "Linear", body: "Diện mạo công cụ sản phẩm sắc nét với khoảng cách chặt chẽ.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Mềm mại, ưu tiên tài liệu, dễ tiếp cận.", thumb: "design-system-notion" },
      { title: "Figma", body: "Vui nhộn, nhiều màu sắc, năng lượng công cụ sáng tạo.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Tối giản, trung tính, cấp độ nghiên cứu.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Dày đặc, kỹ thuật, native với lập trình viên.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Các hệ thống thiết kế trong Open Design',
    galleryLead:
      'Một vài trong số hơn 140 hệ thống tham khảo mà bạn có thể fork làm điểm khởi đầu. Chọn một cái gần với thương hiệu của bạn và điều chỉnh nó.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Hệ thống kiểu Airbnb" },
      { thumb: "design-system-vercel", caption: "Hệ thống kiểu Vercel" },
      { thumb: "design-system-stripe", caption: "Hệ thống kiểu Stripe" },
      { thumb: "design-system-spotify", caption: "Hệ thống kiểu Spotify" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Duyệt các hệ thống thiết kế',
    faqTitle: 'Câu hỏi thường gặp về hệ thống thiết kế',
    faq: [
      {
        q: 'Hệ thống thiết kế ở đây chính xác là gì?',
        a: 'Một tệp DESIGN.md trong repo của bạn nắm bắt màu sắc, kiểu chữ, khoảng cách, thành phần và giọng điệu. Mọi kỹ năng của Open Design đều đọc nó, nên thương hiệu của bạn được áp dụng tự động cho bất cứ thứ gì agent tạo ra.',
      },
      {
        q: 'Tôi có phải bắt đầu từ con số không không?',
        a: 'Không. Open Design đi kèm hơn 140 hệ thống thiết kế tham khảo mà bạn có thể fork — từ Apple và Linear đến biên tập và brutalist — rồi điều chỉnh theo thương hiệu của bạn.',
      },
      {
        q: 'Làm sao nó giữ nhất quán qua các bộ slide, dashboard và nguyên mẫu?',
        a: 'Vì tất cả các kỹ năng đó đều đọc cùng một DESIGN.md. Định nghĩa hệ thống một lần và sự nhất quán là tự động thay vì thứ bạn phải canh chừng bằng tay.',
      },
      {
        q: 'Tôi có thể dùng những agent nào?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI và nhiều adapter chính chủ khác, với khóa nhà cung cấp của riêng bạn.',
      },
    ],
    ctaTitle: 'Định nghĩa hệ thống thiết kế của bạn ngay tối nay',
    ctaBody:
      'Gắn sao cho repo, cài Open Design, và trao cho agent của bạn một thương hiệu để áp dụng ở mọi nơi — ngay trong agent bạn đang dùng.',
  },
};

const PL: SolutionLocaleCopy = {
  prototype: {
    title: 'Buduj interaktywne prototypy z Open Design + Claude Code',
    description:
      'Zamień polecenie w klikalny, wieloekranowy prototyp bez opuszczania terminala. Open Design daje Twojemu coding agentowi umiejętności projektowe, szablony i system projektowy, by tworzyć prawdziwe prototypy, które otworzysz w przeglądarce.',
    breadcrumb: 'Prototyp',
    label: 'Przypadek użycia · Prototyp',
    heading: 'Prototypuj z szybkością polecenia',
    lead: 'Opisz przepływ, który masz w głowie, a agent złoży prawdziwy, klikalny prototyp — wiele ekranów, wspólne style i działające interakcje — wyrenderowany wprost do HTML, który otworzysz, udostępnisz i przekażesz inżynierom.',
    heroImageAlt:
      'Redakcyjna ilustracja dłoni szkicującej wireframe, który zamienia się w klikalny, wieloekranowy prototyp aplikacji',
    tldrTitle: 'W jednym zdaniu',
    tldrBody:
      'Open Design to warstwa projektowa dla coding agenta, którego już używasz. W prototypowaniu oznacza to przejście od pomysłu opisanego w jednym akapicie do nawigowalnego, ostylowanego prototypu w jednej sesji — bez narzędzia projektowego, bez kroku eksportu, bez luki przy przekazywaniu.',
    stepsTitle: 'Jak działa prototypowanie z Open Design',
    steps: [
      {
        title: 'Opisz przepływ',
        body: 'Powiedz agentowi prostym językiem, co budujesz — „przepływ onboardingu z ekranem powitalnym, wyborem planu i potwierdzeniem”. Open Design ładuje umiejętność prototypowania, więc agent wie, że ma stworzyć ekrany, a nie pojedynczą stronę.',
        imageAlt:
          'Ilustracja osoby wpisującej w terminalu opis przepływu aplikacji prostym językiem',
      },
      {
        title: 'Wygeneruj ostylowane ekrany',
        body: 'Agent stosuje system projektowy i szablony prototypów z Open Design, więc każdy ekran dzieli typografię, odstępy i komponenty, zamiast wyglądać jak zgrubny szkic. Otrzymujesz spójny zestaw ekranów, a nie rozłączne makiety.',
        imageAlt:
          'Ilustracja kilku ekranów aplikacji pojawiających się po kolei, wszystkie w jednym spójnym stylu wizualnym',
      },
      {
        title: 'Połącz interakcje',
        body: 'Przyciski nawigują, zakładki się przełączają, modale się otwierają. Prototyp renderuje się do samodzielnego HTML, więc zachowuje się jak prawdziwy produkt w każdej przeglądarce — by go obejrzeć, nie potrzeba konta w narzędziu do prototypowania.',
        imageAlt:
          'Ilustracja kursora klikającego przez połączone ekrany, ze strzałkami pokazującymi nawigację między nimi',
      },
      {
        title: 'Iteruj i przekaż dalej',
        body: 'Dopracuj go w rozmowie z agentem — „zmień wybór planu na układ trójkolumnowy”. Ponieważ artefakt żyje w Twoim projekcie, projekt i docelowy kod dzielą jedno źródło prawdy, zamykając typową lukę przy przekazywaniu pracy od projektanta do inżyniera.',
        imageAlt:
          'Ilustracja prototypu, który jest poprawiany, a następnie przekazywany inżynierowi, gdzie projekt i kod łączą się w jeden plik',
      },
    ],
    tableTitle: 'Prototypowanie z Open Design kontra dawny sposób',
    tableColCapability: 'Czego potrzebujesz',
    tableColWithOd: 'Z Open Design',
    tableColWithout: 'Tradycyjne narzędzia do prototypowania',
    tableRows: [
      {
        capability: 'Przejść od pomysłu do pierwszego ekranu',
        withOd: 'Jedno polecenie w agencie, którego już masz otwartego',
        without: 'Otwórz osobne narzędzie, załóż plik, przeciągaj prostokąty ręcznie',
      },
      {
        capability: 'Wiele połączonych ekranów',
        withOd: 'Wygenerowane jako zestaw ze wspólnymi stylami i działającą nawigacją',
        without: 'Każda ramka rysowana i łączona ręcznie',
      },
      {
        capability: 'Spójny system wizualny',
        withOd: 'Czerpany z wielokrotnego systemu projektowego, który agent stosuje',
        without: 'Odtwarzany w każdym pliku lub utrzymywany ręcznie',
      },
      {
        capability: 'Wynik gotowy do udostępnienia',
        withOd: 'Samodzielny HTML — otwiera się w każdej przeglądarce, bez konta',
        without: 'Oglądający potrzebuje miejsca lub linku do udostępnienia w narzędziu dostawcy',
      },
      {
        capability: 'Droga do prawdziwego kodu',
        withOd: 'Artefakt żyje w Twoim repozytorium; projekt i kod dzielą jedno źródło',
        without: 'Budowany od zera po osobnym przekazaniu',
      },
      {
        capability: 'Koszt i uzależnienie od dostawcy',
        withOd: 'Open source, własne klucze, działa lokalnie',
        without: 'Abonament za stanowisko, hostowane u dostawcy, ograniczony eksport',
      },
    ],
    featuresTitle: 'Co możesz prototypować',
    features: [
      {
        title: 'Wieloekranowe aplikacje webowe',
        body: 'Pełne przepływy ze wspólną nawigacją — onboarding, dashboardy, ustawienia — a nie pojedyncze strony.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Przepływy aplikacji mobilnych',
        body: 'Mobilne ścieżki ekran po ekranie z przejściami i stanami, które sprawiają wrażenie natywnych.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Strony docelowe',
        body: 'Strony marketingowe i landingi SaaS, które możesz przeklikać i wdrożyć.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Dowolny gust wizualny',
        body: 'Redakcyjny, miękki czy brutalistyczny — prototyp niesie spójny styl od początku do końca.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Lista oczekujących i cennik',
        body: 'Powierzchnie konwersji — listy oczekujących, tabele cenowe — podłączone i zgodne z marką.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Grywalizacja i zabawa',
        body: 'Koncepcje nasycone interakcją, w których ruch i stan są częścią prezentacji.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Prototypy, które ludzie zbudowali z Open Design',
    galleryLead:
      'Każdy z nich zaczął się od polecenia i wyrenderował do klikalnego artefaktu. Wybierz szablon bliski Twojemu pomysłowi, opisz swoją wariację, a agent go dostosuje.',
    gallery: [
      { thumb: "example-dating-web", caption: "Webowa aplikacja randkowa — przepływ wieloekranowy" },
      { thumb: "example-hr-onboarding", caption: "Przepływ onboardingu HR" },
      { thumb: "example-kami-landing", caption: "Strona docelowa produktu" },
      { thumb: "example-web-prototype-taste-soft", caption: "Webowy prototyp w miękkim stylu" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Przeglądaj szablony prototypów',
    faqTitle: 'FAQ o prototypowaniu',
    faq: [
      {
        q: 'Czy potrzebuję narzędzia projektowego jak Figma, by prototypować z Open Design?',
        a: 'Nie. Open Design działa wewnątrz Twojego coding agenta i renderuje prototypy do HTML. Opisujesz przepływ językiem; agent tworzy ekrany. Nie ma osobnego narzędzia z płótnem, którego trzeba się uczyć lub za które trzeba płacić.',
      },
      {
        q: 'Czy prototypy są interaktywne, czy to tylko statyczne makiety?',
        a: 'Interaktywne. Nawigacja, zakładki i modale działają, bo wynik to prawdziwy HTML i CSS. Możesz przeklikać go w każdej przeglądarce dokładnie tak, jak zrobiłby to użytkownik.',
      },
      {
        q: 'Których agentów mogę używać?',
        a: 'Open Design współpracuje z Claude Code, Codex, Cursor Agent, Gemini CLI i kilkunastoma innymi natywnymi adapterami. Korzystasz z własnych kluczy dostawcy; nic nie jest hostowane za Ciebie.',
      },
      {
        q: 'Czy prototyp może stać się prawdziwym produktem?',
        a: 'O to właśnie chodzi. Artefakt żyje w Twoim projekcie, więc ten sam system projektowy i komponenty przechodzą do kodu produkcyjnego, zamiast być wyrzucane po przekazaniu.',
      },
    ],
    ctaTitle: 'Sprototypuj swój kolejny pomysł jeszcze dziś wieczorem',
    ctaBody:
      'Daj gwiazdkę repozytorium, zainstaluj Open Design i zamień swoje kolejne „a gdyby” w coś, co możesz kliknąć — w agencie, którego już używasz.',
  },
  dashboard: {
    title: 'Generuj dashboardy danych z Open Design + Claude Code',
    description:
      'Opisz metryki, które śledzisz, a Twój coding agent zbuduje ostylowany, responsywny dashboard — wykresy, karty KPI i tabele wyrenderowane do HTML, który zahostujesz gdziekolwiek. Bez stanowiska w narzędziu BI, bez kreatora przeciągnij i upuść.',
    breadcrumb: 'Dashboard',
    label: 'Przypadek użycia · Dashboard',
    heading: 'Dashboardy z opisu, a nie z kreatora przeciągnij i upuść',
    lead: 'Powiedz agentowi, co pokazać i jak ma to wyglądać. Open Design dostarcza wzorce wykresów, system układu i język wizualny, więc otrzymujesz spójny, prezentowalny dashboard — a nie ścianę domyślnie ostylowanych widżetów.',
    heroImageAlt:
      'Redakcyjna ilustracja surowych liczb po lewej, które przepływają w czysty dashboard z wykresami i kartami KPI po prawej',
    tldrTitle: 'W jednym zdaniu',
    tldrBody:
      'Open Design zamienia opisaną prostym językiem specyfikację Twoich metryk w ostylowany dashboard, który agent renderuje do HTML — wersjonowany w Twoim repozytorium, hostowalny gdziekolwiek, bez abonamentu BI za stanowisko.',
    stepsTitle: 'Jak działają dashboardy z Open Design',
    steps: [
      {
        title: 'Opisz metryki',
        body: 'Wypisz, co się liczy — „aktywni użytkownicy tygodniowo, przychód według planu, churn i trend 30-dniowy”. Agent ładuje umiejętność dashboardu, więc wie, że ma rozłożyć karty KPI, wykresy i tabelę, a nie pojedynczy blok tekstu.',
        imageAlt: 'Ilustracja osoby wypisującej metryki, na których jej zależy',
      },
      {
        title: 'Wybierz wzorce wykresów',
        body: 'Open Design dostarcza szablony wykresów i układów, więc trendy stają się wykresami liniowymi, podziały słupkami, a proporcje właściwą wizualizacją — spójna typografia i odstępy w całości, zamiast niedopasowanych domyślnych ustawień.',
        imageAlt: 'Ilustracja kilku typów wykresów ułożonych w spójną siatkę',
      },
      {
        title: 'Podłącz swoje dane',
        body: 'Wskaż dashboardowi plik CSV, endpoint JSON lub wklej przykładowe wiersze. Renderuje się do samodzielnego HTML, który aktualizuje się wraz z danymi — otwórz go w każdej przeglądarce, wrzuć na dowolny statyczny hosting.',
        imageAlt: 'Ilustracja pliku danych łączącego się z dashboardem aktualizowanym na żywo',
      },
      {
        title: 'Dopracuj i wdróż',
        body: 'Dostosuj go w rozmowie z agentem — „pogrupuj przychód według regionu, przenieś wiersz KPI na górę”. Artefakt żyje w Twoim projekcie, więc dashboard można recenzować i wersjonować jak każdy inny kod.',
        imageAlt: 'Ilustracja dashboardu, który jest dopracowywany, a następnie wdrażany',
      },
    ],
    tableTitle: 'Dashboardy z Open Design kontra dawny sposób',
    tableColCapability: 'Czego potrzebujesz',
    tableColWithOd: 'Z Open Design',
    tableColWithout: 'Narzędzia BI / ręcznie kodowane',
    tableRows: [
      {
        capability: 'Przejść od listy metryk do układu',
        withOd: 'Jedno polecenie; agent rozkłada karty, wykresy i tabele',
        without: 'Przeciągaj widżety jeden po drugim albo pisz kod wykresów od zera',
      },
      {
        capability: 'Spójny system wizualny',
        withOd: 'Wzorce wykresów i odstępy z wielokrotnego systemu projektowego',
        without: 'Domyślne style widżetów albo stylowanie ręczne dla każdego wykresu',
      },
      {
        capability: 'Podłączenie danych',
        withOd: 'CSV / JSON / wklejone wiersze, renderowane do żywego HTML',
        without: 'Konektory dostawcy lub niestandardowa instalacja danych',
      },
      {
        capability: 'Hosting i udostępnianie',
        withOd: 'Samodzielny HTML na dowolnym statycznym hostingu, bez konta',
        without: 'Oglądający potrzebuje stanowiska u dostawcy BI',
      },
      {
        capability: 'Recenzja i wersjonowanie',
        withOd: 'Żyje w Twoim repozytorium; porównywalny diffem jak kod',
        without: 'Zamknięty u dostawcy, bez prawdziwego diffu',
      },
      {
        capability: 'Koszt i uzależnienie od dostawcy',
        withOd: 'Open source, własne klucze, działa lokalnie',
        without: 'Abonament za stanowisko, hostowane u dostawcy',
      },
    ],
    featuresTitle: 'Co możesz zbudować',
    features: [
      { title: "Analityka produktu", body: "Aktywni użytkownicy, lejki, retencja — metryki, którymi żyje zespół produktowy.", thumb: "example-dashboard" },
      { title: "Metryki repo i dev", body: "Gwiazdki, PR-y, kondycja CI — dashboardy inżynierskie z Twoich własnych danych.", thumb: "example-github-dashboard" },
      { title: "Raporty finansowe", body: "Przychód, spalanie gotówki, runway rozłożone w udostępnialny raport.", thumb: "example-finance-report" },
      { title: "Operacje na żywo", body: "Metryki w czasie rzeczywistym, które odświeżają się, gdy zmieniają się dane źródłowe.", thumb: "example-live-dashboard" },
      { title: "Social i marketing", body: "Wydajność kanałów i śledzenie kampanii w jednym widoku.", thumb: "example-social-media-dashboard" },
      { title: "Raporty dziedzinowe", body: "Ustrukturyzowane raporty dla dowolnej dziedziny — od klinicznej po tradingową.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Dashboardy, które ludzie zbudowali z Open Design',
    galleryLead:
      'Prawdziwe dashboardy wyrenderowane z polecenia i źródła danych. Zacznij od jednego bliskiego Twojemu i opisz metryki, które śledzisz.',
    gallery: [
      { thumb: "example-data-report", caption: "Raport danych" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Dashboard operacji na żywo" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Dashboard analizy tradingowej" },
      { thumb: "example-frame-data-chart-nyt", caption: "Redakcyjny wykres danych" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Przeglądaj szablony dashboardów',
    faqTitle: 'FAQ o dashboardach',
    faq: [
      {
        q: 'Czy potrzebuję narzędzia BI jak Tableau lub Looker?',
        a: 'Nie. Open Design renderuje dashboardy do HTML wewnątrz Twojego coding agenta. Opisujesz metryki i wskazujesz mu swoje dane; nie ma osobnej platformy BI, którą trzeba licencjonować lub poznawać.',
      },
      {
        q: 'Skąd biorą się dane?',
        a: 'Z pliku CSV, endpointu JSON lub wierszy, które wklejasz. Dashboard to czysty HTML i JavaScript, więc kontrolujesz dokładnie, skąd czyta — nic nie jest przekierowywane przez hostowaną usługę.',
      },
      {
        q: 'Czy nietechniczni członkowie zespołu mogą go oglądać?',
        a: 'Tak. Wynik to samodzielna strona internetowa. Każdy z linkiem lub plikiem może otworzyć ją w przeglądarce — bez konta, bez stanowiska.',
      },
      {
        q: 'Których agentów mogę używać?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI i kilkunastu innych natywnych adapterów. Korzystasz z własnych kluczy dostawcy.',
      },
    ],
    ctaTitle: 'Zbuduj swój dashboard jeszcze dziś wieczorem',
    ctaBody:
      'Daj gwiazdkę repozytorium, zainstaluj Open Design i zamień swoje metryki w dashboard, który zahostujesz gdziekolwiek — w agencie, którego już używasz.',
  },
  slides: {
    title: 'Generuj prezentacje z Open Design + Claude Code',
    description:
      'Zamień konspekt w zaprojektowaną, zgodną z marką prezentację bez otwierania aplikacji do prezentacji. Open Design daje Twojemu coding agentowi szablony slajdów i system wizualny, renderując slajdy do HTML, które zaprezentujesz, wyeksportujesz lub udostępnisz.',
    breadcrumb: 'Slajdy',
    label: 'Przypadek użycia · Slajdy',
    heading: 'Prezentacje, które wyglądają na zaprojektowane, napisane poleceniem',
    lead: 'Przekaż agentowi konspekt i ton. Open Design stosuje szablon prezentacji i system wizualny, więc każdy slajd jest rozłożony, złożony typograficznie i zgodny z marką — a nie listą punktowaną na pustym tle.',
    heroImageAlt:
      'Redakcyjna ilustracja konspektu po lewej, który zamienia się w sekwencję zaprojektowanych slajdów prezentacji po prawej',
    tldrTitle: 'W jednym zdaniu',
    tldrBody:
      'Open Design zamienia konspekt w zaprojektowaną prezentację HTML, którą agent renderuje w jednej sesji — zaprezentuj ją w przeglądarce, wyeksportuj do PDF lub PPTX i zachowaj źródło w swoim repozytorium.',
    stepsTitle: 'Jak działają prezentacje z Open Design',
    steps: [
      {
        title: 'Podaj konspekt',
        body: 'Wklej swoje punkty do omówienia lub zgrubną strukturę. Agent ładuje umiejętność prezentacji, więc tworzy sekwencję rozłożonych slajdów, a nie jeden długi dokument.',
        imageAlt: 'Ilustracja tekstowego konspektu przekazywanego agentowi',
      },
      {
        title: 'Wybierz styl prezentacji',
        body: 'Open Design dostarcza szablony prezentacji — redakcyjny, szwajcarski międzynarodowy, ciemny techniczny i więcej. Agent stosuje jeden, więc typografia, siatka i akcenty pozostają spójne na każdym slajdzie.',
        imageAlt: 'Ilustracja kilku opcji stylu prezentacji ułożonych obok siebie',
      },
      {
        title: 'Wygeneruj slajdy',
        body: 'Każdy punkt staje się zaprojektowanym slajdem z właściwą hierarchią — tytuły, wizualizacje wspierające, wyróżnienia danych. Renderuje się do HTML, więc prezentuje się pełnoekranowo w każdej przeglądarce.',
        imageAlt: 'Ilustracja sekwencji gotowych slajdów ze spójnym stylem',
      },
      {
        title: 'Prezentuj, eksportuj, iteruj',
        body: 'Prezentuj z przeglądarki lub wyeksportuj do PDF / PPTX, by udostępnić. Dopracuj go w rozmowie z agentem — „zwarcie slajd z danymi, dodaj końcowe wezwanie do działania”. Źródło prezentacji zostaje w Twoim projekcie.',
        imageAlt: 'Ilustracja prezentacji, która jest pokazywana i eksportowana do wielu formatów',
      },
    ],
    tableTitle: 'Prezentacje z Open Design kontra dawny sposób',
    tableColCapability: 'Czego potrzebujesz',
    tableColWithOd: 'Z Open Design',
    tableColWithout: 'PowerPoint / Keynote / narzędzia AI do slajdów',
    tableRows: [
      {
        capability: 'Przejść od konspektu do slajdów',
        withOd: 'Jedno polecenie; agent rozkłada każdy slajd',
        without: 'Buduj każdy slajd ręcznie albo walcz z szablonem',
      },
      {
        capability: 'Spójny projekt',
        withOd: 'Szablony prezentacji z prawdziwą siatką i systemem typograficznym',
        without: 'Dryf motywu, ręczne wyrównywanie, domyślne ustawienia niezgodne z marką',
      },
      {
        capability: 'Dane i diagramy',
        withOd: 'Wykresy i wyróżnienia renderowane jako część slajdu',
        without: 'Wklejanie statycznych obrazów lub odbudowa wykresów za każdym razem',
      },
      {
        capability: 'Formaty eksportu',
        withOd: 'HTML do prezentacji plus eksport do PDF / PPTX',
        without: 'Uwięziony w formacie jednej aplikacji',
      },
      {
        capability: 'Recenzja i wersjonowanie',
        withOd: 'Źródło żyje w Twoim repozytorium, porównywalne diffem',
        without: 'Plik binarny, bez sensownego diffu',
      },
      {
        capability: 'Koszt i uzależnienie od dostawcy',
        withOd: 'Open source, własne klucze, działa lokalnie',
        without: 'Licencja aplikacji lub dodatek AI za stanowisko',
      },
    ],
    featuresTitle: 'Co możesz zaprezentować',
    features: [
      { title: "Pitch decki", body: "Prezentacje inwestorskie i sprzedażowe z mocną narracją i czystymi slajdami danych.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Szwajcarski / redakcyjny", body: "Oparte na siatce, typograficzne prezentacje, które wyglądają na opracowane artystycznie.", thumb: "example-deck-swiss-international" },
      { title: "Moduły kursowe", body: "Prezentacje szkoleniowe z jasnymi krokami, wyróżnieniami i tempem.", thumb: "example-html-ppt-course-module" },
      { title: "Prezentacje z wykresami", body: "Ciemne, eksponujące wykresy prezentacje do analityki i przeglądów.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Tryb prezentera", body: "Prezentacje w stylu reveal zbudowane do pokazywania na żywo w przeglądarce.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Plany techniczne", body: "Prezentacje architektury i wiedzy, które mapują złożone systemy.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Prezentacje, które ludzie zbudowali z Open Design',
    galleryLead:
      'Prawdziwe prezentacje wyrenderowane z konspektu. Wybierz styl bliski Twojemu wystąpieniu i opisz treść.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Redakcyjna prezentacja magazynowa" },
      { thumb: "example-guizang-ppt", caption: "Ilustrowany keynote" },
      { thumb: "example-deck-open-slide-canvas", caption: "Prezentacja open slide canvas" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Prezentacja w motywie gradientowym" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Przeglądaj szablony prezentacji',
    faqTitle: 'FAQ o slajdach',
    faq: [
      {
        q: 'Czy potrzebuję PowerPointa lub Keynote?',
        a: 'Nie. Open Design renderuje prezentacje do HTML wewnątrz Twojego coding agenta i może eksportować do PDF lub PPTX. Prezentujesz z przeglądarki lub przekazujesz plik — by ją zbudować, nie potrzeba aplikacji do prezentacji.',
      },
      {
        q: 'Czy to tylko punkty wygenerowane przez AI?',
        a: 'Nie. Agent stosuje prawdziwy szablon prezentacji z siatką, skalą typograficzną i hierarchią wizualną, więc slajdy wyglądają na zaprojektowane, a nie automatycznie wypełnione.',
      },
      {
        q: 'Czy mogę wyeksportować do PowerPointa dla klienta?',
        a: 'Tak. Prezentacje eksportują się do PPTX i PDF obok HTML, z którego prezentujesz, więc pasują do tego, czego oczekuje odbiorca.',
      },
      {
        q: 'Których agentów mogę używać?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI i więcej natywnych adapterów, z własnymi kluczami dostawcy.',
      },
    ],
    ctaTitle: 'Zbuduj swoją kolejną prezentację jeszcze dziś wieczorem',
    ctaBody:
      'Daj gwiazdkę repozytorium, zainstaluj Open Design i zamień swój konspekt w zaprojektowaną prezentację — w agencie, którego już używasz.',
  },
  image: {
    title: 'Generuj grafiki zgodne z marką z Open Design + Claude Code',
    description:
      'Twórz karty społecznościowe, okładki artykułów i grafiki marketingowe z polecenia — rozłożone z prawdziwą typografią i Twoim systemem marki, wyrenderowane do ostrego HTML, który wyeksportujesz do PNG. Bez aplikacji projektowej, bez abonamentu na szablony.',
    breadcrumb: 'Grafika',
    label: 'Przypadek użycia · Grafika',
    heading: 'Grafiki zgodne z marką, wygenerowane i rozłożone za Ciebie',
    lead: 'Opisz kartę lub okładkę, której potrzebujesz. Open Design komponuje ją z prawdziwą typografią, siatką i Twoimi kolorami marki — a potem renderuje do HTML, który wyeksportujesz jako obraz, zamiast mocować się z aplikacją projektową lub ogólnym szablonem.',
    heroImageAlt:
      'Redakcyjna ilustracja polecenia, które zamienia się w zestaw rozłożonych kart społecznościowych i okładek artykułów',
    tldrTitle: 'W jednym zdaniu',
    tldrBody:
      'Open Design zamienia polecenie w złożoną typograficznie, zgodną z marką grafikę, którą agent renderuje do HTML i eksportuje do PNG — powtarzalną, wersjonowaną i wolną od narzędzi projektowych rozliczanych za stanowisko.',
    stepsTitle: 'Jak działają grafiki z Open Design',
    steps: [
      {
        title: 'Opisz grafikę',
        body: 'Powiedz, czym jest — „karta na Twitter na nasz launch z nagłówkiem i cytatem”. Agent ładuje właściwą umiejętność, więc komponuje rozłożoną grafikę, a nie zwykły blok tekstu.',
        imageAlt: 'Ilustracja osoby opisującej kartę społecznościową, której potrzebuje',
      },
      {
        title: 'Zastosuj system marki',
        body: 'Open Design czerpie Twoje kolory, typografię i odstępy z wielokrotnego systemu projektowego, więc każda karta pasuje do reszty Twojej marki, zamiast wyglądać na jednorazową.',
        imageAlt: 'Ilustracja kolorów marki i typografii nakładanych na układ karty',
      },
      {
        title: 'Wyrenderuj i wyeksportuj',
        body: 'Grafika renderuje się do HTML w dokładnie potrzebnych wymiarach — karta społecznościowa, okładka, baner — a potem eksportuje do PNG. Ostry tekst, prawdziwy układ, bez ręcznego poprawiania.',
        imageAlt: 'Ilustracja grafiki, która renderuje się i eksportuje do pliku obrazu',
      },
      {
        title: 'Wykorzystaj przepis ponownie',
        body: 'Ponieważ to szablon, kolejna grafika jest o jedno polecenie dalej — zmień nagłówek, zachowaj układ. Serie kart pozostają idealnie spójne.',
        imageAlt: 'Ilustracja jednego szablonu karty tworzącego spójną serię grafik',
      },
    ],
    tableTitle: 'Grafiki z Open Design kontra dawny sposób',
    tableColCapability: 'Czego potrzebujesz',
    tableColWithOd: 'Z Open Design',
    tableColWithout: 'Aplikacje projektowe / ogólne szablony',
    tableRows: [
      {
        capability: 'Przejść od pomysłu do rozłożonej grafiki',
        withOd: 'Jedno polecenie; agent komponuje typografię i układ',
        without: 'Otwórz aplikację, umieść każdy element ręcznie',
      },
      {
        capability: 'Pozostać zgodnym z marką',
        withOd: 'Kolory i typografia z wielokrotnego systemu projektowego',
        without: 'Wybieraj style marki w każdym pliku albo dryfuj od marki',
      },
      {
        capability: 'Spójna seria',
        withOd: 'Ten sam szablon, nowa treść — idealnie wyrównany zestaw',
        without: 'Wyrównuj każdy wariant ręcznie',
      },
      {
        capability: 'Eksport',
        withOd: 'HTML w dokładnych wymiarach, eksportowany do PNG',
        without: 'Ręczne ustawianie rozmiaru płótna i opcji eksportu',
      },
      {
        capability: 'Powtarzalność',
        withOd: 'Przepis sterowany poleceniem w Twoim repozytorium',
        without: 'Jednorazowy plik odtwarzany za każdym razem',
      },
      {
        capability: 'Koszt i uzależnienie od dostawcy',
        withOd: 'Open source, własne klucze, działa lokalnie',
        without: 'Narzędzie projektowe za stanowisko lub marketplace szablonów',
      },
    ],
    featuresTitle: 'Co możesz stworzyć',
    features: [
      { title: "Karty społecznościowe", body: "Karty na X / Twitter skomponowane z Twoim nagłówkiem i marką.", thumb: "example-card-twitter" },
      { title: "Okładki artykułów", body: "Redakcyjne, magazynowe okładki do postów i newsletterów.", thumb: "example-article-magazine" },
      { title: "Karty Xiaohongshu", body: "Karty w stylu RedNote dostrojone do tego feedu.", thumb: "example-card-xiaohongshu" },
      { title: "Grafiki hero", body: "Płynne, gradientowe wizualizacje hero do stron i launchy.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Karuzele", body: "Wieloslajdowe karuzele społecznościowe, które pozostają spójne między ramkami.", thumb: "example-social-carousel" },
      { title: "Ramki makiet UI", body: "Ramki powiadomień i urządzeń do opowiadania historii produktu.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Grafiki, które ludzie zbudowali z Open Design',
    galleryLead:
      'Prawdziwe karty i okładki wyrenderowane z polecenia. Wybierz jedną bliską temu, czego potrzebujesz, i podmień swoją treść.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Pastelowa karta społecznościowa" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Redakcyjny plakat trójtonowy" },
      { thumb: "example-magazine-poster", caption: "Plakat w stylu magazynowym" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Wyrazista redakcyjna okładka" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Przeglądaj szablony grafik',
    faqTitle: 'FAQ o grafikach',
    faq: [
      {
        q: 'Czy to generator obrazów AI jak Midjourney?',
        a: 'Nie. Open Design komponuje grafiki z prawdziwym układem i typografią — Twój nagłówek, Twoja marka, dokładne wymiary — i renderuje do HTML, który eksportujesz jako PNG. To kompozycja projektowa, a nie generowanie pikseli.',
      },
      {
        q: 'Czy mogę stworzyć spójną serię kart?',
        a: 'Tak. Ponieważ każda grafika to szablon, zachowujesz układ i zmieniasz treść, więc cała seria pozostaje idealnie wyrównana i zgodna z marką.',
      },
      {
        q: 'Jakie rozmiary potrafi tworzyć?',
        a: 'Dowolne — grafika renderuje się w dokładnie podanych przez Ciebie wymiarach, od kwadratowej karty społecznościowej po szeroki baner, a potem eksportuje do PNG.',
      },
      {
        q: 'Których agentów mogę używać?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI i więcej natywnych adapterów, z własnymi kluczami dostawcy.',
      },
    ],
    ctaTitle: 'Stwórz swoją kolejną grafikę jeszcze dziś wieczorem',
    ctaBody:
      'Daj gwiazdkę repozytorium, zainstaluj Open Design i zamień polecenie w grafikę zgodną z marką — w agencie, którego już używasz.',
  },
  video: {
    title: 'Generuj grafikę ruchomą i krótkie wideo z Open Design + Claude Code',
    description:
      'Zamień scenariusz w animowane klatki i krótkie wideo — plansze tytułowe, ruchome tła i końcówki skomponowane z Twoim systemem marki i wyrenderowane z HTML. Bez pakietu do grafiki ruchomej, bez przewijania osi czasu.',
    breadcrumb: 'Wideo',
    label: 'Przypadek użycia · Wideo',
    heading: 'Grafika ruchoma ze scenariusza, a nie z osi czasu',
    lead: 'Opisz moment, którego chcesz — odsłonięcie tytułu, animację danych, końcówkę z logo. Open Design komponuje animowane klatki z Twoim systemem marki i renderuje je do wideo, bez potrzeby pakietu do grafiki ruchomej.',
    heroImageAlt:
      'Redakcyjna ilustracja scenariusza, który zamienia się w sekwencję animowanych klatek wideo',
    tldrTitle: 'W jednym zdaniu',
    tldrBody:
      'Open Design zamienia scenariusz w animowane, zgodne z marką klatki, które agent renderuje do krótkiego wideo — skomponowane z HTML, wersjonowane w Twoim repozytorium, bez edytora osi czasu, którego trzeba się uczyć.',
    stepsTitle: 'Jak działa ruch z Open Design',
    steps: [
      {
        title: 'Opisz moment',
        body: 'Powiedz, co ma się wydarzyć — „glitchowy tytuł, który przechodzi w nasze logo, a potem plansza końcowa”. Agent ładuje umiejętność ruchu, więc tworzy animowane klatki, a nie statyczny obraz.',
        imageAlt: 'Ilustracja osoby opisującej sekwencję ruchu',
      },
      {
        title: 'Zastosuj styl marki i ruchu',
        body: 'Open Design dostarcza szablony klatek — filmowe rozbłyski światła, glitchowe tytuły, końcówki z logo — i nakłada Twoje kolory oraz typografię, więc ruch wygląda na zamierzony i zgodny z marką.',
        imageAlt: 'Ilustracja stylu marki nakładanego na animowane klatki',
      },
      {
        title: 'Wyrenderuj klatki do wideo',
        body: 'Klatki są komponowane w HTML i renderowane do wideo, więc czas i układ są precyzyjne i powtarzalne — bez ręcznego ustawiania klatek kluczowych na osi czasu.',
        imageAlt: 'Ilustracja klatek HTML renderujących się w klip wideo',
      },
      {
        title: 'Iteruj i eksportuj',
        body: 'Dopracuj go w rozmowie z agentem — „zwolnij odsłonięcie tytułu, dodaj napis”. Eksportuj krótkie klipy na social media lub do produktu. Źródło zostaje w Twoim projekcie.',
        imageAlt: 'Ilustracja klipu wideo, który jest dopracowywany i eksportowany na social media',
      },
    ],
    tableTitle: 'Ruch z Open Design kontra dawny sposób',
    tableColCapability: 'Czego potrzebujesz',
    tableColWithOd: 'Z Open Design',
    tableColWithout: 'After Effects / pakiety do grafiki ruchomej',
    tableRows: [
      {
        capability: 'Przejść od scenariusza do animowanych klatek',
        withOd: 'Jedno polecenie; agent komponuje sekwencję',
        without: 'Ustawiaj klatki kluczowe każdego elementu na osi czasu ręcznie',
      },
      {
        capability: 'Pozostać zgodnym z marką',
        withOd: 'Szablony klatek + Twoje kolory i typografia',
        without: 'Odbudowuj stylowanie marki w każdym projekcie',
      },
      {
        capability: 'Precyzyjny, powtarzalny czas',
        withOd: 'Skomponowane w HTML, renderowane deterministycznie',
        without: 'Ręczne przewijanie, trudne do odtworzenia',
      },
      {
        capability: 'Eksport na social media',
        withOd: 'Krótkie klipy renderowane do wideo',
        without: 'Presety eksportu i walka z kodekami',
      },
      {
        capability: 'Recenzja i wersjonowanie',
        withOd: 'Źródło klatek żyje w Twoim repozytorium, porównywalne diffem',
        without: 'Binarny plik projektu, bez prawdziwego diffu',
      },
      {
        capability: 'Koszt i uzależnienie od dostawcy',
        withOd: 'Open source, własne klucze, działa lokalnie',
        without: 'Drogi pakiet, stroma krzywa uczenia',
      },
    ],
    featuresTitle: 'Co możesz animować',
    features: [
      { title: "Hyperframes", body: "Sekwencje ruchu klatka po klatce skomponowane z HTML.", thumb: "example-video-hyperframes" },
      { title: "Krótkie formy społecznościowe", body: "Pionowe klipy zbudowane pod feedy społecznościowe.", thumb: "example-video-shortform" },
      { title: "Zestawy klatek ruchu", body: "Wielokrotne animowane klatki, które komponujesz w klip.", thumb: "example-motion-frames" },
      { title: "Filmowe rozbłyski światła", body: "Filmowe przejścia i atmosferyczne tła.", thumb: "example-frame-light-leak-cinema" },
      { title: "Glitchowe tytuły", body: "Odsłonięcia tytułów z ruchem i teksturą.", thumb: "example-frame-glitch-title" },
      { title: "Końcówki z logo", body: "Markowe animacje końcowe do dowolnego klipu.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Ruch, który ludzie zbudowali z Open Design',
    galleryLead:
      'Prawdziwe animowane klatki i klipy wyrenderowane z polecenia. Wybierz jeden bliski Twojemu pomysłowi i opisz ruch.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Sekwencja hyperframes" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Płynne ruchome tło" },
      { thumb: "example-frame-macos-notification", caption: "Animowana ramka UI" },
      { thumb: "example-frame-data-chart-nyt", caption: "Animowany wykres danych" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Przeglądaj szablony ruchu',
    faqTitle: 'FAQ o wideo',
    faq: [
      {
        q: 'Czy potrzebuję After Effects lub pakietu do grafiki ruchomej?',
        a: 'Nie. Open Design komponuje animowane klatki w HTML i renderuje je do wideo wewnątrz Twojego coding agenta. Nie ma edytora osi czasu, którego trzeba się uczyć lub który trzeba licencjonować.',
      },
      {
        q: 'Do jakiego rodzaju wideo to się nadaje?',
        a: 'Do krótkich form ruchu — plansze tytułowe, animacje danych, końcówki z logo, klipy społecznościowe. Jest zbudowane pod ruch marki i produktu, a nie pod montaż pełnometrażowy.',
      },
      {
        q: 'Czy czas jest odtwarzalny?',
        a: 'Tak. Ponieważ klatki są komponowane w kodzie i renderowane deterministycznie, za każdym razem otrzymujesz ten sam wynik i możesz go precyzyjnie dostroić poleceniem.',
      },
      {
        q: 'Których agentów mogę używać?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI i więcej natywnych adapterów, z własnymi kluczami dostawcy.',
      },
    ],
    ctaTitle: 'Zanimuj swój kolejny pomysł jeszcze dziś wieczorem',
    ctaBody:
      'Daj gwiazdkę repozytorium, zainstaluj Open Design i zamień scenariusz w ruch — w agencie, którego już używasz.',
  },
  designSystem: {
    title: 'Zbuduj i zastosuj system projektowy z Open Design + Claude Code',
    description:
      'Uchwyć swoją markę jako wielokrotny system projektowy, który Twój coding agent stosuje do każdego artefaktu — kolory, typografia, komponenty i ton w jednym DESIGN.md. Zdefiniuj raz; każdy prototyp, prezentacja i dashboard pozostaje zgodny z marką.',
    breadcrumb: 'System projektowy',
    label: 'Przypadek użycia · System projektowy',
    heading: 'Jeden system projektowy, zastosowany do wszystkiego, co tworzy Twój agent',
    lead: 'Zdefiniuj swoją markę raz, a Open Design przenosi ją do każdego efektu — prototypów, prezentacji, dashboardów, grafik. System żyje w Twoim repozytorium jako DESIGN.md, który agent czyta, więc spójność jest automatyczna, a nie ręczna.',
    heroImageAlt:
      'Redakcyjna ilustracja pojedynczego systemu projektowego promieniującego na wiele artefaktów zgodnych z marką',
    tldrTitle: 'W jednym zdaniu',
    tldrBody:
      'Open Design ujmuje Twoją markę jako przenośny system projektowy, który agent stosuje do każdego artefaktu — zdefiniowany raz w Twoim repozytorium, egzekwowany wszędzie, bez centralnego narzędzia projektowego, które by go strzegło.',
    stepsTitle: 'Jak działają systemy projektowe z Open Design',
    steps: [
      {
        title: 'Uchwyć system',
        body: 'Opisz swoją markę — kolory, typografię, odstępy, głos — albo wskaż agentowi istniejącą stronę, by ją wyodrębnił. Open Design zapisuje to w DESIGN.md, który żyje w Twoim projekcie.',
        imageAlt: 'Ilustracja marki ujmowanej w pojedynczy plik systemu projektowego',
      },
      {
        title: 'Zacznij od sprawdzonej bazy',
        body: 'Open Design dostarcza ponad 140 referencyjnych systemów projektowych — od Apple i Linear po redakcyjne i brutalistyczne. Sforkuj jeden bliski Twojej marce zamiast zaczynać od pustej strony.',
        imageAlt: 'Ilustracja przeglądanej galerii referencyjnych systemów projektowych',
      },
      {
        title: 'Stosuj go wszędzie',
        body: 'Każda inna umiejętność czyta ten sam system, więc prototyp, prezentacja i dashboard dzielą jeden język wizualny — bez ponownego określania go za każdym razem.',
        imageAlt: 'Ilustracja jednego systemu stosowanego spójnie w wielu typach artefaktów',
      },
      {
        title: 'Rozwijaj go w jednym miejscu',
        body: 'Zmień system, a kolejny render odzwierciedli to wszędzie. Ponieważ to plik w Twoim repozytorium, decyzje projektowe są recenzowane i wersjonowane jak kod.',
        imageAlt: 'Ilustracja systemu projektowego, który jest aktualizowany i propagowany do wszystkich efektów',
      },
    ],
    tableTitle: 'Systemy projektowe z Open Design kontra dawny sposób',
    tableColCapability: 'Czego potrzebujesz',
    tableColWithOd: 'Z Open Design',
    tableColWithout: 'Biblioteki narzędzi projektowych / przewodniki stylu',
    tableRows: [
      {
        capability: 'Zdefiniować system',
        withOd: 'DESIGN.md, który agent czyta, sforkowany z ponad 140 referencji',
        without: 'Statyczny przewodnik stylu lub biblioteka związana z narzędziem',
      },
      {
        capability: 'Stosować w różnych typach artefaktów',
        withOd: 'Ten sam system zasila prototypy, prezentacje, dashboardy, grafiki',
        without: 'Wdrażany na nowo w każdym narzędziu i pliku',
      },
      {
        capability: 'Utrzymać wszystko spójnym',
        withOd: 'Automatycznie — każda umiejętność czyta jedno źródło',
        without: 'Ręczna dyscyplina; dryfuje z czasem',
      },
      {
        capability: 'Rozwijać markę',
        withOd: 'Edytuj raz; kolejny render aktualizuje się wszędzie',
        without: 'Wyszukiwanie i zamiana w plikach i narzędziach',
      },
      {
        capability: 'Recenzja i wersjonowanie',
        withOd: 'Żyje w Twoim repozytorium, porównywalny diffem jak kod',
        without: 'Zakopany w narzędziu projektowym, trudny do audytu',
      },
      {
        capability: 'Koszt i uzależnienie od dostawcy',
        withOd: 'Open source, przenośny, działa lokalnie',
        without: 'Uwięziony w abonamencie narzędzia projektowego',
      },
    ],
    featuresTitle: 'Systemy, od których możesz zacząć',
    features: [
      { title: "Apple", body: "Czysta, powściągliwa estetyka z fontem systemowym.", thumb: "design-system-apple" },
      { title: "Linear", body: "Wyrazisty wygląd narzędzia produktowego z ciasnymi odstępami.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Miękki, zorientowany na dokument, przystępny.", thumb: "design-system-notion" },
      { title: "Figma", body: "Zabawowa, kolorowa energia narzędzia kreatywnego.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimalistyczny, neutralny, na poziomie badawczym.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Gęsty, techniczny, natywny dla deweloperów.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Systemy projektowe w Open Design',
    galleryLead:
      'Kilka z ponad 140 referencyjnych systemów, które możesz sforkować jako punkt wyjścia. Wybierz jeden bliski Twojej marce i dostosuj go.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "System w stylu Airbnb" },
      { thumb: "design-system-vercel", caption: "System w stylu Vercel" },
      { thumb: "design-system-stripe", caption: "System w stylu Stripe" },
      { thumb: "design-system-spotify", caption: "System w stylu Spotify" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Przeglądaj systemy projektowe',
    faqTitle: 'FAQ o systemie projektowym',
    faq: [
      {
        q: 'Czym dokładnie jest tutaj system projektowy?',
        a: 'Plikiem DESIGN.md w Twoim repozytorium, który ujmuje kolory, typografię, odstępy, komponenty i głos. Każda umiejętność Open Design go czyta, więc Twoja marka jest stosowana automatycznie do wszystkiego, co tworzy agent.',
      },
      {
        q: 'Czy muszę zaczynać od zera?',
        a: 'Nie. Open Design dostarcza ponad 140 referencyjnych systemów projektowych, które możesz sforkować — od Apple i Linear po redakcyjne i brutalistyczne — a potem dostosować do swojej marki.',
      },
      {
        q: 'Jak pozostaje spójny między prezentacjami, dashboardami i prototypami?',
        a: 'Ponieważ wszystkie te umiejętności czytają ten sam DESIGN.md. Zdefiniuj system raz, a spójność jest automatyczna, zamiast być czymś, czego pilnujesz ręcznie.',
      },
      {
        q: 'Których agentów mogę używać?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI i więcej natywnych adapterów, z własnymi kluczami dostawcy.',
      },
    ],
    ctaTitle: 'Zdefiniuj swój system projektowy jeszcze dziś wieczorem',
    ctaBody:
      'Daj gwiazdkę repozytorium, zainstaluj Open Design i daj swojemu agentowi jedną markę do stosowania wszędzie — w agencie, którego już używasz.',
  },
};

const ID: SolutionLocaleCopy = {
  prototype: {
    title: 'Bangun prototipe interaktif dengan Open Design + Claude Code',
    description:
      'Ubah sebuah prompt menjadi prototipe multi-layar yang bisa diklik tanpa keluar dari terminal Anda. Open Design memberi coding agent Anda keterampilan desain, templat, dan sistem desain untuk menghasilkan prototipe nyata yang bisa Anda buka di browser.',
    breadcrumb: 'Prototipe',
    label: 'Kasus penggunaan · Prototipe',
    heading: 'Buat prototipe secepat sebuah prompt',
    lead: 'Jelaskan alur yang ada di benak Anda dan biarkan agent menyusun prototipe nyata yang bisa diklik — banyak layar, gaya bersama, dan interaksi langsung — dirender langsung ke HTML yang bisa Anda buka, bagikan, dan serahkan ke tim teknik.',
    heroImageAlt:
      'Ilustrasi bergaya editorial tentang sebuah tangan menggambar wireframe yang berubah menjadi prototipe aplikasi multi-layar yang bisa diklik',
    tldrTitle: 'Dalam satu kalimat',
    tldrBody:
      'Open Design adalah lapisan desain untuk coding agent yang sudah Anda pakai. Untuk pembuatan prototipe, itu berarti beranjak dari ide satu paragraf menjadi prototipe bergaya yang bisa dinavigasi dalam satu sesi — tanpa alat desain, tanpa langkah ekspor, tanpa celah serah terima.',
    stepsTitle: 'Cara kerja pembuatan prototipe dengan Open Design',
    steps: [
      {
        title: 'Jelaskan alurnya',
        body: 'Beri tahu agent apa yang Anda bangun dengan bahasa biasa — “alur onboarding dengan layar sambutan, pemilih paket, dan konfirmasi”. Open Design memuat keterampilan prototipe sehingga agent tahu harus menghasilkan layar, bukan satu halaman.',
        imageAlt:
          'Ilustrasi seseorang mengetikkan deskripsi alur aplikasi dengan bahasa biasa ke dalam terminal',
      },
      {
        title: 'Hasilkan layar bergaya',
        body: 'Agent menerapkan sistem desain dan templat prototipe dari Open Design, sehingga setiap layar berbagi tipografi, jarak, dan komponen alih-alih terlihat seperti draf kasar. Anda mendapatkan satu set layar yang koheren, bukan mockup yang terpisah-pisah.',
        imageAlt:
          'Ilustrasi beberapa layar aplikasi muncul secara berurutan, semuanya berbagi satu gaya visual yang konsisten',
      },
      {
        title: 'Sambungkan interaksinya',
        body: 'Tombol bernavigasi, tab beralih, modal terbuka. Prototipe dirender ke HTML mandiri, sehingga berperilaku seperti produk sungguhan di browser mana pun — tanpa perlu akun alat prototipe untuk melihatnya.',
        imageAlt:
          'Ilustrasi kursor mengeklik layar-layar yang tertaut dengan panah yang menunjukkan navigasi di antaranya',
      },
      {
        title: 'Iterasi dan serahkan',
        body: 'Sempurnakan dengan berbicara kepada agent — “ubah pemilih paket menjadi tata letak tiga kolom”. Karena artefaknya hidup di proyek Anda, desain dan kode akhirnya berbagi satu sumber kebenaran, menutup celah serah terima dari desainer ke insinyur yang biasa terjadi.',
        imageAlt:
          'Ilustrasi sebuah prototipe yang direvisi lalu diserahkan kepada seorang insinyur, dengan desain dan kode menyatu menjadi satu berkas',
      },
    ],
    tableTitle: 'Pembuatan prototipe dengan Open Design vs. cara lama',
    tableColCapability: 'Yang Anda butuhkan',
    tableColWithOd: 'Dengan Open Design',
    tableColWithout: 'Alat prototipe tradisional',
    tableRows: [
      {
        capability: 'Beranjak dari ide ke layar pertama',
        withOd: 'Satu prompt di agent yang sudah Anda buka',
        without: 'Buka alat terpisah, mulai berkas, seret kotak satu per satu',
      },
      {
        capability: 'Banyak layar yang tertaut',
        withOd: 'Dihasilkan sebagai satu set dengan gaya bersama dan navigasi yang berfungsi',
        without: 'Setiap bingkai digambar dan ditautkan secara manual',
      },
      {
        capability: 'Sistem visual yang konsisten',
        withOd: 'Diambil dari sistem desain yang dapat dipakai ulang dan diterapkan agent',
        without: 'Dibuat ulang per berkas atau dipelihara secara manual',
      },
      {
        capability: 'Hasil yang bisa dibagikan',
        withOd: 'HTML mandiri — terbuka di browser mana pun, tanpa akun',
        without: 'Penonton butuh kursi atau tautan berbagi di alat vendor',
      },
      {
        capability: 'Jalur menuju kode nyata',
        withOd: 'Artefak hidup di repo Anda; desain dan kode berbagi satu sumber',
        without: 'Dibangun ulang dari nol setelah serah terima terpisah',
      },
      {
        capability: 'Biaya dan keterkuncian vendor',
        withOd: 'Open source, pakai kunci Anda sendiri, berjalan lokal',
        without: 'Langganan per kursi, dihosting vendor, ekspor terbatas',
      },
    ],
    featuresTitle: 'Apa yang bisa Anda prototipekan',
    features: [
      {
        title: 'Aplikasi web multi-layar',
        body: 'Alur lengkap dengan navigasi bersama — onboarding, dashboard, pengaturan — bukan halaman tunggal.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Alur aplikasi seluler',
        body: 'Perjalanan seluler layar demi layar dengan transisi dan keadaan yang terasa native.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Halaman arahan',
        body: 'Halaman pemasaran dan landing SaaS yang bisa Anda klik dan rilis.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Selera visual apa pun',
        body: 'Editorial, lembut, atau brutalis — prototipe membawa gaya yang koheren dari awal sampai akhir.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Daftar tunggu dan harga',
        body: 'Permukaan konversi — daftar tunggu, tabel harga — tersambung dan sesuai merek.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Bergaya gim dan playful',
        body: 'Konsep yang sarat interaksi di mana gerak dan keadaan menjadi bagian dari presentasi.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Prototipe yang dibangun orang dengan Open Design',
    galleryLead:
      'Setiap karya ini dimulai sebagai prompt dan dirender menjadi artefak yang bisa diklik. Pilih templat yang dekat dengan ide Anda, jelaskan variasi Anda, dan agent menyesuaikannya.',
    gallery: [
      { thumb: "example-dating-web", caption: "Aplikasi web kencan — alur multi-layar" },
      { thumb: "example-hr-onboarding", caption: "Alur onboarding HR" },
      { thumb: "example-kami-landing", caption: "Halaman arahan produk" },
      { thumb: "example-web-prototype-taste-soft", caption: "Prototipe web bergaya lembut" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Jelajahi templat prototipe',
    faqTitle: 'FAQ pembuatan prototipe',
    faq: [
      {
        q: 'Apakah saya butuh alat desain seperti Figma untuk membuat prototipe dengan Open Design?',
        a: 'Tidak. Open Design berjalan di dalam coding agent Anda dan merender prototipe ke HTML. Anda menjelaskan alur dengan bahasa; agent menghasilkan layar. Tidak ada alat kanvas terpisah untuk dipelajari atau dibayar.',
      },
      {
        q: 'Apakah prototipenya interaktif atau hanya mockup statis?',
        a: 'Interaktif. Navigasi, tab, dan modal berfungsi karena keluarannya adalah HTML dan CSS nyata. Anda bisa mengekliknya di browser mana pun persis seperti yang dilakukan pengguna.',
      },
      {
        q: 'Agent mana saja yang bisa saya pakai?',
        a: 'Open Design bekerja dengan Claude Code, Codex, Cursor Agent, Gemini CLI, dan belasan adapter resmi lainnya. Anda membawa kunci penyedia Anda sendiri; tidak ada yang dihosting untuk Anda.',
      },
      {
        q: 'Bisakah sebuah prototipe menjadi produk nyata?',
        a: 'Itulah intinya. Artefak hidup di proyek Anda, sehingga sistem desain dan komponen yang sama terbawa ke kode produksi alih-alih dibuang setelah serah terima.',
      },
    ],
    ctaTitle: 'Prototipekan ide Anda berikutnya malam ini',
    ctaBody:
      'Beri bintang pada repo, pasang Open Design, dan ubah “bagaimana jika” Anda berikutnya menjadi sesuatu yang bisa Anda klik — di agent yang sudah Anda pakai.',
  },
  dashboard: {
    title: 'Hasilkan dashboard data dengan Open Design + Claude Code',
    description:
      'Jelaskan metrik yang Anda lacak dan biarkan coding agent membangun dashboard bergaya dan responsif — grafik, kartu KPI, dan tabel dirender ke HTML yang bisa Anda hosting di mana saja. Tanpa kursi alat BI, tanpa pembangun seret dan lepas.',
    breadcrumb: 'Dashboard',
    label: 'Kasus penggunaan · Dashboard',
    heading: 'Dashboard dari sebuah deskripsi, bukan pembangun seret dan lepas',
    lead: 'Beri tahu agent apa yang harus ditampilkan dan bagaimana seharusnya terasa. Open Design menyediakan pola grafik, sistem tata letak, dan bahasa visual sehingga Anda mendapatkan dashboard yang koheren dan layak presentasi — bukan tembok widget bergaya bawaan.',
    heroImageAlt:
      'Ilustrasi bergaya editorial tentang angka mentah di kiri yang mengalir menjadi dashboard rapi berisi grafik dan kartu KPI di kanan',
    tldrTitle: 'Dalam satu kalimat',
    tldrBody:
      'Open Design mengubah spesifikasi metrik Anda dalam bahasa biasa menjadi dashboard bergaya yang dirender agent ke HTML — diversikan di repo Anda, bisa dihosting di mana saja, tanpa langganan BI per kursi.',
    stepsTitle: 'Cara kerja dashboard dengan Open Design',
    steps: [
      {
        title: 'Jelaskan metriknya',
        body: 'Sebutkan apa yang penting — “pengguna aktif mingguan, pendapatan per paket, churn, dan tren 30 hari”. Agent memuat keterampilan dashboard sehingga tahu harus menata kartu KPI, grafik, dan tabel alih-alih satu blok teks.',
        imageAlt: 'Ilustrasi seseorang mendaftar metrik yang mereka pedulikan',
      },
      {
        title: 'Pilih pola grafiknya',
        body: 'Open Design menyertakan templat grafik dan tata letak, sehingga tren menjadi grafik garis, rincian menjadi batang, dan rasio menjadi visual yang tepat — tipografi dan jarak yang konsisten di seluruh bagian alih-alih bawaan yang tak serasi.',
        imageAlt: 'Ilustrasi beberapa jenis grafik yang ditata menjadi kisi yang koheren',
      },
      {
        title: 'Sambungkan data Anda',
        body: 'Arahkan dashboard ke sebuah CSV, endpoint JSON, atau tempel baris contoh. Ia dirender ke HTML mandiri yang diperbarui saat datanya berubah — buka di browser mana pun, taruh di hosting statis mana pun.',
        imageAlt: 'Ilustrasi sebuah berkas data tersambung ke dashboard yang diperbarui langsung',
      },
      {
        title: 'Sempurnakan dan rilis',
        body: 'Sesuaikan dengan berbicara kepada agent — “kelompokkan pendapatan menurut wilayah, pindahkan baris KPI ke atas”. Artefak hidup di proyek Anda, sehingga dashboard bisa ditinjau dan diversikan seperti kode lainnya.',
        imageAlt: 'Ilustrasi sebuah dashboard yang disempurnakan lalu di-deploy',
      },
    ],
    tableTitle: 'Dashboard dengan Open Design vs. cara lama',
    tableColCapability: 'Yang Anda butuhkan',
    tableColWithOd: 'Dengan Open Design',
    tableColWithout: 'Alat BI / dikode manual',
    tableRows: [
      {
        capability: 'Beranjak dari daftar metrik ke tata letak',
        withOd: 'Satu prompt; agent menata kartu, grafik, dan tabel',
        without: 'Seret widget satu per satu, atau tulis kode grafik dari nol',
      },
      {
        capability: 'Sistem visual yang konsisten',
        withOd: 'Pola grafik dan jarak dari sistem desain yang dapat dipakai ulang',
        without: 'Gaya widget bawaan, atau ditata manual per grafik',
      },
      {
        capability: 'Sambungkan data',
        withOd: 'CSV / JSON / baris yang ditempel, dirender ke HTML langsung',
        without: 'Konektor vendor atau pemipaan data khusus',
      },
      {
        capability: 'Hosting dan berbagi',
        withOd: 'HTML mandiri di hosting statis mana pun, tanpa akun',
        without: 'Penonton butuh kursi di vendor BI',
      },
      {
        capability: 'Tinjauan dan versi',
        withOd: 'Hidup di repo Anda; bisa di-diff seperti kode',
        without: 'Terkunci di dalam vendor, tanpa diff sungguhan',
      },
      {
        capability: 'Biaya dan keterkuncian vendor',
        withOd: 'Open source, pakai kunci Anda sendiri, berjalan lokal',
        without: 'Langganan per kursi, dihosting vendor',
      },
    ],
    featuresTitle: 'Apa yang bisa Anda bangun',
    features: [
      { title: "Analitik produk", body: "Pengguna aktif, funnel, retensi — metrik yang menjadi keseharian tim produk.", thumb: "example-dashboard" },
      { title: "Metrik repo dan dev", body: "Bintang, PR, kesehatan CI — dashboard rekayasa dari data Anda sendiri.", thumb: "example-github-dashboard" },
      { title: "Laporan keuangan", body: "Pendapatan, burn, runway ditata sebagai laporan yang bisa dibagikan.", thumb: "example-finance-report" },
      { title: "Operasi langsung", body: "Metrik real-time yang menyegar saat data dasarnya bergerak.", thumb: "example-live-dashboard" },
      { title: "Sosial dan pemasaran", body: "Kinerja kanal dan pelacakan kampanye dalam satu tampilan.", thumb: "example-social-media-dashboard" },
      { title: "Laporan bidang", body: "Laporan terstruktur untuk bidang apa pun — dari klinis hingga trading.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Dashboard yang dibangun orang dengan Open Design',
    galleryLead:
      'Dashboard nyata yang dirender dari sebuah prompt dan sumber data. Mulai dari yang dekat dengan milik Anda dan jelaskan metrik yang Anda lacak.',
    gallery: [
      { thumb: "example-data-report", caption: "Laporan data" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Dashboard operasi langsung" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Dashboard analisis trading" },
      { thumb: "example-frame-data-chart-nyt", caption: "Grafik data bergaya editorial" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Jelajahi templat dashboard',
    faqTitle: 'FAQ dashboard',
    faq: [
      {
        q: 'Apakah saya butuh alat BI seperti Tableau atau Looker?',
        a: 'Tidak. Open Design merender dashboard ke HTML di dalam coding agent Anda. Anda menjelaskan metrik dan mengarahkannya ke data Anda; tidak ada platform BI terpisah untuk dilisensikan atau dipelajari.',
      },
      {
        q: 'Dari mana datanya berasal?',
        a: 'Sebuah CSV, endpoint JSON, atau baris yang Anda tempel. Dashboard adalah HTML dan JavaScript murni, sehingga Anda mengendalikan persis dari mana ia membaca — tidak ada yang di-proxy lewat layanan terhosting.',
      },
      {
        q: 'Bisakah rekan non-teknis melihatnya?',
        a: 'Ya. Keluarannya adalah halaman web mandiri. Siapa pun dengan tautan atau berkas bisa membukanya di browser — tanpa akun, tanpa kursi.',
      },
      {
        q: 'Agent mana saja yang bisa saya pakai?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, dan belasan adapter resmi lainnya. Anda membawa kunci penyedia Anda sendiri.',
      },
    ],
    ctaTitle: 'Bangun dashboard Anda malam ini',
    ctaBody:
      'Beri bintang pada repo, pasang Open Design, dan ubah metrik Anda menjadi dashboard yang bisa Anda hosting di mana saja — di agent yang sudah Anda pakai.',
  },
  slides: {
    title: 'Hasilkan dek presentasi dengan Open Design + Claude Code',
    description:
      'Ubah sebuah kerangka menjadi dek slide yang dirancang dan sesuai merek tanpa membuka aplikasi presentasi. Open Design memberi coding agent Anda templat dek dan sistem visual, merender slide ke HTML yang bisa Anda presentasikan, ekspor, atau bagikan.',
    breadcrumb: 'Slide',
    label: 'Kasus penggunaan · Slide',
    heading: 'Dek yang terlihat dirancang, ditulis oleh sebuah prompt',
    lead: 'Serahkan kerangka dan nada kepada agent Anda. Open Design menerapkan templat dek dan sistem visual sehingga setiap slide tertata, terketik, dan sesuai merek — bukan daftar poin pada latar kosong.',
    heroImageAlt:
      'Ilustrasi bergaya editorial tentang sebuah kerangka di kiri yang berubah menjadi rangkaian slide presentasi yang dirancang di kanan',
    tldrTitle: 'Dalam satu kalimat',
    tldrBody:
      'Open Design mengubah kerangka menjadi dek HTML yang dirancang dan dirender agent dalam satu sesi — presentasikan di browser, ekspor ke PDF atau PPTX, dan simpan sumbernya di repo Anda.',
    stepsTitle: 'Cara kerja dek dengan Open Design',
    steps: [
      {
        title: 'Beri kerangkanya',
        body: 'Tempel poin pembicaraan Anda atau struktur kasar. Agent memuat keterampilan dek sehingga menghasilkan rangkaian slide yang tertata, bukan satu dokumen panjang.',
        imageAlt: 'Ilustrasi sebuah kerangka teks yang diserahkan kepada agent',
      },
      {
        title: 'Pilih gaya dek',
        body: 'Open Design menyertakan templat dek — editorial, Swiss-internasional, teknis gelap, dan lainnya. Agent menerapkan salah satunya sehingga tipografi, kisi, dan aksen tetap konsisten di setiap slide.',
        imageAlt: 'Ilustrasi beberapa pilihan gaya dek yang ditata berdampingan',
      },
      {
        title: 'Hasilkan slide-nya',
        body: 'Setiap poin menjadi slide yang dirancang dengan hierarki yang tepat — judul, visual pendukung, sorotan data. Ia dirender ke HTML, sehingga dipresentasikan layar penuh di browser mana pun.',
        imageAlt: 'Ilustrasi rangkaian slide jadi dengan gaya yang konsisten',
      },
      {
        title: 'Presentasikan, ekspor, iterasi',
        body: 'Presentasikan dari browser, atau ekspor ke PDF / PPTX untuk dibagikan. Sempurnakan dengan berbicara kepada agent — “rapatkan slide data, tambahkan ajakan bertindak penutup”. Sumber dek tetap di proyek Anda.',
        imageAlt: 'Ilustrasi sebuah dek yang dipresentasikan dan diekspor ke berbagai format',
      },
    ],
    tableTitle: 'Dek dengan Open Design vs. cara lama',
    tableColCapability: 'Yang Anda butuhkan',
    tableColWithOd: 'Dengan Open Design',
    tableColWithout: 'PowerPoint / Keynote / alat slide AI',
    tableRows: [
      {
        capability: 'Beranjak dari kerangka ke slide',
        withOd: 'Satu prompt; agent menata setiap slide',
        without: 'Bangun setiap slide manual, atau bergumul dengan templat',
      },
      {
        capability: 'Desain yang konsisten',
        withOd: 'Templat dek dengan kisi dan sistem tipe yang nyata',
        without: 'Tema yang melenceng, perataan manual, bawaan tak sesuai merek',
      },
      {
        capability: 'Data dan diagram',
        withOd: 'Grafik dan sorotan dirender sebagai bagian dari slide',
        without: 'Tempel gambar statis atau bangun ulang grafik tiap kali',
      },
      {
        capability: 'Format ekspor',
        withOd: 'HTML untuk presentasi, plus ekspor PDF / PPTX',
        without: 'Terkunci pada format satu aplikasi',
      },
      {
        capability: 'Tinjauan dan versi',
        withOd: 'Sumber hidup di repo Anda, bisa di-diff',
        without: 'Berkas biner, tanpa diff yang berarti',
      },
      {
        capability: 'Biaya dan keterkuncian vendor',
        withOd: 'Open source, pakai kunci Anda sendiri, berjalan lokal',
        without: 'Lisensi aplikasi atau add-on AI per kursi',
      },
    ],
    featuresTitle: 'Apa yang bisa Anda presentasikan',
    features: [
      { title: "Pitch deck", body: "Dek investor dan penjualan dengan narasi kuat dan slide data yang bersih.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Swiss / editorial", body: "Dek berbasis kisi dan tipografis yang terlihat diarahkan secara artistik.", thumb: "example-deck-swiss-international" },
      { title: "Modul kursus", body: "Dek pengajaran dengan langkah jelas, sorotan, dan tempo.", thumb: "example-html-ppt-course-module" },
      { title: "Dek grafik data", body: "Dek gelap berfokus grafik untuk analitik dan tinjauan.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Mode presenter", body: "Dek bergaya reveal yang dibangun untuk presentasi langsung di browser.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Cetak biru teknis", body: "Dek arsitektur dan pengetahuan yang memetakan sistem kompleks.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Dek yang dibangun orang dengan Open Design',
    galleryLead:
      'Dek nyata yang dirender dari sebuah kerangka. Pilih gaya yang dekat dengan presentasi Anda dan jelaskan kontennya.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Dek majalah editorial" },
      { thumb: "example-guizang-ppt", caption: "Keynote berilustrasi" },
      { thumb: "example-deck-open-slide-canvas", caption: "Dek open slide canvas" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Dek tema gradien" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Jelajahi templat dek',
    faqTitle: 'FAQ slide',
    faq: [
      {
        q: 'Apakah saya butuh PowerPoint atau Keynote?',
        a: 'Tidak. Open Design merender dek ke HTML di dalam coding agent Anda dan bisa mengekspor ke PDF atau PPTX. Anda presentasikan dari browser atau serahkan sebuah berkas — tanpa aplikasi presentasi untuk membangunnya.',
      },
      {
        q: 'Apakah ini hanya poin-poin yang dihasilkan AI?',
        a: 'Tidak. Agent menerapkan templat dek nyata dengan kisi, skala tipe, dan hierarki visual, sehingga slide terlihat dirancang alih-alih terisi otomatis.',
      },
      {
        q: 'Bisakah saya ekspor ke PowerPoint untuk klien?',
        a: 'Ya. Dek diekspor ke PPTX dan PDF selain HTML tempat Anda presentasi, sehingga cocok dengan apa pun yang diharapkan audiens.',
      },
      {
        q: 'Agent mana saja yang bisa saya pakai?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, dan lebih banyak adapter resmi, dengan kunci penyedia Anda sendiri.',
      },
    ],
    ctaTitle: 'Bangun dek Anda berikutnya malam ini',
    ctaBody:
      'Beri bintang pada repo, pasang Open Design, dan ubah kerangka Anda menjadi dek yang dirancang — di agent yang sudah Anda pakai.',
  },
  image: {
    title: 'Hasilkan grafik sesuai merek dengan Open Design + Claude Code',
    description:
      'Buat kartu sosial, sampul artikel, dan grafik pemasaran dari sebuah prompt — ditata dengan tipografi nyata dan sistem merek Anda, dirender ke HTML tajam yang bisa Anda ekspor ke PNG. Tanpa aplikasi desain, tanpa langganan templat.',
    breadcrumb: 'Gambar',
    label: 'Kasus penggunaan · Gambar',
    heading: 'Grafik sesuai merek, dihasilkan dan ditata untuk Anda',
    lead: 'Jelaskan kartu atau sampul yang Anda perlukan. Open Design menyusunnya dengan tipe, kisi, dan warna merek Anda yang nyata — lalu merender ke HTML yang bisa Anda ekspor sebagai gambar, alih-alih bergumul dengan aplikasi desain atau templat generik.',
    heroImageAlt:
      'Ilustrasi bergaya editorial tentang sebuah prompt yang berubah menjadi seperangkat kartu sosial dan sampul artikel yang ditata',
    tldrTitle: 'Dalam satu kalimat',
    tldrBody:
      'Open Design mengubah sebuah prompt menjadi grafik yang terketik dan sesuai merek yang dirender agent ke HTML dan diekspor ke PNG — bisa diulang, diversikan, dan bebas dari alat desain per kursi.',
    stepsTitle: 'Cara kerja grafik dengan Open Design',
    steps: [
      {
        title: 'Jelaskan grafiknya',
        body: 'Sebutkan apa itu — “kartu Twitter untuk peluncuran kami dengan judul dan sebuah kutipan”. Agent memuat keterampilan yang tepat sehingga menyusun grafik yang tertata, bukan blok teks biasa.',
        imageAlt: 'Ilustrasi seseorang menjelaskan kartu sosial yang mereka perlukan',
      },
      {
        title: 'Terapkan sistem merek',
        body: 'Open Design menarik warna, tipe, dan jarak Anda dari sistem desain yang dapat dipakai ulang, sehingga setiap kartu cocok dengan sisa merek Anda alih-alih terlihat seperti sekali pakai.',
        imageAlt: 'Ilustrasi warna merek dan tipe yang diterapkan pada tata letak kartu',
      },
      {
        title: 'Render dan ekspor',
        body: 'Grafik dirender ke HTML pada dimensi persis yang Anda butuhkan — kartu sosial, sampul, banner — lalu diekspor ke PNG. Teks tajam, tata letak nyata, tanpa penggeseran manual.',
        imageAlt: 'Ilustrasi sebuah grafik yang dirender dan diekspor ke berkas gambar',
      },
      {
        title: 'Pakai ulang resepnya',
        body: 'Karena ini sebuah templat, grafik berikutnya hanya berjarak satu prompt — ganti judul, pertahankan tata letak. Rangkaian kartu tetap konsisten sempurna.',
        imageAlt: 'Ilustrasi satu templat kartu yang menghasilkan rangkaian grafik yang konsisten',
      },
    ],
    tableTitle: 'Grafik dengan Open Design vs. cara lama',
    tableColCapability: 'Yang Anda butuhkan',
    tableColWithOd: 'Dengan Open Design',
    tableColWithout: 'Aplikasi desain / templat generik',
    tableRows: [
      {
        capability: 'Beranjak dari ide ke grafik yang ditata',
        withOd: 'Satu prompt; agent menyusun tipe dan tata letak',
        without: 'Buka aplikasi, tempatkan setiap elemen manual',
      },
      {
        capability: 'Tetap sesuai merek',
        withOd: 'Warna dan tipe dari sistem desain yang dapat dipakai ulang',
        without: 'Pilih ulang gaya merek per berkas, atau melenceng dari merek',
      },
      {
        capability: 'Rangkaian yang konsisten',
        withOd: 'Templat sama, salinan baru — set yang selaras sempurna',
        without: 'Selaraskan setiap varian secara manual',
      },
      {
        capability: 'Ekspor',
        withOd: 'HTML pada dimensi persis, diekspor ke PNG',
        without: 'Pengaturan ukuran kanvas dan ekspor manual',
      },
      {
        capability: 'Bisa diulang',
        withOd: 'Resep yang digerakkan prompt di repo Anda',
        without: 'Berkas sekali pakai yang Anda buat ulang tiap kali',
      },
      {
        capability: 'Biaya dan keterkuncian vendor',
        withOd: 'Open source, pakai kunci Anda sendiri, berjalan lokal',
        without: 'Alat desain per kursi atau marketplace templat',
      },
    ],
    featuresTitle: 'Apa yang bisa Anda buat',
    features: [
      { title: "Kartu sosial", body: "Kartu X / Twitter disusun dengan judul dan merek Anda.", thumb: "example-card-twitter" },
      { title: "Sampul artikel", body: "Sampul editorial bergaya majalah untuk posting dan newsletter.", thumb: "example-article-magazine" },
      { title: "Kartu Xiaohongshu", body: "Kartu bergaya RedNote yang disetel untuk feed tersebut.", thumb: "example-card-xiaohongshu" },
      { title: "Grafik hero", body: "Visual hero cair bergradien untuk situs dan peluncuran.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Korsel", body: "Korsel sosial multi-slide yang tetap konsisten antar bingkai.", thumb: "example-social-carousel" },
      { title: "Bingkai mockup UI", body: "Bingkai notifikasi dan perangkat untuk bercerita tentang produk.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Grafik yang dibangun orang dengan Open Design',
    galleryLead:
      'Kartu dan sampul nyata yang dirender dari sebuah prompt. Pilih satu yang dekat dengan kebutuhan Anda dan tukar dengan salinan Anda.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Kartu sosial pastel" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Poster editorial tiga nada" },
      { thumb: "example-magazine-poster", caption: "Poster bergaya majalah" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Sampul editorial yang tegas" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Jelajahi templat grafik',
    faqTitle: 'FAQ gambar',
    faq: [
      {
        q: 'Apakah ini generator gambar AI seperti Midjourney?',
        a: 'Tidak. Open Design menyusun grafik dengan tata letak dan tipografi nyata — judul Anda, merek Anda, dimensi persis — dan merender ke HTML yang Anda ekspor sebagai PNG. Ini komposisi desain, bukan pembuatan piksel.',
      },
      {
        q: 'Bisakah saya membuat rangkaian kartu yang konsisten?',
        a: 'Ya. Karena setiap grafik adalah templat, Anda mempertahankan tata letak dan mengganti salinan, sehingga seluruh rangkaian tetap selaras sempurna dan sesuai merek.',
      },
      {
        q: 'Ukuran apa saja yang bisa dihasilkannya?',
        a: 'Apa saja — grafik dirender pada dimensi persis yang Anda tentukan, dari kartu sosial persegi hingga banner lebar, lalu diekspor ke PNG.',
      },
      {
        q: 'Agent mana saja yang bisa saya pakai?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, dan lebih banyak adapter resmi, dengan kunci penyedia Anda sendiri.',
      },
    ],
    ctaTitle: 'Buat grafik Anda berikutnya malam ini',
    ctaBody:
      'Beri bintang pada repo, pasang Open Design, dan ubah sebuah prompt menjadi grafik sesuai merek — di agent yang sudah Anda pakai.',
  },
  video: {
    title: 'Hasilkan grafik gerak dan video pendek dengan Open Design + Claude Code',
    description:
      'Ubah sebuah naskah menjadi bingkai beranimasi dan video format pendek — kartu judul, latar bergerak, dan outro disusun dengan sistem merek Anda dan dirender dari HTML. Tanpa suite grafik gerak, tanpa menggeser linimasa.',
    breadcrumb: 'Video',
    label: 'Kasus penggunaan · Video',
    heading: 'Grafik gerak dari sebuah naskah, bukan dari linimasa',
    lead: 'Jelaskan momen yang Anda inginkan — sebuah penyingkapan judul, animasi data, outro logo. Open Design menyusun bingkai beranimasi dengan sistem merek Anda dan merendernya ke video, tanpa perlu suite grafik gerak.',
    heroImageAlt:
      'Ilustrasi bergaya editorial tentang sebuah naskah yang berubah menjadi rangkaian bingkai video beranimasi',
    tldrTitle: 'Dalam satu kalimat',
    tldrBody:
      'Open Design mengubah sebuah naskah menjadi bingkai beranimasi yang sesuai merek yang dirender agent ke video format pendek — disusun dari HTML, diversikan di repo Anda, tanpa editor linimasa untuk dipelajari.',
    stepsTitle: 'Cara kerja gerak dengan Open Design',
    steps: [
      {
        title: 'Jelaskan momennya',
        body: 'Sebutkan apa yang harus terjadi — “judul glitch yang berubah menjadi logo kami, lalu kartu penutup”. Agent memuat keterampilan gerak sehingga menghasilkan bingkai beranimasi, bukan gambar statis.',
        imageAlt: 'Ilustrasi seseorang menjelaskan sebuah rangkaian gerak',
      },
      {
        title: 'Terapkan gaya merek dan gerak',
        body: 'Open Design menyediakan templat bingkai — light leak sinematik, judul glitch, outro logo — dan menerapkan warna serta tipe Anda, sehingga geraknya terlihat disengaja dan sesuai merek.',
        imageAlt: 'Ilustrasi gaya merek yang diterapkan pada bingkai beranimasi',
      },
      {
        title: 'Render bingkainya ke video',
        body: 'Bingkai disusun dalam HTML dan dirender ke video, sehingga waktu dan tata letaknya presisi dan dapat diulang — tanpa penyetelan keyframe manual di linimasa.',
        imageAlt: 'Ilustrasi bingkai HTML yang dirender menjadi klip video',
      },
      {
        title: 'Iterasi dan ekspor',
        body: 'Sempurnakan dengan berbicara kepada agent — “perlambat penyingkapan judul, tambahkan teks”. Ekspor klip format pendek untuk sosial atau produk. Sumbernya tetap di proyek Anda.',
        imageAlt: 'Ilustrasi klip video yang disempurnakan dan diekspor untuk sosial',
      },
    ],
    tableTitle: 'Gerak dengan Open Design vs. cara lama',
    tableColCapability: 'Yang Anda butuhkan',
    tableColWithOd: 'Dengan Open Design',
    tableColWithout: 'After Effects / suite gerak',
    tableRows: [
      {
        capability: 'Beranjak dari naskah ke bingkai beranimasi',
        withOd: 'Satu prompt; agent menyusun rangkaiannya',
        without: 'Setel keyframe setiap elemen di linimasa secara manual',
      },
      {
        capability: 'Tetap sesuai merek',
        withOd: 'Templat bingkai + warna dan tipe Anda',
        without: 'Bangun ulang gaya merek per proyek',
      },
      {
        capability: 'Waktu presisi dan dapat diulang',
        withOd: 'Disusun dalam HTML, dirender secara deterministik',
        without: 'Penggeseran manual, sulit direproduksi',
      },
      {
        capability: 'Ekspor untuk sosial',
        withOd: 'Klip format pendek dirender ke video',
        without: 'Preset ekspor dan urusan kodek',
      },
      {
        capability: 'Tinjauan dan versi',
        withOd: 'Sumber bingkai hidup di repo Anda, bisa di-diff',
        without: 'Berkas proyek biner, tanpa diff sungguhan',
      },
      {
        capability: 'Biaya dan keterkuncian vendor',
        withOd: 'Open source, pakai kunci Anda sendiri, berjalan lokal',
        without: 'Suite mahal, kurva belajar curam',
      },
    ],
    featuresTitle: 'Apa yang bisa Anda animasikan',
    features: [
      { title: "Hyperframes", body: "Rangkaian gerak bingkai demi bingkai yang disusun dari HTML.", thumb: "example-video-hyperframes" },
      { title: "Format pendek sosial", body: "Klip vertikal yang dibangun untuk feed sosial.", thumb: "example-video-shortform" },
      { title: "Set bingkai gerak", body: "Bingkai beranimasi yang dapat dipakai ulang yang Anda susun menjadi klip.", thumb: "example-motion-frames" },
      { title: "Light leak sinematik", body: "Transisi sinematik dan latar atmosferik.", thumb: "example-frame-light-leak-cinema" },
      { title: "Judul glitch", body: "Penyingkapan judul dengan gerak dan tekstur.", thumb: "example-frame-glitch-title" },
      { title: "Outro logo", body: "Animasi penutup bermerek untuk klip apa pun.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Gerak yang dibangun orang dengan Open Design',
    galleryLead:
      'Bingkai dan klip beranimasi nyata yang dirender dari sebuah prompt. Pilih satu yang dekat dengan ide Anda dan jelaskan geraknya.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Rangkaian hyperframes" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Latar gerak cair" },
      { thumb: "example-frame-macos-notification", caption: "Bingkai UI beranimasi" },
      { thumb: "example-frame-data-chart-nyt", caption: "Grafik data beranimasi" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Jelajahi templat gerak',
    faqTitle: 'FAQ video',
    faq: [
      {
        q: 'Apakah saya butuh After Effects atau suite grafik gerak?',
        a: 'Tidak. Open Design menyusun bingkai beranimasi dalam HTML dan merendernya ke video di dalam coding agent Anda. Tidak ada editor linimasa untuk dipelajari atau dilisensikan.',
      },
      {
        q: 'Untuk jenis video apa ini cocok?',
        a: 'Gerak format pendek — kartu judul, animasi data, outro logo, klip sosial. Ia dibangun untuk gerak merek dan produk, bukan penyuntingan berdurasi panjang.',
      },
      {
        q: 'Apakah waktunya dapat direproduksi?',
        a: 'Ya. Karena bingkai disusun dalam kode dan dirender secara deterministik, Anda mendapatkan hasil yang sama setiap kali dan bisa menyetelnya dengan presisi lewat sebuah prompt.',
      },
      {
        q: 'Agent mana saja yang bisa saya pakai?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, dan lebih banyak adapter resmi, dengan kunci penyedia Anda sendiri.',
      },
    ],
    ctaTitle: 'Animasikan ide Anda berikutnya malam ini',
    ctaBody:
      'Beri bintang pada repo, pasang Open Design, dan ubah sebuah naskah menjadi gerak — di agent yang sudah Anda pakai.',
  },
  designSystem: {
    title: 'Bangun dan terapkan sistem desain dengan Open Design + Claude Code',
    description:
      'Tangkap merek Anda sebagai sistem desain yang dapat dipakai ulang yang diterapkan coding agent Anda ke setiap artefak — warna, tipe, komponen, dan nada dalam satu DESIGN.md. Definisikan sekali; setiap prototipe, dek, dan dashboard tetap sesuai merek.',
    breadcrumb: 'Sistem Desain',
    label: 'Kasus penggunaan · Sistem Desain',
    heading: 'Satu sistem desain, diterapkan ke semua yang dibuat agent Anda',
    lead: 'Definisikan merek Anda sekali dan Open Design membawanya ke setiap keluaran — prototipe, dek, dashboard, grafik. Sistem hidup di repo Anda sebagai DESIGN.md yang dibaca agent, sehingga konsistensi bersifat otomatis, bukan manual.',
    heroImageAlt:
      'Ilustrasi bergaya editorial tentang sebuah sistem desain tunggal yang memancar menjadi banyak artefak sesuai merek',
    tldrTitle: 'Dalam satu kalimat',
    tldrBody:
      'Open Design menangkap merek Anda sebagai sistem desain portabel yang diterapkan agent ke setiap artefak — didefinisikan sekali di repo Anda, ditegakkan di mana-mana, tanpa alat desain pusat yang menjaganya.',
    stepsTitle: 'Cara kerja sistem desain dengan Open Design',
    steps: [
      {
        title: 'Tangkap sistemnya',
        body: 'Jelaskan merek Anda — warna, tipe, jarak, suara — atau arahkan agent ke situs yang ada untuk mengekstraknya. Open Design menuliskannya ke dalam DESIGN.md yang hidup di proyek Anda.',
        imageAlt: 'Ilustrasi sebuah merek yang ditangkap ke dalam satu berkas sistem desain',
      },
      {
        title: 'Mulai dari basis yang terbukti',
        body: 'Open Design menyertakan 140+ sistem desain referensi — dari Apple dan Linear hingga editorial dan brutalis. Fork salah satu yang dekat dengan merek Anda alih-alih mulai dari halaman kosong.',
        imageAlt: 'Ilustrasi sebuah galeri sistem desain referensi yang sedang dijelajahi',
      },
      {
        title: 'Terapkan di mana-mana',
        body: 'Setiap keterampilan lain membaca sistem yang sama, sehingga prototipe, dek, dan dashboard semuanya berbagi satu bahasa visual — tanpa Anda menentukannya ulang setiap kali.',
        imageAlt: 'Ilustrasi satu sistem yang diterapkan secara konsisten di banyak jenis artefak',
      },
      {
        title: 'Kembangkan di satu tempat',
        body: 'Ubah sistem dan render berikutnya mencerminkannya di mana-mana. Karena ini berkas di repo Anda, keputusan desain ditinjau dan diversikan seperti kode.',
        imageAlt: 'Ilustrasi sebuah sistem desain yang diperbarui dan menyebar ke semua keluaran',
      },
    ],
    tableTitle: 'Sistem desain dengan Open Design vs. cara lama',
    tableColCapability: 'Yang Anda butuhkan',
    tableColWithOd: 'Dengan Open Design',
    tableColWithout: 'Pustaka alat desain / panduan gaya',
    tableRows: [
      {
        capability: 'Mendefinisikan sistem',
        withOd: 'DESIGN.md yang dibaca agent, di-fork dari 140+ referensi',
        without: 'Panduan gaya statis atau pustaka yang terikat alat',
      },
      {
        capability: 'Menerapkan lintas jenis artefak',
        withOd: 'Sistem sama memberi makan prototipe, dek, dashboard, grafik',
        without: 'Diimplementasikan ulang per alat dan per berkas',
      },
      {
        capability: 'Menjaga semuanya konsisten',
        withOd: 'Otomatis — setiap keterampilan membaca satu sumber',
        without: 'Disiplin manual; melenceng seiring waktu',
      },
      {
        capability: 'Mengembangkan merek',
        withOd: 'Sunting sekali; render berikutnya diperbarui di mana-mana',
        without: 'Cari dan ganti lintas berkas dan alat',
      },
      {
        capability: 'Tinjauan dan versi',
        withOd: 'Hidup di repo Anda, bisa di-diff seperti kode',
        without: 'Terkubur dalam alat desain, sulit diaudit',
      },
      {
        capability: 'Biaya dan keterkuncian vendor',
        withOd: 'Open source, portabel, berjalan lokal',
        without: 'Terkunci pada langganan alat desain',
      },
    ],
    featuresTitle: 'Sistem yang bisa Anda jadikan titik awal',
    features: [
      { title: "Apple", body: "Estetika bersih, terkendali, dengan font sistem.", thumb: "design-system-apple" },
      { title: "Linear", body: "Tampilan alat produk yang tajam dengan jarak rapat.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Lembut, mengutamakan dokumen, mudah didekati.", thumb: "design-system-notion" },
      { title: "Figma", body: "Playful, penuh warna, energi alat kreatif.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimal, netral, kelas riset.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Padat, teknis, native bagi developer.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Sistem desain di Open Design',
    galleryLead:
      'Beberapa dari 140+ sistem referensi yang bisa Anda fork sebagai titik awal. Pilih satu yang dekat dengan merek Anda dan sesuaikan.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Sistem bergaya Airbnb" },
      { thumb: "design-system-vercel", caption: "Sistem bergaya Vercel" },
      { thumb: "design-system-stripe", caption: "Sistem bergaya Stripe" },
      { thumb: "design-system-spotify", caption: "Sistem bergaya Spotify" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Jelajahi sistem desain',
    faqTitle: 'FAQ Sistem Desain',
    faq: [
      {
        q: 'Apa sebenarnya sistem desain di sini?',
        a: 'Sebuah berkas DESIGN.md di repo Anda yang menangkap warna, tipe, jarak, komponen, dan suara. Setiap keterampilan Open Design membacanya, sehingga merek Anda diterapkan otomatis ke apa pun yang dihasilkan agent.',
      },
      {
        q: 'Apakah saya harus mulai dari nol?',
        a: 'Tidak. Open Design menyertakan 140+ sistem desain referensi yang bisa Anda fork — dari Apple dan Linear hingga editorial dan brutalis — lalu sesuaikan dengan merek Anda.',
      },
      {
        q: 'Bagaimana ia tetap konsisten lintas dek, dashboard, dan prototipe?',
        a: 'Karena semua keterampilan itu membaca DESIGN.md yang sama. Definisikan sistem sekali dan konsistensi bersifat otomatis alih-alih sesuatu yang Anda awasi manual.',
      },
      {
        q: 'Agent mana saja yang bisa saya pakai?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, dan lebih banyak adapter resmi, dengan kunci penyedia Anda sendiri.',
      },
    ],
    ctaTitle: 'Definisikan sistem desain Anda malam ini',
    ctaBody:
      'Beri bintang pada repo, pasang Open Design, dan beri agent Anda satu merek untuk diterapkan di mana-mana — di agent yang sudah Anda pakai.',
  },
};

const NL: SolutionLocaleCopy = {
  prototype: {
    title: 'Bouw interactieve prototypes met Open Design + Claude Code',
    description:
      'Verander een prompt in een aanklikbaar prototype met meerdere schermen zonder je terminal te verlaten. Open Design geeft je coding agent de ontwerpvaardigheden, sjablonen en het designsysteem om echte prototypes te maken die je in een browser kunt openen.',
    breadcrumb: 'Prototype',
    label: 'Toepassing · Prototype',
    heading: 'Prototype zo snel als een prompt',
    lead: 'Beschrijf de flow die je voor ogen hebt en laat je agent een echt, aanklikbaar prototype samenstellen — meerdere schermen, gedeelde stijlen en live interacties — rechtstreeks gerenderd naar HTML die je kunt openen, delen en aan engineering kunt overdragen.',
    heroImageAlt:
      'Redactionele illustratie van een hand die een wireframe schetst die verandert in een aanklikbaar app-prototype met meerdere schermen',
    tldrTitle: 'In één zin',
    tldrBody:
      'Open Design is de ontwerplaag voor de coding agent die je al gebruikt. Voor prototyping betekent dat: van een idee van één alinea naar een navigeerbaar, gestileerd prototype in één sessie — geen ontwerptool, geen exportstap, geen overdrachtskloof.',
    stepsTitle: 'Hoe prototyping werkt met Open Design',
    steps: [
      {
        title: 'Beschrijf de flow',
        body: 'Vertel je agent in gewone taal wat je bouwt — “een onboardingflow met een welkomstscherm, een abonnementskiezer en een bevestiging.” Open Design laadt de prototypevaardigheid, zodat de agent weet dat hij schermen moet maken, niet één pagina.',
        imageAlt:
          'Illustratie van een persoon die een beschrijving van een app-flow in gewone taal in een terminal typt',
      },
      {
        title: 'Genereer gestileerde schermen',
        body: 'De agent past een designsysteem en prototypesjablonen uit Open Design toe, zodat elk scherm typografie, witruimte en componenten deelt in plaats van op een ruwe schets te lijken. Je krijgt een samenhangende set schermen, geen losse mockups.',
        imageAlt:
          'Illustratie van meerdere app-schermen die na elkaar verschijnen, allemaal met één consistente visuele stijl',
      },
      {
        title: 'Koppel de interacties',
        body: 'Knoppen navigeren, tabs wisselen, modals openen. Het prototype rendert naar zelfstandige HTML, dus het gedraagt zich als het echte ding in elke browser — er is geen account voor een prototypingtool nodig om het te bekijken.',
        imageAlt:
          'Illustratie van een cursor die door gekoppelde schermen klikt, met pijlen die de navigatie ertussen tonen',
      },
      {
        title: 'Itereer en draag over',
        body: 'Verfijn door met de agent te praten — “maak van de abonnementskiezer een indeling met drie kolommen.” Omdat het artefact in je project leeft, delen het ontwerp en de uiteindelijke code één bron van waarheid, waarmee de gebruikelijke overdrachtskloof tussen ontwerper en engineer wordt gedicht.',
        imageAlt:
          'Illustratie van een prototype dat wordt herzien en daarna aan een engineer wordt overgedragen, waarbij ontwerp en code samensmelten tot één bestand',
      },
    ],
    tableTitle: 'Prototyping met Open Design versus de oude manier',
    tableColCapability: 'Wat je nodig hebt',
    tableColWithOd: 'Met Open Design',
    tableColWithout: 'Traditionele prototypingtools',
    tableRows: [
      {
        capability: 'Van idee naar eerste scherm',
        withOd: 'Eén prompt in de agent die je al open hebt',
        without: 'Open een aparte tool, begin een bestand, sleep vakken met de hand',
      },
      {
        capability: 'Meerdere gekoppelde schermen',
        withOd: 'Gegenereerd als set met gedeelde stijlen en werkende navigatie',
        without: 'Elk frame handmatig getekend en gekoppeld',
      },
      {
        capability: 'Consistent visueel systeem',
        withOd: 'Geput uit een herbruikbaar designsysteem dat de agent toepast',
        without: 'Per bestand opnieuw gemaakt of met de hand onderhouden',
      },
      {
        capability: 'Deelbaar resultaat',
        withOd: 'Zelfstandige HTML — opent in elke browser, geen account',
        without: 'De kijker heeft een seat of een deellink in de tool van de leverancier nodig',
      },
      {
        capability: 'Pad naar echte code',
        withOd: 'Artefact leeft in je repo; ontwerp en code delen één bron',
        without: 'Vanaf nul opnieuw gebouwd na een aparte overdracht',
      },
      {
        capability: 'Kosten en lock-in',
        withOd: 'Open source, gebruik je eigen sleutels, draait lokaal',
        without: 'Abonnement per seat, gehost door leverancier, beperkte export',
      },
    ],
    featuresTitle: 'Wat je kunt prototypen',
    features: [
      {
        title: 'Web-apps met meerdere schermen',
        body: 'Volledige flows met gedeelde navigatie — onboarding, dashboards, instellingen — geen losse pagina’s.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Mobiele app-flows',
        body: 'Mobiele trajecten scherm voor scherm met overgangen en toestanden die native aanvoelen.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Landingspagina’s',
        body: 'Marketingpagina’s en SaaS-landingspagina’s die je kunt doorklikken en uitbrengen.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Elke visuele smaak',
        body: 'Redactioneel, zacht of brutalistisch — het prototype draagt een samenhangende stijl van begin tot eind.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Wachtlijst en prijzen',
        body: 'Conversievlakken — wachtlijsten, prijstabellen — gekoppeld en in lijn met het merk.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Gamified en speels',
        body: 'Interactierijke concepten waarbij beweging en toestand deel uitmaken van de pitch.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Prototypes die mensen bouwden met Open Design',
    galleryLead:
      'Elk van deze begon als een prompt en renderde naar een aanklikbaar artefact. Kies een sjabloon dicht bij je idee, beschrijf je variant, en de agent past het aan.',
    gallery: [
      { thumb: "example-dating-web", caption: "Dating-web-app — flow met meerdere schermen" },
      { thumb: "example-hr-onboarding", caption: "HR-onboardingflow" },
      { thumb: "example-kami-landing", caption: "Productlandingspagina" },
      { thumb: "example-web-prototype-taste-soft", caption: "Web-prototype in zachte stijl" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Blader door prototypesjablonen',
    faqTitle: 'Veelgestelde vragen over prototyping',
    faq: [
      {
        q: 'Heb ik een ontwerptool als Figma nodig om te prototypen met Open Design?',
        a: 'Nee. Open Design draait binnen je coding agent en rendert prototypes naar HTML. Je beschrijft de flow in taal; de agent maakt de schermen. Er is geen aparte canvastool om te leren of voor te betalen.',
      },
      {
        q: 'Zijn de prototypes interactief of zijn het slechts statische mockups?',
        a: 'Interactief. Navigatie, tabs en modals werken omdat de uitvoer echte HTML en CSS is. Je kunt er in elke browser doorheen klikken, precies zoals een gebruiker zou doen.',
      },
      {
        q: 'Welke agents kan ik gebruiken?',
        a: 'Open Design werkt met Claude Code, Codex, Cursor Agent, Gemini CLI en een tiental andere eigen adapters. Je gebruikt je eigen providersleutels; er wordt niets voor je gehost.',
      },
      {
        q: 'Kan een prototype het echte product worden?',
        a: 'Dat is juist de bedoeling. Het artefact leeft in je project, dus hetzelfde designsysteem en dezelfde componenten gaan mee de productiecode in in plaats van na een overdracht weggegooid te worden.',
      },
    ],
    ctaTitle: 'Prototype je volgende idee vanavond nog',
    ctaBody:
      'Geef de repo een ster, installeer Open Design en verander je volgende “wat als” in iets dat je kunt aanklikken — in de agent die je al gebruikt.',
  },
  dashboard: {
    title: 'Genereer datadashboards met Open Design + Claude Code',
    description:
      'Beschrijf de metrics die je bijhoudt en laat je coding agent een gestileerd, responsief dashboard bouwen — grafieken, KPI-kaarten en tabellen gerenderd naar HTML die je overal kunt hosten. Geen seat in een BI-tool, geen sleep-en-neerzetbouwer.',
    breadcrumb: 'Dashboard',
    label: 'Toepassing · Dashboard',
    heading: 'Dashboards uit een beschrijving, niet uit een sleep-en-neerzetbouwer',
    lead: 'Vertel je agent wat hij moet tonen en hoe het moet aanvoelen. Open Design levert de grafiekpatronen, het indelingssysteem en de visuele taal, zodat je een samenhangend, presentabel dashboard krijgt — geen muur van standaard gestileerde widgets.',
    heroImageAlt:
      'Redactionele illustratie van ruwe cijfers links die overvloeien in een strak dashboard met grafieken en KPI-kaarten rechts',
    tldrTitle: 'In één zin',
    tldrBody:
      'Open Design verandert een specificatie van je metrics in gewone taal in een gestileerd dashboard dat je agent naar HTML rendert — geversioneerd in je repo, overal te hosten, zonder BI-abonnement per seat.',
    stepsTitle: 'Hoe dashboards werken met Open Design',
    steps: [
      {
        title: 'Beschrijf de metrics',
        body: 'Som op wat ertoe doet — “wekelijks actieve gebruikers, omzet per abonnement, churn en een trend over 30 dagen.” De agent laadt de dashboardvaardigheid, zodat hij KPI-kaarten, grafieken en een tabel indeelt in plaats van één tekstblok.',
        imageAlt: 'Illustratie van een persoon die de metrics opsomt waar hij om geeft',
      },
      {
        title: 'Kies de grafiekpatronen',
        body: 'Open Design levert grafiek- en indelingssjablonen, zodat trends lijngrafieken worden, uitsplitsingen staven en verhoudingen het juiste beeld — consistente typografie en witruimte overal in plaats van niet-passende standaarden.',
        imageAlt: 'Illustratie van meerdere grafiektypes geordend in een samenhangend raster',
      },
      {
        title: 'Koppel je data',
        body: 'Wijs het dashboard naar een CSV, een JSON-endpoint, of plak voorbeeldrijen. Het rendert naar zelfstandige HTML die bijwerkt wanneer de data verandert — open het in elke browser, zet het op elke statische host.',
        imageAlt: 'Illustratie van een databestand dat verbinding maakt met een live bijwerkend dashboard',
      },
      {
        title: 'Verfijn en lever op',
        body: 'Pas aan door met de agent te praten — “groepeer de omzet per regio, zet de KPI-rij bovenaan.” Het artefact leeft in je project, dus het dashboard is te beoordelen en te versioneren als elke andere code.',
        imageAlt: 'Illustratie van een dashboard dat wordt verfijnd en daarna uitgerold',
      },
    ],
    tableTitle: 'Dashboards met Open Design versus de oude manier',
    tableColCapability: 'Wat je nodig hebt',
    tableColWithOd: 'Met Open Design',
    tableColWithout: 'BI-tools / met de hand gecodeerd',
    tableRows: [
      {
        capability: 'Van metriclijst naar indeling',
        withOd: 'Eén prompt; de agent deelt kaarten, grafieken en tabellen in',
        without: 'Sleep widgets stuk voor stuk, of schrijf grafiekcode vanaf nul',
      },
      {
        capability: 'Consistent visueel systeem',
        withOd: 'Grafiekpatronen en witruimte uit een herbruikbaar designsysteem',
        without: 'Standaard widgetstijlen, of per grafiek met de hand gestileerd',
      },
      {
        capability: 'Data koppelen',
        withOd: 'CSV / JSON / geplakte rijen, gerenderd naar live HTML',
        without: 'Leverancierconnectors of maatwerk dataleidingen',
      },
      {
        capability: 'Hosten en delen',
        withOd: 'Zelfstandige HTML op elke statische host, geen account',
        without: 'De kijker heeft een seat bij de BI-leverancier nodig',
      },
      {
        capability: 'Beoordeling en versiebeheer',
        withOd: 'Leeft in je repo; te diffen als code',
        without: 'Opgesloten bij de leverancier, geen echte diff',
      },
      {
        capability: 'Kosten en lock-in',
        withOd: 'Open source, gebruik je eigen sleutels, draait lokaal',
        without: 'Abonnement per seat, gehost door leverancier',
      },
    ],
    featuresTitle: 'Wat je kunt bouwen',
    features: [
      { title: "Productanalyse", body: "Actieve gebruikers, funnels, retentie — de metrics waar een productteam in leeft.", thumb: "example-dashboard" },
      { title: "Repo- en dev-metrics", body: "Sterren, PR’s, CI-gezondheid — engineeringdashboards uit je eigen data.", thumb: "example-github-dashboard" },
      { title: "Financiële rapporten", body: "Omzet, burn, runway uitgewerkt als een deelbaar rapport.", thumb: "example-finance-report" },
      { title: "Live operations", body: "Realtime metrics die verversen wanneer de onderliggende data beweegt.", thumb: "example-live-dashboard" },
      { title: "Social en marketing", body: "Kanaalprestaties en campagnetracking in één overzicht.", thumb: "example-social-media-dashboard" },
      { title: "Domeinrapporten", body: "Gestructureerde rapporten voor elk vakgebied — van klinisch tot trading.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Dashboards die mensen bouwden met Open Design',
    galleryLead:
      'Echte dashboards gerenderd uit een prompt en een databron. Begin met een die dicht bij die van jou ligt en beschrijf de metrics die je bijhoudt.',
    gallery: [
      { thumb: "example-data-report", caption: "Datarapport" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Live ops-dashboard" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Trading-analysedashboard" },
      { thumb: "example-frame-data-chart-nyt", caption: "Redactionele datagrafiek" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Blader door dashboardsjablonen',
    faqTitle: 'Veelgestelde vragen over dashboards',
    faq: [
      {
        q: 'Heb ik een BI-tool als Tableau of Looker nodig?',
        a: 'Nee. Open Design rendert dashboards naar HTML binnen je coding agent. Je beschrijft de metrics en wijst hem naar je data; er is geen apart BI-platform om te licentiëren of te leren.',
      },
      {
        q: 'Waar komt de data vandaan?',
        a: 'Een CSV, een JSON-endpoint, of rijen die je inplakt. Het dashboard is pure HTML en JavaScript, dus jij bepaalt precies waar het uit leest — niets wordt via een gehoste dienst doorgesluisd.',
      },
      {
        q: 'Kunnen niet-technische teamgenoten het bekijken?',
        a: 'Ja. De uitvoer is een zelfstandige webpagina. Iedereen met de link of het bestand kan het in een browser openen — geen account, geen seat.',
      },
      {
        q: 'Welke agents kan ik gebruiken?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI en een tiental andere eigen adapters. Je gebruikt je eigen providersleutels.',
      },
    ],
    ctaTitle: 'Bouw je dashboard vanavond nog',
    ctaBody:
      'Geef de repo een ster, installeer Open Design en verander je metrics in een dashboard dat je overal kunt hosten — in de agent die je al gebruikt.',
  },
  slides: {
    title: 'Genereer presentatiedecks met Open Design + Claude Code',
    description:
      'Verander een outline in een ontworpen, on-brand slidedeck zonder een presentatie-app te openen. Open Design geeft je coding agent decksjablonen en een visueel systeem, en rendert slides naar HTML die je kunt presenteren, exporteren of delen.',
    breadcrumb: 'Slides',
    label: 'Toepassing · Slides',
    heading: 'Decks die ontworpen ogen, geschreven door een prompt',
    lead: 'Geef je agent een outline en een toon. Open Design past een decksjabloon en visueel systeem toe, zodat elke slide opgemaakt, gezet en on-brand is — geen opsomming op een lege achtergrond.',
    heroImageAlt:
      'Redactionele illustratie van een outline links die verandert in een reeks ontworpen presentatieslides rechts',
    tldrTitle: 'In één zin',
    tldrBody:
      'Open Design verandert een outline in een ontworpen HTML-deck dat je agent in één sessie rendert — presenteer het in de browser, exporteer naar PDF of PPTX, en houd de bron in je repo.',
    stepsTitle: 'Hoe decks werken met Open Design',
    steps: [
      {
        title: 'Geef de outline',
        body: 'Plak je gesprekspunten of een ruwe structuur. De agent laadt de deckvaardigheid, zodat hij een reeks opgemaakte slides maakt, niet één lang document.',
        imageAlt: 'Illustratie van een tekstoutline die aan een agent wordt overhandigd',
      },
      {
        title: 'Kies een deckstijl',
        body: 'Open Design levert decksjablonen — redactioneel, Zwitsers-internationaal, donker technisch en meer. De agent past er één toe, zodat typografie, raster en accenten over elke slide consistent blijven.',
        imageAlt: 'Illustratie van meerdere deckstijlopties naast elkaar gelegd',
      },
      {
        title: 'Genereer de slides',
        body: 'Elk punt wordt een ontworpen slide met de juiste hiërarchie — titels, ondersteunende beelden, datahighlights. Het rendert naar HTML, dus het presenteert schermvullend in elke browser.',
        imageAlt: 'Illustratie van een reeks afgeronde slides met consistente styling',
      },
      {
        title: 'Presenteer, exporteer, itereer',
        body: 'Presenteer vanuit de browser, of exporteer naar PDF / PPTX om te delen. Verfijn door met de agent te praten — “strakker de dataslide, voeg een afsluitende call to action toe.” De deckbron blijft in je project.',
        imageAlt: 'Illustratie van een deck dat wordt gepresenteerd en geëxporteerd naar meerdere formaten',
      },
    ],
    tableTitle: 'Decks met Open Design versus de oude manier',
    tableColCapability: 'Wat je nodig hebt',
    tableColWithOd: 'Met Open Design',
    tableColWithout: 'PowerPoint / Keynote / AI-slidetools',
    tableRows: [
      {
        capability: 'Van outline naar slides',
        withOd: 'Eén prompt; de agent deelt elke slide in',
        without: 'Bouw elke slide met de hand, of worstel met een sjabloon',
      },
      {
        capability: 'Consistent ontwerp',
        withOd: 'Decksjablonen met een echt raster en typesysteem',
        without: 'Thema-afwijking, handmatige uitlijning, off-brand standaarden',
      },
      {
        capability: 'Data en diagrammen',
        withOd: 'Grafieken en highlights gerenderd als onderdeel van de slide',
        without: 'Plak statische afbeeldingen of bouw grafieken telkens opnieuw',
      },
      {
        capability: 'Exportformaten',
        withOd: 'HTML om te presenteren, plus export naar PDF / PPTX',
        without: 'Vastgezet op het formaat van één app',
      },
      {
        capability: 'Beoordeling en versiebeheer',
        withOd: 'Bron leeft in je repo, te diffen',
        without: 'Binair bestand, geen betekenisvolle diff',
      },
      {
        capability: 'Kosten en lock-in',
        withOd: 'Open source, gebruik je eigen sleutels, draait lokaal',
        without: 'App-licentie of AI-add-on per seat',
      },
    ],
    featuresTitle: 'Wat je kunt presenteren',
    features: [
      { title: "Pitchdecks", body: "Investeerders- en salesdecks met een sterk verhaal en strakke dataslides.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Zwitsers / redactioneel", body: "Rastergedreven, typografische decks die art-directed ogen.", thumb: "example-deck-swiss-international" },
      { title: "Cursusmodules", body: "Lesdecks met heldere stappen, highlights en tempo.", thumb: "example-html-ppt-course-module" },
      { title: "Datagrafiekdecks", body: "Donkere, grafiekgerichte decks voor analyse en reviews.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Presentatormodus", body: "Decks in reveal-stijl gebouwd om live in de browser te presenteren.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Technische blauwdrukken", body: "Architectuur- en kennisdecks die complexe systemen in kaart brengen.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Decks die mensen bouwden met Open Design',
    galleryLead:
      'Echte decks gerenderd uit een outline. Kies een stijl dicht bij je presentatie en beschrijf de inhoud.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Redactioneel magazinedeck" },
      { thumb: "example-guizang-ppt", caption: "Geïllustreerde keynote" },
      { thumb: "example-deck-open-slide-canvas", caption: "Open slide canvas-deck" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Deck met gradiëntthema" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Blader door decksjablonen',
    faqTitle: 'Veelgestelde vragen over slides',
    faq: [
      {
        q: 'Heb ik PowerPoint of Keynote nodig?',
        a: 'Nee. Open Design rendert decks naar HTML binnen je coding agent en kan exporteren naar PDF of PPTX. Je presenteert vanuit de browser of draagt een bestand over — er is geen presentatie-app nodig om het te bouwen.',
      },
      {
        q: 'Zijn dit gewoon door AI gegenereerde opsommingen?',
        a: 'Nee. De agent past een echt decksjabloon toe met een raster, typeschaal en visuele hiërarchie, zodat slides ontworpen ogen in plaats van automatisch ingevuld.',
      },
      {
        q: 'Kan ik naar PowerPoint exporteren voor een klant?',
        a: 'Ja. Decks exporteren naar PPTX en PDF naast de HTML waarvanuit je presenteert, zodat ze passen bij wat het publiek verwacht.',
      },
      {
        q: 'Welke agents kan ik gebruiken?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI en meer eigen adapters, met je eigen providersleutels.',
      },
    ],
    ctaTitle: 'Bouw je volgende deck vanavond nog',
    ctaBody:
      'Geef de repo een ster, installeer Open Design en verander je outline in een ontworpen deck — in de agent die je al gebruikt.',
  },
  image: {
    title: 'Genereer on-brand graphics met Open Design + Claude Code',
    description:
      'Maak socialkaarten, artikelomslagen en marketinggraphics uit een prompt — opgemaakt met echte typografie en jouw merksysteem, gerenderd naar scherpe HTML die je naar PNG kunt exporteren. Geen ontwerp-app, geen sjabloonabonnement.',
    breadcrumb: 'Afbeelding',
    label: 'Toepassing · Afbeelding',
    heading: 'On-brand graphics, voor je gegenereerd en opgemaakt',
    lead: 'Beschrijf de kaart of omslag die je nodig hebt. Open Design stelt hem samen met echte typografie, raster en jouw merkkleuren — en rendert vervolgens naar HTML die je als afbeelding kunt exporteren, in plaats van te worstelen met een ontwerp-app of een generiek sjabloon.',
    heroImageAlt:
      'Redactionele illustratie van een prompt die verandert in een set opgemaakte socialkaarten en artikelomslagen',
    tldrTitle: 'In één zin',
    tldrBody:
      'Open Design verandert een prompt in een gezette, on-brand graphic die je agent naar HTML rendert en naar PNG exporteert — herhaalbaar, geversioneerd en vrij van ontwerptools per seat.',
    stepsTitle: 'Hoe graphics werken met Open Design',
    steps: [
      {
        title: 'Beschrijf de graphic',
        body: 'Zeg wat het is — “een Twitter-kaart voor onze launch met de kop en een quote.” De agent laadt de juiste vaardigheid, zodat hij een opgemaakte graphic samenstelt, geen kale tekstblok.',
        imageAlt: 'Illustratie van een persoon die een socialkaart beschrijft die hij nodig heeft',
      },
      {
        title: 'Pas het merksysteem toe',
        body: 'Open Design haalt je kleuren, typografie en witruimte uit een herbruikbaar designsysteem, zodat elke kaart bij de rest van je merk past in plaats van eenmalig te ogen.',
        imageAlt: 'Illustratie van merkkleuren en typografie die op een kaartindeling worden toegepast',
      },
      {
        title: 'Render en exporteer',
        body: 'De graphic rendert naar HTML in precies de afmetingen die je nodig hebt — socialkaart, omslag, banner — en exporteert vervolgens naar PNG. Scherpe tekst, echte opmaak, geen handmatig schuiven.',
        imageAlt: 'Illustratie van een graphic die rendert en exporteert naar een afbeeldingsbestand',
      },
      {
        title: 'Hergebruik het recept',
        body: 'Omdat het een sjabloon is, is de volgende graphic één prompt verderop — verander de kop, behoud de opmaak. Reeksen kaarten blijven perfect consistent.',
        imageAlt: 'Illustratie van één kaartsjabloon dat een consistente reeks graphics produceert',
      },
    ],
    tableTitle: 'Graphics met Open Design versus de oude manier',
    tableColCapability: 'Wat je nodig hebt',
    tableColWithOd: 'Met Open Design',
    tableColWithout: 'Ontwerp-apps / generieke sjablonen',
    tableRows: [
      {
        capability: 'Van idee naar opgemaakte graphic',
        withOd: 'Eén prompt; de agent stelt typografie en opmaak samen',
        without: 'Open een app, plaats elk element met de hand',
      },
      {
        capability: 'On-brand blijven',
        withOd: 'Kleuren en typografie uit een herbruikbaar designsysteem',
        without: 'Per bestand merkstijlen opnieuw kiezen, of off-brand afdwalen',
      },
      {
        capability: 'Consistente reeks',
        withOd: 'Zelfde sjabloon, nieuwe tekst — perfect uitgelijnde set',
        without: 'Elke variant met de hand uitlijnen',
      },
      {
        capability: 'Export',
        withOd: 'HTML in exacte afmetingen, geëxporteerd naar PNG',
        without: 'Handmatige canvasgrootte en exportinstellingen',
      },
      {
        capability: 'Herhaalbaar',
        withOd: 'Een door prompts gestuurd recept in je repo',
        without: 'Een eenmalig bestand dat je telkens opnieuw maakt',
      },
      {
        capability: 'Kosten en lock-in',
        withOd: 'Open source, gebruik je eigen sleutels, draait lokaal',
        without: 'Ontwerptool per seat of sjabloonmarktplaats',
      },
    ],
    featuresTitle: 'Wat je kunt maken',
    features: [
      { title: "Socialkaarten", body: "X / Twitter-kaarten samengesteld met jouw kop en merk.", thumb: "example-card-twitter" },
      { title: "Artikelomslagen", body: "Redactionele, magazineachtige omslagen voor posts en nieuwsbrieven.", thumb: "example-article-magazine" },
      { title: "Xiaohongshu-kaarten", body: "Kaarten in RedNote-stijl afgestemd op die feed.", thumb: "example-card-xiaohongshu" },
      { title: "Hero-graphics", body: "Vloeiende, gradiënt hero-beelden voor sites en launches.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Carrousels", body: "Socialcarrousels met meerdere slides die consistent blijven over frames.", thumb: "example-social-carousel" },
      { title: "UI-mockupframes", body: "Notificatie- en apparaatframes om productverhalen te vertellen.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Graphics die mensen bouwden met Open Design',
    galleryLead:
      'Echte kaarten en omslagen gerenderd uit een prompt. Kies er een dicht bij wat je nodig hebt en wissel je tekst erin.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Pastel socialkaart" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Redactionele driekleurenposter" },
      { thumb: "example-magazine-poster", caption: "Poster in magazinestijl" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Gedurfde redactionele omslag" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Blader door graphicsjablonen',
    faqTitle: 'Veelgestelde vragen over afbeeldingen',
    faq: [
      {
        q: 'Is dit een AI-beeldgenerator zoals Midjourney?',
        a: 'Nee. Open Design stelt graphics samen met echte opmaak en typografie — jouw kop, jouw merk, exacte afmetingen — en rendert naar HTML die je als PNG exporteert. Het is ontwerpcompositie, geen pixelgeneratie.',
      },
      {
        q: 'Kan ik een consistente reeks kaarten maken?',
        a: 'Ja. Omdat elke graphic een sjabloon is, behoud je de opmaak en verander je de tekst, zodat een hele reeks perfect uitgelijnd en on-brand blijft.',
      },
      {
        q: 'Welke formaten kan het maken?',
        a: 'Elk formaat — de graphic rendert in precies de afmetingen die je opgeeft, van een vierkante socialkaart tot een brede banner, en exporteert vervolgens naar PNG.',
      },
      {
        q: 'Welke agents kan ik gebruiken?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI en meer eigen adapters, met je eigen providersleutels.',
      },
    ],
    ctaTitle: 'Maak je volgende graphic vanavond nog',
    ctaBody:
      'Geef de repo een ster, installeer Open Design en verander een prompt in een on-brand graphic — in de agent die je al gebruikt.',
  },
  video: {
    title: 'Genereer motion graphics en korte video met Open Design + Claude Code',
    description:
      'Verander een script in geanimeerde frames en korte video — titelkaarten, bewegende achtergronden en outro’s samengesteld met jouw merksysteem en gerenderd vanuit HTML. Geen motion-graphics-suite, geen tijdlijn-geschuif.',
    breadcrumb: 'Video',
    label: 'Toepassing · Video',
    heading: 'Motion graphics uit een script, niet uit een tijdlijn',
    lead: 'Beschrijf het moment dat je wilt — een titelonthulling, een data-animatie, een logo-outro. Open Design stelt geanimeerde frames samen met jouw merksysteem en rendert ze naar video, zonder dat er een motion-graphics-suite nodig is.',
    heroImageAlt:
      'Redactionele illustratie van een script dat verandert in een reeks geanimeerde videoframes',
    tldrTitle: 'In één zin',
    tldrBody:
      'Open Design verandert een script in geanimeerde, on-brand frames die je agent naar korte video rendert — samengesteld uit HTML, geversioneerd in je repo, zonder tijdlijneditor om te leren.',
    stepsTitle: 'Hoe motion werkt met Open Design',
    steps: [
      {
        title: 'Beschrijf het moment',
        body: 'Zeg wat er moet gebeuren — “een glitch-titel die oplost in ons logo, daarna een afsluitende kaart.” De agent laadt de motionvaardigheid, zodat hij geanimeerde frames maakt, geen statisch beeld.',
        imageAlt: 'Illustratie van een persoon die een motionreeks beschrijft',
      },
      {
        title: 'Pas de merk- en motionstijl toe',
        body: 'Open Design levert framesjablonen — cinematische light leaks, glitch-titels, logo-outro’s — en past jouw kleuren en typografie toe, zodat de beweging doelbewust en on-brand oogt.',
        imageAlt: 'Illustratie van merkstyling toegepast op geanimeerde frames',
      },
      {
        title: 'Render de frames naar video',
        body: 'Frames worden samengesteld in HTML en gerenderd naar video, zodat timing en opmaak precies en herhaalbaar zijn — geen handmatig keyframen op een tijdlijn.',
        imageAlt: 'Illustratie van HTML-frames die renderen tot een videoclip',
      },
      {
        title: 'Itereer en exporteer',
        body: 'Verfijn door met de agent te praten — “vertraag de titelonthulling, voeg een onderschrift toe.” Exporteer korte clips voor social of product. De bron blijft in je project.',
        imageAlt: 'Illustratie van een videoclip die wordt verfijnd en geëxporteerd voor social',
      },
    ],
    tableTitle: 'Motion met Open Design versus de oude manier',
    tableColCapability: 'Wat je nodig hebt',
    tableColWithOd: 'Met Open Design',
    tableColWithout: 'After Effects / motion-suites',
    tableRows: [
      {
        capability: 'Van script naar geanimeerde frames',
        withOd: 'Eén prompt; de agent stelt de reeks samen',
        without: 'Keyframe elk element met de hand op een tijdlijn',
      },
      {
        capability: 'On-brand blijven',
        withOd: 'Framesjablonen + jouw kleuren en typografie',
        without: 'Bouw merkstyling per project opnieuw',
      },
      {
        capability: 'Precieze, herhaalbare timing',
        withOd: 'Samengesteld in HTML, deterministisch gerenderd',
        without: 'Handmatig schuiven, lastig te reproduceren',
      },
      {
        capability: 'Export voor social',
        withOd: 'Korte clips gerenderd naar video',
        without: 'Exportpresets en codec-gedoe',
      },
      {
        capability: 'Beoordeling en versiebeheer',
        withOd: 'Framebron leeft in je repo, te diffen',
        without: 'Binair projectbestand, geen echte diff',
      },
      {
        capability: 'Kosten en lock-in',
        withOd: 'Open source, gebruik je eigen sleutels, draait lokaal',
        without: 'Dure suite, steile leercurve',
      },
    ],
    featuresTitle: 'Wat je kunt animeren',
    features: [
      { title: "Hyperframes", body: "Frame-voor-frame motionreeksen samengesteld uit HTML.", thumb: "example-video-hyperframes" },
      { title: "Korte social-vorm", body: "Verticale clips gebouwd voor socialfeeds.", thumb: "example-video-shortform" },
      { title: "Motion-framesets", body: "Herbruikbare geanimeerde frames die je samenstelt tot een clip.", thumb: "example-motion-frames" },
      { title: "Cinematische light leaks", body: "Filmische overgangen en sfeervolle achtergronden.", thumb: "example-frame-light-leak-cinema" },
      { title: "Glitch-titels", body: "Titelonthullingen met beweging en textuur.", thumb: "example-frame-glitch-title" },
      { title: "Logo-outro’s", body: "Merkgebonden afsluitende animaties voor elke clip.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Motion die mensen bouwden met Open Design',
    galleryLead:
      'Echte geanimeerde frames en clips gerenderd uit een prompt. Kies er een dicht bij je idee en beschrijf de beweging.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Hyperframes-reeks" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Vloeiende motionachtergrond" },
      { thumb: "example-frame-macos-notification", caption: "Geanimeerd UI-frame" },
      { thumb: "example-frame-data-chart-nyt", caption: "Geanimeerde datagrafiek" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Blader door motionsjablonen',
    faqTitle: 'Veelgestelde vragen over video',
    faq: [
      {
        q: 'Heb ik After Effects of een motion-graphics-suite nodig?',
        a: 'Nee. Open Design stelt geanimeerde frames samen in HTML en rendert ze naar video binnen je coding agent. Er is geen tijdlijneditor om te leren of te licentiëren.',
      },
      {
        q: 'Voor wat voor video is dit geschikt?',
        a: 'Korte motion — titelkaarten, data-animaties, logo-outro’s, socialclips. Het is gebouwd voor merk- en productmotion, niet voor montage van speelfilmlengte.',
      },
      {
        q: 'Is de timing reproduceerbaar?',
        a: 'Ja. Omdat frames in code worden samengesteld en deterministisch gerenderd, krijg je elke keer hetzelfde resultaat en kun je het nauwkeurig bijstellen met een prompt.',
      },
      {
        q: 'Welke agents kan ik gebruiken?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI en meer eigen adapters, met je eigen providersleutels.',
      },
    ],
    ctaTitle: 'Animeer je volgende idee vanavond nog',
    ctaBody:
      'Geef de repo een ster, installeer Open Design en verander een script in motion — in de agent die je al gebruikt.',
  },
  designSystem: {
    title: 'Bouw en pas een designsysteem toe met Open Design + Claude Code',
    description:
      'Vang je merk als een herbruikbaar designsysteem dat je coding agent toepast op elk artefact — kleuren, typografie, componenten en toon in één DESIGN.md. Definieer het één keer; elk prototype, deck en dashboard blijft on-brand.',
    breadcrumb: 'Designsysteem',
    label: 'Toepassing · Designsysteem',
    heading: 'Eén designsysteem, toegepast op alles wat je agent maakt',
    lead: 'Definieer je merk één keer en Open Design draagt het mee naar elke uitvoer — prototypes, decks, dashboards, graphics. Het systeem leeft in je repo als een DESIGN.md die de agent leest, zodat consistentie automatisch is, niet handmatig.',
    heroImageAlt:
      'Redactionele illustratie van één designsysteem dat uitstraalt naar vele on-brand artefacten',
    tldrTitle: 'In één zin',
    tldrBody:
      'Open Design vangt je merk als een draagbaar designsysteem dat je agent toepast op elk artefact — één keer gedefinieerd in je repo, overal afgedwongen, zonder een centrale ontwerptool die de poort bewaakt.',
    stepsTitle: 'Hoe designsystemen werken met Open Design',
    steps: [
      {
        title: 'Vang het systeem',
        body: 'Beschrijf je merk — kleuren, typografie, witruimte, stem — of wijs de agent naar een bestaande site om het te extraheren. Open Design schrijft het in een DESIGN.md die in je project leeft.',
        imageAlt: 'Illustratie van een merk dat wordt gevangen in één designsysteembestand',
      },
      {
        title: 'Begin vanuit een bewezen basis',
        body: 'Open Design levert 140+ referentiedesignsystemen — van Apple en Linear tot redactioneel en brutalistisch. Fork er een dicht bij je merk in plaats van te beginnen met een lege pagina.',
        imageAlt: 'Illustratie van een galerij referentiedesignsystemen die wordt doorgebladerd',
      },
      {
        title: 'Pas het overal toe',
        body: 'Elke andere vaardigheid leest hetzelfde systeem, zodat een prototype, een deck en een dashboard allemaal één visuele taal delen — zonder dat je het telkens opnieuw hoeft op te geven.',
        imageAlt: 'Illustratie van één systeem dat consistent wordt toegepast over vele artefacttypes',
      },
      {
        title: 'Evolueer het op één plek',
        body: 'Verander het systeem en de volgende render weerspiegelt het overal. Omdat het een bestand in je repo is, worden ontwerpbeslissingen beoordeeld en geversioneerd als code.',
        imageAlt: 'Illustratie van een designsysteem dat wordt bijgewerkt en zich verspreidt naar alle uitvoer',
      },
    ],
    tableTitle: 'Designsystemen met Open Design versus de oude manier',
    tableColCapability: 'Wat je nodig hebt',
    tableColWithOd: 'Met Open Design',
    tableColWithout: 'Bibliotheken van ontwerptools / stijlgidsen',
    tableRows: [
      {
        capability: 'Het systeem definiëren',
        withOd: 'Een DESIGN.md die de agent leest, geforkt uit 140+ referenties',
        without: 'Een statische stijlgids of een toolgebonden bibliotheek',
      },
      {
        capability: 'Toepassen over artefacttypes heen',
        withOd: 'Hetzelfde systeem voedt prototypes, decks, dashboards, graphics',
        without: 'Per tool en per bestand opnieuw geïmplementeerd',
      },
      {
        capability: 'Alles consistent houden',
        withOd: 'Automatisch — elke vaardigheid leest één bron',
        without: 'Handmatige discipline; wijkt af na verloop van tijd',
      },
      {
        capability: 'Het merk laten evolueren',
        withOd: 'Bewerk één keer; volgende render werkt overal bij',
        without: 'Zoeken en vervangen over bestanden en tools heen',
      },
      {
        capability: 'Beoordeling en versiebeheer',
        withOd: 'Leeft in je repo, te diffen als code',
        without: 'Verstopt in een ontwerptool, lastig te auditen',
      },
      {
        capability: 'Kosten en lock-in',
        withOd: 'Open source, draagbaar, draait lokaal',
        without: 'Vastgezet op een abonnement van een ontwerptool',
      },
    ],
    featuresTitle: 'Systemen waarmee je kunt beginnen',
    features: [
      { title: "Apple", body: "Strakke, ingetogen esthetiek met systeemlettertype.", thumb: "design-system-apple" },
      { title: "Linear", body: "Heldere producttool-look met krappe witruimte.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Zacht, documentgericht, toegankelijk.", thumb: "design-system-notion" },
      { title: "Figma", body: "Speels, kleurrijk, energie van een creatieve tool.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimaal, neutraal, op onderzoeksniveau.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Dicht, technisch, native voor ontwikkelaars.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Designsystemen in Open Design',
    galleryLead:
      'Een paar van de 140+ referentiesystemen die je als startpunt kunt forken. Kies er een dicht bij je merk en pas het aan.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Systeem in Airbnb-stijl" },
      { thumb: "design-system-vercel", caption: "Systeem in Vercel-stijl" },
      { thumb: "design-system-stripe", caption: "Systeem in Stripe-stijl" },
      { thumb: "design-system-spotify", caption: "Systeem in Spotify-stijl" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Blader door designsystemen',
    faqTitle: 'Veelgestelde vragen over designsystemen',
    faq: [
      {
        q: 'Wat is het designsysteem hier precies?',
        a: 'Een DESIGN.md-bestand in je repo dat kleuren, typografie, witruimte, componenten en stem vangt. Elke Open Design-vaardigheid leest het, zodat je merk automatisch wordt toegepast op alles wat de agent produceert.',
      },
      {
        q: 'Moet ik vanaf nul beginnen?',
        a: 'Nee. Open Design levert 140+ referentiedesignsystemen die je kunt forken — van Apple en Linear tot redactioneel en brutalistisch — en daarna aan je merk aanpassen.',
      },
      {
        q: 'Hoe blijft het consistent over decks, dashboards en prototypes?',
        a: 'Omdat al die vaardigheden dezelfde DESIGN.md lezen. Definieer het systeem één keer en consistentie is automatisch in plaats van iets wat je met de hand bewaakt.',
      },
      {
        q: 'Welke agents kan ik gebruiken?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI en meer eigen adapters, met je eigen providersleutels.',
      },
    ],
    ctaTitle: 'Definieer je designsysteem vanavond nog',
    ctaBody:
      'Geef de repo een ster, installeer Open Design en geef je agent één merk om overal toe te passen — in de agent die je al gebruikt.',
  },
};

const AR: SolutionLocaleCopy = {
  prototype: {
    title: 'أنشئ نماذج أولية تفاعلية باستخدام Open Design + Claude Code',
    description:
      'حوّل وصفًا نصيًا إلى نموذج أولي قابل للنقر ومتعدد الشاشات دون مغادرة الطرفية. يمنح Open Design وكيل البرمجة لديك مهارات التصميم والقوالب ونظام التصميم لإطلاق نماذج أولية حقيقية يمكنك فتحها في المتصفح.',
    breadcrumb: 'نموذج أولي',
    label: 'حالة استخدام · نموذج أولي',
    heading: 'صمّم نموذجًا أوليًا بسرعة الكتابة',
    lead: 'صِف التدفق الذي يدور في ذهنك ودع وكيلك يبني نموذجًا أوليًا حقيقيًا قابلاً للنقر — شاشات متعددة، أنماط مشتركة، وتفاعلات حية — يُعرض مباشرةً بصيغة HTML يمكنك فتحها ومشاركتها وتسليمها للهندسة.',
    heroImageAlt:
      'رسم تحريري ليد ترسم إطارًا سلكيًا يتحول إلى نموذج أولي تفاعلي متعدد الشاشات لتطبيق',
    tldrTitle: 'باختصار',
    tldrBody:
      'Open Design هو طبقة التصميم لوكيل البرمجة الذي تستخدمه بالفعل. بالنسبة للنماذج الأولية، يعني ذلك الانتقال من فكرة من فقرة واحدة إلى نموذج أولي قابل للتصفح ومنسّق في جلسة واحدة — دون أداة تصميم، دون خطوة تصدير، ودون فجوة تسليم.',
    stepsTitle: 'كيف تعمل النمذجة الأولية مع Open Design',
    steps: [
      {
        title: 'صِف التدفق',
        body: 'أخبر وكيلك بما تبنيه بلغة بسيطة — «تدفق تأهيل يضم شاشة ترحيب، ومنتقي خطة، وشاشة تأكيد». يحمّل Open Design مهارة النموذج الأولي ليعرف الوكيل أنه ينتج شاشات لا صفحة واحدة.',
        imageAlt:
          'رسم لشخص يكتب وصفًا بلغة بسيطة لتدفق تطبيق داخل الطرفية',
      },
      {
        title: 'ولّد شاشات منسّقة',
        body: 'يطبّق الوكيل نظام تصميم وقوالب نماذج أولية من Open Design، فتشترك كل شاشة في الخطوط والمسافات والمكونات بدلاً من أن تبدو كمسودة أولية. تحصل على مجموعة متماسكة من الشاشات، لا تصاميم وهمية منفصلة.',
        imageAlt:
          'رسم لعدة شاشات تطبيق تظهر تباعًا وكلها تشترك في أسلوب بصري واحد متسق',
      },
      {
        title: 'اربط التفاعلات',
        body: 'الأزرار تتنقل، والتبويبات تتبدّل، والنوافذ المنبثقة تُفتح. يُعرض النموذج الأولي بصيغة HTML مكتفية ذاتيًا، فيتصرف كالشيء الحقيقي في أي متصفح — دون الحاجة إلى حساب أداة نمذجة لمعاينته.',
        imageAlt:
          'رسم لمؤشر ينقر عبر شاشات مترابطة مع أسهم توضّح التنقل بينها',
      },
      {
        title: 'حسّن وسلّم',
        body: 'حسّن بالحديث إلى الوكيل — «اجعل منتقي الخطة تخطيطًا من ثلاثة أعمدة». ولأن الناتج يعيش داخل مشروعك، يتشارك التصميم والكود النهائي مصدر حقيقة واحدًا، فتُسدّ فجوة التسليم المعتادة بين المصمم والمهندس.',
        imageAlt:
          'رسم لنموذج أولي يُراجَع ثم يُمرَّر إلى مهندس، مع اندماج التصميم والكود في ملف واحد',
      },
    ],
    tableTitle: 'النمذجة الأولية مع Open Design مقابل الطريقة القديمة',
    tableColCapability: 'ما تحتاجه',
    tableColWithOd: 'مع Open Design',
    tableColWithout: 'أدوات النمذجة الأولية التقليدية',
    tableRows: [
      {
        capability: 'الانتقال من الفكرة إلى أول شاشة',
        withOd: 'وصف واحد داخل الوكيل المفتوح لديك أصلاً',
        without: 'فتح أداة منفصلة، بدء ملف، سحب المربعات يدويًا',
      },
      {
        capability: 'شاشات متعددة مترابطة',
        withOd: 'تُولَّد كمجموعة بأنماط مشتركة وتنقّل فعّال',
        without: 'رسم كل إطار وربطه يدويًا',
      },
      {
        capability: 'نظام بصري متسق',
        withOd: 'مستمد من نظام تصميم قابل لإعادة الاستخدام يطبّقه الوكيل',
        without: 'إعادة إنشائه لكل ملف أو صيانته يدويًا',
      },
      {
        capability: 'نتيجة قابلة للمشاركة',
        withOd: 'HTML مكتفٍ ذاتيًا — يُفتح في أي متصفح دون حساب',
        without: 'يحتاج المشاهد إلى مقعد أو رابط مشاركة في أداة المورّد',
      },
      {
        capability: 'مسار إلى كود حقيقي',
        withOd: 'الناتج يعيش في مستودعك؛ التصميم والكود من مصدر واحد',
        without: 'إعادة بناء من الصفر بعد تسليم منفصل',
      },
      {
        capability: 'التكلفة والاحتكار',
        withOd: 'مفتوح المصدر، أحضر مفاتيحك، يعمل محليًا',
        without: 'اشتراك لكل مقعد، مستضاف لدى المورّد، تصدير محدود',
      },
    ],
    featuresTitle: 'ما الذي يمكنك نمذجته',
    features: [
      {
        title: 'تطبيقات ويب متعددة الشاشات',
        body: 'تدفقات كاملة بتنقّل مشترك — تأهيل، لوحات معلومات، إعدادات — لا صفحات منفردة.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'تدفقات تطبيقات الجوال',
        body: 'رحلات جوال شاشة بشاشة بانتقالات وحالات تبدو أصيلة.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'صفحات هبوط',
        body: 'صفحات تسويقية وصفحات هبوط لمنتجات SaaS يمكنك تصفّحها بالنقر وإطلاقها.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'أي ذوق بصري',
        body: 'تحريري، ناعم، أو خشن — يحمل النموذج الأولي أسلوبًا متماسكًا من البداية إلى النهاية.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'قوائم انتظار وتسعير',
        body: 'صفحات تحويل — قوائم انتظار، جداول تسعير — موصولة ومتوافقة مع العلامة.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'مُلعّب ومرح',
        body: 'مفاهيم كثيفة التفاعل حيث تكون الحركة والحالة جزءًا من العرض.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'نماذج أولية أنشأها الناس باستخدام Open Design',
    galleryLead:
      'بدأ كل واحد من هذه بوصف نصي وعُرض كناتج قابل للنقر. اختر قالبًا قريبًا من فكرتك، وصِف تعديلك، فيكيّفه الوكيل لك.',
    gallery: [
      { thumb: "example-dating-web", caption: "تطبيق ويب للمواعدة — تدفق متعدد الشاشات" },
      { thumb: "example-hr-onboarding", caption: "تدفق تأهيل الموارد البشرية" },
      { thumb: "example-kami-landing", caption: "صفحة هبوط لمنتج" },
      { thumb: "example-web-prototype-taste-soft", caption: "نموذج ويب أولي بأسلوب ناعم" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'تصفّح قوالب النماذج الأولية',
    faqTitle: 'الأسئلة الشائعة حول النماذج الأولية',
    faq: [
      {
        q: 'هل أحتاج إلى أداة تصميم مثل Figma للنمذجة مع Open Design؟',
        a: 'لا. يعمل Open Design داخل وكيل البرمجة لديك ويعرض النماذج الأولية بصيغة HTML. تصف التدفق بالكلمات؛ ينتج الوكيل الشاشات. لا توجد أداة لوحة منفصلة لتتعلمها أو تدفع مقابلها.',
      },
      {
        q: 'هل النماذج الأولية تفاعلية أم مجرد تصاميم وهمية ثابتة؟',
        a: 'تفاعلية. التنقّل والتبويبات والنوافذ المنبثقة تعمل لأن المُخرَج هو HTML وCSS حقيقي. يمكنك تصفّحه بالنقر في أي متصفح تمامًا كما يفعل المستخدم.',
      },
      {
        q: 'أي الوكلاء يمكنني استخدامه؟',
        a: 'يعمل Open Design مع Claude Code وCodex وCursor Agent وGemini CLI وأكثر من اثني عشر مُحوِّلًا أصليًا. تحضر مفاتيح المزوّد الخاصة بك؛ لا شيء مستضاف نيابةً عنك.',
      },
      {
        q: 'هل يمكن أن يصبح النموذج الأولي المنتج الحقيقي؟',
        a: 'هذا هو المقصود. يعيش الناتج في مشروعك، فينتقل نظام التصميم والمكونات ذاتها إلى كود الإنتاج بدلاً من التخلص منها بعد التسليم.',
      },
    ],
    ctaTitle: 'حوّل فكرتك التالية إلى نموذج أولي الليلة',
    ctaBody:
      'ضع نجمة على المستودع، ثبّت Open Design، وحوّل «ماذا لو» التالية إلى شيء يمكنك النقر عليه — في الوكيل الذي تستخدمه بالفعل.',
  },
  dashboard: {
    title: 'ولّد لوحات بيانات باستخدام Open Design + Claude Code',
    description:
      'صِف المقاييس التي تتابعها ودع وكيل البرمجة يبني لوحة بيانات منسّقة ومتجاوبة — رسوم بيانية، وبطاقات مؤشرات أداء، وجداول تُعرض بصيغة HTML يمكنك استضافتها في أي مكان. دون مقعد في أداة BI، ودون أداة سحب وإفلات.',
    breadcrumb: 'لوحة بيانات',
    label: 'حالة استخدام · لوحة بيانات',
    heading: 'لوحات بيانات من وصف، لا من أداة سحب وإفلات',
    lead: 'أخبر وكيلك بما يُعرض وكيف ينبغي أن يبدو. يوفّر Open Design أنماط الرسوم البيانية ونظام التخطيط واللغة البصرية، فتحصل على لوحة بيانات متماسكة وجاهزة للعرض — لا جدار من الأدوات بأنماط افتراضية.',
    heroImageAlt:
      'رسم تحريري لأرقام خام على اليسار تتدفق إلى لوحة بيانات نظيفة من الرسوم البيانية وبطاقات مؤشرات الأداء على اليمين',
    tldrTitle: 'باختصار',
    tldrBody:
      'يحوّل Open Design مواصفات مقاييسك بلغة بسيطة إلى لوحة بيانات منسّقة يعرضها وكيلك بصيغة HTML — مُؤرشَفة بالإصدارات في مستودعك، قابلة للاستضافة في أي مكان، دون اشتراك BI لكل مقعد.',
    stepsTitle: 'كيف تعمل لوحات البيانات مع Open Design',
    steps: [
      {
        title: 'صِف المقاييس',
        body: 'اذكر ما يهم — «المستخدمون النشطون أسبوعيًا، الإيراد حسب الخطة، معدل التسرّب، واتجاه 30 يومًا». يحمّل الوكيل مهارة لوحة البيانات ليعرف أنه يخطّط بطاقات مؤشرات أداء ورسومًا بيانية وجدولاً بدلاً من كتلة نص واحدة.',
        imageAlt: 'رسم لشخص يسرد المقاييس التي تهمّه',
      },
      {
        title: 'اختر أنماط الرسوم البيانية',
        body: 'يأتي Open Design بقوالب رسوم بيانية وتخطيط، فتصبح الاتجاهات رسومًا خطية، والتفصيلات أعمدة، والنسب الصورة البصرية المناسبة — خطوط ومسافات متسقة في كل مكان بدلاً من إعدادات افتراضية غير متناسقة.',
        imageAlt: 'رسم لعدة أنواع رسوم بيانية مرتّبة في شبكة متماسكة',
      },
      {
        title: 'اربط بياناتك',
        body: 'وجّه لوحة البيانات إلى ملف CSV أو نقطة وصول JSON، أو الصق صفوفًا تجريبية. تُعرض بصيغة HTML مكتفية ذاتيًا تتحدّث عندما تتغيّر البيانات — افتحها في أي متصفح، وضعها على أي مستضيف ثابت.',
        imageAlt: 'رسم لملف بيانات يتصل بلوحة بيانات تتحدّث آنيًا',
      },
      {
        title: 'حسّن وأطلق',
        body: 'عدّل بالحديث إلى الوكيل — «جمّع الإيراد حسب المنطقة، وانقل صف مؤشرات الأداء إلى الأعلى». يعيش الناتج في مشروعك، فلوحة البيانات قابلة للمراجعة ومؤرشَفة بالإصدارات مثل أي كود آخر.',
        imageAlt: 'رسم للوحة بيانات تُحسَّن ثم تُنشَر',
      },
    ],
    tableTitle: 'لوحات البيانات مع Open Design مقابل الطريقة القديمة',
    tableColCapability: 'ما تحتاجه',
    tableColWithOd: 'مع Open Design',
    tableColWithout: 'أدوات BI / مكتوبة يدويًا',
    tableRows: [
      {
        capability: 'من قائمة مقاييس إلى تخطيط',
        withOd: 'وصف واحد؛ يخطّط الوكيل البطاقات والرسوم والجداول',
        without: 'سحب الأدوات واحدة تلو الأخرى، أو كتابة كود الرسوم من الصفر',
      },
      {
        capability: 'نظام بصري متسق',
        withOd: 'أنماط رسوم ومسافات من نظام تصميم قابل لإعادة الاستخدام',
        without: 'أنماط أدوات افتراضية، أو منسّقة يدويًا لكل رسم',
      },
      {
        capability: 'ربط البيانات',
        withOd: 'CSV / JSON / صفوف ملصوقة، تُعرض بصيغة HTML حية',
        without: 'موصِّلات المورّد أو سباكة بيانات مخصصة',
      },
      {
        capability: 'الاستضافة والمشاركة',
        withOd: 'HTML مكتفٍ ذاتيًا على أي مستضيف ثابت، دون حساب',
        without: 'يحتاج المشاهد إلى مقعد لدى مورّد BI',
      },
      {
        capability: 'المراجعة وإدارة الإصدارات',
        withOd: 'يعيش في مستودعك؛ قابل للمقارنة مثل الكود',
        without: 'محبوس داخل المورّد، دون مقارنة حقيقية',
      },
      {
        capability: 'التكلفة والاحتكار',
        withOd: 'مفتوح المصدر، أحضر مفاتيحك، يعمل محليًا',
        without: 'اشتراك لكل مقعد، مستضاف لدى المورّد',
      },
    ],
    featuresTitle: 'ما الذي يمكنك بناؤه',
    features: [
      { title: "تحليلات المنتج", body: "المستخدمون النشطون، المسارات التحويلية، الاحتفاظ — المقاييس التي يعيش فيها فريق المنتج.", thumb: "example-dashboard" },
      { title: "مقاييس المستودع والتطوير", body: "النجوم، طلبات السحب، صحة CI — لوحات هندسية من بياناتك الخاصة.", thumb: "example-github-dashboard" },
      { title: "تقارير مالية", body: "الإيراد، معدل الإنفاق، المدى الزمني، معروضة كتقرير قابل للمشاركة.", thumb: "example-finance-report" },
      { title: "عمليات حية", body: "مقاييس آنية تتحدّث مع تحرّك البيانات الأساسية.", thumb: "example-live-dashboard" },
      { title: "التواصل الاجتماعي والتسويق", body: "أداء القنوات وتتبّع الحملات في عرض واحد.", thumb: "example-social-media-dashboard" },
      { title: "تقارير مجالية", body: "تقارير منظّمة لأي مجال — من السريري إلى التداول.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'لوحات بيانات أنشأها الناس باستخدام Open Design',
    galleryLead:
      'لوحات بيانات حقيقية مُعروضة من وصف ومصدر بيانات. ابدأ من واحدة قريبة من لوحتك وصِف المقاييس التي تتابعها.',
    gallery: [
      { thumb: "example-data-report", caption: "تقرير بيانات" },
      { thumb: "example-flowai-live-dashboard-template", caption: "لوحة عمليات حية" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "لوحة تحليل تداول" },
      { thumb: "example-frame-data-chart-nyt", caption: "رسم بيانات تحريري" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'تصفّح قوالب لوحات البيانات',
    faqTitle: 'الأسئلة الشائعة حول لوحات البيانات',
    faq: [
      {
        q: 'هل أحتاج إلى أداة BI مثل Tableau أو Looker؟',
        a: 'لا. يعرض Open Design لوحات البيانات بصيغة HTML داخل وكيل البرمجة لديك. تصف المقاييس وتوجّهه إلى بياناتك؛ لا توجد منصة BI منفصلة لترخّصها أو تتعلمها.',
      },
      {
        q: 'من أين تأتي البيانات؟',
        a: 'من ملف CSV أو نقطة وصول JSON أو صفوف تلصقها. لوحة البيانات هي HTML وJavaScript خالص، فتتحكم تمامًا في مصدر قراءتها — لا شيء يمرّ عبر خدمة مستضافة.',
      },
      {
        q: 'هل يمكن لزملاء غير تقنيين معاينتها؟',
        a: 'نعم. المُخرَج صفحة ويب مكتفية ذاتيًا. أي شخص لديه الرابط أو الملف يمكنه فتحها في متصفح — دون حساب، دون مقعد.',
      },
      {
        q: 'أي الوكلاء يمكنني استخدامه؟',
        a: 'Claude Code وCodex وCursor Agent وGemini CLI وأكثر من اثني عشر مُحوِّلًا أصليًا. تحضر مفاتيح المزوّد الخاصة بك.',
      },
    ],
    ctaTitle: 'ابنِ لوحة بياناتك الليلة',
    ctaBody:
      'ضع نجمة على المستودع، ثبّت Open Design، وحوّل مقاييسك إلى لوحة بيانات يمكنك استضافتها في أي مكان — في الوكيل الذي تستخدمه بالفعل.',
  },
  slides: {
    title: 'ولّد عروضًا تقديمية باستخدام Open Design + Claude Code',
    description:
      'حوّل مخطّطًا تفصيليًا إلى شريحة عرض مصمّمة ومتوافقة مع العلامة دون فتح تطبيق عروض. يمنح Open Design وكيل البرمجة لديك قوالب عروض ونظامًا بصريًا، ويعرض الشرائح بصيغة HTML يمكنك تقديمها أو تصديرها أو مشاركتها.',
    breadcrumb: 'شرائح',
    label: 'حالة استخدام · شرائح',
    heading: 'عروض تبدو مصمّمة، مكتوبة بوصف نصي',
    lead: 'سلّم وكيلك مخطّطًا تفصيليًا ونبرة. يطبّق Open Design قالب عرض ونظامًا بصريًا فتكون كل شريحة مخطّطة ومنسّقة الخطوط ومتوافقة مع العلامة — لا قائمة نقاط على خلفية فارغة.',
    heroImageAlt:
      'رسم تحريري لمخطّط تفصيلي على اليسار يتحول إلى سلسلة من شرائح عرض مصمّمة على اليمين',
    tldrTitle: 'باختصار',
    tldrBody:
      'يحوّل Open Design مخطّطًا تفصيليًا إلى عرض HTML مصمّم يعرضه وكيلك في جلسة واحدة — قدّمه في المتصفح، صدّره إلى PDF أو PPTX، واحتفظ بالمصدر في مستودعك.',
    stepsTitle: 'كيف تعمل العروض مع Open Design',
    steps: [
      { title: 'أعطه المخطّط التفصيلي', body: 'الصق نقاط حديثك أو بنية تقريبية. يحمّل الوكيل مهارة العرض فينتج سلسلة من الشرائح المخطّطة، لا مستندًا طويلاً واحدًا.', imageAlt: 'رسم لمخطّط تفصيلي نصي يُسلَّم إلى وكيل' },
      { title: 'اختر أسلوب عرض', body: 'يأتي Open Design بقوالب عروض — تحريري، سويسري دولي، تقني داكن، وأكثر. يطبّق الوكيل واحدًا منها فتبقى الخطوط والشبكة والألوان المميزة متسقة عبر كل شريحة.', imageAlt: 'رسم لعدة خيارات أساليب عرض مرتّبة جنبًا إلى جنب' },
      { title: 'ولّد الشرائح', body: 'تصبح كل نقطة شريحة مصمّمة بالتسلسل الهرمي الصحيح — عناوين، مرئيات داعمة، إبرازات بيانات. تُعرض بصيغة HTML فتُقدَّم بملء الشاشة في أي متصفح.', imageAlt: 'رسم لسلسلة من الشرائح المكتملة بتنسيق متسق' },
      { title: 'قدّم، صدّر، كرّر', body: 'قدّم من المتصفح، أو صدّر إلى PDF / PPTX للمشاركة. حسّن بالحديث إلى الوكيل — «شدّ شريحة البيانات، أضِف دعوة ختامية لاتخاذ إجراء». يبقى مصدر العرض في مشروعك.', imageAlt: 'رسم لعرض يُقدَّم ويُصدَّر إلى صيغ متعددة' },
    ],
    tableTitle: 'العروض مع Open Design مقابل الطريقة القديمة',
    tableColCapability: 'ما تحتاجه',
    tableColWithOd: 'مع Open Design',
    tableColWithout: 'PowerPoint / Keynote / أدوات شرائح بالذكاء الاصطناعي',
    tableRows: [
      { capability: 'من مخطّط تفصيلي إلى شرائح', withOd: 'وصف واحد؛ يخطّط الوكيل كل شريحة', without: 'بناء كل شريحة يدويًا، أو الصراع مع قالب' },
      { capability: 'تصميم متسق', withOd: 'قوالب عروض بشبكة ونظام خطوط حقيقيين', without: 'انحراف القالب، محاذاة يدوية، إعدادات افتراضية خارج العلامة' },
      { capability: 'البيانات والمخططات', withOd: 'رسوم وإبرازات تُعرض كجزء من الشريحة', without: 'لصق صور ثابتة أو إعادة بناء الرسوم كل مرة' },
      { capability: 'صيغ التصدير', withOd: 'HTML للتقديم، إضافةً إلى تصدير PDF / PPTX', without: 'محبوس في صيغة تطبيق واحد' },
      { capability: 'المراجعة وإدارة الإصدارات', withOd: 'المصدر يعيش في مستودعك، قابل للمقارنة', without: 'ملف ثنائي، دون مقارنة ذات معنى' },
      { capability: 'التكلفة والاحتكار', withOd: 'مفتوح المصدر، أحضر مفاتيحك، يعمل محليًا', without: 'ترخيص تطبيق أو إضافة ذكاء اصطناعي لكل مقعد' },
    ],
    featuresTitle: 'ما الذي يمكنك تقديمه',
    features: [
      { title: "عروض جذب الاستثمار", body: "عروض للمستثمرين والمبيعات بسرد قوي وشرائح بيانات نظيفة.", thumb: "example-html-ppt-pitch-deck" },
      { title: "سويسري / تحريري", body: "عروض تعتمد على الشبكة وتبرز التنسيق الطباعي، تبدو موجَّهة فنيًا.", thumb: "example-deck-swiss-international" },
      { title: "وحدات دورات", body: "عروض تعليمية بخطوات واضحة وإبرازات وإيقاع.", thumb: "example-html-ppt-course-module" },
      { title: "عروض رسوم البيانات", body: "عروض داكنة تتصدّرها الرسوم، للتحليلات والمراجعات.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "وضع المُقدِّم", body: "عروض بأسلوب reveal مبنية للتقديم الحي في المتصفح.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "مخططات تقنية", body: "عروض معمارية ومعرفية ترسم خرائط الأنظمة المعقدة.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'عروض أنشأها الناس باستخدام Open Design',
    galleryLead:
      'عروض حقيقية مُعروضة من مخطّط تفصيلي. اختر أسلوبًا قريبًا من حديثك وصِف المحتوى.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "عرض بأسلوب مجلة تحريرية" },
      { thumb: "example-guizang-ppt", caption: "عرض رئيسي مصوّر" },
      { thumb: "example-deck-open-slide-canvas", caption: "عرض open slide canvas" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "عرض بسمة متدرّجة الألوان" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'تصفّح قوالب العروض',
    faqTitle: 'الأسئلة الشائعة حول الشرائح',
    faq: [
      { q: 'هل أحتاج إلى PowerPoint أو Keynote؟', a: 'لا. يعرض Open Design العروض بصيغة HTML داخل وكيل البرمجة لديك ويمكنه التصدير إلى PDF أو PPTX. تقدّم من المتصفح أو تسلّم ملفًا — دون الحاجة إلى تطبيق عروض لبنائه.' },
      { q: 'هل هذه مجرد نقاط مولّدة بالذكاء الاصطناعي؟', a: 'لا. يطبّق الوكيل قالب عرض حقيقيًا بشبكة ونظام خطوط وتسلسل بصري هرمي، فتبدو الشرائح مصمّمة لا مملوءة آليًا.' },
      { q: 'هل يمكنني التصدير إلى PowerPoint لعميل؟', a: 'نعم. تُصدَّر العروض إلى PPTX وPDF إضافةً إلى HTML الذي تقدّم منه، فتلائم ما يتوقعه الجمهور.' },
      { q: 'أي الوكلاء يمكنني استخدامه؟', a: 'Claude Code وCodex وCursor Agent وGemini CLI ومحوِّلات أصلية أخرى، بمفاتيح المزوّد الخاصة بك.' },
    ],
    ctaTitle: 'ابنِ عرضك التالي الليلة',
    ctaBody:
      'ضع نجمة على المستودع، ثبّت Open Design، وحوّل مخطّطك التفصيلي إلى عرض مصمّم — في الوكيل الذي تستخدمه بالفعل.',
  },
  image: {
    title: 'ولّد رسومًا متوافقة مع العلامة باستخدام Open Design + Claude Code',
    description:
      'أنتج بطاقات اجتماعية وأغلفة مقالات ورسومًا تسويقية من وصف نصي — مخطّطة بتنسيق طباعي حقيقي ونظام علامتك، مُعروضة بصيغة HTML واضحة يمكنك تصديرها إلى PNG. دون تطبيق تصميم، دون اشتراك قوالب.',
    breadcrumb: 'صورة',
    label: 'حالة استخدام · صورة',
    heading: 'رسوم متوافقة مع العلامة، مولّدة ومخطّطة لك',
    lead: 'صِف البطاقة أو الغلاف الذي تحتاجه. يؤلّفه Open Design بخطوط وشبكة حقيقية وألوان علامتك — ثم يعرضه بصيغة HTML يمكنك تصديرها كصورة، بدلاً من الصراع مع تطبيق تصميم أو قالب عام.',
    heroImageAlt:
      'رسم تحريري لوصف نصي يتحول إلى مجموعة من البطاقات الاجتماعية وأغلفة المقالات المخطّطة',
    tldrTitle: 'باختصار',
    tldrBody:
      'يحوّل Open Design وصفًا نصيًا إلى رسم منسّق الخطوط ومتوافق مع العلامة يعرضه وكيلك بصيغة HTML ويصدّره إلى PNG — قابل للتكرار، مؤرشَف بالإصدارات، وخالٍ من أدوات التصميم لكل مقعد.',
    stepsTitle: 'كيف تعمل الرسوم مع Open Design',
    steps: [
      { title: 'صِف الرسم', body: 'قُل ما هو — «بطاقة Twitter لإطلاقنا تحمل العنوان واقتباسًا». يحمّل الوكيل المهارة المناسبة فيؤلّف رسمًا مخطّطًا، لا كتلة نص عادية.', imageAlt: 'رسم لشخص يصف بطاقة اجتماعية يحتاجها' },
      { title: 'طبّق نظام العلامة', body: 'يسحب Open Design ألوانك وخطوطك ومسافاتك من نظام تصميم قابل لإعادة الاستخدام، فتتطابق كل بطاقة مع بقية علامتك بدلاً من أن تبدو لمرة واحدة.', imageAlt: 'رسم لألوان العلامة والخطوط تُطبَّق على تخطيط بطاقة' },
      { title: 'اعرض وصدّر', body: 'يُعرض الرسم بصيغة HTML بالأبعاد الدقيقة التي تحتاجها — بطاقة اجتماعية، غلاف، لافتة — ثم يُصدَّر إلى PNG. نص واضح، تخطيط حقيقي، دون تعديل يدوي.', imageAlt: 'رسم لرسم يُعرض ويُصدَّر إلى ملف صورة' },
      { title: 'أعد استخدام الوصفة', body: 'ولأنه قالب، يكون الرسم التالي على بُعد وصف واحد — غيّر العنوان، احتفظ بالتخطيط. تبقى سلاسل البطاقات متسقة تمامًا.', imageAlt: 'رسم لقالب بطاقة واحد ينتج سلسلة متسقة من الرسوم' },
    ],
    tableTitle: 'الرسوم مع Open Design مقابل الطريقة القديمة',
    tableColCapability: 'ما تحتاجه',
    tableColWithOd: 'مع Open Design',
    tableColWithout: 'تطبيقات تصميم / قوالب عامة',
    tableRows: [
      { capability: 'من فكرة إلى رسم مخطّط', withOd: 'وصف واحد؛ يؤلّف الوكيل الخطوط والتخطيط', without: 'فتح تطبيق، وضع كل عنصر يدويًا' },
      { capability: 'البقاء على العلامة', withOd: 'ألوان وخطوط من نظام تصميم قابل لإعادة الاستخدام', without: 'إعادة اختيار أنماط العلامة لكل ملف، أو الانحراف عنها' },
      { capability: 'سلسلة متسقة', withOd: 'القالب نفسه، نص جديد — مجموعة محاذاة بإتقان', without: 'إعادة محاذاة كل نسخة يدويًا' },
      { capability: 'التصدير', withOd: 'HTML بأبعاد دقيقة، مُصدَّر إلى PNG', without: 'تحجيم اللوحة وإعدادات التصدير يدويًا' },
      { capability: 'قابل للتكرار', withOd: 'وصفة مدفوعة بوصف نصي في مستودعك', without: 'ملف لمرة واحدة تعيد إنشاءه كل مرة' },
      { capability: 'التكلفة والاحتكار', withOd: 'مفتوح المصدر، أحضر مفاتيحك، يعمل محليًا', without: 'أداة تصميم لكل مقعد أو سوق قوالب' },
    ],
    featuresTitle: 'ما الذي يمكنك صنعه',
    features: [
      { title: "بطاقات اجتماعية", body: "بطاقات X / Twitter مؤلَّفة بعنوانك وعلامتك.", thumb: "example-card-twitter" },
      { title: "أغلفة مقالات", body: "أغلفة تحريرية بأسلوب المجلات للمنشورات والنشرات البريدية.", thumb: "example-article-magazine" },
      { title: "بطاقات شياوهونغشو", body: "بطاقات بأسلوب RedNote مضبوطة لذلك التدفق.", thumb: "example-card-xiaohongshu" },
      { title: "رسوم Hero رئيسية", body: "مرئيات Hero سائلة ومتدرّجة للمواقع والإطلاقات.", thumb: "example-frame-liquid-bg-hero" },
      { title: "عروض دوّارة", body: "عروض اجتماعية دوّارة متعددة الشرائح تبقى متسقة عبر الإطارات.", thumb: "example-social-carousel" },
      { title: "إطارات واجهة وهمية", body: "إطارات إشعارات وأجهزة لسرد قصة المنتج.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'رسوم أنشأها الناس باستخدام Open Design',
    galleryLead:
      'بطاقات وأغلفة حقيقية مُعروضة من وصف نصي. اختر واحدة قريبة مما تحتاجه واستبدل نصّك بها.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "بطاقة اجتماعية بألوان باستيل" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "ملصق تحريري ثلاثي اللون" },
      { thumb: "example-magazine-poster", caption: "ملصق بأسلوب المجلات" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "غلاف تحريري جريء" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'تصفّح قوالب الرسوم',
    faqTitle: 'الأسئلة الشائعة حول الصور',
    faq: [
      { q: 'هل هذا مولّد صور بالذكاء الاصطناعي مثل Midjourney؟', a: 'لا. يؤلّف Open Design الرسوم بتخطيط وتنسيق طباعي حقيقي — عنوانك، علامتك، أبعاد دقيقة — ويعرضها بصيغة HTML تصدّرها كـ PNG. إنه تأليف تصميمي، لا توليد بكسلات.' },
      { q: 'هل يمكنني صنع سلسلة متسقة من البطاقات؟', a: 'نعم. ولأن كل رسم قالب، تحتفظ بالتخطيط وتغيّر النص، فتبقى سلسلة كاملة محاذاة بإتقان ومتوافقة مع العلامة.' },
      { q: 'ما الأحجام التي يمكنه إنتاجها؟', a: 'أي حجم — يُعرض الرسم بالأبعاد الدقيقة التي تحددها، من بطاقة اجتماعية مربعة إلى لافتة عريضة، ثم يُصدَّر إلى PNG.' },
      { q: 'أي الوكلاء يمكنني استخدامه؟', a: 'Claude Code وCodex وCursor Agent وGemini CLI ومحوِّلات أصلية أخرى، بمفاتيح المزوّد الخاصة بك.' },
    ],
    ctaTitle: 'اصنع رسمك التالي الليلة',
    ctaBody:
      'ضع نجمة على المستودع، ثبّت Open Design، وحوّل وصفًا نصيًا إلى رسم متوافق مع العلامة — في الوكيل الذي تستخدمه بالفعل.',
  },
  video: {
    title: 'ولّد رسومًا متحركة وفيديو قصيرًا باستخدام Open Design + Claude Code',
    description:
      'حوّل نصًا برمجيًا إلى إطارات متحركة وفيديو قصير — بطاقات عناوين، خلفيات متحركة، وخواتيم مؤلَّفة بنظام علامتك ومُعروضة من HTML. دون مجموعة رسوم متحركة، دون تمرير على خط زمني.',
    breadcrumb: 'فيديو',
    label: 'حالة استخدام · فيديو',
    heading: 'رسوم متحركة من نص برمجي، لا من خط زمني',
    lead: 'صِف اللحظة التي تريدها — كشف عنوان، رسم بيانات متحرك، خاتمة شعار. يؤلّف Open Design إطارات متحركة بنظام علامتك ويعرضها كفيديو، دون الحاجة إلى مجموعة رسوم متحركة.',
    heroImageAlt:
      'رسم تحريري لنص برمجي يتحول إلى سلسلة من إطارات فيديو متحركة',
    tldrTitle: 'باختصار',
    tldrBody:
      'يحوّل Open Design نصًا برمجيًا إلى إطارات متحركة متوافقة مع العلامة يعرضها وكيلك كفيديو قصير — مؤلَّفة من HTML، مؤرشَفة بالإصدارات في مستودعك، دون محرّر خط زمني لتتعلمه.',
    stepsTitle: 'كيف تعمل الحركة مع Open Design',
    steps: [
      { title: 'صِف اللحظة', body: 'قُل ما ينبغي أن يحدث — «عنوان مشوَّش يتحلّل إلى شعارنا، ثم بطاقة ختامية». يحمّل الوكيل مهارة الحركة فينتج إطارات متحركة، لا صورة ثابتة.', imageAlt: 'رسم لشخص يصف سلسلة حركة' },
      { title: 'طبّق أسلوب العلامة والحركة', body: 'يوفّر Open Design قوالب إطارات — تسرّبات ضوء سينمائية، عناوين مشوَّشة، خواتيم شعار — ويطبّق ألوانك وخطوطك، فتبدو الحركة مقصودة ومتوافقة مع العلامة.', imageAlt: 'رسم لتنسيق العلامة يُطبَّق على إطارات متحركة' },
      { title: 'اعرض الإطارات كفيديو', body: 'تُؤلَّف الإطارات في HTML وتُعرض كفيديو، فيكون التوقيت والتخطيط دقيقين وقابلين للتكرار — دون وضع إطارات مفتاحية يدويًا على خط زمني.', imageAlt: 'رسم لإطارات HTML تُعرض كمقطع فيديو' },
      { title: 'كرّر وصدّر', body: 'حسّن بالحديث إلى الوكيل — «أبطئ كشف العنوان، أضِف تعليقًا». صدّر مقاطع قصيرة للتواصل الاجتماعي أو المنتج. يبقى المصدر في مشروعك.', imageAlt: 'رسم لمقطع فيديو يُحسَّن ويُصدَّر للتواصل الاجتماعي' },
    ],
    tableTitle: 'الحركة مع Open Design مقابل الطريقة القديمة',
    tableColCapability: 'ما تحتاجه',
    tableColWithOd: 'مع Open Design',
    tableColWithout: 'After Effects / مجموعات الحركة',
    tableRows: [
      { capability: 'من نص برمجي إلى إطارات متحركة', withOd: 'وصف واحد؛ يؤلّف الوكيل السلسلة', without: 'وضع إطار مفتاحي لكل عنصر على خط زمني يدويًا' },
      { capability: 'البقاء على العلامة', withOd: 'قوالب إطارات + ألوانك وخطوطك', without: 'إعادة بناء تنسيق العلامة لكل مشروع' },
      { capability: 'توقيت دقيق قابل للتكرار', withOd: 'مؤلَّف في HTML، مُعروض حتميًا', without: 'تمرير يدوي، يصعب تكراره' },
      { capability: 'التصدير للتواصل الاجتماعي', withOd: 'مقاطع قصيرة مُعروضة كفيديو', without: 'إعدادات تصدير مسبقة وصراع مع المرمّزات' },
      { capability: 'المراجعة وإدارة الإصدارات', withOd: 'مصدر الإطارات يعيش في مستودعك، قابل للمقارنة', without: 'ملف مشروع ثنائي، دون مقارنة حقيقية' },
      { capability: 'التكلفة والاحتكار', withOd: 'مفتوح المصدر، أحضر مفاتيحك، يعمل محليًا', without: 'مجموعة باهظة، منحنى تعلّم حاد' },
    ],
    featuresTitle: 'ما الذي يمكنك تحريكه',
    features: [
      { title: "Hyperframes", body: "سلاسل حركة إطارًا بإطار مؤلَّفة من HTML.", thumb: "example-video-hyperframes" },
      { title: "قصير للتواصل الاجتماعي", body: "مقاطع رأسية مبنية لتدفقات التواصل الاجتماعي.", thumb: "example-video-shortform" },
      { title: "مجموعات إطارات متحركة", body: "إطارات متحركة قابلة لإعادة الاستخدام تؤلّفها في مقطع.", thumb: "example-motion-frames" },
      { title: "تسرّبات ضوء سينمائية", body: "انتقالات سينمائية وخلفيات أجواء.", thumb: "example-frame-light-leak-cinema" },
      { title: "عناوين مشوَّشة", body: "كشوف عناوين بحركة وملمس.", thumb: "example-frame-glitch-title" },
      { title: "خواتيم شعار", body: "رسوم ختامية تحمل العلامة لأي مقطع.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'حركة أنشأها الناس باستخدام Open Design',
    galleryLead:
      'إطارات ومقاطع متحركة حقيقية مُعروضة من وصف نصي. اختر واحدة قريبة من فكرتك وصِف الحركة.',
    gallery: [
      { thumb: "example-hyperframes", caption: "سلسلة Hyperframes" },
      { thumb: "example-frame-liquid-bg-hero", caption: "خلفية حركة سائلة" },
      { thumb: "example-frame-macos-notification", caption: "إطار واجهة متحرك" },
      { thumb: "example-frame-data-chart-nyt", caption: "رسم بيانات متحرك" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'تصفّح قوالب الحركة',
    faqTitle: 'الأسئلة الشائعة حول الفيديو',
    faq: [
      { q: 'هل أحتاج إلى After Effects أو مجموعة رسوم متحركة؟', a: 'لا. يؤلّف Open Design إطارات متحركة في HTML ويعرضها كفيديو داخل وكيل البرمجة لديك. لا يوجد محرّر خط زمني لتتعلمه أو ترخّصه.' },
      { q: 'لأي نوع من الفيديو يصلح هذا؟', a: 'حركة قصيرة — بطاقات عناوين، رسوم بيانات متحركة، خواتيم شعار، مقاطع اجتماعية. إنه مبني لحركة العلامة والمنتج، لا للمونتاج الطويل.' },
      { q: 'هل التوقيت قابل للتكرار؟', a: 'نعم. ولأن الإطارات مؤلَّفة بالكود ومُعروضة حتميًا، تحصل على النتيجة نفسها كل مرة ويمكنك ضبطها بدقة بوصف نصي.' },
      { q: 'أي الوكلاء يمكنني استخدامه؟', a: 'Claude Code وCodex وCursor Agent وGemini CLI ومحوِّلات أصلية أخرى، بمفاتيح المزوّد الخاصة بك.' },
    ],
    ctaTitle: 'حرّك فكرتك التالية الليلة',
    ctaBody:
      'ضع نجمة على المستودع، ثبّت Open Design، وحوّل نصًا برمجيًا إلى حركة — في الوكيل الذي تستخدمه بالفعل.',
  },
  designSystem: {
    title: 'ابنِ نظام تصميم وطبّقه باستخدام Open Design + Claude Code',
    description:
      'التقط علامتك كنظام تصميم قابل لإعادة الاستخدام يطبّقه وكيل البرمجة لديك على كل ناتج — الألوان والخطوط والمكونات والنبرة في ملف DESIGN.md واحد. عرّفه مرة؛ يبقى كل نموذج أولي وعرض ولوحة بيانات متوافقًا مع العلامة.',
    breadcrumb: 'نظام التصميم',
    label: 'حالة استخدام · نظام التصميم',
    heading: 'نظام تصميم واحد، مُطبَّق على كل ما يصنعه وكيلك',
    lead: 'عرّف علامتك مرة واحدة وينقلها Open Design إلى كل مُخرَج — نماذج أولية، عروض، لوحات بيانات، رسوم. يعيش النظام في مستودعك كملف DESIGN.md يقرأه الوكيل، فالاتساق تلقائي لا يدوي.',
    heroImageAlt:
      'رسم تحريري لنظام تصميم واحد يشعّ إلى نواتج عديدة متوافقة مع العلامة',
    tldrTitle: 'باختصار',
    tldrBody:
      'يلتقط Open Design علامتك كنظام تصميم قابل للنقل يطبّقه وكيلك على كل ناتج — مُعرَّف مرة في مستودعك، مفروض في كل مكان، دون أداة تصميم مركزية تتحكم به.',
    stepsTitle: 'كيف تعمل أنظمة التصميم مع Open Design',
    steps: [
      { title: 'التقط النظام', body: 'صِف علامتك — الألوان، الخطوط، المسافات، الصوت — أو وجّه الوكيل إلى موقع قائم لاستخراجها. يكتبها Open Design في ملف DESIGN.md يعيش في مشروعك.', imageAlt: 'رسم لعلامة تُلتقَط في ملف نظام تصميم واحد' },
      { title: 'ابدأ من قاعدة مجرَّبة', body: 'يأتي Open Design بأكثر من 140 نظام تصميم مرجعيًا — من Apple وLinear إلى التحريري والخشن. اشتقّ نسخة من واحد قريب من علامتك بدلاً من البدء من صفحة فارغة.', imageAlt: 'رسم لتصفّح معرض من أنظمة التصميم المرجعية' },
      { title: 'طبّقه في كل مكان', body: 'تقرأ كل مهارة أخرى النظام نفسه، فيتشارك نموذج أولي وعرض ولوحة بيانات لغة بصرية واحدة — دون أن تعيد تحديدها كل مرة.', imageAlt: 'رسم لنظام واحد يُطبَّق باتساق عبر أنواع نواتج عديدة' },
      { title: 'طوّره في مكان واحد', body: 'غيّر النظام فيعكسه العرض التالي في كل مكان. ولأنه ملف في مستودعك، تُراجَع قرارات التصميم وتُؤرشَف بالإصدارات مثل الكود.', imageAlt: 'رسم لنظام تصميم يُحدَّث وينتشر إلى كل النواتج' },
    ],
    tableTitle: 'أنظمة التصميم مع Open Design مقابل الطريقة القديمة',
    tableColCapability: 'ما تحتاجه',
    tableColWithOd: 'مع Open Design',
    tableColWithout: 'مكتبات أدوات التصميم / أدلة الأسلوب',
    tableRows: [
      { capability: 'تعريف النظام', withOd: 'ملف DESIGN.md يقرأه الوكيل، مشتقّ من أكثر من 140 مرجعًا', without: 'دليل أسلوب ثابت أو مكتبة محبوسة في أداة' },
      { capability: 'التطبيق عبر أنواع النواتج', withOd: 'النظام نفسه يغذّي النماذج الأولية والعروض ولوحات البيانات والرسوم', without: 'يُعاد تنفيذه لكل أداة ولكل ملف' },
      { capability: 'إبقاء كل شيء متسقًا', withOd: 'تلقائي — تقرأ كل مهارة مصدرًا واحدًا', without: 'انضباط يدوي؛ ينحرف بمرور الوقت' },
      { capability: 'تطوير العلامة', withOd: 'حرّر مرة؛ يتحدّث العرض التالي في كل مكان', without: 'بحث واستبدال عبر الملفات والأدوات' },
      { capability: 'المراجعة وإدارة الإصدارات', withOd: 'يعيش في مستودعك، قابل للمقارنة مثل الكود', without: 'مدفون في أداة تصميم، يصعب تدقيقه' },
      { capability: 'التكلفة والاحتكار', withOd: 'مفتوح المصدر، قابل للنقل، يعمل محليًا', without: 'محبوس في اشتراك أداة تصميم' },
    ],
    featuresTitle: 'أنظمة يمكنك البدء منها',
    features: [
      { title: "Apple", body: "جمالية نظيفة ومقتصدة بخط النظام.", thumb: "design-system-apple" },
      { title: "Linear", body: "مظهر أداة منتج حاد بمسافات ضيقة.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "ناعم، يضع المستند أولاً، ودود.", thumb: "design-system-notion" },
      { title: "Figma", body: "مرح، ملوّن، بطاقة أداة إبداعية.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "بسيط، محايد، بمستوى بحثي.", thumb: "design-system-openai" },
      { title: "GitHub", body: "كثيف، تقني، أصيل للمطورين.", thumb: "design-system-github" },
    ],
    galleryTitle: 'أنظمة التصميم في Open Design',
    galleryLead:
      'بعض من أكثر من 140 نظامًا مرجعيًا يمكنك اشتقاق نسخة منها كنقطة بداية. اختر واحدًا قريبًا من علامتك وكيّفه.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "نظام بأسلوب Airbnb" },
      { thumb: "design-system-vercel", caption: "نظام بأسلوب Vercel" },
      { thumb: "design-system-stripe", caption: "نظام بأسلوب Stripe" },
      { thumb: "design-system-spotify", caption: "نظام بأسلوب Spotify" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'تصفّح أنظمة التصميم',
    faqTitle: 'الأسئلة الشائعة حول نظام التصميم',
    faq: [
      { q: 'ما هو نظام التصميم هنا بالضبط؟', a: 'ملف DESIGN.md في مستودعك يلتقط الألوان والخطوط والمسافات والمكونات والصوت. تقرأه كل مهارة في Open Design، فتُطبَّق علامتك تلقائيًا على أي شيء ينتجه الوكيل.' },
      { q: 'هل عليّ أن أبدأ من الصفر؟', a: 'لا. يأتي Open Design بأكثر من 140 نظام تصميم مرجعيًا يمكنك اشتقاق نسخة منها — من Apple وLinear إلى التحريري والخشن — ثم تكييفها مع علامتك.' },
      { q: 'كيف يبقى متسقًا عبر العروض ولوحات البيانات والنماذج الأولية؟', a: 'لأن كل تلك المهارات تقرأ ملف DESIGN.md نفسه. عرّف النظام مرة فيكون الاتساق تلقائيًا بدلاً من شيء تراقبه يدويًا.' },
      { q: 'أي الوكلاء يمكنني استخدامه؟', a: 'Claude Code وCodex وCursor Agent وGemini CLI ومحوِّلات أصلية أخرى، بمفاتيح المزوّد الخاصة بك.' },
    ],
    ctaTitle: 'عرّف نظام تصميمك الليلة',
    ctaBody:
      'ضع نجمة على المستودع، ثبّت Open Design، وامنح وكيلك علامة واحدة يطبّقها في كل مكان — في الوكيل الذي تستخدمه بالفعل.',
  },
};

const TR: SolutionLocaleCopy = {
  prototype: {
    title: 'Open Design + Claude Code ile etkileşimli prototipler oluşturun',
    description:
      'Bir komutu, terminalden çıkmadan tıklanabilir, çok ekranlı bir prototipe dönüştürün. Open Design, kodlama ajanınıza tasarım becerilerini, şablonları ve tasarım sistemini vererek tarayıcıda açabileceğiniz gerçek prototipler üretmesini sağlar.',
    breadcrumb: 'Prototip',
    label: 'Kullanım örneği · Prototip',
    heading: 'Bir komut hızında prototip oluşturun',
    lead: 'Aklınızdaki akışı tarif edin, ajanınız gerçek, tıklanabilir bir prototip kursun — birden çok ekran, ortak stiller ve canlı etkileşimler — açabileceğiniz, paylaşabileceğiniz ve mühendisliğe teslim edebileceğiniz HTML olarak doğrudan işlensin.',
    heroImageAlt:
      'Bir elin çizdiği tel kafesin tıklanabilir, çok ekranlı bir uygulama prototipine dönüştüğünü gösteren editöryel illüstrasyon',
    tldrTitle: 'Tek cümlede',
    tldrBody:
      'Open Design, zaten kullandığınız kodlama ajanının tasarım katmanıdır. Prototipleme için bu, tek bir paragraflık bir fikirden tek bir oturumda gezilebilir, stillendirilmiş bir prototipe geçmek demektir — tasarım aracı yok, dışa aktarma adımı yok, teslim boşluğu yok.',
    stepsTitle: 'Open Design ile prototipleme nasıl çalışır',
    steps: [
      {
        title: 'Akışı tarif edin',
        body: 'Ajanınıza ne kurduğunuzu sade bir dille anlatın — “bir karşılama ekranı, bir plan seçici ve bir onay ekranı içeren bir katılım akışı.” Open Design prototip becerisini yükler, böylece ajan tek bir sayfa değil ekranlar üretmesi gerektiğini bilir.',
        imageAlt:
          'Bir kişinin terminale bir uygulama akışının sade dildeki tarifini yazdığını gösteren illüstrasyon',
      },
      {
        title: 'Stillendirilmiş ekranlar üretin',
        body: 'Ajan, Open Design’dan bir tasarım sistemi ve prototip şablonları uygular, böylece her ekran taslak gibi görünmek yerine tipografiyi, boşlukları ve bileşenleri paylaşır. Kopuk maketler değil, tutarlı bir ekran kümesi elde edersiniz.',
        imageAlt:
          'Hepsi tek bir tutarlı görsel stili paylaşan birkaç uygulama ekranının sırayla belirdiğini gösteren illüstrasyon',
      },
      {
        title: 'Etkileşimleri bağlayın',
        body: 'Düğmeler gezinir, sekmeler geçiş yapar, kalıcı pencereler açılır. Prototip kendi kendine yeten HTML olarak işlenir, böylece herhangi bir tarayıcıda gerçeği gibi davranır — görüntülemek için herhangi bir prototipleme aracı hesabı gerekmez.',
        imageAlt:
          'Bir imlecin birbirine bağlı ekranlar arasında tıkladığını ve oklarla aralarındaki gezinmeyi gösteren illüstrasyon',
      },
      {
        title: 'Yineleyin ve teslim edin',
        body: 'Ajanla konuşarak iyileştirin — “plan seçiciyi üç sütunlu bir düzene çevir.” Çıktı projenizin içinde yaşadığından, tasarım ile nihai kod tek bir doğruluk kaynağını paylaşır ve tasarımcıdan mühendise olağan teslim boşluğu kapanır.',
        imageAlt:
          'Bir prototipin gözden geçirilip bir mühendise aktarıldığını, tasarım ile kodun tek bir dosyada birleştiğini gösteren illüstrasyon',
      },
    ],
    tableTitle: 'Open Design ile prototipleme, eski yönteme karşı',
    tableColCapability: 'İhtiyacınız olan',
    tableColWithOd: 'Open Design ile',
    tableColWithout: 'Geleneksel prototipleme araçları',
    tableRows: [
      {
        capability: 'Fikirden ilk ekrana geçmek',
        withOd: 'Zaten açık olan ajanınızda tek bir komut',
        without: 'Ayrı bir araç açmak, dosya başlatmak, kutuları elle sürüklemek',
      },
      {
        capability: 'Birbirine bağlı birden çok ekran',
        withOd: 'Ortak stiller ve çalışan gezinmeyle bir küme olarak üretilir',
        without: 'Her çerçeve elle çizilir ve elle bağlanır',
      },
      {
        capability: 'Tutarlı görsel sistem',
        withOd: 'Ajanın uyguladığı yeniden kullanılabilir bir tasarım sisteminden alınır',
        without: 'Her dosyada yeniden oluşturulur ya da elle sürdürülür',
      },
      {
        capability: 'Paylaşılabilir sonuç',
        withOd: 'Kendi kendine yeten HTML — her tarayıcıda açılır, hesap gerekmez',
        without: 'Görüntüleyenin bir koltuğa ya da satıcı aracında bir paylaşım bağlantısına ihtiyacı var',
      },
      {
        capability: 'Gerçek koda giden yol',
        withOd: 'Çıktı deponuzda yaşar; tasarım ve kod tek kaynağı paylaşır',
        without: 'Ayrı bir teslimden sonra sıfırdan yeniden kurulur',
      },
      {
        capability: 'Maliyet ve bağımlılık',
        withOd: 'Açık kaynak, kendi anahtarlarınızı getirin, yerelde çalışır',
        without: 'Koltuk başı abonelik, satıcı barındırmalı, dışa aktarma kısıtlı',
      },
    ],
    featuresTitle: 'Neyin prototipini oluşturabilirsiniz',
    features: [
      {
        title: 'Çok ekranlı web uygulamaları',
        body: 'Ortak gezinmeli tam akışlar — katılım, panolar, ayarlar — tek sayfalar değil.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Mobil uygulama akışları',
        body: 'Yerel hissi veren geçiş ve durumlarla ekran ekran mobil yolculuklar.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Açılış sayfaları',
        body: 'Tıklayarak gezebileceğiniz ve yayına alabileceğiniz pazarlama sayfaları ve SaaS açılışları.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Her görsel zevk',
        body: 'Editöryel, yumuşak ya da brütalist — prototip baştan sona tutarlı bir stil taşır.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Bekleme listesi ve fiyatlandırma',
        body: 'Dönüşüm yüzeyleri — bekleme listeleri, fiyat tabloları — bağlanmış ve markaya uygun.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Oyunlaştırılmış ve eğlenceli',
        body: 'Hareketin ve durumun sunumun parçası olduğu etkileşim yoğun kavramlar.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'İnsanların Open Design ile oluşturduğu prototipler',
    galleryLead:
      'Bunların her biri bir komut olarak başladı ve tıklanabilir bir çıktıya dönüştü. Fikrinize yakın bir şablon seçin, varyasyonunuzu tarif edin, ajan onu uyarlasın.',
    gallery: [
      { thumb: "example-dating-web", caption: "Flört web uygulaması — çok ekranlı akış" },
      { thumb: "example-hr-onboarding", caption: "İK katılım akışı" },
      { thumb: "example-kami-landing", caption: "Ürün açılış sayfası" },
      { thumb: "example-web-prototype-taste-soft", caption: "Yumuşak stilde web prototipi" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Prototip şablonlarına göz atın',
    faqTitle: 'Prototipleme SSS',
    faq: [
      {
        q: 'Open Design ile prototip yapmak için Figma gibi bir tasarım aracına ihtiyacım var mı?',
        a: 'Hayır. Open Design kodlama ajanınızın içinde çalışır ve prototipleri HTML olarak işler. Akışı dille tarif edersiniz; ajan ekranları üretir. Öğrenilecek ya da ücreti ödenecek ayrı bir tuval aracı yoktur.',
      },
      {
        q: 'Prototipler etkileşimli mi yoksa yalnızca statik maketler mi?',
        a: 'Etkileşimli. Gezinme, sekmeler ve kalıcı pencereler çalışır çünkü çıktı gerçek HTML ve CSS’tir. Tıpkı bir kullanıcının yapacağı gibi herhangi bir tarayıcıda tıklayarak gezebilirsiniz.',
      },
      {
        q: 'Hangi ajanları kullanabilirim?',
        a: 'Open Design; Claude Code, Codex, Cursor Agent, Gemini CLI ve bir düzineden fazla birinci taraf bağdaştırıcıyla çalışır. Kendi sağlayıcı anahtarlarınızı getirirsiniz; hiçbir şey sizin için barındırılmaz.',
      },
      {
        q: 'Bir prototip gerçek ürüne dönüşebilir mi?',
        a: 'Mesele tam da bu. Çıktı projenizde yaşar, böylece aynı tasarım sistemi ve bileşenler bir teslimden sonra çöpe atılmak yerine üretim koduna taşınır.',
      },
    ],
    ctaTitle: 'Bir sonraki fikrinizin prototipini bu gece oluşturun',
    ctaBody:
      'Depoya yıldız verin, Open Design’ı kurun ve bir sonraki “ya şöyle olsaydı”yı tıklayabileceğiniz bir şeye dönüştürün — zaten kullandığınız ajanda.',
  },
  dashboard: {
    title: 'Open Design + Claude Code ile veri panoları oluşturun',
    description:
      'İzlediğiniz metrikleri tarif edin, kodlama ajanınız stillendirilmiş, duyarlı bir pano kursun — her yere barındırabileceğiniz HTML olarak işlenen grafikler, KPI kartları ve tablolar. BI aracı koltuğu yok, sürükle bırak oluşturucu yok.',
    breadcrumb: 'Pano',
    label: 'Kullanım örneği · Pano',
    heading: 'Panolar bir tariften gelir, sürükle bırak oluşturucudan değil',
    lead: 'Ajanınıza neyi göstereceğini ve nasıl hissettirmesi gerektiğini söyleyin. Open Design grafik desenlerini, düzen sistemini ve görsel dili sağlar, böylece varsayılan stilli bir bileşen yığını değil, tutarlı ve sunulabilir bir pano elde edersiniz.',
    heroImageAlt:
      'Soldaki ham sayıların sağda temiz bir grafik ve KPI kartı panosuna aktığını gösteren editöryel illüstrasyon',
    tldrTitle: 'Tek cümlede',
    tldrBody:
      'Open Design, metriklerinizin sade dildeki bir tanımını ajanınızın HTML olarak işlediği stillendirilmiş bir panoya dönüştürür — deponuzda sürümlenir, her yere barındırılabilir, koltuk başı BI aboneliği olmadan.',
    stepsTitle: 'Open Design ile panolar nasıl çalışır',
    steps: [
      {
        title: 'Metrikleri tarif edin',
        body: 'Önemli olanları sıralayın — “haftalık etkin kullanıcılar, plana göre gelir, kayıp oranı ve 30 günlük bir trend.” Ajan pano becerisini yükler, böylece tek bir metin bloğu yerine KPI kartlarını, grafikleri ve bir tabloyu yerleştirmesi gerektiğini bilir.',
        imageAlt: 'Bir kişinin önemsediği metrikleri sıraladığını gösteren illüstrasyon',
      },
      {
        title: 'Grafik desenlerini seçin',
        body: 'Open Design grafik ve düzen şablonları sunar, böylece trendler çizgi grafiğe, dökümler çubuklara ve oranlar doğru görsele dönüşür — uyumsuz varsayılanlar yerine baştan sona tutarlı tipografi ve boşluk.',
        imageAlt: 'Birkaç grafik türünün tutarlı bir ızgaraya dizildiğini gösteren illüstrasyon',
      },
      {
        title: 'Verinizi bağlayın',
        body: 'Panoyu bir CSV’ye, bir JSON uç noktasına yönlendirin ya da örnek satırlar yapıştırın. Veri değiştiğinde güncellenen, kendi kendine yeten HTML olarak işlenir — herhangi bir tarayıcıda açın, herhangi bir statik barındırıcıya bırakın.',
        imageAlt: 'Bir veri dosyasının canlı güncellenen bir panoya bağlandığını gösteren illüstrasyon',
      },
      {
        title: 'İyileştirin ve yayına alın',
        body: 'Ajanla konuşarak ayarlayın — “geliri bölgeye göre grupla, KPI satırını en üste taşı.” Çıktı projenizde yaşar, böylece pano her kod gibi gözden geçirilebilir ve sürümlenebilir.',
        imageAlt: 'Bir panonun iyileştirilip dağıtıldığını gösteren illüstrasyon',
      },
    ],
    tableTitle: 'Open Design ile panolar, eski yönteme karşı',
    tableColCapability: 'İhtiyacınız olan',
    tableColWithOd: 'Open Design ile',
    tableColWithout: 'BI araçları / elle kodlanmış',
    tableRows: [
      { capability: 'Metrik listesinden düzene geçmek', withOd: 'Tek komut; ajan kartları, grafikleri ve tabloları yerleştirir', without: 'Bileşenleri tek tek sürükleyin ya da grafik kodunu sıfırdan yazın' },
      { capability: 'Tutarlı görsel sistem', withOd: 'Yeniden kullanılabilir bir tasarım sisteminden grafik desenleri ve boşluk', without: 'Varsayılan bileşen stilleri ya da her grafik elle stillendirilir' },
      { capability: 'Veri bağlama', withOd: 'CSV / JSON / yapıştırılan satırlar, canlı HTML olarak işlenir', without: 'Satıcı bağlayıcıları ya da özel veri tesisatı' },
      { capability: 'Barındırma ve paylaşım', withOd: 'Herhangi bir statik barındırıcıda kendi kendine yeten HTML, hesap gerekmez', without: 'Görüntüleyenin BI satıcısında bir koltuğa ihtiyacı var' },
      { capability: 'Gözden geçirme ve sürümleme', withOd: 'Deponuzda yaşar; kod gibi karşılaştırılabilir', without: 'Satıcıya kilitli, gerçek bir fark karşılaştırması yok' },
      { capability: 'Maliyet ve bağımlılık', withOd: 'Açık kaynak, kendi anahtarlarınızı getirin, yerelde çalışır', without: 'Koltuk başı abonelik, satıcı barındırmalı' },
    ],
    featuresTitle: 'Neyi kurabilirsiniz',
    features: [
      { title: "Ürün analitiği", body: "Etkin kullanıcılar, hunidiler, elde tutma — bir ürün ekibinin içinde yaşadığı metrikler.", thumb: "example-dashboard" },
      { title: "Depo ve geliştirici metrikleri", body: "Yıldızlar, PR’lar, CI sağlığı — kendi verinizden mühendislik panoları.", thumb: "example-github-dashboard" },
      { title: "Finans raporları", body: "Gelir, harcama, pist; paylaşılabilir bir rapor olarak yerleştirilir.", thumb: "example-finance-report" },
      { title: "Canlı operasyonlar", body: "Altta yatan veri hareket ettikçe yenilenen gerçek zamanlı metrikler.", thumb: "example-live-dashboard" },
      { title: "Sosyal ve pazarlama", body: "Kanal performansı ve kampanya takibi tek bir görünümde.", thumb: "example-social-media-dashboard" },
      { title: "Alan raporları", body: "Her alan için yapılandırılmış raporlar — klinikten alım satıma.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'İnsanların Open Design ile oluşturduğu panolar',
    galleryLead:
      'Bir komut ve bir veri kaynağından işlenmiş gerçek panolar. Sizinkine yakın olan birinden başlayın ve izlediğiniz metrikleri tarif edin.',
    gallery: [
      { thumb: "example-data-report", caption: "Veri raporu" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Canlı operasyon panosu" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Alım satım analiz panosu" },
      { thumb: "example-frame-data-chart-nyt", caption: "Editöryel veri grafiği" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Pano şablonlarına göz atın',
    faqTitle: 'Pano SSS',
    faq: [
      { q: 'Tableau veya Looker gibi bir BI aracına ihtiyacım var mı?', a: 'Hayır. Open Design panoları kodlama ajanınızın içinde HTML olarak işler. Metrikleri tarif eder ve verinize yönlendirirsiniz; lisanslanacak ya da öğrenilecek ayrı bir BI platformu yoktur.' },
      { q: 'Veri nereden gelir?', a: 'Bir CSV’den, bir JSON uç noktasından ya da yapıştırdığınız satırlardan. Pano saf HTML ve JavaScript’tir, böylece nereden okuduğunu tamamen siz denetlersiniz — hiçbir şey barındırılan bir hizmet üzerinden geçmez.' },
      { q: 'Teknik olmayan ekip arkadaşları görüntüleyebilir mi?', a: 'Evet. Çıktı kendi kendine yeten bir web sayfasıdır. Bağlantısı ya da dosyası olan herkes onu bir tarayıcıda açabilir — hesap yok, koltuk yok.' },
      { q: 'Hangi ajanları kullanabilirim?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI ve bir düzineden fazla birinci taraf bağdaştırıcı. Kendi sağlayıcı anahtarlarınızı getirirsiniz.' },
    ],
    ctaTitle: 'Panonuzu bu gece kurun',
    ctaBody:
      'Depoya yıldız verin, Open Design’ı kurun ve metriklerinizi her yere barındırabileceğiniz bir panoya dönüştürün — zaten kullandığınız ajanda.',
  },
  slides: {
    title: 'Open Design + Claude Code ile sunum desteleri oluşturun',
    description:
      'Bir taslağı, herhangi bir sunum uygulaması açmadan tasarlanmış, markaya uygun bir slayt destesine dönüştürün. Open Design kodlama ajanınıza deste şablonları ve bir görsel sistem verir, slaytları sunabileceğiniz, dışa aktarabileceğiniz veya paylaşabileceğiniz HTML olarak işler.',
    breadcrumb: 'Slaytlar',
    label: 'Kullanım örneği · Slaytlar',
    heading: 'Tasarlanmış görünen desteler, bir komutla yazılır',
    lead: 'Ajanınıza bir taslak ve bir ton verin. Open Design bir deste şablonu ve görsel sistem uygular, böylece her slayt yerleştirilir, dizilir ve markaya uygundur — boş bir arka plandaki madde listesi değil.',
    heroImageAlt:
      'Soldaki bir taslağın sağda bir dizi tasarlanmış sunum slaytına dönüştüğünü gösteren editöryel illüstrasyon',
    tldrTitle: 'Tek cümlede',
    tldrBody:
      'Open Design bir taslağı ajanınızın tek bir oturumda işlediği tasarlanmış bir HTML destesine dönüştürür — tarayıcıda sunun, PDF veya PPTX olarak dışa aktarın ve kaynağı deponuzda tutun.',
    stepsTitle: 'Open Design ile desteler nasıl çalışır',
    steps: [
      { title: 'Taslağı verin', body: 'Konuşma noktalarınızı ya da kaba bir yapıyı yapıştırın. Ajan deste becerisini yükler, böylece uzun tek bir belge değil, yerleştirilmiş bir slayt dizisi üretir.', imageAlt: 'Bir metin taslağının bir ajana verildiğini gösteren illüstrasyon' },
      { title: 'Bir deste stili seçin', body: 'Open Design deste şablonları sunar — editöryel, İsviçre-uluslararası, koyu teknik ve daha fazlası. Ajan birini uygular, böylece tipografi, ızgara ve vurgular her slayt boyunca tutarlı kalır.', imageAlt: 'Birkaç deste stili seçeneğinin yan yana dizildiğini gösteren illüstrasyon' },
      { title: 'Slaytları üretin', body: 'Her nokta doğru hiyerarşiye sahip tasarlanmış bir slayda dönüşür — başlıklar, destekleyici görseller, veri vurguları. HTML olarak işlenir, böylece herhangi bir tarayıcıda tam ekran sunulur.', imageAlt: 'Tutarlı stile sahip tamamlanmış bir slayt dizisini gösteren illüstrasyon' },
      { title: 'Sunun, dışa aktarın, yineleyin', body: 'Tarayıcıdan sunun ya da paylaşım için PDF / PPTX olarak dışa aktarın. Ajanla konuşarak iyileştirin — “veri slaydını sıkılaştır, bir kapanış eylem çağrısı ekle.” Deste kaynağı projenizde kalır.', imageAlt: 'Bir destenin sunulup birden çok biçime dışa aktarıldığını gösteren illüstrasyon' },
    ],
    tableTitle: 'Open Design ile desteler, eski yönteme karşı',
    tableColCapability: 'İhtiyacınız olan',
    tableColWithOd: 'Open Design ile',
    tableColWithout: 'PowerPoint / Keynote / yapay zekâ slayt araçları',
    tableRows: [
      { capability: 'Taslaktan slaytlara geçmek', withOd: 'Tek komut; ajan her slaydı yerleştirir', without: 'Her slaydı elle kurun ya da bir şablonla boğuşun' },
      { capability: 'Tutarlı tasarım', withOd: 'Gerçek bir ızgara ve yazı sistemi olan deste şablonları', without: 'Tema kayması, elle hizalama, markaya aykırı varsayılanlar' },
      { capability: 'Veri ve diyagramlar', withOd: 'Slaydın parçası olarak işlenen grafikler ve vurgular', without: 'Statik görseller yapıştırın ya da grafikleri her seferinde yeniden kurun' },
      { capability: 'Dışa aktarma biçimleri', withOd: 'Sunmak için HTML, ayrıca PDF / PPTX dışa aktarımı', without: 'Tek bir uygulamanın biçimine kilitli' },
      { capability: 'Gözden geçirme ve sürümleme', withOd: 'Kaynak deponuzda yaşar, karşılaştırılabilir', without: 'İkili dosya, anlamlı bir fark karşılaştırması yok' },
      { capability: 'Maliyet ve bağımlılık', withOd: 'Açık kaynak, kendi anahtarlarınızı getirin, yerelde çalışır', without: 'Uygulama lisansı ya da koltuk başı yapay zekâ eklentisi' },
    ],
    featuresTitle: 'Neyi sunabilirsiniz',
    features: [
      { title: "Yatırım desteleri", body: "Güçlü bir anlatı ve temiz veri slaytlarına sahip yatırımcı ve satış desteleri.", thumb: "example-html-ppt-pitch-deck" },
      { title: "İsviçre / editöryel", body: "Sanatla yönetilmiş görünen, ızgara odaklı, tipografik desteler.", thumb: "example-deck-swiss-international" },
      { title: "Kurs modülleri", body: "Açık adımlar, vurgular ve tempoya sahip öğretim desteleri.", thumb: "example-html-ppt-course-module" },
      { title: "Veri grafiği desteleri", body: "Analiz ve incelemeler için koyu, grafik öne çıkan desteler.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Sunucu modu", body: "Tarayıcıda canlı sunmak için kurulmuş reveal tarzı desteler.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Teknik planlar", body: "Karmaşık sistemleri haritalayan mimari ve bilgi desteleri.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'İnsanların Open Design ile oluşturduğu desteler',
    galleryLead:
      'Bir taslaktan işlenmiş gerçek desteler. Konuşmanıza yakın bir stil seçin ve içeriği tarif edin.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Editöryel dergi destesi" },
      { thumb: "example-guizang-ppt", caption: "İllüstrasyonlu açılış sunumu" },
      { thumb: "example-deck-open-slide-canvas", caption: "Open slide canvas destesi" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Geçişli tema destesi" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Deste şablonlarına göz atın',
    faqTitle: 'Slaytlar SSS',
    faq: [
      { q: 'PowerPoint ya da Keynote’a ihtiyacım var mı?', a: 'Hayır. Open Design desteleri kodlama ajanınızın içinde HTML olarak işler ve PDF veya PPTX olarak dışa aktarabilir. Tarayıcıdan sunarsınız ya da bir dosya teslim edersiniz — kurmak için herhangi bir sunum uygulaması gerekmez.' },
      { q: 'Bunlar yalnızca yapay zekâ üretimi madde işaretleri mi?', a: 'Hayır. Ajan ızgaraya, yazı ölçeğine ve görsel hiyerarşiye sahip gerçek bir deste şablonu uygular, böylece slaytlar otomatik doldurulmuş değil, tasarlanmış görünür.' },
      { q: 'Bir müşteri için PowerPoint’a dışa aktarabilir miyim?', a: 'Evet. Desteler, sunduğunuz HTML’nin yanı sıra PPTX ve PDF olarak da dışa aktarılır, böylece izleyicinin beklediği biçime uyar.' },
      { q: 'Hangi ajanları kullanabilirim?', a: 'Kendi sağlayıcı anahtarlarınızla Claude Code, Codex, Cursor Agent, Gemini CLI ve daha fazla birinci taraf bağdaştırıcı.' },
    ],
    ctaTitle: 'Bir sonraki destenizi bu gece kurun',
    ctaBody:
      'Depoya yıldız verin, Open Design’ı kurun ve taslağınızı tasarlanmış bir desteye dönüştürün — zaten kullandığınız ajanda.',
  },
  image: {
    title: 'Open Design + Claude Code ile markaya uygun grafikler oluşturun',
    description:
      'Sosyal kartları, makale kapaklarını ve pazarlama grafiklerini bir komuttan üretin — gerçek tipografi ve marka sisteminizle yerleştirilmiş, PNG’ye dışa aktarabileceğiniz net HTML olarak işlenmiş. Tasarım uygulaması yok, şablon aboneliği yok.',
    breadcrumb: 'Görsel',
    label: 'Kullanım örneği · Görsel',
    heading: 'Markaya uygun grafikler, sizin için üretilir ve yerleştirilir',
    lead: 'İhtiyacınız olan kartı ya da kapağı tarif edin. Open Design onu gerçek yazı, ızgara ve marka renklerinizle düzenler — sonra bir tasarım uygulamasıyla ya da genel bir şablonla boğuşmak yerine, görsel olarak dışa aktarabileceğiniz HTML olarak işler.',
    heroImageAlt:
      'Bir komutun bir dizi yerleştirilmiş sosyal kart ve makale kapağına dönüştüğünü gösteren editöryel illüstrasyon',
    tldrTitle: 'Tek cümlede',
    tldrBody:
      'Open Design bir komutu, ajanınızın HTML olarak işleyip PNG’ye dışa aktardığı dizilmiş, markaya uygun bir grafiğe dönüştürür — yinelenebilir, sürümlenebilir ve koltuk başı tasarım araçlarından arınmış.',
    stepsTitle: 'Open Design ile grafikler nasıl çalışır',
    steps: [
      { title: 'Grafiği tarif edin', body: 'Ne olduğunu söyleyin — “başlık ve bir alıntı içeren, lansmanımız için bir Twitter kartı.” Ajan doğru beceriyi yükler, böylece düz bir metin bloğu değil, yerleştirilmiş bir grafik düzenler.', imageAlt: 'Bir kişinin ihtiyaç duyduğu bir sosyal kartı tarif ettiğini gösteren illüstrasyon' },
      { title: 'Marka sistemini uygulayın', body: 'Open Design renklerinizi, yazınızı ve boşluklarınızı yeniden kullanılabilir bir tasarım sisteminden çeker, böylece her kart tek seferlik görünmek yerine markanızın geri kalanıyla eşleşir.', imageAlt: 'Marka renkleri ve yazının bir kart düzenine uygulandığını gösteren illüstrasyon' },
      { title: 'İşleyin ve dışa aktarın', body: 'Grafik tam ihtiyacınız olan boyutlarda HTML olarak işlenir — sosyal kart, kapak, afiş — sonra PNG’ye dışa aktarılır. Net metin, gerçek düzen, elle ince ayar yok.', imageAlt: 'Bir grafiğin işlenip bir görsel dosyasına dışa aktarıldığını gösteren illüstrasyon' },
      { title: 'Tarifi yeniden kullanın', body: 'Bir şablon olduğundan, bir sonraki grafik tek bir komut uzaklıkta — başlığı değiştirin, düzeni koruyun. Kart serileri kusursuz biçimde tutarlı kalır.', imageAlt: 'Bir kart şablonunun tutarlı bir grafik serisi ürettiğini gösteren illüstrasyon' },
    ],
    tableTitle: 'Open Design ile grafikler, eski yönteme karşı',
    tableColCapability: 'İhtiyacınız olan',
    tableColWithOd: 'Open Design ile',
    tableColWithout: 'Tasarım uygulamaları / genel şablonlar',
    tableRows: [
      { capability: 'Fikirden yerleştirilmiş grafiğe geçmek', withOd: 'Tek komut; ajan yazıyı ve düzeni düzenler', without: 'Bir uygulama açın, her öğeyi elle yerleştirin' },
      { capability: 'Markaya uygun kalmak', withOd: 'Yeniden kullanılabilir bir tasarım sisteminden renkler ve yazı', without: 'Her dosyada marka stillerini yeniden seçin ya da markadan sapın' },
      { capability: 'Tutarlı seri', withOd: 'Aynı şablon, yeni metin — kusursuz hizalı bir küme', without: 'Her varyantı elle hizalayın' },
      { capability: 'Dışa aktarma', withOd: 'Tam boyutlarda HTML, PNG’ye dışa aktarılır', without: 'Elle tuval boyutlandırma ve dışa aktarma ayarları' },
      { capability: 'Yinelenebilir', withOd: 'Deponuzda komut güdümlü bir tarif', without: 'Her seferinde yeniden oluşturduğunuz tek seferlik bir dosya' },
      { capability: 'Maliyet ve bağımlılık', withOd: 'Açık kaynak, kendi anahtarlarınızı getirin, yerelde çalışır', without: 'Koltuk başı tasarım aracı ya da şablon pazarı' },
    ],
    featuresTitle: 'Neyi yapabilirsiniz',
    features: [
      { title: "Sosyal kartlar", body: "Başlığınız ve markanızla düzenlenmiş X / Twitter kartları.", thumb: "example-card-twitter" },
      { title: "Makale kapakları", body: "Yazılar ve bültenler için editöryel, dergi tarzı kapaklar.", thumb: "example-article-magazine" },
      { title: "Xiaohongshu kartları", body: "O akış için ayarlanmış RedNote tarzı kartlar.", thumb: "example-card-xiaohongshu" },
      { title: "Hero grafikleri", body: "Siteler ve lansmanlar için akışkan, geçişli hero görselleri.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Karuseller", body: "Kareler boyunca tutarlı kalan çok slaytlı sosyal karuseller.", thumb: "example-social-carousel" },
      { title: "Arayüz maket çerçeveleri", body: "Ürün anlatımı için bildirim ve cihaz çerçeveleri.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'İnsanların Open Design ile oluşturduğu grafikler',
    galleryLead:
      'Bir komuttan işlenmiş gerçek kartlar ve kapaklar. İhtiyacınıza yakın olan birini seçin ve metninizi yerleştirin.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Pastel sosyal kart" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Editöryel üç tonlu afiş" },
      { thumb: "example-magazine-poster", caption: "Dergi tarzı afiş" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Cesur editöryel kapak" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Grafik şablonlarına göz atın',
    faqTitle: 'Görsel SSS',
    faq: [
      { q: 'Bu, Midjourney gibi bir yapay zekâ görsel üreticisi mi?', a: 'Hayır. Open Design grafikleri gerçek düzen ve tipografiyle düzenler — başlığınız, markanız, tam boyutlar — ve PNG olarak dışa aktardığınız HTML olarak işler. Bu, piksel üretimi değil, tasarım düzenlemesidir.' },
      { q: 'Tutarlı bir kart serisi yapabilir miyim?', a: 'Evet. Her grafik bir şablon olduğundan, düzeni korur ve metni değiştirirsiniz, böylece tüm bir seri kusursuz hizalı ve markaya uygun kalır.' },
      { q: 'Hangi boyutları üretebilir?', a: 'Her boyutu — grafik, belirttiğiniz tam boyutlarda işlenir, kare bir sosyal karttan geniş bir afişe kadar, sonra PNG’ye dışa aktarılır.' },
      { q: 'Hangi ajanları kullanabilirim?', a: 'Kendi sağlayıcı anahtarlarınızla Claude Code, Codex, Cursor Agent, Gemini CLI ve daha fazla birinci taraf bağdaştırıcı.' },
    ],
    ctaTitle: 'Bir sonraki grafiğinizi bu gece yapın',
    ctaBody:
      'Depoya yıldız verin, Open Design’ı kurun ve bir komutu markaya uygun bir grafiğe dönüştürün — zaten kullandığınız ajanda.',
  },
  video: {
    title: 'Open Design + Claude Code ile hareketli grafikler ve kısa video oluşturun',
    description:
      'Bir senaryoyu hareketli karelere ve kısa biçimli videoya dönüştürün — marka sisteminizle düzenlenmiş ve HTML’den işlenmiş başlık kartları, hareketli arka planlar ve kapanışlar. Hareketli grafik paketi yok, zaman çizelgesinde sürtme yok.',
    breadcrumb: 'Video',
    label: 'Kullanım örneği · Video',
    heading: 'Hareketli grafikler bir senaryodan gelir, zaman çizelgesinden değil',
    lead: 'İstediğiniz anı tarif edin — bir başlık açılışı, bir veri animasyonu, bir logo kapanışı. Open Design hareketli kareleri marka sisteminizle düzenler ve videoya işler, hareketli grafik paketi gerekmez.',
    heroImageAlt:
      'Bir senaryonun bir dizi hareketli video karesine dönüştüğünü gösteren editöryel illüstrasyon',
    tldrTitle: 'Tek cümlede',
    tldrBody:
      'Open Design bir senaryoyu, ajanınızın kısa biçimli videoya işlediği hareketli, markaya uygun karelere dönüştürür — HTML’den düzenlenir, deponuzda sürümlenir, öğrenilecek bir zaman çizelgesi düzenleyicisi olmadan.',
    stepsTitle: 'Open Design ile hareket nasıl çalışır',
    steps: [
      { title: 'Anı tarif edin', body: 'Ne olması gerektiğini söyleyin — “logomuza çözülen bir glitch başlık, ardından bir kapanış kartı.” Ajan hareket becerisini yükler, böylece statik bir görsel değil, hareketli kareler üretir.', imageAlt: 'Bir kişinin bir hareket dizisini tarif ettiğini gösteren illüstrasyon' },
      { title: 'Marka ve hareket stilini uygulayın', body: 'Open Design kare şablonları sunar — sinematik ışık sızıntıları, glitch başlıklar, logo kapanışları — ve renklerinizi ve yazınızı uygular, böylece hareket kasıtlı ve markaya uygun görünür.', imageAlt: 'Marka stilinin hareketli karelere uygulandığını gösteren illüstrasyon' },
      { title: 'Kareleri videoya işleyin', body: 'Kareler HTML’de düzenlenir ve videoya işlenir, böylece zamanlama ve düzen kesin ve yinelenebilirdir — bir zaman çizelgesinde elle anahtar kare yok.', imageAlt: 'HTML karelerinin bir video klibine işlendiğini gösteren illüstrasyon' },
      { title: 'Yineleyin ve dışa aktarın', body: 'Ajanla konuşarak iyileştirin — “başlık açılışını yavaşlat, bir altyazı ekle.” Sosyal ya da ürün için kısa klipler dışa aktarın. Kaynak projenizde kalır.', imageAlt: 'Bir video klibinin iyileştirilip sosyal için dışa aktarıldığını gösteren illüstrasyon' },
    ],
    tableTitle: 'Open Design ile hareket, eski yönteme karşı',
    tableColCapability: 'İhtiyacınız olan',
    tableColWithOd: 'Open Design ile',
    tableColWithout: 'After Effects / hareket paketleri',
    tableRows: [
      { capability: 'Senaryodan hareketli karelere geçmek', withOd: 'Tek komut; ajan diziyi düzenler', without: 'Her öğeyi bir zaman çizelgesinde elle anahtar kareleyin' },
      { capability: 'Markaya uygun kalmak', withOd: 'Kare şablonları + renkleriniz ve yazınız', without: 'Her projede marka stilini yeniden kurun' },
      { capability: 'Kesin, yinelenebilir zamanlama', withOd: 'HTML’de düzenlenir, belirlenimci biçimde işlenir', without: 'Elle sürtme, yeniden üretmesi zor' },
      { capability: 'Sosyal için dışa aktarma', withOd: 'Videoya işlenen kısa klipler', without: 'Dışa aktarma ön ayarları ve codec boğuşması' },
      { capability: 'Gözden geçirme ve sürümleme', withOd: 'Kare kaynağı deponuzda yaşar, karşılaştırılabilir', without: 'İkili proje dosyası, gerçek bir fark karşılaştırması yok' },
      { capability: 'Maliyet ve bağımlılık', withOd: 'Açık kaynak, kendi anahtarlarınızı getirin, yerelde çalışır', without: 'Pahalı paket, dik öğrenme eğrisi' },
    ],
    featuresTitle: 'Neyi hareketlendirebilirsiniz',
    features: [
      { title: "Hyperframes", body: "HTML’den düzenlenmiş kare kare hareket dizileri.", thumb: "example-video-hyperframes" },
      { title: "Kısa biçimli sosyal", body: "Sosyal akışlar için kurulmuş dikey klipler.", thumb: "example-video-shortform" },
      { title: "Hareket kare kümeleri", body: "Bir klibe düzenlediğiniz yeniden kullanılabilir hareketli kareler.", thumb: "example-motion-frames" },
      { title: "Sinematik ışık sızıntıları", body: "Filmsel geçişler ve atmosferik arka planlar.", thumb: "example-frame-light-leak-cinema" },
      { title: "Glitch başlıklar", body: "Hareket ve dokulu başlık açılışları.", thumb: "example-frame-glitch-title" },
      { title: "Logo kapanışları", body: "Herhangi bir klip için markalı kapanış animasyonları.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'İnsanların Open Design ile oluşturduğu hareket',
    galleryLead:
      'Bir komuttan işlenmiş gerçek hareketli kareler ve klipler. Fikrinize yakın olan birini seçin ve hareketi tarif edin.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Hyperframes dizisi" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Akışkan hareket arka planı" },
      { thumb: "example-frame-macos-notification", caption: "Hareketli arayüz karesi" },
      { thumb: "example-frame-data-chart-nyt", caption: "Hareketli veri grafiği" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Hareket şablonlarına göz atın',
    faqTitle: 'Video SSS',
    faq: [
      { q: 'After Effects ya da bir hareketli grafik paketine ihtiyacım var mı?', a: 'Hayır. Open Design hareketli kareleri HTML’de düzenler ve kodlama ajanınızın içinde videoya işler. Öğrenilecek ya da lisanslanacak bir zaman çizelgesi düzenleyicisi yoktur.' },
      { q: 'Bu ne tür videolar için iyidir?', a: 'Kısa biçimli hareket — başlık kartları, veri animasyonları, logo kapanışları, sosyal klipler. Uzun metrajlı düzenleme için değil, marka ve ürün hareketi için kurulmuştur.' },
      { q: 'Zamanlama yeniden üretilebilir mi?', a: 'Evet. Kareler kodla düzenlenip belirlenimci biçimde işlendiğinden, her seferinde aynı sonucu alırsınız ve bir komutla kesin biçimde ince ayar yapabilirsiniz.' },
      { q: 'Hangi ajanları kullanabilirim?', a: 'Kendi sağlayıcı anahtarlarınızla Claude Code, Codex, Cursor Agent, Gemini CLI ve daha fazla birinci taraf bağdaştırıcı.' },
    ],
    ctaTitle: 'Bir sonraki fikrinizi bu gece hareketlendirin',
    ctaBody:
      'Depoya yıldız verin, Open Design’ı kurun ve bir senaryoyu harekete dönüştürün — zaten kullandığınız ajanda.',
  },
  designSystem: {
    title: 'Open Design + Claude Code ile bir tasarım sistemi kurun ve uygulayın',
    description:
      'Markanızı, kodlama ajanınızın her çıktıya uyguladığı yeniden kullanılabilir bir tasarım sistemi olarak yakalayın — renkler, yazı, bileşenler ve ton, tek bir DESIGN.md içinde. Bir kez tanımlayın; her prototip, deste ve pano markaya uygun kalsın.',
    breadcrumb: 'Tasarım Sistemi',
    label: 'Kullanım örneği · Tasarım Sistemi',
    heading: 'Tek bir tasarım sistemi, ajanınızın yaptığı her şeye uygulanır',
    lead: 'Markanızı bir kez tanımlayın, Open Design onu her çıktıya taşısın — prototipler, desteler, panolar, grafikler. Sistem, deponuzda ajanın okuduğu bir DESIGN.md olarak yaşar, böylece tutarlılık elle değil, otomatiktir.',
    heroImageAlt:
      'Tek bir tasarım sisteminin markaya uygun birçok çıktıya ışıdığını gösteren editöryel illüstrasyon',
    tldrTitle: 'Tek cümlede',
    tldrBody:
      'Open Design markanızı, ajanınızın her çıktıya uyguladığı taşınabilir bir tasarım sistemi olarak yakalar — deponuzda bir kez tanımlanır, her yerde uygulanır, onu denetleyen merkezi bir tasarım aracı olmadan.',
    stepsTitle: 'Open Design ile tasarım sistemleri nasıl çalışır',
    steps: [
      { title: 'Sistemi yakalayın', body: 'Markanızı tarif edin — renkler, yazı, boşluk, ses — ya da çıkarması için ajanı mevcut bir siteye yönlendirin. Open Design bunu projenizde yaşayan bir DESIGN.md içine yazar.', imageAlt: 'Bir markanın tek bir tasarım sistemi dosyasına yakalandığını gösteren illüstrasyon' },
      { title: 'Kanıtlanmış bir temelden başlayın', body: 'Open Design 140’tan fazla referans tasarım sistemi sunar — Apple ve Linear’dan editöryel ve brütaliste. Boş bir sayfadan başlamak yerine markanıza yakın olan birini çatallayın.', imageAlt: 'Bir referans tasarım sistemleri galerisinin gezildiğini gösteren illüstrasyon' },
      { title: 'Her yerde uygulayın', body: 'Diğer her beceri aynı sistemi okur, böylece bir prototip, bir deste ve bir pano tek bir görsel dili paylaşır — onu her seferinde yeniden belirtmeniz gerekmeden.', imageAlt: 'Tek bir sistemin birçok çıktı türüne tutarlı biçimde uygulandığını gösteren illüstrasyon' },
      { title: 'Tek bir yerde geliştirin', body: 'Sistemi değiştirin, bir sonraki işleme bunu her yerde yansıtsın. Deponuzda bir dosya olduğundan, tasarım kararları kod gibi gözden geçirilir ve sürümlenir.', imageAlt: 'Bir tasarım sisteminin güncellenip tüm çıktılara yayıldığını gösteren illüstrasyon' },
    ],
    tableTitle: 'Open Design ile tasarım sistemleri, eski yönteme karşı',
    tableColCapability: 'İhtiyacınız olan',
    tableColWithOd: 'Open Design ile',
    tableColWithout: 'Tasarım aracı kitaplıkları / stil kılavuzları',
    tableRows: [
      { capability: 'Sistemi tanımlamak', withOd: 'Ajanın okuduğu, 140’tan fazla referanstan çatallanan bir DESIGN.md', without: 'Statik bir stil kılavuzu ya da araca bağlı bir kitaplık' },
      { capability: 'Çıktı türleri boyunca uygulamak', withOd: 'Aynı sistem prototipleri, desteleri, panoları, grafikleri besler', without: 'Her araç ve her dosya için yeniden uygulanır' },
      { capability: 'Her şeyi tutarlı tutmak', withOd: 'Otomatik — her beceri tek bir kaynağı okur', without: 'Elle disiplin; zamanla sapar' },
      { capability: 'Markayı geliştirmek', withOd: 'Bir kez düzenleyin; bir sonraki işleme her yerde güncellenir', without: 'Dosyalar ve araçlar boyunca bul-değiştir' },
      { capability: 'Gözden geçirme ve sürümleme', withOd: 'Deponuzda yaşar, kod gibi karşılaştırılabilir', without: 'Bir tasarım aracında gömülü, denetlemesi zor' },
      { capability: 'Maliyet ve bağımlılık', withOd: 'Açık kaynak, taşınabilir, yerelde çalışır', without: 'Bir tasarım aracı aboneliğine kilitli' },
    ],
    featuresTitle: 'Başlayabileceğiniz sistemler',
    features: [
      { title: "Apple", body: "Temiz, ölçülü, sistem yazı tipi estetiği.", thumb: "design-system-apple" },
      { title: "Linear", body: "Sıkı boşlukla net ürün aracı görünümü.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Yumuşak, belge öncelikli, ulaşılabilir.", thumb: "design-system-notion" },
      { title: "Figma", body: "Eğlenceli, renkli, yaratıcı araç enerjisi.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimal, nötr, araştırma düzeyinde.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Yoğun, teknik, geliştirici yerlisi.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Open Design’daki tasarım sistemleri',
    galleryLead:
      'Başlangıç noktası olarak çatallayabileceğiniz 140’tan fazla referans sistemden birkaçı. Markanıza yakın olan birini seçin ve uyarlayın.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Airbnb tarzı sistem" },
      { thumb: "design-system-vercel", caption: "Vercel tarzı sistem" },
      { thumb: "design-system-stripe", caption: "Stripe tarzı sistem" },
      { thumb: "design-system-spotify", caption: "Spotify tarzı sistem" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Tasarım sistemlerine göz atın',
    faqTitle: 'Tasarım Sistemi SSS',
    faq: [
      { q: 'Buradaki tasarım sistemi tam olarak nedir?', a: 'Deponuzda renkleri, yazıyı, boşluğu, bileşenleri ve sesi yakalayan bir DESIGN.md dosyası. Her Open Design becerisi onu okur, böylece markanız ajanın ürettiği her şeye otomatik olarak uygulanır.' },
      { q: 'Sıfırdan başlamak zorunda mıyım?', a: 'Hayır. Open Design çatallayabileceğiniz 140’tan fazla referans tasarım sistemi sunar — Apple ve Linear’dan editöryel ve brütaliste — sonra markanıza uyarlarsınız.' },
      { q: 'Desteler, panolar ve prototipler arasında nasıl tutarlı kalır?', a: 'Çünkü tüm bu beceriler aynı DESIGN.md’yi okur. Sistemi bir kez tanımlayın, tutarlılık elle kovaladığınız bir şey değil, otomatik olsun.' },
      { q: 'Hangi ajanları kullanabilirim?', a: 'Kendi sağlayıcı anahtarlarınızla Claude Code, Codex, Cursor Agent, Gemini CLI ve daha fazla birinci taraf bağdaştırıcı.' },
    ],
    ctaTitle: 'Tasarım sisteminizi bu gece tanımlayın',
    ctaBody:
      'Depoya yıldız verin, Open Design’ı kurun ve ajanınıza her yerde uygulayacağı tek bir marka verin — zaten kullandığınız ajanda.',
  },
};

const UK: SolutionLocaleCopy = {
  prototype: {
    title: 'Створюйте інтерактивні прототипи з Open Design + Claude Code',
    description:
      'Перетворіть підказку на клікабельний багатоекранний прототип, не виходячи з терміналу. Open Design дає вашому агенту з кодування навички дизайну, шаблони та дизайн-систему, щоб випускати справжні прототипи, які можна відкрити в браузері.',
    breadcrumb: 'Прототип',
    label: 'Сценарій · Прототип',
    heading: 'Прототипуйте зі швидкістю підказки',
    lead: 'Опишіть потік, який маєте на думці, і дайте агенту зібрати справжній клікабельний прототип — кілька екранів, спільні стилі та живі взаємодії — відрендерений одразу в HTML, який можна відкрити, поділитися й передати інженерії.',
    heroImageAlt:
      'Редакційна ілюстрація руки, що малює каркас, який перетворюється на клікабельний багатоекранний прототип застосунку',
    tldrTitle: 'Одним рядком',
    tldrBody:
      'Open Design — це шар дизайну для агента з кодування, який ви вже використовуєте. Для прототипування це означає перехід від ідеї в один абзац до навігованого, стилізованого прототипу за один сеанс — без інструмента дизайну, без кроку експорту, без розриву передачі.',
    stepsTitle: 'Як працює прототипування з Open Design',
    steps: [
      {
        title: 'Опишіть потік',
        body: 'Розкажіть агенту простою мовою, що ви будуєте — «потік онбордингу з екраном привітання, вибором тарифу та екраном підтвердження». Open Design завантажує навичку прототипу, тож агент знає, що треба створити екрани, а не одну сторінку.',
        imageAlt:
          'Ілюстрація людини, яка вводить простою мовою опис потоку застосунку в термінал',
      },
      {
        title: 'Згенеруйте стилізовані екрани',
        body: 'Агент застосовує дизайн-систему та шаблони прототипів з Open Design, тож кожен екран має спільну типографіку, відступи й компоненти, а не виглядає чернеткою. Ви отримуєте узгоджений набір екранів, а не розрізнені макети.',
        imageAlt:
          'Ілюстрація кількох екранів застосунку, що з’являються послідовно й мають один узгоджений візуальний стиль',
      },
      {
        title: 'Підключіть взаємодії',
        body: 'Кнопки переходять, вкладки перемикаються, модальні вікна відкриваються. Прототип рендериться в самодостатній HTML, тож поводиться як справжній продукт у будь-якому браузері — для перегляду не потрібен жоден акаунт інструмента прототипування.',
        imageAlt:
          'Ілюстрація курсора, що клікає по пов’язаних екранах, зі стрілками, що показують навігацію між ними',
      },
      {
        title: 'Ітеруйте та передайте',
        body: 'Удосконалюйте, розмовляючи з агентом — «зроби вибір тарифу тристовпцевим макетом». Оскільки артефакт живе у вашому проєкті, дизайн і кінцевий код мають одне джерело істини, закриваючи звичний розрив передачі від дизайнера до інженера.',
        imageAlt:
          'Ілюстрація прототипу, який переглядають і передають інженеру, з дизайном і кодом, що зливаються в один файл',
      },
    ],
    tableTitle: 'Прототипування з Open Design проти старого способу',
    tableColCapability: 'Що вам потрібно',
    tableColWithOd: 'З Open Design',
    tableColWithout: 'Традиційні інструменти прототипування',
    tableRows: [
      {
        capability: 'Від ідеї до першого екрана',
        withOd: 'Одна підказка в агенті, який у вас уже відкритий',
        without: 'Відкрити окремий інструмент, почати файл, перетягувати блоки вручну',
      },
      {
        capability: 'Кілька пов’язаних екранів',
        withOd: 'Генеруються як набір зі спільними стилями та робочою навігацією',
        without: 'Кожен кадр малюється й пов’язується вручну',
      },
      {
        capability: 'Узгоджена візуальна система',
        withOd: 'Береться з повторно використовуваної дизайн-системи, яку застосовує агент',
        without: 'Відтворюється для кожного файлу або підтримується вручну',
      },
      {
        capability: 'Результат, яким можна поділитися',
        withOd: 'Самодостатній HTML — відкривається в будь-якому браузері, без акаунта',
        without: 'Глядачу потрібне місце або посилання для спільного доступу в інструменті постачальника',
      },
      {
        capability: 'Шлях до справжнього коду',
        withOd: 'Артефакт живе у вашому репозиторії; дизайн і код мають одне джерело',
        without: 'Перебудовується з нуля після окремої передачі',
      },
      {
        capability: 'Вартість і прив’язка',
        withOd: 'Відкритий код, власні ключі, працює локально',
        without: 'Передплата за місце, хостинг постачальника, обмежений експорт',
      },
    ],
    featuresTitle: 'Що ви можете прототипувати',
    features: [
      {
        title: 'Багатоекранні вебзастосунки',
        body: 'Повні потоки зі спільною навігацією — онбординг, панелі, налаштування — а не окремі сторінки.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Потоки мобільних застосунків',
        body: 'Мобільні подорожі екран за екраном з переходами й станами, що відчуваються нативно.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Цільові сторінки',
        body: 'Маркетингові сторінки та SaaS-лендінги, якими можна клікати й випускати.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Будь-який візуальний смак',
        body: 'Редакційний, м’який чи бруталістський — прототип несе узгоджений стиль від початку до кінця.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Список очікування та ціни',
        body: 'Поверхні конверсії — списки очікування, цінові таблиці — підключені й у стилі бренду.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Гейміфіковане та грайливе',
        body: 'Насичені взаємодією концепти, де рух і стан — частина презентації.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Прототипи, які люди створили з Open Design',
    galleryLead:
      'Кожен із них починався як підказка й перетворився на клікабельний артефакт. Виберіть шаблон, близький до вашої ідеї, опишіть свою варіацію, і агент її адаптує.',
    gallery: [
      { thumb: "example-dating-web", caption: "Вебзастосунок для знайомств — багатоекранний потік" },
      { thumb: "example-hr-onboarding", caption: "Потік онбордингу HR" },
      { thumb: "example-kami-landing", caption: "Цільова сторінка продукту" },
      { thumb: "example-web-prototype-taste-soft", caption: "Вебпрототип у м’якому стилі" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Переглянути шаблони прототипів',
    faqTitle: 'Поширені запитання про прототипування',
    faq: [
      {
        q: 'Чи потрібен мені інструмент дизайну на кшталт Figma для прототипування з Open Design?',
        a: 'Ні. Open Design працює всередині вашого агента з кодування й рендерить прототипи в HTML. Ви описуєте потік словами; агент створює екрани. Немає окремого полотняного інструмента, який треба вчити чи оплачувати.',
      },
      {
        q: 'Прототипи інтерактивні чи це лише статичні макети?',
        a: 'Інтерактивні. Навігація, вкладки й модальні вікна працюють, бо вивід — це справжній HTML і CSS. Ви можете клікати по ньому в будь-якому браузері точно так, як це робив би користувач.',
      },
      {
        q: 'Яких агентів я можу використовувати?',
        a: 'Open Design працює з Claude Code, Codex, Cursor Agent, Gemini CLI та десятком інших вбудованих адаптерів. Ви приносите власні ключі провайдера; нічого не хоститься за вас.',
      },
      {
        q: 'Чи може прототип стати справжнім продуктом?',
        a: 'Саме в цьому суть. Артефакт живе у вашому проєкті, тож та сама дизайн-система й компоненти переходять у продакшн-код, а не викидаються після передачі.',
      },
    ],
    ctaTitle: 'Прототипуйте свою наступну ідею вже сьогодні ввечері',
    ctaBody:
      'Поставте зірку репозиторію, установіть Open Design і перетворіть своє наступне «а що, якби» на щось клікабельне — в агенті, який ви вже використовуєте.',
  },
  dashboard: {
    title: 'Генеруйте інформаційні панелі з Open Design + Claude Code',
    description:
      'Опишіть метрики, які відстежуєте, і дайте агенту з кодування побудувати стилізовану, адаптивну панель — діаграми, KPI-картки й таблиці, відрендерені в HTML, який можна хостити будь-де. Без місця в BI-інструменті, без конструктора з перетягуванням.',
    breadcrumb: 'Панель',
    label: 'Сценарій · Панель',
    heading: 'Панелі з опису, а не з конструктора перетягування',
    lead: 'Скажіть агенту, що показати й як це має відчуватися. Open Design постачає патерни діаграм, систему макета й візуальну мову, тож ви отримуєте узгоджену, презентабельну панель — а не стіну віджетів зі стандартними стилями.',
    heroImageAlt:
      'Редакційна ілюстрація необроблених чисел ліворуч, що перетікають у чисту панель діаграм і KPI-карток праворуч',
    tldrTitle: 'Одним рядком',
    tldrBody:
      'Open Design перетворює опис ваших метрик простою мовою на стилізовану панель, яку агент рендерить у HTML — версіонується у вашому репозиторії, хоститься будь-де, без передплати BI за місце.',
    stepsTitle: 'Як працюють панелі з Open Design',
    steps: [
      {
        title: 'Опишіть метрики',
        body: 'Перелічіть те, що важливо — «щотижневі активні користувачі, дохід за тарифом, відтік і 30-денний тренд». Агент завантажує навичку панелі, тож знає, що треба розмістити KPI-картки, діаграми й таблицю, а не один блок тексту.',
        imageAlt: 'Ілюстрація людини, яка перелічує метрики, що її цікавлять',
      },
      {
        title: 'Виберіть патерни діаграм',
        body: 'Open Design постачає шаблони діаграм і макетів, тож тренди стають лінійними діаграмами, розбивки — стовпчиками, а співвідношення — правильним візуалом — узгоджена типографіка й відступи всюди, а не невідповідні стандарти.',
        imageAlt: 'Ілюстрація кількох типів діаграм, упорядкованих в узгоджену сітку',
      },
      {
        title: 'Підключіть свої дані',
        body: 'Спрямуйте панель на CSV, кінцеву точку JSON або вставте зразкові рядки. Вона рендериться в самодостатній HTML, що оновлюється разом із даними — відкрийте її в будь-якому браузері, покладіть на будь-який статичний хостинг.',
        imageAlt: 'Ілюстрація файлу даних, що підключається до панелі з оновленням у реальному часі',
      },
      {
        title: 'Удоскональте та випустіть',
        body: 'Налаштовуйте, розмовляючи з агентом — «згрупуй дохід за регіоном, перемісти рядок KPI нагору». Артефакт живе у вашому проєкті, тож панель можна переглядати й версіонувати, як будь-який код.',
        imageAlt: 'Ілюстрація панелі, яку вдосконалюють і потім розгортають',
      },
    ],
    tableTitle: 'Панелі з Open Design проти старого способу',
    tableColCapability: 'Що вам потрібно',
    tableColWithOd: 'З Open Design',
    tableColWithout: 'BI-інструменти / написано вручну',
    tableRows: [
      { capability: 'Від списку метрик до макета', withOd: 'Одна підказка; агент розміщує картки, діаграми й таблиці', without: 'Перетягувати віджети по одному або писати код діаграм з нуля' },
      { capability: 'Узгоджена візуальна система', withOd: 'Патерни діаграм і відступи з повторно використовуваної дизайн-системи', without: 'Стандартні стилі віджетів або стилізація вручну для кожної діаграми' },
      { capability: 'Підключення даних', withOd: 'CSV / JSON / вставлені рядки, відрендерені в живий HTML', without: 'Конектори постачальника або власна обв’язка даних' },
      { capability: 'Хостинг і поширення', withOd: 'Самодостатній HTML на будь-якому статичному хостингу, без акаунта', without: 'Глядачу потрібне місце в BI-постачальника' },
      { capability: 'Перегляд і версіонування', withOd: 'Живе у вашому репозиторії; порівнюється як код', without: 'Замкнено всередині постачальника, без справжнього порівняння' },
      { capability: 'Вартість і прив’язка', withOd: 'Відкритий код, власні ключі, працює локально', without: 'Передплата за місце, хостинг постачальника' },
    ],
    featuresTitle: 'Що ви можете побудувати',
    features: [
      { title: "Продуктова аналітика", body: "Активні користувачі, воронки, утримання — метрики, якими живе продуктова команда.", thumb: "example-dashboard" },
      { title: "Метрики репозиторію та розробки", body: "Зірки, PR, стан CI — інженерні панелі з ваших власних даних.", thumb: "example-github-dashboard" },
      { title: "Фінансові звіти", body: "Дохід, витрати, запас часу, викладені як звіт, яким можна поділитися.", thumb: "example-finance-report" },
      { title: "Живі операції", body: "Метрики в реальному часі, що оновлюються в міру руху базових даних.", thumb: "example-live-dashboard" },
      { title: "Соцмережі та маркетинг", body: "Ефективність каналів і відстеження кампаній в одному поданні.", thumb: "example-social-media-dashboard" },
      { title: "Галузеві звіти", body: "Структуровані звіти для будь-якої галузі — від клінічної до трейдингу.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Панелі, які люди створили з Open Design',
    galleryLead:
      'Справжні панелі, відрендерені з підказки й джерела даних. Почніть з тієї, що близька до вашої, і опишіть метрики, які відстежуєте.',
    gallery: [
      { thumb: "example-data-report", caption: "Звіт даних" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Панель живих операцій" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Панель аналізу трейдингу" },
      { thumb: "example-frame-data-chart-nyt", caption: "Редакційна діаграма даних" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Переглянути шаблони панелей',
    faqTitle: 'Поширені запитання про панелі',
    faq: [
      { q: 'Чи потрібен мені BI-інструмент на кшталт Tableau чи Looker?', a: 'Ні. Open Design рендерить панелі в HTML усередині вашого агента з кодування. Ви описуєте метрики й спрямовуєте його на свої дані; немає окремої BI-платформи, яку треба ліцензувати чи вчити.' },
      { q: 'Звідки беруться дані?', a: 'З CSV, кінцевої точки JSON або рядків, які ви вставляєте. Панель — це чистий HTML і JavaScript, тож ви повністю контролюєте, звідки вона читає — ніщо не проходить через хостинговий сервіс.' },
      { q: 'Чи можуть переглядати нетехнічні колеги?', a: 'Так. Вивід — це самодостатня вебсторінка. Будь-хто з посиланням чи файлом може відкрити її в браузері — без акаунта, без місця.' },
      { q: 'Яких агентів я можу використовувати?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI та десяток інших вбудованих адаптерів. Ви приносите власні ключі провайдера.' },
    ],
    ctaTitle: 'Побудуйте свою панель уже сьогодні ввечері',
    ctaBody:
      'Поставте зірку репозиторію, установіть Open Design і перетворіть свої метрики на панель, яку можна хостити будь-де — в агенті, який ви вже використовуєте.',
  },
  slides: {
    title: 'Генеруйте презентаційні колоди з Open Design + Claude Code',
    description:
      'Перетворіть план на спроєктовану, у стилі бренду колоду слайдів, не відкриваючи застосунок для презентацій. Open Design дає вашому агенту з кодування шаблони колод і візуальну систему, рендерячи слайди в HTML, який можна показувати, експортувати чи поширювати.',
    breadcrumb: 'Слайди',
    label: 'Сценарій · Слайди',
    heading: 'Колоди, що виглядають спроєктованими, написані підказкою',
    lead: 'Передайте агенту план і тон. Open Design застосовує шаблон колоди й візуальну систему, тож кожен слайд викладений, набраний і в стилі бренду — а не список пунктів на порожньому фоні.',
    heroImageAlt:
      'Редакційна ілюстрація плану ліворуч, що перетворюється на послідовність спроєктованих презентаційних слайдів праворуч',
    tldrTitle: 'Одним рядком',
    tldrBody:
      'Open Design перетворює план на спроєктовану HTML-колоду, яку агент рендерить за один сеанс — показуйте її в браузері, експортуйте в PDF чи PPTX і тримайте джерело у своєму репозиторії.',
    stepsTitle: 'Як працюють колоди з Open Design',
    steps: [
      { title: 'Дайте йому план', body: 'Вставте свої тези чи приблизну структуру. Агент завантажує навичку колоди, тож створює послідовність викладених слайдів, а не один довгий документ.', imageAlt: 'Ілюстрація текстового плану, який передають агенту' },
      { title: 'Виберіть стиль колоди', body: 'Open Design постачає шаблони колод — редакційний, швейцарсько-міжнародний, темний технічний тощо. Агент застосовує один, тож типографіка, сітка й акценти лишаються узгодженими на кожному слайді.', imageAlt: 'Ілюстрація кількох варіантів стилів колод, викладених поруч' },
      { title: 'Згенеруйте слайди', body: 'Кожна теза стає спроєктованим слайдом із правильною ієрархією — заголовки, допоміжні візуали, акценти даних. Рендериться в HTML, тож показується на весь екран у будь-якому браузері.', imageAlt: 'Ілюстрація послідовності завершених слайдів з узгодженим стилем' },
      { title: 'Показуйте, експортуйте, ітеруйте', body: 'Показуйте з браузера або експортуйте в PDF / PPTX для поширення. Удосконалюйте, розмовляючи з агентом — «стисни слайд даних, додай фінальний заклик до дії». Джерело колоди лишається у вашому проєкті.', imageAlt: 'Ілюстрація колоди, яку показують і експортують у кілька форматів' },
    ],
    tableTitle: 'Колоди з Open Design проти старого способу',
    tableColCapability: 'Що вам потрібно',
    tableColWithOd: 'З Open Design',
    tableColWithout: 'PowerPoint / Keynote / ШІ-інструменти для слайдів',
    tableRows: [
      { capability: 'Від плану до слайдів', withOd: 'Одна підказка; агент викладає кожен слайд', without: 'Будувати кожен слайд вручну або боротися з шаблоном' },
      { capability: 'Узгоджений дизайн', withOd: 'Шаблони колод зі справжньою сіткою й системою шрифтів', without: 'Дрейф теми, ручне вирівнювання, стандарти поза стилем бренду' },
      { capability: 'Дані й діаграми', withOd: 'Діаграми й акценти рендеряться як частина слайда', without: 'Вставляти статичні зображення або перебудовувати діаграми щоразу' },
      { capability: 'Формати експорту', withOd: 'HTML для показу, плюс експорт у PDF / PPTX', without: 'Замкнено у форматі одного застосунку' },
      { capability: 'Перегляд і версіонування', withOd: 'Джерело живе у вашому репозиторії, порівнюється', without: 'Бінарний файл, без змістовного порівняння' },
      { capability: 'Вартість і прив’язка', withOd: 'Відкритий код, власні ключі, працює локально', without: 'Ліцензія застосунку або ШІ-надбудова за місце' },
    ],
    featuresTitle: 'Що ви можете показати',
    features: [
      { title: "Пітч-колоди", body: "Колоди для інвесторів і продажів із сильним наративом і чистими слайдами даних.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Швейцарський / редакційний", body: "Колоди на основі сітки, типографічні, що виглядають художньо керованими.", thumb: "example-deck-swiss-international" },
      { title: "Модулі курсів", body: "Навчальні колоди з чіткими кроками, акцентами й темпом.", thumb: "example-html-ppt-course-module" },
      { title: "Колоди з діаграмами даних", body: "Темні колоди з акцентом на діаграми для аналітики й оглядів.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Режим доповідача", body: "Колоди у стилі reveal, створені для живого показу в браузері.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Технічні схеми", body: "Архітектурні й знаннєві колоди, що картографують складні системи.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Колоди, які люди створили з Open Design',
    galleryLead:
      'Справжні колоди, відрендерені з плану. Виберіть стиль, близький до вашого виступу, і опишіть зміст.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Редакційна журнальна колода" },
      { thumb: "example-guizang-ppt", caption: "Ілюстрований кейноут" },
      { thumb: "example-deck-open-slide-canvas", caption: "Колода open slide canvas" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Колода з градієнтною темою" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Переглянути шаблони колод',
    faqTitle: 'Поширені запитання про слайди',
    faq: [
      { q: 'Чи потрібен мені PowerPoint або Keynote?', a: 'Ні. Open Design рендерить колоди в HTML усередині вашого агента з кодування й може експортувати в PDF чи PPTX. Ви показуєте з браузера або передаєте файл — для створення не потрібен жоден застосунок для презентацій.' },
      { q: 'Це лише згенеровані ШІ пункти?', a: 'Ні. Агент застосовує справжній шаблон колоди із сіткою, шкалою шрифтів і візуальною ієрархією, тож слайди виглядають спроєктованими, а не автозаповненими.' },
      { q: 'Чи можу я експортувати в PowerPoint для клієнта?', a: 'Так. Колоди експортуються в PPTX і PDF на додачу до HTML, з якого ви показуєте, тож вони підходять під будь-які очікування аудиторії.' },
      { q: 'Яких агентів я можу використовувати?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI та інші вбудовані адаптери, з вашими власними ключами провайдера.' },
    ],
    ctaTitle: 'Побудуйте свою наступну колоду вже сьогодні ввечері',
    ctaBody:
      'Поставте зірку репозиторію, установіть Open Design і перетворіть свій план на спроєктовану колоду — в агенті, який ви вже використовуєте.',
  },
  image: {
    title: 'Генеруйте графіку в стилі бренду з Open Design + Claude Code',
    description:
      'Створюйте соціальні картки, обкладинки статей і маркетингову графіку з підказки — викладену зі справжньою типографікою й вашою системою бренду, відрендерену в чіткий HTML, який можна експортувати в PNG. Без застосунку дизайну, без передплати на шаблони.',
    breadcrumb: 'Зображення',
    label: 'Сценарій · Зображення',
    heading: 'Графіка в стилі бренду, згенерована й викладена за вас',
    lead: 'Опишіть картку чи обкладинку, яка вам потрібна. Open Design компонує її зі справжнім шрифтом, сіткою й кольорами вашого бренду — а потім рендерить у HTML, який можна експортувати як зображення, замість боротьби з застосунком дизайну чи загальним шаблоном.',
    heroImageAlt:
      'Редакційна ілюстрація підказки, що перетворюється на набір викладених соціальних карток і обкладинок статей',
    tldrTitle: 'Одним рядком',
    tldrBody:
      'Open Design перетворює підказку на набрану графіку в стилі бренду, яку агент рендерить у HTML і експортує в PNG — повторювану, версіоновану й вільну від інструментів дизайну за місце.',
    stepsTitle: 'Як працює графіка з Open Design',
    steps: [
      { title: 'Опишіть графіку', body: 'Скажіть, що це — «картка Twitter для нашого запуску із заголовком і цитатою». Агент завантажує потрібну навичку, тож компонує викладену графіку, а не простий блок тексту.', imageAlt: 'Ілюстрація людини, яка описує потрібну їй соціальну картку' },
      { title: 'Застосуйте систему бренду', body: 'Open Design бере ваші кольори, шрифт і відступи з повторно використовуваної дизайн-системи, тож кожна картка відповідає решті вашого бренду, а не виглядає одноразовою.', imageAlt: 'Ілюстрація кольорів бренду й шрифту, що застосовуються до макета картки' },
      { title: 'Відрендеріть і експортуйте', body: 'Графіка рендериться в HTML у точних розмірах, які вам потрібні — соціальна картка, обкладинка, банер — а потім експортується в PNG. Чіткий текст, справжній макет, без ручного підлаштування.', imageAlt: 'Ілюстрація графіки, що рендериться й експортується у файл зображення' },
      { title: 'Повторно використовуйте рецепт', body: 'Оскільки це шаблон, наступна графіка — за одну підказку: змініть заголовок, збережіть макет. Серії карток лишаються бездоганно узгодженими.', imageAlt: 'Ілюстрація одного шаблону картки, що створює узгоджену серію графіки' },
    ],
    tableTitle: 'Графіка з Open Design проти старого способу',
    tableColCapability: 'Що вам потрібно',
    tableColWithOd: 'З Open Design',
    tableColWithout: 'Застосунки дизайну / загальні шаблони',
    tableRows: [
      { capability: 'Від ідеї до викладеної графіки', withOd: 'Одна підказка; агент компонує шрифт і макет', without: 'Відкрити застосунок, розмістити кожен елемент вручну' },
      { capability: 'Лишатися в стилі бренду', withOd: 'Кольори й шрифт з повторно використовуваної дизайн-системи', without: 'Перевибирати стилі бренду для кожного файлу або відхилятися від нього' },
      { capability: 'Узгоджена серія', withOd: 'Той самий шаблон, новий текст — бездоганно вирівняний набір', without: 'Вирівнювати кожен варіант вручну' },
      { capability: 'Експорт', withOd: 'HTML у точних розмірах, експортований у PNG', without: 'Ручне визначення розміру полотна й налаштування експорту' },
      { capability: 'Повторюваність', withOd: 'Рецепт на основі підказок у вашому репозиторії', without: 'Одноразовий файл, який ви відтворюєте щоразу' },
      { capability: 'Вартість і прив’язка', withOd: 'Відкритий код, власні ключі, працює локально', without: 'Інструмент дизайну за місце або маркетплейс шаблонів' },
    ],
    featuresTitle: 'Що ви можете створити',
    features: [
      { title: "Соціальні картки", body: "Картки X / Twitter, скомпоновані з вашим заголовком і брендом.", thumb: "example-card-twitter" },
      { title: "Обкладинки статей", body: "Редакційні обкладинки в журнальному стилі для дописів і розсилок.", thumb: "example-article-magazine" },
      { title: "Картки Xiaohongshu", body: "Картки у стилі RedNote, налаштовані під цю стрічку.", thumb: "example-card-xiaohongshu" },
      { title: "Графіка Hero", body: "Плинні, градієнтні візуали hero для сайтів і запусків.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Каруселі", body: "Багатослайдові соціальні каруселі, що лишаються узгодженими між кадрами.", thumb: "example-social-carousel" },
      { title: "Макетні UI-кадри", body: "Кадри сповіщень і пристроїв для розповіді про продукт.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Графіка, яку люди створили з Open Design',
    galleryLead:
      'Справжні картки й обкладинки, відрендерені з підказки. Виберіть ту, що близька до потрібного, і вставте свій текст.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Пастельна соціальна картка" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Редакційний тритональний постер" },
      { thumb: "example-magazine-poster", caption: "Постер у журнальному стилі" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Смілива редакційна обкладинка" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Переглянути шаблони графіки',
    faqTitle: 'Поширені запитання про зображення',
    faq: [
      { q: 'Це ШІ-генератор зображень на кшталт Midjourney?', a: 'Ні. Open Design компонує графіку зі справжнім макетом і типографікою — ваш заголовок, ваш бренд, точні розміри — і рендерить у HTML, який ви експортуєте як PNG. Це компонування дизайну, а не генерація пікселів.' },
      { q: 'Чи можу я зробити узгоджену серію карток?', a: 'Так. Оскільки кожна графіка — це шаблон, ви зберігаєте макет і змінюєте текст, тож ціла серія лишається бездоганно вирівняною й у стилі бренду.' },
      { q: 'Які розміри вона може створити?', a: 'Будь-які — графіка рендериться в точних розмірах, які ви вказуєте, від квадратної соціальної картки до широкого банера, а потім експортується в PNG.' },
      { q: 'Яких агентів я можу використовувати?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI та інші вбудовані адаптери, з вашими власними ключами провайдера.' },
    ],
    ctaTitle: 'Створіть свою наступну графіку вже сьогодні ввечері',
    ctaBody:
      'Поставте зірку репозиторію, установіть Open Design і перетворіть підказку на графіку в стилі бренду — в агенті, який ви вже використовуєте.',
  },
  video: {
    title: 'Генеруйте моушн-графіку та короткі відео з Open Design + Claude Code',
    description:
      'Перетворіть сценарій на анімовані кадри й коротке відео — титульні картки, рухомі фони й заставки, скомпоновані з вашою системою бренду й відрендерені з HTML. Без пакета моушн-графіки, без перемотування таймлайну.',
    breadcrumb: 'Відео',
    label: 'Сценарій · Відео',
    heading: 'Моушн-графіка зі сценарію, а не з таймлайну',
    lead: 'Опишіть момент, який хочете — розкриття заголовка, анімацію даних, заставку логотипа. Open Design компонує анімовані кадри з вашою системою бренду й рендерить їх у відео, без потреби в пакеті моушн-графіки.',
    heroImageAlt:
      'Редакційна ілюстрація сценарію, що перетворюється на послідовність анімованих відеокадрів',
    tldrTitle: 'Одним рядком',
    tldrBody:
      'Open Design перетворює сценарій на анімовані кадри в стилі бренду, які агент рендерить у коротке відео — скомпоновані з HTML, версіоновані у вашому репозиторії, без таймлайн-редактора, який треба вчити.',
    stepsTitle: 'Як працює моушн з Open Design',
    steps: [
      { title: 'Опишіть момент', body: 'Скажіть, що має статися — «глітч-заголовок, що розчиняється в наш логотип, потім фінальна картка». Агент завантажує навичку моушну, тож створює анімовані кадри, а не статичне зображення.', imageAlt: 'Ілюстрація людини, яка описує моушн-послідовність' },
      { title: 'Застосуйте стиль бренду й моушну', body: 'Open Design постачає шаблони кадрів — кінематографічні засвітки, глітч-заголовки, заставки логотипа — і застосовує ваші кольори й шрифт, тож моушн виглядає навмисним і в стилі бренду.', imageAlt: 'Ілюстрація стилізації бренду, застосованої до анімованих кадрів' },
      { title: 'Відрендеріть кадри у відео', body: 'Кадри компонуються в HTML і рендеряться у відео, тож тайминг і макет точні й повторювані — без ручного встановлення ключових кадрів на таймлайні.', imageAlt: 'Ілюстрація HTML-кадрів, що рендеряться у відеокліп' },
      { title: 'Ітеруйте та експортуйте', body: 'Удосконалюйте, розмовляючи з агентом — «уповільни розкриття заголовка, додай підпис». Експортуйте короткі кліпи для соцмереж чи продукту. Джерело лишається у вашому проєкті.', imageAlt: 'Ілюстрація відеокліпу, який удосконалюють і експортують для соцмереж' },
    ],
    tableTitle: 'Моушн з Open Design проти старого способу',
    tableColCapability: 'Що вам потрібно',
    tableColWithOd: 'З Open Design',
    tableColWithout: 'After Effects / моушн-пакети',
    tableRows: [
      { capability: 'Від сценарію до анімованих кадрів', withOd: 'Одна підказка; агент компонує послідовність', without: 'Ставити ключові кадри для кожного елемента на таймлайні вручну' },
      { capability: 'Лишатися в стилі бренду', withOd: 'Шаблони кадрів + ваші кольори й шрифт', without: 'Перебудовувати стилізацію бренду для кожного проєкту' },
      { capability: 'Точний, повторюваний тайминг', withOd: 'Компонується в HTML, рендериться детерміновано', without: 'Ручне перемотування, важко відтворити' },
      { capability: 'Експорт для соцмереж', withOd: 'Короткі кліпи, відрендерені у відео', without: 'Пресети експорту й боротьба з кодеками' },
      { capability: 'Перегляд і версіонування', withOd: 'Джерело кадрів живе у вашому репозиторії, порівнюється', without: 'Бінарний файл проєкту, без справжнього порівняння' },
      { capability: 'Вартість і прив’язка', withOd: 'Відкритий код, власні ключі, працює локально', without: 'Дорогий пакет, крута крива навчання' },
    ],
    featuresTitle: 'Що ви можете анімувати',
    features: [
      { title: "Hyperframes", body: "Покадрові моушн-послідовності, скомпоновані з HTML.", thumb: "example-video-hyperframes" },
      { title: "Короткий формат для соцмереж", body: "Вертикальні кліпи, створені для соціальних стрічок.", thumb: "example-video-shortform" },
      { title: "Набори моушн-кадрів", body: "Повторно використовувані анімовані кадри, які ви компонуєте в кліп.", thumb: "example-motion-frames" },
      { title: "Кінематографічні засвітки", body: "Кіноподібні переходи й атмосферні фони.", thumb: "example-frame-light-leak-cinema" },
      { title: "Глітч-заголовки", body: "Розкриття заголовків із рухом і текстурою.", thumb: "example-frame-glitch-title" },
      { title: "Заставки логотипа", body: "Брендовані фінальні анімації для будь-якого кліпу.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Моушн, який люди створили з Open Design',
    galleryLead:
      'Справжні анімовані кадри й кліпи, відрендерені з підказки. Виберіть той, що близький до вашої ідеї, і опишіть моушн.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Послідовність Hyperframes" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Плинний моушн-фон" },
      { thumb: "example-frame-macos-notification", caption: "Анімований UI-кадр" },
      { thumb: "example-frame-data-chart-nyt", caption: "Анімована діаграма даних" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Переглянути шаблони моушну',
    faqTitle: 'Поширені запитання про відео',
    faq: [
      { q: 'Чи потрібен мені After Effects або пакет моушн-графіки?', a: 'Ні. Open Design компонує анімовані кадри в HTML і рендерить їх у відео всередині вашого агента з кодування. Немає таймлайн-редактора, який треба вчити чи ліцензувати.' },
      { q: 'Для якого відео це добре підходить?', a: 'Короткий моушн — титульні картки, анімації даних, заставки логотипа, соціальні кліпи. Створено для моушну бренду й продукту, а не для повнометражного монтажу.' },
      { q: 'Чи відтворюваний тайминг?', a: 'Так. Оскільки кадри компонуються в коді й рендеряться детерміновано, ви отримуєте той самий результат щоразу й можете точно налаштувати його підказкою.' },
      { q: 'Яких агентів я можу використовувати?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI та інші вбудовані адаптери, з вашими власними ключами провайдера.' },
    ],
    ctaTitle: 'Анімуйте свою наступну ідею вже сьогодні ввечері',
    ctaBody:
      'Поставте зірку репозиторію, установіть Open Design і перетворіть сценарій на моушн — в агенті, який ви вже використовуєте.',
  },
  designSystem: {
    title: 'Створіть і застосуйте дизайн-систему з Open Design + Claude Code',
    description:
      'Зафіксуйте свій бренд як повторно використовувану дизайн-систему, яку ваш агент з кодування застосовує до кожного артефакту — кольори, шрифт, компоненти й тон в одному DESIGN.md. Визначте раз; кожен прототип, колода й панель лишаються в стилі бренду.',
    breadcrumb: 'Дизайн-система',
    label: 'Сценарій · Дизайн-система',
    heading: 'Одна дизайн-система, застосована до всього, що робить ваш агент',
    lead: 'Визначте свій бренд раз, і Open Design перенесе його в кожен вивід — прототипи, колоди, панелі, графіку. Система живе у вашому репозиторії як DESIGN.md, який читає агент, тож узгодженість автоматична, а не ручна.',
    heroImageAlt:
      'Редакційна ілюстрація однієї дизайн-системи, що випромінюється в багато артефактів у стилі бренду',
    tldrTitle: 'Одним рядком',
    tldrBody:
      'Open Design фіксує ваш бренд як переносну дизайн-систему, яку агент застосовує до кожного артефакту — визначену раз у вашому репозиторії, застосовану всюди, без центрального інструмента дизайну, що її контролює.',
    stepsTitle: 'Як працюють дизайн-системи з Open Design',
    steps: [
      { title: 'Зафіксуйте систему', body: 'Опишіть свій бренд — кольори, шрифт, відступи, голос — або спрямуйте агента на наявний сайт, щоб витягти її. Open Design записує це в DESIGN.md, який живе у вашому проєкті.', imageAlt: 'Ілюстрація бренду, що фіксується в один файл дизайн-системи' },
      { title: 'Почніть з перевіреної основи', body: 'Open Design постачає понад 140 еталонних дизайн-систем — від Apple і Linear до редакційної й бруталістської. Відгалузіть ту, що близька до вашого бренду, замість починати з порожньої сторінки.', imageAlt: 'Ілюстрація перегляду галереї еталонних дизайн-систем' },
      { title: 'Застосовуйте всюди', body: 'Кожна інша навичка читає ту саму систему, тож прототип, колода й панель мають одну візуальну мову — без потреби заново вказувати її щоразу.', imageAlt: 'Ілюстрація однієї системи, застосованої узгоджено до багатьох типів артефактів' },
      { title: 'Розвивайте в одному місці', body: 'Змініть систему, і наступний рендер відобразить це всюди. Оскільки це файл у вашому репозиторії, рішення дизайну переглядаються й версіонуються, як код.', imageAlt: 'Ілюстрація дизайн-системи, яку оновлюють і поширюють на всі виводи' },
    ],
    tableTitle: 'Дизайн-системи з Open Design проти старого способу',
    tableColCapability: 'Що вам потрібно',
    tableColWithOd: 'З Open Design',
    tableColWithout: 'Бібліотеки інструментів дизайну / гайдлайни стилю',
    tableRows: [
      { capability: 'Визначити систему', withOd: 'DESIGN.md, який читає агент, відгалужений від понад 140 еталонів', without: 'Статичний гайдлайн стилю або бібліотека, прив’язана до інструмента' },
      { capability: 'Застосовувати між типами артефактів', withOd: 'Та сама система живить прототипи, колоди, панелі, графіку', without: 'Перевпроваджується для кожного інструмента й кожного файлу' },
      { capability: 'Тримати все узгодженим', withOd: 'Автоматично — кожна навичка читає одне джерело', without: 'Ручна дисципліна; дрейфує з часом' },
      { capability: 'Розвивати бренд', withOd: 'Відредагуйте раз; наступний рендер оновлюється всюди', without: 'Пошук-заміна між файлами й інструментами' },
      { capability: 'Перегляд і версіонування', withOd: 'Живе у вашому репозиторії, порівнюється як код', without: 'Поховано в інструменті дизайну, важко аудитувати' },
      { capability: 'Вартість і прив’язка', withOd: 'Відкритий код, переносна, працює локально', without: 'Прив’язано до передплати інструмента дизайну' },
    ],
    featuresTitle: 'Системи, з яких можна почати',
    features: [
      { title: "Apple", body: "Чиста, стримана естетика із системним шрифтом.", thumb: "design-system-apple" },
      { title: "Linear", body: "Чіткий вигляд продуктового інструмента з тісними відступами.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "М’який, орієнтований на документи, доступний.", thumb: "design-system-notion" },
      { title: "Figma", body: "Грайлива, барвиста енергія творчого інструмента.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Мінімальний, нейтральний, дослідницького рівня.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Щільний, технічний, рідний для розробників.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Дизайн-системи в Open Design',
    galleryLead:
      'Кілька з понад 140 еталонних систем, які можна відгалузити як відправну точку. Виберіть ту, що близька до вашого бренду, і адаптуйте її.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Система у стилі Airbnb" },
      { thumb: "design-system-vercel", caption: "Система у стилі Vercel" },
      { thumb: "design-system-stripe", caption: "Система у стилі Stripe" },
      { thumb: "design-system-spotify", caption: "Система у стилі Spotify" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Переглянути дизайн-системи',
    faqTitle: 'Поширені запитання про дизайн-систему',
    faq: [
      { q: 'Що саме тут є дизайн-системою?', a: 'Файл DESIGN.md у вашому репозиторії, що фіксує кольори, шрифт, відступи, компоненти й голос. Кожна навичка Open Design читає його, тож ваш бренд автоматично застосовується до всього, що створює агент.' },
      { q: 'Чи мушу я починати з нуля?', a: 'Ні. Open Design постачає понад 140 еталонних дизайн-систем, які можна відгалузити — від Apple і Linear до редакційної й бруталістської — а потім адаптувати до вашого бренду.' },
      { q: 'Як вона лишається узгодженою між колодами, панелями й прототипами?', a: 'Тому що всі ці навички читають той самий DESIGN.md. Визначте систему раз, і узгодженість стане автоматичною, а не тим, що ви контролюєте вручну.' },
      { q: 'Яких агентів я можу використовувати?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI та інші вбудовані адаптери, з вашими власними ключами провайдера.' },
    ],
    ctaTitle: 'Визначте свою дизайн-систему вже сьогодні ввечері',
    ctaBody:
      'Поставте зірку репозиторію, установіть Open Design і дайте своєму агенту один бренд, щоб застосовувати всюди — в агенті, який ви вже використовуєте.',
  },
};

const ZH_TW: SolutionLocaleCopy = {
  prototype: {
    title: '用 Open Design + Claude Code 做可互動原型',
    description:
      '一句話描述，就能在終端機裡產生可點擊、多畫面的原型。Open Design 把設計技能、範本和設計系統交給你的編碼 agent，直接產出能在瀏覽器裡開啟的真實原型。',
    breadcrumb: '原型',
    label: '使用情境 · 原型',
    heading: '以一句話的速度做原型',
    lead: '把腦中的流程描述出來，讓 agent 拼出真實可點擊的原型——多個畫面、統一樣式、可互動——直接算繪成 HTML，能開啟、能分享、能交給工程。',
    heroImageAlt: '編輯風插畫：一隻手畫出線框，線框變成可點擊的多畫面應用程式原型',
    tldrTitle: '一句話',
    tldrBody:
      'Open Design 是你正在用的編碼 agent 的設計層。對原型來說，就是在一次對話裡從一段想法走到可導覽、有樣式的原型——不用設計工具、不用匯出、沒有交接斷層。',
    stepsTitle: '用 Open Design 做原型的流程',
    steps: [
      {
        title: '描述流程',
        body: '用白話告訴 agent 你要做什麼——「一個導引流程，含歡迎頁、方案選擇頁和確認頁」。Open Design 會載入原型 skill，讓 agent 知道要產出多個畫面，而不是單頁。',
        imageAlt: '插畫：一個人在終端機裡用自然語言描述應用程式流程',
      },
      {
        title: '產生帶樣式的畫面',
        body: 'agent 套用 Open Design 的設計系統和原型範本，每個畫面共用字體、間距和元件，而不是看起來像草稿。你得到的是一套連貫的畫面，不是互不相干的 mockup。',
        imageAlt: '插畫：多個應用程式畫面依序出現，全部共用同一套視覺風格',
      },
      {
        title: '接上互動',
        body: '按鈕能跳轉、分頁能切換、彈窗能開啟。原型算繪成自包含的 HTML，在任何瀏覽器裡都像真東西一樣運作——檢視它不需要任何原型工具帳號。',
        imageAlt: '插畫：游標在彼此連結的畫面間點擊，箭頭標出頁面之間的跳轉',
      },
      {
        title: '迭代並交付',
        body: '靠跟 agent 對話來改——「把方案選擇頁改成三欄版面」。因為產物就在你的專案裡，設計和最終程式碼共用同一份事實來源，弭平了設計到工程的交接斷層。',
        imageAlt: '插畫：原型被修改後交給工程師，設計與程式碼合併成同一個檔案',
      },
    ],
    tableTitle: '用 Open Design 做原型 vs. 老方法',
    tableColCapability: '你需要什麼',
    tableColWithOd: '用 Open Design',
    tableColWithout: '傳統原型工具',
    tableRows: [
      {
        capability: '從想法到第一個畫面',
        withOd: '在你本來就開著的 agent 裡一句話',
        without: '開啟另一個工具、新建檔案、手動拖框',
      },
      {
        capability: '多個相互連結的畫面',
        withOd: '成套產生，共用樣式、導覽可用',
        without: '每個畫面手動繪製並手動連線',
      },
      {
        capability: '一致的視覺系統',
        withOd: '從可重複使用的設計系統裡取，由 agent 套用',
        without: '每個檔案重做一遍，或純靠手維護',
      },
      {
        capability: '可分享的成果',
        withOd: '自包含 HTML——任何瀏覽器都能開啟，不需帳號',
        without: '檢視者要佔一個席位或要廠商工具的分享連結',
      },
      {
        capability: '通往真實程式碼的路徑',
        withOd: '產物在你的儲存庫裡，設計與程式碼同源',
        without: '一次交接之後從零重建',
      },
      {
        capability: '成本與綁定',
        withOd: '開源、自帶金鑰、本機執行',
        without: '按席位訂閱、廠商代管、匯出受限',
      },
    ],
    featuresTitle: '你能做出哪些原型',
    features: [
      { title: '多畫面 Web 應用程式', body: '帶共用導覽的完整流程——導引、儀表板、設定——而不是單頁。', thumb: 'example-web-prototype' },
      { title: '行動應用程式流程', body: '一畫面接一畫面的行動端旅程，轉場和狀態都有原生感。', thumb: 'example-mobile-app' },
      { title: '到達頁', body: '能點擊、能上線的行銷頁和 SaaS 到達頁。', thumb: 'example-saas-landing' },
      { title: '任意視覺風格', body: '編輯風、柔和風、粗獷主義——原型從頭到尾保持一致風格。', thumb: 'example-web-prototype-taste-editorial' },
      { title: '候補名單與定價', body: '轉換頁——候補名單、定價表——接好線、貼合品牌。', thumb: 'example-waitlist-page' },
      { title: '遊戲化與趣味', body: '互動密集的概念，動效和狀態本身就是賣點。', thumb: 'example-gamified-app' },
    ],
    galleryTitle: '別人用 Open Design 做出來的原型',
    galleryLead:
      '下面每一個都是從一句 prompt 開始、算繪成可點擊產物的。挑一個跟你想法接近的範本，描述你的改法，agent 幫你改。',
    gallery: [
      { thumb: "example-dating-web", caption: "交友 Web 應用程式——多畫面流程" },
      { thumb: "example-hr-onboarding", caption: "HR 到職流程" },
      { thumb: "example-kami-landing", caption: "產品到達頁" },
      { thumb: "example-web-prototype-taste-soft", caption: "柔和風 Web 原型" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '瀏覽原型範本',
    faqTitle: '原型常見問題',
    faq: [
      {
        q: '用 Open Design 做原型需要 Figma 這類設計工具嗎？',
        a: '不需要。Open Design 在你的編碼 agent 裡執行，把原型算繪成 HTML。你用語言描述流程，agent 產出畫面。沒有額外的畫布工具要學或要付費。',
      },
      {
        q: '產出的是可互動原型還是靜態 mockup？',
        a: '可互動。導覽、分頁、彈窗都能用，因為輸出是真實的 HTML 和 CSS。你能在任何瀏覽器裡像使用者一樣點擊體驗。',
      },
      {
        q: '可以用哪些 agent？',
        a: 'Open Design 支援 Claude Code、Codex、Cursor Agent、Gemini CLI 等十多個第一方轉接器。你自帶 provider 金鑰，沒有任何東西替你代管。',
      },
      {
        q: '原型能變成真正的產品嗎？',
        a: '這正是重點。產物就在你的專案裡，同一套設計系統和元件會帶進正式環境程式碼，而不是交接後被丟棄。',
      },
    ],
    ctaTitle: '今晚就把下一個想法做成原型',
    ctaBody:
      '給儲存庫點個 star、裝上 Open Design，在你本來就用的 agent 裡，把下一個「要是……」變成能點擊的東西。',
  },
  dashboard: {
    title: '用 Open Design + Claude Code 產生資料儀表板',
    description:
      '描述你要盯的指標，讓編碼 agent 幫你做出有樣式、響應式的儀表板——圖表、KPI 卡片、表格，全部算繪成可隨處代管的 HTML。不用 BI 工具席位，不用拖放搭建。',
    breadcrumb: '儀表板',
    label: '使用情境 · 儀表板',
    heading: '儀表板靠描述產生，不靠拖放搭建',
    lead: '告訴 agent 要呈現什麼、要什麼感覺。Open Design 提供圖表範式、版面系統和視覺語言，你拿到的是連貫、拿得出手的儀表板，而不是一堆預設樣式的元件。',
    heroImageAlt: '編輯風插畫：左邊的原始數字流向右邊一個乾淨的圖表 + KPI 卡片儀表板',
    tldrTitle: '一句話',
    tldrBody:
      'Open Design 把你對指標的白話描述變成有樣式的儀表板，由 agent 算繪成 HTML——在你的儲存庫裡做版本控管、隨處可代管、無需按席位訂閱 BI。',
    stepsTitle: '用 Open Design 做儀表板的流程',
    steps: [
      {
        title: '描述指標',
        body: '列出你關心的——「週活躍、按方案分的營收、流失率、近 30 天趨勢」。agent 載入儀表板 skill，知道要排佈 KPI 卡片、圖表和表格，而不是一段文字。',
        imageAlt: '插畫：一個人列出自己關心的指標',
      },
      {
        title: '選擇圖表範式',
        body: 'Open Design 自帶圖表和版面範本，趨勢變折線、佔比變長條、比例用對的圖——全程字體和間距統一，而不是一堆不搭的預設樣式。',
        imageAlt: '插畫：多種圖表類型排成一個連貫的格線',
      },
      {
        title: '接入資料',
        body: '把儀表板指向 CSV、JSON 端點，或貼上範例列。它算繪成自包含 HTML，資料變它就變——任何瀏覽器能開啟，任何靜態代管能放。',
        imageAlt: '插畫：一個資料檔案接入即時更新的儀表板',
      },
      {
        title: '打磨並交付',
        body: '靠跟 agent 對話來調——「營收按地區分組、把 KPI 列挪到頂部」。產物在你的專案裡，儀表板像任何程式碼一樣可審查、可版本控管。',
        imageAlt: '插畫：儀表板被打磨後部署上線',
      },
    ],
    tableTitle: '用 Open Design 做儀表板 vs. 老方法',
    tableColCapability: '你需要什麼',
    tableColWithOd: '用 Open Design',
    tableColWithout: 'BI 工具 / 純手寫',
    tableRows: [
      { capability: '從指標清單到版面', withOd: '一句話，agent 排佈卡片、圖表、表格', without: '一個個拖元件，或從零寫圖表程式碼' },
      { capability: '一致的視覺系統', withOd: '圖表範式和間距來自可重複使用設計系統', without: '預設元件樣式，或每張圖手動調' },
      { capability: '接入資料', withOd: 'CSV / JSON / 貼上列，算繪成即時 HTML', without: '廠商連接器或客製資料管線' },
      { capability: '代管與分享', withOd: '自包含 HTML 放任何靜態代管，不要帳號', without: '檢視者要 BI 廠商的席位' },
      { capability: '審查與版本控管', withOd: '在儲存庫裡，像程式碼一樣可 diff', without: '鎖在廠商裡，無法真正 diff' },
      { capability: '成本與綁定', withOd: '開源、自帶金鑰、本機執行', without: '按席位訂閱、廠商代管' },
    ],
    featuresTitle: "你能做出哪些儀表板",
    features: [
      { title: "產品分析", body: "活躍、漏斗、留存——產品團隊天天看的指標。", thumb: "example-dashboard" },
      { title: "儲存庫與研發指標", body: "Star、PR、CI 健康度——用你自己的資料做研發儀表板。", thumb: "example-github-dashboard" },
      { title: "財務報告", body: "營收、消耗、續航，排成可分享的報告。", thumb: "example-finance-report" },
      { title: "即時營運", body: "隨底層資料變動而重新整理的即時指標。", thumb: "example-live-dashboard" },
      { title: "社群與行銷", body: "管道表現和投放追蹤匯於一畫面。", thumb: "example-social-media-dashboard" },
      { title: "領域報告", body: "任意領域的結構化報告——從臨床到交易。", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: '別人用 Open Design 做出來的儀表板',
    galleryLead: '下面是從 prompt + 資料來源算繪出的真實儀表板。挑一個接近你的，描述你要盯的指標。',
    gallery: [
      { thumb: "example-data-report", caption: "資料報告" },
      { thumb: "example-flowai-live-dashboard-template", caption: "即時營運儀表板" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "交易分析儀表板" },
      { thumb: "example-frame-data-chart-nyt", caption: "編輯風資料圖表" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '瀏覽儀表板範本',
    faqTitle: '儀表板常見問題',
    faq: [
      { q: '需要 Tableau、Looker 這類 BI 工具嗎？', a: '不需要。Open Design 在你的編碼 agent 裡把儀表板算繪成 HTML。你描述指標、指向資料，沒有額外的 BI 平台要授權或學習。' },
      { q: '資料從哪來？', a: 'CSV、JSON 端點，或你貼上的列。儀表板是純 HTML + JavaScript，你完全掌控它從哪讀——不經任何代管服務中轉。' },
      { q: '非技術同事能看嗎？', a: '能。產出是自包含網頁，任何人拿到連結或檔案就能在瀏覽器開啟——不要帳號、不要席位。' },
      { q: '可以用哪些 agent？', a: 'Claude Code、Codex、Cursor Agent、Gemini CLI 等十多個第一方轉接器，自帶 provider 金鑰。' },
    ],
    ctaTitle: '今晚就把儀表板做出來',
    ctaBody: '給儲存庫點個 star、裝上 Open Design，把你的指標變成一個隨處可代管的儀表板——在你本來就用的 agent 裡。',
  },
  slides: {
    title: '用 Open Design + Claude Code 產生簡報',
    description:
      '把大綱變成有設計感、符合品牌的投影片，不用開啟任何簡報軟體。Open Design 給編碼 agent 提供 deck 範本和視覺系統，把投影片算繪成可簡報、可匯出、可分享的 HTML。',
    breadcrumb: '投影片',
    label: '使用情境 · 投影片',
    heading: '看起來精心設計的 deck，由一句 prompt 寫出來',
    lead: '把大綱和語氣交給 agent。Open Design 套用 deck 範本和視覺系統，每一頁都排好版、配好字、貼合品牌——不是空白底上的一串要點。',
    heroImageAlt: '編輯風插畫：左邊的大綱變成右邊一連串有設計感的簡報投影片',
    tldrTitle: '一句話',
    tldrBody:
      'Open Design 把大綱變成有設計感的 HTML deck，由 agent 一次產生——瀏覽器裡全螢幕簡報、匯出 PDF 或 PPTX、原始檔留在儲存庫。',
    stepsTitle: '用 Open Design 做 deck 的流程',
    steps: [
      { title: '給它大綱', body: '貼上你的要點或粗略結構。agent 載入 deck skill，產出一連串排好版的投影片，而不是一篇長文件。', imageAlt: '插畫：一份文字大綱被交給 agent' },
      { title: '選一個 deck 風格', body: 'Open Design 自帶 deck 範本——編輯風、瑞士國際主義、深色技術風等。agent 套用其中一個，字體、格線、強調色在每頁之間保持一致。', imageAlt: '插畫：幾種 deck 風格並排展示' },
      { title: '產生投影片', body: '每個要點變成一頁有層次的投影片——標題、輔助視覺、資料重點。算繪成 HTML，任何瀏覽器都能全螢幕簡報。', imageAlt: '插畫：一連串風格一致的成品投影片' },
      { title: '簡報、匯出、迭代', body: '從瀏覽器簡報，或匯出 PDF / PPTX 分享。靠跟 agent 對話來改——「收緊資料頁、加一個結尾行動呼籲」。deck 原始檔留在你的專案裡。', imageAlt: '插畫：一個 deck 被簡報並匯出成多種格式' },
    ],
    tableTitle: '用 Open Design 做 deck vs. 老方法',
    tableColCapability: '你需要什麼',
    tableColWithOd: '用 Open Design',
    tableColWithout: 'PowerPoint / Keynote / AI 投影片工具',
    tableRows: [
      { capability: '從大綱到投影片', withOd: '一句話，agent 排佈每一頁', without: '一頁頁手搭，或跟範本較勁' },
      { capability: '一致的設計', withOd: 'deck 範本帶真實格線和字體系統', without: '主題跑偏、手動對齊、預設樣式不貼品牌' },
      { capability: '資料與圖示', withOd: '圖表和重點作為投影片的一部分算繪', without: '貼靜態圖，或每次重建圖表' },
      { capability: '匯出格式', withOd: 'HTML 簡報，外加 PDF / PPTX 匯出', without: '鎖在某個軟體的格式裡' },
      { capability: '審查與版本控管', withOd: '原始檔在儲存庫裡，可 diff', without: '二進位檔，無法有意義地 diff' },
      { capability: '成本與綁定', withOd: '開源、自帶金鑰、本機執行', without: '軟體授權或按席位的 AI 附加費' },
    ],
    featuresTitle: "你能簡報什麼",
    features: [
      { title: "募資 deck", body: "投資和銷售 deck，敘事有力、資料頁乾淨。", thumb: "example-html-ppt-pitch-deck" },
      { title: "瑞士 / 編輯風", body: "格線驅動、排版講究，看起來像藝術指導過。", thumb: "example-deck-swiss-international" },
      { title: "課程模組", body: "教學 deck，步驟清晰、有重點、有節奏。", thumb: "example-html-ppt-course-module" },
      { title: "資料圖表 deck", body: "深色、圖表為主，適合分析和回顧。", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "簡報者模式", body: "reveal 風格 deck，專為瀏覽器現場簡報而建。", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "技術藍圖", body: "架構和知識 deck，把複雜系統講清楚。", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: '別人用 Open Design 做出來的 deck',
    galleryLead: '下面是從大綱算繪出的真實 deck。挑一個接近你演講風格的，描述內容。',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "編輯雜誌風 deck" },
      { thumb: "example-guizang-ppt", caption: "插畫風主題演講" },
      { thumb: "example-deck-open-slide-canvas", caption: "Open slide canvas deck" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "漸層主題 deck" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '瀏覽 deck 範本',
    faqTitle: '投影片常見問題',
    faq: [
      { q: '需要 PowerPoint 或 Keynote 嗎？', a: '不需要。Open Design 在你的編碼 agent 裡把 deck 算繪成 HTML，還能匯出 PDF 或 PPTX。你從瀏覽器簡報或交付檔案——做的時候不需要任何簡報軟體。' },
      { q: '這只是 AI 產生的要點嗎？', a: '不是。agent 套用帶格線、字級體系和視覺層次的真實 deck 範本，投影片看起來是設計出來的，而不是自動填的。' },
      { q: '能匯出 PowerPoint 給客戶嗎？', a: '能。deck 除了用來簡報的 HTML，還能匯出 PPTX 和 PDF，貼合觀眾的預期。' },
      { q: '可以用哪些 agent？', a: 'Claude Code、Codex、Cursor Agent、Gemini CLI 等第一方轉接器，自帶 provider 金鑰。' },
    ],
    ctaTitle: '今晚就把下一個 deck 做出來',
    ctaBody: '給儲存庫點個 star、裝上 Open Design，把你的大綱變成有設計感的 deck——在你本來就用的 agent 裡。',
  },
  image: {
    title: '用 Open Design + Claude Code 產生貼合品牌的圖片',
    description:
      '從一句 prompt 產出社群卡片、文章封面、行銷圖——用真實排版和你的品牌系統排好版，算繪成可匯出 PNG 的清晰 HTML。不用設計軟體，不用訂閱範本。',
    breadcrumb: '圖片',
    label: '使用情境 · 圖片',
    heading: '貼合品牌的圖片，自動產生並排好版',
    lead: '描述你要的卡片或封面。Open Design 用真實字體、格線和你的品牌色把它組合出來，再算繪成可匯出圖片的 HTML——不用跟設計軟體或通用範本較勁。',
    heroImageAlt: '編輯風插畫：一句 prompt 變成一組排好版的社群卡片和文章封面',
    tldrTitle: '一句話',
    tldrBody:
      'Open Design 把 prompt 變成排好版、貼合品牌的圖片，由 agent 算繪成 HTML 並匯出 PNG——可重複使用、可版本控管，沒有按席位的設計工具。',
    stepsTitle: '用 Open Design 做圖的流程',
    steps: [
      { title: '描述圖片', body: '說清它是什麼——「一張發布用的 Twitter 卡片，帶標題和一句引用」。agent 載入對應 skill，組合出排好版的圖片，而不是純文字塊。', imageAlt: '插畫：一個人描述自己需要的社群卡片' },
      { title: '套用品牌系統', body: 'Open Design 從可重複使用設計系統裡取你的顏色、字體和間距，每張卡片都跟品牌其餘部分一致，而不是各做各的。', imageAlt: '插畫：品牌色和字體被套用到卡片版面上' },
      { title: '算繪並匯出', body: '圖片按你要的精確尺寸算繪成 HTML——社群卡、封面、橫幅——再匯出 PNG。文字清晰、版面真實、不用手動微調。', imageAlt: '插畫：一張圖片算繪並匯出成圖片檔案' },
      { title: '重複使用這套配方', body: '因為它是範本，下一張圖只差一句 prompt——換標題、留版面。成系列的卡片完美一致。', imageAlt: '插畫：一個卡片範本產出一致的系列圖片' },
    ],
    tableTitle: '用 Open Design 做圖 vs. 老方法',
    tableColCapability: '你需要什麼',
    tableColWithOd: '用 Open Design',
    tableColWithout: '設計軟體 / 通用範本',
    tableRows: [
      { capability: '從想法到排好版的圖', withOd: '一句話，agent 組合字體和版面', without: '開啟軟體、手動擺每個元素' },
      { capability: '保持貼合品牌', withOd: '顏色和字體來自可重複使用設計系統', without: '每個檔案重選品牌樣式，或跑偏' },
      { capability: '一致的系列', withOd: '同範本、換文案——完美對齊的一組', without: '每個變體手動對齊' },
      { capability: '匯出', withOd: 'HTML 按精確尺寸，匯出 PNG', without: '手動調畫布尺寸和匯出設定' },
      { capability: '可重複使用', withOd: '儲存庫裡一套 prompt 驅動的配方', without: '每次重做的一次性檔案' },
      { capability: '成本與綁定', withOd: '開源、自帶金鑰、本機執行', without: '按席位的設計工具或範本市集' },
    ],
    featuresTitle: "你能做出哪些圖",
    features: [
      { title: "社群卡片", body: "用你的標題和品牌組合的 X / Twitter 卡片。", thumb: "example-card-twitter" },
      { title: "文章封面", body: "雜誌編輯風的文章和 newsletter 封面。", thumb: "example-article-magazine" },
      { title: "小紅書卡片", body: "為小紅書 feed 調過的卡片樣式。", thumb: "example-card-xiaohongshu" },
      { title: "Hero 主視覺", body: "流動、漸層的 hero 視覺，用於網站和發布。", thumb: "example-frame-liquid-bg-hero" },
      { title: "輪播圖", body: "多圖社群輪播，每幀之間保持一致。", thumb: "example-social-carousel" },
      { title: "UI 示意幀", body: "通知和裝置外框，用於產品敘事。", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: '別人用 Open Design 做出來的圖',
    galleryLead: '下面是從 prompt 算繪出的真實卡片和封面。挑一個接近你需要的，換上你的文案。',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "粉彩社群卡片" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "三色編輯風海報" },
      { thumb: "example-magazine-poster", caption: "雜誌風海報" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "醒目編輯風封面" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '瀏覽圖片範本',
    faqTitle: '圖片常見問題',
    faq: [
      { q: '這是 Midjourney 那種 AI 生圖嗎？', a: '不是。Open Design 用真實版面和排版組合圖片——你的標題、你的品牌、精確尺寸——算繪成 HTML 再匯出 PNG。是設計排版，不是像素生成。' },
      { q: '能做風格一致的系列卡片嗎？', a: '能。因為每張圖都是範本，保留版面換文案，整個系列就完美對齊、貼合品牌。' },
      { q: '能出哪些尺寸？', a: '任意——圖片按你指定的精確尺寸算繪，從正方形社群卡到寬幅橫幅，再匯出 PNG。' },
      { q: '可以用哪些 agent？', a: 'Claude Code、Codex、Cursor Agent、Gemini CLI 等第一方轉接器，自帶 provider 金鑰。' },
    ],
    ctaTitle: '今晚就把下一張圖做出來',
    ctaBody: '給儲存庫點個 star、裝上 Open Design，把一句 prompt 變成貼合品牌的圖片——在你本來就用的 agent 裡。',
  },
  video: {
    title: '用 Open Design + Claude Code 產生動態圖形和短影片',
    description:
      '把腳本變成動畫幀和短影片——標題卡、動態背景、片尾，用你的品牌系統組合並從 HTML 算繪。不用動態圖形套件，不用在時間軸上拖拉。',
    breadcrumb: '影片',
    label: '使用情境 · 影片',
    heading: '動態圖形靠腳本產生，不靠時間軸',
    lead: '描述你想要的那一刻——標題揭示、資料動畫、logo 片尾。Open Design 用你的品牌系統組合動畫幀並算繪成影片，不需要動態圖形套件。',
    heroImageAlt: '編輯風插畫：一份腳本變成一連串動畫影片幀',
    tldrTitle: '一句話',
    tldrBody:
      'Open Design 把腳本變成貼合品牌的動畫幀，由 agent 算繪成短影片——從 HTML 組合、在儲存庫裡做版本控管、不用學時間軸編輯器。',
    stepsTitle: '用 Open Design 做動效的流程',
    steps: [
      { title: '描述那一刻', body: '說清要發生什麼——「一個故障感標題化解成我們的 logo，然後一張結尾卡」。agent 載入動效 skill，產出動畫幀而不是靜態圖。', imageAlt: '插畫：一個人描述一段動效序列' },
      { title: '套用品牌與動效風格', body: 'Open Design 提供幀範本——電影感漏光、故障標題、logo 片尾——並套用你的顏色和字體，讓動效看起來是刻意為之、貼合品牌。', imageAlt: '插畫：品牌樣式被套用到動畫幀上' },
      { title: '把幀算繪成影片', body: '幀在 HTML 裡組合並算繪成影片，時序和版面精確可重現——不用在時間軸上手動打關鍵幀。', imageAlt: '插畫：HTML 幀算繪成一段影片' },
      { title: '迭代並匯出', body: '靠跟 agent 對話來改——「放慢標題揭示、加一行字幕」。匯出短影片用於社群或產品。原始檔留在你的專案裡。', imageAlt: '插畫：一段影片被打磨並匯出用於社群' },
    ],
    tableTitle: '用 Open Design 做動效 vs. 老方法',
    tableColCapability: '你需要什麼',
    tableColWithOd: '用 Open Design',
    tableColWithout: 'After Effects / 動效套件',
    tableRows: [
      { capability: '從腳本到動畫幀', withOd: '一句話，agent 組合整段序列', without: '在時間軸上一個個手打關鍵幀' },
      { capability: '保持貼合品牌', withOd: '幀範本 + 你的顏色和字體', without: '每個專案重建品牌樣式' },
      { capability: '精確可重現的時序', withOd: '在 HTML 裡組合、確定性算繪', without: '手動拖拉，難以重現' },
      { capability: '匯出用於社群', withOd: '短影片算繪成片', without: '匯出預設和編碼格式折騰' },
      { capability: '審查與版本控管', withOd: '幀原始檔在儲存庫裡，可 diff', without: '二進位專案檔，無法真正 diff' },
      { capability: '成本與綁定', withOd: '開源、自帶金鑰、本機執行', without: '昂貴套件、陡峭學習曲線' },
    ],
    featuresTitle: "你能做出哪些動效",
    features: [
      { title: "Hyperframes", body: "用 HTML 組合的逐幀動效序列。", thumb: "example-video-hyperframes" },
      { title: "短影片", body: "為社群 feed 做的直式短片。", thumb: "example-video-shortform" },
      { title: "動效幀組", body: "可重複使用的動畫幀，組合成一段片子。", thumb: "example-motion-frames" },
      { title: "電影感漏光", body: "電影質感的轉場和氛圍背景。", thumb: "example-frame-light-leak-cinema" },
      { title: "故障標題", body: "帶動效和質感的標題揭示。", thumb: "example-frame-glitch-title" },
      { title: "logo 片尾", body: "任意片子都能用的品牌收尾動畫。", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: '別人用 Open Design 做出來的動效',
    galleryLead: '下面是從 prompt 算繪出的真實動畫幀和短片。挑一個接近你想法的，描述動效。',
    gallery: [
      { thumb: "example-hyperframes", caption: "Hyperframes 序列" },
      { thumb: "example-frame-liquid-bg-hero", caption: "流動動態背景" },
      { thumb: "example-frame-macos-notification", caption: "動態 UI 幀" },
      { thumb: "example-frame-data-chart-nyt", caption: "動態資料圖表" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '瀏覽動效範本',
    faqTitle: '影片常見問題',
    faq: [
      { q: '需要 After Effects 或動效套件嗎？', a: '不需要。Open Design 在你的編碼 agent 裡用 HTML 組合動畫幀並算繪成影片。沒有時間軸編輯器要學或要授權。' },
      { q: '這適合做什麼影片？', a: '短影片動效——標題卡、資料動畫、logo 片尾、社群短片。它為品牌和產品動效而生，不是做長片剪輯。' },
      { q: '時序可重現嗎？', a: '可以。因為幀是用程式碼組合、確定性算繪的，每次結果一致，還能用一句 prompt 精確調整。' },
      { q: '可以用哪些 agent？', a: 'Claude Code、Codex、Cursor Agent、Gemini CLI 等第一方轉接器，自帶 provider 金鑰。' },
    ],
    ctaTitle: '今晚就把下一個想法做成動效',
    ctaBody: '給儲存庫點個 star、裝上 Open Design，把一份腳本變成動效——在你本來就用的 agent 裡。',
  },
  designSystem: {
    title: '用 Open Design + Claude Code 搭建並套用設計系統',
    description:
      '把你的品牌沉澱成一套可重複使用的設計系統，讓編碼 agent 套用到每一個產物——顏色、字體、元件、語氣，全在一份 DESIGN.md 裡。定義一次，每個原型、deck、儀表板都貼合品牌。',
    breadcrumb: '設計系統',
    label: '使用情境 · 設計系統',
    heading: '一套設計系統，套用到 agent 做的每一樣東西',
    lead: '把你的品牌定義一次，Open Design 就把它帶進每個產出——原型、deck、儀表板、圖片。系統作為一份 DESIGN.md 留在你的儲存庫裡供 agent 讀取，一致性是自動的，不靠手動維護。',
    heroImageAlt: '編輯風插畫：一套設計系統向外輻射成眾多貼合品牌的產物',
    tldrTitle: '一句話',
    tldrBody:
      'Open Design 把你的品牌沉澱成一套可攜帶的設計系統，agent 套用到每個產物——在儲存庫裡定義一次、處處強制執行，沒有中心化設計工具把關。',
    stepsTitle: '用 Open Design 做設計系統的流程',
    steps: [
      { title: '沉澱系統', body: '描述你的品牌——顏色、字體、間距、語氣——或讓 agent 指向一個現有網站去擷取。Open Design 把它寫進一份留在你專案裡的 DESIGN.md。', imageAlt: '插畫：一個品牌被沉澱進一份設計系統檔案' },
      { title: '從成熟基底起步', body: 'Open Design 自帶 140+ 套參考設計系統——從 Apple、Linear 到編輯風、粗獷主義。fork 一個接近你品牌的，而不是從白紙開始。', imageAlt: '插畫：瀏覽一排參考設計系統' },
      { title: '處處套用', body: '其他每個 skill 都讀同一套系統，所以原型、deck、儀表板共用一套視覺語言——你不用每次重新指定。', imageAlt: '插畫：一套系統一致地套用到多種產物類型' },
      { title: '在一處演進', body: '改一處系統，下一次算繪處處生效。因為它是儲存庫裡的一個檔案，設計決策像程式碼一樣被審查和版本控管。', imageAlt: '插畫：一套設計系統被更新並傳播到所有產出' },
    ],
    tableTitle: '用 Open Design 做設計系統 vs. 老方法',
    tableColCapability: '你需要什麼',
    tableColWithOd: '用 Open Design',
    tableColWithout: '設計工具元件庫 / 風格指南',
    tableRows: [
      { capability: '定義系統', withOd: '一份 agent 讀取的 DESIGN.md，從 140+ 參考 fork', without: '一份靜態風格指南或鎖在工具裡的元件庫' },
      { capability: '跨產物類型套用', withOd: '同一套系統餵給原型、deck、儀表板、圖片', without: '每個工具、每個檔案重做一遍' },
      { capability: '保持一致', withOd: '自動——每個 skill 讀同一個來源', without: '靠人工自律，時間一長就跑偏' },
      { capability: '演進品牌', withOd: '改一次，下次算繪處處更新', without: '跨檔案跨工具尋找取代' },
      { capability: '審查與版本控管', withOd: '在儲存庫裡，像程式碼一樣可 diff', without: '埋在設計工具裡，難以稽核' },
      { capability: '成本與綁定', withOd: '開源、可攜帶、本機執行', without: '鎖在設計工具訂閱裡' },
    ],
    featuresTitle: "可作為起點的系統",
    features: [
      { title: "Apple", body: "乾淨、克制、系統字體的美學。", thumb: "design-system-apple" },
      { title: "Linear", body: "俐落的產品工具風，間距緊湊。", thumb: "design-system-linear-app" },
      { title: "Notion", body: "柔和、文件優先、親和。", thumb: "design-system-notion" },
      { title: "Figma", body: "活潑、多彩、創意工具的能量。", thumb: "design-system-figma" },
      { title: "OpenAI", body: "極簡、中性、研究級。", thumb: "design-system-openai" },
      { title: "GitHub", body: "密集、技術、開發者原生。", thumb: "design-system-github" },
    ],
    galleryTitle: 'Open Design 裡的設計系統',
    galleryLead: '下面是 140+ 套參考系統裡的幾個，可作為起點 fork。挑一個接近你品牌的去改。',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Airbnb 風格系統" },
      { thumb: "design-system-vercel", caption: "Vercel 風格系統" },
      { thumb: "design-system-stripe", caption: "Stripe 風格系統" },
      { thumb: "design-system-spotify", caption: "Spotify 風格系統" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: '瀏覽設計系統',
    faqTitle: '設計系統常見問題',
    faq: [
      { q: '這裡的設計系統具體是什麼？', a: '儲存庫裡一份 DESIGN.md，沉澱顏色、字體、間距、元件和語氣。每個 Open Design skill 都讀它，所以 agent 產出的任何東西都自動套用你的品牌。' },
      { q: '必須從零開始嗎？', a: '不必。Open Design 自帶 140+ 套參考設計系統可 fork——從 Apple、Linear 到編輯風、粗獷主義——再貼合你的品牌。' },
      { q: '怎麼在 deck、儀表板、原型之間保持一致？', a: '因為這些 skill 都讀同一份 DESIGN.md。定義一次，一致性就是自動的，而不是靠手動盯著。' },
      { q: '可以用哪些 agent？', a: 'Claude Code、Codex、Cursor Agent、Gemini CLI 等第一方轉接器，自帶 provider 金鑰。' },
    ],
    ctaTitle: '今晚就定義你的設計系統',
    ctaBody: '給儲存庫點個 star、裝上 Open Design，給你的 agent 一套處處套用的品牌——在你本來就用的 agent 裡。',
  },
};

const BY_LOCALE: Partial<Record<LandingLocaleCode, SolutionLocaleCopy>> = {
  en: EN,
  zh: ZH,
  'zh-tw': ZH_TW,
  ja: JA,
  ko: KO,
  de: DE,
  fr: FR,
  ru: RU,
  es: ES,
  'pt-br': PT_BR,
  it: IT,
  vi: VI,
  pl: PL,
  id: ID,
  nl: NL,
  ar: AR,
  tr: TR,
  uk: UK,
};

/**
 * Resolve a Solution page's copy for a locale, falling back to English for
 * any locale not yet translated. Returns `undefined` only if the page key
 * itself does not exist in English (a programming error).
 */
export function getSolutionPageCopy(
  locale: LandingLocaleCode,
  key: SolutionPageKey,
): SolutionPageCopy {
  const localized = BY_LOCALE[locale]?.[key];
  if (localized) return localized;
  return BY_LOCALE[DEFAULT_LOCALE]![key]!;
}
