---
name: figma-extract
description: Read Figma tokens, components, and assets through MCP.
version: 0.1.0
author: Alpon
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [design, figma, mcp, tokens, variables, assets, design-agent]
    related_skills: [brand-token-system, layout-options]
---

# Figma Extract

Bridge to Figma so the Design Agent can start from an existing design file:
read **variables/tokens**, list **components**, and pull **assets/frames** as
references. This is the read side of the M3 Figma round-trip.

## Prerequisites

- The official remote Figma MCP at `https://mcp.figma.com/mcp`, configured in
  the active client and authorized through browser OAuth.
- A successful tool discovery check in the current client. A configured URL
  alone is not proof that the client or account is authorized.
- Access to the target file and node. This skill never requests or stores a
  `FIGMA_API_KEY`.

## When to use this skill

- The user gives a Figma file/frame URL
- "Pull the tokens/components from our Figma"
- A brief that references an existing Figma design as the source of truth

## Inputs

- A Figma file or frame URL (and node id if a specific frame)

## Workflow

1. **Verify tools, then connect.** Confirm Figma tools are visible in the active
   session and resolve the file/node. If not, use the fallback below.
2. **Extract variables/tokens** (colors, type, spacing) → hand to
   `brand-token-system` to normalize into `DESIGN.md` + `tokens.css`.
3. **List components** and their structure for reuse in mockups.
4. **Pull assets/frames** (export images of frames) as references for
   `layout-options` / `design-imagery`.
5. **(Stretch)** With a Dev Mode selection, generate code/markup for the frame.

## Graceful degradation (AC-4)

If the Figma MCP is **not** configured or access fails:
- Say so explicitly (don't silently skip).
- Fall back to **screenshots**: ask for / read an exported image of the frame
  using the active client's image-reading capability and proceed from there.

## Output contract

- A normalized token set (via `brand-token-system`)
- A component/asset inventory with any exported reference images
- A clear note of whether live Figma access or the screenshot fallback was used

## Rules

- **Read by default.** Never overwrite a live Figma file or shared library
  without explicit owner approval; work on a copy.
- Never commit OAuth tokens, authorization responses, or cached Figma content.
