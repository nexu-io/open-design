/**
 * Incremental memory for `collectDomEditLayerItems`.
 *
 * The layer walk is re-run from scratch every time a MutationObserver says the
 * preview changed, and the observer's loudest source is inline `style` — which
 * is exactly what animation writes. So a paused-looking editor re-derived every
 * element's patch target, label and child count several times a second, and each
 * derivation costs two `getComputedStyle` reads (its own plus one per direct
 * child), two ancestor walks for the source file, and a `textContent` read whose
 * cost is the element's whole subtree.
 *
 * None of that depends on the traversal — only on the element. So the traversal
 * stays live (it is pointer-chasing, and `depth` genuinely is positional) and the
 * per-element half is memoized, with the mutation records deciding what to drop.
 *
 * WHAT MAKES A CACHED ENTRY WRONG, and how each is caught:
 *
 *   - the element's own attributes (`style` -> computed display, `class`/`id`/
 *     `data-hf-group` -> selector and label)        -> attribute record on it
 *   - an ancestor's `visibility`, the ONLY inherited input to the
 *     display/visibility gate (`display:none` on an ancestor does not change a
 *     descendant's own computed `display`)          -> attribute record on the
 *                                                      ancestor, whose subtree is
 *                                                      dropped only when the
 *                                                      style declares visibility
 *   - a direct child appearing or disappearing from the layer list, which moves
 *     the parent's `childCount`                     -> the parent is dropped
 *                                                      alongside every element
 *   - descendant text, which moves an ancestor's label -> characterData record,
 *                                                      ancestors dropped
 *   - selector occurrence indices, which shift for EVERY element sharing a
 *     selector when one element's identity changes  -> whole cache dropped
 *   - nodes added or removed, which shift indices, order, labels and counts at
 *     once and cannot be attributed to one element  -> whole cache dropped
 *   - a different active composition path, or a new composition-id -> source-file
 *     map, both of which re-scope every source file -> checked per walk
 *
 * The bias is deliberate and matches the duration cache in the runtime: a
 * redundant recomputation is a missed optimisation, a missed one is a wrong
 * layer tree.
 */

import { buildElementLabel, getCompositionSourceMapRevision, isHtmlElement } from "./domEditingDom";
import {
  getDirectLayerChildren,
  isInspectableLayerElement,
  resolveDomLayerIdentity,
} from "./domEditingElement";
import type { DomEditSelection } from "./domEditingTypes";
import type { KeptIndexes } from "../../utils/sourceScopedSelectorIndex";

/** How an element is addressed. Survives style writes; see `readIdentity`. */
export type DomEditLayerIdentity = Pick<
  DomEditSelection,
  "id" | "hfId" | "selector" | "selectorIndex" | "sourceFile"
>;

/** Whether the element renders, and how many of its direct children are layers.
 *  Both are computed style reads, and both a style write can flip. Filled
 *  lazily: `childCount` is only asked for once an element is known to be one. */
interface PresenceMemo {
  inspectable?: boolean;
  childCount?: number;
}

interface IdentityMemo {
  identity?: DomEditLayerIdentity | null;
  label?: string;
}

/**
 * Attributes that decide an element's SELECTOR, and therefore the occurrence
 * index of every other element sharing that selector. One of these changing
 * renumbers elements the record does not mention, so the only sound response is
 * to drop everything. `class` is here because `buildStableSelector` falls back
 * to the preferred class.
 */
const SELECTOR_IDENTITY_ATTRIBUTES = new Set([
  "id",
  "class",
  "data-hf-group",
  "data-composition-id",
  "data-composition-file",
  "data-composition-src",
  "data-hf-original-composition-id",
]);

/**
 * The observer configuration the cache's invalidation is written against.
 * Exported so the refresh loop and the tests cannot drift from it.
 *
 * No `attributeFilter`: an unlisted attribute is one the cache would never learn
 * about, and serving a stale entry is worse than the extra records.
 */
export const DOM_EDIT_LAYER_OBSERVER_INIT: MutationObserverInit = {
  attributes: true,
  characterData: true,
  childList: true,
  subtree: true,
};

