# Contributing to Open Design

Thanks for thinking about contributing. OD is small on purpose — most of the value lives in **files** (skills, design systems, prompt fragments) rather than framework code. That means the highest-leverage contributions are usually one folder, one Markdown file, or one PR-sized adapter.

This guide tells you exactly where to look for each type of contribution and what bar a PR has to clear before we merge it.

<p align="center"><b>English</b> · <a href="CONTRIBUTING.pt-BR.md">Português (Brasil)</a> · <a href="CONTRIBUTING.de.md">Deutsch</a> · <a href="CONTRIBUTING.fr.md">Français</a> · <a href="CONTRIBUTING.zh-CN.md">简体中文</a> · <a href="CONTRIBUTING.ja-JP.md">日本語</a></p>

---

## Three things you can ship in one afternoon

| If you want to… | You're really adding | Where it lives | Ship size |
|---|---|---|---|
| Make OD render a new kind of artifact (an invoice, an iOS Settings screen, a one-pager…) | a **Skill** | [`skills/<your-skill>/`](skills/) | one folder, ~2 files |
| Make OD speak a new brand's visual language | a **Design System** | [`design-systems/<brand>/DESIGN.md`](design-systems/) | one Markdown file |
| Hook up a new coding-agent CLI | an **Agent adapter** | [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) | ~10 lines in one array |
| Add a feature, fix a bug, lift a UX pattern from [`open-codesign`][ocod] | code | `apps/web/src/`, `apps/daemon/` | normal PR |
| Improve docs, port a section to Français / Deutsch / 中文, fix typos | docs | `README.md`, `README.fr.md`, `README.de.md`, `README.zh-CN.md`, `docs/`, `QUICKSTART.md` | one PR |

If you're not sure which bucket your idea is in, [open a discussion / issue first](https://github.com/nexu-io/open-design/issues/new) and we'll point you at the right surface.

---

## Local setup

The full one-page setup lives in [`QUICKSTART.md`](QUICKSTART.md). The TL;DR for contributors:

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable           # selects the pinned pnpm from packageManager
pnpm install
pnpm tools-dev run web    # daemon + web foreground loop
pnpm typecheck            # tsc -b --noEmit
pnpm --filter @open-design/web build  # web package build when needed
```

Node `~24` and pnpm `10.33.x` are required. `nvm` / `fnm` are optional; use `nvm install 24 && nvm use 24` or `fnm install 24 && fnm use 24` if you prefer managing Node that way. macOS, Linux, and WSL2 are the primary paths. Windows native is supported; see [`docs/windows-troubleshooting.md`](docs/windows-troubleshooting.md) for the common setup gotchas.

## Docker Setup

Run Open Design without installing Node.js or pnpm.

### Prerequisites

Make sure Docker Desktop with Compose v2 is installed:

```bash
docker compose version
```

### Start Open Design

```bash
cd deploy
docker compose up -d
```

Open in your browser:

```text
http://localhost:7456
```

### Common Commands

```bash
# View logs
docker compose logs -f

# Restart containers
docker compose restart

# Stop containers
docker compose down

