# apps/daemon/tests/fixtures/plugin-fixtures

Declarative plugin fixtures used by Phase 1 plugin-system tests
(`docs/plans/plugins-implementation.md` Phase 1 e2e-1).

Each subfolder is a self-contained Open Design plugin (per
`docs/plugins-spec.md` §5) ready to be passed to
`od plugin install --source <path>`.

- `sample-plugin/` — minimal `open-design.json` + companion `SKILL.md`.
  The sidecar has primary precedence; the `SKILL.md` exists so the
  daemon's compat adapter can be tested in isolation by deleting
  `open-design.json`.
