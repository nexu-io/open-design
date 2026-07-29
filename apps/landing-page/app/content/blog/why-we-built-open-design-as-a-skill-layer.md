---
title: "Why we built Open Design as a skill layer, not a product"
date: 2026-05-13
category: "Product"
readingTime: 5
summary: "Most AI design tools try to replace the agent already on your laptop. Open Design takes the opposite bet: ship a thin layer of skills, systems, and adapters that turn any coding agent into a design engine — without locking you into a new app."
---

The strongest coding agent on your laptop right now is Claude, Codex, Cursor, Gemini, OpenCode, or Qwen. We don't think you need another one. What's missing is not raw intelligence — it's **taste, structure, and a workflow that respects design as a craft**.

Open Design is our attempt at that missing layer. It's not a chat product. It's not a design tool that "uses AI under the hood." It's a thin skill layer — a folder of `SKILL.md` files, a portable library of design systems, and a daemon that auto-detects your existing CLI agents and wires them together.

This post explains why we made that choice, and what it implies for how you'll use Open Design.

## A product would be the wrong shape

The instinct, when starting an AI design project in 2026, is to build a new app: a chat interface, a canvas, a billing system, a model bill that grows linearly with your user count.

We considered that path and rejected it for three reasons:

1. **The chat interface is a commodity.** Every user already has one. Adding a worse one helps nobody.
2. **The model bill is a tax on creativity.** Bundling inference into the product means we have to mark it up, throttle long sessions, and ration model upgrades. None of that serves the designer.
3. **Lock-in is the wrong default.** Designers should be able to leave with their files, their systems, their skills. A product wraps everything in proprietary state. A skill layer doesn't.

So we built the layer instead. Drop a folder, restart the daemon, the skill appears. Take the folder with you, drop it into a different agent, the skill works there too.

## What a skill actually is

A skill in Open Design is a `SKILL.md` file plus optional supporting assets in the same folder. The Markdown file describes:

- **What the skill does** — one paragraph, in plain English
- **When to invoke it** — the trigger conditions, written so the agent can route correctly
- **The shape of the output** — HTML, PDF, slides, a Markdown brief
- **The constraints** — palette in OKLch, font stack, layout posture, brand vocabulary

The agent reads the file, decides whether to invoke, and writes the output to disk. There is no plugin system, no API surface, no version compatibility matrix. If you can write Markdown, you can ship a skill.

This is intentional. We've watched plugin ecosystems decay for fifteen years — each one a trade between expressiveness and longevity, won by neither. Files are forever. Plugins are a snapshot of someone's API in 2024.

## Why systems are also Markdown

Open Design ships 72 design systems — Linear, Vercel, Stripe, Apple, Cursor, Figma, and more — as `DESIGN.md` files. Same idea: portable, readable, agent-ingestible.

A design system, in this context, is not a Figma library. It's a contract: here are the colors in OKLch, here is the type ramp, here is the spacing scale, here is the layout posture, here is the voice. The agent reads the contract and produces work that respects it.

You can fork a system, edit it in place, ship a variant. You can write your own from scratch in 30 minutes. You can mix systems mid-project — pull the typography from Linear, the color logic from Vercel, the layout from a custom in-house spec — because they're all just text.

## BYOK is the only honest model

Open Design runs on **bring-your-own-key**. You paste a base URL and an API key for any OpenAI-compatible endpoint — DeepSeek, Groq, OpenRouter, your own self-hosted vLLM — and you're done.

We don't run inference. We don't take a margin on tokens. We don't have a billing relationship with you. That's not a sustainability problem — it's the only honest answer to the question "who pays when the agent runs?"

The answer is: you do, directly, to the model provider you chose. We get out of the way.

## What this means for you

If you want a polished SaaS with a nice chat box and a single subscription, we're not the right tool. There are good products in that shape — use them.

If you want a workflow where:

- the agent you already trust does the work,
- the skills are files you can read and edit,
- the design systems are portable across projects and agents,
- and the bill goes to the model provider, not us —

then Open Design is built for you. Drop into the GitHub repo, run `pnpm tools-dev`, point your agent at a skill, and ship.

The skill layer wins because it doesn't compete with the agent on your laptop. It augments it.
