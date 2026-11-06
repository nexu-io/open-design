import { COLOR_GRADING_SOURCE_HIDDEN_ATTR } from "@hyperframes/core/color-grading";
import { parseGsapScript } from "@hyperframes/parsers/gsap-parser";
import { GSAP_BASE_URL_META, motionPathPluginUrl } from "@hyperframes/core/gsap-cdn";
import { findAuthoredElement } from "./authoredSource";
import { applyAuthoredInlineOpacity, readStampedAuthoredOpacity } from "./authoredOpacity";
import {
  authoringFile,
  collectResetTargets,
  compositionFile,
  fileDocs,
  forgetLiveSets,
} from "./softReloadTargets";

type IframeWindow = Window & {
  __timelines?: Record<string, { kill?: () => void; pause?: () => void }>;
  __player?: {
    getTime?: () => number;
    seek?: (t: number) => void;
    isPlaying?: () => boolean;
    play?: () => void;
  };
  __hfForceTimelineRebind?: () => void;
  __hfSuppressSceneMutations?: <T>(fn: () => T) => T;
  __hfStudioManualEditsApply?: () => void;
  // Set while a MotionPathPlugin <script> is being fetched, so overlapping soft
  // reloads (each needing the plugin) don't queue duplicate plugin scripts that
  // re-flash the iframe. Cleared once the plugin loads or errors.
  __hfMotionPathPluginLoading?: boolean;
  __playerReady?: boolean;
  gsap?: {
    version?: string;
    timeline?: (...args: unknown[]) => unknown;
    registerPlugin?: (...plugins: unknown[]) => unknown;
    set?: (targets: Element | Element[], vars: Record<string, unknown>) => void;
    globalTimeline?: { getChildren?: (deep: boolean) => Array<{ kill?: () => void }> };
  };
  MotionPathPlugin?: unknown;
};

/**
 * Pre-load + register MotionPathPlugin ONCE in the preview iframe so
 * `win.MotionPathPlugin` is reliably set before any studio edit. Called from the
 * preview bootstrap (NLELayout's onIframeLoad) on every iframe load.
 *
 * Why: when a user ADDS a motion path to a composition that never used one, the
 * plugin isn't loaded, so the first soft reload takes the async `<script src>`
 * load path — the timeline is killed/cleared while the CDN load is pending,
 * producing a visible flash. Loading it eagerly here means the soft reload runs
 * synchronously and `needsMotionPath && !win.MotionPathPlugin` never fires for
 * studio edits.
 *
 * Idempotent (no-ops once the plugin is present or already loading) and
 * defensive: without gsap it waits for the runtime's ready, and it tolerates a CDN failure
 * (the soft-reload async fallback in applySoftReload still covers that case).
 */
// At most one preview waits for its runtime; a newer load replaces it, so a frame that never boots is not kept alive.
let pendingReadyRetry: ((event: MessageEvent) => void) | null = null;

function previewMotionPathUrl(doc: Document, version?: string): string {
  const baseUrl = doc.head.querySelector<HTMLMetaElement>(
    `meta[name="${GSAP_BASE_URL_META}"]`,
  )?.content;
  return motionPathPluginUrl(version, baseUrl);
}

export function ensureMotionPathPluginLoaded(iframe: HTMLIFrameElement | null): void {
  if (pendingReadyRetry) window.removeEventListener("message", pendingReadyRetry);
  pendingReadyRetry = null;
  if (!iframe?.contentWindow || !iframe.contentDocument) return;
  const win = iframe.contentWindow as IframeWindow;
  const doc = iframe.contentDocument;

  // Already registered (composition shipped its own plugin, or a prior bootstrap
  // ran) — register it on gsap to be safe, then bail.
  if (win.MotionPathPlugin) {
    try {
      if (win.gsap?.registerPlugin) win.gsap.registerPlugin(win.MotionPathPlugin);
    } catch {}
    return;
  }
  // A body gsap runs after web fonts, which can be after the iframe's load: retry once the runtime is ready.
  // A booted runtime (`__playerReady`, set in the same task it posts ready) has nothing left to wait for.
  if (!win.gsap?.registerPlugin) {
    if (win.__playerReady) return;
    const retry = (event: MessageEvent) => {
      const data = event.data as { source?: unknown; type?: unknown } | null;
      if (event.source !== win || data?.source !== "hf-preview" || data.type !== "ready") return;
      window.removeEventListener("message", retry);
      pendingReadyRetry = null;
      if (win.gsap?.registerPlugin) ensureMotionPathPluginLoaded(iframe);
    };
    pendingReadyRetry = retry;
    window.addEventListener("message", retry);
    return;
  }
  // A load is already in flight for this iframe — don't queue a second script.
  if (win.__hfMotionPathPluginLoading) return;

  try {
    win.__hfMotionPathPluginLoading = true;
    const pluginScript = doc.createElement("script");
    pluginScript.src = previewMotionPathUrl(doc, win.gsap?.version);
    const finalize = () => {
      win.__hfMotionPathPluginLoading = false;
      try {
        if (win.MotionPathPlugin && win.gsap?.registerPlugin) {
          win.gsap.registerPlugin(win.MotionPathPlugin);
        }
      } catch {}
    };
    pluginScript.onload = finalize;
    pluginScript.onerror = finalize;
    doc.head.appendChild(pluginScript);
  } catch {
    win.__hfMotionPathPluginLoading = false;
  }
}

