---
name: bug
description: Collect context and file a bug report against dev-infra from any adopted project.
---

# Bug Report

Use this skill when the user wants to report a bug, issue, or problem with dev-infra.

## Quick Triggers

- `/bug` — interactive bug report flow
- `/bug "title"` — start with a pre-set title

## Flow

1. Ask the user to describe the bug:
   - What happened?
   - What did they expect?
   - Steps to reproduce (if known)

2. Compose a concise title (under 70 chars) and description from their input.

3. Write the description to a temp file and run:

```bash
TMPFILE=$(mktemp -t "bug-desc.XXXXXX")
cat > "$TMPFILE" << 'EOF'
<composed description>
EOF
dev-infra bug --no-editor --body-file "$TMPFILE" "<title>"
rm -f "$TMPFILE"
```

4. If there are recent errors or commands in the current session that triggered the report, append a `### Session Context` section to the description with:
   - The last error message or failed command
   - Relevant stack trace or output snippet

5. Report the resulting issue URL to the user.

## Dry Run

To preview without creating:

```bash
dev-infra bug --dry-run --no-editor --body-file "$TMPFILE" "<title>"
```

## Notes

- The command auto-collects project context (git info, env, health snapshot)
- All secrets and tokens are redacted before submission
- Issues are filed to `STEALTHTEMP1/dev-infra` with the `bug-report` label
