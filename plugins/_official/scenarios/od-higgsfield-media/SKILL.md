---
name: od-higgsfield-media
description: Prefer Higgsfield MCP for image/video generation, then wrap output as a live artifact.
od:
  scenario: higgsfield-media
  mode: scenario
---

# od-higgsfield-media (scenario)

Use this scenario when the user wants **Higgsfield-first** media generation inside Open Design.

## Prerequisites

1. Settings → Integrations → MCP: add **Higgsfield**, save, then **Connect** (OAuth).
2. Leave the row enabled so agent runs can see the tools.
3. Optional catalogue skills (`higgsfield-generate`, photoshoot, brandkit, …) help planning language but MCP tools do the generation.

## Pipeline intent

1. Clarify aspect, still vs video, and brand constraints.
2. Call Higgsfield MCP tools for generation (Soul, Nano Banana, Kling, Veo, Seedance, … as appropriate).
3. If Higgsfield MCP is not connected, fall back to `media-image` / `media-video` using the user's Settings → Media provider.
4. Persist the binary under project `media/` and wrap with `live-artifact`.

## Rules

- Prefer MCP tool results over re-implementing HTTP against Higgsfield APIs.
- Do not invent API keys; OAuth is owned by the daemon Connect flow.
- Say clearly when you fell back to a non-Higgsfield media atom.