# Pull latest image
docker compose pull
docker compose up -d
```

### Optional Environment Overrides

Create a `deploy/.env` file:

```env
OPEN_DESIGN_PORT=7456
OPEN_DESIGN_MEM_LIMIT=384m
OPEN_DESIGN_ALLOWED_ORIGINS=https://yourdomain.com
OPEN_DESIGN_IMAGE=docker.io/vanjayak/open-design:latest
```

> Projects and database data are persisted automatically using Docker volumes.

For the full Docker guide and advanced configuration, see `QUICKSTART.md`.



---

## Adding a new Skill

A skill is a folder under [`skills/`](skills/) with a `SKILL.md` at the root, following Claude Code's [`SKILL.md` convention][skill] plus our optional `od:` extension. **No registration step.** Drop the folder in, restart the daemon, the picker shows it.

### → See [`docs/skills-contributing.md`](docs/skills-contributing.md) for the full guide

That file walks through:

- **Quick start** — clone → copy a closest existing skill → run `pnpm tools-dev run web` → see the picker → open PR.
- **What a skill IS / IS NOT** — saves you a week if your idea turns out to be a feature or vendor integration in disguise.
- **Skill anatomy** — minimum folder layout and `SKILL.md` frontmatter cheat sheet.
- **Running locally** — the four commands that actually matter.
- **Merge bar** — copy-pasteable checklist of every thing a reviewer will check.
- **PR description template** — drop into your PR body and fill in.
- **Common rejection patterns** — the close reasons we've used recently, with concrete examples.

The protocol spec (full frontmatter grammar — typed inputs, slider parameters, craft references, testing primitives) lives separately in [`docs/skills-protocol.md`](docs/skills-protocol.md).

---

## Adding a new Design System

A design system is a single [`DESIGN.md`](design-systems/README.md) file under `design-systems/<slug>/`. **One file, no code.** Drop it in, restart the daemon, the picker shows it grouped by category.

### Design system folder layout

```text
design-systems/your-brand/
└── DESIGN.md
```

### `DESIGN.md` shape

```markdown
# Design System Inspired by YourBrand

> Category: Developer Tools
> One-line summary that shows in the picker preview.

## 1. Visual Theme & Atmosphere
…

## 2. Color
- Primary: `#hex` / `oklch(...)`
- …

## 3. Typography
…

