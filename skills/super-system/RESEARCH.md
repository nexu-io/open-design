# Super-System Research

> Full synthesis of 14 production-grade videos covering design + AI-coding workflow. Source material for [`PATTERNS.md`](PATTERNS.md). The agent reads this at generation time to ground itself in concrete tool stacks and prompt strategies.

---

## Video Index

| # | YouTube ID | Topic |
|---|---|---|
| 1 | Qsq-Sj_rojU | Mobbin onboarding research playbook |
| 2 | numKPyO3FTA | Antigravity multi-agent site clone |
| 3 | Lnkv0-GLU3w | Google AI Studio + Gemini 3.1 Pro |
| 4 | PFO01z7Qe38 | GPT-5.5 + Codex + GPT-Taste shootout |
| 5 | EzFjqu1DUO0 | Base44 site shootout vs Bolt/Replit/Lovable |
| 6 | AyUffXDwoSY | Dribbble → Kling animated sites |
| 7 | E1y7fLWLI0s | AI Studio mastery — long context, multi-modal |
| 8 | e7ngdzwzRZ0 | Claude Design — skill memory + design systems |
| 9 | krBzfkpFPP8 | 3D scroll sites via Antigravity |
| 10 | YDqqRqqlnJU | browser-harness for autonomous QA |
| 11 | j74kjYvzzLk | Jesco Jets full-site clone |
| 12 | zmP8Pl-MJXw | 3 website-cloning methods (Gemini Canvas + Figma MCP + Firecrawl) |
| 13 | i-jawzwnjSA | Awwwards / Claude Code teardown |
| 14 | tSDSSJlHFL4 | Nano Banana Pro product photography |

---

## Batch A — Videos 1-5

### 1. Mobbin Onboarding Research (Qsq-Sj_rojU)

**Topic.** How to use Mobbin as a primary research tool before designing onboarding flows.

**Workflow.**
1. Search by IA pattern, not by app name — "expense category picker", "first-time-budget flow", "OAuth grant screen"
2. Mobbin returns 6–12 frames from real apps that solved the same problem
3. Copy the IA, not the brand — recombine flows from 3 apps into your screen
4. Save flows to a Mobbin "collection" so you can come back

**Stack.** `mcp__mobbin__search_screens`, Mobbin web for visual browsing, Figma for recomposition.

**Anti-patterns.**
- Cloning a single Mobbin flow 1:1 — derivative
- Searching by app name first — leads to mimicry, not pattern thinking
- Ignoring small apps because they're niche — niche apps often have the cleanest flows

### 2. Antigravity Multi-Agent Site Clone (numKPyO3FTA)

**Topic.** Spawning multiple agents in Antigravity to clone an Awwwards-tier site in parallel.

**Workflow.**
1. **Planner agent** — reads the reference site, writes a step plan (files, components, motion choreography)
2. **Layout agent** — implements HTML/CSS structure section-by-section
3. **Motion agent** — adds ScrollTrigger, GSAP, frame sequences after layout is stable
4. **QA agent** — opens the dev server, snapshots, diffs vs reference, fixes drift

Each agent runs in its own branch with checkpoint commits; merges happen via PRs the human reviews.

**Stack.** Antigravity multi-agent, GSAP, ScrollTrigger, Tailwind, framer-motion.

**Key insight.** No single agent can hold a 12-section premium site in context. The split-and-merge pattern is non-negotiable above ~4 sections.

### 3. Google AI Studio + Gemini 3.1 Pro (Lnkv0-GLU3w)

**Topic.** Why Gemini 3.1 Pro's 2M context window changes the cloning workflow.

