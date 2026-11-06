import {
  DECK_LEGACY_SCREEN_SLIDE_SELECTOR,
  legacyDeckScreenNumber,
} from '@open-design/contracts/runtime/deck-stage-fallback';

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function hasDistinctScreenNumbers(elements: Element[]): boolean {
  const numbers = new Set<number>();
  for (const element of elements) {
    const number = legacyDeckScreenNumber(element.getAttribute('data-screen-label'));
    if (number !== null) numbers.add(number);
  }
  return numbers.size > 1;
}

/**
 * Find the compatibility-only shape used by older containerless decks. A
 * collection is valid only when numbered, page-like sections are direct
 * siblings; arbitrary annotation nodes elsewhere in a prototype never join it.
 */
export function collectLegacyDeckScreenSlides(root: ParentNode): Element[] {
  const groups = new Map<ParentNode, Element[]>();
  for (const element of root.querySelectorAll(DECK_LEGACY_SCREEN_SLIDE_SELECTOR)) {
    if (legacyDeckScreenNumber(element.getAttribute('data-screen-label')) === null) continue;
    const parent = element.parentNode;
    if (!parent) continue;
    const group = groups.get(parent);
    if (group) group.push(element);
    else groups.set(parent, [element]);
  }

  let best: Element[] = [];
  for (const group of groups.values()) {
    if (group.length > best.length && hasDistinctScreenNumbers(group)) best = group;
  }
  return best;
}

function screenLabelFromTag(tag: string): string | null {
  const match = /\bdata-screen-label\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

/**
 * SSR-safe source equivalent of collectLegacyDeckScreenSlides. This deliberately
 * tokenizes only enough HTML to preserve direct-parent identity; scripts,
 * styles, and comments are removed first so markup-looking strings cannot
 * manufacture slides.
 */
export function sourceHasLegacyDeckScreenSlides(source: string): boolean {
  const sanitized = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const tagPattern = /<\s*(\/?)\s*([a-z][\w:-]*)\b[^>]*>/gi;
  const stack: Array<{ id: number; tag: string }> = [];
  const groups = new Map<number, Set<number>>();
  let nextId = 1;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(sanitized))) {
    const closing = match[1] === '/';
    const tagName = match[2]!.toLowerCase();
    const tag = match[0];
    if (closing) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index]!.tag !== tagName) continue;
        stack.length = index;
        break;
      }
      continue;
    }

    const parentId = stack.at(-1)?.id ?? 0;
    if (tagName === 'section') {
      const number = legacyDeckScreenNumber(screenLabelFromTag(tag));
      if (number !== null) {
        const numbers = groups.get(parentId) ?? new Set<number>();
        numbers.add(number);
        groups.set(parentId, numbers);
        if (numbers.size > 1) return true;
      }
    }

    if (!VOID_ELEMENTS.has(tagName) && !/\/\s*>$/.test(tag)) {
      stack.push({ id: nextId, tag: tagName });
      nextId += 1;
    }
  }

  return false;
}
