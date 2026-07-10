# Production Generation Implementation Notes

Date: 2026-07-10

## Delivered

This round completed the first two implementation slices for the production
generation workflow:

1. A pure production-generation domain was extracted into
   `apps/web/src/production-generation/`.
2. OpenRouter generation orchestration moved out of
   `ProductionWorkspace` and into `runProductionGeneration()`.
3. A lightweight FAL.ai media job abstraction and placeholder job state were
   added so the workspace can grow into real media orchestration later.

## Verification

- `pnpm --filter @open-design/web test -- tests/production-generation`
- `pnpm --filter @open-design/web test -- tests/components/ProductionWorkspace.test.tsx`
- `pnpm --filter @open-design/web test`

All three passed.

## Commits

- `7d3eb04 feat: add production generation domain helpers`
- `b66eadd feat: route production generation through service`
- `a50a793 feat: add fal media job state`

## Claude Review Summary

Claude's second-pass review was broadly aligned with the direction but flagged
the next set of gaps to address before media generation becomes production-safe:

- partial failure recovery between OpenRouter and FAL.ai needs a clearer
  rollback story
- FAL.ai job lifecycle still needs explicit cancellation, polling, and quota
  policy
- retry policy should be made more explicit if we expect to keep using
  streaming calls
- observability is still light

## Residual Risks

- Media generation is still a placeholder boundary, not a live provider flow.
- The current service layer is intentionally small and still assumes
  component-owned UI state for script editing.
- No concurrent-generation scheduler or queue exists yet.

## Next Step

If we continue, the next useful slice is to make the FAL.ai boundary real:
job submission, job polling/cancellation, and attaching media results back to
segment rows without mutating the script state directly.
