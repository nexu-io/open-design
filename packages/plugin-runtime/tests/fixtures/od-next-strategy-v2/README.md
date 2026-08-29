# OD Next Strategy V2 fixture boundary

These fixtures freeze only the strategy behavior that happens before or during
Build. They are deterministic test data; they do not run an agent, provider,
demo harness, or companion service.

## Provenance

- Behavioral reference: `od_strategy@41dac86165f0504750f91fbc40a79d9d6b8a5a9d`.
- Reviewed source assets: `strategy/assets/general-orchestration.md`,
  `strategy/assets/core-system-prompt.md`, `strategy/assets/prototype.md`, and
  `strategy/assets/hyperframes.md`.
- Open Design target contract: OD Next Strategy V2, sections 1, 4, 6, and 18.

The source material was not copied verbatim. `prebuild-cases.json` reduces it
to route, stage, Task Profile, Preflight, clarification, Plan Contract,
contract-serialization repair, and simple/complex Build expectations. The PPT
and marketing Task Profiles are active alongside prototype and HyperFrames;
the fixture freezes all four Open Design-owned production artifact lanes.

## Deletion rule

Build may include generation, compilation, rendering, or export when that
operation creates the required deliverable. Once the deliverable exists, the
OD Next path stops: it must not add artifact review, scoring, judging,
acceptance gating, revalidation, critique / `critique-theater`, a repeated
stage, or a repair loop based on those results.

`forbidden-postbuild-cases.json` contains intentionally contaminated mutations.
The owning test applies each mutation to a known-good case and requires the
fixture boundary validator to reject it with a stable diagnostic code. This is
test data for a deletion boundary, not a runtime validation or evaluation
harness.

## Consumers

- `packages/plugin-runtime/tests/od-next-strategy-fixtures.test.ts` consumes
  both JSON files and freezes the current non-OD-Next scenario fallback.
- `apps/daemon/tests/prompts/od-next-strategy-default-quality-witness.test.ts`
  composes the real default prompt recipe for the official scenario and its
  community fallback, freezing the ordinary verification and critique
  sections that OD Next must not delete globally.
- Later OD Next content, prompt-recipe, and runtime-capability tests may read the
  same JSON cases, but production code must not import from `tests/fixtures`.
