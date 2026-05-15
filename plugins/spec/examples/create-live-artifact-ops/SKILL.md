---
name: create-live-artifact-ops
description: Create a refreshable live operations artifact for customer success, support, or launch review workflows.
license: MIT
metadata:
  author: Open Design Spec Examples
  version: "0.1.0"
---

# Example Live Ops Artifact

Use this plugin when the user asks for a live artifact that summarizes changing operational data.

## Workflow

1. Identify the source system or choose a mock source when no connector is available.
2. Define the artifact schema: KPIs, freshness, feed items, and owner actions.
3. Create a self-contained HTML artifact that renders a useful seeded state.
4. Include stale and refresh affordances in the UI copy.
5. Return `index.html` and note which connector can be wired later.

## Quality Checks

- The artifact still works with seeded mock data.
- Freshness and source status are visible.
- The user can tell what action to take next.
- The layout remains useful when values change.
