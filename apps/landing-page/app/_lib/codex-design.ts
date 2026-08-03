/*
 * Data model for the curated "Codex design" collection under
 * `/plugins/codex-design/`.
 *
 * Unlike the rest of `/plugins/*`, these are NOT Open Design bundled
 * plugins — they are real, external, verified skills and resources for
 * doing design work with OpenAI Codex (openai/skills, MengTo/Skills,
 * etc.). The collection positions Open Design as the home for designing
 * with Codex and drives to the client download + the curated
 * `codex-design` list.
 *
 * English is the baseline here; per-locale copy is layered on top via
 * `codex-design-i18n.ts` (falls back to English on any miss), matching
 * the `plugins-i18n.ts` strategy. Every entry below is verified against
 * a real upstream source — do not add anything that can't be linked.
 */

// Catalogue of 50 curated Codex design plugins.
export const AWESOME_REPO_URL = 'https://github.com/nexu-io/codex-design';
export const OD_DOWNLOAD_URL = '/download/';
export const OD_GUIDE_HREF = '/agents/codex-design/';

export type CodexSkillCategory = 'Frontend & UI' | 'Design Systems';

export interface CodexSkillLink {
  readonly label: string;
  readonly url: string;
}

/**
 * `installer`: run `command` inside Codex, then restart it.
 * `clone`: clone the repo, then point Codex at `skillPath`.
 */
export type CodexInstall =
  | { readonly kind: 'installer'; readonly command: string }
  | { readonly kind: 'clone'; readonly command: string; readonly skillPath: string };

export interface CodexSkill {
  /** Route slug under /plugins/codex-design/<slug>/ */
  readonly slug: string;
  readonly name: string;
  readonly category: CodexSkillCategory;
  /** Short attribution shown as a badge: "Official" for openai/skills, else author. */
  readonly badge: string;
  /** One-line promise. */
  readonly tagline: string;
  /** Illustration under /plugins/codex-design/skills/<file>. */
  readonly image: string;
  /** 1–2 sentence "what it is". */
  readonly whatIsIt: string;
  /** Why it matters for *design* specifically (bullets). */
  readonly whyForDesign: readonly string[];
  /** How you run it with Codex — plain steps. */
  readonly howWithCodex: readonly string[];
  /** Optional worked example / when-to-reach-for-it note. */
  readonly example?: string;
  /** Canonical upstream source (repo / folder). */
  readonly source: CodexSkillLink;
  /** `owner/name` of the source repo, used to look up snapshotted GitHub stats. */
  readonly repo: string;
  /**
   * How this plugin is actually installed. The two upstream catalogues differ:
   * openai/skills ships a `$skill-installer` you run inside Codex, while
   * MengTo/Skills is a plain folder collection you clone and point Codex at.
   * Commands are verbatim from each repo's README and are never translated.
   */
  readonly install: CodexInstall;
  /**
   * Licence the upstream skill ships under. Not uniform across the catalogue:
   * MengTo/Skills is MIT, while the official Figma skills are governed by the
   * Figma Developer Terms, so this is per-skill rather than per-repo.
   */
  readonly license: CodexSkillLink;
  /** The `description` from the upstream SKILL.md frontmatter, verbatim. */
  readonly upstreamDescription: string;
  /**
   * What the upstream SKILL.md actually covers, taken from its own section
   * headings. Kept in English in every locale: these are the headings a reader
   * will meet when they open the file.
   */
  readonly covers: readonly string[];
  /** Optional extra reference (docs, author). */
  readonly reference?: CodexSkillLink;
  /**
   * Filing tags shown in the detail sidebar. Technical terms kept in English
   * across every locale: they are the vocabulary of the upstream catalogues
   * these skills come from, and are how people search for them.
   */
  readonly tags: readonly string[];
  /** Stargazers on the source repo, from a snapshot; shown as a popularity signal. */
  readonly stars?: number;
  /** How we know it works with Codex, quoting the repo's own README. */
  readonly codexNote?: string;
  /** Social/video traction with a number, for the popularity line. */
  readonly social?: string;
  /** When several upstream units are catalogued as one entry, what they are. */
  readonly bundle?: string;
}

export interface CodexCollection {
  readonly eyebrow: string;
  readonly heading: string;
  readonly lede: string;
  readonly stats: readonly { readonly value: string; readonly label: string }[];
  /** Intro paragraph above the skills grid. */
  readonly intro: string;
  /** "Why these" framing shown before the grid. */
  readonly categories: readonly { readonly key: CodexSkillCategory; readonly blurb: string }[];
}

export const CODEX_COLLECTION: CodexCollection = {
  eyebrow: 'Codex design',
  heading: 'The design plugins that make Codex ship real UI',
  lede: 'OpenAI Codex writes working code. Left alone it defaults to safe fonts, average spacing, and centered Helvetica. These are the plugins that give it taste: aesthetic skills and design-system rules. Install one, or run all of them inside Open Design.',
  stats: [
    { value: '50', label: 'curated plugins' },
    { value: '13', label: 'source repos' },
    { value: 'Open', label: 'source & verified' },
  ],
  intro:
    'Every plugin below is real and links to its source. They fall into two jobs: set aesthetic taste before code, and lock your design system into rules the agent obeys.',
  categories: [
    {
      key: 'Frontend & UI',
      blurb: 'Override Codex’s default aesthetic decisions before a single line is written.',
    },
    {
      key: 'Design Systems',
      blurb: 'Turn your tokens and components into rules Codex follows instead of inventing.',
    },
  ],
};

