---
name: deploy-vercel-static
description: Use this plugin when the user wants to deploy an accepted static web artifact to Vercel or prepare an equivalent deployment handoff with preview and production URLs.
license: MIT
metadata:
  author: open-design-spec
  version: "0.1.0"
---

# Deploy Vercel Static

## Workflow

1. Confirm the artifact path, project name, and whether this is preview-only or production.
2. Validate that the artifact can run as a static web surface.
3. Prepare deployment files if needed.
4. Ask for confirmation before deployment.
5. Deploy or produce exact deployment instructions and return links.

## Output Contract

Produce `deploy-summary.md` and a preview URL, production URL, or prepared command list.

