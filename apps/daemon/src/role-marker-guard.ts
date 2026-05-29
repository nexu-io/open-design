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
// Matches two families:
//   - Markdown-style: `## user`, `## assist`, `## assistant`, `## system`
//     (flexible whitespace between ## and role)
//   - Chat-style: `User:`, `Assistant:`, `Human:`, `AI:`
//     (case-insensitive, optional whitespace before colon)
export const FABRICATED_ROLE_MARKER_RE =
  /(?:^|\n)\s*(?:##\s+(?:user|assistant|assist|system)|(?:User|Assistant|Human|AI)\s*:)/i;

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
 * Create a stateful guard that accumulates text per message and detects
 * fabricated role markers across chunk boundaries.
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
  let accumulated = '';
  let _contaminated = false;
  let markerText: string | null = null;

  return {
    get contaminated() {
      return _contaminated;
    },

    feedText(text: string): string {
      if (_contaminated) return '';

      const prev = accumulated;
      const combined = prev + text;
      const match = FABRICATED_ROLE_MARKER_RE.exec(combined);
      if (!match) {
        accumulated = combined;
        return text;
      }

      // Found a fabricated role marker.
      _contaminated = true;
      markerText = match[0].trim();
      const cutIndex = match.index;
      const safePrefix = combined.slice(0, cutIndex);
      const alreadyEmitted = prev.length;
      if (cutIndex <= alreadyEmitted) return '';
      return safePrefix.slice(alreadyEmitted);
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


