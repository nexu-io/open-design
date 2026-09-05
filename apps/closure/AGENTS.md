# Closure app guide

This app owns the generation-distributed OpenDesign product runtime and its
distribution contribution.

- Own daemon/Web process composition and expose only finite product runtime
  commands through the public `@open-design/standalone` handoff.
- Consume Shell services only through versioned Standalone capabilities. Do
  not import a concrete Shell or infer Shell-owned paths.
- Depend on daemon/Web only through their public Sidecar entries and protocol.
- Build content through the package's conventional build output. Do not add pack,
  cache, materialize, promote, release, or workflow CLI entrypoints here.
- Do not own channel pointers, signature verification, Store layout, generation
  state, platform packaging, or Terminal behavior.
- Do not import `shells/**`.
