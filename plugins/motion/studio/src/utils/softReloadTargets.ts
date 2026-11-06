// Which elements a GSAP soft reload resets, what their tweens wrote, and which file writes each.
import { parseGsapScript } from "@hyperframes/parsers/gsap-parser";
import { parseSavedSource } from "./authoredSource";
import { elementTargets } from "./elementGsap";

type TweenLike = {
  targets?: () => unknown[];
  vars?: Record<string, unknown>;
  getChildren?: (deep: boolean) => TweenLike[];
};

const NESTED_VARS = new Set(["css", "startAt", "keyframes"]);

// The CSS names a tween's vars write; GSAP's own keys (ease, duration) are not CSS and restore as no-ops.
function tweenedProps(vars: unknown): string[] {
  if (!vars || typeof vars !== "object") return [];
  return Object.entries(vars).flatMap(([key, value]) => [
    key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
    ...(NESTED_VARS.has(key) || /^\d|%$/.test(key) ? tweenedProps(value) : []),
  ]);
}

// A nested composition's timeline sits inside the root one but only its own script rebuilds it.
function ownTweens(tl: TweenLike, nested: Set<unknown>): TweenLike[] {
  return (tl.getChildren?.(false) ?? []).flatMap((child) => {
    if (nested.has(child)) return [];
    return child.getChildren ? ownTweens(child, nested) : [child];
  });
}

// The preview marks each inlined composition's host with its file; the host itself is the parent's.
export function authoringFile(el: Element): string | null {
  return (
    el.parentElement?.closest("[data-composition-file]")?.getAttribute("data-composition-file") ??
    null
  );
}

function addTweenTargets(tween: TweenLike, targets: Map<Element, Set<string>>): void {
  const props = tweenedProps(tween.vars);
  for (const el of elementTargets(tween)) {
    const seen = targets.get(el) ?? new Set<string>();
    for (const prop of props) seen.add(prop);
    targets.set(el, seen);
  }
}

/** Each element the re-run rebuilds, with the CSS names its killed tweens wrote. */
export function collectResetTargets(
  win: { __timelines?: Record<string, unknown> },
  doc: Document,
  targetKeys: string[],
  outgoingScripts: readonly string[] = [],
): Map<Element, Set<string>> {
  const targets = new Map<Element, Set<string>>();
  const timelines = (win.__timelines ?? {}) as Record<string, TweenLike | undefined>;
  const others = new Set<unknown>(
    Object.entries(timelines).flatMap(([key, tl]) => (targetKeys.includes(key) ? [] : [tl])),
  );
  for (const key of targetKeys) {
    try {
      for (const tween of ownTweens(timelines[key] ?? {}, others)) addTweenTargets(tween, targets);
    } catch {}
  }
  sweepHeldElements(doc, targetKeys, others, targets);
  addLiveSetTargets(doc, targetKeys, targets);
  for (const script of outgoingScripts) addStandaloneSetTargets(doc, script, targets);
  return targets;
}

function tweenTargetsIn(timelines: Set<unknown>): Set<Element> {
  const els = new Set<Element>();
  for (const tl of timelines) {
    try {
      for (const tween of (tl as TweenLike | undefined)?.getChildren?.(true) ?? []) {
        for (const el of elementTargets(tween)) els.add(el);
      }
    } catch {}
  }
  return els;
}

function compositionRoot(doc: Document, key: string): Element | undefined {
  return doc.querySelectorAll(`[data-composition-id="${CSS.escape(key)}"]`)[0];
}

export function compositionFile(doc: Document, targetKeys: string[]): string | null {
  const root = targetKeys.map((key) => compositionRoot(doc, key)).find(Boolean);
  return root?.closest("[data-composition-file]")?.getAttribute("data-composition-file") ?? null;
}

// A standalone gsap.set, or keyframes just removed, leaves GSAP state no timeline child shows.
// The nearest composition root says whose script set it; another timeline's targets stay its own.
function sweepHeldElements(
  doc: Document,
  targetKeys: string[],
  others: Set<unknown>,
  targets: Map<Element, Set<string>>,
): void {
  const elsewhere = tweenTargetsIn(others);
  const roots = new Set<Element | null | undefined>(targetKeys.map((k) => compositionRoot(doc, k)));
  roots.delete(undefined);
  for (const root of roots) {
    for (const el of root ? [root, ...root.querySelectorAll("*")] : []) {
      if (targets.has(el) || elsewhere.has(el) || !("_gsap" in el)) continue;
      if (el === root || roots.has(el.parentElement?.closest("[data-composition-id]")))
        targets.set(el, new Set());
    }
  }
}

// What a live patch set on each element since its last reload; no script in the preview ran it.
const liveSets = new WeakMap<Document, Map<Element, Set<string>>>();

export function recordLiveSet(el: Element, vars: Record<string, unknown>): void {
  const byElement = liveSets.get(el.ownerDocument) ?? new Map<Element, Set<string>>();
  liveSets.set(el.ownerDocument, byElement);
  const props = byElement.get(el) ?? new Set<string>();
  for (const prop of tweenedProps(vars)) props.add(prop);
  byElement.set(el, props);
}

function addLiveSetTargets(
  doc: Document,
  targetKeys: string[],
  targets: Map<Element, Set<string>>,
): void {
  const roots = new Set<Element | null | undefined>(targetKeys.map((k) => compositionRoot(doc, k)));
  for (const [el, props] of liveSets.get(doc) ?? []) {
    if (!roots.has(el) && !roots.has(el.parentElement?.closest("[data-composition-id]"))) continue;
    const seen = targets.get(el) ?? new Set<string>();
    for (const prop of props) seen.add(prop);
    targets.set(el, seen);
  }
}

export function forgetLiveSets(reset: Map<Element, unknown>): void {
  for (const el of reset.keys()) liveSets.get(el.ownerDocument)?.delete(el);
}

/** Adds what each standalone `gsap.set` in the outgoing script wrote, which no timeline child records. */
function addStandaloneSetTargets(
  doc: Document,
  outgoingScript: string,
  targets: Map<Element, Set<string>>,
): void {
  if (!outgoingScript.includes("gsap.set(")) return;
  for (const set of parseGsapScript(outgoingScript).animations) {
    if (set.method !== "set" || !set.global) continue;
    let els: Element[];
    try {
      els = [...doc.querySelectorAll(set.targetSelector)];
    } catch {
      continue;
    }
    for (const el of els) {
      const seen = targets.get(el) ?? new Set<string>();
      for (const prop of tweenedProps(set.properties)) seen.add(prop);
      targets.set(el, seen);
    }
  }
}

// Each file a reset element may be written in, parsed at most once per reload: the reloaded
// composition's own file is the one just written, any other comes from the caller.
export function fileDocs(
  ownFile: string | null,
  written: string | undefined,
  nestedFiles: Map<string, string> | null | undefined,
): (file: string | null) => Document | null {
  const docs = new Map<string | null, Document | null>();
  return (file) => {
    if (!docs.has(file)) {
      const text = file === ownFile ? written : nestedFiles?.get(file ?? "");
      try {
        docs.set(file, text ? parseSavedSource(text) : null);
      } catch {
        docs.set(file, null);
      }
    }
    return docs.get(file) ?? null;
  };
}
