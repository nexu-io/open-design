# PR #4716 Conversation Chain Overview

**PR:** fix(ollama): correct cloud model tag suffixes in picker and provider config

---

**[CONTRIBUTOR: lefarcen]**  
*2026-06-23T22:34:55Z*  
Thanks for the PR, @Grumpster-Dev! Good to see the tag mismatch follow-up — the before/after table makes the fix clear, and tracing it back to `litellm-models.json` as the authoritative source is the right approach.

🧪 This PR touches the Ollama Cloud model picker config, so it'll need a manual QA pass before merge. Please hold off self-merging for now; we'll loop QA in once the review is resolved and CI is green.

---

**[BOT: github-actions]**  
*2026-06-23T22:38:00Z*  
## Visual regression review

Head: `d7a3a54` · Base: `295e541`

**11 changed** · 27 unchanged · 0 missing baseline · 0 failed

(Visual diff details omitted for brevity; 11 cases changed including `visual-settings-byok-model-dropdown` and `visual-settings-local-cli-model-dropdown`).

---

**[CONTRIBUTOR: lefarcen]**  
*2026-06-24T03:07:21Z*  
@Grumpster-Dev — one follow-up from @mrcfps's review: the new `-cloud` IDs also need to land in `apps/web/src/state/maxTokens.ts` OVERRIDES (or the lookup needs to strip/normalize the suffix). Without that, `effectiveMaxTokens()` falls through to the 8192 fallback instead of the correct caps (131072+) for these models. A small test matrix covering the cloud IDs against their expected max-token values would round this out nicely.

💡 To drive this PR to merge hands-free, paste this to your AI coding agent (Claude Code / Codex / opencode / Cursor …):
`Take over nexu-io/open-design#4716 until it merges — read https://raw.githubusercontent.com/nexu-io/looper/main/skills/pr-takeover/SKILL.md and follow it.`
