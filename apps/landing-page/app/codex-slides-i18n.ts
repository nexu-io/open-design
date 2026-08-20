/*
 * `/codex-slides/` — sister-project landing page copy.
 *
 * Codex Slides (github.com/nexu-io/codex-slides) is the third product in the
 * Product menu next to HTML Anything and HTML Video: an open-source, image-native
 * AI slide studio that runs *inside* Codex. You describe a deck (or point it at a
 * repo / a pile of files), Codex opens the Browser-first studio, and the whole
 * chain stays visible and steerable — research → outline → style → render → edit
 * → present → export PPTX/PDF. It runs on an existing `codex login`, so there is
 * no separate API key, and every project stays on the user's disk.
 *
 * SEO surface: the head terms are "Codex Slides" (brand), "AI slide generator" /
 * "AI presentation maker" (category), and "open source Gamma alternative" (the
 * comparison query the README itself leads with). Long-tail like "AI PPTX export",
 * "slides from a repo", and "Codex plugin" is seeded through the section copy.
 *
 * Structure mirrors `community-i18n.ts`: `en` is the authoritative base, every
 * other locale is a DeepPartial override translated by an Agent and merged over
 * it, so an untranslated string falls back to English instead of breaking the
 * layout. Non-translatable facts (counts, install commands, export formats,
 * image paths) live in the page itself, never duplicated per language.
 */
