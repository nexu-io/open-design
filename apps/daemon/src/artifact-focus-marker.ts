/**
 * Streaming half of the `<od-focus …/>` marker (shape lives in
 * `@open-design/contracts`, `api/artifact-focus-marker`).
 *
 * Three jobs, in order of how badly each fails when it is wrong:
 *
 *  1. **The marker never reaches the reader.** SSE cuts the stream wherever it
 *     likes; real recordings show `<od-done` arriving alone in one delta and
 *     `<od-done key="8` in another. Anything that could still grow into a
 *     marker is held until the next delta resolves it, and a marker that never
 *     completes is dropped rather than painted. Stripping does NOT depend on
 *     the key matching — a wrongly-keyed marker is still protocol noise, which
 *     is the rule `<od-title>` and `<MUST_FIX>` both had to learn the hard way.
 *
 *  2. **Never swallow the user's words.** Holding back is a bet that more
 *     characters are coming. When the bet loses — the held tail was prose that
 *     happened to start with `<` — `flush()` returns it verbatim.
 *
 *  3. **A marker never causes a read outside the project.** The declared path
 *     is untrusted input. It is rebased against the project root, refused if it
 *     escapes, and refused again after `realpath` so a symlink cannot walk out
 *     of the project between the check and the stat.
 *
 * **The empty-preview gate.** The product ruling is that a preview must not
 * open while the file is still empty — a blank page reads as a bug — but must
 * also not wait for the whole turn to finish. So an accepted `open` is not
 * emitted until the file is proven non-empty on disk. If it is not yet, the
 * marker is *held*, not dropped, and re-probed by `settle()` — which the run
 * loop calls after each file-writing tool result and once more at turn end.
 * That makes the trigger "the marker, and the bytes, whichever lands second".
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  OD_FOCUS_OPEN_TAG,
  normalizeArtifactFocusPath,
  parseArtifactFocusMarker,
  type ArtifactFocusSelection,
} from '@open-design/contracts';

/**
 * How far into an already-identified `<od-focus` we keep waiting for its `>`.
 *
 * Generous on purpose: everything this marker carries lives in the attribute
 * list, so a turn declaring several deliverables produces a genuinely long tag.
 * The cap only guards against a `<od-focus` that never closes at all, and the
 * branch is unreachable for ordinary prose — entering it requires the literal
 * nine-character tag prefix.
 */
const MAX_TAG_HOLD = 4096;

export interface ArtifactFocusMarkerStripper {
  /** Remove markers from one delta, returning the text that may be shown. */
  strip(delta: string): string;
  /**
   * Re-probe a held `open` whose file was absent or empty when its marker
   * arrived. Safe to call at any time and any number of times; resolves to
   * `true` when this call is what released the pending selection.
   */
  settle(): Promise<boolean>;
  /** Stream ended: give back held prose verbatim, and drop a half-written tag. */
  flush(): string;
}

/** A probe of one candidate file. `null` means "not a readable in-project file". */
export type ArtifactFocusFileProbe = (
  absolutePath: string,
) => Promise<{ size: number } | null>;

export interface ArtifactFocusMarkerStripperOptions {
  /**
   * This turn's nonce. A marker is only *accepted* when its key matches.
   * `null` means the turn has no key, so every marker is stripped and none is
   * accepted.
   */
  key: string | null;
  /** Absolute path of the project directory. `null` disables acceptance. */
  projectRoot: string | null;
  /** Called each time a selection resolves. May fire more than once per turn. */
  emit: (selection: ArtifactFocusSelection) => void;
  /** Injected by tests. Defaults to a realpath-guarded `stat`. */
  probeFile?: ArtifactFocusFileProbe;
}

/**
 * Turn one declared path into a project-relative POSIX path, or `null`.
 *
 * Absolute inputs are the common case, not the exception: every `Write` in the
 * recorded runs carries an absolute `file_path`, so an agent naming the file it
 * just wrote will naturally write an absolute path here too. Those are rebased
 * against the project root; anything that lands outside is refused.
 *
 * The rebased result goes back through the pure normalizer, so the "no `..`
 * anywhere" rule applies to it as well and there is exactly one definition of
 * an acceptable path.
 */
