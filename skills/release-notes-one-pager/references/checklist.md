# Release Notes One-Pager Checklist

Run this before emitting `<artifact>`. P0 = must pass; P1 = should pass; P2 = nice to have.

## P0 — must pass

- [ ] Required sections exist and are visible: Added, Fixed, Breaking changes, Known issues, Upgrade note.
- [ ] Added section explicitly says `No additions provided` when no additions are supplied.
- [ ] Fixed section explicitly says `No fixes provided` when no fixes are supplied.
- [ ] Breaking changes section explicitly says `None` when there are no breaking changes.
- [ ] Known issues section explicitly says `None reported` when there are no known issues.
- [ ] Upgrade note section explicitly says either concrete steps or `No upgrade actions required based on provided information`.
- [ ] No invented dates, versions, metrics, or claims. If missing, use labelled placeholders such as `Version: —`.
- [ ] No filler copy and no lorem ipsum.
- [ ] No raw hex colors outside the `:root` token block.
- [ ] No default AI-accent indigo or violet accents (`#6366f1`, `#4f46e5`, `#4338ca`, `#3730a3`, `#8b5cf6`, `#7c3aed`, `#a855f7`).
- [ ] No purple/blue trust gradient hero backgrounds.
- [ ] No emoji icons in headings, feature rows, buttons, or list rows.
- [ ] Display headings use `var(--font-display)`; no hardcoded sans display type.
- [ ] No rounded card with a coloured left-border accent pattern.
- [ ] Every top-level `<section>` has a `data-od-id`.
- [ ] Every required release-note section root also includes the matching `id` anchor: `added`, `fixed`, `breaking-changes`, `known-issues`, `upgrade-note`.
- [ ] Every emitted CTA uses a real destination; `href="#"` is not acceptable. If no destination exists, omit the closing CTA strip.
- [ ] No placeholder tokens remain in href attributes: `[REPLACE]`, `REPLACE_WITH_REAL_URL`, or `https://example.com`. All hrefs must be valid URLs.
- [ ] CTA copy must accurately describe an available destination; do not promise content that is not present.
- [ ] Mobile reflow works without horizontal scroll at narrow widths.

## P1 — should pass

- [ ] Added and Fixed entries are concrete (what changed, not generic "improvements").
- [ ] Known issue rows include status or workaround when provided by the user.
- [ ] Upgrade note uses clear verbs (`Run`, `Update`, `Restart`, `Rebuild`) for action steps.
- [ ] Headlines stay concise (prefer under 14 words).
- [ ] CTA label is specific (`Read full changelog`, `Share release notes`) and not generic (`Learn more`).
- [ ] Accent usage stays restrained; avoid reusing accent treatment in every section.

## P2 — nice to have

- [ ] One meaningful highlight in hero (single decisive sentence, not marketing fluff).
- [ ] Log rows are balanced in length and easy to scan.
- [ ] Numeric values use `.num` style for legibility.
