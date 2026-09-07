# Skills

This directory is reserved for **functional skills**: capabilities the agent invokes to do work on user input, such as briefs, audits, utilities, and asset packagers. This routing-validation branch intentionally ships no functional Skill folders. Its pinned template corpus is documented in [`skill-discovery-routing-catalog.md`](../specs/current/skill-discovery-routing-catalog.md).

Rendering shapes for prototypes, decks, documents, images, video, and audio belong in [`design-templates/`](../design-templates/), not here. The classification rule and migration history live in [`specs/current/skills-and-design-templates.md`](../specs/current/skills-and-design-templates.md).

## Adding a skill

Read [`docs/skills-protocol.md`](../docs/skills-protocol.md) for frontmatter, discovery, precedence, and mode semantics. Copy the closest functional skill, keep the folder self-contained, and use an explicit `od.mode` appropriate for work performed on user input.

For a rendering template, follow [`docs/skills-contributing.md`](../docs/skills-contributing.md) and [`design-templates/AGENTS.md`](../design-templates/AGENTS.md) instead.

## License

Preserve each imported Skill's own license and attribution alongside its files.
