---
name: "Discovery Questions"
description: "Claude design system prompt skill for Discovery Questions"
triggers:
  - "claude discovery questions"
od:
  category: prompt-library
  upstream: "https://github.com/Trystan-SA/claude-design-system-prompt"
---
# Discovery Questions: Kickoff Question Protocol

Run a structured question round at the start of new or ambiguous design work. **Asking good questions is the single biggest lever for design quality** — bad designs come from missing context, not missing skill.

## Phase 1: Read what's already attached

Before asking anything, read every attached resource — codebases, screenshots, brand guides, linked design systems or UI kits, the stated brief. Asking "do you have a brand guide?" when they just attached one is the fastest way to lose the user's confidence.

## Phase 2: Decide whether to ask

**Ask when** the work is new or ambiguous; the output, audience, or fidelity is unclear; you don't know which design system, UI kit, or brand is in play; the variation count is unspecified; or the task leaves multiple non-trivial dimensions open.

**Skip when** the user gave you everything; it's a small tweak or follow-up; scope, audience, and constraints are explicit; or the task is "recreate this exact thing."

If the open question changes the design's direction (audience, format, brand, scope), ask. If it's a minor choice you can defensibly make yourself (a label, a default value, two equivalent approaches), decide, build, and note the decision in your summary instead of asking.

## Phase 3: Build the question set

Include the following **always-ask** questions, plus the problem-specific questions the brief actually leaves open (typically 3–6):

- **Starting point** (non-negotiable — starting hi-fi work without context produces bad design). "Is there a UI kit, design system, codebase, brand guide, or screenshots I should match? If not, I'll need to commit to an aesthetic from scratch — confirm that's OK."
- **Variations.** How many of the overall design? On what axes (visual, layout, interaction, copy, tone)? Variations of specific elements ("how many heroes?")?
- **Novelty.** By-the-book, novel/creative, or a mix?
- **Tweaks.** What should be adjustable live in the final design (colors, copy, layout, components)?
- **Focus axis.** Flows, copy, or visuals — where should exploration effort go?

Problem-specific examples:

- **Deck:** audience and knowledge level; time budget / slide count; tone; speaker notes; existing source material?
- **Landing page:** desired user action; primary persona; references admired or rejected; mobile-first or desktop-first?
- **Prototype:** flow and screens; hi-fi or mid-fi; device frame; goal state; sample data?
- **Brand / aesthetic:** three adjectives; admired designs (and what specifically); off-limits; industry context?

Size the round to the ambiguity: a genuinely open brief may warrant ~10 questions; a half-specified one may need only 3–4. Never pad the round to hit a number — a question whose answer wouldn't change what you build is noise.

## Phase 4: Format the question round

Use the `questions_v2` tool — it renders native form components the user answers in a structured way. Per question:

- **Prefer multiple choice**; always include "Explore a few options" and "Decide for me" as escape hatches, plus "Other" for open-ended fallback
- **SVG options** for visual choices (layout, icon style, color swatch, mood); **sliders** for numeric ranges (generous bounds); **file-pickers** for assets; **freeform** for genuinely open questions

Order most-important-first — the form streams in, and the user can start answering before the rest loads. Keep titles short; subtitles are optional clarifications.

## Phase 5: End the turn, then confirm

`questions_v2` does not return an answer immediately — after calling it, **end your turn**. Don't anticipate answers and proceed. When answers come back, read all of them, then:

- Briefly recap the choices that most affect the design
- Note answers you'd push back on (gently — the user is the manager)
- Proceed to the appropriate building skill (`make-a-deck`, `make-a-prototype`, `wireframe`, etc.) and execute autonomously. This round was your chance to ask — don't come back with follow-up questions for minor decisions; make them and list them in your summary.

If you later discover an early answer was wrong (e.g., the user said "no novel ideas" but their feedback wants bolder choices), surface the contradiction and re-question rather than carrying the wrong assumption.

## Anti-patterns

- **Don't skip asking.** "I'll just start building" produces designs that miss the brief.
- **Don't ask everything.** Cap around 10–15; bundle into one form, not one-at-a-time across turns.
- **Don't ask what you can derive.** If the attached brand guide has the primary color, don't ask for it.
- **Don't ask to be safe.** A question is justified by the design impact of its answer, not by your uncertainty.
