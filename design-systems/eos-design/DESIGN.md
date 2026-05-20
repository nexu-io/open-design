# EOS Design System

> Category: EOS Agency design language — Apple-flavored macOS-chrome
> Imported from `~/Projects/EOS AGENCY/enoch-macos-portfolio/src/css/theme.css` (2026-05-19).

## Visual identity

EOS Mac is the macOS-chrome design vocabulary used in the enochodu portfolio site and any internal tool that wants to feel like a native Mac app. The brand reads as **familiar, restrained, brightness-shifted**. Type uses the San Francisco family (`-apple-system, BlinkMacSystemFont, …`); hierarchy is built from one accent — Apple Action Blue (`#007AFF`) — and a 9-stop grey ramp from `#FAFAFA` to `#212121`.

Surfaces alternate `#FFFFFF` (true white retail canvas) with `#F5F5F7` (pale Apple gray feature fields). Window chrome uses a soft drop-shadow (`--eos-window-shadow`) at 18% opacity to mimic floating macOS windows. Pill buttons use Apple's signature 980px radius rather than 9999px — small detail, big feel.

The interface is **calm and information-light**. Type is generous (17px body, 100px section gap on desktop), tracking is tight (`-0.015em` on display sizes), and the only saturated color anywhere is the action blue. Everything else is neutral, letting the user's content do the work.

## Key characteristics

- Accent: Apple Action Blue (`hsl(211, 100%, 50%)` = `#007AFF`) — buttons, links, focus rings
- Hover state lifts (not darkens): `hsl(211, 100%, 47%)` — Apple's documented behavior
- Pill radius: 980px (not 9999) — Apple's published CSS literally uses this
- Grey ramp: 50→900 in HSL space, lifted from system-color-grey-{N}
- Type ramp: 11/13/14/17/21/28/40/56px (Apple's documented marketing scale)
- Window shadow: `0 12px 48px rgba(0, 0, 0, 0.18)` — soft, large radius, low spread
- Motion: 180ms `cubic-bezier(0.28, 0, 0.22, 1)` — Apple-style settle-without-bounce
- Semantic colors match Apple's system palette: `#34c759` success, `#ff9500` warn, `#ff3b30` danger

## Anti-patterns

- No round buttons except 980px pills and standard circle icon buttons — Apple uses rectangles
- No gradient backgrounds in panels — only on hero CTAs at most
- No drop-shadow on body text or headings — flat type is the rule
- No accent color outside the blue family — Apple's brand is monochrome blue + neutrals

## When to pick

Portfolio sites with macOS-chrome aesthetic, internal Mac-only tools, Apple-flavored prototypes, anything where "feels native to my Mac" is part of the brief. If the design needs visual variety beyond one accent, pick a different brand.