function isGsapScript(text: string): boolean {
  return (
    text.includes("gsap.timeline") ||
    text.includes("__timelines") ||
    text.includes(".to(") ||
    text.includes(".set(")
  );
}

export function findGsapScriptElements(doc: ParentNode): HTMLScriptElement[] {
  const results: HTMLScriptElement[] = [];
  const scripts = doc.querySelectorAll<HTMLScriptElement>("script:not([src])");
  for (const script of scripts) {
    if (isGsapScript(script.textContent || "")) results.push(script);
  }
  return results;
}

/**
 * Extract the GSAP timeline script text from a serialized HTML document, for
 * feeding into applySoftReload. Returns null when zero or multiple GSAP scripts
 * are present (ambiguous — a serialized snapshot can't say WHICH script a
 * single rewritten text corresponds to; caller should fall back to a full
 * reload), matching applySoftReload's own single-script requirement.
 */
export function extractGsapScriptText(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const scripts = findGsapScriptElements(doc);
  if (scripts.length !== 1) return null;
  return scripts[0].textContent || null;
}

/**
 * Confirm the re-run repopulated the timeline(s) this script owns. We check the
 * EXPECTED keys (the ones the script re-registers), not merely "any key": a
 * scoped soft reload only re-runs ONE composition, so the right success signal is
 * "my target keys are back", not "the global map is non-empty". Checking the
 * exact keys avoids the transient false where the global map momentarily looks
 * empty right after the re-run — the spurious trigger of the full-remount fallback.
 */
function verifyTimelinesPopulated(win: IframeWindow, targetKeys: string[]): boolean {
  const timelines = win.__timelines;
  if (!timelines) return false;
  if (targetKeys.length > 0) {
    return targetKeys.every((key) => timelines[key] != null);
  }
  return Object.keys(timelines).filter((k) => k !== "__proxied").length > 0;
}

// GSAP masks a folded CSS translate/rotate/scale with `none`, and a tween writes what it animates
// inline; a fresh load has only what the file authors. Opacity has its own restore.
function restoreAuthoredStyle(
  style: CSSStyleDeclaration,
  authored: CSSStyleDeclaration | null,
  tweened: Set<string>,
) {
  style.transform = authored?.transform ?? "";
  if (!authored) return;
  for (const prop of ["translate", "rotate", "scale", ...tweened]) {
    if (prop === "opacity") continue;
    style.setProperty(prop, authored.getPropertyValue(prop), authored.getPropertyPriority(prop));
  }
}

function runSuppressed(win: IframeWindow, reload: () => void): boolean {
  try {
    if (win.__hfSuppressSceneMutations) win.__hfSuppressSceneMutations(reload);
    else reload();
    return true;
  } catch (error) {
    console.error("[Studio] GSAP soft reload threw; falling back to a full reload", error);
    return false;
  }
}

/**
 * Outcome of a soft-reload attempt. Callers must distinguish PERMANENT failures
 * (the preview genuinely can't be soft-updated — escalate to a full reload) from
 * the TRANSIENT post-run empty-timeline window (the live `gsap.set` already shows
 * the correct value — do NOT escalate; a remount would re-flash the WebGL context
 * and revert subcomposition keyframes):
 *
 * - `"applied"`            — the script ran (or is deferred to the async plugin
 *                            load and WILL run). The preview is/will be correct.
 * - `"verify-failed"`      — TRANSIENT: the re-run happened but `__timelines`
 *                            momentarily read empty. Live state is correct → do
 *                            NOT escalate. (Was a bare `false` before.)
 * - `"cannot-soft-reload"` — PERMANENT/STRUCTURAL: no gsap runtime, no rebind
 *                            hook, no scopable target key, or no script element
 *                            to replace. The preview is stale/broken → escalate.
 *
 * The async MotionPath-plugin load failure is still surfaced via
 * `onAsyncFailure` (it fires after this returned `"applied"` optimistically).
 */
