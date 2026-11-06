// @ts-nocheck
/**
 * Serializers for the derived style system. Given the DesignTokens (or the
 * upstream SeedToken) this module emits the three portable artifacts a
 * consumer needs:
 *
 *   DesignTokens ──tokensToJson──▶      tokens.json      (raw, inspectable)
 *   DesignTokens ──tokensToCssVars──▶   variables.css    (--brand-* custom props)
 *   SeedToken    ──tokensToThemeJson──▶ theme.json       (antd ConfigProvider)
 *
 * The flattening / css-var naming is owned by ./types (flattenTokens), so the
 * CSS output stays 1:1 with what kit & artifacts reference via varRef(). This
 * module is a pure formatter — it never imports another engine implementation
 * module (no palette/seed/derive/kit), only the frozen ./types contract.
 */

import {
  flattenTokens,
  type DesignTokens,
  type SeedToken,
  type ThemeAlgorithm,
} from "./types.js";

/** Pretty-print the full token set as JSON (the canonical `tokens.json`). */
export function tokensToJson(tokens: DesignTokens): string {
  return JSON.stringify(tokens, null, 2);
}

/**
 * Emit the tokens as a CSS custom-property block, e.g.
 * `:root { --brand-color-primary: #1677ff; ... }`. Names & values come straight
 * from flattenTokens so they match every varRef("colorPrimary") in the kit.
 */
export function tokensToCssVars(tokens: DesignTokens, selector = ":root"): string {
  const lines = flattenTokens(tokens).map(({ name, value }) => `  ${name}: ${value};`);
  return `${selector} {\n${lines.join("\n")}\n}\n`;
}

/**
 * Emit an Ant Design `ConfigProvider` theme object as JSON. The seed maps
 * almost 1:1 onto antd's seed-token surface, so we forward the primitive seed
 * fields (colors, font, radius, control height, line width, motion unit) and
 * record which algorithm to apply. Empty colorLink is dropped so antd derives
 * it from colorInfo, mirroring our derive-time fallback.
 */
export function tokensToThemeJson(seed: SeedToken, algorithm: ThemeAlgorithm = "default"): string {
  const token: Record<string, string | number | boolean> = {
    colorPrimary: seed.colorPrimary,
    colorSuccess: seed.colorSuccess,
    colorWarning: seed.colorWarning,
    colorError: seed.colorError,
    colorInfo: seed.colorInfo,
    colorTextBase: seed.colorTextBase,
    colorBgBase: seed.colorBgBase,
    fontFamily: seed.fontFamily,
    fontFamilyCode: seed.fontFamilyCode,
    fontSize: seed.fontSize,
    borderRadius: seed.borderRadius,
    sizeUnit: seed.sizeUnit,
    sizeStep: seed.sizeStep,
    controlHeight: seed.controlHeight,
    lineWidth: seed.lineWidth,
    motionUnit: seed.motionUnit,
    motionBase: seed.motionBase,
    wireframe: seed.wireframe,
    motion: seed.motion,
  };
  if (seed.colorLink) token.colorLink = seed.colorLink;

  return JSON.stringify({ token, algorithm }, null, 2);
}
