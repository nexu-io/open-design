// Second-level "sub-type" rail for the Home input card.
//
// After a first-level create chip is picked (Prototype / Slide deck), this
// rail surfaces a compact row of sub-categories — mirroring how Manus shows
// "landing page / dashboard / portfolio" under its "Website" choice, and
// matching the exact sub-category taxonomy the Community plugin grid uses.
//
// Prototype owns a fixed Home information architecture. Its eight scenes stay
// visible even when the installed plugin catalog has no matching example.
// Deck continues to use the dynamic Community facet taxonomy.

import type { InstalledPluginRecord, ProjectMetadata } from '@open-design/contracts';
import type { IconName } from '../Icon';
import type { HomeHeroChip } from './chips';
import {
  buildSubcategoryCatalog,
  extractSubcategories,
  type FacetOption,
} from '../plugins-home/facets';

// Parent chips that carry a second-level rail. Media chips (image/video/
// audio/hyperframes) own their own inline composer form and are excluded;
// the facet table only defines children for prototype/deck/image/video, and
// we surface the rail for prototype + deck.
export type SubChipParentId = 'prototype' | 'deck';

/**
 * What a second-level scene adds to the metadata its parent task type stamps.
 *
 * `kind` is deliberately not expressible: a scene refines WHAT to build, never
 * WHICH product kind is being built, so it cannot turn itself into a task type
 * by stamping a different kind than its parent.
 */
export type HomeHeroSubChipMetadata = Omit<Partial<ProjectMetadata>, 'kind'>;

export interface HomeHeroSubChip {
  // Facet subcategory slug, e.g. 'business-dashboards'.
  slug: string;
  label: string;
  icon: IconName;
  // Refinement merged over the parent task type's own metadata when this scene
  // is selected (see `prototypeSceneProjectMetadata`). Most scenes narrow only
  // the example rail and stamp nothing.
  projectMetadata?: HomeHeroSubChipMetadata;
}

const PARENT_IDS: readonly SubChipParentId[] = ['prototype', 'deck'];

// Icon per facet subcategory slug. Falls back to a neutral glyph so a newly
// added facet still renders a pill rather than crashing.
const SUBCATEGORY_ICONS: Record<string, IconName> = {
  // prototype
  'business-dashboards': 'grid',
  'app-prototypes': 'blocks',
  'landing-marketing': 'globe',
  'developer-tools': 'terminal',
  'docs-reports': 'file',
  'brand-design': 'palette',
  // deck — the 15 commercial "品类" scenes (slug === commercial category id)
  'fundraising-pitch': 'present',
  'corporate-strategy': 'kanban',
  'b2b-sales': 'send',
  'product-management': 'blocks',
  'design-craft': 'palette',
  'marketing-gtm': 'globe',
  'data-finance': 'sliders',
  consulting: 'orbit',
  'government-policy': 'info',
  'professional-training': 'lightbulb',
  'academic-research': 'search',
  'ai-literacy': 'sparkles',
  career: 'star',
  'student-coursework': 'file-text',
  life: 'sun',
};
const DEFAULT_SUBCATEGORY_ICON: IconName = 'blocks';

const PROTOTYPE_SUB_CHIPS: readonly HomeHeroSubChip[] = [
  { slug: 'landing-marketing', label: 'Landing / marketing', icon: 'globe' },
  { slug: 'business-dashboards', label: 'Dashboards', icon: 'grid' },
  {
    slug: 'mobile',
    label: 'Mobile app',
    icon: 'smartphone',
    // Frames the screens for handheld viewports; the Prototype task profile
    // already carries mobile guidance down to touch reach and breakpoints.
    projectMetadata: { platform: 'auto', platformTargets: ['mobile-ios', 'mobile-android'] },
  },
  {
    slug: 'wireframe',
    label: 'Wireframe',
    icon: 'layout',
    // Keeps the agent in structural/greybox territory instead of jumping to
    // high-fidelity styling; the Prototype task profile downgrades its content
    // and interaction-state requirements for exactly this fidelity.
    projectMetadata: { fidelity: 'wireframe' },
  },
  { slug: 'app-prototypes', label: 'Apps', icon: 'blocks' },
  { slug: 'developer-tools', label: 'Developer tools', icon: 'terminal' },
  { slug: 'brand-design', label: 'Brand / design', icon: 'palette' },
  { slug: 'docs-reports', label: 'Docs / reports', icon: 'file' },
];

