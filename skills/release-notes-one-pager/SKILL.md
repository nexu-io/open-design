---
name: release-notes-one-pager
description: |
  Release notes one-page HTML with highlights, Added, Fixed, Breaking changes,
  Known issues, and Upgrade note. Writes explicit "None" style sections
  whenever the user does not provide details.
triggers:
  - "release notes"
  - "changelog"
  - "what's new"
  - "version update"
  - "change log"
  - "release summary"
od:
  mode: prototype
  platform: desktop
  scenario: engineering
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "Write release notes for v2.3.1 with Added, Fixed, Breaking changes, Known issues, and an Upgrade note."
---

# Release Notes One-Pager Skill

Produce a single-page release notes document in HTML.

## Resource map

```
release-notes-one-pager/
├── SKILL.md                    ← this file
├── example.html                ← quality bar and style reference
├── assets/
│   └── template.html           ← local seed file to copy to project index.html
└── references/
    ├── checklist.md            ← P0 / P1 / P2 gates
    └── layouts.md              ← local section skeletons
```

Do not write CSS from scratch unless the user explicitly asks for a bespoke structure.

## Workflow

### Step 0 — Pre-flight

1. Read `assets/template.html`.
2. Read `references/layouts.md`.
3. Read active `DESIGN.md` and map it to the six `:root` variables.

### Step 1 — Start from the shared seed

Copy `assets/template.html` to project `index.html`.

Update:
- `<title>`
- topnav logo text
- topnav link labels (destinations are pre-wired to `#added`, `#fixed`, `#upgrade-note`)
- topnav CTA label and `href` destination, or omit the topnav CTA entirely if no real destination exists
- ensure the topnav link targets exist by adding matching section `id` attributes

### Step 2 — Build release-note structure

Inside `<main id="content">`, compose this section order:

1. Hero (Layout 1 or 2): version, date, one-sentence summary.
2. Added (use Layout 7 log-list; section root must include `id="added"`).
3. Fixed (use Layout 7 log-list; section root must include `id="fixed"`).
4. Breaking changes (use Layout 7 log-list, or one row explicitly saying "None"; section root must include `id="breaking-changes"`).
5. Known issues (Layout 7 or card list; section root must include `id="known-issues"`).
6. Upgrade note (short steps list or explicit no-action statement; section root must include `id="upgrade-note"`).
7. Closing CTA strip (Layout 6).

For every CTA in the emitted HTML (topnav, hero, closing strip), replace both the visible label and the `href` destination with real, safe values. If no real destination is available, omit the CTA entirely—do not use a placeholder such as `href="#"`, a misleading page-anchor, or `REPLACE_WITH_REAL_URL`. Hero CTAs are optional; only add them when real destinations exist.

### Step 3 — Honesty rules for missing details

If the user does not provide details, do not invent them. Write explicit placeholders:

- Summary: `No summary provided.`
- Added: `No additions provided`
- Fixed: `No fixes provided`
- Breaking changes: `None`
- Known issues: `None reported`
- Upgrade note: `No upgrade actions required based on provided information`

If release version or date is missing, use `—` and label the field rather than guessing.

### Step 4 — Self-check

Run `references/checklist.md`. Every P0 must pass.

### Step 5 — Emit artifact

Wrap output as:

```
<artifact identifier="release-notes-one-pager" type="text/html" title="Release Notes">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact. Nothing after `</artifact>`.
