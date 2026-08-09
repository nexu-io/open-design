# Integrations Connect smoke (manual)

Manual QA checklist for the Integrations MCP catalogue. Not automated — run on a GUI machine with `pnpm tools-dev`.

## Higgsfield (OAuth HTTP)

1. Open Settings → Integrations → MCP.
2. Add template **Higgsfield** (`higgsfield-openclaw`).
3. Save, then click **Connect** and finish OAuth.
4. Confirm the row shows connected / token present.
5. In a project chat, ask for a simple still (use the template example prompt).
6. Expect a tool call against Higgsfield and an image/video result (or a clear auth error if the account lacks credits).

## Blender (local DCC)

Prereqs: Blender 4.2+, companion addon for the chosen template, `uvx` on PATH for ageless.

### Path A — ageless stdio

1. Install [ageless-blender-mcp](https://github.com/ageless-h/blender-mcp) addon; start the in-Blender server.
2. Add MCP template **Blender (ageless MCP)** (`blender-ageless`, category **3D**).
3. Ask the agent to list scene objects and create a named cube; expect MCP tool traffic and a viewport/render file if requested.

### Path B — DCC HTTP

1. Enable [dcc-mcp-blender](https://github.com/dcc-mcp/dcc-mcp-blender); start embedded MCP on `http://127.0.0.1:9765/mcp`.
2. Add template **Blender (DCC MCP HTTP)** (`blender-dcc-http`).
3. Ask for a scene summary + preview still.

## Optional media MCP (Bearer / OAuth)

Smoke one of: **Runway** (OAuth), **Luma / Midjourney / Kling (AceDataCloud)** (Bearer from platform.acedata.cloud), **ComfyUI** (`npx comfyui-mcp` + local Comfy on :8188).

Pass criteria: template appears in picker under the expected category, save succeeds, Connect or token field works, and one agent tool call returns without daemon crash.

Settings → Media lists **Runway** and **Luma Dream Machine** as integrated BYOK providers (`RUNWAYML_API_SECRET` / `LUMAAI_API_KEY`, or paste keys in Settings). MCP Connect remains an alternate agent tool path.

## Scenario plugins

Apply **Blender to artifact** (`od-blender-to-artifact`) or **Higgsfield media** (`od-higgsfield-media`) from the plugin catalogue and confirm the agent follows the SKILL (MCP-first, then live-artifact wrap).
