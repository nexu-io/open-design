# Creation surfaces and skill modes

**Parent:** [`spec.md`](spec.md) · **Siblings:** [`architecture.md`](architecture.md) · [`skills-protocol.md`](skills-protocol.md) · [`agent-adapters.md`](agent-adapters.md)

Open Design has two related taxonomies:

- The **New Project UI** exposes six creation tabs: Prototype, Live Artifact,
  Deck, Template, Media, and Other. Media then selects Image, Video, or Audio.
- A `SKILL.md` carries one registry mode: `prototype`, `deck`, `template`,
  `design-system`, `image`, `video`, or `audio`.

They are intentionally not one-to-one. UI tabs describe the workflow a user
starts; skill modes describe how the daemon indexes and routes an instruction
bundle. The source of truth for the UI taxonomy is `CreateTab` and
`MediaSurface` in
[`NewProjectPanel.tsx`](../apps/web/src/components/NewProjectPanel.tsx). The
daemon parser and normalization rules live in
[`skills.ts`](../apps/daemon/src/skills.ts).

| Creation tab | Project metadata | Skill routing | Main distinction |
|---|---|---|---|
| **Prototype** | `kind: prototype` | Default `prototype` skill, replaced by a selected design template | Responsive web, mobile, tablet, or desktop-app interface work |
| **Live Artifact** | `kind: prototype`, `intent: live-artifact` | A live-artifact-capable `prototype` skill | High-fidelity, data-bearing or connector-backed artifact |
| **Deck** | `kind: deck` | Default `deck` skill, replaced by a selected design template | Slide navigation plus presentation export paths |
| **Template** | `kind: template` | A user-saved project template | Starts from a template created through Share rather than the built-in rendering catalogue |
| **Media** | `kind: image`, `video`, or `audio` | Matching media-mode skill | Provider/model, aspect, duration, voice, and prompt-template controls |
| **Other** | `kind: other` | No required skill | Free-form project surface |

## Prototype

Prototype is the general interface-design path. The user chooses one or more
platform targets, fidelity, optional OS-widget or landing-page options, a
design system, and optionally a rendering template from
`/api/design-templates`.

A selected Start from template replaces the tab's default skill as the
project's primary `skillId`. At run time the daemon resolves that id across the
functional-skill and design-template roots and injects the selected template's
`SKILL.md`; it does not automatically compose the default `prototype` skill
with the template. The catalogue/API separation is documented in
[`skills-protocol.md`](skills-protocol.md).

## Live Artifact

Live Artifact is a dedicated UI workflow backed by prototype-shaped project
metadata. It records `intent: live-artifact`, forces high fidelity, prefers the
`live-artifact` skill when present, and exposes connector configuration. Code
that branches on project kind alone must therefore also check the intent.

## Deck

Deck uses `deck` skills and deck-mode design templates. Speaker-note preference
is stored in project metadata. Preview and export behavior belongs to the deck
runtime and the selected template; it is not inferred from a historical list
of default deck names.

## Template

The Template tab lists templates the user previously saved through Share. It
does not use the bundled `design-templates/` catalogue as a fallback. A saved
template may carry its own platform, animation, and design-system choices.

This is distinct from a `SKILL.md` whose registry mode is `template`: registry
modes classify instruction bundles, while the tab represents a user-owned
project-template workflow.

## Media

Media groups three surfaces:

- **Image:** model and aspect ratio, plus an optional image prompt template.
- **Video:** model, aspect ratio, duration, and an optional video prompt
  template. The `hyperframes-html` model pins the HyperFrames skill.
- **Audio:** speech or sound, model, duration, and an optional voice for speech.

Media skill selection matches either the skill's mode or surface. Design-system
selection is hidden because these provider-backed generations use prompt
templates rather than the interface token pipeline.

## Other

Other creates a free-form project with no required skill id. It retains the
general platform and design-system controls and records `kind: other`.

## Design systems are a separate product surface

`design-system` remains a valid skill mode, but Design System is no longer one
of the New Project tabs. Users manage design systems through the dedicated
Design System product surface; project creation selects an active system where
the workflow supports it. Prototype, Deck, Template, and Other can apply a
design system. Live Artifact and Media currently hide that picker in the New
Project panel.

## Maintenance rules

- When a creation tab changes, update `CreateTab`, `TAB_LABEL_KEYS`, metadata
  construction, title/auto-name mappings, analytics target mapping, and this
  document together.
- When a skill mode changes, update the daemon's `SkillMode` parser, contract
  documentation, relevant catalogue entries, and UI filters together.
- Do not describe bundled rendering templates as functional skills. They live
  under `design-templates/` and are listed through `/api/design-templates`;
  functional capabilities live under `skills/` and are listed through
  `/api/skills`.
- Keep user-facing capabilities reachable through both the web UI and `od` CLI,
  following the repository-wide dual-track rule in the root `AGENTS.md`.

## Related implementation

- UI creation model:
  [`apps/web/src/components/NewProjectPanel.tsx`](../apps/web/src/components/NewProjectPanel.tsx)
- Skill registry and mode normalization:
  [`apps/daemon/src/skills.ts`](../apps/daemon/src/skills.ts)
- Shared project API contracts:
  [`packages/contracts/src/api/projects.ts`](../packages/contracts/src/api/projects.ts)
- Skill and rendering-template protocol:
  [`docs/skills-protocol.md`](skills-protocol.md)
