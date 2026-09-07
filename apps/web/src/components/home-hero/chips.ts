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

// Chips share the daemon's scenario defaults; visual Skills are not pinned
// merely by choosing an output type.
export type ChipScenarioPluginId = DefaultScenarioPluginId;

export type ChipAction =
  | {
      kind: 'apply-scenario';
      pluginId: ChipScenarioPluginId;
      projectKind: ProjectKind;
      /**
       * Product-owned default route; the daemon resolves and stamps it.
       *
       * Set it on every first-level output type in `CREATE_RAIL_ORDER`: the
       * user picked a task type, not a plugin, so the create must travel as
       * `pluginSelectionProvenance: 'automatic-default'` and let the daemon
       * re-derive `pluginId` from the metadata. Forwarding the id instead
       * reads as a user pin — which is real authority elsewhere (it opts a
       * project out of OD Next), so the project is left with no
       * `automatic_default` scenario binding and the header offers to restore
       * an automatic scenario it never left.
       *
       * Only truthful when `pluginId` is exactly what
       * `defaultScenarioPluginIdForProjectMetadata` resolves for the metadata
       * this same chip stamps — otherwise dropping the id binds a different
       * plugin. `chips.automatic-default.test.ts` pins both halves.
       */
      automaticDefault?: boolean;
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
    icon: 'artboard',
    group: 'create',
    description: 'Interactive app mockups',
    // The automatic task-profile route owns execution guidance. The retained
    // generic scenario supplies the composer entry without selecting a template.
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-new-generation',
      projectKind: 'prototype',
      automaticDefault: true,
      inputs: {
        artifactKind: 'web prototype',
        audience: 'the intended audience',
        topic: 'the user brief',
      },
    },
  },
  {
    id: 'web-clone',
    label: 'Website clone',
    icon: 'globe',
    group: 'create',
    description: 'Source-first site reproduction',
    hint: 'Paste a target URL, then reconstruct the site and audit the clone.',
    // The intent preserves clone-specific behavior and analytics while the
    // generic scenario supplies the creation entry.
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-new-generation',
      projectKind: 'prototype',
      automaticDefault: true,
      inputs: {
        artifactKind: 'website reproduction',
        audience: 'the intended audience',
        topic: 'the user brief',
      },
      projectMetadata: {
        kind: 'prototype',
        intent: 'web-clone',
        fidelity: 'high-fidelity',
      },
    },
  },
  // Wireframe and Mobile app are NOT here: they are second-level scenes under
  // Prototype, not task types. Each is the Prototype chip plus the metadata
  // refinement it carries in `home-hero/sub-chips.ts` (a lo-fi fidelity, mobile
  // platform targets), so they have no chip id, no action and no route of their
  // own to diverge from their parent's.
  {
    id: 'deck',
    label: 'Slide deck',
    icon: 'present',
    group: 'create',
    description: 'Presentations & pitch decks',
    // The deck task profile supplies execution guidance without a fixed seed.
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-new-generation',
      projectKind: 'deck',
      automaticDefault: true,
      inputs: {
        artifactKind: 'presentation deck',
        audience: 'the intended audience',
        topic: 'the user brief',
      },
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
      automaticDefault: true,
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
    // Exact intent keeps the HyperFrames task-profile route separate from
    // ordinary video generation without selecting a motion template.
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-new-generation',
      projectKind: 'video',
      automaticDefault: true,
      inputs: {
        artifactKind: 'HTML motion composition',
        audience: 'the intended audience',
        topic: 'the user brief',
      },
      projectMetadata: {
        kind: 'video',
        intent: 'hyperframes',
        videoModel: 'hyperframes-html',
      },
    },
  },
  {
    id: 'webgl',
    label: 'WebGL experience',
    icon: 'sparkles',
    group: 'create',
    description: 'Shaders, 3D & generative GPU visuals',
    hint: 'Build a full-screen real-time WebGL2 shader / 3D scene that runs live on the GPU.',
    // The artifact auto-detects into powered preview via its WebGL context.
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-new-generation',
      projectKind: 'prototype',
      automaticDefault: true,
      inputs: {
        artifactKind: 'WebGL experience',
        audience: 'the intended audience',
        topic: 'the user brief',
      },
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
    icon: 'bar-chart-box',
    group: 'create',
    description: 'Data-backed live dashboards',
    hint: 'Build a refreshable artifact backed by connector or local data.',
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-new-generation',
      projectKind: 'prototype',
      automaticDefault: true,
      inputs: {
        artifactKind: 'data-backed live artifact',
        audience: 'the intended audience',
        topic: 'the user brief',
      },
      projectMetadata: {
        kind: 'prototype',
        intent: 'live-artifact',
        fidelity: 'high-fidelity',
      },
    },
  },
  {
    id: 'web-clone',
    label: 'Website clone',
    icon: 'globe',
    group: 'create',
    description: 'Source-first site reproduction',
    hint: 'Paste a target URL, then reconstruct the site and audit the clone.',
    // The intent preserves clone-specific behavior and analytics while the
    // generic scenario supplies the creation entry.
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-new-generation',
      projectKind: 'prototype',
      inputs: {
        artifactKind: 'website reproduction',
        audience: 'the intended audience',
        topic: 'the user brief',
      },
      projectMetadata: {
        kind: 'prototype',
        intent: 'web-clone',
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
      automaticDefault: true,
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
    icon: 'video-ai',
    group: 'create',
    description: 'Clips, reels & promos',
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-media-generation',
      projectKind: 'video',
      automaticDefault: true,
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
      automaticDefault: true,
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
    hint: 'Author a reusable OpenDesign plugin and add it to My plugins.',
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

// Fixed Home information architecture. Only these ten output types are
// top-level choices. Action-only create entries (for example Create Design
// System) are intentionally excluded. Prototype leads and Slide deck follows;
// the media scenarios trail so at typical widths they live in the 更多
// overflow popover rather than the visible pill row.
export const CREATE_RAIL_ORDER = [
  'prototype',
  'deck',
  'document',
  'image',
  'web-clone',
  'hyperframes',
  'webgl',
  'live-artifact',
  'video',
  'audio',
] as const;

// The Home type row is an explicit product decision, not a width computation
// (2026-08-31): three entry types stay inline, and 更多 holds exactly two.
// Everything else in the create catalog stays reachable through the composer's
// template picker instead of widening this row.
export const HOME_TYPE_ROW_IDS: readonly string[] = ['prototype', 'deck', 'document'];
export const HOME_TYPE_ROW_MORE_IDS: readonly string[] = ['image', 'web-clone'];

// Chip ids the onboarding "build a design system" teaser intentionally omits.
// Video and Audio are pure-media outputs and the least central to the
// design-system story, so they are omitted to keep the teaser chips to a
// single tidy row. Website clone starts
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

// The top-level Home chips in their exact product order. Action-only catalog
// entries must not leak into the rail or template picker.
export function orderedCreateChips(): HomeHeroChip[] {
  const create = chipsForGroup('create');
  return CREATE_RAIL_ORDER
    .map((id) => create.find((c) => c.id === id))
    .filter((c): c is HomeHeroChip => Boolean(c));
}

// Cross-surface handoff: the workspace tabs-bar "+" fan picks a template
// outside the hero; HomeHero listens for this window event and applies the
// chip exactly as if its own template picker had been clicked.
export const HOME_APPLY_TEMPLATE_EVENT = 'open-design:home-apply-template';

// Helper used by tests + the rail component to pull the chip metadata
// off a click target without round-tripping through React state.
export function findChip(id: string): HomeHeroChip | undefined {
  return HOME_HERO_CHIPS.find((c) => c.id === id);
}
