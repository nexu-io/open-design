---
name: open-design-homepage
title: Open Design Homepage
description: A pixel-faithful, self-contained mirror of the live open-design.ai homepage — an interactive React Three Fiber / Next.js hero with a real-time 3D wordmark, sticker collage, variable fonts, and scroll-driven motion. First-party showcase of the visual ceiling for interactive web marketing surfaces.
license: MIT
---

# Open Design Homepage

A first-party **showcase** template that mirrors the live [open-design.ai](https://open-design.ai) homepage, captured as a fully self-contained bundle that renders in the sandboxed preview.

It is here to demonstrate the **visual ceiling** Open Design targets for interactive, WebGL-grade marketing surfaces on the web — not a fill-in-the-blank generator. Treat it as a reference build to study and adapt.

## What it is

- **Interactive 3D hero** — a real-time `Open Design` script wordmark rendered with **React Three Fiber / Three.js**, plus a cursor-reactive parallax layer and a floating sticker collage.
- **Scroll-driven narrative** — the work grid, capabilities copy, and decorative stickers animate as the page scrolls.
- **Craft details** — custom variable fonts (TikTok Sans, Geist Mono, Departure Mono), a light/dark theme toggle, an optional ambient soundtrack, and a live clock / cursor-coordinate HUD.

## How it is built (for reference)

- **Stack**: Next.js (App Router, Turbopack build) + React Three Fiber + Three.js, exported as a static, self-contained bundle.
- **3D geometry** is **Draco-compressed** (`KHR_draco_mesh_compression`) — the hero wordmark drops from ~4.4 MB to ~300 KB with no visible change, decoded at runtime by the bundled `DRACOLoader`.
- **Imagery** (work thumbnails, stickers) ships as **lossless WebP** — pixel-identical to the source PNGs at a fraction of the size, so every file stays under the 1 MB repository blob limit and the template needs no external asset host.
- **Self-contained & path-portable**: all assets load relative to the entry file, so the bundle renders correctly whether served from the site root or a nested preview subpath.

## Using it

Open `example.html` in the preview to explore the live, interactive result. All content is bundled locally — fonts, imagery, and 3D geometry ship in `assets/`, so there are no CDN scripts or external fonts. The one runtime network request is the Draco decoder, fetched from Google's `gstatic` CDN on demand (the same pattern the other WebGL examples use for their libraries). To adapt the aesthetic (typography, 3D treatment, sticker collage, scroll motion) into your own build, study the structure here and recreate it with your preferred React Three Fiber / Next.js setup.
