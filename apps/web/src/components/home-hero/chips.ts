// Stage B of plugin-driven-flow-plan — Home intent rail.
//
// The Home input card sits naked above an unstructured prompt. New
// users frequently type a request without knowing which scenario
// plugin to apply, which lands them in the generic agent path and
// stretches the convergence loop. This chip rail exposes high-signal
// NewProjectModal categories plus a small set of lower-row shortcuts
// (plugin authoring / Figma / folder / template), so the same Enter
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

import type { ProjectKind } from '@open-design/contracts';
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
  | 'example-hyperframes';

export type ChipAction =
  | {
      kind: 'apply-scenario';
      pluginId: ChipScenarioPluginId;
      projectKind: ProjectKind;
      inputs?: Record<string, unknown>;
    }
  | {
      kind: 'apply-figma-migration';
      pluginId: 'od-figma-migration';
      projectKind: ProjectKind;
      inputs?: Record<string, unknown>;
    }
  | { kind: 'create-plugin' }
  | { kind: 'import-folder' }
  | { kind: 'open-template-picker' };

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
  action: ChipAction;
}

export const HOME_HERO_CHIPS: ReadonlyArray<HomeHeroChip> = [
  {
    id: 'prototype',
    label: 'Prototype',
    icon: 'palette',
    group: 'create',
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
    id: 'live-artifact',
    label: 'Live artifact',
    icon: 'pencil',
    group: 'create',
    hint: 'Build an interactive HTML/CSS/JS artifact you can preview live.',
    // Live artifact shares web-prototype's seed today — the difference
    // is intent (interactive HTML/CSS/JS) vs static prototype, not the
    // underlying template. The chip keeps a distinct id so active-state
    // tracking + analytics see "user picked live-artifact" rather than
    // "user picked prototype".
    action: {
      kind: 'apply-scenario',
      pluginId: 'example-web-prototype',
      projectKind: 'prototype',
    },
  },
  {
    id: 'deck',
    label: 'Slide deck',
    icon: 'present',
    group: 'create',
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
    id: 'image',
    label: 'Image',
    icon: 'image',
    group: 'create',
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
    id: 'hyperframes',
    label: 'HyperFrames',
    icon: 'orbit',
    group: 'create',
    hint: 'Author HTML-based motion: captions, audio-reactive visuals, scene transitions.',
    // HyperFrames is its own bundled scenario (motion-graphics
    // specialisation of Video). It surfaces in PluginsHomeSection's
    // primary category list, so the rail picks it up too rather than
    // hiding the specialised bucket behind the generic Video chip.
    action: { kind: 'apply-scenario', pluginId: 'example-hyperframes', projectKind: 'video' },
  },
  {
    id: 'audio',
    label: 'Audio',
    icon: 'mic',
    group: 'create',
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
    id: 'folder',
    label: 'From folder',
    icon: 'folder',
    group: 'migrate',
    hint: 'Import an existing local folder and continue editing.',
    action: { kind: 'import-folder' },
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

// Helper used by tests + the rail component to pull the chip metadata
// off a click target without round-tripping through React state.
export function findChip(id: string): HomeHeroChip | undefined {
  return HOME_HERO_CHIPS.find((c) => c.id === id);
}
