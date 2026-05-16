---
title: "The open-source alternative to Claude Design"
date: 2026-05-14
category: "Guides"
readingTime: 7
summary: "Claude Design is good. It's also closed-source, hosted-only, and bundled with a Claude subscription. Here's the honest read on when to pick it — and when the open-source path wins."
---

Claude Design is good. We've used it on real briefs. The fact that we [built an open-source layer](/blog/why-we-built-open-design-as-a-skill-layer/) instead isn't because Anthropic shipped a bad tool — they didn't. It's because closed-source, hosted-only, $20-to-$200-a-month design tooling is the wrong shape for the next decade of design work. This post is the honest read on Claude Design from a team that ships in the same category: what it is, where it locks you in, what the open-source alternatives actually look like, and which one you should pick this quarter.

## What Claude Design actually is

[Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs) launched out of Anthropic Labs in April 2026. It's a conversational design tool powered by Claude Opus 4.7: chat on the left, canvas on the right. You describe what you want, Claude generates a design, and you iterate through comments, inline edits, and prompt refinements.

It does four things well:

- **Prototypes from prose.** Onboarding flows, settings pages, admin panels, checkout variants — five minutes from prompt to interactive screen.
- **Codebase awareness.** Import a GitHub repo or attach a local directory and the prototypes use your real components, your token system, your conventions.
- **Brand integration.** Set up a design system once and every project automatically picks up the colors, typography, and component patterns.
- **Handoff to Claude Code.** The "build this" button takes the prototype to production-ready code in the same browser tab.

Exports include Canva, PDF, PPTX, HTML, and standalone URLs. Pricing is bundled — Claude Pro at $20, Max at $100–$200, Enterprise at the usual call-us tier. It's currently a research preview for paying Claude subscribers.