export type SoftReloadResult = "applied" | "verify-failed" | "cannot-soft-reload";

/**
 * Replace the GSAP script in the live iframe without reloading. This preserves
 * the WebGL context and shader transition cache.
 *
 * Scoped to root-document GSAP scripts only — scripts inside `<template>`
 * elements (sub-compositions) are not visible to `querySelectorAll` and will
 * fall back to a full iframe reload.
 *
 * Returns `"cannot-soft-reload"` (caller should full-reload) when:
 * - The iframe or GSAP runtime isn't available
 * - The rebind hook isn't installed
 * - The script registers no scopable `__timelines` key
 * - No GSAP script element exists in the live DOM
 * - The synchronous re-run threw
 *
 * Returns `"verify-failed"` when the re-run executed but the target timeline
 * keys read empty in the transient post-run window (live state is still correct).
 *
 * `onAsyncFailure` is invoked when the soft reload was deferred to load the
 * MotionPath plugin (so this returned `"applied"` optimistically) but the plugin
 * `<script>` then failed to load — the iframe is left without the plugin and the
 * caller should perform a full reload to recover. It never fires on the
 * synchronous paths.
 */
export interface SoftReloadOptions {
  /** Escalation for async plugin-load failures (e.g. MotionPath CDN error). */
  onAsyncFailure?: () => void;
  /** Seek target for the rebuilt timeline; defaults to the iframe player time. */
  currentTimeOverride?: number;
  /** After-write file HTML — the primary source for the authored opacity and transform restore. */
  authoredHtml?: string;
  /** Other composition files a reset element is written in, by path; null when one could not be read. */
  nestedFiles?: Map<string, string> | null;
}

/**
 * The soft reload's finalization step, shared with the rebind-only preview sync
 * below: seek → force timeline rebind → reapply studio manual edits.
 *
 * Seek BEFORE rebind: __hfForceTimelineRebind's own internal force-render
 * (see init.ts) renders the freshly-created timeline at whatever the
 * runtime's internal scrub position already is, not at whatever we pass
 * here afterward — a redundant seek() call after rebind can be a GSAP
 * no-op if the timeline already reports being at that time internally.
 */
function finalizeSoftReload(win: IframeWindow, currentTime: number): void {
  // A seek pauses the player, so an edit made while playing resumes it once the timeline is rebuilt.
  const wasPlaying = win.__player?.isPlaying?.() === true;
  win.__player?.seek?.(currentTime);
  win.__hfForceTimelineRebind?.();
  win.__hfStudioManualEditsApply?.();
  if (wasPlaying) win.__player?.play?.();
}

/**
 * Run ONLY applySoftReload's finalization (seek → __hfForceTimelineRebind →
 * manual-edits reapply) against the live iframe — executing NO scripts and
 * touching NO script elements. `__hfForceTimelineRebind` makes the runtime
 * re-derive every clip's visibility window from the live DOM's `data-start` /
 * `data-duration` attributes (init.ts: bindRootTimelineIfAvailable +
 * syncTimedElementVisibility), so this is the flashless sync for a timing edit
 * whose attributes were already live-patched and whose GSAP scripts are
 * unchanged (`window.__timelines` still valid). Works for compositions with
 * zero GSAP scripts too — the rebind hook is installed unconditionally by the
 * runtime, independent of any animation library.
 *
 * Returns false when the iframe/runtime hook is unavailable or the run threw —
 * the caller should escalate to a full reload.
 */
export function applySoftReloadFinalization(
  iframe: HTMLIFrameElement | null,
  currentTime: number,
): boolean {
  const win = iframe?.contentWindow as IframeWindow | null;
  if (!win?.__hfForceTimelineRebind) return false;
  try {
    if (win.__hfSuppressSceneMutations) {
      win.__hfSuppressSceneMutations(() => finalizeSoftReload(win, currentTime));
    } else {
      finalizeSoftReload(win, currentTime);
    }
    return true;
  } catch {
    return false;
  }
}

