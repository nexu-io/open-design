# packages/closure-store

Follow the root `AGENTS.md` and `packages/AGENTS.md` first.

This package owns the local, shell-neutral Standalone Closure store. It verifies
materialized immutable candidates and coordinates one `active`, `attempt`, and
`lastSuccessful` state machine per `<channel, namespace>`.

It does not download or extract archives, select release updates, launch
processes, expose Desktop IPC, or reuse Desktop launcher state. Persisted state
must not contain ports or other transient transport identity.

One coordinator owns mutation for a channel/namespace in this migration. A
general multi-shell attachment lease or cross-process activation lock remains
out of scope until that product requirement is explicitly modeled.
