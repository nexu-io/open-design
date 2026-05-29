# OD repo map — what goes where

Mirrors `nexu-io/open-design` `CONTRIBUTING.md` so the skill doesn't need to re-fetch it on every run. **If this drifts from upstream CONTRIBUTING.md, upstream wins** — re-read the live file when in doubt.

## Three high-leverage contribution surfaces (per OD's CONTRIBUTING.md)

| If you want to… | You're really adding | Where it lives | Ship size |
|---|---|---|---|
| Make OD render a new kind of artifact | a **Skill** | `skills/<your-skill>/` | one folder, ~2 files |
| Make OD speak a new brand's visual language | a **Design System** | `design-systems/<brand>/DESIGN.md` | one Markdown file |
| Hook up a new coding-agent CLI | an **Agent adapter** | `apps/daemon/src/agents.ts` | ~10 lines (code — out of scope for this skill) |
| Improve docs, port a section to fr / de / zh-CN, fix typos | docs | `README.md`, `README.fr.md`, `README.de.md`, `README.zh-CN.md`, `docs/`, `QUICKSTART.md` | one PR |

## Localized doc files we know about

| Doc family | English source | Translations seen on disk (as of plan time) |
|---|---|---|
| README | `README.md` | ar, de, es, fr, ja-JP, ko, pt-BR, ru, tr, uk, zh-CN, zh-TW |
| QUICKSTART | `QUICKSTART.md` | de, fr, ja-JP, pt-BR, zh-CN, zh-TW |
| CONTRIBUTING | `CONTRIBUTING.md` | de, fr, ja-JP, pt-BR, zh-CN |
| MAINTAINERS | `MAINTAINERS.md` | de, fr, ja-JP, pt-BR, zh-CN |

The skill `discover-i18n-gaps.sh` does NOT trust this table — it scans the workspace at runtime. Use this list only when you need to seed an `AskUserQuestion` card without a workspace.

## Issue templates

- `bug-report.yml` — required fields: description, steps to reproduce, expected, version, platform.
- `feature-request.yml` — out of scope for this skill (feature requests should come from product, not auto-routed.)
- `preview-v0.8.0-feedback.yml` — branch-specific.

## Out-of-scope surfaces (don't touch from this skill)

- `apps/daemon/src/` — daemon code. Requires real review.
- `apps/web/src/` — web app code. Requires real review.
- `packages/`, `plugins/`, `tools/` — internal libs.
- `e2e/` — Playwright-driven; non-trivial to author.

If a user asks to contribute to those surfaces, suggest the original `auto-github-contributor` skill (TDD pipeline) instead.
