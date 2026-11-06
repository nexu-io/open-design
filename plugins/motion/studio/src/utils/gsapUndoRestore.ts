// Soft-apply of undo/redo restores to the live preview: diff a restored file
// against the live one, sync attribute-only changes onto the live DOM, and
// refresh the runtime in place — avoiding the full iframe remount (black flash
// + WebGL context loss) whenever the restore is expressible without one.
import {
  applySoftReload,
  applySoftReloadFinalization,
  extractGsapScriptText,
  findGsapScriptElements,
  readNestedFiles,
  repaintDroppedTweenStyle,
  timelineKeys,
} from "./gsapSoftReload";
import { ensureHfIds, isCompositionTemplate } from "@hyperframes/parsers/hf-ids";
import { findAuthoredElement, parseSavedSource } from "./authoredSource";
import { STUDIO_EDIT_ATTRS } from "../components/editor/manualEditsSeekReapply";
import { markScenesStale } from "../player/sceneSwap";
import { STUDIO_ORIGINAL_INLINE_TRANSLATE_ATTR } from "../components/editor/manualEditsTypes";
import { countStudioPreviewChange, studioGestureDraws } from "../components/editor/manualEditsDom";

type PreviewWindow = Window & {
  __player?: { seek?: (t: number) => void };
  __hfStudioManualEditsApply?: () => void;
};

/** One file's restore from the edit-history store: before (live) / after (target) bytes. */
export interface UndoRestoreFile {
  previous: string;
  restored: string;
}
export type RestoreFiles = Record<string, UndoRestoreFile>;

/**
 * Identity for the soft diff: `data-hf-id` when present, else `id`. Nearly
 * every studio-editable element carries one of the two — z-order commits and
 * timeline patches target by id OR hf-id OR stable selector, and hf-ids are
 * stamped uniquely by the SDK — so preferring them keeps duplicate authored
 * ids distinct and selector-targeted clips inside soft-undo's reach.
 */
function elementIdentityKey(el: Element): string | null {
  const hfId = el.getAttribute("data-hf-id");
  if (hfId) return `hf:${hfId}`;
  const id = el.getAttribute("id");
  if (id) return `id:${id}`;
  return null;
}

const IDENTITY_SELECTOR = "[id], [data-hf-id]";

function identityElementMap(root: ParentNode): Map<string, Element> | null {
  const map = new Map<string, Element>();
  for (const el of root.querySelectorAll(IDENTITY_SELECTOR)) {
    const key = elementIdentityKey(el);
    if (!key) continue;
    // Ambiguous identity must full-reload; silently overwriting would restore
    // one element's attributes onto another element sharing the same key.
    if (map.has(key)) return null;
    map.set(key, el);
  }
  return map;
}

// A sub-composition file wraps its markup in a template; the preview inlines that markup into its host.
function parseRestoreSource(html: string): Document {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const template of Array.from(doc.querySelectorAll("template")).filter(
    isCompositionTemplate,
  )) {
    template.replaceWith(template.content);
  }
  return doc;
}

// Strip identified elements to their bare identity attributes and blank GSAP
// scripts, in place: docs that differ only in identified-element attributes/
// inline-style/script text normalize equal; any residual difference is beyond
// soft-reload's reach → caller full-reloads. Both identity attributes are
// KEPT, so a change to `id`/`data-hf-id` themselves stays a residual
// (structural) difference.
function normalizeSoftResidual(root: Element): void {
  const self = root.matches(IDENTITY_SELECTOR) ? [root] : [];
  for (const el of [...self, ...root.querySelectorAll(IDENTITY_SELECTOR)]) {
    const id = el.getAttribute("id");
    const hfId = el.getAttribute("data-hf-id");
    for (const name of [...el.getAttributeNames()]) {
      if (name !== "id" && name !== "data-hf-id") el.removeAttribute(name);
    }
    if (id) el.setAttribute("id", id);
    if (hfId) el.setAttribute("data-hf-id", hfId);
  }
  for (const script of findGsapScriptElements(root)) script.textContent = "";
}

