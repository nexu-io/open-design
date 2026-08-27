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

// Plugin ids the chip rail can dispatch to. Chips route to a
// `DefaultScenarioPluginId` so the same fallback table the daemon
// uses for naked Home queries stays the source of truth. The
// curated union keeps typo safety while letting the rail evolve
// independently of the default-binding mapping.
export type ChipScenarioPluginId = DefaultScenarioPluginId;

export type ChipAction =
  | {
      kind: 'apply-scenario';
      pluginId: ChipScenarioPluginId;
      projectKind: ProjectKind;
      /** Product-owned default route; the daemon resolves and stamps it. */
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
      automaticDefault: true,
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
  // Wireframe and Mobile app are NOT here: they are second-level scenes under
  // Prototype, not task types. Each is the Prototype chip plus the metadata
  // refinement it carries in `home-hero/sub-chips.ts` (a lo-fi fidelity, mobile
  // platform targets), so they have no chip id, no action and no route of their
  // own to diverge from their parent's.
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

// Fixed Home information architecture. Only these three output types are
// top-level choices. Action-only create entries (for example Create Design
// System) are intentionally excluded.
export const CREATE_RAIL_ORDER = [
  'prototype',
  'image',
  'web-clone',
] as const;

// Chip ids the onboarding "build a design system" teaser intentionally omits.
// Website clone starts from someone else's site rather than the user's design
// system, so it stays off the design-system teaser.
const ONBOARDING_ARTIFACT_OMIT = new Set<string>(['web-clone']);

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
