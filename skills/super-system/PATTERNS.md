# Super-System Patterns

> 15 cross-cutting rules distilled from 14 production-grade videos. The agent threads these into the system prompt at generation time, so every premium site/app build inherits the strongest patterns the field has converged on.

Use these as defaults. Override only when the brief specifically demands it.

---

## 1. Multi-Model Orchestration (Manager-Agent Pattern)

Treat each CLI as a specialist, not a competitor. One model proposes, another critiques, a third implements.

- **Claude Code** — best at design taste, copy, motion choreography, refactoring
- **Codex (GPT-5.5)** — best at logic, schema design, multi-file edits, tests
- **Cursor** — best at fast in-editor iteration with grounded context
- **Gemini 3.1 Pro** — best at long-context reading, raw HTML/CSS extraction, image-to-code

Fire the same brief at all four (`runner.html` does this), then synthesize the winning output. Never trust a single model's design intuition.

## 2. Reference Assets Don't Describe — They Anchor

Words like "modern, premium, clean" are noise. Replace every adjective with a reference:

- **A screenshot** of the exact site/section the user is referencing
- **A Mobbin URL** (`mcp__mobbin__search_screens` returns 6–12 frames)
- **A Dribbble/Awwwards link**
- **A pasted HTML/CSS dump** from a site you cloned via Firecrawl

The agent reads pixels and DOM. Adjectives produce slop; references produce specificity.

## 3. Two-Prompt Site Pattern

Premium sites need two passes, never one:

1. **Structure pass** — "Build the marketing site for X. Sections: hero, problem, solution, social proof, pricing, footer. Use [reference]. Tailwind + framer-motion."
2. **Polish pass** — "Now make the hero feel like [Awwwards reference]: scroll-driven type reveal, frame-sequence ScrollTrigger, slow tonal shift on dark mode."

One-shot prompts produce shapeless drafts. Two-pass with reference-anchored polish produces shipped sites.

## 4. Atomic Iteration with Checkpoint/Restore

After every meaningful change, snapshot:

- **Git** — commit on every passing build (`git add -A && git commit -m "checkpoint: hero v3"`)
- **Replit/Bolt/Lovable** — use the platform's "checkpoint" button before regenerating
- **Antigravity** — pin the working branch

When the agent goes off-track (it will), revert in seconds instead of unraveling for an hour.

## 5. Frame Sequences, Not Videos

For premium scroll-driven hero motion, do NOT embed `<video>`. The pattern that ships:

1. Render the motion as 60–120 PNG/WebP frames at 1.5x display res
2. Preload with `<link rel="preload">`
3. Bind to `ScrollTrigger` or `IntersectionObserver` — `frameIndex = Math.floor(scrollProgress * frames.length)`
4. Draw to a `<canvas>` at 60fps

Result: instant playback, scrubbable both directions, zero codec issues, premium on iOS Safari.

## 6. Style/Skill Memory > Per-Prompt Styling

Lock the design system to a persistent file, not a paragraph in each prompt. Open Design's `design-systems/<brand>/` folders are the canonical pattern:

- `tokens.css` — every color, font, radius, shadow
- `DESIGN.md` — the prose spec (what makes this brand feel like itself)
- `components.html` — visible reference components

The agent reads these on every generation. Restating "use cobalt #1F62B0" in every prompt is wasted context — load it once via skill activation.

## 7. Outcome-First Prompts

Lead with the user outcome, not the implementation:

- ❌ "Add a nav bar with logo on left and 4 links on right with a CTA button"
- ✅ "Make the visitor understand in 3 seconds that this is a fiduciary tool — calm, navy, no marketing scream"

The model picks the right primitives. Outcome-first prompts also survive model upgrades.

## 8. Full-Stack-in-One

Tools like Base44, Bolt, Replit, Lovable, AI Studio all collapse frontend + backend + db + auth + deploy into one prompt. Use this for prototypes and demos.

Do NOT use full-stack-in-one for production payments, PII, or anything regulated — the auth layer is convenient but unaudited.

## 9. Annotate-to-Edit Beats Re-Prompt

When iterating on an existing screen, switch from words to pixels:

