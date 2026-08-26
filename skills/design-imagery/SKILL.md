---
name: design-imagery
description: Source and document brand-matched photos and visual assets.
version: 0.1.0
author: Alpon
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [design, photography, illustration, icon, svg, 3d, lottie, animation, pexels, iconscout, brand, design-agent]
    related_skills: [brand-token-system, motion-states]
---

# Design Imagery

Source and art-direct photography and visual assets that match the active brand
palette and composition. Current production sources are approved client assets,
Pexels photography, and IconScout icons, SVGs, illustrations, 3D assets, Lottie
animations, GIFs, or video assets when their MCP servers are connected.
Generative imagery is deferred and must not be implied or fabricated.

## When to use this skill

- "Find a hero image / illustration for this"
- "I need on-brand imagery for the landing page"
- "Use Pexels photography in this graphic"
- "Find an IconScout illustration for this social post"
- "Find an SVG icon, Lottie animation, or 3D asset for this interface"

Do not activate this skill merely because a mockup has empty image regions.
The user must explicitly request sourced imagery or approve using it after the
need is surfaced.

## Prerequisites

- Pexels MCP tools for photography: `pexels_search_photos`,
  `pexels_get_photo`, `pexels_preview_photo`, and `pexels_download_photo`.
- IconScout MCP tools for catalog assets: `iconscout_search_assets`,
  `iconscout_get_asset`, `iconscout_preview_asset`, and
  `iconscout_download_asset`.
- If the required MCP is unavailable, use approved local or client assets or
  stop and name the missing prerequisite. Do not substitute an unapproved
  provider.

## Inputs

- The active brand tokens (palette/style) from `brand-token-system`
- A subject/brief for each image and its aspect ratio / placement
- The intended surface and attribution location

## Workflow

1. **Pull the palette and composition.** Define the subject, mood, crop, focal
   point, negative space, and treatment needed by the layout before searching.
2. **Choose the approved source.** Use this order:
   - client-supplied or repository assets;
   - Pexels MCP for photography;
   - IconScout MCP for icons, SVGs, illustrations, 3D assets, Lottie
     animations, GIFs, or video assets.
3. **Search narrowly.** Match subject, orientation, dominant color, style, and
   usable negative space. For IconScout, choose the asset type and intended
   delivery format before searching: SVG/PNG for static graphics, JSON/GIF/MP4
   for motion, or GLB/FBX/OBJ for 3D use.
4. **Inspect and preview.** Fetch metadata and preview each candidate before
   selection. Preview images are for evaluation only; never ship a watermarked,
   thumbnail, or catalog-preview URL as the final asset.
5. **Get approval before use.** Show the exact candidate, provider, creator when
   available, source page, intended format, premium status, and attribution or
   license note. Pexels photo use and every IconScout licensed download require
   explicit user approval.
6. **Preserve source requirements.** For Pexels:
   - include a prominent link to Pexels in the artifact or approved
     accompanying caption;
   - credit the photographer with links to the photographer and photo pages
     whenever possible;
   - use the returned source URL and alt text, and do not redistribute the
     photo as standalone stock content;
   - do not collect Pexels content for AI training or evaluation datasets.
7. **Download the approved deliverable.** Request only a format supported by
   the selected asset. Keep SVG editable, retain Lottie JSON when runtime motion
   is needed, and retain GLB/FBX/OBJ when the design requires a real 3D asset.
   Use PNG, GIF, or MP4 only when a flattened or rendered deliverable is intended.
8. **Integrate in the design tool.** Figma remains responsible for typography,
   layout, overlays, color treatment, and final crop. Use a compatible 3D or
   motion renderer when Figma cannot faithfully consume the source format.
9. **Visually verify the composite.** Check crop, readability, brand fit,
   animation playback or 3D orientation where applicable, attribution, and all
   requested output sizes. Replace weak candidates rather than masking them
   with decorative effects.
10. **Return files or URLs plus provenance.** Include source, creator when
    available, source URL, asset ID, selected format and dimensions, attribution,
    and license or usage notes.

## Output contract

- Selected photo or asset files in the approved format; Pexels API image URLs
  are acceptable only when the target surface is intended to load them remotely
- Source provider, asset/photo ID, creator when available, source URL, selected
  format, and attribution text
- A note describing crop, color treatment, placement, animation playback, or 3D
  presentation as applicable
- License or usage notes, including whether a tracked selection or premium
  download occurred

## Rules

- Imagery must read as part of the same brand as the tokens.
- Do not use image generation until a backend is separately approved and added
  to this skill.
- Never claim an asset was generated when it was sourced.
- Never omit the prominent Pexels link or available photographer attribution.
- Never download an IconScout licensed asset without explicit approval; premium
  downloads may consume a credit.
- Never ship an IconScout preview in place of the licensed source asset.
- No real logos/trademarks of third parties unless supplied by the client.
