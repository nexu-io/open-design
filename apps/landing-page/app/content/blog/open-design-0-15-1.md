---
title: "Open Design 0.15.1 — Sharper Vision, Longer Flow"
date: 2026-07-17
category: "Product"
readingTime: 3
summary: "0.15.1 sharpens the OpenDesign Agent: finer image detail, smoother long-session recovery, in-chat clarifying questions, and more model runtimes — plus HTML, deck-export, and desktop fixes."
socialImage: "/blog/open-design-0-15-1-cover.jpg"
ctaKind: download-app
ctaTitle: "Update to Open Design 0.15.1"
ctaBody: "Free, open-source, local-first. macOS and Windows builds are live."
ctaLabel: "Download 0.15.1"
ctaHref: "https://releases.open-design.ai/?utm_source=blog&utm_medium=docs&utm_campaign=202607_0_15_1&utm_content=official"
---

Open Design 0.15.1 is a runtime-focused release. We upgraded the built-in **OpenDesign Agent** so multimodal models see more of an image's detail, long working sessions hold together and recover better, and the everyday flow — clarifying questions, model choice, exports — stays out of your way. It keeps the [vibe-design](/blog/what-is-vibe-design/) loop — prompt, see, refine — moving without friction.

[Download 0.15.1](https://releases.open-design.ai/?utm_source=blog&utm_medium=docs&utm_campaign=202607_0_15_1&utm_content=official) · [Full release notes](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.15.1)

## Your agent sees images more clearly

The OpenDesign Agent now hands multimodal models more of the detail that's actually in an image. Screenshot analysis, visual critique, and image-led design tasks become more dependable — the model is working from what you can see, not a blurred version of it.

## Long sessions stay coherent — and recover

Extended work is less likely to lose its place. This release improves session replay, stream and context-overflow recovery, and how useful context survives compaction, so a long agent run stays on track instead of ending prematurely. When something does interrupt — a transient runtime closure, a resume EOF — the agent clears the stale session and continues through its recovery path rather than dropping the job.

## Clarifying questions stay in the conversation

Deck and prototype direction questions now use visual choices you can compare, refresh, and expand without leaving the chat. Submitted answers — including multi-select ones — collapse into a readable brief, so the back-and-forth becomes part of the record instead of a detour.

## More models, cleaner memory

Bring the right model and research into a project: 0.15.1 adds **AtomCode** as an agent runtime, a **SiliconFlow Global BYOK** preset — more on that in our [BYOK design workflow](/blog/byok-design-workflow-claude-codex-qwen/) guide — and **parallel web search** for AMR. Memory also starts cleaner and stays under your control — "Learn from chats" now defaults off, while your existing memories, work profile, manual entries, and connector imports stay put.

## A wide sweep of fixes

Under the headline work, 0.15.1 clears a long list of rough edges:

- **HTML & previews** — a successful analysis no longer looks like a failed task (`ARTIFACT_NOT_FOUND` gone for text answers), plan-mode HTML opens automatically, large previews refresh with full source, and redirect loops stop freezing the preview.
- **Decks & export** — multi-page PPT/PDF exports include every slide, images and PDFs avoid overlapping text, editable PPTX keeps CJK typefaces, and thumbnails stop disappearing.
- **BYOK & models** — permission prompts no longer block supported BYOK runs, provider "Not Found" responses stop cleanly, and `od media generate` accepts prompt files as documented.
- **Desktop reliability** — the bundled database binary matches the packaged runtime, relaunch can stop an older incompatible process, and concurrent library imports dedupe instead of erroring.

## Update today

0.15.1 is free, open-source, and local-first.

[Download 0.15.1](https://releases.open-design.ai/?utm_source=blog&utm_medium=docs&utm_campaign=202607_0_15_1&utm_content=official)
