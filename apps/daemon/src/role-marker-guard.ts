/**
 * Shared utility for detecting and stripping fabricated role-marker lines
 * (`## user`, `## assistant`, `## system`) injected by the model into its
 * own output (see #3247 — same class as #2102 / #2464).
 *
 * `createRoleMarkerGuard()` — stateful per-message guard for structured
 * stream handlers that can track message boundaries (Claude, Copilot,
 * Qoder, OpenCode/Codex, Pi, ACP). Returns `{ feedText, contaminated,
 * warningEvent }`.
 */

// Regex matching fabricated role-marker lines injected by the model into
// its own output. Anchored to start-of-line via (?:^|\n) so we don't
// false-positive on user prose like "here is the ## user content".
//
// Scope (deliberately narrow): Markdown-style `## user` / `## assistant`
// / `## assist` / `## system` only — these are the patterns the chat
// host actually parses as turn boundaries (see `buildDaemonTranscript`
// in apps/web/src/providers/daemon.ts). Chat-style markers like
// `User:` / `Assistant:` / `Human:` / `AI:` are intentionally NOT
// included, because:
//   (1) The host never parses them as turn boundaries; a model emitting
//       them does NOT cause the original #3247 security failure mode.
//   (2) They collide with legitimate output far more often than the
//       Markdown family (e.g., "User: bob@example.com", form labels,
//       JSDoc lines). With kill-on-detection wired in server.ts
//       (`abortForRoleMarker`), a false positive aborts the whole run
//       — a much more expensive failure than a stray unflagged
//       `User:` line in the chat scrollback.
// If a host frontend ever starts parsing chat-style markers as
// boundaries, narrow the additions to that frontend's specific
// path rather than the shared regex.
//
// Three deliberate refinements vs. a naive `## role` match:
//
// 1. CASE-SENSITIVE. The chat host's turn-boundary delimiter is
//    lowercase (`## user` / `## assistant` / `## system` — see
//    `buildDaemonTranscript` in apps/web/src/providers/daemon.ts), and
//    the `## CRITICAL` system-prompt block forbids only the lowercase
//    forms. Title-Case Markdown headings like `## User Guide`,
//    `## System Architecture`, `## Assistant settings` are LEGITIMATE
//    content (LLMs emit these constantly in technical writing) and
//    must not contaminate. Matching with `/i` would deterministically
//    abort any run that produced such a heading — exactly the
//    "false positive aborts the whole run" cost the docblock cites
//    as the reason to keep the regex narrow.
//    (See PR #3303 review r3324151877.)
//
// 2. POSITIVE LOOKAHEAD `(?=[^a-z])`. Without it, `## userland`,
//    `## userspace`, `## users guide`, `## systemd`, `## assistance`
//    all match via prefix in the alternation. The positive lookahead
//    requires the character after the role keyword to exist AND to NOT
//    be a lowercase letter:
//      - `## user\n…`     → match (newline is not lowercase)
//      - `## assistantR…` → match (R is uppercase; the glued-form
//                           attack pattern still gets caught)
//      - `## assistant.`  → match (. is not a letter)
//      - `## users guide` → no match (s is lowercase letter)
//      - `## userland`    → no match (l is lowercase letter)
//    Why POSITIVE `[^a-z]` rather than NEGATIVE `(?![a-z])`: the
//    negative form is satisfied at end-of-string, which in a streaming
//    context means "we have just received `## user` but don't know
//    what comes next yet". A negative lookahead would fire prematurely
//    if the rest of the role-keyword landed in a later chunk (e.g.
//    the model emits `## user` then `land` arrives). The positive
//    form requires an actual non-lowercase character to be present,
//    so detection waits one more chunk in that edge case — a
//    one-character latency traded for correctness.
//
// 3. `[ \t]` instead of `\s` for inner whitespace. `\s` matches
//    newlines, which would let oddities like `##\nuser` match across
//    lines. Markdown role markers are always single-line by
//    convention; restricting to space/tab tightens the match without
//    losing any real attack pattern.
//
// Alternation order: `assistant` is listed before `assist` so a
// fully-spelled `## assistant` consumes 9 chars (not 6) and the
// `(?![a-z])` check is applied at position 9 (after the full word)
// rather than position 6. Truncated forms (`## assist\n` from a
// stream cut mid-emission) still match via the `assist` branch.
export const FABRICATED_ROLE_MARKER_RE =
  /(?:^|\n)[ \t]*##[ \t]+(?:user|assistant|assist|system)(?=[^a-z])/;

