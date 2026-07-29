---
title: "BYOK design workflow: run Claude, Codex, or Qwen on your own key"
date: 2026-05-13
category: "Guides"
readingTime: 6
summary: "Most AI design tools quietly add a margin to every token you spend. Open Design takes the opposite stance — bring your own model key, pay the provider directly, and keep full control of where inference runs. Here's how the BYOK layer actually works."
---

If you've used a hosted AI design product in 2026, you've probably noticed the bill creeping up. A subscription on top of a per-seat charge, layered on top of an inference markup that nobody publishes. The math is opaque on purpose.

Open Design doesn't run inference. We don't have a margin on tokens. The entire workflow is built around **bring-your-own-key (BYOK)** — you point the daemon at any OpenAI-compatible endpoint, paste your own API key, and you're done.

This post explains why we made that choice, how it works under the hood, and what it actually changes in your day-to-day workflow.

## What "BYOK" really means here

There are two definitions of BYOK floating around the AI tooling space, and they're not the same thing:

- **Surface BYOK** — the tool lets you paste a key, but still routes inference through their servers, logs your prompts, and may apply rate limits.
- **Real BYOK** — the tool calls the model provider directly from your machine (or your infrastructure). Your prompts never touch the vendor's servers. The vendor takes no margin.

Open Design is the second kind. The daemon makes HTTP calls to whichever endpoint you configure, with your key, from your machine. We don't proxy. We don't log. We don't see your prompts.

## The OpenAI-compatible adapter

Most AI inference endpoints in 2026 speak the OpenAI Chat Completions API. We use that as the lowest-common-denominator protocol. If your provider speaks it (and almost all of them do), you're supported by default.

That includes:

- **OpenAI** itself, with `gpt-image-2`, `gpt-5.x`, etc.
- **Anthropic** via the OpenAI compatibility shim, or via the dedicated Claude adapter
- **DeepSeek** for cost-efficient long-context work
- **Groq** for low-latency drafts
- **OpenRouter** for any frontier model with one billing relationship
- **Self-hosted vLLM, TGI, or Ollama** for fully local inference
- **Qwen, Kimi, Hermes** and other regional providers with OAI-compatible endpoints

Configuration is two fields:

```
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_API_KEY=sk-…
```

Drop them in `.env.local`, restart the daemon, you're on a different model.

## Why this matters for design work

Design workflows have a specific cost shape that hosted-inference products are bad at:

1. **Iteration is the unit of work.** A real design pass means 30–50 prompt cycles, not three. Hosted plans throttle hard at the 50-cycle mark.
2. **Long context is the norm.** A serious brief involves brand documents, prior work, system specs, and reference imagery. That context blows past the token budgets in hosted UIs.
3. **Model choice should be ad-hoc.** Some passes want a fast cheap model. Some want the strongest available. Some want a local model for sensitive content. A hosted product picks one for you.

BYOK fixes all three. You pay per token, you choose the model, you don't get throttled.

## What about cost?

A common worry: "If I'm paying directly, won't it be more expensive?"

In practice, no. Here's a typical day of design work in our internal usage:

| Task | Tokens | Provider | Cost |
|---|---|---|---|
| Brief intake (3 docs) | 30K input | Claude Sonnet | $0.09 |
| First draft pass | 80K input + 20K output | Claude Sonnet | $0.54 |
| 5 iteration cycles | 250K input + 80K output | Claude Sonnet | $1.95 |
| Final polish | 50K input + 30K output | Claude Opus (one pass) | $1.35 |
| **Day total** | | | **~$3.93** |

That's a deck, two landing variants, and a brand exploration. The hosted equivalent — assuming a $30/month "creator" plan with overage charges — would run about $50 for the same work, give you fewer iterations, and lock you to one model.

If you want to go cheaper, swap Claude Sonnet for DeepSeek V3.2 and the day drops under $1.

## Privacy and compliance

There's a second reason BYOK matters: **the prompts contain your client's brand.**

Hosted inference means routing brand documents, unannounced product names, internal pricing, and pre-launch creative through a third party's servers. Most companies have an opinion about that. Some have a contract about it.

With BYOK, the prompt round-trip is between your laptop and the model provider you've already vetted (or self-hosted). Open Design is not in the loop. We have no log to subpoena, no breach surface to leak from, no audit gap to explain.

For agency work, regulated industries, or anything pre-launch, this is the only stance that holds up.

## How to switch providers mid-project

One of the underrated benefits of BYOK is provider arbitrage during a project:

- **Drafting** — use a cheap model (DeepSeek V3.2, Qwen 3) on the question form and first iteration
- **Refinement** — switch to Claude Sonnet or GPT-5 for the middle passes where taste matters
- **Sensitive content** — swap to a local Ollama model for client-confidential prompts
- **Final polish** — burn one pass on the strongest model available (Opus, GPT-5 Pro)

In Open Design, switching is editing two lines in `.env.local`. There's no migration, no re-onboarding, no plan upgrade.

This is what owning the workflow actually means: the tool gets out of the way, and the model is a parameter you change as the brief demands.

## Try it

Clone the repo, set `OPENAI_BASE_URL` and `OPENAI_API_KEY` in `.env.local`, run `pnpm tools-dev`. The daemon will use whatever endpoint you point it at, with whatever model you pay for, on whatever schedule you want.

That's the entire BYOK story. There's no special tier, no upgrade flow, no billing relationship with us. You pay the model provider, you keep your keys, you keep your prompts. We provide the layer.
