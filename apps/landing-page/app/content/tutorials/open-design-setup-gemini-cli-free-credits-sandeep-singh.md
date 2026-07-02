---
title: 'Claude Design is Done... The BEST FREE Claude Design Alternative (Unlimited & Open Source)'
youtubeId: RqjrENimZP4
summary: 'Set up Open Design and drive it with Gemini CLI, so high-fidelity AI design generation runs on the Gemini free tier — an open-source, local-first workspace you can use without paying for the agent.'
date: 2026-05-11
category: Getting started
durationSeconds: 664
author: 'Sandeep Singh'
official: false
---

This guide shows you how to run Open Design with **Gemini CLI** as the agent that drives generation — so prototypes, landing pages, and UI come out of one workspace while leaning on Gemini's generous free tier. It follows the path Sandeep Singh takes in [his hands-on walkthrough](https://www.youtube.com/watch?v=RqjrENimZP4), rewritten and updated to match the current release. Watch the video above for the live version, or read on.

The cost story is the point. Open Design itself is free and open source; the only thing you "pay" is the agent and model you bring. Bring Gemini CLI, authenticate with your Google account, and that bill effectively drops to zero.

![The Open Design workspace.](/tutorials/open-design-setup-gemini-cli-free-credits-sandeep-singh/01-workspace.webp)
*The Open Design workspace — open-source, local-first, and driven by whichever coding agent you connect.*

## What is Open Design?

Open Design is an open-source, local-first design platform that runs **on top of the coding agent you already use** rather than locking you to one model provider. It is "bring your own agent": Claude Code, Codex, Cursor, **Gemini**, GitHub Copilot, OpenCode, and 21+ others can each drive generation. You pick the agent; Open Design handles the design surface.

A few things that make it worth a look:

- **Open source, Apache-2.0** — clone it, self-host it, read every line.
- **Runs locally** — your projects live in folders on your own machine, not in someone else's cloud.
- **Agent-pluggable** — 21+ coding agents are supported, including Gemini CLI; you choose which one drives generation.
- **More than prototypes** — prototypes, live artifacts, slide decks, magazine layouts, image generation, and even video, all from one workspace.
- **Built-in starting points** — branded design systems and templates ship in the box, so you are never staring at a blank canvas.

It stands on its own merits: a local, model-agnostic design workspace. The fact that it pairs cleanly with a free agent like Gemini CLI is the bonus that makes it genuinely free to use.

## Before you start

You have three ways to install Open Design. Pick the one that fits you:

| Path | Best for | Requirements |
| --- | --- | --- |
| **Desktop app** | Most people — zero config | None. Just download and open. |
| **Run from source** | Developers who want to read or modify the code | Node `~24`, pnpm `10.33.x` |
| **Install into your agent** | People who live in the terminal | An existing coding-agent CLI |

The **desktop app is the recommended route** today — no Node, no pnpm, no clone. Sandeep downloads the installer for his platform (a `.dmg` on macOS, a `setup.exe` on Windows) straight from the latest release.

## Step 1 — Install Open Design

### Option A — Desktop app (recommended, zero config)

