---
name: design-taste-libraries
description: 'TRIGGER when: designing, redesigning, critiquing, or prototyping frontend, mobile, dashboard, landing-page, shadcn, or motion-led UI in Open Design. DO NOT TRIGGER when: the user asks for a single fixed brand system, backend-only work, copy-only edits, or production coding without design judgment.'
version: 0.1.0
---

# Design Taste Libraries

Use this skill as a source-backed taste router before generating or critiquing UI. It is a library pack, not a visual theme. Do not stack every library. Pick the smallest set that matches the surface.

## First Pass

1. Read the user brief and any attached screenshot, code, brand file, or existing artifact.
2. Use the **Routing**, **Runtime Source Index**, and **Selection Matrix** in this `SKILL.md` as the authoritative runtime catalog. `references/LIBRARIES.md` is a review and provenance appendix only; do not search `.od-skills`, glob staged copies, or depend on that side file during a run.
3. Check whether Open Design already has a matching local plugin or design system.
4. Select one primary library and at most two secondary libraries.
5. State the selected libraries, the local Open Design plugin ids used, and any external-only gap.
6. Discard one tempting but wrong library when it would push the design toward generic AI output.

## Routing

- General taste or high-end web visual direction: use `community-hallmark` plus the Anthropic Frontend Design method.
- Existing React component systems: use `design-system-shadcn` first, then custom code only for gaps.
- Dense operational interfaces: use `design-system-dashboard` or `example-dashboard`.
- Mobile app surfaces: use `example-mobile-app`, `example-mobile-onboarding`, and the external mobile/native rules; treat mobile as its own product surface, not a shrunken website.
- Motion-led or cinematic interaction: use Open Design HyperFrames/video templates first; add GSAP rules only when animation needs timeline-level code.
- Taste presets such as Minimalist UI, Premium, or Industrial Brutalist UI: use the existing OD design systems/examples as constraints, never as a pile-on.
- Material 3 or SwiftUI: use `design-system-material` for Material visual grammar; use external platform rules when production native behavior matters.

## Runtime Source Index

Use these canonical sources only when their dimension is needed:

- Visual thesis and expressive web composition: [Anthropic Frontend Design](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md).
- Anti-slop critique and structural variety: local `community-hallmark`, upstream [Hallmark](https://github.com/Nutlope/hallmark).
- React component composition: local `design-system-shadcn`, upstream [shadcn UI skill](https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/SKILL.md).
- Dense enterprise and dashboard grammar: local `design-system-dashboard` / `example-dashboard`, upstream [Enterprise Design Skill](https://github.com/bergside/awesome-design-skills/blob/main/skills/enterprise/SKILL.md).
- Category-first exploration: [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill).
- Timeline and scroll choreography: [GSAP Skills](https://github.com/greensock/gsap-skills), after checking local `example-hyperframes`, `example-video-hyperframes`, and `example-motion-frames`.
- Mobile product grammar: local `example-mobile-app` / `example-mobile-onboarding`, plus [Mobile App UI Design](https://github.com/ceorkm/mobile-app-ui-design) and [Expo Native UI](https://github.com/expo/skills/blob/main/plugins/expo/skills/expo-native-ui/SKILL.md).
- Native Apple or Material behavior: [SwiftUI Skills](https://github.com/ameyalambat128/swiftui-skills) or [Material 3 Skill](https://github.com/hamen/material-3-skill); prefer local `design-system-material` for Material visual grammar.
- Taste presets: [Minimalist](https://github.com/Leonxlnx/taste-skill/blob/main/skills/minimalist-skill/SKILL.md), [Industrial Brutalist](https://github.com/Leonxlnx/taste-skill/blob/main/skills/brutalist-skill/SKILL.md), or [Premium Frontend UI](https://github.com/github/awesome-copilot/blob/main/skills/premium-frontend-ui/SKILL.md), never all three.

## Selection Matrix

- Web app: Anthropic Frontend Design + `community-hallmark` + `design-system-shadcn` when React components are needed.
- Mobile app: Mobile App UI Design + Expo Native UI + the closest local mobile example.
- Dashboard: Enterprise Design Skill + `design-system-dashboard` or `example-dashboard` + `community-hallmark` for critique.
- Landing page: Anthropic Frontend Design + one premium or taste preset.
- Motion prototype: local HyperFrames/motion examples + GSAP only for timeline-level implementation.

## Design Rules

- Commit to a visual thesis before writing files.
- Bind the design to the subject matter in the first viewport or first app screen.
- Use real content, real product states, and real constraints where available.
- Prefer established components and registries before inventing primitives.
- Prefer existing Open Design plugin ids over new local library plugins when coverage exists.
- Keep dashboards dense but calm; keep landing pages visual and specific; keep tools ergonomic over decorative.
- Use motion to explain state, reveal hierarchy, or make a moment memorable. Remove motion that only makes the artifact feel busy.
- Check mobile thumb zones, safe areas, navigation placement, and content density separately from desktop.

## Output Contract

For a design generation:

1. Selected library set.
2. Visual thesis.
3. Surface-specific layout and interaction plan.
4. Missing source material that would change the result.
5. Generated artifact.
6. Self-critique against the chosen libraries.

For a critique:

1. What library standards were applied.
2. The three highest-impact fixes.
3. What to delete.
4. What to keep.
5. Proof needed: screenshot sizes, interaction path, accessibility/contrast/state checks.

## Hard Rejections

- no generic purple-blue SaaS gradients unless the brand specifically requires them;
- no decorative card walls for serious tools;
- no mobile design that is just a compressed desktop layout;
- no invented brand, product, social, price, metric, or event facts;
- no animation library recommendation unless the interaction needs a timeline, scroll choreography, gesture choreography, or video-quality motion.
