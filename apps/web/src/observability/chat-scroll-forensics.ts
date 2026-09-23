/**
 * A whole-scene capture of the chat scroller, taken on demand and shipped
 * inside the diagnostics zip.
 *
 * Why this exists
 * ---------------
 * The chat log occasionally stops scrolling: the compositor's maximum scroll
 * offset stops following layout, so the wheel cannot reach content that
 * `scrollHeight - clientHeight` says is there. We cannot reproduce it. Several
 * colleagues can, repeatedly, and the state is PERSISTENT — it survives as long
 * as the page is not reloaded and the chat surface is not unmounted.
 *
 * `window.__chatScrollFreeze` already answers "why has the probe not reported",
 * but it is a console handle: it needs DevTools, and it dies with the window.
 * What was missing is a path a non-engineer can run and hand us a file.
 *
 * So this module turns the live renderer into a file. It is deliberately
 * maximal — the user's ruling was "privacy does not matter here, colleagues are
 * competing to send data" — so it carries the chat log's full `outerHTML`, every
 * compositing-relevant computed style on the ancestor chain and on every direct
 * child, the complete animation list, and the probe's own snapshot.
 *
 * The one measurement that decides the case
 * -----------------------------------------
 * Everything else describes the scene. `assignment` is the only field that
 * SEPARATES the two candidate explanations:
 *
 *   - assign `scrollTop = layoutMax` and read it back as `layoutMax`
 *     => layout really does have the room, and JS can reach it. The wheel /
 *        compositor path is the broken half.
 *   - assign it and read back something smaller
 *     => the scroller itself refuses the position; layout and the scroll box
 *        disagree, and the ceiling is real.
 *
 * That write MOVES THE USER'S VIEW, which is why it runs last, restores the
 * previous position in a `finally`, and stamps a warning into the payload so
 * nobody later reads the restored position as "the scroller was fine".
 */

import {
  MIN_UNREACHABLE_PX,
  type ScrollGeometry,
} from './chat-scroll-freeze-detector';
import {
  subscribeChatScrollFreeze,
  type ChatScrollFreezeHandle,
  type ChatScrollFreezeSignal,
  type ChatScrollFreezeSnapshot,
} from './chat-scroll-freeze';
import {
  listScrollWrites,
  isScrollWriteTraceArmed,
  type ScrollWriteRecord,
} from './chat-scroll-write-trace';
import {
  CHAT_SCROLL_TAKEOVER_STORAGE_KEY,
  chatScrollTakeoverEngaged,
} from '../runtime/chat-scroll-takeover';

/**
 * Where the daemon receives the capture.
 *
 * Inlined rather than imported from `@open-design/diagnostics`, matching the
 * existing precedent in `ExportDiagnosticsButton.tsx` for
 * `/api/diagnostics/export`: `apps/web` does not depend on that package, and
 * adding the dependency for one string would drag a Node-side package into the
 * browser bundle graph. The daemon side owns the canonical constant in
 * `apps/daemon/src/diagnostics-client-evidence.ts`.
 */
export const CHAT_SCROLL_FORENSICS_PATH = '/api/diagnostics/chat-scroll-forensics';

/**
 * Same element the freeze probe attaches to. Kept as its own constant because
 * the probe's copy is module-private, and a capture that silently looked at a
 * DIFFERENT element than the probe would be worse than no capture.
 */
export const CHAT_LOG_SELECTORS = ['[data-testid="chat-log"]', '.chat-log'] as const;

/** Ancestors walked upward from the scroller. */
const MAX_ANCESTORS = 24;
/** Direct children described. A long transcript has hundreds; that is fine. */
const MAX_CHILDREN = 600;
/** Animations listed from `document.getAnimations()`. */
const MAX_ANIMATIONS = 400;
/**
 * Ceiling on the serialized chat log. A very long transcript can run to tens of
 * megabytes; past this the tail stops adding evidence and starts costing the
 * colleague an upload.
 */
const MAX_DOM_BYTES = 8 * 1024 * 1024;
/** How long a freeze-time capture stays worth sending. */
export const RETENTION_TTL_MS = 30 * 60 * 1000;

/** Computed properties read on every node in the composition summary. */
const COMPOSITION_PROPERTIES = [
  'display',
  'position',
  'overflow-x',
  'overflow-y',
  'transform',
  'filter',
  'backdrop-filter',
  'contain',
  'will-change',
  'content-visibility',
  'isolation',
  'z-index',
  'opacity',
  'height',
  'max-height',
  'min-height',
  'flex',
  'grid-template-rows',
] as const;