/** Same attribute set with identical values (order-insensitive). */
function attributesEqual(a: Element, b: Element): boolean {
  const aNames = a.getAttributeNames();
  if (aNames.length !== b.getAttributeNames().length) return false;
  for (const name of aNames) {
    if (a.getAttribute(name) !== b.getAttribute(name)) return false;
  }
  return true;
}

// Soft-reloadable iff the docs differ SOLELY in identified-element attributes/
// inline style and/or the GSAP script; returns the changed identity keys to
// sync onto the live DOM. Structural/text diffs → null → the caller
// full-reloads. Pure.
//
// Change detection deliberately compares each identified element's OWN
// attribute surface — never its innerHTML. Identified elements NEST (the
// composition root wraps every clip), so an innerHTML comparison at the parent
// re-detects every descendant change and rejects the restore; that was the
// original always-full-reload undo blink. Structure/text integrity is instead
// guaranteed by the normalize-residual pass below: with identified-element
// attributes stripped and scripts blanked, ANY remaining difference (text,
// added/removed/reordered nodes, un-identified element attrs) still fails the
// docs-equal check and escalates to a full reload.
export function diffSoftReloadableRestore(
  previous: string,
  restored: string,
): { changedElementKeys: string[] } | null {
  const keys = diffRestoreDocs(parseRestoreSource(previous), parseRestoreSource(restored));
  return keys && { changedElementKeys: keys };
}

function diffRestoreDocs(prevDoc: Document, nextDoc: Document): string[] | null {
  const prevByKey = identityElementMap(prevDoc);
  const nextByKey = identityElementMap(nextDoc);
  if (!prevByKey || !nextByKey) return null;
  // A different identity set means an element was added or removed (e.g. a
  // split, a delete) — structural, so soft-reload can't express it.
  if (prevByKey.size !== nextByKey.size) return null;
  const changedElementKeys: string[] = [];
  for (const [key, nextEl] of nextByKey) {
    const prevEl = prevByKey.get(key);
    if (!prevEl || prevEl.tagName !== nextEl.tagName) return null;
    if (!attributesEqual(prevEl, nextEl)) changedElementKeys.push(key);
  }
  // Confirm nothing OUTSIDE identified-element attributes and GSAP scripts changed.
  const [prevRest, nextRest] = [prevDoc, nextDoc].map((doc) => {
    const root = doc.documentElement.cloneNode(true) as Element;
    normalizeSoftResidual(root);
    return root.outerHTML;
  });
  return prevRest === nextRest ? changedElementKeys : null;
}

/** Copies `source`'s attributes onto `target`; under a gesture mark it merges them (keepDrawn). */
function syncElementAttributes(target: Element, source: Element, base?: Element): void {
  const draws = base && studioGestureDraws(target);
  const merged = draws ? keepDrawn(target, source, base, draws) : source;
  for (const name of [...target.getAttributeNames()]) {
    if (!merged.hasAttribute(name)) target.removeAttribute(name);
  }
  for (const name of merged.getAttributeNames()) {
    target.setAttribute(name, merged.getAttribute(name) ?? "");
  }
}

/** `source`, plus what a gesture in progress draws on `live` (whatever its value) or changed since `base`. */
function keepDrawn(live: Element, source: Element, base: Element, draws: readonly string[]) {
  const merged = source.cloneNode(false) as Element;
  const keepsMark = draws.includes("translate");
  for (const name of live.getAttributeNames().filter((n) => n !== "style")) {
    const value = live.getAttribute(name)!;
    const mark = keepsMark && name === STUDIO_ORIGINAL_INLINE_TRANSLATE_ATTR;
    if (mark || value !== base.getAttribute(name)) merged.setAttribute(name, value);
  }
  keepDrawnStyle(live as HTMLElement, base as HTMLElement, merged as HTMLElement, draws);
  return merged;
}