// Internal-only variant used after the first chunk has been processed.
// Drops the `^` alternative: once `tail` is a rolling slice of
// mid-stream text, `^` no longer represents the genuine message start
// — applying it would let the regex anchor at an arbitrary cut point
// inside legitimate prose ("…take a look at the ## user content…"
// fed char-by-char would eventually slide a tail window onto leading
// whitespace + `## user` and false-positive). Only `\n`-preceded
// markers are real role boundaries on subsequent chunks; the preceding
// newline is retained inside the 64-char tail so genuine markers
// straddling a chunk boundary are still caught.
// (See PR #3303 review r3324060995.)
const NEWLINE_ANCHORED_ROLE_MARKER_RE =
  /\n[ \t]*##[ \t]+(?:user|assistant|assist|system)(?=[^a-z])/;

// Pending-marker variants used in the no-match branch to detect a
// COMPLETE-but-unconfirmed marker prefix at the end of the buffer.
// Drop the `(?=[^a-z])` lookahead and anchor with `$` instead — the
// lookahead's whole purpose is to require a non-lowercase character
// AFTER the role keyword, which by definition can't be present when
// the chunk boundary fell exactly between the role keyword and its
// next byte. If one of these matches, the role keyword IS at the end
// of the current buffer; we withhold it and revisit on the next
// feed, where one of three things will happen:
//   (1) The next char is non-lowercase → main regex matches →
//       contaminated → withheld bytes dropped.
//   (2) The next char is lowercase (e.g. `## userl…`) → main regex
//       no longer matches the role keyword → withheld bytes are
//       confirmed safe and emitted alongside the new chunk.
//   (3) The role keyword is part of a longer word that itself is a
//       role keyword (only `user` ⊂ `users`, etc. — none extend to
//       a different role) → still case (2), since the extension is
//       lowercase.
// This implements the suggested fix on review r3324277xxx —
// preserves the documented "everything from the marker onward is
// silently dropped" contract across chunk boundaries that fall
// inside the lookahead-detection window.
const FIRST_CHUNK_PENDING_MARKER_TAIL_RE =
  /(?:^|\n)[ \t]*##[ \t]+(?:user|assistant|assist|system)$/;

const NEWLINE_ANCHORED_PENDING_MARKER_TAIL_RE =
  /\n[ \t]*##[ \t]+(?:user|assistant|assist|system)$/;

// Bounded tail size for cross-chunk matching. Must comfortably exceed
// the longest possible marker prefix:
//   "\n" + whitespace run + "##" + whitespace + "assistant"  ≈  16–24
// chars in practice (LLMs rarely emit more than a couple newlines or a
// handful of spaces between sections). 64 leaves generous margin and
// keeps the guard's memory + per-delta work O(1) regardless of message
// length — important because a 50KB assistant response delivered in
// 1000 chunks of 50 bytes is otherwise O(n²) on string concatenation
// alone.
const TAIL_BUFFER_SIZE = 64;

export interface RoleMarkerGuard {
  /** Feed a text delta for the current message. Returns the safe portion
   *  to emit (may be shorter than `text` if a marker was found mid-chunk,
   *  or empty string if the entire chunk is past the cut point). */
  feedText(text: string): string;
  /** Whether a fabricated marker was detected (further text is dropped). */
  readonly contaminated: boolean;
  /** If contaminated, the warning event to emit. `null` if clean. */
  warningEvent(): { type: 'fabricated_role_marker'; marker: string; messageId: string } | null;
}

/**
 * Create a stateful guard that detects fabricated role markers across
 * chunk boundaries. Memory + per-call work is O(1): instead of
 * accumulating the full message text, the guard retains only a small
 * trailing suffix (TAIL_BUFFER_SIZE chars) — enough for the matcher to
 * see across chunk boundaries when a marker straddles them.
 *
 * Usage in a stream handler:
 *
 *   const guard = createRoleMarkerGuard(messageId);
 *   for (const delta of deltas) {
 *     const safe = guard.feedText(delta.text);
 *     if (safe.length > 0) onEvent({ type: 'text_delta', delta: safe });
 *     if (guard.contaminated) {
 *       onEvent(guard.warningEvent()!);
 *       break; // stop emitting text for this message
 *     }
 *   }
 */