## 4. Spacing & Grid
## 5. Layout & Composition
## 6. Components
## 7. Motion & Interaction
## 8. Voice & Brand
## 9. Anti-patterns
```

The 9-section schema is fixed — that's what skill bodies grep for. The first H1 becomes the picker label (the `Design System Inspired by` prefix is stripped automatically), and the `> Category: …` line decides which group it lands in. Existing categories are listed in [`design-systems/README.md`](design-systems/README.md); if your brand truly doesn't fit, you can introduce a new one, but **try existing categories first**.

### Bar for merging a new design system

1. **All 9 sections present.** Empty section bodies are fine for hard-to-find data (e.g. motion tokens), but the headings have to be there or the prompt grep breaks.
2. **Hex codes are real.** Sample directly from the brand's site or product, not from memory or AI guesses. The README's "brand-spec extraction" 5-step protocol applies to maintainers too.
3. **OKLch values for accent colors** are nice-to-have. They make palettes lerp predictably across light/dark.
4. **No marketing fluff.** The brand's tagline is not a design token. Cut it.
5. **Slug uses ASCII** — `linear.app` becomes `linear-app`, `x.ai` becomes `x-ai`. The 69 imported systems already follow this convention; mirror it.

The 69 product systems we ship are imported from [`VoltAgent/awesome-design-md`][acd2] via [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts). If your brand belongs upstream, **send the PR there first** — we'll pick it up automatically on the next sync. The `design-systems/` folder is for systems that don't fit upstream, plus our two hand-authored starters.

---

## Adding a new coding-agent CLI

Hooking up a new agent (e.g. some new shop's `foo-coder` CLI) is one entry in [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts):

```javascript
{
  id: 'foo',
  name: 'Foo Coder',
  bin: 'foo',
  versionArgs: ['--version'],
  buildArgs: (prompt) => ['exec', '-p', prompt],
  streamFormat: 'plain',           // or 'claude-stream-json' if it speaks that
}
```

That's it — daemon will detect it on `PATH`, the picker shows it, the chat path works. If the CLI emits **typed events** (like Claude Code's `--output-format stream-json`), wire a parser in [`apps/daemon/src/claude-stream.ts`](apps/daemon/src/claude-stream.ts) and set `streamFormat: 'claude-stream-json'`.

Bar for merging:

1. **A real session works end-to-end** with the new agent — paste the daemon log into the PR description showing it streamed an artifact through.
2. **`docs/agent-adapters.md`** is updated with the CLI's quirks (does it require a key file? does it support image input? what's its non-interactive flag?).
3. **The README's "Supported coding agents" table** gets one row.

---

## Updating model `max_tokens` metadata

API-mode chat sends `max_tokens` to the upstream provider on every request. The web client picks that number from a three-tier lookup in [`apps/web/src/state/maxTokens.ts`](apps/web/src/state/maxTokens.ts):

1. The user's explicit override in Settings, if set.
2. Otherwise, the per-model default in [`apps/web/src/state/litellm-models.json`](apps/web/src/state/litellm-models.json) — a vendored slice of [BerriAI/litellm][litellm]'s `model_prices_and_context_window.json` (MIT). It covers ~2k chat models across Anthropic, OpenAI, DeepSeek, Groq, Together, Mistral, Gemini, Bedrock, Vertex, OpenRouter, and friends.
3. Otherwise, `FALLBACK_MAX_TOKENS = 8192`.

To pick up a newly-launched model, regenerate the vendored JSON:

```bash
node --experimental-strip-types scripts/sync-litellm-models.ts
```

The script fetches LiteLLM's catalog, filters to `mode: 'chat'` entries, projects each to its `max_output_tokens` (or `max_tokens` fallback), and writes a sorted snapshot. Commit the regenerated `litellm-models.json` alongside whatever PR triggered the refresh.

The OVERRIDES table in `maxTokens.ts` is for the rare case where LiteLLM is missing or wrong for a model id we actually use — for example, `mimo-v2.5-pro` (LiteLLM only ships MiMo via the `openrouter/xiaomi/...` and `novita/xiaomimimo/...` aliases, neither of which matches the canonical id Xiaomi's direct API uses). Keep it small; everything that LiteLLM gets right belongs upstream.

[litellm]: https://github.com/BerriAI/litellm

---

## Localization maintenance

German uses formal `Sie` because OD speaks to a mixed audience of solo creators, agencies, and engineering teams; until project feedback shows that an informal `du` voice fits better, formal German is the least surprising default. Locale PRs should translate UI chrome, core docs, and display-only gallery metadata in `apps/web/src/i18n/content.ts`, but should not translate `skills/`, `design-systems/`, or prompt bodies that agents execute. Those source prompts are maintained as workflow inputs, and keeping one source language avoids multiplying prompt QA across locales. When adding or renaming a skill, design system, or prompt template, update the German display metadata and run `pnpm --filter @open-design/web test`; `content.test.ts` fails if German display coverage drifts. Daemon errors, export filenames, and agent-generated artifact text are known limitations unless a PR explicitly scopes them.

For step-by-step instructions on adding a new locale (UI dictionary, README, language switcher, regional terminology), see [`TRANSLATIONS.md`](TRANSLATIONS.md).

---

## Code style

We're not pedantic about formatting (Prettier on save is fine), but two rules are non-negotiable because they show up in the prompt stack and the user-facing API:

1. **Single quotes in JS/TS.** Strings are single-quoted unless escaping makes them ugly. The codebase is already consistent — please match.
2. **Comments in English.** Even if the PR is translating something into Deutsch or 中文, code comments stay in English so we can keep one set of greppable references.

Beyond that:

- **Don't narrate.** No `// import the module`, no `// loop through items`. If the code reads obviously, the comment is noise. Save comments for non-obvious intent or constraints the code can't express.
- **TypeScript** for `apps/web/src/`. The daemon (`apps/daemon/`) is plain ESM JavaScript with JSDoc when types matter — keep it that way.
- **No new top-level dependencies** without a paragraph in the PR description on what we get vs. what bytes we ship. The dep list in [`package.json`](package.json) is small on purpose.
- **Run `pnpm typecheck`** before pushing. CI runs it; failing it earns a "please fix" comment.

---

## Commits & pull requests

