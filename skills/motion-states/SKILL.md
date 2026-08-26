---
name: motion-states
description: Design purposeful, accessible motion for interface states.
version: 0.1.0
author: Alpon
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [design, motion, animation, hero, onboarding, loading, hyperframes, p5js, design-agent]
    related_skills: [brand-token-system, design-imagery, impeccable]
---

# Motion States

Create or source motion elements for **hero**, **onboarding**, and **loading**
states. Deliver them as Lottie JSON, GIF, rendered video, or runnable
HTML/canvas while honoring the active brand tokens and reduced-motion behavior.

## When to use this skill

- "Add motion to the hero / a loading animation / an onboarding transition"
- "Animate this section"
- Any request for movement, transitions, or animated assets

## Inputs

- The state(s) to animate: hero, onboarding, loading (or a custom one)
- The active brand tokens (colors, type) and any logo/asset to animate
- Delivery preference: Lottie JSON, GIF, rendered video, or runnable code

## Workflow

1. **Choose source or creation.** Use CSS or Web Animations API for interface
   transitions and canvas for custom procedural motion. When a ready-made
   animation fits the brief, load `design-imagery` and use the IconScout MCP to
   search Lottie assets, inspect metadata, and preview candidates.
2. **Approve before download.** A catalog preview is evaluation material only.
   Show the exact IconScout asset, source page, premium status, and intended
   JSON/GIF/MP4 format, then download only after explicit user approval.
3. **Apply tokens.** Colors, easing, and type come from `brand-token-system`.
   Do not assume a sourced animation is recolorable; verify the delivered format.
4. **Keep it tasteful.** Use short, purposeful motion, respect reduced-motion
   intent, and loop loaders cleanly.
5. **Render and verify.** Test actual playback, dimensions, loop behavior,
   transparency, performance, and the reduced-motion fallback. Do not ship an
   unverified file or IconScout preview.

## Output contract

- An approved Lottie `.json`, `.gif`, rendered `.mp4`/`.webm`, and/or runnable
  single-file HTML per state
- Duration, dimensions, and how to embed it
- Editable source when created locally, or IconScout asset ID, source URL,
  selected format, and license metadata when sourced

## Notes

Motion is outside the Design Agent's M1 default. Confirm the requested state,
purpose, output format, and reduced-motion behavior before implementation.
