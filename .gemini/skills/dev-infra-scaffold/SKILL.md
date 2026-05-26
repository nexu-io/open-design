---
name: dev-infra-scaffold
description: Create a new project with dev-infra configuration pre-installed.
---

# dev-infra-scaffold

Creates a new project directory with dev-infra configuration and directory structure already set up.

## Usage

```bash
dev-infra scaffold <project_name> [template]
```

- `project_name`: Name of the new project (created in `~/Development/Projects`).
- `template`: Optional template name (default, api, cli, library).
- Wraps `dev-infra init`.
