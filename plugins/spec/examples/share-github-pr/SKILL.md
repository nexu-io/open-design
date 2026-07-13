---
name: share-github-pr
description: Use this plugin when the user wants to package an accepted plugin or artifact as a GitHub pull request for Open Design or another target repository.
license: MIT
metadata:
  author: open-design-spec
  version: "0.1.0"
---

# Share GitHub PR

## Workflow

1. Confirm the target repository, branch, and PR intent before making externally visible changes.
2. Read the changed artifact or plugin folder and create a concise PR summary.
3. Run available validation commands.
4. Stage only relevant files.
5. Open or prepare the PR and report the URL or exact next command.

## Output Contract

Produce `pr-summary.md` and a PR URL or prepared branch summary.

