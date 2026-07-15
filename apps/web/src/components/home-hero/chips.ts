// Stage B of plugin-driven-flow-plan — Home intent rail.
//
// The Home input card sits naked above an unstructured prompt. New
// users frequently type a request without knowing which scenario
// plugin to apply, which lands them in the generic agent path and
// stretches the convergence loop. This chip rail exposes high-signal
// NewProjectModal categories plus a small set of lower-row shortcuts
// (plugin authoring / Figma / template), so the same Enter
// keystroke can hit a scenario-bound run. The generic "other" path stays
// in the free-form prompt instead of becoming a redundant chip.
//
// The catalog stays a pure data table:
//   - `id` — stable React key + test selector.
//   - `label` — English copy. Localisation can layer on later by
//     swapping this for a Dict lookup; keeping it inline lets the
//     rail ship without burning through 17 locale files for two
//     new strings (see plan §B / open questions).
//   - `icon` — name from the shared Icon registry.
//   - `action` — discriminated union the HomeView dispatcher matches
//     on. The rail component itself stays presentational.

import type { ProjectKind, ProjectMetadata } from '@open-design/contracts';
import type { DefaultScenarioPluginId } from '@open-design/contracts';
import type { IconName } from '../Icon';

// Plugin ids the chip rail can dispatch to. Most chips route to a
// `DefaultScenarioPluginId` so the same fallback table the daemon
// uses for naked Home queries stays the source of truth. Specialised
// chips (HyperFrames lives under `plugins/_official/examples/hyperframes/`
// and surfaces as the `example-hyperframes` bundled plugin id) bypass
// the default table by carrying their own plugin id directly. The
// curated union keeps typo safety while letting the rail evolve
// independently of the default-binding mapping.
export type ChipScenarioPluginId =
  | DefaultScenarioPluginId
  | 'example-hyperframes'
  // Powered-preview scenarios: real-time GPU / off-main-thread artifacts that
  // render in the cross-origin-isolated "powered preview" iframe. They ship
  // their own bundled example plugins under plugins/_official/examples/, so —
  // like example-hyperframes — they carry their plugin id directly rather than
  // routing through the default kind→plugin table.
  | 'example-webgl-experience';

export type ChipAction =
  | {
      kind: 'apply-scenario';
      pluginId: ChipScenarioPluginId;
      projectKind: ProjectKind;
      inputs?: Record<string, unknown>;
      projectMetadata?: ProjectMetadata;
    }
  | {
      kind: 'apply-figma-migration';
      pluginId: 'od-figma-migration';
      projectKind: ProjectKind;
      inputs?: Record<string, unknown>;
      projectMetadata?: ProjectMetadata;
    }
  | { kind: 'create-plugin' }
  | { kind: 'open-template-picker' }
  // Routes the user into the Brand Kit tab and opens its New Brand Kit modal,
  // reusing the same extraction flow as the tab's own "New Brand Kit" button.
  | { kind: 'create-brand-kit' };

// Two intent groups: "create" = produce a design artifact, "migrate" =
// lower-row starter shortcuts such as plugin authoring, imports, and
// templates. The grouping is structural only — HomeHero renders the two
// groups in separate flex containers so they wrap onto separate rows on
// narrow viewports without horizontal scrolling.
export type ChipGroup = 'create' | 'migrate';

export interface HomeHeroChip {
  id: string;
  label: string;
  icon: IconName;
  group: ChipGroup;
  hint?: string;
  // Scenario subtitle shown under the title on the illustrated card rail
  // (e.g. "Interactive app mockups"). English inline fallback only — the
  // rendered copy is localized through the `homeHero.chip.<id>Desc` Dict key
  // (see `homeHeroChipDescription` in HomeHero.tsx). Kept on the data table so
  // the catalog reads as a self-contained scenario taxonomy.
  description?: string;
  action: ChipAction;
}