/**
 * The inline `visibility` each element last presented. Deliberately NOT cleared
 * by `invalidateAll`: it records what the DOM said, not a value derived from it.
 */
const lastInlineVisibility = new WeakMap<HTMLElement, string>();

/**
 * Did this style write move the element's inline `visibility`?
 *
 * `visibility` is inherited, so changing it changes the layer-list membership of
 * the element's whole subtree, and only then is the subtree worth dropping.
 *
 * The comparison is on the PARSED value, remembered per element. Testing the
 * attribute TEXT for "visibility" looks equivalent and is not: the standard
 * GSAP fade (`autoAlpha`) writes `visibility: visible` once and leaves it in the
 * attribute for the rest of the clip, so a text test stays true for every
 * transform tick afterwards. That is a whole-subtree walk per animation frame,
 * in the observer callback rather than behind the rebuild throttle, on exactly
 * the elements a composition animates most.
 *
 * An element seen for the first time reports changed, which costs one drop and
 * is the safe answer: its entries were derived before this write.
 */
function inlineVisibilityChanged(el: HTMLElement): boolean {
  const next = el.style.visibility;
  if (lastInlineVisibility.get(el) === next) return false;
  lastInlineVisibility.set(el, next);
  return true;
}

export interface DomEditLayerWalkCache {
  /**
   * Start a walk. Drops everything when the scoping inputs the entries were
   * built under no longer hold. Call once per `collectDomEditLayerItems`.
   */
  beginWalk(activeCompositionPath: string | null): void;
  /**
   * Does `el` render? Cheap to invalidate and invalidated often: any attribute
   * write on the element, on its parent, or a `visibility` write on an ancestor
   * drops it, because all three can flip the answer.
   */
  readInspectable(el: HTMLElement, compute: () => boolean): boolean;
  /** How many of `el`'s direct children are layers. Same lifetime as
   *  `readInspectable`: it is a sum over their answers. */
  readChildCount(el: HTMLElement, compute: () => number): number;
  /**
   * `el`'s selector, occurrence index and source file. A SEPARATE, much longer
   * lifetime than presence: a style write cannot renumber a selector, so this
   * survives one, and it is the only part of the walk that queries the
   * document. That split is what makes an ordinary animation frame cost no
   * document queries at all.
   */
  readIdentity(
    el: HTMLElement,
    compute: () => DomEditLayerIdentity | null,
  ): DomEditLayerIdentity | null;
  /** `el`'s display label. Shares the identity lifetime, plus descendant text. */
  readLabel(el: HTMLElement, compute: () => string): string;
  /** Apply mutation records. Safe to call with an empty array. */
  ingest(records: MutationRecord[]): void;
  /** Forget every entry — the fallback for anything not attributable. */
  invalidateAll(): void;
  /** Selector occurrence indexes, kept across walks and dropped with `identities`, which derive from them. */
  readonly selectorIndex: KeptIndexes;
}

