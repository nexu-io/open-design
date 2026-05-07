# Open Design — Product Spec

**Status:** Draft v0.1 · 2026-04-24
**Scope:** Product definition, scenarios, non-goals, high-level modules, and positioning against both [Anthropic's Claude Design][cd] and the existing open-source alternative ([Open CoDesign][ocod]).

[cd]: https://x.com/claudeai/status/2045156267690213649
[ocod]: https://github.com/OpenCoworkAI/open-codesign
[guizang]: https://github.com/op7418/guizang-ppt-skill
[multica]: https://github.com/multica-ai/multica
[ccsw]: https://github.com/farion1231/cc-switch
[acd]: https://github.com/VoltAgent/awesome-claude-design
[piai]: https://github.com/mariozechner/pi-ai

Other docs:
- Architecture → [`architecture.md`](architecture.md)
- Skills protocol → [`skills-protocol.md`](skills-protocol.md)
- Agent adapters → [`agent-adapters.md`](agent-adapters.md)
- Modes → [`modes.md`](modes.md)
- References & credits → [`references.md`](references.md)
- Roadmap → [`roadmap.md`](roadmap.md)

---

## 1. Product in one sentence

> **A web app that turns natural-language briefs into editable, previewable design artifacts (prototypes, decks, templates, design systems) by orchestrating the code agent already installed on the user's machine.**

## 2. Core bets (and why they're different)

| # | Bet | [Anthropic Claude Design][cd] | [Open CoDesign][ocod] | OD |
|---|---|---|---|---|
| 1 | Where the product runs | claude.ai only | Local Electron app | **Next.js web app + local daemon + desktop loop** — `pnpm tools-dev`, Vercel web deploy |
| 2 | Who owns the agent loop | Anthropic, closed | [Open CoDesign][ocod] itself, via [`pi-ai`][piai] | **The user's existing code agent CLI** (Claude Code, Codex, Devin for Terminal, Cursor Agent, Gemini CLI, OpenCode, OpenClaw); direct Anthropic API as fallback |
| 3 | What "design skills" are | Proprietary internal tools | TypeScript modules baked into the app | **File-based skills** that follow Claude Code's `SKILL.md` spec — forkable, versionable, shareable, installable by symlink |
| 4 | How design systems are authored | Implicit in prompt | N/A | **`DESIGN.md` files** following the [awesome-claude-design][acd] 9-section schema |
| 5 | Extension point | Anthropic only | Custom PRs | **Drop a folder into `skills/`** — composable by third parties |

The differentiation is not "yet another design generator." It is **an integration shell that refuses to own the agent, the model, or the skill catalog** — all three are external and pluggable.

## 3. Target users

- **Indie devs / designers** who already pay for one coding agent and don't want a second subscription or a second model router just to get design output.
- **Design system maintainers** who want to codify their system as a `DESIGN.md` and have every skill respect it automatically.
- **Skill authors** who want to publish a design skill (e.g. "SaaS marketing page with glassmorphism") and have it run inside any compatible agent without porting.
- **Teams self-hosting AI tooling** who need a web deployment, not an Electron binary, and who need to keep keys in their own infra.

## 4. User scenarios

### S1 — "Give me a prototype"
User opens the web app, types *"Airbnb-style search page, use our internal design system"*, OD picks the `prototype-skill`, resolves the user's `DESIGN.md`, dispatches to Claude Code with both files plus the brief, streams tool calls into the UI, and renders the resulting HTML in an iframe preview. User clicks an element, drops a comment, the agent rewrites just that region.

### S2 — "Make me a deck"
User says *"8-slide magazine-style pitch deck for my seed round"*. OD routes to `deck-skill` (a fork of [`guizang-ppt-skill`][guizang]). Output is a single-file HTML deck; preview is the deck itself with arrow-key navigation; export is PDF/PPTX.

### S3 — "Start from a template"
User picks "SaaS landing — Stripe-ish" from a gallery. Template is a pre-filled artifact bundle plus a `DESIGN.md` reference. Agent only fills content; structure is already there. This is the fastest mode — useful for users who don't want to prompt at all.

### S4 — "Set up our design system"
User uploads a screenshot, brand guide PDF, or Figma link. OD runs `design-system-skill` which produces a `DESIGN.md` following the 9-section format. That file is then referenced by every subsequent generation — prototypes, decks, templates all pick up the tokens.

These four scenarios map 1:1 to the four modes in [`modes.md`](modes.md).

## 5. High-level modules

```
┌──────────────────────────────────────────────────────────────────┐
│                        Web App (Next.js)                         │
│  chat · artifact tree · iframe preview · comment mode · exports  │
└────────────┬─────────────────────────────────┬───────────────────┘
             │ HTTP + SSE (/api/chat)          │ HTTPS (BYOK direct)
┌────────────▼──────────────────┐     ┌────────▼─────────────────┐
│   Local Daemon (od daemon)   │     │   Anthropic Messages API │
│   · agent detection           │     │   (fallback when no CLI) │
│   · skill registry            │     └──────────────────────────┘
│   · artifact store            │
│   · design-system resolver    │
└────────────┬──────────────────┘
             │ spawn / stdio / SDK
┌────────────▼──────────────────────────────────────────────────┐
│  Code Agent CLIs on user's machine (one or more of):          │
│  Claude Code · Codex · Cursor Agent · Gemini CLI · OpenCode   │
└───────────────────────────────────────────────────────────────┘
```

Module responsibilities:

- **Web app** — chat UI, artifact tree, sandboxed iframe preview, comment mode, slider controls, export UI. Stateless; all state lives in the daemon or in the browser's IndexedDB for cloud deploys.
- **Daemon** — long-running local process. Detects agents, registers skills, manages artifacts on disk, resolves the active design system, and brokers REST/SSE requests.
- **Agent adapters** — one adapter per supported CLI; see [`agent-adapters.md`](agent-adapters.md).
- **Skill registry** — scans `~/.claude/skills/`, `./skills/`, and `./.claude/skills/`; merges and exposes a typed catalog.
- **Artifact store** — project-scoped folder (default `./.od/`) holding generated files, version snapshots (git-friendly), and per-artifact metadata.
- **Design-system resolver** — loads the active `DESIGN.md`, injects it as skill context.
- **Preview renderer** — sandboxed iframe with vendored React + Babel for JSX artifacts; plain iframe for HTML; PDF via the daemon's headless Chrome.
- **Export pipeline** — HTML (inlined), PDF, PPTX, ZIP, Markdown.

## 6. Non-goals

- **We do not ship a model router.** If the user's agent supports 20 providers, great. If it only supports Anthropic, that's the ceiling. We don't layer our own provider abstraction on top of someone else's.
- **We do not ship a desktop app.** No Electron, no Tauri. The "local" story is a Next.js dev server + a Node daemon. If someone wants a tray icon, that's [`cc-switch`][ccsw]'s job, not ours.
- **We do not reinvent the agent loop.** No custom tool-use harness, no bespoke context-manager. Everything goes through the detected agent's native loop.
- **We do not maintain a skill marketplace in v1.** Skills are git URLs and local folders. A browsable UI is v2.
- **We do not try to compete with Figma.** Output is code (HTML/JSX) and content (`DESIGN.md`, Markdown, PPTX), not editable vector canvases.
- **We do not implement auth / billing / orgs in MVP.** Single-user, single-machine. Multi-user is post-v1 and optional.

## 7. Why not just extend [Open CoDesign][ocod]?

We seriously considered it. The concrete blockers:

1. **It's Electron.** Porting to a web architecture requires ripping out ~40% of the code and rewriting the renderer/main IPC layer. At that point it's a rewrite.
2. **It owns the agent loop.** [`pi-ai`][piai] is a perfectly fine provider abstraction, but it means every skill is written against `pi-ai`'s tool-use format — not against whatever Claude Code, Codex, or Cursor Agent natively speak. We can't reuse existing skills, and existing skills can't reuse us.
3. **Skill format is proprietary.** Its 12 skills are TypeScript modules compiled into the app. A user cannot drop [`guizang-ppt-skill`][guizang] in and have it work; there's no `SKILL.md` loader.
4. **No design system abstraction.** Design tokens live in prompts, not in a versioned file that can be shared across projects.

We keep the good parts: comment mode, slider-emitted parameters, multi-frame preview, single-file HTML export, sandboxed iframe rendering. These are all UI ideas that are orthogonal to the agent layer and we'll absolutely borrow them. See [`references.md`](references.md) for the explicit borrow list.

## 8. Positioning against Anthropic's [Claude Design][cd]

We are **not** trying to out-feature [Claude Design][cd]. Claude Design has Anthropic's model team, internal tooling, and a rendering pipeline we can't match. What we offer instead:

- **Self-hostable.** Run on your laptop, your Vercel, your k8s. Secrets never leave.
- **BYO-agent.** If you're already paying for Cursor, that's your agent. If you've standardized on Codex inside your company, use Codex. No mandatory Anthropic subscription.
- **Skills as files.** Version them in git. Fork them. Ship them to teammates as a repo. Run your team's branded deck skill without rebuilding a product.
- **Design systems as files.** A `DESIGN.md` is an artifact you can review in a PR. Claude Design's "design system" lives in an ephemeral chat.

In short: Claude Design is a product; OD is a **substrate**.

## 9. Success criteria for v1

- One developer can `git clone && corepack enable && pnpm install && pnpm tools-dev run web`, point at their Claude Code install, and produce a prototype in under 5 minutes.
- A third party can author a skill in a separate git repo, publish it, and have a user install it by running `od skill add <git-url>` without touching OD's source.
- A design system author can write a `DESIGN.md`, point OD at it, and have the style propagate across prototype / deck / template outputs.
- Deploying to Vercel with a local daemon works end-to-end (the daemon is reachable via localhost tunnel or a user-provided URL).
- Swapping the underlying agent from Claude Code to Codex requires zero skill changes.

## 10. Open questions (to resolve before coding)

- **Daemon ↔ Vercel bridge.** Do we ship a reverse-tunnel helper (like `cloudflared`), require the user to set one up, or punt to "run locally for now"? My current lean: punt for MVP, helper in v1.
- **Artifact versioning.** Git, or SQLite, or both? [Open CoDesign][ocod] uses SQLite; that's easier but less reviewable. Lean: write artifacts as plain files + a `.od/history.jsonl` log. Git is the user's business.
- **Comment mode on non-Claude-Code agents.** Claude Code supports surgical edits via its tool loop. Codex and Gemini CLI are less graceful. Do we degrade to "regenerate whole file" for weaker agents? Lean: yes, document clearly in the adapter table.
- **Skill trust model.** Skills can shell out via the agent. We should at minimum warn on install, and probably sandbox the agent's cwd to the project directory. Claude Code's permission mode handles this for us if we use it; Codex is looser. Needs a per-adapter note.

These go on the roadmap as Phase 0 discovery items.
