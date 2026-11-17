const modalSelector = '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]';

type StackEntry = { element: HTMLElement; level: number };
type StyleReader = (element: HTMLElement) => CSSStyleDeclaration;

function createsStackingContext(element: HTMLElement, style: CSSStyleDeclaration, readStyle: StyleReader): boolean {
  const positioned = style.position === 'absolute' || style.position === 'relative';
  const parentDisplay = element.parentElement ? readStyle(element.parentElement).display : '';
  return style.position === 'fixed' || style.position === 'sticky'
    || (style.zIndex !== '' && style.zIndex !== 'auto'
      && (positioned || /^(inline-)?(flex|grid)$/.test(parentDisplay)))
    || Number.parseFloat(style.opacity) < 1
    || ['transform', 'translate', 'rotate', 'scale', 'perspective', 'filter', 'backdrop-filter', 'clip-path', 'mask-image', 'mask-border-source']
      .some(property => {
        const value = style.getPropertyValue(property);
        return value !== '' && value !== 'none';
      })
    || style.isolation === 'isolate'
    || (style.mixBlendMode !== '' && style.mixBlendMode !== 'normal')
    || /\b(layout|paint|strict|content)\b/.test(style.contain)
    || /\b(transform|opacity|filter|perspective|contain)\b/.test(style.willChange)
    || ['size', 'inline-size'].includes(style.getPropertyValue('container-type'));
}

function stackingPath(element: HTMLElement, readStyle: StyleReader): StackEntry[] {
  const ancestors: HTMLElement[] = [];
  for (let current: HTMLElement | null = element; current; current = current.parentElement) ancestors.unshift(current);
  return ancestors.flatMap(ancestor => {
    const style = readStyle(ancestor);
    const isContext = ancestor === element.ownerDocument.documentElement
      || createsStackingContext(ancestor, style, readStyle);
    if (ancestor !== element && !isContext) return [];
    // A panel with z-index:auto is compared inside its backdrop's context.
    // A nested child's large z-index can never outrank that ancestor's layer.
    const level = isContext ? Number.parseInt(style.zIndex, 10) : 0;
    return [{ element: ancestor, level: Number.isFinite(level) ? level : 0 }];
  });
}

function compareStackPaths(left: StackEntry[], right: StackEntry[]): number {
  let index = 0;
  while (index < left.length && index < right.length && left[index]!.element === right[index]!.element) index += 1;
  if (index === left.length && index === right.length) return 0;
  if (index === left.length) return right[index]!.level < 0 ? 1 : -1;
  if (index === right.length) return left[index]!.level < 0 ? -1 : 1;
  const a = left[index]!;
  const b = right[index]!;
  if (a.level !== b.level) return a.level - b.level;
  return a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

/** Active modal panels, bottom to top, respecting each ancestor stacking context.
 * DOM order breaks ties only within the same CSS layer. includeInert is for
 * background-lock ownership; inert panels never receive focus or tooltips.
 */
export function getModalDialogsInStackOrder(doc: Document, options: { includeInert?: boolean } = {}): HTMLElement[] {
  const styles = new Map<HTMLElement, CSSStyleDeclaration>();
  const readStyle: StyleReader = element => {
    let style = styles.get(element);
    if (!style) {
      style = doc.defaultView!.getComputedStyle(element);
      styles.set(element, style);
    }
    return style;
  };
  return [...doc.querySelectorAll<HTMLElement>(modalSelector)]
    .filter(panel => {
      if (!panel.isConnected || panel.closest('[hidden], [aria-hidden="true"]')
        || (!options.includeInert && panel.closest('[inert]'))) return false;
      for (let element: HTMLElement | null = panel; element; element = element.parentElement) {
        const style = readStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      }
      return true;
    })
    .map(panel => ({ panel, path: stackingPath(panel, readStyle) }))
    .sort((left, right) => compareStackPaths(left.path, right.path))
    .map(entry => entry.panel);
}

export function getTopModalDialog(doc: Document): HTMLElement | null {
  return getModalDialogsInStackOrder(doc).at(-1) ?? null;
}

/** Observe topology and computed-style inputs, not a guessed cleanup delay. */
export function observeModalStack(doc: Document, onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['role', 'aria-modal', 'aria-hidden', 'hidden', 'inert', 'class', 'style'],
  });
  return () => observer.disconnect();
}
