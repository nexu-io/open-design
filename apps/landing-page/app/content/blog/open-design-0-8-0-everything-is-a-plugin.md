---
title: "Open Design 0.8.0: everything is a plugin"
date: 2026-05-22
category: "Product"
readingTime: 7
summary: "Open Design 0.8.0 isn't a release, it's a rebuild. A small plugin engine, a headless-by-default CLI, packaged auto-update on macOS and Windows, and 149 design systems shipped in seven days."
---

Tag `open-design-v0.8.0` (`c20d156`), shipped 22 May 2026, 12:43 UTC. 305 PRs from 75 contributors in seven days. This is the release where we stopped trying to extend the old shape and rebuilt the engine underneath. The desktop app you'll download today is a thin wrapper around a CLI you can also point at from Claude Code, Cursor, or a Slack bot. The design systems, slices, prototypes, exports, and the old Figma-style workflows are no longer features baked into the engine — they're plugins, written against a small, boring core.

If you want the long version, the discussion thread has it. This post is the short version: what changed under the hood, what you can do with it today, and where to start.

## Why a rebuild, not another release

The 0.7 line had a problem. Every workflow lived inside the engine — design-system imports, deck templates, slice rendering, the Figma port, even the publish step — and adding the next thing meant editing the core. That is the dynamic that turned every editor before us into a plugin graveyard: a SaaS plugin API that locked behind a version, a "creator program" you had to apply to, a runtime that broke every two years.

We could have shipped 0.8 as another point release on that surface. Instead, we shipped the rewrite.

Underneath, three things are different now:

- The engine stayed small and boring. It runs skills, mounts plugins, calls agent adapters, and gets out of the way.
- Everything else became a plugin. Design systems, slices, prototypes, exports, the old Figma workflows — they all live in the same plugin format, registered through the same manifest, sandboxed through the same surface.
- The CLI is the canonical entry point. The desktop app calls into it; so does the OD MCP server; so does the agent in your terminal.

The 305 PRs in this release are mostly the work of porting the old world into the new shape. Some of them are the new shape itself.

## The three architectural plates

**Everything is a plugin.** The plugin registry surface now has a detail drawer with trust badges, a GitHub rate-limit-aware marketplace fallback, a polished publish footer, and a unified plugin / integration nav (#2087, #2064, #1806, #1849). Publishing a plugin creates a real GitHub repo under the author's account (#2332, #2363), and the CLI publish path reads the live manifest version instead of stubbing it (#1903). When the engine grows, it grows out here, in public.

**Headless by default.** The desktop app is now a thin wrapper around the OD CLI. The same engine runs from Claude Code, OpenClaw, Hermes Agent, and chat bots in Lark, Discord, and Slack. Custom CLI agent profiles ship in this release (#378), so you can plug an arbitrary CLI agent into the runtime without touching core. Design stops being a place you go and becomes a capability your agents have. This is what [the skill-layer manifesto](/blog/why-we-built-open-design-as-a-skill-layer/) was pointing at; 0.8.0 is the first release where the agent path is the canonical path, not a side door.

**Plugins create plugins.** OD CLI wraps GitHub CLI, so an agent can clone the repo, scaffold a plugin, validate it, pack it, and open a PR — for you, or for itself. The [how-to-port-a-Figma-workflow guide](/blog/port-figma-workflow-open-design-plugin/) walks the human path; the automated version of the same path is now reachable from inside any agent that has `gh` and `od` on `$PATH`. The engine grows itself, in public, with you in the loop.

## What else lands in 0.8.0

The release is wide. The pieces worth pulling forward:

- **149 design systems with structured `tokens.css` + components manifests.** Brand-token fixtures for Apple, Stripe, Airbnb, Vercel, Notion, Linear, GitHub, Figma, Slack, Discord, OpenAI, Shopify, Spotify, Uber, Cursor, and 50 more — each ships `tokens.css` and `components.html`, served through a default-on token channel (#1544, #1652, #1794, #1841, #2023, #2028, #2029, #2033). The [portable-system reasoning](/blog/open-source-alternative-to-claude-design/) is now the default surface, not a side door.
- **Critique Theater through Phase 16.** What was a single observable judge in 0.7.0 is now a fully-instrumented loop: Phase 9 web client wrapper with native de / ja / ko / zh-TW i18n, Phase 11 Playwright stage suite, Phase 12 with 9 Prometheus metrics + 6 log events + OTel span + Grafana dashboard, Phase 15 rollout resolver, Phase 16 M-phase rollout ratchet and `/api/critique/conformance` (#1315–#1320, #1338, #1483–#1485, #1499). Dark-launched at M0 by default.
- **Three new media providers.** Leonardo.ai image generation (#1123), ElevenLabs audio (#1384), and SenseAudio TTS plus BYOK chat with image and video tools (#1633, #2065). The media dispatcher now speaks OpenAI-compatible to anything you point it at.
- **Packaged auto-update on macOS and Windows.** First release where packaged installs self-update end-to-end on both platforms through the same R2 feed, with a refreshed updater popup, validated download / install handoff, and recovery from interrupted applies (#2270, #2362, #2376, #2403, #2429, #2565, #2575, #2592, #2595, #2677, #2687, #2700). The Linux packaged GUI is still deferred while we harden the lane; the headless lifecycle and the Nix flake both work today.
- **Italian (it) locale + CJK font fallback.** The UI now ships in 19 languages including Italian (#1323), and Chinese / Japanese / Korean text falls back to platform-native fonts instead of going through Latin substitution (#2227).
- **Top-to-bottom visual refresh.** New app icons, brand glyphs, refreshed wordmark — one coordinated drop in time for the cut (#2436).

The full list runs to 305 PRs. The [release notes on GitHub](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0) carry the rest.

## What to do with it today

Three paths, depending on where you start.

| If you're… | Start here |
|---|---|
| New to Open Design | Download the desktop app and let it bootstrap a project against an existing design system |
| Already running Open Design | Let the packaged auto-update bring you to 0.8.0; the in-app updater popup walks you through the validated install |
| Building a plugin | Scaffold with `od plugin scaffold --id <name>`, validate with `od plugin validate ./<path> --no-daemon`, and open a PR through the same OD publish path that ships every other plugin in the marketplace |

If you've been waiting for the agent-native loop to feel like the canonical loop instead of a demo, this is the release. Point Claude Code, Cursor, Codex, or any of the 16 detected CLI agents at the same OD CLI the desktop app ships with, and the two paths converge after the first prompt.

## What to do next

The fastest way to feel the difference between 0.7 and 0.8 is to install the desktop app, let it pick up your existing agent, and run the same brief you ran last month. The shape of the answer changes.

[Download desktop](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.8.0).

## Related reading

- [Why we built Open Design as a skill layer, not a product](/blog/why-we-built-open-design-as-a-skill-layer/) — the longer manifesto behind the "engine plus plugins" bet 0.8.0 finishes paying off
- [How to port a Figma workflow into an Open Design plugin](/blog/port-figma-workflow-open-design-plugin/) — the practical version of the "plugins create plugins" loop
- [The open-source alternative to Claude Design](/blog/open-source-alternative-to-claude-design/) — where this release fits in the agent-native design landscape
