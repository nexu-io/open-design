# Implementation plan

## Workflow and constitution check

Follow Spec Kit's specify → clarify → plan → tasks → analyze → implement sequence.
The repository has no installed Spec Kit commands/templates/hooks. The official
command templates were read from github/spec-kit; the sequence is performed directly
with these reviewable artifacts. Root AGENTS.md remains the constitution and single
source of truth; no new project-wide governance or branch renaming is needed.

Gates: TypeScript source, pure contracts, package-owned tests, UI/CLI parity, existing
HTTP APIs, tools-dev lifecycle, Node 24 and pinned pnpm. All pass at design time.

## Technical context and design

TypeScript, Express daemon, React/Next web, Vitest and Playwright. Extend existing
model DTOs with reasoningOptions/defaultReasoning and a nonrecursive option shape.
Parse installed Codex metadata with syntax validation and order-preserving dedupe.
Keep display/selection helpers web-local, validation daemon-local.

Use the existing model discovery primitive for the selected configured runtime at
execution validation, without probing every unrelated CLI. Reuse its timeout and
fallback semantics. Avoid introducing a second persistent catalogue or auth cache.
No per-render network request. Resolve capabilities once per explicit run/test
reasoning selection so execution does not depend on a prior UI visit.

Validate at the existing model-resolution boundary before agent spawn and return BAD_REQUEST for unsupported
known-model reasoning. Connection tests return invalid_reasoning. Fallback paths
retain existing unknown-value handling and the defensive Codex clamp.

Extend the existing McpRunCreateRequest, od run start/redesign --reasoning, and
MCP start_run schema. Preserve existing prompt-file, workspace and retry handling. Reconcile preferences at both UI model selection and
catalogue refresh. Use existing translated labels, native reasoning selects, existing searchable model controls, and styles.

## Validation

Lead with failing parser/forwarding and picker tests. Add validation tests for
future options, malformed metadata, custom/legacy models and configured CLI probes.
Exercise CLI with a temporary HTTP server and MCP with HTTP-boundary assertions.
Run the actual daemon with a fixture CLI to inspect child argv, including rejected
unsupported settings. Validate the visible entry path with Playwright and screenshot.
Run pnpm guard, pnpm typecheck, affected package suites/builds. Record results in
validation.md and mark tasks only after evidence is collected.
