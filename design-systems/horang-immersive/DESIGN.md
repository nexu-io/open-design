# Horang Immersive Design System

> Category: 3D/Spline Web
> Awwwards / studio / experimental direction for Horangdesign: cinematic, technical, motion-led, full-viewport, 16:9 and 21:9 first.

## Visual Intent

Horang Immersive exists for technically impressive 3D/Spline-style websites, not generic company pages. The output should feel like an interactive studio piece: a scene unfolds, the camera has a point of view, typography behaves like interface instrumentation, and motion carries the story.

Use this system for 3D/Spline based landing pages, experimental studio sites, product showcases, immersive campaigns, and reference-led Awwwards-style builds. It should adapt the feel of references such as rideradian.com, podium.global, NRG Build Your Data Center, everswap.com, tekatekistudios.com, paralleluniverse.com.ua, venetianspa.ca, and auwa.life without copying protected assets.

## Non-Negotiables

- No generic SaaS hero.
- No centered 1200px marketing page as the main composition.
- No three identical feature cards as the primary idea.
- Do not turn information into cards by default. Process, timeline, steps, specs, and lists should first be designed as scroll transitions, scene changes, rails, masked typography, overlays, or object choreography. Use card-like grouping only when the medium and mood genuinely call for it, such as a static PDF, PPT slide, catalog/spec sheet, or a reference that clearly uses card geometry.
- Rounded corners are conditional, not banned: allowed for site/PPT/PDF moods that need softness or product UI, but not as the automatic answer. If rounded surfaces are used, they must match the reference and serve the composition.
- No visible page-explanation HUD copy such as "검토모드", "실시간", "출력비율", "21:9", "와이어프레임", "섹션 수", or page-purpose labels unless the user explicitly asked to show those as product UI. Internal planning metadata must stay out of the artifact.
- No purple-blue AI gradient blob as the main visual concept.
- No stock illustration posture.
- No motion sprinkled randomly; one coherent motion grammar only.
- First viewport must feel designed for 16:9 and 21:9.

## Canvas and Layout

- Treat each section as a scene, not a content block.
- Websites are dynamic/interactive by default. Build scroll-linked motion, hover/cursor response, transitions, or scene-state changes unless the user explicitly says static/정적.
- Process sequences such as 준비 → 염색 → 후가공 should not become a row of cards. They should unfold through scroll, pinned scenes, object transformation, progressive reveal, camera movement, or timeline choreography.
- Use full-bleed viewport composition with foreground, midground, and background layers.
- 21:9 must use lateral space: extended camera path, side instrumentation, orbiting object, split-scene, or off-axis typography.
- Important content may be asymmetric, pinned, or staged over scroll; do not center everything.
- Navigation should feel like part of the scene: tiny studio nav, HUD rail, corner controls, or minimal overlay.

## Typography

- Display type should be high-contrast, condensed, experimental, or editorial depending on the reference.
- Use tracking, casing, optical size, and line breaks intentionally.
- Body copy should be sparse and precise. Immersive websites lose power when copy becomes dense.
- Artifact copy must sound like human brand/site language, not assistant language. Do not leak Roy/caveman/AI helper phrasing into HTML. Avoid awkward fragments like a bot summarizing a plan.
- Except for intentional long-form descriptions, visible copy should usually be words or short phrases, not explanatory sentences. Prefer labels like "원단", "염색", "후가공", "검수" over "단계마다 다른 기준을 적용하는 공정 구조" unless that sentence is a deliberate headline.
- Do not write explanatory labels that describe the page-making process or internal review state. The visible artifact should feel like the final website, not a design-spec board.
- Technical labels, coordinates, section counters, and microcopy are allowed only when they are part of the fictional product/world interface. They must not expose build metadata, aspect ratios, review modes, or interview decisions.

## Color and Surface

- Prefer cinematic blacks, off-whites, sharp accent flashes, material neutrals, or reference-derived palettes.
- Surfaces should feel physical: glass, brushed metal, paper, liquid, vapor, light field, or spatial UI.
- Surface geometry follows the reference and medium. For immersive Awwwards/studio websites, default to sharp/barely-cut panes; for softer sites, PPT, PDF, or product UI, rounded surfaces are allowed when they are mood-correct. Never choose rounded cards as an automatic list layout.
- Accent color budget is low. One decisive accent beats many decorative colors.
- Shadows are not enough for depth; use scale, occlusion, blur, parallax, lighting, and z-index choreography.

## Motion Grammar

Use Spline-inspired motion vocabulary even when implementing with HTML/CSS/Three.js:

- scroll-linked camera movement
- orbit / tilt / turntable product movement
- cursor-responsive light, depth, or magnetic hover
- masked reveal and clip-path transitions
- parallax depth with multiple layers
- pinned scenes and chapter transitions
- ambient motion fields, particles, fluid, shader-like gradients
- micro-interactions for buttons, rails, masks, spatial panes, and scene objects

Motion must be purposeful and performance-aware. Prefer transforms and opacity. Avoid animating everything.

## Interview Flow

Horangdesign projects should use staged interviews:

1. 1,2차: purpose, audience, reference, visual intensity, technical direction, Spline/3D strategy.
2. Wireframe checkpoint: show scene structure before final visuals.
3. 3,4차: refine sections, interactions, assets, generated imagery, motion intensity, desktop aspect behavior.
4. 5차: final constraints, copy, delivery format, QA criteria.

Question count should be higher than the old quick brief but not exhausting: usually 4-7 questions per stage, mostly selectable controls.

## Reference Adaptation

When references are provided, extract:

- section rhythm
- scroll and camera logic
- object movement
- typography attitude
- nav/control placement
- imagery scale and crop logic
- motion timing
- interaction model

Carry the feeling over strongly. Before building, name the closest reference family and copy its composition logic: how it enters, scrolls, transitions, places type, treats whitespace, and moves the focal object. If the result could be mistaken for a generic dark dashboard or card grid, it fails even if the colors are close. Do not clone logos, private assets, protected scenes, or exact content.

## QA Gate

Before delivery, the artifact must pass:

- First viewport has a clear immersive scene.
- 16:9 and 21:9 both look intentional.
- At least three interaction or motion moments are specified or implemented.
- Reference influence is visible beyond color.
- No generic SaaS layout is present.
- Card/list structures are justified by the medium/reference, not used as the default design move.
- Visible copy is human, concise, and free of assistant/caveman phrasing.
- If the user did not ask for static/정적, the website includes real motion/interaction instead of a static poster.
- Motion vocabulary is named and tied to implementation.
