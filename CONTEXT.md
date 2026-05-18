# Open Design

Open Design is a local-first design workspace where projects contain generated design files and agent conversations. This glossary records domain language only, not implementation details.

## Language

**Project**:
A top-level design workspace that contains conversations and design files.
_Avoid_: repo, folder, session

**Normal Artifact**:
A project design output represented by an artifact entry file and its artifact manifest.
_Avoid_: live artifact, generic file upload

**Live Artifact**:
A refreshable project design output stored as a live-artifact record with source data and preview state.
_Avoid_: normal artifact, static artifact

**Artifact Entry File**:
The primary project file that opens or renders a normal artifact.
_Avoid_: support file, asset, sidecar

**Artifact Manifest**:
The sidecar metadata that identifies a project file as a normal artifact and records its kind, renderer, exports, and entry file.
_Avoid_: live-artifact document, project metadata

**Active Project**:
The project the user most recently interacted with in the Open Design UI and that MCP tools may use when no project is specified.
_Avoid_: latest project, default project

## Relationships

- A **Project** contains zero or more **Normal Artifacts**.
- A **Normal Artifact** has exactly one **Artifact Entry File**.
- A **Normal Artifact** has exactly one **Artifact Manifest**.
- A **Live Artifact** belongs to a **Project** but is distinct from a **Normal Artifact**.
- An **Active Project** can be used as the target for MCP operations when the caller omits an explicit **Project**.

## Example dialogue

> **Dev:** "When a coding agent creates a Codex deck through MCP, should it create a live artifact?"
> **Domain expert:** "No. Unless the user asked for refreshable data, create a **Normal Artifact**: write the **Artifact Entry File** and persist its **Artifact Manifest** in the **Active Project**."

## Flagged ambiguities

- "artifact creation" was used to mean both **Normal Artifact** creation and **Live Artifact** creation; resolved: this capability creates **Normal Artifacts** only.