export const ASSIGNMENT_PROBE_WARNING =
  'This capture deliberately assigned scrollTop = layoutMax on the chat log to '
  + 'read the value back, then restored the previous position. See `assignment`. '
  + 'A restored scrollTop is NOT evidence that scrolling worked.';

export interface ChatScrollForensicsRuntime {
  href: string | null;
  protocol: string | null;
  /** `od:` means the packaged Electron shell rather than a browser tab. */
  packaged: boolean;
  userAgent: string | null;
  chromiumVersion: string | null;
  electronVersion: string | null;
  platform: string | null;
  language: string | null;
  timezone: string | null;
  devicePixelRatio: number | null;
  window: { innerWidth: number; innerHeight: number; outerWidth: number; outerHeight: number } | null;
  screen: { width: number; height: number; availWidth: number; availHeight: number } | null;
  visualViewport: { width: number; height: number; scale: number; offsetTop: number } | null;
  /**
   * Raw zoom inputs rather than a derived "zoom level": the renderer cannot see
   * Electron's zoom factor directly, so a single number here would be a guess.
   */
  zoomInputs: {
    devicePixelRatio: number | null;
    visualViewportScale: number | null;
    innerOverOuterWidth: number | null;
  };
  /**
   * The renderer has no build sha: nothing in `apps/web` is stamped with one.
   * The daemon writes app version / channel / packaged into the same zip
   * (`summary/manifest.json` and this file's `app` block), which is the
   * authoritative source — recorded here so a reader is not left wondering
   * whether the field was dropped.
   */
  commit: null;
  commitNote: string;
  /**
   * The wheel-takeover switch, as this machine actually had it.
   *
   * Without this a reader cannot rule out the one local setting that changes
   * how the chat log scrolls, and "was the takeover on?" is unanswerable after
   * the fact — the switch lives in the colleague's `localStorage`, not in
   * anything the bundle otherwise carries.
   *
   * Read, never inferred: `rawValue` is whatever the key held, verbatim, and
   * `readable: false` says the storage itself could not be reached (private
   * mode, a blocked origin, a packaged `od:` page with storage disabled) rather
   * than pretending that means "off".
   */
  chatScrollTakeover: ChatScrollForensicsTakeover;
}

export interface ChatScrollForensicsTakeover {
  storageKey: string;
  /** Whether `localStorage` answered at all. */
  readable: boolean;
  /** The stored string, verbatim; `null` when the key is absent. */
  rawValue: string | null;
  /**
   * Whether a scroller is being driven from JavaScript at capture time. Not
   * derivable from `rawValue`: the switch is read once at install, so a value
   * set after boot has not taken effect, and the takeover only engages once the
   * freeze probe has actually called a freeze.
   */
  engaged: boolean;
  note: string;
}

export interface CompositionNode {
  role: 'ancestor' | 'scroller' | 'child';
  /** Ancestors count upward from the scroller (1 = parent); children are 0. */
  depth: number;
  /** Position among the scroller's direct children, or null. */
  childIndex: number | null;
  tag: string;
  id: string | null;
  className: string;
  testId: string | null;
  /** The opening tag with its attributes, for elements whose HTML is not dumped. */
  openTag: string;
  style: Record<string, string>;
  offsetTop: number | null;
  offsetHeight: number | null;
  offsetWidth: number | null;
  scrollTop: number | null;
  scrollHeight: number | null;
  clientHeight: number | null;
  rect: { top: number; left: number; width: number; height: number } | null;
  /**
   * Running animations ON THIS ELEMENT. `null` means the engine has no
   * `Element.getAnimations` (jsdom, older Safari) — absent, not zero.
   */
  runningAnimations: number | null;
  animationNames: string[];
}

export interface ChatScrollForensicsGeometry extends ScrollGeometry {
  offsetHeight: number;
  /** `scrollHeight - clientHeight` — the ceiling layout would permit. */
  layoutMax: number;
  /** …minus where the scroller is. What the wheel cannot reach. */
  unreachablePx: number;
  /** Whether that gap is past the probe's own reporting threshold. */
  pastFreezeThreshold: boolean;
}

export type ChatScrollForensicsScroller =
  | {
      found: true;
      matchedSelector: string;
      connected: boolean;
      childCount: number;
      messageRowCount: number;
      geometry: ChatScrollForensicsGeometry;
      rect: { top: number; left: number; width: number; height: number } | null;
    }
  | {
      found: false;
      selectorsTried: string[];
      note: string;
    };

export type ChatScrollForensicsProbe =
  | {
      available: true;
      handleVersion: number;
      attached: boolean;
      note: string;
      snapshot: ChatScrollFreezeSnapshot;
    }
  | {
      available: false;
      reason: 'no_global' | 'handle_missing' | 'handle_threw';
      note: string;
      detail: string | null;
    };

