/*
 * Data model for the curated "DeepSeek Harness design" collection under
 * `/plugins/deepseek-harness-design-plugins/`.
 *
 * Sibling of `codex-design.ts` on the shared curated-collection types. Unlike
 * the Codex board — which curates agent-agnostic SKILL.md skills — this one
 * curates plugins NATIVE to DeepSeek Harness (`dsh`), whose "everything is a
 * plugin" architecture lets third-party packages add vision input, design
 * canvases and generative UI the text-only harness lacks out of the box.
 * DeepSeek Harness also reads the same SKILL.md format as Claude Code and
 * Codex, so the collection page cross-links the Codex board instead of
 * duplicating those entries.
 *
 * English is the baseline here; per-locale copy is layered on top via
 * `deepseek-i18n.ts` (falls back to English on any miss). Every entry below
 * is verified against a real upstream source — do not add anything that
 * can't be linked. Install commands are verbatim from each repo's README.
 */
import type {
  CuratedCollectionContent,
  CuratedInstall,
  CuratedLink,
  CuratedSkill,
} from './curated-collection';

/** The star CTA points at the harness itself until a curated list repo exists. */
export const DSH_REPO_URL = 'https://github.com/deepseek-ai/deepseek-harness';
export const DEEPSEEK_HUB_PATH = '/plugins/deepseek-harness-design-plugins/';
export const DEEPSEEK_OD_DOWNLOAD_URL = '/download/';
export const DEEPSEEK_GUIDE_HREF = '/agents/deepseek-harness-design/';

export type DeepseekSkillCategory =
  | 'Vision & Input'
  | 'Canvas & Generative UI'
  | 'Design Workflow'
  | 'Workspace & Preview';

export type DeepseekSkillLink = CuratedLink;
export type DeepseekInstall = CuratedInstall;
export type DeepseekSkill = CuratedSkill<DeepseekSkillCategory>;
export type DeepseekCollection = CuratedCollectionContent<DeepseekSkillCategory>;

const MIT = { label: 'MIT', url: 'https://opensource.org/license/mit' } as const;

/** Public repo without a licence file; the label says so instead of implying one. */
const noLicense = (repoUrl: string) =>
  ({ label: 'No license yet', url: repoUrl }) as const;

export const DEEPSEEK_COLLECTION: DeepseekCollection = {
  eyebrow: 'DeepSeek Harness design',
  heading: 'DeepSeek Harness plugins for design',
  lede: 'A curated collection of dsh plugins for design work: vision bridges that read screenshots, canvases and generative UI the agent can draw on, design review tools, and workbenches that preview it all. DeepSeek Harness reads the same SKILL.md format as Claude Code and Codex, so your design skill library carries over.',
  stats: [
    { value: '13', label: 'curated dsh plugins' },
    { value: '13', label: 'source repos' },
    { value: 'SKILL.md', label: 'shared with Claude Code & Codex' },
  ],
  intro:
    'Every dsh plugin below is real, native to DeepSeek Harness, discoverable through the dsh-plugin topic on GitHub, and links to its source. They fall into four jobs: give the text-only harness vision, give it design surfaces to draw on, wire design review into the loop, and turn its web UI into a design workspace.',
  categories: [
    {
      key: 'Vision & Input',
      blurb: 'Turn screenshots, mockups and charts into structured evidence a text-only model can act on.',
    },
    {
      key: 'Canvas & Generative UI',
      blurb: 'Give the agent surfaces to draw on: editable vector canvases, live UI cards, slides.',
    },
    {
      key: 'Design Workflow',
      blurb: 'Close the loop: annotate real pages, compile motion assets, carry your skill library over.',
    },
    {
      key: 'Workspace & Preview',
      blurb: 'Make the harness itself a design workspace: preview panels, workbenches and boards beside the chat.',
    },
  ],
};

