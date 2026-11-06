---
title: OpenDesign 0.17.0
description: Bring OpenDesign into Codex as an editable design workspace, then refine the result directly in Studio.
---

### 🌟 Codename: *OpenDesign Plugin for Codex*

🚀 **62 PRs · 23 contributors · 11 days** — **Codex now has its own design workspace.** Call `@open-design` from a Codex conversation to turn ideas and briefs into real, editable design artifacts—then keep creating and refining them in OpenDesign Studio without leaving the Codex workflow. 🚀

## 🔥 Highlights

- 🚀 **OpenDesign for Codex—from `@open-design` to a real artifact.** Codex Desktop and CLI can now call OpenDesign as a complete creative engine. Confirm a visual brief, choose OpenDesign Cloud or a supported local runtime, and receive a real Preview or Studio result. The signed OpenDesign runtime starts headlessly when needed, so there is no second app to keep open and no stack to wire together by hand. If Studio cannot load cleanly in an external host, Codex still delivers the stable preview immediately. (#6055, #6273, #6362)

- ✋ **Finish with your hands, not another prompt.** Small visual corrections used to send you back into the chat loop. Now select an element directly, move or resize it, edit text, change color and alignment, duplicate or delete it, and replace, crop, paste, or drop images. Undo and redo preserve the canvas instead of flashing through a reload. (#5890, #6098) Thanks @pftom.

- ⚡ **Clear briefs start immediately.** OpenDesign no longer turns every first prompt into an interview. When the request already contains enough direction, the agent gets to work; when a decision would materially change the result, it asks one focused question at the moment it matters. (#6223)

- 🧰 **A stuck update is no longer a dead end.** Clear a broken update cache yourself from Settings, reinstall when an installed generation is known to be unsafe, and recover automatically when a downloaded payload crashes. The app rolls back to the last working version and heals on the next healthy update. (#6032, #6101) Thanks @PerishCode.

- 🎯 **Bad model choices fail before they waste a run.** Known-incompatible Codex model and CLI combinations are caught before launch, unsupported models produce a useful “switch model” path, and post-tool timeouts are diagnosed more accurately instead of triggering misleading retries. (#6036, #6103) Thanks @Siri-Ray.

- 🧩 **Fifty ways to give Codex real design taste.** The public Codex Design collection now brings together 50 curated, installable skills across interface design, visual systems, Figma-to-code, motion, image generation, and frontend craft—with provenance, practical guidance, and localized detail pages. (#5978) Thanks @joeylee12629-star.

- 🎞️ **Codex Slides joins the OpenDesign family.** Explore the complete prompt-to-deck workflow, scenario and style selection, outline shaping, editing, and export through the new Codex Slides product experience. (#6050) Thanks @joeylee12629-star.

## ✨ Added

### 🎨 Studio, editing & canvas

- **Edit the canvas at the speed of thought.** Lightweight selection controls, an inline text toolbar, live alignment guides, direct image manipulation, and reliable history turn Manual Edit into a complete finishing workflow. (#5890) Thanks @pftom.

- **Exports now follow the preview you composed.** Image exports respect the active preview viewport, and framework decks are captured at their authored size instead of being reshaped by the desktop frame. (#5828, #5853) Thanks @mturac.

### 🧠 Agents, models & integrations

- **GPT-5.5 Fast is ready when speed matters.** The new service tier is available as an explicit model choice. (#4287) Thanks @jaehanbyun.

- **Raven joins one-click MCP setup.** OpenDesign can generate the correct Raven configuration without making users translate another client's format. (#5969) Thanks @roian6.

- **Grok Build is easier to find on Windows.** OpenDesign now discovers the official user installation automatically. (#5843) Thanks @thebtf.

### 🧩 Plugins & creative workflows

- **Humanize PPT turns rough material into a presentation people want to watch.** The new workflow brings structured briefs, visual routing, presenter intent, material QA, and export verification into one plugin. (#5655) Thanks @LearnPrompt.

- **Atelier Zero brings a production-ready image prompt library.** Start from a curated prompt system instead of rebuilding art direction from scratch for every generation. (#5873) Thanks @Nissimmiracles.

## 🔁 Changed

- **BYOK stays local and usable.** Provider configuration remains in this device's OpenDesign browser storage and is passed only to the active local run. Startup no longer attempts to migrate credentials into an OS profile, while OpenDesign Cloud and Local Codex keep their existing behavior. (#6356)

- **Chat shows the work without reading like a terminal.** Execution disclosures are quieter, empty tool rows stay hidden, and real ACP tool activity is represented more faithfully. (#5667, #4621, #6057) Thanks @mrcfps, @thatditsyboy.

- **Workspace tabs say what they contain.** Long labels remain visible and Design System naming is consistent across the workspace. (#5129) Thanks @BigBandaid2.

## 🐛 Fixed

### 🎨 Studio & interface

- **Runtime-rendered elements stay selected after their last style is cleared.** Resetting alignment or another final override no longer drops the selection or reloads the canvas. (#6098) Thanks @pftom.

- **Opening the same project repeatedly no longer multiplies workspace tabs.** (#5993) Thanks @pcherkashin.

- **Dark-first brands stay dark-first.** Derived themes preserve the intended canvas instead of silently turning a dark visual direction into a light one. (#5502) Thanks @wiggdevin.

- **Continuing an interrupted task clears its stale progress card.** A finished follow-up no longer leaves an obsolete Todo snapshot pinned above Chat. (#6307) Thanks @Siri-Ray.

### 🧠 Agents & reliability

- **AMR sign-in recovers from late failures.** If direct authentication exits before activation, OpenDesign makes one bounded fallback attempt instead of leaving users on a spinner. Slow, completed, and canceled sign-ins never start a duplicate login. (#5986) Thanks @Siri-Ray.

- **The packaged app recovers when its web surface exits.** OpenDesign restarts the failed sidecar under a bounded policy and reconnects `od://` requests without requiring a full app relaunch. (#6364) Thanks @lefarcen.

- **Plugin-started Local Codex runs stay local.** They no longer re-enter the plugin recursively or switch into a Cloud login flow after the user explicitly chose Local Codex. (#6273)

- **ACP agents leave a complete trail.** Real tool names, inputs, results, timing, and usage survive into Chat and diagnostics instead of collapsing into synthetic write events. (#6057) Thanks @mrcfps.

- **Packaged runtimes start more reliably across platforms.** Linux payloads warm up before first use, and packaged wrappers consistently use the bundled runtime they shipped with. (#5836, #5786) Thanks @arseniy-gl, @mturac.

## 🙏 Thanks to everyone who shipped 0.17.0

@AmyShang-alt · @AriaZhao-coder · @arseniy-gl · @BigBandaid2 · @EthanGuo-coder · @jaehanbyun · @joeylee12629-star · @LearnPrompt · @lefarcen · @mrcfps · @mturac · @Nissimmiracles · @nettee · @pcherkashin · @PerishCode · @pftom · @roian6 · @shangxinyu1 · @Siri-Ray · @thatditsyboy · @thebtf · @wiggdevin · @xxiaoxiong
