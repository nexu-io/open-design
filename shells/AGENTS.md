# Shell guide

Follow the root `AGENTS.md` first. Shells are product carriers and user-entry adapters. They may depend on public package contracts, but must not import app-private source or redefine distribution and generation semantics.

## Active shells

- `shells/terminal`: exact official Node carrier and terminal lifecycle entrypoint. It owns shell identity, repository configuration, and CLI presentation. `packages/standalone` owns verification and state transitions; `apps/closure` owns Closure content.

## Boundary rules

- A shell must not import `apps/**`.
- Shell-specific environment variables, workflow contexts, and storage credentials must not enter package contracts.
- Tests live in `shells/<name>/tests`, sibling to `src`.
