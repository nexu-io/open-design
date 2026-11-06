/**
 * Occurrence index for a selector within its source document.
 *
 * The preview flattens multiple composition files into one DOM, so a raw
 * `querySelectorAll` index is not a stable source-file identity. Callers supply
 * their existing source resolver; this helper alone owns occurrence scoping.
 */

/** Every element matching one selector, mapped to the source file it belongs to
 *  and its occurrence index within that file. One document query fills it. */
type SelectorOccurrences = Map<Element, { scope: string; index: number }>;
export type KeptIndexes = Map<Document, Map<string, SelectorOccurrences>>;

interface SelectorIndexPass {
  doc: Document;
  bySelector: Map<string, SelectorOccurrences>;
}

let activePass: SelectorIndexPass | null = null;

/**
 * Share one occurrence index per selector across every
 * `getSourceScopedSelectorIndex` call made synchronously inside `run`.
 *
 * Unshared, each call runs its own whole-document `querySelectorAll(selector)`
 * and resolves the source file of every match. A rebuild that walks n elements
 * sharing a selector therefore does n whole-document queries and n² resolver
 * calls — a composition of repeated cards or tiles is exactly that shape. One
 * index per selector makes the same pass linear.
 *
 * Correctness rests on the pass being ONE synchronous walk of a document that
 * does not change under it: nothing invalidates the index, so `run` must not
 * mutate `doc`, and every call inside it must resolve source files the same way
 * (the resolver may be a fresh closure per call, as long as it answers the
 * same). Outside a pass the index is per-call, exactly as before.
 */
export function withSelectorIndexPass<T>(doc: Document, run: () => T, kept?: KeptIndexes): T {
  const previous = activePass;
  const bySelector = kept?.get(doc) ?? new Map();
  kept?.set(doc, bySelector);
  activePass = { doc, bySelector };
  try {
    return run();
  } finally {
    activePass = previous;
  }
}

function buildOccurrences(
  doc: Document,
  selector: string,
  resolveSourceFile: (candidate: Element) => string | undefined,
): SelectorOccurrences {
  const occurrences: SelectorOccurrences = new Map();
  const counts = new Map<string, number>();
  for (const candidate of doc.querySelectorAll(selector)) {
    const scope = resolveSourceFile(candidate) ?? "index.html";
    const index = counts.get(scope) ?? 0;
    counts.set(scope, index + 1);
    occurrences.set(candidate, { scope, index });
  }
  return occurrences;
}

export function getSourceScopedSelectorIndex(
  doc: Document,
  el: Element,
  selector: string | undefined,
  sourceFile: string | undefined,
  resolveSourceFile: (candidate: Element) => string | undefined,
): number | undefined {
  if (!selector || selector.startsWith("#") || selector.startsWith("[data-composition-id=")) {
    return undefined;
  }

  try {
    const pass = activePass?.doc === doc ? activePass : null;
    let occurrences = pass?.bySelector.get(selector);
    if (!occurrences) {
      occurrences = buildOccurrences(doc, selector, resolveSourceFile);
      pass?.bySelector.set(selector, occurrences);
    }
    // An element outside the requested scope is not in that scope's occurrence
    // run at all, which is the `indexOf` miss the filtered form returned before.
    const hit = occurrences.get(el);
    return hit && hit.scope === (sourceFile ?? "index.html") ? hit.index : undefined;
  } catch {
    return undefined;
  }
}
