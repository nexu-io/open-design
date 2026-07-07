---
name: horang-design-pro
description: |
  Horangdesign working method: mandatory adaptive interviews, desktop 16:9/21:9 support, mood-routed design systems, choice-first questions, URL/file inputs, image-first layout exploration, Spline-informed motion, planning, execution, and quality checks. This is a workflow skill, not a fixed visual brand system.
triggers:
  - "horangdesign"
  - "adaptive interview"
  - "design workflow"
  - "korean design brief"
od:
  mode: prototype
  surface: web
  category: horangdesign
  design_system:
    requires: false
  craft:
    requires: [typography, color, anti-ai-slop]
---

# Horangdesign Pro

Horangdesign Pro is the working method for Horangdesign projects. It controls how the agent interviews, routes visual direction, plans, builds, checks, and reports. It is not a fixed reusable brand system.

## 1. Mandatory adaptive interview before work

At the start of each new project or materially new design task, interview the user before actual design/build work unless the user explicitly says to skip questions or just build.

First infer the situation from:
- user message
- attached files and screenshots
- URLs
- project metadata
- active plugin inputs
- previous project context

Then ask only decisions that materially change the result, but cover these areas before design begins:
- purpose and success criteria
- target audience and business context
- preferred style and mood
- reference sites or examples
- required images, logos, screenshots, products, or source assets
- required functions, sections, states, and interactions
- animation, motion graphics, Spline-style effects, and transitions
- desktop aspect needs, including 16:9 and 21:9

Emit exactly one compact `<question-form>` and stop after the form when answers are needed. Do not silently proceed into design while these core decisions are missing.

For 3D/Spline/Awwwards/studio/experimental projects, the interview is mandatory staged flow, not a single form:
1. `horang-stage-1`: a substantive strategy interview, not a light vibe check. Cover purpose, audience, reference priority, which reference behaviors to imitate, forbidden patterns, content/copy density, dynamic-vs-static expectation, scope, and intensity.
2. `horang-stage-2`: camera choreography, scroll behavior, scene object/transformation, Spline/Three.js strategy, interaction model, transition model for process/steps/lists, and assets.
3. Wireframe checkpoint: show scene structure and 16:9/21:9 composition zones, then ask `horang-stage-3` for selection/refinement.
4. `horang-stage-4`: section order, copy density, motion priority, generated imagery, technical constraints.
5. `horang-stage-5`: final QA criteria, visible forbidden elements, delivery/deploy target, and explicit build permission.

Do not move to production after only `horang-stage-1`. Continue the next stage unless the user explicitly says to skip the remaining interview or build now.

## 2. Prefer choice controls

Use selectable controls whenever sensible:
- `radio` for one clear choice
- `checkbox` for multiple choices
- `select` for compact option lists
- `switch` for yes/no preferences
- `color` for brand/accent color
- `range` for intensity or amount
- `date`, `time`, `datetime-local` for schedule/deadline
- `url` for reference sites, competitors, brand guides, marketplaces, SNS pages, source links, Spline examples, or inspiration
- `file` for screenshots, assets, brand guides, PDFs, logos, images, and source assets

Use `textarea` only when options cannot cover the answer.

## 3. Reference handling

Whenever a reference, brand guide, website, competitor, inspiration, asset source, marketplace page, existing homepage, SNS page, Spline page, or example is needed, include a `url` field. Do not ask for links only as prose.

When reference sites are provided, extract and reflect more than color:
- layout structure and section rhythm
- typography posture and spacing density
- interaction patterns and hover/scroll states
- animation timing, transitions, and motion graphics
- 3D/Spline-like visual elements where relevant
- what the reference does instead of card grids: scene transitions, object transformations, overlays, rails, masks, camera moves, typography choreography

Before building, name the reference family being followed and adapt its composition/motion logic. If the result could be a generic dark dashboard or card grid, revise before showing it.

Use `file` beside `url` when screenshots, PDFs, logos, images, or source assets may be uploaded.

## 4. No interview time limit, no auto-skip

Do not show countdown wording such as "30 seconds" or "quick timer". Do not auto-skip the interview. Wait for user answers unless the user explicitly says:
- skip questions
- just build
- no questions
- 그냥 해
- 질문 스킵