import { DEFAULT_LOCALE, type LandingLocaleCode } from './i18n';
import { CODEX_SLIDES_OVERRIDES } from './codex-slides-locales';

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[]
    ? U[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/** Deep-merge a locale override over the English base; arrays replace wholesale. */
function mergeCopy<T>(base: T, override: DeepPartial<T> | undefined): T {
  if (!override) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const baseValue = out[key];
    if (
      baseValue &&
      value &&
      typeof baseValue === 'object' &&
      typeof value === 'object' &&
      !Array.isArray(baseValue) &&
      !Array.isArray(value)
    ) {
      out[key] = mergeCopy(baseValue, value as DeepPartial<typeof baseValue>);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

type CopyPair = { headline: string; body: string };
type StepCopy = CopyPair & { step: string };
type TileCopy = { alt: string; tag: string };
type NamedCopy = { name: string; blurb: string };
type FormatRow = { label: string; values: string };

export type CodexSlidesCopy = {
  title: string;
  description: string;
  label: string;
  heading: string;
  lead: string;
  /** Primary CTA label. Names OpenDesign explicitly (this is a sister-product
   * page, so the generic shared "Download desktop" would be ambiguous). */
  downloadCta: string;
  heroAlt: string;

  glanceAria: string;
  glance: {
    stars: string;
    templates: string;
    styles: string;
    scenarios: string;
    license: string;
  };

  whyTitle: string;
  whyLead: string;
  ideas: CopyPair[];

  flowTitle: string;
  flowLead: string;
  flow: StepCopy[];

  showcaseTitle: string;
  showcaseLead: string;
  showcase: [TileCopy, TileCopy, TileCopy, TileCopy, TileCopy, TileCopy];

  insideTitle: string;
  insideLead: string;
  inside: [TileCopy, TileCopy, TileCopy, TileCopy];

  scenariosTitle: string;
  scenariosLead: string;
  scenarios: NamedCopy[];

  formatsTitle: string;
  formatsLead: string;
  formatsRows: [FormatRow, FormatRow, FormatRow];

  duoTitle: string;
  fastTitle: string;
  fastLead: string;
  installTitle: string;
  installLead: string;

  finalEyebrow: string;
  tiebackTitle: string;
  tiebackBody: string;

  schemaAlternateName: string;
  schemaWhatQuestion: string;
  schemaWhatAnswer: string;
  schemaKeyQuestion: string;
  schemaKeyAnswer: string;
  schemaExportQuestion: string;
  schemaExportAnswer: string;
  schemaRelationQuestion: string;
  schemaRelationAnswer: string;
};

const EN: CodexSlidesCopy = {
  title: 'Codex Slides — the open-source AI slide studio inside Codex · PPTX & PDF',
  description:
    'Codex Slides is an open-source AI slide studio that lives inside Codex. Describe a deck — or point it at a repo, a PDF, or a spreadsheet — and your local Codex researches, outlines, styles, renders, and exports a real PPTX and print-ready PDF. Every slide is a full visual canvas. 45 deck templates, 73 community styles, 24 guided scenarios, Fast mode renders 10+ slides in about 4–5 minutes. Browser-first, MIT-licensed, runs on your existing codex login with zero extra API keys.',
  label: 'Sister project',
  heading: 'The AI slide studio inside your coding agent',
  lead:
    'Most AI slide generators hide the work behind one request and hand back a file. Codex Slides keeps the whole chain live inside Codex: research, outline, visual direction, render, edit, present, and export. Every deck stays a durable project on your own disk, and because it is image-native, each slide is a full visual canvas rather than a template with the text swapped out.',
  downloadCta: 'Download OpenDesign',
  heroAlt:
    'Codex Slides: Codex on the left driving the slide studio in the browser, a rendered market-report slide on the right',

  glanceAria: 'At a glance',
  glance: {
    stars: 'GitHub stars',
    templates: 'Deck templates',
    styles: 'Community styles',
    scenarios: 'Guided scenarios',
    license: 'License',
  },

  whyTitle: 'Why this exists',
  whyLead:
    'A deck is not a one-shot generation problem. It is a series of decisions about what to say, in what order, and in what visual language, and each one is cheaper to fix before the render than after it.',
  ideas: [
    {
      headline: 'You watch it happen instead of waiting for a file.',
      body: 'Codex opens the studio in its Browser and keeps it visible. You confirm the brief, revise the outline, and approve the visual direction before a single page renders, so the expensive mistakes get caught while they are still cheap.',
    },
    {
      headline: 'Every deck is a durable project, not a download.',
      body: 'Conversation, sources, outline, brand rules, checkpoints, and rendered pages all persist on disk. Come back tomorrow and keep editing the same project; every AI command and manual edit leaves an immutable checkpoint you can inspect, restore, or export.',
    },
    {
      headline: 'Image-native: the slide is the canvas.',
      body: 'Each page is composed as one full visual canvas rather than a text box dropped on a theme, which is why the output holds up next to hand-designed decks. Mark up a slide directly and regenerate just that page from your annotations.',
    },
  ],

  flowTitle: 'How it works',
  flowLead:
    'One prompt in, a presentation-ready deck out, with a checkpoint at every step where your judgment is worth more than another model call.',
  flow: [
    { step: '01', headline: 'Clarify the brief', body: 'A tailored questions form confirms audience, page count, aspect ratio, language, resolution, and visual intent before any writing starts.' },
    { step: '02', headline: 'Research the facts', body: 'Optional multi-round web research produces a source-backed Markdown brief that stays inspectable and editable in Design Files.' },
    { step: '03', headline: 'Shape the outline', body: 'Edit every title and talking point, add or drop slides, reorder the story, or ask the agent to restructure it before the visuals exist.' },
    { step: '04', headline: 'Lock the visual direction', body: 'Codex Slides ranks its style library against your topic and outline. Pick one, search the full catalog, or keep the default.' },
    { step: '05', headline: 'Render in parallel', body: 'Fast mode fans every page out at once instead of one by one, so a 10-slide deck lands in about four to five minutes while the direction stays locked.' },
    { step: '06', headline: 'Edit in place', body: 'Ask for a rewrite, mark a region with arrows and comments, replace an image, reorder pages, set transitions, and write speaker notes.' },
    { step: '07', headline: 'Present and export', body: 'Run Presenter Mode with a synchronized audience window and timer, then download a real PPTX and a print-ready PDF with notes preserved.' },
  ],

  showcaseTitle: 'What the decks look like',
  showcaseLead:
    'Every card is a visual system that ships with Codex Slides: a finished direction you can start from, then swap in your own topic, audience, or files.',
  showcase: [
    { alt: 'Business and market report deck with charts and KPI callouts', tag: 'Market report · charts & KPIs' },
    { alt: 'Data dashboard deck with a world map, donut chart, and metric tiles', tag: 'Data story · dashboard' },
    { alt: 'Cinematic product keynote slide with a high-contrast title moment', tag: 'Keynote · cinematic' },
    { alt: 'Editorial magazine-style deck with serif headlines and a print grid', tag: 'Editorial · print grid' },
    { alt: 'Bright airy product keynote slide with soft 3D diagram nodes and one indigo accent', tag: 'Keynote · clean daylight' },
    { alt: 'Labeled technical cutaway slide reconstructing a system as a cross-section', tag: 'Technical · labeled cutaway' },
  ],

  insideTitle: 'See the real product',
  insideLead:
    'These are the actual screens Codex drives in its Browser, the same ones you would use by hand, so you can step in and take over at any point.',
  inside: [
    { alt: 'Codex Slides home with the prompt composer, scenario shortcuts, and community styles', tag: 'Home · describe your deck' },
    { alt: 'Scenario library with pre-configured presentation workflows', tag: 'Scenarios · pick a workflow' },
    { alt: 'Editable presentation outline with titles and talking points', tag: 'Outline · shape the story' },
    { alt: 'Slide editor with the full canvas in view, toolbar, speaker notes, and thumbnails', tag: 'Editor · full canvas' },
  ],

  scenariosTitle: 'Six workflow groups',
  scenariosLead:
    'Twenty-four guided scenarios, bundled into six workflow groups. Each group brings its own questions, source slots, and visual grammar. Start from one, or just describe what you need.',
  scenarios: [
    { name: 'Create from scratch', blurb: 'Business reports, pitch decks, and project proposals from a single brief.' },
    { name: 'Transform a source', blurb: 'Beautify an existing PPTX, HTML, or PDF; turn documents, notes, or a whiteboard photo into slides.' },
    { name: 'Data & insights', blurb: 'Dashboards, recurring performance reports, financial results, and survey readouts.' },
    { name: 'Research & decisions', blurb: 'Deep research presentations, market studies, competitive analyses, literature reviews.' },
    { name: 'Optimize a deck', blurb: 'Apply a brand system, recreate a reference style, translate and localize, compress or expand.' },
    { name: 'Specialized outputs', blurb: 'Training courseware, launch keynotes, portfolios and case studies, template-driven batches.' },
  ],

  formatsTitle: 'Real files you can hand off',
  formatsLead:
    'When the deck looks right, export a genuine PowerPoint (.pptx) and a print-ready PDF, both keeping your speaker notes. Choose the render quality and the shape that fits the room or the feed:',
  formatsRows: [
    { label: 'Export formats', values: 'PowerPoint (.pptx) · PDF · speaker notes kept' },
    { label: 'Render quality', values: '1K · 2K · 4K' },
    { label: 'Aspect ratios', values: '16:9 · 4:3 · 1:1 · 9:16 · 3:4' },
  ],

  duoTitle: 'Fast and frictionless',
  fastTitle: 'Fast mode',
  fastLead:
    'Pages render in parallel, up to four at a time with the rest queued, instead of one after another, while the approved outline and visual direction stay locked. A ten-slide deck typically lands in about four to five minutes, and an interrupted run resumes from the saved project state rather than starting over.',
  installTitle: 'Install in Codex',
  installLead:
    'Add the repository as a plugin marketplace, install the plugin, restart Codex, and start a new task. You need Codex with plugin support, Node.js 20 or newer, and one `codex login`. No separate OpenAI key and no `.env` file for the default workflow.',

  finalEyebrow: 'Next step',
  tiebackTitle: 'Part of the OpenDesign family',
  tiebackBody:
    'OpenDesign is the open, local-first design workspace that sits outside the coding agent you already use. Codex Slides is that same idea aimed at presentations: your agent does the work in the open, the project stays on your machine, and nothing is locked behind a subscription. For the full design toolkit beyond slides, get the OpenDesign app.',

  schemaAlternateName: 'The open-source AI slide studio inside Codex',
  schemaWhatQuestion: 'What is Codex Slides?',
  schemaWhatAnswer:
    'Codex Slides is an open-source, MIT-licensed AI slide studio that runs as a plugin inside Codex. It turns a prompt, a repository, or a set of files into a presentation-ready deck through a visible workflow (clarification, optional research, outline, visual direction, parallel rendering, editing, presenting, and PPTX/PDF export) and keeps every deck as a durable project on your own disk.',
  schemaKeyQuestion: 'Does Codex Slides need a separate API key?',
  schemaKeyAnswer:
    'No. It runs on the ChatGPT account you already authenticated with `codex login`. The default workflow needs no separate OpenAI API key and no `.env` file; it requires Codex with plugin support, Node.js 20 or newer, and Git.',
  schemaExportQuestion: 'Can Codex Slides export real PowerPoint files?',
  schemaExportAnswer:
    'Yes. Codex Slides exports a real PPTX and a print-ready PDF, both preserving the project\'s speaker notes, at 1K/2K/4K render quality across five aspect ratios (16:9, 4:3, 1:1, 9:16, 3:4). Because it is image-native, exported PPTX slides contain full-slide images rather than individually editable PowerPoint shapes; editable-shape export is planned.',
  schemaRelationQuestion: 'Is Codex Slides related to OpenDesign?',
  schemaRelationAnswer:
    'Yes. Codex Slides is a sister project from the team behind OpenDesign, the same open, local-first, agent-native approach applied to presentations instead of design files.',
};

export function getCodexSlidesCopy(locale: LandingLocaleCode): CodexSlidesCopy {
  if (locale === DEFAULT_LOCALE) return EN;
  return mergeCopy(EN, CODEX_SLIDES_OVERRIDES[locale]);
}

export { EN as CODEX_SLIDES_EN };
