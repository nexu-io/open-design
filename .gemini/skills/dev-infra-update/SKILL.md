---
name: dev-infra-update
description: Update the current project's dev-infra configuration to the latest version.
---

# dev-infra-update

Updates the current project (or a specified path) to match the latest dev-infra configuration. This ensures hooks, scripts, and settings are up to date.

## Usage

```bash
dev-infra update [path]
```

- If `path` is omitted, updates the current directory.
- Wraps `antig-sync --update`.