## 5. Desktop aspect and composition rules

For desktop-supported design outputs, support both:
- 16:9 standard desktop / presentation viewport
- 21:9 ultrawide desktop viewport

Do not make a narrow centered website that wastes ultrawide space. Avoid layouts that push all important elements into a small central column.

Implementation expectations:
- Avoid wrapping the main hero/canvas in a fixed `max-width: 1200px` container when the output is a desktop/proposal/hero/artifact screen.
- Do not use `.container { width: min(..., 1180px/1200px); margin: 0 auto; }` as the primary desktop/hero composition. That creates a centered narrow website, not a 16:9/21:9 artifact.
- Use viewport-scale canvas logic such as `aspect-ratio: 16 / 9`, `aspect-ratio: 21 / 9`, `min(100vw, ...)`, full-width gutters, or explicit `.ratio-16x9` / `.ratio-21x9` states where useful.
- Make 21:9 use lateral space intentionally with side panels, expanded visual fields, extended motion paths, image fields, or composition zones.
- Keep focal hierarchy clear without clustering everything in the center.
- If a UI toggle or preview control is appropriate, provide 16:9 / 21:9 layout candidates before finalizing.

Mandatory output audit before delivery:
- Inspect the generated CSS/HTML. If hero/page-title/main composition still has `--container-max` around 1180-1200px, fixed central `.container`, `place-items: center`, or all important elements inside one narrow centered column, revise before presenting.
- For 16:9, verify the first viewport uses left/middle/right or foreground/background spatial structure, not a centered card stack.
- For 21:9, verify the extra width is used by image panels, side data, extended motion/scene space, or asymmetric content zones.
- When a reference site is provided, verify implementation evidence: layout posture, image scale, type scale, spacing, interaction/motion cues, not just color tokens.

## 6. Mood routes to design system

When no active design system is selected, the interview mood choice must influence the actual design system for the run. Use the `mood` question id with stable values when asking mood.

Mood router:
- 3D/Spline/Awwwards/studio/experimental/immersive/motion/모션/몰입/스플라인 → `horang-immersive`
- `modern_minimal` or clean/minimal/simple/깔끔/미니멀 → `clean`
- `tech_utility` or tech/tool/dashboard/유틸/대시보드 → `application`, unless the brief also mentions 3D/Spline/immersive/motion, then use `horang-immersive`
- `editorial_magazine` or editorial/magazine/에디토리얼/매거진 → `editorial`
- `luxury_refined` or luxury/refined/premium/럭셔리/고급 → `luxury`
- `playful_illustrative` or playful/illustrative/colorful/일러스트/컬러풀 → `colorful`
- `brutalist_experimental` or brutalist/experimental/bold/브루탈 → `brutalism`, unless the brief says Awwwards/studio/3D/Spline/immersive, then use `horang-immersive`
- `human_approachable` or human/friendly/warm/친근/따뜻 → `friendly`

The daemon also enforces this router: when a submitted form answer includes a recognized mood and there is no explicit design system override, the project/run designSystemId is set to the mapped built-in design system. If the daemon has already injected an Active design system section, follow that DESIGN.md as the visual contract.

## 7. Image-first layout workflow

Before final visual design, identify needed images first. When generated imagery is needed, generate it through Codex CLI using Open Design media generation, not FAL placeholders.

Required command pattern inside Open Design projects:

- Use `od media generate --surface image --model codex-gpt-image-2 --output <asset-name>.png --prompt "<prompt>"` when the `od` CLI is available.
- If the user or another skill suggests FAL but no FAL key is configured, do not continue with fake images. Switch to `codex-gpt-image-2` through Codex CLI.
- Save generated images into the active project workspace before composing final layouts.
- Never present placeholder texture/image slots as if they were generated images.

Workflow:
1. Determine required images from the interview and references.
2. Generate or prepare the required images before final layout composition.
3. Create layout candidates per generated image or image group.
4. Show the user the layout candidates before final layout selection.
5. Before finalizing layout, run a follow-up interview for selection, changes, animation intensity, function behavior, and 16:9/21:9 preference.

Do not finalize a layout before the user has had a chance to compare meaningful layout candidates unless the user explicitly asks to skip review.

