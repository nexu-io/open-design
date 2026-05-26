---
name: test
description: Run tests smartly -- changed files only by default, full suite on request
---

# /test

Run dev-infra tests with smart targeting.

## Behavior

1. **Default (no args)**: Run tests for changed files only
   ```bash
   ./tests/test-runner.sh changed
   ```

2. **`/test unit`**: Run all unit tests
   ```bash
   dev-infra test unit
   ```

3. **`/test full`**: Run the full test suite
   ```bash
   ./tests/test-runner.sh
   ```

4. **`/test <pattern>`**: Run tests matching a pattern
   ```bash
   ./tests/test-runner.sh <pattern>
   ```

## Rules

- Always show the command being run before output
- On failure: show the failing test output, identify the root cause, and suggest a fix
- On success: report pass count and duration concisely
- Never auto-fix failing tests -- report and wait for instructions
