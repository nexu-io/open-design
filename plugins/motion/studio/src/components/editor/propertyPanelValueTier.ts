/**
 * The flat inspector's 3-state value coloring (design_handoff_studio_inspector,
 * verified against Studio Panel Redesign.dc.html #10a): a property row is either
 * unset (no explicit declaration), explicitly declared but equal to its default
 * (no visual "set" signal), or explicitly declared and different from its default
 * (mint value + emphasized label + reset affordance).
 */
export type PropertyValueTier = "default" | "explicitDefault" | "explicitCustom";

export function resolveValueTier(
  explicitValue: string | undefined,
  defaultValue: string,
): PropertyValueTier {
  if (explicitValue == null || explicitValue.trim() === "") return "default";
  return explicitValue.trim() === defaultValue.trim() ? "explicitDefault" : "explicitCustom";
}

export const VALUE_TIER_LABEL_CLASS: Record<PropertyValueTier, string> = {
  default: "text-panel-text-3",
  explicitDefault: "text-panel-text-2",
  explicitCustom: "text-panel-text-0",
};

export const VALUE_TIER_VALUE_CLASS: Record<PropertyValueTier, string> = {
  default: "text-panel-text-3",
  explicitDefault: "text-panel-text-0",
  explicitCustom: "text-accent-ink",
};