export interface ChatScrollForensicsDom {
  captured: boolean;
  reason: string | null;
  matchedSelector: string | null;
  byteLength: number;
  truncated: boolean;
  outerHTML: string | null;
}

export interface ChatScrollForensicsAnimations {
  supported: boolean;
  note: string | null;
  total: number;
  truncated: boolean;
  entries: Array<{
    id: string;
    playState: string;
    /** `null` when the animation is not yet running or the value is CSS-time. */
    currentTimeMs: number | null;
    startTimeMs: number | null;
    /** `animation-name` / `transition-property`, when the effect exposes one. */
    name: string | null;
    durationMs: number | null;
    iterations: number | null;
    target: string | null;
  }>;
}

export type ChatScrollForensicsAssignment =
  | {
      performed: false;
      reason: 'no_scroller' | 'element_detached' | 'threw';
      detail: string | null;
      note: string;
    }
  | {
      performed: true;
      /** Always true — kept explicit so nobody has to infer it from `performed`. */
      movedUserView: true;
      note: string;
      before: number;
      requested: number;
      readBack: number;
      /** Read back within a pixel of what was asked for. */
      landed: boolean;
      restoredTo: number;
      restoredExactly: boolean;
      /**
       * `no_room` — layout itself offers nothing below the current position.
       * `assignment_reached_layout_max` — JS CAN reach the bottom, so whatever
       *   is refusing the wheel is not layout. This is the compositor case.
       * `assignment_clamped` — the scroll box refuses the position outright.
       */
      verdict: 'no_room' | 'assignment_reached_layout_max' | 'assignment_clamped';
    };

export interface ChatScrollForensicsWrites {
  armed: boolean;
  count: number;
  note: string;
  records: ScrollWriteRecord[];
}

export interface ChatScrollForensics {
  version: 1;
  capturedAtIso: string;
  /**
   * Milliseconds from the start of the capture to the end of each section.
   * This is ordering evidence, not performance data: `assignment` must be the
   * largest, because the only step that mutates the page has to run after every
   * step that observes it.
   */
  timeline: Record<
    'probe' | 'runtime' | 'scroller' | 'composition' | 'dom' | 'animations' | 'assignment' | 'writes',
    number
  >;
  warnings: string[];
  probe: ChatScrollForensicsProbe;
  runtime: ChatScrollForensicsRuntime;
  scroller: ChatScrollForensicsScroller;
  composition: CompositionNode[];
  compositionTruncated: boolean;
  dom: ChatScrollForensicsDom;
  animations: ChatScrollForensicsAnimations;
  assignment: ChatScrollForensicsAssignment;
  writes: ChatScrollForensicsWrites;
}

export interface ChatScrollForensicsEnvelope {
  version: 1;
  capturedAtIso: string;
  /** Taken now, from a chat log that is still on screen. */
  live: {
    available: boolean;
    reason: string | null;
    forensics: ChatScrollForensics | null;
  };
  /**
   * Taken at the moment the freeze probe first called a freeze, kept in
   * renderer memory since. Survives navigating to Settings to reach the export
   * button; does NOT survive a reload.
   */
  retained: {
    available: boolean;
    capturedAtIso: string | null;
    ageMs: number | null;
    forensics: ChatScrollForensics | null;
  };
  note: string;
}

// ---------------------------------------------------------------------------
// Element lookup
// ---------------------------------------------------------------------------

interface FoundScroller {
  element: HTMLElement;
  matchedSelector: string;
}

