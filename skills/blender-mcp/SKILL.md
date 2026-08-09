---
name: blender-mcp
description: |
  Drive local Blender 4.2+ from the agent via MCP — scene perception, modeling, materials, nodes, render, and import/export. Pair with the Blender MCP templates in Settings → Integrations.
triggers:
  - "blender"
  - "blender mcp"
  - "bpy"
  - "3d scene blender"
  - "render in blender"
od:
  mode: image
  category: 3d-shaders
  upstream: "https://github.com/ageless-h/blender-mcp"
---

# blender-mcp

> Curated from the ageless-h Blender MCP project (also see dcc-mcp/dcc-mcp-blender).

## What it does

Drive local Blender 4.2+ from the agent via MCP — scene perception, modeling, materials, nodes, render, and import/export. Pair with the Blender MCP templates in Settings → Integrations.

## Current Open Design scope

Enable the Blender (ageless MCP) or Blender (DCC MCP HTTP) template under Settings → Integrations, install the matching Blender addon, and keep Blender running with its MCP server started before asking the agent to call tools.

## Source

- Upstream: https://github.com/ageless-h/blender-mcp
- Category: `3d-shaders`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/ageless-h/blender-mcp
```

Then ask the agent to invoke this skill by name (`blender-mcp`) or with
one of the trigger phrases listed in this skill's frontmatter.
