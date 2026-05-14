# Open Design — blog topic backlog

_Last reviewed: 2026-05-14 (Claude Design cluster scoring pass)_

This file is the single source of truth for what we're considering, drafting, and have shipped on the Open Design blog. The leading underscore keeps Astro's content collection from treating it as a post.

Maintained by the `open-design-blog-factory` skill (`~/.codex/skills/open-design-blog-factory/SKILL.md`). Update on every scoring pass, draft start, and ship.

Scoring rubric (4 dimensions × 5 = 20):

- **Fit** — how naturally Open Design slots into the post
- **Intent** — clarity of the search or reading intent
- **Timing** — leverage of the moment (reactive window or weak SERP competition)
- **Effort** — inverse cost to ship (5 = existing skill + existing artefact already covers it)

Decision threshold: ≥ 16 fast-track · 12–15 queue · 8–11 watch · < 8 drop.

---

## Active backlog

Scored, not yet drafting. Sorted by total descending. Pick from the top when starting a new post.

| # | Topic | Channel | Fit | Intent | Timing | Effort | Total | Source | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Claude Code vs Cursor for design work — a side-by-side | Guides (comparison) | 5 | 5 | 4 | 4 | **18** | reader question + r/cursor weekly | Reactive-ish; both products active in design-engineer mindshare. Use the same brief on both, ship the artefacts. |
| 2 | **Claude Design pricing — and the BYOK math** (A2) | Guides (comparison) | 5 | 4 | 4 | 5 | **18** | Anthropic launch pricing public ($20/$100/$200/Enterprise) | Cost-comparison companion to seed BYOK post. Run the same brief on Claude Pro vs Open Design + BYOK; publish the token bill. High commercial intent. |
| 3 | How to ship a launch deck with Open Design in 30 minutes | Use cases | 5 | 4 | 3 | 5 | **17** | own workflow | Re-uses `guizang-ppt` skill + a real shipped deck. Hero image = the deck cover. |
| 4 | BYOK with DeepSeek: a $0.10 design pass on Open Design | Guides (BYOK) | 5 | 4 | 3 | 5 | **17** | DeepSeek search volume + own usage | Concrete cost numbers from a real run. Single-provider deep-dive companion to the "BYOK reality check" overview just shipped. |
| 5 | Open Design on Windows — a working setup guide (and what's still rough) | Guides (tutorial) | 5 | 5 | 4 | 3 | **17** | gh issues #1620 #1611 #1610 #1559 #1581 | Pure search intent — Windows users are hitting these. Lists each known issue + workaround with linked GitHub issue numbers so it stays auditable. Needs to be revised whenever a Windows fix lands. The "BYOK reality check" post (shipped 2026-05-14) already covers the BYOK subset; this one widens to non-BYOK Windows pain. |
| 6 | **Claude Design vs Figma Make vs Open Design** (A3) | Guides (comparison) | 4 | 5 | 4 | 4 | **17** | strong existing SERP for "claude design vs figma make" (Magic Patterns / XDA / CreateWith / claude-codex.fr); no vs-Open-Design content yet | Three-way comparison piggybacking on existing search heat. Use the existing comparison tables as evidence. |
| 7 | What an agent-native design system looks like (a DESIGN.md walkthrough) | Guides (how it works) | 5 | 3 | 4 | 4 | **16** | own framework | Sibling to the "31 skills, 72 systems" post but at the system layer. Useful for design-system-curious readers. |
| 8 | Inside Atelier Zero — designing the Open Design landing page with the agent that ships it | Use cases | 5 | 3 | 4 | 4 | **16** | own dogfooding | Meta in the right way: the page you're reading was built this way. Hero = a real screen recording still. |
| 9 | We just shipped in-app auto-update on Windows + Linux (no code signing required) | Product (announcement) | 5 | 3 | 4 | 4 | **16** | gh issue #1613 (closed 2026-05-13) | Reactive announcement — the closing PR is the artefact. CTA = `Download desktop`. Pair with the #1612 "worried about updating" thread for empathy beat. |
| 10 | 96 contributors in our first month — what the Synclo bot taught us about open-source onboarding | Community (essay) | 4 | 3 | 4 | 5 | **16** | bot leveling cards across all issues + #1605 #1637 examples | Meta-essay about how the project runs. Easy to write — the data is already in the bot card images. CTA = `Contribute a skill`. |
| 11 | Inside the Skill protocol — how @-mention skills compose, and the regression we just fixed | Guides (how it works) | 5 | 3 | 4 | 4 | **16** | gh issue #1635 + PR #1636 | Pull a real bug-and-fix into a "how the system actually works" piece. Sibling to the seed post `31-skills-72-systems-how-the-library-works`. Wait until #1636 merges to publish. |
| 12 | **What Claude Design actually is — a designer-engineer's read of the launch** (B1) | Product (essay) | 4 | 4 | 4 | 4 | **16** | Anthropic launch April 2026 + first-hand use | Top-of-funnel explainer; high AI-Overviews citation potential. Pair with A1 (comparison) and A2 (pricing). |
| 13 | **Claude Design self-hosted? What Anthropic's tool isn't, and what is** (A4) | Guides (comparison) | 5 | 4 | 3 | 4 | **16** | local-first / privacy angle; Anthropic only ships hosted | Anchors the local-first claim against a current named product. CTA = `Try the open-source workflow`. |
| 14 | **Using Open Design with Claude Code — the open handoff to engineering** (C1) | Use cases | 5 | 4 | 3 | 4 | **16** | Anthropic users in OD overlap; Claude Code = handoff target in Claude Design tutorial | Catches "claude code design" searchers; pairs naturally with A1. |
| 15 | How @Romantin shipped a collapsible comments panel in one day | Community (contributor) | 4 | 2 | 4 | 5 | **15** | gh issue #1605 → PR #1607 | Get Romantin's consent before publishing. Use the actual PR diff as a screenshot, link the original issue + the leveling card. CTA = `Contribute a skill`. |
| 16 | Deploying a pnpm monorepo Astro app to Vercel — the output directory gotcha | Guides (tutorial) | 4 | 4 | 3 | 4 | **15** | gh issue #1628 (live) | Pure how-to. Cover root vs `apps/web` Vercel project root, `vercel.json#outputDirectory`, and the actual Open Design `vercel.json`. Useful long-tail SEO. |
| 17 | **Claude Design limitations — what the research preview can't do yet** (B2) | Guides (comparison) | 4 | 4 | 4 | 3 | **15** | Anthropic itself calls it "research preview" | Honest counter-take to the official tutorial. Stay observational, not snarky (per skill comparison rules). |
| 18 | Taste memory for design agents — a community proposal worth shipping | Community (proposal) | 4 | 2 | 4 | 4 | **14** | gh issue #1637 (itsmeved24) | Profile the proposal, cite the author, do not promise we'll build it. Get itsmeved24's consent. Frames Open Design as a place where serious proposals get serious replies. |
| 19 | **Should designers use Claude Design? A field test** (B3) | Use cases | 4 | 4 | 3 | 3 | **14** | own dogfooding | Run the same brief on Claude Design + Open Design, publish both artefacts. Requires actually buying a Claude Pro seat for the test. |
| 20 | **From Claude Design to Open Design — moving your design system** (C2) | Guides (tutorial) | 5 | 3 | 3 | 3 | **14** | migration intent (long-tail evergreen) | Step-by-step: export from Claude Design, fold tokens into a `DESIGN.md`, re-run the brief. Wait until we have a real migrator. |
| 21 | huashu, guizang, open-codesign — the lineage behind Open Design's skill protocol | Community (lineage) | 4 | 2 | 3 | 4 | **13** | own history | Lower intent but high voice value. Worth writing once we have 4–5 posts in flight to anchor the Community channel. |

## Drafting

Currently being written. Move rows here from Active backlog before starting Pipeline Step 3.

| Topic | Slug | Owner | Started | Target ship |
|---|---|---|---|---|
| _(none — A1 shipped 2026-05-14, see Shipped table)_ | | | | |

### A1 fast-track context

Original score in 2026-05-13 backlog: 17. Re-scored to **19** on 2026-05-14 after live SERP check for "claude design open source alternative":

| Position | URL | Owner |
|---|---|---|
| #1 | `github.com/OpenCoworkAI/open-codesign` | competitor |
| **#2** | **opendesigner.io** | **us** |
| #3 | `opencoworkai.github.io/open-codesign/` | competitor |
| #4 | dev.to "Open Claude Design: A Weekend Harness Built on Atomic" | third-party |
| #5 | `github.com/zkf4581/open-codesign` (fork) | competitor adjacent |

We are already #2 on the exact phrase, with no canonical comparison post yet. Writing the post moves us into contention for #1. Timing bumped 4→5; Intent stays 5; Fit stays 5; Effort kept at 4 (needs an honest Claude Design read + a Who-picks-which table).

Title chosen (Step 2.5 fast-track): **"The open-source alternative to Claude Design"** — exact-match the SERP query.

Alternates considered:
- "Open Design vs Claude Design — and which one to pick this quarter" (comparative angle)
- "If you can't use Claude Design, what do you use instead?" (question-shaped, weaker keyword density)

## Watch (8–11, monitor for context shift)

These didn't clear the queue threshold but might if conditions change. Re-score monthly.

| Topic | Channel candidate | Total | What would push it higher |
|---|---|---|---|
| How designers should think about MCP | Guides (essay) | 12 | A specific MCP server that matters for design (Figma MCP, Sketch MCP) ships with adoption signal |
| Designing for agent-driven UI patterns (chat-as-canvas, IM-as-editor) | Use cases | 11 | An Open Design skill ships that produces one of these patterns end-to-end |
| Local-first design tools — a privacy posture comparison | Guides (comparison) | 10 | A real privacy incident in a hosted design tool puts the topic into search |

## Shipped

Posts that are live. The right-hand columns get filled by the GSC review automation (Issue #4) once it ships.

| Date | Slug | Channel | Score at ship | 7d impressions | 30d clicks | Last audited | Next due | Notes |
|---|---|---|---|---|---|---|---|---|
| 2026-05-13 | why-we-built-open-design-as-a-skill-layer | Product (essay / manifesto) | 18 | pending GSC propagation (3–14d) | pending | — | 2026-06-13 | Seed post. Anchors the Product channel and the "skill layer, not a product" framing. GSC indexing requested via Issue #4 playbook. |
| 2026-05-13 | 31-skills-72-systems-how-the-library-works | Guides (how it works) | 18 | pending GSC propagation (3–14d) | pending | — | 2026-06-13 | Seed post. The mechanical companion to the manifesto. GSC indexing requested via Issue #4 playbook. |
| 2026-05-13 | byok-design-workflow-claude-codex-qwen | Guides (BYOK) | 18 | pending GSC propagation (3–14d) | pending | — | 2026-06-13 | Seed post. Pairs with the new "BYOK reality check" as the positive-case companion. GSC indexing requested via Issue #4 playbook. |
| 2026-05-14 | byok-reality-check-5-things-that-break | Guides (BYOK) | 18 | pending (just shipped) | pending | — | 2026-06-14 | Reactive piece — written same-day after mining gh issues #1619 #1611 #1610 #1603 #1620. Title alternates noted: "BYOK in Open Design: what works today across Gemini, DeepSeek, OpenCode" / "Should you BYOK with Open Design today? Five tests, five real bugs". Pairs with seed `byok-design-workflow-claude-codex-qwen` (positive case) and seeds the future "Open Design on Windows" Guide. |
| 2026-05-14 | open-source-alternative-to-claude-design | Guides (comparison) | 19 | pending (just shipped) | pending | — | 2026-06-14 | A1, anchor of the Claude Design keyword cluster (A1–A4 / B1–B3 / C1–C2). Fast-tracked off live SERP intel: opendesigner.io already #2 for "claude design open source alternative"; this post targets the #1 slot. 1446 words. Title alternates: "Open Design vs Claude Design — and which one to pick this quarter" / "If you can't use Claude Design, what do you use instead?". Honest read on Anthropic's Claude Design (Opus 4.7, April 2026), `OpenCoworkAI/open-codesign` (MIT competitor), and Open Design with a who-picks-which table. CTA = `Try the open-source workflow`. Next step: ship A2 (pricing) + B1 (explainer) to thicken the cluster, then cross-post A1 to dev.to / Medium / HN. |

## Dropped (with reason)

Keep this list short — only entries useful as guard-rails so we don't re-litigate them.

- **"AI is replacing designers" hot take** — failed fit filter rule 1 (no Open Design surface) and rule 4 (no real CTA). Open Design's voice is editorial, not anxiety-driven.
- **Weekly "Top 5 AI design tools" roundup** — failed fit filter rule 3 (no unique angle vs existing roundups) and rule 4 (no real CTA). This is what nexu's `blog-factory` calls AI News; we deliberately don't run that lane.
- **"Why every design team needs an AI strategy in 2026"** — failed fit filter rule 1 (generic) and triggered the Blacklist ("the future of design" framing). Drop.

---

## Source URL list (for the agent's "find topics" pass)

P0 — every find-topics pass (mandatory):
- `gh issue list --repo nexu-io/open-design --state open --limit 30` — current pain, BYOK, contributor work
- `gh issue list --repo nexu-io/open-design --state closed --limit 30 --search "closed:>=$(date -v-7d +%Y-%m-%d)"` — recent shipped wins worth narrating
- `gh issue list --repo nexu-io/open-design --label blog --state all` — direct content requests
- https://github.com/nexu-io/open-design/issues — same data via web for skim/triage

P0 — daily:
- https://www.anthropic.com/news
- https://openai.com/blog
- https://blog.google/technology/ai/
- https://www.figma.com/blog/
- https://news.ycombinator.com/news (filter: `agent`, `claude`, `cursor`, `codex`, `figma`, `design`, `skill`, `mcp`)

P1 — weekly:
- https://www.reddit.com/r/ClaudeAI/top/?t=week
- https://www.reddit.com/r/cursor/top/?t=week
- https://www.reddit.com/r/ChatGPTCoding/top/?t=week
- https://www.reddit.com/r/Design/top/?t=week
- https://www.producthunt.com/

P2 — weekly:
- Designer / design-engineer Twitter list (TBD curate)
- https://github.com/trending (filter: design, agent, skill)

P3 — monthly:
- https://trends.google.com/trends/explore (queries: `claude design`, `cursor design`, `open source design tool`, `byok design`)
