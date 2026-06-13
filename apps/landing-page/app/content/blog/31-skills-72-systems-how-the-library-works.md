---
title: "31 skills, 72 systems: how the Open Design library works"
date: 2026-05-13
category: "Guides"
readingTime: 6
summary: "A walk through the four primitives that make Open Design composable: skills, systems, adapters, and the daemon. With concrete examples of how a Markdown file becomes a pixel-perfect deliverable."
---

Open Design is, mechanically, four primitives stacked on top of each other:

1. **Skills** — what the agent should do
2. **Systems** — what the output should look like
3. **Adapters** — which agent does the work
4. **The daemon** — the loop that wires them together

Each primitive is a folder of files. None of them require a database, a plugin runtime, or a hosted service. This post walks through each in turn and shows what happens when you point your agent at a real brief.

## Skills: the unit of capability

A skill is a folder containing one `SKILL.md` and zero or more supporting files. The Markdown file is the agent's contract. A typical skill looks like this:

```
skills/
  guizang-ppt/
    SKILL.md
    templates/
      magazine.html
    examples/
      product-launch.html
      pitch-deck.html
```

`SKILL.md` declares the skill's name, the trigger conditions, the input shape, the output shape, and any inline guidance for the agent. When the daemon boots, it scans `skills/` and registers every folder containing a `SKILL.md`. There is no plugin manifest. There is no version field. There is the file, and the file is the source of truth.

We currently ship 31 skills. Some are deck generators, some produce mobile mockups, some build editorial pages, some write office documents (Word, Excel, PowerPoint). Each one is a folder you can fork, edit, or replace.

## Systems: the unit of taste

A system is a `DESIGN.md` file plus optional reference assets. It describes a visual identity in machine-readable form:

- **Color** — OKLch values for foreground, background, accent, error, and so on
- **Type** — font stack, weights, the type ramp, line-height conventions
- **Space** — base unit, spacing scale, container widths, gutter rules
- **Layout posture** — grid choices, asymmetry rules, density preferences
- **Voice** — typography of words: tone, vocabulary, sentence rhythm

We ship 72 systems out of the box, including portable versions of Linear, Vercel, Stripe, Apple, Cursor, Figma, and a long tail of editorial and brand systems.

A system is not a Figma library. There are no components, no variants, no nested instances. It is a contract that any agent can read and any human can audit. The cost of writing your own is roughly 30 minutes of focused work.

## Adapters: the unit of agent

An adapter is a small TypeScript file in `adapters/` that knows how to:

- detect whether the agent is installed on the user's `$PATH`
- start a session with that agent
- pipe a skill invocation in
- collect the output back

We ship adapters for 12 agents today: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, Devin, Hermes, Pi, Kimi, Kiro, Qwen. The daemon auto-detects which ones are present and offers them as a dropdown on first boot.

If you want to add a new adapter, the file is roughly 80 lines of TypeScript and a single `register()` call. No SDK to learn, no permission to request.

## The daemon: the loop that ties it together

The daemon is a small Node process you start with `pnpm tools-dev`. It does four things:

1. **Detect** — scans `$PATH` for installed agents and `skills/` for installed skills, on boot
2. **Discover** — opens an interactive question form to pin down surface, audience, tone, scale, and brand context for the current brief
3. **Direct** — presents 5 deterministic visual directions (palette in OKLch, font stack, layout posture cues) and asks the user to pick one
4. **Deliver** — invokes the selected skill with the locked-in system, lets the agent write to disk, and previews the output in a sandboxed iframe

The whole loop fits in roughly 1500 lines of code. It is intentionally small. The cleverness is in the skills, not in the runtime.

## What it feels like in practice

Suppose you want a launch deck for a new product feature. Here's the flow:

1. You run `pnpm tools-dev` in a terminal. The daemon starts on `localhost:7780`.
2. You open the URL. The daemon shows you which agents it found (e.g. Claude, Cursor, Codex).
3. You pick `guizang-ppt` from the skill list.
4. A 30-second question form pops up: who's the audience, what's the tone, what's the brand context.
5. You're shown 5 visual directions — different palettes, type pairings, layout postures. You pick one.
6. The agent writes to disk. A sandboxed iframe shows the result. You can export to HTML, PDF, PPTX, ZIP, or Markdown.

The output is real. The files are yours. You can edit them in any editor, hand them to a designer, or feed them back into another skill.

## Why files, not a database

Every primitive — skills, systems, adapters — is a folder of text files. There is no central database. There is no "Open Design account." There is no hosted service that has to keep working for your work to keep working.

This is a deliberate trade. We give up the ability to do clever cross-user analytics, cross-project memory, or hosted collaboration. We get back: portability, longevity, auditability, and the ability for anyone to fork the entire library and ship their own variant.

If you've watched a generation of design tools die taking your files with them, you'll understand why this trade is worth it.
