---
name: personal-blog-projects
description: |
  Personal Blog Projects is a multi-page case library for excellent personal
  blogs, digital gardens, indie developer sites, and reusable blog-building
  projects. It captures site, page, and block-level references with source
  URLs instead of copying external assets.
triggers:
  - "personal blog projects"
  - "personal blog"
  - "digital garden"
  - "developer blog"
  - "indie blog"
  - "个人博客"
  - "独立博客"
  - "数字花园"
category: personal-blog-project
captured: "2026-06-12"
batch: "personal-blog-projects"
od:
  mode: prototype
  surface: web
  platform: desktop
  scenario: personal-brand
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
---

# Personal Blog Projects

Use this entry as a case library, not as a single homepage template. Personal
blogs are valuable because their strongest patterns often live in individual
pages and small blocks: article pages, archive rhythm, sidenotes, digital
garden backlinks, search, weeklies, reading lists, project indexes, interactive
essays, and RSS/subscription surfaces.

## Resource Map

```text
personal-blog-projects/
|-- SKILL.md
|-- example.html
`-- references/
    `-- catalog.json
```

`references/catalog.json` is the source of truth. Keep the preview small and
original; do not mirror external sites, screenshots, source code, or brand
assets unless the source license explicitly allows that use.

## Capture Contract

For every site or project, record:

- `site`: name, author, primary URL, language, region, site type, feed URL,
  source URL, and license status.
- `why`: why this blog is worth keeping as design reference.
- `pages`: page-level references with exact URLs, page type, what to study,
  and reusable design notes.
- `blocks`: smaller reusable patterns such as sidenotes, table of contents,
  code playgrounds, archive rows, project cards, backlinks, search, comments,
  sponsorship, and RSS subscription prompts.
- `implementation`: framework, theme, content format, search, RSS, SEO, dark
  mode, comments, deployment, and build complexity when known.
- `capture`: capture date, source links, attribution, reuse policy, and
  capture depth.

If only the homepage was inspected, set `capture.captureDepth` to
`homepage-only`. Do not infer full-site patterns from a single page.

## Page Types

Allowed page types include `home`, `post`, `archive`, `tags`, `project`,
`about`, `now`, `garden`, `newsletter`, `reading-list`, `library`,
`interactive-essay`, `search`, and `404`.

## Use In Future Work

When designing or reviewing a personal blog:

1. Pick 2-3 reference sites from `catalog.json` that match the user's intent.
2. Inspect page-level entries before deciding layout; do not default to a
   homepage-only design.
3. Reuse patterns as principles: hierarchy, navigation, page rhythm, metadata,
   linking model, and interaction behavior.
4. Preserve attribution links in any notes or final documentation.
