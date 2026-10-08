// Who moved the chat log — us, or the compositor refusing to?
//
// The question
// ------------
// When a chat log will not scroll there are two stories, and from the outside
// they look identical: the compositor's copy of the scroll extent has gone
// stale and will not move, OR our own code is writing the scroll position
// back the instant the user leaves the bottom. Every number the freeze probe
// reads is the same in both cases.
//
// The one thing that tells them apart is that native and compositor scrolling
// NEVER go through `Element.prototype.scrollTop`'s setter. A wheel that the
// compositor handles on its own thread does not touch it; neither does a
// scrollbar drag, a keyboard scroll or a fling. So every entry this module
// records is, by construction, a JavaScript write — and an empty log during a
// stuck gesture is proof that nothing in the app is fighting the user.
//
// Why it is off by default
// ------------------------
// This rewrites accessors on `Element.prototype`. That is the riskiest thing
// in the observability folder by a distance: it puts our function on the path
// of every scroll write in the process, and reading `scrollTop` on either side
// of one forces layout, which changes the timing of the very thing being
// measured. Neither cost is acceptable for every user all the time.
//
// So: nothing is patched until somebody asks. The switch is a `localStorage`
// key — the same `open-design:` prefix the rest of the app uses for persisted
// UI state — because the freeze is intermittent and a switch that dies with
// the window would have to be re-thrown after every restart, which is exactly
// the problem that made a hand-injected renderer probe useless.
//
// Reversibility is part of the contract. The original property descriptors
// are kept and restored verbatim, including `configurable` and `enumerable`;
// if any of them cannot be replaced the module refuses to arm rather than
// half-patching the prototype.
//
// Privacy: element identity is a tag name, its class list and its test id.
// Stacks are our own frames. No message text and no user-authored string is
// read.

/**
 * The switch. `'1'` arms the trace at the next observer install; anything
 * else, including absence, leaves the prototype alone.
 */
export const SCROLL_WRITE_TRACE_STORAGE_KEY = 'open-design:chat-scroll-write-trace';

/** Which API did the writing. */
export type ScrollWriteApi = 'scrollTop' | 'scrollTo' | 'scrollBy' | 'scrollIntoView';

export interface ScrollWriteRecord {
  /** Clock reading, in the same units as the freeze probe's trail. */
  at: number;
  api: ScrollWriteApi;
  /** The value asked for, where the API carries one. `scrollIntoView` does not. */
  value: number | null;
  /** The element the call was made ON — for `scrollIntoView`, a descendant. */
  target: string;
  /** The scroller's `scrollTop` immediately before the call. */
  fromPx: number | null;
  /** …and immediately after, which is how you see a write that did not land. */
  toPx: number | null;
  /** `new Error().stack`, minus the frames belonging to this module. */
  stack: string;
}

/**
 * Records kept. Small on purpose: this is read by a human looking at one
 * stuck gesture, and a streaming turn can write the scroll position twice a
 * frame, so an unbounded log would be minutes of noise around the ten
 * interesting entries.
 */
const CAPACITY = 200;

interface PatchedMember {
  name: string;
  /** Exactly what was there before, restored verbatim on disarm. */
  original: PropertyDescriptor;
}

let armed = false;
let selector = '';
let patched: PatchedMember[] = [];
const records: ScrollWriteRecord[] = [];
let dropped = 0;

/**
 * The original `scrollTop` getter, kept separately.
 *
 * Reading the before/after position through the PATCHED property would work
 * (only the setter is replaced) but would break the moment somebody wraps the
 * getter too. Holding the original is what makes this module's own reads
 * immune to whatever else is on the prototype.
 */
let nativeScrollTopGet: (() => number) | null = null;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Tag, classes and test id — no layout.
 *
 * Deliberately NOT the freeze probe's richer describer: that one reads a
 * bounding rect, and forcing layout from inside a `scrollTop` setter would
 * perturb the timing of every scroll write in the app.
 */
function describeTarget(el: Element): string {
  try {
    const tag = el.tagName.toLowerCase();
    const className = el.getAttribute('class') ?? '';
    const classes = className.split(/\s+/).filter(Boolean).slice(0, 6);
    const testId = el.getAttribute('data-testid');
    return (
      tag
      + classes.map((token) => `.${token}`).join('')
      + (testId != null ? `[data-testid=${testId}]` : '')
    );
  } catch {
    return 'unknown';
  }
}

/** The nearest matching scroller at or above `el`, or null when off-target. */
function scrollerFor(el: unknown): Element | null {
  if (typeof Element === 'undefined' || !(el instanceof Element)) return null;
  try {
    return el.closest(selector);
  } catch {
    return null;
  }
}

function readTop(el: Element | null): number | null {
  if (el == null || nativeScrollTopGet == null) return null;
  try {
    return nativeScrollTopGet.call(el);
  } catch {
    return null;
  }
}

/**
 * Our own frames dropped, so the first line is the caller.
 *
 * The header (`Error`) goes too — it carries no information and costs a line
 * of the console's width on every entry.
 */
function callerStack(): string {
  try {
    const raw = new Error().stack ?? '';
    return raw
      .split('\n')
      .filter((line) => !/chat-scroll-write-trace/.test(line))
      .filter((line) => !/^Error$/.test(line.trim()))
      .join('\n');
  } catch {
    return '';
  }
}

function record(entry: ScrollWriteRecord): void {
  records.push(entry);
  if (records.length > CAPACITY) {
    records.shift();
    dropped += 1;
  }
}

/**
 * Extract the vertical target from whatever the caller passed.
 *
 * `scrollTo(x, y)` and `scrollTo({ top })` are both legal; anything else is
 * recorded as "we saw the call but cannot name a number", which is still the
 * useful half.
 */
