# Open Design community alignment

This plugin is shaped as a community-installable Open Design scenario with a portable `SKILL.md` as its executable contract.

## Reference patterns reviewed

### Community Registry Starter

Open Design's `plugins/community/registry-starter` provides a useful baseline for a standalone community scenario:

- `od.kind: scenario`
- `od.taskKind: new-generation`
- `od.mode: prototype`
- `prompt:inject` capability
- host-provided project/run execution

This shows that a community plugin can be a first-class project entry point while relying on Open Design's normal artifact runtime.

### Hallmark

`plugins/community/hallmark` encodes substantial design and implementation behavior in `SKILL.md` while keeping the Open Design manifest lightweight.

The relevant pattern is separation of concerns:

```text
SKILL.md
→ portable agent behavior

open-design.json
→ marketplace metadata, preview, context wiring, capabilities
```

Parallel Design Exploration follows the same pattern.

### Broader-capability plugins

Some community plugins request filesystem, shell, or other elevated capabilities because those capabilities are intrinsic to their workflow. Open Design's trust model accounts for that broader execution surface.

Parallel Design Exploration's core behavior is an artifact and interaction protocol, so `prompt:inject` is sufficient for the community distribution path.

## Community-safe execution model

The plugin relies on Open Design's built-in project runtime for normal file creation, editing, preview, and conversation history. The portable skill contributes the design-state protocol:

```text
brief
  ↓
parallel rendered options
  ↓
one primary exploration artifact
  ↓
stable identities + immutable delivered states
  ↓
follow-up turns extend the same visible history
  ↓
user-directed continuation or convergence
```

This keeps the plugin installable with the restricted community capability floor while preserving a rich design workflow.

The artifact lifecycle is behavioral rather than privileged: the skill asks the host agent to resolve the existing primary exploration artifact and edit it in place on follow-up turns. It does not require a custom filesystem capability or private versioning service.

## Host planning and design guidance

Open Design can contribute host-level discovery, craft, and design-direction guidance. The plugin treats those signals as context for the rendered options while keeping the persistent options-canvas structure, artifact identity, and historical-state semantics stable.

The same portable behavior remains understandable to other Agent Skills clients because the interaction contract lives in `SKILL.md` rather than depending on a private Open Design runtime extension.

## Preview and executable context

The manifest preview is primarily a marketplace/user-facing example. The executable behavior comes from the injected skill contract.

For that reason, the structural protocol, mutation semantics, and small canonical canvas substrate that materially affect generated artifacts are expressed directly in `SKILL.md`. Preview files demonstrate the experience but are not hidden runtime dependencies.

The substrate is intentionally limited to exploration chrome—turn spacing, ids, sibling layout, artifact framing, and navigation—so host-level design guidance can continue shaping the actual options without needing to reinvent the workspace itself.

## Distribution principle

The repository keeps one portable skill and one additive Open Design manifest:

```text
SKILL.md             → agent capability, state mutation, canonical substrate
open-design.json     → Open Design packaging
examples/            → human-readable demonstrations
references/          → method and compatibility notes
templates/           → structural starting points
```

That layout keeps the plugin useful inside Open Design while remaining legible to the wider Agent Skills ecosystem.