const animatedBy = (doc: Document, scriptText: string): Set<Element> => {
  const animated = new Set<Element>();
  for (const { targetSelector } of parseGsapScript(scriptText).animations) {
    try {
      for (const element of doc.querySelectorAll(targetSelector)) animated.add(element);
    } catch {
      // A selector this document cannot parse animates nothing in it.
    }
  }
  return animated;
};

/** Authored style back on the elements the restored script stops animating, before a reload lands. */
export function repaintDroppedTweenStyle(
  win: IframeWindow,
  doc: Document,
  authored: Document,
  targetKeys: string[],
  restoredScript: string | null,
): void {
  const live = findGsapScriptElements(doc)
    .map((script) => script.textContent ?? "")
    .join("");
  if (live === (restoredScript ?? "")) return;
  const kept = restoredScript ? animatedBy(doc, restoredScript) : new Set<Element>();
  for (const [element, tweened] of collectResetTargets(win, doc, targetKeys)) {
    if (kept.has(element)) continue;
    const source = findAuthoredElement(authored, element);
    const style =
      source instanceof HTMLElement || source instanceof SVGElement ? source.style : null;
    restoreAuthoredStyle((element as HTMLElement).style, style, tweened);
  }
}

export function timelineKeys(scriptText: string): string[] {
  return [...scriptText.matchAll(/__timelines\s*\[\s*["'`]([^"'`]+)["'`]\s*\]/g)]
    .map((m) => m[1]!)
    .filter((key) => key !== "__proxied");
}

/** The live script elements that register one of `keys` on `window.__timelines`. */
export function scriptsRegistering(
  scripts: readonly HTMLScriptElement[],
  keys: readonly string[],
): HTMLScriptElement[] {
  return scripts.filter((script) => {
    const text = script.textContent || "";
    return keys.some(
      (key) => text.includes(`__timelines["${key}"]`) || text.includes(`__timelines['${key}']`),
    );
  });
}

// fallow-ignore-next-line complexity
export function applySoftReload(
  iframe: HTMLIFrameElement | null,
  scriptText: string,
  options: SoftReloadOptions = {},
): SoftReloadResult {
  const { onAsyncFailure, currentTimeOverride, authoredHtml } = options;
  if (!iframe || !scriptText) return "cannot-soft-reload";

  const win = iframe.contentWindow as IframeWindow | null;
  const doc = iframe.contentDocument;
  if (!win || !doc) return "cannot-soft-reload";
  if (!win.gsap || !win.__hfForceTimelineRebind) return "cannot-soft-reload";
  // Without the file an element is written in, only a full load restores it.
  if (options.nestedFiles === null) return "cannot-soft-reload";

  // Which composition(s) does this script rebuild? A soft reload re-runs ONE
  // composition's GSAP script, which re-registers its own window.__timelines[key].
  // In a multi-composition preview (top-level + inlined subcompositions) each
  // composition owns a separate timeline keyed by its id, and they're all children
  // of the global timeline — so tearing down ALL of them (or the global timeline's
  // children) and re-running a single script wipes every OTHER composition,
  // reverting its edits. Scope the teardown to the keys THIS script re-registers.
  const targetKeys = timelineKeys(scriptText);
  if (targetKeys.length === 0) return "cannot-soft-reload"; // can't scope safely → full reload
  const gsapScripts = findGsapScriptElements(doc);
  if (gsapScripts.length === 0) return "cannot-soft-reload";
  // Remove only the stale script element(s) that registered a target key; one we
  // can't match in the doc is left alone (re-running appends a fresh element).
  const staleScripts = scriptsRegistering(gsapScripts, targetKeys);
  // Multiple GSAP scripts exist but none registers a key this script owns — we
  // can't identify which element to replace (ambiguous, matching
  // extractGsapScriptText's single-script requirement). Escalate to a full reload
  // rather than killing the target timeline and appending an orphan script.
  if (gsapScripts.length > 1 && staleScripts.length === 0) return "cannot-soft-reload";

  // Prefer the caller-supplied scrub position (the studio's own authoritative
  // currentTime, e.g. usePlayerStore) over the iframe's raw `__player.getTime()`:
  // the two can desync (a keyframe-node drag parks the playhead via the store
  // BEFORE this reload's async commit resolves, and the iframe's own GSAP clock
  // doesn't reliably reflect that yet), which re-seeks the freshly rebuilt
  // timeline to the wrong frame and leaves the element (and its overlay)
  // rendered at a stale/unrelated position.
  const currentTime = currentTimeOverride ?? win.__player?.getTime?.() ?? 0;

  // Track whether the MotionPath async path was taken. When it is, the script
  // executes inside pluginScript.onload — after applySoftReload has already
  // returned. We optimistically return true because the script WILL execute
  // once the plugin loads; the alternative (returning false) would trigger a
  // full iframe reload that destroys the very WebGL context we're preserving.
  let deferredToAsync = false;
  let builtDom = false;

  // Authored-opacity resolution for the restore loop below. Three-state:
  //   "0.98" — the element's authored inline opacity
  //   ""     — resolved, and the element has NO authored inline opacity
  //   null   — unknown (no authored HTML supplied, element not found in it,
  //            and no runtime parse-time stamp)
  // The just-written file (`authoredHtml`) is the current truth; the runtime's
  // parse-time stamp (data-hf-authored-opacity, installAuthoredOpacityCapture)
  // covers elements the file lookup can't resolve. Parsed lazily, at most once.
  const docFor = fileDocs(compositionFile(doc, targetKeys), authoredHtml, options.nestedFiles);
  const findAuthoredStyle = (el: HTMLElement): CSSStyleDeclaration | null => {
    const fileDoc = docFor(authoringFile(el));
    const source = fileDoc ? findAuthoredElement(fileDoc, el) : null;
    // The parsed file lives in this realm, so instanceof holds here, unlike for the iframe nodes below.
    return source instanceof HTMLElement || source instanceof SVGElement ? source.style : null;
  };
  const readAuthoredOpacity = (el: HTMLElement): string | null =>
    findAuthoredStyle(el)?.opacity ?? readStampedAuthoredOpacity(el);

  // fallow-ignore-next-line complexity
  const doReload = () => {
    const timelines = win.__timelines;
    const targets = collectResetTargets(
      win,
      doc,
      targetKeys,
      staleScripts.map((script) => script.textContent ?? ""),
    );

    // Kill ONLY the target composition's timeline(s) — leaving every other
    // composition's timeline (and its children on the global timeline) intact.
    if (timelines) {
      for (const key of targetKeys) {
        const tl = timelines[key] as { kill?: () => void; clear?: () => void } | undefined;
        if (!tl) continue;
        try {
          // kill() keeps the children, and the finalize seek renders this timeline until the rebind swaps it.
          tl.clear?.();
          tl.kill?.();
        } catch {}
        delete timelines[key];
      }
    }

    // Reset GSAP's internal transform cache so from() tweens don't read stale
    // end values. `clearProps: "all"` is needed to flush the cache, but it also
    // nukes the element's CSS base (position, width, height, etc.) from the
    // HTML `style=""` attribute. Save → clear → restore → what GSAP wrote, from the file.
    const allTargets = [...targets.keys()];
    if (allTargets.length > 0 && win.gsap?.set) {
      // Iframe-realm nodes: instanceof HTMLElement fails across realms, so style access is duck-typed.
      const saved = allTargets.map(
        (el) => [el as HTMLElement, (el as HTMLElement).style.cssText] as const,
      );
      win.gsap.set(allTargets, { clearProps: "all" });
      for (const [el, css] of saved) {
        const s = el.style;
        s.cssText = css;
        restoreAuthoredStyle(s, findAuthoredStyle(el), targets.get(el)!);
        // The restored cssText carries RUNTIME opacity, not authored opacity:
        // a mid-flight tween's interpolated value, or the color-grading hide
        // (`opacity: 0 !important`). The re-run script's tweens re-initialize
        // against it — a from() captures it as its END, a to() as its START —
        // turning the transient into the tween's permanent bound (dimmed or
        // invisible elements). Put the AUTHORED inline opacity back; the seek
        // below re-renders the correct animated value either way.
        const authored = readAuthoredOpacity(el);
        if (authored !== null) {
          applyAuthoredInlineOpacity(s, authored);
        } else if (
          el.hasAttribute(COLOR_GRADING_SOURCE_HIDDEN_ATTR) &&
          s.getPropertyValue("opacity") === "0" &&
          s.getPropertyPriority("opacity") === "important"
        ) {
          // Authored value unknown, but this is definitely the grading hide —
          // never let a from() capture 0; fall back to the CSS cascade.
          s.removeProperty("opacity");
        }
      }
    }
    forgetLiveSets(targets);

    for (const script of staleScripts) script.remove();

    const executeScript = () => {
      if (win.MotionPathPlugin && win.gsap?.registerPlugin) {
        win.gsap.registerPlugin(win.MotionPathPlugin);
      }
      const s = doc.createElement("script");
      s.textContent = `(function(){${scriptText}\n})();`;
      const ownScriptNode = 1;
      const before = doc.body.querySelectorAll("*").length + ownScriptNode;
      doc.body.appendChild(s);
      // A script that builds DOM builds it again on every run; only a full load starts from the file.
      // Not seen: text-only writes, nodes put in the head or a shadow root, nodes added
      // later, and a builder that removes its old nodes first (which needs no full load).
      builtDom = doc.body.querySelectorAll("*").length > before;
      if (builtDom && deferredToAsync) onAsyncFailure?.();
      finalizeSoftReload(win, currentTime);
    };

    const needsMotionPath = /motionPath\s*[:{]/.test(scriptText);
    if (needsMotionPath && !win.MotionPathPlugin && win.gsap) {
      deferredToAsync = true;
      // A prior soft reload is already fetching the plugin — don't queue a second
      // <script> (it re-flashes the iframe). Defer THIS script's execution until
      // the in-flight load settles via a one-shot poll. The bootstrap guard is
      // the single source of truth for "plugin fetch in progress".
      if (win.__hfMotionPathPluginLoading) {
        const started = Date.now();
        const poll = win.setInterval(() => {
          if (win.MotionPathPlugin) {
            win.clearInterval(poll);
            executeScript();
          } else if (!win.__hfMotionPathPluginLoading || Date.now() - started > 10000) {
            // The in-flight load finished without registering the plugin (errored)
            // or we timed out — recover with a full reload instead of running a
            // script that references a missing plugin.
            win.clearInterval(poll);
            onAsyncFailure?.();
          }
        }, 50);
        return;
      }
      win.__hfMotionPathPluginLoading = true;
      const pluginScript = doc.createElement("script");
      pluginScript.src = previewMotionPathUrl(doc, win.gsap?.version);
      pluginScript.onload = () => {
        win.__hfMotionPathPluginLoading = false;
        executeScript();
      };
      pluginScript.onerror = () => {
        // The plugin failed to load. Running executeScript() now would leave the
        // iframe with a motionPath tween referencing a missing plugin while the
        // caller already thinks the soft reload succeeded. Signal failure so the
        // caller can full-reload (which fetches the plugin fresh) instead.
        win.__hfMotionPathPluginLoading = false;
        onAsyncFailure?.();
      };
      doc.head.appendChild(pluginScript);
      return;
    }

    executeScript();
  };

  const run = () => runSuppressed(win, doReload);
  // The synchronous re-run threw or built DOM a second time: the preview is now
  // genuinely broken (no timeline, or duplicated nodes). Escalate to a full reload.
  if (!run() || builtDom) return "cannot-soft-reload";
  // When MotionPath needs async loading, the script hasn't executed yet —
  // skip the __timelines check and report success optimistically (the script
  // WILL run on plugin load; onAsyncFailure covers the CDN-error case).
  if (deferredToAsync) return "applied";
  // The re-run executed. If the target keys read back, we're done; otherwise
  // it's the TRANSIENT empty-timeline window (live state is correct) — surfaced
  // as "verify-failed" so callers know NOT to escalate.
  return verifyTimelinesPopulated(win, targetKeys) ? "applied" : "verify-failed";
}

/** Other composition files for a soft reload: undefined when none are needed, null when a read failed. */
export type NestedFiles = Map<string, string> | null | undefined;

export async function settleNestedReads(
  reads: Promise<Map<string, string>> | null,
): Promise<NestedFiles> {
  return reads ? reads.catch(() => null) : undefined;
}

/**
 * Reads the composition files, other than the reloaded one, that the elements `scriptText`'s
 * re-run resets are written in; null when there are none. Read them before the soft reload.
 */
export function readNestedFiles(
  iframe: HTMLIFrameElement | null,
  scriptText: string,
  readFile: (path: string) => Promise<string>,
): Promise<Map<string, string>> | null {
  const win = iframe?.contentWindow as IframeWindow | null;
  const doc = iframe?.contentDocument;
  if (!win || !doc) return null;
  const keys = timelineKeys(scriptText);
  const own = compositionFile(doc, keys);
  const files = [...collectResetTargets(win, doc, keys).keys()].map(authoringFile);
  const paths = [...new Set(files)].filter((file): file is string => file !== null && file !== own);
  if (paths.length === 0) return null;
  return Promise.all(paths.map((path) => readFile(path))).then(
    (texts) => new Map(paths.map((path, i) => [path, texts[i]!])),
  );
}
