# Closure app guide

This app owns OpenDesign Closure content and its distribution contribution.

- The cold-start fixture must remain independent from Web, daemon, Sidecar, and shell code.
- Emit only public `@open-design/standalone` contribution shapes.
- Build content through the package's conventional build output. Do not add pack,
  cache, materialize, promote, release, or workflow CLI entrypoints here.
- Do not own channel pointers, signature verification, Store layout, generation state, or Terminal behavior.
- Do not import `shells/**`.