export function findChatLogElement(): FoundScroller | null {
  if (typeof document === 'undefined') return null;
  for (const selector of CHAT_LOG_SELECTORS) {
    try {
      const el = document.querySelector(selector);
      if (el instanceof HTMLElement) return { element: el, matchedSelector: selector };
    } catch {
      // A malformed selector cannot happen here, but a capture must never be
      // the thing that throws.
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

interface ProbeGlobals {
  __chatScrollFreeze?: ChatScrollFreezeHandle;
}

const PROBE_MISSING_NOTE =
  'The chat-scroll freeze probe did NOT publish its runtime handle in this '
  + 'renderer. Either observability failed to install, or this build predates '
  + 'the handle. Everything below was collected without it — the probe ledger, '
  + 'the gate table and the parallel-activity trail are simply absent.';

const PROBE_DETACHED_NOTE =
  'The probe is installed but has NOT attached to a chat log. It attaches from '
  + 'the first scroll event that comes out of the log, so a surface that was '
  + 'never scrolled — or was remounted since — reads as detached. Its ledger '
  + 'and activity trail are empty for that reason, not because nothing happened.';

const PROBE_ATTACHED_NOTE = 'Probe attached; snapshot is the probe\'s own full state.';

export function collectProbeSection(): ChatScrollForensicsProbe {
  if (typeof globalThis === 'undefined') {
    return { available: false, reason: 'no_global', note: PROBE_MISSING_NOTE, detail: null };
  }
  const handle = (globalThis as unknown as ProbeGlobals).__chatScrollFreeze;
  if (handle == null || typeof handle.snapshot !== 'function') {
    return { available: false, reason: 'handle_missing', note: PROBE_MISSING_NOTE, detail: null };
  }
  try {
    const snapshot = handle.snapshot();
    return {
      available: true,
      handleVersion: handle.version,
      attached: snapshot.attached,
      note: snapshot.attached ? PROBE_ATTACHED_NOTE : PROBE_DETACHED_NOTE,
      snapshot,
    };
  } catch (error) {
    return {
      available: false,
      reason: 'handle_threw',
      note: PROBE_MISSING_NOTE,
      detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const TAKEOVER_UNREADABLE_NOTE =
  'localStorage could not be read, so whether the wheel takeover was switched on '
  + 'is UNKNOWN for this capture — not "off".';

/**
 * The takeover switch as read, with no interpretation layered on top.
 *
 * Deliberately not `chatScrollTakeoverFlagSet()`: that collapses "absent",
 * "set to something other than 1" and "storage threw" into one `false`, and
 * those are three different things to a reader trying to explain a scene.
 */
export function collectTakeoverSection(): ChatScrollForensicsTakeover {
  let readable = false;
  let rawValue: string | null = null;
  try {
    const storage = globalThis.localStorage;
    if (storage != null) {
      rawValue = storage.getItem(CHAT_SCROLL_TAKEOVER_STORAGE_KEY);
      readable = true;
    }
  } catch {
    readable = false;
    rawValue = null;
  }
  let engaged = false;
  try {
    engaged = chatScrollTakeoverEngaged();
  } catch {
    engaged = false;
  }
  return {
    storageKey: CHAT_SCROLL_TAKEOVER_STORAGE_KEY,
    readable,
    rawValue,
    engaged,
    note: readable
      ? "Raw localStorage value of the wheel-takeover switch; only '1' arms it, and it "
        + 'is read once at boot. `engaged` is whether a scroller was actually being '
        + 'driven from JavaScript when this capture ran.'
      : TAKEOVER_UNREADABLE_NOTE,
  };
}

export function collectRuntimeSection(): ChatScrollForensicsRuntime {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null;
  const chromium = ua != null ? /Chrome\/([\d.]+)/.exec(ua)?.[1] ?? null : null;
  const electron = ua != null ? /Electron\/([\d.]+)/.exec(ua)?.[1] ?? null : null;
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : null;
  const win = typeof window !== 'undefined' ? window : null;
  const vv = (win as unknown as { visualViewport?: VisualViewport | null } | null)?.visualViewport ?? null;
  const innerWidth = numberOrNull(win?.innerWidth);
  const outerWidth = numberOrNull(win?.outerWidth);
  let timezone: string | null = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    timezone = null;
  }
  return {
    href: typeof location !== 'undefined' ? location.href : null,
    protocol: typeof location !== 'undefined' ? location.protocol : null,
    packaged: typeof location !== 'undefined' && location.protocol === 'od:',
    userAgent: ua,
    chromiumVersion: chromium,
    electronVersion: electron,
    platform: typeof navigator !== 'undefined' ? navigator.platform ?? null : null,
    language: typeof navigator !== 'undefined' ? navigator.language ?? null : null,
    timezone,
    devicePixelRatio: dpr,
    window: win == null
      ? null
      : {
          innerWidth: win.innerWidth,
          innerHeight: win.innerHeight,
          outerWidth: win.outerWidth,
          outerHeight: win.outerHeight,
        },
    screen: typeof screen === 'undefined' || screen == null
      ? null
      : {
          width: screen.width,
          height: screen.height,
          availWidth: screen.availWidth,
          availHeight: screen.availHeight,
        },
    visualViewport: vv == null
      ? null
      : {
          width: vv.width,
          height: vv.height,
          scale: vv.scale,
          offsetTop: vv.offsetTop,
        },
    zoomInputs: {
      devicePixelRatio: dpr,
      visualViewportScale: numberOrNull(vv?.scale),
      innerOverOuterWidth:
        innerWidth != null && outerWidth != null && outerWidth > 0
          ? innerWidth / outerWidth
          : null,
    },
    commit: null,
    commitNote:
      'apps/web carries no build sha; app version/channel live in the daemon-written '
      + '`app` block of this file and in summary/manifest.json of the same zip.',
    chatScrollTakeover: collectTakeoverSection(),
  };
}

const SCROLLER_MISSING_NOTE =
  'No chat log was in the DOM when this capture ran. The freeze dies with the '
  + 'element, so a capture taken after leaving the chat cannot see it — check '
  + '`retained` in the envelope for a capture taken at freeze time instead.';

export function collectScrollerSection(found: FoundScroller | null): ChatScrollForensicsScroller {
  if (found == null) {
    return {
      found: false,
      selectorsTried: [...CHAT_LOG_SELECTORS],
      note: SCROLLER_MISSING_NOTE,
    };
  }
  const el = found.element;
  const scrollTop = el.scrollTop;
  const scrollHeight = el.scrollHeight;
  const clientHeight = el.clientHeight;
  const layoutMax = Math.max(0, scrollHeight - clientHeight);
  let messageRowCount = 0;
  try {
    messageRowCount = el.querySelectorAll('[data-testid="chat-message"], .msg, .chat-msg').length;
  } catch {
    messageRowCount = 0;
  }
  return {
    found: true,
    matchedSelector: found.matchedSelector,
    connected: el.isConnected,
    childCount: el.children.length,
    messageRowCount,
    geometry: {
      scrollTop,
      scrollHeight,
      clientHeight,
      offsetHeight: el.offsetHeight,
      layoutMax,
      unreachablePx: layoutMax - scrollTop,
      pastFreezeThreshold: layoutMax - scrollTop >= MIN_UNREACHABLE_PX,
    },
    rect: readRect(el),
  };
}

function readRect(el: HTMLElement): { top: number; left: number; width: number; height: number } | null {
  try {
    const rect = el.getBoundingClientRect();
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  } catch {
    return null;
  }
}

function openTagOf(el: Element): string {
  try {
    const attrs = Array.from(el.attributes)
      .map((attr) => ` ${attr.name}="${attr.value.replace(/"/g, '&quot;')}"`)
      .join('');
    return `<${el.tagName.toLowerCase()}${attrs}>`;
  } catch {
    return `<${el.tagName?.toLowerCase() ?? 'unknown'}>`;
  }
}

function readComputedStyle(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const style = getComputedStyle(el);
    for (const property of COMPOSITION_PROPERTIES) {
      out[property] = style.getPropertyValue(property);
    }
  } catch {
    // A detached element or a stubbed engine: an empty style block is honest.
  }
  return out;
}

function readElementAnimations(el: Element): { count: number | null; names: string[] } {
  const getAnimations = (el as Element & { getAnimations?: () => Animation[] }).getAnimations;
  if (typeof getAnimations !== 'function') return { count: null, names: [] };
  try {
    const running = getAnimations.call(el).filter((animation) => animation.playState === 'running');
    return { count: running.length, names: running.map(animationName).filter((n): n is string => n != null) };
  } catch {
    return { count: null, names: [] };
  }
}

function animationName(animation: Animation): string | null {
  const effect = animation.effect as (KeyframeEffect & { getTiming?: () => unknown }) | null;
  const asRecord = effect as unknown as Record<string, unknown> | null;
  const cssName = asRecord?.['animationName'] ?? asRecord?.['transitionProperty'];
  if (typeof cssName === 'string' && cssName.length > 0) return cssName;
  if (typeof animation.id === 'string' && animation.id.length > 0) return animation.id;
  return null;
}

function describeNode(
  el: Element,
  role: CompositionNode['role'],
  depth: number,
  childIndex: number | null,
): CompositionNode {
  const asHtml = el instanceof HTMLElement ? el : null;
  const animations = readElementAnimations(el);
  return {
    role,
    depth,
    childIndex,
    tag: el.tagName.toLowerCase(),
    id: el.getAttribute('id'),
    className: el.getAttribute('class') ?? '',
    testId: el.getAttribute('data-testid'),
    openTag: openTagOf(el),
    style: readComputedStyle(el),
    offsetTop: asHtml != null ? asHtml.offsetTop : null,
    offsetHeight: asHtml != null ? asHtml.offsetHeight : null,
    offsetWidth: asHtml != null ? asHtml.offsetWidth : null,
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    rect: asHtml != null ? readRect(asHtml) : null,
    runningAnimations: animations.count,
    animationNames: animations.names,
  };
}

/**
 * The scroller, everything above it, and everything directly inside it.
 *
 * Ancestors matter because a `transform`, `filter`, `contain` or
 * `content-visibility` anywhere up the chain changes which box the compositor
 * scrolls. Direct children matter because the content height is their sum, and
 * one child whose `offsetTop + offsetHeight` runs past the scroller's
 * `scrollHeight` is a layout/paint disagreement in plain sight.
 */
export function collectComposition(found: FoundScroller | null): {
  nodes: CompositionNode[];
  truncated: boolean;
} {
  if (found == null) return { nodes: [], truncated: false };
  const nodes: CompositionNode[] = [];
  let truncated = false;
  try {
    const ancestors: Element[] = [];
    let cursor: Element | null = found.element.parentElement;
    while (cursor != null && ancestors.length < MAX_ANCESTORS) {
      ancestors.push(cursor);
      cursor = cursor.parentElement;
    }
    // Outermost first, so the list reads top-down like the DOM does.
    for (let i = ancestors.length - 1; i >= 0; i -= 1) {
      const ancestor = ancestors[i];
      if (ancestor == null) continue;
      nodes.push(describeNode(ancestor, 'ancestor', i + 1, null));
    }
    nodes.push(describeNode(found.element, 'scroller', 0, null));
    const children = found.element.children;
    const limit = Math.min(children.length, MAX_CHILDREN);
    truncated = children.length > limit;
    for (let i = 0; i < limit; i += 1) {
      const child = children.item(i);
      if (child == null) continue;
      nodes.push(describeNode(child, 'child', 0, i));
    }
  } catch {
    // Partial composition beats none.
  }
  return { nodes, truncated };
}

export function collectDomSection(found: FoundScroller | null): ChatScrollForensicsDom {
  if (found == null) {
    return {
      captured: false,
      reason: 'chat_log_not_found',
      matchedSelector: null,
      byteLength: 0,
      truncated: false,
      outerHTML: null,
    };
  }
  try {
    const html = found.element.outerHTML;
    const truncated = html.length > MAX_DOM_BYTES;
    return {
      captured: true,
      reason: null,
      matchedSelector: found.matchedSelector,
      byteLength: html.length,
      truncated,
      outerHTML: truncated ? html.slice(0, MAX_DOM_BYTES) : html,
    };
  } catch (error) {
    return {
      captured: false,
      reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      matchedSelector: found.matchedSelector,
      byteLength: 0,
      truncated: false,
      outerHTML: null,
    };
  }
}

export function collectAnimations(): ChatScrollForensicsAnimations {
  const doc = typeof document !== 'undefined'
    ? (document as Document & { getAnimations?: () => Animation[] })
    : null;
  if (doc == null || typeof doc.getAnimations !== 'function') {
    return {
      supported: false,
      note: 'document.getAnimations() is unavailable in this engine; running animations could not be enumerated.',
      total: 0,
      truncated: false,
      entries: [],
    };
  }
  try {
    const all = doc.getAnimations();
    const limit = Math.min(all.length, MAX_ANIMATIONS);
    const entries: ChatScrollForensicsAnimations['entries'] = [];
    for (let i = 0; i < limit; i += 1) {
      const animation = all[i];
      if (animation == null) continue;
      const effect = animation.effect;
      let durationMs: number | null = null;
      let iterations: number | null = null;
      let target: string | null = null;
      try {
        const timing = effect?.getTiming();
        durationMs = typeof timing?.duration === 'number' ? timing.duration : null;
        iterations = typeof timing?.iterations === 'number' ? timing.iterations : null;
        const keyframeTarget = (effect as KeyframeEffect | null)?.target ?? null;
        target = keyframeTarget != null ? openTagOf(keyframeTarget) : null;
      } catch {
        // best-effort
      }
      entries.push({
        id: animation.id,
        playState: animation.playState,
        currentTimeMs: numberOrNull(animation.currentTime),
        startTimeMs: numberOrNull(animation.startTime),
        name: animationName(animation),
        durationMs,
        iterations,
        target,
      });
    }
    return {
      supported: true,
      note: null,
      total: all.length,
      truncated: all.length > limit,
      entries,
    };
  } catch (error) {
    return {
      supported: false,
      note: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      total: 0,
      truncated: false,
      entries: [],
    };
  }
}

const ASSIGNMENT_NOTE =
  'scrollTop was set to layoutMax, read back, and then restored to `before`. '
  + 'Compare `readBack` against `requested`: equal means JS can reach the bottom '
  + 'and the wheel/compositor path is the broken half; smaller means the scroll '
  + 'box itself refuses the position.';

/**
 * The only step that WRITES. Runs last, restores in a `finally`.
 *
 * Restoration is not politeness: the capture is taken while a colleague is
 * looking at a stuck transcript, and leaving them scrolled to the bottom would
 * both destroy their place and make the very state we are documenting harder
 * to describe on a follow-up call.
 */
export function runAssignmentProbe(found: FoundScroller | null): ChatScrollForensicsAssignment {
  if (found == null) {
    return {
      performed: false,
      reason: 'no_scroller',
      detail: null,
      note: 'No chat log to write to, so the decisive measurement is missing from this capture.',
    };
  }
  const el = found.element;
  if (!el.isConnected) {
    return {
      performed: false,
      reason: 'element_detached',
      detail: null,
      note: 'The chat log is no longer in the document; writing to a detached element measures nothing.',
    };
  }
  const before = el.scrollTop;
  try {
    const requested = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = requested;
    const readBack = el.scrollTop;
    const landed = Math.abs(readBack - requested) <= 1;
    const verdict: 'no_room' | 'assignment_reached_layout_max' | 'assignment_clamped' =
      requested <= 0 ? 'no_room' : landed ? 'assignment_reached_layout_max' : 'assignment_clamped';
    // Restore before reading the restored value, so `restoredTo` reports what
    // the element actually settled on rather than what we asked for.
    el.scrollTop = before;
    const restoredTo = el.scrollTop;
    return {
      performed: true,
      movedUserView: true,
      note: ASSIGNMENT_NOTE,
      before,
      requested,
      readBack,
      landed,
      restoredTo,
      restoredExactly: Math.abs(restoredTo - before) <= 1,
      verdict,
    };
  } catch (error) {
    return {
      performed: false,
      reason: 'threw',
      detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      note: 'The assignment probe threw; the scroll position was restored anyway.',
    };
  } finally {
    // Belt and braces: if anything above threw between the write and the
    // restore, the user must not be left moved.
    try {
      if (el.scrollTop !== before) el.scrollTop = before;
    } catch {
      // nothing further we can do
    }
  }
}

export function collectWrites(): ChatScrollForensicsWrites {
  let armed = false;
  let records: ScrollWriteRecord[] = [];
  try {
    armed = isScrollWriteTraceArmed();
    records = listScrollWrites();
  } catch {
    armed = false;
    records = [];
  }
  return {
    armed,
    count: records.length,
    note: armed
      ? 'scrollTop write interception was armed; every programmatic write below was recorded with its stack.'
      : 'scrollTop write interception was OFF (it is opt-in via __chatScrollFreeze.writes.enable()), '
        + 'so "our own code put the scroller back" cannot be ruled in or out from this capture.',
    records,
  };
}

// ---------------------------------------------------------------------------
// The capture
// ---------------------------------------------------------------------------

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * One full scene, in a fixed order: observe everything, then — and only then —
 * perform the one measurement that mutates the page.
 */
export function collectChatScrollForensics(): ChatScrollForensics {
  const startedAt = nowMs();
  const since = () => Math.round(nowMs() - startedAt);
  const capturedAtIso = new Date().toISOString();
  const found = findChatLogElement();

  const probe = collectProbeSection();
  const probeAt = since();
  const runtime = collectRuntimeSection();
  const runtimeAt = since();
  const scroller = collectScrollerSection(found);
  const scrollerAt = since();
  const composition = collectComposition(found);
  const compositionAt = since();
  const dom = collectDomSection(found);
  const domAt = since();
  const animations = collectAnimations();
  const animationsAt = since();
  // LAST. Everything above observes; this one writes.
  const assignment = runAssignmentProbe(found);
  const assignmentAt = since();
  const writes = collectWrites();
  const writesAt = since();

  const warnings: string[] = [];
  if (assignment.performed) warnings.push(ASSIGNMENT_PROBE_WARNING);
  if (!probe.available) warnings.push(probe.note);
  else if (!probe.attached) warnings.push(probe.note);
  if (!scroller.found) warnings.push(scroller.note);
  if (dom.truncated) warnings.push(`Chat log HTML was truncated at ${MAX_DOM_BYTES} characters.`);
  if (composition.truncated) warnings.push(`Only the first ${MAX_CHILDREN} direct children were described.`);

  return {
    version: 1,
    capturedAtIso,
    timeline: {
      probe: probeAt,
      runtime: runtimeAt,
      scroller: scrollerAt,
      composition: compositionAt,
      dom: domAt,
      animations: animationsAt,
      assignment: assignmentAt,
      writes: writesAt,
    },
    warnings,
    probe,
    runtime,
    scroller,
    composition: composition.nodes,
    compositionTruncated: composition.truncated,
    dom,
    animations,
    assignment,
    writes,
  };
}

// ---------------------------------------------------------------------------
// Freeze-time retention
// ---------------------------------------------------------------------------
//
// The export button lives in Settings, and Settings is a ROUTE
// (`home/settings` replaces the app's main slot in App.tsx), so walking to it
// unmounts the chat log and takes the frozen surface with it. A capture taken
// after that walk sees nothing.
//
// So when the probe DOES call a freeze, we take the whole scene there and then
// and hold it in memory. The colleague can navigate to the export button
// afterwards and the frozen scene still rides along in the zip.
//
// This does not cover the case the probe misses — that is exactly the case the
// live capture covers when the button is reachable without navigating (the
// run-error card's own "Export logs"). The two together are why the envelope
// carries both slots and says which one it got.

interface RetainedCapture {
  forensics: ChatScrollForensics;
  atMs: number;
  capturedAtIso: string;
}

let retained: RetainedCapture | null = null;

export function retainChatScrollForensics(forensics: ChatScrollForensics): void {
  // Keep the FIRST freeze of the session. A later one is the same stuck
  // surface with more transcript on it; the first is closest to the transition.
  if (retained != null) return;
  retained = { forensics, atMs: Date.now(), capturedAtIso: forensics.capturedAtIso };
}

export function readRetainedChatScrollForensics(): RetainedCapture | null {
  if (retained == null) return null;
  if (Date.now() - retained.atMs > RETENTION_TTL_MS) {
    retained = null;
    return null;
  }
  return retained;
}

/** Test-only — module state must not leak between cases. */
export function __resetChatScrollForensicsForTest(): void {
  retained = null;
}

/**
 * Subscribe to the probe's freeze verdict and bank a full capture on the spot.
 *
 * Deliberately synchronous rather than deferred to a timer: the transcript is
 * still streaming during a freeze, so a capture one task later is a capture of
 * a DIFFERENT DOM than the one the probe just judged. The user is already
 * looking at a scroller that will not move; a few tens of milliseconds spent
 * serializing it is not the thing they will notice.
 */
export function handleFreezeSignalForRetention(signal: ChatScrollFreezeSignal): void {
  if (signal.kind !== 'frozen') return;
  if (retained != null) return;
  try {
    retainChatScrollForensics(collectChatScrollForensics());
  } catch {
    // A capture that throws must never break the probe's own reporting.
  }
}

/**
 * The global the Electron main process calls before it fetches the bundle.
 *
 * The desktop Help menu -> "Export Diagnostics…" is the only export route that
 * does not navigate, which makes it the one a stuck colleague can reach without
 * unmounting the very chat log they are reporting. That path never touches the
 * renderer, so main reaches back in through this name. See
 * `apps/desktop/src/main/diagnostics.ts`.
 */
export const RENDERER_CAPTURE_GLOBAL = '__odCaptureChatScrollForensics';

interface CaptureGlobals {
  __odCaptureChatScrollForensics?: () => Promise<boolean>;
}

export function installChatScrollForensicsRetention(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const globals = globalThis as unknown as CaptureGlobals;
  globals[RENDERER_CAPTURE_GLOBAL] = captureAndUploadChatScrollForensics;
  const unsubscribe = subscribeChatScrollFreeze(handleFreezeSignalForRetention);
  return () => {
    delete globals[RENDERER_CAPTURE_GLOBAL];
    unsubscribe();
  };
}

// ---------------------------------------------------------------------------
// Export handoff
// ---------------------------------------------------------------------------

const ENVELOPE_NOTE =
  '`live` is the chat log as it stands right now; `retained` is the scene captured '
  + 'the moment the freeze probe first called a freeze. Both slots say why they are '
  + 'empty when they are.';

export function captureChatScrollForensicsForExport(): ChatScrollForensicsEnvelope {
  const found = findChatLogElement();
  let live: ChatScrollForensics | null = null;
  let liveReason: string | null = null;
  if (found != null) {
    try {
      live = collectChatScrollForensics();
    } catch (error) {
      liveReason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
  } else {
    liveReason = SCROLLER_MISSING_NOTE;
  }
  const held = readRetainedChatScrollForensics();
  return {
    version: 1,
    capturedAtIso: new Date().toISOString(),
    live: { available: live != null, reason: liveReason, forensics: live },
    retained: {
      available: held != null,
      capturedAtIso: held?.capturedAtIso ?? null,
      ageMs: held != null ? Date.now() - held.atMs : null,
      forensics: held?.forensics ?? null,
    },
    note: ENVELOPE_NOTE,
  };
}

/**
 * Hand the capture to the daemon so it lands inside the diagnostics zip the
 * user is about to download.
 *
 * Never throws and never rejects: a diagnostics upload that could fail the
 * export it rides in front of would cost the colleague the logs they came for.
 */
export async function uploadChatScrollForensics(
  envelope: ChatScrollForensicsEnvelope,
): Promise<boolean> {
  try {
    const res = await fetch(CHAT_SCROLL_FORENSICS_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(envelope),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** The one call the export button makes. Resolves to whether the daemon took it. */
export async function captureAndUploadChatScrollForensics(): Promise<boolean> {
  try {
    return await uploadChatScrollForensics(captureChatScrollForensicsForExport());
  } catch {
    return false;
  }
}
