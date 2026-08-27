# Terminal shell guide

This shell owns Terminal identity, the exact Node carrier declaration, repository configuration, and user-facing lifecycle commands.

- Pin the official Node version exactly; do not silently accept another runtime in release artifacts.
- Consume `@open-design/standalone`; never import `apps/closure` or any other app source.
- Own Terminal-specific scene assembly and promotion. Consume Closure only through
  explicit conventional build artifacts supplied by orchestration.
- Keep lifecycle execution behind the standalone `LifecyclePort` seam until #7244 supplies the final Sidecar adapter.
- Do not depend on `.github/scripts`, `tools/pack`, or `tools/release`.