export const CODEX_SKILLS: readonly CodexSkill[] = [
  {
    slug: 'gpt-taste',
    name: 'gpt-taste',
    category: 'Frontend & UI',
    badge: 'Leonxlnx',
    stars: 65936,
    tagline: 'Builds award-style landing pages with GSAP scroll motion and gapless bento grids.',
    image: '/plugins/codex-design/skills/gpt-taste.webp',
    whatIsIt:
      'A frontend directive that forces layout variance via simulated random selection of hero, typography, components, and GSAP paradigms. It also enforces AIDA page structure and large section spacing.',
    whyForDesign: [
      'Hero headlines stay two or three lines because containers widen instead of wrapping into walls.',
      'Bento grids use grid-flow-dense, so no cell is left empty or broken.',
      'Cheap meta-labels are banned and button text contrast is verified before output.',
    ],
    howWithCodex: [
      'Ask for a page; the skill emits a design_plan block before any UI code.',
      'Review its randomization picks: hero layout, font stack, components, GSAP paradigms.',
      'Check the pre-flight items: hero width math, grid density, label sweep, contrast.',
    ],
    covers: [
      'Python-driven true randomization',
      'AIDA structure and spacing',
      'Hero architecture and the 2-line iron rule',
      'The gapless bento grid',
      'Advanced GSAP motion and hover physics',
      'Content, assets and strict bans',
    ],
    tags: [
      'GSAP',
      'Bento grid',
      'Landing pages',
      'Typography',
      'Motion',
    ],
    codexNote: 'Codex named 8× in the README',
    social: 'X @MengTo 1,716♥ · YT Chase AI 94,671',
    repo: 'Leonxlnx/taste-skill',
    install: { kind: 'clone', command: 'git clone https://github.com/Leonxlnx/taste-skill', skillPath: 'skills/gpt-tasteskill/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Elite UX/UI & Advanced GSAP Motion Engineer. Enforces Python-driven true randomization for layout variance, strict AIDA page structure, wide editorial typography (bans 6-line wraps), gapless bento grids, strict GSAP Scro',
    source: { label: 'Leonxlnx/taste-skill · skills/gpt-tasteskill', url: 'https://github.com/Leonxlnx/taste-skill/tree/HEAD/skills/gpt-tasteskill' },
  },
  {
    slug: 'stitch-design-taste',
    name: 'Stitch Design Taste',
    category: 'Design Systems',
    badge: 'Leonxlnx',
    stars: 65936,
    tagline: 'Writes a DESIGN.md that steers Google Stitch toward non-generic screens.',
    image: '/plugins/codex-design/skills/stitch-design-taste.webp',
    whatIsIt:
      'Generates a DESIGN.md file optimized for Google Stitch screen generation. It encodes atmosphere, color, typography, components, layout, motion, and an explicit list of banned patterns.',
    whyForDesign: [
      'Stitch screens inherit one accent under 80% saturation instead of neon purple gradients.',
      'Centered heroes and three equal card rows are banned above set variance.',
      'Loading and empty states become skeletal and composed rather than generic spinners.',
    ],
    howWithCodex: [
      'Describe the project vibe; the skill sets density, variance, and motion scores.',
      'It outputs a seven-section DESIGN.md with hex codes and functional color roles.',
      'Feed that file to Stitch directly, or through the Stitch MCP server.',
    ],
    covers: [
      'Overview',
      'Prerequisites',
      'Analysis and synthesis instructions',
      'Output format',
      'Best practices',
      'Common pitfalls to avoid',
    ],
    tags: [
      'Google Stitch',
      'DESIGN.md',
      'Design tokens',
      'Anti-patterns',
    ],
    codexNote: 'Codex named 8× in the README',
    social: 'X @MengTo 1,716♥ · YT Chase AI 94,671',
    repo: 'Leonxlnx/taste-skill',
    install: { kind: 'clone', command: 'git clone https://github.com/Leonxlnx/taste-skill', skillPath: 'skills/stitch-skill/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Semantic Design System Skill for Google Stitch. Generates agent-friendly DESIGN.md files that enforce premium, anti-generic UI standards — strict typography, calibrated color, asymmetric layouts, perpetual micro-motion, ',
    source: { label: 'Leonxlnx/taste-skill · skills/stitch-skill', url: 'https://github.com/Leonxlnx/taste-skill/tree/HEAD/skills/stitch-skill' },
  },
  {
    slug: 'image-to-code',
    name: 'image-to-code',
    category: 'Frontend & UI',
    badge: 'Leonxlnx',
    stars: 65936,
    tagline: 'Generates design images first, analyzes them, then builds matching frontend code.',
    image: '/plugins/codex-design/skills/image-to-code.webp',
    whatIsIt:
      'An image-first workflow for visual web tasks. The agent generates section reference images, extracts typography, spacing, color, and components from them, then implements the site to match.',
    whyForDesign: [
      'Code follows a real visual reference, so implementation does not drift into generic layouts.',
      'Each section gets its own large image, keeping text and spacing analyzable.',
      'Heroes stay under three headline lines and free of nested container stacks.',
    ],
    howWithCodex: [
      'State the section count; in Codex the skill generates one image per section.',
      'Ask for a closer detail render when button or type detail stays unreadable.',
      'Have it run the clarity check before it writes any implementation files.',
    ],
    covers: [
      'Mandatory image-first rule',
      'Generate enough images rule',
      'Deep image analysis requirement',
      'Hero minimalism rules',
      'Anti-drift implementation rule',
      'Anti-AI-slop rules',
    ],
    tags: [
      'Image to code',
      'Art direction',
      'Landing pages',
      'Design extraction',
    ],
    codexNote: 'Codex named 8× in the README',
    social: 'X @MengTo 1,716♥ · YT Chase AI 94,671',
    repo: 'Leonxlnx/taste-skill',
    install: { kind: 'clone', command: 'git clone https://github.com/Leonxlnx/taste-skill', skillPath: 'skills/image-to-code-skill/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Elite website image-to-code skill for Codex. For visually important web tasks, it must first generate the design image(s) itself, deeply analyze them, then implement the website to match them as closely as possible. In C',
    source: { label: 'Leonxlnx/taste-skill · skills/image-to-code-skill', url: 'https://github.com/Leonxlnx/taste-skill/tree/HEAD/skills/image-to-code-skill' },
  },
  {
    slug: 'imagegen-frontend-mobile',
    name: 'imagegen-frontend-mobile',
    category: 'Frontend & UI',
    badge: 'Leonxlnx',
    stars: 65936,
    tagline: 'Generates premium mobile app screen flows as images, not code.',
    image: '/plugins/codex-design/skills/imagegen-frontend-mobile.webp',
    whatIsIt:
      'An image-only skill for mobile screen concepts and flows across iOS, Android, and cross-platform products. It presents screens inside clean phone mockups and never writes code.',
    whyForDesign: [
      'Screens respect safe areas and system regions instead of reading as websites in phones.',
      'A locked design bible keeps palette, type, and icons consistent across every screen.',
      'Multi-screen sets form a believable flow, not unrelated one-off mockups.',
    ],
    howWithCodex: [
      'Name the app category and screen count; each screen becomes its own image.',
      'The skill picks a platform mode first: iOS, Android, or cross-platform neutral.',
      'Ask it to regenerate any screen where text is small or framing uneven.',
    ],
    covers: [
      'Platform mode rule',
      'Generate enough screens rule',
      'App design bible rule',
      'Safe area and system region rule',
      'Device mockup frame rule',
      'Text size and readability rule',
    ],
    tags: [
      'Mobile UI',
      'iOS',
      'Android',
      'Image generation',
      'App flows',
    ],
    codexNote: 'Codex named 8× in the README',
    social: 'X @MengTo 1,716♥ · YT Chase AI 94,671',
    repo: 'Leonxlnx/taste-skill',
    install: { kind: 'clone', command: 'git clone https://github.com/Leonxlnx/taste-skill', skillPath: 'skills/imagegen-frontend-mobile/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Elite mobile app image-generation skill for creating premium, app-native screen concepts and flows. Designed for iOS, Android, and cross-platform mobile products. Prioritizes clean hierarchy, comfortably readable text, s',
    source: { label: 'Leonxlnx/taste-skill · skills/imagegen-frontend-mobile', url: 'https://github.com/Leonxlnx/taste-skill/tree/HEAD/skills/imagegen-frontend-mobile' },
  },
  {
    slug: 'imagegen-frontend-web',
    name: 'imagegen-frontend-web',
    category: 'Frontend & UI',
    badge: 'Leonxlnx',
    stars: 65936,
    tagline: 'Generates one horizontal reference image per landing page section.',
    image: '/plugins/codex-design/skills/imagegen-frontend-web.webp',
    whatIsIt:
      'An image-direction skill for website design references. It generates one separate horizontal image per section, with a single locked palette and varied hero composition across the set.',
    whyForDesign: [
      'An eight-section landing page yields eight readable comps, not one compressed board.',
      'Hero composition varies past the overused left text, right image default.',
      'One palette, type scale, and CTA family holds across every generated frame.',
    ],
    howWithCodex: [
      'Say how many sections you want; unstated landing pages default to six.',
      'The skill announces the count, then labels each output by section number.',
      'Give vibe words like editorial or cinematic to steer hero scale and background.',
    ],
    covers: [
      'Image count and page slicing',
      'The combinatorial variation engine',
      'Hero minimalism rules',
      'Color and material rules',
      'Multi-image consistency rule',
      'Default site packs',
    ],
    tags: [
      'Image generation',
      'Landing pages',
      'Art direction',
      'Comps',
    ],
    codexNote: 'Codex named 8× in the README',
    social: 'X @MengTo 1,716♥ · YT Chase AI 94,671',
    repo: 'Leonxlnx/taste-skill',
    install: { kind: 'clone', command: 'git clone https://github.com/Leonxlnx/taste-skill', skillPath: 'skills/imagegen-frontend-web/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Elite frontend image-direction skill for generating premium, conversion-aware website design references. CRITICAL OUTPUT RULE — generate ONE separate horizontal image FOR EVERY section. A landing page with 8 sections pro',
    source: { label: 'Leonxlnx/taste-skill · skills/imagegen-frontend-web', url: 'https://github.com/Leonxlnx/taste-skill/tree/HEAD/skills/imagegen-frontend-web' },
  },
  {
    slug: 'minimalist-ui',
    name: 'minimalist-ui',
    category: 'Frontend & UI',
    badge: 'Leonxlnx',
    stars: 65936,
    tagline: 'Builds warm monochrome editorial interfaces with flat bento grids.',
    image: '/plugins/codex-design/skills/minimalist-ui.webp',
    whatIsIt:
      'A frontend protocol for document-style minimal interfaces. It fixes a warm monochrome palette, serif and mono typographic hierarchy, 1px bordered bento cards, and muted pastel accents.',
    whyForDesign: [
      'Every card and divider uses one 1px light gray border with a crisp radius.',
      'Accents come only from four washed pastels reserved for tags and inline code.',
      'Sections gain depth from low-opacity imagery rather than flat empty backgrounds.',
    ],
    howWithCodex: [
      'Ask for a page; the skill establishes macro-whitespace first, py-24 or py-32.',
      'It constrains type width to max-w-4xl and applies the monochrome variables immediately.',
      'Scroll-entry fades run through IntersectionObserver on transform and opacity only.',
    ],
    covers: [
      'Absolute negative constraints',
      'Typographic architecture',
      'Color palette',
      'Component specifications',
      'Iconography and imagery directives',
      'Subtle motion and micro-animations',
    ],
    tags: [
      'Minimalism',
      'Editorial',
      'Bento grid',
      'Design tokens',
    ],
    codexNote: 'Codex named 8× in the README',
    social: 'X @MengTo 1,716♥ · YT Chase AI 94,671',
    repo: 'Leonxlnx/taste-skill',
    install: { kind: 'clone', command: 'git clone https://github.com/Leonxlnx/taste-skill', skillPath: 'skills/minimalist-skill/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Clean editorial-style interfaces. Warm monochrome palette, typographic contrast, flat bento grids, muted pastels. No gradients, no heavy shadows.',
    source: { label: 'Leonxlnx/taste-skill · skills/minimalist-skill', url: 'https://github.com/Leonxlnx/taste-skill/tree/HEAD/skills/minimalist-skill' },
  },
  {
    slug: 'design-taste-frontend',
    name: 'design-taste-frontend',
    category: 'Frontend & UI',
    badge: 'Leonxlnx',
    stars: 65936,
    tagline: 'Reads the brief, picks a direction, ships non-templated interfaces.',
    image: '/plugins/codex-design/skills/design-taste-frontend.webp',
    whatIsIt:
      'An anti-slop frontend skill for landing pages, portfolios, and redesigns. It states a design read, sets variance, motion, and density dials, then runs a long pre-flight check.',
    whyForDesign: [
      'Enterprise briefs get the official design system package instead of hand-rolled lookalike CSS.',
      'The pre-flight bans em-dashes, section-numbering eyebrows, scroll cues, and duplicate CTA intent.',
      'Layout repetition is capped, so eight sections use at least four different families.',
    ],
    howWithCodex: [
      'The agent states a one-line design read before writing any code.',
      'It sets three dials: design variance, motion intensity, and visual density.',
      'Every pre-flight checkbox must pass, or the page is not finished.',
    ],
    covers: [
      'Brief inference',
      'The three dials',
      'Brief to design system map',
      'Design engineering directives',
      'AI tells',
      'Final pre-flight check',
    ],
    tags: [
      'Landing pages',
      'Tailwind',
      'shadcn',
      'Accessibility',
      'Anti-patterns',
    ],
    codexNote: 'Codex named 8× in the README',
    social: 'X @MengTo 1,716♥ · YT Chase AI 94,671',
    repo: 'Leonxlnx/taste-skill',
    install: { kind: 'clone', command: 'git clone https://github.com/Leonxlnx/taste-skill', skillPath: 'skills/taste-skill/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Anti-slop frontend skill for landing pages, portfolios, and redesigns. The agent reads the brief, infers the right design direction, and ships interfaces that do not look templated. Real design systems when applicable, a',
    source: { label: 'Leonxlnx/taste-skill · skills/taste-skill', url: 'https://github.com/Leonxlnx/taste-skill/tree/HEAD/skills/taste-skill' },
  },
  {
    slug: 'industrial-brutalist-ui',
    name: 'industrial-brutalist-ui',
    category: 'Design Systems',
    badge: 'Leonxlnx',
    stars: 65936,
    tagline: 'Builds rigid Swiss print or CRT terminal interfaces with analog grain.',
    image: '/plugins/codex-design/skills/industrial-brutalist-ui.webp',
    whatIsIt:
      'A design system for interfaces merging Swiss typographic print with military terminal aesthetics. It specifies rigid grids, extreme type scale contrast, one hazard red accent, and simulated analog degradation.',
    whyForDesign: [
      'One substrate is picked per project, so light and dark never mix.',
      'border-radius is rejected entirely, so every corner stays at ninety degrees.',
      'Halftone, scanline, and noise filters keep surfaces from reading as flat vector.',
    ],
    howWithCodex: [
      'Choose one archetype: Swiss industrial print or tactical telemetry CRT terminal.',
      'Macro headings use clamp with negative tracking; metadata uses small uppercase monospace.',
      'Grid gaps of 1px with contrasting backgrounds produce the razor-thin dividing lines.',
    ],
    covers: [
      'Visual archetypes',
      'Typographic architecture',
      'Color system',
      'Layout and spatial engineering',
      'UI components and symbology',
      'Textural and post-processing effects',
    ],
    tags: [
      'Brutalism',
      'Swiss design',
      'Monospace',
      'CSS Grid',
      'Dashboards',
    ],
    codexNote: 'Codex named 8× in the README',
    social: 'X @MengTo 1,716♥ · YT Chase AI 94,671',
    repo: 'Leonxlnx/taste-skill',
    install: { kind: 'clone', command: 'git clone https://github.com/Leonxlnx/taste-skill', skillPath: 'skills/brutalist-skill/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Raw mechanical interfaces fusing Swiss typographic print with military terminal aesthetics. Rigid grids, extreme type scale contrast, utilitarian color, analog degradation effects. For data-heavy dashboards, portfolios, ',
    source: { label: 'Leonxlnx/taste-skill · skills/brutalist-skill', url: 'https://github.com/Leonxlnx/taste-skill/tree/HEAD/skills/brutalist-skill' },
  },
  {
    slug: 'redesign-existing-projects',
    name: 'redesign-existing-projects',
    category: 'Frontend & UI',
    badge: 'Leonxlnx',
    stars: 65936,
    tagline: 'Audits an existing site and upgrades it without breaking functionality.',
    image: '/plugins/codex-design/skills/redesign-existing-projects.webp',
    whatIsIt:
      'A scan, diagnose, and fix workflow for existing projects. It audits typography, color, layout, states, content, icons, and code quality, then applies targeted upgrades inside the current stack.',
    whyForDesign: [
      'Purple-blue AI gradients and three equal card rows get replaced with considered alternatives.',
      'Buttons in card groups align to a single bottom line across varied content.',
      'Missing hover, focus, loading, empty, and error states are filled in.',
    ],
    howWithCodex: [
      'It scans the codebase first to identify framework and styling method.',
      'It lists every generic pattern and weak point before changing anything.',
      'Fixes land in priority order: fonts, color, states, layout, components, typography polish.',
    ],
    covers: [
      'How this works',
      'Design audit',
      'Upgrade techniques',
      'Fix priority',
      'Rules',
    ],
    tags: [
      'Redesign',
      'Audit',
      'Accessibility',
      'Tailwind',
      'CSS',
    ],
    codexNote: 'Codex named 8× in the README',
    social: 'X @MengTo 1,716♥ · YT Chase AI 94,671',
    repo: 'Leonxlnx/taste-skill',
    install: { kind: 'clone', command: 'git clone https://github.com/Leonxlnx/taste-skill', skillPath: 'skills/redesign-skill/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Upgrades existing websites and apps to premium quality. Audits current design, identifies generic AI patterns, and applies high-end design standards without breaking functionality. Works with any CSS framework or vanilla',
    source: { label: 'Leonxlnx/taste-skill · skills/redesign-skill', url: 'https://github.com/Leonxlnx/taste-skill/tree/HEAD/skills/redesign-skill' },
  },
  {
    slug: 'brandkit',
    name: 'brandkit',
    category: 'Design Systems',
    badge: 'Leonxlnx',
    stars: 65936,
    tagline: 'Generates brand guideline boards, logo systems, and identity decks as images.',
    image: '/plugins/codex-design/skills/brandkit.webp',
    whatIsIt:
      'An image generation skill for brand-kit boards. It produces logo systems, color and type panels, mockups, and atmosphere imagery arranged on a grid-based presentation board.',
    whyForDesign: [
      'A default 3x3 panel system covers logo, construction, color, type, and applications.',
      'Logo concepts follow a stated method such as monogram, metaphor fusion, or negative space.',
      'Boards carry rhythm: quiet, functional, emotional, and technical panels rather than uniform loudness.',
    ],
    howWithCodex: [
      'Give the brand and category; the skill picks a visual mode first.',
      'It defaults to a 3x3 board, or a 2x3 reference-style mini deck.',
      'Keep text sparse: brand name, one tagline, one command, a few labels.',
    ],
    covers: [
      'Logo generation standard',
      'Logo concept methods',
      'Board composition DNA',
      'Default 3x3 panel system',
      'Visual modes',
      'Color discipline',
    ],
    tags: [
      'Brand identity',
      'Logo systems',
      'Image generation',
      'Presentation boards',
    ],
    codexNote: 'Codex named 8× in the README',
    social: 'X @MengTo 1,716♥ · YT Chase AI 94,671',
    repo: 'Leonxlnx/taste-skill',
    install: { kind: 'clone', command: 'git clone https://github.com/Leonxlnx/taste-skill', skillPath: 'skills/brandkit/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Premium brand-kit image generation skill for creating high-end brand-guidelines boards, logo systems, identity decks, and visual-world presentations. Trained for minimalist, cinematic, editorial, dark-tech, luxury, cultu',
    source: { label: 'Leonxlnx/taste-skill · skills/brandkit', url: 'https://github.com/Leonxlnx/taste-skill/tree/HEAD/skills/brandkit' },
  },
  {
    slug: 'high-end-visual-design',
    name: 'high-end-visual-design',
    category: 'Frontend & UI',
    badge: 'Leonxlnx',
    stars: 65936,
    tagline: 'Blocks generic AI defaults and enforces agency-grade layout and motion.',
    image: '/plugins/codex-design/skills/high-end-visual-design.webp',
    whatIsIt:
      'A directive skill that bans common AI design defaults, then forces the agent to pick one vibe archetype and one layout archetype before writing any UI code.',
    whyForDesign: [
      'Inter, Roboto and thick Lucide icons are banned, so output stops looking templated.',
      'Cards get nested outer shell plus inner core, giving containers real machined depth.',
      'Section padding starts at py-24, so layouts breathe instead of crowding.',
    ],
    howWithCodex: [
      'Ask Codex for a page; it silently rolls the variance engine first.',
      'It scaffolds background texture and type scale, then builds double-bezel containers.',
      'It injects custom cubic-bezier motion, then runs the pre-output checklist.',
    ],
    covers: [
      'Absolute zero directive',
      'Creative variance engine',
      'Haptic micro-aesthetics',
      'Motion choreography',
      'Performance guardrails',
      'Pre-output checklist',
    ],
    tags: [
      'Tailwind',
      'Motion',
      'Layout archetypes',
      'Anti-patterns',
    ],
    codexNote: 'Codex named 8× in the README',
    social: 'X @MengTo 1,716♥ · YT Chase AI 94,671',
    repo: 'Leonxlnx/taste-skill',
    install: { kind: 'clone', command: 'git clone https://github.com/Leonxlnx/taste-skill', skillPath: 'skills/soft-skill/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Teaches the AI to design like a high-end agency. Defines the exact fonts, spacing, shadows, card structures, and animations that make a website feel expensive. Blocks all the common defaults that make AI designs look che',
    source: { label: 'Leonxlnx/taste-skill · skills/soft-skill', url: 'https://github.com/Leonxlnx/taste-skill/tree/HEAD/skills/soft-skill' },
  },
  {
    slug: 'pick-ui-library',
    name: 'pick-ui-library',
    category: 'Frontend & UI',
    badge: 'emilkowalski',
    stars: 19240,
    tagline: 'Matches a frontend task to one curated, opinionated library pick.',
    image: '/plugins/codex-design/skills/pick-ui-library.webp',
    whatIsIt:
      'A lookup skill invoked explicitly. It maps a stated task to a single recommended library from a curated table covering primitives, motion, charts, virtualization, state and styling.',
    whyForDesign: [
      'One recommendation per task, so no menu of options to argue over.',
      'Checks package.json first, so it reuses what the project already has.',
      'Catches hand-rolled dropdowns and toasts, replacing them with accessible primitives.',
    ],
    howWithCodex: [
      'Invoke it explicitly; it never triggers on its own.',
      'State the task, not the library name, such as ‘I need toasts’.',
      'It names one library, explains its use, then wires it up.',
    ],
    covers: [
      'How to use this',
      'UI components and primitives',
      'Motion and visuals',
      'Charts',
      'State and styling',
      'Common mismatches to catch',
    ],
    tags: [
      'Library selection',
      'shadcn alternatives',
      'Motion',
      'State',
    ],
    codexNote: 'No Codex mention; `npx skills add` is agent-agnostic',
    social: 'X @emilkowalski 6,494♥',
    repo: 'emilkowalski/skills',
    install: { kind: 'clone', command: 'git clone https://github.com/emilkowalski/skills', skillPath: 'skills/pick-ui-library/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Pick the right library for a given frontend task from a curated, opinionated list — numbers, OTP inputs, charts, command menus, virtualization, drag and drop, toasts, state, styling, and more. Only runs when explicitly i',
    source: { label: 'emilkowalski/skills · skills/pick-ui-library', url: 'https://github.com/emilkowalski/skills/tree/HEAD/skills/pick-ui-library' },
  },
  {
    slug: 'apple-design',
    name: 'apple-design',
    category: 'Frontend & UI',
    badge: 'emilkowalski',
    stars: 19240,
    tagline: 'Apple’s fluid interface principles translated into web springs and gestures.',
    image: '/plugins/codex-design/skills/apple-design.webp',
    whatIsIt:
      'Knowledge distilled from Apple WWDC design talks, chiefly Designing Fluid Interfaces, mapped to CSS, Pointer Events and spring libraries. Covers response, interruptibility, momentum, materials, typography and accessibility.',
    whyForDesign: [
      'Feedback fires on pointer-down, so pressed elements stop feeling dead.',
      'Animations start from the live on-screen value, removing visible jumps on interrupt.',
      'Flicks project a landing point, so throws land where the gesture aimed.',
    ],
    howWithCodex: [
      'Ask Codex to build a sheet, drawer or drag interaction.',
      'It tracks 1:1 with pointer capture and records velocity history.',
      'On release it hands velocity to a spring using the shipped damping values.',
    ],
    covers: [
      'Response',
      'Direct manipulation',
      'Interruptibility',
      'Momentum projection',
      'Materials and depth',
      'Reduced motion and accessibility',
    ],
    tags: [
      'Springs',
      'Gestures',
      'backdrop-filter',
      'Reduced motion',
    ],
    codexNote: 'No Codex mention; `npx skills add` is agent-agnostic',
    social: 'X @emilkowalski 6,494♥',
    repo: 'emilkowalski/skills',
    install: { kind: 'clone', command: 'git clone https://github.com/emilkowalski/skills', skillPath: 'skills/apple-design/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Apple\'s approach to interface design and fluid, physical motion, translated for the web. Use when building or reviewing gesture-driven UI, spring animations, drag/swipe/sheet interactions, momentum and interruptible tran',
    source: { label: 'emilkowalski/skills · skills/apple-design', url: 'https://github.com/emilkowalski/skills/tree/HEAD/skills/apple-design' },
  },
  {
    slug: 'animation-vocabulary',
    name: 'animation-vocabulary',
    category: 'Frontend & UI',
    badge: 'emilkowalski',
    stars: 19240,
    tagline: 'Turns a vague motion description into its exact technical term.',
    image: '/plugins/codex-design/skills/animation-vocabulary.webp',
    whatIsIt:
      'A reverse-lookup glossary. The user describes a motion effect loosely and the skill returns the precise term, quoted verbatim, with close alternates when several could fit.',
    whyForDesign: [
      'Gives a designer the right word to prompt an agent with.',
      'Disambiguates close pairs such as clip-path versus mask, pop in versus bounce.',
      'Refuses to invent terms, so the naming stays trustworthy.',
    ],
    howWithCodex: [
      'Describe what you saw, such as ‘the iOS rubber-band scroll’.',
      'It returns the bolded term plus a one-line glossary definition.',
      'Ask for alternates when two terms could plausibly fit.',
    ],
    covers: [
      'Entrances and exits',
      'Sequencing and timing',
      'Transitions between states',
      'Scroll',
      'Spring animations',
      'Polish and effects',
    ],
    tags: [
      'Glossary',
      'Motion terms',
      'Easing',
      'Springs',
    ],
    codexNote: 'No Codex mention; `npx skills add` is agent-agnostic',
    social: 'X @emilkowalski 6,494♥',
    repo: 'emilkowalski/skills',
    install: { kind: 'clone', command: 'git clone https://github.com/emilkowalski/skills', skillPath: 'skills/animation-vocabulary/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Reverse-lookup glossary that turns a vague description of a web animation or motion effect into its exact term ("the bouncy thing when a popover opens" → Pop in; "the iOS rubber-band scroll" → Rubber-banding). Use when t',
    source: { label: 'emilkowalski/skills · skills/animation-vocabulary', url: 'https://github.com/emilkowalski/skills/tree/HEAD/skills/animation-vocabulary' },
  },
  {
    slug: 'emil-design-eng',
    name: 'emil-design-eng',
    category: 'Frontend & UI',
    badge: 'emilkowalski',
    stars: 19240,
    tagline: 'Emil Kowalski’s rules for animation timing, easing and component polish.',
    image: '/plugins/codex-design/skills/emil-design-eng.webp',
    whatIsIt:
      'Encodes a design engineering philosophy: an animation decision framework, spring guidance, component principles, clip-path techniques, gesture handling, performance rules and a review checklist.',
    whyForDesign: [
      'Frequent actions lose their animation entirely, so command palettes stay instant.',
      'Entrances start at scale(0.95), never scale(0), so nothing appears from nowhere.',
      'Popovers scale from their trigger instead of their centre, keeping the spatial link.',
    ],
    howWithCodex: [
      'Ask Codex to review UI code; it returns a Before, After, Why table.',
      'For new motion it answers should this animate, why, which easing, how fast.',
      'It applies the checklist, flagging transition: all and durations over 300ms.',
    ],
    covers: [
      'The animation decision framework',
      'Spring animations',
      'Component building principles',
      'clip-path for animation',
      'Performance rules',
      'Review checklist',
    ],
    tags: [
      'Easing curves',
      'Springs',
      'clip-path',
      'Perceived performance',
    ],
    codexNote: 'No Codex mention; `npx skills add` is agent-agnostic',
    social: 'X @emilkowalski 6,494♥',
    repo: 'emilkowalski/skills',
    install: { kind: 'clone', command: 'git clone https://github.com/emilkowalski/skills', skillPath: 'skills/emil-design-eng/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'This skill encodes Emil Kowalski\'s philosophy on UI polish, component design, animation decisions, and the invisible details that make software feel great.',
    source: { label: 'emilkowalski/skills · skills/emil-design-eng', url: 'https://github.com/emilkowalski/skills/tree/HEAD/skills/emil-design-eng' },
  },
  {
    slug: 'ui-ux-pro-max-design',
    name: 'UI-UX Pro Max · Design',
    category: 'Design Systems',
    badge: 'nextlevelbuilder',
    stars: 108453,
    tagline: 'One entry point routing logo, identity, slides, banner and icon work.',
    image: '/plugins/codex-design/skills/ui-ux-pro-max-design.webp',
    whatIsIt:
      'A unified design skill that routes tasks to sub-skills or built-in modules. Built-ins cover logo generation, corporate identity mockups, HTML slides, banners, social photos and SVG icons via Gemini scripts.',
    whyForDesign: [
      'Logo, identity mockups and deck all come from one brand input.',
      'Icons generate as SVG text, so they stay editable, not raster.',
      'Banner rules enforce safe zones, two fonts maximum and one CTA.',
    ],
    howWithCodex: [
      'Export GEMINI_API_KEY and install google-genai and pillow first.',
      'Run scripts/logo/search.py for a design brief, then generate.py for images.',
      'Feed the logo into scripts/cip/generate.py to produce deliverable mockups.',
    ],
    covers: [
      'Sub-skill routing',
      'Logo design',
      'CIP design',
      'Slides',
      'Banner design',
      'Icon design',
    ],
    tags: [
      'Logo generation',
      'Brand identity',
      'SVG icons',
      'Design tokens',
    ],
    codexNote: '`uipro init --ai codex`',
    social: 'YT Chase AI 94,671',
    repo: 'nextlevelbuilder/ui-ux-pro-max-skill',
    install: { kind: 'clone', command: 'git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill', skillPath: 'cli/assets/skills/design/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Comprehensive design skill: brand identity, design tokens, UI styling, logo generation (55 styles, Gemini AI), corporate identity program (50 deliverables, CIP mockups), HTML presentations (Chart.js), banner design (22 s',
    source: { label: 'nextlevelbuilder/ui-ux-pro-max-skill · cli/assets/skills/design', url: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/HEAD/cli/assets/skills/design' },
  },
  {
    slug: 'ui-ux-pro-max-banner-design',
    name: 'UI-UX Pro Max · Banner Design',
    category: 'Frontend & UI',
    badge: 'nextlevelbuilder',
    stars: 108453,
    tagline: 'Designs sized banners in HTML, then exports them as PNGs.',
    image: '/plugins/codex-design/skills/ui-ux-pro-max-banner-design.webp',
    whatIsIt:
      'A five-step banner workflow: gather requirements, research art direction, build the banner in HTML and CSS with generated visuals, screenshot to exact platform pixels, then present options for iteration.',
    whyForDesign: [
      'Every banner exports at exact platform pixels, so nothing is cropped or resized.',
      'Generated visuals are rendered without text, so headlines stay crisp HTML.',
      'Three art directions per request, so comparison happens before commitment.',
    ],
    howWithCodex: [
      'Answer the purpose, platform, content, brand, style and quantity questions.',
      'It builds one HTML banner per art direction with safe zones applied.',
      'It screenshots each at set width and height, compressing files over the limit.',
    ],
    covers: [
      'Workflow',
      'Banner size quick reference',
      'Art direction styles',
      'Design rules',
      'Prerequisites',
    ],
    tags: [
      'Social banners',
      'Ad sizes',
      'HTML to PNG',
      'Art direction',
    ],
    codexNote: '`uipro init --ai codex`',
    social: 'YT Chase AI 94,671',
    repo: 'nextlevelbuilder/ui-ux-pro-max-skill',
    install: { kind: 'clone', command: 'git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill', skillPath: 'cli/assets/skills/banner-design/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Design banners for social media, ads, website heroes, creative assets, and print. Multiple art direction options with AI-generated visuals. Actions: design, create, generate banner. Platforms: Facebook, Twitter/X, Linked',
    source: { label: 'nextlevelbuilder/ui-ux-pro-max-skill · cli/assets/skills/banner-design', url: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/HEAD/cli/assets/skills/banner-design' },
  },
  {
    slug: 'ui-ux-pro-max-ui-styling',
    name: 'UI-UX Pro Max · UI Styling',
    category: 'Frontend & UI',
    badge: 'nextlevelbuilder',
    stars: 108453,
    tagline: 'Builds accessible interfaces with shadcn components and Tailwind utilities.',
    image: '/plugins/codex-design/skills/ui-ux-pro-max-ui-styling.webp',
    whatIsIt:
      'Combines a shadcn component layer on Radix primitives, a Tailwind utility styling layer, and a canvas visual design layer. Includes reference files for theming, accessibility, responsive rules and customization.',
    whyForDesign: [
      'Dialogs and menus inherit Radix focus management, so accessibility is not retrofitted.',
      'Theme colours live in CSS variables, so dark mode stays consistent.',
      'Mobile-first breakpoints mean layouts start small and layer upward.',
    ],
    howWithCodex: [
      'Run npx shadcn@latest init to configure the framework and theme.',
      'Add components with npx shadcn@latest add button card dialog form.',
      'Run scripts/tailwind_config_gen.py to generate a config with custom tokens.',
    ],
    covers: [
      'Core stack',
      'Component library guide',
      'Theme and customization',
      'Accessibility patterns',
      'Responsive design',
      'Visual design system',
    ],
    tags: [
      'shadcn',
      'Tailwind',
      'Dark mode',
      'Accessibility',
    ],
    codexNote: '`uipro init --ai codex`',
    social: 'YT Chase AI 94,671',
    repo: 'nextlevelbuilder/ui-ux-pro-max-skill',
    install: { kind: 'clone', command: 'git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill', skillPath: 'cli/assets/skills/ui-styling/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Create beautiful, accessible user interfaces with shadcn/ui components (built on Radix UI + Tailwind), Tailwind CSS utility-first styling, and canvas-based visual designs. Use when building user interfaces, implementing ',
    source: { label: 'nextlevelbuilder/ui-ux-pro-max-skill · cli/assets/skills/ui-styling', url: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/HEAD/cli/assets/skills/ui-styling' },
  },
  {
    slug: 'ui-ux-pro-max-brand',
    name: 'UI-UX Pro Max · Brand',
    category: 'Design Systems',
    badge: 'nextlevelbuilder',
    stars: 108453,
    tagline: 'Keeps brand guidelines, design tokens and assets in sync.',
    image: '/plugins/codex-design/skills/ui-ux-pro-max-brand.webp',
    whatIsIt:
      'A brand identity skill built around scripts that inject brand context into prompts, validate assets, extract colours, and sync brand-guidelines.md into design token JSON and CSS variables.',
    whyForDesign: [
      'One markdown file is the source of truth for tokens and CSS.',
      'Extracted colours get compared against the palette, catching drift early.',
      'Assets are checked for naming, size and format before approval.',
    ],
    howWithCodex: [
      'Edit docs/brand-guidelines.md, then run scripts/sync-brand-to-tokens.cjs.',
      'Verify with scripts/inject-brand-context.cjs --json.',
      'Check any new file with scripts/validate-asset.cjs before shipping it.',
    ],
    covers: [
      'When to use',
      'Quick start',
      'Brand sync workflow',
      'Subcommands',
      'References',
      'Scripts',
    ],
    tags: [
      'Design tokens',
      'Brand guidelines',
      'Asset validation',
      'Color palette',
    ],
    codexNote: '`uipro init --ai codex`',
    social: 'YT Chase AI 94,671',
    repo: 'nextlevelbuilder/ui-ux-pro-max-skill',
    install: { kind: 'clone', command: 'git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill', skillPath: 'cli/assets/skills/brand/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Brand voice, visual identity, messaging frameworks, asset management, brand consistency. Activate for branded content, tone of voice, marketing assets, brand compliance, style guides.',
    source: { label: 'nextlevelbuilder/ui-ux-pro-max-skill · cli/assets/skills/brand', url: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/HEAD/cli/assets/skills/brand' },
  },
  {
    slug: 'ui-ux-pro-max-slides',
    name: 'UI-UX Pro Max · Slides',
    category: 'Frontend & UI',
    badge: 'nextlevelbuilder',
    stars: 108453,
    tagline: 'Builds HTML presentation decks with Chart.js and layout patterns.',
    image: '/plugins/codex-design/skills/ui-ux-pro-max-slides.webp',
    whatIsIt:
      'A small routing skill for strategic HTML presentations. It parses a subcommand, then loads reference files covering layout patterns, an HTML template, copywriting formulas and slide strategies.',
    whyForDesign: [
      'Slides are HTML, so type and spacing follow real design tokens.',
      'Chart.js handles data slides, so numbers stay live rather than pasted images.',
      'Layout patterns are chosen from a set, keeping a deck visually consistent.',
    ],
    howWithCodex: [
      'Invoke it with the create subcommand plus a topic and slide count.',
      'It loads references/create.md and follows that creation workflow.',
      'It pulls layout patterns and copywriting formulas from the reference files.',
    ],
    covers: [
      'When to use',
      'Subcommands',
      'References',
      'Routing',
    ],
    tags: [
      'HTML slides',
      'Chart.js',
      'Design tokens',
      'Layout patterns',
    ],
    codexNote: '`uipro init --ai codex`',
    social: 'YT Chase AI 94,671',
    repo: 'nextlevelbuilder/ui-ux-pro-max-skill',
    install: { kind: 'clone', command: 'git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill', skillPath: 'cli/assets/skills/slides/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Create strategic HTML presentations with Chart.js, design tokens, responsive layouts, copywriting formulas, and contextual slide strategies.',
    source: { label: 'nextlevelbuilder/ui-ux-pro-max-skill · cli/assets/skills/slides', url: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/HEAD/cli/assets/skills/slides' },
  },
  {
    slug: 'design-system-tokens',
    name: 'UI-UX Pro Max · Design System',
    category: 'Design Systems',
    badge: 'nextlevelbuilder',
    stars: 108453,
    tagline: 'Three-layer design tokens, component specs, and token-compliant slide generation.',
    image: '/plugins/codex-design/skills/design-system-tokens.webp',
    whatIsIt:
      'A design-system skill covering primitive, semantic, and component token layers as CSS variables, plus component state specs and a slide generator that builds decks from those same tokens.',
    whyForDesign: [
      'Semantic token layer makes light and dark theme switching a config change, not a rewrite.',
      'Component specs table default, hover, active, and disabled states so handoff leaves nothing ambiguous.',
      'A validator flags hardcoded hex values, keeping components and slides on the token system.',
    ],
    howWithCodex: [
      'Run generate-tokens.cjs against a JSON token config to emit your CSS variable file.',
      'Ask Codex for component specs, then run validate-tokens.cjs over src/ to catch raw values.',
      'Use search-slides.py with position and context flags to pick layouts for a deck.',
    ],
    covers: [
      'Token architecture',
      'Component spec pattern',
      'Scripts',
      'Slide system',
      'Token compliance',
      'Best practices',
    ],
    tags: [
      'design tokens',
      'CSS variables',
      'Tailwind',
      'component specs',
      'slides',
    ],
    codexNote: '`uipro init --ai codex`',
    social: 'YT Chase AI 94,671',
    repo: 'nextlevelbuilder/ui-ux-pro-max-skill',
    install: { kind: 'clone', command: 'git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill', skillPath: 'cli/assets/skills/design-system/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Token architecture, component specifications, and slide generation. Three-layer tokens (primitive→semantic→component), CSS variables, spacing/typography scales, component specs, strategic slide creation. Use for design t',
    source: { label: 'nextlevelbuilder/ui-ux-pro-max-skill · cli/assets/skills/design-system', url: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/HEAD/cli/assets/skills/design-system' },
  },
  {
    slug: 'editorial-ui-style',
    name: 'design-skills · Editorial',
    category: 'Frontend & UI',
    badge: 'bergside',
    stars: 1890,
    tagline: 'Magazine layout in Gelasio serif on a strict 8pt grid.',
    image: '/plugins/codex-design/skills/editorial-ui-style.webp',
    whatIsIt:
      'A design-system guideline skill for a modern editorial look: Gelasio serif for both body and display, Ubuntu Mono, near-black #111111 on white surfaces, and an 8pt baseline grid.',
    whyForDesign: [
      'Serif display and body from one family keeps long reading passages typographically consistent.',
      'An 8pt baseline grid enforces vertical rhythm across headings, body copy, and spacing.',
      'Accessibility bar includes reduced-motion support, 44px touch targets, and high-contrast handling.',
    ],
    howWithCodex: [
      'Ask Codex to restate the design intent, then define tokens before touching components.',
      'Request component rules covering anatomy, variants, states, and responsive behavior.',
      'Close with the QA checklist so a code reviewer can verify the output.',
    ],
    covers: [
      'Style foundations',
      'Accessibility',
      'Guideline authoring workflow',
      'Required output structure',
      'Component rule expectations',
      'Quality gates',
    ],
    tags: [
      'editorial',
      'serif typography',
      'baseline grid',
      'design tokens',
      'WCAG 2.2',
    ],
    codexNote: 'Codex named 8× in the README',
    social: 'YT AI LABS 109,460',
    repo: 'bergside/awesome-design-skills',
    install: { kind: 'clone', command: 'git clone https://github.com/bergside/awesome-design-skills', skillPath: 'skills/editorial/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Magazine-inspired editorial layout with refined serif typography, structured grids, and elegant reading experiences.',
    source: { label: 'bergside/awesome-design-skills · skills/editorial', url: 'https://github.com/bergside/awesome-design-skills/tree/HEAD/skills/editorial' },
  },
  {
    slug: 'terracotta-ui-style',
    name: 'design-skills · Terracotta',
    category: 'Frontend & UI',
    badge: 'bergside',
    stars: 1890,
    tagline: 'Clay accent on cream, DM Serif Display headlines, long-form reading.',
    image: '/plugins/codex-design/skills/terracotta-ui-style.webp',
    whatIsIt:
      'A guideline skill for a sun-baked editorial interface: cream #F3E9D8 surfaces, one terracotta #C56A3C accent, DM Serif Display headlines, JetBrains Mono. Tuned for blogs and storytelling.',
    whyForDesign: [
      'One accent color only, so emphasis stays scarce and headlines carry the hierarchy.',
      'Warm cream surfaces cut glare in long articles compared with pure white pages.',
      'Display serif headlines over ink-brown body text set a clear editorial rhythm.',
    ],
    howWithCodex: [
      'Point Codex at the terracotta and cream tokens before it writes any component.',
      'Ask for anatomy, variants, and states per component, with spacing tokens named explicitly.',
      'Request anti-patterns and migration notes when retrofitting existing inconsistent UI.',
    ],
    covers: [
      'Brand',
      'Style foundations',
      'Rules: do',
      'Rules: don’t',
      'Component rule expectations',
      'Quality gates',
    ],
    tags: [
      'editorial',
      'serif display',
      'warm palette',
      'blog',
      'design tokens',
    ],
    codexNote: 'Codex named 8× in the README',
    social: 'YT AI LABS 109,460',
    repo: 'bergside/awesome-design-skills',
    install: { kind: 'clone', command: 'git clone https://github.com/bergside/awesome-design-skills', skillPath: 'skills/terracotta/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'A sun-baked, clay-toned editorial interface built on warm cream surfaces, ink-brown headlines set in a display serif, and a single terracotta accent.',
    source: { label: 'bergside/awesome-design-skills · skills/terracotta', url: 'https://github.com/bergside/awesome-design-skills/tree/HEAD/skills/terracotta' },
  },
  {
    slug: 'dithered-ui-style',
    name: 'design-skills · Dithered',
    category: 'Frontend & UI',
    badge: 'bergside',
    stars: 1890,
    tagline: 'Dot-pattern shading and a limited palette for retro, high-contrast screens.',
    image: '/plugins/codex-design/skills/dithered-ui-style.webp',
    whatIsIt:
      'A guideline skill for dithered interfaces that use dot patterns to simulate shades from a limited palette. Open Sans body, Space Grotesk display, IBM Plex Mono, blue and violet accents.',
    whyForDesign: [
      'Dot patterns replace gradients, so shading survives a deliberately restricted color set.',
      'High-contrast rendering keeps text legible even when surfaces carry heavy pattern texture.',
      'Rules ban decorative motion, stopping the retro treatment from becoming visual noise.',
    ],
    howWithCodex: [
      'Tell Codex the palette limit first, then let it derive pattern-based shading rules.',
      'Ask for empty, loading, and error states so patterned surfaces stay readable.',
      'Verify hit areas and focus states, which this skill calls out explicitly.',
    ],
    covers: [
      'Brand',
      'Style foundations',
      'Rules: don’t',
      'Expected behavior',
      'Required output structure',
      'Quality gates',
    ],
    tags: [
      'retro',
      'dithering',
      'limited palette',
      'high contrast',
      'design tokens',
    ],
    codexNote: 'Codex named 8× in the README',
    social: 'YT AI LABS 109,460',
    repo: 'bergside/awesome-design-skills',
    install: { kind: 'clone', command: 'git clone https://github.com/bergside/awesome-design-skills', skillPath: 'skills/dithered/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Dot-pattern rendering technique that simulates shades with a limited palette for nostalgic, retro, high-contrast visuals.',
    source: { label: 'bergside/awesome-design-skills · skills/dithered', url: 'https://github.com/bergside/awesome-design-skills/tree/HEAD/skills/dithered' },
  },
  {
    slug: 'neumorphism-ui-style',
    name: 'design-skills · Neumorphism',
    category: 'Frontend & UI',
    badge: 'bergside',
    stars: 1890,
    tagline: 'Soft extruded surfaces in stone gray with Space Mono type.',
    image: '/plugins/codex-design/skills/neumorphism-ui-style.webp',
    whatIsIt:
      'A guideline skill for neumorphic UI: inner and outer shadows on a monochromatic stone #E7E5E4 surface, a teal #006666 accent, Space Mono for display and body, compact density spacing.',
    whyForDesign: [
      'Monochromatic surfaces mean depth comes from shadow rather than from color contrast.',
      'Compact density spacing suits control-heavy panels such as dashboards and settings screens.',
      'Rules forbid mixing visual metaphors, so soft extrusion stays the only depth language.',
    ],
    howWithCodex: [
      'Have Codex set surface and shadow tokens before styling any individual control.',
      'Ask for visible focus states, since soft shadows alone fail keyboard users.',
      'Require semantic HTML before ARIA, as this skill specifies.',
    ],
    covers: [
      'Style foundations',
      'Accessibility',
      'Rules: don’t',
      'Expected behavior',
      'Component rule expectations',
      'Quality gates',
    ],
    tags: [
      'neumorphism',
      'shadows',
      'monospace',
      'dashboard',
      'WCAG 2.2',
    ],
    codexNote: 'Codex named 8× in the README',
    social: 'YT AI LABS 109,460',
    repo: 'bergside/awesome-design-skills',
    install: { kind: 'clone', command: 'git clone https://github.com/bergside/awesome-design-skills', skillPath: 'skills/neumorphism/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Soft, extruded UI elements with inner and outer shadows on monochromatic surfaces for a tactile, embedded look.',
    source: { label: 'bergside/awesome-design-skills · skills/neumorphism', url: 'https://github.com/bergside/awesome-design-skills/tree/HEAD/skills/neumorphism' },
  },
  {
    slug: 'bento-ui-style',
    name: 'design-skills · Bento',
    category: 'Frontend & UI',
    badge: 'bergside',
    stars: 1890,
    tagline: 'Grid of varied blocks on cream, Inter type, compact scale.',
    image: '/plugins/codex-design/skills/bento-ui-style.webp',
    whatIsIt:
      'A guideline skill for bento box layouts that present content as grid blocks of varying sizes. Inter throughout, a compact 12 to 32 type scale, peach and blue accents on cream.',
    whyForDesign: [
      'Varying block sizes carry hierarchy, so the grid itself does the ranking.',
      'A compact 12 to 32 type scale fits dense text inside small tiles.',
      'The cream #FFF5E6 surface keeps block edges readable without heavy borders.',
    ],
    howWithCodex: [
      'Ask Codex to assign each block a size based on content priority.',
      'Define spacing tokens on the 4 to 32 scale before laying out tiles.',
      'Request overflow and long-label handling, which this skill lists as edge cases.',
    ],
    covers: [
      'Brand',
      'Style foundations',
      'Rules: do',
      'Component rule expectations',
      'Required output structure',
      'Quality gates',
    ],
    tags: [
      'bento grid',
      'layout',
      'Inter',
      'cards',
      'design tokens',
    ],
    codexNote: 'Codex named 8× in the README',
    social: 'YT AI LABS 109,460',
    repo: 'bergside/awesome-design-skills',
    install: { kind: 'clone', command: 'git clone https://github.com/bergside/awesome-design-skills', skillPath: 'skills/bento/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Modular grid layout with card-like blocks, clear hierarchy, soft spacing, and subtle visual contrast for organized, scannable interfaces.',
    source: { label: 'bergside/awesome-design-skills · skills/bento', url: 'https://github.com/bergside/awesome-design-skills/tree/HEAD/skills/bento' },
  },
  {
    slug: 'claymorphism-ui-style',
    name: 'design-skills · Claymorphism',
    category: 'Frontend & UI',
    badge: 'bergside',
    stars: 1890,
    tagline: 'Puffy rounded 3D shapes, Poppins headlines, blue on white.',
    image: '/plugins/codex-design/skills/claymorphism-ui-style.webp',
    whatIsIt:
      'A guideline skill for claymorphic UI: soft, rounded, puffy shapes that mimic malleable clay. Poppins display, Montserrat body, a blue #3B82F6 accent and deep blue text on white.',
    whyForDesign: [
      'Puffy rounded forms give buttons an obvious pressable affordance without extra labels.',
      'Deep blue text #1C398E on white holds contrast while the palette stays playful.',
      'Rules forbid mixing metaphors, so clay depth never combines with glass or flat.',
    ],
    howWithCodex: [
      'Ask Codex for radius and shadow tokens first, since they define the clay look.',
      'Pair Poppins display with Montserrat body as specified, not two similar sans faces.',
      'Check that focus-visible and disabled states survive the soft shape treatment.',
    ],
    covers: [
      'Brand',
      'Style foundations',
      'Rules: don’t',
      'Expected behavior',
      'Component rule expectations',
      'Quality gates',
    ],
    tags: [
      'claymorphism',
      '3D shapes',
      'playful',
      'Poppins',
      'design tokens',
    ],
    codexNote: 'Codex named 8× in the README',
    social: 'YT AI LABS 109,460',
    repo: 'bergside/awesome-design-skills',
    install: { kind: 'clone', command: 'git clone https://github.com/bergside/awesome-design-skills', skillPath: 'skills/claymorphism/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Soft, rounded 3D-like shapes mimicking malleable clay with playful, puffy elements and colorful surfaces.',
    source: { label: 'bergside/awesome-design-skills · skills/claymorphism', url: 'https://github.com/bergside/awesome-design-skills/tree/HEAD/skills/claymorphism' },
  },
  {
    slug: 'brutalism-ui-style',
    name: 'design-skills · Brutalism',
    category: 'Frontend & UI',
    badge: 'bergside',
    stars: 1890,
    tagline: 'Raw concrete-inspired layouts, Darker Grotesque display, red and ochre.',
    image: '/plugins/codex-design/skills/brutalism-ui-style.webp',
    whatIsIt:
      'A guideline skill for brutalist UI drawn from 1950s raw concrete architecture: unadorned, functional, deliberately jarring. Darker Grotesque display type, #DD614C red and #DAA144 ochre on white.',
    whyForDesign: [
      'Bold unadorned elements drop decoration, so structure and copy carry the weight.',
      'Two strong accents, red and ochre, replace gradients and shadows entirely.',
      'The accessibility floor still applies, so jarring layouts keep contrast and visible focus.',
    ],
    howWithCodex: [
      'Tell Codex the tone is bold and unadorned before it picks components.',
      'Anchor every rule to a token or threshold, as the quality gates demand.',
      'Pair each do-rule with a concrete don’t-example when reviewing the output.',
    ],
    covers: [
      'Brand',
      'Style foundations',
      'Accessibility',
      'Rules: do',
      'Quality gates',
      'Example constraint language',
    ],
    tags: [
      'brutalism',
      'bold typography',
      'anti-design',
      'high contrast',
      'design tokens',
    ],
    codexNote: 'Codex named 8× in the README',
    social: 'YT AI LABS 109,460',
    repo: 'bergside/awesome-design-skills',
    install: { kind: 'clone', command: 'git clone https://github.com/bergside/awesome-design-skills', skillPath: 'skills/brutalism/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Raw, anti-design aesthetic inspired by concrete architecture with unadorned elements, jarring layouts, and functional minimalism.',
    source: { label: 'bergside/awesome-design-skills · skills/brutalism', url: 'https://github.com/bergside/awesome-design-skills/tree/HEAD/skills/brutalism' },
  },
  {
    slug: 'hallmark-design-skill',
    name: 'Hallmark',
    category: 'Frontend & UI',
    badge: 'Nutlope',
    stars: 14734,
    tagline: 'Anti-slop design flow with 58 gates and forced structural variety.',
    image: '/plugins/codex-design/skills/hallmark-design-skill.webp',
    whatIsIt:
      'A design skill for AI coding assistants with one default build flow and three verbs: audit, redesign, and study. It pushes for structural variety so two builds don’t share one page rhythm.',
    whyForDesign: [
      'Diversification rules force different macrostructures, navs, and footers across consecutive builds.',
      'Locked tokens ban inline hex or font-family values that bypass the token block.',
      'Every emit is verified at 320, 375, 414, and 768 pixel widths.',
    ],
    howWithCodex: [
      'Let the pre-flight scan read existing fonts, palette, and motion libraries first.',
      'Answer the audience, use case, and tone gate, or say go ahead.',
      'Run hallmark audit on a page for a ranked punch list without edits.',
    ],
    covers: [
      'How to use this skill',
      'Disciplines that hold across every verb',
      'When the brief is a component, not a page',
      'Design flow (default)',
      'Hallmark study',
      'Output contract and scope',
    ],
    tags: [
      'anti-AI-slop',
      'macrostructure',
      'design tokens',
      'landing pages',
      'audit',
    ],
    codexNote: 'Codex named in the repo description',
    social: 'X @nutlope 5,265♥ · YT 4,227',
    repo: 'Nutlope/hallmark',
    install: { kind: 'clone', command: 'git clone https://github.com/Nutlope/hallmark', skillPath: 'skills/hallmark/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Anti-AI-slop design skill for greenfield pages, audits, redesigns, and design extraction from URLs or screenshots. Use when the user asks to build a new app or landing page, wants to redesign something, invokes Hallmark ',
    source: { label: 'Nutlope/hallmark · skills/hallmark', url: 'https://github.com/Nutlope/hallmark/tree/HEAD/skills/hallmark' },
  },
  {
    slug: 'impeccable',
    name: 'Impeccable',
    category: 'Frontend & UI',
    badge: 'pbakaus',
    stars: 48457,
    tagline: 'Two dozen commands to build, critique, and refine frontend interfaces.',
    image: '/plugins/codex-design/skills/impeccable.webp',
    whatIsIt:
      'A frontend design skill with commands grouped as build, evaluate, refine, enhance, fix, and iterate. It reads project context and a register reference, then writes production-grade code.',
    whyForDesign: [
      'The register split sends marketing pages and product UI down different design rules.',
      'Absolute bans reject gradient text, side-stripe borders, and eyebrow labels above every section.',
      'Contrast floors are explicit: 4.5:1 for body text, 3:1 for large text.',
    ],
    howWithCodex: [
      'Run context.mjs once per session so the skill loads PRODUCT.md and DESIGN.md.',
      'Invoke a command such as critique, polish, or animate with a target file.',
      'Use live mode with a running dev server to generate in-browser variants.',
    ],
    covers: [
      'Setup',
      'Design guidance',
      'The AI slop test',
      'Commands',
      'Routing rules',
      'Hooks',
    ],
    tags: [
      'frontend',
      'design review',
      'accessibility',
      'motion',
      'OKLCH',
    ],
    codexNote: 'Codex named 27× in the README',
    social: 'YT Chase AI 94,671',
    repo: 'pbakaus/impeccable',
    install: { kind: 'clone', command: 'git clone https://github.com/pbakaus/impeccable', skillPath: 'plugin/skills/impeccable/SKILL.md' },
    license: { label: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
    upstreamDescription:
      'Use when the user wants to design, redesign, shape, critique, audit, polish, clarify, distill, harden, optimize, adapt, animate, colorize, extract, or otherwise improve a frontend interface. Covers websites, landing page',
    source: { label: 'pbakaus/impeccable · plugin/skills/impeccable', url: 'https://github.com/pbakaus/impeccable/tree/HEAD/plugin/skills/impeccable' },
  },
  {
    slug: 'design-dna',
    name: 'Design DNA',
    category: 'Design Systems',
    badge: 'zanwei',
    stars: 1107,
    tagline: 'Extract a reference design into structured JSON, then generate from it.',
    image: '/plugins/codex-design/skills/design-dna.webp',
    whatIsIt:
      'A three-phase workflow that captures design identity across measurable tokens, qualitative style, and visual effects. It outputs a complete Design DNA JSON, then applies that JSON to new content.',
    whyForDesign: [
      'Turns a screenshot or URL into named color, type, and spacing values.',
      'Records mood, composition, and brand voice, not just measurable tokens.',
      'Captures Canvas, WebGL, shader, and scroll effects that plain CSS cannot express.',
    ],
    howWithCodex: [
      'Ask for the schema to see all three dimensions before analyzing anything.',
      'Hand Codex reference images or URLs and request a populated DNA JSON.',
      'Pass the JSON plus your content to generate a self-contained HTML page.',
    ],
    covers: [
      'Design system tokens',
      'Design style',
      'Visual effects',
      'Analyzing references',
      'Generating from JSON',
      'Phase combinations',
    ],
    tags: [
      'design-tokens',
      'style-extraction',
      'webgl',
      'json',
      'generation',
    ],
    codexNote: 'topic: codex-skills',
    social: 'GitHub topic',
    repo: 'zanwei/design-dna',
    install: { kind: 'clone', command: 'git clone https://github.com/zanwei/design-dna', skillPath: 'SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      '>-',
    source: { label: 'zanwei/design-dna · SKILL.md', url: 'https://github.com/zanwei/design-dna' },
  },
  {
    slug: 'material-3',
    name: 'Material 3',
    category: 'Design Systems',
    badge: 'hamen',
    stars: 1160,
    tagline: 'Implement Google’s Material Design 3 across Compose, Flutter, and web.',
    image: '/plugins/codex-design/skills/material-3.webp',
    whatIsIt:
      'A guide to Material Design 3 covering the md.sys token namespace, 30+ components, adaptive layout, theming, and M3 Expressive. Jetpack Compose is the primary target; Flutter and @material/web are secondary.',
    whyForDesign: [
      'Color, type, shape, and elevation tokens replace hardcoded hex and radius values.',
      'Tonal surfaces carry depth instead of shadows, matching current MD3 spec.',
      'A scored audit rates ten categories and lists fixes in priority order.',
    ],
    howWithCodex: [
      'Name the platform so Codex picks Compose, Flutter, or CSS custom properties.',
      'Ask for a component and get the correct variant plus token wiring.',
      'Run the audit against a URL or source files for a compliance report.',
    ],
    covers: [
      'Design token system',
      'Component quick reference',
      'Common patterns',
      'Anti-patterns',
      'M3 Expressive',
      'MD3 compliance audit',
    ],
    tags: [
      'material-design',
      'design-tokens',
      'jetpack-compose',
      'theming',
      'audit',
    ],
    codexNote: 'Codex is the README’s preferred path',
    social: 'YT AI LABS 109,460',
    repo: 'hamen/material-3-skill',
    install: { kind: 'clone', command: 'git clone https://github.com/hamen/material-3-skill', skillPath: 'skills/material-3/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      '>',
    source: { label: 'hamen/material-3-skill · skills/material-3', url: 'https://github.com/hamen/material-3-skill/tree/HEAD/skills/material-3' },
  },
  {
    slug: 'make-interfaces-feel-better',
    name: 'Details that make interfaces feel better',
    category: 'Frontend & UI',
    badge: 'jakubkrehel',
    stars: 2429,
    tagline: 'Sixteen concrete UI polish rules with a review checklist.',
    image: '/plugins/codex-design/skills/make-interfaces-feel-better.webp',
    whatIsIt:
      'A set of design engineering principles for interface polish: concentric radii, optical alignment, layered shadows, staggered enter animations, tabular numbers, hit areas, and transition specificity.',
    whyForDesign: [
      'Names exact values, so scale on press is always 0.96, never guesswork.',
      'Fixes the nested radius mismatch that makes most components read as off.',
      'Catches layout shift from changing numbers before it reaches users.',
    ],
    howWithCodex: [
      'Point Codex at a component and ask it to apply the principles.',
      'Request a review; findings come back as Before and After tables.',
      'Run the fourteen-item checklist before merging any frontend change.',
    ],
    covers: [
      'Quick reference',
      'Core principles',
      'Common mistakes',
      'Review output format',
      'Review checklist',
      'Reference files',
    ],
    tags: [
      'ui-polish',
      'css',
      'animation',
      'typography',
      'code-review',
    ],
    codexNote: 'Codex covered in the README install steps',
    social: 'YT Lukas Margerie 14,279',
    repo: 'jakubkrehel/make-interfaces-feel-better',
    install: { kind: 'clone', command: 'git clone https://github.com/jakubkrehel/make-interfaces-feel-better', skillPath: 'skills/make-interfaces-feel-better/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Design engineering principles for making interfaces feel polished. Use when building UI components, reviewing frontend code, implementing animations, hover states, shadows, borders, typography, micro-interactions, enter/',
    source: { label: 'jakubkrehel/make-interfaces-feel-better · skills/make-interfaces-feel-better', url: 'https://github.com/jakubkrehel/make-interfaces-feel-better/tree/HEAD/skills/make-interfaces-feel-better' },
  },
  {
    slug: 'visual-plan',
    name: 'Agent-Native Plans',
    category: 'Frontend & UI',
    badge: 'BuilderIO',
    stars: 3724,
    tagline: 'Turn text plans into reviewable documents with wireframes and prototypes.',
    image: '/plugins/codex-design/skills/visual-plan.webp',
    whatIsIt:
      'A structured planning mode for coding agents. Plans become scannable documents with inline diagrams, code, data models, open questions, and an optional top canvas or live prototype.',
    whyForDesign: [
      'UI plans open with wireframe artboards, one per user-visible state.',
      'Reviewers comment on anchored elements instead of arguing in chat.',
      'Multi-step flows get an operable prototype beside the static mockups.',
    ],
    howWithCodex: [
      'Install with the Agent-Native CLI, then run the /visual-plan command.',
      'Paste an existing Codex or Markdown plan to use as source.',
      'Read feedback, patch the plan, and verify the persisted result.',
    ],
    covers: [
      'When to use',
      'Plan discipline',
      'Core workflow',
      'Visual surface choice',
      'Wireframe quality',
      'Self-review before handoff',
    ],
    tags: [
      'planning',
      'wireframes',
      'prototype',
      'mdx',
      'mcp',
    ],
    codexNote: 'README: runs from a Codex session',
    social: 'X @Steve8708 1,783♥ · YT 48,275',
    repo: 'BuilderIO/skills',
    install: { kind: 'clone', command: 'git clone https://github.com/BuilderIO/skills', skillPath: 'skills/visual-plan/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Generate rich visual plans as MDX with diagrams, API specs and zoomable wireframes, then recap what the agent did.',
    source: { label: 'BuilderIO/skills · skills/visual-plan', url: 'https://github.com/BuilderIO/skills/tree/HEAD/skills/visual-plan' },
  },
  {
    slug: 'kami',
    name: 'Kami',
    category: 'Design Systems',
    badge: 'tw93',
    stars: 10018,
    tagline: 'Typeset resumes, white papers, decks, and landing pages on one design language.',
    image: '/plugins/codex-design/skills/kami.webp',
    whatIsIt:
      'A template system for professional documents and product landing pages. Warm parchment canvas, ink-blue accent, serif-led hierarchy, with templates for nine document types plus fifteen diagram primitives.',
    whyForDesign: [
      'One accent color and one serif family keep every deliverable visually consistent.',
      'A density contract flags body pages that render under half full.',
      'Diagram primitives cover architecture, flowcharts, quadrants, timelines, and charts.',
    ],
    howWithCodex: [
      'Say what you need; the decision tree picks the matching template.',
      'Let Codex distill your raw content into a validated content.json first.',
      'Run the build script to produce HTML, PDF, and verification reports.',
    ],
    covers: [
      'Decide the language',
      'Pick the document type',
      'Fill content into the template',
      'Build and verify',
      'Fonts',
      'Feedback protocol',
    ],
    tags: [
      'typesetting',
      'pdf',
      'landing-page',
      'templates',
      'diagrams',
    ],
    codexNote: 'Agent-agnostic documentation design system',
    social: 'X @HiTw93 4,388♥',
    repo: 'tw93/Kami',
    install: { kind: 'clone', command: 'git clone https://github.com/tw93/Kami', skillPath: 'plugins/kami/skills/kami/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Typeset professional documents and product landing pages: resumes, one-pagers, white papers.',
    source: { label: 'tw93/Kami · plugins/kami/skills/kami', url: 'https://github.com/tw93/Kami/tree/HEAD/plugins/kami/skills/kami' },
  },
  {
    slug: 'css-border-gradient',
    name: 'Border Gradients',
    category: 'Frontend & UI',
    badge: 'MengTo',
    stars: 2465,
    tagline: 'Add a refined gradient edge to cards, modals, and hero surfaces.',
    image: '/plugins/codex-design/skills/css-border-gradient.webp',
    whatIsIt:
      'A CSS recipe for subtle gradient borders using padding-box and border-box layering, plus a masked pseudo-element variant for surfaces with complex backgrounds.',
    whyForDesign: [
      'Gives premium edge definition without the loud glow of neon borders.',
      'The masked variant preserves an existing background instead of overwriting it.',
      'Defaults keep stops under 0.4 opacity, so borders frame rather than compete.',
    ],
    howWithCodex: [
      'Point Codex at a card or pricing panel that needs a better edge.',
      'Pick the simple pattern for solid fills, masked for complex backgrounds.',
      'Check light and dark themes separately, since alpha rarely transfers.',
    ],
    covers: [
      'Use when',
      'Defaults',
      'Simple CSS pattern',
      'Masked pattern',
      'Tailwind shortcut',
      'Taste rules',
    ],
    tags: [
      'css',
      'gradient',
      'borders',
      'tailwind',
      'dark-mode',
    ],
    codexNote: 'Explicit Codex path: agent-skills/codex/',
    social: 'Upstream usage 13,807',
    repo: 'MengTo/Skills',
    install: { kind: 'clone', command: 'git clone https://github.com/MengTo/Skills', skillPath: 'agent-skills/web-design/css-border-gradient/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Apply subtle gradient-border treatments for premium web surfaces. Use when cards, pricing panels, nav bars, modals, buttons, or hero surfaces need a refined edge highlight without a loud glow.',
    source: { label: 'MengTo/Skills · agent-skills/web-design/css-border-gradient', url: 'https://github.com/MengTo/Skills/tree/HEAD/agent-skills/web-design/css-border-gradient' },
  },
  {
    slug: 'masked-reveal',
    name: 'Masked Reveal',
    category: 'Frontend & UI',
    badge: 'MengTo',
    stars: 2465,
    tagline: 'Reveal headlines word by word through an overflow mask on scroll.',
    image: '/plugins/codex-design/skills/masked-reveal.webp',
    whatIsIt:
      'A GSAP ScrollTrigger pattern that splits a heading into masked word spans and staggers them upward as the text enters the viewport. Includes a React cleanup pattern.',
    whyForDesign: [
      'Word-level stagger reads calmer and more editorial than letter-level animation.',
      'Screen readers still get the full text through an aria-label.',
      'Reduced-motion users see static text with no transform applied.',
    ],
    howWithCodex: [
      'Mark a heading with data-masked-reveal and add the CSS mask rules.',
      'Call the split helper, which avoids the paid SplitText plugin.',
      'Wrap in a GSAP context in React so ScrollTrigger cleans up on route change.',
    ],
    covers: [
      'Use when',
      'Motion defaults',
      'CSS mask',
      'GSAP ScrollTrigger',
      'React cleanup pattern',
      'Quick checks',
    ],
    tags: [
      'GSAP',
      'scrolltrigger',
      'animation',
      'accessibility',
      'react',
    ],
    codexNote: 'Explicit Codex path: agent-skills/codex/',
    social: 'Upstream usage 12,504',
    repo: 'MengTo/Skills',
    install: { kind: 'clone', command: 'git clone https://github.com/MengTo/Skills', skillPath: 'agent-skills/web-design/masked-reveal/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Create masked staggered word reveals on scroll with GSAP ScrollTrigger. Use when headings, hero copy, section titles, or editorial text should reveal word-by-word through an overflow mask as they enter the viewport.',
    source: { label: 'MengTo/Skills · agent-skills/web-design/masked-reveal', url: 'https://github.com/MengTo/Skills/tree/HEAD/agent-skills/web-design/masked-reveal' },
  },
  {
    slug: 'framed-grid-layout',
    name: 'Framed Grid Layout',
    category: 'Frontend & UI',
    badge: 'MengTo',
    stars: 2465,
    tagline: 'Build precise editorial layouts with thin frames and corner brackets.',
    image: '/plugins/codex-design/skills/framed-grid-layout.webp',
    whatIsIt:
      'A twelve-column grid pattern where every section snaps to shared columns inside 1px framed boxes. L-shaped corner brackets are drawn as background layers over a low-opacity diagonal texture.',
    whyForDesign: [
      'Every section shares one border color, one bracket size, one spacing scale.',
      'Corner brackets need no extra markup, so structure stays in CSS.',
      'The layout still reads clearly if the texture layer is removed.',
    ],
    howWithCodex: [
      'Ask for a technical or editorial page and get the parent grid first.',
      'Assign explicit span classes instead of ad hoc section widths.',
      'Verify frame edges align vertically and horizontally at both breakpoints.',
    ],
    covers: [
      'Use when',
      'Layout rules',
      'Base tokens',
      'Parent grid',
      'L-shaped corner brackets',
      'Section spans',
    ],
    tags: [
      'css-grid',
      'layout',
      'editorial',
      'design-tokens',
      'responsive',
    ],
    codexNote: 'Explicit Codex path: agent-skills/codex/',
    social: 'Upstream usage 5,489',
    repo: 'MengTo/Skills',
    install: { kind: 'clone', command: 'git clone https://github.com/MengTo/Skills', skillPath: 'agent-skills/web-design/framed-grid-layout/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Create minimal framed grid layouts with thin visible boundary lines, L-shaped corner brackets, subtle diagonal line texture, and strict section alignment. Use when asked for clean, neutral, precise, structured, editorial',
    source: { label: 'MengTo/Skills · agent-skills/web-design/framed-grid-layout', url: 'https://github.com/MengTo/Skills/tree/HEAD/agent-skills/web-design/framed-grid-layout' },
  },
  {
    slug: 'container-lines',
    name: 'Container Lines',
    category: 'Frontend & UI',
    badge: 'MengTo',
    stars: 2465,
    tagline: 'Draw quiet vertical guide lines at your content container edges.',
    image: '/plugins/codex-design/skills/container-lines.webp',
    whatIsIt:
      'A CSS pattern that adds 1px vertical lines at both edges of the content container, plus optional mini corner squares. Guides sit behind content and ignore pointer events.',
    whyForDesign: [
      'Reveals the container width, so loose hero sections gain structural tension.',
      'Guides share the container max-width and padding, so they never drift.',
      'Pointer events are disabled, so lines never block clicks or selection.',
    ],
    howWithCodex: [
      'Add the container-lines class to the layout shell.',
      'Place corner squares only on real container or section corners.',
      'Check the lines stay subtle on both light and dark backgrounds.',
    ],
    covers: [
      'Use when',
      'Rules',
      'Base tokens',
      'Page container lines',
      'Corner squares',
      'Minimal section wrapper',
    ],
    tags: [
      'css',
      'layout',
      'grid-guides',
      'pseudo-elements',
      'editorial',
    ],
    codexNote: 'Explicit Codex path: agent-skills/codex/',
    social: 'Upstream usage 4,820',
    repo: 'MengTo/Skills',
    install: { kind: 'clone', command: 'git clone https://github.com/MengTo/Skills', skillPath: 'agent-skills/web-design/container-lines/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Add vertical container-size guide lines with mini corner squares for precise, structured web layouts. Use when asked for container lines, measured layout guides, vertical boundary lines, editorial grid markers, or small ',
    source: { label: 'MengTo/Skills · agent-skills/web-design/container-lines', url: 'https://github.com/MengTo/Skills/tree/HEAD/agent-skills/web-design/container-lines' },
  },
  {
    slug: 'skeuomorphic-ui',
    name: 'Skeuomorphic UI',
    category: 'Frontend & UI',
    badge: 'MengTo',
    stars: 2465,
    tagline: 'Give buttons and panels tactile depth with layered gradients and shadows.',
    image: '/plugins/codex-design/skills/skeuomorphic-ui.webp',
    whatIsIt:
      'A surface recipe for tactile web UI: vertical gradient fills, a 1px reflective gradient border, stacked outer and inset shadows. Embossed text, icons, and micro texture are optional.',
    whyForDesign: [
      'Raised and pressed states reverse depth, so controls read as physical.',
      'Depth stays directional, with light from top and shadow below.',
      'Warns against mixing glassmorphism, neumorphism, and skeuomorphism in one component.',
    ],
    howWithCodex: [
      'Set the base tokens once, then tune them per brand and theme.',
      'Apply the raised surface to cards, buttons, tabs, and control housings.',
      'Add the pressed variant for active toggles and selected tabs only.',
    ],
    covers: [
      'Use when',
      'Surface recipe',
      'Raised surface',
      'Pressed surface',
      'Embossed text and icons',
      'Micro texture',
    ],
    tags: [
      'css',
      'skeuomorphism',
      'shadows',
      'gradients',
      'buttons',
    ],
    codexNote: 'Explicit Codex path: agent-skills/codex/',
    social: 'Upstream usage 1,550',
    repo: 'MengTo/Skills',
    install: { kind: 'clone', command: 'git clone https://github.com/MengTo/Skills', skillPath: 'agent-skills/web-design/skeuomorphic-ui/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Create skeuomorphic web UI surfaces with layered gradients, stacked inner and outer shadows, reflective gradient borders, micro texture, and embossed text or icon details. Use when asked for pressed, carved, tactile, rea',
    source: { label: 'MengTo/Skills · agent-skills/web-design/skeuomorphic-ui', url: 'https://github.com/MengTo/Skills/tree/HEAD/agent-skills/web-design/skeuomorphic-ui' },
  },
  {
    slug: 'beautiful-shadows',
    name: 'Beautiful Shadows',
    category: 'Design Systems',
    badge: 'MengTo',
    stars: 2465,
    tagline: 'Three ready-made Tailwind shadow utilities for neutral layered elevation.',
    image: '/plugins/codex-design/skills/beautiful-shadows.webp',
    whatIsIt:
      'A set of exact Tailwind arbitrary shadow classes in three strengths. Each stacks several low-opacity neutral layers instead of Tailwind’s default shadow scale.',
    whyForDesign: [
      'Elevation stays neutral, with no colored glow tinting the surface underneath.',
      'Three fixed strengths map to controls, cards, and hero media respectively.',
      'Stacked low-opacity layers read as real depth rather than one blunt drop shadow.',
    ],
    howWithCodex: [
      'Ask Codex to apply the md utility to cards, panels, and popovers.',
      'Reserve the lg utility for hero media and modal-like containers.',
      'Pair each shadow with a clean surface fill and consistent radius.',
    ],
    covers: [
      'Use when',
      'Shadow utilities',
      'Examples',
      'Usage rules',
      'Avoid',
    ],
    tags: [
      'Tailwind',
      'shadows',
      'elevation',
      'CSS',
      'components',
    ],
    codexNote: 'Explicit Codex path: agent-skills/codex/',
    social: 'Upstream usage 1,447',
    repo: 'MengTo/Skills',
    install: { kind: 'clone', command: 'git clone https://github.com/MengTo/Skills', skillPath: 'agent-skills/web-design/beautiful-shadows/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Apply exact Tailwind arbitrary shadow utilities for polished, layered neutral elevation. Use when compact cards, controls, panels, popovers, hero media, feature callouts, or modal-like containers need refined shadows wit',
    source: { label: 'MengTo/Skills · agent-skills/web-design/beautiful-shadows', url: 'https://github.com/MengTo/Skills/tree/HEAD/agent-skills/web-design/beautiful-shadows' },
  },
  {
    slug: 'dither-background',
    name: 'Dither Background',
    category: 'Frontend & UI',
    badge: 'MengTo',
    stars: 2465,
    tagline: 'Canvas background with visible 4x4 Bayer dithering and square pixels.',
    image: '/plugins/codex-design/skills/dither-background.webp',
    whatIsIt:
      'A canvas recipe rendering a near-black procedural field from value noise, FBM, and a 4x4 Bayer threshold, drawn as enlarged square cells.',
    whyForDesign: [
      'Enlarged cells keep the dither matrix legible instead of collapsing into film grain.',
      'Six-step monochrome palette holds foreground type readable without a heavy overlay.',
      'Vignette and off-axis mass give one bright focal area, not even brightness.',
    ],
    howWithCodex: [
      'Drop the fixed canvas behind content and set pointer-events to none.',
      'Tune cellSize between 5px and 10px for matrix legibility.',
      'Adjust wave, cloud, ridge, and vignette values to shape the mass.',
    ],
    covers: [
      'Visual target',
      'HTML and CSS',
      'Canvas recipe',
      'Tuning knobs',
      'Composition notes',
      'Quick checks',
    ],
    tags: [
      'canvas',
      'dithering',
      'procedural',
      'dark UI',
      'background',
    ],
    codexNote: 'Explicit Codex path: agent-skills/codex/',
    social: 'Upstream usage 1,375',
    repo: 'MengTo/Skills',
    install: { kind: 'clone', command: 'git clone https://github.com/MengTo/Skills', skillPath: 'agent-skills/web-design/dither-background/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Create a dark monochrome procedural background with enlarged square pixels and visible Bayer-style ordered dithering. Use when a page needs an atmospheric near-black dither field, broad organic waves or cloud masses, and',
    source: { label: 'MengTo/Skills · agent-skills/web-design/dither-background', url: 'https://github.com/MengTo/Skills/tree/HEAD/agent-skills/web-design/dither-background' },
  },
  {
    slug: 'webgl-laser',
    name: 'WebGL Laser',
    category: 'Frontend & UI',
    badge: 'MengTo',
    stars: 2465,
    tagline: 'Full-screen shader beam with white-hot core and brand-tinted fog.',
    image: '/plugins/codex-design/skills/webgl-laser.webp',
    whatIsIt:
      'A raw WebGL fragment shader drawing a thin vertical laser on a full-screen quad. Core stays near white; halo and FBM smoke follow your accent.',
    whyForDesign: [
      'Halo and smoke read from your brand accent instead of a hardcoded blue.',
      'Separate core and glow widths keep the beam a blade, not a bar.',
      'Smoke concentrates near the beam and dissipates outward, protecting copy contrast.',
    ],
    howWithCodex: [
      'Set a --brand-accent custom property, which the shader converts to RGB.',
      'Place the fixed canvas behind content with pointer-events none.',
      'Tune coreWidth, glowWidth, smokeDensity, and xOffset to position the beam.',
    ],
    covers: [
      'Scope',
      'Visual target',
      'Layering',
      'Brand color',
      'Raw WebGL setup',
      'Tuning knobs',
    ],
    tags: [
      'WebGL',
      'shader',
      'GLSL',
      'background',
      'dark UI',
    ],
    codexNote: 'Explicit Codex path: agent-skills/codex/',
    social: 'Upstream usage 862',
    repo: 'MengTo/Skills',
    install: { kind: 'clone', command: 'git clone https://github.com/MengTo/Skills', skillPath: 'agent-skills/web-design/webgl-laser/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Create a fixed full-screen WebGL laser background effect with a thin white-hot vertical core, restrained brand-colored halo, and soft smoky fog around the beam. Use only for laser background effects, not full page layout',
    source: { label: 'MengTo/Skills · agent-skills/web-design/webgl-laser', url: 'https://github.com/MengTo/Skills/tree/HEAD/agent-skills/web-design/webgl-laser' },
  },
  {
    slug: 'mesh-gradient-dark-blue-clean',
    name: 'Mesh Gradient Dark Blue Clean',
    category: 'Design Systems',
    badge: 'MengTo',
    stars: 2465,
    tagline: 'Near-black navy system with a mesh field inside a hero shell.',
    image: '/plugins/codex-design/skills/mesh-gradient-dark-blue-clean.webp',
    whatIsIt:
      'A dark-blue direction with CSS color tokens, a border-gradient hero shell, canvas mesh field, glass nav pill, floating nodes, rails, and paired CTAs.',
    whyForDesign: [
      'The mesh sits inside the hero shell, so it drives composition rather than decorating it.',
      'Named tokens fix background, shell, line, copy, and accent values across the page.',
      'Rails, corner squares, and node pills give the minimal shell technical structure.',
    ],
    howWithCodex: [
      'Paste the token block, then build the page foundation and hero shell.',
      'Add the mesh canvas inside the shell, behind shell content.',
      'Place a few nodes, rails, and markers, then keep drift loops slow.',
    ],
    covers: [
      'System recipe',
      'Color tokens',
      'Hero shell',
      'Canvas mesh field',
      'Nodes and rails',
      'Motion defaults',
    ],
    tags: [
      'mesh gradient',
      'dark UI',
      'CSS tokens',
      'canvas',
      'hero',
    ],
    codexNote: 'Explicit Codex path: agent-skills/codex/',
    social: 'Upstream usage 839',
    repo: 'MengTo/Skills',
    install: { kind: 'clone', command: 'git clone https://github.com/MengTo/Skills', skillPath: 'agent-skills/web-design/mesh-gradient-dark-blue-clean/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Create a futuristic, premium, clean dark-blue mesh-gradient design system across background rendering, hero shell, navigation, floating nodes, framed sections, CTAs, and motion. Use when the interface needs a near-black ',
    source: { label: 'MengTo/Skills · agent-skills/web-design/mesh-gradient-dark-blue-clean', url: 'https://github.com/MengTo/Skills/tree/HEAD/agent-skills/web-design/mesh-gradient-dark-blue-clean' },
  },
  {
    slug: 'cinematic-scroll-storytelling',
    name: 'Cinematic Scroll Storytelling',
    category: 'Frontend & UI',
    badge: 'MengTo',
    stars: 2465,
    tagline: 'Lenis plus GSAP ScrollTrigger recipes for scroll-driven landing pages.',
    image: '/plugins/codex-design/skills/cinematic-scroll-storytelling.webp',
    whatIsIt:
      'Working code for a preloader, masked split-text reveals, section reveals, scrubbed pinned scenes, sticky card stacks, and parallax, using Lenis and GSAP ScrollTrigger.',
    whyForDesign: [
      'Motion tokens fix durations, staggers, offsets, and blur so reveals stay consistent.',
      'Every effect has a reduced-motion branch that keeps layout and contrast intact.',
      'A build order stages static page first, then motion, avoiding tangled scroll scenes.',
    ],
    howWithCodex: [
      'Install gsap and lenis, then wire Lenis into the GSAP ticker.',
      'Mark sections with the data attributes for reveals, stacks, and parallax.',
      'Add scrubbed pinned scenes last, then run the QA checklist.',
    ],
    covers: [
      'Effect vocabulary',
      'Motion tokens',
      'Page anatomy',
      'Split text reveal',
      'Sticky card stack',
      'QA checklist',
    ],
    tags: [
      'GSAP',
      'ScrollTrigger',
      'Lenis',
      'parallax',
      'animation',
    ],
    codexNote: 'Explicit Codex path: agent-skills/codex/',
    social: 'X @MengTo 1,861♥',
    repo: 'MengTo/Skills',
    install: { kind: 'clone', command: 'git clone https://github.com/MengTo/Skills', skillPath: 'agent-skills/web-design/cinematic-scroll-storytelling/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Create cinematic scroll-driven landing pages with Lenis smooth scrolling, GSAP ScrollTrigger, scroll-linked progression, staggered text reveals, sticky card stacks, parallax backgrounds, scroll-scrubbed transitions, foot',
    source: { label: 'MengTo/Skills · agent-skills/web-design/cinematic-scroll-storytelling', url: 'https://github.com/MengTo/Skills/tree/HEAD/agent-skills/web-design/cinematic-scroll-storytelling' },
  },
  {
    slug: 'agency-grid-layout-minimal',
    name: 'Agency Grid Layout Minimal',
    category: 'Design Systems',
    badge: 'MengTo',
    stars: 2465,
    tagline: 'Editorial multi-column grid with oversized headlines and tiny uppercase labels.',
    image: '/plugins/codex-design/skills/agency-grid-layout-minimal.webp',
    whatIsIt:
      'A layout direction for agency sites: wide grid shells, oversized display headlines, small uppercase metadata in adjacent columns, and architectural image blocks.',
    whyForDesign: [
      'Strict column placement makes every element position read as intentional.',
      'Scale contrast between display headlines and tiny metadata carries the hierarchy.',
      'Negative space is preserved instead of filled, keeping the page editorial.',
    ],
    howWithCodex: [
      'Set a wide max-width shell with visible column divisions first.',
      'Anchor a hero headline across most columns, support copy in a side column.',
      'Build service rows as multi-column listings with tiny metadata labels.',
    ],
    covers: [
      'Scope',
      'Visual target',
      'Implementation guidance',
      'Recommended patterns',
      'Tuning knobs',
      'Avoid',
    ],
    tags: [
      'grid',
      'editorial',
      'typography',
      'layout',
      'minimal',
    ],
    codexNote: 'Explicit Codex path: agent-skills/codex/',
    social: 'Upstream usage 657',
    repo: 'MengTo/Skills',
    install: { kind: 'clone', command: 'git clone https://github.com/MengTo/Skills', skillPath: 'agent-skills/web-design/agency-grid-layout-minimal/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Create a minimal agency design system with a disciplined editorial grid, oversized typography, quiet uppercase utility labels, restrained image blocks, and subtle structural detail.',
    source: { label: 'MengTo/Skills · agent-skills/web-design/agency-grid-layout-minimal', url: 'https://github.com/MengTo/Skills/tree/HEAD/agent-skills/web-design/agency-grid-layout-minimal' },
  },
  {
    slug: 'glass-dark-mode-clock',
    name: 'Glass Dark Mode Clock',
    category: 'Design Systems',
    badge: 'MengTo',
    stars: 2465,
    tagline: 'Dark frosted surfaces built around a circular calibration dial.',
    image: '/plugins/codex-design/skills/glass-dark-mode-clock.webp',
    whatIsIt:
      'A dark glass direction centered on a clock-like dial: near-black base with beam grids, frosted nav capsules, and a layered ring and tick centerpiece.',
    whyForDesign: [
      'A dominant dial anchors the layout instead of sitting as a decorative widget.',
      'Beam lines and crosshairs align to the dial, reinforcing the calibration logic.',
      'Monochrome palette means brightness comes from glass highlights, not saturated accents.',
    ],
    howWithCodex: [
      'Start with a near-black base plus faint grid and beam guides.',
      'Build nav, pills, and buttons as dark glass capsules with 1px highlight wrappers.',
      'Layer the dial: outer ring, ticks, rotating labels, center emblem.',
    ],
    covers: [
      'Scope',
      'Visual target',
      'Implementation guidance',
      'Recommended patterns',
      'Tuning knobs',
      'Avoid',
    ],
    tags: [
      'glassmorphism',
      'dark UI',
      'dial',
      'monochrome',
      'hero',
    ],
    codexNote: 'Explicit Codex path: agent-skills/codex/',
    social: 'Upstream usage 631',
    repo: 'MengTo/Skills',
    install: { kind: 'clone', command: 'git clone https://github.com/MengTo/Skills', skillPath: 'agent-skills/web-design/glass-dark-mode-clock/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Create a dark glass design system with frosted shells, soft beam grids, circular clock-like calibration dials, and precise sci-fi instrument framing.',
    source: { label: 'MengTo/Skills · agent-skills/web-design/glass-dark-mode-clock', url: 'https://github.com/MengTo/Skills/tree/HEAD/agent-skills/web-design/glass-dark-mode-clock' },
  },
  {
    slug: 'webgl-3d-object',
    name: 'WebGL 3D Object',
    category: 'Frontend & UI',
    badge: 'MengTo',
    stars: 2465,
    tagline: 'A lit Three.js hero mesh with PBR material and real shadows.',
    image: '/plugins/codex-design/skills/webgl-3d-object.webp',
    whatIsIt:
      'A Three.js recipe for one faceted hero object: icosahedron geometry, MeshStandardMaterial, perspective camera, key and rim lights, shadow plane, slow float rotation.',
    whyForDesign: [
      'Real geometry and lighting produce edges, highlights, and shadows CSS transforms cannot fake.',
      'Material presets cover premium metal, soft ceramic, and glow-tinted tech looks.',
      'Motion is limited to slow rotation and small bobbing, so copy stays primary.',
    ],
    howWithCodex: [
      'Add the square canvas shell, then run the Three.js initializer on it.',
      'Set color, metalness, roughness, and emissive to match brand mood.',
      'Confirm resize handling and teardown of geometry, material, and renderer.',
    ],
    covers: [
      'Rules',
      'HTML and CSS',
      'Three.js object recipe',
      'Material defaults',
      'Lighting defaults',
      'Quick checks',
    ],
    tags: [
      'Three.js',
      'WebGL',
      '3D',
      'PBR',
      'lighting',
    ],
    codexNote: 'Explicit Codex path: agent-skills/codex/',
    social: 'Upstream usage 528',
    repo: 'MengTo/Skills',
    install: { kind: 'clone', command: 'git clone https://github.com/MengTo/Skills', skillPath: 'agent-skills/web-design/webgl-3d-object/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Create a real 3D WebGL object with geometric mesh depth, physically based material, directional and ambient lighting, perspective camera, subtle rotation, and floating motion. Use when a page needs a faceted 3D hero obje',
    source: { label: 'MengTo/Skills · agent-skills/web-design/webgl-3d-object', url: 'https://github.com/MengTo/Skills/tree/HEAD/agent-skills/web-design/webgl-3d-object' },
  },
  {
    slug: 'gsap-skills',
    name: 'GSAP Skills',
    category: 'Frontend & UI',
    badge: 'greensock',
    stars: 12099,
    tagline: 'Official GSAP animation set, from core tweens to ScrollTrigger and React.',
    image: '/plugins/codex-design/skills/gsap-skills.webp',
    whatIsIt:
      'GreenSock’s official skill set for building web animation with GSAP. Eight modules cover the core API, timelines, ScrollTrigger, plugins, React, other frameworks, performance and utilities.',
    whyForDesign: [
      'Motion follows GSAP’s real API instead of the agent guessing at syntax.',
      'ScrollTrigger and timelines get sequenced properly, not stacked ad hoc.',
      'Performance rules keep animation smooth instead of janky on scroll.',
    ],
    howWithCodex: [
      'Install the GSAP skill set so Codex can load the relevant module.',
      'Ask for the motion you want; the right module handles the API.',
      'Reach for the React or frameworks module inside a component tree.',
    ],
    covers: [
      'Core API',
      'Timelines',
      'ScrollTrigger',
      'Plugins',
      'React and frameworks',
      'Performance and utils',
    ],
    tags: [
      'GSAP',
      'Animation',
      'ScrollTrigger',
      'Motion',
    ],
    bundle: 'Bundles 8 modules: core / timeline / scrolltrigger / plugins / react / frameworks / performance / utils',
    codexNote: 'Codex named 5× in the README',
    social: 'YT AI LABS 109,460',
    repo: 'greensock/gsap-skills',
    install: { kind: 'clone', command: 'git clone https://github.com/greensock/gsap-skills', skillPath: 'skills/gsap-core/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Official GSAP animation skill set: core API, timelines, ScrollTrigger, plugins, React, other frameworks, performance and utils.',
    source: { label: 'greensock/gsap-skills · skills/gsap-core', url: 'https://github.com/greensock/gsap-skills/tree/HEAD/skills/gsap-core' },
  },
  {
    slug: 'animation-review',
    name: 'Animation Review',
    category: 'Frontend & UI',
    badge: 'emilkowalski',
    stars: 19240,
    tagline: 'Find, improve and review motion against a senior craft bar.',
    image: '/plugins/codex-design/skills/animation-review.webp',
    whatIsIt:
      'Three of Emil Kowalski’s motion skills working as one loop: find places that should animate, improve existing motion, and review animation code against a high craft bar.',
    whyForDesign: [
      'Surfaces UI that should move but doesn’t, and rejects motion that shouldn’t.',
      'Turns vague ‘make it feel nicer’ into a prioritised motion audit.',
      'Holds animation to a named craft bar, not personal taste.',
    ],
    howWithCodex: [
      'Run the find pass to locate motion opportunities in your UI.',
      'Apply the improve pass to rework existing animation code.',
      'Run the review pass before shipping to catch low-craft motion.',
    ],
    covers: [
      'Find animation opportunities',
      'Improve animations',
      'Review animations',
      'Craft bar',
    ],
    tags: [
      'Motion',
      'Animation',
      'Review',
      'Craft',
    ],
    bundle: 'Bundles 3 commands: find-animation-opportunities / improve-animations / review-animations',
    codexNote: 'No Codex mention; agent-agnostic',
    social: 'X @emilkowalski 6,494♥',
    repo: 'emilkowalski/skills',
    install: { kind: 'clone', command: 'git clone https://github.com/emilkowalski/skills', skillPath: 'skills/find-animation-opportunities/SKILL.md' },
    license: { label: 'MIT', url: 'https://opensource.org/license/mit' },
    upstreamDescription:
      'Find, improve and review motion in a codebase against a senior craft bar.',
    source: { label: 'emilkowalski/skills · skills/find-animation-opportunities', url: 'https://github.com/emilkowalski/skills/tree/HEAD/skills/find-animation-opportunities' },
  },
];

export function getCodexSkill(slug: string): CodexSkill | undefined {
  return CODEX_SKILLS.find((s) => s.slug === slug);
}

/**
 * Curated skills are served from static `/plugins/<slug>/` routes, which Astro
 * resolves ahead of the bundled `[slug]` catalogue route. That precedence is
 * what keeps the catalogue route untouched — but it also means a bundled plugin
 * that later claims one of these slugs would be silently shadowed. Fail the
 * build instead, so the collision surfaces as an error rather than a missing
 * catalogue page.
 */
export function assertNoCodexSlugCollision(bundledDetailSlugs: Iterable<string>): void {
  const reserved = new Set(CODEX_SKILLS.map((s) => s.slug));
  const clashes = [...bundledDetailSlugs].filter((slug) => reserved.has(slug));
  if (clashes.length > 0) {
    throw new Error(
      `Bundled plugin slug(s) collide with curated Codex design routes: ${clashes.join(', ')}. ` +
        'Rename the curated slug in codex-design.ts or the bundled plugin id.',
    );
  }
}