export const HOME_HERO_CHIPS: ReadonlyArray<HomeHeroChip> = [
  {
    id: 'create-brand-kit',
    // Inline English fallback only — the rendered label is localized through
    // the `homeHero.chip.createBrandKit` Dict key (see `homeHeroChipLabel` in
    // HomeHero.tsx / `homeHeroChipLabelForId` in HomeView.tsx) so the Chinese
    // UI shows "创建品牌套件".
    label: 'Create Brand Kit',
    icon: 'swatchbook',
    group: 'create',
    description: 'Extract a brand design system',
    hint: 'Extract a brand kit from a website, then apply it in any chat.',
    // Distinct from the plugin-bound create chips: this dispatches straight
    // into the Brand Kit tab's extraction flow instead of binding a scenario
    // plugin to the composer.
    action: { kind: 'create-brand-kit' },
  },
  {
    id: 'prototype',
    label: 'Prototype',
    icon: 'palette',
    group: 'create',
    description: 'Interactive app mockups',
    // Prototype now binds to the bundled `example-web-prototype` plugin,
    // which ships `assets/template.html` (single-file HTML prototype
    // seed), `references/layouts.md` (paste-ready section layouts), and
    // a P0 checklist. The previous routing to the generic
    // od-new-generation router left the agent to invent every section's
    // CSS, producing inconsistent type scales and density between turns.
    // Web-prototype's manifest owns the editable `{{fidelity}}`,
    // `{{artifactKind}}`, `{{audience}}`, `{{designSystem}}`, and
    // `{{template}}` slots; Home renders those placeholders inline.
    action: {
      kind: 'apply-scenario',
      pluginId: 'example-web-prototype',
      projectKind: 'prototype',
    },
  },
  {
    id: 'web-clone',
    label: 'Website clone',
    icon: 'globe',
    group: 'create',
    description: 'Recreate an existing website',
    hint: 'Paste a site URL and recreate its structure, visuals, and interactions from real source evidence.',
    // Website reproduction is its own creation workflow (start from a target
    // URL, source-first recon, preserve real structure/assets), so it binds
    // the bundled `example-web-clone` skill instead of the blank prototype
    // seed. The project still stores `kind: 'prototype'` for preview
    // behavior; `intent: 'web-clone'` routes the scenario plugin and splits
    // the analytics `project_kind` (see contracts scenario-defaults/events).
    action: {
      kind: 'apply-scenario',
      pluginId: 'example-web-clone',
      projectKind: 'prototype',
      projectMetadata: {
        kind: 'prototype',
        intent: 'web-clone',
      },
    },
  },
  {
    id: 'wireframe',
    label: 'Wireframe',
    icon: 'layout',
    group: 'create',
    description: 'Lo-fi screens & flows',
    hint: 'Sketch lo-fi screens and flows to validate structure before visual design.',
    // Wireframe reuses the battle-tested web-prototype seed but stamps a
    // lo-fi fidelity so the agent stays in structural/greybox territory
    // instead of jumping to high-fidelity styling.
    action: {
      kind: 'apply-scenario',
      pluginId: 'example-web-prototype',
      projectKind: 'prototype',
      projectMetadata: {
        kind: 'prototype',
        fidelity: 'wireframe',
      },
    },
  },
  {
    id: 'mobile',
    label: 'Mobile app',
    icon: 'smartphone',
    group: 'create',
    description: 'iOS & Android screens',
    hint: 'Lay out mobile screens for iOS and Android.',
    // Mobile reuses the web-prototype seed but records mobile platform
    // targets so the agent frames screens for handheld viewports.
    action: {
      kind: 'apply-scenario',
      pluginId: 'example-web-prototype',
      projectKind: 'prototype',
      projectMetadata: {
        kind: 'prototype',
        platform: 'auto',
        platformTargets: ['mobile-ios', 'mobile-android'],
      },
    },
  },
  {
    id: 'deck',
    label: 'Slide deck',
    icon: 'present',
    group: 'create',
    description: 'Presentations & pitch decks',
    // Slide deck binds to `example-simple-deck`, which ships a 353-line
    // `assets/template.html` (the 1920×1080 + scale-to-fit + nav + print
    // framework paired with proven slide CSS), 8 paste-ready layouts in
    // `references/layouts.md` (cover, body, big-stat, three-point,
    // pipeline, dark quote, before/after, closing), and a P0/P1/P2
    // checklist that catches overflow at 1280×800 / 1440×900. The
    // previous routing to od-new-generation gave the agent only the
    // generic deck-framework directive — which fixed nav but not slide
    // layout — so density bugs (168px headline + absolute footer
    // collision) shipped on default decks.
    action: {
      kind: 'apply-scenario',
      pluginId: 'example-simple-deck',
      projectKind: 'deck',
    },
  },
  {
    id: 'document',
    label: 'Document',
    icon: 'file-text',
    group: 'create',
    description: 'Resumes, reports & PDFs',
    hint: 'Draft a polished document — resume, report, or PDF — you can export.',
    // Documents (resumes / reports / PDFs) route through the generic
    // od-new-generation scenario under the `other` kind; there is no
    // dedicated bundled document seed yet, so the agent composes the
    // document layout from the brief.
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-new-generation',
      projectKind: 'other',
      inputs: {
        artifactKind: 'document',
        audience: 'readers',
        topic: 'the user brief',
      },
      projectMetadata: {
        kind: 'other',
        // Analytics-only tag: splits this card's projects out of generic
        // `other` so `project_kind` reports `document` (matches the task_chip).
        // No product behavior keys off `intent: 'document'`.
        intent: 'document',
      },
    },
  },
  {
    id: 'hyperframes',
    label: 'HyperFrames',
    icon: 'orbit',
    group: 'create',
    description: 'Motion graphics & loops',
    hint: 'Author HTML-based motion: captions, audio-reactive visuals, scene transitions.',
    // HyperFrames is its own bundled scenario (motion-graphics
    // specialisation of Video). It surfaces in PluginsHomeSection's
    // primary category list, so the rail picks it up too rather than
    // hiding the specialised bucket behind the generic Video chip.
    action: { kind: 'apply-scenario', pluginId: 'example-hyperframes', projectKind: 'video' },
  },
  {
    id: 'webgl',
    label: 'WebGL experience',
    icon: 'sparkles',
    group: 'create',
    description: 'Shaders, 3D & generative GPU visuals',
    hint: 'Build a full-screen real-time WebGL2 shader / 3D scene that runs live on the GPU.',
    // Powered-preview scenario: binds the bundled `example-webgl-experience`
    // plugin (shader/3D seed + P0 checklist). The artifact auto-detects into
    // powered preview via its `getContext('webgl2')` call.
    action: {
      kind: 'apply-scenario',
      pluginId: 'example-webgl-experience',
      projectKind: 'prototype',
      projectMetadata: {
        kind: 'prototype',
        intent: 'webgl-experience',
        fidelity: 'high-fidelity',
      },
    },
  },
  {
    id: 'live-artifact',
    label: 'Live artifact',
    icon: 'refresh',
    group: 'create',
    description: 'Data-backed live dashboards',
    hint: 'Build a refreshable artifact backed by connector or local data.',
    action: {
      kind: 'apply-scenario',
      pluginId: 'example-live-artifact',
      projectKind: 'prototype',
      projectMetadata: {
        kind: 'prototype',
        intent: 'live-artifact',
        fidelity: 'high-fidelity',
      },
    },
  },
  {
    id: 'image',
    label: 'Image',
    icon: 'image',
    group: 'create',
    description: 'Posters, graphics & art',
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-media-generation',
      projectKind: 'image',
      inputs: {
        mediaKind: 'image',
        subject: 'a polished product concept',
        style: 'cinematic, high-quality, on-brand',
        aspect: '16:9',
      },
    },
  },
  {
    id: 'video',
    label: 'Video',
    icon: 'play',
    group: 'create',
    description: 'Clips, reels & promos',
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-media-generation',
      projectKind: 'video',
      inputs: {
        mediaKind: 'video',
        subject: 'a short product reveal',
        style: 'cinematic, high-quality, on-brand',
        aspect: '16:9',
      },
    },
  },
  {
    id: 'audio',
    label: 'Audio',
    icon: 'mic',
    group: 'create',
    description: 'Voiceovers, music & SFX',
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-media-generation',
      projectKind: 'audio',
      inputs: {
        mediaKind: 'audio',
        subject: 'a concise audio identity for a product',
        style: 'clear, polished, modern',
        aspect: '16:9',
      },
    },
  },
  {
    id: 'create-plugin',
    label: 'Create plugin',
    icon: 'edit',
    group: 'migrate',
    hint: 'Author a reusable Open Design plugin and add it to My plugins.',
    action: { kind: 'create-plugin' },
  },
  {
    id: 'figma',
    label: 'From Figma',
    icon: 'import',
    group: 'migrate',
    hint: 'Migrate a Figma frame into the active design system.',
    action: {
      kind: 'apply-figma-migration',
      pluginId: 'od-figma-migration',
      projectKind: 'prototype',
      inputs: {
        figmaUrl: 'the Figma file URL you provide',
        targetStack: 'React 18 + Tailwind',
      },
    },
  },
  {
    id: 'template',
    label: 'From template',
    icon: 'file-code',
    group: 'migrate',
    hint: 'Start from a bundled template.',
    action: { kind: 'open-template-picker' },
  },
];

