---
title: 'Turn a Reference Image Into a Real Page With Open Design (Free via Gemini)'
youtubeId: 9MiVWNaeMQc
summary: A reference-image workflow for Open Design — grab a design you like (a Dribbble shot, any site screenshot), drop it in, and have Open Design build a real page in that visual language, running entirely free on Gemini CLI's free tier. Based on Compile Future's walkthrough.
date: 2026-05-02
category: Demo
durationSeconds: 665
author: 'Compile Future'
official: false
---

This guide is about a specific, underused Open Design workflow: **start from a reference image.** Find a design you like — a Dribbble shot, a screenshot of any site — drop it in, and Open Design builds a real page in that visual language. And you can run the whole thing **for free** on a coding agent's free tier. It follows the walkthrough **Compile Future** gives in [their video](https://www.youtube.com/watch?v=9MiVWNaeMQc), rewritten and brought up to date with the current release. Watch the video above, or read on for the written version.

![The Open Design workspace — describe what you want and pick a mode.](/tutorials/open-design-free-claude-alternative-local-compile-future/workspace-home.webp)
*The Open Design workspace: describe what you want to build, pick a mode, and your agent does the rest.*

## What is Open Design?

Open Design is an open-source, local-first design platform — a Claude Design alternative that runs on your own machine. The headline difference: instead of being locked to one model, it drives **the coding agent you already use** — Claude Code, Codex, Cursor, Gemini, OpenCode, and more. It ships with a deep library of skills and brand design systems (Airbnb, Apple, Cursor, Ferrari, Figma, and many more), so generation starts from a real aesthetic rather than a generic prompt.

- **Open source, Apache-2.0** — clone it, self-host it, or just download the app.
- **Runs locally** — your projects live on your own machine.
- **Any model** — including free tiers; no GPU required (the model runs in the cloud via your CLI, not on your hardware).

## Step 1 — Install and connect a free model

Download the installer from [open-design.ai/download](https://open-design.ai/download) (macOS DMG or Windows .exe), or run from source. On first launch, choose your agent. Compile Future uses **Gemini CLI** because its free tier is generous (plenty of free requests per day) — so the whole workflow costs nothing:

- Pick **Gemini** in the setup. If it's not detected, install the Gemini CLI (one command from its site) and log in with a Google account.
- Prefer something else? Any detected CLI works, or bring your own API key.

This is why "no GPU": the model runs through your CLI in the cloud, so even a modest laptop is fine.

## Step 2 — Build from a text prompt (the baseline)

Set a default **design system** (Compile Future likes a bold one), choose **Prototype**, name it, and pick **high fidelity** for the best output. Send your brief. Open Design asks a few **discovery questions** (single tool / landing page / all-in-one? responsive? tone? brand context?) and a **visual direction** (e.g. a Vercel-style minimal look), then builds a clean first version. You can adjust accent colors right on the page.

![A real prototype generated in Open Design.](/tutorials/open-design-free-claude-alternative-local-compile-future/generated-prototype.webp)
*A real generated prototype rendered in the preview — a dark, cinematic agency landing page.*

## Step 3 — The reference-image workflow (the good part)

Here's the technique worth the video. Instead of describing a look in words, **show Open Design the look**:

1. Find a design you like — browse **Dribbble** (search e.g. "tools website") or any live site for inspiration.
2. **Save a screenshot** of it.
3. Back in Open Design, create a project in **free-form** mode, **attach the screenshot**, and prompt: *"build my [site], use the design language from the image I shared."*
4. Answer the discovery questions, telling it to **match the UI of the image**.

Open Design writes a **brand spec** from the reference (it'll show it and ask you to confirm), then builds the page in that visual language — same layout feel, colors, and type as your reference, applied to your content. It's the fastest way to get an on-brand result when you can *see* what you want but can't describe it.

![The Open Design plugin library, with installable skills.](/tutorials/open-design-free-claude-alternative-local-compile-future/plugin-library.webp)
*The plugin library: install skills straight from the registry — including anti-slop design skills.*

## Step 4 — Edit and ship

Refine in plain language — "remove the sign-in button," "adjust the card radius" — and watch it update. View the code via **Source**, then **Share** to download a ZIP, PDF, or PowerPoint, export standalone HTML, or **deploy to Vercel** in one click (just paste a Vercel token) for a shareable link.

## Tips

- **Run free on Gemini CLI's free tier** (or any free-tier CLI) — no subscription, no GPU.
- **Use a reference image** when you can picture the look but can't describe it — Dribbble or any site screenshot.
- **Free-form mode + "match the image"** is the prompt pattern that nails the reference.
- **Confirm the brand spec** it generates before it builds, so the direction is right.
- **High fidelity** for polished output; iterate with plain-language edits.

## FAQ

**Do I need a GPU?**
No. The model runs through your CLI (in the cloud), not on your machine — a normal laptop is fine.

**Can I really run it for free?**
Yes — point it at a free-tier CLI like Gemini and you can generate designs at no cost; you only pay if you choose a paid model/API.

**How do I design from an image I like?**
Use free-form mode, attach the screenshot, and tell it to use the design language of the image; it extracts a brand spec and builds in that style.

**Is it free and open source?**
Yes — Apache-2.0. Run it locally for free; you only pay for the model/media usage of whatever you connect.

---

*This written guide is based on Compile Future's walkthrough. Watch the full video above, and [subscribe to Compile Future](https://www.youtube.com/watch?v=9MiVWNaeMQc) for more free AI workflows.*
