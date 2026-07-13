# tools/serve

Follow the root `AGENTS.md` and `tools/AGENTS.md` first. This tool owns small local-development service entrypoints.

## Owns

- `tools-serve` CLI.
- Local static updater fixtures for desktop update IPC and packaged-runtime debugging.

## Rules

- Keep services self-contained and local-first.
- Do not put product update runtime logic here; this tool serves deterministic fixtures only.
- New services should use explicit subcommands under `tools-serve start <service>`.
