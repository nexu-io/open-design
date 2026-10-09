# Design sources

This is an original Open Design skill, informed by these public approaches:

- https://github.com/alchaincyf/huashu-art-motion — representative-frame-first art direction, motion within a scene, deterministic procedural drawing, and separating aesthetic judgment from technical signals.
- https://github.com/LottieFiles/motion-design-skill — emotional intent, timing versus spacing, easing, and primary/secondary/ambient choreography.
- https://github.com/LobzyJay/motion-design-with-claude-and-codex — restraint, specific motion decisions, and preserving the user's working tool.

No upstream engine, character assets, sample film, or style-card library is
vendored. The broad film workflow is adapted to Open Design's existing timeline
preview/export contract. Heuristics remain defaults, not universal aesthetic laws.

The maintained entrypoint is `skills/motion-design/SKILL.md`. The OD Next sealed
package carries a generated identical copy. From the repository root run
`pnpm exec tsx scripts/sync-motion-design-skill.ts` after editing it. The daemon's
motion-design integration test rejects drift and exercises the actual bundle.