function verticalArgument(args: unknown[]): number | null {
  const first = args[0];
  if (typeof first === 'number') {
    const second = args[1];
    return typeof second === 'number' ? second : null;
  }
  if (first != null && typeof first === 'object') {
    const top = (first as { top?: unknown }).top;
    if (typeof top === 'number') return top;
  }
  return null;
}

/**
 * Replace one prototype member, remembering exactly what was there.
 *
 * Returns false when the member is absent or non-configurable — both of which
 * mean the caller must abandon the whole arm rather than leave the prototype
 * half rewritten.
 */
function patch(
  name: string,
  build: (original: PropertyDescriptor) => PropertyDescriptor,
): boolean {
  const original = Object.getOwnPropertyDescriptor(Element.prototype, name);
  if (original == null || original.configurable !== true) return false;
  try {
    Object.defineProperty(Element.prototype, name, build(original));
  } catch {
    return false;
  }
  patched.push({ name, original });
  return true;
}

function patchScrollTop(): boolean {
  return patch('scrollTop', (original) => {
    const nativeSet = original.set;
    const nativeGet = original.get;
    nativeScrollTopGet = typeof nativeGet === 'function'
      ? (nativeGet as () => number)
      : null;
    // Spread rather than rebuild: `configurable`, `enumerable` and the getter
    // carry over byte for byte, so the armed prototype differs from the
    // original in exactly one place — the setter — and nowhere else.
    return {
      ...original,
      set(this: Element, value: number) {
        const scroller = scrollerFor(this);
        if (scroller == null) {
          nativeSet?.call(this, value);
          return;
        }
        const fromPx = readTop(scroller);
        nativeSet?.call(this, value);
        record({
          at: now(),
          api: 'scrollTop',
          value: typeof value === 'number' ? value : null,
          target: describeTarget(this),
          fromPx,
          toPx: readTop(scroller),
          stack: callerStack(),
        });
      },
    };
  });
}

function patchMethod(name: 'scrollTo' | 'scrollBy' | 'scrollIntoView'): boolean {
  return patch(name, (original) => {
    const native = original.value as ((...args: unknown[]) => unknown) | undefined;
    return {
      ...original,
      value: function traced(this: Element, ...args: unknown[]): unknown {
        const scroller = scrollerFor(this);
        if (scroller == null) return native?.apply(this, args);
        const fromPx = readTop(scroller);
        const result = native?.apply(this, args);
        record({
          at: now(),
          api: name,
          value: name === 'scrollIntoView' ? null : verticalArgument(args),
          target: describeTarget(this),
          fromPx,
          toPx: readTop(scroller),
          stack: callerStack(),
        });
        return result;
      },
    };
  });
}

/**
 * Start recording writes to elements matching `matchSelector`.
 *
 * All or nothing: if any member refuses to be replaced, everything already
 * replaced is put back and this returns false. A half-patched prototype would
 * be a worse state than an unpatched one, because the disarm path would then
 * have to guess what it owned.
 *
 * `scrollTo` / `scrollBy` are absent on `Element.prototype` in some engines
 * (jsdom among them); a missing member is skipped, not a failure. Only
 * `scrollTop` is required, because it is the one that carries the answer.
 */
export function armScrollWriteTrace(matchSelector: string): boolean {
  if (armed) return true;
  if (typeof Element === 'undefined') return false;
  selector = matchSelector;
  if (!patchScrollTop()) {
    disarmScrollWriteTrace();
    return false;
  }
  for (const name of ['scrollTo', 'scrollBy', 'scrollIntoView'] as const) {
    if (Object.getOwnPropertyDescriptor(Element.prototype, name) == null) continue;
    if (!patchMethod(name)) {
      disarmScrollWriteTrace();
      return false;
    }
  }
  armed = true;
  return true;
}

/** Put `Element.prototype` back exactly as it was found. */
export function disarmScrollWriteTrace(): void {
  // Newest first, so a member patched twice (which cannot happen today, but
  // would be the obvious bug tomorrow) unwinds in the right order.
  for (let i = patched.length - 1; i >= 0; i -= 1) {
    const member = patched[i];
    if (member == null) continue;
    try {
      Object.defineProperty(Element.prototype, member.name, member.original);
    } catch {
      // best-effort — teardown must never propagate
    }
  }
  patched = [];
  nativeScrollTopGet = null;
  armed = false;
  selector = '';
}

export function isScrollWriteTraceArmed(): boolean {
  return armed;
}

/** Oldest first. A copy, so a caller cannot edit the ring. */
export function listScrollWrites(): ScrollWriteRecord[] {
  return records.slice();
}

export function clearScrollWrites(): void {
  records.length = 0;
  dropped = 0;
}

export function scrollWriteTraceStats(): {
  armed: boolean;
  recorded: number;
  dropped: number;
  capacity: number;
} {
  return { armed, recorded: records.length, dropped, capacity: CAPACITY };
}

export function scrollWriteTraceFlagSet(): boolean {
  try {
    return globalThis.localStorage?.getItem(SCROLL_WRITE_TRACE_STORAGE_KEY) === '1';
  } catch {
    // Private mode, a blocked origin, a packaged `od:` page with storage
    // disabled — an unreadable switch is an off switch.
    return false;
  }
}

export function setScrollWriteTraceFlag(on: boolean): void {
  try {
    if (on) globalThis.localStorage?.setItem(SCROLL_WRITE_TRACE_STORAGE_KEY, '1');
    else globalThis.localStorage?.removeItem(SCROLL_WRITE_TRACE_STORAGE_KEY);
  } catch {
    // best-effort — an unwritable switch still leaves the in-memory arm intact
  }
}
