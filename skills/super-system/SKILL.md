---
name: super-system
description: |
  The Open Design "super-system" — a curated playbook of design + AI-coding patterns distilled from 14 production videos by working creators (Mobbin, Antigravity, AI Studio, Claude Design, Codex+GPT-5.5, Base44, Lovable, browser-harness, Awwwards-tier site teardown).

  Activates when the user wants any one of:
   1) A high-fidelity site/app prototype built from scratch
   2) An Awwwards-quality clone of a reference site
   3) A "generate this brief against all four CLIs and compare" run (Claude / Codex / Cursor / Gemini)
   4) Premium scroll-driven, frame-sequence, or video-as-background motion
   5) A design system applied as the persistent style anchor across a project

  Threads its PATTERNS.md into the system prompt of whichever agent the daemon spawns.
triggers:
  - "super system"
  - "use the super system"
  - "best practices design"
  - "clone this site"
  - "build me a premium landing"
  - "premium site"
  - "awwwards"
  - "compare all four"
  - "run all CLIs"
  - "multi-cli"
od:
  mode: design-system
  category: meta-playbook
  scenario: design
  default_for: premium-landing
  featured: 1
  fidelity: high
---

# Super-System

> The Open Design super-system. A single skill that consolidates the strongest patterns from 14 production-grade video tutorials into one playbook the agent threads into every premium generation.

## What it does

When the agent picks this skill at planning time, two resources land in its system prompt:

1. **`PATTERNS.md`** — 15 cross-cutting rules ("multi-model orchestration", "two-prompt site pattern", "frame sequences not videos", "annotate-to-edit beats re-prompt", etc.) extracted from the research below
2. **`RESEARCH.md`** — the 14-video synthesis with concrete tool stacks, prompt strategies, anti-patterns

The user-facing surfaces for this skill live INSIDE the Open Design web UI, not in this folder:

- **Fan Out button** in every project's chat composer (`apps/web/src/components/FanOutButton.tsx`) — pick 2+ CLIs, fire one brief in parallel
- **Compare tab** in the left nav rail (`apps/web/src/components/CompareView.tsx`) — bucket-by-fanoutGroupId side-by-side review, winner picker
- **Design-system quick chips** above the composer (`apps/web/src/components/DesignSystemQuickChips.tsx`) — one-click attach of pre-made systems

## How to invoke

Pick `super-system` from the design-system picker, OR type any trigger phrase:

- *"Build me a premium landing for X — use the super system"*
- *"Clone this site like Awwwards"*
- *"Run all four CLIs on this brief"*

For the multi-CLI flow specifically: click the Fan Out button in the chat composer, pick 2+ installed CLIs, send. Results land as N sibling assistant messages and are grouped in the Compare tab.

From the CLI: `od fanout --agents claude,codex,cursor-agent --prompt "..." --project <id>` (see `od fanout --help`).

## Files

- `SKILL.md` — this file
- `PATTERNS.md` — the 15-rule playbook the agent reads at generation time
- `RESEARCH.md` — full 14-video synthesis

## Pairs with

- Any `design-systems/<brand>/` folder (Stripe, Apple, Linear, Notion, Outlook, case-tracker, plaid-sdk, bumble, monarch-money, …)
- Skills: `web-prototype`, `magazine-poster`, `social-carousel`, `mobile-app`, `dashboard`, `motion-frames`

## Source

Distilled from 14 production videos covering Antigravity, Google AI Studio + Gemini 3.1 Pro, Claude Design, Codex + GPT-5.5 + GPT-Taste, Lovable, Bolt, Replit, Framer, Base44, Whisk, Flow, Nano Banana Pro, VO 3.1, Seedance 2.0, browser-harness, Mobbin onboarding research, Awwwards site teardowns, TestSprite MCP, Figma MCP, Firecrawl MCP.
