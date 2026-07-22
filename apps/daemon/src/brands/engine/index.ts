// @ts-nocheck
/**
 * Public entry point for the brand engine. Import everything from here:
 *
 *   import { buildBrandSystem, deriveTokens, renderArtifact } from "./engine/index.js";
 *
 * The pipeline (see types.ts):
 *   Brand ─▶ Seed ─▶ DesignTokens (default|dark|compact)
 *               ─▶ export (json/css/theme) ─▶ kit (components) ─▶ artifacts (products)
 */

// ── types & css-var helpers (the frozen contract) ──
export type {
  SeedToken,
  ThemeAlgorithm,
  ColorTokenSet,
  DesignTokens,
  BrandSystem,
} from "./types.js";
export { CSS_VAR_PREFIX, cssVar, varRef, formatTokenValue, flattenTokens } from "./types.js";

// ── palette: the @ant-design/colors generate() port + 13 presets ──
export { generate, presets } from "./palette.js";

// ── seed synthesis ──
export { defaultSeed, seedFromBrand, seedFromMaterial, isDarkNativeBrand } from "./seed.js";

// ── derive: Seed → full DesignTokens for an algorithm ──
export { deriveTokens } from "./derive.js";

// ── export: serializers ──
export { tokensToJson, tokensToCssVars, tokensToThemeJson } from "./export.js";

// ── kit: themed HTML components ──
export {
  button,
  card,
  input,
  tag,
  alert,
  swatches,
  typeScale,
  renderKitPage,
} from "./kit.js";

// ── artifacts: composed products ──
export { renderArtifact, renderArtifactGallery, brandFontAssets } from "./artifacts/index.js";

// ── build: the integration seam (Brand → full BrandSystem) ──
export { buildBrandSystem, writeBrandSystem, slugify } from "./build.js";