- **One concern per PR.** Adding a skill + refactoring the parser + bumping a dep is three PRs.
- **Title is imperative + scope.** `add dating-web skill`, `fix daemon SSE backpressure when CLI hangs`, `docs: clarify .od layout`.
- **Use the PR template.** Fill every section of [`.github/pull_request_template.md`](.github/pull_request_template.md) — Why, What users will see, Surface area, Screenshots (if UI), Bug fix verification (if bug fix), Validation. Empty sections earn a "please fill in" reply.
- **Body explains the why.** "What does this do" is usually obvious from the diff; "why does this need to exist" rarely is.
- **Reference an issue** if there is one. If there isn't and the PR is non-trivial, open one first so we can agree the change is wanted before you spend the time.
- **No squash-during-review.** Push fixups; we'll squash on merge.
- **No force-push to a shared branch** unless the reviewer asked.

We don't enforce a CLA. Apache-2.0 covers us; your contribution is licensed under the same.

---

## Reporting bugs

Open an issue with:

- What you ran (the exact `pnpm tools-dev ...` invocation).
- Which agent CLI was selected (or whether you were on the BYOK path).
- The skill + design system pair that triggered it.
- The relevant **daemon stderr tail** — most "the artifact never rendered" reports get diagnosed in 30 seconds when we can see `spawn ENOENT` or the CLI's actual error.
- A screenshot if it's UI.

For prompt-stack bugs ("the agent emitted a purple gradient hero, the slop blacklist was supposed to forbid that"), include the **full assistant message** so we can see whether the violation was the model or the prompt.

---

## Asking questions

- Architecture question, design question, "is this a bug or a misuse" → [GitHub Discussions](https://github.com/nexu-io/open-design/discussions) (preferred — searchable for the next person).
- "How do I write a skill that does X" → Open a discussion. We'll answer it and turn the answer into [`docs/skills-protocol.md`](docs/skills-protocol.md) if it's a missing pattern.

---

## What we don't accept

To keep the project focused, please don't open PRs that:

- **Vendor a model runtime.** OD's whole bet is "your existing CLI is enough". We don't ship `pi-ai`, OpenAI keys, or model loaders.
- **Rewrite the frontend away from the current stack without prior discussion.** Next.js 16 App Router + React 18 + TS is the line. No Astro, Solid, Svelte, or other framework rewrites unless maintainers explicitly want that migration.
- **Replace the daemon with a serverless function.** The daemon's whole point is owning a real `cwd` and spawning a real CLI. Vercel deployment of the SPA is fine; the daemon stays a daemon.
- **Add telemetry / analytics / phone-home.** OD is local-first. The only outbound calls are to providers the user explicitly configured.
- **Bundle a binary** without a license file and authorship attribution next to it.

If you're not sure whether your idea fits, open a discussion before writing the code.

---

## Becoming a Maintainer

If you've been contributing consistently and want to know what the path to becoming a Maintainer looks like, the rules live in **[`MAINTAINERS.md`](MAINTAINERS.md)**. The short version:

- A Maintainer can review, approve, and close issues. The merge button stays with the Core Team — your approval still counts as the required approval for merge.
- The bar is **≥ 20 merged PRs** plus a published account-quality check (anti-bot, anti-sock-puppet) plus a Core Team judgment on contribution quality. There is no application form; the Core Team raises candidates internally and reaches out.
- There are **no quotas, no SLAs, and no fixed term.** Stepping down is easy and reversible (Emeritus → return when life calms down).
- All the thresholds, the nomination flow, the step-down rules, and the early-project waiver are in [`MAINTAINERS.md`](MAINTAINERS.md). Read that document if any of the above interests you.

The tl;dr: ship good PRs, review thoughtfully, hang out in [Discussions][discussions] / [Discord][discord], and the rest takes care of itself.

[discussions]: https://github.com/nexu-io/open-design/discussions
[discord]: https://discord.gg/qhbcCH8Am4

---

## License

By contributing, you agree your contribution is licensed under the [Apache-2.0 License](LICENSE) of this repository, with the exception of files inside [`skills/guizang-ppt/`](skills/guizang-ppt/), which retain their original MIT license and authorship attribution to [op7418](https://github.com/op7418).

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills
[guizang]: https://github.com/op7418/guizang-ppt-skill
[acd2]: https://github.com/VoltAgent/awesome-design-md
[ocod]: https://github.com/OpenCoworkAI/open-codesign
