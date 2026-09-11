---
name: od-blender-to-artifact
description: Drive local Blender via MCP, render/export a preview, and wrap it as a live artifact.
od:
  scenario: blender-to-artifact
  mode: scenario
---

# od-blender-to-artifact (scenario)

Use this scenario when the user wants a **3D / Blender** path into an Open Design artifact.

## Prerequisites

1. Blender 4.2+ installed locally (Open Design does not ship Blender).
2. Settings → Integrations → MCP: one of:
   - **Blender (ageless MCP)** (`blender-ageless`, stdio/`uvx`) with the companion addon running, or
   - **Blender (DCC MCP HTTP)** (`blender-dcc-http` at `http://127.0.0.1:9765/mcp`).
3. Confirm the MCP row is enabled and connected before generating.

## Pipeline intent

1. Clarify the scene brief (`discovery-question-form` when needed).
2. Plan MCP tool calls (`todo-write`).
3. Call Blender MCP tools to create/adjust objects, materials, camera, and render/export.
4. Save the still (or exported asset) under the project `media/` (or `.od/artifacts/`) tree.
5. Call `live-artifact` so the right pane previews the file.

## Rules

- Prefer the already-connected Blender MCP template; do not invent a second transport.
- Keep edits reversible: name new objects clearly and avoid deleting user-owned meshes unless asked.
- If Blender MCP is missing or offline, stop and tell the user how to enable the template — do not fake a render.
