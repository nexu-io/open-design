---
title: Open Design 0.15.0
description: Cost Less. Ship Faster. OD's DeepSeek Moment.
---

# Open Design 0.15.0 — Cost Less. Ship Faster. OD’s DeepSeek Moment

Open Design 0.15.0 optimizes the Design System Prompt to make everyday design tasks faster and more efficient. In representative evaluation runs, time to first token was **49.5% shorter**, end-to-end duration was **21.2% shorter**, and average input-token use was **25.1% lower**. The broader creative workflow is smoother too—from building and presenting decks, to cloning public websites from a URL, to understanding and recovering from failed tasks.

## ✨ New

### 🎞 Decks, Presentations, and Export

- **Decks now feel like a workspace, not just a static preview.** Multi-page decks support thumbnail navigation, direct page selection, and keyboard navigation with the arrow, Home, and End keys—so you no longer have to hunt for controls.

- **Speaker notes stay with the slide they belong to.** Read and edit notes alongside the current slide, save them in place, and view them in Presenter View without covering the audience-facing presentation.

- **Present the way the moment calls for.** Enter an immersive presentation in the current tab or in full screen, then move backward or forward, pause, resume, or restart without losing deck state.

- **Export the exact version you approved.** Download a specific file version as PDF, images, ZIP, or HTML without silently exporting the latest edits. Speaker notes are excluded from exported slides.

### 🌐 Website Clone

- **Start cloning a website with a URL, not a blank prompt.** Website Clone is now a first-class entry point on Home and in the Library: choose the capability, paste a public URL, and Open Design creates the project with the right context.

- **The cloning process leaves an audit trail.** The workflow first inspects page structure, routes, assets, and interactions. The generated project retains NOTES.md-style documentation describing its approach, asset sources, and known differences.

- **Results are both more useful and more responsible.** Generated sites are ready for local preview and do not carry over third-party analytics or advertising scripts. For complex targets such as login-walled sites, Open Design explains the limitations instead of pretending the clone is complete.

### 💬 Motion and Examples

- **Turn conversations into motion.** The new Chat Motion Overlay skill converts two-person conversations into animated chat overlays, with WeChat-, Telegram-, and Messenger-style containers plus transparent-output options for post-production.

- **Find the right starting point faster from Home.** Website Clone now has a clearer entry point, ready-to-use examples, and prompts that begin with the target URL. Template and plugin cards also open the correct preview more reliably, so you can decide whether to use or remix them.

## 🔁 Changed

### 🧠 Tasks, Models, and Integrations

- **A leaner Design System Prompt makes tasks respond faster.** By optimizing the Design System Prompt, representative evaluation runs showed a **49.5% reduction in time to first token**, a **21.2% reduction in end-to-end duration**, and **25.1% lower average input-token use**. Everyday design tasks now respond faster, use fewer tokens, and can be completed more efficiently.

- **Failures now explain what happened and what to do next.** Missing local agents, oversized inputs, unavailable models or services, exhausted quotas, timeouts, empty output, save failures, and tool loops now provide more specific recovery paths.

- **A completed task now means there is a real deliverable.** Runs that fail to generate or save usable project files are no longer shown as successfully completed.

- **BYOK and third-party agent configuration is more accurate.** This release adds an Atlas Cloud preset; routes OpenAI-compatible endpoints through the compatible chat-completions path; keeps embedding and rerank models out of the chat model selector; and provides clearer configuration and runtime feedback for Kiro, Reasonix, Antigravity, Grok Build, and OpenRouter.

- **Privacy choices are easier to understand.** Consent and settings screens now distinguish anonymous runtime metrics from redacted quality-review content more clearly, while analytics retain more useful provider and entry-point attribution.

## 🐛 Fixed

### 🛟 Recovery and Lifecycle

- **Stopping work now stops the work behind it.** Deleting a conversation or project, or stopping a long-running task, cancels the corresponding run and child processes instead of allowing them to continue consuming time or quota.

- **Retries and sessions now keep their proper boundaries.** Retries no longer inherit state from failed processes; expired native sessions reset truthfully; and the completion of a child agent no longer causes its parent task to appear finished too early.

- **The desktop app now has a recovery path when the renderer fails.** Repeated renderer crashes open a recovery screen instead of triggering an endless reload loop, with an option to export diagnostic logs. Startup wait handling, download and save flows, and CLI cache scenarios are more reliable on Windows as well.

### 🎨 Design Systems, Templates, and Localization

- **Design system projects preserve more of your work.** Regeneration no longer discards user files, renamed workspace projects retain their names, Swift palette parsing is more reliable, and missing preview assets no longer leave the page at a dead end.

- **The Library looks more like it should.** Plugin category counts and translations are more reliable, baked previews are less likely to mismatch their templates, deck previews keep the correct aspect ratio, and WebGL previews behave better when resized.

- **The interface is more complete across languages.** Russian, Thai, Traditional Chinese, and other localized paths now cover more updated copy, reducing the chance of internal labels leaking into localized interfaces.

### 🔒 Safer Boundaries

- **External input now fails safely.** Brand extraction rejects unsafe local-network targets; corrupted asset streams and proxy interruptions no longer bring down the daemon; and design system parsing is more resilient to malformed input.
