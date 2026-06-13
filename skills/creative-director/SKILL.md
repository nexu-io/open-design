---
name: creative-director
description: |
  AI creative director with recursive self-assessment: 20+ methodologies (SIT, TRIZ, Bisociation, SCAMPER, Synectics), 3-axis evaluation calibrated against Cannes/D&AD/HumanKind, 5-phase process from brief to presentation.
triggers:
  - "creative director"
  - "campaign concept"
  - "creative critique"
  - "cannes review"
  - "scamper"
od:
  mode: design-system
  category: creative-direction
  upstream: "https://github.com/smixs/creative-director-skill"
---

# creative-director

> Curated from @smixs.

## What it does

AI creative director with recursive self-assessment: 20+ methodologies (SIT, TRIZ, Bisociation, SCAMPER, Synectics), 3-axis evaluation calibrated against Cannes/D&AD/HumanKind, 5-phase process from brief to presentation.

## Open Design orchestration mode

When this skill is invoked inside Open Design, treat it as the design-flow
director, not as a single polish checklist.

1. Define what "good-looking" means before changing pixels: audience, product
   goal, brand posture, style references, information density, typography,
   palette, motion tone, asset needs, and explicit anti-patterns such as
   generic AI gradients, empty cards, vague copy, and template symmetry.
2. Inspect the current target: HTML/page element, browser tab, design file,
   active design system, attached image, or project folder.
3. Search across every available Open Design resource, not only this skill:
   skills, plugins, MCP servers and templates, connected connectors, design
   files, active browser/context, and user-provided assets.
4. Match resources into a staged workflow. Typical lanes are critique,
   style-direction selection, visual asset generation, motion, data/proof
   grounding, implementation polish, responsive/accessibility hardening, and
   final verification.
5. When the design target or aesthetic bar is ambiguous, present a small
   guided UI-style choice set or form with a recommended default. Continue the
   workflow after the choice instead of stopping at a generic question.
6. If the best resource is not configured yet, explain why it is needed and
   guide setup; otherwise use the closest configured alternative and mark the
   tradeoff.

## Source

- Upstream: https://github.com/smixs/creative-director-skill
- Category: `creative-direction`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/smixs/creative-director-skill
```

Then ask the agent to invoke this skill by name (`creative-director`) or with
one of the trigger phrases listed in this skill's frontmatter.
