# Prompt maintenance

Prompt composition has separate legacy and OD Next implementations. Both daemon
`src/prompts/system.ts` and `packages/contracts/src/prompts/system.ts` return early
when a run carries `odNextStrategyRecipe`; changes below that fork do not affect
OD Next. Check every affected path instead of assuming a shared composition floor.

## Entry points

- Legacy daemon prompts live here; API/BYOK mirrors live in `packages/contracts/src/prompts/`.
- OD Next prompt text lives in `plugins/_official/scenarios/od-next-strategy/assets/`; host directives also live in `packages/contracts/src/prompts/od-next-strategy.ts`.
- Rollout facts come from `evaluateOdNextRollout` in `apps/daemon/src/strategies/od-next/rollout.ts`. Inspect the implementation for current admission behavior; do not infer it from an old settings label.

## Editing rules

- Host contracts need one canonical directive consumed by all affected prompt paths. `packages/contracts/src/prompts/deck-framework.ts` is the shared deck scaffold; the daemon module re-exports it. Preserve deck readiness/navigation messages, print behavior, comment identities, and product question-form handling when editing generated-artifact instructions.
- Product instructions and repository-maintenance guidance have separate audiences. Exported prompt strings and plugin `assets/` are delivered to the product agent; maintenance guidance belongs in AGENTS or source docblocks outside those strings.
- Before changing an OD Next asset or manifest, read that scenario's `AGENTS.md`. Manifest-declared files and selected profile resources determine package identity; undeclared maintenance files do not.
- Validate affected routes with focused prompt tests. A legacy-only matrix does not prove OD Next or BYOK parity. Explain genuinely inapplicable paths instead of deferring a live contract gap.
