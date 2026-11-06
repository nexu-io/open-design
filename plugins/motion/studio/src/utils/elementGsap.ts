/**
 * GSAP access through an ELEMENT'S OWN window (the preview iframe's runtime),
 * not the studio window. This is the single way studio gesture code touches an
 * iframe element's GSAP position outside the commit pipeline — the resize
 * anchor pin (apply + restore) and the post-commit live correction. The commit
 * pipeline itself stays the owner of persisted values.
 */
type ElementGsapWindow = Window & {
  gsap?: {
    set?: (target: Element, vars: Record<string, number>) => void;
  };
};

function gsapOf(element: HTMLElement): ElementGsapWindow["gsap"] | undefined {
  return (element.ownerDocument.defaultView as ElementGsapWindow | null)?.gsap;
}

/** Set the element's GSAP x/y. Returns false when no runtime is reachable. */
export function setElementGsapPosition(element: HTMLElement, x: number, y: number): boolean {
  const gsap = gsapOf(element);
  if (!gsap?.set) return false;
  gsap.set(element, { x, y });
  return true;
}

/**
 * Set the element's GSAP scale. Returns false when no runtime is reachable.
 *
 * Used to make the element show a scale that has been committed but not yet
 * re-rendered by the timeline, so measuring it afterwards reports where the
 * commit actually puts it rather than where it happened to be mid-flight.
 */
export function setElementGsapScale(element: HTMLElement, x: number, y: number): boolean {
  const gsap = gsapOf(element);
  if (!gsap?.set) return false;
  gsap.set(element, { scaleX: x, scaleY: y });
  return true;
}

/** Set the element's GSAP width/height. Returns false when no runtime is reachable. */
export function setElementGsapSize(element: HTMLElement, width: number, height: number): boolean {
  const gsap = gsapOf(element);
  if (!gsap?.set) return false;
  gsap.set(element, { width, height });
  return true;
}

/** The targets CSSPlugin styles: not plain objects (the runtime's filler) or XML-namespace elements. */
export function elementTargets(tween: { targets?: () => unknown[] }): Element[] {
  return (tween.targets?.() ?? []).filter((t): t is Element =>
    Boolean((t as HTMLElement | null)?.style && (t as Node).nodeType),
  );
}