If you read [the official tutorial](https://support.claude.com/en/articles/14604416-get-started-with-claude-design), the workflow Anthropic describes is the same one Open Design ships: a brief, a direction, an artifact, a handoff. The differences live one layer down.

## Where it locks you in

Claude Design carries four pieces of lock-in worth naming upfront, because the marketing pages don't.

**The model is fixed.** Every render goes through Claude. Not Claude *or* a model you've already paid for — just Claude. If your team has a contract with GPT, Gemini, or DeepSeek, or if you self-host on Ollama for sensitive briefs, those workflows don't translate. Token cost rides Anthropic's pricing curve forever.

**The runtime is hosted.** Your prompts, your design system, and your codebase context all travel to Anthropic's servers. For agency work or pre-launch creative under NDA, that's a procurement conversation every time. Self-hosted is not an option in the research preview, and the announcement does not commit to one.

**The skills are not yours.** Claude Design's behaviour is defined by prompts and tools that live inside Anthropic. You can't fork them, audit them, or replace one. The "skills" Anthropic is shipping in Claude Skills are adjacent but separate; the design-specific tooling is internal.

**The bill is a subscription.** $20–$200/month per seat is fine for a solo designer, painful for a team of twenty, and a non-starter for the dozen open-source contributors who would otherwise pick up the same workflow.

None of these are bugs in Claude Design. They are the shape of a hosted product. Anthropic optimised for the median Pro subscriber. We're not the median Pro subscriber.

## What the open-source alternatives actually look like

Two open-source projects show up when you search for an alternative. It's worth being clear about both.

**`open-codesign`** ([OpenCoworkAI/open-codesign](https://github.com/OpenCoworkAI/open-codesign)) is an Electron desktop app under MIT. It supports Claude, GPT, Gemini, Kimi, GLM, and Ollama, leans on a "one-click import your Claude Code / Codex API key" onboarding hook, and produces prototypes, slides, and PDFs from prompts. It's the closest one-to-one mirror of Claude Design's surface area in open source today.

**Open Design** (this site) is a different bet. It's not a Claude Design clone — it's a thin skill layer that turns the coding agent you already use into a design engine. The four primitives are [skills, systems, adapters, and the daemon](/blog/31-skills-72-systems-how-the-library-works/). Every skill is a `SKILL.md` file. Every design system is a `DESIGN.md` file. Every agent adapter is ~80 lines of TypeScript.

What ships in the box today:

- **123 skills** — deck generators, mobile mockups, editorial pages, Word/Excel/PPT, brand explorations
- **148 design systems** — portable Markdown versions of Linear, Vercel, Stripe, Apple, Cursor, Figma, plus a long tail
- **16 coding-agent CLIs auto-detected** on your `$PATH` — Claude Code, Codex, Cursor, Gemini, OpenCode, Copilot, Devin, Hermes, Pi, Kimi, Kiro, Qwen, DeepSeek TUI, Qoder, Mistral Vibe, Kilo
- **Four-step locked workflow** — question form → direction picker → live plan stream → sandboxed iframe preview
- **BYOK by default** — paste any OpenAI-compatible `base_url` and key, [your tokens go straight to the provider](/blog/byok-design-workflow-claude-codex-qwen/)
- **Apache-2.0, no signup, runs on `pnpm tools-dev`**

The mental model: Claude Design is a product. `open-codesign` is a clone. Open Design is a layer.

## Side-by-side

| | **Claude Design** | **`open-codesign`** | **Open Design** |
|---|---|---|---|
| License | Proprietary | MIT | Apache-2.0 |
| Runtime | Hosted (Anthropic) | Local Electron app | Local daemon (`pnpm tools-dev`) + optional Vercel deploy |
| Models | Claude only | Claude, GPT, Gemini, Kimi, GLM, Ollama | Any OpenAI-compatible endpoint + 16 detected CLIs |
| Skills | Internal | None as a system | 123 forkable `SKILL.md` folders |
| Design systems | Per-project brand setup | Per-project | 148 portable `DESIGN.md` files |
| Codebase context | GitHub import + local | Limited | Skill-level, real working directory |
| Pricing | $20 / $100 / $200 / Enterprise | Free | Free; you pay your model provider directly |
| Handoff | Claude Code (in-app) | Local export | Any agent on `$PATH`, plus HTML / PDF / PPTX / ZIP exports |
| Self-hostable | No | Yes (desktop) | Yes (laptop or Vercel) |
| Data path | Prompts → Anthropic | Prompts → your chosen provider | Prompts → your chosen provider; nothing through us |

The honest summary: Claude Design has the most polished single-product experience. `open-codesign` is the closest visual analog if what you want is "Claude Design but free." Open Design trades the polished single-product surface for a library — more skills, more systems, more agents, designed to compose with the agent already on your laptop.

## Who should pick what

| If you are… | Pick |
|---|---|
| A solo PM at a company already on Claude Pro who needs a prototype before lunch | **Claude Design.** The $20/month is sunk; the interface is genuinely fast. |
| An enterprise design team where Anthropic already cleared procurement | **Claude Design.** You've paid the integration cost once; spend it. |
| A solo designer who wants "Claude Design but free" with a desktop app feel | **`open-codesign`.** Single binary, Electron UX, no concept of skills to learn. |
| A design engineer who already drives Claude Code, Codex, or Cursor from the terminal | **Open Design.** Your agent is the design engine; the skill layer adds taste and structure without a new app. |
| Anyone who needs BYOK, model choice mid-project, or local-only for sensitive briefs | **Open Design.** [The reality is rougher than the marketing](/blog/byok-reality-check-5-things-that-break/), but the contract is the only one that actually holds. |
| An open-source contributor who wants to ship a new design skill the project can adopt | **Open Design.** Drop a folder, restart the daemon, send the PR. |
| A team standardising on a portable design system that survives tool churn | **Open Design.** `DESIGN.md` files outlive the tool that reads them. |

The dimension that decides it for most teams isn't quality. It's whether you'd rather rent the workflow or own it.

## What to do next

If you want to see what owning the workflow feels like before you spend a Pro subscription, run the three-command quickstart and point it at the model you already pay for. The whole thing lives in one repo and the first deck takes about ten minutes.

[Try the open-source workflow](https://github.com/nexu-io/open-design/releases).

## Related reading

- [Why we built Open Design as a skill layer, not a product](/blog/why-we-built-open-design-as-a-skill-layer/) — the longer manifesto behind the "layer, not product" bet
- [BYOK design workflow — run Claude, Codex, or Qwen on your own key](/blog/byok-design-workflow-claude-codex-qwen/) — the cost math behind picking your own model
- [BYOK reality check — five things that break](/blog/byok-reality-check-5-things-that-break/) — what the open path actually breaks today, and the workarounds
