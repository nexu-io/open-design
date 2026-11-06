# Newcomer tone — voice rules for PR / issue text

Per user feedback ([[feedback_outreach_minimal]]), keep it minimal. The PR body is the **only** place we get to shape the maintainer's first impression of this contributor — make it warm, brief, and useful.

## Hard rules

1. **Always end the PR body with two things:**
   - "👋 This is my first OD contribution." (or a similar one-line warmth)
   - The OD Discord invite: <https://discord.gg/qhbcCH8Am4> (read from `OD_DISCORD_INVITE` env, never hardcode)
2. **Never claim more than the PR actually does.** A typo fix is a typo fix — don't dress it up as "improving documentation quality" or list 5 fake checkboxes.
3. **Plain language only.** No "ergonomic", "DX", "stakeholder", "stack rank". Talk like a friendly user, not a startup blog.
4. **No emojis except the opening 👋 and one optional 🎨 / 🌍 / 📝 / 🐛 in the title or first line.** OD is design-loving but the maintainers read a *lot* of PRs.

## Soft rules

- Lead with **what changed**, not why or how. Maintainers can read the diff for the how.
- "Why" gets at most 2–3 sentences. If it needs more, the work is too big for this skill — open an issue instead.
- One screenshot if the change is visible. Zero is fine.
- The "checklist" should reflect what the validator actually checked, not a generic ceremonial list.

## Anti-patterns (do not do these)

- **Don't** write an "ask" section. Don't say "please review when you have time" — the PR is the ask.
- **Don't** invite the maintainer to call / DM you. Discord is the channel.
- **Don't** apologize. ("Sorry if this isn't right" — the maintainer will tell you if it isn't.)
- **Don't** include a "TL;DR" — if the summary needs a TL;DR, the summary is too long.

## Title conventions (for `git commit` and `gh pr create --title`)

| Type | Format | Example |
|---|---|---|
| Skill | `Add Skill: <name>` | `Add Skill: invoice-template` |
| Design System | `Add Design System: <brand>` | `Add Design System: notion` |
| i18n | `Translate <doc> to <Lang>` | `Translate QUICKSTART to Spanish` |
| i18n (refresh) | `Update <Lang> translation of <doc>` | `Update zh-CN translation of README` |
| Docs typo | `Fix typo in <file>` | `Fix typo in README.md` |
| Docs other | `<verb> <noun> in <where>` | `Clarify daemon setup in QUICKSTART` |
| Bug (issue title) | `<observed> on <surface>` | `Preview iframe is blank on Safari 17` |

## When to ask before writing

If the user wants to ship something whose tone is unusual (a manifesto blog post, a contentious refactor, naming a brand after a real company without rights), pause and ask the user. Better to skip the PR than ship something the maintainer will close politely.
