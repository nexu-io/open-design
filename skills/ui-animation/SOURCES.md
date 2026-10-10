# Source and adaptation

- Upstream: https://github.com/mblode/agent-skills/tree/5a781a88ed60c1033767b6b6a966887cd93dd912/skills/ui-animation
- Commit: `5a781a88ed60c1033767b6b6a966887cd93dd912`
- Author and license: see the bundled MIT `LICENSE`. This license covers the
  skill material; runtime libraries and external assets retain their own terms.

## Open Design changes

- Added localized catalogue metadata, search triggers, functional mode, and host
  execution constraints.
- Bundled all 18 runtime references and all three measurement scripts; removed
  a trailing blank line in gesture-drag.md without changing its content.
- Clarified capability checks, isolated dependencies, truthful degradation, and
  fresh output directories; no automatic global dependency installation.
- Excluded upstream eval fixtures and replaced their runtime maintenance note.
