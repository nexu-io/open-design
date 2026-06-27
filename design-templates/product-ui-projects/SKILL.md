---
name: product-ui-projects
description: Project-level product UI case library for SaaS consoles, dashboards, admin tools, CRM systems, AI workspaces, and other multi-surface software products.
od:
  mode: prototype
  category: product-ui-project
  batch: product-ui-projects
---

# Product UI Projects

Use this case library when a reference is valuable as a full product interface system, not just one marketing page or one dashboard screenshot.

Each catalog entry should preserve concrete surfaces, flows, states, and component patterns:

- `surfaces`: dashboard, detail, settings, create-edit, analytics, billing, mobile, and other concrete pages.
- `flows`: onboarding, create, review, configure, checkout, team-admin, and other cross-page paths.
- `states`: empty, loading, error, permission, success, dense-data, and other product states.
- `components`: nav, table, filters, command palette, chart panel, activity feed, and other reusable UI parts.

If fewer than three concrete surfaces were inspected, set `capture.captureDepth` to `single-page-lead` and keep the entry in the backfill queue. Do not mark it as `surface-suite`, `flow-suite`, or `full-product-reference` until the source evidence supports that depth.