export function createRoleMarkerGuard(messageId: string): RoleMarkerGuard {
  // Rolling tail of the bytes we have ALREADY EMITTED, capped at
  // TAIL_BUFFER_SIZE. Used as the prefix when matching against new
  // text so we catch markers that straddle a chunk boundary.
  let tail = '';
  // Bytes we have RECEIVED but DEFERRED — held back because they form
  // a complete-but-unconfirmed marker suffix at the end of the buffer
  // and we don't yet know whether the next chunk will confirm them
  // (next char non-lowercase → contaminated, drop) or deny them
  // (next char lowercase → suffix was part of a longer word, emit).
  // Without this, a chunk boundary falling exactly between the role
  // keyword and its lookahead char would leak the marker line itself
  // into the UI / app.sqlite before we could classify it. See review
  // r3324277xxx.
  let pending = '';
  // Tracks whether `tail` still represents the ENTIRE emission so
  // far — i.e. no slicing has occurred yet and `^` in the canonical
  // regex genuinely anchors at byte 0 of the message stream. While
  // this holds, the `^|\n` alternation safely catches a role marker
  // that arrives at the start of the stream even if its prefix is
  // split across multiple chunks (`## ` | `user\n…`, `## us` | `er\n…`,
  // `##` | ` user\n…`). The moment `tail` would exceed
  // TAIL_BUFFER_SIZE, the slice turns `tail` into a mid-stream
  // window and `^` no longer represents the stream start — we then
  // switch to the newline-only variants so a sliding window cannot
  // manufacture a match from prose. The transition is on slicing,
  // not on first emission: earlier definitions ("any byte emitted",
  // "newline emitted") both had failure modes — see PR #3303 reviews
  // r3324060995 and r3324xxxxxx, and the regression tests below.
  let firstChunk = true;
  let _contaminated = false;
  let markerText: string | null = null;

  return {
    get contaminated() {
      return _contaminated;
    },

    feedText(text: string): string {
      if (_contaminated) return '';
      if (text.length === 0) return '';

      // Combine `tail` (already-emitted suffix for cross-chunk matching),
      // `pending` (deferred-from-prior-call suspicious suffix), and the
      // new `text` into a single matching buffer.
      const buffer = tail + pending + text;
      const matchRe = firstChunk
        ? FABRICATED_ROLE_MARKER_RE
        : NEWLINE_ANCHORED_ROLE_MARKER_RE;
      const pendingRe = firstChunk
        ? FIRST_CHUNK_PENDING_MARKER_TAIL_RE
        : NEWLINE_ANCHORED_PENDING_MARKER_TAIL_RE;
      // `firstChunk` transitions are tied to actual byte emission, not
      // feed count — see comment above. Transitioned at the end of
      // this function only when we emit at least one byte.

      const match = matchRe.exec(buffer);
      if (match) {
        // Marker confirmed. Compute the safe-to-emit portion (bytes
        // between previously-emitted `tail` and the marker), drop
        // `pending` (the deferred portion sits inside the marker
        // region by definition once the lookahead char arrives), and
        // mark contaminated. Subsequent feeds early-return.
        _contaminated = true;
        markerText = match[0].trim();
        pending = '';
        const alreadyEmitted = tail.length;
        const markerStart = match.index;
        if (markerStart <= alreadyEmitted) return '';
        return buffer.slice(alreadyEmitted, markerStart);
      }

      // No confirmed marker. Check whether the buffer ends with a
      // complete-but-unconfirmed marker prefix (role keyword present,
      // lookahead char not yet arrived). If so, withhold that suffix
      // until the next feed; emit the rest.
      const pendingMatch = pendingRe.exec(buffer);
      const alreadyEmitted = tail.length;
      const pendingStart = pendingMatch
        // Never withhold bytes we have already emitted in a prior
        // feed — the suspicious suffix could in pathological cases
        // start inside `tail` (we held back `pending` correctly on
        // the prior call, but the suffix-start position is upstream
        // of where we hold). Clamp to alreadyEmitted so safeToEmit
        // never goes negative.
        ? Math.max(pendingMatch.index, alreadyEmitted)
        : buffer.length;

      const safeToEmit = buffer.slice(alreadyEmitted, pendingStart);
      pending = buffer.slice(pendingStart);

      // Roll the emitted-bytes tail forward.
      const fullEmitted = tail + safeToEmit;
      const willSlice = fullEmitted.length > TAIL_BUFFER_SIZE;
      tail = willSlice
        ? fullEmitted.slice(fullEmitted.length - TAIL_BUFFER_SIZE)
        : fullEmitted;
      // `firstChunk` is true exactly while `tail` still represents the
      // entire emission so far — i.e. no slice has occurred and `^` in
      // the canonical regex genuinely anchors at byte 0 of the stream.
      // The moment we slice (emitted bytes exceed TAIL_BUFFER_SIZE),
      // `tail` becomes a mid-stream window, `^` becomes meaningless,
      // and we switch to the newline-only variants.
      //
      // Earlier iterations of this code used "any byte emitted" or
      // "newline emitted" as the transition trigger. Both were wrong:
      //   - "any byte" lost the `^` anchor before a chunk-split
      //     message-start marker (e.g. `## ` | `user\n…`,
      //     `## us` | `er\n…`) could finish arriving — see PR #3303
      //     review r3324xxxxxx, and the new tests below.
      //   - "newline emitted" left `^` valid on a sliced buffer for
      //     streams that hadn't yet emitted a newline, which then
      //     false-positived the rolling-tail mid-stream case from
      //     review r3324060995.
      // Slice-based is the invariant that satisfies both: while we
      // haven't sliced, `^` is correct; once we slice, it isn't.
      if (willSlice) firstChunk = false;

      return safeToEmit;
    },

    warningEvent() {
      if (!_contaminated || !markerText) return null;
      return {
        type: 'fabricated_role_marker',
        marker: markerText,
        messageId,
      };
    },
  };
}
