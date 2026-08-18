# Vibe Camp Design System Usage

## Read Order

1. Read `DESIGN.md` for the visual direction and constraints.
2. Paste the unscoped `:root` block from `tokens.css` into the artifact.
3. Choose a listed business intent and resolve it through the DS 3.0 runtime.
4. Reuse the returned implementation, selectors, variant, properties, and states.
5. Validate every related artifact before completing the task.

## Design Highlights

- Values come from the normalized Vibe Camp token layer.
- Component selection comes only from the structured intent map.
- Missing or ambiguous intent matches require confirmation.

## Do

- Reuse Button, Field, Surface, and Status for their mapped business intents.
- Keep all visual values behind declared `var(--*)` references.
- Implement visible focus and every state returned by the resolver.

## Avoid

- Do not use `components.html` as a second component-selection authority.
- Do not invent a near-copy when a mapped component exists.
- Do not bypass a no-match or ambiguous-match confirmation result.
