<!--
Template: awaiting-author nudge

This file is an aesthetic reference, not a fill-in form. When you need to
post this kind of comment, read the beats and the exemplar below to absorb
the tone, then compose a fresh comment for the specific PR. Do not
sed-substitute the placeholders and post the result verbatim — see
maintainer memory `feedback_templates_are_style_refs`.

When this applies:
  classify emits the `awaiting-author-response-24h` tag and the author has
  been silent for ≥ 4 days (96h+). For PRs in the 24h-96h window, hold off
  — the author may still be working on it.

Beats the comment should hit (in order, very short):
  1. Friendly check-in opener (one short clause).
  2. State the waiting duration as a fact, no judgment.
  3. Direct status question: still planning to land it?
  4. Optional unblock offer if the next step is non-obvious from the diff.
  5. Graceful exit option: "just say so and we'll close it cleanly" — this
     respects the author's time and keeps the queue honest.
  6. Tooling-transparency line ("Surfaced via `awaiting-author-response-24h`...").

Placeholders mark the PR-specific facts to weave in (not literal blanks):
  {AUTHOR}        — the PR author's GitHub login
  {AWAITING_HUMAN} — human-readable awaiting duration, e.g. "8 days" or
                     "5 days 4 hours" (derived from tag.awaitingHours)

Tone target: friendly + dignified, concise, no padding, no robot phrasing.
Vary the wording between PRs you nudge in the same session — repeated
identical comments visible across a contributor's notifications break the
"this is a person talking to me" feel.

Exemplar (one valid way to write it):
-->
@{AUTHOR} — quick check-in: this has been waiting on your follow-up for about {AWAITING_HUMAN}. Still planning to land it? Happy to help if you're stuck on anything specific; if priorities have shifted, just say so and we'll close it cleanly.

(Surfaced via the `awaiting-author-response-24h` maintainer tooling tag.)
