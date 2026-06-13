---
id: 20260511-issue-564-claude-diagnostics
name: Issue 564 Claude Diagnostics
status: planned
created: '2026-05-11'
---

## Overview

### Problem Statement

Issue #564 reports that Claude Code can appear installed and selectable in Open Design, but a run exits immediately with the generic message `Agent exited with code 1`. PR #604 addressed one confirmed variant by adding configurable per-agent CLI environment, including `CLAUDE_CONFIG_DIR`, but the issue still contains other failure modes that are not explained well to users.

The remaining in-scope problem is diagnostic: Claude local auth/config/model failures collapse into the same generic exit message, which prevents users from knowing whether to re-authenticate, set `CLAUDE_CONFIG_DIR`, or fix a custom endpoint/proxy setup.

### Goals

- Classify common Claude Code auth, config, endpoint, and model-access failures into actionable user-facing errors.
- Surface the effective Claude CLI configuration path where it helps diagnose multi-profile or stale-auth cases.
- Document known recovery paths for `/login`, `CLAUDE_CONFIG_DIR`, custom `ANTHROPIC_BASE_URL`, proxy, and model availability problems.

### Non-Goals

- Do not persist or inject Claude auth tokens.
- Do not edit Claude Code credentials or platform credential stores.
- Do not remove support for custom `ANTHROPIC_BASE_URL`; only make failures clearer.
- Do not implement a new image-generation provider in this change.
- Do not implement API/BYOK image-mode capability validation in this change. That behavior is related to the same issue thread, but it is deferred to a separate media-capability follow-up so this change can stay focused on Claude CLI diagnostics.

## Research

### Current State

- Claude Code runs are spawned by the daemon as `claude -p --output-format stream-json --verbose ... --permission-mode bypassPermissions`, with the prompt delivered over stdin.
- `spawnEnvForAgent('claude', ...)` merges inherited daemon environment with configured agent CLI env, preserves custom endpoint env when `ANTHROPIC_BASE_URL` is set, and strips `ANTHROPIC_API_KEY` for normal Claude Code runs so Claude login/subscription auth wins.
- Settings already allow a `CLAUDE_CONFIG_DIR` value, which addresses the multiple-Claude-profile variant reported in #564 and implemented by PR #604.
- The daemon forwards child stderr over SSE, but the web client ultimately reports non-zero exits as `agent exited with code <n>` plus a short stderr tail when available.
- The connection-test path has a richer stderr tail and returns `agent_spawn_failed`, but it does not yet classify Claude-specific auth/config/model failures into stable remediation messages.
- API/BYOK mode uses a plain stream path. Recent work added a prompt rule to suppress `tool_calls` for plain API mode. Image-generation capability validation is still needed, but is intentionally deferred from this spec.

### Known Failure Variants from #564

- Custom endpoint or proxy rejects the model Claude Code selects, producing a model/plan/region error upstream.
- Multiple Claude config directories cause Open Design's spawned Claude process to use different state than the user's terminal session.
- Stale, expired, or corrupted Claude auth state makes the non-interactive `claude -p` run fail even when basic terminal checks appear healthy.
- On Windows, native PowerShell and WSL can use separate Claude installs and separate credential stores.
- A ghost `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` can interfere with expected OAuth/subscription auth in some environments.

## Design

### Claude Failure Classification

Add a Claude-specific diagnostic helper used by both chat-run failure handling and the agent connection test. The helper should accept the agent id, exit code/signal, stderr tail, stdout tail when available, and effective configured env. It returns either a typed actionable error or `null` to preserve the generic fallback.

The first version should classify these cases:

- `401`, `apiKeySource: "none"`, missing/invalid token, or authentication failure: tell the user to run `claude`, use `/login`, then retry the same Open Design run.
- `ANTHROPIC_BASE_URL` present with model/plan/region unavailable text: explain that the custom endpoint or proxy does not expose the selected Claude Code model and recommend changing the model, fixing the endpoint, or temporarily removing the custom endpoint.
- `CLAUDE_CONFIG_DIR` present: include the effective expanded path in the diagnostic detail so users can compare it with the terminal where Claude works.
- No `CLAUDE_CONFIG_DIR` present but symptoms match config-state failure: suggest setting it in Settings when using multiple Claude profiles.
- Windows credential or WSL/native mismatch indicators: suggest re-authenticating in the same shell/environment used by Open Design and checking Windows Credential Manager where applicable.

The helper should redact secrets before returning details. It must not echo token values, full API keys, or authorization headers.

### User-Facing Surfaces

- Chat run failures should display the classified message instead of only `agent exited with code 1` when a Claude-specific diagnosis is available.
- Settings connection test should return the same classified remediation through the existing failure-result shape so users can validate the fix before starting a project run.
- Keep the raw stderr tail available in logs for maintainers, but keep UI messages short and actionable.

### Documentation

Add a `Claude Code exits with code 1` troubleshooting section to the primary setup/troubleshooting doc. Include:

- `claude --version`
- `claude auth status --text`
- `printf 'hello' | claude -p --output-format stream-json --verbose --permission-mode bypassPermissions`
- `claude` then `/login`
- Setting `CLAUDE_CONFIG_DIR` in Settings for multi-profile setups.
- Checking/removing custom `ANTHROPIC_BASE_URL` and proxy settings when the selected model is unavailable.
- Windows-specific note that WSL and native Windows Claude credentials are separate.

### Deferred: API/BYOK Image Capability Handling

For image/media surfaces in API/BYOK mode, a later follow-up should validate that the request can be routed before treating the run as successful.

- If a configured daemon media provider can satisfy the selected image model, route through the existing media-generation path.
- If no media provider/tool route is available, fail with a typed error explaining that API chat mode cannot execute image-generation tools and that the user should configure Settings -> Media or use a capable local CLI agent.
- Do not rely on the model to self-report unsupported tool usage; the app should make the capability decision before or at run start.

## Implementation Plan

1. Add the shared Claude diagnostic helper in daemon-owned code and unit-test it with representative stderr/stdout tails.
2. Wire the helper into `/api/chat` child close handling for Claude runs before falling back to the generic non-zero exit message.
3. Wire the same helper into the agent connection-test result path.
4. Add troubleshooting documentation for the known #564 recovery paths.
5. Keep PR #604 behavior intact: configured `CLAUDE_CONFIG_DIR` remains a supported Settings field and is passed into detection, connection tests, and chat runs.

## Success Criteria

- A Claude auth failure produces a remediation that mentions `/login`, not only `exit code 1`.
- A custom endpoint/model-access failure produces a remediation that mentions `ANTHROPIC_BASE_URL` or endpoint/model availability.
- A multi-profile failure path can be resolved through Settings by setting `CLAUDE_CONFIG_DIR`.
- Existing non-Claude agent failure behavior remains unchanged unless the same generic fallback already applies.

## Test Plan

- Daemon unit tests for Claude diagnostic classification:
  - 401 / `apiKeySource: "none"`.
  - selected model unavailable / plan or region text.
  - custom `ANTHROPIC_BASE_URL` present.
  - configured `CLAUDE_CONFIG_DIR` present.
  - unrelated stderr falls back to generic behavior.
- Connection-test tests that Claude-specific failures return actionable `agent_spawn_failed` detail.
- Chat-run tests that non-zero Claude exits emit a classified SSE error when possible.
- Run `pnpm guard`, `pnpm typecheck`, and package-scoped daemon/web tests touched by the implementation.
