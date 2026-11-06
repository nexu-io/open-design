// Personalized first-run recommendation.
//
// After the first-run questionnaire collects `role` + `use-case`, Home shows a
// single recommended starting point instead of the generic empty entry. This
// module is the static mapping table that turns the survey answers into that
// recommendation. It is intentionally pure and dependency-free:
//
//   - No i18n lookups: it returns a stable starter `id`; the rendering
//     component maps that id to localized copy via literal i18n keys. This
//     keeps the mapping unit-testable without a locale bundle and keeps copy
//     edits out of the logic.
//   - No React / DOM / analytics: callers own presentation and telemetry.
//   - No persistence: the recommendation is a value derived per session. The
//     caller holds it in memory only (it must NOT survive a page refresh, per
//     the onboarding spec).
//
// Design rules encoded here (from the onboarding spec §6.3):
//   1. use-case takes priority over role — the goal describes intent better
//      than the identity.
//   2. Only one primary starting point per screen. Alternatives within the
//      same product path are surfaced through "换一个" (see `nextStarter`).
//   3. Founder / Student / Other / unknown goals fall back to the general
//      starting point rather than guessing a narrow path.

/**
 * The four product buckets a recommendation can resolve to. Mirrors the
 * `product_type` analytics dimension so Home telemetry can group on the same
 * value the mapping produced.
 */
export type ProductType = 'product_ui' | 'marketing' | 'internal_tool' | 'general';

/**
 * One concrete starting point the user can begin from. `id` is stable and
 * doubles as the analytics `recommendation_id` and the i18n key suffix
 * (`home.starter.<id>.*`), so it must not change once shipped.
 */
export interface StarterOption {
  id: string;
  productType: ProductType;
}

/**
 * The resolved recommendation for a session. `primary` is the currently
 * surfaced option; `options` is the full ordered list within the same product
 * path that "换一个" cycles through (`primary` is always `options[0]` at build
 * time). `role` / `useCases` echo the inputs so callers can stamp telemetry.
 */
export interface Recommendation {
  productType: ProductType;
  primary: StarterOption;
  options: readonly StarterOption[];
  role: string;
  useCases: string[];
}

// A path always has at least one starter; the non-empty tuple lets callers
// treat `options[0]` as defined.
type StarterList = readonly [StarterOption, ...StarterOption[]];

export interface RecommendationInput {
  /** Single-select role value from the questionnaire (may be empty). */
  role?: string | null;
  /** Multi-select use-case values from the questionnaire (may be empty). */
  useCases?: readonly string[] | null;
}

// --- Static mapping tables --------------------------------------------------

// use-case value → product bucket. use-case wins over role, so this table is
// consulted first. Values match `useCaseOptions` in EntryShell.tsx.
const USE_CASE_TO_PRODUCT: Record<string, ProductType> = {
  prototype: 'product_ui',
  product: 'product_ui',
  'design-system': 'product_ui',
  engineering: 'product_ui',
  landing: 'marketing',
  marketing: 'marketing',
  ads: 'marketing',
  agency: 'marketing',
  dashboard: 'internal_tool',
  // `deck` has no strong prototype/marketing/internal signal in the spec's
  // taxonomy, so it falls through to the general starting point.
};

// Canonical questionnaire display order for the multi-select use-case chips
// (mirrors `useCaseOptions` in EntryShell.tsx). The multi-select stores values
// in the user's click order, so we canonicalize against this order before
// resolving — otherwise the same set of answers picked in a different sequence
// (e.g. `['product','landing']` vs `['landing','product']`) would resolve to a
// different product bucket. Spec §6.3: use-case priority follows questionnaire
// order, not selection order.
const USE_CASE_DISPLAY_ORDER: readonly string[] = [
  'product',
  'design-system',
  'prototype',
  'landing',
  'marketing',
  'ads',
  'dashboard',
  'deck',
  'engineering',
  'agency',
];

// role value → product bucket, used only when no use-case signal resolves.
// Values match `roleOptions` in EntryShell.tsx. founder / student / other are
// deliberately absent so they fall through to `general`.
const ROLE_TO_PRODUCT: Record<string, ProductType> = {
  designer: 'product_ui',
  pm: 'product_ui',
  engineer: 'product_ui',
  marketing: 'marketing',
  growth: 'marketing',
  ops: 'internal_tool',
};

