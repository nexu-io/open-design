---
name: community-import-smoke-test
description: A portable community plugin for validating Open Design plugin import flows.
---

# Community Import Smoke Test

Use this plugin when validating that Open Design can import community plugins
from a local folder, a zip archive, a GitHub subpath, or a marketplace entry.

When this plugin is applied:

1. Identify the import path the user is testing: folder, zip, GitHub, or marketplace.
2. Produce a compact import receipt that includes the plugin name, source kind,
   files detected, and any user note.
3. Keep the output intentionally small so install, apply, and provenance states
   are easy to inspect in the UI.

Do not require network access, shell commands, external connectors, or secrets.
This plugin exists to exercise install and apply plumbing, not to perform a
production workflow.