**Workflow.**
1. Dump the full HTML + CSS + JS of the reference site (Firecrawl)
2. Paste into AI Studio as raw text (don't summarize)
3. Ask "rewrite this in Next.js 14 App Router with Tailwind, keep the visual identity exact"
4. Gemini outputs file-by-file — paste back into your repo

**Stack.** AI Studio web, Gemini 3.1 Pro, Firecrawl scrape with `formats: ["rawHtml"]`.

**When this beats Claude.** When the reference has 8000+ lines of CSS or weird custom JS — Gemini reads it all, Claude truncates.

**When this loses.** When the visual taste matters more than the structure — Gemini ports faithfully but doesn't *improve*.

### 4. GPT-5.5 + Codex + GPT-Taste Shootout (PFO01z7Qe38)

**Topic.** Comparing GPT-5.5-Codex (logic) vs the new "GPT-Taste" mode (design judgment).

**Findings.**
- **GPT-5.5-Codex** wins on multi-file refactors, schema design, complex state machines, tests
- **GPT-Taste** wins on color choice, type scale, motion timing, microcopy
- Combine: use Taste for the brief, Codex for the implementation

**Workflow.**
1. Taste mode generates a `DESIGN.md` from a reference + brief
2. Codex reads `DESIGN.md` and implements the React + Tailwind
3. Taste reviews the final render in a screenshot

**Stack.** Codex CLI (`codex` command), OpenAI dashboard for Taste mode, screenshot diffing.

**Anti-pattern.** Asking Codex to "make it beautiful" — it produces shape but not taste. Use Taste for that judgment layer.

### 5. Base44 Site Shootout (EzFjqu1DUO0)

**Topic.** Base44 vs Bolt vs Replit vs Lovable on the same brief.

**Brief.** "Build a marketing site for a B2B SaaS with auth, billing, and an admin dashboard. Premium feel."

**Findings.**
- **Base44** — fastest to first render (2 min), opinionated stack (Next.js + Supabase), good defaults
- **Bolt** — best for one-shot landing pages, weaker on auth
- **Replit** — best for prototypes with custom backends, slowest first render
- **Lovable** — best taste out-of-box, weakest at multi-page sites

**Pattern that wins across all four.** Outcome-first prompts ("visitors should understand we're for finance teams in 3 seconds") beat feature-list prompts.

**Anti-pattern.** Asking any of them to "add Stripe" without specifying which checkout flow (one-time / subscription / metered). They all pick differently.

---

## Batch B — Videos 6-10

### 6. Dribbble → Kling Animated Sites (AyUffXDwoSY)

**Topic.** Turning static Dribbble shots into shipped animated marketing sites.

**Workflow.**
1. Pick a Dribbble shot with strong motion intent (parallax, scroll reveal, magnetic buttons)
2. Use Kling AI to generate the missing motion frames (the shot is one frame; you need 30+)
3. Feed frames + still into Claude/Codex — "build me this as a Next.js site with framer-motion"
4. Refine with annotate-to-edit (red arrows on screenshots)

**Stack.** Dribbble, Kling AI, framer-motion, Lottie for vector micro-motion.

**Trick.** Kling can generate "what if this Dribbble shot had a 3-second scroll animation?" — gives you a video reference the agent can mirror in code.

### 7. AI Studio Mastery (E1y7fLWLI0s)

**Topic.** Advanced AI Studio patterns — system instructions, structured output, image-to-code at scale.

**Workflow.**
1. **Persistent system instruction** — paste your design system DOCS into the system prompt slot, NOT into each user message
2. **Structured output mode** — ask for JSON with file names + content, then paste back into your repo
3. **Image-to-code chaining** — first ask Gemini to describe the image in pixel-precise prose, then ask it to write code for that prose. Two-step beats one-shot.

**Stack.** AI Studio, Gemini 3.1 Pro, JSON mode, Tailwind/Next.

**Key.** AI Studio's "save system instruction" is the closest thing to a Claude skill — use it as a brand anchor.

### 8. Claude Design — Skill Memory + Design Systems (e7ngdzwzRZ0)

**Topic.** How Anthropic's Claude Design feature persists design taste across prompts.

**Workflow.**
1. Define a "skill" with a name, description, triggers, and a body
2. Body contains design tokens, copy voice, component patterns, motion philosophy
3. Claude activates the skill on trigger words, threads it into the system prompt
4. Every generation in that session inherits the design system

**This is exactly the pattern Open Design `design-systems/` and `skills/` directories implement.** Use existing `design-systems/<brand>/DESIGN.md` files as the brand anchor; use `skills/<slug>/SKILL.md` for cross-cutting playbooks like this one.

**Stack.** Claude Design, Open Design daemon, skills/ folders.

**Anti-pattern.** Restating design tokens in every prompt — wastes context and produces drift. Skill memory is the fix.

### 9. 3D Scroll Sites via Antigravity (krBzfkpFPP8)

**Topic.** Building Awwwards-tier 3D scroll experiences with Antigravity + Three.js.

**Workflow.**
1. Reference frame: an Awwwards SOTD site with a 3D hero
2. Spawn a Three.js agent to write the scene (geometry, materials, lights)
3. Spawn a scroll agent to bind camera position to scroll progress
4. Compose: scroll agent calls the Three.js agent's `setCameraTarget(progress)`

**Stack.** Antigravity, Three.js, react-three-fiber, drei, ScrollTrigger.

**Anti-patterns.**
- Putting Three.js inside a `<video>` tag — defeats the point
- Loading multi-MB GLB models without LOD — kills mobile
- Not using `frameloop="demand"` — burns battery for nothing

### 10. browser-harness for Autonomous QA (YDqqRqqlnJU)

**Topic.** Using browser-harness (or chrome-devtools MCP / claude-in-chrome) to let the agent QA its own output.

**Workflow.**
1. Agent writes a feature
2. Agent runs `dev` server
3. Agent navigates to the page via browser-harness or chrome-devtools MCP
4. Agent takes snapshot (DOM tree + screenshot)
5. Agent diffs snapshot vs reference / vs acceptance criteria
6. Agent fixes drift, loops

**Stack.** browser-harness (`~/.local/bin/browser-harness`), chrome-devtools MCP, claude-in-chrome MCP, Playwright for headless.

**Anti-pattern.** Marking a PR done before the snapshot loop has converged. Snapshot first, then claim done — see `accuracy-guard.md` "Verify before claiming done".

---

## Batch C — Videos 11-14

### 11. Jesco Jets Full-Site Clone (j74kjYvzzLk)

**Topic.** End-to-end clone of a high-end private-jet marketing site.

**Workflow.**
1. Firecrawl scrape with `formats: ["html", "rawHtml", "screenshot"]`
2. Save the screenshot + HTML to disk
3. Ask Claude Code: "Match this HTML structure but rewrite to Next.js App Router. Match this screenshot's visual identity exactly."
4. Iterate per-section with annotated screenshots
5. Replace stock copy with the user's own brand copy at the end

**Stack.** Firecrawl, Claude Code, Next.js, Tailwind.

**Trick.** Asking the agent to first inventory the site ("list every section, every component, every color, every font, every motion effect") gives you a checklist you can verify against.

### 12. Three Website-Cloning Methods (zmP8Pl-MJXw)

**Topic.** Side-by-side comparison: Gemini Canvas image-to-code vs Figma MCP vs Firecrawl scrape.

**When each wins.**
- **Gemini Canvas** — visual reference only, no Figma source, no live site (or live site is paywalled)
- **Figma MCP** — designer source exists, want pixel-perfect tokens, component variants
- **Firecrawl** — live site exists, want to preserve exact HTML structure + animations + microcopy

**Hybrid pattern.** Firecrawl for structure + Figma MCP for tokens + Gemini Canvas for the missing custom illustrations. Use all three.

**Anti-pattern.** Picking one method dogmatically. Each has a 30% miss rate; combining drops that to ~5%.

### 13. Awwwards / Claude Code Teardown (i-jawzwnjSA)

**Topic.** Building a Site Of The Day-tier site with Claude Code.

**The pattern that ships SOTD.**
1. **Hero with frame sequence** — 60 PNG frames bound to scroll, NOT video
2. **Type that reveals on scroll** — SplitType.js + GSAP
3. **Magnetic cursor** — `mousemove` listener, `transform: translate(x*0.3, y*0.3)`
4. **Dark mode tonal shift** — `--accent` HSL hue rotates on scroll progress
5. **Footer with oversized type** — 12-20vw font-size, tight tracking
6. **No carousel hero** — carousels are 2015. Use frame sequence or 3D.

**Stack.** Claude Code, GSAP, SplitType, ScrollTrigger, framer-motion.

**Anti-patterns.**
- Embedding YouTube as hero video — looks cheap
- Tailwind defaults for hero type — too tight, not premium. Use custom letter-spacing.
- More than 3 ease curves on one page — incoherent.

### 14. Nano Banana Pro Product Photography (tSDSSJlHFL4)

**Topic.** Generating SaaS hero images + e-commerce product shots with Nano Banana Pro.

**Workflow.**
1. Prompt: "Photo of [product] on solid #00FF00 background, studio lighting, 50mm lens, no shadow on the green"
2. Output: green-screen photoreal product shot
3. Key out the green in Canvas / FCPX / Figma's remove-bg
4. Composite into hero with custom bg (gradient, scene, motion plate)

**Stack.** Nano Banana Pro (fal.ai), Canvas, FCPX, Figma remove-bg.

**Trick.** Green-screen prompts are far more reliable than "transparent background" or "white seamless" — diffusion models hallucinate edges; pure green keys cleanly.

**Anti-pattern.** Asking for the full scene in one prompt — backgrounds are always wrong. Green-screen + composite is the production pattern.

---

## Cross-Cutting Synthesis — 15 Rules

These 15 rules are the distilled output. The full file lives in [`PATTERNS.md`](PATTERNS.md); brief recap:

1. Multi-model orchestration (manager-agent)
2. Reference assets anchor, words describe
3. Two-prompt site pattern (structure + polish)
4. Atomic iteration with checkpoint/restore
5. Frame sequences, not videos
6. Style/skill memory beats per-prompt styling
7. Outcome-first prompts
8. Full-stack-in-one (for prototypes)
9. Annotate-to-edit beats re-prompt
10. Awwwards / Dribbble / Mobbin are the reference library
11. Pull HTML + CSS + JS, don't re-build
12. Agent-as-manager (planner + executors)
13. Green-screen compositing
14. Conversational iterative editing
15. QA loop in the editor

---

## Tools Mentioned

- **Multi-CLI**: Claude Code, Codex, Cursor, Gemini 3.1 Pro (AI Studio)
- **Full-stack platforms**: Base44, Bolt, Replit, Lovable, Antigravity
- **Cloning**: Firecrawl MCP, Figma MCP, Gemini Canvas
- **Reference**: Mobbin MCP, Dribbble, Awwwards
- **Motion**: GSAP, ScrollTrigger, framer-motion, SplitType, Three.js, react-three-fiber
- **Media gen**: Nano Banana Pro, Kling AI, VO 3.1, Seedance 2.0, Whisk, Flow
- **QA**: browser-harness, chrome-devtools MCP, claude-in-chrome MCP, TestSprite MCP, Playwright

---

## Source Transcripts

Original VTT transcripts pulled with `yt-dlp --write-auto-subs --sub-format vtt` and cleaned to plain text live at `/tmp/yt-research/<id>.txt`. Re-extract any time with:

```bash
for id in Qsq-Sj_rojU numKPyO3FTA Lnkv0-GLU3w PFO01z7Qe38 EzFjqu1DUO0 \
          AyUffXDwoSY E1y7fLWLI0s e7ngdzwzRZ0 krBzfkpFPP8 YDqqRqqlnJU \
          j74kjYvzzLk zmP8Pl-MJXw i-jawzwnjSA tSDSSJlHFL4; do
  yt-dlp --write-auto-subs --sub-format vtt --skip-download \
         -o "/tmp/yt-research/$id.%(ext)s" "https://youtu.be/$id"
done
```
