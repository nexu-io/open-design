import type { IconWeight } from "@phosphor-icons/react";

const WEIGHTS = ["thin", "light", "regular", "bold", "fill", "duotone"] as const;

function asWeight(value: string): IconWeight | null {
  return (WEIGHTS as readonly string[]).includes(value) ? (value as IconWeight) : null;
}

/** Studio's Phosphor defaults, read off `theme.css` so size and weight have one
 * owner instead of a CSS variable and a JS constant that drift. A missing or
 * unrecognized value falls back to Phosphor's own default. */
export function readIconTokens(root: Element = document.documentElement): {
  size: string;
  weight: IconWeight;
} {
  const styles = getComputedStyle(root);
  const size = styles.getPropertyValue("--icon-size").trim();
  const weight = asWeight(styles.getPropertyValue("--icon-weight").trim());
  return { size: size || "1em", weight: weight ?? "regular" };
}