export function prototypeSubChipForSlug(slug: string | null): HomeHeroSubChip | null {
  if (!slug) return null;
  return PROTOTYPE_SUB_CHIPS.find((item) => item.slug === slug) ?? null;
}

export function isSubChipParent(chipId: string | null): chipId is SubChipParentId {
  return chipId === 'prototype' || chipId === 'deck';
}

/**
 * Retired first-level chip ids and the Prototype scene each one became.
 *
 * `mobile` and `wireframe` were top-level Home task types until the creation
 * hierarchy moved them under Prototype; they are scenes now and carry no chip
 * id of their own. The two strings survive here for one reason only: they are
 * already sitting in users' persisted composer drafts and in queued
 * cross-surface intents. Nothing new belongs in this table — a scene that never
 * shipped as a chip has no legacy id to fold.
 */
const LEGACY_TASK_TYPE_CHIP_SCENE_SLUGS: Readonly<Record<string, string>> = {
  mobile: 'mobile',
  wireframe: 'wireframe',
};

/**
 * The Prototype scene a retired top-level chip id became, or `null` for every
 * live chip id.
 *
 * Applied wherever a chip id arrives from outside the live catalog — a
 * persisted draft, a queued intent, the placeholder-carousel table — so those
 * ids are folded onto `prototype` + scene BEFORE anything tries to look them up
 * in `HOME_HERO_CHIPS`, where they no longer exist.
 */
export function legacyPrototypeSceneForChipId(chipId: string | null): HomeHeroSubChip | null {
  if (!chipId) return null;
  const slug = LEGACY_TASK_TYPE_CHIP_SCENE_SLUGS[chipId];
  return slug ? prototypeSubChipForSlug(slug) : null;
}

/**
 * The project metadata a task type stamps once a second-level scene refines it.
 *
 * A scene refines WHAT to build, never WHETHER the parent's product route
 * applies, so the parent owns `kind` (and everything else it already stamps)
 * and the scene may only layer its own fields on top. With no scene — or a
 * scene that stamps nothing — this is exactly what the bare parent stamps.
 */
export function prototypeSceneProjectMetadata(
  parent: HomeHeroChip,
  scene: HomeHeroSubChip | null,
): ProjectMetadata | null {
  const action = parent.action;
  const bindsProject =
    action.kind === 'apply-scenario' || action.kind === 'apply-figma-migration';
  const parentMetadata = bindsProject ? action.projectMetadata ?? null : null;
  const refinement = scene?.projectMetadata;
  if (!refinement) return parentMetadata;
  if (parentMetadata) return { ...parentMetadata, ...refinement };
  if (!bindsProject) return null;
  return { kind: action.projectKind, ...refinement };
}

// Sub-types for a first-level chip, drawn from the Community facet catalog so
// the labels, set, AND order match the Community section exactly. The display
// order is whatever `SUBCATEGORIES` (in `plugins-home/facets.ts`) declares for
// the parent — there is no Home-only reordering, so the two surfaces stay in
// lockstep. Only sub-categories that actually have installed plugins
// (count > 0) are surfaced. Returns [] for chips without a second-level rail.
export function subChipsForChip(
  chipId: string | null,
  plugins: InstalledPluginRecord[],
): HomeHeroSubChip[] {
  if (!isSubChipParent(chipId)) return [];
  if (chipId === 'prototype') return PROTOTYPE_SUB_CHIPS.map((item) => ({ ...item }));
  const catalog = buildSubcategoryCatalog(plugins);
  const options: FacetOption[] = catalog[chipId] ?? [];
  return options
    .filter((option) => option.count > 0)
    .map((option) => ({
      slug: option.slug,
      label: option.label,
      icon: SUBCATEGORY_ICONS[option.slug] ?? DEFAULT_SUBCATEGORY_ICON,
    }));
}

// Narrow a list of example-prompt plugins to a chosen sub-category. The
// `parent` chip id scopes which facet subcategory table is consulted.
export function filterPluginsBySubChip(
  plugins: InstalledPluginRecord[],
  parent: SubChipParentId,
  subcategorySlug: string,
): InstalledPluginRecord[] {
  return plugins.filter((plugin) =>
    extractSubcategories(plugin, parent).includes(subcategorySlug),
  );
}

export { PARENT_IDS };