export const DEEPSEEK_SKILLS: readonly DeepseekSkill[] = [
  /* ------------------------------- Vision & Input ------------------------ */
  {
    slug: 'modlens',
    name: 'modlens',
    category: 'Vision & Input',
    badge: 'liustack',
    stars: 962,
    tagline: 'Gives text-only DeepSeek models plug-in vision: paste a screenshot, get structured evidence.',
    image: '/plugins/deepseek-harness-design/skills/modlens.webp',
    whatIsIt:
      'A vision bridge for text-only coding agents. Paste an image into the chat and modlens converts it into structured JSON evidence — full transcription, layout regions in reading order, entities and relations — instead of a model’s guess.',
    whyForDesign: [
      'UI screenshots become element-by-element walkthroughs the agent can act on.',
      'Dense charts and data visualizations are read completely: axes, scales, palettes, highlighted regions.',
      'Paste several references at once and it identifies the shared visual family before describing each one.',
    ],
    howWithAgent: [
      'Install the plugin; the model picker gains DeepSeek-V4 variants with modlens vision.',
      'Paste a screenshot, mockup or chart straight into the conversation.',
      'Ask design questions against the structured evidence instead of re-describing the image.',
    ],
    covers: [
      'Highlights',
      'Installation',
      'Usage',
      'See it work',
      'Documentation',
    ],
    tags: ['Vision', 'OCR', 'Screenshots', 'Structured evidence'],
    agentNote: '“The first vision plugin for DeepSeek Harness”, per its own README',
    social: 'X @Khazix0918 DSH guide 456♥ · community plugin ranking #7',
    repo: 'liustack/modlens',
    install: {
      kind: 'installer',
      command: 'npx -y @deepseek-ai/dsh plugin --profile web add @liustack/modlens@latest',
    },
    license: MIT,
    upstreamDescription:
      'The first vision plugin for DeepSeek Harness, and the vision bridge for every text-only coding agent. Paste an image, get structured JSON evidence (OCR, layout, semantics).',
    source: { label: 'liustack/modlens', url: 'https://github.com/liustack/modlens' },
  },
  {
    slug: 'dsh-vision-toolkit',
    name: 'dsh-vision-toolkit',
    category: 'Vision & Input',
    badge: 'Anionex',
    stars: 261,
    tagline: 'Ten vision tools for UI restoration, grounding and pixel-diff verification.',
    image: '/plugins/deepseek-harness-design/skills/dsh-vision-toolkit.webp',
    whatIsIt:
      'A DeepSeek Harness-native bundle of ten vision tools: image Q&A, grounding and detection with pixel coordinates, long-screenshot OCR, cropping, color extraction, HTML screenshots and pixel diff. Tools mount progressively through a vision-tools skill.',
    whyForDesign: [
      'UI restoration closes the loop with numbers: a checked-in workflow iterates a rebuild from 6.04% pixel difference down to 0%.',
      'Grounding and detection return original-image pixel boxes, so the agent acts on coordinates instead of parsing prose.',
      'Infographics and hand-drawn sketches become editable HTML/CSS interfaces.',
    ],
    howWithAgent: [
      'Add the plugin to your web or headless profile and set a vision credential for the remote tools.',
      'Activate the toolkit; the vision-tools skill mounts all ten tool schemas.',
      'Rebuild a reference, then verify with vision_html_screenshot and vision_pixel_diff.',
    ],
    covers: [
      'Why this exists',
      'Proven use cases',
      'Reference-to-pixel verification',
      'Tools',
      'Security and execution model',
    ],
    tags: ['UI restoration', 'Pixel diff', 'Grounding', 'OCR'],
    agentNote: 'Ships as a DeepSeek Harness Profile Bundle with 136 checked-in tests',
    social: 'X @anion_ex 24♥ · upstream repo 735★',
    repo: 'Anionex/dsh-vision-toolkit',
    reference: {
      label: 'Upstream: Anionex/agent-vision-toolkit',
      url: 'https://github.com/Anionex/agent-vision-toolkit',
    },
    install: {
      kind: 'installer',
      command: 'dsh plugin --profile web add @dsh-external/dsh-vision-toolkit',
    },
    license: MIT,
    upstreamDescription:
      'DeepSeek Harness-native integration for agent-vision-toolkit: image Q&A, long-screenshot OCR, UI restoration, grounding, pixel diff, Artifacts, and Web UI.',
    source: { label: 'Anionex/dsh-vision-toolkit', url: 'https://github.com/Anionex/dsh-vision-toolkit' },
  },
  {
    slug: 'dsh-ui-spec',
    name: 'dsh-ui-spec',
    category: 'Vision & Input',
    badge: 'yumimanji',
    stars: 1,
    tagline: 'Turns UI screenshots into implementation-grade specs: tokens, spacing scale, layout grid.',
    image: '/plugins/deepseek-harness-design/skills/dsh-ui-spec.webp',
    whatIsIt:
      'A single analyze_ui_image tool that converts a screenshot or mockup into a structured frontend spec. A deterministic geometry layer measures exact dimensions, palette, suggested design tokens, layout grid and spacing scale; an optional vision model adds semantics on top.',
    whyForDesign: [
      'Pixel coordinates, spacing scales and token palettes are computed deterministically, not guessed by a vision model.',
      'Spec fields map straight to implementation: suggested tokens to design tokens, the spacing scale to CSS.',
      'Semantic roles supply intent while geometry supplies placement, merged into one JSON + Markdown spec.',
    ],
    howWithAgent: [
      'Add the plugin; the geometry layer works offline with zero configuration.',
      'Optionally point the semantic layer at any OpenAI-compatible vision endpoint.',
      'Hand the agent a screenshot and build from the returned spec instead of the image.',
    ],
    covers: [
      'Why this exists',
      'Configure the semantic layer',
      'The tool',
      'How to use the spec',
      'Status & caveats',
    ],
    tags: ['Design tokens', 'Screenshot to code', 'Layout grid', 'Spec'],
    agentNote: 'A TypeScript port of the Claude Code skill ui-reference-frontend',
    repo: 'yumimanji/dsh-ui-spec',
    install: { kind: 'installer', command: 'dsh plugin --profile web add dsh-ui-spec' },
    license: MIT,
    upstreamDescription:
      'DeepSeek Harness plugin: turn UI screenshots into structured, implementation-grade web frontend specs. Deterministic geometry (sharp) + optional vision-model semantics, merged into one JSON + Markdown spec.',
    source: { label: 'yumimanji/dsh-ui-spec', url: 'https://github.com/yumimanji/dsh-ui-spec' },
  },
  {
    slug: 'dsh-media-skills',
    name: 'dsh-media-skills',
    category: 'Vision & Input',
    badge: 'akqwpeter-prog',
    stars: 1,
    tagline: 'Free eyes and a free paintbrush: paste-image reading plus watermark-free image generation.',
    image: '/plugins/deepseek-harness-design/skills/dsh-media-skills.webp',
    whatIsIt:
      'Two SKILL.md skills and a free vision-model route for the harness: vision-review reads screenshots and catches visual bugs, media-tools generates illustrations, avatars, backgrounds and banners — both running on free-tier models.',
    whyForDesign: [
      'Catches UI visual bugs a text agent cannot see: overlap, overflow, misalignment.',
      'Generates design assets watermark-free on a free tier, so exploration costs nothing.',
      'Adds an "Add image" button to text-only sessions; pasted images are described to the current model.',
    ],
    howWithAgent: [
      'Add the plugin and drop the free API keys into the harness credential store.',
      'Restart dsh web; the model picker gains a free vision route.',
      'Ask for a review of a screenshot, or for a new asset, in plain language.',
    ],
    covers: ['Capabilities', 'Quick start', 'Keys', 'Usage', 'Layout'],
    tags: ['Image generation', 'Visual review', 'Free tier', 'SKILL.md'],
    agentNote: 'Ships its capabilities as SKILL.md skills — the same format Claude Code and Codex read',
    repo: 'akqwpeter-prog/dsh-media-skills',
    install: {
      kind: 'installer',
      command: 'dsh plugin --profile <name> add github:akqwpeter-prog/dsh-media-skills',
    },
    license: MIT,
    upstreamDescription:
      'Free vision model, paste-image reading & generation skills for DeepSeek Harness.',
    source: { label: 'akqwpeter-prog/dsh-media-skills', url: 'https://github.com/akqwpeter-prog/dsh-media-skills' },
  },

  /* --------------------------- Canvas & Generative UI -------------------- */
  {
    slug: 'dsh-openpencil',
    name: 'dsh-openpencil',
    category: 'Canvas & Generative UI',
    badge: 'ZSeven-W',
    stars: 55,
    tagline: 'The agent designs on a real, editable vector canvas instead of returning static images.',
    image: '/plugins/deepseek-harness-design/skills/dsh-openpencil.webp',
    whatIsIt:
      'Connects the harness to OpenPencil, an open-source AI-native vector design tool. Five tools let the agent create, edit, render and inspect design-as-code .op documents through transactional batches, with multi-frame previews and a managed editor for human takeover.',
    whyForDesign: [
      'One loop from requirement to canvas: the agent edits the real document and previews render design-faithful frames.',
      'Transactional batches publish only on success and never overwrite external edits — conflicts surface instead.',
      'A managed editor with selection, layers, properties and undo lets a human take over the agent’s output at any point.',
    ],
    howWithAgent: [
      'Install OpenPencil, then add the plugin to your web profile.',
      'Describe the design; the agent drives openpencil_create and openpencil_edit in batches.',
      'Open the rendered preview or the managed editor and keep iterating in place.',
    ],
    covers: [
      'Why DSH OpenPencil',
      'Design Tools',
      'Agent Design Workflow',
      'Rendering Contract',
      'Managed Editor',
      'Current Limits',
    ],
    tags: ['Vector canvas', 'Design as code', 'Editable output', 'Preview'],
    agentNote: 'Drives design-as-code .op files; OpenPencil ships a built-in MCP server',
    social: 'X @FiniYang 283♥ · 60 replies',
    repo: 'ZSeven-W/dsh-openpencil',
    install: {
      kind: 'installer',
      command: 'npx --yes -p @deepseek-ai/dsh@0.1.0-rc.6 dsh plugin --profile web add @zseven-w/dsh-openpencil@latest',
    },
    license: MIT,
    upstreamDescription: 'OpenPencil design preview and editing plugin for DSH',
    source: { label: 'ZSeven-W/dsh-openpencil', url: 'https://github.com/ZSeven-W/dsh-openpencil' },
  },
  {
    slug: 'dsh-visualize',
    name: 'dsh-visualize',
    category: 'Canvas & Generative UI',
    badge: 'Nagi-ovo',
    stars: 62,
    tagline: 'The model draws interactive HTML cards directly into the conversation stream.',
    image: '/plugins/deepseek-harness-design/skills/dsh-visualize.webp',
    whatIsIt:
      'A visualize tool plus companion skill: the model writes an HTML fragment and mounts it as a sandboxed interactive card inside the chat — simulators, charts, comparison panels and UI mockups, with streaming preview and theme-matched styling.',
    whyForDesign: [
      'UI mockups live in the conversation and can be clicked, not just described.',
      'Cards follow the host light/dark theme and palette, so previews look native.',
      'Every card runs in a sandboxed iframe with a strict CSP — a broken fragment cannot break the session.',
    ],
    howWithAgent: [
      'Add the plugin and restart dsh web.',
      'Ask for a mockup or a comparison; the model calls visualize with its own HTML.',
      'Replay the session later — cards are restored from the persisted tool result.',
    ],
    covers: ['Install', 'Use it', 'Security', 'Limitations'],
    tags: ['Generative UI', 'HTML cards', 'Mockups', 'Sandbox'],
    agentNote: 'Inspired by Codex desktop’s /visualize, rebuilt as a harness plugin',
    social: 'X @Nag1ovo 96♥',
    repo: 'Nagi-ovo/dsh-visualize',
    install: {
      kind: 'installer',
      command: 'dsh plugin --profile web add github:Nagi-ovo/dsh-visualize',
    },
    license: noLicense('https://github.com/Nagi-ovo/dsh-visualize'),
    upstreamDescription:
      'DSH does not have to answer with text alone. When the model calls visualize, the Web UI renders an interactive card inside the conversation for simulators, charts, comparison panels, and UI mockups.',
    source: { label: 'Nagi-ovo/dsh-visualize', url: 'https://github.com/Nagi-ovo/dsh-visualize' },
  },
  {
    slug: 'dsh-genui',
    name: 'dsh-genui',
    category: 'Canvas & Generative UI',
    badge: 'omdsh-dev',
    stars: 54,
    tagline: 'Thirty-plus interactive components rendered inline in replies, with an action loop back to the model.',
    image: '/plugins/deepseek-harness-design/skills/dsh-genui.webp',
    whatIsIt:
      'The model describes an interface as JSON in a dsh-ui fence; a browser-side renderer turns it into live components inside the reply — cards, tables, charts, forms, tabs, timelines, diffs, mermaid, 3D scenes — appearing as the answer streams.',
    whyForDesign: [
      'Answers become interfaces: data panels, charts and forms render where the explanation happens.',
      'Interactive components send actions back to the model, which updates the UI in turn.',
      'A component whitelist and spec guard mean a broken chart never hits the screen.',
    ],
    howWithAgent: [
      'Add the plugin from GitHub and restart dsh web.',
      'Ask for a dashboard, quiz or form; the model writes the dsh-ui fence itself.',
      'Interact with the result — local actions respond instantly, model actions loop back.',
    ],
    covers: [
      'Dual-channel rendering',
      'Before vs. after',
      'What it can do',
      'How it works',
      'Roadmap',
    ],
    tags: ['Generative UI', 'Inline components', 'Charts', 'Event loop'],
    agentNote: 'Dual-channel rendering works with any open-source dsh build, per its README',
    repo: 'omdsh-dev/dsh-genui',
    install: {
      kind: 'installer',
      command: 'dsh plugin --profile web add git+https://github.com/omdsh-dev/dsh-genui.git',
    },
    license: MIT,
    upstreamDescription:
      'GenUI for DeepSeek Harness: interactive UI components rendered inline in assistant replies via the dsh-ui fence — layout, charts, plots, forms, quizzes, mermaid, 3D scenes, and an action event loop back to the model.',
    source: { label: 'omdsh-dev/dsh-genui', url: 'https://github.com/omdsh-dev/dsh-genui' },
  },
  {
    slug: 'dsh-openmaic',
    name: 'dsh-openmaic',
    category: 'Canvas & Generative UI',
    badge: 'THU-MAIC',
    stars: 5,
    tagline: 'Slides, interactive widgets and full playable lessons, rendered from agent-written JSON.',
    image: '/plugins/deepseek-harness-design/skills/dsh-openmaic.webp',
    whatIsIt:
      'Four tools and a Socratic-teaching skill from the THU-MAIC group: the agent writes PPTist-style slide JSON rendered by the official OpenMAIC renderer, streams interactive widgets as sandboxed cards, and can submit a one-line request that comes back as a playable classroom.',
    whyForDesign: [
      'Slide decks with text, shapes, images, tables, charts, formulas and code — written as JSON in the conversation.',
      'Interactive simulations and games render in place as sandboxed cards.',
      'A full lesson with visual content is one request away, returned as a playable link.',
    ],
    howWithAgent: [
      'Add the plugin from GitHub; it ships compiled, so no build step.',
      'Restart dsh web and ask for a deck or a widget.',
      'For whole lessons, openmaic_generate polls the OpenMAIC service and returns the classroom link.',
    ],
    covers: ['What it looks like', 'Install', 'Config', 'API flow', 'Scope'],
    tags: ['Slides', 'Widgets', 'Education', 'Renderer'],
    agentNote: 'Maintained by the THU-MAIC group; renders with the official OpenMAIC SDK',
    repo: 'THU-MAIC/dsh-openmaic',
    install: {
      kind: 'installer',
      command: 'dsh plugin --profile web add git+https://github.com/THU-MAIC/dsh-openmaic.git',
    },
    license: MIT,
    upstreamDescription:
      'OpenMAIC for DeepSeek Harness: classrooms, slides, interactive widgets, and Socratic teaching',
    source: { label: 'THU-MAIC/dsh-openmaic', url: 'https://github.com/THU-MAIC/dsh-openmaic' },
  },

  /* ------------------------------ Design Workflow ------------------------ */
  {
    slug: 'dsh-web-review',
    name: 'dsh-web-review',
    category: 'Design Workflow',
    badge: 'CanglongCl',
    stars: 10,
    tagline: 'Point at elements on a live page, annotate visually, and the agent edits the source.',
    image: '/plugins/deepseek-harness-design/skills/dsh-web-review.webp',
    whatIsIt:
      'A built-in browser for the harness web UI: hover-highlight and select elements like in a design tool, attach notes, and try live visual adjustments — text, color, typography, size, spacing, borders, effects. Annotations carry selectors and source clues so the agent can find and fix the code.',
    whyForDesign: [
      'Visual point-and-annotate replaces describing UI problems in words.',
      'Live adjustments preview a change on the page before any code is touched.',
      'Ships eight bundled design skills, from better-typography to interface-review, usable from the annotation editor.',
    ],
    howWithAgent: [
      'Add the plugin and start dsh web.',
      'Open your running app in the Web Preview tab and annotate what should change.',
      'Send — the agent receives selectors, notes and tried values, and edits the workspace source.',
    ],
    covers: [
      'Web Preview',
      'Element Annotations',
      'Live Visual Adjustments',
      'AI Collaboration',
      'UI Design Skills',
    ],
    tags: ['Design review', 'Annotation', 'Live preview', 'Frontend'],
    agentNote: 'Its own README compares the built-in browser to v0 and Codex',
    repo: 'CanglongCl/dsh-web-review',
    install: {
      kind: 'installer',
      command: 'dsh plugin --profile web add @canglongcl/dsh-web-review',
    },
    license: noLicense('https://github.com/CanglongCl/dsh-web-review'),
    upstreamDescription:
      'Select page elements in the built-in browser as you would in a design tool, leave feedback, and preview changes to text, colors, typography, dimensions, spacing, borders, and effects. Once submitted, the agent uses your page annotations to update the source code.',
    source: { label: 'CanglongCl/dsh-web-review', url: 'https://github.com/CanglongCl/dsh-web-review' },
  },
  {
    slug: 'dsh-figma-to-lottie',
    name: 'dsh-figma-to-lottie',
    category: 'Design Workflow',
    badge: 'zimai233',
    stars: 1,
    tagline: 'Compiles SVG paths and keyframes into self-contained Lottie animations from the conversation.',
    image: '/plugins/deepseek-harness-design/skills/dsh-figma-to-lottie.webp',
    whatIsIt:
      'Two tools that turn design data into motion assets: lottie_compile_shape converts an SVG path into Lottie shape values, and lottie_compile assembles a complete Lottie JSON from a compact layer spec — rectangles, gradients, paths, embedded images and text, with per-layer keyframe animation.',
    whyForDesign: [
      'Describe a loading animation in plain language and get a .lottie.json that runs on iOS, Android and the web.',
      'Bezier in/out tangents and keyframe easing are compiled, not hand-authored.',
      'Zero build step and pure ESM: what is published is exactly what runs.',
    ],
    howWithAgent: [
      'Add the plugin from npm, or lock a commit from GitHub.',
      'Describe the motion: layers, timing, easing, stagger.',
      'Drop the compiled .lottie.json into LottieWeb, lottie-ios or lottie-android.',
    ],
    covers: ['Why', 'Features', 'Usage', 'Layer Spec Reference', 'Development'],
    tags: ['Lottie', 'Animation', 'Motion', 'SVG'],
    agentNote: '“The DSH plugin ecosystem has no design-tool bridge” — the gap its README names',
    repo: 'zimai233/dsh-figma-to-lottie',
    install: {
      kind: 'installer',
      command: 'dsh plugin --profile myprofile add dsh-figma-to-lottie',
    },
    license: MIT,
    upstreamDescription:
      'Figma/SVG to Lottie animation compiler for DeepSeek Harness. Turn SVG paths and keyframe data into self-contained .lottie.json files.',
    source: { label: 'zimai233/dsh-figma-to-lottie', url: 'https://github.com/zimai233/dsh-figma-to-lottie' },
  },
  {
    slug: 'dsh-plugin-claude-bridge',
    name: 'dsh-plugin-claude-bridge',
    category: 'Design Workflow',
    badge: 'YYTbit',
    stars: 3,
    tagline: 'Your Claude Code skills, memory and global instructions, available in the harness with zero migration.',
    image: '/plugins/deepseek-harness-design/skills/dsh-plugin-claude-bridge.webp',
    whatIsIt:
      'Reads Claude Code’s standard file locations directly — no migration scripts, no copying, no symlinks. Skills from ~/.claude/skills join the harness skill catalog, project memory is injected as context on every request, and CLAUDE.md global instructions carry over.',
    whyForDesign: [
      'Design skills you already run in Claude Code work here without moving a file.',
      'Project memory is re-read on each request, so new notes take effect immediately.',
      'Global instructions and collaboration preferences are preserved across agents.',
    ],
    howWithAgent: [
      'Add the plugin to your profile; it works with zero configuration.',
      'Optionally point it at extra skill directories such as ~/.agents/skills.',
      'Invoke your existing skills by name, as you would in Claude Code.',
    ],
    covers: [
      'What it does',
      'Configuration',
      'Memory injection',
      'Skill catalog',
      'Global instructions',
    ],
    tags: ['Claude Code', 'SKILL.md', 'Interop', 'Memory'],
    agentNote: '“Zero migration, full compatibility” — its own tagline',
    repo: 'YYTbit/dsh-plugin-claude-bridge',
    install: {
      kind: 'installer',
      command: 'dsh plugin --profile your-profile add dsh-plugin-claude-bridge',
    },
    license: MIT,
    upstreamDescription: 'Bridge Claude Code memory, skills, and config into DeepSeek Harness',
    source: { label: 'YYTbit/dsh-plugin-claude-bridge', url: 'https://github.com/YYTbit/dsh-plugin-claude-bridge' },
  },

  /* ----------------------------- Workspace & Preview --------------------- */
  {
    slug: 'dsh-web-ui',
    name: 'dsh-web-ui',
    category: 'Workspace & Preview',
    badge: 'zhu1090093659',
    stars: 1274,
    tagline: 'The ecosystem\u2019s biggest UI kit: task board, preview panel, git graph and a skin center.',
    image: '/plugins/deepseek-harness-design/skills/dsh-web-ui.webp',
    whatIsIt:
      'A plugin and skin collection for the harness web UI: a five-column task board whose cards run real agent sessions, a right-side panel with a file tree and multi-tab previews, a git graph, mobile remote control and a try-before-you-apply skin center.',
    whyForDesign: [
      'The right-side panel previews Markdown, HTML, diffs, CSV, PDF, Office files and images next to the conversation.',
      'The task board turns design todos into cards a real dsh agent session executes and reports back on.',
      'Panel width is draggable and persists per project, so the workspace stays the way you arranged it.',
    ],
    howWithAgent: [
      'Add the aggregate package to your web profile to install everything at once.',
      'Open the right-side panel and pin the files and previews you are working against.',
      'Drop design tasks on the board and let the cards execute in real agent sessions.',
    ],
    covers: [
      'Task board',
      'Git graph',
      'Right-side panel',
      'Mobile remote',
      'Skin center',
    ],
    tags: ['Workbench', 'Preview', 'Task board', 'Web UI'],
    agentNote: 'The most-starred plugin collection on the dsh-plugin GitHub topic',
    repo: 'zhu1090093659/dsh-web-ui',
    install: {
      kind: 'installer',
      command: 'dsh plugin --profile web add @linxin666/dsh-web-ui-all@0.1.10',
    },
    license: { label: 'BSD-3-Clause', url: 'https://github.com/zhu1090093659/dsh-web-ui' },
    upstreamDescription:
      'Plugin and skin collection for DeepSeek Harness (DSH) Web UI - task board, git graph, right-side panel, remote mobile UI, pet, live token stats, and skin center.',
    source: { label: 'zhu1090093659/dsh-web-ui', url: 'https://github.com/zhu1090093659/dsh-web-ui' },
  },
  {
    slug: 'dsh-better-sidebar',
    name: 'DSH-better-sidebar',
    category: 'Workspace & Preview',
    badge: 'omdsh-dev',
    stars: 522,
    tagline: 'A full workbench in the sidebar: file explorer, rich previews, terminal, git and a browser.',
    image: '/plugins/deepseek-harness-design/skills/dsh-better-sidebar.webp',
    whatIsIt:
      'A dual-panel workbench for the harness web UI: a lazy-loading file explorer with CodeMirror editing, inline previews for images, Markdown, HTML, PDF and Office files, a real terminal, a git panel with VS Code-style diffs, an embedded sandboxed browser, and draggable split-pane tabs.',
    whyForDesign: [
      'Preview the HTML, images and documents the agent produces without leaving the conversation.',
      'An embedded sandboxed browser opens your running prototype in a tab beside the chat.',
      'Third-party plugins can register their own tabs and file previewers through its service API.',
    ],
    howWithAgent: [
      'Install with the one-line script, or add the npm package to your web profile.',
      'Open the workbench and arrange tabs across the right sidebar and the bottom panel.',
      'Review what the agent built in place: previews, diffs, terminal and browser tabs.',
    ],
    covers: [
      'File explorer',
      'Editing & preview',
      'Terminal',
      'Git panel',
      'Embedded browser',
      'Split-pane workbench',
    ],
    tags: ['Sidebar', 'Preview', 'Terminal', 'Git'],
    agentNote: 'Mounted through the official CLI\u2019s dsh.bundle.patch \u2014 no harness source changes',
    repo: 'omdsh-dev/DSH-better-sidebar',
    install: {
      kind: 'installer',
      command: 'npx -y --package @deepseek-ai/dsh dsh plugin --profile web add dsh-better-sidebar',
    },
    license: MIT,
    upstreamDescription:
      '\u4e00\u4e2a\u4fa7\u8fb9\u680f\u7684\u5b8c\u6574\u5de5\u4f5c\u53f0\uff0c\u652f\u6301\u4e09\u65b9\u62d3\u5c55\u6ce8\u518c\u65b0Tab\u9875\u9762\uff0c\u5185\u7f6e\u6587\u4ef6\u6e32\u67d3\u7f16\u8f91/\u7ec8\u7aef/Git/\u5b50\u4ee3\u7406',
    source: { label: 'omdsh-dev/DSH-better-sidebar', url: 'https://github.com/omdsh-dev/DSH-better-sidebar' },
  },
];

export function getDeepseekSkill(slug: string): DeepseekSkill | undefined {
  return DEEPSEEK_SKILLS.find((s) => s.slug === slug);
}
