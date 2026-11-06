---
description: Open a first-contribution PR (or bug issue) on nexu-io/open-design — works for non-coders too.
argument-hint: "[skill | design-system | i18n | docs | bug — optional, otherwise the skill will ask]"
---

You are entering the **od-contribute** flow.

User input (may be empty): `$ARGUMENTS`

## What to do right now

1. **Load the skill** by invoking the `od-contribute` skill via the Skill tool. The skill owns the full execution playbook — do not reimplement it inline.

2. **Pass the user input forward**:
   - If `$ARGUMENTS` is one of `skill`, `design-system`, `i18n`, `docs`, `bug` (or a recognizable Chinese / English equivalent), pre-select that branch and skip the type-picking `AskUserQuestion` in Step 2.
   - Otherwise, the skill will ask the user via `AskUserQuestion`.

3. **Honor the interactive contract**:
   - Always run the prerequisite check first (`gh` installed + authed). If it fails, surface the install/auth hint and stop — do not try workarounds.
   - Always show the preview + require explicit confirmation before pushing or opening any PR/issue.
   - At the end, print the PR or issue URL on its own line so the user can click through.

Begin by invoking the skill now.
