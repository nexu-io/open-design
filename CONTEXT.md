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

**Home Composer Media Surface**:
A Home-only composer intent that lets the prompt card expose media-specific defaults before project creation. The current media surfaces are `image`, `video`, `hyperframes`, and `audio`; they map onto the existing project kinds at submit time instead of extending the backend `ProjectKind` union.
_Avoid_: project kind, backend kind

**Chip Rail**:
The row of intent chips below the Home prompt card. A chip chooses the composer surface, default scenario plugin, default option state, and project kind stamp before the user presses Run.
_Avoid_: plugin list, template list

**HyperFrames Composer Surface**:
A standalone Home composer media surface shown between Video and Audio for HTML-based motion generation. It submits as `kind: "video"` with `videoModel: "hyperframes-html"` so persisted projects keep the existing video backend shape while the Home UI still gives HyperFrames its own entry point.
_Avoid_: new project kind, separate backend media kind

**Essential Audio Generation**:
A Home Audio entry workflow for the audio capabilities that the product can attempt directly in v1. It includes speech and sound effects, and excludes music until there is an integrated music generation path.
_Avoid_: audio studio, full music workflow

**Audio Source Field**:
The inline Home Audio option that provides the source content for generation. Speech uses a Text source because the content is spoken; sound effects use a Prompt source because the content describes a sound to synthesize.
_Avoid_: generic subject field, hidden prompt text

**ElevenLabs Fallback Voice**:
The default voice option shown when the Home Audio composer cannot load configured ElevenLabs voices. It keeps ElevenLabs speech runnable by selecting the same default voice id the daemon uses when no explicit voice is supplied.
_Avoid_: required credential setup, empty voice selector

## Relationships

- A **Project** contains zero or more **Normal Artifacts**.
- A **Normal Artifact** has exactly one **Artifact Entry File**.
- A **Normal Artifact** has exactly one **Artifact Manifest**.
- A **Live Artifact** belongs to a **Project** but is distinct from a **Normal Artifact**.
- An **Active Project** can be used as the target for MCP operations when the caller omits an explicit **Project**.
- A **Home Composer Media Surface** maps user intent to an existing project kind and project metadata at submit time.
- The **Chip Rail** is the visible Home entry point for choosing a **Home Composer Media Surface**.
- **Essential Audio Generation** uses an **Audio Source Field** plus model options before creating an audio **Project**.

## Example dialogue

> **Dev:** "When a coding agent creates a Codex deck through MCP, should it create a live artifact?"
> **Domain expert:** "No. Unless the user asked for refreshable data, create a **Normal Artifact**: write the **Artifact Entry File** and persist its **Artifact Manifest** in the **Active Project**."

## Flagged ambiguities

- "artifact creation" was used to mean both **Normal Artifact** creation and **Live Artifact** creation; resolved: this capability creates **Normal Artifacts** only.