function keepDrawnStyle(
  live: HTMLElement,
  base: HTMLElement,
  merged: HTMLElement,
  draws: readonly string[],
) {
  const value = (prop: string) => live.style.getPropertyValue(prop);
  const drawn = (prop: string) =>
    draws.includes(prop) || value(prop) !== base.style.getPropertyValue(prop);
  const props = new Set([...Array.from(live.style), ...Array.from(base.style), ...draws]);
  for (const prop of [...props].filter(drawn)) {
    if (value(prop))
      merged.style.setProperty(prop, value(prop), live.style.getPropertyPriority(prop));
    else merged.style.removeProperty(prop);
  }
}

// A gesture folded into the script leaves marks on the live element that every seek would re-impose.
function syncStaleEditMarks(doc: Document, file: UndoRestoreFile): void {
  const [restoredDoc, previousDoc] = [file.restored, file.previous].map(parseSavedSource);
  for (const live of doc.querySelectorAll(STUDIO_EDIT_ATTRS.map((attr) => `[${attr}]`).join())) {
    const source = findAuthoredElement(restoredDoc, live);
    if (source && STUDIO_EDIT_ATTRS.some((a) => live.getAttribute(a) !== source.getAttribute(a))) {
      syncElementAttributes(live, source, findAuthoredElement(previousDoc, live) ?? undefined);
    }
  }
}

function hasAmbiguousGsapScriptChange(
  previousScripts: string[],
  restoredScripts: string[],
): boolean {
  if (previousScripts.length <= 1 && restoredScripts.length <= 1) return false;
  return (
    previousScripts.length !== restoredScripts.length ||
    previousScripts.some((script, index) => script !== restoredScripts[index])
  );
}

type RestoreTarget = { live: Element; restored: Element; previous?: Element };
type RestorePlan = { targets: RestoreTarget[]; scripted: boolean };

/** Whether either side has a GSAP script, or null when its scripts rule out an in-place restore. */
function restoreScripted(prevDoc: Document, nextDoc: Document, isActive: boolean): boolean | null {
  const [before, after] = [prevDoc, nextDoc].map((doc) =>
    findGsapScriptElements(doc).map((script) => script.textContent ?? ""),
  );
  const scripted = before!.length > 0 || after!.length > 0;
  // Only the active document's GSAP script can be re-run in place.
  if (scripted && !isActive) return null;
  return hasAmbiguousGsapScriptChange(before!, after!) ? null : scripted;
}

// The active document is the whole preview; a sub-composition lives in each host that inlines it.
function liveScopes(doc: Document, path: string, isActive: boolean): ParentNode[] {
  if (isActive) return [doc];
  return Array.from(doc.querySelectorAll(`[data-composition-file="${CSS.escape(path)}"]`));
}

function scopeTargets(
  scope: ParentNode,
  keys: string[],
  restoredByKey: Map<string, Element>,
  previousByKey: Map<string, Element>,
): RestoreTarget[] | null {
  const liveByKey = identityElementMap(scope);
  if (!liveByKey) return null;
  const targets: RestoreTarget[] = [];
  for (const key of keys) {
    const live = liveByKey.get(key);
    const restored = restoredByKey.get(key);
    // The preview rewrites a sub-composition's own root, so its attributes are not the file's.
    if (!live || !restored || live.hasAttribute("data-hf-inner-root")) return null;
    targets.push({ live, restored, previous: previousByKey.get(key) });
  }
  return targets;
}