export function chipsForGroup(group: ChipGroup): HomeHeroChip[] {
  return HOME_HERO_CHIPS.filter((c) => c.group === group);
}

// Display order for the inline `create` scenario rail. The composer leads with
// Website clone (the fastest "paste a URL, get a site" on-ramp), then the slide
// deck ("Slides") and the core build scenarios in decreasing generality
// (Prototype → Wireframe → Mobile → Document → Animation), then the media
// scenarios. Brand Kit is intentionally omitted here so it trails the scenario
// set — it dispatches into the Brand Kit tab rather than seeding a scenario
// plugin. Any create chip not listed keeps its catalog order after the explicit
// entries (see `orderedCreateChips`).
export const CREATE_RAIL_ORDER = [
  'web-clone',
  'deck',
  'prototype',
  'wireframe',
  'mobile',
  'document',
  'hyperframes',
  'webgl',
  'live-artifact',
  'image',
  'video',
  'audio',
] as const;

// Chip ids the onboarding "build a design system" teaser intentionally omits.
// Video and Audio are the trailing pure-media outputs in CREATE_RAIL_ORDER and
// the least central to the design-system story, so they are the first to drop
// when keeping the teaser chips to a single tidy row. Website clone starts
// from someone else's site rather than the user's design system, so it stays
// off the design-system teaser too.
const ONBOARDING_ARTIFACT_OMIT = new Set<string>(['web-clone', 'video', 'audio']);

