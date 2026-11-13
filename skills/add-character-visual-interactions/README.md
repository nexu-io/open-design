# Add Character Visual Interactions

Add page-local 2D or 3D character motion to an existing web page while preserving its business behavior. Typical effects include gaze following, pointer tracking, blinking, hovering, head turns, and independently animated wings or other local parts.

This package is a functional Skill for Open Design and a portable Agent Skill for compatible coding agents.

## Open Design placement

- Directory: `skills/add-character-visual-interactions/`
- Mode: `prototype`
- Surface: `web`
- Category: `animation-motion`
- Scenario: `design`

Although the skill works on visual prototypes, it is not a design template. It enhances an existing page and does not create a new page from scratch.

Open Design's current `skills/AGENTS.md` describes `utility` as the functional-skill mode, while the current daemon mode normalizer does not recognize it. With `utility`, this skill is incorrectly inferred as an image skill from its 2D asset language. This package therefore declares the supported `prototype` mode with `surface: web` so the current runtime classifies it correctly. Disclose this compatibility exception during review without expanding the Skill-only contribution into a parser change.

## What it does

- Inspects the existing page, stack, assets, dependencies, tests, and uncommitted changes.
- Preserves APIs, authentication, routing, stores, permissions, validation, submission, and analytics behavior.
- Selects a layered 2D route for image parts or a Three.js route for supplied GLB/GLTF/FBX assets.
- Separates target tracking, pure motion math, and rendering.
- Adds responsive and reduced-motion fallbacks.
- Verifies lifecycle cleanup, browser layout, functional controls, and failure paths.

## What it does not do

- Create a new page or redesign the product from scratch.
- Replace business logic, application state, routes, or API contracts.
- Invent anatomical pivots or pretend whole-model shaking is local character motion.
- Download or redistribute character assets without confirmed licensing.
- Guarantee compatibility with an untested framework version or build configuration.

## Example prompts

```text
Add gaze-following eyes, randomized blinking, and subtle head tracking to the supplied character on the existing login page. Preserve authentication, validation, routing, keyboard behavior, and form submission exactly as they are.
```

```text
为现有首页中的 2D 分层角色添加视线跟随和随机眨眼。不要修改导航、埋点、按钮事件或页面路由，并为窄屏和减少动态效果设置提供降级方案。
```

## Resource map

- `SKILL.md`: trigger metadata, boundaries, and core workflow.
- `references/motion-core.md`: target signal, bounded mapping, damping, and lifecycle ownership.
- `references/2d-layered.md`: layered raster/vector asset route.
- `references/3d-models.md`: GLB/GLTF/FBX inspection, pivots, rendering, and failure behavior.
- `references/framework-adapters.md`: lifecycle adaptation guidance for common frontend stacks.
- `references/checklist.md`: P0/P1/P2 validation gates and completion reporting.
- `agents/openai.yaml`: Codex-facing display metadata; Open Design reads the `od:` metadata in `SKILL.md` instead.

## Compatibility policy

The framework reference covers React, Vue, Next.js, Nuxt, Svelte, Angular, vanilla JavaScript, and comparable component systems. These are adaptation targets, not a claim that every framework version has already been tested. Each implementation must report the exact stack, version, route, build, and browser checks verified with fresh evidence.

## Differentiation from nearby Open Design skills

- `emilkowalski-motion` provides general interface motion polish; this skill focuses on character anatomy, target tracking, layered 2D, and model-local 3D motion.
- `threejs` covers general browser 3D scenes; this skill adds existing-page isolation, business-behavior protection, local-part validation, and a layered 2D alternative.
- `redesign-existing-projects` performs broad visual redesign; this skill explicitly prohibits business and structural redesign.
- GSAP skills are library-specific; this skill reuses the existing stack and prefers CSS or platform APIs when they are sufficient.

## License

Apache-2.0. User-supplied and project-owned character assets retain their original licenses and are not relicensed by this skill.
