<!--
Template: duplicate-title ask

This file is an aesthetic reference, not a fill-in form. When you need to
post this kind of comment, read the beats and the exemplar below to absorb
the tone, then compose a fresh comment for the specific PR pair. Do not
sed-substitute the placeholders and post the result verbatim — see
maintainer memory `feedback_templates_are_style_refs`.

When this applies:
  classify emits the `duplicate-title` tag (same author + byte-for-byte
  identical title with another open PR). Post on the older / more-iterated
  PR of the pair; the author may want to preserve its history.

Beats the comment should hit (in order):
  1. Brief, neutral observation that two same-titled PRs exist.
  2. List both PRs with one-line distinguishing facts (branch + commits + diff size).
  3. Direct ask: which one to land?
  4. Offer to close on the author's behalf if #other is the intended one.
  5. Invite a clarifying note if both are intentional.
  6. Closing line attributing the surface to maintainer tooling.

Placeholders mark the PR-specific facts to weave in (not literal blanks):
  {AUTHOR}, {TITLE}, {THIS_NUM} / {THIS_BRANCH} / {THIS_COMMITS} / {THIS_PLUS} /
  {THIS_MINUS}, and the same set for {OTHER_*}.

Exemplar (one valid way to write it):
-->
@{AUTHOR} — flagging this one because the open queue currently has two PRs from you with byte-for-byte identical titles (`{TITLE}`):

- this PR (#{THIS_NUM}, branch `{THIS_BRANCH}`, {THIS_COMMITS} commits, +{THIS_PLUS} −{THIS_MINUS})
- #{OTHER_NUM} (branch `{OTHER_BRANCH}`, {OTHER_COMMITS} commits, +{OTHER_PLUS} −{OTHER_MINUS})

Could you confirm which one you'd like reviewers to land? If #{OTHER_NUM} is meant to supersede this one, feel free to close this in favor of it (or let me know and I'll close it). If they're intentionally covering different cases, a one-line note here clarifying the split would help reviewers track them.

(Surfaced by maintainer tooling: `duplicate-title` tag on same-author byte-for-byte titles.)
