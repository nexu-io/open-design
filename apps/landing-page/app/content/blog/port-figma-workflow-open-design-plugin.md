---
title: "How to port a Figma workflow into an Open Design plugin"
date: 2026-05-18
category: "Use cases"
readingTime: 6
summary: "The 0.8.0-preview thread asks contributors to port old design workflows one plugin at a time. Here is the concrete path for a Figma export, token sync, or brand kit."
---

A Figma workflow usually starts as muscle memory: export these frames, sync those tokens, rebuild that deck template, hand the spec to engineering.

The 0.8.0-preview thread makes a sharper ask: port that muscle memory into a plugin. Not a panel bolted onto a canvas. Not a private script only one team can run. A reusable Open Design workflow that an agent can pick up, execute, review, and hand off through the same local-first loop as any other design task.

This is the practical version of the [0.8.0-preview call for plugins](https://github.com/nexu-io/open-design/discussions/1727). If your team has one repeatable design workflow today, this post shows what it looks like to turn it into a plugin-shaped contribution.

## The workflow worth porting is smaller than you think

Do not start with "replace Figma." Start with one annoying, repeatable job.

Good first plugin candidates:

| Current workflow | Plugin-shaped version |
|---|---|
| Export a Figma marketing page and rebuild it in code | `figma-migration` plugin that extracts layout, maps tokens, and generates a web artifact |
| Turn a brand kit into launch slides every month | Deck plugin with a `SKILL.md`, example assets, and a locked design system |
| Create the same mobile onboarding mockup for every client | Mobile-screen plugin with input fields for audience, tone, feature list, and platform |
| Convert a component spec into Storybook-ready UI | Code-migration plugin that reads the repo, maps components, and writes a reviewable diff |

The unit is not the whole design department. The unit is one workflow someone already repeats twice a week.

That is why Open Design's [skill layer](/blog/why-we-built-open-design-as-a-skill-layer/) matters. A plugin is not an opaque runtime extension. It is a folder of files: a `SKILL.md` contract, optional design systems, optional examples, and an `open-design.json` sidecar that tells Open Design how to display and apply the workflow.

## The Open Design angle is portability

The plugin spec states the contract plainly: `SKILL.md` stays the executable agent contract, while `open-design.json` adds marketplace metadata, input fields, defaults, previews, and context wiring.

That gives one workflow two lives. In Open Design, it appears as a plugin with a preview, inputs, provenance, and a one-click "use" path. In Claude Code, Cursor, Codex, Gemini CLI, OpenClaw, or another skill catalog, the same folder still works as a plain agent skill because the core behavior lives in Markdown.

The [library walkthrough](/blog/31-skills-72-systems-how-the-library-works/) already explains the base primitives: skills, systems, adapters, and the daemon. Plugins add distribution and repeatability around those primitives.

For a Figma-to-code workflow, the surfaces usually look like this:

| Surface | Concrete file |
|---|---|
| Agent behavior | `SKILL.md` |
| Open Design metadata | `open-design.json` |
| Brand or visual contract | `design-systems/{brand}/DESIGN.md` |
| Example output | `example.html` or `examples/{plugin-id}/example.html` inside the plugin folder |
| Preview media | `preview/poster.png` or `preview/index.html` inside the plugin folder |

The result is not a screenshot generator. It is a reusable agent workflow with a visible contract.

## A concrete porting path

Here is the minimum path for a plugin that ports one Figma landing-page workflow:

1. **Name the repeatable job.** Example: "Turn one Figma marketing frame into a responsive Astro page."
2. **Write the skill contract.** Create `SKILL.md` with the input shape, output path, constraints, and review checklist.
3. **Add the Open Design sidecar.** Create `open-design.json` so the marketplace can show the title, description, required inputs, preview, and source repo.
4. **Attach the design system.** If the workflow depends on brand rules, add a `DESIGN.md` file instead of burying color and typography in prose.
5. **Include one real example.** Save a generated artifact under `examples/` so reviewers can judge the output, not just the promise.
6. **Validate and pack.** Run the plugin commands before opening a PR.

The current CLI path uses a lowercase plugin id. Avoid slash-separated
registry names at scaffold time; `od plugin scaffold` creates
`<out>/<id>/...`, so the follow-up commands point at that generated folder:

```bash
od plugin scaffold --id figma-workflow --title "Figma workflow" --out ./plugins/community
od plugin validate ./plugins/community/figma-workflow --no-daemon
od plugin pack ./plugins/community/figma-workflow
```

When the plugin is ready for registry review, authenticate through GitHub
with `od plugin login` and `od plugin whoami --json`, then follow the
publishing docs for the current review path. Open Design does not store
your GitHub credentials.

## What this looks like in a real design team

Imagine a small product team with a Figma frame for a launch page, a house brand system, and a monthly release rhythm.

Before the plugin, the workflow is a handoff chain: designer exports frames, engineer rebuilds layout, PM rewrites copy, someone checks token drift, someone else files bugs. The work is familiar, but the memory lives in people.

After the plugin, the workflow becomes a runnable artifact:

| Step | Who directs it |
|---|---|
| Choose the plugin | Designer or PM |
| Attach Figma URL / screenshot / local assets | Designer |
| Pick the brand system | Designer or design engineer |
| Generate the web artifact | Claude Code, Cursor, Codex, Gemini CLI, or another detected agent |
| Review section IDs, copy, density, and responsive behavior | Human in the Open Design preview |
| Export or hand off files | The same local project folder |

The team still needs taste. The plugin just stops making them re-explain the same workflow every release.

## What to do next

If your team has a Figma export, token sync, brand kit, or deck template that keeps coming back, port the smallest repeatable slice first. Start with a `SKILL.md`, add `open-design.json`, validate it, and open the PR before the workflow grows into a private tool nobody else can reuse. The screenshot-to-prototype example shows the plugin-shaped version: a portable skill plus an Open Design sidecar.

[Try this workflow](https://github.com/nexu-io/open-design/tree/main/plugins/spec/examples/import-screenshot-to-prototype).

## Related reading

- [31 skills, 72 systems: how the Open Design library works](/blog/31-skills-72-systems-how-the-library-works/) — the primitives a plugin wraps
- [Why we built Open Design as a skill layer, not a product](/blog/why-we-built-open-design-as-a-skill-layer/) — why the workflow is file-shaped instead of account-shaped
- [BYOK design workflow: run Claude, Codex, or Qwen on your own key](/blog/byok-design-workflow-claude-codex-qwen/) — how the same plugin can run on the model path your team already trusts
