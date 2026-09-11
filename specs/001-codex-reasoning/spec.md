# Feature specification: model-owned Codex reasoning

Issue: https://github.com/nexu-io/open-design/issues/5402

## User scenarios and testing

### US1 — Choose supported reasoning (P1)

As a Local CLI user, I can choose every reasoning option advertised for my selected
model in the inline switcher, avatar menu, and execution settings.

Acceptance: Sol and Astra offer max and ultra; Luna offers max but no ultra;
GPT-5.5 offers low through xhigh. A future advertised option appears without a
product release. Choosing Default delegates to the CLI configuration.

### US2 — Keep model changes valid (P1)

As a user switching models, my reasoning choice is retained only when supported.
Unsupported saved choices become Default, including settings loaded from storage.
Older CLIs and custom models continue to use the compatibility options.

### US3 — Use the same settings externally (P1)

As an external agent or command-line user, I can discover model capabilities and
start a run with the same model and reasoning available in the UI. Explicit
unsupported choices fail before generation rather than silently changing effort.
Long prompts can come from files or stdin; responses support machine-readable output.

## Functional requirements

- FR-001: Preserve per-model supported options, descriptions, order, and default.
- FR-002: Accept future well-formed advertised option IDs without a fixed enum.
- FR-003: Ignore malformed catalogue entries without losing unrelated models.
- FR-004: All three UI selectors use model options first and compatibility options
  only when model metadata is unavailable. Default is always available.
- FR-005: Unsupported persisted selections reset to Default on model change or
  catalogue refresh; supported selections survive.
- FR-006: Run creation and connection tests apply the same model-aware validation
  using the configured CLI environment. Unsupported known-model values fail clearly.
- FR-007: CLI and MCP preserve explicit run-scoped reasoning through the HTTP layer.
- FR-008: Older catalogues/custom models retain the existing fallback, including a
  final minimal-to-low compatibility mapping for GPT-5.6.

## Success criteria

- SC-001: All advertised options, including a synthetic future option, are selectable
  and arrive unchanged at the child process argument boundary.
- SC-002: All three selectors and external run paths agree for the same model.
- SC-003: Known unsupported settings never start an agent process.
- SC-004: Regression tests fail before implementation and pass afterward; repository
  guard/typechecks and affected suites pass, with any baseline failures documented.

## Clarifications and scope

The existing conversation resolves the critical choices: installed Codex metadata
is authoritative; API model-list discovery and App Server migration are out of scope.
New reasoning IDs remain strings, not a hardcoded ranking. Default is delegation,
not a forced copy of the advertised default (user CLI configuration may override it).
Explicit API errors and automatic UI preference repair serve different purposes.

The upstream target already provides `od run start`, `od run redesign`, MCP
`list_agents`/`start_run`, and model-owned service tiers. Extend those surfaces
without replacing their workspace scoping, redesign, or idempotency semantics.
Codex gets fresh configured-executable discovery for explicit reasoning; other
runtimes retain their existing model-cache scopes and picker defaults.

## Key entities

Model capability metadata; reasoning option; saved agent/model preference;
run-scoped execution request. No database migration is required.