function fileTargets(
  doc: Document,
  path: string,
  isActive: boolean,
  file: UndoRestoreFile,
): RestorePlan | null {
  const previewStamped = doc.querySelector("[data-hf-id]") !== null;
  const stampedLikeThePreview = (html: string) =>
    previewStamped && !html.includes("data-hf-id") ? ensureHfIds(html) : html;
  const prevDoc = parseRestoreSource(stampedLikeThePreview(file.previous));
  const nextDoc = parseRestoreSource(stampedLikeThePreview(file.restored));
  const scripted = restoreScripted(prevDoc, nextDoc, isActive);
  if (scripted === null) return null;
  const keys = diffRestoreDocs(prevDoc, nextDoc);
  const restoredByKey = identityElementMap(nextDoc);
  const previousByKey = identityElementMap(prevDoc);
  if (!keys || !restoredByKey || !previousByKey) return null;
  const found = liveScopes(doc, path, isActive).map((scope) =>
    scopeTargets(scope, keys, restoredByKey, previousByKey),
  );
  if (!found.length || found.includes(null)) return null;
  return { targets: (found as RestoreTarget[][]).flat(), scripted };
}

/** Every live element a restore changes with its restored markup, or null when it needs a reload. */
function planRestoreTargets(
  doc: Document,
  activeDocPath: string,
  files: RestoreFiles,
): RestorePlan | null {
  const plan: RestorePlan = { targets: [], scripted: false };
  for (const [path, file] of Object.entries(files)) {
    const found = fileTargets(doc, path, path === activeDocPath, file);
    if (!found) return null;
    plan.targets.push(...found.targets);
    plan.scripted ||= found.scripted;
  }
  return plan;
}

// Rebind-only finalization (no script run); plain seek + manual reapply when the runtime has no rebind hook.
function finalizeInPlace(
  iframe: HTMLIFrameElement,
  win: PreviewWindow,
  currentTime: number,
): boolean {
  if (applySoftReloadFinalization(iframe, currentTime)) return true;
  try {
    win.__player?.seek?.(currentTime);
    win.__hfStudioManualEditsApply?.();
    return true;
  } catch {
    return false;
  }
}

/** Shows a restore without a GSAP script in place, or nothing; returns what puts the shown elements back. */
export function showRestoreInPlace(
  iframe: HTMLIFrameElement | null,
  activeCompPath: string | null,
  files: RestoreFiles,
  currentTime: number,
): ((currentTime: number) => boolean) | null {
  const doc = iframe?.contentDocument;
  const win = iframe?.contentWindow as PreviewWindow | null;
  const plan = doc && win ? planRestoreTargets(doc, activeCompPath ?? "index.html", files) : null;
  if (!iframe || !doc || !win || !plan || plan.scripted) return null;
  countStudioPreviewChange(doc);
  const before = plan.targets.map(
    ({ live, restored }) => [live, live.cloneNode(false) as Element, restored] as const,
  );
  for (const { live, restored, previous } of plan.targets)
    syncElementAttributes(live, restored, previous);
  const putBack = (time: number) => {
    if (iframe.contentDocument !== doc) return false;
    for (const [live, attributes, shown] of before) syncElementAttributes(live, attributes, shown);
    return finalizeInPlace(iframe, win, time);
  };
  if (finalizeInPlace(iframe, win, currentTime)) return putBack;
  putBack(currentTime);
  return null;
}

/** The other composition files a re-run of the restored script resets elements of; null when none. */
export function readUndoNestedFiles(
  iframe: HTMLIFrameElement | null,
  activeCompPath: string | null,
  files: RestoreFiles | undefined,
  readFile: (path: string) => Promise<string>,
): Promise<Map<string, string>> | null {
  const active = files?.[activeCompPath ?? "index.html"];
  const script = active ? extractGsapScriptText(active.restored) : null;
  return script ? readNestedFiles(iframe, script, readFile) : null;
}

/** A preview about to reload still shows the timeline's last composed transform; take it back to the file. */
function repaintWhileReloading(win: PreviewWindow, doc: Document, restored?: string): void {
  const keys = findGsapScriptElements(doc).flatMap((s) => timelineKeys(s.textContent ?? ""));
  if (!restored || keys.length === 0) return;
  repaintDroppedTweenStyle(
    win,
    doc,
    parseRestoreSource(restored),
    keys,
    extractGsapScriptText(restored),
  );
}