export function resolveArtifactFocusProjectPath(
  raw: unknown,
  projectRoot: string | null,
): string | null {
  const direct = normalizeArtifactFocusPath(raw);
  if (direct) return direct;
  if (!projectRoot || typeof raw !== 'string') return null;
  const value = raw.trim().replace(/^[`"'“‘]+|[`"'”’]+$/g, '').trim();
  if (!value || value.includes('\0')) return null;
  const posix = value.replace(/\\/g, '/');
  if (!(posix.startsWith('/') || /^[A-Za-z]:\//.test(posix))) return null;
  // `//host/share` is a UNC network path, not a local absolute path.
  if (posix.startsWith('//')) return null;
  const relative = path.relative(path.resolve(projectRoot), path.resolve(posix));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return normalizeArtifactFocusPath(relative);
}

/**
 * Default probe: resolve symlinks, re-check containment against the *real*
 * project root, then stat.
 *
 * The realpath round-trip is the point. `normalizeArtifactFocusPath` proves the
 * declared string does not escape; it cannot prove that `assets/logo.png` is
 * not a symlink to `~/.ssh/id_rsa`. Checking after resolution closes that gap,
 * and checking the root through `realpath` too keeps the comparison honest when
 * the project directory is itself reached through a symlink (which it is on
 * macOS, where `/tmp` is a link to `/private/tmp`).
 */
async function defaultProbeFile(
  absolutePath: string,
  projectRoot: string,
): Promise<{ size: number } | null> {
  const realFile = await fs.promises.realpath(absolutePath).catch(() => null);
  if (!realFile) return null;
  const realRoot = await fs.promises.realpath(projectRoot).catch(() => path.resolve(projectRoot));
  const relative = path.relative(realRoot, realFile);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  const stat = await fs.promises.stat(realFile).catch(() => null);
  if (!stat || !stat.isFile()) return null;
  return { size: stat.size };
}

/** `</od-focus` — a stray closing tag models sometimes add out of habit. */
const OD_FOCUS_CLOSE_TAG = '</od-focus';

/**
 * The tag name must END where we think it does.
 *
 * Without this, `indexOf('<od-focus')` happily matches inside `<od-focused>`
 * and `<od-focuses>` and swallows them — the same shape of bug that let
 * `<PANELISTS>` get eaten by a `<PANELIST>` matcher. The contracts-side regex
 * spells it `\b`; the streaming scanner has to check it by hand because it
 * works on a moving buffer rather than a complete string.
 *
 * A name still being typed (`<od-focus` at the very end of the buffer, nothing
 * after it yet) is *undecided*, not rejected — the next delta may bring `/>`
 * or may bring `ed>`. Undecided means held.
 */
function tagBoundaryAt(lower: string, index: number, tagLength: number): 'tag' | 'not-tag' | 'undecided' {
  const after = lower[index + tagLength];
  if (after === undefined) return 'undecided';
  return after === '>' || after === '/' || /\s/.test(after) ? 'tag' : 'not-tag';
}

/**
 * Index of the next real marker start at or after `from`, or -1.
 *
 * Skips look-alikes rather than stopping at them, so a paragraph mentioning
 * `<od-focused>` before a genuine marker still finds the genuine one.
 * `undecided` stops the scan: the buffer ends mid-name and the caller must hold.
 */
function findMarkerStart(lower: string, from: number): { index: number; undecided: boolean } {
  let cursor = from;
  for (;;) {
    const open = lower.indexOf(OD_FOCUS_OPEN_TAG, cursor);
    const close = lower.indexOf(OD_FOCUS_CLOSE_TAG, cursor);
    const next = open === -1 ? close : close === -1 ? open : Math.min(open, close);
    if (next === -1) return { index: -1, undecided: false };
    const isClose = next === close && (open === -1 || close <= open);
    const length = isClose ? OD_FOCUS_CLOSE_TAG.length : OD_FOCUS_OPEN_TAG.length;
    const verdict = tagBoundaryAt(lower, next, length);
    if (verdict === 'tag') return { index: next, undecided: false };
    if (verdict === 'undecided') return { index: next, undecided: true };
    cursor = next + 1;
  }
}

/**
 * How many characters at the end of `text` could still grow into a marker.
 *
 * Two cases, mirroring `<od-next>`'s hold-back:
 *   · the tail is a prefix of `<od-focus` — the tag name is unfinished;
 *   · the tail already IS `<od-focus` but no `>` has arrived — attributes are
 *     still in flight.
 *
 * A lone `<` in prose enters the first case and leaves it the moment a
 * non-matching character arrives, so it cannot hold an answer hostage. A tail
 * that has already resolved to a look-alike (`<od-focused`) is released.
 */
function pendingTagTail(text: string): number {
  const open = text.lastIndexOf('<');
  if (open < 0) return 0;
  const held = text.length - open;
  const tail = text.slice(open).toLowerCase();
  for (const tag of [OD_FOCUS_OPEN_TAG, OD_FOCUS_CLOSE_TAG]) {
    if (tail.startsWith(tag)) {
      if (tagBoundaryAt(tail, 0, tag.length) === 'not-tag') continue;
      if (tail.includes('>')) return 0;
      return held > MAX_TAG_HOLD ? 0 : held;
    }
    if (tag.startsWith(tail)) return held;
  }
  return 0;
}

export function createArtifactFocusMarkerStripper(
  options: ArtifactFocusMarkerStripperOptions,
): ArtifactFocusMarkerStripper {
  const runKey = typeof options.key === 'string' && options.key ? options.key : null;
  const projectRoot = typeof options.projectRoot === 'string' && options.projectRoot
    ? options.projectRoot
    : null;
  const probe: ArtifactFocusFileProbe =
    options.probeFile ?? ((absolutePath) =>
      projectRoot ? defaultProbeFile(absolutePath, projectRoot) : Promise.resolve(null));

  /** Text held back because it might still turn into a marker. */
  let held = '';
  /**
   * An accepted `open` whose file was not yet non-empty. Held rather than
   * dropped: the ruling is "open once it has content", and a marker that
   * arrives a beat before the bytes is the normal case for an agent that
   * announces the file as it writes it.
   */
  let pendingOpen: string | null = null;
  /**
   * The last path actually emitted. Two things depend on it:
   *
   *  · **Idempotency.** A marker's own probe and a `settle()` from the run loop
   *    race by construction — the marker fires one and a tool result fires the
   *    other a moment later. Both can find the file non-empty. Without this
   *    latch they both emit and the preview navigates twice.
   *  · **Last-wins.** It is keyed on the PATH, not a boolean, so a later marker
   *    naming a *different* file still opens it while a later marker naming the
   *    *same* file is a no-op.
   */
  let releasedOpen: string | null = null;

  /** Probe an accepted open path; emit when the bytes are there. */
  const tryEmitOpen = async (projectRelative: string): Promise<boolean> => {
    if (!projectRoot) return false;
    if (releasedOpen === projectRelative) {
      pendingOpen = null;
      return false;
    }
    const absolute = path.resolve(projectRoot, projectRelative);
    const found = await probe(absolute).catch(() => null);
    if (!found || found.size <= 0) {
      pendingOpen = projectRelative;
      return false;
    }
    // Re-check AFTER the await: a concurrent probe of the same path may have
    // released it while this one was suspended. Single-threaded, so whichever
    // resumes second sees the latch and bails.
    if (releasedOpen === projectRelative) {
      pendingOpen = null;
      return false;
    }
    releasedOpen = projectRelative;
    pendingOpen = null;
    options.emit({ open: projectRelative });
    return true;
  };

  const accept = (tag: string) => {
    const parsed = parseArtifactFocusMarker(tag);
    /*
     * Unforgeable-by-content: only a model the daemon showed this turn's nonce
     * to can produce it. A cloned page or a quoted document cannot.
     */
    if (!runKey || parsed.key !== runKey) return;
    if (!projectRoot) return;

    const openPath = resolveArtifactFocusProjectPath(
      parsed.open ?? parsed.rawOpen,
      projectRoot,
    );
    if (openPath) {
      pendingOpen = openPath;
      // Fire-and-forget: the stream must not stall on a stat. `settle()`
      // re-probes anything this pass could not release.
      void tryEmitOpen(openPath);
    }

    const showPaths: string[] = [];
    for (const candidate of parsed.show.length > 0 ? parsed.show : []) {
      const resolved = resolveArtifactFocusProjectPath(candidate, projectRoot);
      if (resolved && !showPaths.includes(resolved)) showPaths.push(resolved);
    }
    /*
     * `show` needs no filesystem gate. It can only ever NARROW a list the host
     * already built from files it saw for itself, so a path that does not exist
     * simply matches nothing. Statting here would buy no safety and would add a
     * filesystem round-trip per declared path.
     */
    if (showPaths.length > 0) options.emit({ show: showPaths });
  };

  const strip = (delta: string): string => {
    let buffer = held + String(delta ?? '');
    held = '';
    let visible = '';

    for (;;) {
      const lower = buffer.toLowerCase();
      const found = findMarkerStart(lower, 0);
      if (found.index === -1) {
        const keep = pendingTagTail(buffer);
        visible += keep > 0 ? buffer.slice(0, buffer.length - keep) : buffer;
        held = keep > 0 ? buffer.slice(buffer.length - keep) : '';
        break;
      }
      if (found.undecided) {
        // The buffer ends mid-name: `<od-focus` could still become `<od-focused`.
        // Hold from the `<` and let the next delta decide.
        visible += buffer.slice(0, found.index);
        held = buffer.slice(found.index);
        break;
      }

      visible += buffer.slice(0, found.index);
      buffer = buffer.slice(found.index);
      const gt = buffer.indexOf('>');
      if (gt === -1) {
        if (buffer.length > MAX_TAG_HOLD) {
          // A `<od-focus` that never closes its own tag within 4KB is prose.
          visible += buffer;
          buffer = '';
          break;
        }
        held = buffer;
        break;
      }
      const tag = buffer.slice(0, gt + 1);
      buffer = buffer.slice(gt + 1);
      // Stripping is unconditional; only acceptance is keyed.
      if (!tag.toLowerCase().startsWith('</')) accept(tag);
    }

    return visible;
  };

  return {
    strip,
    async settle() {
      const waiting = pendingOpen;
      if (!waiting) return false;
      return tryEmitOpen(waiting);
    },
    /*
     * Stream over. What is still held is one of two things:
     *
     *  · an ambiguous `<`-prefix that turned out to be prose — return it
     *    verbatim, because eating a sentence is worse than delaying one;
     *  · a `<od-focus` whose `>` never arrived. That is protocol, and protocol
     *    never paints, so it is dropped.
     */
    flush() {
      const rest = held;
      held = '';
      return rest.toLowerCase().startsWith(OD_FOCUS_OPEN_TAG)
        || rest.toLowerCase().startsWith('</od-focus')
        ? ''
        : rest;
    },
  };
}
