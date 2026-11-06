import type { GsapAnimation } from "@hyperframes/core/gsap-parser";

interface GsapElementTarget {
  id?: string | null;
  selector?: string | null;
}

/**
 * Tweens whose target addresses the element: by id, by its selection selector, as one part of a
 * group selector, or, given the live element, by any selector part the element matches.
 */
export function getAnimationsForElement(
  animations: GsapAnimation[],
  target: GsapElementTarget,
  element?: Element | null,
): GsapAnimation[] {
  const matchers = new Set<string>();
  if (target.id) matchers.add(`#${target.id}`);
  if (target.selector) matchers.add(target.selector);
  if (matchers.size === 0 && !element) return [];
  return animations.filter((a) =>
    a.targetSelector.split(",").some((part) => {
      const trimmed = part.trim();
      if (!trimmed) return false;
      if (matchers.has(trimmed)) return true;
      const lastSimple = trimmed.split(/\s+/).pop();
      if (lastSimple && matchers.has(lastSimple)) return true;
      if (element) {
        try {
          if (element.matches(trimmed)) return true;
        } catch {
          return false;
        }
      }
      return false;
    }),
  );
}
