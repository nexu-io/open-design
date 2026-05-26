---
name: screenshot
description: |
  Capture desktop, app windows, or pixel regions across OS platforms. Useful for marketing screenshots, design reviews, and bug reports.
triggers:
  - "screenshot"
  - "capture screen"
  - "window screenshot"
  - "pixel region capture"
od:
  mode: image
  category: screenshots
  upstream: "https://github.com/openai/skills"
---

# screenshot

> Curated from OpenAI's skills repository.

## What it does

Capture desktop, app windows, or pixel regions across OS platforms. Useful for marketing screenshots, design reviews, and bug reports.

## Source

- Upstream: https://github.com/openai/skills
- Category: `screenshots`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/openai/skills
```

Then ask the agent to invoke this skill by name (`screenshot`) or with
one of the trigger phrases listed in this skill's frontmatter.