/**
 * Soft-apply an undo/redo restore to the live preview WITHOUT a full iframe
 * remount (which blanks the frame black and re-flashes the WebGL context). Eligible
 * files are the active composition and any sub-composition the preview inlines;
 * a file the preview does not show falls back to `reloadPreview`.
 *
 * The restore is soft-applied when its only differences are identified-element
 * (id / data-hf-id) attributes / inline-style and/or the GSAP script (see
 * diffSoftReloadableRestore):
 *   1. Each changed element's attribute surface (inline style, data-start /
 *      -duration, the studio manual-offset props + flags) is synced onto the live
 *      element — so a canvas-position revert lands on the live DOM the runtime's
 *      seek-reapply reads from, not just on disk.
 *   2. The runtime refresh depends on what changed:
 *      - GSAP script text actually CHANGED between previous and restored, or a
 *        synced element was parsed by GSAP → the restored script is re-run in
 *        place via applySoftReload (re-seeks to `currentTime`, re-folds manual
 *        edits, re-parses those elements); several scripts can't, so it reloads.
 *      - Script unchanged or absent (the overwhelmingly common undo: z-order,
 *        lane move, timing shift, style tweak) → NO script execution — the
 *        blink-free finalization only (seek + __hfForceTimelineRebind + manual
 *        reapply, exactly the rebindPreviewTiming path), so timing-attribute
 *        reverts refresh their visibility windows.
 *
 * Returns "soft" when applied in place, "full" when it escalated to reloadPreview
 * (ineligible restore, missing target, or a permanent soft-reload failure).
 */
// fallow-ignore-next-line complexity
export function applyUndoRestoreToPreview(
  iframe: HTMLIFrameElement | null,
  activeCompPath: string | null,
  files: RestoreFiles | undefined,
  currentTime: number,
  reload: () => void,
  nestedFiles?: Map<string, string> | null,
): "soft" | "full" {
  // The master view carries a NULL activeCompPath but the root iframe shows
  // index.html — the codebase-wide convention (`activeCompPath || "index.html"`).
  // Without this normalization every master-view undo failed the path gate and
  // full-reloaded: the original "undo always blinks".
  const activeDocPath = activeCompPath ?? "index.html";
  const paths = files ? Object.keys(files) : [];
  const reloadPreview = () => {
    markScenesStale(iframe, paths);
    reload();
  };
  const doc = iframe?.contentDocument;
  const win = iframe?.contentWindow as PreviewWindow | null;
  const plan = doc && files && win ? planRestoreTargets(doc, activeDocPath, files) : null;
  if (!iframe || !doc || !files || !win || !plan) {
    if (doc && win) repaintWhileReloading(win, doc, files?.[activeDocPath]?.restored);
    reloadPreview();
    return "full";
  }
  countStudioPreviewChange(doc);
  // Sync each changed element's attributes onto the live DOM from the restored
  // markup, so the runtime's seek-reapply reads the reverted values.
  for (const target of plan.targets)
    syncElementAttributes(target.live, target.restored, target.previous);

  const active = files[activeDocPath];
  const restoredScript = active ? extractGsapScriptText(active.restored) : null;
  const previousScript = active ? extractGsapScriptText(active.previous) : null;
  const reparse = plan.scripted && plan.targets.some(({ live }) => "_gsap" in live);
  if (reparse && !restoredScript) {
    reloadPreview();
    return "full";
  }
  if (restoredScript && (restoredScript !== previousScript || reparse)) {
    syncStaleEditMarks(doc, active);
    const result = applySoftReload(iframe, restoredScript, {
      onAsyncFailure: reloadPreview,
      currentTimeOverride: currentTime,
      authoredHtml: active.restored,
      nestedFiles,
    });
    if (result === "cannot-soft-reload") {
      reloadPreview();
      return "full";
    }
    return "soft";
  }
  // Script unchanged or absent — the live timelines are still valid; only the
  // synced attributes need to take effect.
  if (finalizeInPlace(iframe, win, currentTime)) return "soft";
  reloadPreview();
  return "full";
}