1. Screenshot the current state
2. Open in Preview/Figma/Excalidraw
3. Draw red arrows + short notes ("smaller", "more spacing here", "move to row 2")
4. Paste annotated image back to the agent — "apply these edits"

3 annotations beats 20 prompts. The model sees what you mean.

## 10. Awwwards / Dribbble / Mobbin Are the Reference Library

Stop inventing layouts. Three sources cover 95% of taste needs:

- **Awwwards** — high-budget marketing sites, motion, full-screen experiences
- **Dribbble** — single-screen visual ideas, color systems, micro-interactions
- **Mobbin** — production mobile/web app flows from real apps (Outlook, Linear, Notion, Bumble, Monarch, …)

Search Mobbin first via `mcp__mobbin__search_screens` — it returns frames from shipped apps that already solved your IA problem.

## 11. Pull HTML + CSS + JS, Don't Re-Build From Scratch

To clone a site faithfully:

1. **Firecrawl** (`mcp__firecrawl__firecrawl_scrape` with `formats: ["html", "rawHtml"]`) — pulls the full DOM + CSS
2. **Figma MCP** — when designer source exists, prefer this
3. **Gemini Canvas image-to-code** — for purely visual references with no DOM

Then strip noise (analytics, ads, tracking pixels), rewrite to your framework, keep the layout + tokens + motion DNA.

## 12. Agent-as-Manager

For complex builds (3+ screens, auth, db, motion), use a planner+executor split:

- **Planner agent** writes a step-by-step plan with file paths and verify checks
- **Executor agent(s)** implement one step, run the verify check, commit, hand back

Open Design's daemon spawns these via `/api/agents`. The runner UI shows progress per agent. Don't try to one-shot a 12-screen app.

## 13. Green-Screen Compositing for Product Shots

For SaaS hero images, e-com product photography, or hero video plates, use Nano Banana / VO 3.1 / Seedance with green-screen prompts:

```
Photo of [product] on a solid #00FF00 background, studio lighting, 50mm lens, no shadow on the green
```

Then key it out in Canvas/FCPX and composite into the hero. Beats trying to generate the full scene in one shot — the bg is always wrong.

## 14. Conversational Iterative Editing

Treat the build like pair programming, not RPC:

- Short turns ("hero spacing too tight")
- Specific scope ("only the pricing card, not the rest")
- Verify before next ask ("looks right, now do mobile")

Long monolithic prompts cause drift. Many short turns with checkpoints stay on-track.

## 15. QA Loop in the Editor

Don't ship without a built-in QA pass. The shipped pattern:

1. Run the dev server
2. Open in browser via `mcp__chrome-devtools__navigate_page`
3. Take a snapshot (`take_snapshot`) — model sees the rendered DOM
4. Diff vs reference — agent self-critiques, makes one fix, re-snapshots
5. Loop until snapshot matches reference within tolerance

TestSprite MCP automates this loop. For one-shots, manual snapshot+critique is enough.

---

## How the Agent Uses These

When `super-system` activates:

1. Reads this file into its system prompt
2. Reads `RESEARCH.md` (the source material)
3. Reads the requested `design-systems/<brand>/` folder
4. Generates with all 15 rules as defaults
5. If the user clicks "Run all CLIs" in `runner.html`, fires the same brief to Claude/Codex/Cursor/Gemini in parallel and returns a side-by-side comparison

---

## Source Videos

The full breakdown of which rule came from which video lives in [`RESEARCH.md`](RESEARCH.md). Quick map:

| Rule | Primary Source |
|---|---|
| 1, 12 | Antigravity multi-agent, Codex+GPT-Taste shootout |
| 2, 9 | Mobbin onboarding research, annotate-to-edit demos |
| 3, 14 | Awwwards site teardown, Claude Design |
| 4 | Antigravity 3D scroll, Replit/Bolt checkpoint demos |
| 5 | Awwwards teardown frame-sequence pattern |
| 6 | Claude Design skill memory, AI Studio mastery |
| 7 | Base44, Lovable outcome-prompt patterns |
| 8 | Base44 shootout, Bolt/Replit/Lovable comparison |
| 10, 11 | 3 cloning methods (Gemini Canvas + Figma MCP + Firecrawl) |
| 13 | Nano Banana Pro product photography |
| 15 | TestSprite, browser-harness QA patterns |