Go to [open-design.ai](https://open-design.ai/) and click **Download desktop**. Builds are available for macOS (Apple Silicon and Intel), Windows (x64), and Linux (AppImage). After installing, the app auto-detects every coding-agent CLI already on your `PATH` and loads the built-in skills and design systems for you. On first launch you land on the connect screen, where you choose a local CLI or paste your own API key.

### Option B — Run from source

If you would rather run it from the repository, you only need a handful of commands:

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable && pnpm install
pnpm tools-dev run web
```

Then open the local URL it prints — the port is assigned dynamically, so use whatever address appears in your terminal rather than a fixed one. You need Node `~24` and pnpm `10.33.x`; Corepack will select the pinned pnpm version for you.

### Option C — Install into your coding agent

To use Open Design without ever opening the GUI — calling it as a skill or MCP server inside your agent — run:

```bash
od mcp install <agent>
# <agent> = gemini | claude | codex | cursor | copilot | opencode | …
```

Then, inside the agent, just ask: `Use open-design to generate a landing page with a modern minimal design system`.

## Connect Gemini CLI as your agent

This is the step that makes the workflow free. Open Design does not ship a model of its own — it drives whatever CLI you point it at — so you bring Gemini CLI and let its free tier do the work.

**Why Gemini CLI?** Two reasons, as Sandeep puts it: the Gemini models hold their own against the rest, and the free tier is generous. Sign in with a Google account and you get a large allowance of daily requests at no cost; the Gemini API key has a smaller free allowance. For sustained design work, the Google-account sign-in is the one to use.

1. **Install Gemini CLI.** Follow the install command on the Gemini CLI homepage (Homebrew on macOS and Linux, or the documented installer elsewhere). Any terminal works.
2. **Run `gemini` and authenticate.** Launch it, trust the working folder when prompted, then choose **Sign in with Google**. Your browser opens for a two-click Google login and reports success. Restart Gemini CLI; you should see the active model and `0%` quota used.
3. **Point Open Design at it.** Restart Open Design and open **Settings**. Gemini CLI now shows up as an available agent — select it, **Test the connection**, and you should get an `OK` back. Save, and you are ready to design.

You can also paste your own API key here instead of using a local CLI, and add separate keys for image, video, and audio models if you want media generation later. For free, unlimited-feeling design work, though, the Gemini CLI sign-in is all you need. Everything in Settings is changeable later, so keep the first pass simple.

## Explore the workspace

Open Design keeps your work **project-scoped**: each project lives in its own folder, and switching folders switches projects. Inside a project you can create prototypes, live artifacts, slide decks, images, and even video and audio — not just UI.

![The built-in design-systems library.](/tutorials/open-design-setup-gemini-cli-free-credits-sandeep-singh/02-design-systems.webp)
*The design-systems library — branded starting points you can preview and snap into any project.*

The built-in design-systems library gives you branded starting points to preview and reuse, so you are not blocked on defining tokens before you can begin. You can also bring your own design system, import an existing Claude Design project, or start from nothing and let Open Design infer sensible defaults.

![The templates library.](/tutorials/open-design-setup-gemini-cli-free-credits-sandeep-singh/03-templates.webp)
*Templates: prototype, slide, image, and video starting points — filter by type and fork to begin.*

The templates library reaches beyond brand systems into prototypes, slides, and both image and video generation. Filter by type and fork any one as your starting point. You can browse the full plugin library on the web at [open-design.ai/plugins](https://open-design.ai/plugins/) before installing anything.

## Build something

With Gemini CLI connected, the build flow is the same one Sandeep runs in the video:

1. **Create a project.** Name it, pick a design system that suits the look you want, and choose **High fidelity** so you see the real thing rather than a wireframe.
2. **Write the brief.** Instead of one of the suggested prompts, describe what you want — Sandeep asks for a landing page. You can also attach a screenshot of a layout you like and ask Open Design to follow that theme.
3. **Answer the clarifying questions.** The agent asks smart follow-ups: single landing page or landing-plus-pricing, responsive surface, who it is for, a visual tone (Sandeep chooses a modern, minimal, Linear/Vercel feel), and any brand colors or fonts. You can leave fields blank or let it pick a direction for you.
4. **Pick a visual direction and generate.** Choose one of the proposed directions, send, and a few seconds later the styled landing page appears with the sections you asked for.
5. **Iterate by prompting.** Want to swap a logo, add a missing icon, or extend the FAQ? Just describe the change and send. If an edit knocks something out of place, a follow-up prompt nudges it back.

When you are happy, open the design files, inspect the source code, edit layers manually if you want, then export — PDF, PPTX, a compressed bundle, or a deploy to Vercel.

The free part is real: Sandeep builds two prototypes with several iterations and, when he checks his Gemini usage afterward, has spent only about **2%** of his daily allowance. With a large daily allowance refreshing every day, you can design almost continuously without watching a meter.

## Tips

- **Sign in to Gemini CLI with your Google account** rather than an API key — the daily free allowance is much larger, which is what makes this workflow effectively free.
- **Start with high fidelity** when you want to judge the real design; drop to wireframe only to block out structure quickly.
- **Check your usage with `stats`** in Gemini CLI to see how little design work actually costs against your daily allowance.
- **Your designs stay with the project folder** — organize work by running Open Design against the right directory.
- **You do not need a design system to start.** Begin from a built-in one, import a Claude Design project, or let Open Design infer defaults.

## FAQ

**Is it really free?**
Effectively, yes. Open Design is open source under Apache-2.0, so the software costs nothing. The only cost is the agent and model you bring — and with Gemini CLI authenticated via a Google account, you draw on a large daily free allowance. In the video, two prototypes plus iterations used roughly 2% of the day's quota, which refreshes daily.

**Which coding agents does it support?**
21+ agents, including Gemini, Claude Code, Codex, Cursor, GitHub Copilot, and OpenCode. Open Design detects the CLIs already installed on your machine and lets you pick one as the default.

**Do I have to use Gemini CLI?**
No. Gemini CLI is the route to a free, high-quota setup, but you can connect any supported agent, or paste your own API key for an agent or for image, video, and audio models.

**Do I need a design system before I can start?**
No. Open Design ships branded design systems and templates as starting points, and you can import an existing design system or let it infer sensible defaults.

---

*This written guide is based on Sandeep Singh's hands-on walkthrough. Watch the full video above, and [subscribe to Sandeep Singh](https://www.youtube.com/watch?v=RqjrENimZP4) for more practical AI-tool tutorials.*
