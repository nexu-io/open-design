# What an OD skill folder looks like

Reference for the `od-contribute` skill's `validate-skill-submission.sh` step and for guiding a user through assembling a Skill submission.

> **Authoritative source**: read 1–2 existing folders under `skills/` in `nexu-io/open-design` at runtime — conventions evolve faster than this doc.

## Minimum viable skill

```
skills/<your-skill>/
└── SKILL.md          # required, must have YAML frontmatter
```

That's it. Many of the simplest skills in OD are exactly that: one Markdown file in one folder.

## Frontmatter — what `validate-skill-submission.sh` requires

```yaml
---
name: <kebab-case-slug>           # required; usually matches the folder name
description: |                    # required; one paragraph; what the skill does in user terms
  Generate and iterate ad creative including headlines, descriptions, and primary text.
triggers:                         # optional but strongly recommended
  - "ad creative"
  - "ad headline"
od:                               # optional; OD-specific metadata
  mode: design-system             # or other modes; check existing skills
  category: <category-slug>
  upstream: "https://github.com/..."  # if the skill was lifted from somewhere
---
```

**Required by validator**: `name`, `description`. Everything else is convention.

## Body conventions (after the frontmatter)

Looking at existing skills, the typical body has:

1. `# <skill-name>` H1.
2. A one-line "what it does" sentence.
3. Optional `## Source` block when adapted from upstream (with attribution).
4. `## How to use` with one or two example prompts the user might type.

## When a skill folder needs more than `SKILL.md`

- **Reference assets** — long prompt fragments, example outputs, image references — go alongside `SKILL.md` in the same folder, referenced via relative paths in `SKILL.md`.
- **Subfolders** are fine: the validator only requires that every relative reference inside `SKILL.md` resolves and that no path escapes the skill folder.

## Don'ts

- Don't put runtime code in here. Skills are *content* — Markdown + maybe assets. Code adapters live in `apps/daemon/src/`.
- Don't reference files outside `skills/<your-skill>/` — that breaks portability.
- Don't put binaries you don't need (the lighter the folder, the easier the review).