// The artifact chips shown on the onboarding "build a design system" step — a
// curated single-row subset of the create rail. Derived from CREATE_RAIL_ORDER
// (not a separately maintained list) so it stays in the same priority order as
// the Home rail and never drifts from the real template catalog.
export const ONBOARDING_ARTIFACT_CHIP_IDS = CREATE_RAIL_ORDER.filter(
  (id) => !ONBOARDING_ARTIFACT_OMIT.has(id),
);

// The `create` chips in rail-display order. Listed ids come first in
// `CREATE_RAIL_ORDER`; any unlisted create chip (e.g. `create-brand-kit`)
// trails in catalog order. Reordering through this helper keeps the catalog
// data table stable while letting the rail lead with the slide deck.
export function orderedCreateChips(): HomeHeroChip[] {
  const create = chipsForGroup('create');
  const listed = CREATE_RAIL_ORDER
    .map((id) => create.find((c) => c.id === id))
    .filter((c): c is HomeHeroChip => Boolean(c));
  const listedIds = new Set<string>(CREATE_RAIL_ORDER);
  const rest = create.filter((c) => !listedIds.has(c.id));
  return [...listed, ...rest];
}

// Helper used by tests + the rail component to pull the chip metadata
// off a click target without round-tripping through React state.
export function findChip(id: string): HomeHeroChip | undefined {
  return HOME_HERO_CHIPS.find((c) => c.id === id);
}
