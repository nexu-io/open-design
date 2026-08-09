---
name: adobe-firefly
description: |
  Adobe Firefly generative image workflows for commercially safer brand assets — text-to-image, generative fill, and Firefly-powered creative production.
triggers:
  - "adobe firefly"
  - "firefly"
  - "firefly image"
  - "adobe generative"
  - "commercially safe image"
od:
  mode: utility
  category: image-generation
  upstream: "https://developer.adobe.com/firefly-services/"
---

# adobe-firefly

> Catalogue stub pointing at Adobe Firefly Services docs.

## What it does

Adobe Firefly generative image workflows for commercially safer brand assets — text-to-image, generative fill, and Firefly-powered creative production.

## Current Open Design scope

No first-party Firefly MCP template yet. Use Adobe Firefly Services / Creative Cloud APIs with your Adobe credentials, or generate via fal / Runway / Higgsfield MCP and apply Firefly brand rules manually.

## Source

- Upstream: https://developer.adobe.com/firefly-services/
- Category: `image-generation`

## How to use

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://developer.adobe.com/firefly-services/
```

Then ask the agent to invoke this skill by name (`adobe-firefly`) or with
one of the trigger phrases listed in this skill's frontmatter.
