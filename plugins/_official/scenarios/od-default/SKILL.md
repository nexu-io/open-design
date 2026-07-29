---
name: od-default
description: Hidden fallback scenario for free-form Home prompts. Infer the route from the prompt and ask only when a critical ambiguity remains.
od:
  scenario: default-router
  mode: scenario
---

# od-default (hidden scenario)

This plugin runs only when the user types a free-form Home prompt without
choosing one of the visible category chips. It is the design-engine
fallback, not a visible catalog entry.

## Route the query first

Infer the task type from the current user query first. Use the query's nouns,
requested output, attached references, project metadata, and locked
conversation context instead of treating a free-form Home prompt as missing a
route by default.

- A request for screens, flows, an app, a dashboard, or an interactive product
  routes to `Prototype`.
- A request for a landing page, marketing site, brand website, or editorial page,
  or another standalone HTML/CSS/JS experience, routes to `Live artifact`.
- A request for slides, a pitch, a presentation, or a deck routes to `Slide deck`.
- A request whose final deliverable is a still image, motion/video, HyperFrames
  sequence, or audio routes to `Image`, `Video`, `HyperFrames`, or `Audio`.
- Use `Other` only when none of those deliverables fits.

When one route is clear, skip `<question-form>` and continue directly through
that workflow. Do not ask the user to confirm an inference the query already
supports. Missing audience, brand, tone, or scale alone does not automatically
block execution; use the core charter's defaults unless a different answer
would materially change the result.

## Clarify only a material ambiguity

The binding host clarification gate owns whether the workflow pauses. If two
or more materially different routes remain plausible, ask only for the
unresolved decisions; never revive the old fixed questionnaire.

- Include `taskType` only when the route itself is ambiguous. Use
  `<question-form id="task-type">`, `type: "radio"`, `allowCustom: false`, and
  the canonical routing values `Prototype`, `Live artifact`, `Slide deck`,
  `Image`, `Video`, `HyperFrames`, `Audio`, and `Other`.
- For any other material gap, omit `taskType`, use
  `<question-form id="discovery">`, and follow the core contract. It owns
  query-derived questions, defaults, localization, files, controls, and turn
  stopping.

## Continue after an answer

When the user replies with `[form answers — task-type]` or
`[form answers — discovery]`, bind the submitted decisions as authoritative
and continue:

- `Prototype`: run the normal new-generation prototype flow.
- `Live artifact`: create a live HTML/CSS/JS artifact and register it for
  preview when tooling is available.
- `Slide deck`: follow the deck workflow and framework rules.
- `Image`: plan a concrete image prompt, then use the OD media generation
  CLI for image output.
- `Video`: plan shots, duration, aspect, and motion, then use the OD media
  generation CLI for video output.
- `HyperFrames`: create HTML-driven motion frames or a HyperFrames-ready
  motion artifact before rendering/exporting.
- `Audio`: plan voice/music/SFX intent, then use the OD media generation
  CLI for audio output.
- `Other`: ask only the minimum follow-up needed, then choose the closest
  Open Design workflow and continue.

Do not emit a second brief form for decisions the user just answered. Proceed
directly to planning, generation, and critique. Do not tell the user to go back
and choose a chip; the default plugin owns this fallback.