export function createDomEditLayerWalkCache(): DomEditLayerWalkCache {
  let presence = new WeakMap<HTMLElement, PresenceMemo>();
  let identities = new WeakMap<HTMLElement, IdentityMemo>();
  let scope: string | null = null;
  const selectorIndex: KeptIndexes = new Map();

  const invalidateAll = () => {
    presence = new WeakMap();
    identities = new WeakMap();
    selectorIndex.clear();
  };

  const drop = (el: HTMLElement | null) => {
    if (el) presence.delete(el);
  };

  const dropSubtree = (el: HTMLElement) => {
    for (const descendant of el.querySelectorAll("*")) {
      if (isHtmlElement(descendant)) presence.delete(descendant);
    }
  };

  const ingestOne = (record: MutationRecord): boolean => {
    // Structural change: order, occurrence indices, labels and child counts all
    // move at once, and the record names the parent rather than everything
    // affected. This is the documented full-rebuild fallback.
    if (record.type === "childList") return false;

    if (record.type === "characterData") {
      // `buildElementLabel` falls back to `textContent`, so edited text changes
      // the label of every ancestor that contains it.
      for (
        let ancestor = record.target.parentElement;
        ancestor;
        ancestor = ancestor.parentElement
      ) {
        identities.delete(ancestor);
      }
      return true;
    }

    const target = record.target;
    if (!isHtmlElement(target)) return true;
    if (record.attributeName && SELECTOR_IDENTITY_ATTRIBUTES.has(record.attributeName))
      return false;

    drop(target);
    // The parent counts its layer children, and this element may have just
    // joined or left that count.
    drop(target.parentElement);
    if (record.attributeName === "style" && inlineVisibilityChanged(target)) dropSubtree(target);
    return true;
  };

  return {
    beginWalk(activeCompositionPath) {
      const nextScope = `${activeCompositionPath ?? ""}|${getCompositionSourceMapRevision()}`;
      if (nextScope === scope) return;
      scope = nextScope;
      invalidateAll();
    },
    readInspectable(el, compute) {
      const memo = presence.get(el) ?? {};
      if (memo.inspectable === undefined) {
        memo.inspectable = compute();
        presence.set(el, memo);
      }
      return memo.inspectable;
    },
    readChildCount(el, compute) {
      const memo = presence.get(el) ?? {};
      if (memo.childCount === undefined) {
        memo.childCount = compute();
        presence.set(el, memo);
      }
      return memo.childCount;
    },
    readIdentity(el, compute) {
      const memo = identities.get(el) ?? {};
      if (memo.identity === undefined) {
        memo.identity = compute();
        identities.set(el, memo);
      }
      return memo.identity;
    },
    readLabel(el, compute) {
      const memo = identities.get(el) ?? {};
      if (memo.label === undefined) {
        memo.label = compute();
        identities.set(el, memo);
      }
      return memo.label;
    },
    ingest(records) {
      for (const record of records) {
        if (!ingestOne(record)) {
          invalidateAll();
          return;
        }
      }
    },
    invalidateAll,
    selectorIndex,
  };
}

/** One element's contribution to a layer walk. `depth` is absent on purpose: it
 *  belongs to the traversal, not to the element. */
export interface DomEditLayerWalkEntry {
  target: DomEditLayerIdentity;
  label: string;
  childCount: number;
}

/**
 * Everything `collectDomEditLayerItems` needs about ONE element, served from
 * `cache` where it is still valid. Null when the element is not a layer.
 *
 * The four reads go through the cache separately rather than as one record
 * because they do not go stale together: a style write flips whether an element
 * renders without touching how it is addressed. Without a cache this is exactly
 * the original per-element derivation, which is what every other caller of the
 * walk still gets.
 *
 * Lives here rather than in the walk so the two halves of the memoization —
 * what is stored and what is read — sit in one file.
 */
export function readDomEditLayerWalkEntry(
  el: HTMLElement,
  activeCompositionPath: string | null,
  cache?: DomEditLayerWalkCache,
): DomEditLayerWalkEntry | null {
  const inspectable = cache
    ? cache.readInspectable(el, () => isInspectableLayerElement(el))
    : isInspectableLayerElement(el);
  if (!inspectable) return null;

  const identity = () => resolveDomLayerIdentity(el, activeCompositionPath);
  const target = cache ? cache.readIdentity(el, identity) : identity();
  if (!target) return null;

  const label = () => buildElementLabel(el);
  const childCount = () => getDirectLayerChildren(el).length;
  return {
    target,
    label: cache ? cache.readLabel(el, label) : label(),
    childCount: cache ? cache.readChildCount(el, childCount) : childCount(),
  };
}

/**
 * Apply the records the observer has taken in but not yet delivered.
 *
 * Records arrive in a microtask, so an edit made earlier in THIS task would
 * otherwise be read back against entries that predate it. Taking them suppresses
 * the observer's own callback for them, which is equivalent here: that callback
 * only ingests and marks a rebuild owed, and a caller draining is rebuilding
 * regardless. A caller with no observer yet has nothing pending.
 */
export function drainPendingLayerMutations(
  observer: MutationObserver | null,
  cache: DomEditLayerWalkCache,
): void {
  if (!observer) return;
  cache.ingest(observer.takeRecords());
}