// Ordered starter options per product bucket. `options[0]` is the default
// primary; the rest are "换一个" alternatives within the same path. Every id is
// stable (analytics + i18n key). Copy lives under `home.starter.<id>.*`.
const STARTERS_BY_PRODUCT: Record<ProductType, StarterList> = {
  product_ui: [
    starter('product_ui_prototype', 'product_ui'),
    starter('product_ui_component', 'product_ui'),
    starter('product_ui_lowfi', 'product_ui'),
  ],
  marketing: [
    starter('marketing_landing', 'marketing'),
    starter('marketing_multivariant', 'marketing'),
  ],
  internal_tool: [
    starter('internal_dashboard', 'internal_tool'),
    starter('internal_report', 'internal_tool'),
  ],
  general: [starter('general_menu', 'general')],
};

function starter(id: string, productType: ProductType): StarterOption {
  return { id, productType };
}

// --- Public API -------------------------------------------------------------

/**
 * Resolve the product bucket for a set of survey answers. use-case is checked
 * first (in questionnaire display order), then role, then the general
 * fallback. Exported for tests and callers that only need the bucket.
 */
export function resolveProductType(input: RecommendationInput): ProductType {
  const useCases = canonicalizeUseCases(normalizeList(input.useCases));
  for (const useCase of useCases) {
    const product = USE_CASE_TO_PRODUCT[useCase];
    if (product) return product;
  }
  const role = normalizeValue(input.role);
  if (role && ROLE_TO_PRODUCT[role]) return ROLE_TO_PRODUCT[role];
  return 'general';
}

/**
 * Build the recommendation for a completed questionnaire. Always returns a
 * value (unknown goals resolve to the general starting point); deciding
 * *whether* to surface it — only right after the user completes the survey, not
 * on skip or for returning users — is the caller's responsibility.
 */
export function buildRecommendation(input: RecommendationInput): Recommendation {
  // Canonicalize once so both the resolved product bucket AND the echoed
  // `useCases` (telemetry) are deterministic for a given selection set,
  // independent of the order the user clicked the chips.
  const useCases = canonicalizeUseCases(normalizeList(input.useCases));
  const productType = resolveProductType({ role: input.role, useCases });
  const options = STARTERS_BY_PRODUCT[productType];
  return {
    productType,
    primary: options[0],
    options,
    role: normalizeValue(input.role) ?? '',
    useCases,
  };
}

/**
 * All starter options for a product path, in catalog order. Used by Studio's
 * empty-conversation starter templates so a recommendation-started project
 * offers the same path's alternatives as one-click composer replacements.
 */
export function startersForProduct(productType: ProductType): readonly StarterOption[] {
  return STARTERS_BY_PRODUCT[productType];
}

/**
 * The next starter option to show when the user clicks "换一个". Cycles within
 * the same product path and wraps around; returns the sole option unchanged
 * when the path has only one. Pure so the region can stay stateless beyond the
 * current id.
 */
export function nextStarter(options: readonly StarterOption[], currentId: string): StarterOption {
  const first = options[0];
  if (!first) {
    throw new Error('nextStarter: options must not be empty');
  }
  const index = options.findIndex((option) => option.id === currentId);
  // Unknown current id → start from the front; otherwise advance and wrap.
  const nextIndex = index < 0 ? 0 : (index + 1) % options.length;
  return options[nextIndex] ?? first;
}

// --- Helpers ----------------------------------------------------------------

function normalizeValue(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeList(values: readonly string[] | null | undefined): string[] {
  if (!values) return [];
  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

// Reorder use-case values into canonical questionnaire display order so a set
// of answers resolves identically regardless of the click sequence that
// produced it. Values not in the catalogue keep their relative order but sort
// after every known one (a stable sort keyed on the display index). Input is
// assumed already normalized/de-duplicated by `normalizeList`.
function canonicalizeUseCases(values: string[]): string[] {
  const orderOf = (value: string): number => {
    const index = USE_CASE_DISPLAY_ORDER.indexOf(value);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => orderOf(a.value) - orderOf(b.value) || a.index - b.index)
    .map((entry) => entry.value);
}