## 8. Animation and Spline-informed effects

For websites, assume dynamic/interactive output by default. Only make a static site when the user explicitly says static/정적. When animation, interactive 3D, motion graphics, or functional visual effects are relevant, use Spline sites/examples as interaction and motion references.

Apply effects that match the design direction, not random decoration:
- scroll-triggered depth or parallax
- cursor-responsive 3D or lighting cues
- reveal transitions
- product/scene orbit, tilt, or hover states
- background motion fields
- micro-interactions for buttons, rails, masks, scene objects, and forms

Keep performance and readability intact. If real Spline embedding is not required or not available, emulate the interaction with CSS/JS/SVG/Canvas in a way that fits the visual system.

## 9. Visual artifact hygiene

Horangdesign outputs must not expose internal planning or generation metadata as page content. Do not place labels/chips/cards such as 검토모드, 실시간, 출력비율, 21:9, 섹션 수, 와이어프레임, QA mode, stage count, or similar process notes inside the final website unless the user explicitly asked for that to be real product UI.

Do not use cards as the automatic way to show lists, steps, specs, or process. For a sequence like 준비 → 염색 → 후가공, first design a scroll-linked transition, pinned scene, object transformation, reveal sequence, timeline choreography, or animated spatial layer. Use card-like grouping only when the site/PPT/PDF mood or reference clearly supports it.

Rounded corners are conditional, not banned. They are allowed for site/PPT/PDF atmospheres that need softness, product UI, editorial tiles, or reference-matched geometry. They are not allowed as the default card-grid solution.

Artifact language must be human brand/site language, not Roy/caveman/assistant voice. Do not write the assistant's chat style into HTML. Except for intentional long-form descriptions, visible copy should be mostly words and short phrases rather than explanatory sentences.

## 10. Compact Korean-first form

When the user writes Korean, labels, titles, descriptions, placeholders, and option labels must be Korean. Keep the first interview usually 4-7 questions, maximum 9 when the task genuinely needs images, references, functions, and animation details.

## 11. Planning and execution

After the interview or explicit skip:
1. Create a short task plan.
2. Pick the artifact mode from the actual request: landing, prototype, deck, card/news, detail page, brand page, dashboard, desktop proposal, image-led layout, or other.
3. If no active design system exists, pick the best-fitting visual direction yourself from the request and references. Build local tokens for that artifact.
4. If the user provides a brand/reference URL or file, treat it as source evidence and deconstruct it before designing. The output should not clone copyrighted content, but it must clearly carry the reference's layout posture, color temperature, typography attitude, spacing density, image scale/crop logic, navigation pattern, interaction model, motion/animation timing, and overall mood. Do not reduce a reference URL to a color palette.
5. For reference URLs, capture or inspect at least the first viewport and one scrolled state when possible. Record concrete observations in `brand-spec.md`: viewport composition, hierarchy, nav placement, image behavior, scroll/hover effects, animation cues, type scale, and what should be adapted or deliberately not copied.
6. Generate or prepare required images before final layout when imagery materially affects composition.
7. Produce visible layout candidates early, then refine after user selection/interview.
8. Verify the result against the brief, reference resemblance at feel/layout level, 16:9/21:9 desktop behavior, visual hierarchy, typography, spacing, interaction states, motion requirements, and anti-slop rules.

## 12. Design-system boundary

This skill does not assume a custom Horang brand system. Do not rely on any previous custom brand preset or previous custom design-system preset until the user rebuilds one.

If an active design system is selected or mood-routed, follow it. If not, infer a one-off direction and tokens for the current task; do not pretend a reusable system exists.

## 13. Quality bar

Every output should be:
- specific to the user's actual business/context
- visually intentional, not generic SaaS slop
- desktop-aware with 16:9 and 21:9 support when desktop is in scope
- free from cramped central clustering on wide screens
- free from automatic card/list layouts and visible internal metadata labels
- rounded surfaces used only when medium/reference/mood justifies them
- human, concise artifact copy without assistant/caveman phrasing
- dynamic/interactive by default for websites unless static is explicitly requested
- based on real references when provided
- honest about unknown data
- checked before delivery
